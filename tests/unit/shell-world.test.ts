// 실측 1층 시험 지도: 껍데기 데이터 → 걷기 세계 변환(지어낸 두 칸짜리 집으로 본다), 관리자 전용 관문, 화면 쪽 지도 고르기 기억.
// 지어낸 집의 크기는 모두 둥근 가짜 값이다. HOUSE_SHELL_JSON이 실제 껍데기 파일을 가리키면 그것도 걸어 본다(좌표·이름은 찍지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as nodeModule from 'node:module';
import type { HouseWorld, Level } from '../../src/walk/types.ts';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const { shellToWorld, parseShell, isShellWorld } = await import('../../src/lib/shell-world.ts');
const { loopbackHost, shellAllowed, shellConfigured, shellHouse, shellUsers } = await import('../../src/lib/house-shell.ts');
const { blocked, step, levelOf } = await import('../../src/walk/physics.ts');
const { tuneWorld } = await import('../../src/walk/tune.ts');
const { lookFor } = await import('../../src/walk/scenery.ts');
const walkMap = await import('../../src/components/walk/walk-map.ts');

// ───────── 지어낸 집(원본 단위, 평면 x 오른쪽·y 아래)
// 앞쪽 큰 방(홀)과 오른쪽 부엌, 홀 뒤로 계단실과 닫힌 방 하나. 바깥은 앞마당 하나.
type P = { x: number; y: number; w: number; h: number };
const R = (x: number, y: number, w: number, h: number): P => ({ x, y, w, h });
function fixture(extra: Record<string, unknown> = {}) {
  return {
    format: 'example-house-shell/0.1',
    source: { units: 'cm' },
    heights: { floor2: 300, doorHead: 200, archCrown: 220, defaultCeiling1F: 230, stairSteps: 16 },
    rooms: [
      { id: 'hall', name: '홀', kind: 'room', ...R(0, 0, 400, 300), ceiling: { value: 260, status: 'measured' } },
      { id: 'kitchen', name: '부엌', kind: 'kitchen', ...R(420, -420, 300, 720), ceiling: { value: 250, status: 'measured' } },
      { id: 'stair', name: '층계', kind: 'circulation', ...R(0, -420, 200, 400), ceiling: { value: null, status: 'open-to-2F' } },
    ],
    neighbours: [
      { ref: 'private-1', kind: 'private-mass', ...R(220, -420, 180, 400) },
      { ref: 'outdoor:porch', kind: 'outdoor', ...R(-30, 330, 780, 170) },
    ],
    walls: [
      { type: 'band', ...R(0, -20, 400, 20) }, // 홀 | 계단실·닫힌 방
      { type: 'band', ...R(200, -420, 20, 400) }, // 계단실 | 닫힌 방
      { type: 'band', ...R(400, 0, 20, 300) }, // 홀 | 부엌
      { type: 'band', ...R(400, -420, 20, 400) }, // 닫힌 방 | 부엌
      { type: 'corner', ...R(400, -20, 20, 20) },
      { type: 'outer', ...R(-30, -450, 30, 780) },
      { type: 'outer', ...R(720, -450, 30, 780) },
      { type: 'outer', ...R(0, -450, 720, 30) },
      { type: 'outer', ...R(0, 300, 720, 30) },
    ],
    voids: [],
    openings: [
      { id: 'a', type: 'door', ...R(40, -20, 100, 20), sill: 0, head: 200 }, // 홀 ↔ 계단실(열림)
      { id: 'b', type: 'passage', ...R(400, 100, 20, 120), sill: 0, head: 220 }, // 홀 ↔ 부엌(열림)
      { id: 'c', type: 'door', ...R(260, -20, 80, 20), sill: 0, head: 200 }, // 홀 ↔ 닫힌 방(닫힘)
      { id: 'd', type: 'door', ...R(150, 300, 100, 30), sill: 0, head: 200 }, // 앞문(닫힘)
      { id: 'e', type: 'window', ...R(720, -200, 30, 140), sill: 80, head: 220 }, // 부엌 창
      { id: 'f', type: 'window', ...R(100, 300, 200, 30), sill: 20, head: 200 }, // 앞문과 겹치는 홀 창
    ],
    stairOpening2F: { over: 'stair', ...R(0, -420, 200, 400) },
    // 읽지 않는 메모(내려보내지 않는다)
    pending: [{ id: 'Q1', ask: '지어낸 질문', why: '시험' }],
    ...extra,
  };
}
// U자 계단 덩이: 먼 끝 계단참(높이 180), 문 쪽 줄기(바닥 → 계단참), 다른 줄기(계단참 → 2층), 2층 도착 바닥과 난간
// (두 줄기 사이는 두 층 모두 막는 난간, 그 뒤로 2층 도착 바닥 가장자리 난간)
const U_STAIR = {
  flights: [
    { part: 'lower', ...R(100, -320, 100, 230), along: 'y', from: 180, to: 0, steps: 10 },
    { part: 'landing', ...R(0, -420, 200, 100), along: 'y', from: 180, to: 180 },
    { part: 'upper', ...R(0, -320, 100, 120), along: 'y', from: 180, to: 300, steps: 6 },
  ],
  arrival: R(0, -200, 100, 180),
  rails: [{ ...R(97, -290, 6, 200), level: 0 }, { ...R(97, -90, 6, 70), level: 2 }],
};

