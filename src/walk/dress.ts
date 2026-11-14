// 장식 짓기: decor.ts가 고른 자리에 그림·화분·커튼·발·깔개·처마·포치 등·빛 웅덩이·화단·울타리를 짓는다.
// 그리기 호출을 늘리지 않으려고 거의 모두 꼭짓점 색 재질 하나(가구의 꽃 재질과 같은 것)로 묶고, 그림·깔개·기와는
// 그림 묶음 한 장씩을 나눠 쓴다. 묶음(층·숨김·마당·지붕)마다 재질별로 한 덩어리가 되어 굽기(bake.ts)를 거친다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DecorPlan, Eave } from './decor';
import { DECOR_SIZE } from './decor';
import type { FurnitureKit } from './furnish';
import { ART, RUGS, artAtlas, glow, rugAtlas, wash } from './textures';
import { enlargeSurface, insetAtlasUV, SURFACE_ASSETS } from './generated-surfaces';
import type { HouseWorld, Level } from './types';

/** 장식을 붙일 묶음들 */
export type DressTargets = {
  onPlant?: (target: THREE.Group) => void;
  /** 층 바닥에 놓는 것(화분·깔개) */
  level: (lv: Level) => THREE.Group;
  /** 벽에 거는 것(그림·커튼): 3인칭으로 벽을 낮출 때 함께 숨는다 */
  hide: (lv: Level) => THREE.Group;
  /** 마당·포치 바닥 */
  ground: THREE.Group;
  /** 지붕과 함께 걷히는 것(처마) */
  roof: THREE.Group;
  /** 포치 지붕판과 함께 숨는 것(포치 천장에 매단 등) */
  porch: THREE.Group;
  /** (x, z)가 포치·마당 바닥인가(현관 매트를 마당 묶음에 둔다) */
  outdoor: (x: number, z: number) => boolean;
};

const TAU = Math.PI * 2;
const tmpColor = new THREE.Color();

/** 꼭짓점 색 재질(가구 꽃 재질과 같은 열쇠라 한 재질을 함께 쓴다) */
export const vertexMat = (kit: FurnitureKit) => kit.once('m:bloom', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));

/** 놋쇠·은 같은 금속 장식(그림등·그림틀 테): 꼭짓점 색 하나에 금속 성질. 층마다 한 번에 그린다 */
export const metalMat = (kit: FurnitureKit) => kit.once('m:metalVc', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.88, roughness: 0.3 }));

/** 그림등 빛 재질: 더하기 섞기, 깊이를 쓰지 않는다(빛 웅덩이와 같은 방식, 결이 위에서 아래로 사라진다) */
export const washMaterial = (kit: FurnitureKit) => kit.once('m:wash', () => {
  const m = new THREE.MeshBasicMaterial({ map: kit.once('t:wash', () => wash()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  return m;
});

/** 처마·박공 기와 재질(텍스처를 되풀이하고, 크기는 도형 UV로 맞춘다) */
export const tileMat = (kit: FurnitureKit) => kit.once('m:roofTiles', () => new THREE.MeshStandardMaterial({ color: '#b9b6a9', roughness: 0.9 }));

/** 위치·법선·색만 남긴 색인 없는 도형(합치기 좋게) */
function plainColored(g: THREE.BufferGeometry, color: string | THREE.Color, shade?: (p: THREE.Vector3, c: THREE.Color) => void): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  if (src !== g) g.dispose();
  src.deleteAttribute('uv');
  if (!src.attributes.normal) src.computeVertexNormals();
  const pos = src.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const base = color instanceof THREE.Color ? color : new THREE.Color(color);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmpColor.copy(base);
    if (shade) shade(p.fromBufferAttribute(pos, i), tmpColor);
    col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b;
  }
  src.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return src;
}

/** 묶음 하나에 모을 조각들(재질 하나로 합친다) */
export class Batch {
  parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    if (m) g.applyMatrix4(m);
    this.parts.push(g);
  }
  mesh(mat: THREE.Material): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    if (!merged) return null;
    merged.computeBoundingSphere();
    return new THREE.Mesh(merged, mat);
  }
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const S = new THREE.Vector3(1, 1, 1);
const P = new THREE.Vector3();
/** 자리(x, y, z)·y축 회전·크기로 행렬 */
export const place = (x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1) => M.compose(P.set(x, y, z), Q.setFromEuler(E.set(0, yaw, 0)), S.set(sx, sy, sz)).clone();

export const cbox = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) => plainColored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const ccyl = (rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 12) => plainColored(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), color);

