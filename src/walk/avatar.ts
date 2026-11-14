// 걷는 사람의 귀여운 캐릭터와 몸 움직임 계산. 원시 도형(구·캡슐·원통)만 쓴다.
// 이 파일은 three 말고는 아무것도 불러오지 않는다(노드 시험에서 그대로 돈다). look.ts는 타입만 쓴다. 3D 모형을 풀 때만 three의 GLTFLoader를 따로 불러온다.
// 인형은 겉모습마다 꼭짓점 색으로 구운 기하를 함께 쓰고(참조 수로 놓는다), 재질은 모든 인형이 하나를 쓴다.
// 서 있는 인형은 온몸을 한 덩이(rest)로 그리고, 걷거나 뛸 때만 몸통·다리·팔 다섯 덩이로 바꿔 그린다(사람이 많이 모여도 가볍게).
// 겉모습은 두 가지: 직접 꾸민 기본 인형(머리·옷·소품) 또는 사진으로 만든 캐릭터. 사진 캐릭터는 3D 모형이 있으면 모형으로,
// 없거나 엔진이 원하지 않으면(멀리 있는 사람) 방향 그림 묶음, 그다음 그림 한 장을 세운 판으로 선다.
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
/** 사진 캐릭터 판: 키(m), 그림 비율(2:3. 그림 한 장도, 방향 그림 묶음의 한 칸도 같다), 이름표 높이 */
export const PHOTO_H = 1.3;
const PHOTO_W = PHOTO_H * (2 / 3);
const PHOTO_LABEL_Y = PHOTO_H + 0.06;
/** 판의 법선: 양 끝에서 좌우로 돌리는 각(rad)과 위로 기울이는 몫(수평 1에 대해) */
const CARD_BEND = (50 * Math.PI) / 180;
const CARD_LIFT = 0.6;
/**
 * 판이 스스로 내는 빛(그림 색의 몫). 그늘에서도 그림이 칙칙하지 않게 조금만 둔다. 같은 색을 칠한 판과 인형을 나란히 세워 재 보면
 * 위로 기운 법선만으로도 판이 인형의 옆면보다 밝다(그늘에서 화면 밝기 15% 안팎): 더 키우면 인형 옆에서 혼자 환하다
 */
export const PHOTO_GLOW = 0.12;
/**
 * 3인칭에서 내려다볼 때 판을 발 기준으로 뒤로 눕히는 몫(카메라가 내려다보는 각에 곱한다).
 * 집 안의 3인칭은 늘 49도 넘게 내려다봐서, 서 있는 판은 키가 2/3 아래로 눌려 납작해 보인다. 절반만큼 눕히면 키가 9할쯤 보인다
 */
export const PHOTO_LEAN = 0.5;
/**
 * 눕히는 각을 줄이기 시작하는 내려다보는 각(49도)과 눕히지 않는 각(71.6도, 3인칭에서 가장 가파른 각).
 * 눕힌 판은 깊이를 서 있는 판 그대로 쓰므로(벽에 박히지 않게) 가파르게 내려다볼수록 윗몸이 뒤의 벽·키 큰 가구 깊이에 가려진다
 */
const LEAN_FULL = 0.855;
const LEAN_ZERO = 1.25;
/** 카메라가 내려다보는 각(rad, 0 = 수평) → 판을 뒤로 눕히는 각 */
export function leanFor(down: number): number {
  const p = Math.max(0, Math.min(Math.PI / 2, down));
  return PHOTO_LEAN * Math.min(p, LEAN_FULL) * Math.max(0, Math.min(1, (LEAN_ZERO - p) / (LEAN_ZERO - LEAN_FULL)));
}
/** 보이던 방향 그림이 바뀔 때 판 폭이 줄었다 돌아오는 시간(초)과 가장 좁을 때의 폭 */
const TURN_S = 0.12;
const TURN_SQUEEZE = 0.84;
/**
 * 해 그림자만 드리우는 판이 사는 레이어. 엔진은 해의 그림자 카메라에만 이 레이어를 켠다:
 * 그림자를 구울 때만 그려지고 화면을 그릴 때는 건너뛴다(그리기 호출이 늘지 않는다)
 */
export const SHADE_LAYER = 1;
/** 사진 판을 세우는 방식: 카메라 자리를 본다(1인칭) | 카메라 화면과 나란히(3인칭: 여럿이 나란히 서고 화면 가장자리에서도 비틀리지 않는다) */
export type FaceMode = 'position' | 'plane';
/** 지금 판을 눕히는 각의 (cos, sin). 한 장면에서는 모든 판이 같은 각으로 눕으므로 사진 재질이 모두 이 값을 함께 쓴다 */
const leanNow = { value: new THREE.Vector2(1, 0) };
/**
 * 판을 눕혀 그리는 셰이더 손질. 판을 실제로 눕히면(회전) 머리가 뒤로 물러나, 벽 앞에 선 캐릭터의 머리가 벽 속으로 들어간다.
 * 그래서 화면 위 자리만 눕힌 판의 것으로 하고 깊이는 서 있는 판의 것을 쓴다: 판이 벽을 뚫고 넘어가지 않고, 앞에 놓인 것에는 서 있는 판처럼 가려진다.
 * 빛 계산과 그림자 판은 서 있는 판 그대로다.
 * 남은 한계: 눕힌 판은 화면에서 서 있는 판보다 위까지 올라가 벽의 더 높은 곳과 겹치는데, 내려다보는 화면에서는 높은 곳일수록 카메라에 가깝다.
 * 그래서 가파르게(55도 안팎부터) 내려다보는데 캐릭터가 벽이나 키 큰 가구에 바짝(0.5m 안) 붙어 서 있으면 판의 허리 위가 그것에 가려질 수 있다.
 * 집 안 3인칭의 기본 각(49도)에서는 벽에 붙어 서도 가려지지 않는다
 */
const LEAN_VERTEX = /* glsl */`#include <project_vertex>
{
	vec4 leaned = projectionMatrix * modelViewMatrix * vec4( transformed.x, transformed.y * photoLean.x, - transformed.y * photoLean.y, 1.0 );
	if ( gl_Position.w > 0.0 && leaned.w > 0.0 ) leaned.z = gl_Position.z / gl_Position.w * leaned.w;
	gl_Position = leaned;
}`;
/**
 * 사진 판의 걷는 다리: 판 아래쪽(엉덩이 높이 CARD_HIP 아래)을 좌우로 나눠 번갈아 움직인다(그림은 찢어지지 않고 휜다).
 * 옆모습에서는 두 다리가 엉덩이를 축으로 앞뒤로 벌어지고(cardGait.x, rad), 앞·뒷모습에서는 한쪽 발씩 들린다(y 왼쪽, z 오른쪽, m).
 * 가운데(CARD_MID 안)는 두 쪽 움직임을 부드럽게 섞는다. 판을 눕히는 계산(LEAN_VERTEX)은 휜 자리로 한다
 */
export const CARD_HIP = 0.3;
const CARD_MID = 0.05;
/** 사진 판의 앉기: 엉덩이 아래(다리)를 이 몫만큼 눌러 짧게 하고 그 위를 그만큼 내린다(앞에서 본 앉은 다리처럼 짧아 보인다) */
export const CARD_SIT = 0.72;
const f2 = (v: number) => v.toFixed(2);
const CARD_BEGIN = /* glsl */`#include <begin_vertex>
{
	float below = 1.0 - smoothstep( 0.0, ${f2(CARD_HIP)}, transformed.y );
	float side = smoothstep( - ${f2(CARD_MID)}, ${f2(CARD_MID)}, transformed.x ) * 2.0 - 1.0;
	float a = cardGait.x * side * below;
	float py = transformed.y - ${f2(CARD_HIP)};
	transformed.xy = vec2( transformed.x * cos( a ) - py * sin( a ), ${f2(CARD_HIP)} + transformed.x * sin( a ) + py * cos( a ) );
	transformed.y += mix( cardGait.y, cardGait.z, side * 0.5 + 0.5 ) * below;
	transformed.y -= min( transformed.y, ${f2(CARD_HIP)} ) * cardSit;
}`;
/** 셰이더(CARD_BEGIN)가 꼭짓점마다 하는 계산을 그대로 옮긴 것(시험용): 판 위 (x, y)가 걸음과 앉기(누르는 몫)에 따라 가는 자리 */
export function cardBend(x: number, y: number, gait: { x: number; y: number; z: number }, sit = 0): { x: number; y: number } {
  const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const below = 1 - ss(0, CARD_HIP, y);
  const side = ss(-CARD_MID, CARD_MID, x) * 2 - 1;
  const a = gait.x * side * below;
  const py = y - CARD_HIP;
  const lift = gait.y + (gait.z - gait.y) * (side * 0.5 + 0.5);
  const by = CARD_HIP + x * Math.sin(a) + py * Math.cos(a) + lift * below;
  return { x: x * Math.cos(a) - py * Math.sin(a), y: by - Math.min(by, CARD_HIP) * sit };
}
/** 걷지 않는 판의 값(서식 재질이 쓴다. 바뀌지 않는다) */
const STILL_GAIT = { value: new THREE.Vector3() };
const STILL_SIT = { value: 0 };
function photoShader(mat: THREE.Material, gait: { value: THREE.Vector3 }, sit: { value: number } = STILL_SIT) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.photoLean = leanNow;
    shader.uniforms.cardGait = gait;
    shader.uniforms.cardSit = sit;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 photoLean;\nuniform vec3 cardGait;\nuniform float cardSit;')
      .replace('#include <begin_vertex>', CARD_BEGIN)
      .replace('#include <project_vertex>', LEAN_VERTEX);
  };
  // 같은 설정의 다른 재질과 셰이더 프로그램을 나눠 쓰지 않게(이 재질만 손질했다). 사진 판끼리는 하나를 함께 쓴다
  mat.customProgramCacheKey = () => 'photo-lean-legs';
  mat.userData.photoLean = leanNow;
  mat.userData.cardGait = gait;
  mat.userData.cardSit = sit;
}

// ───────── 사진 캐릭터의 3D 모형(GLB): 받기, 키 맞추기, 다리 모양 알아내기, 걷는 다리 셰이더.
// 모형 파일의 약속: +Y 위, +Z 정면, 발이 원점, 키 1.0, 삼각형 1만 이하, 텍스처 1장, meshopt 압축.
// GLTFLoader와 meshopt 해독기는 처음 모형이 필요할 때 따로 불러온다(걷기 화면의 첫 코드 조각을 키우지 않게).
// 모형에는 뼈대가 없다: 다리는 꼭짓점 셰이더가 엉덩이 높이 아래를 좌우로 나눠 번갈아 돌린다.

/** 모형의 키(m): 사진 판(1.3m)의 그림 속 캐릭터와 같은 키(그림은 칸 높이의 95%를 채운다) */
export const MODEL_H = 1.24;
/** 받을 모형 파일의 상한(바이트). 3D 서비스가 만드는 것은 약 230KB */
export const MODEL_MAX_BYTES = 1.5 * 1024 * 1024;
/** 모형이 스스로 내는 빛(그림 색의 몫): 그늘에서도 칙칙하지 않게, 인형 옆에서 혼자 환하지 않게 사진 판보다 조금 낮게 */
export const MODEL_GLOW = 0.1;

// ───────── 다리 모양 알아내기(순수 계산, 시험 대상)

/** 다리 모양: 다리가 따로 떨어져 있는가(아니면 치마·한복처럼 붙었다), 다리 사이 틈의 꼭대기 높이, 두 다리를 가르는 x(모두 m) */
export type LegShape = { apart: boolean; crotch: number; split: number };
/** 다리 사이 틈을 찾는 높이(키의 몫)와 칸 수(1%씩) */
const LEG_TOP = 0.45;
const LEG_SLICES = 45;
/** 다리가 따로라고 보는 틈: 이어진 높이가 키의 6% 넘고, 꼭대기가 키의 10% 넘어야 한다(한복처럼 신발 끝만 보이면 붙은 것) */
const CROTCH_MIN = 0.1;
const GAP_MIN = 0.06;
/** 꼭대기가 키의 10%보다 낮은 틈(짧은 다리)도 바로 위가 자락이 아니면 다리 사이다: 틈 꼭대기에서 자락까지 남아야 하는 높이(키의 몫) */
const HEM_CLEAR = 0.04;
/** 가로 단면의 폭이 발 둘레 폭의 이 배를 처음 넘는 높이를 자락(치맛단, 윗옷 자락)으로 본다 */
const HEM_WIDEN = 1.3;
/**
 * 틈 없이 붙은 바지: 자락이 키의 16%보다 높고(발 둘레 폭이 위로 이어진다) 두 신발 코 사이 앞쪽 골이 키의 4%보다 깊으면 두 다리다.
 * 가랑이는 자락 높이의 0.45(다리 사이가 보이는 모형에서 잰 몫), 키의 8~12% 안
 */
const PANTS_HEM = 0.16;
const TOE_NOTCH = 0.04;
const FUSED_CROTCH = 0.45;
/** 두 다리를 가르는 평면을 찾아볼 x(키의 몫). 가운데부터 */
const SPLITS = [0, -0.01, 0.01, -0.02, 0.02, -0.03, 0.03];
/** 신발 코 골을 재는 칸(키의 2.5·3.5·4.5% 높이), 앞 윤곽의 x 칸 폭(키의 몫) */
const TOE_SLICES = [2, 3, 4];
const TOE_BIN = 0.005;

/** 아래 45%를 1% 칸으로 자른 가로 단면: 칸마다 x 범위. 신발 칸(TOE_SLICES)은 단면 선분(x, z, x, z 차례)도 모은다 */
function lowSections(pos: ArrayLike<number>, n: number, at: (k: number) => number, slice: number) {
  const x0 = new Float64Array(LEG_SLICES).fill(Infinity), x1 = new Float64Array(LEG_SLICES).fill(-Infinity);
  const toe: number[][] = TOE_SLICES.map(() => []);
  const p = new Float64Array(6);
  let m = 0, y = 0;
  // 변 u-v가 높이 y와 만나는 점(x, z)을 p에 더한다
  const cut = (u: number, v: number) => {
    const yu = pos[u + 1] - y, yv = pos[v + 1] - y;
    if ((yu > 0 && yv > 0) || (yu < 0 && yv < 0) || yu === yv) return;
    const s = yu / (yu - yv);
    p[m++] = pos[u] + (pos[v] - pos[u]) * s;
    p[m++] = pos[u + 2] + (pos[v + 2] - pos[u + 2]) * s;
  };
  const top = LEG_SLICES * slice;
  for (let t = 0; t < n; t += 3) {
    const a = at(t) * 3, b = at(t + 1) * 3, d = at(t + 2) * 3;
    const lo = Math.min(pos[a + 1], pos[b + 1], pos[d + 1]);
    if (!(lo < top)) continue;
    const hi = Math.max(pos[a + 1], pos[b + 1], pos[d + 1]);
    // 칸 가운데 높이가 이 삼각형 안에 드는 칸들
    const i0 = Math.max(0, Math.ceil(lo / slice - 0.5)), i1 = Math.min(LEG_SLICES - 1, Math.floor(hi / slice - 0.5));
    for (let i = i0; i <= i1; i++) {
      y = (i + 0.5) * slice;
      m = 0;
      cut(a, b);
      cut(b, d);
      cut(d, a);
      if (m < 4) continue;
      x0[i] = Math.min(x0[i], p[0], p[2]);
      x1[i] = Math.max(x1[i], p[0], p[2]);
      const k = TOE_SLICES.indexOf(i);
      if (k >= 0) toe[k].push(p[0], p[1], p[2], p[3]);
    }
  }
  return { x0, x1, toe };
}

