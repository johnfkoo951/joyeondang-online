// 걷기 손질(staging.ts) 검사: 넓혀도 벽 두께·가구 크기는 그대로, 원본은 그대로, 모든 갈 곳에 길이 있고,
// 결혼식 꾸밈이면 거실 모서리에 무대·꽃길·「누구의 문장일까」 자리가 생긴다.
// 공개 저장소에서는 다시 그린 집을 「실제 집」 꼴로 바꿔 돌리고, 실제 집 JSON(HOUSE_WORLD_JSON)이 있으면 그것도 돈다(좌표는 찍지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import type { HouseWorld } from '../../src/walk/types.ts';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
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

const { buildWorld } = await import('../../src/content/world.ts');
const { STAGING, WINDOW_VIEW, stageHouse, themeOf, windowBlocked } = await import('../../src/walk/staging.ts');
const { destinations, findPath } = await import('../../src/walk/nav.ts');

const realPath = process.env.HOUSE_WORLD_JSON || process.env.JY_HOUSE_WORLD_JSON;
const real: HouseWorld | null = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;
const asReal = (): HouseWorld => ({ ...structuredClone(buildWorld({})), kind: 'real' });
const worlds: Array<[string, () => HouseWorld]> = [['다시 그린 집(실제 꼴)', asReal], ...(real ? [['실제 집', () => structuredClone(real)] as [string, () => HouseWorld]] : [])];

const thin = (r: { x1: number; x2: number; z1: number; z2: number }) => Math.min(r.x2 - r.x1, r.z2 - r.z1);
const ADDED = new Set(['weddingStage', 'flowerArch', 'aisle', 'glassRail', 'photoFrame', 'flowerStand', 'guestbook', 'puppetStage', 'welcomeSign', 'planter', 'hyeonpan', 'pathLight', 'shrub']);

