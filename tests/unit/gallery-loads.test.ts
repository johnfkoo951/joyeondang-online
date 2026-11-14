// 갤러리 그림을 언제 다시 받는지(src/walk/gallery-loads.ts) 검사. 서명 주소는 목록을 받을 때마다 모두 바뀐다:
// 그림이 늘 깨져 있어도(받지 못하는 망, 디코딩 안 되는 파일) 목록 다시 받기와 그림 받기가 끝없이 돌지 않는지,
// 목록을 다시 받아도 같은 그림(열쇠)을 다시 받지 않는지를 크게 보기·3D·목록 받기 셋이 함께 도는 꼴로 흉내 낸다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../../src/walk/gallery-loads.ts');
const { ART_RETRY } = L;

test('목록 다시 받기 문지기: 가장 짧은 간격 안이면 받지 않고, 화면을 연 동안 횟수 상한까지만', () => {
  const g = L.refreshGate(1000, 3);
  assert.equal(g.take(0), true);
  assert.equal(g.take(500), false, '간격 안');
  assert.equal(g.take(1000), true);
  assert.equal(g.take(2000), true);
  assert.equal(g.take(10_000), false, '상한');
  assert.equal(g.count, 3);
  // 기본값: 45초 간격, 5번
  const d = L.refreshGate();
  let n = 0;
  for (let t = 0; t < 3_600_000; t += 1000) if (d.take(t)) n++;
  assert.equal(n, ART_RETRY.refreshMax);
});

test('방에 다녀와 다시 켤 때: 같은 차례의 목록을 30분 안에 받았으면 다시 받지 않는다', () => {
  assert.equal(L.listFresh(null, 0, 0), false);
  assert.equal(L.listFresh({ at: 0, round: 0 }, 0, ART_RETRY.freshMs - 1), true);
  assert.equal(L.listFresh({ at: 0, round: 0 }, 0, ART_RETRY.freshMs), false);
  assert.equal(L.listFresh({ at: 0, round: 0 }, 1, 10), false, '다시 받기를 청한 뒤(차례가 바뀜)는 받는다');
});

/** 목록을 받을 때마다 같은 그림에 새 서명 주소를 붙이는 서버 */
function server() {
  let calls = 0;
  return {
    get calls() { return calls; },
    list: () => {
      calls++;
      return { key: 'k1', url: `https://store.example/a.jpg?token=${calls}` };
    },
  };
}

test('크게 보기: 그림이 늘 깨져 있으면 두 번(처음 주소, 다시 받은 주소)만 받아 보고 알림을 남긴 채 멈춘다(다시 받기는 한 번)', () => {
  const srv = server();
  const gate = L.refreshGate();
  let item = srv.list();
  let now = 0;
  let v = L.artStart(item.url);
  const loads = [v.src];
  // 그림은 늘 실패한다. 실패하면 화면이 목록을 다시 받아 달라고 하고(문지기), 새 주소가 오면 Art가 맞춘다
  for (let step = 0; step < 50; step++) {
    now += 1500;
    if (v.state !== 'loading') break;
    const r = L.artFailed(v, item.url);
    v = r.view;
    if (r.ask && gate.take(now)) item = srv.list();
    const next = L.artNewUrl(v, item.url);
    if (next !== v) { v = next; loads.push(v.src); }
  }
  assert.equal(v.state, 'error');
  assert.equal(loads.length, ART_RETRY.tries, `받아 본 주소 ${loads.join(', ')}`);
  assert.equal(srv.calls, 2, '처음 목록 + 다시 받기 한 번');
  // 예전에는 실패 → 다시 받기 → 새 주소로 다시 그리기(열쇠가 주소였다) → 또 실패가 끝없이 돌았다
});

test('크게 보기: 같은 화면을 여러 번 다시 열어도 목록 다시 받기는 간격·상한 안에서만', () => {
  const srv = server();
  const gate = L.refreshGate();
  let item = srv.list();
  // 2초마다 크게 보기를 다시 연다(그림은 늘 실패), 한 시간 동안
  for (let now = 0; now < 3_600_000; now += 2000) {
    let v = L.artStart(item.url);
    for (let k = 0; k < 4 && v.state === 'loading'; k++) {
      const r = L.artFailed(v, item.url);
      v = r.view;
      if (r.ask && gate.take(now)) item = srv.list();
      v = L.artNewUrl(v, item.url);
    }
    assert.equal(v.state, 'error');
  }
  assert.ok(srv.calls <= 1 + ART_RETRY.refreshMax, `목록 받기 ${srv.calls}번`);
});

