// 사진 캐릭터를 그리는 중인 일(src/components/walk/making.ts): 걸린 시간·진행 막대·단계 글, 서버 답 옮기기,
// 묻는 간격, 그리고 묻기 한 바퀴(보낸 뒤 → 그리는 중 → 다 됨, 다 된 순간 한 번만 알림, 새로 고쳐도 이어 읽기).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

type Fn = (...a: unknown[]) => void;
const g = globalThis as Record<string, unknown>;
const store = new Map<string, string>();
const docListeners = new Map<string, Fn>();
g.window = { addEventListener: () => {}, removeEventListener: () => {} };
g.document = {
  visibilityState: 'visible',
  addEventListener: (k: string, fn: Fn) => void docListeners.set(k, fn),
  removeEventListener: (k: string) => void docListeners.delete(k),
};
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const M = await import('../../src/components/walk/making.ts');
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const flush = async () => {
  for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r));
};

test('걸린 시간은 분:초, 한 시간이 넘으면 시:분:초', () => {
  assert.equal(M.formatElapsed(0), '0:00');
  assert.equal(M.formatElapsed(42_400), '0:42');
  assert.equal(M.formatElapsed(65_000), '1:05');
  assert.equal(M.formatElapsed(3_723_000), '1:02:03');
  assert.equal(M.formatElapsed(-5), '0:00');
});

test('진행 막대: 기다리는 동안은 낮게, 그리는 동안 오르되 다 되기 전에는 95를 넘지 않는다', () => {
  const t0 = 1_000_000;
  assert.equal(M.makingPercent({ phase: 'queued', at: t0, drawingAt: null }, t0), 6);
  assert.ok(M.makingPercent({ phase: 'queued', at: t0, drawingAt: null }, t0 + 600_000) <= 18);
  const d0 = M.makingPercent({ phase: 'drawing', at: t0, drawingAt: t0 }, t0);
  const d1 = M.makingPercent({ phase: 'drawing', at: t0, drawingAt: t0 }, t0 + 60_000);
  assert.ok(d0 >= 20 && d1 > d0);
  assert.equal(M.makingPercent({ phase: 'drawing', at: t0, drawingAt: t0 }, t0 + 3_600_000), 95);
  assert.equal(M.makingPercent({ phase: 'ready', at: t0, drawingAt: t0 }, t0), 100);
});

test('단계 글: 앞에 선 수, 그리는 동안의 단계, 일꾼이 쉬면 그 안내, 못 그렸으면 까닭', () => {
  const base = { at: 0, drawingAt: null, ahead: null, message: null };
  const REST = '쉬는 중';
  assert.equal(M.makingStage({ ...base, phase: 'queued', ahead: 3 }, 0, REST), '차례를 기다리는 중이에요 · 앞에 3명');
  assert.equal(M.makingStage({ ...base, phase: 'queued', ahead: 0 }, 0, REST), '곧 그리기 시작해요');
  assert.equal(M.makingStage({ ...base, phase: 'drawing', drawingAt: 0 }, 1_000, REST), '사진을 살펴보는 중이에요');
  assert.equal(M.makingStage({ ...base, phase: 'drawing', drawingAt: 0 }, 30_000, REST), '캐릭터를 그리는 중이에요');
  assert.equal(M.makingStage({ ...base, phase: 'drawing', message: REST }, 0, REST), REST);
  assert.equal(M.makingStage({ ...base, phase: 'failed', message: '사진에서 사람을 찾지 못했어요.' }, 0, REST), '사진에서 사람을 찾지 못했어요.');
});

test('묻는 간격: 처음 2분은 4초, 10분까지 8초, 그 뒤 20초', () => {
  assert.equal(M.pollDelay(0), 4_000);
  assert.equal(M.pollDelay(119_000), 4_000);
  assert.equal(M.pollDelay(300_000), 8_000);
  assert.equal(M.pollDelay(3_600_000), 20_000);
});

test('묻는 간격: 앞에 선 사람이 많으면 한 명에 3초씩 더(30초까지), 차례가 가까우면 그대로', () => {
  assert.equal(M.pollDelay(0, 2), 4_000);
  assert.equal(M.pollDelay(0, 5), 15_000);
  assert.equal(M.pollDelay(0, 40), 30_000);
  assert.equal(M.pollDelay(3_600_000, 3), 20_000, '오래 기다린 뒤의 간격보다 짧아지지 않는다');
  assert.equal(M.pollDelay(0, null), 4_000);
});

test('서버 답 옮기기: 보낸 때는 서버 값으로, 그리기 시작은 처음 본 때, 거절은 못 그림으로', () => {
  const m = { id: ID, at: 5_000, phase: 'queued' as const, drawingAt: null, ahead: null, message: null, slot: 1, doneAt: null, seen: false };
  const q = M.nextMaking(m, { status: 'queued', ahead: 2, since: new Date(1_000).toISOString() }, 9_000);
  assert.deepEqual([q.at, q.ahead, q.phase], [1_000, 2, 'queued']);
  const d = M.nextMaking(q, { status: 'drawing' }, 10_000);
  assert.deepEqual([d.phase, d.drawingAt, d.ahead], ['drawing', 10_000, null]);
  assert.equal(M.nextMaking(d, { status: 'drawing' }, 20_000).drawingAt, 10_000, '처음 본 때를 그대로 둔다');
  const r = M.nextMaking(d, { status: 'ready', url: `/api/avatar/${ID}` }, 30_000);
  assert.deepEqual([r.phase, r.doneAt, r.seen], ['ready', 30_000, false]);
  const f = M.nextMaking(d, { status: 'rejected', message: '아이로 보일 수 있는 사진이에요.' }, 30_000);
  assert.deepEqual([f.phase, f.message], ['failed', '아이로 보일 수 있는 사진이에요.']);
  assert.equal(M.nextMaking(d, { status: 'weird' }), d, '모르는 답은 그대로');
  assert.equal(M.nextMaking(d, { status: 'queued', since: '2999-01-01T00:00:00Z' }, 40_000).at, 40_000, '앞날의 때는 지금으로');
});

