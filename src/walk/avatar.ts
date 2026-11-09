// 걷는 사람의 귀여운 캐릭터와 몸 움직임 계산. 원시 도형(구·캡슐·원통)만 쓴다.
// 이 파일은 three 말고는 아무것도 불러오지 않는다(노드 시험에서 그대로 돈다). look.ts는 타입만 쓴다.
// 기하는 모든 캐릭터가 함께 쓰고(참조 수로 놓는다), 재질은 색마다 하나씩 모아 둔다.
// 겉모습은 두 가지: 직접 꾸민 기본 인형(머리·옷·소품) 또는 사진으로 만든 캐릭터 그림(세운 판).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterLook, DollLook } from './look';
/** 캐릭터 키(m)와 머리 지름(키의 약 40%) */
export const AVATAR_HEIGHT = 1.15;
export const HEAD_R = 0.25;
/** 머리 가운데 높이(발바닥 기준) */
const HEAD_Y = 0.86;
/** 점프: 위로 3.2m/s, 중력 9.8 → 꼭대기 약 0.52m */
export const JUMP_V = 3.2;
export const GRAVITY = 9.8;
/** 말풍선이 떠 있는 시간(ms) */
export const BUBBLE_MS = 6000;
/** 사이트 글꼴 순서 그대로(globals.css --font) */
export const LABEL_FONT = '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';

const LABEL_Y = HEAD_Y + HEAD_R + 0.07;
/** 사진 캐릭터 판: 키(m), 그림 비율(1024×1536), 이름표 높이 */
export const PHOTO_H = 1.3;
const PHOTO_W = PHOTO_H * (1024 / 1536);
const PHOTO_LABEL_Y = PHOTO_H + 0.06;

// ───────── 순수 계산(시험 대상)

/** 걸음 위상이 1초에 도는 양(rad/s). 한 바퀴 = 두 걸음. 멈추면 0, 달리면 빨라진다 */
export function gaitRate(speed: number, running: boolean): number {
  if (!(speed > 0.05)) return 0;
  const hz = 0.9 + Math.min(speed, 4.5) * 0.45 + (running ? 0.15 : 0);
  return hz * Math.PI * 2;
}

/**
 * 걸음 위상에 맞춘 3인칭 자세. amount 0..1(멈춤..걷기). 다리와 팔은 엇갈리고,
 * 두 다리가 모일 때(위상 0, π) 몸이 가장 높다. 달리면 폭이 커진다.
 */
export function gaitPose(phase: number, amount: number, running: boolean) {
  const a = Math.max(0, Math.min(1, amount));
  const s = Math.sin(phase);
  const legA = (running ? 0.85 : 0.55) * a;
  const armA = (running ? 0.8 : 0.5) * a;
  return {
    legL: s * legA, legR: -s * legA,
    armL: -s * armA, armR: s * armA,
    bob: ((1 + Math.cos(2 * phase)) / 2) * (running ? 0.05 : 0.03) * a,
    lean: (running ? 0.12 : 0.04) * a,
  };
}

/**
 * 1인칭 시선의 출렁임: 위아래 약 3cm(위아래 끝 사이), 좌우 약 1.5cm, 아주 작은 기울기(rad).
 * amount가 0이면 모두 0(멈추면 부드럽게 0으로 가는 것은 amount가 맡는다).
 */
export function headBob(phase: number, amount: number, running: boolean) {
  const a = Math.max(0, Math.min(1, amount)) * (running ? 1.35 : 1);
  if (!(a > 0)) return { y: 0, x: 0, roll: 0 };
  return { y: 0.015 * Math.cos(2 * phase) * a, x: 0.015 * Math.sin(phase) * a, roll: 0.006 * Math.sin(phase) * a };
}

/** 지수 따라가기 비율: 시정수 tau(초) 동안 dt만큼 */
export function follow(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);
}

/** a에서 b로 가는 가장 짧은 각 차이(-π..π) */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 점프 상태: 보이는 높이 h(m), 위로 속도 v(m/s), 공중 여부 */
export type Hop = { h: number; v: number; air: boolean };
export const GROUNDED: Hop = { h: 0, v: 0, air: false };

/** 점프 시작(공중이면 그대로) */
export function hopStart(s: Hop): Hop {
  return s.air ? s : { h: 0, v: JUMP_V, air: true };
}

/** 한 프레임 진행. 땅에 닿은 프레임이면 landed */
export function hopStep(s: Hop, dt: number): { hop: Hop; landed: boolean } {
  if (!s.air) return { hop: GROUNDED, landed: false };
  const v = s.v - GRAVITY * dt;
  const h = s.h + (s.v + v) * 0.5 * dt;
  if (h <= 0 && v < 0) return { hop: GROUNDED, landed: true };
  return { hop: { h, v, air: true }, landed: false };
}

/**
 * (x,z) 둘레 maxR 안에서 ok인 가장 가까운 자리. 자기 자리가 ok면 그대로.
 * 고리마다 stepR 간격으로 돌며 찾는다(가까운 고리부터, 같은 고리 안에서는 더 가까운 점).
 */
