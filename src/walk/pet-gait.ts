// 반려동물(네 발 짐승) 모형의 걸음. 모형은 뼈대 없는 정적 모형(걸음 가운데 자세 한 장)이라 다리·꼬리·머리를 꼭짓점 셰이더로 움직인다.
// 받았을 때 한 번(petRig): 걷는 자세 기하에서 배 높이와 네 다리 기둥(앞뒤는 z, 좌우는 x), 꼬리, 목을 찾고 꼭짓점마다 무게를 매긴다.
//   휴대폰에서 한 번에 오래 멈추지 않게 쉬는 틈마다 조금씩 나눠 하고(pawGait), 그동안 셰이더는 무게 0으로 모형 그대로 그린다.
//   다리: 아래에서부터 높이를 올리며 그 높이 아래 삼각형만으로 이은 덩어리 가운데 바닥에 닿은 것을 센다. 넷이 따로 있는 가장 높은 곳까지가
//   다리이고, 한 다리가 다른 다리·몸통과 이어지는 높이가 그 다리의 꼭대기다. 다리 위쪽(몸 속)에 돌리는 축을 둔다.
//   꼬리: 뒤쪽 위에서 몸 가운데서 가장 먼 점부터 겉면을 따라 재어 나가다가, 같은 거리의 고리가 갑자기 넓어지는 곳(몸통)에서 멈춘다.
//   무게: 다리 덩어리는 그 다리를 다 따르고, 몸 쪽으로 올라가며 부드럽게 줄인다(이음매에서 찢어지지 않게 이웃 꼭짓점끼리 몇 번 고른다).
// 매 프레임(gaitPose): 걸은 거리로 걸음 박자를 돌린다(발이 미끄러지지 않게, 디딘 발은 바닥 한 자리에 머문다). 걷기는 대각선 두 쌍이
//   번갈아 딛는 종종걸음, 달리기는 앞 두 발 → 뒤 두 발로 뛰는 걸음에 몸을 앞뒤로 기울이고 늘였다 줄인다. 빠를수록 보폭이 크다.
//   꼬리는 걸음에 맞춰 좌우로 흔들리고 머리는 살짝 끄덕인다. 셰이더 값만 바꾸므로 그리기 호출·기하는 그대로다.
// 다리를 찾는 동안과 찾지 못한 모형(앉은 자세 같은 것)은 걸음이 아무것도 하지 않는다: 화면은 예전처럼 몸만 흔든다.
import * as THREE from 'three';

// ───────── 찾기의 값(모두 모형 키의 몫)

/** 꼭짓점을 같은 자리로 묶는 격자(그림 이음매에서 나뉜 꼭짓점을 하나로) */
const WELD = 1 / 2000;
/** 다리를 찾으며 높이를 올리는 칸과 그 끝 */
const CUT_STEP = 0.005;
const CUT_MAX = 0.7;
/** 다리 덩어리는 이 높이 아래까지 내려와야 한다(바닥에 닿은 발) */
const FLOOR = 0.06;
/** 다리 덩어리의 가장 작은 크기(묶은 꼭짓점 수의 몫, 적어도 6) */
const LEG_MIN = 0.004;
/** 넷째 다리보다 이만큼 작아야 다섯째 덩어리를 부스러기로 본다 */
const FIFTH = 0.35;
/** 다리 꼭대기 둘레를 재는 높이 띠 */
const TOP_BAND = 0.04;
/** 돌리는 축은 다리 꼭대기보다 이만큼 위(몸 속 엉덩이·어깨 쪽) */
const PIVOT_UP = 0.06;
/** 축을 다리 줄기를 따라 올릴 때 기울기 상한(높이 1에 앞뒤 몇) */
const SLOPE_MAX = 0.8;
/** 꼬리: 겉면 거리 고리의 폭, 몸통으로 보는 고리 폭의 배수, 가장 짧은 꼬리 */
const RING = 0.02;
const RING_JUMP = 2.2;
const TAIL_MIN = 0.15;

// ───────── 걸음의 값

/** 걷기(종종걸음): 다리마다 박자 차이(앞왼, 앞오른, 뒤왼, 뒤오른), 디딘 몫, 다리가 휘는 각(rad), 발을 드는 높이(다리 길이의 몫) */
const TROT = { phase: [0, 0.5, 0.5, 0], duty: 0.55, swing: 0.42, lift: 0.16 } as const;
/** 달리기(앞 두 발 → 뒤 두 발): 같은 값. 쌍 안에서 한 발이 조금 늦는다 */
const BOUND = { phase: [0.08, 0, 0.5, 0.58], duty: 0.36, swing: 0.6, lift: 0.24 } as const;
/** 몸이 오르내리는 높이(모형 키의 몫): 걷기, 달리기 */
const BOB_WALK = 0.016;
const BOB_RUN = 0.045;
/** 걷기에서 좌우로 기우는 각(rad)과 좌우로 흔들리는 폭(모형 키의 몫) */
const ROLL_WALK = 0.03;
const SHIFT_WALK = 0.008;
/** 달리기: 몸이 앞뒤로 기우는 각(rad), 늘었다 줄어드는 몫, 머리가 몸 기울기를 되받는 몫 */
const PITCH_RUN = 0.09;
const STRETCH_RUN = 0.045;
const HEAD_HOLD = 0.6;
/** 걷기: 머리 끄덕임(rad). 꼬리 흔들림(rad, 끝에서): 걷기, 달리기. 달릴 때 꼬리가 뒤로 눕는 각 */
const NOD_WALK = 0.045;
const TAIL_WALK = 0.32;
const TAIL_RUN = 0.14;
const TAIL_BACK = 0.3;
/** 보폭을 정하는 기준 빠르기(m/s)와 그 둘레에서 보폭이 커지는 범위 */
const WALK_V = 0.8;
const RUN_V = 2.2;
const STRIDE_MIN = 0.75;
const STRIDE_MAX = 1.2;
/** 걸음 상태 값이 없을 때 달리기로 보는 빠르기(m/s) */
export const RUN_AT = 1.5;
/** 서기 ↔ 걷기, 걷기 ↔ 달리기로 넘어가는 시간(s) */
const AMP_S = 0.22;
const RUN_S = 0.35;
/** 움직임 줄이기를 고른 손님: 다리가 움직이는 몫(거의 그대로) */
const REDUCED = 0.15;

// ───────── 찾은 결과

export type GaitLeg = {
  /** 발바닥 가운데(바닥 y 0) */
  foot: { x: number; z: number };
  /** 다리가 몸과 이어지는 높이와 그 둘레 가운데 */
  top: { x: number; y: number; z: number };
  /** 다리 꼭대기 둘레의 반지름(무게를 줄 가로 거리) */
  radius: number;
  /** 돌리는 축(x축과 나란한 선이 지나는 y, z) */
  pivot: { y: number; z: number };
  /** 모형 자세에서 다리가 기운 각(rad, 발이 축보다 앞이면 +)과 축에서 발까지 길이 */
  tilt: number;
  length: number;
};

