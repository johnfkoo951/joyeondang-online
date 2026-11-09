// 길 찾기 검사: 마당 spawn에서 모든 갈 곳까지 길이 있고, 그 길을 화면이 쓰는 step()으로 따라 걸으면 닿는다.
// 실제 집은 JY_HOUSE_WORLD_JSON(저장소 밖 JSON 경로)이 있을 때만 같은 시험을 돈다(좌표·이름은 찍지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import type { HouseWorld, Level, Physics } from '../../src/walk/types.ts';

// nav.ts는 앱과 같은 꼴(확장자 없는 './physics', '@/content/world')로 가져온다. 이 시험 프로세스에서만 .ts와 @/를 풀어 준다.
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

const { buildWorld, L2Y, STAIRS } = await import('../../src/content/world.ts');
const { CELL, destinations, findPath } = await import('../../src/walk/nav.ts');
const { blocked, heightAt, inRamp, levelOf, step } = await import('../../src/walk/physics.ts');
const { tuneWorld } = await import('../../src/walk/tune.ts');
type NavPoint = import('../../src/walk/nav.ts').NavPoint;
type Body = import('../../src/walk/physics.ts').Body;

const realPath = process.env.JY_HOUSE_WORLD_JSON;
const real: HouseWorld | null = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;
const redrawn = buildWorld({});
const worlds: Array<[string, HouseWorld]> = [['다시 그린 집', redrawn], ...(real ? [['실제 집', real] as [string, HouseWorld]] : [])];

const spawnOf = (w: HouseWorld): NavPoint => ({ x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 });

/** 엔진처럼 다음 점을 향해 작은 걸음(4cm)으로 걷는다. 지나간 높이도 모은다. */
function follow(p: Physics, from: NavPoint, path: NavPoint[]) {
  let b: Body = { ...from };
  const ys: number[] = [];
  for (const pt of path) {
    for (let i = 0; i < 2000; i++) {
      const dx = pt.x - b.x, dz = pt.z - b.z, d = Math.hypot(dx, dz);
      if (d < 0.02) break;
      const s = Math.min(0.04, d);
      b = step(p, b, (dx / d) * s, (dz / d) * s);
      ys.push(b.y);
    }
  }
  return { b, ys };
}

function walkable(p: Physics, level: Level, x: number, z: number) {
  const y = heightAt(p, x, z, level === 2 ? p.floor2 : 0);
  return y !== null && levelOf(p, y) === level && !blocked(p, level, x, z);
}