export function nearestOpen(ok: (x: number, z: number) => boolean, x: number, z: number, maxR = 1.5, stepR = 0.1): { x: number; z: number } | null {
  if (ok(x, z)) return { x, z };
  for (let r = stepR; r <= maxR + 1e-9; r += stepR) {
    const n = Math.max(8, Math.ceil((Math.PI * 2 * r) / stepR));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

// ───────── 자동 걷기(점들을 차례로). 몸을 옮기는 일은 move가 한다(화면은 물리 step 그대로)

export type PathPoint = { x: number; z: number; level: 1 | 2 };
export type PathRun = { pts: PathPoint[]; i: number; stuck: number };
type BodyLike = { x: number; z: number; level: 1 | 2 };

/** 중간 점은 이만큼(m) 다가가면 다음 점으로, 마지막 점은 더 가까이 */
const PASS_R = 0.35;
const ARRIVE_R = 0.2;
/** 이 시간(초) 넘게 제대로 못 나아가면 막힌 것이다 */
export const STUCK_S = 1;

export function startPath(pts: PathPoint[]): PathRun {
  return { pts: pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)), i: 0, stuck: 0 };
}

/**
 * 자동 걷기 한 프레임. 다음 점 쪽으로 speed로 옮기고, 바라볼 방향(yaw, 걷기 화면 규칙: 앞 = (-sin, -cos))을 돌려준다.
 * 마지막 점에 같은 층으로 닿으면 'arrive', 1초 넘게 막히면 'stuck'.
 */
export function pathStep<B extends BodyLike>(run: PathRun, body: B, dt: number, speed: number, move: (b: B, dx: number, dz: number) => B):
  { body: B; heading: number | null; done: 'arrive' | 'stuck' | null } {
  while (run.i < run.pts.length) {
    const p = run.pts[run.i];
    const last = run.i === run.pts.length - 1;
    const d = Math.hypot(p.x - body.x, p.z - body.z);
    if (last ? d <= ARRIVE_R && p.level === body.level : d <= PASS_R) run.i++;
    else break;
  }
  if (run.i >= run.pts.length) return { body, heading: null, done: 'arrive' };
  const p = run.pts[run.i];
  const dx = p.x - body.x, dz = p.z - body.z;
  const d = Math.hypot(dx, dz);
  const want = Math.min(d, speed * dt);
  if (want <= 1e-6) {
    // 같은 자리인데 층이 다르다(계단 위아래): 더 나아갈 수 없다
    run.stuck += dt;
    return { body, heading: null, done: run.stuck > STUCK_S ? 'stuck' : null };
  }
  const ux = dx / d, uz = dz / d;
  const next = move(body, ux * want, uz * want);
  const moved = Math.hypot(next.x - body.x, next.z - body.z);
  run.stuck = moved < want * 0.3 ? run.stuck + dt : 0;
  return { body: next, heading: Math.atan2(-ux, -uz), done: run.stuck > STUCK_S ? 'stuck' : null };
}

// ───────── 기본 인형의 머리(얼굴·머리카락·소품)와 다리(신발): 꼭짓점 색으로 구워 한 재질을 함께 쓴다.
// 늘 귀엽게: 크기·비율은 모두 같고 머리 모양·색·소품만 바뀐다. 얼굴 앞(눈·볼·입)은 무엇도 가리지 않는다.

const R = HEAD_R;
const EYE = '#231a16';
const MOUTH = '#7a3b34';
const BLUSH = '#f2a0a6';
const WHITE = '#ffffff';

type G = THREE.BufferGeometry;

