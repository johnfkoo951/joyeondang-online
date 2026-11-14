// 접속자 목록의 「걸어가기」·「바로 가기」 순수 규칙(src/components/walk/social/go-to-person.ts):
// 목록의 한 줄을 함께 걷기 서버의 사람과 짝짓기, 그 사람 옆 빈자리 고르기, 줄마다 두 단추의 상태.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import type { CharacterLook } from '../../src/walk/look.ts';
import type { Box, HouseWorld, Level, Ramp, RemotePlayer } from '../../src/walk/types.ts';

// 앱과 같은 꼴(확장자 없는 './physics', '@/walk/…')로 가져오는 모듈이다. 이 시험 프로세스에서만 .ts와 @/를 풀어 준다.
const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
// Node 22.15+의 동기 훅(@types/node 20에는 아직 없다)
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const G = await import('../../src/components/walk/social/go-to-person.ts');
const { DEFAULT_DOLL, cleanLook } = await import('../../src/walk/look.ts');
const { RADIUS, blocked, clearLine, inRamp } = await import('../../src/walk/physics.ts');
const { findPath } = await import('../../src/walk/nav.ts');
const { buildWorld } = await import('../../src/content/world.ts');
const { arriveYaw } = await import('../../src/components/walk/controls.ts');
const { GO_WHY } = await import('../../src/components/walk/hud-text.ts');

const SUB = (c: string) => c.repeat(22);
// 윗옷 색은 고를 수 있는 색 가운데서(그 밖의 색은 cleanLook이 기본색으로 바꾼다)
const doll = (top: string): CharacterLook => cleanLook({ kind: 'doll', doll: { ...DEFAULT_DOLL, top } });
const RED = doll('#b4593b');
const BLUE = doll('#2f4a6b');
const row = (c: string, name: string, space: string | null, look: CharacterLook | null = null) => ({ sub: SUB(c), name, space, look });
const seen = (id: string, name: string, look?: CharacterLook) => ({ id, name, look });
const HOUSE = 'house:real';

test('이름 열쇠는 서버가 이름표를 고치는 방식과 같다', () => {
  assert.equal(G.nameKey('  하늘  '), '하늘');
  assert.equal(G.nameKey('하\u200b늘'), '하 늘');
  assert.equal(G.nameKey('구름\n바다'), '구름 바다');
  assert.equal(G.nameKey('가'.repeat(20)), '가'.repeat(16));
  // 조합형으로 온 한글도 같은 이름이다
  assert.equal(G.nameKey('하늘'.normalize('NFD')), '하늘');
});

test('겉모습 열쇠는 칭호를 보지 않고, 모르면 빈 글이다', () => {
  assert.equal(G.lookKey(null), '');
  assert.equal(G.lookKey(undefined), '');
  assert.notEqual(G.lookKey(RED), G.lookKey(BLUE));
  assert.equal(G.lookKey(cleanLook({ ...RED, title: '칭호' })), G.lookKey(RED));
});

test('같은 공간에서 이름이 하나씩이면 그 사람이다', () => {
  const r = G.reachOf([row('a', '하늘', HOUSE), row('b', '바다', HOUSE)], HOUSE, [seen('p1', '바다'), seen('p2', '하늘')]);
  assert.deepEqual(r.get(SUB('a')), { kind: 'here', id: 'p2' });
  assert.deepEqual(r.get(SUB('b')), { kind: 'here', id: 'p1' });
});