test('크게 보기: 보이는 그림은 목록을 다시 받아도 새 주소로 또 받지 않는다. 받는 사이 새 주소가 왔으면 실패 때 그것으로 한 번 더', () => {
  let v = L.artLoaded(L.artStart('https://store.example/a.jpg?token=1'));
  assert.equal(L.artNewUrl(v, 'https://store.example/a.jpg?token=2'), v, '보이는 그림 그대로');
  v = L.artStart('https://store.example/a.jpg?token=1');
  assert.equal(L.artNewUrl(v, 'https://store.example/a.jpg?token=2'), v, '받는 중이면 그대로');
  const r = L.artFailed(v, 'https://store.example/a.jpg?token=2');
  assert.deepEqual(r, { view: { src: 'https://store.example/a.jpg?token=2', state: 'loading', tries: 2 }, ask: false });
  const again = L.artFailed(r.view, 'https://store.example/a.jpg?token=2');
  assert.deepEqual(again, { view: { ...r.view, state: 'error' }, ask: false });
  // 받으면 그대로 보인다
  assert.equal(L.artLoaded(r.view).state, 'ready');
});

test('3D: 목록을 다시 받아 주소가 모두 바뀌어도 같은 그림(열쇠)은 그대로 둔다. 그림이 바뀌거나 빠지면 내린다', () => {
  assert.equal(L.keepArt({ key: 'k1' }, { key: 'k1' }), true);
  assert.equal(L.keepArt({ key: 'k1' }, { key: 'k2' }), false);
  assert.equal(L.keepArt({ key: 'k1' }, null), false);
  const f = { key: 'k1', url: 'u1', at: 0, n: 1 };
  assert.equal(L.failAfter(f, { key: 'k1' }), f, '같은 그림이면 실패 횟수를 이어 센다');
  assert.equal(L.failAfter(f, { key: 'k2' }), null, '새 그림은 처음부터');
  assert.equal(L.failAfter(f, null), null);
});

test('3D: 늘 깨진 그림은 두 번 받아 보고 그만둔다. 목록 다시 받자는 신호는 첫 실패에 한 번, 다른 그림과 합쳐 1분에 한 번', () => {
  const srv = server();
  let item = srv.list();
  let fail: ReturnType<typeof L.noteFail>['fail'] | undefined;
  let staleAt = -Infinity;
  let loads = 0, stales = 0;
  // 0.25초마다 액자 곁에 서 있는 30분
  for (let now = 0; now < 1_800_000; now += 250) {
    if (!L.mayLoad(fail, item.key, item.url, now)) continue;
    loads++;
    const r = L.noteFail(fail, item.key, item.url, now, staleAt);
    fail = r.fail;
    if (r.stale) { staleAt = now; stales++; item = srv.list(); }
  }
  assert.equal(loads, ART_RETRY.tries);
  assert.equal(stales, 1);
  assert.equal(srv.calls, 2);
  // 같은 주소로 실패했으면 1분 뒤에 한 번 더(주소가 바뀌면 바로)
  const once = L.noteFail(undefined, 'k', 'u', 0, -Infinity).fail;
  assert.equal(L.mayLoad(once, 'k', 'u', ART_RETRY.sameUrlMs - 1), false);
  assert.equal(L.mayLoad(once, 'k', 'u', ART_RETRY.sameUrlMs), true);
  assert.equal(L.mayLoad(once, 'k', 'u2', 1), true);
  // 다른 그림이 막 신호를 보냈으면 이 그림은 보내지 않는다(1분에 한 번)
  assert.equal(L.noteFail(undefined, 'k', 'u', 30_000, 0).stale, false);
  assert.equal(L.noteFail(undefined, 'k', 'u', 60_000, 0).stale, true);
  // 그림이 바뀌면(열쇠) 다시 센다
  const twice = L.noteFail(once, 'k', 'u', 1, -Infinity).fail;
  assert.equal(twice.n, 2);
  assert.equal(L.mayLoad(twice, 'k', 'u3', 100_000), false);
  assert.equal(L.mayLoad(twice, 'k-new', 'u3', 2), true);
});
