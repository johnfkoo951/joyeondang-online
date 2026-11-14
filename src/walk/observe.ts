// 컨트롤 룸(관전) 화면 계획: 집 데이터만으로 구획마다 고정 카메라를 세우고, 사람마다 어느 화면에 보일지 정한다.
// three.js·DOM 없이 도는 순수 함수라 시험에서 그대로 돈다. 좌표는 걷기 세계와 같다(미터, y가 위, 앞마당 쪽이 +z).
// 카메라 자리는 손으로 적지 않는다: 집 데이터가 바뀌면 화면도 따라 바뀐다.
import { inRamp, rampY } from './physics';
import type { HouseWorld, Level } from './types';

export type Vec3 = { x: number; y: number; z: number };
/** 0 = 집 그대로, 1·2 = 그 층을 위에서 들여다보는 단면(지붕과 위층을 걷고 그 층 벽을 낮춘다) */
export type Cut = 0 | 1 | 2;
/** 카메라에서 벽에 막히지 않고 보이는 칸(그 층 평면을 cell m 격자로 나눔). bits가 1이면 보인다 */
export type SightMask = { x0: number; z0: number; cell: number; cols: number; rows: number; bits: Uint8Array };
export type ScreenPlan = {
  /** 'all-1'(1층 전체) 또는 'zone-<구획 차례>' */
  id: string;
  title: string;
  level: Level;
  cut: Cut;
  /** 이 화면이 맡는 구획(world.zones의 차례). 층 전체 화면은 빈 목록 */
  zones: number[];
  eye: Vec3;
  at: Vec3;
  /** 세로 시야각(도). SCREEN_ASPECT 화면 기준 */
  fov: number;
  /** 구획 화면에서 보이는 칸. 층 전체 화면은 null(그 층 사람 모두) */
  sight: SightMask | null;
};

type Rect = { x1: number; x2: number; z1: number; z2: number };
type World = Pick<HouseWorld, 'zones' | 'floors' | 'walls' | 'doors' | 'ceilings' | 'props' | 'house' | 'floor2' | 'hotspots' | 'physics'>;

/** 격자 칸의 가로:세로 */
export const SCREEN_ASPECT = 16 / 9;
/** 실내 카메라 높이(바닥에서), 천장·지붕 밑에서 띄울 틈, 천장 없는 바깥의 기둥 카메라 높이 */
const CAM_H = 2.35;
const CEIL_GAP = 0.22;
const POLE_H = 3.4;
/** 카메라가 보는 높이(사람 가슴께)와 시야에 넣을 머리 높이 */
const AIM_H = 0.9;
const HEAD_H = 1.6;
/** 시야각을 맞출 때 카메라 바로 밑(이 반경 안)은 빼고 본다: 모서리 바로 밑까지 넣으면 어안처럼 넓어진다.
 *  바닥 높이 점은 FLOOR_FIT보다 먼 것만 맞춘다(가까운 바닥까지 넣으면 내려다보는 쪽으로 시야가 지나치게 넓어진다) */
const NEAR_SKIP = 1.2;
const FLOOR_FIT = 2.5;
const FOV_MIN = 42;
const FOV_MAX = 70;
/** 이보다 작은 구획(m²)은 따로 화면을 두지 않는다(살피기 자리가 있으면 둔다). 그 사람들은 가까운 구획 화면에 보인다 */
const MIN_AREA = 2.5;
/** 구획 화면은 이만큼까지(층 전체 화면 빼고). 넘으면 살피기 자리가 있는 곳과 넓은 곳부터 */
const MAX_ZONE_SCREENS = 14;
/** 보이는 칸 격자의 칸 크기(m)와 이보다 먼 곳은 보지 않는 거리(m) */
const CELL = 0.5;
const SIGHT_FAR = 30;
/** 이보다 낮은 벽(난간·낮은 담)은 시선을 막지 않는다 */
const WALL_MIN_H = 1.5;
/** 화면을 따로 두게 하는 살피기 자리(들어가는 문·닫힌 문 앞은 지나는 자리라 세지 않는다) */
const KEY_SPOTS = new Set(['room', 'stage', 'lantern', 'sign', 'game']);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const inRect = (r: Rect, x: number, z: number) => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;
const areaOf = (r: Rect) => Math.max(0, r.x2 - r.x1) * Math.max(0, r.z2 - r.z1);
const baseOf = (w: Pick<HouseWorld, 'floor2'>, lv: Level) => (lv === 2 ? w.floor2 : 0);
/** 점과 사각형 사이 거리(안이면 0) */
const rectDist = (r: Rect, x: number, z: number) => Math.hypot(Math.max(r.x1 - x, 0, x - r.x2), Math.max(r.z1 - z, 0, z - r.z2));

