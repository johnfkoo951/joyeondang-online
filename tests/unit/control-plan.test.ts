// 컨트롤 룸 화면 계획 시험: 구획마다 세운 고정 카메라가 바닥 위·벽 밖·천장 밑에 서고 제 구획을 보는지,
// 사람을 화면에 나누는 규칙(구획 첫 일치, 작은 구획은 가까운 화면, 벽 너머는 그리지 않음)이 맞는지 본다.
// 공개해도 되는 다시 그린 집과, 시험에서 지어낸 작은 집만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 서로 가져온다: 시험에서는 .ts를 붙여 찾게 한다
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
import { buildWorld, zoneAt } from '../../src/content/world.ts';
import type { Seen } from '../../src/walk/observe.ts';
import type { HouseWorld, WallSpec } from '../../src/walk/types.ts';

const { assignPeople, ceilingAbove, fitFov, homeScreen, inSight, planScreens, zoneIndexAt } = await import('../../src/walk/observe.ts');

const W = buildWorld();
const plans = planScreens(W);
const insideRect = (r: { x1: number; x2: number; z1: number; z2: number }, x: number, z: number) => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;

test('계획: 층마다 전체 단면 하나가 먼저, 그다음 구획 화면', () => {
  assert.deepEqual(plans.slice(0, 2).map((p) => [p.id, p.cut, p.level]), [['all-1', 1, 1], ['all-2', 2, 2]]);
  assert.ok(plans.slice(2).every((p) => p.cut === 0 && p.id.startsWith('zone-') && p.sight));
  // 다시 그린 집의 구획은 모두 넓어서 저마다 화면을 갖는다
  assert.equal(plans.length, 2 + W.zones.length);
  // 같은 이름의 구획은 층을 붙여 가른다
  const titles = plans.map((p) => p.title);
  assert.ok(titles.includes('계단 · 1층') && titles.includes('계단 · 2층'), titles.join(','));
  assert.equal(new Set(titles).size, titles.length);
});

test('계획: 모든 구획이 꼭 한 화면에 맡겨진다', () => {
  const owner = new Map<number, number>();
  plans.forEach((p, i) => p.zones.forEach((zi) => {
    assert.ok(!owner.has(zi), `구획 ${zi}가 두 화면에`);
    owner.set(zi, i);
  }));
  assert.equal(owner.size, W.zones.length);
});

test('계획: 카메라는 그 층 바닥 위, 벽 밖, 천장 밑에 서고 시야각은 정한 범위 안', () => {
  for (const p of plans.filter((s) => s.cut === 0)) {
    const base = p.level === 2 ? W.floor2 : 0;
    const onFloor = W.floors.some((f) => f.level === p.level && insideRect(f, p.eye.x, p.eye.z)) || (p.level === 1 && !insideRect(W.house, p.eye.x, p.eye.z));
    assert.ok(onFloor, `${p.title}: 바닥 밖`);
    for (const s of W.walls) {
      if (s.style === 'invisible' || (s.box.level !== p.level && s.box.level !== 0)) continue;
      assert.ok(!insideRect(s.box, p.eye.x, p.eye.z), `${p.title}: 벽 속`);
    }
    assert.ok(p.eye.y >= base + 1.7 && p.eye.y < ceilingAbove(W, p.level, p.eye.x, p.eye.z), `${p.title}: 높이 ${p.eye.y}`);
    assert.ok(p.at.y < p.eye.y, `${p.title}: 내려다보지 않음`);
    assert.ok(p.fov >= 42 && p.fov <= 70, `${p.title}: 시야각 ${p.fov}`);
  }
  for (const p of plans.filter((s) => s.cut !== 0)) assert.ok(p.eye.y > p.at.y + 5 && p.fov >= 30 && p.fov <= 75, p.title);
});