function seeded(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ───────── 그림: 1층은 월넛 틀에 놋쇠 테, 2층은 은 틀에 먹색 테. 둘 다 그림 둘레에 매트(흰 여백)를 둔다
function painting(p: DecorPlan['paintings'][number], frames: Batch, metal: Batch, canvases: THREE.BufferGeometry[]) {
  const ink = p.level === 2;
  const fw = ink ? 0.034 : 0.05, depth = 0.04;
  const outerColor = ink ? '#c9ccd1' : '#4a2f1d', lipColor = ink ? '#151515' : '#c29a5b';
  const outer = ink ? metal : frames, lip = ink ? frames : metal;
  const m = place(p.x, p.y, p.z, p.yaw);
  for (const s of [-1, 1]) {
    outer.add(cbox(p.w, fw, depth, outerColor, 0, s * (p.h / 2 - fw / 2), depth / 2), m);
    outer.add(cbox(fw, p.h - fw * 2, depth, outerColor, s * (p.w / 2 - fw / 2), 0, depth / 2), m);
    lip.add(cbox(p.w - fw * 2, 0.012, 0.012, lipColor, 0, s * (p.h / 2 - fw - 0.006), depth - 0.006), m);
    lip.add(cbox(0.012, p.h - fw * 2, 0.012, lipColor, s * (p.w / 2 - fw - 0.006), 0, depth - 0.006), m);
  }
  // 뒤판(벽에서 떠 보이지 않게)과 매트
  frames.add(cbox(p.w - 0.02, p.h - 0.02, 0.012, '#2a211b', 0, 0, 0.006), m);
  const iw0 = p.w - fw * 2, ih0 = p.h - fw * 2;
  const mat = Math.min(0.085, 0.11 * Math.min(iw0, ih0));
  frames.add(cbox(iw0, ih0, 0.006, ink ? '#efede7' : '#f1e8d6', 0, 0, depth - 0.016), m);
  // 그림: 묶음의 칸에서 액자 비율만큼 가운데를 잘라 쓴다(늘이지 않는다)
  const iw = iw0 - mat * 2, ih = ih0 - mat * 2;
  const g = new THREE.PlaneGeometry(iw, ih);
  const col = p.art % ART.cols, row = Math.floor(p.art / ART.cols);
  const aspect = iw / ih;
  const cu = aspect >= 1 ? 1 : aspect, cv = aspect >= 1 ? 1 / aspect : 1;
  const u0 = insetAtlasUV((1 - cu) / 2, col, ART.cols), u1 = insetAtlasUV((1 + cu) / 2, col, ART.cols);
  const v0 = 1 - insetAtlasUV((1 + cv) / 2, row, ART.rows), v1 = 1 - insetAtlasUV((1 - cv) / 2, row, ART.rows);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  g.translate(0, 0, depth - 0.0115);
  g.applyMatrix4(m);
  canvases.push(g);
}

// ───────── 그림등: 벽 받침, 앞으로 나온 팔, 그림 쪽으로 빛을 내리는 막대(밑면은 밝은 확산판)
/** 그림등 하나의 금속 부분과 막대 밑 확산판(세계 좌표). 빛은 그림과 벽에 번지는 판(washPlane)이 맡는다 */
export function pictureLightGeometry(l: DecorPlan['pictureLights'][number]): { metal: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[] } {
  const c = l.finish === 'brass' ? '#c29a5b' : '#cfd3d8';
  const m = place(l.x, l.y, l.z, l.yaw);
  const { lightPlate: plate } = DECOR_SIZE;
  const drop = 0.05, bar = 0.021;
  const metal = [
    cbox(0.075, plate, 0.016, c, 0, 0, 0.008),
    cbox(0.016, 0.016, l.reach - 0.008, c, 0, 0.012, 0.016 + (l.reach - 0.008) / 2 - 0.008),
    cbox(0.016, drop, 0.016, c, 0, 0.012 - drop / 2, l.reach),
    plainColored(new THREE.CylinderGeometry(bar, bar, l.w, 14).rotateZ(Math.PI / 2).translate(0, 0.012 - drop, l.reach), c),
  ].map((g) => g.applyMatrix4(m));
  const glow = [cbox(l.w * 0.9, 0.005, bar * 1.1, '#fff1d2', 0, 0.012 - drop - bar + 0.0015, l.reach - 0.004).applyMatrix4(m)];
  return { metal, glow };
}

/** 그림등 빛이 벽과 그림에 번지는 판: 위가 등 막대 높이, 그림보다 조금 넓고 길게(사진 갤러리 액자도 같이 쓴다) */
export function washPlane(p: { w: number; h: number }, l: DecorPlan['pictureLights'][number]) {
  const w = p.w + 0.6, h = p.h + 0.4;
  const top = l.y + 0.012 - 0.05;
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, top - h / 2 - l.y, 0.062);
  return g.applyMatrix4(place(l.x, l.y, l.z, l.yaw));
}