/** 걷기 화면의 zoneAt과 같은 규칙(앞에 적힌 구획이 먼저)으로 고른 구획 차례. 없으면 -1 */
export function zoneIndexAt(w: Pick<HouseWorld, 'zones'>, level: Level, x: number, z: number): number {
  return w.zones.findIndex((zn) => zn.level === level && inRect(zn, x, z));
}

/** 선분 a→b가 사각형(가장자리를 e만큼 들인)을 지나는가. 평면(x, z)에서만 본다 */
function crosses(ax: number, az: number, bx: number, bz: number, r: Rect, e = 0.02): boolean {
  const x1 = r.x1 + e, x2 = r.x2 - e, z1 = r.z1 + e, z2 = r.z2 - e;
  if (x1 >= x2 || z1 >= z2) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-12) {
    if (ax < x1 || ax > x2) return false;
  } else {
    let ta = (x1 - ax) / dx, tb = (x2 - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-12) return az >= z1 && az <= z2;
  let ta = (z1 - az) / dz, tb = (z2 - az) / dz;
  if (ta > tb) { const t = ta; ta = tb; tb = t; }
  t0 = Math.max(t0, ta);
  t1 = Math.min(t1, tb);
  return t0 <= t1;
}

/** 그 층에서 시선을 막는 것: 사람 키보다 높은 벽과 닫힌 문 */
function blockers(w: World, lv: Level): Rect[] {
  const out: Rect[] = [];
  for (const s of w.walls) {
    if (s.style === 'invisible' || s.height < WALL_MIN_H) continue;
    if (s.box.level === lv || s.box.level === 0) out.push(s.box);
  }
  for (const d of w.doors) if (d.closed && (d.box.level === lv || d.box.level === 0)) out.push(d.box);
  return out;
}
const clearSight = (walls: readonly Rect[], ax: number, az: number, bx: number, bz: number) => {
  for (const r of walls) if (crosses(ax, az, bx, bz, r)) return false;
  return true;
};

/** 그 자리 위로 막힌 높이(천장판, 위층 바닥, 지붕판·박공 밑). 없으면 Infinity(하늘) */
export function ceilingAbove(w: World, lv: Level, x: number, z: number): number {
  const base = baseOf(w, lv);
  let top = Infinity;
  const take = (y: number) => { if (y > base + 1) top = Math.min(top, y); };
  for (const c of w.ceilings) if (c.level === lv && inRect(c, x, z)) take(c.y);
  if (lv === 1 && w.floors.some((f) => f.level === 2 && inRect(f, x, z))) take(w.floor2);
  for (const p of w.props) {
    if (p.type === 'slab' && inRect(p, x, z)) take(p.y - p.t / 2);
    else if (p.type === 'gable' && inRect(p, x, z)) {
      const half = (p.ridgeAxis === 'x' ? p.z2 - p.z1 : p.x2 - p.x1) / 2;
      const mid = p.ridgeAxis === 'x' ? (p.z1 + p.z2) / 2 : (p.x1 + p.x2) / 2;
      const off = Math.abs((p.ridgeAxis === 'x' ? z : x) - mid);
      take(p.ridge - (p.ridge - p.eave) * Math.min(1, off / Math.max(0.01, half)));
    }
  }
  return top;
}

