// 반려동물 걸음 검사: 걷는 자세 모형에서 다리·꼬리·목 찾기(공개 폴더의 모형이 있으면 그것, 늘 지어낸 네 발 모형),
// 찾지 못할 때 null(예전처럼 몸만 흔든다), 디딘 발이 미끄러지지 않는지, 서 있으면 모형 그대로, 움직임 줄이기,
// 화면에 붙이는 셰이더 손질과 박자(걸은 거리), 멈추면 다시 그리기를 청하지 않게 잦아드는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';

const G = await import('../../src/walk/pet-gait.ts');
type PetRig = import('../../src/walk/pet-gait.ts').PetRig;
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
await MeshoptDecoder.ready;

// ───────── 모형 읽기: GLB의 꼭짓점(노드 변환을 구워 넣고 바닥 y 0, 엔진의 bake와 같게)과 색인

function readGlb(file: URL): { pos: Float32Array; idx: Uint32Array } {
  const b = readFileSync(file);
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString('utf8'));
  const bin = b.subarray(20 + jlen + 8);
  type Node = { mesh?: number; children?: number[]; scale?: number[]; translation?: number[]; rotation?: number[] };
  const nodes: Node[] = j.nodes;
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const meshNode = nodes.findIndex((n) => n.mesh !== undefined);
  const chain: Node[] = [];
  for (let i: number | undefined = meshNode; i !== undefined; i = parent.get(i)) chain.push(nodes[i]);
  const prim = j.meshes[nodes[meshNode].mesh!].primitives[0];
  const raw = (acc: number) => {
    const a = j.accessors[acc];
    const view = j.bufferViews[a.bufferView];
    const ext = view.extensions?.EXT_meshopt_compression;
    let out: Uint8Array;
    if (ext) {
      out = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
    } else out = new Uint8Array(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    return { a, dv: new DataView(out.buffer, out.byteOffset, out.byteLength), stride: (ext?.byteStride ?? view.byteStride) as number };
  };
  const P = raw(prim.attributes.POSITION);
  const pos = new Float32Array(P.a.count * 3);
  for (let i = 0; i < P.a.count; i++) {
    const o = (P.a.byteOffset ?? 0) + i * P.stride;
    let p = [0, 1, 2].map((k) => (P.a.componentType === 5126 ? P.dv.getFloat32(o + k * 4, true) : Math.max(P.dv.getInt16(o + k * 2, true) / (P.a.normalized ? 32767 : 1), -1)));
    for (const n of chain) {
      const s = n.scale ?? [1, 1, 1], t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1];
      const ang = 2 * Math.atan2(q[1], q[3]), c = Math.cos(ang), sn = Math.sin(ang);
      const x = p[0] * s[0], y = p[1] * s[1], z = p[2] * s[2];
      p = [x * c + z * sn + t[0], y + t[1], -x * sn + z * c + t[2]];
    }
    pos.set(p, i * 3);
  }
  let low = Infinity;
  for (let i = 1; i < pos.length; i += 3) low = Math.min(low, pos[i]);
  for (let i = 1; i < pos.length; i += 3) pos[i] -= low;
  const I = raw(prim.indices);
  const idx = new Uint32Array(I.a.count);
  for (let i = 0; i < I.a.count; i++) idx[i] = I.a.componentType === 5125 ? I.dv.getUint32(i * 4, true) : I.dv.getUint16(i * 2, true);
  return { pos, idx };
}

// ───────── 지어낸 네 발 모형: 네모 기둥 다리 넷, 상자 몸통, 위로 선 꼬리. 다리·꼬리 모서리가 몸통 판의 격자점과 겹쳐 하나로 이어진다