for (const [name, w] of worlds) {
  const p = tuneWorld(w).physics;
  // 실제 집은 이름·id 대신 번호로만 알린다
  const label = (d: { id: string }, k: number) => (w === redrawn ? d.id : `#${k}`);

  test(`${name}: 갈 곳은 살피기 자리와 포털이고, 모두 실제로 설 수 있는 자리다`, () => {
    const ds = destinations(w);
    assert.ok(ds.length >= Math.min(w.hotspots.length, 5), `갈 곳 ${ds.length}개`);
    // 방 장면 일곱마다 포털 하나(재즈가 흐르는 방, 좋아하는 것 방, 과녁 방, 생각 지도 방, 빛이 드는 방, 손님방, 작업 차고)
    assert.deepEqual((w.portals ?? []).map((pt) => pt.slug).sort(), ['gable', 'garage', 'guest', 'mind', 'study', 'target', 'toybox']);
    assert.equal(ds.filter((d) => d.kind === 'portal').length, 7, '갈 곳 목록의 포털 수');
    const ids = new Set(ds.map((d) => d.id));
    assert.equal(ids.size, ds.length, '같은 id가 두 번 나온다');
    ds.forEach((d, k) => {
      assert.ok(walkable(p, d.level, d.x, d.z), `${label(d, k)} 자리에 설 수 없음`);
      assert.ok(Number.isFinite(d.yaw), `${label(d, k)} yaw`);
      assert.ok(d.title.length > 0);
    });
    for (const pt of w.portals ?? []) {
      const d = ds.find((x) => x.kind === 'portal' && x.slug === pt.slug && x.level === pt.level);
      assert.ok(d, `포털 ${w === redrawn ? pt.slug : '#'} 이 목록에 없음`);
      if (walkable(p, pt.level, pt.x, pt.z)) assert.ok(d.x === pt.x && d.z === pt.z, '포털은 적힌 자리 그대로');
      assert.equal(d.yaw, pt.yaw);
    }
    // 살피기 자리마다(포털과 합쳐진 문은 빼고) 반지름 안 접근 칸
    for (const h of w.hotspots) {
      const d = ds.find((x) => x.id === h.id && x.kind === h.kind);
      if (!d || (w.portals ?? []).some((pt) => pt.slug === h.slug && pt.level === h.level)) continue;
      assert.ok(Math.hypot(d.x - h.x, d.z - h.z) <= Math.max(h.r, CELL) + 1 + 1e-6, `${w === redrawn ? h.id : '#'} 접근 칸이 멀다`);
    }
  });

  test(`${name}: spawn에서 모든 갈 곳까지 길이 있고, 따라 걸으면 0.5m 안에 닿는다`, () => {
    const from = spawnOf(w);
    destinations(w).forEach((d, k) => {
      const path = findPath(w, from, d);
      assert.ok(path && path.length >= 1, `${label(d, k)}까지 길이 없음`);
      const last = path[path.length - 1];
      assert.equal(last.level, d.level);
      assert.ok(last.x === d.x && last.z === d.z, `${label(d, k)}: 끝점이 갈 곳 자리와 다르다`);
      const { b } = follow(p, from, path);
      assert.equal(b.level, d.level, `${label(d, k)}: 다른 층에서 멈춤`);
      assert.ok(Math.hypot(b.x - d.x, b.z - d.z) < 0.5, `${label(d, k)}: ${Math.hypot(b.x - d.x, b.z - d.z).toFixed(2)}m 남음`);
    });
  });

  test(`${name}: 길 하나는 10ms 안팎(첫 격자 만들기 빼고)`, () => {
    const from = spawnOf(w);
    const ds = destinations(w);
    findPath(w, from, ds[0]);
    // 같은 기계에서 다른 작업이 돌아도 흔들리지 않게 벽시계가 아니라 이 프로세스의 CPU 시간으로 잰다
    const c0 = process.cpuUsage();
    let n = 0;
    for (let r = 0; r < 3; r++) for (const d of ds) { findPath(w, from, d); n++; }
    const c = process.cpuUsage(c0);
    const avg = (c.user + c.system) / 1000 / n;
    assert.ok(avg < 20, `평균 ${avg.toFixed(1)}ms`);
  });
}

test('1층에서 2층으로 가는 길은 계단 경사면을 지난다', () => {
  const p = tuneWorld(redrawn).physics;
  const from = spawnOf(redrawn);
  const path = findPath(redrawn, from, { x: 0, z: -6.4, level: 2 });
  assert.ok(path, '2층 거실까지 길이 없음');
  assert.equal(path[0].level, 1);
  assert.equal(path[path.length - 1].level, 2);
  assert.ok(path.some((q) => inRamp(STAIRS, q.x, q.z)), '경로 점이 계단 위에 없음');
  // 층은 한 번만 바뀐다(1 … 1, 2 … 2)
  const flips = path.slice(1).filter((q, i) => q.level !== path[i].level).length;
  assert.equal(flips, 1);
  const { b, ys } = follow(p, from, path);
  assert.ok(ys.some((y) => y > 0.5 && y < L2Y - 0.5), '걸으며 계단 중간 높이를 지나지 않음');
  assert.equal(b.level, 2);
  assert.ok(Math.hypot(b.x - 0, b.z + 6.4) < 0.5);
});