/** 꼭짓점 색 한 가지로 칠한다(합칠 때 속성이 같도록 uv는 남긴다) */
function tint(g: G, hex: string): G {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** 두 색을 t만큼 섞는다(0 = a, 1 = b) */
function mix(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** 밝기(0..1, 사람 눈 기준) */
function luma(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** 머리 구 위 (x, y)의 앞쪽 표면 z */
const faceZ = (x: number, y: number, r = R) => Math.sqrt(Math.max(0, r * r - x * x - y * y));

const ball = (r: number, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);

/** 얼굴: 피부 구, 반짝이는 눈, 피부톤에 맞춘 볼 홍조, 작은 웃는 입 */
function face(skin: string): G[] {
  const out: G[] = [tint(new THREE.SphereGeometry(R, 28, 20), skin)];
  const blush = mix(skin, BLUSH, luma(skin) > 0.45 ? 0.55 : 0.4);
  for (const s of [-1, 1]) {
    const ex = s * 0.088, ey = -0.012;
    const ez = faceZ(ex, ey) - 0.006;
    out.push(tint(ball(0.037, 14, 10).scale(1, 1.18, 0.55).translate(ex, ey, ez), EYE));
    // 눈 반짝임(두 눈 모두 같은 쪽 위)
    out.push(tint(ball(0.0115, 8, 6).translate(ex + 0.012, ey + 0.018, ez + 0.018), WHITE));
    const cx = s * 0.148, cy = -0.072;
    out.push(tint(ball(0.046, 12, 8).scale(1, 0.66, 0.3).translate(cx, cy, faceZ(cx, cy) - 0.004), blush));
  }
  out.push(tint(new THREE.TorusGeometry(0.03, 0.0085, 6, 14, Math.PI).rotateZ(Math.PI).translate(0, -0.064, faceZ(0, -0.064) - 0.004), MOUTH));
  return out;
}

/** 이마 위 앞머리 몇 갈래(얼굴을 덮지 않게 머리선 위에만) */
function bangs(color: string): G[] {
  const out: G[] = [];
  const lobes: Array<[number, number, number]> = [[-0.13, 0.095, 0.075], [-0.055, 0.12, 0.08], [0.03, 0.118, 0.08], [0.115, 0.1, 0.072]];
  for (const [x, y, r] of lobes) {
    const z = faceZ(x, y, R * 1.02);
    out.push(tint(ball(r, 12, 8).scale(1.15, 0.72, 0.5).rotateZ(-x * 1.4).translate(x, y, z - 0.012), color));
  }
  return out;
}

/** 짧은 머리 모자(앞은 이마 위, 뒤는 목덜미까지) */
const capHair = (color: string, r = R * 1.06) => tint(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, 1.75).rotateX(-0.45), color);

/** 얼굴 뒤에 숨어 옆과 뒤로만 보이는 머리 덩어리(단발·긴 머리) */
const backVolume = (color: string) => tint(new THREE.SphereGeometry(R, 24, 16).scale(1.12, 1.0, 1.0).translate(0, -0.03, -0.045), color);

/** 곱슬: 머리 둘레에 작은 공을 고르게(피보나치 점) 붙이되 얼굴 앞은 비운다. 모자를 쓰면 정수리 공은 뺀다 */
function curls(color: string, hat: boolean): G[] {
  const out: G[] = [capHair(color, R * 1.02), backVolume(color)];
  const n = 46, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const x = Math.cos(golden * i) * rr, z = Math.sin(golden * i) * rr;
    if (y < -0.25 || (z > 0.45 && y < 0.42) || (hat && y > 0.5)) continue;
    const s = 0.068 + ((i * 7) % 5) * 0.004;
    out.push(tint(ball(s, 10, 8).translate(x * R * 1.04, y * R * 1.04 - 0.01, z * R * 1.04 - 0.02), color));
  }
  return out;
}

/** 머리 모양별 조각. 모자(hat)를 쓰면 정수리 장식(올림머리·캡 모자)은 그리지 않는다 */
function hairParts(d: DollLook, hat: boolean): G[] {
  const c = d.hairColor;
  switch (d.hair) {
    case 'bob':
      return [capHair(c), backVolume(c), ...bangs(c)];
    case 'long': {
      const out = [capHair(c), backVolume(c), ...bangs(c)];
      // 등 뒤로 내려오는 머리와 어깨 앞 양 갈래
      out.push(tint(new THREE.CapsuleGeometry(0.17, 0.2, 6, 14).scale(1.22, 1, 0.58).translate(0, -0.3, -0.1), c));
      for (const s of [-1, 1]) out.push(tint(new THREE.CapsuleGeometry(0.048, 0.16, 4, 10).translate(s * 0.205, -0.2, 0.02), c));
      return out;
    }
    case 'curly':
      return curls(c, hat);
    case 'bun': {
      const out = [capHair(c), ...bangs(c)];
      if (!hat) out.push(tint(ball(0.105, 16, 12).translate(0, R * 0.98, -0.07), c));
      return out;
    }
    case 'cap': {
      // 캡 모자는 윗옷 색, 그 아래로 짧은 옆머리. 앞머리는 모자 속이라 그리지 않는다(그리면 모자 위로 비져나온다).
      // 챙은 모자 테두리(이마 쪽 y≈0.03)에 붙인다. 다른 모자(hat)를 쓰면 캡 대신 짧은 머리 전체를 그린다
      // (옆머리 띠만 남기면 모자와 띠 사이로 정수리 살갗이 보여 머리띠처럼 보인다)
      if (hat) return [capHair(c), ...bangs(c)];
      return [
        tint(new THREE.SphereGeometry(R * 1.05, 28, 8, 0, Math.PI * 2, 1.15, 0.6).rotateX(-0.45), c),
        tint(new THREE.SphereGeometry(R * 1.09, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-0.12), d.top),
        tint(ball(0.16, 20, 8).scale(1.05, 0.11, 0.8).rotateX(0.12).translate(0, 0.045, 0.23), d.top),
        tint(ball(0.022).translate(0, R * 1.09, -0.03), d.top),
      ];
    }
    default:
      return [capHair(c), ...bangs(c)];
  }
}

const FRAME = '#2b2420';
const STRAW = '#e8cf8f';
const BOW = '#d98ca0';
const BAND = '#3a3a3a';
/** 목도리는 윗옷과 겹치지 않는 따뜻한 색 */
export const scarfColor = (top: string) => (top === '#e3c45a' ? '#b4593b' : '#e3c45a');

function accessory(d: DollLook): G[] {
  // 머리숱이 큰 모양(곱슬·단발)은 소품을 조금 밖으로
  const puff = d.hair === 'curly' ? 1.2 : d.hair === 'bob' || d.hair === 'long' ? 1.06 : 1;
  switch (d.acc) {
    case 'glasses': {
      const out: G[] = [];
      for (const s of [-1, 1]) {
        const x = s * 0.088, y = -0.012;
        out.push(tint(new THREE.TorusGeometry(0.054, 0.0075, 6, 22).rotateY(s * 0.36).translate(x, y, faceZ(x, y) + 0.016), FRAME));
      }
      out.push(tint(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6).rotateZ(Math.PI / 2).translate(0, -0.004, faceZ(0, 0) + 0.012), FRAME));
      return out;
    }
    case 'hat': {
      // 챙 넓은 밀짚모자, 띠는 윗옷 색. 뒤로 살짝 젖혀 얼굴이 보이게
      const parts = [
        tint(new THREE.CylinderGeometry(0.205, 0.235, 0.15, 24).translate(0, 0.25, 0), STRAW),
        tint(new THREE.SphereGeometry(0.205, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(0, 0.325, 0), STRAW),
        tint(new THREE.CylinderGeometry(0.238, 0.238, 0.045, 24).translate(0, 0.2, 0), d.top),
        tint(new THREE.CylinderGeometry(0.4, 0.4, 0.018, 32).translate(0, 0.18, 0), STRAW),
      ];
      return parts.map((g) => g.rotateX(-0.2));
    }
    case 'bow': {
      const out: G[] = [];
      for (const s of [-1, 1]) out.push(tint(ball(0.06, 12, 8).scale(1.3, 0.85, 0.5).translate(s * 0.068, 0, 0), BOW));
      out.push(tint(ball(0.03, 10, 8), BOW));
      const r = d.hair === 'curly' ? 0.33 : 0.285;
      return out.map((g) => g.rotateZ(-0.5).rotateY(0.35).translate(0.45 * r, 0.85 * r, 0.27 * r));
    }
    case 'headphones': {
      const out: G[] = [tint(new THREE.TorusGeometry(R * 1.13 * puff, 0.02, 8, 30, Math.PI), BAND)];
      for (const s of [-1, 1]) {
        out.push(tint(new THREE.CylinderGeometry(0.072, 0.072, 0.055, 20).rotateZ(Math.PI / 2).translate(s * 0.27 * puff, -0.01, 0), d.top));
        out.push(tint(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16).rotateZ(Math.PI / 2).translate(s * (0.27 * puff + 0.025), -0.01, 0), BAND));
      }
      return out;
    }
    case 'scarf': {
      const c = scarfColor(d.top);
      return [
        tint(new THREE.TorusGeometry(0.128, 0.048, 10, 26).rotateX(Math.PI / 2).translate(0, -0.215, 0), c),
        tint(new THREE.CapsuleGeometry(0.034, 0.11, 4, 10).scale(1.35, 1, 0.5).rotateZ(0.12).translate(0.065, -0.33, 0.15), c),
      ];
    }
    default:
      return [];
  }
}