type Furn = HouseWorld['furniture'][number];
type Rect4 = { x1: number; x2: number; z1: number; z2: number };
/** 가구 등 쪽(정면 반대) 면에서 그 벽 면까지 틈. 벽 안으로 들어가 있으면 음수 */
function backGapTo(f: Furn, b: Rect4): number {
  const back = f.face![0] === '+' ? -1 : 1;
  return f.face![1] === 'x' ? (back < 0 ? f.x1 - b.x2 : b.x1 - f.x2) : (back < 0 ? f.z1 - b.z2 : b.z1 - f.z2);
}
/** 가구가 등을 대고 있는 벽(같은 층, 등과 나란하고 너비가 겹치며 틈이 STAGING.attach 안)과 그 틈 */
function backWall(w: HouseWorld, f: Furn): { wall: number; gap: number } | null {
  if (!f.face) return null;
  const deep = f.face[1];
  let best: { wall: number; gap: number } | null = null;
  w.walls.forEach((s, i) => {
    const b = s.box;
    if ((b.level !== 0 && b.level !== f.level) || s.axis === deep) return;
    const over = deep === 'x' ? Math.min(f.z2, b.z2) - Math.max(f.z1, b.z1) : Math.min(f.x2, b.x2) - Math.max(f.x1, b.x1);
    if (over < 0.05) return;
    const gap = backGapTo(f, b);
    if (Math.abs(gap) <= STAGING.attach && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { wall: i, gap };
  });
  return best;
}

test('꾸밈 이름: 모르는 값은 결혼식', () => {
  assert.equal(themeOf(undefined), 'wedding');
  assert.equal(themeOf('plain'), 'plain');
  assert.equal(themeOf('???'), 'wedding');
});

test('다시 그린 집·방 장면은 손대지 않는다', () => {
  const w = buildWorld({});
  assert.equal(stageHouse(w), w);
});

for (const [name, make] of worlds) {
  test(`${name}: 원본은 그대로, 한 번만 손질`, () => {
    const src = make();
    const before = JSON.stringify(src);
    const out = stageHouse(src, 'wedding');
    assert.equal(JSON.stringify(src), before, '원본이 바뀌었다');
    assert.equal(out.theme, 'wedding');
    assert.equal(stageHouse(out, 'wedding'), out, '이미 손질한 세계를 또 손질했다');
  });

  test(`${name}: 집은 넓어지고 벽 두께는 그대로`, () => {
    const src = make();
    const out = stageHouse(src, 'plain');
    const ratio = (out.house.x2 - out.house.x1) / (src.house.x2 - src.house.x1);
    assert.ok(Math.abs(ratio - STAGING.scale) < 1e-6, `집 너비 배율 ${ratio}`);
    assert.equal(out.walls.length, src.walls.length);
    src.walls.forEach((s, i) => {
      const a = thin(s.box), b = thin(out.walls[i].box);
      if (a < STAGING.thin) assert.ok(Math.abs(a - b) < 1e-6, `벽 ${i} 두께가 ${a} → ${b}`);
    });
    // 원래 있던 가구는 크기가 그대로(바닥에 까는 것 빼고)
    const kept = out.furniture.filter((f) => !ADDED.has(f.kind) || f.kind === 'shrub');
    for (const f of src.furniture.filter((x) => !['path', 'rug', 'lattice'].includes(x.kind))) {
      const g = kept.find((x) => x.kind === f.kind && Math.abs((x.x2 - x.x1) - (f.x2 - f.x1)) < 1e-6 && Math.abs((x.z2 - x.z1) - (f.z2 - f.z1)) < 1e-6);
      assert.ok(g, `${f.kind} 크기가 바뀌었다`);
    }
    assert.ok(out.windows.length >= src.windows.length, '창이 줄었다');
  });

  test(`${name}: 손질한 집에서도 모든 갈 곳에 길이 있다`, () => {
    const out = stageHouse(make(), 'wedding');
    const sp = { x: out.spawn.x, z: out.spawn.z, y: 0, level: 1 as const };
    const missing = destinations(out).filter((d) => !findPath(out, sp, d)).map((d) => d.title);
    assert.deepEqual(missing, []);
  });

  test(`${name}: 결혼식 꾸밈은 마당에: 현관 앞에서 대각선으로 먼 모서리에 무대, 버진로드, 소품은 걸리지 않는다`, () => {
    const out = stageHouse(make(), 'wedding');
    const lawns = out.floors.filter((f) => f.level === 1 && f.mat === 'lawn');
    const L = { x1: Math.min(...lawns.map((f) => f.x1)), x2: Math.max(...lawns.map((f) => f.x2)), z1: Math.min(...lawns.map((f) => f.z1)), z2: Math.max(...lawns.map((f) => f.z2)) };
    const stage = out.furniture.find((f) => f.kind === 'weddingStage');
    assert.ok(stage, '무대가 없다');
    assert.ok(stage.x1 >= L.x1 && stage.x2 <= L.x2 && stage.z1 >= L.z1 && stage.z2 <= L.z2, '무대가 마당 밖이다');
    const entrance = out.hotspots.find((h) => h.slug === 'entrance')!;
    const sc = { x: (stage.x1 + stage.x2) / 2, z: (stage.z1 + stage.z2) / 2 };
    const c = { x: (L.x1 + L.x2) / 2, z: (L.z1 + L.z2) / 2 };
    assert.ok(Math.hypot(sc.x - entrance.x, sc.z - entrance.z) > Math.hypot(c.x - entrance.x, c.z - entrance.z), '무대가 현관 쪽에 있다');
    assert.ok(out.physics.ramps.some((r) => r.y0 === STAGING.stageH && r.y1 === STAGING.stageH), '무대에 올라설 판이 없다');
    const aisle = out.furniture.filter((f) => f.kind === 'aisle');
    assert.equal(aisle.length, 1, '버진로드는 한 줄');
    const event = new Set(['weddingStage', 'flowerArch', 'aisle', 'flowerStand', 'guestbook', 'pathLight', 'planter', 'welcomeSign', 'hyeonpan', 'sconce']);
    assert.deepEqual(out.furniture.filter((f) => event.has(f.kind) && f.collide).map((f) => f.kind), [], '걸리는 행사 소품');
    assert.equal(out.hotspots.find((h) => h.id === 'wedding-stage')?.game, 'who');
    assert.ok(out.hotspots.some((h) => h.slug === 'photozone'), '포토존 자리가 없다');
    // 거실 무대 자리는 늘 「누구의 문장일까」, 거실에는 행사 무대가 없다
    const living = out.zones.find((z) => z.level === 1 && z.name.includes('거실'));
    if (living) assert.ok(!(sc.x > living.x1 && sc.x < living.x2 && sc.z > living.z1 && sc.z < living.z2), '무대가 거실에 있다');
  });

  test(`${name}: 손질한 창·지붕·소품이 어긋나지 않는다`, () => {
    for (const theme of ['wedding', 'plain'] as const) {
      const src = make();
      const out = stageHouse(src, theme);
      // 창은 뒤집히거나 쪼그라들지 않는다
      for (const v of out.windows) assert.ok(v.to - v.from >= 0.3 && v.top > v.sill, `${theme}: 창 폭 ${(v.to - v.from).toFixed(2)}`);
      // 원본에서 맞닿아 있던 지붕판은 손질 뒤에도 맞닿는다(틈으로 하늘이 보이지 않게)
      const roofs = (w: HouseWorld) => w.props.filter((p): p is Extract<HouseWorld['props'][number], { type: 'slab' }> => p.type === 'slab' && p.part === 'roof');
      const gap = (a: { x1: number; x2: number; z1: number; z2: number }, b: typeof a) =>
        Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2), Math.max(a.z1, b.z1) - Math.min(a.z2, b.z2));
      const before = roofs(src), after = roofs(out);
      assert.equal(after.length, before.length);
      for (let i = 0; i < before.length; i++) for (let j = i + 1; j < before.length; j++) {
        if (gap(before[i], before[j]) < 1e-6) assert.ok(gap(after[i], after[j]) < 1e-6, `${theme}: 지붕판 ${i}·${j} 사이가 ${gap(after[i], after[j]).toFixed(3)}m 벌어졌다`);
      }
      // 꽃대·길가 등은 디딤돌 길 위에 서지 않고, 길가 등끼리 붙어 서지 않는다
      const paths = out.furniture.filter((f) => f.kind === 'path');
      const mid = (f: { x1: number; x2: number; z1: number; z2: number }) => ({ x: (f.x1 + f.x2) / 2, z: (f.z1 + f.z2) / 2 });
      for (const f of out.furniture.filter((x) => x.kind === 'flowerStand')) {
        const c = mid(f);
        assert.ok(!paths.some((p) => c.x > p.x1 && c.x < p.x2 && c.z > p.z1 && c.z < p.z2), `${theme}: 꽃대가 디딤돌 길 위에 있다`);
      }
      const lights = out.furniture.filter((x) => x.kind === 'pathLight').map(mid);
      for (let i = 0; i < lights.length; i++) for (let j = i + 1; j < lights.length; j++) {
        assert.ok(Math.hypot(lights[i].x - lights[j].x, lights[i].z - lights[j].z) > 0.5, `${theme}: 길가 등 둘이 붙어 있다`);
      }
      // 벽등은 창 유리 앞에 걸리지 않는다
      for (const f of out.furniture.filter((x) => x.kind === 'sconce')) {
        const c = mid(f);
        const glass = out.windows.some((v) => v.level === 1 && v.axis === 'x' && Math.abs(v.at - c.z) < 0.4 && c.x > v.from && c.x < v.to);
        assert.ok(!glass, `${theme}: 벽등이 창 앞에 떠 있다`);
      }
      // 문·포털 살피기 반경은 늘리지 않는다
      for (const h of src.hotspots.filter((x) => x.kind === 'portal' || x.kind === 'door' || x.kind === 'exit')) {
        assert.equal(out.hotspots.find((x) => x.id === h.id)?.r, h.r, `${h.kind} 반경`);
      }
    }
  });

  test(`${name}: 벽에 등을 대고 있던 가구는 넓힌 뒤에도 그 벽에 그 틈으로 붙어 있다`, () => {
    const src = make();
    const out = stageHouse(src, 'plain');
    let attached = 0;
    src.furniture.forEach((f, i) => {
      const g = out.furniture[i];
      assert.equal(g.kind, f.kind);
      const hit = backWall(src, f);
      if (!hit) return;
      attached++;
      const after = backGapTo(g, out.walls[hit.wall].box);
      assert.ok(Math.abs(after - hit.gap) < 1e-6, `${f.kind}: 등 쪽 틈 ${hit.gap.toFixed(3)} → ${after.toFixed(3)}`);
      // 막는 상자도 그림과 같이 갔다
      if (f.collide) assert.ok(out.physics.boxes.some((b) => Math.abs(b.x1 - g.x1) < 1e-9 && Math.abs(b.x2 - g.x2) < 1e-9 && Math.abs(b.z1 - g.z1) < 1e-9 && Math.abs(b.z2 - g.z2) < 1e-9), `${f.kind}: 막는 상자가 그림과 다르다`);
    });
    assert.ok(attached >= 3, `벽에 붙은 가구 ${attached}개`);
    // 격자창은 건 벽 구간 안에 있다(벽 끝을 넘어 옆 통로 위에 걸치지 않는다)
    for (const f of out.furniture.filter((x) => x.kind === 'lattice')) {
      const alongX = f.x2 - f.x1 >= f.z2 - f.z1;
      const line = alongX ? (f.z1 + f.z2) / 2 : (f.x1 + f.x2) / 2;
      const inWall = out.walls.some((s) => {
        const b = s.box;
        if ((b.level !== 0 && b.level !== f.level) || (s.axis === 'x') !== alongX) return false;
        if (Math.abs((alongX ? (b.z1 + b.z2) / 2 : (b.x1 + b.x2) / 2) - line) >= 0.35) return false;
        return alongX ? f.x1 >= b.x1 - 1e-9 && f.x2 <= b.x2 + 1e-9 : f.z1 >= b.z1 - 1e-9 && f.z2 <= b.z2 + 1e-9;
      });
      assert.ok(inWall, '격자창이 건 벽 밖으로 나갔다');
    }
  });

  test(`${name}: 그냥 꾸밈이면 행사 소품이 없고, 거실 무대 자리는 그래도 「누구의 문장일까」`, () => {
    const out = stageHouse(make(), 'plain');
    assert.ok(!out.furniture.some((f) => f.kind === 'weddingStage' || f.kind === 'aisle'));
    const spot = out.hotspots.find((h) => h.slug === 'living' && h.kind === 'stage');
    if (spot) assert.equal(spot.game, 'who');
  });
}