/**
 * 그 자리에 선 사람의 발 높이: 계단(경사면·계단참) 위면 계단 높이, 아니면 층 바닥. 계단은 두 층에 걸치므로
 * 걷기 물리의 층 판정(바닥 사이 가운데)에 맞춰 그 층 몫으로 자른다
 */
function groundAt(w: World, lv: Level, x: number, z: number): number {
  const base = baseOf(w, lv);
  let best: number | null = null;
  for (const r of w.physics.ramps) {
    if (!inRamp(r, x, z)) continue;
    const y = rampY(r, x, z);
    if (best === null || Math.abs(y - base) < Math.abs(best - base)) best = y;
  }
  if (best === null) return base;
  const half = w.floor2 / 2;
  return lv === 1 ? Math.min(best, half) : Math.max(best, half);
}

/** 카메라 높이: 실내는 천장 밑, 하늘이 트인 곳은 기둥 높이 */
function eyeHeight(w: World, lv: Level, x: number, z: number): number {
  const base = baseOf(w, lv);
  const top = ceilingAbove(w, lv, x, z);
  if (!Number.isFinite(top)) return base + POLE_H;
  return base + clamp(Math.min(CAM_H, top - base - CEIL_GAP), 1.7, CAM_H);
}

/** 구획 안에 고루 뿌린 점(앞에 적힌 다른 구획이 차지한 곳은 뺀다). 하나도 없으면 가운데 */
function samplesOf(w: World, zi: number): Array<{ x: number; z: number }> {
  const zn = w.zones[zi];
  const nx = clamp(Math.round((zn.x2 - zn.x1) / 0.6), 3, 9);
  const nz = clamp(Math.round((zn.z2 - zn.z1) / 0.6), 3, 9);
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = zn.x1 + ((i + 0.5) * (zn.x2 - zn.x1)) / nx;
      const z = zn.z1 + ((j + 0.5) * (zn.z2 - zn.z1)) / nz;
      if (zoneIndexAt(w, zn.level, x, z) === zi) out.push({ x, z });
    }
  }
  return out.length ? out : [{ x: (zn.x1 + zn.x2) / 2, z: (zn.z1 + zn.z2) / 2 }];
}

/** 카메라를 세울 수 있는 자리인가: 그 층 바닥 위(1층의 집 밖은 마당이라 된다), 벽 속이 아님 */
function canMount(w: World, lv: Level, x: number, z: number): boolean {
  const H = w.house;
  const onFloor = w.floors.some((f) => f.level === lv && inRect(f, x, z)) || (lv === 1 && !inRect(H, x, z));
  if (!onFloor) return false;
  // 계단 위(계단참 포함)에는 세우지 않는다: 바닥 높이로 잰 카메라가 계단 디딤판 높이에 걸려 화면을 막는다
  if (Math.abs(groundAt(w, lv, x, z) - baseOf(w, lv)) > 0.4) return false;
  for (const s of w.walls) {
    if (s.style === 'invisible' || (s.box.level !== lv && s.box.level !== 0)) continue;
    if (x > s.box.x1 - 0.12 && x < s.box.x2 + 0.12 && z > s.box.z1 - 0.12 && z < s.box.z2 + 0.12) return false;
  }
  return true;
}