type Geo = { pos: number[]; idx: number[] };
const vert = (g: Geo, x: number, y: number, z: number) => { g.pos.push(x, y, z); return g.pos.length / 3 - 1; };
const quad = (g: Geo, a: number, b: number, c: number, d: number) => { g.idx.push(a, b, c, a, c, d); };
/** 네모 기둥: 가운데 (x, z)에서 위로 lean만큼 앞뒤로 기울고, 반폭 r, y0..y1을 n칸 고리로 */
function post(g: Geo, x: number, z: number, r: number, y0: number, y1: number, n: number, o: { bottom?: boolean; top?: boolean; lean?: number } = {}) {
  const rings: number[][] = [];
  for (let k = 0; k <= n; k++) {
    const y = y0 + ((y1 - y0) * k) / n, cz = z + ((o.lean ?? 0) * k) / n;
    rings.push([vert(g, x - r, y, cz - r), vert(g, x + r, y, cz - r), vert(g, x + r, y, cz + r), vert(g, x - r, y, cz + r)]);
  }
  for (let k = 0; k < n; k++) for (let j = 0; j < 4; j++) quad(g, rings[k][j], rings[k][(j + 1) % 4], rings[k + 1][(j + 1) % 4], rings[k + 1][j]);
  if (o.bottom !== false) quad(g, rings[0][3], rings[0][2], rings[0][1], rings[0][0]);
  if (o.top) quad(g, rings[n][0], rings[n][1], rings[n][2], rings[n][3]);
}
/** 가로 판: 꼭 지나야 할 점(xs × zs) 사이를 0.01보다 촘촘히 채운 격자(실제 모형처럼 고른 삼각형) */
function plate(g: Geo, xs0: number[], zs0: number[], y: number) {
  const fill = (a: number[]) => a.flatMap((v, i) => (i + 1 < a.length ? Array.from({ length: Math.ceil((a[i + 1] - v) / 0.01) }, (_, k) => v + ((a[i + 1] - v) * k) / Math.ceil((a[i + 1] - v) / 0.01)) : [v]));
  const xs = fill(xs0), zs = fill(zs0);
  const id = xs.map((x) => zs.map((z) => vert(g, x, y, z)));
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) quad(g, id[i][j], id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]);
}
type Animal = { legs?: Array<[number, number]>; lean?: number; tail?: boolean; legTop?: number };
/** 몸 x ±0.1, z ±0.25, y 0.2..0.4(다리 꼭대기 legTop). 다리는 가운데 (x, z), 반폭 0.025. 꼬리는 (0, -0.22)에서 0.65까지 */
function animal(o: Animal = {}): { pos: Float32Array; idx: Uint32Array } {
  const g: Geo = { pos: [], idx: [] };
  const legs = o.legs ?? [[0.06, 0.18], [-0.06, 0.18], [0.06, -0.18], [-0.06, -0.18]];
  const top = o.legTop ?? 0.2, r = 0.025;
  const xs = new Set([-0.1, 0.1]), zs = new Set([-0.25, 0.25]);
  for (const [x, z] of legs) {
    // 기운 다리: 꼭대기(몸통에 닿는 곳)가 (x, z), 발이 lean만큼 앞
    post(g, x, z + (o.lean ?? 0), r, 0, top, 8, { lean: -(o.lean ?? 0) });
    xs.add(x - r); xs.add(x + r); zs.add(z - r); zs.add(z + r);
  }
  const sort = (s: Set<number>) => [...s].sort((a, b) => a - b);
  plate(g, sort(xs), sort(zs), top);
  const xt = new Set([-0.1, 0.1]), zt = new Set([-0.25, 0.25]);
  if (o.tail !== false) {
    post(g, 0, -0.22, 0.02, 0.4, 0.65, 10, { bottom: false, top: true });
    xt.add(-0.02); xt.add(0.02); zt.add(-0.24); zt.add(-0.2);
  }
  plate(g, sort(xt), sort(zt), 0.4);
  // 옆면: 모서리 고리
  const c = [[-0.1, -0.25], [0.1, -0.25], [0.1, 0.25], [-0.1, 0.25]];
  const rings: number[][] = [];
  for (let k = 0; k <= 4; k++) rings.push(c.map(([x, z]) => vert(g, x, top + ((0.4 - top) * k) / 4, z)));
  for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) quad(g, rings[k][j], rings[k][(j + 1) % 4], rings[k + 1][(j + 1) % 4], rings[k + 1][j]);
  return { pos: new Float32Array(g.pos), idx: new Uint32Array(g.idx) };
}