const world = (extra?: Record<string, unknown>): HouseWorld => {
  const w = shellToWorld(fixture(extra));
  assert.ok(w, '지어지지 않음');
  return w;
};
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) <= eps;
// 세계 좌표: x는 집 가운데가 0(지어낸 집은 원본 360), z는 집 앞 끝(원본 330)이 0
const X = (v: number) => (v - 360) / 100;
const Z = (v: number) => (v - 330) / 100;

test('모양: 실측 지도 종류, 가구·소품·살피기 없이 엔진이 기대하는 칸이 다 있다', () => {
  const w = world();
  assert.equal(w.kind, 'shell');
  assert.ok(isShellWorld(w));
  assert.deepEqual([w.furniture.length, w.props.length, w.hotspots.length], [0, 0, 0]);
  assert.equal(w.floor2, 3);
  // 메모·원본 id는 내려보내지 않는다
  const json = JSON.stringify(w);
  for (const word of ['지어낸 질문', 'private-1', 'porch', 'kitchen', 'hall', 'Q1']) assert.ok(!json.includes(word), word);
  // 실측 지도는 전망·바깥 소품 없이 그린다
  assert.deepEqual([lookFor(w).scenery, lookFor(w).props], [false, false]);
  // 걷기 손질을 해도 그대로(가구가 없다)
  assert.deepEqual(tuneWorld(w).physics.boxes.length, w.physics.boxes.length);
});