test('이름이 하나씩이어도 겉모습이 다르면 짝짓지 않는다', () => {
  // 목록은 몇 초 늦게 따라온다: 빨간 옷 줄은 아직 집이라는데, 함께 걷기에는 막 들어온 파란 옷의 같은 이름뿐이다
  const r = G.reachOf([row('a', '손님', HOUSE, RED)], HOUSE, [seen('pB', '손님', BLUE)]);
  assert.deepEqual(r.get(SUB('a')), { kind: 'unseen' });
  // 들어온 사람의 줄이 아직 옛 방이라고 해도 마찬가지다(두 줄 다 그 사람에게 가지 않는다)
  const lag = G.reachOf([row('a', '손님', HOUSE, RED), row('b', '손님', 'room:other', BLUE)], HOUSE, [seen('pB', '손님', BLUE)]);
  assert.deepEqual(lag.get(SUB('a')), { kind: 'unseen' });
  assert.deepEqual(lag.get(SUB('b')), { kind: 'away' });
  // 한쪽 겉모습을 모르면 이름만 본다
  assert.deepEqual(G.reachOf([row('a', '손님', HOUSE, null)], HOUSE, [seen('pB', '손님', BLUE)]).get(SUB('a')), { kind: 'here', id: 'pB' });
  assert.deepEqual(G.reachOf([row('a', '손님', HOUSE, RED)], HOUSE, [seen('pB', '손님')]).get(SUB('a')), { kind: 'here', id: 'pB' });
  // 칭호만 다른 것은 같은 겉모습이다
  const titled = cleanLook({ ...RED, title: '칭호' });
  assert.deepEqual(G.reachOf([row('a', '손님', HOUSE, titled)], HOUSE, [seen('pA', '손님', RED)]).get(SUB('a')), { kind: 'here', id: 'pA' });
});

test('함께 걷기 화면 목록은 자리만 바뀌면 그대로, 옷을 바꾸면 새로 본다', async () => {
  // 화면 목록이 옛 옷으로 남으면 위의 겉모습 견주기가 옷을 바꾼 사람에게 가는 단추를 막은 채 둔다
  const { rosterKeyOf } = await import('../../src/components/walk/useNet.ts');
  const p: RemotePlayer = { id: 'p1', name: '하늘', color: '#c98a5a', x: 0, z: 0, y: 0, level: 1, yaw: 0, moving: false, look: RED };
  const k = rosterKeyOf([p]);
  assert.equal(rosterKeyOf([{ ...p, x: 3, z: 4, yaw: 1, moving: true }]), k);
  assert.notEqual(rosterKeyOf([{ ...p, look: BLUE }]), k);
  assert.notEqual(rosterKeyOf([{ ...p, look: undefined }]), k);
});

test('다른 장면, 어딘지 모르는 사람, 아직 안 보이는 사람', () => {
  const people = [row('a', '하늘', 'room:other'), row('b', '바다', null), row('c', '구름', HOUSE)];
  const r = G.reachOf(people, HOUSE, [seen('p1', '하늘')]);
  assert.deepEqual(r.get(SUB('a')), { kind: 'away' });
  assert.deepEqual(r.get(SUB('b')), { kind: 'unseen' });
  assert.deepEqual(r.get(SUB('c')), { kind: 'unseen' });
  // 함께 걷기를 안 하는 화면(내 공간이 없음)에서는 아무도 볼 수 없다
  const off = G.reachOf(people, null, [seen('p1', '하늘')]);
  for (const p of people) assert.deepEqual(off.get(p.sub), { kind: 'unseen' });
});

test('이름이 겹치면 겉모습으로 가르고, 그래도 같으면 고르지 않는다', () => {
  const two = [row('a', '손님', HOUSE, RED), row('b', '손님', HOUSE, BLUE)];
  const r = G.reachOf(two, HOUSE, [seen('p1', '손님', BLUE), seen('p2', '손님', RED)]);
  assert.deepEqual(r.get(SUB('a')), { kind: 'here', id: 'p2' });
  assert.deepEqual(r.get(SUB('b')), { kind: 'here', id: 'p1' });
  const same = G.reachOf([row('a', '손님', HOUSE, RED), row('b', '손님', HOUSE, RED)], HOUSE, [seen('p1', '손님', RED), seen('p2', '손님', RED)]);
  assert.deepEqual(same.get(SUB('a')), { kind: 'twin' });
  assert.deepEqual(same.get(SUB('b')), { kind: 'twin' });
  // 목록에는 한 사람인데 서버에는 같은 이름이 둘: 겉모습이 맞는 쪽, 맞는 쪽이 없으면 고르지 않는다
  const one = G.reachOf([row('a', '손님', HOUSE, RED)], HOUSE, [seen('p1', '손님', BLUE), seen('p2', '손님', RED)]);
  assert.deepEqual(one.get(SUB('a')), { kind: 'here', id: 'p2' });
  const none = G.reachOf([row('a', '손님', HOUSE, null)], HOUSE, [seen('p1', '손님', BLUE), seen('p2', '손님', RED)]);
  assert.deepEqual(none.get(SUB('a')), { kind: 'twin' });
});