/** 객체 안의 모든 수가 유한한가 */
function finite(v: unknown, path = 'rig'): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const bad = finite(x, `${path}.${k}`);
      if (bad) return bad;
    }
  }
  return null;
}
const DEG = 180 / Math.PI;

// ───────── 찾기

const walkUrl = new URL('../../public/pet-walk.glb', import.meta.url);
const restUrl = new URL('../../public/pet-rest.glb', import.meta.url);

test('공개 폴더의 걷는 모형: 다리 넷(앞뒤는 z, 좌우는 x), 배 높이, 꼬리와 목을 찾고 모든 값이 유한하다', { skip: !existsSync(walkUrl) }, () => {
  const { pos, idx } = readGlb(walkUrl);
  const rig = G.petRig(pos, idx);
  assert.ok(rig, '다리를 찾는다');
  const H = rig.height;
  assert.equal(finite({ ...rig, legW: null, partW: null }), null);
  assert.equal(rig.legs.length, 4);
  const [fl, fr, bl, br] = rig.legs;
  assert.ok(Math.min(fl.top.z, fr.top.z) > Math.max(bl.top.z, br.top.z), '앞다리 꼭대기가 뒷다리보다 앞');
  assert.ok(fl.top.x + fl.foot.x > fr.top.x + fr.foot.x && bl.top.x + bl.foot.x > br.top.x + br.foot.x, '쌍마다 왼쪽(+x)이 앞 칸');
  assert.ok(rig.belly > 0.15 * H && rig.belly < 0.4 * H, `배 높이 ${(rig.belly / H).toFixed(3)}H`);
  for (const l of rig.legs) {
    assert.ok(l.length > 0.15 * H && l.length < 0.6 * H, `다리 길이 ${(l.length / H).toFixed(3)}H`);
    assert.ok(Math.abs(l.tilt) < 0.9, `기운 각 ${(l.tilt * DEG).toFixed(1)}°`);
    assert.ok(l.pivot.y > l.top.y && l.pivot.y < 0.6 * H, '축은 다리 꼭대기 위, 몸 속');
    // 발은 바닥 가까이, 꼭대기 둘레는 몸 너비 안
    assert.ok(Math.abs(l.foot.z) < rig.length / 2 && Math.abs(l.top.x) < 0.3 * H);
  }
  assert.ok(rig.tail && rig.tail.length >= 0.15 * H && rig.tail.base[1] > rig.belly && rig.tail.base[2] < rig.center.z, '꼬리: 몸 뒤쪽 위에서');
  assert.ok(Math.abs(Math.hypot(...rig.tail.axis) - 1) < 1e-6, '흔드는 축은 단위 길이');
  assert.ok(rig.head && rig.head.z > rig.center.z && rig.head.y > rig.belly, '목: 앞쪽 위');
  // 같은 자리 꼭짓점(그림 이음매에서 나뉜 것)은 같은 무게: 움직여도 이음매가 벌어지지 않는다
  const seen = new Map<string, string>();
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const key = [0, 1, 2].map((k) => Math.round(pos[i * 3 + k] * 1e5)).join(',');
    const w = [...rig.legW.subarray(i * 4, i * 4 + 4), ...rig.partW.subarray(i * 2, i * 2 + 2)].join(',');
    const before = seen.get(key);
    if (before !== undefined) assert.equal(w, before, '같은 자리 꼭짓점의 무게');
    else seen.set(key, w);
  }
  // 발 끝(바닥 3% 안)은 다리를 다 따르고, 등(배보다 키의 25% 위, 꼬리·머리 밖)은 다리를 따르지 않는다
  let paws = 0, backs = 0;
  for (let i = 0; i < n; i++) {
    const sum = rig.legW[i * 4] + rig.legW[i * 4 + 1] + rig.legW[i * 4 + 2] + rig.legW[i * 4 + 3];
    assert.ok(sum <= 258, '다리 무게의 합은 1 이하(반올림 여유)');
    if (pos[i * 3 + 1] < 0.03 * H) { paws++; assert.ok(sum >= 250, `발 끝 무게 ${sum}`); }
    if (pos[i * 3 + 1] > rig.belly + 0.25 * H && rig.partW[i * 2] === 0 && rig.partW[i * 2 + 1] === 0) { backs++; assert.equal(sum, 0, '등은 다리를 따르지 않는다'); }
  }
  assert.ok(paws > 20 && backs > 20);
});

