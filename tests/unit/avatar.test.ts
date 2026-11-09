// 캐릭터·몸 움직임·전망 검사: three를 노드에서 그대로 불러 기하와 계산만 본다(그리기는 브라우저 몫).
// 글자 스프라이트는 호출만 받는 가짜 캔버스로, 방 장면은 시험 안에서 만든 작은 가짜 방으로 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  AVATAR_HEIGHT, GRAVITY, JUMP_V, STUCK_S, angleDiff, avatarStats, clothColors, createAvatar, gaitPose, gaitRate, headBob,
  hopStart, hopStep, nearestOpen, pathStep, startPath, wrapLines, type Hop,
} from '../../src/walk/avatar.ts';
import { SCATTER, buildScenery, gridCoord, lookFor } from '../../src/walk/scenery.ts';
import { blocked, step, type Body } from '../../src/walk/physics.ts';
import { buildWorld } from '../../src/content/world.ts';
import type { Box, HouseWorld } from '../../src/walk/types.ts';

// ───────── 가짜 캔버스(글자 너비는 글자 수로)
const ctx2d = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, k) => (k === 'measureText' ? (s: string) => ({ width: [...s].length * 14 }) : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

// ───────── 작은 가짜 방: 5×6m, 벽 상자로 닫혀 있고 가운데 낮은 책상 하나
function fakeRoom(): HouseWorld {
  const T = 0.2;
  const boxes: Box[] = [
    { x1: -2.5 - T, x2: 2.5 + T, z1: -3 - T, z2: -3, level: 0, tag: 'wall' },
    { x1: -2.5 - T, x2: 2.5 + T, z1: 3, z2: 3 + T, level: 0, tag: 'wall' },
    { x1: -2.5 - T, x2: -2.5, z1: -3, z2: 3, level: 0, tag: 'wall' },
    { x1: 2.5, x2: 2.5 + T, z1: -3, z2: 3, level: 0, tag: 'wall' },
    { x1: -0.6, x2: 0.6, z1: -0.4, z2: 0.4, level: 1, tag: 'lowTable' },
  ];
  return {
    kind: 'room', floor2: 3, house: { x1: -2.5, x2: 2.5, z1: -3, z2: 3 },
    floors: [{ level: 1, x1: -2.5, x2: 2.5, z1: -3, z2: 3, mat: 'oak' }],
    walls: [], headers: [], doors: [], ceilings: [], windows: [], furniture: [], props: [], zones: [],
    hotspots: [{ id: 'exit', level: 1, x: 0, z: 2.6, r: 1, title: '나가기', line: '', kind: 'exit' }],
    physics: { boxes, ramps: [], floor2: 3 }, spawn: { x: 0, z: 2, yaw: 0 }, room: { slug: 'fake', games: [] },
  };
}

test('걸음 위상: 멈추면 0, 달리면 더 빠르고, 다리와 팔은 엇갈린다', () => {
  assert.equal(gaitRate(0, false), 0);
  assert.ok(gaitRate(3.6, true) > gaitRate(1.6, false));
  const p = gaitPose(Math.PI / 2, 1, false);
  assert.ok(p.legL > 0.4 && Math.abs(p.legL + p.legR) < 1e-9, '다리는 서로 반대');
  assert.ok(p.armL < 0 && Math.abs(p.armL + p.armR) < 1e-9, '팔은 같은 쪽 다리와 반대');
  assert.ok(gaitPose(Math.PI / 2, 1, true).legL > p.legL, '달리면 폭이 크다');
  assert.equal(gaitPose(1.3, 0, false).bob, 0);
  assert.ok(gaitPose(0, 1, false).bob > gaitPose(Math.PI / 2, 1, false).bob, '두 다리가 모일 때 몸이 높다');
});

test('1인칭 출렁임: 위아래 약 3cm, 좌우 약 1.5cm, 세기 0이면 모두 0', () => {
  let ymin = Infinity, ymax = -Infinity, xmax = 0;
  for (let i = 0; i < 400; i++) {
    const b = headBob((i / 400) * Math.PI * 2, 1, false);
    ymin = Math.min(ymin, b.y); ymax = Math.max(ymax, b.y); xmax = Math.max(xmax, Math.abs(b.x));
    assert.ok(Math.abs(b.roll) < 0.01);
  }
  assert.ok(Math.abs(ymax - ymin - 0.03) < 0.002, `위아래 ${ymax - ymin}`);
  assert.ok(Math.abs(xmax - 0.015) < 0.001, `좌우 ${xmax}`);
  assert.deepEqual(headBob(1, 0, true), { y: 0, x: 0, roll: 0 });
});

test('점프: 위로 3.2m/s·중력 9.8이면 꼭대기 약 0.52m, 공중에서 다시 누르면 무시, 착지는 한 번', () => {
  assert.equal(JUMP_V, 3.2);
  assert.equal(GRAVITY, 9.8);
  let s: Hop = hopStart({ h: 0, v: 0, air: false });
  assert.ok(s.air);
  assert.equal(hopStart(s), s);
  let top = 0, lands = 0, t = 0;
  while (t < 2) {
    const r = hopStep(s, 1 / 120);
    s = r.hop; t += 1 / 120;
    top = Math.max(top, s.h);
    if (r.landed) lands++;
  }
  assert.ok(Math.abs(top - (JUMP_V * JUMP_V) / (2 * GRAVITY)) < 0.01 && top > 0.5 && top < 0.54, `꼭대기 ${top}`);
  assert.equal(lands, 1);
  assert.deepEqual(s, { h: 0, v: 0, air: false });
});

test('가장 가까운 열린 자리: 제자리가 열렸으면 그대로, 막혔으면 1.5m 안 가장 가까운 곳, 없으면 null', () => {
  assert.deepEqual(nearestOpen(() => true, 1, 2), { x: 1, z: 2 });
  const p = nearestOpen((x) => x >= 0.75, 0, 0)!;
  assert.ok(p && p.x >= 0.75 && Math.hypot(p.x, p.z) < 0.85, JSON.stringify(p));
  assert.equal(nearestOpen(() => false, 0, 0), null);
  assert.equal(nearestOpen((x) => x > 2, 0, 0), null);
});

test('각 차이·옷 색·말풍선 줄 나누기', () => {
  assert.ok(Math.abs(angleDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  const c = clothColors('#c0563c');
  assert.notEqual(c.top, c.bottom);
  assert.ok(new THREE.Color(c.top).getHSL({ h: 0, s: 0, l: 0 }).l > new THREE.Color(c.bottom).getHSL({ h: 0, s: 0, l: 0 }).l);
  const m = (s: string) => [...s].length * 10;
  const lines = wrapLines('안녕하세요 오늘 조연당에 처음 왔어요 반가워요', 100, m);
  assert.ok(lines.length >= 2 && lines.every((l) => m(l) <= 100));
  const long = wrapLines('가'.repeat(80), 100, m);
  assert.equal(long.length, 4);
  assert.ok(long[3].endsWith('…') && m(long[3]) <= 100);
});

const meshBox = (g: THREE.Object3D, only?: string) => {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3();
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (!only || m.name === only)) b.expandByObject(m); });
  return b;
};

