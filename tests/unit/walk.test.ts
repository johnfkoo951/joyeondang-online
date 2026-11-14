// 걷기 세계 검사: 화면이 쓰는 그 step() 함수로 마당에서 출발해 닿을 수 있는 곳을 모두 찾는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTSPOTS, L2Y, SPAWN, STAIRS, buildWorld, nearestHotspot, zoneAt } from '../../src/content/world.ts';
import { RADIUS, blocked, clearLine, heightAt, rampY, step, type Body, type Physics } from '../../src/walk/physics.ts';
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

// ───────── 둥근 몸: 벽 면은 따라가고 모서리는 돌아 나간다
/** 문 하나: z=0 선의 벽(두께 0.12)에 x∈[-0.5, 0.5] 통로. 몸 가운데는 x∈[-0.25, 0.25]로만 지난다 */
const DOORWAY: Physics = {
  floor2: 2.9,
  ramps: [],
  boxes: [
    { x1: -4, x2: -0.5, z1: -0.06, z2: 0.06, level: 1, tag: 'wall' },
    { x1: 0.5, x2: 4, z1: -0.06, z2: 0.06, level: 1, tag: 'wall' },
  ],
};
const walk = (p: Physics, from: Body, dx: number, dz: number, seconds: number, speed = 1.6, fps = 60) => {
  let b = from;
  const d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  let stalled = 0;
  for (let i = 0; i < seconds * fps; i++) {
    const nb = step(p, b, (ux * speed) / fps, (uz * speed) / fps);
    if (Math.hypot(nb.x - b.x, nb.z - b.z) < (speed / fps) * 0.1) stalled++;
    b = nb;
  }
  return { b, stalled };
};

test('몸은 둥글다: 모서리 대각선으로도 면만큼 가까이 선다', () => {
  const p: Physics = { floor2: 2.9, ramps: [], boxes: [{ x1: 0, x2: 1, z1: 0, z2: 1, level: 1 }] };
  const k = Math.SQRT1_2;
  // 모서리 (0,0)에서 대각선으로 반지름보다 조금 먼 자리: 네모난 몸이면 막히던 자리다
  assert.equal(blocked(p, 1, -(RADIUS + 0.01) * k, -(RADIUS + 0.01) * k), false);
  assert.equal(blocked(p, 1, -(RADIUS - 0.01) * k, -(RADIUS - 0.01) * k), true);
  // 면에서는 반지름 그대로
  assert.equal(blocked(p, 1, 0.5, -(RADIUS + 0.01)), false);
  assert.equal(blocked(p, 1, 0.5, -(RADIUS - 0.01)), true);
  // 다른 층 상자는 막지 않는다
  assert.equal(blocked(p, 2, 0.5, 0.5), false);
});

test('문설주에 어긋나게 걸어 들어가도 멈추지 않고 돌아 지나간다', () => {
  // 몸이 문설주에 조금에서 몸 반지름 가까이까지 겹치게 어긋난 채 정면(-z)으로 걷는다: 네모난 몸은 여기서 섰다
  for (const off of [0.26, 0.3, 0.4, 0.49]) {
    for (const side of [-1, 1]) {
      const { b } = walk(DOORWAY, { x: side * off, z: 1.5, y: 0, level: 1 }, 0, -1, 3);
      assert.ok(b.z < -1, `어긋남 ${side * off}: z=${b.z.toFixed(2)}에서 멈춤`);
      assert.ok(Math.abs(b.x) <= 0.25 + 1e-6 || b.z < -0.31, `어긋남 ${side * off}: 벽을 지났는데 x=${b.x.toFixed(2)}`);
    }
  }
  // 문 쪽으로 조금 틀어 걸어도(15°까지) 문설주를 돌아 지나간다. 달려도 같다
  for (const speed of [1.6, 3.6]) {
    for (const side of [-1, 1]) {
      for (const deg of [0, 5, 10, 15]) {
        const a = (deg * Math.PI) / 180;
        const { b, stalled } = walk(DOORWAY, { x: side * 0.4, z: 1.2, y: 0, level: 1 }, -side * Math.sin(a), -Math.cos(a), 3, speed);
        assert.ok(b.z < -0.8, `빠르기 ${speed} 쪽 ${side} ${deg}°: z=${b.z.toFixed(2)}에서 멈춤`);
        assert.ok(stalled <= 2, `빠르기 ${speed} 쪽 ${side} ${deg}°: 멈칫 ${stalled}프레임`);
      }
    }
  }
  // 문이 아닌 벽 면에 정면으로 걸으면 그대로 선다(옆으로 끌려가지 않는다)
  const face = walk(DOORWAY, { x: 1.5, z: 1.2, y: 0, level: 1 }, 0, -1, 2);
  assert.ok(Math.abs(face.b.x - 1.5) < 1e-6 && face.b.z > 0.06 + RADIUS - 1e-6, `벽 면: (${face.b.x}, ${face.b.z})`);
});