export type PetRig = {
  /** 바닥(가장 낮은 꼭짓점의 y)과 모형 키 */
  floor: number;
  height: number;
  /** 몸 길이(z) */
  length: number;
  /** 다리: 0 앞왼, 1 앞오른, 2 뒤왼, 3 뒤오른(모형은 +Z가 앞, +X가 왼쪽) */
  legs: GaitLeg[];
  /** 배 높이(가장 낮은 다리 꼭대기)와 축의 평균 높이(바닥에서) */
  belly: number;
  hip: number;
  /** 몸을 앞뒤로 기울이고 늘이는 가운데(y, z) */
  center: { y: number; z: number };
  /** 꼬리: 뿌리 자리, 흔드는 축(단위), 길이. 못 찾았으면 null */
  tail: { base: [number, number, number]; axis: [number, number, number]; length: number } | null;
  /** 머리를 끄덕이는 축(목, x축과 나란한 선이 지나는 y, z)과 머리 크기 */
  head: { y: number; z: number; size: number } | null;
  /** 꼭짓점마다 다리 넷의 무게(0..255, 4개씩) */
  legW: Uint8Array;
  /** 꼭짓점마다 꼬리·머리의 무게(0..255, 2개씩) */
  partW: Uint8Array;
};

// ───────── 작은 도구