/** 머리 한 덩어리(얼굴·머리카락·소품). 원점은 발바닥 가운데, 머리 가운데가 HEAD_Y */
export function buildHead(d: DollLook): G {
  const hat = d.acc === 'hat';
  const parts = [...face(d.skin), ...hairParts(d, hat), ...accessory(d)];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g.translate(0, HEAD_Y, 0);
}

/** 신발 색: 어두운 바지에는 밝은 운동화, 밝은 바지에는 갈색 신발 */
export const shoeColor = (bottom: string) => (luma(bottom) < 0.22 ? '#ece4d6' : '#4a3426');

/** 다리 하나(무릎 아래로 늘어진 캡슐) + 앞코가 둥근 신발. 원점은 엉덩이 관절, 발바닥이 y -0.28 */
export function buildLeg(bottom: string): G {
  const leg = tint(new THREE.CapsuleGeometry(0.06, 0.16, 4, 10).translate(0, -0.14, 0), bottom);
  const shoe = tint(ball(0.068, 14, 10).scale(1.05, 0.62, 1.4).translate(0, -0.236, 0.026), shoeColor(bottom));
  const g = mergeGeometries([leg, shoe])!;
  leg.dispose();
  shoe.dispose();
  return g;
}

// ───────── 함께 쓰는 기하(참조 수)와 색별 재질 모음

function makeKit() {
  // 모든 사람이 같은 몸통·팔(색은 재질). 머리와 다리(신발)는 겉모습마다 따로 구워 geos에 모은다.
  return {
    torso: new THREE.CapsuleGeometry(0.15, 0.1, 6, 16).scale(1.05, 1, 0.9).translate(0, 0.47, 0),
    hips: new THREE.CylinderGeometry(0.15, 0.165, 0.12, 16).translate(0, 0.32, 0),
    arm: new THREE.CapsuleGeometry(0.045, 0.14, 4, 10).translate(0, -0.115, 0),
    hand: new THREE.SphereGeometry(0.05, 10, 8).translate(0, -0.24, 0),
  };
}
type Kit = ReturnType<typeof makeKit>;
let kit: Kit | null = null;
let kitRefs = 0;
const mats = new Map<string, { m: THREE.Material; refs: number }>();
/** 겉모습마다 구운 머리·다리, 사진 판(키 문자열 → 기하) */
const geos = new Map<string, { g: THREE.BufferGeometry; refs: number }>();
let liveLabels = 0;