test('새 창은 바로 앞이 다른 벽으로 막힌 자리에는 내지 않는다', () => {
  // 방 하나(6×5m). +x 쪽 벽 바깥 0.7m에 나란한 벽이 하나 더 있다(꺾인 집의 안쪽 모서리처럼)
  const wall = (x1: number, x2: number, z1: number, z2: number, axis: 'x' | 'z') =>
    ({ box: { x1, x2, z1, z2, level: 1 as const, tag: 'wall' }, baseY: 0, height: 2.7, style: 'ext' as const, axis });
  const T = 0.2;
  const walls = [
    wall(0, 6, -T, 0, 'x'), wall(0, 6, 5, 5 + T, 'x'), wall(-T, 0, 0, 5, 'z'), wall(6, 6 + T, 0, 5, 'z'),
    wall(6.9, 6.9 + T, -1, 6, 'z'),
  ];
  const src: HouseWorld = {
    kind: 'real', floor2: 2.9, house: { x1: -T, x2: 7.1, z1: -T, z2: 5 + T },
    floors: [{ level: 1, x1: 0, x2: 6, z1: 0, z2: 5, mat: 'oak' }],
    walls, headers: [], doors: [], ceilings: [{ level: 1, x1: 0, x2: 6, z1: 0, z2: 5, y: 2.7 }], windows: [], furniture: [], props: [],
    zones: [{ level: 1, x1: 0, x2: 6, z1: 0, z2: 5, name: '방' }], hotspots: [],
    physics: { boxes: walls.map((s) => ({ ...s.box })), ramps: [], floor2: 2.9 }, spawn: { x: 3, z: 2.5, yaw: 0 },
  };
  const out = stageHouse(src, 'plain');
  const east = out.walls[3];
  const farLine = (east.box.x1 + east.box.x2) / 2;
  assert.ok(out.windows.length >= 3, `창 ${out.windows.length}개`);
  assert.ok(!out.windows.some((v) => v.axis === 'z' && Math.abs(v.at - farLine) < 0.2), '앞이 막힌 벽에 창을 냈다');
  // 새로 낸 창은 모두 바깥이 트여 있다
  for (const v of out.windows) {
    const host = out.walls.find((s) => s.axis === v.axis && Math.abs((s.axis === 'x' ? (s.box.z1 + s.box.z2) / 2 : (s.box.x1 + s.box.x2) / 2) - v.at) < 0.2);
    const mid = (v.from + v.to) / 2;
    const indoor = (k: number) => out.floors.some((f) => (v.axis === 'x' ? mid > f.x1 && mid < f.x2 && v.at + k * 0.5 > f.z1 && v.at + k * 0.5 < f.z2 : v.at + k * 0.5 > f.x1 && v.at + k * 0.5 < f.x2 && mid > f.z1 && mid < f.z2));
    const outSide = indoor(1) ? -1 : 1;
    assert.ok(windowBlocked(out, v, outSide, host) <= 0.4, '창밖이 벽으로 가려 있다');
  }
  assert.ok(WINDOW_VIEW > 1);
  // 판정 함수: 창 폭의 절반을 가리는 벽
  const v = { level: 1 as const, axis: 'z' as const, at: 0, from: 0, to: 2, sill: 0.45, top: 2.3 };
  const w2: HouseWorld = { ...src, walls: [wall(1, 1 + T, 1, 5, 'z')] };
  assert.ok(Math.abs(windowBlocked(w2, v, 1) - 0.5) < 1e-9);
  assert.equal(windowBlocked(w2, v, -1), 0, '반대쪽은 트여 있다');
});