const smooth = (a: number, b: number, x: number) => {
  const t = b === a ? (x < a ? 0 : 1) : Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function unionFind(n: number) {
  const par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (a: number) => {
    while (par[a] !== a) {
      par[a] = par[par[a]];
      a = par[a];
    }
    return a;
  };
  return { par, find };
}

/**
 * 위치(바닥이 가장 낮은 y)와 색인으로 네 발 모형의 다리·꼬리·목을 찾고 꼭짓점 무게를 매긴다. 찾지 못하면 null.
 * 모형의 약속: +Y 위, +Z 앞, 네 발이 바닥 가까이.
 */
export function petRig(pos: ArrayLike<number>, index: ArrayLike<number> | null): PetRig | null {
  const it = petRigSteps(pos, index);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** petRig를 잘게 나눈 것: next()마다 조금씩(휴대폰에서도 한 번에 몇 ms) 하고, 끝나면 결과를 돌려준다(쉬는 틈에 나눠 돈다) */
export function* petRigSteps(pos: ArrayLike<number>, index: ArrayLike<number> | null): Generator<void, PetRig | null, void> {
  const n = Math.floor(pos.length / 3);
  if (n < 30) return null;
  let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const H = y1 - y0;
  if (!(H > 1e-6) || !(z1 - z0 > 1e-6)) return null;

  // 같은 자리 꼭짓점 묶기
  const q = H * WELD;
  // 격자 칸 번호(키의 몇 배 안이면 겹치지 않는 정수 하나)
  const span = 1 << 15;
  const ids = new Map<number, number>();
  const wid = new Int32Array(n);
  const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1] - y0, z = pos[i * 3 + 2];
    const gx = Math.round(x / q), gy = Math.round(y / q), gz = Math.round(z / q);
    if (Math.abs(gx) >= span / 2 || gy >= span || Math.abs(gz) >= span / 2) return null;
    const key = ((gx + span / 2) * span + gy) * span + (gz + span / 2);
    let id = ids.get(key);
    if (id === undefined) {
      id = m++;
      ids.set(key, id);
      ax[id] = x; ay[id] = y; az[id] = z;
    }
    wid[i] = id;
    if ((i & 2047) === 2047) yield;
  }
  const wx = ax.subarray(0, m), wy = ay.subarray(0, m), wz = az.subarray(0, m);
  const tn = index ? index.length - (index.length % 3) : n - (n % 3);
  const at = (k: number) => (index ? index[k] : k);
  const T = tn / 3;
  if (T < 10) return null;
  const tri = new Int32Array(tn);
  for (let k = 0; k < tn; k++) {
    const v = at(k);
    if (!(v >= 0 && v < n)) return null;
    tri[k] = wid[v];
  }
  // 이웃(겉면 거리·무게 고르기): 꼭짓점마다 이웃 목록을 한 배열에(at0[v]..at0[v+1])
  yield;
  const nb = neighbours(tri, T, m);
  yield;
  const minLeg = Math.max(6, Math.round(m * LEG_MIN));
  const floor = FLOOR * H;
  const steps = Math.ceil(CUT_MAX / CUT_STEP);
  // 삼각형을 이어 붙일 칸(가장 높은 꼭짓점이 그 칸의 높이보다 아래가 되는 첫 칸)마다 모은다
  const stepOf = new Int32Array(T);
  const perStep = new Int32Array(steps + 2);
  for (let t = 0; t < T; t++) {
    const top = Math.max(wy[tri[t * 3]], wy[tri[t * 3 + 1]], wy[tri[t * 3 + 2]]);
    const k = Math.min(steps + 1, Math.floor(top / (CUT_STEP * H)) + 1);
    stepOf[t] = k;
    perStep[k]++;
  }
  const stepAt = new Int32Array(steps + 3);
  for (let k = 0; k <= steps + 1; k++) stepAt[k + 1] = stepAt[k] + perStep[k];
  const order = new Int32Array(T);
  const put = stepAt.slice(0, steps + 2);
  for (let t = 0; t < T; t++) order[put[stepOf[t]]++] = t;
  yield;

  /** 높이를 올리며 덩어리를 잇는다. each(칸 번호, 높이)가 false를 돌려주면 멈춘다 */
  const sweep = function* (each: (s: number, cut: number, find: (a: number) => number, size: Int32Array, low: Float64Array, roots: Set<number>) => boolean) {
    const { par, find } = unionFind(m);
    const size = new Int32Array(m).fill(1);
    const low = Float64Array.from(wy);
    // 바닥 가까이 내려온 덩어리의 뿌리들
    const roots = new Set<number>();
    for (let i = 0; i < m; i++) if (wy[i] < floor) roots.add(i);
    let ti = 0;
    for (let s = 1; s <= steps; s++) {
      const cut = s * CUT_STEP * H;
      while (ti < stepAt[s + 1]) {
        const t = order[ti++];
        for (let e = 0; e < 2; e++) {
          let a = find(tri[t * 3 + e]), b = find(tri[t * 3 + e + 1]);
          if (a === b) continue;
          if (size[a] < size[b]) [a, b] = [b, a];
          par[b] = a;
          size[a] += size[b];
          low[a] = Math.min(low[a], low[b]);
          roots.delete(b);
          if (low[a] < floor) roots.add(a);
        }
      }
      if (!each(s, cut, find, size, low, roots)) return;
      if (s % 12 === 0) yield;
    }
  };
  /** 지금 다리로 보이는 덩어리(큰 차례로 넷) */
  const legsNow = (size: Int32Array, roots: Set<number>): number[] | null => {
    const big = [...roots].filter((r) => size[r] >= minLeg).sort((a, b) => size[b] - size[a]);
    if (big.length < 4) return null;
    if (big.length > 4 && size[big[4]] >= FIFTH * size[big[3]]) return null;
    return big.slice(0, 4);
  };
  // 1) 다리 넷이 따로 있는 가장 높은 칸
  let best = 0;
  yield* sweep((s, _cut, _find, size, _low, roots) => {
    if (legsNow(size, roots)) best = s;
    return true;
  });
  if (!best) return null;
  // 2) 그 칸의 다리 덩어리(묶은 꼭짓점마다 다리 번호)와, 그 뒤 다리마다 다른 다리·몸통과 이어지는 높이
  const legOf = new Int8Array(m).fill(-1);
  const bestCut = best * CUT_STEP * H;
  const reps: number[] = [];
  const topCut = [0, 0, 0, 0];
  const lastSize = [0, 0, 0, 0];
  yield* sweep((s, cut, find, size, _low, roots) => {
    if (s < best) return true;
    if (s === best) {
      const legs = legsNow(size, roots);
      if (!legs) return false;
      legs.forEach((r, i) => { reps.push(r); lastSize[i] = size[r]; });
      for (let v = 0; v < m; v++) {
        if (wy[v] >= cut) continue;
        const k = legs.indexOf(find(v));
        if (k >= 0) legOf[v] = k;
      }
      return true;
    }
    let open = false;
    for (let i = 0; i < 4; i++) {
      if (topCut[i]) continue;
      const r = find(reps[i]);
      const joined = reps.some((o, j) => j !== i && find(o) === r);
      // 다른 다리와 만나지 않고 몸통에 먼저 붙으면 한 칸에 크게 불어난다
      if (joined || size[r] > 2.2 * lastSize[i] + minLeg) topCut[i] = cut - CUT_STEP * H / 2;
      else {
        lastSize[i] = size[r];
        open = true;
      }
    }
    return open;
  });
  if (reps.length !== 4) return null;
  for (let i = 0; i < 4; i++) if (!topCut[i]) topCut[i] = bestCut;

  yield;
  // 3) 다리마다 발·꼭대기 둘레
  type Raw = { foot: { x: number; z: number }; top: { x: number; y: number; z: number }; radius: number; lowest: number };
  const raw: Raw[] = [];
  for (let i = 0; i < 4; i++) {
    let lowest = Infinity, highest = -Infinity;
    for (let v = 0; v < m; v++) {
      if (legOf[v] !== i) continue;
      if (wy[v] < lowest) lowest = wy[v];
      if (wy[v] > highest) highest = wy[v];
    }
    // 꼭대기 둘레: 다리 덩어리의 가장 높은 곳에서 TOP_BAND 안
    const band = highest - TOP_BAND * H;
    let fx = 0, fz = 0, fn = 0, tx = 0, tz = 0, tnum = 0;
    for (let v = 0; v < m; v++) {
      if (legOf[v] !== i) continue;
      if (wy[v] < lowest + 0.05 * H) { fx += wx[v]; fz += wz[v]; fn++; }
      if (wy[v] >= band) { tx += wx[v]; tz += wz[v]; tnum++; }
    }
    if (!fn || !tnum) return null;
    const top = { x: tx / tnum, y: topCut[i], z: tz / tnum };
    let radius = 0;
    for (let v = 0; v < m; v++) {
      if (legOf[v] !== i || wy[v] < band) continue;
      radius = Math.max(radius, Math.hypot(wx[v] - top.x, wz[v] - top.z));
    }
    raw.push({ foot: { x: fx / fn, z: fz / fn }, top, radius: Math.max(radius, 0.02 * H), lowest });
  }
  // 앞 둘(꼭대기 z가 큰 쪽)과 뒤 둘, 쌍 안에서는 x가 큰 쪽이 왼쪽
  const byZ = [0, 1, 2, 3].sort((a, b) => raw[b].top.z - raw[a].top.z);
  const pair = (a: number, b: number) => (raw[a].top.x + raw[a].foot.x >= raw[b].top.x + raw[b].foot.x ? [a, b] : [b, a]);
  const slot = [...pair(byZ[0], byZ[1]), ...pair(byZ[2], byZ[3])];
  const frontZ = (raw[slot[0]].top.z + raw[slot[1]].top.z) / 2, backZ = (raw[slot[2]].top.z + raw[slot[3]].top.z) / 2;
  // 앞뒤 다리 사이가 몸 길이의 15%는 되어야 네 발 짐승의 다리다
  if (!(frontZ - backZ > 0.15 * (z1 - z0))) return null;
  const legs: GaitLeg[] = slot.map((k) => {
    const r = raw[k];
    // 축은 다리 줄기(발 → 꼭대기)를 따라 몸 속으로 조금 올린다
    const up = PIVOT_UP * H;
    const slope = Math.max(-SLOPE_MAX, Math.min(SLOPE_MAX, (r.top.z - r.foot.z) / Math.max(1e-6, r.top.y - r.lowest)));
    const pivot = { y: r.top.y + up, z: r.top.z + slope * up };
    const f0 = r.foot.z - pivot.z;
    return { foot: r.foot, top: r.top, radius: r.radius, pivot, tilt: Math.atan2(f0, pivot.y), length: Math.hypot(f0, pivot.y) };
  });
  if (legs.some((l) => !(l.length > 0.02 * H) || l.top.y > 0.75 * H || !Number.isFinite(l.tilt))) return null;
  // 덩어리 번호(크기 차례) → 다리 자리(앞왼, 앞오른, 뒤왼, 뒤오른)
  for (let v = 0; v < m; v++) if (legOf[v] >= 0) legOf[v] = slot.indexOf(legOf[v]);
  const belly = Math.min(...legs.map((l) => l.top.y));
  const center = {
    y: legs.reduce((a, l) => a + l.pivot.y, 0) / 4 + 0.04 * H,
    z: legs.reduce((a, l) => a + l.pivot.z, 0) / 4,
  };
  const cx = legs.reduce((a, l) => a + l.top.x, 0) / 4;

  yield;
  // 4) 다리 무게: 다리 덩어리는 1, 몸 쪽은 꼭대기 둘레에서만 위로 갈수록 줄인다. 이음매 둘레는 이웃끼리 고른다
  const lw = new Float32Array(m * 4);
  const lowBand = bestCut - 0.05 * H;
  const highBand = Math.max(...legs.map((l) => l.pivot.y)) + 0.06 * H;
  for (let v = 0; v < m; v++) {
    for (let i = 0; i < 4; i++) {
      const l = legs[i];
      const fade = 1 - smooth(l.top.y - 0.02 * H, l.pivot.y + 0.01 * H, wy[v]);
      let w = 0;
      if (legOf[v] === i) w = fade;
      else if (legOf[v] < 0 && wy[v] > lowBand) {
        // 다리 줄기(발 → 꼭대기, 위로는 꼭대기 그대로)의 그 높이 자리에서 가로로 잰 거리
        const t = Math.min(1, wy[v] / Math.max(1e-6, l.top.y));
        const lx = l.foot.x + (l.top.x - l.foot.x) * t, lz = l.foot.z + (l.top.z - l.foot.z) * t;
        const ex = wx[v] - lx, ez = wz[v] - lz;
        const d = Math.sqrt(ex * ex + ez * ez);
        w = fade * (1 - smooth(l.radius, l.radius * 1.8 + 0.02 * H, d));
      }
      lw[v * 4 + i] = w;
    }
  }
  const band = (v: number) => wy[v] > lowBand && wy[v] < highBand;
  const tmp = new Float32Array(m * 4);
  yield;
  for (let it = 0; it < 6; it++) {
    yield;
    tmp.set(lw);
    for (let v = 0; v < m; v++) {
      const a = nb.start[v], b = nb.start[v + 1];
      if (!band(v) || b === a) continue;
      for (let i = 0; i < 4; i++) {
        let s = 0;
        for (let e = a; e < b; e++) s += tmp[nb.list[e] * 4 + i];
        lw[v * 4 + i] = 0.5 * tmp[v * 4 + i] + (0.5 * s) / (b - a);
      }
    }
  }

  yield;
  // 5) 꼬리: 뒤쪽 위에서 몸 가운데서 가장 먼 점부터 겉면 거리를 잰다
  const lift = belly + 0.08 * H;
  let tip = -1, far = 0;
  for (let v = 0; v < m; v++) {
    if (wy[v] < lift || wz[v] > center.z) continue;
    const d = (wx[v] - cx) ** 2 + (wy[v] - center.y) ** 2 + (wz[v] - center.z) ** 2;
    if (d > far) { far = d; tip = v; }
  }
  const pw = new Float32Array(m * 2);
  let tail: PetRig['tail'] = null;
  if (tip >= 0) {
    const geo = surfaceDistance(tip, nb, wx, wy, wz);
    yield;
    const ring = RING * H;
    const bins = Math.ceil(Math.sqrt(far) * 1.5 / ring) + 1;
    const lo = Array.from({ length: bins }, () => [Infinity, Infinity, Infinity]);
    const hi = Array.from({ length: bins }, () => [-Infinity, -Infinity, -Infinity]);
    for (let v = 0; v < m; v++) {
      const b = Math.floor(geo[v] / ring);
      if (!(b < bins)) continue;
      const p = [wx[v], wy[v], wz[v]];
      for (let k = 0; k < 3; k++) { lo[b][k] = Math.min(lo[b][k], p[k]); hi[b][k] = Math.max(hi[b][k], p[k]); }
    }
    const spread = lo.map((l, b) => (hi[b][0] >= l[0] ? Math.max(hi[b][0] - l[0], hi[b][1] - l[1], hi[b][2] - l[2]) : 0));
    let end = -1;
    for (let b = 3; b < bins; b++) {
      const seen = spread.slice(1, b).filter((s) => s > 0).sort((p, r) => p - r);
      const med = seen.length ? seen[seen.length >> 1] : 0;
      if (med > 0 && spread[b] > RING_JUMP * med) { end = b; break; }
    }
    const len = end * ring;
    if (end > 0 && len >= TAIL_MIN * H) {
      // 뿌리: 마지막 꼬리 고리의 가운데
      let bx = 0, by = 0, bz = 0, bn = 0;
      for (let v = 0; v < m; v++) {
        if (geo[v] >= len - ring && geo[v] < len) { bx += wx[v]; by += wy[v]; bz += wz[v]; bn++; }
      }
      if (bn) {
        const base: [number, number, number] = [bx / bn, by / bn, bz / bn];
        // 흔드는 축: 옆(x)과 꼬리 방향에 모두 수직(서 있는 꼬리는 앞뒤 축, 누운 꼬리는 위아래 축)
        const dy = wy[tip] - base[1], dz = wz[tip] - base[2];
        const ax = Math.hypot(dy, dz);
        const axis: [number, number, number] = ax > 1e-6 ? [0, -dz / ax, dy / ax] : [0, 1, 0];
        // 흔드는 쪽이 꼬리 끝을 옆으로 미는지(축 · (꼬리 × x) > 0)는 각의 부호만 바꾸므로 그대로 둔다
        tail = { base, axis, length: len };
        for (let v = 0; v < m; v++) if (geo[v] < len) pw[v * 2] = smooth(0, 1, 1 - geo[v] / len);
      }
    }
  }

  yield;
  // 6) 머리: 앞다리 축 앞쪽, 몸 가운데 높이 위. 끄덕임은 작아서 경계를 넓게 섞는다
  const frontPivot = { y: (legs[0].pivot.y + legs[1].pivot.y) / 2, z: (legs[0].pivot.z + legs[1].pivot.z) / 2 };
  let headTop = -Infinity, nose = -Infinity;
  for (let v = 0; v < m; v++) {
    if (wz[v] < frontPivot.z || wy[v] < center.y) continue;
    headTop = Math.max(headTop, wy[v]);
    nose = Math.max(nose, wz[v]);
  }
  let head: PetRig['head'] = null;
  if (Number.isFinite(headTop) && headTop - center.y > 0.1 * H && nose - frontPivot.z > 0.05 * H) {
    head = { y: center.y + 0.35 * (headTop - center.y), z: frontPivot.z, size: Math.max(headTop - center.y, nose - frontPivot.z) };
    for (let v = 0; v < m; v++) {
      if (pw[v * 2] > 0) continue;
      pw[v * 2 + 1] = smooth(head.z - 0.02 * H, head.z + 0.08 * H, wz[v]) * smooth(head.y - 0.06 * H, head.y + 0.04 * H, wy[v]);
    }
  }

  yield;
  // 7) 모든 꼭짓점으로(같은 자리 꼭짓점은 같은 무게: 그림 이음매가 벌어지지 않는다)
  const legW = new Uint8Array(n * 4);
  const partW = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    const v = wid[i];
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += lw[v * 4 + k];
    const kk = sum > 1 ? 1 / sum : 1;
    for (let k = 0; k < 4; k++) legW[i * 4 + k] = Math.round(Math.min(1, Math.max(0, lw[v * 4 + k] * kk)) * 255);
    partW[i * 2] = Math.round(Math.min(1, Math.max(0, pw[v * 2])) * 255);
    partW[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, pw[v * 2 + 1])) * 255);
    if ((i & 2047) === 2047) yield;
  }
  // y는 받은 그대로의 자리로(바닥이 0이 아닌 기하도 같은 꼭짓점 좌표에서 돈다)
  const lift0 = (o: { y: number }) => { o.y += y0; };
  for (const l of legs) { lift0(l.top); lift0(l.pivot); }
  center.y += y0;
  if (tail) tail.base[1] += y0;
  if (head) head.y += y0;
  const hip = legs.reduce((a, l) => a + l.pivot.y, 0) / 4 - y0;
  return { floor: y0, height: H, length: z1 - z0, legs, belly: belly + y0, hip, center, tail, head, legW, partW };
}