/** 앞 윤곽(x 칸마다 가장 앞 z)에서 가운데 cx ± 키의 6% 안의 가장 깊은 골: 양옆 키의 12% 안의 가장 앞 점보다 얼마나 들어갔나 */
function toeNotch(seg: number[], cx: number, h: number): { depth: number; x: number } {
  const bin = TOE_BIN * h;
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < seg.length; j += 2) { lo = Math.min(lo, seg[j]); hi = Math.max(hi, seg[j]); }
  const best = { depth: 0, x: cx };
  if (!(hi > lo) || !Number.isFinite(hi - lo)) return best;
  const nb = Math.floor((hi - lo) / bin) + 1;
  const front = new Float64Array(nb).fill(-Infinity);
  // 선분마다 걸치는 칸의 가운데(선분 안으로 자른 x)에서 z를 구해 칸의 가장 앞을 고른다: 긴 선분도 칸을 건너뛰지 않는다
  for (let j = 0; j < seg.length; j += 4) {
    const xa = seg[j], za = seg[j + 1], xb = seg[j + 2], zb = seg[j + 3];
    const l = Math.min(xa, xb), r = Math.max(xa, xb);
    for (let i = Math.floor((l - lo) / bin); i <= Math.min(nb - 1, Math.floor((r - lo) / bin)); i++) {
      const x = Math.min(r, Math.max(l, lo + (i + 0.5) * bin));
      const z = xa === xb ? Math.max(za, zb) : za + ((zb - za) * (x - xa)) / (xb - xa);
      if (z > front[i]) front[i] = z;
    }
  }
  const reach = Math.round((0.12 * h) / bin);
  for (let i = 0; i < nb; i++) {
    const x = lo + (i + 0.5) * bin;
    if (front[i] === -Infinity || Math.abs(x - cx) > 0.06 * h) continue;
    let l = -Infinity, r = -Infinity;
    for (let j = Math.max(0, i - reach); j < i; j++) l = Math.max(l, front[j]);
    for (let j = i + 1; j <= Math.min(nb - 1, i + reach); j++) r = Math.max(r, front[j]);
    const depth = Math.min(l, r) - front[i];
    if (depth > best.depth) { best.depth = depth; best.x = x; }
  }
  return best;
}

/**
 * 위치(발바닥 0, 키 h)와 색인(삼각형 셋씩)으로 다리 모양을 알아낸다.
 * 세로 평면 x = c를 지나는 삼각형이 있는 높이는 몸이 가운데에서 이어진 곳이다. 아래에서부터 아무 삼각형도 지나지 않는 높이가
 * 이어지면 그 사이가 다리 사이 틈이고, 틈의 꼭대기가 가랑이다. 가운데 둘레의 몇 평면 가운데 틈이 가장 긴 것을 고른다.
 * 틈이 낮으면 바로 위가 자락(치맛단)인지 보고, 틈이 없으면 붙은 바지(자락이 높고 신발 코 사이가 팼다)인지 본다.
 * 둘 다 아니면 치마·한복처럼 붙은 것
 */
export function legShape(pos: ArrayLike<number>, index: ArrayLike<number> | null, h: number): LegShape {
  const none: LegShape = { apart: false, crotch: 0, split: 0 };
  if (!(h > 0) || pos.length < 9) return none;
  const n = index ? index.length - (index.length % 3) : Math.floor(pos.length / 9) * 3;
  const at = (k: number) => (index ? index[k] : k);
  const slice = (LEG_TOP * h) / LEG_SLICES;
  let best = { run: 0, top: 0, split: 0 };
  for (const s of SPLITS) {
    const c = s * h;
    const hit = new Uint8Array(LEG_SLICES);
    let lo = 0, hi = 0;
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      if ((x0 > 0 && x1 > 0) || (x0 < 0 && x1 < 0)) return;
      const y = x0 === x1 ? Math.min(y0, y1) : y0 + ((y1 - y0) * x0) / (x0 - x1);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
      if (x0 === x1) hi = Math.max(hi, y0, y1);
    };
    for (let t = 0; t < n; t += 3) {
      const a = at(t) * 3, b = at(t + 1) * 3, d = at(t + 2) * 3;
      const xa = pos[a] - c, xb = pos[b] - c, xd = pos[d] - c;
      if ((xa > 0 && xb > 0 && xd > 0) || (xa < 0 && xb < 0 && xd < 0)) continue;
      // 삼각형이 평면과 만나는 선분의 높이 범위
      lo = Infinity;
      hi = -Infinity;
      edge(xa, pos[a + 1], xb, pos[b + 1]);
      edge(xb, pos[b + 1], xd, pos[d + 1]);
      edge(xd, pos[d + 1], xa, pos[a + 1]);
      if (!(lo <= hi) || lo >= LEG_TOP * h) continue;
      const i0 = Math.max(0, Math.floor(lo / slice)), i1 = Math.min(LEG_SLICES - 1, Math.floor(hi / slice));
      for (let i = i0; i <= i1; i++) hit[i] = 1;
    }
    // 한 칸짜리 걸림(신발 끈, 이음매 같은 부스러기 삼각형)은 틈을 끊지 않는다: 위아래 칸이 비었으면 빈 칸으로 본다
    const open = hit.map((v, i) => (v && i > 0 && i < LEG_SLICES - 1 && !hit[i - 1] && !hit[i + 1] ? 0 : v));
    // 아무것도 지나지 않은 칸이 가장 길게 이어진 곳. 찾는 높이 꼭대기까지 비었으면 다리가 아니다(평면이 몸을 비켜 갔다)
    let start = 0;
    for (let i = 0; i < LEG_SLICES; i++) {
      if (!open[i]) continue;
      if (i - start > best.run) best = { run: i - start, top: i * slice, split: c };
      start = i + 1;
    }
  }
  // 자락: 발 둘레(1~5% 칸) 폭의 가운데 값보다 HEM_WIDEN배 넓어지는 첫 높이. 넓어지지 않으면 끝없이 높다
  const { x0, x1, toe } = lowSections(pos, n, at, slice);
  const feet = [1, 2, 3, 4, 5].filter((i) => x1[i] > x0[i]);
  const widths = feet.map((i) => x1[i] - x0[i]).sort((p, q) => p - q);
  let hem = Infinity;
  if (widths.length) {
    const w0 = widths[widths.length >> 1];
    for (let i = 3; i < LEG_SLICES; i++) if (x1[i] - x0[i] > HEM_WIDEN * w0) { hem = i * slice; break; }
  }
  if (best.run * slice >= GAP_MIN * h && (best.top >= CROTCH_MIN * h || hem - best.top >= HEM_CLEAR * h)) {
    return { apart: true, crotch: best.top, split: best.split };
  }
  // 틈이 없다(그림에서 두 다리가 맞닿았다): 자락이 높고 신발 코 사이가 패었으면 붙은 바지. 골 자리로 가른다
  if (feet.length && hem >= PANTS_HEM * h) {
    const cx = (Math.min(...feet.map((i) => x0[i])) + Math.max(...feet.map((i) => x1[i]))) / 2;
    let notch = { depth: 0, x: cx };
    for (const pts of toe) {
      const t = toeNotch(pts, cx, h);
      if (t.depth > notch.depth) notch = t;
    }
    if (notch.depth >= TOE_NOTCH * h) {
      return { apart: true, crotch: Math.min(0.12 * h, Math.max(0.08 * h, FUSED_CROTCH * hem)), split: notch.x };
    }
  }
  return none;
}

// ───────── 모형을 걷기 엔진의 크기로

export type ModelData = {
  /** 발바닥 가운데가 원점, 키 MODEL_H, +Z 정면. 위치·법선은 Float32, uv·색인은 받은 그대로 */
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  legs: LegShape;
};

/**
 * 받은 기하에 노드 변환(matrix)을 구워 넣고 키를 MODEL_H로, 발바닥을 y 0으로 맞춘다(x·z는 모형이 정한 원점 그대로).
 * 양자화된 위치(int16)도 실제 값으로 읽어 Float32로 옮긴다: 다리 셰이더와 다리 모양 계산이 미터 단위로 본다
 */
export function fitModel(src: THREE.BufferGeometry, matrix: THREE.Matrix4 = new THREE.Matrix4()): { geometry: THREE.BufferGeometry; legs: LegShape } | null {
  const pos = src.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count < 3) return null;
  const nor = src.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const v = new THREE.Vector3();
  const out = new Float32Array(pos.count * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  const tall = maxY - minY;
  if (!(tall > 1e-6) || !Number.isFinite(tall)) return null;
  const k = MODEL_H / tall;
  for (let i = 0; i < pos.count; i++) {
    out[i * 3] *= k;
    out[i * 3 + 1] = (out[i * 3 + 1] - minY) * k;
    out[i * 3 + 2] *= k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (nor) {
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const nout = new Float32Array(nor.count * 3);
    for (let i = 0; i < nor.count; i++) {
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      nout[i * 3] = v.x; nout[i * 3 + 1] = v.y; nout[i * 3 + 2] = v.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nout, 3));
  }
  const uv = src.getAttribute('uv');
  if (uv) g.setAttribute('uv', uv);
  if (src.index) g.setIndex(src.index);
  if (!nor) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return { geometry: g, legs: legShape(out, src.index ? (src.index.array as ArrayLike<number>) : null, MODEL_H) };
}

// ───────── 받기(브라우저)

type Gltf = { parse: (buf: ArrayBuffer) => Promise<THREE.Object3D> };
let gltf: Promise<Gltf> | null = null;
/** GLTFLoader와 meshopt 해독기는 처음 쓸 때 한 번만 불러온다(반려동물 모형도 같은 것을 쓴다) */
export function gltfParser(): Promise<Gltf> {
  gltf ??= Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]).then(([g, m]) => {
    const loader = new g.GLTFLoader().setMeshoptDecoder(m.MeshoptDecoder);
    return { parse: (buf: ArrayBuffer) => new Promise<THREE.Object3D>((ok, no) => loader.parse(buf, '', (r) => ok(r.scene), no)) };
  }).catch((e) => {
    gltf = null;
    throw e;
  });
  return gltf;
}

/** 그림을 maxPx 안으로 줄인다(손가락 기기: 그림 메모리를 1/4로). 줄일 수 없으면 그대로 */
export async function shrinkTexture(tex: THREE.Texture, maxPx: number) {
  const img = tex.image as (ImageBitmap & { close?: () => void }) | null;
  const w = Number(img?.width), h = Number(img?.height);
  if (!img || !(w > maxPx || h > maxPx) || typeof createImageBitmap !== 'function' || typeof img.close !== 'function') return;
  const k = maxPx / Math.max(w, h);
  try {
    const small = await createImageBitmap(img, {
      resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'medium',
      premultiplyAlpha: 'none', colorSpaceConversion: 'none',
    });
    tex.image = small;
    tex.needsUpdate = true;
    img.close();
  } catch { /* 줄이지 못하면 큰 그림 그대로 */ }
}

/** 받은 GLB 바이트 → 걷기 엔진 크기의 모형. 모양이 약속과 다르면 null */
export async function parseModel(buf: ArrayBuffer, maxTexture = 1024): Promise<ModelData | null> {
  const root = await (await gltfParser()).parse(buf);
  root.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  root.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) return null;
  const m = mesh as THREE.Mesh;
  const fit = fitModel(m.geometry, m.matrixWorld);
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial | undefined;
  const texture = mat?.map ?? null;
  // 받은 재질·기하는 쓰지 않는다(텍스처만 옮겨 쓴다)
  m.geometry.dispose();
  for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
  // 그림을 풀지 못한 모형(앱 안 브라우저의 그림 풀기 문제 등. GLTFLoader는 그림 없이 재질만 준다)은 하얀 덩어리로 세우지 않는다: 판으로 선다
  const img = texture?.image as { width?: number; height?: number } | null | undefined;
  if (!fit || !texture || !(Number(img?.width) > 0 && Number(img?.height) > 0)) {
    fit?.geometry.dispose();
    texture?.dispose();
    return null;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  await shrinkTexture(texture, maxTexture);
  return { geometry: fit.geometry, texture, legs: fit.legs };
}

/**
 * 모형 주소에서 받는다. 없으면(404 등) null, 사이트가 「앞으로도 없다」(404 머리 X-Avatar-Asset: none)고 하면 'none',
 * 받다가 실패하면 던진다. 같은 손님이 다시 와도 브라우저가 들고 있게 사이트가 정한 캐시 규칙을 그대로 따른다
 */
export async function fetchModel(url: string, maxTexture = 1024): Promise<ModelData | null | 'none'> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined);
    if (res.status === 404 && res.headers.get('x-avatar-asset') === 'none') return 'none';
    if (res.status === 404 || res.status === 403 || res.status === 410) return null;
    throw new Error(`model ${res.status}`);
  }
  const len = Number(res.headers.get('content-length'));
  if (len > MODEL_MAX_BYTES) {
    void res.body?.cancel().catch(() => undefined);
    return null;
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MODEL_MAX_BYTES || buf.byteLength < 20) return null;
  // GLB 머리(glTF, 판 2)
  const head = new DataView(buf);
  if (head.getUint32(0, true) !== 0x46546c67 || head.getUint32(4, true) !== 2) return null;
  return parseModel(buf, maxTexture);
}

/** 모형이 쥔 것을 놓는다 */
export function freeModel(d: ModelData | null | undefined) {
  if (!d) return;
  d.geometry.dispose();
  const img = d.texture?.image as { close?: () => void } | null | undefined;
  d.texture?.dispose();
  img?.close?.();
}

