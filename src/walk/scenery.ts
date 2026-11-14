import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HouseWorld } from './types';
// @ts-expect-error Direct Node TypeScript tests require an explicit extension.
import { buildLandscapeDetail } from './landscape-detail.ts';
// @ts-expect-error Direct Node TypeScript tests require an explicit extension.
import { buildNightSky } from './night-sky.ts';
// @ts-expect-error Direct Node TypeScript tests require an explicit extension.
import { skyLook, type WalkSky } from './sky.ts';

// Continuous volumetric scenery: sculptural forest, modern low-rise buildings and ink-toned rock masses.
// Decorative only; the supplied courtyard and collision geometry are unchanged.
// 지명·주소는 넣지 않는다(공개 빌드 개인정보 검사).

export type SceneSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type Scenery = {
  group: THREE.Group; groundAt: (x: number, z: number) => number; dispose: () => void;
  /** 밤하늘이면 프레임마다 부른다(night-sky.ts). 별똥별이 화면 안에 보이는 동안 참(그동안은 매 프레임 그린다) */
  update?: (now: number, camera: THREE.Camera, pixelRatio: number, outdoors: boolean) => boolean;
};
/** 하늘 고르기(sky.ts). still이면 별이 반짝이지 않고 별똥별도 없다(움직임 줄이기) */
export type SceneryOptions = { sky?: WalkSky; still?: boolean; pixelRatio?: number };

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
  spring: ['#7fa064', '#9cb879'], summer: ['#4d7346', '#5f8650'], autumn: ['#75836b', '#5c7063'], winter: ['#8a8676', '#a19c8c'],
};
const LEAF: Record<SceneSeason, string[]> = {
  spring: ['#a9c98b', '#cfe0a8', '#e9c9d2'], summer: ['#5d8a4f', '#4b7a42', '#6f9a5a'],
  autumn: ['#788d6f', '#9caa7e', '#ad9977', '#647d69'], winter: ['#8b7b6a', '#9a8d80', '#7d7268'],
};

/** 집 바닥 둘레(평평하게 둘 곳)와 그 바깥 높이. 뒤로 오르고 앞으로 내려간다. */
export function terrain(world: HouseWorld) {
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
    if (z > P.z2) s -= Math.min(75, smooth(0, 3, z - P.z2) * 7 + (z - P.z2) * 0.12);
    const rough = (fbm(x / 60, z / 60, 3) - 0.5) * (z > P.z2 ? 16 : 10) * smooth(10, 80, t);
    return -0.04 + mask * (s + rough) + mountainRelief(x - cx, z - cz);
  };
  return { P, b, cx, cz, groundAt };
}

/** Smooth volumetric mountain masses, shared by terrain and its color field. No image cards. */
export function mountainRelief(x: number, z: number) {
  let height = 0;
  const masses = [
    [-850, -1150, 490, 360, 430], [-330, -1350, 660, 340, 480],
    [180, -1260, 570, 270, 410], [660, -1530, 610, 380, 500],
    [-1250, -500, 270, 440, 500], [1450, -350, 260, 460, 550],
    [-1300, 900, 180, 460, 420], [-500, 1500, 210, 620, 410],
    [500, 1650, 190, 520, 420], [1450, 850, 230, 430, 510],
  ];
  for (const [cx, cz, h, w, d] of masses) {
    const q = ((x - cx) / w) ** 2 + ((z - cz) / d) ** 2;
    // Broad shoulders and rounded crowns rather than pointed cones.
    height = Math.max(height, h * Math.exp(-Math.pow(q, 1.35)));
  }
  return (height * 0.68 + (fbm(x / 165, z / 210, 121, 3) - 0.5) * 46 * smooth(120, 360, height)) * smooth(140, 400, Math.hypot(x, z));
}