type Neighbours = { start: Int32Array; list: Int32Array };

/** 삼각형의 변으로 이웃 목록(겹친 것은 하나로) */
function neighbours(tri: Int32Array, T: number, m: number): Neighbours {
  const deg = new Int32Array(m + 1);
  for (let t = 0; t < T * 3; t++) deg[tri[t]] += 2;
  const start = new Int32Array(m + 1);
  for (let v = 0; v < m; v++) start[v + 1] = start[v] + deg[v];
  const fill = start.slice(0, m);
  const raw = new Int32Array(start[m]);
  for (let t = 0; t < T; t++) {
    for (let e = 0; e < 3; e++) {
      const a = tri[t * 3 + e], b = tri[t * 3 + ((e + 1) % 3)];
      if (a === b) continue;
      raw[fill[a]++] = b;
      raw[fill[b]++] = a;
    }
  }
  // 겹친 것을 뺀다(이 꼭짓점에서 이미 본 이웃은 표시)
  const out = new Int32Array(raw.length);
  const begin = new Int32Array(m + 1);
  const mark = new Int32Array(m).fill(-1);
  let k = 0;
  for (let v = 0; v < m; v++) {
    begin[v] = k;
    for (let i = start[v]; i < fill[v]; i++) {
      const u = raw[i];
      if (mark[u] === v) continue;
      mark[u] = v;
      out[k++] = u;
    }
  }
  begin[m] = k;
  return { start: begin, list: out.subarray(0, k) };
}