test('문·통로는 벽을 끊고 그 위에 인방을 얹는다(창은 벽을 끊지 않는다)', () => {
  const w = world();
  // 홀 | 계단실·닫힌 방 벽(원본 x 0~400): 열린 문(40~140)과 닫힌 문(260~340) 자리를 빼고 세 조각
  const line = w.walls.filter((s) => s.axis === 'x' && near(s.box.z1, Z(-20)) && near(s.box.z2, Z(0)) && s.box.x1 >= X(0) - 1e-6 && s.box.x2 <= X(400) + 1e-6);
  assert.deepEqual(line.map((s) => [s.box.x1, s.box.x2]).sort((a, b) => a[0] - b[0]), [[X(0), X(40)], [X(140), X(260)], [X(340), X(400)]]);
  // 계단실(위로 트임)에 닿은 벽은 2층 높이 위 덮개 천장까지(2층 바닥 + 1층 기본 천장)
  for (const s of line) assert.ok(near(s.height, 3 + 2.3), `벽 높이 ${s.height}`);
  // 인방: 문 머리부터 벽 꼭대기까지, 문 자리 그대로
  const head = w.headers.find((h) => near(h.box.x1, X(40)) && near(h.box.x2, X(140)));
  assert.ok(head, '열린 문 인방 없음');
  assert.ok(near(head.baseY, 2) && near(head.height, 5.3 - 2));
  // 아치 통로(홀 | 부엌, 머리 2.2): 홀 2.6과 부엌 2.5 가운데 높은 천장까지
  const arch = w.headers.find((h) => h.axis === 'z' && near(h.box.z1, Z(100)) && near(h.box.z2, Z(220)));
  assert.ok(arch && near(arch.baseY, 2.2) && near(arch.height, 0.4));
  // 열린 문 자리에는 막는 상자가 없고 문턱 바닥이 있다
  const open = { x: X(90), z: Z(-10) };
  assert.equal(blocked(w.physics, 1, open.x, open.z, 0.05), false);
  assert.ok(w.floors.some((f) => f.level === 1 && open.x > f.x1 && open.x < f.x2 && open.z > f.z1 && open.z < f.z2));
  // 창 자리는 벽이 그대로(엔진이 창턱 아래·창 위 조각으로 나눈다)
  const right = w.walls.filter((s) => s.axis === 'z' && near(s.box.x1, X(720)));
  assert.deepEqual(right.map((s) => [s.box.z1, s.box.z2]), [[Z(-450), Z(330)]]);
});