test('공개 폴더의 쉬는 모형: 다리 넷이 따로 보이지 않으면 null(쉬는 모형은 손대지 않는다)', { skip: !existsSync(restUrl) }, () => {
  const { pos, idx } = readGlb(restUrl);
  assert.equal(G.petRig(pos, idx), null);
});

test('지어낸 네 발 모형: 다리 넷의 자리와 차례, 곧은 다리, 배 높이, 꼬리 뿌리', () => {
  const { pos, idx } = animal();
  const rig = G.petRig(pos, idx);
  assert.ok(rig);
  assert.equal(finite({ ...rig, legW: null, partW: null }), null);
  const want = [[0.06, 0.18], [-0.06, 0.18], [0.06, -0.18], [-0.06, -0.18]];
  rig.legs.forEach((l, i) => {
    assert.ok(Math.abs(l.foot.x - want[i][0]) < 0.005 && Math.abs(l.foot.z - want[i][1]) < 0.005, `다리 ${i} 발 ${l.foot.x.toFixed(3)}, ${l.foot.z.toFixed(3)}`);
    assert.ok(Math.abs(l.top.x - want[i][0]) < 0.005 && Math.abs(l.top.z - want[i][1]) < 0.005, `다리 ${i} 꼭대기`);
    assert.ok(Math.abs(l.top.y - 0.2) < 0.01, `다리 ${i} 꼭대기 높이 ${l.top.y.toFixed(3)}`);
    assert.ok(Math.abs(l.tilt) < 0.02, `곧은 다리 ${(l.tilt * DEG).toFixed(1)}°`);
  });
  assert.ok(Math.abs(rig.belly - 0.2) < 0.01);
  assert.ok(rig.tail, '꼬리');
  assert.ok(Math.abs(rig.tail.base[0]) < 0.02 && Math.abs(rig.tail.base[2] + 0.22) < 0.02 && Math.abs(rig.tail.base[1] - 0.4) < 0.04, `꼬리 뿌리 ${rig.tail.base.map((v) => v.toFixed(3))}`);
  assert.ok(Math.abs(rig.tail.length - 0.25) < 0.06, `꼬리 길이 ${rig.tail.length.toFixed(3)}`);
  // 선 꼬리는 앞뒤 축(z) 둘레로 흔든다: 끝이 옆(x)으로 간다
  assert.ok(Math.abs(rig.tail.axis[2]) > 0.95, `흔드는 축 ${rig.tail.axis}`);
});

test('지어낸 모형: 기운 다리는 기운 각을 잰다(발이 앞이면 +), 꼬리가 없으면 꼬리만 없다', () => {
  const rig = G.petRig(...Object.values(animal({ lean: 0.05, tail: false })) as [Float32Array, Uint32Array]);
  assert.ok(rig);
  for (const l of rig.legs) assert.ok(l.tilt > 0.1 && l.tilt < 0.35, `기운 각 ${(l.tilt * DEG).toFixed(1)}°`);
  assert.equal(rig.tail, null);
  assert.ok(rig.legW.some((w) => w > 0));
});