/** 한 점에서 겉면(이웃 꼭짓점을 잇는 변)을 따라 잰 거리 */
function surfaceDistance(src: number, nb: Neighbours, x: Float64Array, y: Float64Array, z: Float64Array): Float64Array {
  const m = x.length;
  const dist = new Float64Array(m).fill(Infinity);
  dist[src] = 0;
  // 작은 이진 힙
  // 작은 이진 힙(꼭짓점, 거리). 한 꼭짓점이 여러 번 들어갈 수 있어 변 수만큼 넉넉히
  const cap = nb.list.length + 1;
  const hv = new Int32Array(cap), hk = new Float64Array(cap);
  let size = 0;
  const push = (v: number, d: number) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= d) break;
      hv[i] = hv[p]; hk[i] = hk[p];
      i = p;
    }
    hv[i] = v; hk[i] = d;
  };
  push(src, 0);
  while (size) {
    const v = hv[0], d = hk[0];
    // 맨 끝을 맨 위로 올려 내린다
    const lv = hv[--size], ld = hk[size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= size) break;
      const c = l + 1 < size && hk[l + 1] < hk[l] ? l + 1 : l;
      if (hk[c] >= ld) break;
      hv[i] = hv[c]; hk[i] = hk[c];
      i = c;
    }
    hv[i] = lv; hk[i] = ld;
    if (d > dist[v]) continue;
    for (let e = nb.start[v]; e < nb.start[v + 1]; e++) {
      const u = nb.list[e];
      const dx = x[u] - x[v], dy = y[u] - y[v], dz = z[u] - z[v];
      const nd = d + Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (nd < dist[u] && size < cap) { dist[u] = nd; push(u, nd); }
    }
  }
  for (let i = 0; i < m; i++) if (!Number.isFinite(dist[i])) dist[i] = Infinity;
  return dist;
}

// ───────── 한 때의 자세(순수 계산, 시험 대상)

/** 걸음 한 때의 자세: 셰이더에 싣는 값과 몸 전체(틀)의 움직임. 길이는 모형 단위(엔진 배율을 곱하기 전) */
export type GaitPose = {
  /** 다리마다 축 둘레 (y, z) 평면의 2×2 행렬(늘임 포함, 4개씩: m00 m01 m10 m11) */
  m: Float32Array;
  /** 다리마다 축 y, 축 z, 돌린 각의 cos, sin(법선용, 4개씩) */
  r: Float32Array;
  /** 다리마다 기운 각(rad, 발이 앞이면 +)과 축에서 발까지 길이 */
  angle: Float32Array;
  reach: Float32Array;
  /** 몸 앞뒤 기울기(rad, 머리를 들면 +)와 늘임(몫) */
  pitch: number; stretch: number;
  /** 꼬리 흔들림(rad: 뿌리 쪽, 끝 쪽)과 뒤로 눕힘(rad), 머리 끄덕임(rad, 들면 +) */
  sway0: number; sway1: number; tailBack: number; nod: number;
  /** 몸 전체가 오르는 높이, 좌우 기울기(rad), 좌우 흔들림 */
  bob: number; roll: number; shift: number;
};

export function gaitPoseNew(): GaitPose {
  return {
    m: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]), r: new Float32Array([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
    angle: new Float32Array(4), reach: new Float32Array(4),
    pitch: 0, stretch: 0, sway0: 0, sway1: 0, tailBack: 0, nod: 0, bob: 0, roll: 0, shift: 0,
  };
}

/** 걸음 박자의 한 때: phase(바퀴 수, 한 바퀴에 네 발이 한 번씩 딛는다), amp(0 서 있음 .. 1 걷는 중), run(0 걷기 .. 1 달리기), stride(보폭 배수) */
export type GaitInput = { phase: number; amp: number; run: number; stride: number; reduce?: boolean };

const ease = (t: number) => t * t * (3 - 2 * t);
const frac = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);

/**
 * 한 다리가 걸음 한 바퀴의 u에 있을 때: 발이 축 아래 가운데서 앞뒤로 벗어난 몫(-1..1, +가 앞)과 든 몫(0..1).
 * 디딘 동안(바퀴의 duty 몫)은 앞에서 뒤로 고르게 간다(몸이 나아가는 만큼: 땅 위 한 자리에 머문다). 든 동안은 부드럽게 앞으로 돌아오며 들었다 내린다
 */
export function legStep(u: number, duty: number, out: { reach: number; lift: number } = { reach: 0, lift: 0 }): { reach: number; lift: number } {
  const t = frac(u);
  if (t < duty) {
    out.reach = 1 - (2 * t) / duty;
    out.lift = 0;
  } else {
    const s = (t - duty) / (1 - duty);
    out.reach = -1 + 2 * ease(s);
    out.lift = Math.sin(Math.PI * s);
  }
  return out;
}
const stepNow = { reach: 0, lift: 0 };

/** 보폭 배수(범위 안으로) */
const strideOf = (s: number) => Math.min(STRIDE_MAX, Math.max(STRIDE_MIN, s || 1));

/** 디딘 발이 축 아래 가운데서 앞뒤로 가는 거리(모형 단위) */
const sweepOf = (rig: PetRig, run: number, stride: number) => Math.tan(TROT.swing + (BOUND.swing - TROT.swing) * run) * rig.hip * strideOf(stride);

