// 자동 걷기 검사: 화면과 같은 부품(findPath → pathStep → step, 모퉁이는 clearLine으로 물어보고 돈다)으로
// 갈 곳과 갈 곳 사이를 모두 걸어 본다. 문설주·벽 끝에 걸려 멈추거나(stuck) 한참 멈칫하면 안 된다.
// 다시 그린 집, 걷기용으로 손질한 집, 그리고 실제 집 JSON(HOUSE_WORLD_JSON)이 있으면 그것도 돈다(좌표·이름은 찍지 않는다).
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
const { destinations, findPath } = await import('../../src/walk/nav.ts');
const { clearLine, step } = await import('../../src/walk/physics.ts');
const { angleDiff, pathStep, startPath, turnStep } = await import('../../src/walk/avatar.ts');
const { stageHouse } = await import('../../src/walk/staging.ts');
const { tuneWorld } = await import('../../src/walk/tune.ts');
const { ROOM_SCENES, buildRoomWorld } = await import('../../src/content/room-worlds.ts');
type Body = import('../../src/walk/physics.ts').Body;
type NavPoint = import('../../src/walk/nav.ts').NavPoint;

const realPath = process.env.HOUSE_WORLD_JSON || process.env.JY_HOUSE_WORLD_JSON;
const real: HouseWorld | null = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;
const worlds: Array<[string, HouseWorld]> = [
  ['다시 그린 집', buildWorld({})],
  ['다시 그린 집(손질)', stageHouse({ ...structuredClone(buildWorld({})), kind: 'real' }, 'wedding')],
  ...(real ? [['실제 집(손질)', stageHouse(structuredClone(real), 'wedding')] as [string, HouseWorld]] : []),
];

const WALK = 1.6;
/** 걷는 빠르기로 한 프레임에 가는 거리의 이 몫도 못 가면 멈칫한 프레임으로 센다 */
const SLOW = 0.3;

/** 길 하나를 fps로 걸어 본다: 끝난 까닭, 가장 길게 멈칫한 시간(초) */
function autoWalk(w: HouseWorld, from: NavPoint, to: { x: number; z: number; level: 1 | 2 }, fps: number) {
  const p = tuneWorld(w).physics;
  const path = findPath(w, from, to);
  if (!path) return { done: 'nopath' as const, stall: 0 };
  let body: Body = { ...from };
  const run = startPath(path.map((q: NavPoint) => ({ x: q.x, z: q.z, level: q.level, y: q.y })));
  const dt = 1 / fps;
  let stall = 0, worst = 0;
  for (let i = 0; i < 240 * fps; i++) {
    const r = pathStep(run, body, dt, WALK, (b: Body, dx: number, dz: number) => step(p, b, dx, dz), (b: Body, q: { x: number; z: number; y?: number }) => clearLine(p, b, q.x, q.z, undefined, undefined, q.y));
    const moved = Math.hypot(r.body.x - body.x, r.body.z - body.z);
    stall = r.heading !== null && moved < WALK * dt * SLOW ? stall + dt : 0;
    worst = Math.max(worst, stall);
    body = r.body;
    if (r.done) return { done: r.done, stall: worst };
  }
  return { done: 'timeout' as const, stall: worst };
}

