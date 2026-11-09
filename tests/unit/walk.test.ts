// 걷기 세계 검사: 화면이 쓰는 그 step() 함수로 마당에서 출발해 닿을 수 있는 곳을 모두 찾는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTSPOTS, L2Y, SPAWN, STAIRS, buildWorld, nearestHotspot, zoneAt } from '../../src/content/world.ts';
import { blocked, heightAt, rampY, step, type Body, type Physics } from '../../src/walk/physics.ts';
import type { Ramp } from '../../src/walk/types.ts';

const G = 0.25;

function explore(p: Physics, from: { x: number; z: number } = SPAWN) {
  const key = (b: Body) => `${b.level}:${Math.round(b.x / G)}:${Math.round(b.z / G)}`;
  const start: Body = { x: from.x, z: from.z, y: 0, level: 1 };
  const seen = new Map<string, Body>([[key(start), start]]);
  const queue: Body[] = [start];
  while (queue.length) {
    const b = queue.shift()!;
    for (const [dx, dz] of [[G, 0], [-G, 0], [0, G], [0, -G]]) {
      const nb = step(p, b, dx, dz);
      if (Math.abs(nb.x - (b.x + dx)) > 1e-6 || Math.abs(nb.z - (b.z + dz)) > 1e-6) continue;
      const k = key(nb);
      if (!seen.has(k)) {
        seen.set(k, nb);
        queue.push(nb);
      }
    }
  }
  return [...seen.values()];
}

const reachable = (cells: Body[], level: 1 | 2, x: number, z: number, r = 0.6) =>
  cells.some((c) => c.level === level && Math.hypot(c.x - x, c.z - z) <= r);

const closedWorld = buildWorld({});
const cells = explore(closedWorld.physics);

test('마당에서 포치·현관·거실 무대·계단 위 2층 거실까지 걸어갈 수 있다', () => {
  assert.ok(cells.length > 2000);
  assert.ok(reachable(cells, 1, 0, 1.4), '포치');
  assert.ok(reachable(cells, 1, 0, -1.6), '현관');
  assert.ok(reachable(cells, 1, 0, -9.6), '거실 무대 앞');
  assert.ok(reachable(cells, 1, 9.0, -0.8), '계단 아래');
  assert.ok(reachable(cells, 2, 9.0, -6.0), '2층 계단참');
  assert.ok(reachable(cells, 2, 0, -6.4), '박공 아래 거실');
});

test('열린 곳의 살피기 자리는 모두 닿을 수 있다', () => {
  for (const h of HOTSPOTS) {
    assert.ok(reachable(cells, h.level, h.x, h.z, h.r), `${h.title}(${h.id})에 닿지 못함`);
  }
});

test('닫힌 문 너머, 마당 밖, 집 뒤, 2층 닫힌 방에는 못 들어간다', () => {
  const forbidden: Array<[1 | 2, number, number, string]> = [
    [1, -7, -9, '빛이 드는 방 안'],
    [1, -7, -3, '창이 큰 방 안'],
    [1, 7, -9, '주방 안'],
    [1, 0, 21, '대문 밖'],
    [1, 0, -14, '집 뒤'],
    [1, 20, 5, '돌담 밖'],
    [2, -8, -8, '사계절 창 방 안'],
    [2, 8, -10, '2층 주방 안'],
    [2, -5, -2, '2층 앞쪽 작은 방들'],
    [2, 7, -2, '좋아하는 것 방 문 너머(2층 앞쪽)'],
    [1, 9.0, -3.0, '1층에서 계단 밑으로'],
  ];
  for (const [lv, x, z, why] of forbidden) {
    if (lv === 1 && why === '1층에서 계단 밑으로') {
      // 계단 위를 지나는 칸은 있지만, 1층 높이(y≈0)로 그 자리에 선 칸은 없어야 한다
      assert.ok(!cells.some((c) => c.level === 1 && c.y < 0.5 && Math.hypot(c.x - x, c.z - z) < 0.3), why);
      continue;
    }
    assert.ok(!reachable(cells, lv, x, z, 0.3), `${why}에 들어갈 수 있음`);
  }
});

test('문패를 열면 그 방에 들어갈 수 있다(방 장면이 있는 방은 문짝 대신 「들어가기」로)', () => {
  const opened = explore(buildWorld({ atelier: 'open', study: 'open', toybox: 'open', target: 'open', mind: 'open' }).physics);
  assert.ok(reachable(opened, 1, -7, -3), '열린 창이 큰 방');
  assert.ok(!reachable(opened, 1, -7, -9, 0.3), '빛이 드는 방은 포털이라 문짝이 닫혀 있다');
  assert.ok(!reachable(opened, 2, 7, -2, 0.3), '좋아하는 것 방도 포털이라 문짝이 닫혀 있다');
  assert.ok(!reachable(opened, 2, -3.4, -2, 0.3), '과녁 방·생각 지도 방도 포털이라 문짝이 닫혀 있다');
  assert.ok(!reachable(opened, 1, 7, -9, 0.3), '주방은 여전히 닫힘');
});