test('캐릭터: 키 약 1.15m, 머리가 키의 약 40%, 메시는 그림자를 드리운다', () => {
  const a = createAvatar({ color: '#5b7fa6' });
  assert.ok(a.group instanceof THREE.Group);
  const all = meshBox(a.group), head = meshBox(a.group, 'head');
  const h = all.max.y - all.min.y;
  assert.ok(Math.abs(h - AVATAR_HEIGHT) < 0.06 && all.min.y > -0.01, `키 ${h}`);
  const ratio = (head.max.y - head.min.y) / h;
  assert.ok(ratio > 0.36 && ratio < 0.48, `머리 ${ratio}`);
  let meshes = 0;
  a.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; assert.ok(m.castShadow); } });
  assert.ok(meshes <= 10, `메시 ${meshes}개(사람 30명이면 이 30배)`);
  a.dispose();
});

test('걷기·멈추기·점프·착지 동작, 줄인 움직임이면 모두 끈다', () => {
  const a = createAvatar({ color: '#5b7fa6' });
  let swing = 0;
  for (let i = 0; i < 60; i++) { a.update(1 / 60, { speed: 1.6, running: false, airborne: false, landing: false }); swing = Math.max(swing, Math.abs(a.pose().legL)); }
  assert.ok(swing > 0.3, `걸을 때 다리 ${swing}`);
  for (let i = 0; i < 90; i++) a.update(1 / 60, { speed: 0, running: false, airborne: false, landing: false });
  assert.ok(Math.abs(a.pose().legL) < 0.02 && a.pose().bob < 0.002, '멈추면 0으로');
  a.update(1 / 60, { speed: 0, running: false, airborne: true, landing: false, vy: 3 });
  for (let i = 0; i < 20; i++) a.update(1 / 60, { speed: 0, running: false, airborne: true, landing: false, vy: 2 });
  assert.ok(a.pose().scaleY > 1, '올라갈 때 늘어난다');
  a.update(1 / 60, { speed: 0, running: false, airborne: false, landing: true });
  assert.ok(a.pose().scaleY < 0.9, '착지하면 쪼그린다');
  assert.doesNotThrow(() => a.update(NaN, { speed: Infinity, running: true, airborne: false, landing: false }));
  a.dispose();
  const r = createAvatar({ color: '#5b7fa6', reducedMotion: true });
  for (let i = 0; i < 60; i++) r.update(1 / 60, { speed: 3.6, running: true, airborne: i > 30, landing: i === 45 });
  assert.deepEqual(r.pose(), { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0, scaleY: 1 });
  r.dispose();
});