for (const [name, w] of worlds) {
  const ds = destinations(w);
  const starts: NavPoint[] = [
    { x: tuneWorld(w).spawn.x, z: tuneWorld(w).spawn.z, y: 0, level: 1 },
    ...ds.map((d: { x: number; z: number; level: 1 | 2 }) => ({ x: d.x, z: d.z, y: d.level === 2 ? w.floor2 : 0, level: d.level })),
  ];

  test(`${name}: 갈 곳 사이를 모두 걸어서 닿는다(멈추지도 한참 멈칫하지도 않는다)`, () => {
    const bad: string[] = [];
    let pairs = 0;
    starts.forEach((from, i) => {
      ds.forEach((to: { x: number; z: number; level: 1 | 2 }, j: number) => {
        if (i === j + 1) return;
        pairs++;
        const r = autoWalk(w, from, to, 60);
        if (r.done !== 'arrive' || r.stall > 0.1) bad.push(`#${i}→#${j}: ${r.done}, 멈칫 ${r.stall.toFixed(2)}초`);
      });
    });
    assert.ok(pairs >= ds.length * ds.length, `쌍 ${pairs}`);
    assert.deepEqual(bad.slice(0, 8), [], `${pairs}쌍 가운데 ${bad.length}쌍이 걸렸다`);
  });

  test(`${name}: 느린 화면(30·15fps)에서도 처음 자리에서 모든 갈 곳에 닿는다`, () => {
    for (const fps of [30, 15]) {
      const bad = ds
        .map((to: { x: number; z: number; level: 1 | 2 }, j: number) => ({ j, r: autoWalk(w, starts[0], to, fps) }))
        .filter(({ r }: { r: { done: string; stall: number } }) => r.done !== 'arrive' || r.stall > 0.25)
        .map(({ j, r }: { j: number; r: { done: string; stall: number } }) => `#${j}: ${r.done}, 멈칫 ${r.stall.toFixed(2)}초`);
      assert.deepEqual(bad, [], `${fps}fps`);
    }
  });
}

// 방 장면은 가구가 구석을 만든다(옷장·책상·의자 사이, 악기 뒤): 갈 곳 사이만이 아니라 방 안 어디에 서 있어도 닿아야 한다.
// 처음 자리에서 실제 걸음(step)으로 닿는 자리를 0.1m 간격으로 모두 시작점으로 삼는다.
test('방 장면: 방 안 어디에 서 있어도 모든 갈 곳까지 길이 있고, 걸려 멈추지 않고 닿는다', () => {
  const GAP = 0.1, OFF = 0.013;
  const bad: string[] = [];
  let walks = 0;
  for (const slug of ROOM_SCENES as string[]) {
    const w = buildRoomWorld(slug) as HouseWorld;
    const t = tuneWorld(w);
    const key = (x: number, z: number) => `${Math.round(x / GAP)},${Math.round(z / GAP)}`;
    const first = { x: t.spawn.x + OFF, z: t.spawn.z + OFF };
    const seen = new Map<string, { x: number; z: number }>([[key(first.x, first.z), first]]);
    const todo = [first];
    while (todo.length) {
      const n = todo.pop()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = step(t.physics, { x: n.x, z: n.z, y: 0, level: 1 }, dx * GAP, dz * GAP);
        // 벽에 밀려 비킨 걸음은 세지 않는다(가려던 칸에 그대로 닿았을 때만)
        if (Math.hypot(m.x - n.x - dx * GAP, m.z - n.z - dz * GAP) > 1e-6) continue;
        const k = key(m.x, m.z);
        if (!seen.has(k)) { seen.set(k, { x: m.x, z: m.z }); todo.push({ x: m.x, z: m.z }); }
      }
    }
    assert.ok(seen.size > 500, `${slug}: 시작점이 ${seen.size}개뿐`);
    for (const d of destinations(w)) {
      let n = 0;
      for (const s of seen.values()) {
        walks++;
        const r = autoWalk(w, { x: s.x, z: s.z, y: 0, level: 1 }, d, 60);
        if (r.done !== 'arrive' || r.stall > 0.1) n++;
      }
      if (n) bad.push(`${slug} → ${d.id}: ${seen.size}곳 가운데 ${n}곳`);
    }
  }
  assert.ok(walks > 10000, `걸어 본 길 ${walks}`);
  assert.deepEqual(bad, [], '방 안에 길이 없거나 걸려 멈추는 자리가 있다');
});