test('계단은 오를수록 높아지고 중간을 넘으면 2층으로 친다', () => {
  assert.equal(rampY(STAIRS, 9, STAIRS.z2), 0);
  assert.equal(rampY(STAIRS, 9, STAIRS.z1), L2Y);
  let b: Body = { x: 9.0, z: -0.8, y: 0, level: 1 };
  for (let i = 0; i < 60; i++) b = step(closedWorld.physics, b, 0, -0.1);
  assert.equal(b.level, 2);
  assert.ok(Math.abs(b.y - L2Y) < 1e-9);
  for (let i = 0; i < 60; i++) b = step(closedWorld.physics, b, 0, 0.1);
  assert.equal(b.level, 1);
  assert.equal(b.y, 0);
});

// 실제 집처럼 꺾인(U자) 계단: 아래 줄기 → 계단참 → 위 줄기. 높이가 맞는 곳에서만 오르내린다.
const U: Physics = {
  floor2: 2.9,
  boxes: [{ x1: 1.0, x2: 1.1, z1: 1.0, z2: 4.0, level: 0, tag: 'rail' }],
  ramps: [
    { x1: 1.1, x2: 2.1, z1: 1.0, z2: 4.0, axis: 'z', y0: 2.05, y1: 0 } as Ramp, // 아래 줄기: 남쪽 끝 0, 북쪽 끝 2.05
    { x1: 0.0, x2: 2.1, z1: 0.0, z2: 1.0, axis: 'z', y0: 2.05, y1: 2.05 } as Ramp, // 계단참
    { x1: 0.0, x2: 1.0, z1: 1.0, z2: 2.25, axis: 'z', y0: 2.05, y1: 2.9 } as Ramp, // 위 줄기: 북쪽 2.05 → 남쪽 2.9
  ],
};
test('U자 계단을 올라 2층에 서고, 계단참에서 허공으로 내딛지 못한다', () => {
  let b: Body = { x: 1.6, z: 4.5, y: 0, level: 1 };
  for (let i = 0; i < 50; i++) b = step(U, b, 0, -0.1); // 북쪽으로 아래 줄기를 올라 계단참까지
  assert.ok(Math.abs(b.y - 2.05) < 1e-9, `계단참 높이 ${b.y}`);
  assert.equal(heightAt(U, 1.6, -0.5, b.y), null, '계단참 북쪽은 허공');
  for (let i = 0; i < 12; i++) b = step(U, b, -0.1, 0); // 서쪽으로(난간 북쪽 끝 너머)
  for (let i = 0; i < 40; i++) b = step(U, b, 0, 0.1); // 남쪽으로 위 줄기를 올라
  assert.equal(b.level, 2);
  assert.ok(Math.abs(b.y - 2.9) < 1e-9, `2층 높이 ${b.y}`);
  // 1층에서 위 줄기 밑으로 들어가면 바닥 높이 그대로(계단 위로 뛰어오르지 않는다)
  assert.equal(heightAt(U, 0.5, 1.8, 0), 0);
});

test('빠르게 달려도 벽을 뚫지 않는다', () => {
  const b = step(closedWorld.physics, { x: 0, z: -5, y: 0, level: 1 }, -30, 0);
  assert.ok(b.x > -4, `x=${b.x}`);
  assert.equal(blocked(closedWorld.physics, 1, b.x, b.z), false);
});

test('장소 이름과 가까운 살피기', () => {
  assert.equal(zoneAt(1, 0, 10), '앞마당');
  assert.equal(zoneAt(1, 0, 1), '세 아치 포치');
  assert.equal(zoneAt(2, 0, -8), '박공 아래 거실');
  assert.equal(nearestHotspot(1, -7, 8.5)?.id, 'pine');
  assert.equal(nearestHotspot(2, -7, 8.5), null);
  // 포치 살피기 반경 안이어도 마당에 서 있으면 잡히지 않는다(벽·경계 너머는 다른 공간)
  assert.equal(nearestHotspot(1, 0, 1.4)?.id, 'porch');
  assert.equal(nearestHotspot(1, 0, 2.9), null);
});

test('세로 화면에서는 시야를 넓히되 지나치게 휘지 않는다', async () => {
  const { fovFor } = await import('../../src/walk/fov.ts');
  assert.equal(fovFor('first', 16 / 9), 70);
  assert.equal(fovFor('third', 1.2), 55);
  const phone = fovFor('first', 390 / 844);
  assert.ok(phone > 85 && phone <= 90, `${phone}`);
  assert.ok(fovFor('third', 390 / 844) <= 72);
});