test('계획: 구획 화면은 제 구획 대부분을 벽 없이 본다', () => {
  for (const p of plans.filter((s) => s.cut === 0)) {
    const zn = W.zones[p.zones[0]];
    let n = 0, seen = 0;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const x = zn.x1 + ((i + 0.5) * (zn.x2 - zn.x1)) / 6, z = zn.z1 + ((j + 0.5) * (zn.z2 - zn.z1)) / 6;
        if (zoneIndexAt(W, zn.level, x, z) !== p.zones[0]) continue;
        n++;
        if (inSight(p.sight, x, z)) seen++;
      }
    }
    assert.ok(n === 0 || seen / n >= 0.6, `${p.title}: ${seen}/${n}`);
  }
});

test('계획: 같은 집이면 같은 화면(정해진 차례, 같은 값)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(planScreens(buildWorld()))), JSON.parse(JSON.stringify(plans)));
});

test('사람 나누기: 걷기 화면의 구획 이름과 같은 화면, 앞에 적힌 구획이 먼저', () => {
  for (const zn of W.zones) {
    const x = (zn.x1 + zn.x2) / 2, z = (zn.z1 + zn.z2) / 2;
    const i = homeScreen(W, plans, zn.level, x, z);
    assert.ok(i >= 0);
    const owner = W.zones[plans[i].zones[0]];
    assert.equal(owner.name, zoneAt(zn.level, x, z, W), `${zn.name}`);
  }
  // 어느 구획에도 없는 1층 자리는 가장 가까운 1층 구획 화면이 맡는다
  const far = homeScreen(W, plans, 1, 0, -30);
  assert.equal(plans[far].level, 1);
  assert.equal(plans[far].cut, 0);
});

test('사람 나누기: 층 전체는 그 층 사람 모두, 구획 화면은 거기 있는 사람과 벽 없이 보이는 사람만', () => {
  const living = W.zones.find((z) => z.name === '1층 거실')!;
  const upper = W.zones.find((z) => z.level === 2 && z.name === '박공 아래 거실')!;
  const people: Seen[] = [
    { id: 'a', name: '가', level: 1, x: (living.x1 + living.x2) / 2, z: (living.z1 + living.z2) / 2 },
    { id: 'b', name: '나', level: 2, x: (upper.x1 + upper.x2) / 2, z: (upper.z1 + upper.z2) / 2 },
    { id: 'c', name: '다', level: 1, x: 0, z: 12 },
  ];
  const got = assignPeople(W, plans, people);
  const at = (id: string) => plans.findIndex((p) => p.id === id);
  assert.deepEqual(got[at('all-1')].here.map((p) => p.id).sort(), ['a', 'c']);
  assert.deepEqual(got[at('all-2')].here.map((p) => p.id), ['b']);
  const livingScreen = plans.findIndex((p) => p.cut === 0 && W.zones[p.zones[0]].name === '1층 거실');
  assert.deepEqual(got[livingScreen].here.map((p) => p.id), ['a']);
  // 다른 층 사람은 어느 1층 구획 화면에도 그리지 않는다
  plans.forEach((p, i) => { if (p.cut === 0 && p.level === 1) assert.ok(!got[i].draw.has('b'), p.title); });
  // 사람마다 「있는 곳」 구획 화면은 하나
  for (const id of ['a', 'b', 'c']) {
    assert.equal(got.filter((g, i) => plans[i].cut === 0 && g.here.some((p) => p.id === id)).length, 1, id);
  }
});

