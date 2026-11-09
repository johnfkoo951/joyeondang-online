// 캐릭터 겉모습: 계약(src/walk/look.ts)이 바깥 값을 고쳐 받는지, 엔진이 모든 조합을 같은 비율로 그리는지,
// 사진 캐릭터 판(불러오기 성공·실패), 출입증에 실린 겉모습, 게임 서버가 같은 검사 함수를 쓰는지. node --test 로 바로 돈다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// 'server-only'는 빈 모듈로, 게임 서버의 확장자 없는 상대 경로(../../src/walk/look)는 .ts로 찾게 한다
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
  if (s.startsWith('.') && !/\\.[a-z]+$/.test(s) && c.parentURL && c.parentURL.includes('/game-server/')) return next(s + '.ts', c);
  return next(s, c);
}`),
);
const L = await import('../../src/walk/look.ts');
const A = await import('../../src/walk/avatar.ts');
const site = await import('../../src/lib/game-token.ts');
const token = await import('../../game-server/src/token.ts');
const protocol = await import('../../game-server/src/protocol.ts');

const DOLL = { hair: 'bob', hairColor: '#a8743f', skin: '#c99470', top: '#6b8fb5', bottom: '#ece4d6', acc: 'glasses' } as const;

test('cleanDoll: 목록에 있는 값만, 대문자 색은 소문자로, 나머지는 기본(또는 넘긴 바탕)', () => {
  assert.deepEqual(L.cleanDoll(DOLL), DOLL);
  assert.deepEqual(L.cleanDoll({ ...DOLL, hairColor: '#A8743F' }).hairColor, '#a8743f');
  for (const junk of [null, undefined, 3, 'doll', [], [DOLL], { hair: 'mohawk', skin: '#000000', top: 'red', acc: 'crown' }]) {
    const d = L.cleanDoll(junk);
    assert.ok((L.HAIR_STYLES as readonly string[]).includes(d.hair));
    assert.ok((L.SKIN_TONES as readonly string[]).includes(d.skin));
    assert.ok((L.CLOTH_COLORS as readonly string[]).includes(d.top));
    assert.ok((L.ACCESSORIES as readonly string[]).includes(d.acc));
  }
  assert.deepEqual(L.cleanDoll({ hair: 'x' }, { ...L.DEFAULT_DOLL, hair: 'bun' }).hair, 'bun');
  // 원형 오염 시도도 그냥 기본값
  const evil = JSON.parse('{"__proto__": {"hair": "long"}, "constructor": {"x": 1}}');
  assert.deepEqual(L.cleanDoll(evil), L.DEFAULT_DOLL);
  assert.equal(({} as Record<string, unknown>).hair, undefined);
});

test('cleanLook: 사진은 우리 /api/avatar/<id> 주소만, 그 밖은 기본 인형', () => {
  const ok = { kind: 'photo', url: '/api/avatar/0f8e2c1a-1234-4abc-9def-0123456789ab' };
  assert.deepEqual(L.cleanLook(ok), ok);
  for (const url of [
    'https://evil.example/a.png', '/api/avatar/../secret', '/api/avatar/ABCDEF12', '/api/avatar/1234567', '/api/avatar/12345678?x=1',
    '//evil.example/api/avatar/12345678', 'javascript:alert(1)', '/api/avatar/12345678/../../x', 42,
  ]) {
    const l = L.cleanLook({ kind: 'photo', url });
    assert.equal(l.kind, 'doll', String(url));
  }
  assert.deepEqual(L.cleanLook({ kind: 'doll', doll: DOLL }), { kind: 'doll', doll: DOLL });
  assert.equal(L.cleanLook(null).kind, 'doll');
  assert.equal(L.cleanLook({ kind: 'photo' }).kind, 'doll');
  assert.ok(JSON.stringify(L.cleanLook({ kind: 'doll', doll: { ...DOLL, extra: 'x'.repeat(5000) } })).length < 200, '모르는 필드는 버린다');
});

test('dollFromColor: 옷 색 목록에 있는 색만 윗옷으로, 아니면 기본', () => {
  assert.equal(L.dollFromColor('#B4593B').top, '#b4593b');
  assert.equal(L.dollFromColor('#e8b4c2').top, L.DEFAULT_DOLL.top);
  assert.equal(L.dollFromColor(null).top, L.DEFAULT_DOLL.top);
});

test('엔진의 기본 인형 바탕(BASE_DOLL)이 계약의 DEFAULT_DOLL과 같다', () => {
  assert.deepEqual(A.BASE_DOLL, L.DEFAULT_DOLL);
});

const box = (g: THREE.Object3D, name?: string) => {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3();
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && (!name || m.name === name)) b.expandByObject(m); });
  return b;
};

test('기본 인형: 모든 머리 모양 × 소품이 같은 비율(키·머리 크기), 얼굴 앞은 가리지 않고, 다 놓으면 남는 것이 없다', () => {
  assert.deepEqual(A.avatarStats(), { kitRefs: 0, geometries: 0, materials: 0, labels: 0 });
  const made: Array<ReturnType<typeof A.createAvatar>> = [];
  for (const hair of L.HAIR_STYLES) {
    for (const acc of L.ACCESSORIES) {
      const a = A.createAvatar({ look: { kind: 'doll', doll: { ...DOLL, hair, acc } } });
      made.push(a);
      const all = box(a.group);
      assert.ok(all.min.y > -0.01 && all.min.y < 0.02, `${hair}/${acc} 발 ${all.min.y}`);
      assert.ok(all.max.y > 1.08 && all.max.y < 1.32, `${hair}/${acc} 키 ${all.max.y}`);
      assert.ok(all.max.x - all.min.x < 0.95, `${hair}/${acc} 폭 ${all.max.x - all.min.x}`);
      // 얼굴 가운데(눈 사이 앞)로 쏜 광선이 처음 맞는 것은 머리 덩어리, 그 점은 얼굴 구 앞면 근처(머리카락이 덮지 않음)
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.85, 2), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(a.group, true)[0];
      assert.ok(hit && hit.object.name === 'head' && hit.point.z > 0.2 && hit.point.z < 0.3, `${hair}/${acc} 얼굴 ${hit?.point.z}`);
      let meshes = 0;
      a.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      assert.ok(meshes <= 10, `${hair}/${acc} 메시 ${meshes}`);
    }
  }
  // 같은 겉모습은 머리 기하를 함께 쓴다
  const twin = A.createAvatar({ look: { kind: 'doll', doll: { ...DOLL, hair: 'curly', acc: 'bow' } } });
  const head = (x: ReturnType<typeof A.createAvatar>) => (x.group.getObjectByName('head') as THREE.Mesh).geometry;
  assert.equal(head(twin), head(made.find((m) => A.lookKey({ kind: 'doll', doll: { ...DOLL, hair: 'curly', acc: 'bow' } }) && m === made[3 * 6 + 3])!));
  twin.dispose();
  for (const a of made) a.dispose();
  assert.deepEqual(A.avatarStats(), { kitRefs: 0, geometries: 0, materials: 0, labels: 0 });
});

test('lookKey: 같은 겉모습은 같은 열쇠, 하나라도 다르면 다른 열쇠, 겉모습이 없으면 색으로', () => {
  const a = A.lookKey({ kind: 'doll', doll: DOLL });
  assert.equal(a, A.lookKey({ kind: 'doll', doll: { ...DOLL } }));
  assert.notEqual(a, A.lookKey({ kind: 'doll', doll: { ...DOLL, acc: 'scarf' } }));
  assert.equal(A.lookKey(undefined, '#123456'), 'c:#123456');
  assert.equal(A.lookKey({ kind: 'photo', url: '/api/avatar/12345678' }), 'p:/api/avatar/12345678');
});

test('출입증: 사이트가 서명한 겉모습이 게임 서버 확인을 그대로 지나고, 너무 크거나 모양이 틀린 겉모습은 거절', async () => {
  const secret = 'test-secret-0123456789abcdef'; // gitleaks:allow (시험 전용 가짜 서명 키)
  const exp = Math.floor(Date.now() / 1000) + 60;
  const base = { sub: 's1', name: '손님', color: '#3e6b4f', role: 'family' as const, exp };
  const look = { kind: 'doll' as const, doll: DOLL };
  const t = site.signGameToken({ ...base, look }, secret);
  assert.deepEqual(site.verifyGameToken(t, secret)?.look, look);
  const r = await token.verifyToken(t, secret);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(protocol.cleanLook(r.payload.look), look);
  // 겉모습이 없어도 그대로 통과(예전 출입증)
  const plain = await token.verifyToken(site.signGameToken(base, secret), secret);
  assert.ok(plain.ok && plain.payload.look === undefined);
  // 400자 넘는 겉모습·배열·문자열은 서명이 맞아도 거절
  for (const bad of [{ kind: 'doll', doll: { ...DOLL, x: 'y'.repeat(500) } }, [look], 'doll']) {
    const b = await token.verifyToken(site.signGameToken({ ...base, look: bad as never }, secret), secret);
    assert.equal(b.ok, false, JSON.stringify(bad).slice(0, 40));
  }
  // 서명은 맞지만 모르는 머리·밖 주소 사진이면 공간이 기본 인형으로 고친다
  const odd = await token.verifyToken(site.signGameToken({ ...base, look: { kind: 'photo', url: 'https://evil.example/x.png' } as never }, secret), secret);
  assert.ok(odd.ok);
  if (odd.ok) assert.deepEqual(protocol.cleanLook(odd.payload.look), { kind: 'doll', doll: L.DEFAULT_DOLL });
  assert.equal(protocol.cleanLook, L.cleanLook, '게임 서버와 화면이 같은 함수를 쓴다');
});