test('모퉁이는 곧게 갈 수 있을 때만 미리 돈다', () => {
  // 벽 끝(0,0)을 돌아가는 길: 꺾이는 점이 벽 끝 바로 옆이라, 0.35m 앞에서 미리 꺾으면 벽 끝을 스친다
  const wall = { x1: 0, x2: 0.12, z1: -5, z2: 0, level: 1 as const, tag: 'wall' };
  const p = { floor2: 2.9, ramps: [], boxes: [wall] };
  const pts = [{ x: -1.5, z: -2, level: 1 as const }, { x: -0.3, z: 0.35, level: 1 as const }, { x: 0.45, z: 0.35, level: 1 as const }, { x: 1.5, z: -2, level: 1 as const }];
  const go = (useClear: boolean) => {
    let body: Body = { x: -1.5, z: -2, y: 0, level: 1 };
    const run = startPath(pts);
    let turnedAt = Infinity, stall = 0, worst = 0;
    for (let i = 0; i < 60 * 20; i++) {
      const before = run.i;
      const r = pathStep(run, body, 1 / 60, WALK, (b: Body, dx: number, dz: number) => step(p, b, dx, dz), useClear ? (b: Body, q: { x: number; z: number }) => clearLine(p, b, q.x, q.z) : undefined);
      if (before <= 1 && run.i >= 2 && turnedAt === Infinity) turnedAt = Math.hypot(body.x - pts[1].x, body.z - pts[1].z);
      stall = r.heading !== null && Math.hypot(r.body.x - body.x, r.body.z - body.z) < (WALK / 60) * SLOW ? stall + 1 : 0;
      worst = Math.max(worst, stall);
      body = r.body;
      if (r.done) return { done: r.done, turnedAt, worst };
    }
    return { done: 'timeout', turnedAt, worst };
  };
  const careful = go(true);
  assert.equal(careful.done, 'arrive');
  assert.equal(careful.worst, 0, '멈칫하지 않는다');
  // 다음 점이 벽 끝에 가려 있는 동안은 꺾지 않는다(0.35m 앞에서 미리 꺾지 않고 더 다가간 뒤)
  assert.ok(careful.turnedAt < 0.3, `꺾은 자리가 점에서 ${careful.turnedAt.toFixed(2)}m`);
  // 물어보지 않으면 예전처럼 0.35m 앞에서 꺾는다(둥근 몸이라 그래도 벽 끝을 돌아 나간다)
  const eager = go(false);
  assert.equal(eager.done, 'arrive');
  assert.ok(eager.turnedAt > 0.3, `미리 꺾은 자리 ${eager.turnedAt.toFixed(2)}m`);
});

test('도착해서 돌기: 가까운 쪽으로 돌아 목적지 방향에 맞추고, 큰 각도 한 프레임에 확 돌지 않는다', () => {
  for (const [from, to] of [[0, 3], [0.2, -2.9], [3.0, -3.0], [1, 1.01], [-6, 0.5]] as const) {
    let a = from, frames = 0, most = 0, done = false;
    const side = Math.sign(angleDiff(from, to));
    while (!done && frames < 600) {
      const t = turnStep(a, to, 1 / 60);
      most = Math.max(most, Math.abs(t.a - a));
      // 늘 처음 고른 쪽으로만 돈다(지나쳐서 되돌아오지 않는다)
      if (!t.done) assert.equal(Math.sign(t.a - a), side, `${from}→${to}`);
      a = t.a;
      done = t.done;
      frames++;
    }
    assert.ok(done, `${from}→${to}: 다 돌지 못함`);
    assert.ok(Math.abs(angleDiff(a, to)) < 1e-9, '목적지 방향에 맞는다');
    assert.ok(Math.abs(a - from) <= Math.PI + 1e-9, '가까운 쪽으로 돈다');
    assert.ok(most <= 2.5 / 60 + 1e-9 || frames === 1, `한 프레임에 ${most.toFixed(3)}rad`);
    assert.ok(frames <= 120, `${frames}프레임(2초 안에 끝난다)`);
  }
  // 줄인 움직임(dt가 아주 큼)은 한 번에 맞춘다
  assert.deepEqual(turnStep(0, 2, Infinity), { a: 2, done: true });
});