test('찾지 못하면 null: 다리 셋, 다리 없는 상자, 앞뒤로 갈리지 않는 다리, 이상한 값', () => {
  const three = animal({ legs: [[0.06, 0.18], [-0.06, 0.18], [0.06, -0.18]] });
  assert.equal(G.petRig(three.pos, three.idx), null, '다리 셋');
  const box = animal({ legs: [], tail: false });
  assert.equal(G.petRig(box.pos, box.idx), null, '다리 없음');
  const bunched = animal({ legs: [[0.06, 0.03], [-0.06, 0.03], [0.06, -0.03], [-0.06, -0.03]] });
  assert.equal(G.petRig(bunched.pos, bunched.idx), null, '네 다리가 몸 가운데에 모였다');
  const { pos, idx } = animal();
  const nan = pos.slice();
  nan[7] = Number.NaN;
  assert.equal(G.petRig(nan, idx), null, 'NaN 자리');
  const far = idx.slice();
  far[5] = pos.length;
  assert.equal(G.petRig(pos, far), null, '없는 꼭짓점을 가리키는 색인');
  assert.equal(G.petRig(new Float32Array(30), null), null, '꼭짓점이 너무 적다');
  assert.equal(G.petRig(new Float32Array(300), null), null, '납작한 기하');
});

// ───────── 자세

const real = existsSync(walkUrl) ? (() => { const { pos, idx } = readGlb(walkUrl); return G.petRig(pos, idx); })() : null;
const rigs: Array<[string, PetRig]> = [['지어낸 모형', G.petRig(animal().pos, animal().idx)!], ...(real ? [['공개 폴더 모형', real] as [string, PetRig]] : [])];