// ───────── 커튼·발
function drape(c: DecorPlan['curtains'][number], b: Batch, seed: number) {
  const h = c.y1 - c.y0, folds = 5;
  const g = new THREE.PlaneGeometry(c.w, h, 14, 6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const r = seeded(seed);
  const ph = r() * TAU;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), t = pos.getY(i) / h + 0.5; // 아래 0, 위 1
    // 위는 촘촘한 주름, 아래로 갈수록 조금 퍼지고 깊어진다. 아래 1/3쯤을 묶은 듯 살짝 모은다
    const tie = Math.exp(-(((t - 0.36) / 0.1) ** 2));
    const spread = 1 + (1 - t) * 0.08 - tie * 0.2;
    pos.setX(i, x * spread);
    pos.setZ(i, 0.035 * (1 + (1 - t) * 0.6) * Math.sin((x / c.w + 0.5) * Math.PI * folds * 2 + ph) * (1 - tie * 0.5));
  }
  g.computeVertexNormals();
  const linen = new THREE.Color('#e4d6ba');
  const front = plainColored(g, linen, (p, col) => col.multiplyScalar(0.86 + 0.14 * Math.min(1, Math.max(0, (p.z + 0.04) / 0.08))));
  // 뒷면(창 밖에서 보이는 면): 같은 주름을 뒤집어 붙인다
  const back = front.clone();
  const bp = back.attributes.position as THREE.BufferAttribute;
  const bn = back.attributes.normal as THREE.BufferAttribute;
  const bc = back.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i += 3) {
    for (const a of [bp, bn, bc]) {
      const x0 = a.getX(i), y0 = a.getY(i), z0 = a.getZ(i);
      a.setXYZ(i, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x0, y0, z0);
    }
  }
  for (let i = 0; i < bn.count; i++) bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
  for (let i = 0; i < bp.count; i++) bp.setZ(i, bp.getZ(i) - 0.006);
  // 묶은 띠(테라코타)
  const band = cbox(c.w * 0.82, 0.05, 0.09, '#a5553a', 0, h * (0.36 - 0.5), 0.0);
  const m = place(c.x, c.y0 + h / 2, c.z, c.yaw);
  for (const part of [front, back, band]) b.add(part, m);
}

function blind(c: DecorPlan['curtains'][number], b: Batch) {
  const h = c.y1 - c.y0;
  const m = place(c.x, c.y0, c.z, c.yaw);
  const parts: THREE.BufferGeometry[] = [];
  // 대나무 살(가로 줄): 밝고 어두운 살을 번갈아
  const n = Math.max(6, Math.round(h / 0.028));
  for (let i = 0; i < n; i++) parts.push(cbox(c.w, h / n - 0.004, 0.012, i % 2 ? '#c8a96a' : '#b48f55', 0, (i + 0.5) * (h / n), 0));
  // 위에 말아 올린 발(원통)과 늘어뜨린 매듭 끈 둘
  parts.push(plainColored(new THREE.CylinderGeometry(0.035, 0.035, c.w + 0.02, 10).rotateZ(Math.PI / 2).translate(0, h + 0.01, 0.01), '#a8854a'));
  for (const s of [-1, 1]) {
    parts.push(cbox(0.01, h * 0.7, 0.01, '#8e3b2e', s * c.w * 0.3, h * 0.65, 0.02));
    parts.push(plainColored(new THREE.SphereGeometry(0.022, 8, 6).translate(s * c.w * 0.3, h * 0.3, 0.02), '#a8452e'));
    parts.push(ccyl(0.012, 0.03, 0.09, '#a8452e', s * c.w * 0.3, h * 0.24, 0.02, 8));
  }
  for (const g of parts) b.add(g, m);
}

function rod(r: DecorPlan['rods'][number], b: Batch) {
  const len = r.b - r.a, mid = (r.a + r.b) / 2;
  const [x, z] = r.axis === 'x' ? [mid, r.line] : [r.line, mid];
  const yaw = r.axis === 'x' ? 0 : Math.PI / 2;
  const m = place(x, r.y, z, yaw);
  b.add(plainColored(new THREE.CylinderGeometry(0.014, 0.014, len, 8).rotateZ(Math.PI / 2), '#4a2f1d'), m);
  for (const s of [-1, 1]) b.add(plainColored(new THREE.SphereGeometry(0.03, 10, 8).translate(s * len / 2, 0, 0), '#b08d57'), m);
}

