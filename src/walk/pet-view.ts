// 집 안팎을 오가는 반려동물을 그린다(일정은 pet.ts). 걷는 자세와 쉬는 자세 모형을 받아 한 번에 하나만 보인다(그리기 호출 하나).
// 모형 파일(GLB)의 약속: +Y 위, +Z 정면(걷는 자세는 가는 쪽), 맨 아래 y=0, x·z 가운데가 원점, 사람 캐릭터의 키가 1.0인 크기.
// 두 자세는 이 약속 크기로 배율을 맞춰 두어 바꿔 끼워도 머리 크기가 같다. 엔진은 사진 캐릭터 모형의 키(MODEL_H)를 곱해 세운다.
// 사람 캐릭터처럼 삼각형 1만 이하·그림 한 장·meshopt 압축이면 되고, 받는 크기는 PET_MAX_BYTES까지.
// 뼈대 없는 정적 모형이라 다리·꼬리·머리는 꼭짓점 셰이더가 걸음 박자로 움직이고(pet-gait.ts) 몸도 그 박자로 오르내린다. 앉아 있으면 다시 그리기를 청하지 않고,
// 걸어도 화면에서 반 화소 넘게 바뀔 때만 한 장씩 청한다(멀리 있으면 드물게). 화면 안이어도 벽 너머·다른 층 바닥 너머로 가려져 있으면
// 청하지 않는다(엔진이 OCCLUDE_MS마다 카메라에서 몸 세 점까지 잰다). 휴대폰은 반려동물 혼자 청하는 다시 그리기를 초당 30장으로 묶는다.
// 해 그림자는 드리우지 않는다(늘 움직여 그림자를 계속 굽게 된다): 발밑 동그란 그림자는 엔진이 다른 사람들 그림자 묶음에 함께 그린다.
// 더 있는 쉬는 자세(식빵 자세·털 고르기·눕기)는 두 자세가 보인 뒤 쉬는 틈에 하나씩 받는다. 없거나 받지 못한 자세는 앉은 자세로 쉰다.
// 친구 찾아가기: 함께 걷기에서 친구(설정의 이름)가 같은 집에 있으면 칸이 시작하기 조금 전에 엔진이 알려 준 사람들로 그 칸을 정한다
// (pet.ts). 이 화면 사람도 이어져 있고 이름이 친구이면 친구로 센다: 남의 화면이 나를 보고 하는 판단과 같게.
// 말: 누르면 「야옹」과 속마음을 띄운다(pet-talk.ts). 쉬고 있으면 그 말을 하는 동안 부른 사람 쪽으로 돌고, 새침한 말이면 고개를 돌린 쪽을 본다.
// 이 돌기는 이 화면에서만 하고, 끝나면 일정의 방향(둘러보기 포함)으로 부드럽게 돌아간다. 움직임 줄이기를 고른 손님은 둘러보기·돌기 없이 본다.
import * as THREE from 'three';
import { MODEL_GLOW, MODEL_H, dropLabel, gltfParser, makeLabel, shrinkTexture, type Label } from './avatar';
import { navReady, prepareNav } from './nav';
import {
  PET_MEOW_MS, petPlan, petPresent, petSettle, petSlot, petSpots, type PetPerson, type PetPlan, type PetState, type PetStop,
} from './pet';
import { PET_EXTRA_RESTS, petName, type PetExtraRest, type PetFriend, type PetSpec } from './pet-spec';
import { PET_TAP_FORGET_MS, petLineText, petScheduledLine, petTalkMs, petTapLine, type PetLine, type PetMood } from './pet-talk';
import type { HouseWorld, Level } from './types';
import { pawGait, type PawGait } from './pet-gait';

/** 받을 모형 파일의 상한(바이트) */
export const PET_MAX_BYTES = 2 * 1024 * 1024;
/** 이 거리(m)보다 멀면 그리지 않는다. 휴대폰은 더 가깝게 */
const FAR = 30;
const FAR_COARSE = 20;
/** 몸이 이 거리(m) 안에 있어야 눌렀을 때 반응한다. 휴대폰 3인칭은 카메라가 멀어 조금 넉넉히 */
const REACH = 3.5;
const REACH_COARSE = 4.5;
/** 누르는 자리의 여유(모형을 감싼 공의 반지름 배율): 손가락은 더 크게 */
const HIT_PAD = 1.25;
const HIT_PAD_COARSE = 1.7;
/** 키보드(E·Enter)로 부를 수 있는 거리(m) */
const POKE = 2.5;
/** 일정이 띄우는 이름표와 말풍선이 떠 있는 시간(ms). 누른 말은 글자 수에 맞춘다(petTalkMs) */
export const MEOW_MS = PET_MEOW_MS;
/** 누른 말을 돌아보는 빠르기(rad/s, 가장 빠를 때)와 따라붙는 몫(초당) */
const FACE_RATE = 5.5;
const FACE_EASE = 9;
/** 새침한 말을 할 때 부른 사람에게서 고개를 돌리는 각(rad) */
const SNUB = 1.9;
/** 이만큼(ms) 안에 다시 누르면 말을 바꾸지 않는다(빨리 눌러 글자판이 깜박이지 않게) */
const TAP_GAP_MS = 500;
/** 같은 말을 다시 하지 않으려고 기억하는 최근 말 수 */
const RECENT = 6;
/** 걸음 한 주기(두 걸음)의 길이: 걷는 모형 몸길이의 배수 */
const STRIDE = 0.9;
/** 걸을 때 몸이 오르내리는 높이(모형 키의 몫), 좌우로 기우는 각(rad), 좌우로 흔들리는 폭(모형 키의 몫) */
const BOB = 0.035;
const ROLL = 0.05;
const SHIFT = 0.015;
/** 자세를 바꿔 끼울 때 살짝 내려앉았다 펴지는 몫과 시간(ms) */
const SQUASH = 0.07;
const SQUASH_MS = 220;
/** 화면에서 이만큼(px) 넘게 바뀌어야 다시 그리기를 청한다 */
const PX = 0.5;
/** 가렸는지 다시 재는 간격(ms) */
const OCCLUDE_MS = 200;
/**
 * 휴대폰: 반려동물 때문에 청하는 다시 그리기 사이의 가장 짧은 간격(ms). 60Hz 화면에서 한 장 걸러(초당 30장). 33.3보다 조금 짧게
 * 잡는다: 프레임 간격이 조금만 흔들려도 두 장 걸러(초당 20장)로 떨어지지 않게
 */