test('벽에 비스듬히 걸으면 벽을 따라 미끄러지고, 벽 안으로 들어가지 않는다', () => {
  const p: Physics = { floor2: 2.9, ramps: [], boxes: [{ x1: -10, x2: 10, z1: -0.2, z2: 0, level: 1, tag: 'wall' }] };
  for (const deg of [10, 30, 45, 60, 80]) {
    const a = (deg * Math.PI) / 180;
    const from: Body = { x: 0, z: 0.5, y: 0, level: 1 };
    // 벽 쪽(-z)으로 deg만큼 틀어 2초 걷기: 벽에 닿은 뒤로는 벽을 따라간 몫(cos)만큼 나아간다
    const { b, stalled } = walk(p, from, Math.cos(a), -Math.sin(a), 2);
    assert.ok(b.z >= RADIUS - 1e-6, `${deg}°: 벽 안 z=${b.z}`);
    assert.ok(b.x > 2 * 1.6 * Math.cos(a) * 0.9, `${deg}°: x=${b.x.toFixed(2)}만 나아감`);
    assert.equal(stalled, 0, `${deg}°: 멈칫 ${stalled}프레임`);
  }
  // 정면으로 밀면 그 자리에 선다(떨지 않는다)
  const { b } = walk(p, { x: 0, z: 0.5, y: 0, level: 1 }, 0, -1, 1);
  assert.ok(Math.abs(b.x) < 1e-9 && Math.abs(b.z - RADIUS) < 1e-4, `정면: (${b.x}, ${b.z})`);
});