/** 카메라에서 본 점들이 다 들어가는 세로 시야각(도). 카메라 바로 밑과 뒤쪽 점은 뺀다 */
export function fitFov(eye: Vec3, at: Vec3, pts: readonly Vec3[], aspect = SCREEN_ASPECT, lo = FOV_MIN, hi = FOV_MAX): number {
  let fx = at.x - eye.x, fy = at.y - eye.y, fz = at.z - eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // 오른쪽 = 앞 × 위(0,1,0), 화면 위 = 오른쪽 × 앞
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  let tv = 0, th = 0;
  for (const p of pts) {
    if (Math.hypot(p.x - eye.x, p.z - eye.z) < NEAR_SKIP) continue;
    const vx = p.x - eye.x, vy = p.y - eye.y, vz = p.z - eye.z;
    const depth = vx * fx + vy * fy + vz * fz;
    if (depth < 0.3) continue;
    th = Math.max(th, Math.abs(vx * rx + vz * rz) / depth);
    tv = Math.max(tv, Math.abs(vx * ux + vy * uy + vz * uz) / depth);
  }
  const need = Math.max(tv, th / aspect);
  return clamp(((2 * Math.atan(need) * 180) / Math.PI) * 1.08, lo, hi);
}

/** 가로 시야각(라디안): 세로 시야각(도)과 화면 비율에서 */
const hfovOf = (fovDeg: number, aspect: number) => 2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect);

/** 그 층 평면 격자에서, 카메라 시야 안이고 벽에 막히지 않는 칸 */
function sightMask(w: World, lv: Level, eye: Vec3, at: Vec3, fov: number, walls: readonly Rect[]): SightMask {
  const rects: Rect[] = [w.house, ...w.zones.filter((z) => z.level === lv), ...w.floors.filter((f) => f.level === lv)];
  const x0 = Math.min(...rects.map((r) => r.x1)) - 1, x1 = Math.max(...rects.map((r) => r.x2)) + 1;
  const z0 = Math.min(...rects.map((r) => r.z1)) - 1, z1 = Math.max(...rects.map((r) => r.z2)) + 1;
  const cols = Math.max(1, Math.ceil((x1 - x0) / CELL)), rows = Math.max(1, Math.ceil((z1 - z0) / CELL));
  const bits = new Uint8Array(cols * rows);
  const dx = at.x - eye.x, dz = at.z - eye.z;
  const dl = Math.hypot(dx, dz) || 1;
  const half = hfovOf(fov, SCREEN_ASPECT) / 2 + (6 * Math.PI) / 180;
  const cosHalf = Math.cos(Math.min(Math.PI, half));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * CELL, z = z0 + (r + 0.5) * CELL;
      const vx = x - eye.x, vz = z - eye.z;
      const d = Math.hypot(vx, vz);
      if (d > SIGHT_FAR) continue;
      // 카메라 바로 밑은 시야각과 상관없이 보인다(내려다보는 화면 아래 끝)
      if (d > 0.8 && (vx * dx + vz * dz) / (d * dl) < cosHalf) continue;
      if (clearSight(walls, eye.x, eye.z, x, z)) bits[r * cols + c] = 1;
    }
  }
  return { x0, z0, cell: CELL, cols, rows, bits };
}

/** 그 자리가 이 화면의 보이는 칸인가 */
export function inSight(m: SightMask | null, x: number, z: number): boolean {
  if (!m) return false;
  const c = Math.floor((x - m.x0) / m.cell), r = Math.floor((z - m.z0) / m.cell);
  if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return false;
  return m.bits[r * m.cols + c] === 1;
}