test('테라스 난간 모서리: 앞 난간과 옆 난간의 끝 기둥이 한 자리에 서고, 막는 상자는 그대로다', () => {
  // 2층 발코니(6×2m)를 낮은 바깥벽 셋이 두르고, 그 앞으로 포치 지붕판이 더 나와 있다
  const T = 0.2, F2 = 2.9;
  const low = (x1: number, x2: number, z1: number, z2: number, axis: 'x' | 'z') =>
    ({ box: { x1, x2, z1, z2, level: 2 as const, tag: 'wall' }, baseY: F2, height: 1.1, style: 'ext' as const, axis });
  const walls = [low(1 - T, 7 + T, 6, 6 + T, 'x'), low(1 - T, 1, 4, 6 + T, 'z'), low(7, 7 + T, 4.5, 6 + T, 'z')];
  const src: HouseWorld = {
    kind: 'real', floor2: F2, house: { x1: 0, x2: 8, z1: 0, z2: 6 + T },
    floors: [{ level: 2, x1: 1, x2: 7, z1: 4, z2: 6, mat: 'tile' }],
    walls, headers: [], doors: [], ceilings: [], windows: [], furniture: [],
    props: [{ type: 'slab', x1: 0.5, x2: 7.5, z1: 6, z2: 8.4, y: F2 + 0.2, t: 0.24, part: 'porch' }],
    zones: [{ level: 2, x1: 1, x2: 7, z1: 4, z2: 6, name: '발코니' }], hotspots: [],
    physics: { boxes: walls.map((s) => ({ ...s.box })), ramps: [], floor2: F2 }, spawn: { x: 4, z: 5, yaw: 0 },
  };
  const out = stageHouse(src, 'plain');
  const rails = out.furniture.filter((f) => f.kind === 'glassRail');
  const front = rails.find((f) => f.face === '+z');
  const sides = rails.filter((f) => f.face === '+x');
  assert.ok(front && sides.length === 2, `난간 ${rails.length}개`);
  const mid = (a: number, b: number) => (a + b) / 2;
  // 난간은 상자 양 끝에 기둥을 세운다: 옆 난간의 앞쪽 끝 기둥과 앞 난간의 끝 기둥이 같은 자리여야 한다
  const frontEnds = [front.x1, front.x2].map((x) => ({ x, z: mid(front.z1, front.z2) }));
  for (const s of sides) {
    const post = { x: mid(s.x1, s.x2), z: s.z2 };
    const gap = Math.min(...frontEnds.map((p) => Math.hypot(p.x - post.x, p.z - post.z)));
    assert.ok(gap < 1e-9, `모서리 기둥 둘 사이가 ${gap.toFixed(3)}m`);
  }
  // 걷는 사람을 막는 상자는 벽 상자 그대로(모서리에 틈이 생기지 않는다)
  const edge = Math.max(...out.walls.map((s) => s.box.z2));
  for (const s of out.walls) {
    assert.equal(s.style, 'invisible');
    assert.ok(Math.abs(s.box.z2 - edge) < 1e-9, '벽 상자가 테라스 끝까지 가지 않는다');
    assert.ok(out.physics.boxes.some((b) => Math.abs(b.x1 - s.box.x1) < 1e-9 && Math.abs(b.x2 - s.box.x2) < 1e-9 && Math.abs(b.z1 - s.box.z1) < 1e-9 && Math.abs(b.z2 - s.box.z2) < 1e-9), '막는 상자가 벽 상자와 다르다');
  }
  assert.ok(front.x2 - front.x1 < out.walls[0].box.x2 - out.walls[0].box.x1, '앞 난간 그림은 옆 난간 가운데 선까지만');
});