/** 한 바퀴에 몸이 나아가는 거리(모형 단위): 디딘 동안 발이 쓸고 가는 길이 = 그동안 몸이 간 거리(발이 미끄러지지 않는다) */
export function gaitStride(rig: PetRig, run: number, stride = 1): number {
  const r = clamp01(run);
  return (2 * sweepOf(rig, r, stride)) / (TROT.duty + (BOUND.duty - TROT.duty) * r);
}

/** 다리 하나의 (y, z) 행렬: 모형 자세(기운 각 tilt)를 곧게 펴고 길이를 scale배로 한 뒤 새 각으로 돌린다 */
function legMatrix(out: Float32Array, o: number, tilt: number, angle: number, scale: number) {
  const ca = Math.cos(tilt), sa = Math.sin(tilt), cb = Math.cos(angle), sb = Math.sin(angle);
  out[o] = cb * scale * ca + sb * sa;
  out[o + 1] = -cb * scale * sa + sb * ca;
  out[o + 2] = -sb * scale * ca + cb * sa;
  out[o + 3] = sb * scale * sa + cb * ca;
}

/** 걸음 박자의 한 때 → 자세(out에 쓴다: 프레임마다 새로 만들지 않는다) */
export function gaitPose(rig: PetRig, g: GaitInput, out: GaitPose): GaitPose {
  const run = clamp01(g.run);
  const on = clamp01(g.amp);
  const amp = on * (g.reduce ? REDUCED : 1);
  const body = g.reduce ? 0 : on;
  const H = rig.height;
  const u = Number.isFinite(g.phase) ? g.phase : 0;
  const tau = Math.PI * 2;
  // 몸 오르내림: 걷기는 대각선 쌍이 디딘 가운데서 낮다(한 바퀴에 두 번), 달리기는 네 발이 다 뜬 때 높다(뻗은 채 뜰 때가 더)
  const bobWalk = BOB_WALK * H * 0.5 * (1 + Math.cos(2 * tau * (u - 0.025)));
  const bobRun = BOB_RUN * H * (0.5 + 0.5 * Math.cos(2 * tau * (u - 0.47))) * (0.75 + 0.25 * Math.cos(tau * (u - 0.97)));
  out.bob = body * (bobWalk + (bobRun - bobWalk) * run);
  out.roll = body * (1 - run) * ROLL_WALK * Math.sin(tau * u);
  out.shift = body * (1 - run) * SHIFT_WALK * H * Math.sin(tau * u);
  // 달리기: 앞발로 받을 때 머리를 숙이고 뒷발로 찰 때 든다. 뒷발로 차고 뜰 때 몸이 가장 길고, 모아 뜰 때 가장 짧다
  const lean = PITCH_RUN * Math.sin(tau * (u - 0.47));
  out.pitch = body * run * lean;
  out.stretch = body * run * STRETCH_RUN * Math.cos(tau * (u - 0.97));
  // 머리: 걸을 때는 걸음마다 살짝 끄덕이고, 달릴 때는 몸 기울기를 되받아 시선을 지킨다
  out.nod = body * ((1 - run) * NOD_WALK * Math.sin(2 * tau * (u - 0.1)) - run * HEAD_HOLD * lean);
  // 꼬리: 걸을 때는 두 바퀴에 한 번 좌우로(끝이 조금 늦게), 달릴 때는 뒤로 눕혀 작게
  out.sway0 = body * ((1 - run) * TAIL_WALK * Math.sin(Math.PI * u) + run * TAIL_RUN * Math.sin(tau * (u - 0.2)));
  out.sway1 = body * ((1 - run) * TAIL_WALK * Math.sin(Math.PI * u - 1.2) + run * TAIL_RUN * Math.sin(tau * (u - 0.2) - 1.2));
  out.tailBack = body * run * TAIL_BACK * (0.8 + 0.2 * Math.sin(tau * (u - 0.47)));
  const duty = TROT.duty + (BOUND.duty - TROT.duty) * run;
  const lift = TROT.lift + (BOUND.lift - TROT.lift) * run;
  const sweep = sweepOf(rig, run, g.stride);
  for (let i = 0; i < 4; i++) {
    const l = rig.legs[i];
    const st = legStep(u + TROT.phase[i] + (BOUND.phase[i] - TROT.phase[i]) * run, duty, stepNow);
    // 발이 닿을 높이: 몸이 오른 만큼 바닥이 멀다(디딘 발은 바닥에 머문다). 든 발은 다리를 줄여 든다
    const down = Math.max(0.2 * l.length, l.pivot.y - rig.floor + out.bob - lift * l.length * st.lift);
    const reach = sweep * st.reach;
    const want = Math.atan2(reach, down);
    const angle = l.tilt + (want - l.tilt) * amp;
    const scale = 1 + (Math.hypot(reach, down) / l.length - 1) * amp;
    legMatrix(out.m, i * 4, l.tilt, angle, scale);
    out.r[i * 4] = l.pivot.y;
    out.r[i * 4 + 1] = l.pivot.z;
    out.r[i * 4 + 2] = Math.cos(angle - l.tilt);
    out.r[i * 4 + 3] = Math.sin(angle - l.tilt);
    out.angle[i] = angle;
    out.reach[i] = l.length * scale;
  }
  return out;
}

// ───────── 셰이더. deformPoint가 같은 계산을 한다(시험용)

const GAIT_COMMON = /* glsl */`#include <common>
attribute vec4 petLeg;
attribute vec2 petPart;
uniform vec4 gaitM[ 4 ];
uniform vec4 gaitR[ 4 ];
uniform vec4 gaitBody;
uniform vec4 gaitTail;
uniform vec4 gaitTailAxis;
uniform vec4 gaitPart;
uniform vec2 gaitNeck;
vec2 gaitTurn( vec2 v, float a ) {
	float c = cos( a ), s = sin( a );
	return vec2( c * v.x + s * v.y, - s * v.x + c * v.y );
}
vec3 gaitSpin( vec3 v, vec3 k, float a ) {
	float c = cos( a ), s = sin( a );
	return v * c + cross( k, v ) * s + k * dot( k, v ) * ( 1.0 - c );
}
vec3 gaitMove( vec3 p, bool dir ) {
	vec2 d = vec2( 0.0 );
	for ( int i = 0; i < 4; i ++ ) {
		float w = petLeg[ i ];
		if ( w <= 0.0 ) continue;
		vec4 r = gaitR[ i ];
		if ( dir ) {
			d += w * ( vec2( r.z * p.y + r.w * p.z, - r.w * p.y + r.z * p.z ) - p.yz );
		} else {
			vec4 m = gaitM[ i ];
			vec2 q = p.yz - r.xy;
			d += w * ( vec2( m.x * q.x + m.y * q.y, m.z * q.x + m.w * q.y ) - q );
		}
	}
	p.yz += d;
	float t = petPart.x;
	if ( t > 0.0 ) {
		vec3 o = dir ? vec3( 0.0 ) : gaitTail.xyz;
		vec3 v = p - o;
		v.yz = gaitTurn( v.yz, gaitTail.w * t );
		v = gaitSpin( v, gaitTailAxis.xyz, t * mix( gaitPart.x, gaitPart.y, t ) );
		p = o + v;
	}
	float h = petPart.y;
	if ( h > 0.0 ) {
		vec2 o = dir ? vec2( 0.0 ) : gaitNeck;
		p.yz = o + gaitTurn( p.yz - o, gaitPart.z * h );
	}
	float b = 1.0 - clamp( petLeg.x + petLeg.y + petLeg.z + petLeg.w, 0.0, 1.0 );
	if ( b > 0.0 ) {
		vec2 o = dir ? vec2( 0.0 ) : gaitBody.xy;
		p.yz = o + gaitTurn( p.yz - o, gaitBody.z * b );
		if ( ! dir ) p.z += gaitBody.w * ( p.z - gaitBody.y ) * b;
	}
	return p;
}`;
const GAIT_NORMAL = /* glsl */`#include <beginnormal_vertex>
objectNormal = gaitMove( objectNormal, true );`;
const GAIT_BEGIN = /* glsl */`#include <begin_vertex>
transformed = gaitMove( transformed, false );`;