const PHONE_GAP_MS = 28;
/** 첫 그림 뒤 모형 받기를 미루는 시간(ms): 첫 화면이 자리 잡는 동안 비켜 있는다 */
const LOAD_DELAY_MS = 1200;
/** 길 찾기 격자를 아무도 만들지 않으면 이만큼 뒤에 직접 만든다(ms) */
const NAV_FALLBACK_MS = 6000;
/** 그림 크기 상한(px). 휴대폰은 작게 */
const TEX = 1024;
const TEX_COARSE = 512;
/** 두 자세가 보인 뒤 더 있는 쉬는 자세를 받기 시작하기까지(ms). 하나씩 쉬는 틈에 받는다 */
const EXTRA_DELAY_MS = 4000;

/** 정한 칸을 세계마다 기억한다(방에 다녀와 장면을 다시 지어도 찾아가던 자리에서 이어 가게) */
const memories = new WeakMap<HouseWorld, Map<number, PetStop>>();
function memoryOf(world: HouseWorld): Map<number, PetStop> {
  let m = memories.get(world);
  if (!m) {
    m = new Map();
    memories.set(world, m);
  }
  return m;
}

export type PetViewOptions = {
  scene: THREE.Scene;
  /** 엔진이 받은 세계 그대로(길 찾기 격자의 열쇠) */
  world: HouseWorld;
  spec: PetSpec;
  coarse: boolean;
  reducedMotion: boolean;
  /** 첫 그림이 나오면 풀린다: 그 뒤에 모형을 받는다 */
  ready: Promise<void>;
  /** 셰이더를 미리 짓는 길(엔진의 compileAsync): 다 지은 뒤에 보인다 */
  prepare: (o: THREE.Object3D) => Promise<unknown>;
  /** 모습이 뒤늦게 바뀌면(모형이 왔다, 이름표가 떴다) 다시 그리기를 청한다 */
  onChange: () => void;
};

export type PetFrame = {
  /** 이 기기의 시각(ms, Date.now) */
  now: number;
  /** 지난 프레임의 카메라(거리·화면 안인지 가늠) */
  camera: THREE.Camera;
  /** 2층이 보이는가(인형의 집 보기로 위층을 걷었으면 2층의 반려동물도 숨긴다) */
  showUpper: boolean;
  /** 카메라 1m 앞 화면 1px의 길이(이름표 크기, 움직임 가늠) */
  unitsPerPx: number;
  /**
   * 카메라 자리(from)에서 점들(to)이 모두 벽·바닥에 가렸는가(하나라도 보이면 false). 엔진이 그린 벽으로 잰다. 없으면 가리지 않는 것으로 본다
   */
  hidden?: (from: THREE.Vector3, to: readonly THREE.Vector3[]) => boolean;
  /**
   * 함께 걷기로 같은 공간에 있는 사람들(걷기 이름과 받은 자리)과, 이어져 있으면 이 화면 사람의 자리(아니면 null).
   * 칸을 정할 때만 부른다(칸마다 한두 번). 없으면 친구를 보지 않는다
   */
  people?: () => { me: { x: number; z: number; level: Level } | null; others: readonly PetPerson[] };
};

export type PetView = {
  /** 매 프레임: 자리·자세를 맞춘다. 마지막으로 그린 모습과 화면에서 보이게 달라졌으면 true */
  update: (f: PetFrame) => boolean;
  /** 그린 직후: 지금 모습을 그린 것으로 적어 둔다 */
  drawn: () => void;
  /** 발밑 그림자 자리를 m에 담는다. 보이지 않으면 false */
  blob: (m: THREE.Matrix4) => boolean;
  /**
   * 광선이 닿았는가: 닿았고 몸이 가까우면 이름표와 말풍선을 잠깐 띄우고 'meow', 닿았지만 멀면 'far', 안 닿으면 null.
   * blocked(거리)가 true면 그 앞을 벽이 가린 것으로 보고 닿지 않은 것으로 친다(벽 너머를 눌러 부르지 않게)
   */
  tap: (ray: THREE.Ray, body: { x: number; z: number; level: Level }, blocked?: (dist: number) => boolean) => 'meow' | 'far' | null;
  /** 몸 곁에 있으면 이름표와 말풍선(키보드). 띄웠으면 true */
  poke: (body: { x: number; z: number; level: Level }) => boolean;
  /** 이름·시계만 바뀌었으면 바로 고치고 true. 모형이 바뀌었으면 false(새로 만든다) */
  configure: (spec: PetSpec) => boolean;
  /** 시험용: 지금 모습과 시각 t의 일정(좌표만, 이름 없음) */
  debug: () => PetDebug;
  dispose: () => void;
};