type Spot = NonNullable<ReturnType<typeof G.pickSpot>>;
const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** 거리가 범위 안이고, 그 자리에서 그 사람을 본다(엔진의 앞 = (-sin yaw, -cos yaw)) */
function facesFromRing(s: Spot, t: { x: number; z: number }) {
  const d = near(s, t);
  assert.ok(d >= G.NEAR_MIN - 1e-9 && d <= G.NEAR_MAX + 1e-9, `거리 ${d}`);
  const along = -Math.sin(s.yaw) * (t.x - s.x) - Math.cos(s.yaw) * (t.z - s.z);
  assert.ok(Math.abs(along - d) < 1e-9, '그 사람을 보지 않는다');
}
const T0 = { x: 0, z: 0, level: 1 as Level, yaw: 0 };
const all = () => true;

test('빈자리는 내 쪽부터, 가운데 거리를 먼저 고른다', () => {
  const s = G.pickSpot({ target: T0, me: { x: 5, z: 0 }, others: [], free: all });
  assert.ok(s);
  assert.ok(Math.abs(s.x - 1.5) < 1e-9 && Math.abs(s.z) < 1e-9);
  assert.equal(s.level, 1);
  facesFromRing(s, T0);
});

test('나와 같은 자리거나 내 자리를 모르면 그 사람 앞쪽에 선다', () => {
  // yaw 0의 앞은 -z 쪽이다
  for (const me of [null, { x: 0.1, z: 0 }]) {
    const s = G.pickSpot({ target: T0, me, others: [], free: all });
    assert.ok(s);
    assert.ok(Math.abs(s.x) < 1e-9 && Math.abs(s.z + 1.5) < 1e-9, `${s.x}, ${s.z}`);
  }
});

test('다른 사람과 겹치지 않고, 막힌 쪽은 다른 방향을 해 본다', () => {
  const other = { x: 1.5, z: 0, level: 1 as Level };
  const s = G.pickSpot({ target: T0, me: { x: 5, z: 0 }, others: [other], free: all });
  assert.ok(s);
  assert.ok(near(s, other) >= G.PERSON_GAP, '다른 사람 속에 선다');
  assert.ok(s.x > 0, '내 쪽 반을 두고 먼 쪽으로 갔다');
  facesFromRing(s, T0);
  // 다른 층 사람은 비켜 서지 않아도 된다
  const up = G.pickSpot({ target: T0, me: { x: 5, z: 0 }, others: [{ ...other, level: 2 }], free: all });
  assert.ok(up && Math.abs(up.x - 1.5) < 1e-9);
  // 내 쪽이 막혔으면 옆으로 돈다
  const side = G.pickSpot({ target: T0, me: { x: 5, z: 0 }, others: [], free: (x) => x <= 0.3 });
  assert.ok(side);
  assert.ok(Math.abs(side.x) < 1e-9 && Math.abs(Math.abs(side.z) - 1.5) < 1e-9, `${side.x}, ${side.z}`);
  facesFromRing(side, T0);
  assert.equal(G.pickSpot({ target: T0, me: { x: 5, z: 0 }, others: [], free: () => false }), null);
});