// ───────── 화분
const LEAF_GREENS = ['#4f7a3e', '#5f8a47', '#3f6a34', '#6f9a52'];
function plant(p: DecorPlan['plants'][number], base: number, b: Batch) {
  const r = seeded(p.seed + 11);
  const m = place(p.x, base, p.z, r() * TAU);
  const parts: THREE.BufferGeometry[] = [];
  if (p.kind === 'tall') {
    // 무화과나무 화분: 테라코타 화분, 흙, 가는 줄기, 넓은 잎 수십 장
    parts.push(ccyl(0.21, 0.16, 0.38, '#b5653f', 0, 0.19, 0, 16), ccyl(0.225, 0.225, 0.045, '#9c5434', 0, 0.36, 0, 16), ccyl(0.19, 0.19, 0.02, '#3b2b1f', 0, 0.37, 0, 14));
    parts.push(ccyl(0.018, 0.026, 1.0, '#6a4a33', 0, 0.86, 0, 6));
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, rise = 0.95 + r() * 0.7, rad = 0.12 + r() * 0.26 * (1 - Math.abs(rise - 1.3) / 1.2);
      const leaf = new THREE.IcosahedronGeometry(1, 0).scale(0.13, 0.016, 0.085);
      leaf.rotateZ((r() - 0.5) * 0.8).rotateX(-0.4 - r() * 0.5).rotateY(a);
      leaf.translate(Math.cos(a) * rad, rise, Math.sin(a) * rad);
      parts.push(plainColored(leaf, LEAF_GREENS[i % LEAF_GREENS.length]));
    }
  } else if (p.kind === 'orchid') {
    // 난 화분: 낮은 옻칠 받침 위 검은 사기 화분, 긴 잎과 휘어진 꽃대
    parts.push(cbox(0.4, 0.3, 0.34, '#141414', 0, 0.15, 0), cbox(0.42, 0.015, 0.36, '#c3c7cc', 0, 0.3, 0));
    parts.push(ccyl(0.11, 0.08, 0.16, '#1e1f22', 0, 0.39, 0, 14), ccyl(0.1, 0.1, 0.012, '#2f2a24', 0, 0.465, 0, 12));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + r() * 0.4;
      const leaf = new THREE.IcosahedronGeometry(1, 0).scale(0.2, 0.008, 0.03).translate(0.18, 0, 0).rotateZ(0.5 + r() * 0.4).rotateY(a);
      parts.push(plainColored(leaf.translate(0, 0.48, 0), LEAF_GREENS[i % 3]));
    }
    const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.47, 0), new THREE.Vector3(0.04, 0.75, 0.02), new THREE.Vector3(0.14, 0.9, 0.04), new THREE.Vector3(0.24, 0.86, 0.05)]);
    parts.push(plainColored(new THREE.TubeGeometry(stem, 8, 0.005, 4), '#4f6b3c'));
    for (let i = 0; i < 6; i++) {
      const q = stem.getPoint(0.55 + i * 0.08);
      parts.push(plainColored(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 0.7, 1).translate(q.x, q.y - 0.02, q.z), i % 2 ? '#f7f1ea' : '#f2c6d0'));
    }
  } else {
    // 달항아리: 옻칠 받침 위 둥근 흰 항아리
    parts.push(cbox(0.46, 0.2, 0.46, '#141414', 0, 0.1, 0), cbox(0.48, 0.015, 0.48, '#c3c7cc', 0, 0.2, 0));
    parts.push(plainColored(new THREE.SphereGeometry(0.21, 20, 14).scale(1, 0.92, 1).translate(0, 0.2 + 0.2, 0), '#f1ece0', (q, c) => c.multiplyScalar(0.9 + 0.1 * Math.min(1, (q.y - 0.2) / 0.4))));
    parts.push(ccyl(0.08, 0.1, 0.05, '#ece5d6', 0, 0.6, 0, 16), ccyl(0.085, 0.085, 0.012, '#e2d9c6', 0, 0.63, 0, 16));
  }
  for (const g of parts) b.add(g, m);
}

/** 테라스 꽃 상자: 나무 상자 위 둥근 꽃 덤불(잎 위에 꽃송이) */
function planter(p: DecorPlan['planters'][number], base: number, b: Batch) {
  const r = seeded(p.seed + 3);
  const m = place(p.x, base, p.z);
  b.add(cbox(0.62, 0.4, 0.62, '#7a5134', 0, 0.2, 0), m);
  b.add(cbox(0.66, 0.04, 0.66, '#5a3a24', 0, 0.4, 0), m);
  for (let i = 0; i < 9; i++) {
    const x = ((i % 3) - 1) * 0.17, z = (Math.floor(i / 3) - 1) * 0.17;
    b.add(plainColored(new THREE.IcosahedronGeometry(0.14, 0).scale(1, 0.75, 1).translate(x, 0.5, z), LEAF_GREENS[i % 4]), m);
    const color = BLOOM[Math.floor(r() * BLOOM.length)];
    for (let k = 0; k < 3; k++) b.add(plainColored(new THREE.IcosahedronGeometry(0.05, 0).translate(x + (r() - 0.5) * 0.14, 0.58 + r() * 0.06, z + (r() - 0.5) * 0.14), color), m);
  }
}