function takeKit(): Kit {
  if (!kit) kit = makeKit();
  kitRefs++;
  return kit;
}
function dropKit() {
  if (--kitRefs > 0 || !kit) return;
  Object.values(kit).forEach((g) => g.dispose());
  kit = null;
  kitRefs = 0;
}
function takeGeo(key: string, make: () => THREE.BufferGeometry) {
  let e = geos.get(key);
  if (!e) geos.set(key, (e = { g: make(), refs: 0 }));
  e.refs++;
  return e.g;
}
function dropGeo(key: string) {
  const e = geos.get(key);
  if (!e || --e.refs > 0) return;
  e.g.dispose();
  geos.delete(key);
}
function takeMat<M extends THREE.Material>(key: string, make: () => M): M {
  let e = mats.get(key);
  if (!e) mats.set(key, (e = { m: make(), refs: 0 }));
  e.refs++;
  return e.m as M;
}
function dropMat(key: string) {
  const e = mats.get(key);
  if (!e || --e.refs > 0) return;
  e.m.dispose();
  mats.delete(key);
}

/** 옷 색: 상의는 조금 밝게, 하의는 조금 어둡게 */
export function clothColors(color: string): { top: string; bottom: string } {
  const c = new THREE.Color();
  try { c.set(color); } catch { c.set('#6b8fb5'); }
  return { top: '#' + c.clone().offsetHSL(0, 0, 0.05).getHexString(), bottom: '#' + c.clone().offsetHSL(0, -0.04, -0.1).getHexString() };
}

// ───────── 사진 캐릭터 그림: 주소마다 한 장(참조 수). 30명이 모여도 GPU 메모리가 크지 않게 세로 768px로 줄인다

const PHOTO_PX = 768;
type PhotoSource = THREE.Texture | (CanvasImageSource & { width: number; height: number });
type PhotoEntry = {
  refs: number;
  /** 불러오기가 끝나면(실패해도) 풀린다. 성공이면 mat·depth가 채워져 있다 */
  wait: Promise<void>;
  tex?: THREE.Texture;
  mat?: THREE.MeshStandardMaterial;
  depth?: THREE.MeshDepthMaterial;
};
const photos = new Map<string, PhotoEntry>();

const browserLoad = (url: string) => new Promise<PhotoSource>((resolve, reject) => {
  if (typeof Image === 'undefined') return reject(new Error('no image'));
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('load'));
  img.src = url;
});
let loadPhoto: (url: string) => Promise<PhotoSource> = browserLoad;
/** 시험용: 그림을 불러오는 방법을 바꾼다(null이면 브라우저 Image) */
export function setPhotoLoader(fn: ((url: string) => Promise<PhotoSource>) | null) {
  loadPhoto = fn ?? browserLoad;
}