/** 셰이더가 꼭짓점 하나에 하는 계산을 그대로 옮긴 것(시험용). w는 다리 넷(0..1), part는 꼬리·머리(0..1). dir이면 법선(돌림만) */
export function deformPoint(rig: PetRig, pose: GaitPose, p: readonly number[], w: readonly number[], part: readonly number[], dir = false): [number, number, number] {
  const turn = (y: number, z: number, a: number): [number, number] => [Math.cos(a) * y + Math.sin(a) * z, -Math.sin(a) * y + Math.cos(a) * z];
  let [x, y, z] = p;
  let dy = 0, dz = 0;
  for (let i = 0; i < 4; i++) {
    if (!(w[i] > 0)) continue;
    const o = i * 4;
    if (dir) {
      const c = pose.r[o + 2], s = pose.r[o + 3];
      dy += w[i] * (c * y + s * z - y);
      dz += w[i] * (-s * y + c * z - z);
    } else {
      const qy = y - pose.r[o], qz = z - pose.r[o + 1];
      dy += w[i] * (pose.m[o] * qy + pose.m[o + 1] * qz - qy);
      dz += w[i] * (pose.m[o + 2] * qy + pose.m[o + 3] * qz - qz);
    }
  }
  y += dy;
  z += dz;
  const t = part[0];
  if (t > 0 && rig.tail) {
    const o = dir ? [0, 0, 0] : rig.tail.base;
    let vx = x - o[0], vy = y - o[1], vz = z - o[2];
    [vy, vz] = turn(vy, vz, pose.tailBack * t);
    const k = rig.tail.axis, a = t * (pose.sway0 + (pose.sway1 - pose.sway0) * t);
    const c = Math.cos(a), s = Math.sin(a), kd = k[0] * vx + k[1] * vy + k[2] * vz;
    const cx = k[1] * vz - k[2] * vy, cy = k[2] * vx - k[0] * vz, cz = k[0] * vy - k[1] * vx;
    vx = vx * c + cx * s + k[0] * kd * (1 - c);
    vy = vy * c + cy * s + k[1] * kd * (1 - c);
    vz = vz * c + cz * s + k[2] * kd * (1 - c);
    x = o[0] + vx; y = o[1] + vy; z = o[2] + vz;
  }
  const h = part[1];
  if (h > 0 && rig.head) {
    const oy = dir ? 0 : rig.head.y, oz = dir ? 0 : rig.head.z;
    const [ty, tz] = turn(y - oy, z - oz, pose.nod * h);
    y = oy + ty; z = oz + tz;
  }
  const b = 1 - Math.min(1, Math.max(0, w[0] + w[1] + w[2] + w[3]));
  if (b > 0) {
    const oy = dir ? 0 : rig.center.y, oz = dir ? 0 : rig.center.z;
    const [ty, tz] = turn(y - oy, z - oz, pose.pitch * b);
    y = oy + ty; z = oz + tz;
    if (!dir) z += pose.stretch * (z - rig.center.z) * b;
  }
  return [x, y, z];
}

// ───────── 화면에 붙이기

/** 걸음에 필요한 반려동물 상태(pet.ts의 PetState). gait가 없으면 빠르기로 걷는지 뛰는지 가늠한다 */
export type GaitState = { moving: boolean; speed: number; dist: number; gait?: unknown };

export type PawGait = {
  /** 찾은 다리·꼬리·목. 아직 찾는 중이거나 찾지 못했으면 null(그동안 화면은 예전처럼 몸만 흔든다) */
  readonly rig: PetRig | null;
  readonly pose: GaitPose;
  /** 다 찾으면 true, 찾지 못했거나 그만두면 false */
  readonly ready: Promise<boolean>;
  /**
   * 매 프레임: on이면 걷는 자세가 보인다(아니면 서 있는 모형 그대로 둔다). now는 performance.now(ms).
   * 몸 전체(틀)의 오르내림·흔들림(m)과 좌우 기울기(rad)를 body에 쓴다. 다리를 아직 못 찾았으면 아무것도 하지 않는다
   */
  step: (st: GaitState, on: boolean, reduce: boolean, now: number, body: { bob: number; roll: number; shift: number }) => void;
  /** 마지막으로 그린 뒤 다리·꼬리·머리·몸이 움직인 가장 큰 거리(m) */
  change: () => number;
  /** 그린 직후: 지금 자세를 그린 것으로 적어 둔다 */
  drawn: () => void;
  /** 시험용: 박자, 움직임 몫, 달리기 몫, 보폭 배수 */
  debug: () => { phase: number; amp: number; run: number; stride: number };
};

/** 쉬는 틈에 한 번(없으면 잠깐 뒤) */
function idle(fn: () => void) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 300 });
  else setTimeout(fn, 16);
}

const toward = (v: number, to: number, d: number) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));

/**
 * 걷는 자세 모형에 걸음을 붙인다: 재질의 꼭짓점 셰이더를 손질하고(셰이더를 짓기 전에 부른다) 꼭짓점 무게를 0으로 실어 둔다(모형 그대로).
 * 다리 찾기는 쉬는 틈에 조금씩(한 번에 budget ms) 하고, 찾으면 무게를 채워 걸음이 시작된다. 기하를 버리면 그만둔다.
 * k는 엔진이 모형에 곱한 배율(모형 단위 → m). 위치가 약속과 다르면 아무것도 바꾸지 않고 null
 */