// ───────── 깔개
function rug(r: DecorPlan['rugs'][number], y: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(r.w, r.d).rotateX(-Math.PI / 2);
  const col = r.kind % RUGS.cols, row = Math.floor(r.kind / RUGS.cols);
  const pad = 0.004;
  const u0 = col / RUGS.cols + pad, u1 = (col + 1) / RUGS.cols - pad, v0 = 1 - (row + 1) / RUGS.rows + pad, v1 = 1 - row / RUGS.rows - pad;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  g.applyMatrix4(place(r.x, y, r.z, r.yaw));
  return g;
}

// ───────── 처마: 벽 바깥 면에서 바깥으로 내려가는 기와 띠, 밑면은 크림색, 벽 쪽 끝은 용마루처럼 덮는다
/** 처마 하나의 기와 면(tile)과 크림·붉은 덧붙임(trim) */
export function eaveGeometry(e: Eave): { tile: THREE.BufferGeometry; trim: THREE.BufferGeometry[] } {
  const { eaveOut: out, eaveDrop: drop } = DECOR_SIZE;
  const y0 = e.y + 0.08, y1 = y0 - drop, th = 0.06;
  const a = e.a, b = e.b, s = e.s;
  // 벽을 따라 u, 벽에서 바깥으로 v인 점을 세계 좌표로
  const pt = (u: number, v: number, y: number) => (e.axis === 'x' ? new THREE.Vector3(u, y, e.line + s * v) : new THREE.Vector3(e.line + s * v, y, u));
  const inner = -0.03;
  const corners = [pt(a, inner, y0), pt(b, inner, y0), pt(b, out, y1), pt(a, out, y1)];
  const slope = Math.hypot(out - inner, drop);
  const tile = new THREE.BufferGeometry();
  const posA: number[] = [], uvA: number[] = [];
  const quad = (p: THREE.Vector3[], uvs: number[][]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) { posA.push(p[k].x, p[k].y, p[k].z); uvA.push(...uvs[k]); }
  };
  // 윗면: u는 처마를 따라(수키와 8줄 = 1.76m), v는 비탈을 따라(4단 = 1.2m, 처마 끝이 0)
  const U = 1.76, V = 1.2;
  const uvTop = [[a / U, slope / V], [b / U, slope / V], [b / U, 0], [a / U, 0]];
  // 감는 방향이 위를 보게(바깥 쪽 s와 축에 따라 뒤집는다)
  const flipTop = (e.axis === 'x' ? s > 0 : s < 0);
  if (flipTop) quad([corners[0], corners[3], corners[2], corners[1]], [uvTop[0], uvTop[3], uvTop[2], uvTop[1]]);
  else quad(corners, uvTop);
  // 처마 끝 마구리(바깥을 보는 좁은 면): 기와 끝이 보인다
  const lip = [pt(a, out, y1), pt(b, out, y1), pt(b, out, y1 - th), pt(a, out, y1 - th)];
  const uvLip = [[a / U, 0.06], [b / U, 0.06], [b / U, 0.0], [a / U, 0.0]];
  if (flipTop) quad([lip[0], lip[3], lip[2], lip[1]], [uvLip[0], uvLip[3], uvLip[2], uvLip[1]]);
  else quad(lip, uvLip);
  tile.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
  tile.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
  tile.computeVertexNormals();
  // 밑면(크림색 처마 안쪽)과 양 끝 막음, 벽 쪽 덮개(용마루)
  const trim: THREE.BufferGeometry[] = [];
  const under = new THREE.BufferGeometry();
  const bot = [pt(a, inner, y0 - th), pt(b, inner, y0 - th), pt(b, out, y1 - th), pt(a, out, y1 - th)];
  const ord = flipTop ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1];
  under.setAttribute('position', new THREE.Float32BufferAttribute(ord.flatMap((k) => [bot[k].x, bot[k].y, bot[k].z]), 3));
  under.computeVertexNormals();
  trim.push(plainColored(under, '#f2e8d6'));
  const len = b - a, mid = (a + b) / 2;
  const cap = e.axis === 'x' ? new THREE.BoxGeometry(len, 0.11, 0.17) : new THREE.BoxGeometry(0.17, 0.11, len);
  const c = pt(mid, 0.02, y0 + 0.02);
  trim.push(plainColored(cap.translate(c.x, c.y, c.z), '#8f3f28'));
  for (const u of [a, b]) {
    const end = new THREE.BufferGeometry();
    const p = [pt(u, inner, y0), pt(u, out, y1), pt(u, out, y1 - th), pt(u, inner, y0 - th)];
    end.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2].flatMap((k) => [p[k].x, p[k].y, p[k].z]), 3));
    end.computeVertexNormals();
    trim.push(plainColored(end, '#9c4a30'));
  }
  return { tile, trim };
}