// 시험용 작은 세계: 두 층 다 같은 넓이의 바닥판 하나, 상자·경사면·바닥판은 넘겨받은 것
type FloorSpec = HouseWorld['floors'][number];
const FLOOR2 = 3;
const slab = (level: Level, x2 = 10): FloorSpec => ({ level, x1: -10, x2, z1: -10, z2: 10, mat: 'oak' });
function tiny(o: { boxes?: Box[]; ramps?: Ramp[]; floors?: FloorSpec[] } = {}): HouseWorld {
  return {
    kind: 'redrawn', floor2: FLOOR2, house: { x1: -10, x2: 10, z1: -10, z2: 10 },
    floors: o.floors ?? [slab(1), slab(2)], walls: [], headers: [], doors: [], ceilings: [], windows: [],
    furniture: [], props: [], zones: [], hotspots: [],
    physics: { boxes: o.boxes ?? [], ramps: o.ramps ?? [], floor2: FLOOR2 },
    spawn: { x: 0, z: 0, yaw: 0 },
  };
}
const box = (x1: number, x2: number, z1: number, z2: number, level: 0 | 1 | 2 = 1): Box => ({ x1, x2, z1, z2, level });
const who = (x: number, z: number, level: Level = 1, y = level === 2 ? FLOOR2 : 0): Pick<RemotePlayer, 'x' | 'z' | 'y' | 'level' | 'yaw'> => ({ x, z, y, level, yaw: 0 });
const ME = { x: 5, z: 0 };

test('벽 너머 내 쪽이 아니라 그 사람 쪽에 선다', () => {
  const w = tiny({ boxes: [box(0.6, 0.8, -5, 5)] });
  const t = who(0, 0);
  const s = G.spotNear(w, t, ME, []);
  assert.ok(s);
  assert.ok(s.x < 0.6 - RADIUS, `벽 너머에 섰다: ${s.x}`);
  assert.ok(!blocked(w.physics, 1, s.x, s.z));
  assert.ok(clearLine(w.physics, { ...t, level: 1 }, s.x, s.z), '그 사람에게서 곧게 닿지 않는다');
  facesFromRing(s, t);
});

test('사방이 막혔거나 바닥판 밖이면 서지 않는다', () => {
  const booth = tiny({ boxes: [box(0.6, 0.7, -1, 1), box(-0.7, -0.6, -1, 1), box(-1, 1, 0.6, 0.7), box(-1, 1, -0.7, -0.6)] });
  assert.equal(G.spotNear(booth, who(0, 0), ME, []), null);
  // 바닥판이 그 사람 바로 옆에서 끝나면 바닥판 쪽으로
  const edge = tiny({ floors: [slab(1, 0.5)] });
  const s = G.spotNear(edge, who(0, 0), ME, []);
  assert.ok(s && s.x <= 0.5, `바닥판 밖에 섰다: ${s?.x}`);
});

test('계단·경사면 위에는 서지 않고, 다른 사람도 비켜 선다', () => {
  const ramp: Ramp = { x1: 1, x2: 3, z1: -1, z2: 1, axis: 'x', y0: 0, y1: FLOOR2 };
  const w = tiny({ ramps: [ramp] });
  const s = G.spotNear(w, who(0, 0), ME, [{ x: 1.2, z: 1.2, level: 1 }]);
  assert.ok(s);
  assert.ok(!inRamp(ramp, s.x, s.z), '경사면 위에 섰다');
  assert.ok(near(s, { x: 1.2, z: 1.2 }) >= G.PERSON_GAP, '다른 사람 속에 섰다');
  facesFromRing(s, who(0, 0));
});

test('위층 사람 옆은 위층이고, 높이를 안 보낸 옛 화면이어도 그 층 바닥으로 본다', () => {
  const w = tiny();
  for (const y of [FLOOR2, 0, Number.NaN]) {
    const s = G.spotNear(w, who(0, 0, 2, y), ME, []);
    assert.ok(s, `높이 ${y}`);
    assert.equal(s.level, 2);
    assert.ok(Math.abs(s.x - 1.5) < 1e-9);
  }
  assert.equal(G.spotNear(w, { ...who(0, 0), x: Number.NaN }, ME, []), null);
});

test('다시 그린 집: 들어오는 자리의 사람 옆에 서고, 거기까지 걸어갈 길이 있다', async () => {
  const { tuneWorld } = await import('../../src/walk/tune.ts');
  const w = buildWorld({});
  const t = who(w.spawn.x, w.spawn.z);
  const s = G.spotNear(w, t, { x: w.spawn.x + 4, z: w.spawn.z }, []);
  assert.ok(s);
  facesFromRing(s, t);
  assert.ok(!blocked(tuneWorld(w).physics, 1, s.x, s.z));
  const path = findPath(w, { x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 }, { x: s.x, z: s.z, level: s.level });
  assert.ok(path && path.length > 0, '걸어갈 길이 없다');
});

