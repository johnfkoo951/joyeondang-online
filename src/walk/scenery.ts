import * as THREE from 'three';
import type { HouseWorld } from './types';

// 집 둘레 풍경. 뒤(-z)로 화강암 봉우리가 이어지는 높은 산줄기, 앞(+z)으로 내려가는 비탈 마을과
// 건너편 낮은 능선, 그 너머 흐린 도시. 보기만 하는 배경이라 충돌이 없다. 마당 둘레는 평평하게 비운다.
// 지명·주소는 넣지 않는다(공개 빌드 개인정보 검사).

export type SceneSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type Scenery = { group: THREE.Group; groundAt: (x: number, z: number) => number; dispose: () => void };

function hash(ix: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number, seed: number, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f, seed + i * 17); f *= 2; amp *= 0.5; }
  return s;
}
function rand(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const FOREST: Record<SceneSeason, [string, string]> = {
  spring: ['#7fa064', '#9cb879'], summer: ['#4d7346', '#5f8650'], autumn: ['#8a7a45', '#a8683a'], winter: ['#8a8676', '#a19c8c'],
};
const LEAF: Record<SceneSeason, string[]> = {
  spring: ['#a9c98b', '#cfe0a8', '#e9c9d2'], summer: ['#5d8a4f', '#4b7a42', '#6f9a5a'],
  autumn: ['#c46a2e', '#d89a3a', '#a8442c', '#8f8a3c'], winter: ['#8b7b6a', '#9a8d80', '#7d7268'],
};
const ROCK = new THREE.Color('#bdb6aa');
const ROCK_DARK = new THREE.Color('#8f897e');

/** 집 바닥 둘레(평평하게 둘 곳)와 그 바깥 높이. 뒤로 오르고 앞으로 내려간다. */
function terrain(world: HouseWorld) {
  const b = world.floors.reduce((r, f) => ({ x1: Math.min(r.x1, f.x1), x2: Math.max(r.x2, f.x2), z1: Math.min(r.z1, f.z1), z2: Math.max(r.z2, f.z2) }),
    { ...world.house });
  // 옆과 뒤는 5m 평지(땅 격자가 집 밑으로 솟지 않게), 앞은 1.2m 뒤 석축 밑으로 떨어진다(마당 너머로 동네가 내려다보이게)
  const pad = 5, front = 1.2;
  const P = { x1: b.x1 - pad, x2: b.x2 + pad, z1: b.z1 - pad, z2: b.z2 + front };
  const cx = (b.x1 + b.x2) / 2, cz = (b.z1 + b.z2) / 2;
  const groundAt = (x: number, z: number) => {
    const dx = Math.max(P.x1 - x, 0, x - P.x2), dz = Math.max(P.z1 - z, 0, z - P.z2);
    const t = Math.hypot(dx, dz);
    if (t === 0) return -0.04;
    const mask = z > P.z2 ? smooth(0, 3, t) : smooth(0, 12, t);
    let s = 0;
    // 뒤로 오르는 산자락은 70m에서 멈춘다(더 오르면 가까운 땅이 뒤의 바위산을 가린다)
    if (z < P.z1) s += Math.min(70, (P.z1 - z) * 0.2);
    // 석축 밑으로 떨어지고 앞으로 내려가는 동네 비탈, 70m 아래 골짜기 바닥에서 멈춘다(건너편 능선까지 빈틈 없이)
    if (z > P.z2) s -= Math.min(75, smooth(0, 3, z - P.z2) * 7 + (z - P.z2) * 0.3);
    const rough = (fbm(x / 60, z / 60, 3) - 0.5) * (z > P.z2 ? 16 : 10) * smooth(10, 80, t);
    return -0.04 + mask * (s + rough);
  };
  return { P, b, cx, cz, groundAt };
}

/** 산줄기 한 겹: x를 따라 능선 높이 H(x)를 정하고, 앞 밑동(zFront)에서 뒤로 기울어 오르는 면으로 만든다. */
function ridge(opts: {
  x1: number; x2: number; zFront: number; depth: number; base: number; H: (x: number) => number;
  curve: number; forest: THREE.Color; haze: number; seed: number; rockFrom: number; flip?: boolean;
}) {
  const step = 30, cols = Math.ceil((opts.x2 - opts.x1) / step), rows = 10;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const hazeCol = new THREE.Color('#b4c3d2');
  const c = new THREE.Color();
  for (let i = 0; i <= cols; i++) {
    const x = opts.x1 + i * step;
    const top = opts.H(x);
    for (let k = 0; k <= rows; k++) {
      const t = k / rows;
      const y = opts.base + (top - opts.base) * Math.pow(t, 0.85) + (fbm(x / 90, t * 6, opts.seed) - 0.5) * 24 * t;
      const dz = opts.depth * t + opts.curve * x * x;
      const z = opts.flip ? opts.zFront + dz : opts.zFront - dz;
      pos.push(x, y, z);
      // 아래는 숲, 위로 갈수록 바위(화강암 빛), 바위 경계는 들쭉날쭉하게
      const rocky = smooth(opts.rockFrom - 40, opts.rockFrom + 40, y + (fbm(x / 40, y / 40, opts.seed + 5) - 0.5) * 120);
      c.copy(opts.forest).lerp(fbm(x / 25, y / 25, opts.seed + 9) > 0.55 ? ROCK : ROCK_DARK, rocky);
      c.lerp(hazeCol, opts.haze);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++) {
    const a = i * (rows + 1) + k, b = a + rows + 1;
    if (opts.flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 봉우리를 가우스 언덕으로 겹치고 잔 톱니를 얹는다 */
const peaks = (list: Array<[number, number, number]>, floor: number, seed: number) => (x: number) => {
  let h = floor + (fbm(x / 500, 0.3, seed) - 0.5) * 80;
  for (const [px, ph, w] of list) h = Math.max(h, floor + (ph - floor) * Math.exp(-((x - px) ** 2) / (2 * w * w)));
  return h + (fbm(x / 45, 1.7, seed + 3) - 0.5) * 40;
};

/** 세계 종류마다 바깥을 어떻게 보여 줄지. 방 장면은 전망 대신 창 밖 하늘빛만, 지붕·바깥 소품·해 없이 실내 조명만 */
export type SceneLook = {
  scenery: boolean; props: boolean; sun: boolean;
  /** 카메라가 보는 끝(m)과 안개(가까운 끝, 먼 끝). 안개가 80m부터라 집 안은 뿌옇지 않다 */
  far: number; fog: [number, number] | null;
  /** 처음 시점 */
  firstPerson: boolean;
};
export function lookFor(world: Pick<HouseWorld, 'kind'>): SceneLook {
  return world.kind === 'room'
    ? { scenery: false, props: false, sun: false, far: 120, fog: null, firstPerson: true }
    : { scenery: true, props: true, sun: true, far: 6000, fog: [80, 3200], firstPerson: false };
}

/** 손가락 기기(lite)는 나무·집·먼 도시를 절반 이하로, 땅 격자도 성기게 */
export const SCATTER = {
  full: { houses: 420, pines: 1400, leaves: 600, city: 900, grid: 240 },
  lite: { houses: 180, pines: 600, leaves: 260, city: 380, grid: 160 },
} as const;

/**
 * 땅 격자 좌표: 가운데는 촘촘하고(격자 240칸이면 약 2m, 160칸이면 약 3m) 바깥으로 갈수록 성기게.
 * 마당 둘레 평지(5m) 안에서 삼각형이 비탈 꼭짓점에 걸치지 않아, 마당 끝이 땅과 틈 없이 이어진다.
 */
export function gridCoord(s: number, half = 1200, k = 0.2): number {
  const a = Math.abs(s);
  return Math.sign(s) * half * (k * a + (1 - k) * a * a);
}

/** 풍경 전체. 엔진은 마당 밖 평지 대신 이것을 장면에 넣고, 안개 끝을 3km쯤으로 늘린다. */
export function buildScenery(world: HouseWorld, season: SceneSeason, lite = false): Scenery {
  const cap = lite ? SCATTER.lite : SCATTER.full;
  const { P, b, cx, cz, groundAt } = terrain(world);
  const group = new THREE.Group();
  const own: Array<{ dispose: () => void }> = [];
  const lambert = (p: THREE.MeshLambertMaterialParameters) => { const m = new THREE.MeshLambertMaterial(p); own.push(m); return m; };
  const [forestA, forestB] = FOREST[season].map((h) => new THREE.Color(h));
  const grass = new THREE.Color(season === 'winter' ? '#a9ab9a' : season === 'autumn' ? '#9a9a62' : '#86a66c');
  const town = new THREE.Color('#b8ae9a'), city = new THREE.Color('#a9aaa6'), autumn = new THREE.Color('#b8743a');
  // 앞 비탈 바탕: 계절과 상관없이 정원과 숲이 섞인 초록(단풍은 얼룩으로만)
  const slopeA = new THREE.Color('#5f7d4c'), slopeB = new THREE.Color('#7c9460');

  // 가까운 땅: 마당 둘레 평평, 뒤로 숲 오르막, 앞으로 마을 내리막
  const g = new THREE.PlaneGeometry(2, 2, cap.grid, cap.grid);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute, cols: number[] = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = cx + gridCoord(p.getX(i)), z = cz + gridCoord(p.getZ(i));
    p.setX(i, x);
    p.setZ(i, z);
    p.setY(i, groundAt(x, z));
    c.copy(grass).lerp(forestA, smooth(P.z1 - 10, P.z1 - 90, z)).lerp(forestB, fbm(x / 80, z / 80, 21) * smooth(P.z1 - 40, P.z1 - 200, z));
    if (z > P.z2 + 6) {
      const slope = smooth(P.z2 + 6, P.z2 + 40, z) * (1 - smooth(P.z2 + 200, P.z2 + 300, z));
      c.copy(slopeB).lerp(slopeA, 0.45 + (fbm(x / 40, z / 40, 25) - 0.5) * 0.8);
      if (season === 'autumn') c.lerp(autumn, smooth(0.55, 0.75, fbm(x / 30, z / 30, 27)) * 0.6);
      c.lerp(town, (0.12 + smooth(0.5, 0.7, fbm(x / 25, z / 25, 23)) * 0.25) * slope);
      c.lerp(city, smooth(P.z2 + 200, P.z2 + 320, z) * 0.75);
    }
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); own.push(g);
  const ground = new THREE.Mesh(g, lambert({ vertexColors: true }));
  ground.receiveShadow = true;
  ground.name = 'scenery-ground';
  group.add(ground);
  // 마당 앞 석축: 잔디 끝 바로 밑에서 비탈 아래까지 내려가 마당과 땅 사이에 틈이 보이지 않게
  const wallGeo = new THREE.BoxGeometry(b.x2 - b.x1 + 0.5, 12, 0.35);
  own.push(wallGeo);
  const terrace = new THREE.Mesh(wallGeo, lambert({ color: '#9d978a' }));
  terrace.position.set((b.x1 + b.x2) / 2, -0.005 - 6, b.z2 + 0.075);
  terrace.name = 'scenery-terrace';
  terrace.receiveShadow = true;
  group.add(terrace);

  // 뒤: 가까운 숲 언덕, 화강암 봉우리 줄기, 더 먼 줄기(안개). 앞: 건너편 낮은 능선과 옆의 바위 언덕.
  const distA = new THREE.Color('#4f6a5c'), distB = new THREE.Color('#5b7468');
  const layers = [
    ridge({ x1: cx - 1600, x2: cx + 1600, zFront: cz - 330, depth: 420, base: 30, curve: 0.00008, forest: forestA, haze: 0.05, seed: 31, rockFrom: 999,
      H: peaks([[cx - 300, 150, 260], [cx + 350, 130, 300]], 90, 31) }),
    // 큰 바위산 줄기: 가까운 숲 언덕(약 11°) 위로 봉우리가 크게 솟게(약 20°)
    ridge({ x1: cx - 2600, x2: cx + 2600, zFront: cz - 1200, depth: 900, base: 40, curve: 0.00006, forest: forestB, haze: 0.16, seed: 41, rockFrom: 300,
      H: peaks([[cx - 1100, 600, 220], [cx - 600, 720, 180], [cx - 150, 820, 210], [cx + 250, 770, 170], [cx + 700, 660, 230], [cx + 1300, 540, 260]], 330, 41) }),
    ridge({ x1: cx - 3600, x2: cx + 3600, zFront: cz - 2700, depth: 700, base: 100, curve: 0.00004, forest: forestB, haze: 0.5, seed: 51, rockFrom: 470,
      H: peaks([[cx - 1800, 900, 400], [cx + 200, 960, 350], [cx + 1600, 880, 420]], 600, 51) }),
    ridge({ x1: cx - 2400, x2: cx + 2400, zFront: cz + 1150, depth: 500, base: -80, curve: 0.00005, forest: distA, haze: 0.4, seed: 61, rockFrom: 999, flip: true,
      H: peaks([[cx + 300, 150, 300], [cx + 900, 120, 260]], 70, 61) }),
    ridge({ x1: cx - 2200, x2: cx - 500, zFront: cz + 1100, depth: 400, base: -80, curve: 0.00005, forest: distB, haze: 0.3, seed: 71, rockFrom: 999, flip: true,
      H: peaks([[cx - 1300, 230, 260]], 90, 71) }),
  ];
  for (const geo of layers) {
    own.push(geo);
    // 산줄기는 먼 빛(haze)을 꼭짓점 색에 이미 구웠다. 장면 안개를 또 받으면 하늘색에 묻혀 바위산이 사라진다
    group.add(new THREE.Mesh(geo, lambert({ vertexColors: true, side: THREE.DoubleSide, fog: false })));
  }
  scatter(group, own, lambert, { P, cx, cz, groundAt, season, cap });
  return { group, groundAt, dispose: () => own.forEach((o) => o.dispose()) };
}

/** 비탈 마을의 집(벽 상자 + 박공 지붕), 숲의 소나무·활엽수, 먼 도시 상자. 모두 인스턴스로 가볍게. */
function scatter(group: THREE.Group, own: Array<{ dispose: () => void }>, lambert: (p: THREE.MeshLambertMaterialParameters) => THREE.MeshLambertMaterial,
  o: { P: { x1: number; x2: number; z1: number; z2: number }; cx: number; cz: number; groundAt: (x: number, z: number) => number; season: SceneSeason;
    cap: { houses: number; pines: number; leaves: number; city: number } }) {
  const r = rand(97), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const clearOf = (x: number, z: number, gap: number) => x < o.P.x1 - gap || x > o.P.x2 + gap || z < o.P.z1 - gap || z > o.P.z2 + gap;
  // 집: 앞 비탈에 촘촘히, 옆과 뒤 산자락에 드문드문
  const houses: Array<[number, number, number, number, number, number]> = [];
  for (let i = 0; i < 2600 && houses.length < o.cap.houses; i++) {
    const x = o.cx + (r() - 0.5) * 900, z = o.cz + (r() * 520 - 160);
    // 앞 비탈 첫 집은 석축에서 25m 아래부터(바로 밑 집이 시야를 크게 가리지 않게)
    if (!clearOf(x, z, 14) || (z > o.P.z2 && z < o.P.z2 + 25)) continue;
    const front = z > o.P.z2, density = front ? 0.95 * smooth(330, 200, z - o.P.z2) : 0.18 * smooth(-170, -40, z - o.cz);
    if (r() > density) continue;
    const w = 5 + r() * 5, d = 5 + r() * 4, h = 3.5 + r() * (front ? 3.5 : 2.5);
    if (houses.some(([hx, hz]) => Math.abs(hx - x) < 10 && Math.abs(hz - z) < 9)) continue;
    houses.push([x, z, w, d, h, r() * Math.PI]);
  }
  const WALL = ['#ece4d6', '#e6dccb', '#d9d2c4', '#f1ece2', '#cfc5b5', '#e2d6c1'], ROOF = ['#6b4a3a', '#3f4a52', '#8a3b2c', '#55605a', '#7b6a58'];
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const prism = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1); prism.rotateZ(Math.PI / 2); prism.rotateY(Math.PI / 2); prism.scale(1, 0.6, 1);
  own.push(box, prism);
  const walls = new THREE.InstancedMesh(box, lambert({}), houses.length), roofs = new THREE.InstancedMesh(prism, lambert({}), houses.length);
  const c = new THREE.Color();
  houses.forEach(([x, z, w, d, h, a], i) => {
    const y = o.groundAt(x, z) - 0.6;
    q.setFromAxisAngle(up, a);
    m.compose(v.set(x, y, z), q, s.set(w, h, d)); walls.setMatrixAt(i, m); walls.setColorAt(i, c.set(WALL[i % WALL.length]));
    m.compose(v.set(x, y + h + d * 0.14, z), q, s.set(w * 1.06, d * 0.55, d * 1.08)); roofs.setMatrixAt(i, m); roofs.setColorAt(i, c.set(ROOF[(i * 7) % ROOF.length]));
  });
  group.add(walls, roofs);
  // 나무: 뒤 산자락은 소나무 숲, 마을 사이사이 활엽수
  const cone = new THREE.ConeGeometry(0.5, 1, 7); cone.translate(0, 0.5, 0);
  const ball = new THREE.IcosahedronGeometry(0.5, 0); ball.translate(0, 0.5, 0);
  own.push(cone, ball);
  const pines: Array<[number, number, number]> = [], leaves: Array<[number, number, number]> = [];
  for (let i = 0; i < 9000 && (pines.length < o.cap.pines || leaves.length < o.cap.leaves); i++) {
    const x = o.cx + (r() - 0.5) * 1100, z = o.cz + (r() * 900 - 420);
    if (!clearOf(x, z, 9)) continue;
    const back = z < o.P.z1;
    if (back && pines.length < o.cap.pines && r() < smooth(-10, -120, z - o.P.z1) + 0.15) pines.push([x, z, 7 + r() * 7]);
    else if (!back && z > o.P.z2 && z < o.P.z2 + 320 && r() < 0.12) pines.push([x, z, 6 + r() * 6]);
    else if (!back && leaves.length < o.cap.leaves && r() < (z > o.P.z2 && z < o.P.z2 + 320 ? 0.7 : 0.18)) leaves.push([x, z, 4 + r() * 4]);
  }
  const PINE = ['#2f4a37', '#36533d', '#2a4231'], LEAF2 = LEAF[o.season];
  const pineMesh = new THREE.InstancedMesh(cone, lambert({}), pines.length), leafMesh = new THREE.InstancedMesh(ball, lambert({}), leaves.length);
  pines.forEach(([x, z, h], i) => { m.compose(v.set(x, o.groundAt(x, z) - 0.3, z), q.identity(), s.set(h * 0.42, h, h * 0.42)); pineMesh.setMatrixAt(i, m); pineMesh.setColorAt(i, c.set(PINE[i % 3])); });
  leaves.forEach(([x, z, h], i) => { m.compose(v.set(x, o.groundAt(x, z) - 0.2, z), q.identity(), s.set(h, h * 0.9, h)); leafMesh.setMatrixAt(i, m); leafMesh.setColorAt(i, c.set(LEAF2[i % LEAF2.length])); });
  group.add(pineMesh, leafMesh);
  // 먼 도시: 안개 속 상자들(건너편 능선 너머)
  const city: Array<[number, number, number, number]> = [];
  for (let i = 0; i < o.cap.city; i++) {
    const x = o.cx + (r() - 0.5) * 2200, z = o.P.z2 + 300 + r() * 780;
    city.push([x, z, 10 + r() * 22, 6 + r() * (r() < 0.12 ? 60 : 22)]);
  }
  const cityMesh = new THREE.InstancedMesh(box, lambert({ color: '#aab0b6' }), city.length);
  city.forEach(([x, z, w, h], i) => { m.compose(v.set(x, o.groundAt(x, z) - 0.5, z), q.identity(), s.set(w, h, w * (0.6 + (i % 5) * 0.15))); cityMesh.setMatrixAt(i, m); });
  group.add(cityMesh);
}