// ───────── 걷는 다리 셰이더

/** 다리 모양 → 셰이더 값(x 축 높이, y 가랑이, z 가르는 x, w 엇갈림 반폭). 붙은 다리(치마)는 허리 둘레를 축으로 아래를 넓게 섞는다 */
export function legParams(legs: LegShape): THREE.Vector4 {
  if (legs.apart) return new THREE.Vector4(legs.crotch + MODEL_H * 0.03, legs.crotch, legs.split, MODEL_H * 0.008);
  return new THREE.Vector4(MODEL_H * 0.42, MODEL_H * 0.08, 0, MODEL_H * 0.12);
}

/**
 * 앉은 자세(다 앉았을 때, rad): 엉덩이에서 두 다리를 앞으로 드는 각, 무릎에서 정강이를 뒤로 접는 각, 두 다리를 벌리는 각.
 * 다리를 앞으로 뻗되 무릎을 굽혀 발뒤꿈치가 바닥에 닿고(발끝은 조금 들린다), 두 다리는 조금 벌어진다.
 * 무릎 없이 엉덩이에서만 꺾으면 다리가 막대처럼 서고 발바닥이 앞을 봐서, 땅에 박힌 것처럼 보였다.
 * 붙은 다리(치마·한복)도 같은 자세로 접되 벌리지 않는다(자락째 무릎을 굽힌 모양)
 */
export const SIT_HIP = 1.62;
export const SIT_KNEE = 1.1;
export const SIT_SPLAY = 0.5;
/** 앉으면 몸 전체를 엉덩이 축 둘레로 뒤로 기대는 각(rad): 다리는 그만큼 덜 들어 바닥에 그대로 있다 */
export const SIT_LEAN = 0.12;
/** 무릎 높이(m, 신발 바로 위). 가랑이가 낮은 모형은 가랑이 높이의 이 몫까지만 */
export const SIT_KNEE_Y = 0.07;
const SIT_KNEE_OF_CROTCH = 0.55;
/** 무릎에서 굽는 곳을 섞는 반폭(m): 접힌 곳이 각지지 않게 */
export const SIT_KNEE_BLEND = 0.012;
/**
 * 붙은 다리(치마·한복)의 앉는 축과, 그 아래 다 접히는 높이(키의 몫). 자락이 다리를 가리니 실제 엉덩이보다 높게 접어
 * 무릎까지 덮은 자락이 앞으로 눕게 한다(엉덩이 높이에서 접으면 세운 자락이 무릎 꿇은 것처럼 보였다)
 */
const FUSED_SIT_AXIS = 0.25;
const FUSED_SIT_FULL = 0.18;

/**
 * 다리 모양 → 앉기 셰이더 값(x 엉덩이 축 높이, y 다리가 다 접히는 높이(그 위로 축까지 섞는다), z 무릎 높이, w 뒤로 기대는 각).
 * 따로인 다리는 걷는 다리와 같은 축·섞임을 쓴다
 */
export function sitParams(legs: LegShape): THREE.Vector4 {
  if (legs.apart) {
    const hip = legParams(legs);
    return new THREE.Vector4(hip.x, hip.y - hip.w * 3, Math.min(SIT_KNEE_Y, legs.crotch * SIT_KNEE_OF_CROTCH), SIT_LEAN);
  }
  return new THREE.Vector4(MODEL_H * FUSED_SIT_AXIS, MODEL_H * FUSED_SIT_FULL, SIT_KNEE_Y, SIT_LEAN);
}
/** 다리를 벌리는 각: 붙은 다리는 벌리지 않는다(자락이 찢어진다) */
export const sitSplay = (legs: LegShape) => (legs.apart ? SIT_SPLAY : 0);

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 셰이더와 같은 식(시험용): 엉덩이 축 위로 섞는 몫(0 가랑이 아래 .. 1 축 위)과 왼쪽(-1)·오른쪽(+1) 다리 */
function legUpSide(p: { x: number; y: number }, hip: THREE.Vector4): { up: number; side: number } {
  const up = smooth(hip.y - hip.w * 3, hip.x, p.y);
  const w = hip.w * (1 + 6 * up);
  return { up, side: smooth(-w, w, p.x - hip.z) * 2 - 1 };
}

/**
 * 셰이더가 꼭짓점마다 하는 계산을 그대로 옮긴 것(시험용): 걸을 때 다리가 x 축 둘레로 도는 각.
 * 가랑이 아래는 다 돌고 엉덩이(축)에서 0이 된다. 두 다리는 반대로 돌고, 가운데는 부드럽게 섞는다(위로 갈수록 넓게: 골반이 찢어지지 않게)
 */
export function legAngle(p: { x: number; y: number }, swing: number, hip: THREE.Vector4): number {
  const { up, side } = legUpSide(p, hip);
  return swing * side * (1 - up);
}

type V3 = { x: number; y: number; z: number };
/** x 축 둘레로 높이 py·깊이 0을 축으로 돌린다(+각이면 축 아래가 뒤로) */
function turnX(v: V3, a: number, py: number): V3 {
  const c = Math.cos(a), s = Math.sin(a), y = v.y - py;
  return { x: v.x, y: py + y * c - v.z * s, z: y * s + v.z * c };
}
/** y 축 둘레로 x = px·깊이 0을 축으로 돌린다(+각이면 앞이 +x 쪽으로) */
function turnY(v: V3, a: number, px: number): V3 {
  const c = Math.cos(a), s = Math.sin(a), x = v.x - px;
  return { x: px + x * c + v.z * s, y: v.y, z: -x * s + v.z * c };
}

/**
 * 셰이더가 한 꼭짓점을 옮기는 자리(시험용). 앉기(sit 0..1): 무릎 아래를 무릎 축 둘레로 뒤로 접고, 다리를 엉덩이 축 둘레로 앞으로 들고,
 * 두 다리를 벌린다(바깥으로). 그다음 걷는 각으로 걷는 엉덩이 축 둘레를 돌린다
 */
export function legMove(p: V3, swing: number, hip: THREE.Vector4, sit = 0, seat: THREE.Vector4 = new THREE.Vector4(hip.x, hip.y - hip.w * 3, SIT_KNEE_Y, SIT_LEAN), splay = SIT_SPLAY): V3 {
  let v = { ...p };
  if (sit > 0) {
    const full = 1 - smooth(seat.y, seat.x, p.y);
    const shin = 1 - smooth(seat.z - SIT_KNEE_BLEND, seat.z + SIT_KNEE_BLEND, p.y);
    v = turnX(v, sit * SIT_KNEE * shin, seat.z);
    v = turnX(v, -sit * (SIT_HIP - seat.w) * full, seat.x);
    v = turnY(v, sit * splay * legUpSide(p, hip).side * full, hip.z);
    v = turnX(v, -sit * seat.w, seat.x);
  }
  return turnX(v, legAngle(p, swing, hip), hip.x);
}

const LEG_COMMON = /* glsl */`#include <common>
uniform float legSwing;
uniform vec4 legHip;
uniform vec4 legSit;
uniform vec4 legSeat;
float legUp( vec3 p ) {
	return smoothstep( legHip.y - legHip.w * 3.0, legHip.x, p.y );
}
float legSide( vec3 p, float up ) {
	float w = legHip.w * ( 1.0 + 6.0 * up );
	return smoothstep( - w, w, p.x - legHip.z ) * 2.0 - 1.0;
}
float legAngle( vec3 p ) {
	float up = legUp( p );
	return legSwing * legSide( p, up ) * ( 1.0 - up );
}
vec3 legTurn( vec3 v, float a, float py ) {
	float c = cos( a ), s = sin( a );
	float y = v.y - py;
	return vec3( v.x, py + y * c - v.z * s, y * s + v.z * c );
}
vec3 legYaw( vec3 v, float a, float px ) {
	float c = cos( a ), s = sin( a );
	float x = v.x - px;
	return vec3( px + x * c + v.z * s, v.y, - x * s + v.z * c );
}
vec3 legSitTurn( vec3 v, vec3 p, float pivot ) {
	float s = legSit.x;
	if ( s <= 0.0 ) return v;
	float full = 1.0 - smoothstep( legSeat.y, legSeat.x, p.y );
	float shin = 1.0 - smoothstep( legSeat.z - ${SIT_KNEE_BLEND.toFixed(3)}, legSeat.z + ${SIT_KNEE_BLEND.toFixed(3)}, p.y );
	v = legTurn( v, s * legSit.z * shin, legSeat.z * pivot );
	v = legTurn( v, - s * ( legSit.y - legSeat.w ) * full, legSeat.x * pivot );
	v = legYaw( v, s * legSit.w * legSide( p, legUp( p ) ) * full, legHip.z * pivot );
	return legTurn( v, - s * legSeat.w, legSeat.x * pivot );
}`;
const LEG_NORMAL = /* glsl */`#include <beginnormal_vertex>
float legA = legAngle( position );
objectNormal = legTurn( legSitTurn( objectNormal, position, 0.0 ), legA, 0.0 );`;
const LEG_BEGIN = /* glsl */`#include <begin_vertex>
transformed = legTurn( legSitTurn( transformed, position, 1.0 ), legA, legHip.x );`;

/**
 * 모형 하나가 쓰는 셰이더 값: 걷는 다리 각(rad)과 다리 모양, 앉기(x 앉은 몫 0..1, y 엉덩이 각, z 무릎 각, w 벌리는 각 rad),
 * 앉는 자리(sitParams: 축·섞임·무릎 높이와 기대는 각). 캐릭터마다 따로(걸음이 저마다 다르다)
 */
export type LegUniforms = { legSwing: { value: number }; legHip: { value: THREE.Vector4 }; legSit: { value: THREE.Vector4 }; legSeat: { value: THREE.Vector4 } };
/** 새 모형의 셰이더 값(서 있음) */
export function legUniforms(): LegUniforms {
  return {
    legSwing: { value: 0 }, legHip: { value: new THREE.Vector4() },
    legSit: { value: new THREE.Vector4(0, SIT_HIP, SIT_KNEE, SIT_SPLAY) }, legSeat: { value: new THREE.Vector4() },
  };
}

/** 모형 재질: 그림을 빛으로 받되 조금 스스로 밝히고, 걷는 다리를 꼭짓점 셰이더로 돌린다 */
export function modelMaterial(tex: THREE.Texture | null, u: LegUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.85, metalness: 0,
    emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: tex ? MODEL_GLOW : 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.legSwing = u.legSwing;
    shader.uniforms.legHip = u.legHip;
    shader.uniforms.legSit = u.legSit;
    shader.uniforms.legSeat = u.legSeat;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', LEG_COMMON)
      .replace('#include <beginnormal_vertex>', LEG_NORMAL)
      .replace('#include <begin_vertex>', LEG_BEGIN);
  };
  // 모든 모형이 셰이더 하나를 함께 쓴다(값만 캐릭터마다 다르다)
  mat.customProgramCacheKey = () => 'model-legs';
  mat.userData.legs = u;
  return mat;
}

/** 3D 모형의 이름표 높이(모형 머리 위) */
const MODEL_LABEL_Y = MODEL_H + 0.08;
/**
 * 3D 모형의 걸음: 다리 각은 인형 다리 각의 이만큼(짧은 다리가 너무 크게 휘지 않게). 다리가 붙은 모형(치마·한복)은
 * 다리 대신 몸을 좌우로 살짝 흔들고(rad) 치맛자락을 조금 비튼다(rad)
 */
const MODEL_LEG = 0.8;
const SKIRT_ROLL = 0.05;
const SKIRT_SWISH = 0.12;
/** 앉은 모형: 엉덩이 축을 바닥에서 이만큼(m, 앞으로 든 다리의 두께 몫) 띄운다 */
const MODEL_SIT_GAP = 0.05;
/** 앉은 인형: 다리를 앞으로 드는 각(rad)과 몸을 내리는 높이(m: 엉덩이 관절 높이에서 다리 두께를 뺀 만큼) */
const DOLL_SIT_LEG = 1.45;
const DOLL_SIT_DROP = 0.22;
/** 사진 판의 걸음: 옆모습에서 다리가 벌어지는 각(rad), 앞·뒷모습에서 발이 들리는 높이(m) */
const CARD_SPREAD = 0.22;
const CARD_STEP = 0.05;

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

/** 걸은 거리 1m에 이만큼(m)까지 오르내리는 것은 경사로 본다(계단보다 조금 가파르게). 넘는 몫이 턱이다 */
export const LEDGE_SLOPE = 1.0;
/** 턱에서 벌어진 높이를 푸는 시정수(초)와, 이보다 크게 벌어지면 완충하지 않고 바로 맞추는 높이(m) */
export const LEDGE_TAU = 0.07;
export const LEDGE_MAX = 0.5;

/**
 * 턱 완충 한 프레임. 보이는 높이(눈높이·캐릭터·그림자) = 몸 높이 + off.
 * 몸 높이가 이번 프레임에 걸은 거리(moved)로는 설명되지 않게 바뀌면(낮은 무대 가장자리 같은 수직 턱) 그 몫을 off에 담고,
 * 담긴 것은 천천히 0으로 푼다: 한 프레임에 눈높이가 툭 튀지 않고 스르르 오르내린다.
 * 계단·경사면은 걸은 만큼만 높이가 바뀌어 off가 생기지 않는다(발이 계단에 묻히거나 뜨지 않는다).
 */
export function ledgeEase(off: number, dy: number, moved: number, dt: number): number {
  const slope = Math.max(-moved * LEDGE_SLOPE, Math.min(moved * LEDGE_SLOPE, dy));
  const o = off * Math.exp(-Math.max(0, dt) / LEDGE_TAU) - (dy - slope);
  return Math.abs(o) > LEDGE_MAX || Math.abs(o) < 1e-3 ? 0 : o;
}

/** a에서 b로 가는 가장 짧은 각 차이(-π..π) */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 도착해서 돌 때: 가장 빠른 돌기(rad/s, 걷는 중 시선이 따라 도는 빠르기와 비슷하게), 따라가는 시정수(초), 다 돈 것으로 치는 남은 각(rad) */
const TURN_RATE = 2.5;
const TURN_TAU = 0.12;
const TURN_DONE = 0.03;

/**
 * 걸어서 도착한 뒤 목적지 쪽으로 도는 한 프레임. 작은 각은 금방, 큰 각도 TURN_RATE보다 빠르게는 돌지 않는다(어지럽지 않게).
 * 남은 각이 TURN_DONE 안이면 그 방향에 맞추고 done. dt가 아주 크면(줄인 움직임) 한 번에 맞춘다.
 */