test('다시 그린 집의 갈 곳마다: 고른 자리는 엔진이 설 수 있는 자리이고, 들어오는 자리에서 걸어갈 길이 있다', async () => {
  const { tuneWorld } = await import('../../src/walk/tune.ts');
  const { destinations } = await import('../../src/walk/nav.ts');
  const w = buildWorld({});
  const p = tuneWorld(w).physics;
  const start = { x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 as Level };
  let found = 0;
  const list = destinations(w);
  for (const d of list) {
    const t = who(d.x, d.z, d.level, d.level === 2 ? p.floor2 : 0);
    const s = G.spotNear(w, t, start, []);
    if (!s) continue;
    found++;
    facesFromRing(s, t);
    assert.equal(s.level, d.level, d.id);
    // 엔진의 바로 옮기기가 받는 자리: 그 층 바닥판 안, 계단·경사면 밖, 막히지 않음
    assert.ok(w.floors.some((f) => f.level === s.level && s.x >= f.x1 && s.x <= f.x2 && s.z >= f.z1 && s.z <= f.z2), `${d.id} 바닥판 밖`);
    assert.ok(!p.ramps.some((r) => inRamp(r, s.x, s.z)), `${d.id} 경사면 위`);
    assert.ok(!blocked(p, s.level, s.x, s.z), `${d.id} 막힌 자리`);
    assert.ok(clearLine(p, { x: t.x, z: t.z, y: t.y, level: t.level }, s.x, s.z), `${d.id} 그 사람에게서 곧게 닿지 않는다`);
    const path = findPath(w, start, { x: s.x, z: s.z, level: s.level });
    assert.ok(path && path.length > 0, `${d.id} 걸어갈 길이 없다`);
  }
  // 대부분의 갈 곳 옆에는 설 자리가 있다(문 앞처럼 좁은 곳은 없을 수 있다)
  assert.ok(found >= list.length / 2, `${found}/${list.length}`);
});

test('줄마다 두 단추: 같은 장면에서 찾은 사람만, 걸어가기는 길 격자가 준비된 뒤에', () => {
  const here = { kind: 'here' as const, id: 'p1' };
  assert.deepEqual(G.rowGo(undefined, { walkReady: true, miss: null }), { walk: false, jump: false, why: 'unseen' });
  assert.deepEqual(G.rowGo({ kind: 'away' }, { walkReady: true, miss: null }), { walk: false, jump: false, why: 'away' });
  assert.deepEqual(G.rowGo({ kind: 'twin' }, { walkReady: true, miss: null }), { walk: false, jump: false, why: 'twin' });
  assert.deepEqual(G.rowGo(here, { walkReady: true, miss: null }), { walk: true, jump: true, why: null });
  assert.deepEqual(G.rowGo(here, { walkReady: false, miss: null }), { walk: false, jump: true, why: 'wait' });
  assert.deepEqual(G.rowGo(here, { walkReady: true, miss: 'nospot' }), { walk: true, jump: true, why: 'nospot' });
});

test('갈 곳은 사람 옆(person)이고, 도착하면 그 사람 쪽을 본다', () => {
  const d = G.personDest({ id: 'p1', name: '하늘' }, { x: 1, z: 2, level: 2, yaw: 0.5 });
  assert.deepEqual(d, { id: 'person:p1', title: '하늘', kind: 'person', level: 2, x: 1, z: 2, yaw: 0.5 });
  assert.equal(arriveYaw(d), 0.5);
});

test('못 가는 까닭 글은 한국어·영어가 다 있다', () => {
  for (const k of ['away', 'unseen', 'twin', 'nospot', 'wait'] as const) {
    const [ko, en] = GO_WHY[k];
    assert.ok(/[가-힣]/.test(ko), `${k} 한국어`);
    assert.ok(en.trim().length > 0 && !/[가-힣]/.test(en) && !en.includes('—'), `${k} 영어`);
  }
});