test('기하는 함께 쓰고 재질은 색마다 하나, 이름표·말풍선까지 dispose 뒤 남는 것이 없다', () => {
  assert.deepEqual(avatarStats(), { kitRefs: 0, geometries: 0, materials: 0, labels: 0 });
  const list = Array.from({ length: 30 }, (_, i) => createAvatar({ color: i % 2 ? '#c0563c' : '#5b7fa6', name: `손님 ${i}` }));
  const heads = new Set(list.map((a) => (a.group.getObjectByName('head') as THREE.Mesh).geometry));
  assert.equal(heads.size, 1);
  const st = avatarStats();
  assert.equal(st.kitRefs, 30);
  assert.equal(st.materials, 2 * 2 + 2, '두 색의 상의·하의 + 손·머리');
  assert.equal(st.labels, 30);
  list[0].setBubble('안녕하세요!');
  list[0].setBubble('안녕하세요!');
  assert.equal(avatarStats().labels, 31, '같은 말은 다시 그리지 않는다');
  list[0].setPixelScale(0.002);
  const sprites = list[0].group.children.filter((c) => (c as THREE.Sprite).isSprite) as THREE.Sprite[];
  assert.equal(sprites.length, 2);
  for (const s of sprites) {
    const m = s.material as THREE.SpriteMaterial;
    assert.equal(m.depthTest, false);
    assert.equal(m.sizeAttenuation, false);
    assert.ok(s.scale.x > 0 && s.scale.y > 0);
  }
  list[0].setName(null);
  assert.equal(avatarStats().labels, 30);
  const parent = new THREE.Group();
  for (const a of list) parent.add(a.group);
  for (const a of list) { a.dispose(); a.dispose(); }
  assert.equal(parent.children.length, 0);
  assert.deepEqual(avatarStats(), { kitRefs: 0, geometries: 0, materials: 0, labels: 0 });
});

test('자동 걷기(가짜 방): 책상을 돌아 점들을 따라가 도착, 벽으로 가는 길은 1초 넘게 막히면 멈춘다', () => {
  const w = fakeRoom();
  const move = (b: Body, dx: number, dz: number) => step(w.physics, b, dx, dz);
  const run = startPath([{ x: 1.4, z: 1.2, level: 1 }, { x: 1.4, z: -1.6, level: 1 }, { x: -1.5, z: -2.2, level: 1 }]);
  let body: Body = { x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 };
  let done: string | null = null, t = 0, heading: number | null = null;
  while (!done && t < 20) {
    const r = pathStep(run, body, 1 / 60, 1.6, move);
    body = r.body; done = r.done; t += 1 / 60;
    if (r.heading !== null) heading = r.heading;
    assert.ok(!blocked(w.physics, 1, body.x, body.z), '막힌 곳에 들어가지 않는다');
  }
  assert.equal(done, 'arrive');
  assert.ok(Math.hypot(body.x + 1.5, body.z + 2.2) <= 0.21);
  assert.ok(heading !== null && Number.isFinite(heading));
  const stuck = startPath([{ x: 0, z: -5, level: 1 }]);
  body = { x: 0, z: -2, y: 0, level: 1 };
  done = null; t = 0;
  while (!done && t < 5) { const r = pathStep(stuck, body, 1 / 60, 1.6, move); body = r.body; done = r.done; t += 1 / 60; }
  assert.equal(done, 'stuck');
  assert.ok(t > STUCK_S && t < STUCK_S + 2.5, `막힘 판정 ${t}s`);
  assert.equal(pathStep(startPath([]), body, 1 / 60, 1.6, move).done, 'arrive');
});