test('벽에 건 격자창 둘이 벽 끝을 넘으면 함께 벽 안으로 들어온다(폭과 간격은 그대로)', () => {
  // 방 하나(6×5m). -z 쪽 벽은 가운데가 문 없는 통로(머리벽)이고, 통로 옆 벽 토막에 격자창 둘을 걸었는데 하나가 통로 쪽으로 넘어가 있다
  const T = 0.2;
  const wall = (x1: number, x2: number, z1: number, z2: number, axis: 'x' | 'z') =>
    ({ box: { x1, x2, z1, z2, level: 1 as const, tag: 'wall' }, baseY: 0, height: 2.7, style: 'int1' as const, axis });
  const walls = [wall(0, 2.5, -T, 0, 'x'), wall(4, 6, -T, 0, 'x'), wall(0, 6, 5, 5 + T, 'x'), wall(-T, 0, 0, 5, 'z'), wall(6, 6 + T, 0, 5, 'z')];
  const header = { ...wall(2.5, 4, -T, 0, 'x'), baseY: 2.1, height: 0.6 };
  const lattice = (x1: number, x2: number): Furn => ({ kind: 'lattice', level: 1, x1, x2, z1: 0.01, z2: 0.07, face: '+z', collide: false });
  const shelf: Furn = { kind: 'bookshelf', level: 1, x1: 0.02, x2: 0.37, z1: 1, z2: 3, face: '+x', collide: true };
  const src: HouseWorld = {
    kind: 'real', floor2: 2.9, house: { x1: -T, x2: 6 + T, z1: -T, z2: 5 + T },
    floors: [{ level: 1, x1: 0, x2: 6, z1: 0, z2: 5, mat: 'oak' }],
    walls, headers: [header], doors: [], ceilings: [], windows: [], furniture: [lattice(3.9, 4.7), lattice(4.8, 5.6), shelf], props: [],
    zones: [{ level: 1, x1: 0, x2: 6, z1: 0, z2: 5, name: '방' }], hotspots: [],
    physics: { boxes: [...walls.map((s) => ({ ...s.box })), { x1: shelf.x1, x2: shelf.x2, z1: shelf.z1, z2: shelf.z2, level: 1, tag: 'bookshelf' }], ramps: [], floor2: 2.9 },
    spawn: { x: 3, z: 2.5, yaw: 0 },
  };
  const out = stageHouse(src, 'plain');
  const host = out.walls[1].box;
  const [a, b] = out.furniture.filter((f) => f.kind === 'lattice');
  for (const f of [a, b]) {
    assert.ok(f.x1 >= host.x1 + 0.05 - 1e-9 && f.x2 <= host.x2 - 0.05 + 1e-9, '격자창이 건 벽 안쪽에 있지 않다');
    assert.ok(Math.abs(f.z1 - host.z2 - 0.01) < 1e-9, `벽에서 ${(f.z1 - host.z2).toFixed(3)}m 떴다`);
    assert.ok(Math.abs(f.x2 - f.x1 - 0.8 * STAGING.scale) < 1e-9, `폭 ${(f.x2 - f.x1).toFixed(3)}`);
  }
  assert.ok(Math.abs(b.x1 - a.x2 - 0.1 * STAGING.scale) < 1e-9, '둘 사이 간격이 달라졌다');
  // 통로(머리벽) 위에는 걸치지 않는다
  assert.ok(a.x1 >= out.headers[0].box.x2 - 1e-9);
  // 벽에 붙여 둔 책장은 넓힌 뒤에도 같은 틈으로 붙어 있고, 막는 상자도 같이 간다
  const s2 = out.furniture.find((f) => f.kind === 'bookshelf')!;
  assert.ok(Math.abs(s2.x1 - out.walls[3].box.x2 - 0.02) < 1e-9, `책장이 벽에서 ${(s2.x1 - out.walls[3].box.x2).toFixed(3)}m`);
  assert.ok(Math.abs(s2.x2 - s2.x1 - 0.35) < 1e-9, '책장 크기는 그대로');
  assert.ok(out.physics.boxes.some((p) => p.tag === 'bookshelf' && Math.abs(p.x1 - s2.x1) < 1e-9 && Math.abs(p.x2 - s2.x2) < 1e-9));
});