for (const [name, rig] of rigs) {
  test(`${name}: 서 있으면(amp 0) 모형 그대로, 어떤 박자·값에도 유한하다`, () => {
    const pose = G.gaitPose(rig, { phase: 0.37, amp: 0, run: 0.5, stride: 1 }, G.gaitPoseNew());
    const p = [0.03, 0.05, 0.1], w = [0.25, 0.25, 0.25, 0.25];
    const q = G.deformPoint(rig, pose, p, w, [0.5, 0.5]);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(q[k] - p[k]) < 1e-6, `자리 ${q}`);
    const nrm = G.deformPoint(rig, pose, [0, 1, 0], w, [0.5, 0.5], true);
    assert.ok(Math.abs(nrm[1] - 1) < 1e-6 && Math.abs(nrm[2]) < 1e-6, '법선');
    assert.equal(pose.bob, 0);
    for (const g of [{ phase: Number.NaN, amp: 1, run: 0, stride: 1 }, { phase: Infinity, amp: 2, run: 2, stride: 0 }, { phase: -3.7, amp: -1, run: -1, stride: Number.NaN }, { phase: 1e9, amp: 1, run: 1, stride: 99 }]) {
      const ps = G.gaitPose(rig, g, G.gaitPoseNew());
      assert.equal(finite(ps, 'pose'), null, JSON.stringify(g));
    }
  });

  test(`${name}: 디딘 발은 바닥 한 자리에 머문다(걷기·달리기, 박자는 걸은 거리)`, () => {
    for (const run of [0, 1]) {
      const S = G.gaitStride(rig, run);
      assert.ok(S > 0.1 * rig.height && S < 3 * rig.height, `보폭 ${S}`);
      const pose = G.gaitPoseNew();
      for (let i = 0; i < 4; i++) {
        const l = rig.legs[i];
        const w = [0, 0, 0, 0];
        w[i] = 1;
        // 발 닿는 점(발 가운데, 바닥): 디딘 동안 땅에 대한 자리 = 몸 안 자리 + 몸이 간 거리(박자 × 보폭)
        // 두 바퀴를 고르게 훑는다. 디딘 때가 끊기면(발을 들면) 새로 잰다
        let first: number | null = null, stance = 0;
        for (let k = 0; k <= 800; k++) {
          const u = k / 400;
          G.gaitPose(rig, { phase: u, amp: 1, run, stride: 1 }, pose);
          const off = [0, 0.5, 0.5, 0][i] * (1 - run) + [0.08, 0, 0.5, 0.58][i] * run;
          const s = G.legStep(u + off, 0.55 + (0.36 - 0.55) * run);
          if (s.lift > 0 || s.reach > 0.98 || s.reach < -0.98) { first = null; continue; }
          const q = G.deformPoint(rig, pose, [l.foot.x, rig.floor, l.foot.z], w, [0, 0]);
          const ground = q[2] + u * S;
          if (first === null) first = ground;
          stance++;
          assert.ok(Math.abs(ground - first) < 2e-3 * rig.height, `다리 ${i} 달리기 ${run}: 미끄러짐 ${(ground - first).toFixed(5)}`);
          assert.ok(Math.abs(q[1] + pose.bob - rig.floor) < 2e-3 * rig.height, `다리 ${i}: 바닥에서 ${(q[1] + pose.bob - rig.floor).toFixed(5)}`);
        }
        assert.ok(stance > 50, '디딘 때가 있다');
      }
    }
  });

  test(`${name}: 걷기는 대각선 두 쌍이 함께, 달리기는 앞 두 발과 뒤 두 발이 반 바퀴 엇갈려 몸을 기울이고 늘인다`, () => {
    const pose = G.gaitPoseNew();
    let pitch = 0, stretch = 0, bobRun = 0, bobWalk = 0, swayW = 0;
    const walkA: number[][] = [[], [], [], []], runA: number[][] = [[], [], [], []];
    for (let k = 0; k < 64; k++) {
      const u = k / 64;
      G.gaitPose(rig, { phase: u, amp: 1, run: 0, stride: 1 }, pose);
      pose.angle.forEach((a, i) => walkA[i].push(a));
      assert.ok(Math.abs(pose.pitch) < 1e-9 && Math.abs(pose.stretch) < 1e-9, '걸을 때는 몸을 앞뒤로 기울이지 않는다');
      bobWalk = Math.max(bobWalk, pose.bob);
      swayW = Math.max(swayW, Math.abs(pose.sway1));
      G.gaitPose(rig, { phase: u, amp: 1, run: 1, stride: 1 }, pose);
      pose.angle.forEach((a, i) => runA[i].push(a));
      pitch = Math.max(pitch, Math.abs(pose.pitch));
      stretch = Math.max(stretch, Math.abs(pose.stretch));
      bobRun = Math.max(bobRun, pose.bob);
    }
    // 다리 각이 함께 움직이는 정도(상관). 0 앞왼, 1 앞오른, 2 뒤왼, 3 뒤오른
    const corr = (a: number[], b: number[]) => {
      const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
      let ab = 0, aa = 0, bb = 0;
      a.forEach((x, i) => { ab += (x - ma) * (b[i] - mb); aa += (x - ma) ** 2; bb += (b[i] - mb) ** 2; });
      return ab / Math.sqrt(aa * bb);
    };
    assert.ok(corr(walkA[0], walkA[3]) > 0.99 && corr(walkA[1], walkA[2]) > 0.99, '걷기: 대각선 쌍은 함께');
    assert.ok(corr(walkA[0], walkA[1]) < -0.5 && corr(walkA[2], walkA[3]) < -0.5, '걷기: 좌우는 엇갈린다');
    assert.ok(corr(runA[0], runA[1]) > 0.8 && corr(runA[2], runA[3]) > 0.8, `달리기: 앞 두 발, 뒤 두 발은 거의 함께 ${corr(runA[0], runA[1]).toFixed(2)}`);
    assert.ok(corr(runA[0], runA[2]) < -0.5 && corr(runA[1], runA[3]) < -0.5, '달리기: 앞과 뒤는 엇갈린다');
    assert.ok(pitch > 0.05 && stretch > 0.02, `달리기 기울기 ${pitch} 늘임 ${stretch}`);
    assert.ok(bobRun > 2 * bobWalk && bobWalk > 0, '달릴 때 더 높이 뜬다');
    assert.ok(swayW > 0.2, '걸을 때 꼬리를 흔든다');
  });

  test(`${name}: 움직임 줄이기는 다리만 조금, 몸·꼬리·머리는 그대로`, () => {
    const pose = G.gaitPoseNew(), full = G.gaitPoseNew();
    const most = [0, 0, 0, 0], mostFull = [0, 0, 0, 0];
    for (let k = 0; k < 64; k++) {
      const u = k / 64;
      for (const run of [0, 1]) {
        G.gaitPose(rig, { phase: u, amp: 1, run, stride: 1, reduce: true }, pose);
        G.gaitPose(rig, { phase: u, amp: 1, run, stride: 1 }, full);
        for (const key of ['bob', 'roll', 'shift', 'pitch', 'stretch', 'sway0', 'sway1', 'tailBack', 'nod'] as const) assert.ok(pose[key] === 0, key);
        for (let i = 0; i < 4; i++) {
          most[i] = Math.max(most[i], Math.abs(pose.angle[i] - rig.legs[i].tilt));
          mostFull[i] = Math.max(mostFull[i], Math.abs(full.angle[i] - rig.legs[i].tilt));
        }
      }
    }
    // 다리가 가장 크게 휘는 각이 보통의 1/5 아래
    for (let i = 0; i < 4; i++) assert.ok(most[i] <= 0.2 * mostFull[i], `다리 ${i}: ${most[i].toFixed(3)} / ${mostFull[i].toFixed(3)}`);
  });
}