export function turnStep(cur: number, target: number, dt: number): { a: number; done: boolean } {
  const d = angleDiff(cur, target);
  const max = TURN_RATE * Math.max(0, dt);
  const s = Math.max(-max, Math.min(max, d * follow(dt, TURN_TAU)));
  return Math.abs(d - s) <= TURN_DONE ? { a: cur + d, done: true } : { a: cur + s, done: false };
}

/** 사진 캐릭터의 방향 그림: 45도씩 여덟 구역. 경계를 이만큼(6도) 넘어야 옆 구역으로 넘어간다(경계에 선 채 그림이 깜박이지 않게) */
const VIEW_STEP = Math.PI / 4;
export const VIEW_HOLD = (6 * Math.PI) / 180;

/**
 * 캐릭터가 보는 쪽에서 카메라 쪽까지의 각 rel(rad, 캐릭터 왼쪽이 +)이 여덟 구역 가운데 어디인가: -3..4.
 * 0이 앞(카메라가 얼굴 앞), 4가 뒤, +는 카메라가 캐릭터 왼쪽에 있는 쪽. prev(지난 구역)를 주면 경계를 VIEW_HOLD만큼 넘기 전에는 그 구역에 머문다.
 */
export function viewZone(rel: number, prev: number | null = null): number {
  const r = Number.isFinite(rel) ? angleDiff(0, rel) : 0;
  if (prev !== null && Math.abs(angleDiff(prev * VIEW_STEP, r)) <= VIEW_STEP / 2 + VIEW_HOLD) return prev;
  const k = Math.round(r / VIEW_STEP);
  // 꼭 뒤(-180도와 180도)는 한 구역이다. `|| 0`은 -0을 0으로 맞춘다
  return (k <= -4 ? 4 : k) || 0;
}

/**
 * 구역 → 방향 그림 묶음의 칸(0 앞, 1 앞 비스듬, 2 옆, 3 뒤 비스듬, 4 뒤)과 좌우 뒤집기.
 * 비스듬·옆 그림은 그림 왼쪽을 본다(캐릭터의 왼쪽 옆모습). 카메라가 캐릭터 왼쪽에 있으면 캐릭터는 화면 왼쪽을 보므로 그대로,
 * 오른쪽에 있으면 뒤집는다
 */
export function viewCell(zone: number): { cell: number; flip: boolean } {
  return { cell: Math.min(4, Math.abs(zone)), flip: zone < 0 };
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

/** 길의 한 점. y(그 점의 바닥 높이)는 있으면 모퉁이를 미리 돌 때 「정말 그 점에 닿는 길인가」를 확인하는 데 쓴다 */
export type PathPoint = { x: number; z: number; level: 1 | 2; y?: number };
export type PathRun = { pts: PathPoint[]; i: number; stuck: number };
type BodyLike = { x: number; z: number; level: 1 | 2 };

/** 중간 점은 이만큼(m) 다가가면 다음 점으로, 마지막 점은 더 가까이 */
const PASS_R = 0.35;
const ARRIVE_R = 0.2;
/** 모퉁이를 미리 돌 수 없으면(다음 점까지 곧게 못 간다) 점에 이만큼 바짝 닿은 뒤 넘어간다 */
const TIGHT_R = 0.06;
/** 이 시간(초) 넘게 제대로 못 나아가면 막힌 것이다 */
export const STUCK_S = 1;

export function startPath(pts: PathPoint[]): PathRun {
  return { pts: pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)), i: 0, stuck: 0 };
}

/**
 * 자동 걷기 한 프레임. 다음 점 쪽으로 speed로 옮기고, 바라볼 방향(yaw, 걷기 화면 규칙: 앞 = (-sin, -cos))을 돌려준다.
 * 마지막 점에 같은 층으로 닿으면 'arrive', 1초 넘게 막히면 'stuck'.
 * clear(몸, 점)는 몸에서 그 점까지 곧게 걸어갈 수 있는지 알려 준다. 길의 꺾이는 점은 늘 문설주·벽 끝 바로 옆이라,
 * 미리 꺾은 선이 벽 끝을 스치면 거기서 멈춘다: 곧게 갈 수 있을 때만 모퉁이를 미리 돈다. clear를 안 주면 늘 미리 돈다.
 */