function toTexture(src: PhotoSource): THREE.Texture {
  if ((src as THREE.Texture).isTexture) return src as THREE.Texture;
  const img = src as CanvasImageSource & { width: number; height: number };
  const s = Math.min(1, PHOTO_PX / Math.max(1, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new THREE.CanvasTexture(c);
}

function takePhoto(url: string): PhotoEntry {
  let e = photos.get(url);
  if (!e) {
    const entry: PhotoEntry = { refs: 0, wait: Promise.resolve() };
    entry.wait = loadPhoto(url).then((src) => {
      if (entry.refs <= 0) return;
      const tex = toTexture(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      entry.tex = tex;
      // 판은 빛을 받되 그늘에서도 그림이 칙칙하지 않게 그림 자체를 조금 밝힌다
      entry.mat = new THREE.MeshStandardMaterial({
        map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95,
        emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.32,
      });
      entry.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    }).catch(() => undefined);
    photos.set(url, entry);
    e = entry;
  }
  e.refs++;
  return e;
}
function dropPhoto(url: string) {
  const e = photos.get(url);
  if (!e || --e.refs > 0) return;
  e.tex?.dispose();
  e.mat?.dispose();
  e.depth?.dispose();
  photos.delete(url);
}
/** 발이 아래 가운데인 세운 판 */
const photoPlane = () => new THREE.PlaneGeometry(PHOTO_W, PHOTO_H).translate(0, PHOTO_H / 2, 0);

/** 시험용: 지금 살아 있는 공유 자원 수(모두 놓으면 0) */
export function avatarStats() {
  return { kitRefs, geometries: (kit ? Object.keys(kit).length : 0) + geos.size, materials: mats.size + photos.size, labels: liveLabels };
}

// ───────── 이름표·말풍선: 캔버스 글자 스프라이트(화면에서 늘 같은 크기, 깊이 검사 끔)

/** 캔버스 화소 ÷ 화면 화소 */
const DPR = 2;
type Label = { sprite: THREE.Sprite; w: number; h: number };

function newCanvas(w: number, h: number) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  const g = c.getContext('2d');
  return g ? ([c, g] as const) : null;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 너비 안에 줄을 나눈다. 띄어쓰기에서 먼저 끊고, 긴 낱말은 글자로 끊는다. 넘치면 말줄임표 */
export function wrapLines(text: string, width: number, measure: (s: string) => number, maxLines = 4): string[] {
  const lines: string[] = [];
  let cur = '';
  const push = (s: string) => { lines.push(s); cur = ''; };
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    const tryLine = cur ? `${cur} ${word}` : word;
    if (measure(tryLine) <= width) { cur = tryLine; continue; }
    if (cur) push(cur);
    let piece = '';
    for (const ch of word) {
      if (measure(piece + ch) > width && piece) { push(piece); piece = ''; }
      piece += ch;
    }
    cur = piece;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let l = keep[maxLines - 1];
    while (l && measure(l + '…') > width) l = [...l].slice(0, -1).join('');
    keep[maxLines - 1] = l + '…';
    return keep;
  }
  return lines;
}

/** 글자 너비를 재는 작은 캔버스(한 번만 만든다) */
let probe: CanvasRenderingContext2D | null = null;

function makeLabel(kind: 'name' | 'bubble', text: string): Label | null {
  const fontPx = 26;
  const font = `${kind === 'name' ? 600 : 500} ${fontPx}px ${LABEL_FONT}`;
  probe ??= newCanvas(4, 4)?.[1] ?? null;
  const g0 = probe;
  if (!g0) return null;
  g0.font = font;
  const measure = (s: string) => g0.measureText(s).width;
  const pad = kind === 'name' ? 14 : 18;
  const lineH = 34;
  const lines = kind === 'name' ? [[...text].slice(0, 16).join('')] : wrapLines(text, 320, measure);
  const textW = Math.max(...lines.map(measure), kind === 'name' ? 20 : 40);
  const tail = kind === 'bubble' ? 14 : 0;
  const w = textW + pad * 2;
  const h = (kind === 'name' ? 44 : lines.length * lineH + pad * 2 - 6) + tail;
  const made = newCanvas(w + 4, h + 4);
  if (!made) return null;
  const [c, g] = made;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (kind === 'name') {
    roundRect(g, 2, 2, w, h, h / 2);
    g.fillStyle = 'rgba(28, 24, 20, 0.74)';
    g.fill();
    g.fillStyle = '#fffaf2';
    g.fillText(lines[0], 2 + w / 2, 2 + h / 2 + 1);
  } else {
    const bh = h - tail;
    roundRect(g, 2, 2, w, bh, 18);
    g.moveTo(2 + w / 2 - 12, 2 + bh - 1);
    g.lineTo(2 + w / 2, 2 + h);
    g.lineTo(2 + w / 2 + 12, 2 + bh - 1);
    g.fillStyle = '#fffdf8';
    g.fill();
    g.strokeStyle = 'rgba(40, 30, 20, 0.22)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#2a2420';
    lines.forEach((l, i) => g.fillText(l, 2 + w / 2, 2 + pad + lineH / 2 - 3 + i * lineH));
  }
  const tex = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = kind === 'bubble' ? 21 : 20;
  sprite.raycast = () => {};
  liveLabels++;
  return { sprite, w: (w + 4) / DPR, h: (h + 4) / DPR };
}

function dropLabel(l: Label | null) {
  if (!l) return;
  l.sprite.removeFromParent();
  const m = l.sprite.material;
  m.map?.dispose();
  m.dispose();
  liveLabels--;
}

// ───────── 캐릭터

export type AvatarMotion = {
  /** 땅 위에서 움직이는 빠르기(m/s) */
  speed: number;
  running: boolean;
  airborne: boolean;
  /** 이 프레임에 땅에 닿았는지 */
  landing: boolean;
  /** 위로 속도(m/s, 공중일 때 늘어나는 모양에 쓴다) */
  vy?: number;
};
export type Avatar = {
  /** 원점이 발바닥 가운데, 로컬 +z가 얼굴 쪽. 엔진이 자리·방향(rotation.y)을 정한다 */
  group: THREE.Group;
  update: (dt: number, m: AvatarMotion) => void;
  setName: (text: string | null) => void;
  setBubble: (text: string | null) => void;
  /** 이름표·말풍선 크기: 카메라에서 1m 앞 화면 1px이 몇 m인지(= 2·tan(fov/2) / 화면 높이 px) */
  setPixelScale: (unitsPerPx: number) => void;
  setShadow: (on: boolean) => void;
  /** 시험·디버그용: 지금 팔다리 각(rad)과 몸 높이 */
  pose: () => { legL: number; legR: number; armL: number; armR: number; bob: number; scaleY: number };
  /** 지금 보이는 모습: 기본 인형 또는 사진 판(사진은 그림이 온 뒤에만) */
  shown: () => 'doll' | 'photo';
  /** 사진 그림을 불러오기가 끝나면(실패해도) 풀린다. 인형이면 바로 */
  ready: Promise<void>;
  dispose: () => void;
};
export type AvatarOptions = {
  /** 예전 방식: 옷 색 하나(look이 없을 때 기본 인형의 윗옷·아랫옷) */
  color?: string;
  /** 겉모습. 사진이면 그림을 불러오는 동안과 실패했을 때 fallback(없으면 color) 인형을 보인다 */
  look?: CharacterLook | null;
  fallback?: DollLook;
  name?: string | null;
  reducedMotion?: boolean;
  shadow?: boolean;
};

/** 겉모습 비교용 짧은 열쇠(같으면 다시 만들 필요가 없다) */
export function lookKey(look: CharacterLook | null | undefined, color = ''): string {
  if (!look) return `c:${color}`;
  if (look.kind === 'photo') return `p:${look.url}`;
  const d = look.doll;
  return `d:${d.hair}${d.hairColor}${d.skin}${d.top}${d.bottom}${d.acc}`;
}

/**
 * 기본 인형의 머리·피부(look.ts DEFAULT_DOLL과 같은 값. 노드 시험에서 look.ts를 불러오지 않으려고 값만 둔다,
 * 같은지는 tests/unit/look.test.ts가 본다)
 */
export const BASE_DOLL: DollLook = { hair: 'short', hairColor: '#2b2420', skin: '#efcfb2', top: '#3e6b4f', bottom: '#3a3a3a', acc: 'none' };
const HEX6 = /^#[0-9a-f]{6}$/i;
const safeHex = (v: unknown, fb: string) => (typeof v === 'string' && HEX6.test(v) ? v.toLowerCase() : fb);

/** 엔진에 들어온 인형 값을 한 번 더 고친다(모르는 머리·소품은 그리는 쪽이 기본으로 그린다) */
function safeDoll(v: Partial<DollLook> | null | undefined): DollLook {
  const o = v ?? {};
  return {
    hair: typeof o.hair === 'string' ? o.hair : BASE_DOLL.hair,
    hairColor: safeHex(o.hairColor, BASE_DOLL.hairColor),
    skin: safeHex(o.skin, BASE_DOLL.skin),
    top: safeHex(o.top, BASE_DOLL.top),
    bottom: safeHex(o.bottom, BASE_DOLL.bottom),
    acc: typeof o.acc === 'string' ? o.acc : BASE_DOLL.acc,
  };
}

function dollOf(opt: AvatarOptions): DollLook {
  if (opt.look?.kind === 'doll') return safeDoll(opt.look.doll);
  if (opt.fallback) return safeDoll(opt.fallback);
  if (opt.color) {
    const c = clothColors(opt.color);
    return { ...BASE_DOLL, top: c.top, bottom: c.bottom };
  }
  return BASE_DOLL;
}

export function createAvatar(opt: AvatarOptions): Avatar {
  const k = takeKit();
  const d = dollOf(opt);
  // 윗옷 색을 쓰는 머리 소품(캡 모자, 모자 띠, 헤드폰, 목도리)이 있을 때만 머리 열쇠에 윗옷 색을 넣는다
  const needTop = d.hair === 'cap' || d.acc === 'headphones' || d.acc === 'hat' || d.acc === 'scarf';
  const geoKeys = [`head:${d.hair}:${d.hairColor}:${d.skin}:${d.acc}:${needTop ? d.top : ''}`, `leg:${d.bottom}`];
  const keys = [`top:${d.top}`, `bottom:${d.bottom}`, `skin:${d.skin}`, 'head'];
  const top = takeMat(keys[0], () => new THREE.MeshStandardMaterial({ color: d.top, roughness: 0.85 }));
  const bottom = takeMat(keys[1], () => new THREE.MeshStandardMaterial({ color: d.bottom, roughness: 0.85 }));
  const skin = takeMat(keys[2], () => new THREE.MeshStandardMaterial({ color: d.skin, roughness: 0.75 }));
  const baked = takeMat(keys[3], () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  const headGeo = takeGeo(geoKeys[0], () => buildHead(d));
  const legGeo = takeGeo(geoKeys[1], () => buildLeg(d.bottom));
  const reduced = Boolean(opt.reducedMotion);

  const group = new THREE.Group();
  group.name = 'avatar';
  const body = new THREE.Group();
  group.add(body);
  const meshes: THREE.Mesh[] = [];
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, name: string) => {
    const x = new THREE.Mesh(g, m);
    x.name = name;
    parent.add(x);
    meshes.push(x);
    return x;
  };
  mesh(headGeo, baked, body, 'head');
  mesh(k.torso, top, body, 'torso');
  mesh(k.hips, bottom, body, 'hips');
  const limb = (x: number, y: number, kind: 'leg' | 'arm') => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    if (kind === 'leg') mesh(legGeo, baked, pivot, 'leg');
    else {
      mesh(k.arm, top, pivot, 'arm');
      mesh(k.hand, skin, pivot, 'hand');
      pivot.rotation.z = Math.sign(x) * 0.12;
    }
    return pivot;
  };
  const legL = limb(-0.075, 0.28, 'leg'), legR = limb(0.075, 0.28, 'leg');
  const armL = limb(-0.175, 0.6, 'arm'), armR = limb(0.175, 0.6, 'arm');
  let shadowOn = opt.shadow !== false;
  const setShadow = (on: boolean) => {
    shadowOn = on;
    meshes.forEach((m) => { m.castShadow = on; m.receiveShadow = on; });
    if (card) card.castShadow = on;
  };

  // 사진 캐릭터: 그림이 오면 인형을 숨기고 종이 인형처럼 세운 판(늘 카메라 쪽을 본다). 실패하면 인형 그대로
  const photoUrl = opt.look?.kind === 'photo' ? opt.look.url : null;
  const paper = new THREE.Group();
  paper.name = 'photo';
  group.add(paper);
  let card: THREE.Mesh | null = null;
  let sway = 0;
  let disposed = false;
  const camW = new THREE.Vector3();
  const selfW = new THREE.Vector3();
  const faceCamera = (_r: unknown, _s: unknown, cam: THREE.Camera) => {
    if (!card) return;
    cam.getWorldPosition(camW);
    paper.getWorldPosition(selfW);
    const want = Math.atan2(camW.x - selfW.x, camW.z - selfW.z);
    // 판의 면 안에서만 살짝 기운다(YXZ 순서: 먼저 z로 기울이고 y로 돌린다)
    card.rotation.set(0, want - group.rotation.y, sway, 'YXZ');
    card.updateMatrixWorld();
  };
  const entry = photoUrl ? takePhoto(photoUrl) : null;
  const ready = entry
    ? entry.wait.then(() => {
      if (disposed || !entry.mat) return;
      card = new THREE.Mesh(takeGeo('photo:plane', photoPlane), entry.mat);
      card.name = 'photo-card';
      card.customDepthMaterial = entry.depth;
      card.castShadow = shadowOn;
      card.onBeforeRender = faceCamera as THREE.Object3D['onBeforeRender'];
      paper.add(card);
      body.visible = false;
      labelY = PHOTO_LABEL_Y;
      for (const l of [name, bubble]) l?.sprite.position.setY(labelY);
    })
    : Promise.resolve();
  setShadow(shadowOn);

  let name: Label | null = null;
  let labelY = LABEL_Y;
  let bubble: Label | null = null;
  let unitsPerPx = 0.0016;
  const place = () => {
    if (name) {
      name.sprite.center.set(0.5, 0);
      name.sprite.scale.set(name.w * unitsPerPx, name.h * unitsPerPx, 1);
    }
    if (bubble) {
      const below = name ? name.h + 4 : 2;
      bubble.sprite.center.set(0.5, -below / bubble.h);
      bubble.sprite.scale.set(bubble.w * unitsPerPx, bubble.h * unitsPerPx, 1);
    }
  };
  const label = (kind: 'name' | 'bubble', text: string | null, old: Label | null) => {
    dropLabel(old);
    const t = (text ?? '').trim();
    const l = t ? makeLabel(kind, t) : null;
    if (l) {
      l.sprite.position.set(0, labelY, 0);
      group.add(l.sprite);
    }
    return l;
  };
  let nameText: string | null = null, bubbleText: string | null = null;
  const setName = (t: string | null) => { if (t !== nameText) { nameText = t; name = label('name', t, name); place(); } };
  const setBubble = (t: string | null) => { if (t !== bubbleText) { bubbleText = t; bubble = label('bubble', t, bubble); place(); } };
  if (opt.name) setName(opt.name);

  let phase = 0, amount = 0, air = 0, squash = 0, scaleY = 1, bob = 0;
  let wasAir = false;
  const update = (dt: number, m: AvatarMotion) => {
    const d = Math.min(0.1, Math.max(0, dt || 0));
    if (reduced) {
      // 줄인 움직임: 팔다리·몸 출렁임·쪼그림을 모두 끈다(점프 높이는 엔진이 그대로 올린다)
      legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0;
      body.position.y = 0;
      body.scale.set(1, 1, 1);
      paper.position.y = 0;
      paper.scale.set(1, 1, 1);
      sway = 0;
      return;
    }
    const walking = !m.airborne && m.speed > 0.05;
    amount += ((walking ? 1 : 0) - amount) * follow(d, 0.12);
    air += ((m.airborne ? 1 : 0) - air) * follow(d, 0.07);
    phase = (phase + gaitRate(walking ? m.speed : 0, m.running) * d) % (Math.PI * 2);
    if (!walking && amount < 0.01) phase = 0;
    if (m.airborne && !wasAir) squash = Math.max(squash, 0.6);
    if (m.landing) squash = 1;
    wasAir = m.airborne;
    squash *= Math.exp(-d * 11);
    const p = gaitPose(phase, amount, m.running);
    legL.rotation.x = p.legL * (1 - air) + -0.35 * air;
    legR.rotation.x = p.legR * (1 - air) + 0.25 * air;
    armL.rotation.x = p.armL * (1 - air);
    armR.rotation.x = p.armR * (1 - air);
    armL.rotation.z = -0.12 - 0.9 * air;
    armR.rotation.z = 0.12 + 0.9 * air;
    const stretch = m.airborne ? Math.max(-1, Math.min(1, (m.vy ?? 0) / JUMP_V)) * 0.08 : 0;
    scaleY = (1 + stretch) * (1 - 0.18 * squash);
    const sx = 1 / Math.sqrt(Math.max(0.5, scaleY));
    body.scale.set(sx, scaleY, sx);
    bob = p.bob * (1 - air);
    body.position.y = bob;
    body.rotation.x = p.lean;
    if (card) {
      // 사진 판: 걸을 때 걸음마다 살짝 통통 뛰고 좌우로 조금 기운다. 점프·착지는 인형과 같이 늘었다 쪼그린다
      paper.position.y = Math.abs(Math.sin(phase)) * 0.045 * amount * (1 - air);
      sway = Math.sin(phase) * 0.045 * amount * (1 - air);
      paper.scale.set(sx, scaleY, 1);
    }
  };

  return {
    group,
    update,
    setName,
    setBubble,
    setPixelScale(u) {
      if (!(u > 0) || Math.abs(u - unitsPerPx) < 1e-9) return;
      unitsPerPx = u;
      place();
    },
    setShadow,
    pose: () => ({ legL: legL.rotation.x, legR: legR.rotation.x, armL: armL.rotation.x, armR: armR.rotation.x, bob, scaleY }),
    shown: () => (card ? 'photo' : 'doll'),
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (card) dropGeo('photo:plane');
      card = null;
      if (photoUrl) dropPhoto(photoUrl);
      dropLabel(name);
      dropLabel(bubble);
      name = bubble = null;
      group.removeFromParent();
      group.clear();
      keys.forEach(dropMat);
      geoKeys.forEach(dropGeo);
      dropKit();
    },
  };
}