/** Static directional sky: moving the camera never reveals an edge or a billboard. */
function sculpturalSky(cx: number, cz: number) {
  const geometry = new THREE.SphereGeometry(4800, 24, 16);
  const p = geometry.attributes.position, colors: number[] = [];
  const horizon = new THREE.Color('#e6f2f5'), zenith = new THREE.Color('#75bfe7');
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    color.copy(horizon).lerp(zenith, smooth(-0.06, 0.6, p.getY(i) / 4800));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 skyDirection;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nskyDirection = normalize(position);');
    shader.fragmentShader = `varying vec3 skyDirection;
      float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float skyNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(skyHash(i),skyHash(i+vec2(1.,0.)),f.x),mix(skyHash(i+vec2(0.,1.)),skyHash(i+vec2(1.,1.)),f.x),f.y);
      }
      float skyCloud(vec2 p) { return skyNoise(p)*.55+skyNoise(p*2.03)*.28+skyNoise(p*4.07)*.12+skyNoise(p*8.09)*.05; }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 direction = normalize(skyDirection);
      vec2 cloudUV = direction.xz / max(.16, direction.y + .22) * 2.7;
      float cloud = smoothstep(.51,.69,skyCloud(cloudUV+vec2(2.3,5.7)));
      cloud *= smoothstep(.015,.14,direction.y) * (1.0-smoothstep(.82,.97,direction.y));
      vec3 cloudColor = mix(vec3(.79,.86,.91),vec3(1.,.99,.96),smoothstep(.48,.7,skyCloud(cloudUV)));
      diffuseColor.rgb = mix(diffuseColor.rgb,cloudColor,cloud*.93);
    `);
  };
  material.customProgramCacheKey = () => 'bright-static-cloud-sky';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'scenery-sky'; mesh.position.set(cx, 0, cz); mesh.renderOrder = -10;
  return mesh;
}

/** 세계 종류마다 바깥을 어떻게 보여 줄지. 방 장면은 전망 대신 창 밖 하늘빛만, 지붕·바깥 소품·해 없이 실내 조명만 */
export type SceneLook = {
  scenery: boolean; props: boolean; sun: boolean;
  /** 카메라가 보는 끝(m)과 안개(가까운 끝, 먼 끝). 안개가 80m부터라 집 안은 뿌옇지 않다 */
  far: number; fog: [number, number] | null;
  /** 처음 시점 */
  firstPerson: boolean;
};
export function lookFor(world: Pick<HouseWorld, 'kind'>): SceneLook {
  // 실측 껍데기 지도는 가볍게: 전망·바깥 소품·장식 없이 해만(창으로 드는 빛)
  if (world.kind === 'shell') return { scenery: false, props: false, sun: true, far: 200, fog: null, firstPerson: false };
  return world.kind === 'room'
    ? { scenery: false, props: false, sun: false, far: 120, fog: null, firstPerson: true }
    : { scenery: true, props: true, sun: true, far: 6000, fog: [160, 3400], firstPerson: false };
}

/**
 * 활엽수는 단순한 공이라 가까이서는 나무로 읽히지 않는다(줄기 없는 덩어리가 떠 있는 것처럼 보였다):
 * 평지 둘레 leafClear(m) 안에는 두지 않고, trunkNear(m) 안의 것에는 줄기를 세워 공을 그만큼 올린다.
 */
export const LEAF_TREE = { leafClear: 22, trunkNear: 60, trunkH: 0.45, trunkW: 0.1, lift: 0.35 } as const;

/** 손가락 기기(lite)는 나무·집·먼 도시를 절반 이하로, 땅 격자도 성기게 */
export const SCATTER = {
  full: { houses: 54, pines: 650, leaves: 1200, city: 0, grid: 240 },
  lite: { houses: 28, pines: 280, leaves: 550, city: 0, grid: 160 },
} as const;

/**
 * 땅 격자 좌표: 가운데는 촘촘하고(격자 240칸이면 약 2m, 160칸이면 약 3m) 바깥으로 갈수록 성기게.
 * 마당 둘레 평지(5m) 안에서 삼각형이 비탈 꼭짓점에 걸치지 않아, 마당 끝이 땅과 틈 없이 이어진다.
 */
export function gridCoord(s: number, half = 1200, k = 0.2): number {
  const a = Math.abs(s);
  return Math.sign(s) * half * (k * a + (1 - k) * a * a);
}