test('안쪽 모서리로 밀어도 벽을 뚫지 않고, 얇은 난간도 달려서 지나가지 못한다', () => {
  const corner: Physics = {
    floor2: 2.9, ramps: [],
    boxes: [{ x1: -5, x2: 0, z1: -0.1, z2: 0, level: 1, tag: 'wall' }, { x1: 0, x2: 0.1, z1: -0.1, z2: 5, level: 1, tag: 'wall' }],
  };
  for (const deg of [20, 45, 70]) {
    const a = (deg * Math.PI) / 180;
    const { b } = walk(corner, { x: -2, z: 2, y: 0, level: 1 }, Math.cos(a), -Math.sin(a), 5, 3.6);
    assert.ok(b.x <= -RADIUS + 1e-6 && b.z >= RADIUS - 1e-6, `${deg}°: (${b.x.toFixed(3)}, ${b.z.toFixed(3)})`);
    assert.equal(blocked(corner, 1, b.x, b.z), false);
  }
  // 두께 4cm 난간에 달리기 빠르기로, 한 프레임 0.1초(0.36m)씩, 여러 각도로
  const rail: Physics = { floor2: 2.9, ramps: [], boxes: [{ x1: -3, x2: 3, z1: -0.02, z2: 0.02, level: 0, tag: 'rail' }] };
  for (const deg of [90, 60, 30, 12]) {
    const a = (deg * Math.PI) / 180;
    let b: Body = { x: -1, z: 1, y: 0, level: 1 };
    for (let i = 0; i < 30; i++) b = step(rail, b, Math.cos(a) * 0.36, -Math.sin(a) * 0.36);
    assert.ok(b.z >= RADIUS - 1e-6 || Math.abs(b.x) > 3, `${deg}°: 난간을 지남 (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
  }
});

test('벽 면과 튀어나온 모서리 사이 구석에 밀어도 몸이 떨지 않고 선다', () => {
  // 벽 면(z = 0) 앞에서 +x로 미끄러지다 0.2m 튀어나온 턱에 걸리는 구석
  const p: Physics = {
    floor2: 2.9,
    ramps: [],
    boxes: [
      { x1: -5, x2: 5, z1: 0, z2: 0.2, level: 1, tag: 'wall' },
      { x1: 1.0, x2: 1.4, z1: -0.2, z2: 0, level: 1, tag: 'wall' },
    ],
  };
  const bad: string[] = [];
  for (const [speed, fps] of [[1.6, 60], [3.6, 60], [1.6, 30], [3.6, 15]]) {
    for (let deg = 3; deg < 90; deg += 3) {
      const a = (deg * Math.PI) / 180;
      const dx = Math.cos(a) * (speed / fps), dz = Math.sin(a) * (speed / fps);
      let b: Body = { x: -1, z: -1.2, y: 0, level: 1 };
      for (let i = 0; i < 400; i++) b = step(p, b, dx, dz);
      const at = b;
      let path = 0;
      for (let i = 0; i < 60; i++) {
        const n = step(p, b, dx, dz);
        path += Math.hypot(n.x - b.x, n.z - b.z);
        b = n;
      }
      assert.ok(!blocked(p, 1, b.x, b.z), `${deg}°: 벽 안`);
      // 떠는 것: 거의 제자리인데(2cm 안) 오간 길이가 옮겨 간 거리보다 길다(0.5mm 넘게).
      // 벽을 따라 천천히 미끄러지는 것(오간 길이 = 옮긴 거리)은 떠는 것이 아니다
      const net = Math.hypot(b.x - at.x, b.z - at.z);
      if (net < 0.02 && path - net > 0.0005) bad.push(`${speed}m/s ${fps}fps ${deg}°: 오간 길이 ${(path * 1000).toFixed(1)}mm, 옮긴 거리 ${(net * 1000).toFixed(1)}mm`);
    }
  }
  assert.deepEqual(bad, []);
});

test('다시 그린 집 어디서 어느 쪽으로 밀어도, 멈춘 몸은 떨지 않는다', () => {
  const p = buildWorld({}).physics;
  // 씨앗이 정해진 난수(시험이 늘 같은 자리·방향을 본다)
  let seed = 20261110;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const bad: string[] = [];
  let tried = 0;
  while (tried < 400) {
    const x = rnd() * 22, z = rnd() * 34;
    const y = heightAt(p, x, z, 0);
    if (y === null || blocked(p, 1, x, z)) continue;
    tried++;
    const a = rnd() * Math.PI * 2;
    const len = (rnd() < 0.5 ? 1.6 : 3.6) / (rnd() < 0.5 ? 60 : 30);
    const dx = Math.cos(a) * len, dz = Math.sin(a) * len;
    let b: Body = { x, z, y, level: 1 };
    for (let i = 0; i < 300; i++) b = step(p, b, dx, dz);
    const at = b;
    let path = 0;
    for (let i = 0; i < 40; i++) {
      const n = step(p, b, dx, dz);
      path += Math.hypot(n.x - b.x, n.z - b.z);
      b = n;
    }
    const net = Math.hypot(b.x - at.x, b.z - at.z);
    if (net < 0.02 && path - net > 0.0005) bad.push(`#${tried}: 오간 길이 ${(path * 1000).toFixed(1)}mm, 옮긴 거리 ${(net * 1000).toFixed(1)}mm`);
  }
  assert.deepEqual(bad, []);
});

test('곧게 갈 수 있는지: 벽 끝을 스치는 선과 허공을 지나는 선은 못 간다', () => {
  const from: Body = { x: 0.6, z: 1, y: 0, level: 1 };
  assert.equal(clearLine(DOORWAY, from, 0.6, 0.4), true, '벽 앞까지');
  assert.equal(clearLine(DOORWAY, from, 0, -1), false, '문설주를 스친다');
  assert.equal(clearLine(DOORWAY, { x: 0, z: 1, y: 0, level: 1 }, 0, -1), true, '문 한가운데');
  assert.equal(clearLine(DOORWAY, { x: 0, z: 1, y: 0, level: 1 }, 2, -1), false, '벽을 지난다');
  // 계단참 너머(-z 쪽)는 허공이다
  assert.equal(clearLine(U, { x: 1.6, z: 0.5, y: 2.05, level: 2 }, 1.6, -0.5), false);
  assert.equal(clearLine(U, { x: 1.6, z: 3.5, y: rampY(U.ramps[0], 1.6, 3.5), level: 1 }, 1.6, 0.5), true, '줄기를 따라 계단참까지');
});

test('곧게 갈 수 있는지: 옆이 트인 계단 옆에서 계단 위의 점은, 닿을 높이를 주면 못 간다고 답한다', () => {
  // 옆이 트인 계단(z를 따라 1.5m 오른다)과 그 옆 바닥
  const ramp: Ramp = { x1: 0, x2: 1, z1: 0, z2: 3, axis: 'z', y0: 0, y1: 1.5 };
  const p: Physics = { floor2: 2.9, ramps: [ramp], boxes: [] };
  const beside: Body = { x: -0.6, z: 2, y: 0, level: 1 };
  // 높이를 묻지 않으면 계단 밑 바닥으로 걸어가는 길이라 「간다」
  assert.ok(clearLine(p, beside, 0.5, 2));
  // 계단 위 그 점의 높이(1.0m)를 주면 「못 간다」: 곧게 걸어간 끝은 계단 밑이다
  assert.ok(!clearLine(p, beside, 0.5, 2, undefined, undefined, rampY(ramp, 0.5, 2)));
  // 계단 발치에서 계단을 따라 오르는 길은 높이를 줘도 간다
  const foot: Body = { x: 0.5, z: -0.5, y: 0, level: 1 };
  assert.ok(clearLine(p, foot, 0.5, 2, undefined, undefined, rampY(ramp, 0.5, 2)));
  // 같은 바닥의 점은 높이를 줘도 그대로 간다
  assert.ok(clearLine(p, beside, -0.6, -1, undefined, undefined, 0));
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