export function pawGait(mesh: THREE.Mesh, k: number, o: { soon?: (fn: () => void) => void; budget?: number } = {}): PawGait | null {
  const g = mesh.geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined;
  const mat = mesh.material as THREE.Material;
  if (!pos || !(pos.array instanceof Float32Array) || pos.itemSize !== 3 || Array.isArray(mesh.material) || !(k > 0)) return null;
  const legAttr = new THREE.BufferAttribute(new Uint8Array(pos.count * 4), 4, true);
  const partAttr = new THREE.BufferAttribute(new Uint8Array(pos.count * 2), 2, true);
  g.setAttribute('petLeg', legAttr);
  g.setAttribute('petPart', partAttr);
  const pose = gaitPoseNew();
  const u = {
    gaitM: { value: pose.m }, gaitR: { value: pose.r },
    gaitBody: { value: new THREE.Vector4() },
    gaitTail: { value: new THREE.Vector4() },
    gaitTailAxis: { value: new THREE.Vector4(0, 1, 0, 0) },
    gaitPart: { value: new THREE.Vector4() },
    gaitNeck: { value: new THREE.Vector2() },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', GAIT_COMMON)
      .replace('#include <beginnormal_vertex>', GAIT_NORMAL)
      .replace('#include <begin_vertex>', GAIT_BEGIN);
  };
  // 다른 재질과 셰이더 프로그램을 나눠 쓰지 않게(이 재질만 손질했다)
  mat.customProgramCacheKey = () => 'pet-gait';
  const write = () => {
    u.gaitBody.value.z = pose.pitch;
    u.gaitBody.value.w = pose.stretch;
    u.gaitTail.value.w = pose.tailBack;
    u.gaitPart.value.set(pose.sway0, pose.sway1, pose.nod, 0);
  };

  let rig: PetRig | null = null;
  let phase = 0, amp = 0, run = 0, stride = 1;
  const input: GaitInput = { phase: 0, amp: 0, run: 0, stride: 1, reduce: false };
  let lastNow = Number.NaN, lastDist = 0, lastMoving = false;
  const shown = { angle: new Float32Array(4), reach: new Float32Array(4), pitch: 0, stretch: 0, sway0: 0, sway1: 0, tailBack: 0, nod: 0 };
  const keep = () => {
    shown.angle.set(pose.angle);
    shown.reach.set(pose.reach);
    shown.pitch = pose.pitch; shown.stretch = pose.stretch; shown.sway0 = pose.sway0; shown.sway1 = pose.sway1; shown.tailBack = pose.tailBack; shown.nod = pose.nod;
  };

  // 다리 찾기: 쉬는 틈마다 조금씩
  let gone = false;
  g.addEventListener('dispose', () => { gone = true; });
  let settle: (ok: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((done) => { settle = done; });
  const steps = petRigSteps(pos.array, g.index ? (g.index.array as ArrayLike<number>) : null);
  const later = o.soon ?? idle;
  const budget = o.budget ?? 6;
  const finish = (r: PetRig | null) => {
    if (gone || !r) {
      settle(false);
      return;
    }
    (legAttr.array as Uint8Array).set(r.legW);
    legAttr.needsUpdate = true;
    (partAttr.array as Uint8Array).set(r.partW);
    partAttr.needsUpdate = true;
    u.gaitBody.value.set(r.center.y, r.center.z, 0, 0);
    if (r.tail) {
      u.gaitTail.value.set(r.tail.base[0], r.tail.base[1], r.tail.base[2], 0);
      u.gaitTailAxis.value.set(r.tail.axis[0], r.tail.axis[1], r.tail.axis[2], 0);
    }
    if (r.head) u.gaitNeck.value.set(r.head.y, r.head.z);
    // 다리를 뻗고 몸을 늘여도 화면 가장자리에서 잘리지 않게 감싼 공을 조금 키운다
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius *= 1.15;
    gaitPose(r, input, pose);
    write();
    keep();
    rig = r;
    settle(true);
  };
  const tick = () => {
    if (gone) {
      settle(false);
      return;
    }
    const t0 = performance.now();
    try {
      for (;;) {
        const r = steps.next();
        if (r.done) {
          finish(r.value);
          return;
        }
        if (performance.now() - t0 >= budget) break;
      }
    } catch {
      settle(false);
      return;
    }
    later(tick);
  };
  later(tick);

  return {
    get rig() { return rig; },
    pose,
    ready,
    step(st, on, reduce, now, body) {
      const R = rig;
      if (!R) return;
      const dt = Number.isFinite(lastNow) ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0;
      lastNow = now;
      if (!on) {
        // 쉬는 자세가 보인다: 걷는 모형은 서 있는 자세로 돌려 둔다(다시 일어설 때 그 자세에서 시작한다)
        amp = 0;
        run = 0;
        lastMoving = false;
      } else {
        const moving = st.moving === true;
        const told = Number.isFinite(st.speed) && st.speed > 0 ? st.speed : 0;
        const went = moving && lastMoving && st.dist >= lastDist && st.dist - lastDist < 3 ? st.dist - lastDist : -1;
        const speed = moving ? told || (went >= 0 && dt > 0 ? went / dt : 0) : 0;
        const want = st.gait === 'run' ? 1 : st.gait === 'walk' ? 0 : speed >= RUN_AT ? 1 : 0;
        if (moving) run = toward(run, want, dt / RUN_S);
        amp = toward(amp, moving ? 1 : 0, dt / AMP_S);
        if (moving && speed > 0) {
          const base = WALK_V + (RUN_V - WALK_V) * run;
          stride = Math.min(STRIDE_MAX, Math.max(STRIDE_MIN, Math.sqrt(speed / base)));
          const lap = gaitStride(R, run, stride) * k;
          const d = went >= 0 ? went : speed * dt;
          if (lap > 1e-6 && Number.isFinite(d)) phase = (phase + d / lap) % 2;
        }
        lastDist = Number.isFinite(st.dist) ? st.dist : 0;
        lastMoving = moving;
      }
      input.phase = phase; input.amp = amp; input.run = run; input.stride = stride; input.reduce = reduce;
      gaitPose(R, input, pose);
      write();
      body.bob = pose.bob * k;
      body.roll = pose.roll;
      body.shift = pose.shift * k;
    },
    change() {
      const R = rig;
      if (!R) return 0;
      let d = 0;
      for (let i = 0; i < 4; i++) d = Math.max(d, Math.abs(pose.angle[i] - shown.angle[i]) * pose.reach[i] + Math.abs(pose.reach[i] - shown.reach[i]));
      d = Math.max(d, (Math.abs(pose.pitch - shown.pitch) + Math.abs(pose.stretch - shown.stretch)) * R.length * 0.5);
      if (R.tail) d = Math.max(d, (Math.abs(pose.sway0 - shown.sway0) + Math.abs(pose.sway1 - shown.sway1) + Math.abs(pose.tailBack - shown.tailBack)) * R.tail.length);
      if (R.head) d = Math.max(d, Math.abs(pose.nod - shown.nod) * R.head.size);
      return d * k;
    },
    drawn: keep,
    debug: () => ({ phase, amp, run, stride }),
  };
}