test('창: 창턱·창 머리 높이, 벽 가운데 선, 같은 벽의 문 자리와 겹치는 몫은 뺀다', () => {
  const w = world();
  const kitchen = w.windows.filter((v) => v.axis === 'z');
  assert.equal(kitchen.length, 1);
  assert.deepEqual([kitchen[0].at, kitchen[0].from, kitchen[0].to, kitchen[0].sill, kitchen[0].top], [X(735), Z(-200), Z(-60), 0.8, 2.2]);
  // 창턱 아래 조각과 창 위 조각이 남는다: 창턱 > 0, 창 머리 < 벽 높이
  const host = w.walls.find((s) => s.axis === 'z' && near(s.box.x1, X(720)));
  assert.ok(host && kitchen[0].sill > 0 && kitchen[0].top < host.height);
  // 앞문(150~250)과 겹치는 홀 창(100~300)은 문 양옆 두 칸으로
  const front = w.windows.filter((v) => v.axis === 'x').map((v) => [v.from, v.to]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(front, [[X(100), X(150)], [X(250), X(300)]]);
  for (const v of w.windows) assert.ok(v.top > v.sill);
});

test('닫는 문: 가족 방 덩어리와 바깥으로 나가는 문은 닫힌 문짝과 막힘 상자, 덩어리는 막힌 칸', () => {
  const w = world();
  assert.equal(w.doors.length, 2);
  for (const d of w.doors) assert.equal(d.closed, true);
  const toRoom = w.doors.find((d) => near(d.box.x1, X(260)));
  const front = w.doors.find((d) => near(d.box.x1, X(150)));
  assert.ok(toRoom && front);
  assert.equal(toRoom.label, '닫힌 방');
  assert.equal(front.label, '');
  assert.ok(near(toRoom.height, 2));
  for (const d of [toRoom, front]) assert.ok(blocked(w.physics, 1, (d.box.x1 + d.box.x2) / 2, (d.box.z1 + d.box.z2) / 2, 0.05));
  // 닫힌 방 안쪽은 이름 없는 덩어리: 막혀 있고 구역 이름이 없다
  const mid = { x: X(310), z: Z(-220) };
  assert.ok(blocked(w.physics, 1, mid.x, mid.z, 0.05));
  assert.ok(!w.zones.some((zn) => mid.x > zn.x1 && mid.x < zn.x2 && mid.z > zn.z1 && mid.z < zn.z2));
});

test('바닥·천장: 방마다 바닥(부엌은 타일)과 그 방 천장, 계단실은 1층 천장 없이 2층 높이 위 덮개', () => {
  const w = world();
  const at = (x: number, z: number, lv: Level) => w.ceilings.filter((c) => c.level === lv && x > c.x1 && x < c.x2 && z > c.z1 && z < c.z2);
  assert.deepEqual(at(X(200), Z(150), 1).map((c) => c.y), [2.6]);
  assert.deepEqual(at(X(570), Z(0), 1).map((c) => c.y), [2.5]);
  assert.deepEqual(at(X(100), Z(-200), 1), []);
  assert.deepEqual(at(X(100), Z(-200), 2).map((c) => c.y), [5.3]);
  assert.ok(w.floors.some((f) => f.mat === 'tile' && near(f.x1, X(420))));
  // 구역 이름은 데이터의 방 이름(문턱도 한쪽 방 이름으로)
  assert.deepEqual([...new Set(w.zones.filter((z) => z.level === 1).map((z) => z.name))].sort(), ['부엌', '층계', '홀']);
});

test('들어오는 자리: 앞문 안쪽에서 집 안을 본다', () => {
  const w = world();
  assert.ok(!blocked(w.physics, 1, w.spawn.x, w.spawn.z));
  // 앞문 가운데 줄, 홀 안
  assert.ok(near(w.spawn.x, X(200)));
  assert.ok(w.spawn.z < Z(300) && w.spawn.z > Z(0));
  // 앞쪽 = (-sin yaw, -cos yaw): 집 안(z가 작아지는 쪽)
  assert.ok(near(w.spawn.yaw, 0));
});

/**
 * 몸이 실제로 갈 수 있는 곳을 걷기 물리(step)로 훑는다: 들어오는 자리에서 0.1m 칸마다 네 쪽으로 걸어 보고, 간 곳의 높이까지 기억한다.
 * 돌려주는 것: 다다른 자리 목록(x, z, y)
 */
function explore(w: HouseWorld, limit = 400_000) {
  const g = 0.1;
  const p = w.physics;
  const start = { x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 as Level };
  const key = (x: number, z: number, y: number) => `${Math.round((x - start.x) / g)},${Math.round((z - start.z) / g)},${Math.round(y / 0.2)}`;
  const seen = new Map<string, typeof start>([[key(start.x, start.z, 0), start]]);
  const queue = [start];
  while (queue.length && seen.size < limit) {
    const b = queue.pop()!;
    for (const [dx, dz] of [[g, 0], [-g, 0], [0, g], [0, -g]]) {
      const nb = step(p, b, dx, dz);
      if (Math.abs(nb.x - b.x - dx) > 0.01 || Math.abs(nb.z - b.z - dz) > 0.01) continue;
      const k = key(nb.x, nb.z, nb.y);
      if (seen.has(k)) continue;
      const s = { x: b.x + dx, z: b.z + dz, y: nb.y, level: levelOf(p, nb.y) };
      seen.set(k, s);
      queue.push(s);
    }
  }
  assert.ok(seen.size < limit, '걸을 수 있는 곳이 끝없이 넓다(집 밖으로 샌다)');
  return [...seen.values()];
}

function walkChecks(w: HouseWorld, label: string) {
  const reach = explore(w);
  const H = w.house;
  for (const s of reach) {
    assert.ok(s.x > H.x1 && s.x < H.x2 && s.z > H.z1 && s.z < H.z2, `${label}: 집 밖으로 나감`);
  }
  // 2층 높이는 계단실 안에서만, 꼭대기(2층 바닥)까지 오를 수 있다
  const up = reach.filter((s) => s.y > w.floor2 / 2);
  assert.ok(up.length > 0, `${label}: 계단을 오르지 못함`);
  assert.ok(up.some((s) => near(s.y, w.floor2, 0.02)), `${label}: 2층 도착 바닥에 닿지 못함`);
  const stairZones = w.zones.filter((z) => z.level === 2);
  for (const s of up) assert.ok(stairZones.some((z) => s.x > z.x1 - 1e-6 && s.x < z.x2 + 1e-6 && s.z > z.z1 - 1e-6 && s.z < z.z2 + 1e-6), `${label}: 2층 높이에서 계단실 밖`);
  return reach;
}

test('곧은 계단(계단 덩이가 없을 때): 열린 문 쪽에서 맞은편으로 2층 높이까지 오르고, 꼭대기 밖으로는 못 나간다', () => {
  const w = world();
  assert.equal(w.physics.ramps.length, 1);
  const r = w.physics.ramps[0];
  assert.equal(r.axis, 'z');
  // 문은 계단실의 집 앞쪽 변(원본 y -20)에 있다: 그쪽(z가 큰 끝)이 바닥, 먼 끝이 2층 바닥
  assert.deepEqual([r.y0, r.y1], [3, 0]);
  assert.equal(r.steps, 16);
  assert.ok(r.z2 < Z(-20) && r.z1 > Z(-420));
  assert.ok(w.floors.some((f) => f.level === 2), '2층 도착 바닥 없음');
  walkChecks(w, '곧은 계단');
});

test('계단 덩이(U자): 줄기·계단참·난간 그대로, 높은 곳 밑은 1층에서 막고, 2층 높이는 도착 바닥까지만', () => {
  const w = world({ stair: U_STAIR });
  assert.equal(w.physics.ramps.length, 3);
  const lower = w.physics.ramps.find((r) => near(r.x1, X(100)) && r.y1 === 0);
  assert.ok(lower && near(lower.y0, 1.8) && lower.steps === 10);
  // 계단참과 위 줄기 밑(한 층 높이의 반보다 높다)은 1층에서 막는다. 아래 줄기 밑은 난간이 막는다
  assert.ok(blocked(w.physics, 1, X(50), Z(-380), 0.05), '계단참 밑');
  assert.ok(blocked(w.physics, 1, X(50), Z(-250), 0.05), '위 줄기 밑');
  assert.equal(blocked(w.physics, 1, X(150), Z(-200), 0.05), false, '아래 줄기는 막지 않는다');
  assert.deepEqual(w.physics.boxes.filter((b) => b.tag === 'rail').map((b) => b.level).sort(), [0, 2]);
  // 2층 전용 난간은 낮은 벽으로도 보인다
  assert.ok(w.walls.some((s) => s.box.level === 2 && near(s.baseY, 3) && near(s.height, 0.9)));
  walkChecks(w, 'U자 계단');
});

test('2층 높이 가장자리: 난간이 없으면 막는 상자를 스스로 단다', () => {
  // 2층 난간을 빼도 도착 바닥 옆 계단 구멍으로 걸어 나가지 못한다
  const w = world({ stair: { ...U_STAIR, rails: [U_STAIR.rails[0]] } });
  assert.ok(w.physics.boxes.some((b) => b.level === 2 && b.tag === 'rail'), '스스로 단 2층 난간 없음');
  walkChecks(w, '난간 없는 U자 계단');
});

test('깨진 데이터는 null: 모양·단위·형식·범위가 틀리면 고치려 들지 않는다', () => {
  const ok = fixture();
  assert.ok(shellToWorld(ok));
  const bad: unknown[] = [
    null, 'x', [], {},
    { ...ok, format: 'something-else/1' },
    { ...ok, source: { units: 'm' } },
    { ...ok, heights: { ...ok.heights, floor2: 'high' } },
    { ...ok, heights: { ...ok.heights, defaultCeiling1F: 99999 } },
    { ...ok, rooms: [] },
    { ...ok, rooms: [{ ...ok.rooms[0], w: -1 }] },
    { ...ok, rooms: [{ ...ok.rooms[0], id: 5 }] },
    { ...ok, walls: 'none' },
    { ...ok, walls: [{ type: 'band', x: 0, y: 0, w: Number.NaN, h: 1 }] },
    { ...ok, openings: [{ ...ok.openings[0], head: -3 }] },
    { ...ok, openings: [{ ...ok.openings[4], sill: 300, head: 200 }] },
    { ...ok, stair: { flights: [] } },
    { ...ok, stair: { ...U_STAIR, flights: [{ ...U_STAIR.flights[0], along: 'up' }] } },
    { ...ok, stair: { ...U_STAIR, arrival: { x: 0 } } },
  ];
  for (const b of bad) assert.equal(shellToWorld(b), null, JSON.stringify(b)?.slice(0, 80));
  // 모르는 종류의 개구부는 건너뛴다(다음 형식이 새 종류를 더해도 깨지지 않게)
  assert.ok(shellToWorld({ ...ok, openings: [...ok.openings, { id: 'z', type: 'skylight', ...R(0, 0, 10, 10) }] }));
  assert.equal(parseShell({ ...ok, rooms: Array.from({ length: 3000 }, () => ok.rooms[0]) }), null);
});

test('관문: 실측 지도는 목록에 있는 관리자(또는 이 컴퓨터 미리보기)만, 라우트는 확인한 뒤에 데이터를 읽는다', async () => {
  const users = new Set(['u-1']);
  for (const r of ['public', 'visitor', 'guest', 'family'] as const) assert.equal(shellAllowed({ role: r, sub: 'u-1', preview: false, users }), false, r);
  assert.equal(shellAllowed({ role: 'admin', sub: 'u-1', preview: false, users }), true);
  assert.equal(shellAllowed({ role: 'admin', sub: 'u-2', preview: false, users }), false, '목록에 없는 관리자는 못 연다');
  assert.equal(shellAllowed({ role: 'admin', sub: null, preview: false, users }), false);
  assert.equal(shellAllowed({ role: 'admin', sub: 'u-1', preview: false, users: new Set() }), false, '목록이 비면 아무도');
  assert.equal(shellAllowed({ role: 'guest', sub: null, preview: true, users: new Set() }), true, '이 컴퓨터 미리보기');
  assert.deepEqual([...shellUsers({ HOUSE_SHELL_USERS: ' u-1, u-2  u-3,,' })], ['u-1', 'u-2', 'u-3']);
  assert.equal(shellUsers({}).size, 0);
  assert.equal(shellConfigured({}), false);
  for (const h of ['127.0.0.1:3373', 'localhost:3000', '[::1]:3100', 'LOCALHOST']) assert.equal(loopbackHost(h), true, h);
  for (const h of ['evil.example:3373', '127.0.0.1.evil.example', 'localhost.evil', '', null, undefined]) assert.equal(loopbackHost(h), false, String(h));
  assert.equal(shellConfigured({ HOUSE_SHELL_GZ: ' x ' }), true);
  assert.equal(shellConfigured({ HOUSE_SHELL_FILE: '/x.json' }), false, '미리보기가 아니면 파일 설정은 보지 않는다');
  const route = readFileSync(new URL('../../src/app/api/house-shell/route.ts', import.meta.url), 'utf8');
  const body = route.slice(route.indexOf('export async function GET'));
  const at = ['await connection()', 'getViewer()', 'canOpenShell(viewer.role)', 'shellHouse()'].map((s) => body.indexOf(s));
  assert.ok(at.every((i) => i >= 0), '빠진 단계');
  assert.deepEqual([...at].sort((a, b) => a - b), at, '순서');
  assert.match(body, /if \(!\(await canOpenShell\(viewer\.role\)\)\) return new Response\('Not found', HIDDEN\);/);
  assert.match(route, /const HIDDEN = \{ status: 404, headers: \{ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' \} \}/);
  assert.match(route, /'Cache-Control': 'private, no-store'/);
  // 데이터 원천: 환경 변수(gzip 뒤 base64). 없으면 null, 미리보기가 꺼져 있으면 파일을 건드리지 않는다
  const gz = gzipSync(Buffer.from(JSON.stringify(fixture()))).toString('base64');
  const fromEnv = await shellHouse({ HOUSE_SHELL_GZ: gz });
  assert.ok(fromEnv && fromEnv.kind === 'shell');
  assert.equal(await shellHouse({ HOUSE_SHELL_GZ: Buffer.from('not gzip').toString('base64') }), null);
  assert.equal(await shellHouse({}), null);
  let touched = false;
  const disk = { lstat: async () => { touched = true; return { isFile: () => true, size: 10 }; }, readFile: async () => { touched = true; return new Uint8Array(); } };
  assert.equal(await shellHouse({ HOUSE_SHELL_FILE: '/somewhere/shell.json' }, disk), null);
  assert.equal(touched, false);
  // 미리보기에서는 파일(JSON 그대로)도 읽는다
  const preview = { JY_LOCAL_PREVIEW: '1', __NEXT_PRIVATE_ORIGIN: 'http://127.0.0.1:3370', HOUSE_SHELL_FILE: '/somewhere/shell.json' };
  const text = new TextEncoder().encode(JSON.stringify(fixture()));
  const fromFile = await shellHouse(preview, { lstat: async () => ({ isFile: () => true, size: text.length }), readFile: async () => text });
  assert.ok(fromFile && fromFile.kind === 'shell');
});

test('지도 고르기 기억: 주소의 ?map=이 먼저(그리고 기억), 없으면 이 기기에 남은 것, 저장소가 막혀도 집', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  assert.equal(walkMap.syncWalkMap('', store), 'house');
  assert.equal(walkMap.syncWalkMap('?map=shell', store), 'shell');
  assert.equal(walkMap.syncWalkMap('', store), 'shell');
  assert.equal(walkMap.syncWalkMap('?map=nope', store), 'shell');
  assert.equal(walkMap.syncWalkMap('?map=house&room=x', store), 'house');
  assert.equal(walkMap.syncWalkMap('', store), 'house');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
  assert.equal(walkMap.syncWalkMap('', broken), 'house');
  assert.equal(walkMap.syncWalkMap('?map=shell', broken), 'shell');
  assert.equal(walkMap.hrefWithMap('https://x.test/walk?room=a#k', 'shell'), '/walk?room=a&map=shell#k');
  assert.equal(walkMap.hrefWithMap('https://x.test/walk?map=shell&room=a', 'house'), '/walk?room=a');
});

// 실제 껍데기 파일(저장소 밖)이 주어지면 같은 걷기 검사를 돈다. 좌표·이름은 찍지 않는다
const realPath = process.env.HOUSE_SHELL_JSON;
test('실제 껍데기(있을 때만): 지어지고, 집 밖으로 새지 않고, 계단 꼭대기까지 오른다', { skip: !realPath || !existsSync(realPath) }, () => {
  const w = shellToWorld(JSON.parse(readFileSync(realPath!, 'utf8')));
  assert.ok(w, '실제 껍데기를 걷기 세계로 바꾸지 못함');
  assert.ok(!blocked(w.physics, 1, w.spawn.x, w.spawn.z), '들어오는 자리가 막힘');
  const reach = walkChecks(w, '실제 껍데기');
  // 공용 칸마다 몸이 들어가 본다(문이 다 열려 있다)
  for (const z of w.zones.filter((q) => q.level === 1 && (q.x2 - q.x1) * (q.z2 - q.z1) > 1)) {
    assert.ok(reach.some((s) => s.y < 0.1 && s.x > z.x1 && s.x < z.x2 && s.z > z.z1 && s.z < z.z2), '들어가지 못한 칸이 있다');
  }
});