// ───────── 포치 등
function lantern(l: DecorPlan['lanterns'][number], frame: Batch, glass: THREE.BufferGeometry[]) {
  const hang = 0.34, body = 0.26;
  const yTop = l.top, yBody = yTop - hang - body / 2;
  frame.add(cbox(0.1, 0.025, 0.1, '#2a2420', l.x, yTop - 0.012, l.z));
  frame.add(cbox(0.016, hang, 0.016, '#2a2420', l.x, yTop - hang / 2, l.z));
  frame.add(plainColored(new THREE.ConeGeometry(0.16, 0.1, 4).rotateY(Math.PI / 4).translate(l.x, yBody + body / 2 + 0.05, l.z), '#3a2c1e'));
  // 밑판은 작게: 밑에서 올려다보아도 빛나는 유리가 둘레로 보이게
  frame.add(cbox(0.11, 0.025, 0.11, '#4a3826', l.x, yBody - body / 2, l.z));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) frame.add(cbox(0.018, body, 0.018, '#4a3826', l.x + sx * 0.085, yBody, l.z + sz * 0.085));
  glass.push(new THREE.BoxGeometry(0.15, body - 0.02, 0.15).translate(l.x, yBody, l.z));
}

// ───────── 빛 웅덩이
function pool(p: DecorPlan['pools'][number]): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(p.size, p.size);
  if (p.up) g.rotateX(-Math.PI / 2);
  g.applyMatrix4(place(p.x, p.y, p.z, p.yaw));
  return g;
}

// ───────── 마당: 화단과 울타리, 돌담 갓돌
const BLOOM = ['#f6d7dc', '#f2b8c2', '#ffffff', '#f7e3c4', '#e99aa6', '#d98ca0', '#f4c95d', '#b9a3d9'];
function bed(r: DecorPlan['beds'][number], b: Batch, seed: number) {
  const rnd = seeded(seed);
  const w = r.x2 - r.x1, d = r.z2 - r.z1, x = (r.x1 + r.x2) / 2, z = (r.z1 + r.z2) / 2;
  b.add(cbox(w, 0.1, d, '#4a3626', x, 0.05, z));
  // 가장자리 돌(앞쪽 긴 변)
  const front = Math.abs(r.z1 - z) < Math.abs(r.z2 - z) ? r.z1 : r.z2;
  for (let u = r.x1 + 0.12; u < r.x2 - 0.05; u += 0.24) b.add(plainColored(new THREE.IcosahedronGeometry(0.11, 0).scale(1, 0.55, 0.8).translate(u, 0.06, front), rnd() > 0.5 ? '#b9b1a3' : '#a39d92'));
  // 꽃: 잎 덤불 위에 작은 꽃송이
  for (let u = r.x1 + 0.15; u < r.x2 - 0.1; u += 0.22) {
    const cz = z + (rnd() - 0.5) * d * 0.4;
    b.add(plainColored(new THREE.IcosahedronGeometry(0.13, 0).scale(1, 0.7, 1).translate(u, 0.16, cz), LEAF_GREENS[Math.floor(rnd() * 4)]));
    const color = BLOOM[Math.floor(rnd() * BLOOM.length)];
    for (let k = 0; k < 4; k++) b.add(plainColored(new THREE.IcosahedronGeometry(0.045 + rnd() * 0.02, 0).translate(u + (rnd() - 0.5) * 0.2, 0.24 + rnd() * 0.08, cz + (rnd() - 0.5) * 0.2), color));
  }
}