// 벽 하나로 나뉜 두 방(앞방은 마당 쪽)과 둘을 잇는 닫힌 문. 큰 수치는 시험용으로 지어낸 것이다
function twoRooms(open: boolean): HouseWorld {
  const wall = (x1: number, x2: number, z1: number, z2: number): WallSpec => ({ box: { x1, x2, z1, z2, level: 1 }, baseY: 0, height: 2.6, style: 'int1', axis: x2 - x1 > z2 - z1 ? 'x' : 'z' });
  const walls = [wall(-5, 5, -10.1, -10), wall(-5, 5, 0, 0.1), wall(-5.1, -5, -10, 0), wall(5, 5.1, -10, 0)];
  // 가운데 칸막이(open이면 가운데 2m를 비운다)
  if (open) walls.push(wall(-5, -1, -5.05, -4.95), wall(1, 5, -5.05, -4.95));
  else walls.push(wall(-5, 5, -5.05, -4.95));
  return {
    kind: 'redrawn', floor2: 3, house: { x1: -5, x2: 5, z1: -10, z2: 0 },
    floors: [{ level: 1, x1: -5, x2: 5, z1: -10, z2: 0, mat: 'oak' }],
    walls, headers: [], doors: [], ceilings: [{ level: 1, x1: -5, x2: 5, z1: -10, z2: 0, y: 2.6 }], windows: [], furniture: [], props: [],
    zones: [{ level: 1, x1: -5, x2: 5, z1: -10, z2: -5, name: '안방' }, { level: 1, x1: -5, x2: 5, z1: -5, z2: 0, name: '앞방' }],
    hotspots: [], physics: { boxes: [], ramps: [], floor2: 3 }, spawn: { x: 0, z: 5, yaw: 0 },
  };
}

test('벽 너머: 막힌 칸막이 건너편 사람은 그리지 않고, 트인 곳으로는 보인다', () => {
  for (const open of [false, true]) {
    const w = twoRooms(open);
    const ps = planScreens(w);
    const front = ps.findIndex((p) => p.title === '앞방');
    // 앞방 카메라에서 칸막이 가운데(트인 곳)를 지나 안방까지 곧게 간 자리에 선 사람
    const { eye } = ps[front];
    const t = (-7.5 - eye.z) / (-5 - eye.z);
    const people: Seen[] = [{ id: 'in', name: '가', level: 1, x: eye.x + (0 - eye.x) * t, z: -7.5 }];
    assert.ok(people[0].x > -4.5 && people[0].x < 4.5, `${people[0].x}`);
    const got = assignPeople(w, ps, people);
    assert.equal(got[front].draw.has('in'), open, `open=${open}`);
    assert.equal(got[front].here.length, 0);
    // 천장 밑에 선다
    assert.ok(ps[front].eye.y <= 2.6 - 0.2 + 1e-9 && ps[front].eye.y >= 1.7);
  }
});

test('작은 구획은 따로 화면을 두지 않고 가까운 구획 화면이 맡는다', () => {
  const w = twoRooms(true);
  w.zones.push({ level: 1, x1: 4, x2: 5, z1: -1, z2: 0, name: '신발장' });
  const ps = planScreens(w);
  assert.ok(!ps.some((p) => p.title === '신발장'));
  const i = homeScreen(w, ps, 1, 4.5, -0.5);
  // 신발장은 앞방(첫 일치)이 먼저 잡는다: 앞방 화면
  assert.equal(ps[i].title, '앞방');
  assert.ok(ps.some((p) => p.zones.includes(2)));
});

test('시야각 맞추기: 넓게 퍼진 점일수록 넓고, 정한 범위를 넘지 않는다', () => {
  const eye = { x: 0, y: 2.3, z: 0 }, at = { x: 0, y: 0.9, z: -5 };
  const narrow = fitFov(eye, at, [{ x: -1, y: 0, z: -5 }, { x: 1, y: 1.6, z: -5 }]);
  const wide = fitFov(eye, at, [{ x: -4, y: 0, z: -5 }, { x: 4, y: 1.6, z: -5 }]);
  assert.ok(wide > narrow, `${narrow} ${wide}`);
  assert.ok(fitFov(eye, at, [{ x: -40, y: 0, z: -2 }]) <= 70);
  // 카메라 바로 밑과 뒤쪽 점은 보지 않는다
  assert.equal(fitFov(eye, at, [{ x: 0.2, y: 0, z: 0.2 }, { x: 0, y: 0, z: 5 }]), 42);
});