/** Scene-owned static landscape: no image planes, asynchronous sky loads or animation loop. */
export function buildScenery(world: HouseWorld, season: SceneSeason, lite = false, onChange: () => void = () => {}, opts: SceneryOptions = {}): Scenery {
  const cap = lite ? SCATTER.lite : SCATTER.full;
  const { P, b, cx, cz, groundAt } = terrain(world);
  const group = new THREE.Group();
  group.name = 'sculptural-landscape';
  const own: Array<{ dispose: () => void }> = [];
  // 밤이면 낮 하늘 구 대신 밤하늘(별, 은하수, 별똥별)을 걸고, 빛을 받지 않는 땅 색을 낮춘다
  const look = skyLook(opts.sky ?? 'day');
  const night = look?.night ? buildNightSky(cx, cz, look, { lite, still: !!opts.still, pixelRatio: opts.pixelRatio ?? 1 }) : null;
  if (night) { group.add(night.group); own.push(night); }
  else { const sky = sculpturalSky(cx, cz); group.add(sky); own.push(sky.geometry, sky.material); }
  const lambert = (p: THREE.MeshLambertMaterialParameters) => { const m = new THREE.MeshLambertMaterial(p); own.push(m); return m; };
  const [forestA, forestB] = FOREST[season].map((h) => new THREE.Color(h));
  const grass = new THREE.Color(season === 'winter' ? '#a9ab9a' : season === 'autumn' ? '#8e9b7c' : '#86a66c');
  const town = new THREE.Color('#b8ae9a'), autumn = new THREE.Color('#b8743a');
  // 앞 비탈 바탕: 계절과 상관없이 정원과 숲이 섞인 초록(단풍은 얼룩으로만)
  const slopeA = new THREE.Color('#526c59'), slopeB = new THREE.Color('#7b9276');

  // 가까운 땅: 마당 둘레 평평, 뒤로 숲 오르막, 앞으로 마을 내리막
  const g = new THREE.PlaneGeometry(2, 2, cap.grid, cap.grid);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute, cols: number[] = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const expand = (v: number) => { const b = gridCoord(v); return b + Math.sign(b) * 3300 * smooth(120, 1200, Math.abs(b)); };
    const x = cx + expand(p.getX(i)), z = cz + expand(p.getZ(i));
    p.setX(i, x);
    p.setZ(i, z);
    p.setY(i, groundAt(x, z));
    c.copy(grass).lerp(forestA, smooth(P.z1 - 10, P.z1 - 90, z)).lerp(forestB, fbm(x / 80, z / 80, 21) * smooth(P.z1 - 40, P.z1 - 200, z));
    if (z > P.z2 + 6) {
      const slope = smooth(P.z2 + 6, P.z2 + 40, z) * (1 - smooth(P.z2 + 200, P.z2 + 300, z));
      c.copy(slopeB).lerp(slopeA, 0.45 + (fbm(x / 40, z / 40, 25) - 0.5) * 0.8);
      if (season === 'autumn') c.lerp(autumn, smooth(0.55, 0.75, fbm(x / 30, z / 30, 27)) * 0.6);
      c.lerp(town, (0.12 + smooth(0.5, 0.7, fbm(x / 25, z / 25, 23)) * 0.25) * slope);
      c.lerp(forestA, smooth(P.z2 + 200, P.z2 + 320, z) * 0.65);
    }
    const relief = mountainRelief(x - cx, z - cz);
    const mountain = smooth(70, 200, relief);
    const inkSide = 1 - smooth(-180, 150, z - cz);
    // Ink-wash values: darker rock ribs, grey-green shoulders and pale distance.
    const wash = 0.6 + 0.18 * Math.sin((x - cx) / 75 + relief / 155) + 0.1 * Math.sin((x - cx) / 37 + relief / 110);
    const rock = new THREE.Color('#b3b5a1').lerp(new THREE.Color('#668a84'), wash * inkSide * 0.85);
    c.lerp(rock, mountain * (0.65 + inkSide * 0.35));
    c.lerp(new THREE.Color('#c4cbc3'), Math.exp(-(((relief - 175) / 72) ** 2)) * mountain * inkSide * 0.28);
    const distant = smooth(1500, 3000, Math.hypot(x - cx, z - cz));
    c.lerp(new THREE.Color('#b2cdd0'), distant * 0.55);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); own.push(g);
  const groundMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false });
  groundMat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 landscapePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nlandscapePosition = position;');
    shader.fragmentShader = `varying vec3 landscapePosition;
      float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float groundNoise(vec2 p) { vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(groundHash(i),groundHash(i+vec2(1.,0.)),f.x),mix(groundHash(i+vec2(0.,1.)),groundHash(i+vec2(1.,1.)),f.x),f.y); }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float rockZone = smoothstep(120.0, 300.0, landscapePosition.y);
      float stroke = sin(landscapePosition.x * 0.085 + sin(landscapePosition.y * 0.012) * 1.8 + landscapePosition.z * 0.007);
      float fineStroke = sin(landscapePosition.x * 0.29 + landscapePosition.y * 0.021);
      float ink = smoothstep(0.52, 0.94, stroke) * 0.19 + smoothstep(0.88, 0.99, fineStroke) * 0.06;
      diffuseColor.rgb *= 1.0 - rockZone * ink * .6;
      float meadow = groundNoise(landscapePosition.xz*.09)*.65+groundNoise(landscapePosition.xz*.31)*.35;
      diffuseColor.rgb *= .84 + meadow*.32;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.09,1.04,.86),smoothstep(.57,.75,meadow)*.34*(1.-rockZone));
    `);
  };
  groundMat.customProgramCacheKey = () => 'detailed-daylight-ground-v3';
  // 땅은 빛을 받지 않는 재질이라 밤빛에 어두워지지 않는다: 하늘의 풍경 색을 곱한다(셰이더는 그대로)
  if (look) groundMat.color.set(look.landscape);
  own.push(groundMat);
  const ground = new THREE.Mesh(g, groundMat);
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

  scatter(group, own, lambert, { P, cx, cz, groundAt, season, cap, night: !!night });
  const detail = buildLandscapeDetail({ b, cx, cz, groundAt }, lite); group.add(detail.group); own.push(detail);
  // 밤: 빛을 받는 나무·집·바위도 땅에 맞춰 조금 더 어둡게(밤빛만으로는 낮 색이 남아 땅보다 밝게 떠 보였다). 재질마다 한 번씩만
  if (night) {
    const shaded = new Set<THREE.Material>();
    group.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m || Array.isArray(m) || shaded.has(m) || !(m instanceof THREE.MeshLambertMaterial)) return;
      shaded.add(m);
      m.color.multiplyScalar(0.55);
    });
  }
  // onChange is retained for API compatibility; this landscape is fully synchronous.
  void onChange;
  let disposed = false;
  return {
    group, groundAt,
    update: night?.update,
    dispose: () => { if (disposed) return; disposed = true; group.removeFromParent(); own.forEach((o) => o.dispose()); },
  };
}