test('막힌 목표는 가까운 열린 칸으로, 닫힌 방 안은 길이 없다', () => {
  const p = tuneWorld(redrawn).physics;
  const from = spawnOf(redrawn);
  // 거실 소파 한가운데와 현관·거실 사이 벽 속
  for (const [x, z] of [[-3.45, -7.0], [2.5, -3.5]] as const) {
    assert.ok(blocked(p, 1, x, z), '시험 자리가 막혀 있어야 한다');
    const path = findPath(redrawn, from, { x, z, level: 1 });
    assert.ok(path, `(${x}, ${z}) 길 없음`);
    const last = path[path.length - 1];
    assert.ok(walkable(p, 1, last.x, last.z));
    const d = Math.hypot(last.x - x, last.z - z);
    assert.ok(d < 1.0, `${d.toFixed(2)}m 떨어진 칸`);
    // 더 가까운 열린 칸이 마당과 이어져 있지 않거나 없어야 한다: 격자 칸을 훑어 확인
    const k = Math.ceil(d / CELL) + 1;
    for (let i = -k; i <= k; i++) {
      for (let j = -k; j <= k; j++) {
        const cx = Math.round(x / CELL + i) * CELL, cz = Math.round(z / CELL + j) * CELL;
        if (Math.hypot(cx - x, cz - z) >= d - 1e-6 || !walkable(p, 1, cx, cz)) continue;
        assert.equal(findPath(redrawn, { x: cx, z: cz, y: 0, level: 1 }, { x: from.x, z: from.z, level: 1 }), null, '더 가까운 이어진 칸이 있다');
      }
    }
  }
  assert.equal(findPath(redrawn, from, { x: -7, z: -9, level: 1 }), null, '닫힌 빛이 드는 방');
  assert.equal(findPath(redrawn, from, { x: -5, z: -2, level: 2 }), null, '2층 앞쪽 닫힌 방');
  assert.equal(findPath(redrawn, from, { x: 0, z: 40, level: 1 }), null, '마당 밖 먼 곳');
});

test('문패를 열면 그 방 안까지 길이 생긴다(방 장면으로 들어가는 문은 열어도 닫힌 채)', () => {
  assert.equal(findPath(redrawn, spawnOf(redrawn), { x: -7, z: -3, level: 1 }), null, '닫힌 창이 큰 방');
  const open = buildWorld({ atelier: 'open', study: 'open' });
  const path = findPath(open, spawnOf(open), { x: -7, z: -3, level: 1 });
  assert.ok(path, '열린 창이 큰 방까지 길이 없음');
  const { b } = follow(tuneWorld(open).physics, spawnOf(open), path);
  assert.ok(Math.hypot(b.x + 7, b.z + 3) < 0.5);
  if ((open.portals ?? []).some((pt) => pt.slug === 'study')) {
    assert.equal(findPath(open, spawnOf(open), { x: -7, z: -9, level: 1 }), null, '포털 방은 걸어서 못 들어간다');
  }
  const toybox = buildWorld({ toybox: 'open' });
  assert.ok(findPath(toybox, spawnOf(toybox), { x: 7.1, z: -5.35, level: 2 }), '좋아하는 것 방 문 앞까지 길이 있다');
  assert.equal(findPath(toybox, spawnOf(toybox), { x: 7, z: -2, level: 2 }), null, '좋아하는 것 방 문 너머는 길이 없다');
});

test('같은 세계는 한 번만 계산하고, 손질한 세계를 넣어도 결과가 같다', () => {
  const a = destinations(redrawn);
  assert.deepEqual(destinations(tuneWorld(redrawn)), a);
  assert.deepEqual(destinations(buildWorld({})), a, '같은 입력이면 같은 목록');
  a[0].x = 999;
  assert.notEqual(destinations(redrawn)[0].x, 999, '돌려준 목록을 고쳐도 캐시는 그대로');
  const from = spawnOf(redrawn);
  const to = { x: 0, z: -9.6, level: 1 as Level };
  assert.deepEqual(findPath(redrawn, from, to), findPath(tuneWorld(redrawn), from, to));
});

