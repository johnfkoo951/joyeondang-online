// 캐릭터·몸 움직임·전망 검사: three를 노드에서 그대로 불러 기하와 계산만 본다(그리기는 브라우저 몫).
// 글자 스프라이트는 호출만 받는 가짜 캔버스로, 방 장면은 시험 안에서 만든 작은 가짜 방으로 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_HEIGHT, BASE_DOLL, GRAVITY, JUMP_V, PHOTO_GLOW, PHOTO_H, PHOTO_LEAN, SHADE_LAYER, STUCK_S, VIEW_HOLD, angleDiff, avatarStats, buildHead, clothColors, createAvatar, gaitPose, gaitRate, headBob, setPhotoLoader, hopStart, hopStep, ledgeEase, nearestOpen, pathStep, startPath, viewCell, viewZone, wrapLines, type Hop, leanFor } from '../../src/walk/avatar.ts';
import { LEAF_TREE, SCATTER, buildScenery, gridCoord, lookFor, terrain } from '../../src/walk/scenery.ts';
import { RADIUS, blocked, step, type Body } from '../../src/walk/physics.ts';
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

test('방향 그림 고르기: 45도씩 여덟 구역, 카메라가 왼쪽이면 그대로·오른쪽이면 뒤집고, 경계에서는 6도를 붙든다', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  // 구역 가운데 각(한 바퀴를 넘는 값도 같은 구역)
  for (const [d, k] of [[0, 0], [45, 1], [90, 2], [135, 3], [180, 4], [-180, 4], [-135, -3], [-90, -2], [-45, -1], [360, 0], [405, 1], [-270, 2]]) {
    assert.equal(viewZone(deg(d)), k, `${d}도`);
  }
  // 경계(22.5도, 157.5도) 바로 안팎
  assert.deepEqual([22, 23, -22, -23, 157, 158, -157, -158].map((d) => viewZone(deg(d))), [0, 1, 0, -1, 3, 4, -3, 4]);
  // 칸과 뒤집기: 앞·뒤는 뒤집지 않고, 카메라가 캐릭터 오른쪽(-)이면 뒤집는다
  assert.deepEqual([-3, -2, -1, 0, 1, 2, 3, 4].map((k) => viewCell(k)), [
    { cell: 3, flip: true }, { cell: 2, flip: true }, { cell: 1, flip: true }, { cell: 0, flip: false },
    { cell: 1, flip: false }, { cell: 2, flip: false }, { cell: 3, flip: false }, { cell: 4, flip: false },
  ]);
  // 붙들기: 지난 구역이 있으면 경계를 6도 넘기 전에는 그대로
  assert.ok(Math.abs(VIEW_HOLD - deg(6)) < 1e-12);
  assert.equal(viewZone(deg(27), 0), 0);
  assert.equal(viewZone(deg(29), 0), 1);
  assert.equal(viewZone(deg(18), 1), 1);
  assert.equal(viewZone(deg(16), 1), 0);
  // 꼭 뒤의 이음매(180도와 -180도)를 넘나들어도 붙든다
  assert.equal(viewZone(deg(-175), 4), 4);
  assert.equal(viewZone(deg(-152), 4), 4);
  assert.equal(viewZone(deg(-150), 4), -3);
  assert.equal(viewZone(deg(175), -3), 4);
  // 경계 위에서 조금씩 떨려도 그림이 깜박이지 않는다(붙들기가 없으면 수십 번 바뀐다)
  let held = viewZone(deg(22.4)), loose = held, heldFlips = 0, looseFlips = 0;
  for (let i = 0; i < 200; i++) {
    const at = deg(22.5 + Math.sin(i * 1.7) * 4);
    const h = viewZone(at, held), l = viewZone(at);
    if (h !== held) heldFlips++;
    if (l !== loose) looseFlips++;
    held = h; loose = l;
  }
  assert.equal(heldFlips, 0);
  assert.ok(looseFlips > 20, `붙들기 없이 ${looseFlips}번`);
  // 한 바퀴를 천천히 돌면 구역을 차례로 지난다(건너뛰지 않는다)
  const seen: number[] = [];
  let z: number | null = null;
  for (let d = -180; d <= 180; d += 0.5) { z = viewZone(deg(d), z); if (seen[seen.length - 1] !== z) seen.push(z); }
  assert.deepEqual(seen, [4, -3, -2, -1, 0, 1, 2, 3, 4]);
  // 엉뚱한 값은 앞으로, 엉뚱한 지난 구역은 없는 것으로
  assert.equal(viewZone(NaN), 0);
  assert.equal(viewZone(Infinity), 0);
  assert.equal(viewZone(deg(50), NaN), 1);
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
  const all = meshBox(a.group);
  const h = all.max.y - all.min.y;
  assert.ok(Math.abs(h - AVATAR_HEIGHT) < 0.06 && all.min.y > -0.01, `키 ${h}`);
  const headGeo = buildHead(BASE_DOLL);
  headGeo.computeBoundingBox();
  const ratio = (headGeo.boundingBox!.max.y - headGeo.boundingBox!.min.y) / h;
  headGeo.dispose();
  assert.ok(ratio > 0.36 && ratio < 0.48, `머리 ${ratio}`);
  let meshes = 0;
  a.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; assert.ok(m.castShadow); } });
  assert.equal(meshes, 1, '서 있는 사람은 메시 하나(사람 50명이면 이 50배)');
  a.dispose();
});

test('서 있으면 온몸 한 덩이, 걷거나 뛰면 다섯 덩이, 멈추면 다시 한 덩이(자세가 같아 바뀌는 것이 보이지 않는다)', () => {
  const a = createAvatar({ color: '#5b7fa6' });
  const count = () => { let n = 0; a.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) n++; }); return n; };
  const still = { speed: 0, running: false, airborne: false, landing: false };
  a.update(1 / 60, still);
  assert.ok(a.resting());
  assert.equal(count(), 1);
  const rest = meshBox(a.group);
  // 걷기 시작: 다섯 덩이(몸통 덩이, 다리 둘, 팔 둘)가 그려지고 서 있는 덩이는 숨는다
  a.update(1 / 60, { ...still, speed: 1.6 });
  assert.ok(!a.resting());
  assert.equal(count(), 5);
  // 첫 프레임의 다섯 덩이는 서 있는 덩이와 같은 자리를 차지한다(1cm 안)
  const moving = meshBox(a.group);
  for (const k of ['x', 'y', 'z'] as const) {
    assert.ok(Math.abs(moving.min[k] - rest.min[k]) < 0.012 && Math.abs(moving.max[k] - rest.max[k]) < 0.012, `${k} ${moving.min[k]}..${moving.max[k]} / ${rest.min[k]}..${rest.max[k]}`);
  }
  for (let i = 0; i < 30; i++) a.update(1 / 60, { ...still, speed: 1.6 });
  assert.ok(!a.resting());
  // 멈추면 걸음이 가라앉은 뒤(1초 안) 다시 한 덩이
  for (let i = 0; i < 60; i++) a.update(1 / 60, still);
  assert.ok(a.resting());
  assert.equal(count(), 1);
  // 점프하는 동안과 착지 쪼그림 동안은 다섯 덩이
  a.update(1 / 60, { ...still, airborne: true, vy: 3 });
  assert.ok(!a.resting());
  a.update(1 / 60, { ...still, landing: true });
  assert.ok(!a.resting());
  for (let i = 0; i < 90; i++) a.update(1 / 60, still);
  assert.ok(a.resting());
  a.dispose();
  // 줄인 움직임이면 늘 한 덩이
  const r = createAvatar({ color: '#5b7fa6', reducedMotion: true });
  r.update(1 / 60, { ...still, speed: 3.6, running: true });
  assert.ok(r.resting());
  r.dispose();
});

/** 가짜 그림 받기: 방향 그림 묶음(…/views?s=…)은 없다고 답하고, 그림 한 장만 single이 준다 */
const noViews = <T,>(single: (url: string) => Promise<T>) => (url: string) => (url.includes('/views?') ? Promise.reject(new Error('none')) : single(url));