/** 구획 하나를 비추는 고정 카메라. 모서리·변 가운데 후보 가운데 구획이 가장 많이 보이고, 집 쪽을 보는 자리 */
function zoneCamera(w: World, zi: number, walls: readonly Rect[]): { eye: Vec3; at: Vec3; fov: number } {
  const zn = w.zones[zi];
  const lv = zn.level;
  const pts = samplesOf(w, zi);
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const hx = (w.house.x1 + w.house.x2) / 2, hz = (w.house.z1 + w.house.z2) / 2;
  const hl = Math.hypot(hx - cx, hz - cz);
  const m = clamp(Math.min(zn.x2 - zn.x1, zn.z2 - zn.z1) * 0.15, 0.25, 0.45);
  const mx = (zn.x1 + zn.x2) / 2, mz = (zn.z1 + zn.z2) / 2;
  const cands: Array<{ x: number; z: number; inside: boolean }> = [];
  // 모서리와 변 가운데를 안으로 m 들인 자리, 그리고 밖으로 나간 자리(작은 구획이나 바닥이 없는 계단 구멍은 밖에서 들여다본다)
  const ring = (d: number, inside: boolean) => {
    const xs = [zn.x1 - d, zn.x2 + d], zs = [zn.z1 - d, zn.z2 + d];
    for (const x of xs) for (const z of zs) cands.push({ x, z, inside });
    cands.push({ x: mx, z: zs[0], inside }, { x: mx, z: zs[1], inside }, { x: xs[0], z: mz, inside }, { x: xs[1], z: mz, inside });
  };
  ring(-m, true);
  ring(0.7, false);
  ring(1.4, false);
  // 카메라가 가운데를 볼 때 가로로 들어오는 반각(가장 넓은 시야각 기준). 이 밖의 점은 벽이 없어도 화면에 안 들어온다
  const cosCone = Math.cos(hfovOf(FOV_MAX, SCREEN_ASPECT) / 2);
  const inView = (ex: number, ez: number, dx: number, dz: number, p: { x: number; z: number }) => {
    const vx = p.x - ex, vz = p.z - ez;
    const d = Math.hypot(vx, vz), dl = Math.hypot(dx, dz);
    return d < 0.8 || dl < 1e-6 || (vx * dx + vz * dz) / (d * dl) >= cosCone;
  };
  let best: { x: number; z: number; score: number } | null = null;
  for (const c of cands) {
    if (!canMount(w, lv, c.x, c.z)) continue;
    const vx = cx - c.x, vz = cz - c.z;
    const vl = Math.hypot(vx, vz);
    let seen = 0;
    for (const p of pts) if (inView(c.x, c.z, vx, vz, p) && clearSight(walls, c.x, c.z, p.x, p.z)) seen++;
    const vis = seen / pts.length;
    // 구획 가운데를 지나 집 가운데 쪽을 보면 더한다(감시 카메라는 바깥 모서리에서 안쪽·드나드는 곳을 본다)
    const inward = hl > 0.5 && vl > 0.01 ? (vx * (hx - cx) + vz * (hz - cz)) / (vl * hl) : 0;
    const score = vis * 4 + inward * 0.6 + (c.inside ? 0.4 : 0) - (vl < 1 ? 1 : 0);
    if (!best || score > best.score + 1e-9) best = { x: c.x, z: c.z, score };
  }
  const spot = best ?? { x: cx, z: cz + 0.01 };
  const eye = { x: spot.x, y: eyeHeight(w, lv, spot.x, spot.z), z: spot.z };
  const clear = pts.filter((p) => clearSight(walls, eye.x, eye.z, p.x, p.z));
  const framed = clear.filter((p) => inView(eye.x, eye.z, cx - eye.x, cz - eye.z, p));
  const use = framed.length ? framed : clear.length ? clear : pts;
  // 계단에 선 사람은 디딤판 높이에 서 있다: 보는 높이와 시야를 그 높이로 맞춘다
  const grounds = use.map((p) => groundAt(w, lv, p.x, p.z));
  const at = {
    x: use.reduce((s, p) => s + p.x, 0) / use.length,
    y: grounds.reduce((s, g) => s + g, 0) / use.length + AIM_H,
    z: use.reduce((s, p) => s + p.z, 0) / use.length,
  };
  // 바로 위에서 내려다보게 되면(구획 한가운데에 섰을 때) 앞으로 조금 민다: 보는 방향이 정해지게
  if (Math.hypot(at.x - eye.x, at.z - eye.z) < 0.3) at.z += 0.3;
  const fitPts: Vec3[] = [];
  use.forEach((p, i) => {
    fitPts.push({ x: p.x, y: grounds[i] + HEAD_H, z: p.z });
    if (Math.hypot(p.x - eye.x, p.z - eye.z) >= FLOOR_FIT) fitPts.push({ x: p.x, y: grounds[i] + 0.05, z: p.z });
  });
  return { eye, at, fov: fitFov(eye, at, fitPts) };
}