test('꺾인(U자) 계단도 아래 줄기 → 계단참 → 위 줄기로 올라 2층에 닿는다', () => {
  // walk.test.ts의 U자 계단과 같은 물리. 바닥판만 둘러 둔 작은 세계
  const physics: Physics = {
    floor2: 2.9,
    boxes: [{ x1: 1.0, x2: 1.1, z1: 1.0, z2: 4.0, level: 0, tag: 'rail' }],
    ramps: [
      { x1: 1.1, x2: 2.1, z1: 1.0, z2: 4.0, axis: 'z', y0: 2.05, y1: 0 },
      { x1: 0.0, x2: 2.1, z1: 0.0, z2: 1.0, axis: 'z', y0: 2.05, y1: 2.05 },
      { x1: 0.0, x2: 1.0, z1: 1.0, z2: 2.25, axis: 'z', y0: 2.05, y1: 2.9 },
    ],
  };
  const u: HouseWorld = {
    kind: 'redrawn', floor2: 2.9, house: { x1: -1, x2: 3, z1: -1, z2: 6 },
    floors: [{ level: 1, x1: 1.1, x2: 3, z1: 4, z2: 6, mat: 'oak' }, { level: 2, x1: -1, x2: 1, z1: 2.25, z2: 4, mat: 'oak' }],
    walls: [], headers: [], doors: [], ceilings: [], windows: [], furniture: [], props: [], zones: [], hotspots: [],
    physics, spawn: { x: 1.6, z: 5.0, yaw: 0 },
  };
  const from: NavPoint = { x: 1.6, z: 5.0, y: 0, level: 1 };
  const path = findPath(u, from, { x: 0.5, z: 3.2, level: 2 });
  assert.ok(path, 'U자 계단 길이 없음');
  const { b, ys } = follow(physics, from, path);
  assert.equal(b.level, 2);
  assert.ok(Math.abs(b.y - 2.9) < 1e-9);
  assert.ok(Math.hypot(b.x - 0.5, b.z - 3.2) < 0.5);
  assert.ok(ys.some((y) => Math.abs(y - 2.05) < 1e-9), '계단참을 지나지 않음');
});

// 방 장면(ROOMS 작업자의 room-worlds.ts)이 있으면: spawn에서 나가기·놀이 자리까지 모두 길이 있다
const roomFile = new URL('../../src/content/room-worlds.ts', import.meta.url);
test('방 장면: spawn에서 나가기와 놀이 자리까지 걸어서 닿는다', { skip: !existsSync(roomFile) && 'room-worlds.ts 없음' }, async (t) => {
  const { ROOM_SCENES, buildRoomWorld } = await import(roomFile.href);
  if (typeof buildRoomWorld !== 'function') return t.skip('buildRoomWorld가 아직 없다');
  for (const slug of ROOM_SCENES as string[]) {
    const w = buildRoomWorld(slug) as HouseWorld;
    const ds = destinations(w);
    assert.ok(ds.some((d) => d.kind === 'exit'), `${slug}: 나가기 없음`);
    for (const g of w.room?.games ?? []) assert.ok(ds.some((d) => d.kind === 'game' && w.hotspots.find((h) => h.id === d.id)?.game === g), `${slug}: 놀이 ${g} 자리 없음`);
    const from = spawnOf(w);
    const p = tuneWorld(w).physics;
    for (const d of ds) {
      const path = findPath(w, from, d);
      assert.ok(path, `${slug}: ${d.id}까지 길이 없음`);
      const { b } = follow(p, from, path);
      assert.ok(Math.hypot(b.x - d.x, b.z - d.z) < 0.5, `${slug}: ${d.id}에 닿지 못함`);
    }
  }
});

test('첫 점은 몸 자리 그대로, 계단 한가운데에서 출발해도 내려가는 길이 있다', () => {
  const from = spawnOf(redrawn);
  const path = findPath(redrawn, from, { x: 0, z: -9.6, level: 1 });
  assert.ok(path);
  assert.deepEqual(path[0], from, '격자 칸으로 한 뼘 되돌아가지 않는다');
  const p = tuneWorld(redrawn).physics;
  // 계단 중간(높이로 2층 쪽)에 선 몸
  let b: Body = { x: 9.0, z: -0.8, y: 0, level: 1 };
  for (let i = 0; i < 22; i++) b = step(p, b, 0, -0.1);
  assert.ok(b.y > 1 && b.y < L2Y - 1, `계단 중간 높이 ${b.y}`);
  const down = findPath(redrawn, b, { x: 6, z: 7, level: 1 });
  assert.ok(down, '계단 중간에서 마당까지 길이 없음');
  const { b: end } = follow(p, b, down);
  assert.equal(end.level, 1);
  assert.ok(Math.hypot(end.x - 6, end.z - 7) < 1.2, '석등 앞');
});