// ───────── 화면에 붙이기

function meshOf({ pos, idx }: { pos: Float32Array; idx: Uint32Array }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial());
}

test('셰이더 손질: three.js 표준 재질에 바꿔 끼울 자리가 있고, 손질한 꼭짓점 셰이더가 걸음 계산을 부른다. 무게는 처음에 0(모형 그대로)', async () => {
  const lib = THREE.ShaderLib.standard.vertexShader;
  for (const inc of ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>']) assert.ok(lib.includes(inc), inc);
  const mesh = meshOf(animal());
  const r0 = mesh.geometry.boundingSphere!.radius;
  const paws = G.pawGait(mesh, 1.24);
  assert.ok(paws);
  const mat = mesh.material as THREE.MeshStandardMaterial;
  assert.equal(mat.customProgramCacheKey(), 'pet-gait');
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: lib, fragmentShader: '' };
  mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
  assert.match(shader.vertexShader, /objectNormal = gaitMove\( objectNormal, true \);/);
  assert.match(shader.vertexShader, /transformed = gaitMove\( transformed, false \);/);
  for (const k of ['gaitM', 'gaitR', 'gaitBody', 'gaitTail', 'gaitTailAxis', 'gaitPart', 'gaitNeck']) assert.ok(k in shader.uniforms, k);
  const n = mesh.geometry.getAttribute('position').count;
  const leg = mesh.geometry.getAttribute('petLeg') as THREE.BufferAttribute, part = mesh.geometry.getAttribute('petPart') as THREE.BufferAttribute;
  assert.equal(leg.count, n);
  assert.equal(part.count, n);
  assert.ok((leg.array as Uint8Array).every((v) => v === 0) && paws.rig === null, '찾기 전: 무게 0, 다리 없음');
  assert.equal(await paws.ready, true);
  assert.ok(paws.rig && (leg.array as Uint8Array).some((v) => v > 0) && (part.array as Uint8Array).some((v) => v > 0), '찾은 뒤: 무게를 채운다');
  assert.ok(mesh.geometry.boundingSphere!.radius > r0, '감싼 공을 키운다(뻗은 다리가 잘리지 않게)');
});

test('다리 찾기는 쉬는 틈마다 잘게 나눠 돌고, 기하를 버리면 그만둔다', async () => {
  const queue: Array<() => void> = [];
  const mesh = meshOf(animal());
  const paws = G.pawGait(mesh, 1.24, { soon: (fn) => queue.push(fn), budget: 0 })!;
  let ticks = 0;
  while (queue.length) { queue.shift()!(); ticks++; }
  assert.equal(await paws.ready, true);
  assert.ok(ticks > 20, `나눈 수 ${ticks}`);
  const late = meshOf(animal());
  const q2: Array<() => void> = [];
  const p2 = G.pawGait(late, 1.24, { soon: (fn) => q2.push(fn), budget: 0 })!;
  q2.shift()!();
  late.geometry.dispose();
  while (q2.length) q2.shift()!();
  assert.equal(await p2.ready, false);
  assert.equal(p2.rig, null);
});