export function pathStep<B extends BodyLike>(
  run: PathRun, body: B, dt: number, speed: number, move: (b: B, dx: number, dz: number) => B,
  clear?: (b: B, to: PathPoint) => boolean,
): { body: B; heading: number | null; done: 'arrive' | 'stuck' | null } {
  while (run.i < run.pts.length) {
    const p = run.pts[run.i];
    const d = Math.hypot(p.x - body.x, p.z - body.z);
    if (run.i === run.pts.length - 1) {
      if (d <= ARRIVE_R && p.level === body.level) run.i++;
      else break;
    } else if (d <= TIGHT_R || (d <= PASS_R && (!clear || clear(body, run.pts[run.i + 1])))) run.i++;
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

/** 다리·팔 관절 자리와 팔이 벌어진 각(서 있는 자세) */
const LEG_X = 0.075, LEG_Y = 0.28;
const ARM_X = 0.175, ARM_Y = 0.6, ARM_TILT = 0.12;

/** 머리·몸통·엉덩이 한 덩이(몸통은 윗옷 색, 엉덩이는 바지 색). 걷는 동안에도 서로 움직이지 않는 부분이다 */
export function buildTrunk(d: DollLook): G {
  const parts = [
    buildHead(d),
    tint(new THREE.CapsuleGeometry(0.15, 0.1, 6, 16).scale(1.05, 1, 0.9).translate(0, 0.47, 0), d.top),
    tint(new THREE.CylinderGeometry(0.15, 0.165, 0.12, 16).translate(0, 0.32, 0), d.bottom),
  ];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** 팔 하나(윗옷 색 소매) + 손(피부색). 원점은 어깨 관절 */
export function buildArm(top: string, skin: string): G {
  const arm = tint(new THREE.CapsuleGeometry(0.045, 0.14, 4, 10).translate(0, -0.115, 0), top);
  const hand = tint(new THREE.SphereGeometry(0.05, 10, 8).translate(0, -0.24, 0), skin);
  const g = mergeGeometries([arm, hand])!;
  arm.dispose();
  hand.dispose();
  return g;
}

/** 서 있는 자세의 인형 전체 한 덩이: 몸통 덩이에 다리 둘·팔 둘을 관절 자리에 붙여 굽는다 */
export function buildRest(trunk: G, leg: G, arm: G): G {
  const parts = [
    trunk.clone(),
    leg.clone().translate(-LEG_X, LEG_Y, 0),
    leg.clone().translate(LEG_X, LEG_Y, 0),
    arm.clone().rotateZ(-ARM_TILT).translate(-ARM_X, ARM_Y, 0),
    arm.clone().rotateZ(ARM_TILT).translate(ARM_X, ARM_Y, 0),
  ];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

// ───────── 함께 쓰는 기하(참조 수)와 재질 모음

/** 살아 있는 캐릭터 수 */
let liveAvatars = 0;
const mats = new Map<string, { m: THREE.Material; refs: number }>();
/** 겉모습마다 구운 몸통 덩이·다리·팔·서 있는 온몸, 사진 판(키 문자열 → 기하) */
const geos = new Map<string, { g: THREE.BufferGeometry; refs: number }>();
let liveLabels = 0;
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

// ───────── 사진 캐릭터 그림: 주소마다 한 장(참조 수).
// 먼저 여러 방향 그림 묶음(<주소>/views: 앞, 앞 비스듬, 옆, 뒤 비스듬, 뒤가 한 줄)을 받고, 없으면 예전처럼 그림 한 장을 받는다.
// 한 장 그림은 30명이 모여도 GPU 메모리가 크지 않게 세로 768px로 줄인다. 묶음은 두 크기로 만들어져 있어 줄이지 않고 그대로 쓴다

const PHOTO_PX = 768;
/** 방향 그림 묶음의 크기: l(큰 것), s(작은 것. 손가락 기기가 쓴다) */
export type PhotoSize = 'l' | 's';
/** 묶음의 칸 수. 칸 하나가 2:3이라 묶음은 가로:세로 10:3이다 */
const VIEW_CELLS = 5;
const ATLAS_RATIO = (VIEW_CELLS * 2) / 3;
/** 묶음이 없던 주소는 이 시간 동안 다시 묻지 않는다(아직 여러 방향이 그려지지 않은 캐릭터를 만날 때마다 없는 주소를 두드리지 않게) */
const VIEWS_RETRY_MS = 3 * 60 * 1000;
type PhotoSource = THREE.Texture | (CanvasImageSource & { width: number; height: number });
type PhotoEntry = {
  refs: number;
  /** 불러오기가 끝나면(실패해도) 풀린다. 성공이면 mat·depth가 채워져 있다 */
  wait: Promise<void>;
  tex?: THREE.Texture;
  /** 받은 그림이 방향 그림 묶음인가(아니면 그림 한 장) */
  views?: boolean;
  /** 판 재질의 본(캐릭터마다 이것을 본떠 걸음 값만 다른 재질을 만든다) */
  mat?: THREE.MeshStandardMaterial;
  depth?: THREE.MeshDepthMaterial;
  /** 그림자만 드리우는 판의 재질(그런 판을 처음 둘 때 만든다) */
  shade?: THREE.MeshBasicMaterial;
  /** 이 그림을 쓰는 캐릭터들이 걸어 둔 알림: 방향 그림 묶음이 뒤늦게 와 재질이 바뀌면 부른다 */
  users: Set<() => void>;
  /** 묶음을 다시 물어보려고 걸어 둔 예약(없으면 undefined) */
  recheck?: unknown;
};
/** 열쇠는 크기와 주소(같은 주소라도 크기가 다르면 다른 그림이다) */
const photos = new Map<string, PhotoEntry>();
/** 묶음을 받지 못한 주소 → 그때(ms) */
const viewsMissed = new Map<string, number>();
/**
 * 묶음 주소 → 지금까지 다시 물은 수. 항목(캐릭터가 쓰는 그림)이 아니라 주소에 둔다:
 * 가까이 왔다 멀어지기를 되풀이해도 다시 묻기가 처음부터 시작하지 않게(한 화면에서 주소마다 VIEWS_RECHECK_MS 수까지)
 */
const viewsChecks = new Map<string, number>();
const realClock = () => performance.now();
let photoClock = realClock;
/**
 * 묶음이 없어 그림 한 장으로 선 캐릭터는, 처음 없었던 때부터 이 시각들(ms)에 묶음을 다시 물어본다.
 * 그림 일꾼은 캐릭터 그림이 다 된 뒤 30초~1분쯤 지나 방향 그림을 만든다. 캐릭터를 막 만들고 걸으러 온 손님이
 * 화면을 다시 열지 않아도 방향 그림으로 바뀌게 한다. 네 번 물어도 없으면 그만둔다(옛 캐릭터이거나 그리지 못한 것)
 */
export const VIEWS_RECHECK_MS = [45_000, 90_000, 180_000, 360_000];
/** 예약하는 방법(시험에서 바꿔 끼운다) */
export type PhotoTimers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
const realTimers: PhotoTimers = {
  set: (fn, ms) => {
    const h = setTimeout(fn, ms);
    // 노드에서는 이 예약 하나 때문에 프로세스가 끝나지 못하는 일이 없게 한다(브라우저의 예약 번호에는 unref가 없다)
    (h as unknown as { unref?: () => void }).unref?.();
    return h;
  },
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
let photoTimers = realTimers;

const browserLoad = (url: string) => new Promise<PhotoSource>((resolve, reject) => {
  if (typeof Image === 'undefined') return reject(new Error('no image'));
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('load'));
  img.src = url;
});
let loadPhoto: (url: string) => Promise<PhotoSource> = browserLoad;
/**
 * 시험용: 그림을 불러오는 방법을 바꾼다(null이면 브라우저 Image). 받는 쪽은 주소를 보고 묶음(…/views?s=…)과 그림 한 장을 가려 줄 수 있다.
 * 시계(ms)와 예약하는 방법도 바꿀 수 있다. 부를 때마다 「묶음이 없던 주소」 기억을 지운다
 */
export function setPhotoLoader(fn: ((url: string) => Promise<PhotoSource>) | null, clock: (() => number) | null = null, timers: PhotoTimers | null = null) {
  loadPhoto = fn ?? browserLoad;
  photoClock = clock ?? realClock;
  photoTimers = timers ?? realTimers;
  viewsMissed.clear();
  viewsChecks.clear();
}

/** 방향 그림 묶음의 주소 */
export const viewsUrl = (url: string, size: PhotoSize) => `${url}/views?s=${size}`;

/** 받은 그림의 가로·세로(알 수 없으면 null) */
function sizeOf(src: PhotoSource): { w: number; h: number } | null {
  const img = ((src as THREE.Texture).isTexture ? (src as THREE.Texture).image : src) as { width?: number; height?: number } | null | undefined;
  const w = Number(img?.width), h = Number(img?.height);
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * 그 사람의 그림을 받는다: 묶음을 먼저 묻고, 없거나 묶음 모양이 아니면 그림 한 장.
 * 묶음이 없던 주소는 VIEWS_RETRY_MS 동안 기억해 바로 한 장을 받는다
 */
async function loadLook(url: string, size: PhotoSize, wanted: () => boolean): Promise<{ src: PhotoSource; views: boolean }> {
  const vu = viewsUrl(url, size);
  const missed = viewsMissed.get(vu);
  if (missed === undefined || photoClock() - missed >= VIEWS_RETRY_MS) {
    try {
      const src = await loadPhoto(vu);
      const d = sizeOf(src);
      // 크기를 알 수 있으면 묶음 모양(10:3)인지 본다. 다른 그림이 왔으면 쓰지 않는다
      if (!d || Math.abs(d.w / d.h / ATLAS_RATIO - 1) < 0.03) {
        viewsMissed.delete(vu);
        return { src, views: true };
      }
    } catch { /* 아래에서 그림 한 장으로 돌아간다 */ }
    const t = photoClock();
    // 기억이 한없이 늘지 않게, 많이 쌓이면 지난 것을 치운다
    if (viewsMissed.size > 256) for (const [k, at] of viewsMissed) if (t - at >= VIEWS_RETRY_MS) viewsMissed.delete(k);
    viewsMissed.set(vu, t);
    // 묶음을 묻는 사이 쓰는 사람이 없어졌으면 그림 한 장도 받지 않는다
    if (!wanted()) throw new Error('unwanted');
  }
  return { src: await loadPhoto(url), views: false };
}

// 그림을 한꺼번에 받아 풀지 않는다: 큰 그림 한 장을 푸는 데 수 MB가 들어, 사진 캐릭터 서른 명이 함께 들어오면
// 순간 메모리가 크게 뛴다(휴대폰에서 탭이 죽을 수 있다). 몇 장씩 차례로 받는다
const PHOTO_LOADS = 3;
/** 3D 모형은 둘씩(풀고 다듬는 일이 그림보다 무겁다). 그림과 따로 줄을 서서 서로 막지 않는다 */
const MODEL_LOADS = 2;
/** 한 번에 limit개씩만 받는 줄 */
function turns(limit: number) {
  let busy = 0;
  const queue: Array<() => void> = [];
  return <T>(job: () => Promise<T>, wanted: () => boolean): Promise<T> => {
    const turn = new Promise<void>((go) => {
      if (busy < limit) {
        busy++;
        go();
      } else queue.push(() => { busy++; go(); });
    });
    return turn.then(() => {
      // 차례를 기다리는 사이 쓰는 사람이 없어졌으면(장면이 바뀌었거나 그 사람이 나갔다) 받지 않고 자리를 넘긴다:
      // 죽은 요청 수십 건이 줄을 막아 새 장면의 그림(내 캐릭터 포함)이 한참 뒤에야 서는 일이 없게
      if (!wanted()) throw new Error('unwanted');
      return job();
    }).finally(() => {
      busy--;
      queue.shift()?.();
    });
  };
}
const loadInTurn = turns(PHOTO_LOADS);
const modelInTurn = turns(MODEL_LOADS);

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

/**
 * 묶음은 캔버스로 줄이지 않고 받은 그대로 올린다: 몸 바깥으로 번지게 채워 둔 색(멀리서 가장자리가 어둡게 물들지 않게 하는 띠)이
 * 캔버스를 거치면 지워진다
 */
function atlasTexture(src: PhotoSource): THREE.Texture {
  if ((src as THREE.Texture).isTexture) return src as THREE.Texture;
  const tex = new THREE.Texture(src as unknown as HTMLImageElement);
  tex.needsUpdate = true;
  return tex;
}

const photoKey = (url: string, size: PhotoSize) => `${size}:${url}`;

/** 받은 그림으로 항목의 텍스처와 재질을 만든다(처음 받았을 때와, 묶음이 뒤늦게 와 바꿔 끼울 때) */
function dress(entry: PhotoEntry, src: PhotoSource, views: boolean) {
  const tex = views ? atlasTexture(src) : toTexture(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 비스듬히(내려다보거나 옆으로 스쳐) 볼 때 그림이 뭉개지지 않게
  tex.anisotropy = 4;
  entry.tex = tex;
  entry.views = views;
  // 판은 빛을 받되 그늘에서도 그림이 칙칙하지 않게 그림 자체를 조금 밝힌다.
  // 가장자리는 알파 0.5에서 자르되 화소 안의 덮인 몫으로 다듬는다(alphaToCoverage): 계단이 줄고, 반투명으로 섞지 않으니 깊이 순서도 그대로다.
  // 다만 덮인 몫을 정하려고 내보낸 알파가 캔버스에 그대로 적히면 가장자리 화소가 반투명해져 페이지 바탕이 비친다(옅은 테).
  // 색은 덮어쓰고(One, Zero) 알파는 있던 값을 그대로 두게(Zero, One) 섞는 식을 잡는다
  entry.mat = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95,
    emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: PHOTO_GLOW,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  // 캐릭터마다 걸음 값이 달라 판은 이 재질을 본뜬 저마다의 재질로 그린다(텍스처는 함께 쓴다)
  photoShader(entry.mat, STILL_GAIT);
  entry.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  entry.shade = undefined;
}

/** 항목이 쥔 텍스처와 재질을 놓는다 */
function undress(e: Pick<PhotoEntry, 'tex' | 'mat' | 'depth' | 'shade'>) {
  e.tex?.dispose();
  releaseCanvas(e.tex);
  e.mat?.dispose();
  e.depth?.dispose();
  e.shade?.dispose();
}

/**
 * 묶음이 없어 그림 한 장으로 선 항목: 그 주소의 다음 다시 묻기를 예약한다. 묶음이 오면 재질을 바꾸고 쓰는 캐릭터들에게 알린다.
 * 쓰는 캐릭터가 없어지면 dropPhoto가 예약을 지운다
 */
function recheckViews(key: string, entry: PhotoEntry, url: string, size: PhotoSize) {
  const vu = viewsUrl(url, size);
  const n = viewsChecks.get(vu) ?? 0;
  if (n >= VIEWS_RECHECK_MS.length || entry.refs <= 0 || photos.get(key) !== entry || entry.recheck !== undefined) return;
  const live = () => entry.refs > 0 && photos.get(key) === entry;
  entry.recheck = photoTimers.set(() => {
    entry.recheck = undefined;
    if (!live()) return;
    loadInTurn(() => loadPhoto(vu), live).then((src) => {
      const d = sizeOf(src);
      if (d && Math.abs(d.w / d.h / ATLAS_RATIO - 1) >= 0.03) throw new Error('not an atlas');
      if (!live()) {
        // 받는 사이 쓰는 캐릭터가 없어졌다: 받은 것이 텍스처면 놓는다
        if ((src as THREE.Texture).isTexture) (src as THREE.Texture).dispose();
        return;
      }
      const old = { tex: entry.tex, mat: entry.mat, depth: entry.depth, shade: entry.shade };
      dress(entry, src, true);
      viewsMissed.delete(vu);
      viewsChecks.delete(vu);
      // 캐릭터들이 새 재질과 방향 판으로 바꿔 끼운 다음에 옛것을 놓는다
      for (const tell of [...entry.users]) tell();
      undress(old);
    }).catch((err) => {
      // 기다리는 사이 쓰는 캐릭터가 없어져 묻지 않은 것은 세지 않는다. 물었는데 없었으면 「없던 때」도 새로 적는다
      // (곧 다시 온 캐릭터가 처음 묻기로 또 두드리지 않게)
      if (!(err instanceof Error && err.message === 'unwanted')) {
        viewsChecks.set(vu, n + 1);
        viewsMissed.set(vu, photoClock());
      }
      recheckViews(key, entry, url, size);
    });
  }, VIEWS_RECHECK_MS[n] - (n > 0 ? VIEWS_RECHECK_MS[n - 1] : 0));
}

function takePhoto(url: string, size: PhotoSize): PhotoEntry {
  const key = photoKey(url, size);
  let e = photos.get(key);
  if (!e) {
    const entry: PhotoEntry = { refs: 0, wait: Promise.resolve(), users: new Set() };
    const wanted = () => entry.refs > 0;
    entry.wait = loadInTurn(() => loadLook(url, size, wanted), wanted).then(({ src, views }) => {
      if (entry.refs <= 0) return;
      dress(entry, src, views);
      if (!views) recheckViews(key, entry, url, size);
    }).catch(() => undefined);
    photos.set(key, entry);
    e = entry;
  }
  e.refs++;
  return e;
}
/** 다 쓴 캔버스 텍스처의 원본 2D 캔버스를 비운다(쓰레기 수거를 기다리지 않게). textures.ts의 것과 같다: 이 파일은 three만 불러온다 */
function releaseCanvas(t: THREE.Texture | null | undefined) {
  const c = (t as THREE.CanvasTexture | null | undefined)?.isCanvasTexture ? (t!.image as { width: number; height: number } | null) : null;
  if (c) c.width = c.height = 0;
}
function dropPhoto(key: string) {
  const e = photos.get(key);
  if (!e || --e.refs > 0) return;
  if (e.recheck !== undefined) photoTimers.clear(e.recheck);
  e.recheck = undefined;
  e.users.clear();
  undress(e);
  photos.delete(key);
}

// ───────── 사진 캐릭터의 3D 모형: 그림 주소마다 하나(참조 수). 모형 주소는 <그림 주소>/model이고 없으면 본문 없는 404다.
// 엔진이 원하는 캐릭터(나와 가까운 몇 명)만 받는다. 원하는 캐릭터가 모두 놓아도 잠시(MODEL_LINGER_MS) 들고 있다가 놓는다:
// 가까운 사람 목록을 드나드는 캐릭터의 모형을 그때마다 다시 풀지 않게

type ModelEntry = {
  refs: number;
  /** 처음 받기가 끝났는가(없거나 실패해도) */
  done: boolean;
  data?: ModelData;
  /** 이 모형을 원하는 캐릭터들의 알림: 모형이 뒤늦게 오면 부른다 */
  users: Set<() => void>;
  recheck?: unknown;
  linger?: unknown;
  /** 지금 받는 중(처음 받기든 다시 묻기든) */
  loading?: boolean;
  /** 다음 다시 묻기는 차례를 기다리지 않고 바로(사이트가 3D가 다 됐다고 알렸다. modelNow) */
  soon?: boolean;
};
/** 열쇠는 크기와 그림 주소(손가락 기기는 모형 그림을 줄여 받는다) */
const models = new Map<string, ModelEntry>();
/** 3D 모형 주소 */
export const modelUrl = (url: string) => `${url}/model`;
/**
 * 모형이 없던 캐릭터는 처음 없었던 때부터 이 시각들(ms)에 다시 물어본다. 3D 서비스는 그림이 다 된 뒤 줄을 서서 만든다:
 * 줄이 비어 있으면 그림이 다 되고 30초 남짓 뒤에 생기므로 첫 다시 묻기는 40초다(캐릭터를 막 만들고 걸으러 온 화면이 1분 30초를
 * 기다리지 않게). 줄이 길면 몇 분이 걸릴 수 있다.
 * 그 모형을 원하는 캐릭터가 있는 동안만 묻는다(청중 수십 명이 한꺼번에 와도 사이트를 두드리지 않게 셋째부터는 그림 묶음보다 사이를 넓게).
 * 40초 차례가 늘린 요청: 한 화면에서 모형 없이 만난 사진 캐릭터 주소(내 캐릭터와 가까운 몇 명)마다 본문 없는 404가 많아야 한 번
 * (끝내 없으면 10분 동안 묻는 수가 처음 묻기까지 4번에서 5번. 40초에 이미 생겨 있으면 90초 묻기가 빠져 그대로다)
 */
export const MODEL_RECHECK_MS = [40_000, 90_000, 240_000, 600_000];
/**
 * 그 차례를 다 쓴 뒤에도 원하는 동안은 이 간격으로 드물게 묻는다(마지막으로 없었던 때부터).
 * 발표장처럼 여럿이 한꺼번에 캐릭터를 만들면 모형이 10분 넘게 걸릴 수 있다: 그래도 가까이 있는 사람 화면에서 끝내 생기게
 */
export const MODEL_SLOW_MS = 240_000;
/** 원하는 캐릭터가 없어진 모형을 들고 있는 시간(ms) */
export const MODEL_LINGER_MS = 20_000;
/** 손가락 기기는 모형 그림을 이 크기(px) 안으로 줄인다(그림 메모리 1/4) */
const MODEL_TEX_SMALL = 512;
const realModelLoad = (url: string, size: PhotoSize) => fetchModel(url, size === 's' ? MODEL_TEX_SMALL : 1024);
let loadModel: (url: string, size: PhotoSize) => Promise<ModelData | null | 'none'> = realModelLoad;
/**
 * 모형 주소 → 없었던 수(물었는데 없거나 실패한 수). 항목이 아니라 주소에 둔다: 가까운 사람 목록을 드나들 때마다
 * 처음부터 다시 묻지 않게(한 화면에서 주소마다 처음 한 번 + MODEL_RECHECK_MS 수, 그 뒤로는 원하는 동안 MODEL_SLOW_MS마다)
 */
const modelMisses = new Map<string, { n: number; at: number }>();
/** 사이트가 「앞으로도 없다」(X-Avatar-Asset: none)고 한 모형 주소: 이 화면에서는 다시 묻지 않는다 */
const modelsGone = new Set<string>();
/**
 * 시험용: 모형을 받는 방법을 바꾼다(null이면 사이트에서). 없으면 null, 앞으로도 없으면 'none'을 돌려준다.
 * 시계와 예약은 setPhotoLoader의 것을 함께 쓴다. 부를 때마다 주소마다의 기억을 지운다
 */
export function setModelLoader(fn: ((url: string, size: PhotoSize) => Promise<ModelData | null | 'none'>) | null) {
  loadModel = fn ?? realModelLoad;
  modelMisses.clear();
  modelsGone.clear();
}
/** 받은 답을 주소의 기억에 적는다. 모형이면 그것을, 아니면 undefined */
function noteModel(url: string, data: ModelData | null | 'none'): ModelData | undefined {
  const mu = modelUrl(url);
  if (data && data !== 'none') {
    modelMisses.delete(mu);
    return data;
  }
  if (data === 'none') modelsGone.add(mu);
  else modelMisses.set(mu, { n: (modelMisses.get(mu)?.n ?? 0) + 1, at: photoClock() });
  return undefined;
}
const modelKey = (url: string, size: PhotoSize) => `${size}:${url}`;

/** 모형을 놓고 목록에서 지운다 */
function forgetModel(key: string, e: ModelEntry) {
  if (e.linger !== undefined) photoTimers.clear(e.linger);
  if (e.recheck !== undefined) photoTimers.clear(e.recheck);
  e.linger = e.recheck = undefined;
  if (models.get(key) === e) models.delete(key);
  freeModel(e.data);
  e.data = undefined;
}

/** 모형이 없던(또는 받다가 실패한) 항목: 그 주소의 다음 다시 묻기를 예약한다. 오면 원하는 캐릭터들에게 알린다 */
function recheckModel(key: string, e: ModelEntry, url: string, size: PhotoSize) {
  const mu = modelUrl(url);
  const st = modelMisses.get(mu);
  // 없었던 수가 1이면 첫 다시 묻기(MODEL_RECHECK_MS[0]). 차례를 다 썼으면 마지막으로 없었던 때부터 MODEL_SLOW_MS 뒤
  // (그 뒤에 다시 원하게 됐으면 곧바로)
  const n = (st?.n ?? 1) - 1;
  if (modelsGone.has(mu) || e.refs <= 0 || models.get(key) !== e || e.recheck !== undefined || e.data || e.loading) return;
  const soon = e.soon === true;
  e.soon = false;
  const wait = soon ? 0 : n < MODEL_RECHECK_MS.length
    ? MODEL_RECHECK_MS[n] - (n > 0 ? MODEL_RECHECK_MS[n - 1] : 0)
    : Math.max(0, (st?.at ?? photoClock()) + MODEL_SLOW_MS - photoClock());
  const live = () => e.refs > 0 && models.get(key) === e;
  e.recheck = photoTimers.set(() => {
    e.recheck = undefined;
    if (!live()) return;
    e.loading = true;
    modelInTurn(() => loadModel(mu, size), live).then((got) => {
      e.loading = false;
      const data = noteModel(url, got);
      if (models.get(key) !== e) return freeModel(data);
      if (!data) return recheckModel(key, e, url, size);
      e.data = data;
      for (const tell of [...e.users]) tell();
    }).catch((err) => {
      e.loading = false;
      if (!(err instanceof Error && err.message === 'unwanted')) noteModel(url, null);
      recheckModel(key, e, url, size);
    });
  }, wait);
}

/**
 * 사이트가 이 그림의 3D가 다 됐다고 알렸다(이 화면이 3D 진행을 보다가: making-3d.ts). 그 주소의 「없던」 기억과
 * 「앞으로도 없다」(none) 기억을 지우고, 그 모형을 원하는 캐릭터가 있으면 다시 묻기 차례(40·90·240초…)를 기다리지 않고
 * 바로 묻는다. 받는 중이면 그 답이 비었을 때 바로 한 번 더 묻는다(같은 모형을 둘로 받지 않게). 원하는 캐릭터 없이 들고만
 * 있던 빈 항목은 놓는다(다음에 원하면 처음부터 바로 묻는다). 이미 받은 모형은 그대로 쓴다
 */
export function modelNow(url: string): void {
  const mu = modelUrl(url);
  modelMisses.delete(mu);
  modelsGone.delete(mu);
  for (const size of ['l', 's'] as const) {
    const key = modelKey(url, size);
    const e = models.get(key);
    if (!e || e.data) continue;
    if (e.loading) {
      e.soon = true;
      continue;
    }
    if (e.refs <= 0) {
      forgetModel(key, e);
      continue;
    }
    if (e.recheck !== undefined) photoTimers.clear(e.recheck);
    e.recheck = undefined;
    e.soon = true;
    recheckModel(key, e, url, size);
  }
}

function takeModel(url: string, size: PhotoSize): ModelEntry {
  const key = modelKey(url, size);
  let e = models.get(key);
  if (!e) {
    const entry: ModelEntry = { refs: 0, done: false, users: new Set() };
    const live = () => entry.refs > 0 && models.get(key) === entry;
    const mu = modelUrl(url);
    if (modelsGone.has(mu) || modelMisses.has(mu)) {
      // 이 화면에서 이미 없던 주소: 바로 묻지 않고(앞으로도 없으면 아예 묻지 않고) 그 주소의 다시 묻기 차례를 잇는다
      entry.done = true;
      models.set(key, entry);
      e = entry;
    } else {
      entry.loading = true;
      modelInTurn(() => loadModel(mu, size), live).then((got) => {
        entry.done = true;
        entry.loading = false;
        const data = noteModel(url, got);
        if (models.get(key) !== entry) return freeModel(data);
        if (!data) return recheckModel(key, entry, url, size);
        entry.data = data;
        for (const tell of [...entry.users]) tell();
      }, (err) => {
        entry.done = true;
        entry.loading = false;
        // 원하는 캐릭터가 없어 받지 않았으면 지운다(다음에 원하면 새로 받는다). 받다가 실패했으면 없을 때처럼 다시 묻는다
        if (!(err instanceof Error && err.message === 'unwanted')) noteModel(url, null);
        if (models.get(key) !== entry) return;
        if (entry.refs <= 0) forgetModel(key, entry);
        else recheckModel(key, entry, url, size);
      });
      models.set(key, entry);
      e = entry;
    }
  }
  if (e.linger !== undefined) {
    photoTimers.clear(e.linger);
    e.linger = undefined;
  }
  e.refs++;
  // 들고만 있던 「없는 모형」을 다시 원하면 다시 묻기를 처음부터
  if (e.refs === 1 && e.done && !e.data) recheckModel(key, e, url, size);
  return e;
}

function dropModel(url: string, size: PhotoSize) {
  const key = modelKey(url, size);
  const e = models.get(key);
  if (!e || --e.refs > 0) return;
  if (e.recheck !== undefined) photoTimers.clear(e.recheck);
  e.recheck = undefined;
  e.linger = photoTimers.set(() => {
    e.linger = undefined;
    if (e.refs <= 0) forgetModel(key, e);
  }, MODEL_LINGER_MS);
}

/** 시험용: 들고만 있는 모형을 모두 놓는다 */
export function forgetIdleModels() {
  for (const [key, e] of [...models]) if (e.refs <= 0) forgetModel(key, e);
}

/**
 * 발이 아래 가운데인 세운 판. 그림의 가로 u0..u1만 쓴다(u0 > u1이면 좌우가 뒤집힌다).
 * 판은 평평하지만 법선은 둥근 기둥처럼 잡는다: 가운데에서 양 끝으로 CARD_BEND까지 돌리고 모두 위로 CARD_LIFT만큼 기울인다.
 * 평평한 법선이면 판이 해를 등질 때 햇빛이 0이 되어 카메라를 돌릴 때마다 캐릭터 밝기가 툭툭 바뀐다. 이렇게 하면 어느 쪽을 보아도
 * 위에서 오는 빛을 받고, 몸이 둥근 것처럼 한쪽이 조금 더 밝다
 */
/**
 * 판의 격자: 걷는 다리(셰이더)가 판 아래쪽을 휘므로 엉덩이 높이 아래와 가운데(두 다리를 가르는 곳)를 촘촘하게 나눈다.
 * 가로는 판 폭의 몫(-0.5..0.5), 세로는 m
 */
const CARD_COLS = [-0.5, -0.36, -0.24, -0.14, -0.07, 0, 0.07, 0.14, 0.24, 0.36, 0.5];
const CARD_ROWS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.38, 0.55, 0.8, 1.05, PHOTO_H];
function cardPlane(u0 = 0, u1 = 1): THREE.BufferGeometry {
  const nx = CARD_COLS.length, ny = CARD_ROWS.length;
  const pos = new Float32Array(nx * ny * 3), nor = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
  const len = Math.hypot(1, CARD_LIFT);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = CARD_COLS[i] * PHOTO_W, y = CARD_ROWS[j];
      pos.set([x, y, 0], k * 3);
      const a = (x / (PHOTO_W / 2)) * CARD_BEND;
      nor.set([Math.sin(a) / len, CARD_LIFT / len, Math.cos(a) / len], k * 3);
      uv.set([u0 + (u1 - u0) * (CARD_COLS[i] + 0.5), y / PHOTO_H], k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
/** 그림 한 장용 판 */
const PLANE_KEY = 'photo:plane';
/** 구역(-3..4)마다 판 하나: 묶음에서 그 구역의 칸만 보이게 uv를 잡아 둔다. 재질과 텍스처는 그대로 두고 판의 기하만 바꿔 끼운다 */
const ZONES = [-3, -2, -1, 0, 1, 2, 3, 4];
const zoneKey = (zone: number) => `photo:view:${zone}`;
function zonePlane(zone: number): THREE.BufferGeometry {
  const { cell, flip } = viewCell(zone);
  const a = cell / VIEW_CELLS, b = (cell + 1) / VIEW_CELLS;
  return flip ? cardPlane(b, a) : cardPlane(a, b);
}

/** 캐릭터마다 따로 만든 재질 수(사진 판과 모형은 걸음 값이 저마다 달라 재질을 함께 쓰지 못한다) */
let ownMats = 0;

/** 시험용: 지금 살아 있는 공유 자원 수(모두 놓으면 0). 모형은 항목을 재질에, 받은 기하를 기하에 센다 */
export function avatarStats() {
  let modelGeos = 0;
  for (const e of models.values()) if (e.data) modelGeos++;
  return { avatars: liveAvatars, geometries: geos.size + modelGeos, materials: mats.size + photos.size + models.size + ownMats, labels: liveLabels };
}

// ───────── 이름표·말풍선: 캔버스 글자 스프라이트(화면에서 늘 같은 크기, 깊이 검사 끔)

/** 캔버스 화소 ÷ 화면 화소 */
const DPR = 2;
/** 글자 스프라이트와 그 크기(화면 px). 반려동물의 이름표·말풍선도 같은 것을 쓴다 */
export type Label = { sprite: THREE.Sprite; w: number; h: number };

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

/** 말풍선 아래쪽의 덧붙인 글(반려동물의 속마음 같은 괄호 글): 조금 작고 흐린 글씨 */
const ASIDE_PX = 25;
const ASIDE_LINE_H = 32;
const ASIDE_COLOR = '#6a5545';
/**
 * 칭호: 이름표 위의 작은 밝은 알약(이름표와 겹치지 않게 조금 띄운다). 글자 수는 look.ts TITLE_MAX와 같은 값
 * (노드 시험에서 look.ts를 불러오지 않으려고 값만 둔다. 같은지는 tests/unit/look.test.ts가 본다)
 */
export const LABEL_TITLE_MAX = 20;
const TITLE_PX = 21;
const TITLE_H = 34;
const TITLE_PAD = 12;
const TITLE_GAP = 5;
const TITLE_COLOR = '#2f5a40';

/** 이름표 또는 말풍선 글자판. 말풍선은 aside를 주면 본문 아래에 작고 흐린 글씨로 덧붙인다(본문 두 줄, 덧붙인 글 세 줄까지) */
/** 이름표(name)는 aside를 칭호로 받아 이름 위에 작게 얹는다. 말풍선(bubble)은 aside를 말 아래 작은 글로 */
export function makeLabel(kind: 'name' | 'bubble', text: string, aside?: string): Label | null {
  const fontPx = 26;
  const font = `${kind === 'name' ? 600 : 500} ${fontPx}px ${LABEL_FONT}`;
  const asideFont = `500 ${ASIDE_PX}px ${LABEL_FONT}`;
  probe ??= newCanvas(4, 4)?.[1] ?? null;
  const g0 = probe;
  if (!g0) return null;
  const extra = kind === 'bubble' && aside ? aside : '';
  let asideLines: string[] = [];
  let asideW = 0;
  if (extra) {
    g0.font = asideFont;
    const m2 = (s: string) => g0.measureText(s).width;
    asideLines = wrapLines(extra, 300, m2, 3);
    asideW = Math.max(0, ...asideLines.map(m2));
  }
  g0.font = font;
  const measure = (s: string) => g0.measureText(s).width;
  const pad = kind === 'name' ? 14 : 18;
  const lineH = 34;
  const lines = kind === 'name' ? [[...text].slice(0, 16).join('')] : wrapLines(text, 320, measure, extra ? 2 : 4);
  const textW = Math.max(...lines.map(measure), asideW, kind === 'name' ? 20 : 40);
  const tail = kind === 'bubble' ? 14 : 0;
  const title = kind === 'name' && aside ? Array.from(aside.trim()).slice(0, LABEL_TITLE_MAX).join('') : '';
  const titleFont = `600 ${TITLE_PX}px ${LABEL_FONT}`;
  let titleW = 0;
  if (title) {
    g0.font = titleFont;
    titleW = g0.measureText(title).width + TITLE_PAD * 2;
    g0.font = font;
  }
  const nameW = textW + pad * 2;
  const w = Math.max(nameW, titleW);
  const above = title ? TITLE_H + TITLE_GAP : 0;
  const h = (kind === 'name' ? 44 + above : lines.length * lineH + asideLines.length * ASIDE_LINE_H + pad * 2 - 6) + tail;
  const made = newCanvas(w + 4, h + 4);
  if (!made) return null;
  const [c, g] = made;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (kind === 'name') {
    if (title) {
      roundRect(g, 2 + (w - titleW) / 2, 3, titleW, TITLE_H - 2, (TITLE_H - 2) / 2);
      g.fillStyle = 'rgba(255, 250, 242, 0.94)';
      g.fill();
      g.strokeStyle = 'rgba(47, 90, 64, 0.5)';
      g.lineWidth = 2;
      g.stroke();
      g.font = titleFont;
      g.fillStyle = TITLE_COLOR;
      g.fillText(title, 2 + w / 2, 2 + TITLE_H / 2 + 1);
      g.font = font;
    }
    roundRect(g, 2 + (w - nameW) / 2, 2 + above, nameW, 44, 22);
    g.fillStyle = 'rgba(28, 24, 20, 0.74)';
    g.fill();
    g.fillStyle = '#fffaf2';
    g.fillText(lines[0], 2 + w / 2, 2 + above + 22 + 1);
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
    if (asideLines.length) {
      g.font = asideFont;
      g.fillStyle = ASIDE_COLOR;
      const top = 2 + pad - 3 + lines.length * lineH;
      asideLines.forEach((l, i) => g.fillText(l, 2 + w / 2, top + ASIDE_LINE_H / 2 + i * ASIDE_LINE_H));
    }
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

export function dropLabel(l: Label | null) {
  if (!l) return;
  l.sprite.removeFromParent();
  const m = l.sprite.material;
  m.map?.dispose();
  releaseCanvas(m.map);
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
  /** 앉아 있는가(앉는 동안·일어서는 동안은 캐릭터가 0.3초 남짓에 걸쳐 바꾼다. 공중이면 서 있는 것으로) */
  sitting?: boolean;
};
export type Avatar = {
  /** 원점이 발바닥 가운데, 로컬 +z가 얼굴 쪽. 엔진이 자리·방향(rotation.y)을 정한다 */
  group: THREE.Group;
  update: (dt: number, m: AvatarMotion) => void;
  setName: (text: string | null) => void;
  setBubble: (text: string | null) => void;
  /** 이름표를 보일지(사람이 많을 때 먼 이름은 접는다). 바뀌었으면 true */
  setNameShown: (on: boolean) => boolean;
  /** 이름표 위 칭호(겉모습의 title, 빈 글이나 null이면 뗀다). 바뀌었으면 true */
  setTitle: (text: string | null) => boolean;
  /** 이름표·말풍선 크기: 카메라에서 1m 앞 화면 1px이 몇 m인지(= 2·tan(fov/2) / 화면 높이 px) */
  setPixelScale: (unitsPerPx: number) => void;
  setShadow: (on: boolean) => void;
  /** 시험·디버그용: 지금 팔다리 각(rad)과 몸 높이 */
  pose: () => { legL: number; legR: number; armL: number; armR: number; bob: number; scaleY: number };
  /** 지금 보이는 모습: 기본 인형 또는 사진 캐릭터(판이든 3D 모형이든, 그림이나 모형이 온 뒤에만) */
  shown: () => 'doll' | 'photo';
  /** 지금 보이는 모습을 자세히: 인형, 세운 판, 3D 모형 */
  form: () => 'doll' | 'card' | 'model';
  /**
   * 사진 캐릭터를 3D 모형으로 보일지(엔진이 정한다: 나와 가까운 몇 명). 켜면 모형을 받아 두었다가 오면 판 대신 세우고,
   * 끄면 판으로 돌아가 모형을 놓는다. 인형이면 아무 일도 없다. 보이는 모습이 바뀌면 onChange
   */
  setModel: (on: boolean) => void;
  /** 지금 쓰는 사진 그림의 방향 수: 인형이면 0, 그림 한 장이면 1, 방향 그림 묶음이면 5 */
  views: () => number;
  /**
   * 사진 판을 카메라에 맞춰 세우고 보는 방향에 맞는 그림을 고른다(인형이면 아무 일도 없다).
   * 엔진이 그리기 직전에, 카메라 자리와 캐릭터 방향을 정한 뒤 부른다. 해 그림자 판도 여기서 해 쪽으로 맞춘다.
   * 그림이 바뀌어 판 폭이 줄었다 돌아오는 중이면 true: 다 돌아올 때까지 엔진이 계속 그려야 한다
   */
  face: (cam: THREE.Camera, mode?: FaceMode) => boolean;
  /** 시험·디버그용: 지금 서 있는 한 덩이로 그리는 중인가 */
  resting: () => boolean;
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
  /** 해 그림자를 드리울지(기본 true). false면 받기만 한다: 발밑 동그란 그림자는 엔진이 따로 그린다 */
  cast?: boolean;
  /** 사진 캐릭터의 방향 그림 묶음 크기(기본 'l'). 손가락 기기는 's' */
  photoSize?: PhotoSize;
  /**
   * 해가 있는 쪽의 방위각(rad, 세계 +z가 0이고 +x 쪽이 +). 주면 사진 캐릭터가 해 쪽을 보는 그림자 전용 판으로 해 그림자를 드리운다.
   * 해가 없는 장면(방)과 그림자를 드리우지 않는 기기는 주지 않는다
   */
  sun?: number | null;
  /**
   * 겉모습이 뒤늦게 바뀌면 부른다(사진 그림이 도착했을 때, 방향 그림 묶음이 나중에 와서 바꿔 끼웠을 때, 3D 모형으로 바뀌거나 판으로 돌아갈 때).
   * 엔진은 여기서 다시 그리기를 청한다: 가만히 서 있으면 그리지 않으므로 알려 주지 않으면 화면이 옛 모습에 머문다
   */
  onChange?: () => void;
  /** 처음부터 3D 모형을 원하는가(setModel(true)와 같다). 사진 캐릭터만 */
  model?: boolean;
  /**
   * 모형을 처음 보이기 전에 셰이더를 미리 짓는 길(엔진의 compileAsync). 주면 다 지은 뒤에 판에서 모형으로 바꾼다:
   * 처음 보이는 프레임이 셰이더를 짓느라 멈추지 않게
   */
  prepare?: (o: THREE.Object3D) => Promise<unknown>;
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
  liveAvatars++;
  const d = dollOf(opt);
  // 겉모습이 같은 사람끼리 기하를 함께 쓴다. 색은 모두 꼭짓점 색으로 구워, 재질은 인형 전체가 하나다
  const lookId = `${d.hair}:${d.hairColor}:${d.skin}:${d.acc}:${d.top}:${d.bottom}`;
  const geoKeys = [`trunk:${lookId}`, `leg:${d.bottom}`, `arm:${d.top}:${d.skin}`, `rest:${lookId}`];
  const keys = ['doll'];
  const baked = takeMat(keys[0], () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const trunkGeo = takeGeo(geoKeys[0], () => buildTrunk(d));
  const legGeo = takeGeo(geoKeys[1], () => buildLeg(d.bottom));
  const armGeo = takeGeo(geoKeys[2], () => buildArm(d.top, d.skin));
  const restGeo = takeGeo(geoKeys[3], () => buildRest(trunkGeo, legGeo, armGeo));
  const reduced = Boolean(opt.reducedMotion);

  const group = new THREE.Group();
  group.name = 'avatar';
  // 움직이는 몸(몸통 덩이 + 다리 둘 + 팔 둘). 서 있는 동안은 장면에서 떼어 두고 rest 한 덩이만 그린다
  const body = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const mesh = (g: THREE.BufferGeometry, parent: THREE.Object3D, name: string) => {
    const x = new THREE.Mesh(g, baked);
    x.name = name;
    parent.add(x);
    meshes.push(x);
    return x;
  };
  mesh(trunkGeo, body, 'trunk');
  const limb = (x: number, y: number, kind: 'leg' | 'arm') => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    mesh(kind === 'leg' ? legGeo : armGeo, pivot, kind);
    if (kind === 'arm') pivot.rotation.z = Math.sign(x) * ARM_TILT;
    return pivot;
  };
  const legL = limb(-LEG_X, LEG_Y, 'leg'), legR = limb(LEG_X, LEG_Y, 'leg');
  const armL = limb(-ARM_X, ARM_Y, 'arm'), armR = limb(ARM_X, ARM_Y, 'arm');
  const rest = mesh(restGeo, group, 'doll');
  let restOn = true;
  /** 서 있는 한 덩이 ↔ 움직이는 다섯 덩이. 사진 판이나 모형이 서 있으면 인형은 어느 쪽도 보이지 않는다 */
  const setRest = (on: boolean) => {
    if (on === restOn) return;
    restOn = on;
    if (on) group.remove(body);
    else group.add(body);
    rest.visible = on && form === 'doll';
  };
  let shadowOn = opt.shadow !== false;
  const casts = () => shadowOn && opt.cast !== false;
  const setShadow = (on: boolean) => {
    shadowOn = on;
    meshes.forEach((m) => { m.castShadow = casts(); m.receiveShadow = on; });
    if (shade) shade.castShadow = casts();
    if (model) { model.castShadow = casts(); model.receiveShadow = on; }
  };

  // 사진 캐릭터: 그림이 오면 인형을 숨기고 종이 인형처럼 세운 판. 실패하면 인형 그대로.
  // 판은 카메라 쪽으로 돌고(face), 방향 그림 묶음이 있으면 보는 방향에 맞는 그림을 보인다
  const photoUrl = opt.look?.kind === 'photo' ? opt.look.url : null;
  const paper = new THREE.Group();
  paper.name = 'photo';
  group.add(paper);
  let card: THREE.Mesh | null = null;
  /** 해 그림자만 드리우는 판(화면에는 그려지지 않는다). 해가 있는 장면에서 그림자를 드리울 때만 둔다 */
  let shade: THREE.Mesh | null = null;
  /** 사진 판의 걸음 값(캐릭터마다)과, 그 값을 쓰는 이 캐릭터만의 판 재질(텍스처는 같은 그림을 쓰는 모두가 함께 쓴다) */
  const cardGait = { value: new THREE.Vector3() };
  /** 사진 판의 앉기(다리를 누르는 몫, 0..CARD_SIT) */
  const cardSit = { value: 0 };
  let cardMat: THREE.MeshStandardMaterial | null = null;
  // 3D 모형: 엔진이 원하면(setModel) 받아 두었다가 오면 판 대신 세운다. 판과 인형은 받는 동안, 모형이 없을 때, 멀리 있을 때 쓴다.
  // 모형은 rig 안에 서고, rig가 몸 출렁임·기울기·늘었다 쪼그리기를 받는다(다리는 셰이더가 돌린다)
  const rig = new THREE.Group();
  rig.name = 'model';
  rig.visible = false;
  group.add(rig);
  let modelWant = false;
  let modelEntry: ModelEntry | null = null;
  let model: THREE.Mesh | null = null;
  /** 모형의 셰이더를 다 지었는가(prepare가 없으면 세우자마자) */
  let modelReady = false;
  const legU: LegUniforms = legUniforms();
  /** 다리가 따로인 모형인가(아니면 치마·한복처럼 붙어 몸을 좌우로 흔든다) */
  let legsApart = true;
  /** 지금 보이는 모습 */
  let form: 'doll' | 'card' | 'model' = 'doll';
  /** 앉은 몫(0 서 있음 .. 1 앉음)과, 더 움직이는 것이 없는가(앉아서 가만히 있어도 엔진이 다시 그리지 않게) */
  let sit = 0;
  let still = true;
  /** 앉아서 머리가 내려간 만큼(m): 이름표·말풍선도 그만큼 내린다 */
  const headDrop = () => {
    if (sit <= 0) return 0;
    if (form === 'card') return CARD_HIP * CARD_SIT * sit;
    if (form === 'model') return Math.max(0, legU.legSeat.value.x - MODEL_SIT_GAP) * sit;
    return DOLL_SIT_DROP * sit;
  };
  /** 지금 모습의 이름표 높이(앉으면 내려간다). 판은 face가 눕힌 각까지 셈해 옮긴다 */
  const labelY = () => (form === 'model' ? MODEL_LABEL_Y : form === 'card' ? PHOTO_LABEL_Y : LABEL_Y) - headDrop();
  const sun = opt.cast !== false && typeof opt.sun === 'number' && Number.isFinite(opt.sun) ? opt.sun : null;
  let sway = 0;
  let disposed = false;
  const camW = new THREE.Vector3();
  const selfW = new THREE.Vector3();
  /** 방향 그림 묶음을 받았으면 구역마다의 판(ZONES 순서). 그림 한 장이면 null */
  let zoneGeos: THREE.BufferGeometry[] | null = null;
  /** 지금 보이는 구역과, 해에서 본 구역(그림자 판의 그림) */
  let zone: number | null = null;
  let sunZone: number | null = null;
  /** 보이던 그림이 바뀐 뒤 판 폭이 줄었다 돌아오기까지 남은 시간(초) */
  let turn = 0;
  /** 이름표·말풍선 자리(판을 뒤로 눕히면 머리를 따라 옮긴다) */
  const labelAt = new THREE.Vector3(0, LABEL_Y, 0);
  const faceCamera = (cam: THREE.Camera, mode: FaceMode = 'position'): boolean => {
    // 3D 모형이 서 있으면 판은 숨어 있다(모형은 몸 방향 그대로 선다)
    if (!card || form !== 'card') return false;
    cam.getWorldPosition(camW);
    paper.getWorldPosition(selfW);
    const toCam = Math.atan2(camW.x - selfW.x, camW.z - selfW.z);
    const bodyYaw = group.rotation.y;
    if (zoneGeos) {
      // 캐릭터가 보는 쪽(몸 방향)에서 카메라 쪽까지의 각으로 그림을 고른다: 등 뒤에서 보면 뒷모습, 옆에서 보면 옆모습.
      // 판을 어떻게 세우든(아래 mode) 그림은 카메라의 자리로 정한다
      const z = viewZone(toCam - bodyYaw, zone);
      if (z !== zone) {
        // 처음 고를 때는 그냥 세우고, 보이던 그림이 바뀔 때만 폭을 잠깐 줄인다(줄인 움직임이면 끈다)
        if (zone !== null && !reduced && turn <= 0) turn = TURN_S;
        zone = z;
        card.geometry = zoneGeos[z - ZONES[0]];
      }
    }
    let want = toCam, lean = 0;
    if (mode === 'plane') {
      // 카메라의 뒤쪽 축(보는 방향의 반대)을 평면에 내린 쪽을 본다: 화면과 나란히. 꼭 위에서 내려다보면 평면 위 방향이 없어 카메라 자리를 본다
      const e = cam.matrixWorld.elements;
      if (e[8] * e[8] + e[10] * e[10] > 1e-8) want = Math.atan2(e[8], e[10]);
      // 내려다보는 각(뒤쪽 축이 위로 선 만큼)의 일부만큼 발을 축으로 뒤로 눕힌다
      lean = leanFor(Math.asin(Math.max(0, Math.min(1, e[9]))));
    }
    const local = want - bodyYaw;
    // 판의 면 안에서만 살짝 기운다(YXZ 순서: 먼저 z로 기울이고 y로 돌린다). 눕히는 것은 셰이더가 한다(leanInShader)
    card.rotation.set(0, local, sway, 'YXZ');
    leanNow.value.set(Math.cos(lean), Math.sin(lean));
    // 이름표·말풍선은 눕힌 판의 머리 위로(눕히지 않으면 제자리)
    // 앉으면 머리가 내려간 만큼 낮춘다
    const top = PHOTO_LABEL_Y - headDrop();
    const back = top * Math.sin(lean), lx = 0 - Math.sin(local) * back, ly = top * Math.cos(lean), lz = 0 - Math.cos(local) * back;
    if (labelAt.x !== lx || labelAt.y !== ly || labelAt.z !== lz) {
      labelAt.set(lx, ly, lz);
      for (const l of [name, bubble]) l?.sprite.position.copy(labelAt);
    }
    if (shade && sun !== null) {
      // 그림자 판은 카메라가 아니라 해 쪽을 보고, 해에서 본 방향의 그림을 쓴다: 카메라가 어디로 가든 그림자는 그대로다
      if (zoneGeos) {
        const z = viewZone(sun - bodyYaw, sunZone);
        if (z !== sunZone) {
          sunZone = z;
          shade.geometry = zoneGeos[z - ZONES[0]];
        }
      }
      shade.rotation.set(0, sun - bodyYaw, sway, 'YXZ');
    }
    return turn > 0;
  };
  const photoSize: PhotoSize = opt.photoSize === 's' ? 's' : 'l';
  const entry = photoUrl ? takePhoto(photoUrl, photoSize) : null;
  /** 이 캐릭터만의 판 재질을 지금 그림의 본(entry.mat)에서 새로 만든다(전에 쓰던 것은 놓는다) */
  const ownCardMat = (tpl: THREE.MeshStandardMaterial) => {
    const m = tpl.clone();
    photoShader(m, cardGait, cardSit);
    ownMats++;
    if (cardMat) {
      cardMat.dispose();
      ownMats--;
    }
    cardMat = m;
    return m;
  };
  const ready = entry
    ? entry.wait.then(() => {
      if (disposed || !entry.mat) return;
      // 묶음이면 구역마다의 판 여덟 가지를 함께 쓴다(처음에는 앞모습, 그리기 전에 face가 맞는 것으로 바꾼다)
      if (entry.views) zoneGeos = ZONES.map((k) => takeGeo(zoneKey(k), () => zonePlane(k)));
      const first = zoneGeos ? zoneGeos[0 - ZONES[0]] : takeGeo(PLANE_KEY, cardPlane);
      card = new THREE.Mesh(first, ownCardMat(entry.mat));
      card.name = 'photo-card';
      paper.add(card);
      if (sun !== null) {
        // 보이는 판은 카메라를 따라 돌기 때문에 그림자를 드리우지 않는다(카메라가 움직일 때마다 그림자가 따라 돌고, 그때마다 다시 구워야 한다).
        // 대신 해 쪽을 보는 판을 하나 더 두어 그림자만 드리운다. 그림자 단계는 깊이 재질에 이 재질의 그림과 알파 기준을 옮겨 쓰므로
        // 그림과 알파 기준은 있어야 하고(없으면 네모 그림자), 색과 깊이는 쓰지 않는다. 그림자 카메라만 보는 레이어에 둔다
        entry.shade ??= new THREE.MeshBasicMaterial({ map: entry.tex, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
        shade = new THREE.Mesh(first, entry.shade);
        shade.name = 'photo-shade';
        shade.customDepthMaterial = entry.depth;
        shade.layers.set(SHADE_LAYER);
        shade.castShadow = casts();
        shade.rotation.set(0, sun - group.rotation.y, 0, 'YXZ');
        paper.add(shade);
      }
      // 인형을 숨기고 판을 세운다(3D 모형이 먼저 와서 서 있으면 모형 그대로)
      applyForm();
      opt.onChange?.();
    })
    : Promise.resolve();
  /** 방향 그림 묶음이 뒤늦게 왔다: 캐릭터를 새로 만들지 않고 판의 그림과 재질만 바꿔 끼운다 */
  const upgrade = () => {
    if (disposed || !entry?.mat) return;
    if (!card) return; // 아직 판을 세우기 전이면 위의 ready가 새 재질로 세운다
    if (!zoneGeos) {
      zoneGeos = ZONES.map((k) => takeGeo(zoneKey(k), () => zonePlane(k)));
      dropGeo(PLANE_KEY);
    }
    // 다음 face가 지금 보는 방향의 그림을 고른다(처음 고를 때처럼 폭을 줄이지 않는다)
    zone = sunZone = null;
    const first = zoneGeos[0 - ZONES[0]];
    card.geometry = first;
    card.material = ownCardMat(entry.mat);
    if (shade) {
      entry.shade ??= new THREE.MeshBasicMaterial({ map: entry.tex, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
      shade.geometry = first;
      shade.material = entry.shade;
      shade.customDepthMaterial = entry.depth;
    }
    opt.onChange?.();
  };
  entry?.users.add(upgrade);
  setShadow(shadowOn);

  /** 지금 보일 모습을 고른다: 3D 모형(원하고, 받았고, 셰이더를 지었으면) → 사진 판 → 인형. 바뀌었으면 true */
  const applyForm = (): boolean => {
    const f = modelWant && model && modelReady ? 'model' : card ? 'card' : 'doll';
    if (f === form) return false;
    form = f;
    rig.visible = f === 'model';
    paper.visible = f === 'card';
    body.visible = f === 'doll';
    rest.visible = f === 'doll' && restOn;
    // 이름표·말풍선: 모형은 머리 위, 판은 판 위(눕히면 face가 머리를 따라 옮긴다), 인형은 인형 머리 위
    labelAt.set(0, labelY(), 0);
    for (const l of [name, bubble]) l?.sprite.position.copy(labelAt);
    return true;
  };
  /** 모형을 원하는 대로 맞춘다: 원하고 받았으면 세우고(처음이면 셰이더를 먼저 짓는다), 아니면 판으로. 모습이 바뀌면 알린다 */
  const syncModel = () => {
    if (disposed) return;
    const data = modelWant ? modelEntry?.data : undefined;
    if (data && !model) {
      legU.legHip.value.copy(legParams(data.legs));
      legU.legSeat.value.copy(sitParams(data.legs));
      legU.legSit.value.w = sitSplay(data.legs);
      legsApart = data.legs.apart;
      model = new THREE.Mesh(data.geometry, modelMaterial(data.texture, legU));
      ownMats++;
      model.name = 'photo-model';
      model.castShadow = casts();
      model.receiveShadow = shadowOn;
      rig.add(model);
      modelReady = !opt.prepare;
      if (opt.prepare) {
        // 숨겨 둔 채로 셰이더를 짓고, 다 되면(실패해도) 판 대신 세운다
        const mine = model, prep = opt.prepare;
        Promise.resolve().then(() => prep(rig)).catch(() => undefined).then(() => {
          if (disposed || model !== mine) return;
          modelReady = true;
          if (applyForm()) opt.onChange?.();
        });
      }
    }
    if (applyForm()) opt.onChange?.();
  };
  /** 이 캐릭터의 모형을 걷고 함께 쓰는 모형을 놓는다 */
  const dropMine = () => {
    if (model) {
      (model.material as THREE.Material).dispose();
      ownMats--;
      model.removeFromParent();
      model = null;
    }
    modelReady = false;
    if (modelEntry && photoUrl) {
      modelEntry.users.delete(syncModel);
      dropModel(photoUrl, photoSize);
    }
    modelEntry = null;
  };
  const setModel = (on: boolean) => {
    const want = Boolean(on);
    if (!photoUrl || disposed || want === modelWant) return;
    modelWant = want;
    if (want) {
      modelEntry = takeModel(photoUrl, photoSize);
      modelEntry.users.add(syncModel);
    } else dropMine();
    syncModel();
  };

  let name: Label | null = null;
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
  const label = (kind: 'name' | 'bubble', text: string | null, old: Label | null, aside?: string | null) => {
    dropLabel(old);
    const t = (text ?? '').trim();
    const l = t ? makeLabel(kind, t, aside ?? undefined) : null;
    if (l) {
      l.sprite.position.copy(labelAt);
      group.add(l.sprite);
    }
    return l;
  };
  let nameText: string | null = null, bubbleText: string | null = null;
  /** 이름표 위 칭호(겉모습에 실려 온다). 이름표와 한 그림으로 그린다 */
  let titleText: string | null = null;
  let nameShown = true;
  const drawName = () => {
    name = label('name', nameText, name, titleText);
    if (name) name.sprite.visible = nameShown;
    place();
  };
  const setName = (t: string | null) => {
    if (t === nameText) return;
    nameText = t;
    drawName();
  };
  const setTitle = (t: string | null) => {
    const v = (t ?? '').trim() || null;
    if (v === titleText) return false;
    titleText = v;
    drawName();
    return true;
  };
  const setNameShown = (on: boolean) => {
    if (on === nameShown) return false;
    nameShown = on;
    if (name) name.sprite.visible = on;
    return true;
  };
  const setBubble = (t: string | null) => { if (t !== bubbleText) { bubbleText = t; bubble = label('bubble', t, bubble); place(); } };
  titleText = (opt.look?.title ?? '').trim() || null;
  if (opt.name) setName(opt.name);

  let phase = 0, amount = 0, air = 0, squash = 0, scaleY = 1, bob = 0;
  let wasAir = false;
  let labelDrop = 0;
  /** 앉은 자세: 인형은 다리를 앞으로 뻗고 몸을 내리고 손을 무릎 쪽으로, 모형은 셰이더가 다리를 들거나(따로인 다리) 누르고(붙은 다리), 판은 셰이더가 다리를 누른다 */
  const applySit = () => {
    if (sit > 0) {
      legL.rotation.x += (-DOLL_SIT_LEG - legL.rotation.x) * sit;
      legR.rotation.x += (-DOLL_SIT_LEG - legR.rotation.x) * sit;
      armL.rotation.x += (-0.5 - armL.rotation.x) * sit;
      armR.rotation.x += (-0.5 - armR.rotation.x) * sit;
      body.position.y -= DOLL_SIT_DROP * sit;
    }
    cardSit.value = CARD_SIT * sit;
    legU.legSit.value.x = sit;
    // 모형 틀의 높이는 이 프레임에 몸 출렁임으로 막 정했다(모형이 있을 때만): 엉덩이가 바닥에 닿게 내린다
    if (model) rig.position.y -= Math.max(0, legU.legSeat.value.x - MODEL_SIT_GAP) * sit;
    const drop = headDrop();
    if (Math.abs(drop - labelDrop) > 1e-4) {
      labelDrop = drop;
      // 판은 face가 그리기 직전에 옮긴다
      if (form !== 'card') {
        labelAt.y = labelY();
        for (const l of [name, bubble]) l?.sprite.position.copy(labelAt);
      }
    }
  };
  const update = (dt: number, m: AvatarMotion) => {
    const d = Math.min(0.1, Math.max(0, dt || 0));
    const sitWant = m.sitting && !m.airborne ? 1 : 0;
    if (reduced) {
      // 줄인 움직임: 팔다리·몸 출렁임·쪼그림을 모두 끈다(점프 높이는 엔진이 그대로 올린다). 서 있으면 늘 한 덩이로 그리고, 앉으면 바로 앉는다
      sit = sitWant;
      legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0;
      body.position.y = 0;
      body.scale.set(1, 1, 1);
      paper.position.y = 0;
      paper.scale.set(1, 1, 1);
      sway = 0;
      turn = 0;
      if (card) card.scale.x = 1;
      cardGait.value.set(0, 0, 0);
      rig.position.y = 0;
      rig.rotation.set(0, 0, 0);
      rig.scale.set(1, 1, 1);
      legU.legSwing.value = 0;
      applySit();
      still = true;
      setRest(sit === 0);
      return;
    }
    // 앉기·일어서기는 0.3초 남짓에 걸쳐(다 되면 딱 맞춘다)
    sit += (sitWant - sit) * follow(d, 0.08);
    if (Math.abs(sitWant - sit) < 0.002) sit = sitWant;
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
    // 걸음·점프·쪼그림이 모두 가라앉으면 서 있는 한 덩이로 바꾼다(그 자세가 곧 이 자세라 바뀌는 것이 보이지 않는다).
    // 앉아 있으면 다섯 덩이 그대로(한 덩이는 서 있는 자세다). 다 앉아 가만히 있으면 더 움직이지 않는 것으로 본다
    still = !walking && !m.airborne && !m.landing && amount < 0.01 && air < 0.01 && squash < 0.01 && (sit === 0 || sit === 1);
    setRest(still && sit === 0);
    if (card) {
      // 사진 판: 걸을 때 걸음마다 살짝 통통 뛰고 좌우로 조금 기운다. 점프·착지는 인형과 같이 늘었다 쪼그린다
      paper.position.y = Math.abs(Math.sin(phase)) * 0.045 * amount * (1 - air);
      sway = Math.sin(phase) * 0.045 * amount * (1 - air);
      paper.scale.set(sx, scaleY, 1);
      // 보이던 그림이 바뀐 직후: 폭이 가운데에서 가장 좁았다가 돌아온다(종이 인형을 휙 돌리는 느낌)
      if (turn > 0) {
        turn = Math.max(0, turn - d);
        card.scale.x = 1 - (1 - TURN_SQUEEZE) * Math.sin((Math.PI * turn) / TURN_S);
      }
      // 다리: 옆모습이면 두 다리가 엉덩이를 축으로 앞뒤로 벌어지고(걸음마다), 앞·뒷모습이면 한쪽 발씩 번갈아 들린다.
      // 비스듬한 그림은 둘을 섞는다. 그림 한 장은 앞모습으로 본다
      const ang = zoneGeos && zone !== null ? viewCell(zone).cell * (Math.PI / 4) : 0;
      const s = Math.sin(phase), k = amount * (1 - air);
      const side = Math.abs(Math.sin(ang)), front = Math.abs(Math.cos(ang));
      cardGait.value.set(CARD_SPREAD * Math.abs(s) * side * k, CARD_STEP * Math.max(0, s) * front * k, CARD_STEP * Math.max(0, -s) * front * k);
    }
    if (model) {
      // 3D 모형: 인형처럼 몸이 출렁이고 조금 앞으로 기울고, 점프·착지에 늘었다 쪼그린다. 다리는 셰이더가 엉덩이 아래를 번갈아 돌린다.
      // 다리가 붙은 모형(치마·한복)은 다리 대신 몸을 좌우로 살짝 흔들고 치맛자락을 조금 비튼다
      rig.position.y = bob;
      rig.scale.set(sx, scaleY, sx);
      const k = amount * (1 - air);
      if (legsApart) {
        rig.rotation.set(p.lean, 0, 0);
        legU.legSwing.value = (p.legL * MODEL_LEG * (1 - air) + 0.3 * air) * (1 - sit);
      } else {
        rig.rotation.set(p.lean, 0, Math.sin(phase) * SKIRT_ROLL * k);
        legU.legSwing.value = Math.sin(phase) * SKIRT_SWISH * k * (1 - sit);
      }
    }
    applySit();
  };

  // 처음부터 모형을 원하면(내 캐릭터) 받기 시작한다. 모든 상태를 만든 뒤에(모형이 이미 와 있으면 여기서 바로 선다)
  if (opt.model) setModel(true);

  return {
    group,
    update,
    setName,
    setTitle,
    setBubble,
    setNameShown,
    setPixelScale(u) {
      if (!(u > 0) || Math.abs(u - unitsPerPx) < 1e-9) return;
      unitsPerPx = u;
      place();
    },
    setShadow,
    pose: () => ({ legL: legL.rotation.x, legR: legR.rotation.x, armL: armL.rotation.x, armR: armR.rotation.x, bob, scaleY }),
    shown: () => (form === 'doll' ? 'doll' : 'photo'),
    form: () => form,
    setModel,
    views: () => (card && zoneGeos ? VIEW_CELLS : card ? 1 : 0),
    face: faceCamera,
    // 서 있는 한 덩이이거나, 다 앉아서 가만히 있다
    resting: () => restOn || (still && sit === 1),
    ready,
    dispose() {
      if (disposed) return;
      dropMine();
      disposed = true;
      if (zoneGeos) ZONES.forEach((k) => dropGeo(zoneKey(k)));
      else if (card) dropGeo(PLANE_KEY);
      zoneGeos = null;
      card = shade = null;
      if (cardMat) {
        cardMat.dispose();
        ownMats--;
        cardMat = null;
      }
      entry?.users.delete(upgrade);
      if (photoUrl) dropPhoto(photoKey(photoUrl, photoSize));
      dropLabel(name);
      dropLabel(bubble);
      name = bubble = null;
      group.removeFromParent();
      group.clear();
      body.clear();
      keys.forEach(dropMat);
      geoKeys.forEach(dropGeo);
      liveAvatars = Math.max(0, liveAvatars - 1);
    },
  };
}