/** 한 층 전체를 앞(+z) 위에서 비스듬히 내려다보는 단면 화면 */
function overviewCamera(w: World, lv: Level): { eye: Vec3; at: Vec3; fov: number } {
  const H = w.house;
  const base = baseOf(w, lv);
  // 집과, 집에 붙은 그 층 구획(멀리 나간 마당처럼 가운데가 집 밖으로 1.5m 넘게 나간 구획은 뺀다)
  let b: Rect = { ...H };
  for (const zn of w.zones) {
    if (zn.level !== lv) continue;
    const mx = (zn.x1 + zn.x2) / 2, mz = (zn.z1 + zn.z2) / 2;
    if (rectDist(H, mx, mz) > 1.5) continue;
    b = { x1: Math.min(b.x1, zn.x1), x2: Math.max(b.x2, zn.x2), z1: Math.min(b.z1, zn.z1), z2: Math.max(b.z2, zn.z2) };
  }
  const cx = (b.x1 + b.x2) / 2, cz = (b.z1 + b.z2) / 2;
  const span = Math.max(b.x2 - b.x1, b.z2 - b.z1, 4);
  const pitch = (56 * Math.PI) / 180;
  const dist = span * 1.2;
  const eye = { x: cx, y: base + dist * Math.sin(pitch), z: cz + dist * Math.cos(pitch) };
  const at = { x: cx, y: base, z: cz };
  const pts: Vec3[] = [];
  for (const x of [b.x1, b.x2]) for (const z of [b.z1, b.z2]) pts.push({ x, y: base, z }, { x, y: base + 1.2, z });
  return { eye, at, fov: fitFov(eye, at, pts, SCREEN_ASPECT, 30, 75) };
}

/** 화면을 따로 둘 구획: 넓거나 살피기 자리가 있는 곳. 너무 많으면 살피기 자리가 있는 곳, 넓은 곳부터 */
function zonesWithScreens(w: World): number[] {
  const keyOf = (zi: number) => {
    const zn = w.zones[zi];
    return w.hotspots.some((h) => h.level === zn.level && KEY_SPOTS.has(h.kind) && zoneIndexAt(w, h.level, h.x, h.z) === zi);
  };
  const picked = w.zones.map((zn, i) => ({ i, key: keyOf(i), area: areaOf(zn) })).filter((z) => z.key || z.area >= MIN_AREA);
  if (picked.length <= MAX_ZONE_SCREENS) return picked.map((z) => z.i);
  const keep = new Set([...picked].sort((a, b) => Number(b.key) - Number(a.key) || b.area - a.area).slice(0, MAX_ZONE_SCREENS).map((z) => z.i));
  return picked.filter((z) => keep.has(z.i)).map((z) => z.i);
}

/**
 * 집 데이터로 화면들을 계획한다: 층마다 전체 단면 하나, 그리고 구획마다 고정 카메라.
 * 차례는 층 전체(1층, 2층), 그다음 구획(1층부터, 데이터에 적힌 차례). 같은 이름의 구획은 제목 뒤에 층을 붙인다.
 */