/** Shared geometry with varied placement: modern homes, broad tree crowns and layered groves. */
function scatter(group: THREE.Group, own: Array<{ dispose: () => void }>, lambert: (p: THREE.MeshLambertMaterialParameters) => THREE.MeshLambertMaterial,
  o: { P: { x1: number; x2: number; z1: number; z2: number }; cx: number; cz: number; groundAt: (x: number, z: number) => number; season: SceneSeason;
    cap: { houses: number; pines: number; leaves: number; city: number }; night?: boolean }) {
  const r = rand(97), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const clearOf = (x: number, z: number, gap: number) => x < o.P.x1 - gap || x > o.P.x2 + gap || z < o.P.z1 - gap || z > o.P.z2 + gap;
  // 집: 앞 비탈에 촘촘히, 옆과 뒤 산자락에 드문드문
  const houses: Array<[number, number, number, number, number, number]> = [];
  for (let i = 0; i < 2600 && houses.length < o.cap.houses; i++) {
    const x = o.cx + (r() - 0.5) * 500, z = o.cz + (r() * 400 - 110);
    // 앞 비탈 첫 집은 석축에서 25m 아래부터(바로 밑 집이 시야를 크게 가리지 않게)
    if (!clearOf(x, z, 14) || (z > o.P.z2 && z < o.P.z2 + 25)) continue;
    const front = z > o.P.z2, density = front ? 0.28 * smooth(280, 160, z - o.P.z2) : 0.06 * smooth(-170, -40, z - o.cz);
    if (r() > density) continue;
    const w = 7 + r() * 5, d = 6 + r() * 4, h = 4 + r() * (front ? 3.5 : 2.5);
    if (houses.some(([hx, hz]) => Math.abs(hx - x) < 25 && Math.abs(hz - z) < 23)) continue;
    houses.push([x, z, w, d, h, r() * Math.PI]);
  }
  const WALL = ['#ece4d6', '#e6dccb', '#d9d2c4', '#f1ece2', '#cfc5b5', '#e2d6c1'], ROOF = ['#c9c5b6', '#adafa3', '#d1caba', '#babdad', '#d8cfbd'];
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const prism = new THREE.BoxGeometry(1, 1, 1); // Flat gallery roof slabs, not historical gables.
  own.push(box, prism);
  const walls = new THREE.InstancedMesh(box, lambert({}), houses.length), roofs = new THREE.InstancedMesh(prism, lambert({}), houses.length);
  const c = new THREE.Color();
  houses.forEach(([x, z, w, d, h, a], i) => {
    const y = o.groundAt(x, z) - 0.6;
    q.setFromAxisAngle(up, a);
    m.compose(v.set(x, y, z), q, s.set(w, h, d)); walls.setMatrixAt(i, m); walls.setColorAt(i, c.set(WALL[i % WALL.length]));
    m.compose(v.set(x, y + h + 0.13, z), q, s.set(w * 1.06, 0.26, d * 1.08)); roofs.setMatrixAt(i, m); roofs.setColorAt(i, c.set(ROOF[(i * 7) % ROOF.length]));
  });
  walls.name = 'scenery-gallery-houses'; roofs.name = 'scenery-gallery-roofs';
  // 밤에는 동네 창이 불을 켠다: 빛을 받지 않는 재질에 집마다 따뜻한 색(몇 집은 꺼 둔다). 낮은 그대로 유리색
  const litWindow = (i: number) => (i * 37 + 11) % 10 < 7;
  const windowMat = () => {
    if (!o.night) return null;
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    own.push(mat);
    return mat;
  };
  const warmA = new THREE.Color('#ffc477'), warmB = new THREE.Color('#ffe0a8'), dark = new THREE.Color('#1d2536');
  const glazing = new THREE.InstancedMesh(box, windowMat() ?? lambert({ color: '#647572' }), houses.length);
  houses.forEach(([x, z, w, d, h, a], i) => {
    const offset = new THREE.Vector3(0, 0, d * 0.506).applyAxisAngle(up, a);
    q.setFromAxisAngle(up, a);
    m.compose(v.set(x + offset.x, o.groundAt(x, z) - 0.6 + h * 0.22, z + offset.z), q, s.set(w * 0.73, h * 0.57, 0.04)); glazing.setMatrixAt(i, m);
    if (o.night) glazing.setColorAt(i, litWindow(i) ? c.copy(warmA).lerp(warmB, (i % 5) / 4) : dark);
  });
  group.add(walls, roofs, glazing); own.push(walls, roofs, glazing);
  const groveCount = o.cap.houses > 30 ? 12 : 6;
  const gallery = new THREE.InstancedMesh(box, lambert({ color: '#ede8d9' }), groveCount);
  const windows = new THREE.InstancedMesh(box, windowMat() ?? lambert({ color: '#6c807d' }), groveCount);
  for (let i = 0; i < groveCount; i++) {
    const lane = i % 3, row = Math.floor(i / 3);
    const x = o.cx + (lane - 1) * 43 + Math.sin(i * 2.4) * 12;
    const z = o.P.z2 + 48 + row * 45;
    const y = o.groundAt(x, z), h = 10 + i % 3;
    m.compose(v.set(x, y, z), q.identity(), s.set(12 + i % 4, h, 9)); gallery.setMatrixAt(i, m);
    m.compose(v.set(x, y + h * 0.32, z - 4.53), q.identity(), s.set(9, h * 0.48, 0.05)); windows.setMatrixAt(i, m);
    if (o.night) windows.setColorAt(i, c.copy(warmB).lerp(warmA, (i % 3) / 2));
  }
  gallery.name = 'scenery-near-galleries'; group.add(gallery, windows); own.push(gallery, windows);
  // 나무: 뒤 산자락은 소나무 숲, 마을 사이사이 활엽수
  // Broad, layered pine crowns instead of identical pointed cones.
  const crowns = [
    new THREE.IcosahedronGeometry(1, 1).scale(0.48, 0.18, 0.4).translate(-0.04, 0.62, 0),
    new THREE.IcosahedronGeometry(1, 0).scale(0.36, 0.16, 0.34).translate(0.1, 0.82, -0.02),
    new THREE.CylinderGeometry(0.035, 0.055, 0.6, 5).translate(0, 0.3, 0),
  ].map((g) => {
    if (!g.index) return g;
    const flat = g.toNonIndexed();
    g.dispose();
    return flat;
  });
  const cone = mergeGeometries(crowns, false)!;
  crowns.forEach((g) => g.dispose());
  const ball = new THREE.IcosahedronGeometry(0.5, 1); ball.scale(1.1, 0.65, 0.95); ball.translate(0, 0.5, 0);
  own.push(cone, ball);
  const pines: Array<[number, number, number]> = [], leaves: Array<[number, number, number, number]> = [];
  // 활엽수 자리는 뽑은 차례대로 세되(slots), 평지 가까이 뽑힌 것은 심지 않는다: 난수 차례가 그대로라 다른 나무·집 자리는 바뀌지 않는다.
  // 남은 나무는 뽑힌 차례(slot)를 들고 가 색을 고른다(줄어든 목록의 번호로 고르면 빠진 나무 뒤의 색이 모두 밀린다)
  let slots = 0;
  for (let i = 0; i < 9000 && (pines.length < o.cap.pines || slots < o.cap.leaves); i++) {
    const x = o.cx + (r() - 0.5) * 900, z = o.cz + (r() * 800 - 350);
    if (!clearOf(x, z, 9)) continue;
    const back = z < o.P.z1;
    if (back && pines.length < o.cap.pines && r() < smooth(-10, -120, z - o.P.z1) + 0.15) pines.push([x, z, 7 + r() * 7]);
    else if (!back && z > o.P.z2 && z < o.P.z2 + 320 && r() < 0.12) pines.push([x, z, 6 + r() * 6]);
    else if (!back && slots < o.cap.leaves && r() < (z > o.P.z2 && z < o.P.z2 + 320 ? 0.7 : 0.18)) {
      const h = 4 + r() * 4;
      if (clearOf(x, z, LEAF_TREE.leafClear)) leaves.push([x, z, h, slots]);
      slots++;
    }
  }
  const PINE = ['#536952', '#647957', '#465e4d'], LEAF2 = LEAF[o.season];
  const pineMesh = new THREE.InstancedMesh(cone, lambert({}), pines.length), leafMesh = new THREE.InstancedMesh(ball, lambert({}), leaves.length);
  pines.forEach(([x, z, h], i) => { m.compose(v.set(x, o.groundAt(x, z) - 0.3, z), q.identity(), s.set(h * 0.72, h, h * 0.66)); pineMesh.setMatrixAt(i, m); pineMesh.setColorAt(i, c.set(PINE[i % 3])); });
  // 가까운 활엽수는 줄기 위에 공을 올린다(먼 것은 공만: 줄기가 보이지 않는 거리)
  const stem = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); stem.translate(0, 0.5, 0);
  own.push(stem);
  const near = leaves.map(([x, z]) => !clearOf(x, z, LEAF_TREE.trunkNear));
  const stemMesh = new THREE.InstancedMesh(stem, lambert({ color: '#6a4a33' }), near.filter(Boolean).length);
  let k = 0;
  leaves.forEach(([x, z, h, slot], i) => {
    const y = o.groundAt(x, z) - 0.2;
    m.compose(v.set(x, y + (near[i] ? h * LEAF_TREE.lift : 0), z), q.identity(), s.set(h * (0.85 + (slot % 4) * 0.1), h * 0.9, h)); leafMesh.setMatrixAt(i, m); leafMesh.setColorAt(i, c.set(LEAF2[slot % LEAF2.length]));
    if (near[i]) { m.compose(v.set(x, y, z), q.identity(), s.set(h * LEAF_TREE.trunkW, h * LEAF_TREE.trunkH, h * LEAF_TREE.trunkW)); stemMesh.setMatrixAt(k++, m); }
  });
  leafMesh.name = 'scenery-leaves';
  stemMesh.name = 'scenery-stems';
  group.add(pineMesh, leafMesh, stemMesh); own.push(pineMesh, leafMesh, stemMesh);
  // 먼 도시: 안개 속 상자들(건너편 능선 너머)
  const city: Array<[number, number, number, number]> = [];
  for (let i = 0; i < o.cap.city; i++) {
    const x = o.cx + (r() - 0.5) * 2200, z = o.P.z2 + 300 + r() * 780;
    city.push([x, z, 10 + r() * 22, 6 + r() * (r() < 0.12 ? 60 : 22)]);
  }
  const cityMesh = new THREE.InstancedMesh(box, lambert({ color: '#aab0b6' }), city.length);
  city.forEach(([x, z, w, h], i) => { m.compose(v.set(x, o.groundAt(x, z) - 0.5, z), q.identity(), s.set(w, h, w * (0.6 + (i % 5) * 0.15))); cityMesh.setMatrixAt(i, m); });
  group.add(cityMesh); own.push(cityMesh);
}
