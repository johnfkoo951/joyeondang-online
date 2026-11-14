// 사진 캐릭터의 3D 모형 시험: 다리 모양 알아내기, 키 맞추기, 판 ↔ 모형 바꿔 끼우기(받는 동안·없을 때·멀어질 때),
// 걷는 다리(모형 셰이더와 판 셰이더의 계산), 다 쓰면 남는 것이 없는지. 그리기는 브라우저 몫이라 셰이더는 같은 식을 노드에서 돌리고 글자로 견준다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CARD_HIP, CARD_SIT, MODEL_H, MODEL_LINGER_MS, MODEL_MAX_BYTES, PHOTO_H, MODEL_RECHECK_MS, MODEL_SLOW_MS, SIT_HIP, SIT_KNEE, SIT_KNEE_Y, SIT_LEAN, SIT_SPLAY,
  avatarStats, cardBend, createAvatar, fetchModel, fitModel, forgetIdleModels, legAngle, legMove, legParams, legShape, legUniforms, modelMaterial, modelNow, modelUrl,
  parseModel, setModelLoader, setPhotoLoader, sitParams, sitSplay, type LegUniforms, type ModelData,
} from '../../src/walk/avatar.ts';

// 이름표 글자 스프라이트용 가짜 캔버스(글자 너비는 글자 수로)
const ctx2d = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, k) => (k === 'measureText' ? (s: string) => ({ width: [...s].length * 14 }) : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

/** 상자(가로 x0..x1, 높이 y0..y1) */
const box = (x0: number, x1: number, y0: number, y1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.16, 2, 4, 2).translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
/** 머리(꼭대기 1.18) */
const head = (dx = 0) => new THREE.SphereGeometry(0.2, 12, 8).translate(dx, 0.98, 0);
/** 시험용 사람 모양: 다리가 따로(legs), 치마(skirt), 긴 치마 밑으로 신발 끝만(peek) */
function figure(kind: 'legs' | 'skirt' | 'peek', shift = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'legs') parts.push(box(-0.14, -0.01, 0, 0.3), box(0.01, 0.14, 0, 0.3), box(-0.2, 0.2, 0.28, 0.8));
  if (kind === 'skirt') parts.push(new THREE.CylinderGeometry(0.12, 0.22, 0.5, 16, 4).translate(0, 0.25, 0), box(-0.18, 0.18, 0.48, 0.8));
  if (kind === 'peek') parts.push(box(-0.1, -0.03, 0, 0.05), box(0.03, 0.1, 0, 0.05), new THREE.CylinderGeometry(0.12, 0.25, 0.5, 16, 4).translate(0, 0.29, 0), box(-0.18, 0.18, 0.52, 0.8));
  parts.push(head());
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g.translate(shift, 0, 0);
}
const shapeOf = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return legShape(g.attributes.position.array as ArrayLike<number>, g.index!.array as ArrayLike<number>, g.boundingBox!.max.y);
};

test('다리 모양: 다리가 따로면 가랑이 높이(1% 안), 치마는 붙은 것, 긴 치마 밑 신발 끝은 다리로 치지 않는다, 가운데가 어긋나도 찾는다', () => {
  const legs = shapeOf(figure('legs'));
  assert.equal(legs.apart, true);
  assert.ok(Math.abs(legs.crotch - 0.28) < 0.0118, `가랑이 ${legs.crotch}`);
  assert.equal(legs.split, 0);
  assert.deepEqual(shapeOf(figure('skirt')), { apart: false, crotch: 0, split: 0 }, '치마: 가운데가 바닥까지 이어졌다');
  assert.equal(shapeOf(figure('peek')).apart, false, '틈이 키의 6%보다 낮다(한복처럼 신발 끝만 보인다)');
  // 다리 사이 가운데가 x 0.02에 있다: 가운데 평면은 왼다리를 지나지만 옆 평면에서 틈을 찾는다
  const off = shapeOf(figure('legs', 0.02));
  assert.equal(off.apart, true);
  assert.ok(off.split > 0.01 && off.split < 0.03, `가르는 x ${off.split}`);
  // 이상한 값에도 던지지 않는다
  assert.deepEqual(legShape([], null, 1), { apart: false, crotch: 0, split: 0 });
  assert.deepEqual(legShape([0, 0, 0, 1, 0, 0, 0, 1, 0], null, 0), { apart: false, crotch: 0, split: 0 });
});

/** 앞(+z)으로 나온 신발: 타원체, 높이 0..0.07, 코끝 z 0.16(다리 상자의 앞면 0.08보다 나온다) */
const shoe = (x: number) => new THREE.SphereGeometry(1, 16, 8).scale(0.06, 0.035, 0.11).translate(x, 0.035, 0.05);
/** 시험용 사람 모양 더: 두 다리가 맞닿은 바지(fused), 짧은 다리 사이에 부스러기 삼각형(sliver), 신발이 벌어진 긴 치마(gapskirt) */
function figure2(kind: 'fused' | 'sliver' | 'gapskirt', shift = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'fused') parts.push(box(-0.13, 0.13, 0, 0.3), shoe(-0.065), shoe(0.065), box(-0.2, 0.2, 0.28, 0.8));
  if (kind === 'sliver') {
    parts.push(box(-0.13, -0.012, 0, 0.11), box(0.012, 0.13, 0, 0.11), box(-0.03, 0.03, 0.05, 0.053), box(-0.13, 0.13, 0.11, 0.3), box(-0.2, 0.2, 0.28, 0.8));
  }
  if (kind === 'gapskirt') {
    parts.push(box(-0.12, -0.03, 0, 0.09), box(0.03, 0.12, 0, 0.09), new THREE.CylinderGeometry(0.14, 0.24, 0.45, 16, 4).translate(0, 0.315, 0), box(-0.18, 0.18, 0.52, 0.8));
  }
  parts.push(head());
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g.translate(shift, 0, 0);
}