test('방 장면(가짜 방)은 전망·지붕·해 없이 실내 조명, 1인칭으로 시작. 집 세계는 전망과 먼 안개', () => {
  const room = lookFor(fakeRoom());
  assert.equal(room.scenery, false);
  assert.equal(room.props, false);
  assert.equal(room.sun, false);
  assert.equal(room.fog, null);
  assert.equal(room.firstPerson, true);
  assert.ok(room.far >= 30 && room.far <= 400);
  const house = lookFor(buildWorld({}));
  assert.equal(house.scenery, true);
  assert.ok(house.far >= 5000 && house.fog && house.fog[0] >= 60 && house.fog[1] >= 3000);
});

const instCounts = (g: THREE.Group) => g.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh).map((c) => (c as THREE.InstancedMesh).count);

test('전망: 손가락 기기는 나무·집 수가 절반 이하, 마당 끝이 땅과 틈 없이 이어진다', () => {
  const world = buildWorld({});
  const full = buildScenery(world, 'autumn');
  const lite = buildScenery(world, 'autumn', true);
  const a = instCounts(full.group), b = instCounts(lite.group);
  assert.equal(a.length, b.length);
  assert.ok(a.length >= 4);
  a.forEach((n, i) => assert.ok(b[i] <= n / 2 + 1, `묶음 ${i}: ${b[i]} / ${n}`));
  assert.ok(SCATTER.lite.grid < SCATTER.full.grid);
  assert.ok(gridCoord(1) === 1200 && gridCoord(-1) === -1200 && gridCoord(0) === 0);
  // 바닥판(마당·집)을 덮는 땅 삼각형은 잔디 위로 솟지 않는다. 집과 마당 안쪽(앞 석축 3m 안쪽까지)은 꼭짓점이 모두 평지(-0.04).
  // 앞 석축은 잔디 끝 바로 밑에서 비탈 아래까지 내려가 틈을 막는다
  for (const sc of [full, lite]) {
    const ground = sc.group.getObjectByName('scenery-ground') as THREE.Mesh;
    const pos = ground.geometry.attributes.position as THREE.BufferAttribute;
    const idx = ground.geometry.index!;
    const fb = world.floors.reduce((r, f) => ({ x1: Math.min(r.x1, f.x1), x2: Math.max(r.x2, f.x2), z1: Math.min(r.z1, f.z1), z2: Math.max(r.z2, f.z2) }), { ...world.house });
    let checked = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const xs = v.map((i) => pos.getX(i)), zs = v.map((i) => pos.getZ(i));
      if (Math.max(...xs) < fb.x1 || Math.min(...xs) > fb.x2 || Math.max(...zs) < fb.z1 || Math.min(...zs) > fb.z2) continue;
      checked++;
      const inner = Math.min(...zs) < fb.z2 - 3;
      for (const i of v) {
        const y = pos.getY(i);
        assert.ok(inner ? Math.abs(y + 0.04) < 1e-4 : y <= -0.04 + 1e-4, `(${pos.getX(i)}, ${pos.getZ(i)}) 높이 ${y}`);
      }
    }
    assert.ok(checked > 50);
    const terrace = sc.group.getObjectByName('scenery-terrace') as THREE.Mesh;
    const tb = new THREE.Box3().setFromObject(terrace);
    assert.ok(tb.max.y <= 0 && tb.max.y > -0.02 && tb.min.y < sc.groundAt(0, fb.z2 + 4), '석축 위는 잔디 바로 밑, 아래는 비탈 밑');
    assert.ok(tb.min.z <= fb.z2 && tb.max.z > fb.z2 && tb.min.x <= fb.x1 && tb.max.x >= fb.x2);
    assert.equal(sc.groundAt(0, 10), -0.04);
    assert.ok(sc.groundAt(0, -400) > 20, '뒤로 오른다');
    assert.ok(sc.groundAt(0, 300) < -5, '앞으로 내려간다');
  }
  full.dispose();
  lite.dispose();
});