test('다리를 못 찾은 모형: 걸음은 아무것도 하지 않는다(예전처럼 몸만 흔든다, 다시 그리기도 청하지 않는다)', async () => {
  const mesh = meshOf(animal({ legs: [], tail: false }));
  const paws = G.pawGait(mesh, 1.24)!;
  assert.equal(await paws.ready, false);
  assert.equal(paws.rig, null);
  const body = { bob: 0.01, roll: 0.02, shift: 0.003 };
  paws.step({ moving: true, speed: 0.8, dist: 1 }, true, false, 1000, body);
  paws.step({ moving: true, speed: 0.8, dist: 1.1 }, true, false, 1100, body);
  assert.deepEqual(body, { bob: 0.01, roll: 0.02, shift: 0.003 }, '몸 흔들림은 화면이 정한 그대로');
  assert.equal(paws.change(), 0);
  assert.ok(((mesh.geometry.getAttribute('petLeg') as THREE.BufferAttribute).array as Uint8Array).every((v) => v === 0), '무게 0: 셰이더는 모형 그대로');
  // 위치 속성이 약속과 다르면(끼워 넣은 버퍼 등) 손대지 않는다
  const odd = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  assert.equal(G.pawGait(odd, 1.24), null);
});

test('박자: 걸은 거리만큼 돌고, 달리기로 넘어가며, 멈추면 잦아들어 다시 그리기를 청하지 않는다', async () => {
  const mesh = meshOf(animal());
  const k = 1.24;
  const paws = G.pawGait(mesh, k)!;
  assert.equal(await paws.ready, true);
  const rig = paws.rig!;
  const body = { bob: 0, roll: 0, shift: 0 };
  let t = 1000, dist = 0;
  const walk = (ms: number, st: { moving: boolean; speed: number; gait?: string }) => {
    let moved = 0;
    for (let i = 0; i < ms / 16; i++) {
      t += 16;
      if (st.moving) dist += (st.speed * 16) / 1000;
      paws.step({ ...st, dist }, true, false, t, body);
      moved = Math.max(moved, paws.change());
      paws.drawn();
    }
    return moved;
  };
  const first = walk(1000, { moving: true, speed: 0.8, gait: 'walk' });
  assert.ok(first > 0.01, '걸으면 움직인다');
  const d0 = paws.debug();
  assert.equal(d0.amp, 1);
  assert.equal(d0.run, 0);
  // 박자는 걸은 거리 / (보폭 × 배율): 1초 가까이 더 걸으면(0.8m) 그만큼 돈다
  const before = paws.debug().phase;
  walk(992, { moving: true, speed: 0.8, gait: 'walk' });
  const turned = (paws.debug().phase - before + 2) % 2;
  const want = ((0.8 * 0.992) / (G.gaitStride(rig, 0, 1) * k)) % 2;
  assert.ok(Math.abs(turned - want) < 0.02, `박자 ${turned} / ${want}`);
  assert.ok(body.bob >= 0 && Math.abs(body.roll) < 0.1);
  // 달리기: 상태가 run이면(없으면 빠르기로) 0.35초 안에 넘어간다
  walk(400, { moving: true, speed: 2.2, gait: 'run' });
  assert.equal(paws.debug().run, 1);
  walk(400, { moving: true, speed: 2.2 });
  assert.equal(paws.debug().run, 1, '상태 값이 없으면 빠르기로');
  // 멈추면 0.25초 안에 서 있는 자세로 돌아오고 그 뒤로는 바뀌지 않는다
  walk(300, { moving: false, speed: 0 });
  assert.equal(paws.debug().amp, 0);
  assert.equal(walk(500, { moving: false, speed: 0 }), 0, '서 있으면 다시 그리기를 청하지 않는다');
  assert.deepEqual([body.bob, body.roll, body.shift], [0, 0, 0]);
  // 쉬는 자세가 보이면(걷는 모형 숨음) 서 있는 자세로 둔다
  walk(500, { moving: true, speed: 0.8, gait: 'walk' });
  paws.step({ moving: false, speed: 0, dist }, false, false, (t += 16), body);
  assert.equal(paws.debug().amp, 0);
  assert.ok([...paws.pose.m].every((v, i) => Math.abs(v - [1, 0, 0, 1][i % 4]) < 1e-6), '다리 행렬이 그대로');
});