function fence(f: DecorPlan['fences'][number], b: Batch) {
  const len = f.b - f.a;
  const n = Math.max(1, Math.round(len / 1.8));
  const at = (u: number, y: number) => (f.axis === 'x' ? [u, y, f.line] : [f.line, y, u]) as [number, number, number];
  for (let i = 0; i <= n; i++) {
    const u = f.a + 0.06 + ((len - 0.12) * i) / n;
    const [x, y, z] = at(u, f.y + 0.06 + 0.32);
    b.add(cbox(0.08, 0.64, 0.08, '#7a5a3a', x, y, z));
    b.add(plainColored(new THREE.ConeGeometry(0.06, 0.06, 4).rotateY(Math.PI / 4).translate(x, f.y + 0.06 + 0.67, z), '#6a4a30'));
  }
  for (const h of [0.26, 0.54]) {
    const [x, y, z] = at((f.a + f.b) / 2, f.y + 0.06 + h);
    b.add(f.axis === 'x' ? cbox(len - 0.1, 0.05, 0.04, '#8a6644', x, y, z) : cbox(0.04, 0.05, len - 0.1, '#8a6644', x, y, z));
  }
}

/**
 * 집을 꾸민다: 계획(plan)에 있는 장식을 지어 묶음마다 붙인다. 재질은 kit에 한 번만 만든다(장면을 정리할 때 kit이 놓는다).
 * 돌려주는 값은 시험·측정용 수(지은 조각 수).
 */