export type PetDebug = {
  loaded: boolean; planned: boolean; spots: number; visible: boolean; meow: boolean; named: boolean;
  /** 지금 말풍선의 말(떠 있을 때만), 지금 그린 방향(rad), 누른 사람 쪽으로 돌아 있는가(이 화면만) */
  line: string | null;
  yaw: number;
  facing: boolean;
  /** 다시 그리기를 청한 프레임 수, 지난 프레임에 화면(시야) 안이었는지, 그때 벽·바닥에 가렸는지(측정용) */
  asks: number;
  screen: boolean;
  occluded: boolean;
  /** 받은 더 있는 쉬는 자세, 친구 수(이름 없이), 친구에게 간 칸 수(이 화면이 정한 것), 지금 보이는 자세 모형 */
  extras: string[];
  friends: number;
  visits: number;
  form: string;
  /** 시각(ms, 서버 시각 기준)이 드는 칸의 끝 자리(정했으면 정한 것)와 친구 곁인가. 좌표만 */
  stopAt: (t: number) => { x: number; z: number; level: Level; friend: boolean; rest: string } | null;
  state: PetState | null; at: (t: number) => PetState | null;
};

type PoseMesh = { mesh: THREE.Mesh; height: number; length: number; width: number };

/** 받은 기하에 노드 변환을 구워 넣는다(위치·법선을 Float32로). 맨 아래를 y 0에 맞춘다. 이상하면 null */
function bake(src: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry | null {
  const pos = src.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count < 3) return null;
  const nor = src.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const v = new THREE.Vector3();
  const out = new Float32Array(pos.count * 3);
  let minY = Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
    if (v.y < minY) minY = v.y;
  }
  for (let i = 1; i < out.length; i += 3) out[i] -= minY;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (nor) {
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const n = new Float32Array(nor.count * 3);
    for (let i = 0; i < nor.count; i++) {
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      n[i * 3] = v.x;
      n[i * 3 + 1] = v.y;
      n[i * 3 + 2] = v.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  }
  const uv = src.getAttribute('uv');
  if (uv) g.setAttribute('uv', uv);
  if (src.index) g.setIndex(src.index);
  if (!nor) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** 모형 하나를 받아 기하와 그림으로. 없거나 약속과 다르면 null(받다가 끊긴 것은 던진다) */
async function loadPose(url: string, maxTex: number): Promise<{ geometry: THREE.BufferGeometry; texture: THREE.Texture } | null> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok || Number(res.headers.get('content-length')) > PET_MAX_BYTES) {
    void res.body?.cancel().catch(() => undefined);
    return null;
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > PET_MAX_BYTES || buf.byteLength < 20) return null;
  const head = new DataView(buf);
  // GLB 머리(glTF, 판 2)
  if (head.getUint32(0, true) !== 0x46546c67 || head.getUint32(4, true) !== 2) return null;
  const root = await (await gltfParser()).parse(buf);
  root.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  root.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) return null;
  const m = mesh as THREE.Mesh;
  const geometry = bake(m.geometry, m.matrixWorld);
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial | undefined;
  const texture = mat?.map ?? null;
  // 받은 기하·재질은 쓰지 않는다(그림만 옮겨 쓴다)
  m.geometry.dispose();
  for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
  const img = texture?.image as { width?: number; height?: number } | null | undefined;
  if (!geometry || !texture || !(Number(img?.width) > 0 && Number(img?.height) > 0)) {
    geometry?.dispose();
    texture?.dispose();
    return null;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  await shrinkTexture(texture, maxTex);
  return { geometry, texture };
}

const freeTexture = (t: THREE.Texture | null | undefined) => {
  const img = t?.image as { close?: () => void } | null | undefined;
  t?.dispose();
  img?.close?.();
};

/** 쉬는 틈에 한 번(없으면 잠깐 뒤). 취소 함수를 돌려준다 */
function later(fn: () => void, timeout = 500): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => fn(), { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 16);
  return () => clearTimeout(id);
}