test('묻기 한 바퀴: 보는 쪽이 있을 때만 묻고, 다 된 순간 한 번 알리고, 끝나면 묻지 않는다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const answers = [{ status: 'queued', ahead: 1 }, { status: 'drawing' }, { status: 'ready', url: `/api/avatar/${ID}` }];
    const asked: string[] = [];
    g.fetch = async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(answers.shift() ?? { status: 'ready' }), { status: 200 });
    };
    M.startMaking(ID, 2);
    // 보는 쪽이 없으면 묻지 않는다
    mock.timers.tick(10_000);
    await flush();
    assert.equal(asked.length, 0);
    const ready: string[] = [];
    const offReady = M.onMakingReady((id) => ready.push(id));
    let changes = 0;
    const off = M.subscribeMaking(() => { changes += 1; });
    for (let k = 0; k < 3; k++) {
      mock.timers.tick(4_000);
      await flush();
    }
    assert.equal(asked.length, 3);
    assert.match(asked[0], new RegExp(`/api/avatar/status\\?id=${ID}$`));
    assert.equal(M.getMaking()?.phase, 'ready');
    assert.deepEqual(ready, [ID], '다 된 순간 한 번');
    assert.ok(changes >= 3);
    // 끝났으면 더 묻지 않는다
    mock.timers.tick(60_000);
    await flush();
    assert.equal(asked.length, 3);
    // 새로 고쳐도(저장한 값을 다시 읽어도) 이어 본다
    const saved = JSON.parse(store.get('jy.walk.look.pending.v1') ?? '{}') as { id: string; phase: string; slot: number };
    assert.deepEqual([saved.id, saved.phase, saved.slot], [ID, 'ready', 2]);
    M.seeMaking();
    assert.equal(M.getMaking()?.seen, true);
    M.clearMaking('00000000-0000-4000-8000-000000000000');
    assert.equal(M.getMaking()?.id, ID, '다른 id로는 지우지 않는다');
    M.clearMaking(ID);
    assert.equal(M.getMaking(), null);
    assert.equal(store.has('jy.walk.look.pending.v1'), false);
    off();
    offReady();
  } finally {
    mock.timers.reset();
  }
});

test('지웠으면(404가 연달아 세 번) 조용히 내려놓고, 다른 기기에서 보낸 일은 보낸 때부터 센다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let asked = 0;
    g.fetch = async () => { asked++; return new Response('{"status":"not_found"}', { status: 404 }); };
    M.adoptMaking(ID, '2026-11-01T09:00:00.000Z', 3);
    assert.equal(M.getMaking()?.at, Date.parse('2026-11-01T09:00:00.000Z'));
    // 그리는 중인 일이 있으면 다른 것을 이어 보지 않는다
    M.adoptMaking('11111111-1111-4111-8111-111111111111', null, 1);
    assert.equal(M.getMaking()?.id, ID);
    const off = M.subscribeMaking(() => {});
    mock.timers.tick(20_000);
    await flush();
    assert.equal(asked, 1);
    assert.equal(M.getMaking()?.id, ID, '404 한 번으로는 버리지 않는다(몰릴 때 잠깐 오는 404일 수 있다)');
    for (let i = 0; i < 2; i++) {
      mock.timers.tick(4_000);
      await flush();
    }
    assert.equal(asked, 3, '4초 간격으로 다시 묻는다');
    assert.equal(M.getMaking(), null, '연달아 세 번이면 내려놓는다');
    off();
  } finally {
    mock.timers.reset();
  }
});

test('404 사이에 다른 답이 오면 다시 처음부터 센다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const answers = [404, 404, 503, 404, 404];
    g.fetch = async () => {
      const st = answers.shift() ?? 404;
      return new Response(st === 404 ? '{"status":"not_found"}' : '{"status":"error"}', { status: st });
    };
    M.adoptMaking(ID, null, 1);
    const off = M.subscribeMaking(() => {});
    for (let i = 0; i < 5; i++) {
      mock.timers.tick(30_000);
      await flush();
    }
    assert.equal(M.getMaking()?.id, ID, '404 둘, 503, 404 둘: 아직 버리지 않는다');
    mock.timers.tick(30_000);
    await flush();
    assert.equal(M.getMaking(), null);
    off();
  } finally {
    mock.timers.reset();
  }
});

test('예전 모양(id 글자만)으로 둔 값도 이어 읽는다', async () => {
  store.set('jy.walk.look.pending.v1', JSON.stringify(ID));
  const fresh = await import(`../../src/components/walk/making.ts?old=${Date.now()}`);
  const m = fresh.getMaking();
  assert.deepEqual([m?.id, m?.phase], [ID, 'queued']);
  store.clear();
});
