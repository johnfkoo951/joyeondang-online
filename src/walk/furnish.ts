import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXTERIOR, FLOOR1, FLOOR2 } from '@/content/interior';
import { TOY_SHELF, type ToyShape } from '@/content/room-worlds';
import type { Furniture } from './types';

/** 집마다 다른 높이: 2층 바닥 높이, 가구 자리의 천장 높이(층 바닥 기준) */
export type FurnishEnv = { floor2: number; ceilingAt: (f: Furniture) => number };
import { hanji, planks, rug } from './textures';

// 가구는 모두 상자·원기둥 같은 단순한 도형으로 짓는다. 레퍼런스를 받으면 모양과 색을 여기서 다듬는다.

type LightSpec = { light: THREE.PointLight; level: 1 | 2; base: number };

const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra });

/**
 * 처음 쓸 때 만들어 두는 재질·텍스처 묶음(방 장면 소품용). 같은 열쇠면 같은 것을 돌려주고,
 * 장면이 정리될 때(scene.ts가 makeFurnitureMats의 값마다 dispose) 만든 것을 모두 놓는다.
 */
function makeKit() {
  const made = new Map<string, { dispose: () => void }>();
  const once = <T extends { dispose: () => void }>(key: string, make: () => T): T => {
    let v = made.get(key) as T | undefined;
    if (!v) {
      v = make();
      made.set(key, v);
    }
    return v;
  };
  return {
    once,
    /** 색 하나짜리 재질 */
    paint: (color: string, roughness = 0.8, metalness = 0) => once(`p:${color}:${roughness}:${metalness}`, () => std(color, { roughness, metalness })),
    /** 스스로 빛나는 재질(등갓·화면) */
    glow: (color: string, intensity = 1.2) => once(`g:${color}:${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity })),
    /** 캔버스 텍스처(그림 파일 없이) */
    tex: (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) =>
      once(`t:${key}`, () => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        draw(c.getContext('2d')!, w, h);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        return t;
      }),
    dispose() {
      made.forEach((v) => v.dispose());
      made.clear();
    },
  };
}
export type FurnitureKit = ReturnType<typeof makeKit>;

export function makeFurnitureMats() {
  const kit = makeKit();
  const hanjiTex = kit.once('t:hanji', () => hanji(FLOOR2.hanji));
  return {
    kit,
    walnut: std(FLOOR1.walnut, { roughness: 0.7 }),
    oakStage: new THREE.MeshStandardMaterial({ map: kit.once('t:oakStage', () => planks(FLOOR1.oak, 21)), roughness: 0.75 }),
    leather: std(FLOOR1.leather, { roughness: 0.55 }),
    cushions: FLOOR1.cushions.map((c) => std(c, { roughness: 0.95 })),
    brass: std(FLOOR1.brass, { metalness: 0.8, roughness: 0.35 }),
    warmGlow: new THREE.MeshStandardMaterial({ color: FLOOR1.warmLight, emissive: FLOOR1.warmLight, emissiveIntensity: 1.4 }),
    paperCard: std(FLOOR1.paperCard, { roughness: 0.95 }),
    books: FLOOR1.books.map((c) => std(c, { roughness: 0.9 })),
    rug1: new THREE.MeshStandardMaterial({ map: kit.once('t:rug1', () => rug(FLOOR1.rug, FLOOR1.rugBorder)), roughness: 1 }),
    runner: new THREE.MeshStandardMaterial({ map: kit.once('t:runner', () => rug('#6f3a2c', '#b98a4a')), roughness: 1 }),
    dark: std('#2a2420', { roughness: 0.6 }),
    lacquer: std(FLOOR2.lacquer, { roughness: 0.22, metalness: 0.1 }),
    silver: std(FLOOR2.silver, { metalness: 0.92, roughness: 0.28 }),
    hanji: new THREE.MeshStandardMaterial({ map: hanjiTex, color: FLOOR2.hanji, emissive: FLOOR2.hanjiLight, emissiveIntensity: 0.55, roughness: 1, side: THREE.DoubleSide }),
    hanjiPlain: new THREE.MeshStandardMaterial({ map: hanjiTex, color: FLOOR2.hanji, roughness: 1, side: THREE.DoubleSide }),
    silk: std(FLOOR2.silk, { roughness: 0.5 }),
    beam: std(FLOOR2.beam, { roughness: 0.7 }),
    strip: new THREE.MeshStandardMaterial({ color: FLOOR2.lightStrip, emissive: FLOOR2.lightStrip, emissiveIntensity: 1.2 }),
    stone: std(EXTERIOR.stone, { roughness: 0.95 }),
    pineLeaf: std(EXTERIOR.pineLeaf, { roughness: 0.9, flatShading: true }),
    pineTrunk: std(EXTERIOR.pineTrunk, { roughness: 0.9 }),
    shrub: std(EXTERIOR.shrub, { roughness: 0.9, flatShading: true }),
    lanternGlow: new THREE.MeshStandardMaterial({ color: '#ffd59a', emissive: '#ffb35c', emissiveIntensity: 1.6 }),
  };
}
export type FurnitureMats = ReturnType<typeof makeFurnitureMats>;

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/**
 * 가구 하나를 지어 그룹으로 돌려준다. 그룹의 원점은 바닥 가운데이고,
 * 로컬 +z가 정면(face)이며 로컬 너비 W는 벽을 따라가는 길이, D는 깊이다.
 */
function build(f: Furniture, m: FurnitureMats, lights: LightSpec[], env: FurnishEnv): THREE.Object3D {
  const side = f.face === '+x' || f.face === '-x';
  const W = side ? f.z2 - f.z1 : f.x2 - f.x1;
  const D = side ? f.x2 - f.x1 : f.z2 - f.z1;
  const g = new THREE.Group();
  const addLight = (color: string, intensity: number, dist: number, x: number, y: number, z: number) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    l.userData.local = true;
    g.add(l);
    lights.push({ light: l, level: f.level, base: intensity });
  };
  switch (f.kind) {
    case 'rug': {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W, D), W < 2 ? m.runner : m.rug1);
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.012;
      g.add(p);
      break;
    }
    case 'sofa':
    case 'armchair': {
      g.add(box(W, 0.42, D * 0.78, m.leather, 0, 0.21, D * 0.11));
      g.add(box(W, 0.88, D * 0.24, m.leather, 0, 0.44, -D / 2 + D * 0.12));
      g.add(box(0.16, 0.62, D, m.leather, -W / 2 + 0.08, 0.31, 0));
      g.add(box(0.16, 0.62, D, m.leather, W / 2 - 0.08, 0.31, 0));
      const n = f.kind === 'sofa' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const c = box(0.42, 0.36, 0.14, m.cushions[i % m.cushions.length], (i - (n - 1) / 2) * 0.7, 0.62, -D / 2 + D * 0.3);
        c.rotation.x = -0.25;
        g.add(c);
      }
      break;
    }
    case 'coffeeTable': {
      g.add(box(W, 0.06, D, m.walnut, 0, 0.42, 0));
      g.add(box(W * 0.9, 0.03, D * 0.85, m.walnut, 0, 0.14, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.05, 0.42, 0.05, m.walnut, sx * (W / 2 - 0.06), 0.21, sz * (D / 2 - 0.06)));
      // 테이블 위 책 두 권
      g.add(box(0.3, 0.04, 0.22, m.books[0], -0.15, 0.47, 0));
      g.add(box(0.26, 0.04, 0.2, m.books[2], -0.13, 0.51, 0.02));
      break;
    }
    case 'bookshelf': {
      const H = 2.2;
      g.add(box(W, H, 0.04, m.walnut, 0, H / 2, -D / 2 + 0.02));
      g.add(box(0.05, H, D, m.walnut, -W / 2 + 0.025, H / 2, 0));
      g.add(box(0.05, H, D, m.walnut, W / 2 - 0.025, H / 2, 0));
      const rnd = seeded(13);
      for (let s = 0; s < 5; s++) {
        const y = 0.08 + s * 0.45;
        g.add(box(W, 0.04, D, m.walnut, 0, y, 0));
        let x = -W / 2 + 0.08;
        while (x < W / 2 - 0.12) {
          const bw = 0.04 + rnd() * 0.05;
          const bh = 0.24 + rnd() * 0.12;
          const b = box(bw, bh, D * 0.75, m.books[Math.floor(rnd() * m.books.length)], x + bw / 2, y + 0.02 + bh / 2, 0.02);
          if (rnd() > 0.92) b.rotation.z = 0.25;
          g.add(b);
          x += bw + 0.006;
        }
      }
      break;
    }
    case 'floorLamp': {
      g.add(cyl(0.16, 0.18, 0.04, m.brass, 0, 0.02, 0));
      g.add(cyl(0.015, 0.015, 1.5, m.brass, 0, 0.77, 0, 8));
      g.add(cyl(0.16, 0.26, 0.3, m.warmGlow, 0, 1.6, 0));
      addLight(FLOOR1.warmLight, 9, 6, 0, 1.5, 0);
      break;
    }
    case 'recordCabinet': {
      g.add(box(W, 0.78, D, m.walnut, 0, 0.39, 0));
      g.add(box(W * 0.92, 0.02, 0.01, m.brass, 0, 0.6, D / 2 + 0.005));
      g.add(box(0.46, 0.09, 0.36, m.dark, 0, 0.83, 0));
      g.add(cyl(0.15, 0.15, 0.015, m.dark, -0.04, 0.885, 0, 24));
      break;
    }
    case 'stage': {
      g.add(box(W, 0.3, D, m.oakStage, 0, 0.15, 0));
      // 다섯 사람 카드 자리(그림과 소개 글이 정해지면 바뀐다)
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * (W / 5.4);
        const easel = new THREE.Group();
        easel.position.set(x, 0.3, -D * 0.1);
        easel.add(box(0.04, 1.5, 0.04, m.walnut, -0.25, 0.75, 0));
        easel.add(box(0.04, 1.5, 0.04, m.walnut, 0.25, 0.75, 0));
        const card = box(0.62, 0.86, 0.02, m.paperCard, 0, 1.05, 0.04);
        card.rotation.x = -0.08;
        easel.add(card);
        g.add(easel);
      }
      break;
    }
    case 'pendant': {
      const top = env.ceilingAt(f);
      g.add(cyl(0.006, 0.006, 0.7, m.dark, 0, top - 0.35, 0, 6));
      g.add(cyl(0.08, 0.2, 0.18, m.brass, 0, top - 0.78, 0));
      g.add(cyl(0.06, 0.06, 0.04, m.warmGlow, 0, top - 0.88, 0));
      addLight(FLOOR1.warmLight, 7, 5.5, 0, top - 1.0, 0);
      break;
    }
    case 'shoeCabinet': {
      g.add(box(W, 1.0, D, m.walnut, 0, 0.5, 0));
      for (let i = 0; i < 9; i++) g.add(box(W * 0.94, 0.025, 0.02, m.dark, 0, 0.12 + i * 0.1, D / 2 + 0.01));
      break;
    }
    case 'bench':
    case 'yardBench': {
      g.add(box(W, 0.06, D, m.walnut, 0, 0.44, 0));
      for (const sx of [-1, 1]) g.add(box(0.06, 0.44, D * 0.8, m.walnut, sx * (W / 2 - 0.1), 0.22, 0));
      if (f.kind === 'yardBench') g.add(box(W, 0.36, 0.05, m.walnut, 0, 0.7, -D / 2 + 0.03));
      break;
    }
    case 'stairs':
      return g; // 계단 디딤판·난간은 엔진이 경사면 데이터(ramps)에서 그린다
    case 'pine': {
      g.add(cyl(0.16, 0.26, 2.4, m.pineTrunk, 0, 1.2, 0, 8));
      const layers: Array<[number, number, number]> = [[2.2, 1.3, 2.0], [1.7, 1.1, 2.9], [1.1, 0.9, 3.7]];
      for (const [r, h, y] of layers) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), m.pineLeaf);
        c.position.set(0.15, y, -0.1);
        c.scale.set(1, 0.7, 0.85);
        g.add(c);
      }
      // 쪽지가 걸리는 나무: 종이 몇 장
      const rnd = seeded(5);
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 1.1 + rnd() * 0.6;
        const p = box(0.14, 0.2, 0.01, m.paperCard, Math.cos(a) * r, 1.75 + rnd() * 0.5, Math.sin(a) * r);
        p.rotation.y = -a;
        g.add(p);
      }
      break;
    }
    case 'stoneLantern': {
      g.add(box(0.8, 0.18, 0.8, m.stone, 0, 0.09, 0));
      g.add(box(0.3, 0.9, 0.3, m.stone, 0, 0.63, 0));
      g.add(box(0.62, 0.1, 0.62, m.stone, 0, 1.13, 0));
      g.add(box(0.5, 0.42, 0.5, m.stone, 0, 1.39, 0));
      g.add(box(0.22, 0.2, 0.52, m.lanternGlow, 0, 1.4, 0));
      g.add(box(0.52, 0.2, 0.22, m.lanternGlow, 0, 1.4, 0));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.36, 4), m.stone);
      cap.position.y = 1.78;
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m.stone).translateY(2.0));
      addLight('#ffb35c', 6, 6, 0, 1.4, 0);
      break;
    }
    case 'shrub': {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), m.shrub);
      s.position.y = 0.5;
      s.scale.set(W / 1.2, 0.75, D / 1.2);
      g.add(s);
      break;
    }
    case 'path': {
      for (let z = f.z1 + 0.5; z < f.z2; z += 1.15) {
        const st = cyl(0.42, 0.45, 0.06, m.stone, (Math.sin(z * 1.7) * 0.18), 0.03, z - (f.z1 + f.z2) / 2, 10);
        g.add(st);
      }
      break;
    }
    case 'lattice': {
      // 창살: 옻칠 검정 틀, 은빛 살, 뒤에 빛이 비치는 한지
      const H = 2.0;
      const y0 = 0.5;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H - 0.1), m.hanji);
      back.position.set(0, y0 + H / 2, -0.02);
      g.add(back);
      g.add(box(W, 0.08, 0.08, m.lacquer, 0, y0, 0));
      g.add(box(W, 0.08, 0.08, m.lacquer, 0, y0 + H, 0));
      g.add(box(0.08, H, 0.08, m.lacquer, -W / 2, y0 + H / 2, 0));
      g.add(box(0.08, H, 0.08, m.lacquer, W / 2, y0 + H / 2, 0));
      const cols = 8;
      const rows = 6;
      for (let i = 1; i < cols; i++) g.add(box(0.025, H, 0.03, m.silver, -W / 2 + (i * W) / cols, y0 + H / 2, 0.01));
      for (let j = 1; j < rows; j++) g.add(box(W, 0.025, 0.03, m.silver, 0, y0 + (j * H) / rows, 0.01));
      break;
    }
    case 'lowTable': {
      g.add(box(W, 0.06, D, m.lacquer, 0, 0.32, 0));
      g.add(box(W + 0.02, 0.015, D + 0.02, m.silver, 0, 0.295, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.07, 0.29, 0.07, m.lacquer, sx * (W / 2 - 0.08), 0.145, sz * (D / 2 - 0.08)));
      g.add(cyl(0.12, 0.08, 0.06, m.silver, 0.3, 0.38, 0, 20)); // 은 그릇
      break;
    }
    case 'cushion': {
      g.add(box(W, 0.08, D, m.silk, 0, 0.04, 0));
      break;
    }
    case 'foldingScreen': {
      // 병풍: 여섯 폭이 지그재그로 선다(폭마다 빈 한지)
      const n = 6;
      const pw = W / n;
      for (let i = 0; i < n; i++) {
        const p = new THREE.Group();
        p.position.set(-W / 2 + pw * (i + 0.5), 0, (i % 2 ? 0.08 : -0.08));
        p.rotation.y = i % 2 ? 0.28 : -0.28;
        p.add(box(pw, 1.75, 0.03, m.silver, 0, 0.9, 0));
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.08, 1.6), m.hanjiPlain);
        paper.position.set(0, 0.92, 0.02);
        p.add(paper);
        g.add(p);
      }
      break;
    }
    case 'lacquerChest': {
      // 반닫이: 옻칠 몸체와 은빛 장석
      g.add(box(W, 0.85, D, m.lacquer, 0, 0.425, 0));
      const fz = D / 2 + 0.006;
      g.add(box(W * 0.94, 0.012, 0.01, m.silver, 0, 0.6, fz));
      for (const sx of [-0.3, 0.3]) g.add(box(0.14, 0.2, 0.01, m.silver, sx * W, 0.7, fz));
      g.add(cyl(0.07, 0.07, 0.012, m.silver, 0, 0.5, fz, 16).rotateX(Math.PI / 2));
      for (const sx of [-1, 1]) for (const sy of [0.06, 0.79]) g.add(box(0.08, 0.08, 0.01, m.silver, sx * (W / 2 - 0.05), sy, fz));
      break;
    }
    case 'hanjiLantern': {
      g.add(box(0.36, 0.06, 0.36, m.lacquer, 0, 0.03, 0));
      g.add(cyl(0.17, 0.17, 0.6, m.hanji, 0, 0.36, 0, 12));
      g.add(box(0.36, 0.04, 0.36, m.lacquer, 0, 0.68, 0));
      if (f.x1 < 8) addLight(FLOOR2.hanjiLight, 6, 5, 0, 0.5, 0);
      break;
    }
    case 'hanjiPendant': {
      g.add(cyl(0.006, 0.006, 0.6, m.dark, 0, 2.5, 0, 6));
      g.add(box(0.9, 0.3, 0.5, m.hanji, 0, 2.05, 0));
      g.add(box(0.94, 0.02, 0.54, m.silver, 0, 2.21, 0));
      addLight(FLOOR2.hanjiLight, 8, 6, 0, 1.8, 0);
      break;
    }
    case 'ridgeBeam': {
      g.add(box(W, 0.3, 0.26, m.beam, 0, 2.66, 0));
      g.add(box(W, 0.03, 0.06, m.strip, 0, 2.495, 0));
      break;
    }
    default:
      roomPiece(f, W, D, g, m, addLight, env);
  }
  g.userData.kind = f.kind;
  const cx = (f.x1 + f.x2) / 2;
  const cz = (f.z1 + f.z2) / 2;
  g.position.set(cx, f.level === 2 ? env.floor2 : 0, cz);
  g.rotation.y = f.face === '+x' ? Math.PI / 2 : f.face === '-x' ? -Math.PI / 2 : f.face === '-z' ? Math.PI : 0;
  return g;
}

export function buildFurniture(list: Furniture[], mats: FurnitureMats, env: FurnishEnv) {
  const lights: LightSpec[] = [];
  const byLevel: Record<1 | 2, THREE.Group> = { 1: new THREE.Group(), 2: new THREE.Group() };
  for (const f of list) byLevel[f.level].add(build(f, mats, lights, env));
  return { byLevel, lights };
}

// ───────── 방 장면 소품(src/content/room-worlds.ts). 원시 도형과 furnish 안 캔버스만 쓴다.
// 그룹 원점은 바닥 가운데, 로컬 +z가 정면, W는 벽을 따라간 길이, D는 깊이(뒤쪽 -D/2가 벽에 닿는다).
type AddLight = (color: string, intensity: number, dist: number, x: number, y: number, z: number) => void;
type Piece = { f: Furniture; W: number; D: number; g: THREE.Group; m: FurnitureMats; kit: FurnitureKit; addLight: AddLight; env: FurnishEnv };

function sph(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 14) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), mat);
  s.position.set(x, y, z);
  s.scale.set(sx, sy, sz);
  return s;
}
/** w×h 판. per 미터마다 텍스처가 한 번 되풀이되게 UV를 늘인다 */
function tiledPlane(w: number, h: number, perX = w, perY = h, segX = 1) {
  const geo = new THREE.PlaneGeometry(w, h, segX, 1);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / perX, (uv.getY(i) * h) / perY);
  return geo;
}
/** 바닥에 눕힌 판(위를 본다) */
function onFloor(mesh: THREE.Mesh, y: number) {
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}
/** 자리마다 다르지만 늘 같은 작은 정수(소품 고르기·색 바꾸기) */
const spotHash = (f: Furniture) => Math.abs(Math.round(f.x1 * 37 + f.z1 * 91 + f.x2 * 13 + f.z2 * 7));
/** 그림자를 드리우지 않게 하는 표시(scene.ts는 투명 재질에 그림자를 주지 않는다) */
const noShadow = (mat: THREE.Material) => ((mat.transparent = true), mat);

function slopedCeiling({ W, D, g, kit, env, f }: Piece) {
  // 박공 천장: 양옆 벽(처마 쪽)에서 가운데 평천장 띠까지 비스듬한 판자. 아래를 보는 한쪽 면만 그려서
  // 3인칭으로 위에서 내려다볼 때는 보이지 않는다.
  const top = env.ceilingAt(f) - 0.012, eave = 1.95, band = 0.9;
  const run = W / 2 - band, rise = top - eave, len = Math.hypot(run, rise);
  const map = kit.tex('rafters', 512, 256, (c, w, h) => {
    const tones = ['#c99f72', '#bf9468', '#d1a97c', '#c49a6d'];
    for (let i = 0; i < 8; i++) {
      c.fillStyle = tones[i % tones.length];
      c.fillRect(0, (i * h) / 8, w, h / 8);
      c.fillStyle = 'rgba(70,40,20,0.35)';
      c.fillRect(0, (i * h) / 8, w, 2);
    }
    c.fillStyle = '#6b4428';
    c.fillRect(w / 2 - 18, 0, 36, h); // 서까래
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(w / 2 + 18, 0, 6, h);
  });
  const mat = kit.once('m:rafters', () => noShadow(new THREE.MeshStandardMaterial({ map, roughness: 0.8 })));
  for (const s of [-1, 1]) {
    const mesh = new THREE.Mesh(tiledPlane(D, len, 0.9, len), mat);
    const u = new THREE.Vector3(-s * run, rise, 0).normalize();
    const n = new THREE.Vector3(-s * rise, -run, 0).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(u, n), u, n));
    mesh.position.set(s * (band + run / 2), (eave + top) / 2, 0);
    g.add(mesh);
  }
  const flat = new THREE.Mesh(tiledPlane(2 * band, D, 2 * band, 0.9), mat);
  flat.rotation.x = Math.PI / 2;
  flat.position.y = top + 0.002;
  g.add(flat);
  const beam = kit.once('m:ridge', () => noShadow(std('#4a2f1d', { roughness: 0.7 })));
  for (const x of [-band, 0, band]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(x === 0 ? 0.26 : 0.12, D), beam);
    b.rotation.x = Math.PI / 2;
    b.position.set(x, top - 0.004, 0);
    g.add(b);
  }
}

function stripeWall({ W, g, kit, env, f }: Piece) {
  // 밝은 줄무늬 벽지: 허리판 위에서 천장 몰딩 아래까지
  const map = kit.tex('stripes', 256, 32, (c, w, h) => {
    const cols = ['#5cc4a4', '#ffc93c', '#ff8f7a', '#62a8e8'];
    const sw = w / 8;
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fff6e2' : cols[(i / 2) % cols.length];
      c.fillRect(i * sw, 0, sw, h);
    }
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 8; i++) c.fillRect(i * sw + sw / 2 - 1, 0, 2, h);
  });
  const mat = kit.once('m:stripes', () => new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
  const y0 = 0.94, y1 = env.ceilingAt(f) - 0.075;
  const p = new THREE.Mesh(tiledPlane(W, y1 - y0, 1.2, y1 - y0), mat);
  p.position.set(0, (y0 + y1) / 2, 0);
  p.receiveShadow = true;
  g.add(p);
}

function lightPattern({ W, D, g, kit }: Piece) {
  // 창살을 지나 바닥에 드는 빛: 창 쪽(+z)에서 방 안쪽으로 비스듬히 길어진 네 칸 세 줄
  const map = kit.tex('sunPanes', 512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const near = { y: h * 0.96, a: w * 0.14, b: w * 0.97 }; // 창 쪽 끝
    const far = { y: h * 0.04, a: w * 0.02, b: w * 0.8 }; // 안쪽 끝
    const at = (u: number, v: number) => {
      const y = near.y + (far.y - near.y) * v;
      const a = near.a + (far.a - near.a) * v, b = near.b + (far.b - near.b) * v;
      return [a + (b - a) * u, y] as const;
    };
    const cols = 4, rows = 3, gap = 0.045;
    for (const [alpha, grow] of [[0.06, 0.02], [0.1, 0], [0.13, -0.012]] as const) {
      c.fillStyle = `rgba(255,222,160,${alpha})`;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const u0 = i / cols + gap / 2 - grow, u1 = (i + 1) / cols - gap / 2 + grow;
        const v0 = j / rows + gap / 2 - grow, v1 = (j + 1) / rows - gap / 2 + grow;
        const pts = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (const [x, y] of pts.slice(1)) c.lineTo(x, y);
        c.closePath();
        c.fill();
      }
    }
  });
  const mat = kit.once('m:sunPanes', () => new THREE.MeshBasicMaterial({
    map, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  g.add(onFloor(new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat), 0.018));
}

function roundRug({ W, D, g, kit, f }: Piece) {
  // 정면이 없으면 짙은 남색·겨자색(재즈 무대), 정면을 주면 차분한 청회색·세이지(둥근 러그라 방향은 보이지 않는다)
  const warm = !f.face;
  const rings = warm ? ['#2f3d6b', '#d9a441', '#2f3d6b', '#f1e3c4', '#b5523b'] : ['#5f7d8f', '#c9b48e', '#7f9a8a', '#b9825e', '#4f6b7a'];
  const map = kit.tex(`roundRug:${warm}`, 256, 256, (c, w) => {
    rings.forEach((col, i) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(w / 2, w / 2, (w / 2) * (1 - i * 0.17), 0, Math.PI * 2);
      c.fill();
    });
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 2;
    for (let r = 12; r < w / 2; r += 9) {
      c.beginPath();
      c.arc(w / 2, w / 2, r, 0, Math.PI * 2);
      c.stroke();
    }
  });
  const mat = kit.once(`m:roundRug:${warm}`, () => new THREE.MeshStandardMaterial({ map, roughness: 1 }));
  const rug = onFloor(new THREE.Mesh(new THREE.CircleGeometry(Math.min(W, D) / 2, 48), mat), 0.013);
  rug.receiveShadow = true;
  g.add(rug);
}

function playMat({ W, D, g, kit }: Piece) {
  // 퍼즐 매트: 네 색 조각이 엇갈린다(조각 한 변 0.5m)
  const map = kit.tex('puzzleMat', 256, 256, (c, w) => {
    const cols = ['#ffd166', '#7fd1b9', '#f497a8', '#8ab6f9'];
    const s = w / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = cols[(i * 2 + j + i) % 4];
      c.fillRect(i * s, j * s, s, s);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.arc(i * s + s, j * s + s / 2, 10, 0, Math.PI * 2); // 끼우는 이
      c.fill();
    }
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 3;
    c.strokeRect(1, 1, w - 2, w - 2);
    c.beginPath();
    c.moveTo(s, 0); c.lineTo(s, w); c.moveTo(0, s); c.lineTo(w, s);
    c.stroke();
  });
  const mat = kit.once('m:puzzleMat', () => new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
  const top = onFloor(new THREE.Mesh(tiledPlane(W, D, 1, 1), mat), 0.022);
  top.receiveShadow = true;
  g.add(top, box(W, 0.02, D, kit.paint('#e8e2d4', 0.95), 0, 0.01, 0));
}

function recordShelf({ W, D, g, m, kit, f }: Piece) {
  // 레코드장: 두 줄 네 칸에 판 꽂이, 위에 턴테이블과 작은 스피커 둘, 앞으로 세워 둔 판 둘
  const H = 0.95, cols = Math.max(2, Math.round(W / 0.4)), cw = W / cols;
  g.add(box(W, 0.04, D, m.walnut, 0, H, 0), box(W, 0.04, D, m.walnut, 0, 0.04, 0), box(W, 0.03, D, m.walnut, 0, H / 2 + 0.02, 0));
  g.add(box(W, H, 0.02, m.walnut, 0, H / 2, -D / 2 + 0.01));
  for (let i = 0; i <= cols; i++) g.add(box(0.03, H, D, m.walnut, -W / 2 + i * cw + (i === 0 ? 0.015 : i === cols ? -0.015 : 0), H / 2, 0));
  const rnd = seeded(spotHash(f) + 3);
  const sleeves = ['#d9a441', '#2f3d6b', '#b5523b', '#e9dfc8', '#3e5b47', '#7a3b5e', '#1d1d1f', '#c66a2c', '#5a7fa8'];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, kit.paint('#ffffff', 0.7), cols * 2 * 26);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  let n = 0;
  for (let row = 0; row < 2; row++) for (let i = 0; i < cols; i++) {
    const y = row === 0 ? 0.06 : H / 2 + 0.035;
    let x = -W / 2 + i * cw + 0.04;
    while (x < -W / 2 + (i + 1) * cw - 0.05 && n < inst.count) {
      const t = 0.008 + rnd() * 0.006;
      q.setFromEuler(new THREE.Euler(0, 0, rnd() > 0.85 ? 0.12 : 0));
      mtx.compose(new THREE.Vector3(x, y + 0.155, 0.01), q, new THREE.Vector3(t, 0.31, D * 0.85));
      inst.setMatrixAt(n, mtx);
      inst.setColorAt(n, col.set(sleeves[Math.floor(rnd() * sleeves.length)]));
      n++;
      x += t + 0.004;
    }
  }
  inst.count = n;
  g.add(inst);
  // 턴테이블
  const tt = new THREE.Group();
  tt.position.set(0, H + 0.02, 0);
  tt.add(box(0.46, 0.09, 0.36, m.walnut, 0, 0.045, 0), cyl(0.155, 0.155, 0.012, m.dark, -0.04, 0.096, 0, 32));
  tt.add(cyl(0.05, 0.05, 0.014, kit.paint('#d9a441', 0.6), -0.04, 0.104, 0, 20));
  const arm = box(0.012, 0.012, 0.24, m.silver, 0.15, 0.115, 0.0);
  arm.rotation.y = 0.35;
  tt.add(arm, cyl(0.025, 0.025, 0.03, m.silver, 0.17, 0.105, -0.11, 12));
  g.add(tt);
  for (const sx of [-1, 1]) {
    g.add(box(0.2, 0.3, 0.2, m.walnut, sx * (W / 2 - 0.14), H + 0.17, -0.02));
    g.add(cyl(0.06, 0.06, 0.01, m.dark, sx * (W / 2 - 0.14), H + 0.2, 0.085, 20).rotateX(Math.PI / 2));
  }
}

/** 악보 한 장(오선과 음표 몇 개) */
function sheetMusic(kit: FurnitureKit) {
  const map = kit.tex('sheetMusic', 192, 256, (c, w, h) => {
    c.fillStyle = '#f7f1e3';
    c.fillRect(0, 0, w, h);
    const rnd = seeded(29);
    for (let s = 0; s < 7; s++) {
      const y0 = 26 + s * 32;
      c.strokeStyle = 'rgba(40,30,20,0.55)';
      c.lineWidth = 1;
      for (let l = 0; l < 5; l++) {
        c.beginPath();
        c.moveTo(12, y0 + l * 4);
        c.lineTo(w - 12, y0 + l * 4);
        c.stroke();
      }
      c.fillStyle = 'rgba(30,20,10,0.8)';
      for (let x = 24; x < w - 16; x += 11 + rnd() * 8) {
        c.beginPath();
        c.ellipse(x, y0 + Math.floor(rnd() * 9) * 2, 2.6, 2, -0.4, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
  return kit.once('m:sheetMusic', () => new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
}

function piano({ W, D, g, m, kit }: Piece) {
  // 업라이트 피아노: 옻칠 검정 몸통, 건반, 보면대 위 악보, 놋쇠 페달, 위에 메트로놈
  const body = m.lacquer;
  const zb = -D / 2 + 0.15;
  g.add(box(W, 1.25, 0.3, body, 0, 0.625, zb), box(W + 0.02, 0.03, 0.33, body, 0, 1.265, zb));
  g.add(box(W, 0.07, 0.29, body, 0, 0.72, D / 2 - 0.145), box(0.06, 0.14, 0.29, body, -W / 2 + 0.03, 0.8, D / 2 - 0.145));
  g.add(box(0.06, 0.14, 0.29, body, W / 2 - 0.03, 0.8, D / 2 - 0.145));
  const keys = kit.tex('pianoKeys', 512, 64, (c, w, h) => {
    c.fillStyle = '#f8f5ee';
    c.fillRect(0, 0, w, h);
    const n = 52, kw = w / n;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < n; i++) c.fillRect(i * kw, 0, 1, h);
    c.fillStyle = '#141414';
    for (let i = 0; i < n - 1; i++) if (![2, 6].includes(i % 7)) c.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6);
  });
  const keyTop = kit.once('m:pianoKeys', () => new THREE.MeshStandardMaterial({ map: keys, roughness: 0.4 }));
  const ivory = kit.paint('#f8f5ee', 0.4);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.022, 0.16), [ivory, ivory, keyTop, ivory, ivory, ivory]);
  kb.position.set(0, 0.766, D / 2 - 0.09);
  g.add(kb);
  const desk = box(0.62, 0.2, 0.015, body, 0, 1.0, zb + 0.16);
  desk.rotation.x = -0.18;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), sheetMusic(kit));
  sheet.position.set(0, 1.0, zb + 0.172);
  sheet.rotation.x = -0.18;
  g.add(desk, sheet);
  for (const sx of [-1, 1]) g.add(cyl(0.025, 0.02, 0.69, body, sx * (W / 2 - 0.05), 0.345, D / 2 - 0.05, 10));
  for (const x of [-0.08, 0, 0.08]) g.add(box(0.03, 0.015, 0.09, m.brass, x, 0.045, zb + 0.19));
  const met = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), m.walnut);
  met.position.set(W / 2 - 0.22, 1.38, zb);
  met.rotation.y = Math.PI / 4;
  g.add(met, box(0.16, 0.2, 0.02, m.brass, -W / 2 + 0.25, 1.38, zb - 0.05), box(0.12, 0.15, 0.022, kit.paint('#2f3d6b'), -W / 2 + 0.25, 1.38, zb - 0.045));
}

function doubleBass({ g, kit, m }: Piece) {
  // 벽에 기대 둔 콘트라베이스: 니스 칠한 몸통 두 겹, 검은 지판, 줄 넷, 맨 위 소용돌이
  const wood = kit.paint('#8a4a1f', 0.35);
  const ebony = kit.paint('#1c130d', 0.4);
  const b = new THREE.Group();
  b.position.z = 0.1;
  b.rotation.x = -0.17;
  b.add(cyl(0.008, 0.008, 0.12, m.silver, 0, 0.06, 0, 6));
  b.add(sph(0.3, wood, 0, 0.48, 0, 1, 1.15, 0.38), sph(0.2, wood, 0, 0.74, 0, 0.95, 1.0, 0.37), sph(0.24, wood, 0, 0.98, 0, 1, 1.1, 0.36));
  b.add(box(0.07, 0.75, 0.02, ebony, 0, 1.18, 0.12), box(0.055, 0.6, 0.06, wood, 0, 1.5, 0.05));
  b.add(box(0.06, 0.14, 0.07, wood, 0, 1.78, 0.04), sph(0.045, wood, 0, 1.88, 0.05));
  for (const y of [1.74, 1.8]) for (const sx of [-1, 1]) b.add(cyl(0.008, 0.008, 0.06, ebony, sx * 0.05, y, 0.04, 6).rotateZ(Math.PI / 2));
  b.add(box(0.13, 0.08, 0.012, kit.paint('#d8b98a'), 0, 0.6, 0.118), box(0.08, 0.2, 0.012, ebony, 0, 0.38, 0.113));
  for (const x of [-0.03, -0.01, 0.01, 0.03]) b.add(cyl(0.0025, 0.0025, 1.4, m.silver, x, 1.1, 0.135, 4));
  for (const sx of [-1, 1]) {
    const fh = box(0.012, 0.14, 0.005, ebony, sx * 0.11, 0.62, 0.108);
    fh.rotation.z = sx * 0.12;
    b.add(fh);
  }
  g.add(b);
}

function musicStand({ g, kit }: Piece) {
  const metal = kit.paint('#222326', 0.45, 0.6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(0.008, 0.008, 0.36, metal, Math.sin(a) * 0.14, 0.12, Math.cos(a) * 0.14, 6);
    leg.rotation.set(-Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
    g.add(leg);
  }
  g.add(cyl(0.01, 0.01, 0.95, metal, 0, 0.55, 0, 8));
  const desk = new THREE.Group();
  desk.position.set(0, 1.1, 0);
  desk.rotation.x = -0.35;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), sheetMusic(kit));
  sheet.position.z = 0.008;
  desk.add(box(0.48, 0.32, 0.01, metal, 0, 0, 0), box(0.48, 0.02, 0.05, metal, 0, -0.16, 0.02), sheet);
  g.add(desk);
}

/** 아이 취향 소품 하나(바닥 가운데 원점, 앞이 +z, 키 0.15~0.25m) */
function toy(shape: ToyShape, color: string, kit: FurnitureKit): THREE.Group {
  const t = new THREE.Group();
  const c = kit.paint(color, 0.55);
  const dark = kit.paint('#26231f', 0.5);
  const white = kit.paint('#fbf8f0', 0.6);
  const wheel = (x: number, z: number, r = 0.028) => t.add(cyl(r, r, 0.02, dark, x, r, z, 12).rotateX(Math.PI / 2));
  switch (shape) {
    case 'dino':
      t.add(sph(0.08, c, 0, 0.1, 0, 1.4, 0.9, 0.8), sph(0.05, c, 0.11, 0.19, 0), sph(0.008, dark, 0.15, 0.2, 0.03));
      {
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 8), c);
        tail.rotation.z = Math.PI / 2.3; // 끝이 뒤(-x)로
        tail.position.set(-0.16, 0.11, 0);
        t.add(tail);
      }
      for (const [x, z] of [[-0.05, -0.04], [-0.05, 0.04], [0.05, -0.04], [0.05, 0.04]]) t.add(cyl(0.02, 0.022, 0.07, c, x, 0.035, z, 8));
      for (const x of [-0.06, -0.01, 0.04]) t.add(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 6), kit.paint('#ffd166')).translateX(x).translateY(0.175));
      break;
    case 'car':
      t.add(box(0.2, 0.06, 0.1, c, 0, 0.055, 0), box(0.11, 0.05, 0.09, c, -0.01, 0.105, 0), box(0.112, 0.03, 0.092, kit.paint('#bfe0f5', 0.2), -0.01, 0.105, 0));
      for (const x of [-0.065, 0.065]) for (const z of [-0.052, 0.052]) wheel(x, z);
      break;
    case 'train':
      t.add(box(0.16, 0.07, 0.08, c, 0.02, 0.065, 0), box(0.06, 0.07, 0.085, c, -0.05, 0.135, 0), cyl(0.015, 0.02, 0.05, dark, 0.07, 0.125, 0, 8));
      for (const x of [-0.04, 0.02, 0.08]) for (const z of [-0.042, 0.042]) wheel(x, z, 0.022);
      break;
    case 'blocks':
      t.add(box(0.07, 0.07, 0.07, c, -0.04, 0.035, 0), box(0.07, 0.07, 0.07, kit.paint('#3d7fd1', 0.6), 0.04, 0.035, 0.01));
      t.add(box(0.07, 0.07, 0.07, kit.paint('#e2553f', 0.6), 0, 0.105, 0).rotateY(0.3));
      break;
    case 'robot':
      t.add(box(0.09, 0.1, 0.06, c, 0, 0.09, 0), box(0.07, 0.06, 0.06, c, 0, 0.175, 0), cyl(0.004, 0.004, 0.04, dark, 0, 0.225, 0, 4));
      t.add(sph(0.01, kit.paint('#e2553f'), 0, 0.25, 0), sph(0.009, kit.glow('#7ff0ff', 0.8), -0.017, 0.18, 0.031), sph(0.009, kit.glow('#7ff0ff', 0.8), 0.017, 0.18, 0.031));
      for (const sx of [-1, 1]) t.add(cyl(0.012, 0.012, 0.07, c, sx * 0.06, 0.09, 0, 8), cyl(0.014, 0.014, 0.05, dark, sx * 0.025, 0.025, 0, 8));
      break;
    case 'ball':
      t.add(sph(0.075, c, 0, 0.075, 0, 1, 1, 1, 18), new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 24), white).translateY(0.075).rotateY(0.6));
      break;
    case 'star': {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.035 : 0.085, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      t.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false }), c).translateY(0.085));
      break;
    }
    case 'book':
      t.add(box(0.14, 0.19, 0.03, c, 0, 0.095, 0).rotateZ(0.08), box(0.15, 0.025, 0.11, kit.paint('#5fb85a', 0.7), 0.01, 0.012, 0.02));
      break;
    case 'crayons':
      t.add(cyl(0.04, 0.035, 0.07, c, 0, 0.035, 0, 14));
      ['#e2553f', '#3d7fd1', '#5fb85a', '#ffd23f', '#7a5cc7'].forEach((col, i) => {
        const a = (i / 5) * Math.PI * 2;
        const cr = cyl(0.007, 0.007, 0.1, kit.paint(col, 0.6), Math.cos(a) * 0.018, 0.1, Math.sin(a) * 0.018, 6);
        cr.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
        t.add(cr);
      });
      break;
    case 'drum':
      t.add(cyl(0.07, 0.07, 0.07, c, 0, 0.035, 0, 18), cyl(0.072, 0.072, 0.008, white, 0, 0.073, 0, 18));
      for (const sx of [-1, 1]) t.add(cyl(0.005, 0.005, 0.14, kit.paint('#d8b98a'), sx * 0.03, 0.09, 0.05, 6).rotateZ(sx * 1.1));
      break;
    case 'boat':
      t.add(box(0.16, 0.035, 0.06, c, 0, 0.018, 0), new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 3), c).translateY(0.09));
      break;
    case 'bear':
      t.add(sph(0.06, c, 0, 0.065, 0, 1, 1.1, 0.9), sph(0.045, c, 0, 0.16, 0), sph(0.016, c, -0.032, 0.2, 0), sph(0.016, c, 0.032, 0.2, 0));
      t.add(sph(0.018, kit.paint('#e8c9a4'), 0, 0.152, 0.038), sph(0.006, dark, -0.015, 0.172, 0.04), sph(0.006, dark, 0.015, 0.172, 0.04));
      break;
  }
  return t;
}

function toyShelf({ W, D, g, kit, f }: Piece) {
  // 밝은 칸 선반: 아래 줄은 색 천 상자, 위 줄과 위판에는 TOY_SHELF 소품을 차례로
  const H = 0.95, cols = Math.max(2, Math.round(W / 0.45)), cw = W / cols;
  const frame = kit.paint('#f6f1e6', 0.7);
  g.add(box(W, 0.03, D, frame, 0, H, 0), box(W, 0.03, D, frame, 0, 0.05, 0), box(W, 0.03, D, frame, 0, H / 2 + 0.02, 0));
  g.add(box(W, H, 0.015, frame, 0, H / 2, -D / 2 + 0.008), box(W, 0.05, 0.02, kit.paint('#7fd1b9'), 0, 0.025, D / 2 - 0.01));
  for (let i = 0; i <= cols; i++) g.add(box(0.025, H, D, frame, -W / 2 + i * cw + (i === 0 ? 0.012 : i === cols ? -0.012 : 0), H / 2, 0));
  const bins = ['#f497a8', '#ffd166', '#8ab6f9', '#7fd1b9', '#ff9f68', '#b39ddb'];
  const start = spotHash(f);
  for (let i = 0; i < cols; i++) {
    const x = -W / 2 + (i + 0.5) * cw;
    g.add(box(cw - 0.06, 0.34, D - 0.06, kit.paint(bins[(start + i) % bins.length], 0.9), x, 0.24, 0.01));
    g.add(box(0.1, 0.03, 0.005, kit.paint('#3a3530'), x, 0.33, D / 2 - 0.02));
    for (const [y, k] of [[H / 2 + 0.035, i], [H + 0.015, i + cols]] as const) {
      const item = TOY_SHELF[(start + k) % TOY_SHELF.length];
      const t = toy(item.shape, item.color, kit);
      t.position.set(x + (k % 2 ? 0.03 : -0.03), y, 0.02);
      t.scale.setScalar(1.25);
      t.rotation.y = (k % 3 - 1) * 0.35;
      g.add(t);
    }
  }
}

/** 액자 그림 넷(그림 파일 없이 색면 추상화) */
function artMat(kit: FurnitureKit, k: number) {
  const map = kit.tex(`art${k}`, 128, 160, (c, w, h) => {
    const pal = [
      ['#f1e3c4', '#2f3d6b', '#d9a441', '#b5523b'],
      ['#2a2b30', '#e9dfc8', '#c66a2c', '#5a7fa8'],
      ['#fff7e6', '#f497a8', '#5fb85a', '#3d7fd1'],
      ['#e8eef2', '#ffd166', '#7a5cc7', '#ff8a3d'],
    ][k % 4];
    const rnd = seeded(41 + k * 17);
    c.fillStyle = pal[0];
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = pal[1 + (i % 3)];
      c.globalAlpha = 0.85;
      if (rnd() > 0.5) {
        c.beginPath();
        c.arc(rnd() * w, rnd() * h, 10 + rnd() * 30, 0, Math.PI * 2);
        c.fill();
      } else c.fillRect(rnd() * w * 0.8, rnd() * h * 0.8, 12 + rnd() * 50, 6 + rnd() * 40);
    }
    c.globalAlpha = 1;
  });
  return kit.once(`m:art${k}`, () => new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
}

function wallFrames({ W, g, m, kit, f }: Piece) {
  // 벽에 건 액자 셋(크기·높이를 조금씩 달리)
  const sizes: Array<[number, number, number]> = [[0.32, 0.42, 1.6], [0.42, 0.3, 1.5], [0.26, 0.26, 1.68]];
  const n = Math.max(1, Math.min(3, Math.floor(W / 0.36)));
  const k0 = spotHash(f);
  for (let i = 0; i < n; i++) {
    const [w, h, y] = sizes[(k0 + i) % sizes.length];
    const x = -W / 2 + ((i + 0.5) * W) / n;
    g.add(box(w + 0.05, h + 0.05, 0.025, i % 2 ? m.dark : m.walnut, x, y, 0));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat(kit, k0 + i));
    art.position.set(x, y, 0.0135);
    g.add(art);
  }
}

function targets({ W, g, kit }: Piece) {
  // 과녁판 셋(가운데가 조금 높다), 가운데 아래 작은 벽 선반에 오리 인형과 깡통
  const map = kit.tex('targetRings', 256, 256, (c, w) => {
    const cols = ['#e2553f', '#fffaf0', '#3d7fd1', '#fffaf0', '#ffd23f'];
    cols.forEach((col, i) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(w / 2, w / 2, (w / 2) * (1 - i * 0.19), 0, Math.PI * 2);
      c.fill();
    });
  });
  const face = kit.once('m:targetRings', () => new THREE.MeshStandardMaterial({ map, roughness: 0.8 }));
  const rim = kit.paint('#c99f72', 0.7);
  const balloons = ['#f497a8', '#8ab6f9', '#ffd166'];
  [-1, 0, 1].forEach((k, i) => {
    const x = (k * W) / 3, y = k === 0 ? 1.62 : 1.3;
    const board = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 40), [rim, face, rim]);
    board.rotation.x = Math.PI / 2;
    board.position.set(x, y, 0.0);
    g.add(board);
    const bx = x + 0.3, by = y + 0.28;
    g.add(sph(0.075, kit.paint(balloons[i], 0.5), bx, by, 0.06, 0.9, 1.1, 0.9), cyl(0.002, 0.002, 0.2, kit.paint('#555'), bx, by - 0.17, 0.05, 4));
  });
  g.add(box(0.9, 0.03, 0.16, rim, 0, 0.95, 0.07));
  const duck = new THREE.Group();
  duck.position.set(-0.22, 0.965, 0.08);
  duck.add(sph(0.06, kit.paint('#ffd23f', 0.4), 0, 0.05, 0, 1.2, 0.85, 1), sph(0.04, kit.paint('#ffd23f', 0.4), 0.04, 0.11, 0));
  duck.add(sph(0.018, kit.paint('#ff8a3d'), 0.08, 0.105, 0, 1.4, 0.6, 1), sph(0.006, kit.paint('#26231f'), 0.06, 0.125, 0.025));
  g.add(duck);
  ['#9aa7b4', '#e2553f', '#5fb85a'].forEach((col, i) => g.add(cyl(0.035, 0.035, 0.1, kit.paint(col, 0.35, 0.6), 0.08 + i * 0.09, 1.015, 0.08, 14)));
}

function paperBasket({ W, g, kit }: Piece) {
  const map = kit.tex('wicker', 128, 64, (c, w, h) => {
    c.fillStyle = '#b98a52';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(80,50,20,0.45)';
    c.lineWidth = 2;
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) c.strokeRect(x, y, 16, 8);
  });
  const weave = kit.once('m:wicker', () => new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide }));
  const r = W / 2 - 0.03;
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, 0.3, 20, 1, true), weave).translateY(0.15));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 24), kit.paint('#8a6238'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3;
  g.add(cyl(r * 0.85, r * 0.85, 0.01, weave, 0, 0.005, 0, 20), rim);
  const rnd = seeded(77);
  const paper = ['#fbf8f0', '#fff3c4', '#ffd1c7', '#c9e2f7', '#fbf8f0'];
  const ball = new THREE.IcosahedronGeometry(0.055, 1);
  for (let i = 0; i < 11; i++) {
    const inside = i < 8;
    const a = rnd() * Math.PI * 2, d = inside ? rnd() * r * 0.6 : r + 0.08 + rnd() * 0.12;
    const s = new THREE.Mesh(ball, kit.paint(paper[i % paper.length], 0.95));
    s.position.set(Math.cos(a) * d, inside ? 0.27 + rnd() * 0.08 : 0.05, Math.sin(a) * d);
    s.rotation.set(rnd() * 3, rnd() * 3, 0);
    g.add(s);
  }
}

function kidDesk({ W, D, g, kit }: Piece) {
  // 낮은 책상과 둥근 의자 둘, 위에 그림 종이와 크레파스
  const birch = kit.paint('#e7cfa6', 0.6);
  const dz = -D / 2 + 0.27;
  g.add(box(W, 0.035, 0.52, birch, 0, 0.5, dz));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.025, 0.025, 0.49, kit.paint('#7fd1b9', 0.6), sx * (W / 2 - 0.06), 0.245, dz + sz * 0.2, 10));
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), artMat(kit, 2));
  onFloor(paper, 0.52).position.set(-0.15, 0.519, dz);
  paper.rotation.z = 0.2;
  const paper2 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), artMat(kit, 3));
  onFloor(paper2, 0.52).position.set(0.25, 0.5195, dz + 0.04);
  paper2.rotation.z = -0.15;
  g.add(paper, paper2);
  ['#e2553f', '#3d7fd1', '#ffd23f', '#5fb85a'].forEach((col, i) => g.add(cyl(0.007, 0.007, 0.09, kit.paint(col, 0.6), 0.02 + i * 0.03, 0.525, dz + 0.12, 6).rotateZ(Math.PI / 2).rotateX(i * 0.3)));
  const seats = ['#f497a8', '#8ab6f9'];
  [-1, 1].forEach((sx, i) => {
    const x = sx * (W / 4), z = D / 2 - 0.16;
    g.add(cyl(0.14, 0.13, 0.04, kit.paint(seats[i], 0.8), x, 0.3, z, 18), cyl(0.03, 0.04, 0.28, birch, x, 0.14, z, 10));
  });
}

function bunting({ W, g, kit, env, f }: Piece) {
  // 천장 아래 축 늘어진 줄에 세모 깃발: 깃발 전부를 한 기하(꼭짓점 색)로 묶어 한 번에 그린다
  const top = env.ceilingAt(f) - 0.22, sag = 0.3;
  const yAt = (t: number) => top - sag * (1 - (2 * t - 1) ** 2);
  const cols = ['#e2553f', '#ffd166', '#7fd1b9', '#8ab6f9', '#f497a8', '#b39ddb'].map((c) => new THREE.Color(c));
  const n = Math.max(4, Math.floor(W / 0.26));
  const pos: number[] = [], col: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.12) / n, t1 = (i + 0.88) / n, tm = (t0 + t1) / 2;
    const x0 = -W / 2 + t0 * W, x1 = -W / 2 + t1 * W;
    pos.push(x0, yAt(t0), 0, x1, yAt(t1), 0, (x0 + x1) / 2, yAt(tm) - 0.17, 0);
    const c = cols[i % cols.length];
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const flags = new THREE.Mesh(geo, kit.once('m:bunting', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })));
  const cord: number[] = [];
  for (let i = 0; i <= 24; i++) cord.push(-W / 2 + (i / 24) * W, yAt(i / 24), 0);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cord, 3)),
    kit.once('l:cord', () => new THREE.LineBasicMaterial({ color: '#6b5a48' })),
  );
  g.add(flags, line);
}

function globeLantern({ g, kit, addLight, env, f }: Piece) {
  // 둥근 종이 등: 천장에서 끈으로 내려온 한지 공, 따뜻한 점광 하나
  const top = env.ceilingAt(f);
  const y = top - 0.62;
  g.add(cyl(0.004, 0.004, top - y - 0.2, kit.paint('#e8e2d4'), 0, (top + y + 0.2) / 2, 0, 4));
  g.add(sph(0.2, kit.glow('#fff1d8', 0.9), 0, y, 0, 1, 0.92, 1, 20));
  const rib = kit.paint('#e9dcc2', 0.9);
  for (const k of [-0.6, 0, 0.6]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2 * Math.cos(k * 0.9), 0.004, 4, 28), rib);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 0.2 * Math.sin(k * 0.9) * 0.92;
    g.add(ring);
  }
  addLight('#ffe2b0', 6, 6.5, 0, y - 0.1, 0);
}

function bookWall({ W, D, g, m, kit, env, f }: Piece) {
  // 벽 가득 책장: 판재는 상자 몇 개, 책은 색이 다른 인스턴스 하나(휴대폰에서도 그리기 한 번)
  const H = Math.min(2.3, env.ceilingAt(f) - 0.18), shelves = 6, sh = (H - 0.06) / shelves;
  g.add(box(W, H, 0.02, m.walnut, 0, H / 2, -D / 2 + 0.01), box(W, 0.05, D, m.walnut, 0, H - 0.025, 0));
  for (let s = 0; s <= shelves - 1; s++) g.add(box(W, 0.03, D, m.walnut, 0, 0.06 + s * sh, 0));
  const posts = Math.max(1, Math.round(W / 0.9));
  for (let i = 0; i <= posts; i++) g.add(box(0.035, H, D, m.walnut, -W / 2 + (i * W) / posts + (i === 0 ? 0.017 : i === posts ? -0.017 : 0), H / 2, 0));
  const rnd = seeded(spotHash(f) + 11);
  const tones = [...FLOOR1.books, '#9b8b6e', '#44506a', '#a05a3c', '#d8c9a8', '#2e2a26'];
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), kit.paint('#ffffff', 0.85), Math.ceil((W / 0.03) * shelves));
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), e = new THREE.Euler();
  let n = 0;
  const put = (x: number, y: number, z: number, w: number, h: number, d: number, tilt: number) => {
    if (n >= inst.count) return;
    q.setFromEuler(e.set(0, 0, tilt));
    mtx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d));
    inst.setMatrixAt(n, mtx);
    inst.setColorAt(n, c.set(tones[Math.floor(rnd() * tones.length)]));
    n++;
  };
  for (let s = 0; s < shelves; s++) {
    const y0 = 0.075 + s * sh, room = sh - 0.05;
    let x = -W / 2 + 0.05;
    while (x < W / 2 - 0.08) {
      const r = rnd();
      if (r < 0.06) {
        for (let k = 0; k < 3; k++) put(x + 0.11, y0 + 0.02 + k * 0.04, 0, 0.2, 0.035, D * 0.7, 0); // 눕힌 책 더미
        x += 0.26;
      } else if (r < 0.1) x += 0.12 + rnd() * 0.15; // 빈자리
      else {
        const bw = 0.025 + rnd() * 0.035, bh = Math.min(room, 0.2 + rnd() * 0.12);
        const tilt = rnd() > 0.95 ? 0.2 : 0;
        put(x + bw / 2, y0 + bh / 2, 0.02, bw, bh, D * (0.6 + rnd() * 0.2), tilt);
        x += bw + 0.004;
      }
    }
  }
  inst.count = n;
  g.add(inst);
}

/** 아홉 지식 서랍 색(생각 지도 방의 서랍장·카드 보드가 같이 쓴다) */
const NINE = ['#c7604a', '#d9a441', '#8aa65a', '#4f8f88', '#4f73a8', '#7a5cc7', '#c4628f', '#8c6d3f', '#5e6670'];

function corkBoard({ W, g, m, kit }: Piece) {
  // 코르크 보드: 아홉 색 카드를 압정으로 꽂고 붉은 실로 잇는다(카드·압정은 각각 인스턴스 하나)
  const map = kit.tex('cork', 128, 128, (c, w, h) => {
    c.fillStyle = '#c39a6b';
    c.fillRect(0, 0, w, h);
    const rnd = seeded(5);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = rnd() > 0.5 ? 'rgba(90,55,25,0.25)' : 'rgba(255,230,190,0.2)';
      c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  });
  const cork = kit.once('m:cork', () => new THREE.MeshStandardMaterial({ map, roughness: 1 }));
  const y0 = 0.85, y1 = 2.15, H = y1 - y0, yc = (y0 + y1) / 2;
  const board = new THREE.Mesh(tiledPlane(W, H, 0.45, 0.45), cork);
  board.position.set(0, yc, 0.012);
  g.add(box(W, H, 0.02, m.walnut, 0, yc, 0), board);
  for (const [w, h, x, y] of [[W + 0.06, 0.04, 0, y1], [W + 0.06, 0.04, 0, y0], [0.04, H, -W / 2, yc], [0.04, H, W / 2, yc]]) g.add(box(w, h, 0.05, m.walnut, x, y, 0.01));
  const rnd = seeded(19);
  const hubs = [[-0.35, 0.25], [0.05, -0.2], [0.35, 0.22]].map(([u, v]) => [u * W, yc + v * H] as const);
  const cards: Array<{ x: number; y: number; big: boolean; k: number }> = hubs.map(([x, y], i) => ({ x, y, big: true, k: i * 3 }));
  hubs.forEach(([hx, hy], i) => {
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2 + rnd() * 0.8 + i;
      cards.push({ x: Math.max(-W / 2 + 0.12, Math.min(W / 2 - 0.12, hx + Math.cos(a) * (0.28 + rnd() * 0.12))), y: Math.max(y0 + 0.1, Math.min(y1 - 0.1, hy + Math.sin(a) * 0.24)), big: false, k: i * 3 + (j % 3) });
    }
  });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const cardInst = new THREE.InstancedMesh(geo, kit.paint('#ffffff', 0.9), cards.length);
  const pinInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), kit.paint('#d8443a', 0.4), cards.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), e = new THREE.Euler();
  cards.forEach((cd, i) => {
    q.setFromEuler(e.set(0, 0, (rnd() - 0.5) * 0.25));
    mtx.compose(new THREE.Vector3(cd.x, cd.y, 0.02), q, new THREE.Vector3(cd.big ? 0.2 : 0.13, cd.big ? 0.13 : 0.09, 0.004));
    cardInst.setMatrixAt(i, mtx);
    cardInst.setColorAt(i, col.set(NINE[cd.k % NINE.length]).lerp(new THREE.Color('#ffffff'), cd.big ? 0 : 0.2));
    pinInst.setMatrixAt(i, mtx.makeTranslation(cd.x, cd.y + (cd.big ? 0.05 : 0.035), 0.03));
  });
  const thread: number[] = [];
  const pinAt = (cd: (typeof cards)[number]) => [cd.x, cd.y + (cd.big ? 0.05 : 0.035), 0.031];
  hubs.forEach((_, i) => {
    for (let j = 0; j < 4; j++) thread.push(...pinAt(cards[i]), ...pinAt(cards[3 + i * 4 + j]));
    if (i > 0) thread.push(...pinAt(cards[i - 1]), ...pinAt(cards[i]));
  });
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(thread, 3)),
    kit.once('l:thread', () => new THREE.LineBasicMaterial({ color: '#b0302a' })),
  );
  g.add(cardInst, pinInst, lines);
}

function drawers9({ W, D, g, m, kit }: Piece) {
  // 아홉 칸 서랍장: 색이 다른 서랍 앞판, 놋쇠 이름표에 100~900
  const H = 1.05, cw = (W - 0.06) / 3, ch = (H - 0.08) / 3;
  g.add(box(W, H, D - 0.02, m.walnut, 0, H / 2, -0.01), box(W + 0.03, 0.03, D + 0.01, m.walnut, 0, H + 0.015, 0));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const k = r * 3 + c, x = -W / 2 + 0.03 + (c + 0.5) * cw, y = H - 0.04 - (r + 0.5) * ch;
    g.add(box(cw - 0.025, ch - 0.025, 0.025, kit.paint(NINE[k], 0.6), x, y, D / 2 - 0.005));
    const label = kit.tex(`drawer${k}`, 64, 32, (cx, w, h) => {
      cx.fillStyle = '#d9c08a';
      cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#3a2a18';
      cx.font = 'bold 20px system-ui, sans-serif';
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillText(`${(k + 1) * 100}`, w / 2, h / 2 + 1);
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), kit.once(`m:drawer${k}`, () => new THREE.MeshStandardMaterial({ map: label, roughness: 0.4, metalness: 0.3 })));
    plate.position.set(x, y + ch * 0.22, D / 2 + 0.009);
    g.add(plate, sph(0.018, m.brass, x, y - ch * 0.12, D / 2 + 0.015));
  }
}

function chalkboard({ W, g, m, kit }: Piece) {
  // 작은 칠판: 생각이 자라는 네 단계(C → M → D → S)를 분필로 그려 두었다
  const map = kit.tex('chalk', 256, 160, (c, w, h) => {
    c.fillStyle = '#2f4a3a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(240,240,230,0.85)';
    c.fillStyle = 'rgba(240,240,230,0.9)';
    c.lineWidth = 3;
    c.font = 'bold 26px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ['C', 'M', 'D', 'S'].forEach((t, i) => {
      const x = 34 + i * 62, y = 70 + (i % 2 ? 22 : -10);
      c.beginPath();
      c.arc(x, y, 22, 0, Math.PI * 2);
      c.stroke();
      c.fillText(t, x, y + 1);
      if (i < 3) {
        c.beginPath();
        c.moveTo(x + 24, y);
        c.lineTo(x + 38, y + (i % 2 ? -14 : 14));
        c.stroke();
      }
    });
  });
  const face = kit.once('m:chalk', () => new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
  const H = Math.min(0.75, W * 0.62), yc = 1.4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, H - 0.06), face);
  board.position.set(0, yc, 0.016);
  g.add(box(W, H, 0.03, m.walnut, 0, yc, 0), board, box(W * 0.9, 0.025, 0.06, m.walnut, 0, yc - H / 2 - 0.01, 0.03));
  g.add(box(0.07, 0.012, 0.012, kit.paint('#f4f1e8'), -0.2, yc - H / 2 + 0.008, 0.04), box(0.12, 0.03, 0.05, kit.paint('#6b5a48'), 0.25, yc - H / 2 + 0.02, 0.04));
}

/** 펼친 책 한 권(가운데가 살짝 접힌 두 쪽) */
function openBook(kit: FurnitureKit, x: number, y: number, z: number, rot = 0) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = rot;
  const page = kit.paint('#f7f1e3', 0.95);
  for (const s of [-1, 1]) {
    const p = box(0.14, 0.006, 0.2, page, s * 0.07, 0.012, 0);
    p.rotation.z = -s * 0.08;
    b.add(p);
  }
  b.add(box(0.3, 0.008, 0.21, kit.paint('#6d3b2a', 0.7), 0, 0.004, 0));
  return b;
}

function readingDesk({ W, D, g, m, kit, addLight }: Piece) {
  // 창 아래 읽는 책상: 초록 갓 은행 등(따뜻한 빛), 펼친 책, 지구본, 책 더미
  g.add(box(W, 0.04, D, m.walnut, 0, 0.75, 0));
  for (const sx of [-1, 1]) g.add(box(0.36, 0.71, D - 0.06, m.walnut, sx * (W / 2 - 0.2), 0.355, 0), box(0.3, 0.012, 0.01, m.brass, sx * (W / 2 - 0.2), 0.55, D / 2 - 0.025));
  const lx = -W / 2 + 0.22, lz = -D / 2 + 0.16;
  g.add(cyl(0.07, 0.08, 0.03, m.brass, lx, 0.785, lz, 16), cyl(0.008, 0.008, 0.3, m.brass, lx, 0.93, lz, 6));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 16, 1, false, 0, Math.PI), kit.glow('#2f7d4f', 0.35));
  shade.rotation.set(0, 0, Math.PI / 2);
  shade.position.set(lx, 1.07, lz + 0.06);
  g.add(shade);
  addLight('#ffd49a', 5, 4.5, lx, 0.98, lz + 0.12);
  g.add(openBook(kit, 0.05, 0.77, 0.04, 0.1));
  const gx = W / 2 - 0.2;
  g.add(cyl(0.05, 0.06, 0.02, m.walnut, gx, 0.78, lz, 14), cyl(0.006, 0.006, 0.12, m.brass, gx, 0.84, lz, 6));
  g.add(sph(0.1, kit.paint('#4f73a8', 0.5), gx, 0.98, lz, 1, 1, 1, 18), sph(0.07, kit.paint('#8aa65a', 0.7), gx + 0.04, 1.0, lz + 0.03, 1, 0.8, 0.5, 10));
  ['#7a6a58', '#3e5b47', '#b98a4a'].forEach((col, i) => g.add(box(0.24 - i * 0.02, 0.04, 0.17, kit.paint(col, 0.85), gx - 0.32, 0.79 + i * 0.04, lz + 0.02).rotateY(i * 0.15)));
}

function chair({ W, D, g, kit, f }: Piece) {
  // 나무 의자: 앞(+z)이 앉는 사람이 보는 쪽, 등받이는 뒤(-z)
  const wood = kit.paint('#6e4630', 0.6);
  const seat = kit.paint(spotHash(f) % 2 ? '#2f5a46' : '#b5523b', 0.9);
  g.add(box(W, 0.04, D, wood, 0, 0.44, 0), box(W - 0.04, 0.03, D - 0.04, seat, 0, 0.475, 0.01));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.017, 0.017, 0.44, wood, sx * (W / 2 - 0.035), 0.22, sz * (D / 2 - 0.035), 8));
  for (const sx of [-1, 1]) g.add(box(0.035, 0.5, 0.035, wood, sx * (W / 2 - 0.035), 0.71, -D / 2 + 0.02));
  g.add(box(W, 0.07, 0.025, wood, 0, 0.92, -D / 2 + 0.02), box(W, 0.05, 0.02, wood, 0, 0.72, -D / 2 + 0.02));
}

function sentenceLine({ W, g, kit }: Piece) {
  // 문장 종이가 걸리는 긴 줄 둘: 빨래집게로 집은 종이(종이·집게는 각각 인스턴스 하나)
  const map = kit.tex('handwriting', 96, 128, (c, w, h) => {
    c.fillStyle = '#fbf6ea';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(60,50,40,0.5)';
    c.lineWidth = 1.4;
    const rnd = seeded(3);
    for (let y = 22; y < h - 26; y += 11) {
      c.beginPath();
      let x = 10;
      c.moveTo(x, y);
      while (x < w - 12 - rnd() * 18) {
        x += 3 + rnd() * 4;
        c.lineTo(x, y + (rnd() - 0.5) * 4);
      }
      c.stroke();
    }
    c.fillStyle = 'rgba(120,80,50,0.55)';
    c.fillRect(w - 40, h - 18, 28, 3); // 출처 자리
  });
  const sheetMat = kit.once('m:handwriting', () => new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide }));
  const rows = [1.98, 1.4], sag = 0.08, per = 0.38;
  const n = Math.max(2, Math.floor(W / per));
  const sheets = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.27), sheetMat, rows.length * n);
  const pegs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.05, 0.012), kit.paint('#d8b98a', 0.7), rows.length * n);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const rnd = seeded(23);
  const cords: number[] = [];
  rows.forEach((y, r) => {
    const yAt = (x: number) => y - sag * (1 - ((2 * (x + W / 2)) / W - 1) ** 2);
    for (let i = 0; i < 20; i++) cords.push(-W / 2 + (i * W) / 20, yAt(-W / 2 + (i * W) / 20), 0.02, -W / 2 + ((i + 1) * W) / 20, yAt(-W / 2 + ((i + 1) * W) / 20), 0.02);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5 + (r ? 0.5 : 0)) * (W / (n + (r ? 0.5 : 0)));
      const top = yAt(x);
      q.setFromEuler(e.set(0, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.12));
      sheets.setMatrixAt(r * n + i, mtx.compose(new THREE.Vector3(x, top - 0.145, 0.03), q, one));
      pegs.setMatrixAt(r * n + i, mtx.makeTranslation(x, top - 0.005, 0.03));
    }
  });
  const cord = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cords, 3)),
    kit.once('l:cord', () => new THREE.LineBasicMaterial({ color: '#6b5a48' })),
  );
  g.add(sheets, pegs, cord);
  for (const x of [-W / 2, W / 2]) for (const y of rows) g.add(cyl(0.012, 0.012, 0.04, kit.paint('#b08d57', 0.35, 0.8), x, y, 0.01, 8).rotateX(Math.PI / 2));
}

function manuscriptDesk({ W, D, g, kit, addLight }: Piece) {
  // 원고지 책상: 밝은 참나무 판, 원고지 두 장, 만년필과 잉크병, 작은 스탠드(따뜻한 빛), 책 몇 권
  const oak = kit.paint('#c79a66', 0.55);
  g.add(box(W, 0.04, D, oak, 0, 0.74, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.025, 0.018, 0.72, oak, sx * (W / 2 - 0.06), 0.36, sz * (D / 2 - 0.06), 10));
  const map = kit.tex('wongoji', 200, 280, (c, w, h) => {
    c.fillStyle = '#fbf6ea';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(176,74,58,0.65)';
    c.lineWidth = 1;
    const cols = 10, rows = 14, s = (w - 20) / cols;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) c.strokeRect(10 + k * s, 14 + r * (s + 4), s, s);
    c.fillStyle = 'rgba(40,40,60,0.65)';
    for (let k = 0; k < 7; k++) c.fillRect(10 + k * s + s * 0.25, 14 + s * 0.3, s * 0.5, s * 0.4); // 첫 줄에 적은 글자 자리
  });
  const sheet = kit.once('m:wongoji', () => new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
  [[-0.12, 0.05, 0.12], [0.16, -0.02, -0.08]].forEach(([x, z, r]) => {
    const p = onFloor(new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.35), sheet), 0.762 + (x > 0 ? 0.001 : 0));
    p.position.x = x;
    p.position.z = z;
    p.rotation.z = r;
    g.add(p);
  });
  const pen = cyl(0.007, 0.007, 0.14, kit.paint('#1c1c22', 0.3), 0.33, 0.77, 0.12, 8).rotateZ(Math.PI / 2);
  pen.rotation.y = 0.5;
  g.add(pen, box(0.05, 0.05, 0.05, kit.paint('#24345a', 0.2), 0.42, 0.785, -0.12), cyl(0.014, 0.014, 0.02, kit.paint('#1c1c22'), 0.42, 0.82, -0.12, 8));
  const lx = -W / 2 + 0.18, lz = -D / 2 + 0.14;
  g.add(cyl(0.06, 0.07, 0.025, kit.paint('#2f3d6b', 0.4), lx, 0.772, lz, 14));
  const arm = cyl(0.008, 0.008, 0.36, kit.paint('#2f3d6b', 0.4), lx + 0.06, 0.93, lz + 0.03, 6);
  arm.rotation.z = -0.35;
  const shadeMat = kit.once('m:deskShade', () => std('#2f3d6b', { roughness: 0.4, side: THREE.DoubleSide }));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 16, 1, true), shadeMat);
  shade.position.set(lx + 0.14, 1.08, lz + 0.05);
  g.add(arm, shade, sph(0.025, kit.glow('#fff1d8', 1.2), lx + 0.14, 1.05, lz + 0.05));
  addLight('#ffd9a6', 4.5, 4, lx + 0.14, 1.0, lz + 0.1);
  ['#7a6a58', '#5b2f2f', '#3e5b47', '#d8c9a8'].forEach((col, i) => g.add(box(0.03 + i * 0.004, 0.24 - i * 0.02, 0.17, kit.paint(col, 0.85), W / 2 - 0.12 - i * 0.04, 0.88 - i * 0.01, -D / 2 + 0.12)));
}

function sheerCurtain({ W, g, kit, env, f }: Piece) {
  // 비치는 커튼: 주름진 얇은 천과 놋쇠 봉
  const top = env.ceilingAt(f) - 0.12, H = top - 0.06;
  const geo = new THREE.PlaneGeometry(W, H, 24, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / W) * Math.PI * 9) * 0.035);
  geo.computeVertexNormals();
  const cloth = kit.once('m:sheer', () => new THREE.MeshStandardMaterial({
    color: '#fbf6ea', emissive: '#fff4dc', emissiveIntensity: 0.18, transparent: true, opacity: 0.6, roughness: 1, side: THREE.DoubleSide, depthWrite: false,
  }));
  const c = new THREE.Mesh(geo, cloth);
  c.position.y = 0.06 + H / 2;
  g.add(c, cyl(0.012, 0.012, W + 0.12, kit.paint('#b08d57', 0.35, 0.8), 0, top + 0.03, 0, 8).rotateZ(Math.PI / 2));
}

function plant({ W, g, kit, f }: Piece) {
  // 화분: 테라코타 또는 흰 도기, 줄기 따라 올라가는 넓은 잎
  const potCol = spotHash(f) % 2 ? '#c06a43' : '#efe9de';
  const r = Math.min(0.17, W / 2 - 0.02);
  g.add(cyl(r, r * 0.8, 0.32, kit.paint(potCol, 0.8), 0, 0.16, 0, 18), cyl(r * 0.92, r * 0.92, 0.01, kit.paint('#3b2a1f', 1), 0, 0.31, 0, 18));
  g.add(cyl(0.012, 0.016, 0.7, kit.paint('#5a4630', 0.8), 0, 0.65, 0, 6));
  const leaves = [kit.paint('#3f6b3a', 0.7), kit.paint('#5a8a4a', 0.7)];
  const rnd = seeded(spotHash(f) + 5);
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4 + rnd() * 0.4, y = 0.45 + (i / 10) * 0.55;
    const leaf = sph(0.11, leaves[i % 2], Math.cos(a) * 0.11, y, Math.sin(a) * 0.11, 1, 0.22, 0.6, 10);
    leaf.rotation.set(0.3 * Math.sin(a), -a, 0.5);
    g.add(leaf);
  }
}

function windowSeat({ W, D, g, m, kit }: Piece) {
  // 창 아래 걸터앉는 자리: 나무 받침, 긴 방석, 기대는 쿠션 셋
  g.add(box(W, 0.36, D, m.walnut, 0, 0.18, 0), box(W - 0.04, 0.08, D - 0.04, kit.paint('#d9c7a3', 0.95), 0, 0.4, 0));
  ['#9fb3a5', '#e8b07a', '#c9d6e3'].forEach((col, i) => {
    const p = box(0.36, 0.3, 0.1, kit.paint(col, 0.95), -W / 2 + 0.35 + i * (W - 0.7) / 2, 0.58, -D / 2 + 0.1);
    p.rotation.set(-0.25, (i - 1) * 0.15, (i - 1) * 0.06);
    g.add(p);
  });
}

function toyChest({ W, D, g, kit, f }: Piece) {
  // 장난감 상자: 밝게 칠한 나무 상자, 뒤 경첩으로 젖혀 둔 뚜껑, 위로 삐죽 나온 소품(TOY_SHELF 차례로)
  const H = 0.48, t = 0.03;
  const body = kit.paint('#3d7fd1', 0.7), trim = kit.paint('#ffd166', 0.6), inner = kit.paint('#2b5fa3', 0.85);
  g.add(box(W, H, t, body, 0, H / 2, D / 2 - t / 2), box(W, H, t, body, 0, H / 2, -D / 2 + t / 2));
  for (const sx of [-1, 1]) g.add(box(t, H, D - 2 * t, body, sx * (W / 2 - t / 2), H / 2, 0));
  g.add(box(W - 2 * t, 0.02, D - 2 * t, inner, 0, H - 0.13, 0)); // 속을 채운 높이(소품이 여기 얹힌다)
  g.add(box(W + 0.012, 0.045, D + 0.012, trim, 0, H - 0.022, 0), box(W + 0.012, 0.05, D + 0.012, trim, 0, 0.025, 0));
  g.add(cyl(0.085, 0.085, 0.012, trim, 0, H / 2, D / 2 + 0.006, 20).rotateX(Math.PI / 2));
  const hinge = new THREE.Group();
  hinge.position.set(0, H, -D / 2 + 0.045);
  hinge.rotation.x = -1.5; // 거의 곧추세운 뚜껑. 바깥면은 벽 쪽, 방에서는 노란 띠를 두른 안쪽 면이 보인다
  hinge.add(box(W + 0.01, 0.035, D, body, 0, 0.018, D / 2), box(W * 0.6, 0.012, 0.05, trim, 0, -0.006, D * 0.8));
  g.add(hinge);
  const start = spotHash(f) + 3;
  for (let i = 0; i < 4; i++) {
    const item = TOY_SHELF[(start + i * 2) % TOY_SHELF.length];
    const toyMesh = toy(item.shape, item.color, kit);
    toyMesh.position.set(-W / 2 + (i + 0.5) * (W / 4), H - 0.12, i % 2 ? 0.06 : -0.07);
    toyMesh.rotation.set(i % 2 ? 0.25 : -0.2, (i - 1.5) * 0.6, i % 3 ? 0.15 : -0.1);
    toyMesh.scale.setScalar(1.45);
    g.add(toyMesh);
  }
}

function blockTower({ W, D, g, kit, f }: Piece) {
  // 블록 탑: 색 나무 블록을 엇갈리게 쌓고 맨 위는 세모 지붕, 발치에 흩어진 블록 몇 개
  const cols = ['#e2553f', '#ffd166', '#3d7fd1', '#5fb85a', '#f497a8', '#ff8a3d', '#7a5cc7'];
  const rnd = seeded(spotHash(f) + 11);
  const s = Math.min(W, D) * 0.34; // 여섯 단에 지붕까지 어린아이 키 남짓(약 1m)
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const mat = kit.paint(cols[(i + spotHash(f)) % cols.length], 0.6);
    const round = i % 3 === 2;
    const h = round ? s * 0.9 : s;
    const piece = round ? cyl(s * 0.5, s * 0.5, h, mat, 0, 0, 0, 16) : box(s, h, s, mat);
    piece.position.set((rnd() - 0.5) * 0.04, y + h / 2, (rnd() - 0.5) * 0.04);
    piece.rotation.y = (rnd() - 0.5) * 0.7;
    g.add(piece);
    y += h;
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(s * 0.72, s * 1.1, 4), kit.paint('#e2553f', 0.6));
  roof.position.set(0, y + s * 0.55, 0);
  roof.rotation.y = Math.PI / 4 + (rnd() - 0.5) * 0.4;
  g.add(roof);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2, r = s * 0.95 + rnd() * s * 0.4;
    const bl = box(s * 0.8, s * 0.8, s * 0.8, kit.paint(cols[(i * 3 + 1) % cols.length], 0.6), Math.cos(a) * r, s * 0.4, Math.sin(a) * r);
    bl.rotation.y = rnd() * Math.PI;
    g.add(bl);
  }
}

function playTent({ W, D, g, kit }: Piece) {
  // 작은 놀이 텐트: 줄무늬 천 원뿔(앞쪽이 열림), 꼭대기에서 엇갈린 막대 다섯, 깃발 하나, 안에 둥근 깔개와 쿠션
  const R = Math.min(W, D) / 2 - 0.03, H = 1.45, gap = 0.95;
  const map = kit.tex('tentStripes', 256, 32, (c, w, h) => {
    const cols = ['#f497a8', '#fff6e2', '#8ab6f9', '#fff6e2', '#ffd166', '#fff6e2', '#7fd1b9', '#fff6e2'];
    const sw = w / cols.length;
    cols.forEach((col, i) => {
      c.fillStyle = col;
      c.fillRect(i * sw, 0, sw, h);
    });
  });
  const cloth = kit.once('m:tent', () => new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide }));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(R, H, 24, 1, true, gap / 2, Math.PI * 2 - gap), cloth);
  cone.position.y = H / 2;
  g.add(cone);
  const pole = kit.paint('#d8b98a', 0.7);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 5; i++) {
    const a = gap / 2 + (i / 4) * (Math.PI * 2 - gap);
    const from = new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R);
    const to = new THREE.Vector3(-Math.sin(a) * 0.1, H + 0.16, -Math.cos(a) * 0.1);
    const dir = to.clone().sub(from);
    const stick = cyl(0.012, 0.012, dir.length(), pole, 0, 0, 0, 6);
    stick.position.copy(from).addScaledVector(dir, 0.5);
    stick.quaternion.setFromUnitVectors(up, dir.normalize());
    g.add(stick);
  }
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(0.2, -0.06);
  flagShape.lineTo(0, -0.12);
  const flagMat = kit.once('m:tentFlag', () => new THREE.MeshStandardMaterial({ color: '#e2553f', roughness: 0.8, side: THREE.DoubleSide }));
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), flagMat);
  flag.position.set(0, H + 0.2, 0);
  g.add(flag, cyl(0.006, 0.006, 0.26, pole, 0, H + 0.1, 0, 4));
  const floorMat = onFloor(new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 24), kit.paint('#b39ddb', 0.95)), 0.015);
  floorMat.receiveShadow = true;
  g.add(floorMat, box(0.34, 0.12, 0.3, kit.paint('#ffd166', 0.95), -0.08, 0.075, -R * 0.35), sph(0.09, kit.paint('#f497a8', 0.95), 0.18, 0.09, -R * 0.2, 1, 0.6, 1));
}

// ───────── 손님방: 정돈된 침대, 침대 옆 탁자와 등, 작은 옷장, 방명록 책상

function bed({ W, D, g, m, kit }: Piece) {
  // 머리판은 벽 쪽(-z), 발치(+z)에 개어 둔 담요. 하얀 시트 위 따뜻한 이불, 베개 둘
  const frame = kit.paint('#a9784f', 0.7);
  g.add(box(W, 0.26, D, frame, 0, 0.2, 0), box(W, 0.95, 0.07, frame, 0, 0.475, -D / 2 + 0.035));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.07, 0.08, 0.07, m.walnut, sx * (W / 2 - 0.05), 0.04, sz * (D / 2 - 0.05)));
  g.add(box(W - 0.06, 0.18, D - 0.1, kit.paint('#f6f1e7', 0.95), 0, 0.42, 0.02));
  g.add(box(W - 0.02, 0.06, D * 0.66, kit.paint('#e7c9a0', 0.95), 0, 0.53, D * 0.15));
  g.add(box(W - 0.02, 0.06, 0.08, kit.paint('#f6f1e7', 0.95), 0, 0.535, D * 0.15 - D * 0.33));
  for (const sx of [-1, 1]) g.add(sph(0.22, kit.paint('#fbf8f2', 0.95), sx * W * 0.24, 0.58, -D / 2 + 0.28, 1, 0.32, 0.62, 14));
  // 개어 둔 담요(세 겹 줄무늬)
  ['#8fa7b8', '#f2e6cf', '#8fa7b8'].forEach((col, i) => g.add(box(W * 0.78, 0.03, 0.34, kit.paint(col, 0.95), 0, 0.575 + i * 0.03, D / 2 - 0.3)));
}

function sideTable({ W, D, g, m, kit, addLight }: Piece) {
  // 서랍 하나 달린 작은 탁자, 천 갓 등(따뜻한 빛), 책 한 권
  g.add(box(W, 0.04, D, m.walnut, 0, 0.56, 0), box(W - 0.04, 0.4, D - 0.04, kit.paint('#b98a5e', 0.7), 0, 0.34, 0));
  g.add(box(W - 0.1, 0.12, 0.01, kit.paint('#a0744c', 0.7), 0, 0.46, D / 2 - 0.015), cyl(0.015, 0.015, 0.02, m.brass, 0, 0.46, D / 2 - 0.005, 8).rotateX(Math.PI / 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, 0.14, 0.04, m.walnut, sx * (W / 2 - 0.04), 0.07, sz * (D / 2 - 0.04)));
  const lx = -W * 0.15, lz = -D * 0.1;
  g.add(cyl(0.06, 0.07, 0.03, kit.paint('#d8cbb3', 0.6), lx, 0.595, lz), cyl(0.05, 0.05, 0.2, kit.paint('#d8cbb3', 0.6), lx, 0.71, lz, 14));
  g.add(cyl(0.08, 0.13, 0.17, kit.glow('#ffe2b0', 0.7), lx, 0.88, lz, 18));
  addLight('#ffd49a', 4, 4, lx, 0.86, lz + 0.05);
  g.add(box(0.15, 0.03, 0.21, kit.paint('#5f7f6a', 0.85), W * 0.22, 0.595, D * 0.12).rotateY(0.3));
}

function wardrobe({ W, D, g, m, kit }: Piece) {
  // 문 두 짝 옷장: 밝은 나무, 가운데 이음 선, 놋 손잡이, 위 몰딩과 받침
  const wood = kit.paint('#c79a6b', 0.7);
  g.add(box(W, 1.8, D, wood, 0, 0.98, 0), box(W + 0.04, 0.06, D + 0.04, m.walnut, 0, 1.91, 0), box(W, 0.08, D - 0.02, m.walnut, 0, 0.04, 0));
  g.add(box(0.012, 1.7, 0.01, m.walnut, 0, 0.98, D / 2 + 0.002));
  for (const sx of [-1, 1]) {
    g.add(box(W / 2 - 0.08, 1.56, 0.01, kit.paint('#d2a878', 0.7), sx * W / 4, 0.98, D / 2 + 0.003));
    g.add(cyl(0.012, 0.012, 0.16, m.brass, sx * 0.07, 1.0, D / 2 + 0.025, 8));
  }
}

function guestDesk({ W, D, g, m, kit }: Piece) {
  // 작은 책상: 펼친 방명록과 펜, 「어서 오세요」 접이 카드, 들꽃 한 송이 꽂은 병
  g.add(box(W, 0.04, D, kit.paint('#c79a6b', 0.7), 0, 0.72, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.045, 0.7, 0.045, m.walnut, sx * (W / 2 - 0.05), 0.35, sz * (D / 2 - 0.05)));
  g.add(box(W - 0.1, 0.1, 0.02, m.walnut, 0, 0.65, -D / 2 + 0.05));
  g.add(openBook(kit, -W * 0.12, 0.742, 0.03, -0.08));
  g.add(cyl(0.006, 0.006, 0.15, kit.paint('#2f4a6b', 0.4), -W * 0.12 + 0.2, 0.752, 0.06, 6).rotateZ(Math.PI / 2));
  const card = kit.tex('welcome', 256, 128, (c, w, h) => {
    c.fillStyle = '#fbf6ea';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c98b6b';
    c.lineWidth = 6;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#7a4b33';
    c.font = 'bold 40px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('어서 오세요', w / 2, h / 2);
  });
  const cardMat = kit.once('m:welcome', () => new THREE.MeshStandardMaterial({ map: card, roughness: 0.95 }));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), cardMat);
  front.position.set(W * 0.28, 0.79, 0.02);
  front.rotation.set(-0.3, -0.25, 0);
  g.add(front, box(0.2, 0.1, 0.004, m.paperCard, W * 0.28 - 0.006, 0.79, -0.03).rotateX(0.3));
  const vx = W / 2 - 0.12, vz = -D / 2 + 0.12;
  g.add(cyl(0.035, 0.045, 0.14, kit.paint('#9fc2c9', 0.2), vx, 0.81, vz, 14), cyl(0.004, 0.004, 0.18, kit.paint('#5a8a4a', 0.8), vx, 0.95, vz, 6));
  g.add(sph(0.03, kit.paint('#f0b6a0', 0.9), vx, 1.05, vz, 1, 0.7, 1, 10));
}

// ───────── 작업 차고: 작업대와 집게 등, 공구 벽, 상자 선반, 자전거, 둥근 의자

/** 두 점을 잇는 둥근 막대(자전거 뼈대·등 팔) */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const mesh = cyl(r, r, len, mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 8);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

function workbench({ W, D, g, kit, addLight }: Piece) {
  // 두꺼운 나무 상판, 각목 다리와 아래 선반(공구 상자), 한쪽 끝 바이스, 망치·나뭇조각·나사 병, 뒤쪽 집게 등
  const top = kit.paint('#c9a073', 0.75), post = kit.paint('#8a6440', 0.8), steel = kit.paint('#5e6670', 0.45, 0.6);
  g.add(box(W, 0.07, D, top, 0, 0.885, 0), box(W - 0.1, 0.03, D - 0.12, post, 0, 0.2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, 0.85, 0.08, post, sx * (W / 2 - 0.08), 0.425, sz * (D / 2 - 0.08)));
  g.add(box(W - 0.16, 0.08, 0.03, post, 0, 0.8, D / 2 - 0.06));
  g.add(box(0.42, 0.2, 0.22, kit.paint('#c7604a', 0.55), -W * 0.2, 0.315, 0), box(0.3, 0.03, 0.05, steel, -W * 0.2, 0.43, 0));
  const vx = W / 2 - 0.16;
  g.add(box(0.2, 0.1, 0.12, steel, vx, 0.97, D / 2 - 0.08), box(0.2, 0.1, 0.03, steel, vx, 0.97, D / 2 + 0.01));
  g.add(cyl(0.01, 0.01, 0.22, steel, vx, 0.93, D / 2 + 0.06, 6).rotateZ(Math.PI / 2));
  g.add(cyl(0.014, 0.014, 0.3, kit.paint('#a0744c', 0.7), -0.05, 0.935, 0.1, 8).rotateZ(Math.PI / 2), box(0.04, 0.05, 0.11, steel, 0.1, 0.935, 0.1));
  ['#e3c79a', '#d4b383'].forEach((col, i) => g.add(box(0.36, 0.035, 0.09, kit.paint(col, 0.85), -W * 0.32 + i * 0.05, 0.94 + i * 0.035, -0.02).rotateY(i * 0.3)));
  g.add(cyl(0.045, 0.045, 0.1, kit.paint('#cfe3e8', 0.15), W * 0.12, 0.97, -D / 2 + 0.14, 14));
  // 집게 등: 상판 뒤 모서리에 물린 받침, 꺾인 팔, 노란 갓(아래로 빛)
  const lx = -W / 2 + 0.3, lz = -D / 2 + 0.06;
  g.add(box(0.06, 0.08, 0.08, steel, lx, 0.93, lz));
  const elbow = new THREE.Vector3(lx + 0.05, 1.42, lz + 0.05), head = new THREE.Vector3(lx + 0.3, 1.38, lz + 0.3);
  g.add(rod(new THREE.Vector3(lx, 0.97, lz), elbow, 0.012, steel), rod(elbow, head, 0.012, steel));
  const shadeMat = kit.once('m:workShade', () => std('#e8b04a', { roughness: 0.5, side: THREE.DoubleSide }));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 18, 1, true), shadeMat);
  shade.position.copy(head).add(new THREE.Vector3(0, -0.05, 0));
  g.add(shade, sph(0.035, kit.glow('#fff1c8', 1.6), head.x, head.y - 0.1, head.z));
  addLight('#ffe7b8', 5, 4, head.x, head.y - 0.15, head.z);
}

function pegboard({ W, D, g, kit }: Piece) {
  // 벽에 붙인 구멍 판: 나무 테두리, 걸어 둔 공구(스패너·망치·톱·드라이버 넷·줄자)
  const holes = kit.tex('pegboard', 128, 128, (c, w, h) => {
    c.fillStyle = '#d9b98f';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#7a5a3a';
    for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) c.fillRect(x - 2, y - 2, 4, 4);
  });
  const H = 1.1, y0 = 1.0, z = -D / 2 + 0.02;
  const mat = kit.once('m:pegboard', () => new THREE.MeshStandardMaterial({ map: holes, roughness: 0.9 }));
  const panel = new THREE.Mesh(tiledPlane(W - 0.06, H - 0.06, 0.4, 0.4), mat);
  panel.position.set(0, y0 + H / 2, z + 0.012);
  g.add(panel, box(W, H, 0.02, kit.paint('#8a6440', 0.8), 0, y0 + H / 2, z));
  const steel = kit.paint('#8c96a0', 0.4, 0.7), red = kit.paint('#c7604a', 0.55);
  const at = (k: number) => -W / 2 + W * k;
  g.add(box(0.035, 0.32, 0.012, steel, at(0.1), y0 + 0.62, z + 0.03), box(0.08, 0.05, 0.012, steel, at(0.1), y0 + 0.8, z + 0.03));
  g.add(box(0.03, 0.3, 0.02, kit.paint('#a0744c', 0.7), at(0.22), y0 + 0.58, z + 0.035), box(0.12, 0.04, 0.035, steel, at(0.22), y0 + 0.75, z + 0.04));
  const saw = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.42, 0.02), new THREE.Vector2(0.42, 0.12), new THREE.Vector2(0, 0.06)])), steel);
  saw.position.set(at(0.32), y0 + 0.75, z + 0.03);
  g.add(saw, box(0.1, 0.1, 0.03, red, at(0.32) - 0.04, y0 + 0.78, z + 0.035));
  ['#c7604a', '#e8b04a', '#4f8f88', '#4f73a8'].forEach((col, i) => {
    const x = at(0.66) + i * 0.07;
    g.add(cyl(0.016, 0.016, 0.1, kit.paint(col, 0.5), x, y0 + 0.66, z + 0.04, 8), cyl(0.004, 0.004, 0.14, steel, x, y0 + 0.54, z + 0.04, 6));
  });
  g.add(cyl(0.06, 0.06, 0.04, kit.paint('#e8b04a', 0.5), at(0.88), y0 + 0.62, z + 0.04, 16).rotateX(Math.PI / 2));
  for (const k of [0.1, 0.22, 0.32, 0.66, 0.73, 0.8, 0.87, 0.88]) g.add(box(0.01, 0.01, 0.05, steel, at(k), y0 + 0.86, z + 0.03));
}

function boxShelf({ W, D, g, kit, f }: Piece) {
  // 금속 선반 네 칸: 골판지 상자와 색 통(이름표), 맨 위에 둘둘 만 줄
  const steel = kit.paint('#7f8a94', 0.45, 0.6);
  const H = 1.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.035, H, 0.035, steel, sx * (W / 2 - 0.02), H / 2, sz * (D / 2 - 0.02)));
  const levels = [0.08, 0.52, 0.96, 1.4, 1.78];
  for (const y of levels) g.add(box(W, 0.025, D, steel, 0, y, 0));
  const card = kit.paint('#c49a64', 0.95), tape = kit.paint('#e3d3b0', 0.9), label = kit.paint('#fbf6ea', 0.95);
  const bins = ['#4f8f88', '#e8b04a', '#4f73a8', '#c7604a'];
  const rnd = seeded(spotHash(f) + 11);
  levels.slice(0, 4).forEach((y, row) => {
    let x = -W / 2 + 0.06;
    for (let i = 0; x < W / 2 - 0.3; i++) {
      const bw = 0.26 + rnd() * 0.12, bh = 0.2 + rnd() * 0.14, bd = D - 0.08;
      const isBin = (row + i) % 3 === 1;
      g.add(box(bw, bh, bd, isBin ? kit.paint(bins[(row + i) % 4], 0.6) : card, x + bw / 2, y + 0.0125 + bh / 2, 0));
      g.add(box(0.12, 0.05, 0.004, label, x + bw / 2, y + bh * 0.6, bd / 2 + 0.003));
      if (!isBin) g.add(box(0.05, 0.004, bd, tape, x + bw / 2, y + 0.0125 + bh + 0.002, 0));
      x += bw + 0.04;
    }
  });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 20), kit.paint('#3d7fd1', 0.7)).translateY(1.83).rotateX(Math.PI / 2));
}

function bicycle({ W, g, kit }: Piece) {
  // 벽을 따라 세워 둔 자전거: 두 바퀴(바큇살 판), 초록 뼈대, 갈색 안장과 손잡이, 앞 바구니
  const R = Math.min(0.33, W / 4 - 0.02), y = R + 0.02;
  const fx = W / 2 - R - 0.04, rx = -fx;
  const tire = kit.paint('#2a2420', 0.85), steel = kit.paint('#b8c0c8', 0.35, 0.7), frame = kit.paint('#3f8a6a', 0.45, 0.2);
  for (const x of [fx, rx]) {
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.024, 8, 32), tire).translateX(x).translateY(y));
    g.add(cyl(R - 0.02, R - 0.02, 0.004, kit.once('m:spokes', () => noShadow(std('#c9d1d8', { opacity: 0.35, metalness: 0.6 }))), x, y, 0, 24).rotateX(Math.PI / 2));
    g.add(cyl(0.03, 0.03, 0.06, steel, x, y, 0, 10).rotateX(Math.PI / 2));
  }
  const v = (x: number, yy: number) => new THREE.Vector3(x, yy, 0);
  const crank = v(rx * 0.1, y), seat = v(rx * 0.32, y + 0.5), head = v(fx * 0.62, y + 0.52);
  g.add(rod(v(rx, y), crank, 0.018, frame), rod(v(rx, y), seat, 0.016, frame), rod(crank, seat, 0.02, frame));
  g.add(rod(crank, head, 0.022, frame), rod(seat, head, 0.02, frame), rod(head, v(fx, y), 0.018, frame));
  g.add(cyl(0.06, 0.06, 0.02, steel, crank.x, crank.y, 0.03, 16).rotateX(Math.PI / 2));
  g.add(rod(seat, v(seat.x - 0.03, seat.y + 0.1), 0.012, steel), box(0.24, 0.05, 0.12, kit.paint('#6d3b2a', 0.6), seat.x - 0.04, seat.y + 0.13, 0));
  const bar = v(head.x - 0.04, head.y + 0.16);
  g.add(rod(head, bar, 0.014, steel), cyl(0.012, 0.012, 0.5, steel, bar.x, bar.y, 0, 8).rotateX(Math.PI / 2));
  for (const s of [-1, 1]) g.add(cyl(0.02, 0.02, 0.1, kit.paint('#6d3b2a', 0.6), bar.x, bar.y, s * 0.24, 8).rotateX(Math.PI / 2));
  g.add(box(0.26, 0.18, 0.24, kit.paint('#c49a64', 0.95), fx * 0.86 + 0.06, head.y + 0.02, 0));
}

function stool({ W, D, g, m, kit }: Piece) {
  // 둥근 나무 의자: 살짝 벌어진 다리 넷과 발 받침 고리
  const r = Math.min(W, D) / 2;
  const legMat = kit.paint('#8a6440', 0.8);
  g.add(cyl(r, r * 0.95, 0.05, kit.paint('#c9a073', 0.7), 0, 0.62, 0, 20));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.add(rod(new THREE.Vector3(Math.cos(a) * r * 0.55, 0.6, Math.sin(a) * r * 0.55), new THREE.Vector3(Math.cos(a) * r * 0.85, 0, Math.sin(a) * r * 0.85), 0.018, legMat));
  }
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.012, 6, 24), m.brass).translateY(0.22).rotateX(Math.PI / 2));
}

/**
 * 소품 하나 안에서 같은 재질을 쓰는 상자·구·원기둥을 기하 하나로 합친다(그리기 횟수를 줄인다).
 * 인스턴스·여러 재질 메시·선은 그대로 둔다. 그룹은 아직 제자리(원점·회전 없음)라 자식 행렬만 구운다.
 */
function mergeByMaterial(g: THREE.Group) {
  g.updateMatrixWorld(true);
  const buckets = new Map<string, THREE.Mesh[]>();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    const geo = mesh.geometry;
    const key = `${(mesh.material as THREE.Material).uuid}|${geo.index ? 1 : 0}|${Object.keys(geo.attributes).sort().join(',')}`;
    buckets.set(key, [...(buckets.get(key) ?? []), mesh]);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const merged = mergeGeometries(list.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)), false);
    if (!merged) continue;
    const used = new Set<THREE.BufferGeometry>();
    for (const mesh of list) {
      mesh.removeFromParent();
      used.add(mesh.geometry);
    }
    used.forEach((geo) => geo.dispose());
    g.add(new THREE.Mesh(merged, list[0].material));
  }
}

const PIECES: Partial<Record<Furniture['kind'], (p: Piece) => void>> = {
  windowSeat, slopedCeiling, stripeWall, lightPattern, roundRug, playMat, recordShelf, piano, doubleBass, musicStand, toyShelf, wallFrames,
  targets, paperBasket, kidDesk, bunting, globeLantern, bookWall, corkBoard, drawers9, chalkboard, readingDesk, chair,
  sentenceLine, manuscriptDesk, sheerCurtain, plant, toyChest, blockTower, playTent,
  bed, sideTable, wardrobe, guestDesk, workbench, pegboard, boxShelf, bicycle, stool,
};

/** 방 장면 소품을 그룹에 그린다(모르는 종류는 빈 그룹으로 둔다) */
function roomPiece(f: Furniture, W: number, D: number, g: THREE.Group, m: FurnitureMats, addLight: AddLight, env: FurnishEnv) {
  const draw = PIECES[f.kind];
  if (!draw) return;
  draw({ f, W, D, g, m, kit: m.kit, addLight, env });
  mergeByMaterial(g);
}