test('다리 모양: 짧은 다리 사이의 부스러기는 틈을 끊지 않고, 틈 없이 맞닿은 바지도 두 다리, 신발이 벌어진 긴 치마는 붙은 것', () => {
  // 가랑이가 키의 9%(10%보다 낮다)지만 바로 위가 자락이 아니다. 틈 가운데 한 칸짜리 삼각형이 있어도 다리 사이다
  const short = shapeOf(figure2('sliver'));
  assert.equal(short.apart, true, '짧은 다리');
  assert.ok(Math.abs(short.crotch - 0.106) < 0.0118, `가랑이 ${short.crotch}`);
  assert.equal(short.split, 0);
  // 틈이 하나도 없다: 자락(윗옷)이 키의 24%로 높고 두 신발 코 사이가 팼으면 바지. 가랑이는 자락 높이의 0.45, 골 자리로 가른다
  const fused = shapeOf(figure2('fused'));
  assert.equal(fused.apart, true, '맞닿은 바지');
  assert.ok(Math.abs(fused.crotch - 0.127) < 0.0118, `가랑이 ${fused.crotch}`);
  assert.ok(Math.abs(fused.split) < 0.0118, `가르는 x ${fused.split}`);
  const moved = shapeOf(figure2('fused', 0.02));
  assert.ok(Math.abs(moved.split - 0.02) < 0.0118, `골을 따라 가른다 ${moved.split}`);
  // 신발 사이가 키의 7%까지 비었지만 바로 위가 넓게 퍼진 치맛단이다: 다리로 치지 않는다(치마가 둘로 갈라지지 않게)
  assert.deepEqual(shapeOf(figure2('gapskirt')), { apart: false, crotch: 0, split: 0 }, '신발이 벌어진 긴 치마');
});

test('키 맞추기: 노드 변환을 구워 넣고, 양자화된 위치도 미터로 읽어 키 1.24m·발바닥 0으로. uv·색인은 받은 그대로', () => {
  // 3D 서비스가 내는 꼴: 위치는 int16 정규화(-1..1), 노드가 위로 0.5 올리고 0.5배
  const src = figure('legs');
  src.computeBoundingBox();
  const bb = src.boundingBox!;
  const cy = (bb.min.y + bb.max.y) / 2, half = (bb.max.y - bb.min.y) / 2;
  const p = src.attributes.position as THREE.BufferAttribute;
  const q = new Int16Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    q[i * 3] = Math.round((p.getX(i) / half) * 32767);
    q[i * 3 + 1] = Math.round(((p.getY(i) - cy) / half) * 32767);
    q[i * 3 + 2] = Math.round((p.getZ(i) / half) * 32767);
  }
  const quant = new THREE.BufferGeometry();
  quant.setAttribute('position', new THREE.BufferAttribute(q, 3, true));
  quant.setAttribute('normal', src.attributes.normal);
  quant.setAttribute('uv', src.attributes.uv);
  quant.setIndex(src.index);
  const node = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.5, 0), new THREE.Quaternion(), new THREE.Vector3(0.5, 0.5, 0.5));
  const fit = fitModel(quant, node)!;
  const g = fit.geometry;
  assert.ok(g.attributes.position.array instanceof Float32Array);
  assert.ok(Math.abs(g.boundingBox!.min.y) < 1e-6 && Math.abs(g.boundingBox!.max.y - MODEL_H) < 1e-6, `키 ${g.boundingBox!.min.y}..${g.boundingBox!.max.y}`);
  assert.equal(g.attributes.uv, src.attributes.uv);
  assert.equal(g.index, src.index);
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i += 37) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
  // 다리 모양은 맞춘 키로 잰다(가랑이 0.28 → 키 1.18에서 1.24로)
  assert.equal(fit.legs.apart, true);
  assert.ok(Math.abs(fit.legs.crotch - (0.28 * MODEL_H) / 1.18) < 0.02, `가랑이 ${fit.legs.crotch}`);
  assert.equal(fitModel(new THREE.BufferGeometry()), null, '위치가 없으면 null');
  g.dispose();
  src.dispose();
});

test('모형 다리 각: 가랑이 아래 두 다리는 반대로 다 돌고, 엉덩이 축 위는 돌지 않고, 가운데는 끊김 없이 섞인다', () => {
  const hip = legParams({ apart: true, crotch: 0.25, split: 0 });
  const a = 0.4;
  const left = legAngle({ x: -0.06, y: 0.05 }, a, hip), right = legAngle({ x: 0.06, y: 0.05 }, a, hip);
  assert.ok(Math.abs(left + a) < 1e-9 && Math.abs(right - a) < 1e-9, `${left} ${right}`);
  assert.equal(legAngle({ x: 0.1, y: hip.x + 0.01 }, a, hip), 0, '엉덩이 위는 그대로');
  assert.equal(legAngle({ x: 0, y: 0.1 }, a, hip), 0, '가르는 선 위는 0');
  // 가운데를 가로질러도 각이 끊기지 않는다(그림이 찢어지지 않는다). 다리 사이(꼭짓점이 없는 틈)에서는 좁게 바뀌어 다리가 통째로 돌고,
  // 몸이 이어진 가랑이 위로 갈수록 넓게 섞인다
  const width = (y: number) => {
    let prev = legAngle({ x: -0.1, y }, a, hip), inside = 0;
    const top = Math.abs(legAngle({ x: 0.1, y }, a, hip));
    for (let x = -0.1; x <= 0.1; x += 0.00025) {
      const now = legAngle({ x, y }, a, hip);
      assert.ok(Math.abs(now - prev) < 0.02, `y ${y} x ${x.toFixed(4)}: ${prev} → ${now}`);
      if (Math.abs(now) < top * 0.9) inside += 0.00025;
      prev = now;
    }
    return inside;
  };
  const feet = width(0.05), crotch = width(0.265);
  assert.ok(feet < 0.02, `발 쪽 섞는 폭 ${feet}`);
  assert.ok(crotch > feet * 3, `가랑이 위는 넓게 섞는다 ${crotch} > ${feet}`);
  // 붙은 다리(치마)는 허리 둘레를 축으로 넓게 섞는다
  const skirt = legParams({ apart: false, crotch: 0, split: 0 });
  assert.ok(skirt.x > 0.4 && skirt.w > hip.w * 10);
});