const keyOf = (s: PetSpec) => `${s.walk}|${s.rest ?? ''}|${s.scale ?? 1}|${PET_EXTRA_RESTS.map((r) => s.rests?.[r] ?? '').join('|')}`;
/** 설정에 있는 더 있는 쉬는 자세(일정이 고를 수 있는 자세: 모든 화면이 같은 설정을 받는다) */
const kindsOf = (s: PetSpec): PetExtraRest[] => PET_EXTRA_RESTS.filter((r) => Boolean(s.rests?.[r]));
/** 두 방향 사이의 가장 작은 각(rad, 0..π) */
function spin(a: number, b: number): number {
  const d = Math.abs(b - a) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
/** a에서 b로 가는 가장 짧은 각 차이(-π..π) */
function turnBy(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createPetView(o: PetViewOptions): PetView {
  let disposed = false;
  const key = keyOf(o.spec);
  const kinds = kindsOf(o.spec);
  let name = petName(o.spec.name);
  let clock = Number.isFinite(o.spec.clock) ? (o.spec.clock as number) : 0;
  /** 친구(이름·무게)와 이 화면 사람의 걷기 이름. 이름만 바뀌면 configure가 고친다 */
  let friends: PetFriend[] = o.spec.friends ?? [];
  let me: string | null = o.spec.me ?? null;
  const k = MODEL_H * (o.spec.scale ?? 1);
  const far = o.coarse ? FAR_COARSE : FAR;
  const reduce = o.reducedMotion;

  const root = new THREE.Group();
  root.name = 'pet';
  root.visible = false;
  const rig = new THREE.Group();
  root.add(rig);
  o.scene.add(root);

  let walk: PoseMesh | null = null;
  let rest: PoseMesh | null = null;
  /** 받은 더 있는 쉬는 자세 */
  const extras = new Map<PetExtraRest, PoseMesh>();
  /** 걷는 모형의 다리·꼬리·머리 움직임(pet-gait.ts). 다리를 찾는 동안과 찾지 못한 모형은 예전처럼 몸만 흔든다 */
  let paws: PawGait | null = null;
  const mats: THREE.Material[] = [];
  const texes: THREE.Texture[] = [];
  /** 모형이 다 왔고 셰이더도 지었다 */
  let loaded = false;
  let plan: PetPlan | null = null;
  let planning = false;
  let navAsked = false;
  /** 첫 그림이 나온 때(그 전에는 길 찾기 격자를 재촉하지 않는다) */
  let readyAt = Infinity;
  const cancels = new Set<() => void>();
  const soon = (fn: () => void, timeout?: number) => {
    const c = later(() => {
      cancels.delete(c);
      if (!disposed) fn();
    }, timeout);
    cancels.add(c);
  };

  // ───────── 모형 받기: 첫 그림이 나온 뒤 조금 있다가, 두 자세를 함께
  const build = (d: { geometry: THREE.BufferGeometry; texture: THREE.Texture }): PoseMesh => {
    const mat = new THREE.MeshStandardMaterial({
      map: d.texture, roughness: 0.85, metalness: 0,
      emissive: new THREE.Color('#ffffff'), emissiveMap: d.texture, emissiveIntensity: MODEL_GLOW,
      // 모형 파일이 양면 재질이다(귀·꼬리 같은 얇은 면)
      side: THREE.DoubleSide,
    });
    mats.push(mat);
    texes.push(d.texture);
    const mesh = new THREE.Mesh(d.geometry, mat);
    mesh.name = 'pet-pose';
    mesh.scale.setScalar(k);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    rig.add(mesh);
    const b = d.geometry.boundingBox ?? new THREE.Box3();
    return { mesh, height: (b.max.y - b.min.y) * k, length: (b.max.z - b.min.z) * k, width: (b.max.x - b.min.x) * k };
  };
  const load = async () => {
    const tex = o.coarse ? TEX_COARSE : TEX;
    const [w, r] = await Promise.all([
      loadPose(o.spec.walk, tex).catch(() => null),
      o.spec.rest && o.spec.rest !== o.spec.walk ? loadPose(o.spec.rest, tex).catch(() => null) : Promise.resolve(null),
    ]);
    if (disposed) {
      for (const d of [w, r]) { d?.geometry.dispose(); freeTexture(d?.texture); }
      return;
    }
    // 걷는 자세가 없으면 조용히 그만둔다. 쉬는 자세가 없으면 걷는 자세로 쉰다
    if (!w) {
      if (r) { r.geometry.dispose(); freeTexture(r.texture); }
      return;
    }
    walk = build(w);
    paws = pawGait(walk.mesh, k);
    rest = r ? build(r) : null;
    await Promise.resolve().then(() => o.prepare(root)).catch(() => undefined);
    if (disposed) return;
    loaded = true;
    o.onChange();
    if (kinds.length) extraTimer = setTimeout(() => soon(() => void loadExtras(kinds.slice()), 2000), EXTRA_DELAY_MS);
  };
  // 더 있는 쉬는 자세: 하나씩 쉬는 틈에 받아, 셰이더를 지은 뒤에 쓴다. 받지 못한 자세는 앉은 자세로 쉰다
  let extraTimer: ReturnType<typeof setTimeout> | undefined;
  const loadExtras = async (left: PetExtraRest[]) => {
    const kind = left.shift();
    const url = kind ? o.spec.rests?.[kind] : undefined;
    if (disposed || !kind) return;
    const d = url ? await loadPose(url, o.coarse ? TEX_COARSE : TEX).catch(() => null) : null;
    if (disposed) {
      d?.geometry.dispose();
      freeTexture(d?.texture);
      return;
    }
    if (d) {
      const m = build(d);
      await Promise.resolve().then(() => o.prepare(root)).catch(() => undefined);
      if (disposed) {
        m.mesh.geometry.dispose();
        return;
      }
      extras.set(kind, m);
      o.onChange();
    }
    if (left.length) soon(() => void loadExtras(left), 2000);
  };
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  o.ready.then(() => {
    if (disposed) return;
    readyAt = performance.now();
    loadTimer = setTimeout(() => soon(() => void load(), 2000), LOAD_DELAY_MS);
  }, () => undefined);

  // ───────── 이름표·말풍선(누르거나 일정이 띄울 때만 잠깐)
  let nameTag: Label | null = null;
  let bubble: Label | null = null;
  /** 말풍선 글자판에 그린 말(다른 말이면 새로 그린다. 그리지 못했어도 같은 말이면 다시 그려 보지 않는다) */
  let bubbleLine: PetLine | null = null;
  let meowUntil = 0;
  /** 누른 말, 이어서 부른 횟수와 마지막으로 부른 때, 최근에 한 말 */
  let tapLine: PetLine | null = null;
  let taps = 0;
  let tapAt = -Infinity;
  const recent: PetLine[] = [];
  /** 이 화면에서만 잠깐 보는 쪽(누른 사람 쪽 또는 고개를 돌린 쪽)과 그만 볼 때 */
  let face: { yaw: number; until: number } | null = null;
  /** 일정과 다른 쪽을 그리는 중이면 지금 그린 방향(rad), 일정 그대로면 null. 돌아갈 때도 이 값에서 부드럽게 따라간다 */
  let held: number | null = null;
  let heldAt = Number.NaN;
  /** 지금 그린 방향(rad) */
  let yawNow = 0;
  let upp = 0.0016;
  let tagTop = -1;
  const placeTags = (top: number) => {
    tagTop = top;
    if (nameTag) {
      nameTag.sprite.position.set(0, top, 0);
      nameTag.sprite.center.set(0.5, 0);
      nameTag.sprite.scale.set(nameTag.w * upp, nameTag.h * upp, 1);
    }
    if (bubble) {
      bubble.sprite.position.set(0, top, 0);
      const below = nameTag ? nameTag.h + 4 : 2;
      bubble.sprite.center.set(0.5, -below / bubble.h);
      bubble.sprite.scale.set(bubble.w * upp, bubble.h * upp, 1);
    }
  };
  /** 누른 말풍선이 떠 있는가, 일정이 띄운 말풍선(친구 곁에 닿았을 때, 혼자 닿았을 때 가끔: 모든 화면에서 같은 때·같은 말)이 떠 있는가 */
  const tapped = () => performance.now() < meowUntil;
  let sung = false;
  let sungLine: PetLine | null = null;
  const tagsOn = () => tapped() || sung;
  /** 이름표를 만들어 봤는가(만들지 못해도 프레임마다 다시 만들지 않게. 이름이 바뀌면 다시) */
  let nameTried = false;
  const nameLabel = () => {
    nameTried = true;
    if (!nameTag && name) {
      nameTag = makeLabel('name', name);
      // 숨겨서 붙인다(보일 때 크기를 맞추고 켠다): 크기를 맞추지 않은 글자판(기본 크기 1)이 화면을 덮지 않게
      if (nameTag) {
        nameTag.sprite.visible = false;
        root.add(nameTag.sprite);
      }
      tagTop = -1;
    }
  };
  /** 말풍선에 이 말을 그린다(같은 말이면 그대로). 보이는 것은 매 프레임이 정한다 */
  const showLine = (l: PetLine | null) => {
    if (!l || l === bubbleLine) return;
    bubbleLine = l;
    dropLabel(bubble);
    bubble = makeLabel('bubble', l.say, l.aside);
    if (bubble) {
      bubble.sprite.visible = false;
      root.add(bubble.sprite);
    }
    tagTop = -1;
  };
  /** 지금 보이는 자세가 돌아도 어색하지 않은가(서 있거나, 앉았거나, 엎드렸을 때. 누웠거나 털을 고를 때는 말만 한다) */
  const canTurn = (st: PetState) => !st.moving && ['walk', 'sit', 'loaf'].includes(formName(poseOf(st)));
  /** 쉬고 있으면 말하는 동안 부른 사람 쪽(새침한 말이면 고개를 돌린 쪽)을 본다. 이 화면에서만 */
  const turnTo = (body: { x: number; z: number }, mood: PetMood, until: number) => {
    const st = cur;
    if (reduce || !st || !canTurn(st)) return;
    const toward = Math.atan2(body.x - st.x, body.z - st.z);
    let yaw = toward;
    if (mood === 'cold') {
      // 지금 보는 쪽에서 덜 도는 쪽으로 고개를 돌린다
      const a = toward + SNUB, b = toward - SNUB;
      yaw = Math.abs(turnBy(yawNow, a)) <= Math.abs(turnBy(yawNow, b)) ? a : b;
    }
    face = { yaw, until };
  };
  const meow = (body: { x: number; z: number }) => {
    const now = performance.now();
    if (now - tapAt < TAP_GAP_MS && tapped()) return;
    taps = now - tapAt < PET_TAP_FORGET_MS ? taps + 1 : 1;
    tapAt = now;
    const { line, mood } = petTapLine(taps, Math.random, recent);
    recent.push(line);
    if (recent.length > RECENT) recent.shift();
    tapLine = line;
    meowUntil = now + petTalkMs(line);
    turnTo(body, mood, meowUntil);
    o.onChange();
  };

  // ───────── 칸 정하기(pet.ts petSettle): 지난 칸·지금 칸은 아직 안 정했으면 굳히고(지금 칸은 시작한 지 얼마 안 됐으면 지금 사람들로),
  // 다음 칸은 시작하기 조금 전에 지금 사람들로 정해 쉬는 틈에 길을 미리 찾는다
  /** 같은 집에 있는 친구(이름 차례). 친구가 없거나 엔진이 사람들을 알려 주지 않으면 null */
  const present = (f: PetFrame) => {
    if (!friends.length || !f.people) return null;
    let ppl: ReturnType<NonNullable<PetFrame['people']>>;
    try {
      ppl = f.people();
    } catch {
      return null;
    }
    const list: PetPerson[] = ppl.others.slice();
    if (me && ppl.me) list.push({ n: me, x: ppl.me.x, z: ppl.me.z, level: ppl.me.level });
    return petPresent(friends, list);
  };

  // ───────── 매 프레임
  let cur: PetState | null = null;
  let slotSeen = Number.NaN;
  let swapAt = -Infinity;
  let lastForm: PoseMesh | null = null;
  /** 이름표·말풍선이 지금 떠 있는가(누른 것이든 일정이 띄운 것이든) */
  let tagsUp = false;
  const camAt = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  /** 마지막으로 그린 모습 */
  const shown = { vis: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bob: 0, roll: 0, shift: 0, sy: 1, pose: '', form: null as PoseMesh | null, tags: false, onScreen: false };
  const now3 = { bob: 0, roll: 0, shift: 0, sy: 1 };
  /**
   * 지금 보일 자세 모형: 쉬면 그 쉬는 자세(받지 못했으면 앉은 자세, 그것도 없으면 걷는 자세). 둘러보려고 일어선 동안은 서 있는 모형인데,
   * 움직임 줄이기를 고른 손님에게는 둘러보기를 그리지 않으므로 쉬는 자세 그대로다
   */
  const poseOf = (st: PetState | null) => {
    if (!st || (st.pose !== 'rest' && !(reduce && st.resettle))) return walk;
    return (st.rest !== 'sit' ? extras.get(st.rest) : undefined) ?? rest ?? walk;
  };
  /** 지금 그릴 방향: 일정의 방향(움직임 줄이기면 둘러보기를 뺀 방향)에, 이 화면에서 잠깐 보는 쪽을 부드럽게 얹는다 */
  const facing = (st: PetState): number => {
    const base = reduce ? st.yaw - st.glance : st.yaw;
    const now = performance.now();
    // 말이 끝났거나 일정이 걷기 시작하면 그만 보고 일정의 방향으로 따라간다
    if (face && (now >= face.until || st.moving)) face = null;
    if (!face && held === null) return base;
    const dt = Number.isFinite(heldAt) ? Math.min(0.1, Math.max(0, (now - heldAt) / 1000)) : 1 / 60;
    heldAt = now;
    const from = held ?? base;
    const d = turnBy(from, face ? face.yaw : base);
    const next = from + Math.sign(d) * Math.min(Math.abs(d) * Math.min(1, FACE_EASE * dt), FACE_RATE * dt);
    if (!face && Math.abs(turnBy(next, base)) < 0.01) {
      held = null;
      heldAt = Number.NaN;
      return base;
    }
    held = next;
    return next;
  };
  const formName = (m: PoseMesh | null) => (!m ? '' : m === walk ? 'walk' : m === rest ? 'sit' : [...extras].find(([, v]) => v === m)?.[0] ?? '');

  let asks = 0;
  let screen = false;
  /** 지난번 잰 가림(OCCLUDE_MS마다)과 잰 때, 재는 몸의 세 점 */
  let occluded = false;
  let occAt = -Infinity;
  const marks = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** 마지막으로 그린 때(휴대폰의 다시 그리기 간격) */
  let drawnAt = -Infinity;
  const step = (f: PetFrame): boolean => {
    if (disposed) return false;
    if (!plan && !planning) {
      if (navReady(o.world)) {
        planning = true;
        // 갈 곳 고르기는 쉬는 틈에(실제 집은 한 번에 몇 ms)
        soon(() => {
          try {
            plan = petPlan(o.world, petSpots(o.world), { rests: kinds, memory: memoryOf(o.world) });
          } catch {
            plan = petPlan(o.world, []);
          }
          planning = false;
          o.onChange();
        });
      } else if (!navAsked && performance.now() - readyAt > NAV_FALLBACK_MS) {
        // 화면이 길 찾기 격자를 만들지 않는 경우(드물다): 걷는 사이 틈틈이 직접 만든다
        navAsked = true;
        void prepareNav(o.world);
      }
    }
    if (!loaded || !plan || !walk) return false;
    const t = f.now + clock;
    const slot = petSlot(t);
    const next = petSettle(plan, t, () => present(f));
    if (next !== null) {
      const p = plan;
      soon(() => p.prepare(next));
    }
    if (slot !== slotSeen) {
      slotSeen = slot;
      // 다음 칸의 길은 미리 찾아 둔다(칸이 바뀌는 프레임이 길 찾기로 멈추지 않게)
      const p = plan;
      soon(() => p.prepare(slot + 1));
    }
    const st = plan.at(t);
    cur = st;
    camAt.setFromMatrixPosition(f.camera.matrixWorld);
    const away = st ? Math.sqrt((st.x - camAt.x) ** 2 + (st.y - camAt.y) ** 2 + (st.z - camAt.z) ** 2) : Infinity;
    const vis = st !== null && (st.level === 1 || f.showUpper) && away < far;
    root.visible = vis;
    sung = Boolean(st?.meow);
    sungLine = sung && st ? petScheduledLine(st.talk, st.visit) : null;
    const tags = tagsOn();
    if (!tags && tagsUp) {
      tagsUp = false;
      meowUntil = 0;
      if (nameTag) nameTag.sprite.visible = false;
      if (bubble) bubble.sprite.visible = false;
    }
    if (!vis || !st) {
      screen = false;
      // 보이지 않는 동안에는 잠깐 보던 쪽을 잊는다(다시 보이면 일정의 방향)
      face = null;
      held = null;
      heldAt = Number.NaN;
      return shown.vis !== vis;
    }
    root.position.set(st.x, st.y, st.z);
    yawNow = facing(st);
    root.rotation.y = yawNow;
    const pose = poseOf(st);
    if (!pose) return false;
    if (lastForm !== pose) {
      if (lastForm !== null) swapAt = performance.now();
      lastForm = pose;
    }
    walk.mesh.visible = pose === walk;
    if (rest) rest.mesh.visible = pose === rest;
    for (const m of extras.values()) m.mesh.visible = pose === m;
    // 걸음: 걸은 거리에 맞춘 박자(어느 화면에서나 같다). 빠를수록 조금 크게
    const ph = st.moving && !reduce ? (st.dist / Math.max(0.1, walk.length * STRIDE)) * Math.PI * 2 : 0;
    const amt = st.moving && !reduce ? Math.min(1.4, 0.75 + 0.3 * st.speed) : 0;
    now3.bob = Math.abs(Math.sin(ph)) * BOB * walk.height * amt;
    now3.roll = Math.sin(ph) * ROLL * amt;
    now3.shift = Math.sin(ph) * SHIFT * walk.height * amt;
    // 다리가 있는 모형: 걸음 박자(걸은 거리)로 다리·꼬리·머리를 움직이고 몸 흔들림도 그 박자를 따른다. 쉬는 자세면 서 있는 모형으로 돌려 둔다
    paws?.step(st, pose === walk, reduce, performance.now(), now3);
    const sq = reduce ? 0 : Math.max(0, 1 - (performance.now() - swapAt) / SQUASH_MS);
    now3.sy = 1 - SQUASH * Math.sin(Math.PI * sq) * (sq > 0 ? 1 : 0);
    rig.position.set(now3.shift, now3.bob, 0);
    // 계단에서는 오르내리는 쪽으로 몸을 기울인다(로컬 +z가 앞이라 머리를 드는 쪽이 x축 음의 회전)
    rig.rotation.set(-st.pitch, 0, now3.roll);
    const sx = 1 / Math.sqrt(Math.max(0.5, now3.sy));
    rig.scale.set(sx, now3.sy, sx);
    // 이름표·말풍선: 화면에서 늘 같은 크기, 지금 자세의 머리 위
    if (tags) {
      tagsUp = true;
      if (!nameTried) nameLabel();
      // 누른 말이 일정이 띄운 말보다 먼저다
      showLine(tapped() ? tapLine : sungLine);
      if (nameTag) nameTag.sprite.visible = true;
      if (bubble) bubble.sprite.visible = true;
      const top = pose.height + 0.06;
      if (Math.abs(f.unitsPerPx - upp) > 1e-9 || top !== tagTop) {
        if (f.unitsPerPx > 0) upp = f.unitsPerPx;
        placeTags(top);
      }
    }
    // 화면 안인가(지난 프레임 카메라로 가늠)
    projView.multiplyMatrices(f.camera.projectionMatrix, f.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    sphere.center.set(st.x, st.y + pose.height / 2, st.z);
    sphere.radius = Math.max(pose.height, pose.length, pose.width) * 0.6 + 0.1;
    const onScreen = frustum.intersectsSphere(sphere);
    screen = onScreen;
    // 시야 안이어도 벽 너머·다른 층 바닥 너머면 보이지 않는다. 몸 가운데·머리 쪽·엉덩이 쪽 세 점이 모두 가렸을 때만 가린 것으로 본다
    // (조금이라도 보이면 보인다). 재는 것은 OCCLUDE_MS마다: 그사이 카메라가 움직이면 어차피 그 움직임으로 다시 그린다
    if (!onScreen || !f.hidden) occluded = false;
    else if (performance.now() - occAt >= OCCLUDE_MS) {
      occAt = performance.now();
      const fx = Math.sin(yawNow) * pose.length * 0.4, fz = Math.cos(yawNow) * pose.length * 0.4;
      marks[0].set(st.x, st.y + pose.height * 0.5, st.z);
      marks[1].set(st.x + fx, st.y + pose.height * 0.8, st.z + fz);
      marks[2].set(st.x - fx, st.y + pose.height * 0.45, st.z - fz);
      occluded = f.hidden(camAt, marks);
    }
    const seen = onScreen && !occluded;
    if (!shown.vis || shown.pose !== st.pose || shown.form !== pose || shown.tags !== tags) return true;
    // 지난번에 보이던 것이 가려지는 프레임은 한 장 더 그린다(벽 모서리에 멈춰 보이지 않게)
    if (!seen && !shown.onScreen) return false;
    // 휴대폰: 반려동물 혼자 청하는 다시 그리기는 초당 30장까지(다른 것이 그리면 그때 함께 그려진다)
    if (o.coarse && performance.now() - drawnAt < PHONE_GAP_MS) return false;
    // 화면에서 움직인 양(px): 자리·흔들림 + 돈 각(몸 반 길이) + 기울기·내려앉음(키)
    const moved = Math.sqrt((st.x - shown.x) ** 2 + (st.y - shown.y) ** 2 + (st.z - shown.z) ** 2)
      + Math.abs(now3.bob - shown.bob) + Math.abs(now3.shift - shown.shift)
      + (spin(yawNow, shown.yaw) + Math.abs(st.pitch - shown.pitch)) * Math.max(pose.length, pose.width) * 0.5
      + (Math.abs(now3.roll - shown.roll) + Math.abs(now3.sy - shown.sy)) * pose.height;
    return (moved + (paws?.change() ?? 0)) / (Math.max(0.3, away) * Math.max(1e-6, f.unitsPerPx)) > PX;
  };

  const update = (f: PetFrame) => {
    const ask = step(f);
    if (ask) asks++;
    return ask;
  };

  const drawn = () => {
    drawnAt = performance.now();
    paws?.drawn();
    shown.vis = root.visible;
    shown.tags = tagsOn();
    if (!cur) return;
    shown.x = cur.x; shown.y = cur.y; shown.z = cur.z; shown.yaw = yawNow; shown.pitch = cur.pitch; shown.pose = cur.pose; shown.form = poseOf(cur);
    shown.bob = now3.bob; shown.roll = now3.roll; shown.shift = now3.shift; shown.sy = now3.sy;
    shown.onScreen = root.visible && frustum.intersectsSphere(sphere) && !occluded;
  };

  const blobQ = new THREE.Quaternion();
  const blobP = new THREE.Vector3();
  const blobS = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const blob = (m: THREE.Matrix4) => {
    const pose = poseOf(cur);
    if (!root.visible || !cur || !pose) return false;
    // 발밑 그림자 판은 0.8m 네모: 지금 자세의 바닥 크기에 맞춰 늘인다
    blobP.set(cur.x, cur.y + 0.02, cur.z);
    blobQ.setFromAxisAngle(UP, yawNow);
    blobS.set(Math.max(0.2, pose.width * 1.35) / 0.8, 1, Math.max(0.25, pose.length * 1.2) / 0.8);
    m.compose(blobP, blobQ, blobS);
    return true;
  };

  const near = (body: { x: number; z: number; level: Level }, r: number) =>
    cur !== null && body.level === cur.level && Math.sqrt((body.x - cur.x) ** 2 + (body.z - cur.z) ** 2) <= r;
  const hitSphere = new THREE.Sphere();
  const hitAt = new THREE.Vector3();
  const tap: PetView['tap'] = (ray, body, blocked) => {
    const pose = poseOf(cur);
    if (disposed || !root.visible || !cur || !pose) return null;
    hitSphere.center.set(cur.x, cur.y + pose.height * 0.45, cur.z);
    hitSphere.radius = Math.max(pose.height, pose.length, pose.width) * 0.5 * (o.coarse ? HIT_PAD_COARSE : HIT_PAD);
    if (!ray.intersectSphere(hitSphere, hitAt)) return null;
    // 가운데까지의 거리로 본다(넉넉한 공의 앞면은 벽 앞으로 나올 수 있다)
    if (blocked?.(ray.origin.distanceTo(hitSphere.center))) return null;
    if (!near(body, o.coarse ? REACH_COARSE : REACH)) return 'far';
    meow(body);
    return 'meow';
  };
  const poke: PetView['poke'] = (body) => {
    if (disposed || !root.visible || !near(body, POKE)) return false;
    meow(body);
    return true;
  };

  return {
    update,
    drawn,
    blob,
    tap,
    poke,
    configure(spec) {
      if (keyOf(spec) !== key) return false;
      clock = Number.isFinite(spec.clock) ? (spec.clock as number) : 0;
      // 친구·내 이름은 다음에 정하는 칸부터 쓴다(이미 정한 칸은 그대로)
      friends = spec.friends ?? [];
      me = spec.me ?? null;
      const next = petName(spec.name);
      if (next !== name) {
        name = next;
        // 다음에 누를 때(또는 일정이 말풍선을 띄울 때) 새 이름으로 다시 만든다
        dropLabel(nameTag);
        nameTag = null;
        tagTop = -1;
        nameTried = false;
      }
      return true;
    },
    debug: () => ({
      loaded, planned: Boolean(plan), spots: plan?.spots.length ?? 0, visible: root.visible, meow: tagsOn(), named: Boolean(name), asks, screen, occluded,
      line: tagsOn() && bubbleLine ? petLineText(bubbleLine) : null, yaw: yawNow, facing: face !== null || held !== null,
      extras: [...extras.keys()], friends: friends.length, visits: plan?.visits() ?? 0, form: formName(poseOf(cur)),
      stopAt: (t: number) => {
        const s = plan?.stop(petSlot(t));
        return s ? { x: s.x, z: s.z, level: s.level, friend: s.friend, rest: s.rest } : null;
      },
      state: cur ? { ...cur } : null,
      at: (t: number) => plan?.at(t) ?? null,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(loadTimer);
      clearTimeout(extraTimer);
      for (const c of cancels) c();
      cancels.clear();
      dropLabel(nameTag);
      dropLabel(bubble);
      nameTag = bubble = null;
      root.removeFromParent();
      for (const p of [walk, rest, ...extras.values()]) p?.mesh.geometry.dispose();
      for (const m of mats) m.dispose();
      for (const t of texes) freeTexture(t);
      walk = rest = null;
      extras.clear();
      plan = null;
    },
  };
}