export function planScreens(w: World): ScreenPlan[] {
  const levels = ([1, 2] as Level[]).filter((lv) => lv === 1 || w.floors.some((f) => f.level === 2) || w.zones.some((z) => z.level === 2));
  const out: ScreenPlan[] = [];
  for (const lv of levels) {
    const c = overviewCamera(w, lv);
    out.push({ id: `all-${lv}`, title: `${lv}층 전체`, level: lv, cut: lv, zones: [], ...c, sight: null });
  }
  const own = zonesWithScreens(w).sort((a, b) => w.zones[a].level - w.zones[b].level || a - b);
  const names = new Map<string, number>();
  for (const zi of own) names.set(w.zones[zi].name, (names.get(w.zones[zi].name) ?? 0) + 1);
  const wallsBy = new Map<Level, Rect[]>();
  for (const zi of own) {
    const zn = w.zones[zi];
    if (!wallsBy.has(zn.level)) wallsBy.set(zn.level, blockers(w, zn.level));
    const walls = wallsBy.get(zn.level)!;
    const c = zoneCamera(w, zi, walls);
    const title = (names.get(zn.name) ?? 0) > 1 ? `${zn.name} · ${zn.level}층` : zn.name;
    out.push({ id: `zone-${zi}`, title, level: zn.level, cut: 0, zones: [zi], ...c, sight: sightMask(w, zn.level, c.eye, c.at, c.fov, walls) });
  }
  // 화면이 없는 작은 구획은 같은 층에서 가장 가까운 구획 화면이 맡는다
  for (let zi = 0; zi < w.zones.length; zi++) {
    if (own.includes(zi)) continue;
    const i = nearestZoneScreen(w, out, w.zones[zi].level, (w.zones[zi].x1 + w.zones[zi].x2) / 2, (w.zones[zi].z1 + w.zones[zi].z2) / 2);
    if (i >= 0) out[i].zones.push(zi);
  }
  return out;
}

/** 같은 층 구획 화면 가운데, 맡은 구획이 그 자리에서 가장 가까운 것. 없으면 -1 */
function nearestZoneScreen(w: Pick<HouseWorld, 'zones'>, plans: readonly ScreenPlan[], lv: Level, x: number, z: number): number {
  let best = -1, bestD = Infinity;
  plans.forEach((p, i) => {
    if (p.cut !== 0 || p.level !== lv || !p.zones.length) return;
    const d = rectDist(w.zones[p.zones[0]], x, z);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/**
 * 한 사람이 「있는 곳」으로 칠 화면: 그 자리의 구획을 맡은 화면, 어느 구획에도 없으면 같은 층에서 가장 가까운 구획 화면,
 * 그것도 없으면 그 층 전체 화면. 계획이 비었으면 -1
 */
export function homeScreen(w: Pick<HouseWorld, 'zones'>, plans: readonly ScreenPlan[], level: Level, x: number, z: number): number {
  const zi = zoneIndexAt(w, level, x, z);
  if (zi >= 0) {
    const i = plans.findIndex((p) => p.cut === 0 && p.zones.includes(zi));
    if (i >= 0) return i;
  }
  const near = nearestZoneScreen(w, plans, level, x, z);
  if (near >= 0) return near;
  return plans.findIndex((p) => p.cut === level);
}

export type Seen = { id: string; name: string; level: Level; x: number; z: number };
/** 화면마다 그릴 사람(id)과 그 화면에 「있는」 사람(이름표·수에 쓴다) */
export type ScreenPeople = { draw: Set<string>; here: Seen[] };

/**
 * 사람들을 화면에 나눈다. here = 그 화면이 맡은 곳에 있는 사람(사람 수·이름). draw = 그 화면에 그릴 사람:
 * here와, 같은 층에서 그 카메라에 벽 없이 보이는 자리의 사람. 층 전체 화면은 그 층 사람 모두
 */
export function assignPeople(w: Pick<HouseWorld, 'zones'>, plans: readonly ScreenPlan[], people: readonly Seen[]): ScreenPeople[] {
  const out: ScreenPeople[] = plans.map(() => ({ draw: new Set<string>(), here: [] }));
  for (const p of people) {
    const home = homeScreen(w, plans, p.level, p.x, p.z);
    if (home >= 0) {
      out[home].here.push(p);
      out[home].draw.add(p.id);
    }
    plans.forEach((s, i) => {
      if (s.level !== p.level || i === home) return;
      if (s.cut === p.level) {
        out[i].here.push(p);
        out[i].draw.add(p.id);
      } else if (s.cut === 0 && inSight(s.sight, p.x, p.z)) out[i].draw.add(p.id);
    });
  }
  return out;
}