test('사진 캐릭터 그림은 세 장씩 차례로 받는다. 받은 뒤에는 인형 대신 사진 판이 선다', async () => {
  let busy = 0, peak = 0, started = 0;
  const gates: Array<() => void> = [];
  setPhotoLoader(noViews((url: string) => new Promise((done) => {
    started++;
    busy++;
    peak = Math.max(peak, busy);
    gates.push(() => { busy--; done(url.endsWith('7') ? Promise.reject(new Error('load')) as never : new THREE.Texture()); });
  })));
  try {
    const list = Array.from({ length: 10 }, (_, i) => createAvatar({ look: { kind: 'photo', url: `/api/avatar/1234567${i}` } }));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(started, 3, '처음에는 세 장만');
    // 하나씩 끝낼 때마다 다음 것이 시작된다
    for (let i = 0; i < 10; i++) {
      gates[i]();
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all(list.map((a) => a.ready));
    assert.equal(started, 10);
    assert.ok(peak <= 3, `동시에 ${peak}장`);
    assert.deepEqual(list.map((a) => a.shown()), ['photo', 'photo', 'photo', 'photo', 'photo', 'photo', 'photo', 'doll', 'photo', 'photo'], '못 받은 그림은 인형 그대로');
    // 사진 판이 서면 인형 메시는 보이지 않는다
    let dollShown = 0;
    list[0].group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name === 'doll' && o.visible) dollShown++; });
    assert.equal(dollShown, 0);
    list[0].update(1 / 60, { speed: 1.6, running: false, airborne: false, landing: false });
    list[0].update(1 / 60, { speed: 0, running: false, airborne: false, landing: false });
    for (let i = 0; i < 90; i++) list[0].update(1 / 60, { speed: 0, running: false, airborne: false, landing: false });
    list[0].group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name === 'doll' && o.visible) dollShown++; });
    assert.equal(dollShown, 0, '걷다 멈춰도 사진 캐릭터는 인형으로 돌아가지 않는다');
    for (const a of list) a.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('사진 받기 차례를 기다리던 캐릭터가 사라지면 그 그림은 받지 않고, 뒤에 온 그림이 바로 차례를 받는다', async () => {
  const started: string[] = [];
  const gates = new Map<string, () => void>();
  setPhotoLoader(noViews((url: string) => new Promise((done) => {
    started.push(url);
    gates.set(url, () => done(new THREE.Texture()));
  })));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  try {
    const url = (i: number) => `/api/avatar/2234567${i}`;
    const crowd = Array.from({ length: 9 }, (_, i) => createAvatar({ look: { kind: 'photo', url: url(i) } }));
    await tick();
    assert.deepEqual(started, [url(0), url(1), url(2)], '처음에는 세 장만 받는다');
    // 장면이 바뀌어 모두 사라진다(줄에 선 여섯은 아직 받기 전)
    for (const a of crowd) a.dispose();
    // 새 장면의 내 캐릭터
    const mine = createAvatar({ look: { kind: 'photo', url: '/api/avatar/99999999' } });
    // 받던 세 장이 끝나면, 줄에 섰던 죽은 여섯은 받지 않고 건너뛰어 내 그림이 바로 받아진다
    for (let i = 0; i < 3; i++) gates.get(url(i))!();
    await tick();
    await tick();
    assert.deepEqual(started.slice(3), ['/api/avatar/99999999'], `죽은 요청을 받았다: ${started.slice(3).join(', ')}`);
    gates.get('/api/avatar/99999999')!();
    await mine.ready;
    assert.equal(mine.shown(), 'photo');
    mine.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('이름표 접기: 접으면 이름 스프라이트만 숨고 말풍선은 그대로, 새 이름도 접힌 채로 붙는다', () => {
  const a = createAvatar({ color: '#5b7fa6', name: '손님' });
  a.setBubble('안녕하세요');
  const sprites = () => a.group.children.filter((c) => (c as THREE.Sprite).isSprite) as THREE.Sprite[];
  assert.deepEqual(sprites().map((x) => x.visible), [true, true]);
  assert.equal(a.setNameShown(false), true);
  assert.equal(a.setNameShown(false), false, '같은 값이면 바뀐 것이 없다');
  assert.equal(sprites().filter((x) => x.visible).length, 1);
  a.setName('다른 손님');
  assert.equal(sprites().filter((x) => x.visible).length, 1, '새 이름표도 접힌 채');
  a.setNameShown(true);
  assert.equal(sprites().filter((x) => x.visible).length, 2);
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

test('기하는 겉모습마다 함께 쓰고 인형 재질은 하나, 이름표·말풍선까지 dispose 뒤 남는 것이 없다', () => {
  assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  const list = Array.from({ length: 30 }, (_, i) => createAvatar({ color: i % 2 ? '#c0563c' : '#5b7fa6', name: `손님 ${i}` }));
  const dolls = new Set(list.map((a) => (a.group.getObjectByName('doll') as THREE.Mesh).geometry));
  assert.equal(dolls.size, 2, '겉모습이 같은 사람은 기하를 함께 쓴다(두 색 → 두 벌)');
  const st = avatarStats();
  assert.equal(st.avatars, 30);
  assert.equal(st.geometries, 2 * 4, '겉모습마다 몸통 덩이·다리·팔·서 있는 온몸 네 벌');
  assert.equal(st.materials, 1, '인형 재질은 모두 하나');
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
  assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
});

test('다 쓴 2D 캔버스는 바로 비운다: 이름표·말풍선은 뗄 때, 사진 그림은 마지막으로 쓰던 사람이 놓을 때', async () => {
  const doc = (globalThis as unknown as { document: { createElement: () => { width: number; height: number } } }).document;
  const made: Array<{ width: number; height: number }> = [];
  const real = doc.createElement;
  doc.createElement = () => { const c = real(); made.push(c); return c; };
  setPhotoLoader(() => Promise.resolve({ width: 400, height: 800 } as never));
  try {
    const a = createAvatar({ color: '#5b7fa6', name: '손님' });
    a.setBubble('안녕하세요');
    const labels = made.splice(0).filter((c) => c.width > 4);
    assert.equal(labels.length, 2, '이름표와 말풍선');
    a.setBubble(null);
    assert.deepEqual(labels.map((c) => c.width > 0), [true, false], '뗀 말풍선만 비운다');
    a.dispose();
    assert.deepEqual(labels.map((c) => [c.width, c.height]), [[0, 0], [0, 0]]);

    made.length = 0;
    const p1 = createAvatar({ look: { kind: 'photo', url: '/api/avatar/shared-canvas' } });
    const p2 = createAvatar({ look: { kind: 'photo', url: '/api/avatar/shared-canvas' } });
    await Promise.all([p1.ready, p2.ready]);
    assert.equal(p1.shown(), 'photo');
    const pics = made.filter((c) => c.width > 4);
    assert.equal(pics.length, 1, '같은 주소는 캔버스 한 장을 함께 쓴다');
    p1.dispose();
    assert.ok(pics[0].width > 0 && pics[0].height > 0, '아직 쓰는 사람이 있으면 비우지 않는다');
    p2.dispose();
    assert.deepEqual([pics[0].width, pics[0].height], [0, 0]);
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
    doc.createElement = real;
  }
});

/** 사진 판이 지금 그리는 그림 범위: 묶음의 몇째 칸인지(그림 한 장 전체면 cell -1)와 좌우가 뒤집혔는지 */
const cardCell = (av: { group: THREE.Group }, name = 'photo-card') => {
  const card = av.group.getObjectByName(name) as THREE.Mesh;
  const uv = card.geometry.attributes.uv as THREE.BufferAttribute, pos = card.geometry.attributes.position as THREE.BufferAttribute;
  let minX = Infinity, maxX = -Infinity, left = 0, right = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < minX) { minX = x; left = uv.getX(i); }
    if (x > maxX) { maxX = x; right = uv.getX(i); }
  }
  const span = Math.abs(right - left);
  return { cell: span > 0.9 ? -1 : Math.round(Math.min(left, right) * 5), flip: left > right };
};

test('방향 그림 묶음을 먼저 받는다: 손가락 기기는 작은 것, 없으면 그림 한 장, 없던 주소는 3분 동안 다시 묻지 않는다', async () => {
  const asked: string[] = [];
  let now = 1000;
  // 묶음이 있는 캐릭터(aaaa…)와 없는 캐릭터(bbbb…), 묶음 주소에서 엉뚱한 그림이 오는 캐릭터(cccc…)
  setPhotoLoader((url: string) => {
    asked.push(url);
    if (!url.includes('/views?')) return Promise.resolve(new THREE.Texture());
    if (url.includes('aaaa')) return Promise.resolve({ width: 1920, height: 576 } as never);
    if (url.includes('cccc')) return Promise.resolve({ width: 1024, height: 1536 } as never);
    return Promise.reject(new Error('404'));
  }, () => now);
  try {
    const A = '/api/avatar/aaaa1111', B = '/api/avatar/bbbb2222', C = '/api/avatar/cccc3333';
    const big = createAvatar({ look: { kind: 'photo', url: A } });
    const small = createAvatar({ look: { kind: 'photo', url: A }, photoSize: 's' });
    await Promise.all([big.ready, small.ready]);
    assert.deepEqual(asked.splice(0), [`${A}/views?s=l`, `${A}/views?s=s`], '묶음만 받고 그림 한 장은 받지 않는다');
    assert.deepEqual([big.shown(), small.shown()], ['photo', 'photo']);
    assert.deepEqual(cardCell(big), { cell: 0, flip: false }, '처음에는 앞모습 칸');
    // 묶음은 캔버스로 줄이지 않고 받은 그림 그대로 올린다
    const tex = ((big.group.getObjectByName('photo-card') as THREE.Mesh).material as THREE.MeshStandardMaterial).map!;
    assert.ok(!(tex as THREE.CanvasTexture).isCanvasTexture && (tex.image as { width: number }).width === 1920);
    assert.equal(tex.anisotropy, 4);
    assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
    assert.equal(avatarStats().geometries, 4 + 8, '인형 네 벌 + 구역마다의 판 여덟 가지(두 사람이 함께 쓴다)');

    // 묶음이 없으면 그림 한 장으로 돌아간다
    const plain = createAvatar({ look: { kind: 'photo', url: B } });
    await plain.ready;
    assert.deepEqual(asked.splice(0), [`${B}/views?s=l`, B]);
    assert.equal(plain.shown(), 'photo');
    assert.deepEqual(cardCell(plain), { cell: -1, flip: false }, '그림 한 장은 판 전체에');
    // 묶음 주소에서 묶음 모양(10:3)이 아닌 그림이 오면 쓰지 않는다
    const odd = createAvatar({ look: { kind: 'photo', url: C } });
    await odd.ready;
    assert.deepEqual(asked.splice(0), [`${C}/views?s=l`, C]);
    assert.deepEqual(cardCell(odd), { cell: -1, flip: false });
    plain.dispose();
    odd.dispose();

    // 없던 주소는 3분 동안 다시 묻지 않고 바로 그림 한 장을 받는다. 3분이 지나면 다시 묻는다
    now += 179_000;
    const again = createAvatar({ look: { kind: 'photo', url: B } });
    await again.ready;
    assert.deepEqual(asked.splice(0), [B]);
    again.dispose();
    now += 2_000;
    const later = createAvatar({ look: { kind: 'photo', url: B } });
    await later.ready;
    assert.deepEqual(asked.splice(0), [`${B}/views?s=l`, B]);
    later.dispose();
    // 크기가 다르면 다른 주소다: 작은 것은 따로 묻는다
    const tiny = createAvatar({ look: { kind: 'photo', url: B }, photoSize: 's' });
    await tiny.ready;
    assert.deepEqual(asked.splice(0), [`${B}/views?s=s`, B]);
    tiny.dispose();

    big.dispose();
    small.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('방향 그림 묶음이 늦게 오면 걷는 중에 바꿔 끼운다: 45·90·180·360초에 다시 묻고, 캐릭터는 새로 만들지 않는다', async () => {
  const asked: string[] = [];
  let now = 0, seq = 0;
  const has = new Set<string>();
  const due: Array<{ id: number; at: number; fn: () => void }> = [];
  const timers = {
    set: (fn: () => void, ms: number) => { due.push({ id: ++seq, at: now + ms, fn }); return seq; },
    clear: (h: unknown) => { const i = due.findIndex((d) => d.id === h); if (i >= 0) due.splice(i, 1); },
  };
  /** 시계를 ms만큼 돌리고, 때가 된 예약을 부른 뒤 받기가 끝나기를 기다린다 */
  const pass = async (ms: number) => {
    now += ms;
    for (const d of due.filter((x) => x.at <= now)) { due.splice(due.indexOf(d), 1); d.fn(); }
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  setPhotoLoader((url: string) => {
    asked.push(url);
    if (!url.includes('/views?')) return Promise.resolve(new THREE.Texture());
    return [...has].some((k) => url.includes(k)) ? Promise.resolve({ width: 1920, height: 576 } as never) : Promise.reject(new Error('404'));
  }, () => now, timers);
  try {
    const U = '/api/avatar/eeee5555', V = `${U}/views?s=l`;
    let changes = 0;
    const a = createAvatar({ look: { kind: 'photo', url: U }, sun: 0.6, onChange: () => { changes++; } });
    const b = createAvatar({ look: { kind: 'photo', url: U } });
    await Promise.all([a.ready, b.ready]);
    assert.deepEqual(asked.splice(0), [V, U], '묶음이 없어 그림 한 장으로 선다');
    assert.deepEqual([a.views(), b.views(), changes], [1, 1, 1], '그림이 도착했다고 한 번 알린다');
    assert.equal(due.length, 1, '다시 묻기는 그림(주소)마다 하나: 캐릭터 수만큼 걸지 않는다');
    const card = a.group.getObjectByName('photo-card') as THREE.Mesh;
    const shade = a.group.getObjectByName('photo-shade') as THREE.Mesh;
    const oldMat = card.material as THREE.MeshStandardMaterial;
    let freed = 0;
    oldMat.map!.addEventListener('dispose', () => { freed++; });
    oldMat.addEventListener('dispose', () => { freed++; });

    await pass(44_000);
    assert.deepEqual(asked, [], '45초 전에는 묻지 않는다');
    await pass(1_000);
    assert.deepEqual(asked.splice(0), [V], '45초에 다시 묻는다(아직 없다)');
    assert.deepEqual([a.views(), changes, due.length], [1, 1, 1]);
    has.add('eeee');
    await pass(44_000);
    assert.deepEqual(asked, [], '다음은 90초');
    await pass(1_000);
    assert.deepEqual(asked.splice(0), [V]);
    // 같은 캐릭터, 같은 판이 방향 그림으로 바뀐다
    assert.deepEqual([a.views(), b.views()], [5, 5]);
    assert.equal(a.group.getObjectByName('photo-card'), card, '판을 새로 만들지 않는다');
    const mat = card.material as THREE.MeshStandardMaterial;
    assert.notEqual(mat, oldMat);
    assert.equal((mat.map!.image as { width: number }).width, 1920);
    assert.equal(mat.alphaToCoverage, true);
    const matB = (b.group.getObjectByName('photo-card') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    assert.notEqual(matB, mat, '재질은 캐릭터마다(걸음 값이 저마다 다르다)');
    assert.equal(matB.map, mat.map, '같은 그림을 쓰는 캐릭터는 텍스처를 함께 쓴다');
    assert.equal(freed, 2, '옛 텍스처와 재질은 놓는다');
    assert.equal(changes, 2, '바뀌었다고 알린다(엔진이 다시 그린다)');
    assert.equal(due.length, 0, '묶음을 받았으니 더 묻지 않는다');
    // 그림자 판도 새 그림을 쓴다
    assert.equal((shade.material as THREE.MeshBasicMaterial).map, mat.map);
    assert.ok(shade.customDepthMaterial && (shade.customDepthMaterial as THREE.MeshDepthMaterial).map === mat.map);
    // 다음 face가 지금 보는 방향의 그림을 고른다: 캐릭터 왼쪽 옆에서 보면 옆모습 칸
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(5, 1.2, 0);
    cam.lookAt(0, 0.6, 0);
    cam.updateMatrixWorld();
    assert.equal(a.face(cam), false, '처음 고를 때처럼 폭을 줄이지 않는다');
    assert.deepEqual(cardCell(a), { cell: 2, flip: false });
    assert.equal(avatarStats().geometries, 4 + 8, '한 장용 판은 놓고 구역 판 여덟 가지를 쓴다');
    a.dispose();
    b.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });

    // 캐릭터가 사라지면 예약도 사라진다
    const gone = createAvatar({ look: { kind: 'photo', url: '/api/avatar/ffff6666' } });
    await gone.ready;
    asked.splice(0);
    assert.equal(due.length, 1);
    gone.dispose();
    assert.equal(due.length, 0);
    await pass(400_000);
    assert.deepEqual(asked, []);

    // 네 번 물어도 없으면 그만둔다
    const never = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abab7777' } });
    await never.ready;
    asked.splice(0);
    const at: number[] = [];
    const t0 = now;
    for (let i = 0; i < 160; i++) { await pass(5_000); if (asked.splice(0).length) at.push((now - t0) / 1000); }
    assert.deepEqual(at, [45, 90, 180, 360], '처음 없었던 때부터 45초, 90초, 180초, 360초 뒤');
    assert.equal(due.length, 0);
    assert.equal(never.views(), 1);
    never.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('묶음 다시 묻기는 주소마다 이어진다: 캐릭터가 사라졌다 곧 다시 와도 처음부터 묻지 않고, 네 번이면 그만둔다', async () => {
  const asked: string[] = [];
  let now = 0, seq = 0;
  const due: Array<{ id: number; at: number; fn: () => void }> = [];
  const timers = {
    set: (fn: () => void, ms: number) => { due.push({ id: ++seq, at: now + ms, fn }); return seq; },
    clear: (h: unknown) => { const i = due.findIndex((d) => d.id === h); if (i >= 0) due.splice(i, 1); },
  };
  const pass = async (ms: number) => {
    now += ms;
    for (const d of due.filter((x) => x.at <= now)) { due.splice(due.indexOf(d), 1); d.fn(); }
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  setPhotoLoader((url: string) => {
    asked.push(url);
    return url.includes('/views?') ? Promise.reject(new Error('404')) : Promise.resolve(new THREE.Texture());
  }, () => now, timers);
  try {
    const U = '/api/avatar/cdcd8888', V = `${U}/views?s=l`;
    const views = () => asked.filter((u) => u === V).length;
    const come = async () => {
      const a = createAvatar({ look: { kind: 'photo', url: U } });
      await a.ready;
      return a;
    };
    let a = await come();
    assert.equal(views(), 1, '처음 한 번');
    await pass(45_000);
    assert.equal(views(), 2, '45초에 다시');
    // 사라졌다 곧 다시 온다: 처음 묻기는 건너뛰고(3분 안), 다시 묻기는 다음 차례부터
    for (const [gap, n] of [[45_000, 3], [90_000, 4], [180_000, 5]] as const) {
      a.dispose();
      a = await come();
      assert.equal(views(), n - 1, '곧 다시 와도 바로 묻지 않는다');
      await pass(gap);
      assert.equal(views(), n, `다음 차례(${gap / 1000}초 뒤)`);
    }
    await pass(170_000);
    assert.equal(views(), 5, '네 번 다시 물었으면 그만둔다');
    assert.equal(due.length, 0);
    // 마지막으로 없던 때에서 3분이 지나 다시 오면 한 번만 묻는다(그 뒤 다시 묻기는 없다)
    a.dispose();
    await pass(10_000);
    a = await come();
    assert.equal(views(), 6);
    await pass(400_000);
    assert.equal(views(), 6);
    a.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('묶음을 묻는 사이 캐릭터가 사라지면 그림 한 장도 받지 않는다. 그림 한 장도 못 받으면 인형 그대로', async () => {
  const asked: string[] = [];
  let fail: (() => void) | null = null;
  setPhotoLoader((url: string) => {
    asked.push(url);
    if (url.includes('/views?')) return new Promise((_, no) => { fail = () => no(new Error('404')); });
    return Promise.reject(new Error('gone'));
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  try {
    const gone = createAvatar({ look: { kind: 'photo', url: '/api/avatar/dddd4444' } });
    await tick();
    assert.deepEqual(asked, ['/api/avatar/dddd4444/views?s=l']);
    gone.dispose();
    fail!();
    await tick();
    assert.deepEqual(asked, ['/api/avatar/dddd4444/views?s=l'], '쓰는 사람이 없으면 그림 한 장을 받지 않는다');
    // 묶음도 그림 한 장도 못 받은 사람은 인형으로 남는다(던지지 않는다)
    const doll = createAvatar({ look: { kind: 'photo', url: '/api/avatar/eeee5555' } });
    await tick();
    fail!();
    await doll.ready;
    assert.equal(doll.shown(), 'doll');
    assert.deepEqual(asked.slice(1), ['/api/avatar/eeee5555/views?s=l', '/api/avatar/eeee5555']);
    doll.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('방향 그림: 카메라가 도는 대로, 캐릭터가 도는 대로 맞는 칸을 보인다(카메라를 등지고 가면 뒷모습)', async () => {
  setPhotoLoader((url: string) => (url.includes('/views?') ? Promise.resolve({ width: 1280, height: 384 } as never) : Promise.reject(new Error('none'))));
  try {
    const av = createAvatar({ look: { kind: 'photo', url: '/api/avatar/ffff6666' }, photoSize: 's' });
    await av.ready;
    assert.equal(av.shown(), 'photo');
    const cam = new THREE.PerspectiveCamera();
    /** 몸이 bodyYaw를 보고, 카메라가 캐릭터 둘레 camAt 쪽(세계 방위각, +z가 0)에 있을 때 보이는 칸 */
    const see = (bodyYaw: number, camAt: number) => {
      av.group.rotation.y = bodyYaw;
      cam.position.set(Math.sin(camAt) * 5, 1.6, Math.cos(camAt) * 5);
      cam.updateMatrixWorld(true);
      av.face(cam);
      return cardCell(av);
    };
    const Q = Math.PI / 4;
    // 몸이 +z를 본다: 카메라가 앞이면 앞모습, 캐릭터 왼쪽(+x)이면 그려진 그대로의 옆모습, 오른쪽이면 뒤집은 옆모습, 뒤면 뒷모습
    assert.deepEqual(see(0, 0), { cell: 0, flip: false });
    assert.deepEqual(see(0, Q), { cell: 1, flip: false });
    assert.deepEqual(see(0, 2 * Q), { cell: 2, flip: false });
    assert.deepEqual(see(0, 3 * Q), { cell: 3, flip: false });
    assert.deepEqual(see(0, 4 * Q), { cell: 4, flip: false });
    assert.deepEqual(see(0, -Q), { cell: 1, flip: true });
    assert.deepEqual(see(0, -2 * Q), { cell: 2, flip: true });
    assert.deepEqual(see(0, -3 * Q), { cell: 3, flip: true });
    // 카메라는 그대로 두고 캐릭터가 돌아도 같다: 카메라를 등지면 뒷모습, 카메라 쪽으로 오면 앞모습
    assert.deepEqual(see(Math.PI, 0), { cell: 4, flip: false });
    assert.deepEqual(see(2 * Q, 0), { cell: 2, flip: true });
    assert.deepEqual(see(-2 * Q, 0), { cell: 2, flip: false });
    assert.deepEqual(see(1.2, 1.2), { cell: 0, flip: false });
    // 경계 근처에서 조금 움직이는 동안에는 그림이 바뀌지 않는다(22.5도 경계, 6도 붙들기)
    assert.deepEqual(see(0, 0.1), { cell: 0, flip: false });
    assert.deepEqual(see(0, 0.45), { cell: 0, flip: false }, '경계를 3도 넘어도 앞모습 그대로');
    assert.deepEqual(see(0, 0.52), { cell: 1, flip: false }, '7도 넘으면 앞 비스듬');
    assert.deepEqual(see(0, 0.33), { cell: 1, flip: false }, '돌아와도 경계 안쪽 6도까지는 그대로');
    // 판은 여전히 카메라 쪽을 본다(그림만 바뀐다)
    const card = av.group.getObjectByName('photo-card') as THREE.Object3D;
    av.group.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(card.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(Math.abs(angleDiff(Math.atan2(n.x, n.z), 0.33)) < 1e-6);
    av.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

/** 가짜 그림 받기: 묶음 주소에는 묶음 모양 그림을, 그림 한 장 주소에는 세로 그림을 준다 */
const fakeViews = (url: string) => Promise.resolve((url.includes('/views?') ? { width: 1920, height: 576 } : { width: 400, height: 600 }) as never);
/** 세계에서 그 물체의 앞면(로컬 +z)이 향하는 방향 */
const frontOf = (o: THREE.Object3D) => {
  let top: THREE.Object3D = o;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  return new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
};

test('판의 빛과 가장자리: 법선은 위로 기운 둥근 기둥, 가장자리는 덮인 몫으로 다듬고, 스스로 내는 빛은 낮다', async () => {
  setPhotoLoader(fakeViews);
  try {
    const av = createAvatar({ look: { kind: 'photo', url: '/api/avatar/aaaa0001' } });
    await av.ready;
    const card = av.group.getObjectByName('photo-card') as THREE.Mesh;
    const pos = card.geometry.attributes.position as THREE.BufferAttribute, nor = card.geometry.attributes.normal as THREE.BufferAttribute;
    // 걷는 다리가 판 아래쪽을 휘므로 엉덩이 높이 아래와 가운데를 촘촘히 나눈다
    assert.equal(pos.count, 11 * 12, '가로 열한 줄, 세로 열두 줄');
    let lo = Infinity, hi = -Infinity, wide = 0;
    for (let i = 0; i < pos.count; i++) {
      const n = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
      assert.ok(Math.abs(n.length() - 1) < 1e-6, '법선 길이 1');
      // 어느 꼭짓점이든 같은 만큼 위를 본다(수평 1에 위로 0.6)
      assert.ok(Math.abs(n.y / Math.hypot(n.x, n.z) - 0.6) < 1e-6);
      // 가운데는 정면, 끝으로 갈수록 그쪽으로 돈다(끝에서 50도)
      const bend = Math.atan2(n.x, n.z) * (180 / Math.PI);
      assert.ok(Math.abs(bend - (pos.getX(i) / (PHOTO_H / 3)) * 50) < 1e-4, `x ${pos.getX(i)} → ${bend}도`);
      assert.equal(pos.getZ(i), 0, '판은 평평하다(법선만 둥글다)');
      lo = Math.min(lo, pos.getY(i)); hi = Math.max(hi, pos.getY(i)); wide = Math.max(wide, Math.abs(pos.getX(i)));
    }
    assert.ok(Math.abs(lo) < 1e-6 && Math.abs(hi - PHOTO_H) < 1e-6 && Math.abs(wide - PHOTO_H / 3) < 1e-6, '발이 원점, 키 1.3m, 폭은 키의 2/3');
    const m = card.material as THREE.MeshStandardMaterial;
    assert.equal(m.alphaToCoverage, true);
    assert.equal(m.alphaTest, 0.5);
    assert.equal(m.transparent, false, '반투명으로 섞어 그리지 않는다(깊이 순서가 뒤집히지 않게)');
    // 덮인 몫을 정하려고 내보낸 알파가 캔버스에 적히지 않는다: 색은 덮어쓰고 알파는 있던 값 그대로(적히면 가장자리에 페이지 바탕이 비친다)
    assert.deepEqual([m.blending, m.blendSrc, m.blendDst, m.blendSrcAlpha, m.blendDstAlpha], [THREE.CustomBlending, THREE.OneFactor, THREE.ZeroFactor, THREE.ZeroFactor, THREE.OneFactor]);
    // 눕혀 그리는 셰이더 손질: three의 표준 꼭짓점 셰이더에서 두 자리를 찾아 바꾼다(three를 올렸을 때 자리가 사라지면 여기서 알 수 있다)
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader as never, null as never);
    assert.equal(shader.uniforms.photoLean, m.userData.photoLean);
    assert.ok(shader.vertexShader.includes('uniform vec2 photoLean;') && shader.vertexShader.includes('photoLean.y'), '눕히기 코드가 들어갔다');
    assert.ok(shader.vertexShader.indexOf('uniform vec2 photoLean;') < shader.vertexShader.indexOf('void main'), '선언은 main 앞에');
    assert.equal(shader.vertexShader.split('#include <project_vertex>').length, 2, '원래 투영 조각은 그대로 한 번');
    assert.equal(shader.fragmentShader, THREE.ShaderLib.standard.fragmentShader, '화소 셰이더는 건드리지 않는다');
    assert.notEqual(m.customProgramCacheKey(), new THREE.MeshStandardMaterial().customProgramCacheKey());
    assert.equal(m.emissiveIntensity, PHOTO_GLOW);
    // 화면에서 인형과 견줘 정한 값: 이보다 크면 인형 옆에서 혼자 환하다
    assert.ok(PHOTO_GLOW >= 0.12 && PHOTO_GLOW <= 0.16, `스스로 내는 빛 ${PHOTO_GLOW}`);
    assert.equal(m.emissiveMap, m.map);
    av.dispose();
    // 그림 한 장도 같은 법선과 재질을 쓴다
    setPhotoLoader(noViews(() => Promise.resolve({ width: 400, height: 600 } as never)));
    const one = createAvatar({ look: { kind: 'photo', url: '/api/avatar/aaaa0002' } });
    await one.ready;
    const g = (one.group.getObjectByName('photo-card') as THREE.Mesh).geometry;
    assert.equal(g.attributes.position.count, 11 * 12);
    assert.ok(Math.abs(g.attributes.normal.getY(0) - 0.6 / Math.hypot(1, 0.6)) < 1e-6);
    assert.equal(((one.group.getObjectByName('photo-card') as THREE.Mesh).material as THREE.MeshStandardMaterial).alphaToCoverage, true);
    one.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('3인칭(plane): 모든 판이 카메라 화면과 나란히 서고 조금 뒤로 눕는다. 그림은 여전히 카메라 자리로 고른다', async () => {
  setPhotoLoader(fakeViews);
  try {
    const list = [-3, 0, 3].map((x, i) => {
      const a = createAvatar({ look: { kind: 'photo', url: `/api/avatar/bbbb000${i}` }, name: `손님${i}` });
      a.group.position.set(x, 0, 0);
      return a;
    });
    await Promise.all(list.map((a) => a.ready));
    const cam = new THREE.PerspectiveCamera();
    // 3인칭 카메라: 가운데 사람 뒤 위에서 내려다본다
    const pitch = 0.9;
    cam.position.set(0, 1 + Math.sin(pitch) * 6, Math.cos(pitch) * 6);
    cam.lookAt(0, 1, 0);
    cam.updateMatrixWorld(true);
    for (const a of list) a.face(cam, 'plane');
    const fronts = list.map((a) => frontOf(a.group.getObjectByName('photo-card')!));
    // 화면과 나란히: 세 판의 방위가 모두 카메라가 보는 쪽의 반대(+z)다. 카메라 자리를 보게 하면 양옆 사람은 안쪽으로 틀어진다
    for (const f of fronts) assert.ok(Math.abs(Math.atan2(f.x, f.z)) < 1e-6, `방위 ${Math.atan2(f.x, f.z)}`);
    // 뒤로 눕히는 각 = leanFor(내려다보는 각)(49도까지는 그 절반, 더 가파르면 줄인다). 판을 돌려 눕히지 않고(벽에 박힌다) 셰이더에 (cos, sin)으로 넘긴다
    for (const f of fronts) assert.ok(Math.abs(f.y) < 1e-9, '판은 서 있다');
    const lean = leanFor(pitch);
    assert.ok(lean > 0 && lean < pitch * PHOTO_LEAN, '이 각(51.6도)에서는 절반보다 조금 덜 눕힌다');
    const shared = ((list[0].group.getObjectByName('photo-card') as THREE.Mesh).material as THREE.Material).userData.photoLean as { value: THREE.Vector2 };
    assert.ok(Math.abs(shared.value.x - Math.cos(lean)) < 1e-6 && Math.abs(shared.value.y - Math.sin(lean)) < 1e-6, `눕히는 각 ${shared.value.toArray()}`);
    assert.ok(PHOTO_LEAN >= 0 && PHOTO_LEAN <= 0.5);
    // 이름표는 눕힌 판의 머리 위에 있다(카메라에서 먼 쪽으로 물러난다)
    const label = list[1].group.children.find((c) => (c as THREE.Sprite).isSprite)!;
    const top = PHOTO_H + 0.06;
    assert.ok(Math.abs(label.position.y - top * Math.cos(lean)) < 1e-6 && Math.abs(label.position.z + top * Math.sin(lean)) < 1e-6, `이름표 ${label.position.toArray()}`);
    // 그림은 카메라의 자리로 고른다: 왼쪽 사람(x -3)에게 카메라는 그 사람의 왼쪽 앞, 오른쪽 사람에게는 오른쪽 앞이다
    assert.deepEqual(list.map((a) => cardCell(a)), [{ cell: 1, flip: false }, { cell: 0, flip: false }, { cell: 1, flip: true }]);
    // 1인칭(position)으로 돌아가면 서 있는 판이 카메라 자리를 보고, 이름표도 제자리로
    for (const a of list) a.face(cam, 'position');
    const f0 = frontOf(list[0].group.getObjectByName('photo-card')!);
    assert.ok(Math.abs(f0.y) < 1e-9 && Math.abs(angleDiff(Math.atan2(f0.x, f0.z), Math.atan2(3, cam.position.z))) < 1e-6);
    assert.deepEqual(label.position.toArray(), [0, top, 0]);
    assert.deepEqual(shared.value.toArray(), [1, 0], '1인칭은 눕히지 않는다');
    // 꼭 위에서 내려다보면(평면 위 방향이 없다) 카메라 자리를 본다: 던지지 않는다
    cam.position.set(0.5, 9, 0);
    cam.lookAt(0.5, 0, 0);
    cam.updateMatrixWorld(true);
    assert.doesNotThrow(() => list[0].face(cam, 'plane'));
    for (const a of list) a.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

/**
 * 판을 눕혀 그리는 셰이더(avatar.ts LEAN_VERTEX)가 꼭짓점마다 하는 계산을 그대로 옮긴 것. 셰이더는 노드에서 돌릴 수 없어 같은 식을 여기서 돌린다
 * (두 식이 같은지는 아래 시험이 셰이더 글자로 본다). 돌려주는 값은 화면 밖을 자르기 전의 좌표(clip)다
 */
const leanDrawn = (v: THREE.Vector3, lean: THREE.Vector2, mvp: THREE.Matrix4) => {
  const stand = new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(mvp);
  const leaned = new THREE.Vector4(v.x, v.y * lean.x, -v.y * lean.y, 1).applyMatrix4(mvp);
  if (stand.w > 0 && leaned.w > 0) leaned.z = (stand.z / stand.w) * leaned.w;
  return leaned;
};

test('눕혀 그리기: 화면 위 자리는 뒤로 눕힌 판, 깊이는 서 있는 판이다. 기본 각에서는 벽에 붙어 서도 벽에 가려지지 않는다(판을 돌려 눕히면 머리가 벽 뒤로 간다)', async () => {
  setPhotoLoader(fakeViews);
  try {
    const av = createAvatar({ look: { kind: 'photo', url: '/api/avatar/eeee0001' } });
    av.group.position.set(2, 0, -1);
    av.group.rotation.y = 0.7;
    await av.ready;
    const card = av.group.getObjectByName('photo-card') as THREE.Mesh;
    const m = card.material as THREE.MeshStandardMaterial;
    // 셰이더에 들어간 식이 위 leanDrawn과 같은지 글자로 본다: 셰이더를 고치면 여기서 걸리고, 그때 leanDrawn도 함께 고친다
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: '' };
    m.onBeforeCompile(shader as never, null as never);
    const glsl = shader.vertexShader.replace(/\s+/g, ' ');
    for (const line of [
      'vec4 leaned = projectionMatrix * modelViewMatrix * vec4( transformed.x, transformed.y * photoLean.x, - transformed.y * photoLean.y, 1.0 );',
      'if ( gl_Position.w > 0.0 && leaned.w > 0.0 ) leaned.z = gl_Position.z / gl_Position.w * leaned.w;',
      'gl_Position = leaned;',
    ]) assert.ok(glsl.includes(line), `셰이더에 없다: ${line}`);
    // 집 안 3인칭의 기본 카메라처럼: 캐릭터의 가슴께를 보며 뒤 위에서 49도쯤 내려다본다
    const pitch = 0.85, yaw = 0.4, dist = 6.2;
    const aim = av.group.position.clone().setY(1);
    /** 바닥에서 캐릭터 → 카메라 쪽 */
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
    cam.position.copy(aim).addScaledVector(back, Math.cos(pitch) * dist).setY(aim.y + Math.sin(pitch) * dist);
    cam.lookAt(aim);
    cam.updateMatrixWorld(true);
    av.face(cam, 'plane');
    av.group.updateMatrixWorld(true);
    const lean = (m.userData.photoLean as { value: THREE.Vector2 }).value;
    const mvp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(card.matrixWorld);
    /** 발을 축으로 판을 실제로 뒤로 눕혔을 때(돌려 눕히는 방식)의 자리 */
    const tilt = new THREE.Matrix4().makeRotationX(-pitch * PHOTO_LEAN);
    // 캐릭터 바로 뒤의 벽: 몸이 벽에 가장 가까이 설 수 있는 거리(몸 반지름)에 세운다. 끝없이 높다고 본다(허리까지 낮춘 벽보다 엄하다)
    const wall = new THREE.Plane().setFromNormalAndCoplanarPoint(back, av.group.position.clone().addScaledVector(back, -RADIUS));
    const pos = card.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const c = leanDrawn(v, lean, mvp);
      const drawn = new THREE.Vector3(c.x, c.y, c.z).divideScalar(c.w);
      const tilted = v.clone().applyMatrix4(tilt).applyMatrix4(card.matrixWorld);
      const want = tilted.clone().project(cam);
      assert.ok(Math.abs(drawn.x - want.x) < 1e-9 && Math.abs(drawn.y - want.y) < 1e-9, `화면 위 자리는 눕힌 판의 것: 꼭짓점 ${i}`);
      const stand = v.clone().applyMatrix4(card.matrixWorld).project(cam);
      assert.ok(Math.abs(drawn.z - stand.z) < 1e-9, `깊이는 서 있는 판의 것: 꼭짓점 ${i}`);
      // 그 화소로 가는 시선이 벽에 닿는 곳보다 판이 카메라에 가깝다: 벽에 가려지지 않는다
      const ray = new THREE.Ray(cam.position, new THREE.Vector3(drawn.x, drawn.y, 0.5).unproject(cam).sub(cam.position).normalize());
      const hit = ray.intersectPlane(wall, new THREE.Vector3());
      assert.ok(hit && hit.project(cam).z > drawn.z, `벽보다 앞에 그려진다: 꼭짓점 ${i}`);
      // 판을 돌려 눕혔다면 머리 쪽 꼭짓점은 벽 뒤에 있다(그래서 돌리지 않고 셰이더에서 눕힌다)
      if (v.y > PHOTO_H - 0.01) assert.ok(wall.distanceToPoint(tilted) < -0.2, `돌려 눕힌 머리와 벽 ${wall.distanceToPoint(tilted)}`);
    }
    // 눕힌 만큼 화면에서 키가 커 보인다(서 있는 판은 내려다보는 만큼 납작하게 눌린다)
    const screenY = (p: THREE.Vector3) => p.applyMatrix4(card.matrixWorld).project(cam).y;
    const footY = screenY(new THREE.Vector3());
    const grow = (screenY(new THREE.Vector3(0, PHOTO_H, 0).applyMatrix4(tilt)) - footY) / (screenY(new THREE.Vector3(0, PHOTO_H, 0)) - footY);
    assert.ok(grow > 1.3 && grow < 1.45, `화면에서 키가 ${grow}배`);
    av.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('보이던 그림이 바뀌면 0.12초 동안 판 폭이 줄었다 돌아온다. 그동안 face는 true(계속 그려야 한다), 줄인 움직임이면 바로 바뀐다', async () => {
  setPhotoLoader(fakeViews);
  const still = { speed: 0, running: false, airborne: false, landing: false };
  try {
    for (const reducedMotion of [false, true]) {
      const av = createAvatar({ look: { kind: 'photo', url: '/api/avatar/cccc0001' }, reducedMotion });
      await av.ready;
      const card = av.group.getObjectByName('photo-card') as THREE.Mesh;
      const cam = new THREE.PerspectiveCamera();
      const at = (a: number) => { cam.position.set(Math.sin(a) * 4, 1.6, Math.cos(a) * 4); cam.updateMatrixWorld(true); return av.face(cam); };
      // 처음 고를 때는 줄이지 않는다(그림이 막 온 캐릭터가 움찔하지 않게)
      assert.equal(at(Math.PI / 2), false);
      assert.deepEqual(cardCell(av), { cell: 2, flip: false });
      assert.equal(card.scale.x, 1);
      // 카메라가 돌아 앞모습으로 바뀐다
      const turning = at(0);
      assert.deepEqual(cardCell(av), { cell: 0, flip: false }, '그림은 그 자리에서 바뀐다');
      if (reducedMotion) {
        assert.equal(turning, false);
        av.update(1 / 60, still);
        assert.equal(card.scale.x, 1);
      } else {
        assert.equal(turning, true);
        let narrow = 1, frames = 0;
        while (at(0) && frames < 60) { av.update(1 / 60, still); narrow = Math.min(narrow, card.scale.x); frames++; }
        assert.ok(frames >= 7 && frames <= 8, `0.12초(60fps로 7~8프레임): ${frames}`);
        assert.ok(narrow < 0.9 && narrow > 0.7, `가장 좁을 때 ${narrow}`);
        assert.equal(card.scale.x, 1, '끝나면 제 폭');
        assert.equal(at(0), false);
        // 줄어드는 중에 또 바뀌어도 폭이 튀지 않는다(처음부터 다시 줄이지 않는다)
        at(Math.PI / 2);
        av.update(0.05, still);
        const mid = card.scale.x;
        at(Math.PI);
        assert.equal(card.scale.x, mid);
        av.update(1, still);
        assert.equal(card.scale.x, 1);
      }
      av.dispose();
    }
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('해 그림자: 보이는 판은 드리우지 않고, 해 쪽을 보는 그림자 전용 판이 해에서 본 방향의 그림으로 드리운다. 카메라가 움직여도 그대로다', async () => {
  setPhotoLoader(fakeViews);
  try {
    const SUN = 0.6;
    const av = createAvatar({ look: { kind: 'photo', url: '/api/avatar/dddd0001' }, sun: SUN });
    await av.ready;
    const card = av.group.getObjectByName('photo-card') as THREE.Mesh;
    const shade = av.group.getObjectByName('photo-shade') as THREE.Mesh;
    assert.ok(shade, '그림자 판이 있다');
    assert.equal(card.castShadow, false, '보이는 판은 그림자를 드리우지 않는다');
    assert.equal(shade.castShadow, true);
    // 그림자 카메라만 보는 레이어에 있다: 화면을 그리는 카메라(레이어 0)는 건너뛴다
    assert.equal(shade.layers.mask, 1 << SHADE_LAYER);
    assert.equal(shade.layers.test(new THREE.PerspectiveCamera().layers), false);
    const sm = shade.material as THREE.MeshBasicMaterial;
    assert.equal(sm.colorWrite, false);
    assert.equal(sm.depthWrite, false);
    // 그림자 단계는 이 재질의 그림과 알파 기준을 깊이 재질로 옮겨 쓴다: 없으면 네모 그림자가 된다
    assert.equal(sm.map, (card.material as THREE.MeshStandardMaterial).map);
    assert.equal(sm.alphaTest, 0.5);
    assert.equal(sm.side, THREE.DoubleSide);
    assert.ok(shade.customDepthMaterial && (shade.customDepthMaterial as THREE.MeshDepthMaterial).isMeshDepthMaterial);
    const cam = new THREE.PerspectiveCamera();
    const sunFacing = () => { const f = frontOf(shade); return Math.atan2(f.x, f.z); };
    const look = (body: number, camAt: number, mode: 'position' | 'plane' = 'position') => {
      av.group.rotation.y = body;
      cam.position.set(Math.sin(camAt) * 5, 3, Math.cos(camAt) * 5);
      cam.lookAt(0, 1, 0);
      cam.updateMatrixWorld(true);
      av.face(cam, mode);
    };
    // 몸이 해 쪽을 보면 그림자는 앞모습, 해를 등지면 뒷모습, 해가 캐릭터 왼쪽이면 왼쪽 옆모습
    look(SUN, 2.5);
    assert.deepEqual(cardCell(av, 'photo-shade'), { cell: 0, flip: false });
    look(SUN + Math.PI, 2.5);
    assert.deepEqual(cardCell(av, 'photo-shade'), { cell: 4, flip: false });
    look(SUN - Math.PI / 2, 2.5);
    assert.deepEqual(cardCell(av, 'photo-shade'), { cell: 2, flip: false });
    look(SUN + Math.PI / 2, 2.5);
    assert.deepEqual(cardCell(av, 'photo-shade'), { cell: 2, flip: true });
    // 카메라가 어디에 있든, 어떻게 세우든 그림자 판은 해 쪽을 보고 눕지 않으며 그림도 그대로다
    for (const [camAt, mode] of [[0, 'position'], [1.3, 'plane'], [-2.2, 'position'], [3.1, 'plane']] as const) {
      look(1.1, camAt, mode);
      assert.ok(Math.abs(angleDiff(sunFacing(), SUN)) < 1e-6, `카메라 ${camAt}: 그림자 판 방위 ${sunFacing()}`);
      assert.ok(Math.abs(frontOf(shade).y) < 1e-9, '그림자 판은 서 있다');
      assert.deepEqual(cardCell(av, 'photo-shade'), { cell: 1, flip: true }, '몸 1.1, 해 0.6: 해는 캐릭터의 오른쪽 앞');
    }
    // 끄면 드리우지 않는다
    av.setShadow(false);
    assert.equal(shade.castShadow, false);
    av.setShadow(true);
    assert.equal(shade.castShadow, true);
    av.dispose();
    // 해가 없는 장면(방), 그림자를 드리우지 않는 기기(손가락 기기)는 그림자 판을 두지 않는다
    const room = createAvatar({ look: { kind: 'photo', url: '/api/avatar/dddd0001' } });
    const phone = createAvatar({ look: { kind: 'photo', url: '/api/avatar/dddd0001' }, sun: SUN, cast: false });
    // 그림 한 장도 그림자 판을 쓴다(판 전체 그림)
    setPhotoLoader(noViews(() => Promise.resolve({ width: 400, height: 600 } as never)));
    const one = createAvatar({ look: { kind: 'photo', url: '/api/avatar/dddd0002' }, sun: SUN });
    await Promise.all([room.ready, phone.ready, one.ready]);
    for (const a of [room, phone]) {
      assert.equal(a.shown(), 'photo');
      assert.equal(a.group.getObjectByName('photo-shade'), undefined);
      assert.equal((a.group.getObjectByName('photo-card') as THREE.Mesh).castShadow, false);
    }
    assert.deepEqual(cardCell(one, 'photo-shade'), { cell: -1, flip: false });
    one.group.rotation.y = 2;
    cam.position.set(4, 2, -3);
    cam.updateMatrixWorld(true);
    one.face(cam);
    const f = frontOf(one.group.getObjectByName('photo-shade')!);
    assert.ok(Math.abs(angleDiff(Math.atan2(f.x, f.z), SUN)) < 1e-6);
    for (const a of [room, phone, one]) a.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
});

test('사진 판은 face(카메라)로 그리기 전에 카메라 쪽을 본다: 화면에 그려진 적이 없어도, 몸이 어느 쪽을 보고 있어도', async () => {
  setPhotoLoader(() => Promise.resolve({ width: 400, height: 800 } as never));
  try {
    const av = createAvatar({ look: { kind: 'photo', url: '/api/avatar/face-test' } });
    await av.ready;
    assert.equal(av.shown(), 'photo');
    const card = av.group.getObjectByName('photo-card') as THREE.Object3D;
    assert.ok(card, '사진 판이 있다');
    const cam = new THREE.PerspectiveCamera();
    /** 판의 앞면(로컬 +z)이 세계에서 향하는 방위각 */
    const facing = () => {
      av.group.updateMatrixWorld(true);
      const q = card.getWorldQuaternion(new THREE.Quaternion());
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      return Math.atan2(n.x, n.z);
    };
    const cases: Array<[number, number, number, number, number]> = [
      // [내 x, 내 z, 몸 방향, 카메라 x, 카메라 z]
      [0, 0, 0, 0, 5], [0, 0, 0, 5, 0], [0, 0, 0, -3, -4], [2, 3, 1.2, 7, -1], [2, 3, -2.5, 2, 9], [-4, 1, 3.0, -9, -6],
    ];
    for (const [x, z, body, cx, cz] of cases) {
      av.group.position.set(x, 0, z);
      av.group.rotation.y = body;
      cam.position.set(cx, 1.6, cz);
      cam.updateMatrixWorld(true);
      av.face(cam);
      const want = Math.atan2(cx - x, cz - z);
      assert.ok(Math.abs(angleDiff(facing(), want)) < 1e-6, `(${x},${z}) 몸 ${body} → 카메라 (${cx},${cz}): ${facing().toFixed(3)} / ${want.toFixed(3)}`);
    }
    // 카메라 높이는 방향에 쓰지 않는다(판은 서 있는 채로 돈다)
    const before = facing();
    cam.position.y = 9;
    cam.updateMatrixWorld(true);
    av.face(cam);
    assert.ok(Math.abs(angleDiff(facing(), before)) < 1e-9);
    av.dispose();
    // 인형에게는 아무 일도 없다(던지지 않는다)
    const doll = createAvatar({ color: '#5b7fa6' });
    doll.face(cam);
    doll.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    setPhotoLoader(null);
  }
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
  // 활엽수(공 모양)는 평지 가까이에는 없고, 가까운 것은 줄기 위에 올라가 있다(줄기 없는 덩어리가 마당 밖에 떠 보이지 않게)
  const { P } = terrain(world);
  /** 평지 밖으로 떨어진 거리(scenery.ts의 clearOf와 같은 잣대) */
  const away = (x: number, z: number) => Math.max(P.x1 - x, x - P.x2, P.z1 - z, z - P.z2);
  const inst = (mesh: THREE.InstancedMesh) => Array.from({ length: mesh.count }, (_, i) => {
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    mesh.getMatrixAt(i, m);
    m.decompose(pos, new THREE.Quaternion(), scl);
    return { x: pos.x, y: pos.y, z: pos.z, w: scl.x, h: scl.y };
  });
  for (const sc of [full, lite]) {
    const leaves = inst(sc.group.getObjectByName('scenery-leaves') as THREE.InstancedMesh);
    const stems = inst(sc.group.getObjectByName('scenery-stems') as THREE.InstancedMesh);
    assert.ok(leaves.length > 100);
    for (const t of leaves) assert.ok(away(t.x, t.z) > LEAF_TREE.leafClear, `활엽수가 평지에서 ${away(t.x, t.z).toFixed(1)}m`);
    const near = leaves.filter((t) => away(t.x, t.z) <= LEAF_TREE.trunkNear);
    assert.ok(near.length >= 1, '가까운 활엽수가 없으면 시험이 뜻이 없다');
    assert.equal(stems.length, near.length, '가까운 활엽수마다 줄기 하나');
    for (const t of near) {
      const stem = stems.find((q) => Math.abs(q.x - t.x) < 1e-3 && Math.abs(q.z - t.z) < 1e-3);
      assert.ok(stem, '줄기가 없다');
      // 줄기는 땅에서 시작해 공 밑동을 지나 공 안에서 끝난다(공이 줄기 위에 떠 있지 않다)
      assert.ok(stem.y < t.y && stem.y + stem.h > t.y && stem.y + stem.h < t.y + t.h, '줄기와 공이 이어지지 않는다');
      assert.ok(stem.w < t.w * 0.2);
    }
    // 먼 활엽수는 예전처럼 땅에 바로 놓인다
    const far = leaves.find((t) => away(t.x, t.z) > LEAF_TREE.trunkNear)!;
    assert.ok(Math.abs(far.y - (sc.groundAt(far.x, far.z) - 0.2)) < 1e-3);
  }
  full.dispose();
  lite.dispose();
});

test('전망: 평지 가까이의 활엽수를 빼도, 남은 나무는 자리도 색도 다 심었을 때 그대로다', () => {
  const world = buildWorld({});
  /** 자리 → 색. 자리는 난수로 뽑혀 겹치지 않는다 */
  const colours = (sc: ReturnType<typeof buildScenery>) => {
    const mesh = sc.group.getObjectByName('scenery-leaves') as THREE.InstancedMesh;
    const out = new Map<string, string>(), m = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m); mesh.getColorAt(i, c);
      out.set(`${m.elements[12].toFixed(3)},${m.elements[14].toFixed(3)}`, c.getHexString());
    }
    return out;
  };
  const tree = LEAF_TREE as { leafClear: number }, was = tree.leafClear;
  for (const season of ['autumn', 'spring'] as const) {
    const kept = buildScenery(world, season);
    // 다 심은 그림: 빼는 거리만 0으로 두고 같은 난수로 다시 만든다
    tree.leafClear = 0;
    let all: ReturnType<typeof buildScenery>;
    try { all = buildScenery(world, season); } finally { tree.leafClear = was; }
    const a = colours(kept), b = colours(all);
    assert.equal(b.size, SCATTER.full.leaves);
    assert.ok(a.size < b.size, '빠진 나무가 없으면 시험이 뜻이 없다');
    for (const [at, hex] of a) assert.equal(hex, b.get(at), `${season} (${at}) 나무의 색이 바뀌었다`);
    kept.dispose();
    all.dispose();
  }
});

// ───────── 턱 완충: 낮은 무대에 오르내릴 때 보이는 높이가 한 프레임에 튀지 않는다
test('턱 완충: 무대 턱에서는 보이는 높이가 스르르 따라가고, 계단·경사면에서는 몸 높이 그대로다', () => {
  /** 화면과 같은 순서로 걸어 본다: step → ledgeEase → 보이는 높이 = 몸 높이 + off */
  const walk = (p: { boxes: Box[]; ramps: Array<{ x1: number; x2: number; z1: number; z2: number; axis: 'x' | 'z'; y0: number; y1: number }>; floor2: number }, from: Body, vx: number, fps: number, secs: number) => {
    let body = from, off = 0, shown = from.y, jump = 0, lag = 0;
    for (let i = 0; i < secs * fps; i++) {
      const next = step(p, body, vx / fps, 0);
      off = ledgeEase(off, next.y - body.y, Math.hypot(next.x - body.x, next.z - body.z), 1 / fps);
      jump = Math.max(jump, Math.abs(next.y + off - shown));
      lag = Math.max(lag, Math.abs(off));
      shown = next.y + off;
      body = next;
    }
    return { body, shown, jump, lag };
  };
  // 높이가 일정한 판 하나(무대): 가장자리가 수직 턱이다
  const stage = { boxes: [], ramps: [{ x1: 1, x2: 5, z1: -2, z2: 2, axis: 'x' as const, y0: 0.2, y1: 0.2 }], floor2: 3 };
  for (const [vx, fps] of [[1.6, 60], [1.6, 30], [3.6, 60]]) {
    const up = walk(stage, { x: 0, z: 0, y: 0, level: 1 }, vx, fps, 1);
    assert.equal(up.body.y, 0.2, '무대에 올랐다');
    assert.ok(up.jump < (vx > 2 ? 0.08 : 0.06), `오를 때 한 프레임에 ${up.jump.toFixed(3)}m (${vx}m/s, ${fps}fps)`);
    assert.equal(up.shown, 0.2, '1초 뒤에는 몸 높이에 닿아 있다');
    const down = walk(stage, { x: 2, z: 0, y: 0.2, level: 1 }, -vx, fps, 1);
    assert.equal(down.body.y, 0);
    assert.ok(down.jump < (vx > 2 ? 0.08 : 0.06), `내려올 때 한 프레임에 ${down.jump.toFixed(3)}m`);
    assert.equal(down.shown, 0);
  }
  // 완충이 없으면 한 프레임에 0.2m다(이 시험이 보는 것)
  assert.equal(step(stage, { x: 0.99, z: 0, y: 0, level: 1 }, 0.02, 0).y, 0.2);
  // 계단(기울기 0.9): 걸은 만큼만 높이가 바뀌므로 완충이 끼어들지 않는다(뛰어도)
  const stairs = { boxes: [], ramps: [{ x1: 1, x2: 4, z1: -2, z2: 2, axis: 'x' as const, y0: 0, y1: 2.7 }], floor2: 2.7 };
  for (const vx of [1.6, 3.6]) {
    const r = walk(stairs, { x: 0, z: 0, y: 0, level: 1 }, vx, 60, 1.2);
    assert.ok(r.body.y > 0.5, '계단을 올랐다');
    assert.equal(r.lag, 0, `계단에서 보이는 높이가 ${r.lag.toFixed(3)}m 어긋났다`);
  }
  // 크게 벌어지면(자리 옮기기·층 바뀜) 완충하지 않고 바로 맞춘다. 줄어든 몫은 다시 커지지 않는다
  assert.equal(ledgeEase(0, 2.7, 0, 1 / 60), 0);
  assert.equal(ledgeEase(0, -0.6, 0.02, 1 / 60), 0);
  assert.ok(Math.abs(ledgeEase(-0.1, 0, 0.03, 1 / 60)) < 0.1);
});

test('사진 판 눕히기: 내려다보는 각의 절반만큼 눕히다가 49도부터 줄여 3인칭의 가장 가파른 각(71.6도)에서는 세운다', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  assert.equal(leanFor(0), 0);
  assert.ok(Math.abs(leanFor(deg(30)) - deg(15)) < 1e-9, '49도 아래는 절반 그대로');
  const peak = leanFor(deg(49));
  assert.ok(peak > leanFor(deg(60)) && leanFor(deg(60)) > leanFor(deg(70)), '49도부터는 가파를수록 덜 눕힌다');
  assert.equal(leanFor(1.25), 0, '가장 가파른 각에서는 세운다(윗몸이 뒤 벽에 가려지지 않게)');
  assert.equal(leanFor(deg(89)), 0);
  assert.equal(leanFor(-0.3), 0, '올려다보면 눕히지 않는다');
});