test('모형 셰이더: 표준 셰이더의 세 자리를 바꾸고(걷는 각은 위 legAngle, 앉기는 legMove와 같은 식), 화소 셰이더는 건드리지 않는다. 모든 모형이 셰이더 하나를 함께 쓴다', () => {
  const u: LegUniforms = { ...legUniforms(), legSwing: { value: 0.3 }, legHip: { value: new THREE.Vector4(1, 2, 3, 4) } };
  const m = modelMaterial(null, u);
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(shader as never, null as never);
  assert.equal(shader.uniforms.legSwing, u.legSwing);
  assert.equal(shader.uniforms.legHip, u.legHip);
  assert.equal(shader.uniforms.legSit, u.legSit);
  assert.equal(shader.uniforms.legSeat, u.legSeat);
  assert.deepEqual(u.legSit.value.toArray(), [0, SIT_HIP, SIT_KNEE, SIT_SPLAY], '새 모형은 서 있고, 앉는 각은 legMove와 같은 값');
  const glsl = shader.vertexShader.replace(/\s+/g, ' ');
  for (const line of [
    'return smoothstep( legHip.y - legHip.w * 3.0, legHip.x, p.y );',
    'float w = legHip.w * ( 1.0 + 6.0 * up );',
    'return smoothstep( - w, w, p.x - legHip.z ) * 2.0 - 1.0;',
    'return legSwing * legSide( p, up ) * ( 1.0 - up );',
    // 앉기: 무릎을 뒤로 접고, 엉덩이에서 다리를 들고(기대는 만큼 덜), 벌리고, 몸 전체를 뒤로 기댄다
    'float full = 1.0 - smoothstep( legSeat.y, legSeat.x, p.y );',
    'v = legTurn( v, s * legSit.z * shin, legSeat.z * pivot );',
    'v = legTurn( v, - s * ( legSit.y - legSeat.w ) * full, legSeat.x * pivot );',
    'v = legYaw( v, s * legSit.w * legSide( p, legUp( p ) ) * full, legHip.z * pivot );',
    'return legTurn( v, - s * legSeat.w, legSeat.x * pivot );',
    'float legA = legAngle( position );',
    'objectNormal = legTurn( legSitTurn( objectNormal, position, 0.0 ), legA, 0.0 );',
    'transformed = legTurn( legSitTurn( transformed, position, 1.0 ), legA, legHip.x );',
  ]) assert.ok(glsl.includes(line), `셰이더에 없다: ${line}`);
  for (const chunk of ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>']) assert.equal(shader.vertexShader.split(chunk).length, 2, `${chunk}는 그대로 한 번`);
  assert.ok(shader.vertexShader.indexOf('uniform float legSwing;') < shader.vertexShader.indexOf('void main'));
  assert.ok(shader.vertexShader.indexOf('float legA') < shader.vertexShader.indexOf('transformed = legTurn'), '다리 각은 법선에서 먼저 셈한다');
  assert.equal(shader.fragmentShader, THREE.ShaderLib.standard.fragmentShader);
  const other = modelMaterial(null, legUniforms());
  assert.equal(m.customProgramCacheKey(), other.customProgramCacheKey());
  assert.notEqual(m.customProgramCacheKey(), new THREE.MeshStandardMaterial().customProgramCacheKey());
  m.dispose();
  other.dispose();
});

test('판의 걷는 다리: 걸음 값이 0이면 그대로, 옆모습은 두 발이 바깥으로 벌어지고, 앞모습은 한쪽 발만 들린다. 엉덩이 위는 그대로', () => {
  const still = { x: 0, y: 0, z: 0 };
  for (const [x, y] of [[-0.2, 0], [0.03, 0.1], [0.3, 0.9], [0, 0.2]]) {
    const b = cardBend(x, y, still);
    assert.ok(Math.abs(b.x - x) < 1e-12 && Math.abs(b.y - y) < 1e-12);
  }
  const spread = { x: 0.22, y: 0, z: 0 };
  assert.ok(cardBend(-0.08, 0.02, spread).x < -0.08 - 0.04, '왼발은 왼쪽으로');
  assert.ok(cardBend(0.08, 0.02, spread).x > 0.08 + 0.04, '오른발은 오른쪽으로');
  for (const x of [-0.3, 0, 0.2]) {
    const top = cardBend(x, CARD_HIP + 0.01, spread);
    assert.ok(Math.abs(top.x - x) < 1e-12 && Math.abs(top.y - (CARD_HIP + 0.01)) < 1e-12, '엉덩이 위는 그대로');
  }
  const lift = { x: 0, y: 0.05, z: 0 };
  assert.ok(Math.abs(cardBend(-0.1, 0, lift).y - 0.05) < 1e-12, '왼발이 5cm 들린다');
  assert.ok(Math.abs(cardBend(0.1, 0, lift).y) < 1e-12, '오른발은 바닥');
  // 가운데를 가로질러도 끊김이 없다
  let prev = cardBend(-0.1, 0.05, { x: 0.22, y: 0.05, z: 0 });
  for (let x = -0.1; x <= 0.1; x += 0.002) {
    const b = cardBend(x, 0.05, { x: 0.22, y: 0.05, z: 0 });
    assert.ok(Math.hypot(b.x - prev.x, b.y - prev.y) < 0.012, `x ${x.toFixed(3)}`);
    prev = b;
  }
});

// ───────── 판 ↔ 모형 바꿔 끼우기

/** 가짜 그림: 방향 그림 묶음 */
const fakeViews = (url: string) => Promise.resolve((url.includes('/views?') ? { width: 1920, height: 576 } : { width: 400, height: 600 }) as never);
/** 시험용 모형(텍스처 없음) */
const fakeModel = (kind: 'legs' | 'skirt' = 'legs'): ModelData => {
  const src = figure(kind);
  const fit = fitModel(src)!;
  src.dispose();
  return { geometry: fit.geometry, texture: null, legs: fit.legs };
};
/** 손으로 돌리는 시계와 예약 */
function fakeClock() {
  let now = 0, seq = 0;
  const due: Array<{ id: number; at: number; fn: () => void }> = [];
  const timers = {
    set: (fn: () => void, ms: number) => { due.push({ id: ++seq, at: now + ms, fn }); return seq; },
    clear: (h: unknown) => { const i = due.findIndex((d) => d.id === h); if (i >= 0) due.splice(i, 1); },
  };
  const pass = async (ms: number) => {
    now += ms;
    for (const d of due.filter((x) => x.at <= now)) { due.splice(due.indexOf(d), 1); d.fn(); }
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return { clock: () => now, timers, due, pass };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
/** 모형 다시 묻기 차례 사이의 간격(ms): 처음 없었던 때부터 첫 차례까지, 그다음은 앞 차례부터 */
const recheckGaps = MODEL_RECHECK_MS.map((t, i) => t - (i > 0 ? MODEL_RECHECK_MS[i - 1] : 0));
const walk = { speed: 1.6, running: false, airborne: false, landing: false };
const stand = { speed: 0, running: false, airborne: false, landing: false };

test('모형: 원하면 받아 두었다가 오면 판 대신 선다(이름표는 모형 머리 위), 끄면 판으로, 다 놓으면 잠시 들고 있다가 놓는다', async () => {
  const c = fakeClock();
  setPhotoLoader(fakeViews, c.clock, c.timers);
  const asked: string[] = [];
  const gates: Array<() => void> = [];
  setModelLoader((url, size) => { asked.push(`${size} ${url}`); return new Promise((done) => gates.push(() => done(fakeModel()))); });
  try {
    const U = '/api/avatar/abcd0001';
    let changes = 0;
    const a = createAvatar({ look: { kind: 'photo', url: U }, name: '손님', model: true, onChange: () => { changes++; } });
    await a.ready;
    assert.deepEqual(asked.splice(0), [`l ${modelUrl(U)}`]);
    assert.equal(modelUrl(U), `${U}/model`);
    assert.equal(a.form(), 'card', '모형을 받는 동안은 판');
    assert.equal(changes, 1);
    gates.shift()!();
    await flush();
    assert.equal(a.form(), 'model');
    assert.equal(a.shown(), 'photo');
    assert.equal(changes, 2, '바뀌었다고 알린다(엔진이 다시 그린다)');
    const rig = a.group.getObjectByName('model')!, paper = a.group.getObjectByName('photo')!;
    assert.deepEqual([rig.visible, paper.visible], [true, false], '판(과 그림자 판)은 숨는다');
    const label = a.group.children.find((x) => (x as THREE.Sprite).isSprite)!;
    assert.ok(Math.abs(label.position.y - (MODEL_H + 0.08)) < 1e-9, `이름표 ${label.position.y}`);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(3, 1.5, 3);
    cam.updateMatrixWorld();
    assert.equal(a.face(cam, 'plane'), false, '모형이면 판을 세우지 않는다');
    // 같은 모형을 쓰는 다른 캐릭터: 받지 않고 바로 선다. 기하는 함께, 재질은 저마다
    const b = createAvatar({ look: { kind: 'photo', url: U }, model: true });
    await b.ready;
    assert.equal(asked.length, 0);
    assert.equal(b.form(), 'model');
    const ma = a.group.getObjectByName('photo-model') as THREE.Mesh, mb = b.group.getObjectByName('photo-model') as THREE.Mesh;
    assert.equal(ma.geometry, mb.geometry);
    assert.notEqual(ma.material, mb.material);
    // 끄면 판으로 돌아가고 모형 메시를 걷는다
    a.setModel(false);
    assert.equal(a.form(), 'card');
    assert.equal(a.group.getObjectByName('photo-model'), undefined);
    assert.equal(changes, 3);
    assert.ok(Math.abs(label.position.y - (PHOTO_H + 0.06)) < 1e-9, `이름표는 판 위로 ${label.position.y}`);
    // 들락거려도(잠시 들고 있는 동안) 다시 받지 않는다
    b.dispose();
    await c.pass(MODEL_LINGER_MS - 1000);
    a.setModel(true);
    await flush();
    assert.equal(asked.length, 0);
    assert.equal(a.form(), 'model');
    a.setModel(false);
    assert.equal(avatarStats().geometries > 0, true, '아무도 원하지 않아도 잠시 들고 있다');
    await c.pass(MODEL_LINGER_MS + 1);
    a.dispose();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
    assert.equal(c.due.length, 0);
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('모형: 셰이더를 미리 지은 뒤에 선다. 그사이 끄면 서지 않는다. 손가락 기기는 작은 그림으로 받는다', async () => {
  setPhotoLoader(fakeViews);
  const asked: string[] = [];
  setModelLoader((url, size) => { asked.push(`${size} ${url}`); return Promise.resolve(fakeModel()); });
  try {
    let done: (() => void) | null = null;
    const prepared: THREE.Object3D[] = [];
    const prepare = (o: THREE.Object3D) => new Promise<void>((r) => { prepared.push(o); done = r; });
    const a = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0002' }, photoSize: 's', model: true, prepare });
    await a.ready;
    await flush();
    assert.deepEqual(asked, ['s /api/avatar/abcd0002/model']);
    assert.equal(prepared.length, 1);
    assert.ok(prepared[0].getObjectByName('photo-model'), '모형을 숨겨 둔 채로 짓는다');
    assert.equal(a.form(), 'card');
    done!();
    await flush();
    assert.equal(a.form(), 'model');
    // 짓는 사이에 꺼지면 서지 않는다
    const b = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0002' }, photoSize: 's', model: true, prepare });
    await b.ready;
    await flush();
    b.setModel(false);
    done!();
    await flush();
    assert.equal(b.form(), 'card');
    a.dispose();
    b.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('모형이 없으면 판 그대로, 원하는 동안 40·90·240·600초에 다시 묻고 생기면 바꿔 낀다. 원하는 캐릭터가 없으면 묻지 않는다', async () => {
  const c = fakeClock();
  setPhotoLoader(fakeViews, c.clock, c.timers);
  const asked: number[] = [];
  let has = false;
  setModelLoader(() => { asked.push(c.clock()); return Promise.resolve(has ? fakeModel('skirt') : null); });
  try {
    let changes = 0;
    const a = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0003' }, model: true, onChange: () => { changes++; } });
    await a.ready;
    await flush();
    assert.equal(a.form(), 'card');
    const t0 = c.clock();
    await c.pass(MODEL_RECHECK_MS[0]);
    has = true;
    await c.pass(MODEL_RECHECK_MS[1] - MODEL_RECHECK_MS[0]);
    assert.deepEqual(asked.map((t) => (t - t0) / 1000), [0, 40, 90]);
    assert.equal(a.form(), 'model');
    assert.equal(changes, 2);
    assert.equal(c.due.length, 0, '받았으니 더 묻지 않는다');
    // 다리가 붙은 모형(치마): 걸으면 몸을 좌우로 흔들고 치맛자락을 조금 비튼다
    const rig = a.group.getObjectByName('model')!;
    const legs = ((a.group.getObjectByName('photo-model') as THREE.Mesh).material as THREE.Material).userData.legs as { legSwing: { value: number } };
    let roll = 0, swing = 0;
    for (let i = 0; i < 90; i++) { a.update(1 / 60, walk); roll = Math.max(roll, Math.abs(rig.rotation.z)); swing = Math.max(swing, Math.abs(legs.legSwing.value)); }
    assert.ok(roll > 0.03 && roll <= 0.05 + 1e-9, `몸 흔들기 ${roll}`);
    assert.ok(swing > 0.05 && swing <= 0.12 + 1e-9, `치맛자락 ${swing}`);
    a.dispose();
    // 원하는 캐릭터가 없으면 다시 묻지 않는다
    has = false;
    const b = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0004' }, model: true });
    await b.ready;
    await flush();
    b.setModel(false);
    asked.length = 0;
    await c.pass(700_000);
    assert.deepEqual(asked, []);
    b.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('줄이 비었을 때처럼 그림이 다 되고 30초 남짓 뒤에 생긴 모형은 첫 다시 묻기(40초)에 바꿔 낀다', async () => {
  const c = fakeClock();
  setPhotoLoader(fakeViews, c.clock, c.timers);
  const asked: number[] = [];
  let has = false;
  setModelLoader(() => { asked.push(c.clock()); return Promise.resolve(has ? fakeModel() : null); });
  try {
    const a = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0008' }, model: true });
    await a.ready;
    await flush();
    const t0 = c.clock();
    await c.pass(33_000);
    has = true;
    assert.equal(a.form(), 'card', '생겨도 다시 묻기 전에는 판');
    await c.pass(MODEL_RECHECK_MS[0] - 33_000);
    assert.deepEqual(asked.map((t) => (t - t0) / 1000), [0, 40]);
    assert.equal(a.form(), 'model');
    assert.equal(c.due.length, 0, '받았으니 더 묻지 않는다');
    a.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('모형 주소마다 기억한다: 사이트가 앞으로도 없다(none)고 하면 이 화면에서 다시 묻지 않고, 없던 주소는 드나들어도 처음부터 다시 묻지 않는다', async () => {
  const c = fakeClock();
  setPhotoLoader(fakeViews, c.clock, c.timers);
  const asked: string[] = [];
  const answer = new Map<string, ModelData | null | 'none'>();
  setModelLoader((url) => { asked.push(url); return Promise.resolve(answer.get(url) ?? null); });
  const come = async (url: string) => {
    const a = createAvatar({ look: { kind: 'photo', url }, model: true });
    await a.ready;
    await flush();
    return a;
  };
  try {
    const N = '/api/avatar/abcd0005', M = '/api/avatar/abcd0006';
    answer.set(`${N}/model`, 'none');
    let a = await come(N);
    assert.deepEqual(asked.splice(0), [`${N}/model`]);
    await c.pass(700_000);
    assert.deepEqual(asked, [], 'none이면 다시 묻지 않는다');
    a.setModel(false);
    a.setModel(true);
    await flush();
    await c.pass(700_000);
    a.dispose();
    forgetIdleModels();
    a = await come(N);
    await c.pass(700_000);
    assert.deepEqual(asked, [], '다시 원하거나 새로 와도 묻지 않는다');
    assert.equal(a.form(), 'card');
    a.dispose();
    forgetIdleModels();
    // 없던 주소(null): 드나들어도 처음 묻기를 되풀이하지 않고 40·90·240·600초 차례를 잇는다
    const at: number[] = [];
    const t0 = c.clock();
    const note = () => { for (const u of asked.splice(0)) if (u === `${M}/model`) at.push((c.clock() - t0) / 1000); };
    let m = await come(M);
    note();
    for (const gap of recheckGaps.slice(0, -1)) {
      await c.pass(gap);
      note();
      m.dispose();
      forgetIdleModels();
      m = await come(M);
      note();
    }
    assert.deepEqual(at, [0, 40, 90, 240], '다시 와도 바로 묻지 않는다');
    answer.set(`${M}/model`, fakeModel());
    await c.pass(recheckGaps[recheckGaps.length - 1]);
    note();
    assert.deepEqual(at, [0, 40, 90, 240, 600]);
    assert.equal(m.form(), 'model', '마지막(넷째) 다시 묻기에 오면 바꿔 낀다');
    m.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('모형 차례를 다 쓴 뒤에도 원하는 동안은 MODEL_SLOW_MS마다 묻는다(10분 넘어 생긴 모형도 끝내 바꿔 낀다)', async () => {
  const c = fakeClock();
  setPhotoLoader(fakeViews, c.clock, c.timers);
  const asked: number[] = [];
  let has = false;
  setModelLoader(() => { asked.push(c.clock()); return Promise.resolve(has ? fakeModel() : null); });
  try {
    const a = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0007' }, model: true });
    await a.ready;
    await flush();
    const t0 = c.clock();
    for (const gap of [...recheckGaps, MODEL_SLOW_MS]) await c.pass(gap);
    assert.deepEqual(asked.map((t) => (t - t0) / 1000), [0, 40, 90, 240, 600, 600 + MODEL_SLOW_MS / 1000]);
    assert.equal(MODEL_SLOW_MS, 240_000, '차례를 다 쓴 뒤의 간격은 그대로 4분');
    assert.equal(a.form(), 'card');
    has = true;
    await c.pass(MODEL_SLOW_MS);
    assert.equal(a.form(), 'model', '늦게 생긴 모형도 바꿔 낀다');
    assert.equal(c.due.length, 0, '받았으니 더 묻지 않는다');
    a.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('3D가 다 됐다고 화면이 알리면(modelNow) 다시 묻기 차례를 기다리지 않고 바로 묻고 바꿔 낀다. 「앞으로도 없다」 기억도 풀린다', async () => {
  const c = fakeClock();
  setPhotoLoader(fakeViews, c.clock, c.timers);
  const asked: number[] = [];
  const answer = new Map<string, ModelData | null | 'none'>();
  setModelLoader((url) => { asked.push(c.clock()); return Promise.resolve(answer.get(url) ?? null); });
  try {
    const U = '/api/avatar/abcd0011';
    const a = createAvatar({ look: { kind: 'photo', url: U }, model: true });
    await a.ready;
    await flush();
    const t0 = c.clock();
    assert.equal(a.form(), 'card');
    // 12초 뒤 3D가 다 됐다(첫 다시 묻기 40초 전): 바로 묻는다
    await c.pass(12_000);
    answer.set(`${U}/model`, fakeModel());
    modelNow(U);
    await c.pass(0);
    assert.deepEqual(asked.map((t) => (t - t0) / 1000), [0, 12]);
    assert.equal(a.form(), 'model');
    assert.equal(c.due.length, 0, '받았으니 더 묻지 않는다(40초 차례도 지웠다)');
    // 이미 받은 모형은 다시 받지 않는다
    modelNow(U);
    await c.pass(0);
    assert.equal(asked.length, 2);
    a.dispose();
    forgetIdleModels();
    // 실패로 굳어 「앞으로도 없다」(none)였던 그림을 다시 요청해 3D가 됐다: 이 화면의 기억을 풀고 바로 묻는다
    const N = '/api/avatar/abcd0012';
    answer.set(`${N}/model`, 'none');
    asked.length = 0;
    const b = createAvatar({ look: { kind: 'photo', url: N }, model: true });
    await b.ready;
    await flush();
    await c.pass(700_000);
    assert.equal(asked.length, 1, 'none이면 다시 묻지 않는다');
    answer.set(`${N}/model`, fakeModel('skirt'));
    modelNow(N);
    await c.pass(0);
    assert.equal(asked.length, 2);
    assert.equal(b.form(), 'model');
    b.dispose();
    forgetIdleModels();
    // 받는 중에 알리면 같은 모형을 둘로 받지 않고, 그 답이 비었을 때 바로 한 번 더 묻는다
    const L = '/api/avatar/abcd0013';
    const gates: Array<(v: ModelData | null) => void> = [];
    asked.length = 0;
    setModelLoader(() => { asked.push(c.clock()); return new Promise((done) => gates.push(done)); });
    const d = createAvatar({ look: { kind: 'photo', url: L }, model: true });
    await d.ready;
    await flush();
    assert.equal(asked.length, 1, '처음 받는 중');
    modelNow(L);
    await c.pass(0);
    assert.equal(asked.length, 1, '받는 중에는 또 받지 않는다');
    gates.shift()!(null);
    await flush();
    await c.pass(0);
    assert.equal(asked.length, 2, '비었으니 차례를 기다리지 않고 바로 한 번 더');
    gates.shift()!(fakeModel());
    await flush();
    assert.equal(d.form(), 'model');
    d.dispose();
    forgetIdleModels();
    // 원하는 캐릭터 없이 들고만 있던 빈 항목은 놓는다(다음에 원하면 처음부터 바로 묻는다)
    const E = '/api/avatar/abcd0014';
    asked.length = 0;
    setModelLoader(() => { asked.push(c.clock()); return Promise.resolve(null); });
    const e = createAvatar({ look: { kind: 'photo', url: E }, model: true });
    await e.ready;
    await flush();
    e.dispose();
    modelNow(E);
    const f = createAvatar({ look: { kind: 'photo', url: E }, model: true });
    await f.ready;
    await flush();
    assert.equal(asked.length, 2, '다시 원하면 40초를 기다리지 않고 바로');
    f.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('걷는 다리: 모형은 걸음마다 두 다리가 번갈아 돌고 몸이 출렁이며, 판은 옆모습이면 벌어지고 앞모습이면 발을 든다. 서면 가라앉고, 줄인 움직임이면 모두 끈다', async () => {
  setPhotoLoader(fakeViews);
  setModelLoader(() => Promise.resolve(fakeModel()));
  try {
    const a = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0005' }, model: true });
    await a.ready;
    await flush();
    assert.equal(a.form(), 'model');
    const legs = ((a.group.getObjectByName('photo-model') as THREE.Mesh).material as THREE.Material).userData.legs as { legSwing: { value: number } };
    const rig = a.group.getObjectByName('model')!;
    let lo = 0, hi = 0, bob = 0;
    for (let i = 0; i < 120; i++) { a.update(1 / 60, walk); lo = Math.min(lo, legs.legSwing.value); hi = Math.max(hi, legs.legSwing.value); bob = Math.max(bob, rig.position.y); }
    assert.ok(hi > 0.3 && lo < -0.3, `다리 ${lo}..${hi}`);
    assert.ok(bob > 0.01 && bob < 0.04, `출렁임 ${bob}`);
    for (let i = 0; i < 120; i++) a.update(1 / 60, stand);
    assert.ok(Math.abs(legs.legSwing.value) < 1e-3 && rig.position.y < 1e-3, '서면 가라앉는다');
    // 판으로 돌아가면 판의 다리가 움직인다: 옆모습(카메라가 캐릭터 옆)이면 벌어지고, 앞모습이면 발을 든다
    a.setModel(false);
    const card = a.group.getObjectByName('photo-card') as THREE.Mesh;
    const gait = (card.material as THREE.Material).userData.cardGait as { value: THREE.Vector3 };
    const cam = new THREE.PerspectiveCamera();
    const look = (x: number, z: number) => { cam.position.set(x, 1.2, z); cam.lookAt(0, 0.6, 0); cam.updateMatrixWorld(); a.face(cam); };
    look(5, 0);
    let spread = 0, liftL = 0, liftR = 0;
    for (let i = 0; i < 120; i++) { a.update(1 / 60, walk); spread = Math.max(spread, gait.value.x); liftL = Math.max(liftL, gait.value.y); liftR = Math.max(liftR, gait.value.z); }
    assert.ok(spread > 0.15 && liftL < 1e-9 && liftR < 1e-9, `옆모습 ${spread} ${liftL} ${liftR}`);
    look(0, 5);
    spread = liftL = liftR = 0;
    for (let i = 0; i < 120; i++) { a.update(1 / 60, walk); spread = Math.max(spread, gait.value.x); liftL = Math.max(liftL, gait.value.y); liftR = Math.max(liftR, gait.value.z); }
    assert.ok(spread < 1e-9 && liftL > 0.03 && liftR > 0.03, `앞모습 ${spread} ${liftL} ${liftR}`);
    a.dispose();
    // 줄인 움직임
    const r = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0005' }, model: true, reducedMotion: true });
    await r.ready;
    await flush();
    const rl = ((r.group.getObjectByName('photo-model') as THREE.Mesh).material as THREE.Material).userData.legs as { legSwing: { value: number } };
    for (let i = 0; i < 60; i++) r.update(1 / 60, walk);
    assert.equal(rl.legSwing.value, 0);
    assert.equal(r.group.getObjectByName('model')!.position.y, 0);
    r.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

test('칭호: 이름표 위에 얹는다(이름표가 높아지고 말풍선도 그만큼 위로), 같은 칭호는 다시 그리지 않고, 떼면 원래대로. 겉모습에 실려 와도 처음부터 단다', () => {
  const nameSprite = (a: ReturnType<typeof createAvatar>) => a.group.children.find((c) => (c as THREE.Sprite).isSprite && c.renderOrder === 20) as THREE.Sprite;
  const a = createAvatar({ color: '#336699', name: '손님' });
  const plain = nameSprite(a).scale.y;
  a.setBubble('안녕하세요');
  const bubble = () => a.group.children.find((c) => (c as THREE.Sprite).isSprite && c.renderOrder === 21) as THREE.Sprite;
  const lowBubble = bubble().center.y;
  assert.equal(a.setTitle('오늘도 커피 한 잔'), true);
  assert.ok(nameSprite(a).scale.y > plain * 1.5, `이름표가 높아진다 ${plain} → ${nameSprite(a).scale.y}`);
  assert.ok(bubble().center.y < lowBubble, '말풍선은 칭호 위로');
  assert.equal(a.setTitle('오늘도 커피 한 잔'), false, '같은 칭호');
  assert.equal(a.setTitle('  '), true, '빈 글이면 뗀다');
  assert.ok(Math.abs(nameSprite(a).scale.y - plain) < 1e-9);
  a.dispose();
  const b = createAvatar({ look: { kind: 'doll', doll: { hair: 'bob', hairColor: '#2b2420', skin: '#efcfb2', top: '#3e6b4f', bottom: '#3a3a3a', acc: 'none' }, title: '집주인' }, name: '손님' });
  assert.ok(nameSprite(b).scale.y > plain * 1.5, '겉모습의 칭호를 처음부터 단다');
  assert.equal(b.setTitle('집주인'), false);
  b.dispose();
  assert.equal(avatarStats().labels, 0, '이름표를 다시 그려도 남는 것이 없다');
});

test('앉기 계산: 무릎을 굽혀 발이 엉덩이 앞 바닥 높이로 오고 바깥으로 벌어지며, 몸은 조금 뒤로 기댄다. 붙은 다리는 자락째 접고 벌리지 않는다. 판은 다리가 짧아지고 그 위는 내려앉는다', () => {
  const shape = { apart: true, crotch: 0.3, split: 0 };
  const hip = legParams(shape), seat = sitParams(shape);
  assert.deepEqual(seat.toArray(), [hip.x, hip.y - hip.w * 3, SIT_KNEE_Y, SIT_LEAN], '따로인 다리는 걷는 다리와 같은 축');
  assert.equal(sitSplay(shape), SIT_SPLAY);
  const at = (p: { x: number; y: number; z: number }, sit = 1) => legMove(p, 0, hip, sit, seat, sitSplay(shape));
  const right = at({ x: 0.06, y: 0.02, z: 0 }), left = at({ x: -0.06, y: 0.02, z: 0 });
  assert.ok(right.z > 0.15 && left.z > 0.15, `발이 앞으로 ${right.z.toFixed(3)}`);
  // 엉덩이 축을 바닥에서 5cm에 내리면(틀이 내려가는 몫) 발은 바닥 위 가까이에 닿는다
  for (const f of [right, left]) {
    const floor = f.y - (seat.x - 0.05);
    assert.ok(floor > -0.01 && floor < 0.06, `발이 바닥 가까이 ${floor.toFixed(3)}`);
  }
  assert.ok(right.x > 0.1 && left.x < -0.1, `두 발이 바깥으로 ${left.x.toFixed(3)} ${right.x.toFixed(3)}`);
  assert.ok(Math.abs(right.x + left.x) < 1e-9 && Math.abs(right.z - left.z) < 1e-9, '두 다리는 좌우 대칭');
  // 무릎 아래는 무릎 위보다 덜 들린다(무릎이 굽었다): 정강이는 허벅지 끝에서 아래로 내려간다
  const knee = at({ x: 0.06, y: SIT_KNEE_Y + 0.03, z: 0 });
  assert.ok(knee.y > right.y + 0.02, `무릎이 발보다 높다 ${knee.y.toFixed(3)} > ${right.y.toFixed(3)}`);
  // 엉덩이 축 위는 다리처럼 돌지 않고 뒤로 조금 기댄다(가슴이 뒤로, 높이는 거의 그대로)
  const chest = at({ x: 0, y: 0.9, z: 0 });
  const back = -(0.9 - seat.x) * Math.sin(SIT_LEAN);
  assert.ok(Math.abs(chest.z - back) < 1e-9 && chest.z < -0.05, `뒤로 기댄다 ${chest.z.toFixed(3)}`);
  assert.ok(Math.abs(chest.x) < 1e-12);
  // 앉지 않으면 그대로
  const flat = at({ x: 0.06, y: 0.02, z: 0 }, 0);
  assert.ok(Math.abs(flat.x - 0.06) + Math.abs(flat.y - 0.02) + Math.abs(flat.z) < 1e-12, '앉지 않으면 그대로');
  // 붙은 다리(치마): 자락을 엉덩이보다 높은 축에서 앞으로 접고 벌리지 않는다
  const skirt = { apart: false, crotch: 0, split: 0 };
  const sh = legParams(skirt), ss = sitParams(skirt);
  assert.equal(sitSplay(skirt), 0);
  assert.ok(ss.x > 0.2 && ss.x < sh.x, `자락 접는 축 ${ss.x.toFixed(3)}`);
  const hem = legMove({ x: 0.08, y: 0.03, z: 0 }, 0, sh, 1, ss, 0);
  assert.ok(hem.z > 0.2 && Math.abs(hem.x - 0.08) < 1e-9, `자락 끝이 앞으로, 벌리지 않는다 ${hem.x.toFixed(3)} ${hem.z.toFixed(3)}`);
  // 판: 엉덩이 아래는 짧아지고 그 위는 엉덩이 높이 × 몫만큼 내려온다. 엉덩이에서 이어진다
  const still = { x: 0, y: 0, z: 0 };
  assert.ok(Math.abs(cardBend(0.1, 0.1, still, CARD_SIT).y - 0.1 * (1 - CARD_SIT)) < 1e-9);
  assert.ok(Math.abs(cardBend(0.1, 1.0, still, CARD_SIT).y - (1.0 - CARD_HIP * CARD_SIT)) < 1e-9);
  assert.ok(Math.abs(cardBend(0.1, CARD_HIP - 1e-6, still, CARD_SIT).y - cardBend(0.1, CARD_HIP + 1e-6, still, CARD_SIT).y) < 1e-5);
  assert.deepEqual(cardBend(0.1, 0.5, still, 0), cardBend(0.1, 0.5, still));
});

test('앉기: 인형·판·모형 모두 0.3초 남짓에 앉고, 다 앉아 가만히 있으면 더 그리지 않으며, 걸으면(sitting 끔) 일어선다. 줄인 움직임이면 바로', async () => {
  const sit = { ...stand, sitting: true };
  // 인형: 다리를 앞으로 들고 몸이 내려간다(서 있는 한 덩이가 아니라 다섯 덩이로)
  const d = createAvatar({ color: '#336699' });
  d.update(1 / 60, stand);
  assert.equal(d.group.getObjectByName('trunk'), undefined, '서 있으면 한 덩이');
  for (let i = 0; i < 30; i++) d.update(1 / 60, sit);
  const trunk = d.group.getObjectByName('trunk');
  assert.ok(trunk, '앉으면 다섯 덩이');
  assert.ok(d.pose().legL < -1.3 && d.pose().legR < -1.3, `다리 ${d.pose().legL.toFixed(2)}`);
  assert.ok(trunk.getWorldPosition(new THREE.Vector3()).y < -0.18, '몸이 내려간다');
  assert.equal(d.resting(), true, '다 앉으면 더 움직이지 않는다');
  // 공중이면 앉지 않는다
  d.update(1 / 60, { ...sit, airborne: true });
  assert.equal(d.resting(), false);
  for (let i = 0; i < 60; i++) d.update(1 / 60, stand);
  assert.ok(Math.abs(d.pose().legL) < 1e-3, '일어선다');
  assert.equal(d.resting(), true);
  assert.equal(d.group.getObjectByName('trunk'), undefined, '다시 한 덩이');
  d.dispose();
  // 줄인 움직임: 바로 앉고 바로 일어선다
  const r = createAvatar({ color: '#336699', reducedMotion: true });
  r.update(1 / 60, sit);
  assert.ok(Math.abs(r.pose().legL + 1.45) < 1e-9);
  r.update(1 / 60, stand);
  assert.equal(r.pose().legL, 0);
  r.dispose();

  setPhotoLoader(fakeViews);
  try {
    // 모형: 셰이더 앉은 몫이 1이 되고 틀이 엉덩이 축 높이만큼 내려간다. 이름표도 내려간다
    setModelLoader(() => Promise.resolve(fakeModel('legs')));
    const a = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0007' }, model: true, name: '앉는 손님' });
    await a.ready;
    await flush();
    assert.equal(a.form(), 'model');
    const legs = ((a.group.getObjectByName('photo-model') as THREE.Mesh).material as THREE.Material).userData.legs as LegUniforms;
    const rig = a.group.getObjectByName('model')!;
    const label = () => a.group.children.find((c) => (c as THREE.Sprite).isSprite)!.position.y;
    const labelStand = label();
    for (let i = 0; i < 40; i++) a.update(1 / 60, sit);
    assert.equal(legs.legSit.value.x, 1);
    assert.equal(legs.legSit.value.w, SIT_SPLAY, '따로인 다리는 벌린다');
    assert.equal(legs.legSeat.value.x, legs.legHip.value.x, '걷는 다리와 같은 축에서 앉는다');
    assert.ok(rig.position.y < -(legs.legHip.value.x - 0.06), `틀이 내려간다 ${rig.position.y.toFixed(3)}`);
    assert.ok(labelStand - label() > 0.1, '이름표도 내려간다');
    assert.equal(a.resting(), true);
    for (let i = 0; i < 60; i++) a.update(1 / 60, walk);
    assert.ok(legs.legSit.value.x < 1e-3 && Math.abs(label() - labelStand) < 1e-3, '걸으면 일어선다');
    a.dispose();
    forgetIdleModels();
    // 붙은 다리(치마): 자락째 접고 벌리지 않는다. 틀은 접는 축 높이만큼 내려간다
    setModelLoader(() => Promise.resolve(fakeModel('skirt')));
    const b = createAvatar({ look: { kind: 'photo', url: '/api/avatar/abcd0008' }, model: true });
    await b.ready;
    await flush();
    const sl = ((b.group.getObjectByName('photo-model') as THREE.Mesh).material as THREE.Material).userData.legs as LegUniforms;
    for (let i = 0; i < 40; i++) b.update(1 / 60, sit);
    assert.equal(sl.legSit.value.x, 1);
    assert.equal(sl.legSit.value.w, 0, '붙은 다리는 벌리지 않는다');
    const drop = sitParams({ apart: false, crotch: 0, split: 0 }).x - 0.05;
    assert.ok(Math.abs(b.group.getObjectByName('model')!.position.y + drop) < 0.02, `틀이 내려간다 ${b.group.getObjectByName('model')!.position.y.toFixed(3)}`);
    // 판으로 돌아가면 판이 다리를 누른다
    b.setModel(false);
    const card = b.group.getObjectByName('photo-card') as THREE.Mesh;
    b.update(1 / 60, sit);
    assert.ok(Math.abs(((card.material as THREE.Material).userData.cardSit as { value: number }).value - CARD_SIT) < 1e-9);
    b.dispose();
    forgetIdleModels();
    assert.deepEqual(avatarStats(), { avatars: 0, geometries: 0, materials: 0, labels: 0 });
  } finally {
    forgetIdleModels();
    setModelLoader(null);
    setPhotoLoader(null);
  }
});

/** 삼각형 하나짜리 GLB(그림을 주면 baseColor 텍스처로 넣는다) */
function tinyGlb(image: Uint8Array | null): ArrayBuffer {
  const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]);
  const imgAt = 36, imgLen = image ? image.length : 0;
  const binLen = Math.ceil((imgAt + imgLen) / 4) * 4;
  const json: Record<string, unknown> = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [0, 0.5, 0], scale: [0.5, 0.5, 0.5] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [image ? { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } } : { pbrMetallicRoughness: {} }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, ...(image ? [{ buffer: 0, byteOffset: imgAt, byteLength: imgLen }] : [])],
    buffers: [{ byteLength: binLen }],
    ...(image ? { textures: [{ source: 0 }], images: [{ bufferView: 1, mimeType: 'image/jpeg' }] } : {}),
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jb = new TextEncoder().encode(text);
  const total = 12 + 8 + jb.length + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jb, 20);
  const b0 = 20 + jb.length;
  dv.setUint32(b0, binLen, true); dv.setUint32(b0 + 4, 0x004e4942, true);
  out.set(new Uint8Array(pos.buffer), b0 + 8);
  if (image) out.set(image, b0 + 8 + imgAt);
  return out.buffer;
}

test('모형 받기: 없으면(404) null, 서버 오류는 던져 다시 묻게, GLB가 아니거나 너무 크면 null, 그림을 풀지 못한 모형은 하얀 덩어리로 세우지 않는다', async () => {
  const g = globalThis as unknown as { self?: unknown; fetch: typeof fetch };
  const realFetch = g.fetch, hadSelf = 'self' in g;
  // GLTFLoader는 브라우저의 self를 본다. 노드에는 그림을 푸는 길이 없어 텍스처는 늘 실패한다(앱 안 브라우저에서 그림 풀기가 실패한 때와 같다)
  if (!hadSelf) g.self = globalThis;
  const quiet = console.error;
  console.error = () => {};
  const answer = (status: number, body: ArrayBuffer | null, headers: Record<string, string> = {}) => { g.fetch = (async () => new Response(body, { status, headers })) as typeof fetch; };
  try {
    answer(404, null);
    assert.equal(await fetchModel('/api/avatar/abcd0009/model'), null);
    answer(404, null, { 'X-Avatar-Asset': 'pending' });
    assert.equal(await fetchModel('/api/avatar/abcd0009/model'), null, '그리는 중이면 없음(다시 묻는다)');
    answer(404, null, { 'X-Avatar-Asset': 'none' });
    assert.equal(await fetchModel('/api/avatar/abcd0009/model'), 'none', '앞으로도 없음');
    answer(503, null);
    await assert.rejects(fetchModel('/api/avatar/abcd0009/model'));
    answer(200, new TextEncoder().encode('<!doctype html><html></html>').buffer as ArrayBuffer);
    assert.equal(await fetchModel('/api/avatar/abcd0009/model'), null, 'GLB 머리가 아니다');
    answer(200, tinyGlb(null), { 'content-length': String(MODEL_MAX_BYTES + 1) });
    assert.equal(await fetchModel('/api/avatar/abcd0009/model'), null, '너무 크다');
    // 모양은 맞는 GLB: 그림이 없거나 풀지 못하면 쓰지 않는다
    assert.equal(await parseModel(tinyGlb(null)), null, '그림 없는 모형');
    answer(200, tinyGlb(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])));
    assert.equal(await fetchModel('/api/avatar/abcd0009/model'), null, '그림을 풀지 못한 모형');
  } finally {
    g.fetch = realFetch;
    console.error = quiet;
    if (!hadSelf) delete g.self;
  }
});