export function dressHouse(world: HouseWorld, plan: DecorPlan, kit: FurnitureKit, to: DressTargets) {
  const vc = vertexMat(kit);
  const artMat = kit.once('m:art', () => new THREE.MeshStandardMaterial({ map: kit.once('t:art', () => {
    const t = enlargeSurface(artAtlas());
    const context = (t.image as HTMLCanvasElement).getContext('2d')!;
    for (const slot of [1, 3, 5]) {
      context.save(); context.translate((slot % ART.cols) * 512, Math.floor(slot / ART.cols) * 512);
      context.beginPath(); context.rect(0, 0, 512, 512); context.clip();
      context.fillStyle = '#e9dfca'; context.fillRect(0, 0, 512, 512);
      context.fillStyle = slot === 3 ? '#a3ad8f' : '#b77c58'; context.beginPath(); context.ellipse(90, 80, 250, 220, 0.2, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#768b9a'; context.beginPath(); context.ellipse(460, 380, 240, 300, -0.25, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#c8b38a'; context.fillRect(0, 410, 300, 102);
      context.restore();
    }
    for (const [slot, url] of [[0, SURFACE_ASSETS.hills], [2, SURFACE_ASSETS.botanical], [4, SURFACE_ASSETS.ink]] as const) {
      kit.image(t, url, { x: (slot % ART.cols) * 512, y: Math.floor(slot / ART.cols) * 512, w: 512, h: 512 });
    }
    return t;
  }), roughness: 0.9 }));
  const rugMat = kit.once('m:rugs', () => new THREE.MeshStandardMaterial({ map: kit.once('t:rugs', () => {
    const t = rugAtlas();
    kit.image(t, SURFACE_ASSETS.rug, { x: 256, y: 0, w: 256, h: 256 });
    return t;
  }), roughness: 1 }));
  const glassMat = kit.glow('#ffd9a0', 1.5);
  const poolMat = kit.once('m:glowPool', () => {
    const m = new THREE.MeshBasicMaterial({ map: kit.once('t:glowPool', () => glow()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  });
  const tiles = tileMat(kit);
  const metalVc = metalMat(kit);
  const washMat = washMaterial(kit);
  const count = { paintings: 0, pictureLights: 0, plants: 0, curtains: 0, rugs: 0, eaves: 0, lanterns: 0, beds: 0, fences: 0 };
  const put = (g: THREE.Group, mesh: THREE.Mesh | null, cast = true) => {
    if (!mesh) return;
    mesh.castShadow = cast && !(mesh.material as THREE.Material).transparent;
    mesh.receiveShadow = !(mesh.material as THREE.Material).transparent;
    g.add(mesh);
  };
  for (const lv of [1, 2] as const) {
    const base = lv === 2 ? world.floor2 : 0;
    // 벽에 거는 것
    const wall = new Batch(), metal = new Batch();
    const canvases: THREE.BufferGeometry[] = [], washes: THREE.BufferGeometry[] = [];
    const mine = plan.paintings.map((p, i) => [p, plan.pictureLights[i]] as const).filter(([p]) => p.level === lv);
    for (const [p, l] of mine) {
      painting(p, wall, metal, canvases);
      count.paintings++;
      if (!l) continue;
      const { metal: mg, glow: gg } = pictureLightGeometry(l);
      mg.forEach((g) => metal.add(g));
      gg.forEach((g) => wall.add(g));
      washes.push(washPlane(p, l));
      count.pictureLights++;
    }
    plan.curtains.filter((c) => c.level === lv).forEach((c, i) => {
      if (c.kind === 'drape') drape(c, wall, i * 13 + lv);
      else blind(c, wall);
      count.curtains++;
    });
    for (const r of plan.rods.filter((q) => q.level === lv)) rod(r, wall);
    put(to.hide(lv), wall.mesh(vc));
    // 그림등·금속 테는 집 안 해 그림자와 상관없어 그림자를 드리우지 않는다
    put(to.hide(lv), metal.mesh(metalVc), false);
    if (washes.length) {
      const merged = mergeGeometries(washes, false);
      washes.forEach((g) => g.dispose());
      if (merged) {
        const mesh = new THREE.Mesh(merged, washMat);
        mesh.renderOrder = 2;
        to.hide(lv).add(mesh);
      }
    }
    if (canvases.length) {
      const merged = mergeGeometries(canvases, false);
      canvases.forEach((g) => g.dispose());
      if (merged) put(to.hide(lv), new THREE.Mesh(merged, artMat), false);
    }
    // 바닥에 놓는 것
    const floor = new Batch();
    for (const p of plan.plants.filter((q) => q.level === lv)) {
      if (p.kind === 'tall' && to.onPlant) {
        const batch = new Batch(); plant({ ...p, x: 0, z: 0 }, 0, batch);
        const holder = new THREE.Group(); holder.position.set(p.x, base, p.z);
        holder.userData.kind = 'plant'; holder.userData.assetBounds = { w: 0.7, d: 0.7 };
        put(holder, batch.mesh(vc)); to.level(lv).add(holder); to.onPlant(holder);
      } else plant(p, base, floor);
      count.plants++;
    }
    for (const p of plan.planters.filter((q) => q.level === lv)) { planter(p, base, floor); count.plants++; }
    put(to.level(lv), floor.mesh(vc));
    const inside: THREE.BufferGeometry[] = [], outside: THREE.BufferGeometry[] = [];
    for (const r of plan.rugs.filter((q) => q.level === lv)) {
      (lv === 1 && to.outdoor(r.x, r.z) ? outside : inside).push(rug(r, base + (lv === 2 ? 0.011 : 0.009)));
      count.rugs++;
    }
    for (const [list, g] of [[inside, to.level(lv)], [outside, to.ground]] as const) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((p) => p.dispose());
      if (merged) put(g, new THREE.Mesh(merged, rugMat), false);
    }
  }
  // 처마
  const eaveTiles: THREE.BufferGeometry[] = [];
  const eaveTrim = new Batch();
  for (const e of plan.eaves) {
    const { tile, trim } = eaveGeometry(e);
    eaveTiles.push(tile);
    for (const t of trim) eaveTrim.add(t);
    count.eaves++;
  }
  if (eaveTiles.length) {
    const merged = mergeGeometries(eaveTiles, false);
    eaveTiles.forEach((g) => g.dispose());
    if (merged) put(to.roof, new THREE.Mesh(merged, tiles));
  }
  put(to.roof, eaveTrim.mesh(vc));
  // 포치 등과 빛 웅덩이
  const frame = new Batch();
  const glass: THREE.BufferGeometry[] = [];
  for (const l of plan.lanterns) { lantern(l, frame, glass); count.lanterns++; }
  put(to.porch, frame.mesh(vc));
  if (glass.length) {
    const merged = mergeGeometries(glass, false);
    glass.forEach((g) => g.dispose());
    if (merged) put(to.porch, new THREE.Mesh(merged, glassMat), false);
  }
  // 빛 웅덩이는 투명이라 굽지 않는다: 묶음마다 한 덩어리(포치 바깥, 1층 실내, 2층 실내)
  for (const [where, g] of [[undefined, to.porch], [1, to.level(1)], [2, to.level(2)]] as const) {
    const list = plan.pools.filter((p) => p.indoor === where).map(pool);
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    list.forEach((q) => q.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, poolMat);
    m.renderOrder = 2;
    g.add(m);
  }
  // 마당: 화단, 옆 담 울타리, 모든 돌담의 갓돌
  const yard = new Batch();
  plan.beds.forEach((r, i) => { bed(r, yard, i * 31 + 5); count.beds++; });
  for (const f of plan.fences) { fence(f, yard); count.fences++; }
  for (const s of world.walls.filter((w) => w.style === 'stonewall')) {
    const b = s.box;
    yard.add(cbox(b.x2 - b.x1 + 0.08, 0.07, b.z2 - b.z1 + 0.08, '#c2b9a8', (b.x1 + b.x2) / 2, s.baseY + s.height + 0.035, (b.z1 + b.z2) / 2));
  }
  put(to.ground, yard.mesh(vc));
  return count;
}
