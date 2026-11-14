// 걷기 물리: 평평한 두 층과 경사면(계단 줄기·계단참). three.js에 의존하지 않아 테스트에서 그대로 돈다.
// 몸은 반지름 RADIUS의 원이다. 벽 면에 닿으면 면을 따라, 벽 끝·기둥 모서리에 닿으면 모서리를 돌아 미끄러진다
// (네모난 몸은 문설주에 정면으로 걸려 멈췄다). 실제 집 데이터 변환기(가족 작업대 쪽)의 걷기 검사는
// 한 변 0.6m 네모로 더 엄격하게 본다: 그 검사를 지나는 길은 여기서도 늘 지나간다.
import type { Level, Physics, Ramp } from './types';

export type { Box, Level, Physics, Ramp } from './types';

export type Body = { x: number; z: number; y: number; level: Level };

export const RADIUS = 0.25;
/** 한 걸음에 오르내릴 수 있는 높이(경사면은 이어져 있어 거의 0, 바닥↔계단 끝 이음매만 흡수) */
export const STEP = 0.3;
/** 밀어낸 뒤 벽에서 띄우는 아주 작은 틈(부동소수 반올림으로 다시 막히지 않게) */
const PUSH_EPS = 1e-7;
/** 한 걸음에 밀어내기를 되풀이하는 횟수(안쪽 모서리처럼 두 벽에 함께 닿을 때) */
const PUSH_TRIES = 3;

export function levelOf(p: Physics, y: number): Level {
  return y > p.floor2 / 2 ? 2 : 1;
}

export function inRamp(r: Ramp, x: number, z: number): boolean {
  return x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;
}

export function rampY(r: Ramp, x: number, z: number): number {
  const [c, lo, hi] = r.axis === 'x' ? [x, r.x1, r.x2] : [z, r.z1, r.z2];
  const t = Math.min(1, Math.max(0, (c - lo) / ((hi - lo) || 1)));
  return r.y0 + (r.y1 - r.y0) * t;
}

/** (x,z)에 섰을 때의 높이. 지금 높이에서 갈 수 없으면 null(허공·벽 같은 단차). */
export function heightAt(p: Physics, x: number, z: number, curY: number): number | null {
  let best: number | null = null;
  for (const r of p.ramps) {
    if (!inRamp(r, x, z)) continue;
    const y = rampY(r, x, z);
    if (Math.abs(y - curY) <= STEP && (best === null || Math.abs(y - curY) < Math.abs(best - curY))) best = y;
  }
  if (best !== null) return best;
  const floor = levelOf(p, curY) === 2 ? p.floor2 : 0;
  return Math.abs(floor - curY) <= STEP ? floor : null;
}

/** 몸(반지름 r의 원)이 상자에 닿는가: 상자에서 가장 가까운 점까지의 거리가 r보다 짧으면 막힌 것 */
export function blocked(p: Physics, level: Level, x: number, z: number, r = RADIUS): boolean {
  const rr = r * r;
  for (const b of p.boxes) {
    if (b.level !== 0 && b.level !== level) continue;
    const dx = x < b.x1 ? b.x1 - x : x > b.x2 ? x - b.x2 : 0;
    if (dx >= r) continue;
    const dz = z < b.z1 ? b.z1 - z : z > b.z2 ? z - b.z2 : 0;
    if (dx * dx + dz * dz < rr) return true;
  }
  return false;
}

function tryAt(p: Physics, b: Body, x: number, z: number, r: number): Body | null {
  const y = heightAt(p, x, z, b.y);
  if (y === null) return null;
  const level = levelOf(p, y);
  if (blocked(p, level, x, z, r)) return null;
  return { x, z, y, level };
}

/**
 * 막힌 목표 자리를 가장 깊이 겹친 상자 밖으로 밀어낸다: 벽 면이면 면에 수직으로(면을 따라 미끄러진다),
 * 모서리면 모서리에서 멀어지는 쪽으로(모서리를 돌아 나간다). 몸 가운데가 상자 안이거나 끝내 못 풀면 null.
 */
function pushOut(p: Physics, b: Body, x: number, z: number, level: Level, r: number): Body | null {
  for (let k = 0; k < PUSH_TRIES; k++) {
    let qx = 0, qz = 0;
    let best = r * r;
    let hit = false;
    for (const box of p.boxes) {
      if (box.level !== 0 && box.level !== level) continue;
      const cx = x < box.x1 ? box.x1 : x > box.x2 ? box.x2 : x;
      const cz = z < box.z1 ? box.z1 : z > box.z2 ? box.z2 : z;
      const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (d2 < best) { best = d2; qx = cx; qz = cz; hit = true; }
    }
    if (!hit) break;
    const d = Math.sqrt(best);
    if (d < 1e-9) return null;
    const k2 = (r + PUSH_EPS) / d;
    x = qx + (x - qx) * k2;
    z = qz + (z - qz) * k2;
  }
  return tryAt(p, b, x, z, r);
}

function stepOnce(p: Physics, b: Body, dx: number, dz: number, r: number): Body {
  const tx = b.x + dx, tz = b.z + dz;
  const direct = tryAt(p, b, tx, tz, r);
  if (direct) return direct;
  const y = heightAt(p, tx, tz, b.y);
  if (y !== null) {
    const slid = pushOut(p, b, tx, tz, levelOf(p, y), r);
    // 면을 따라가거나 모서리를 돌 때 옮긴 거리는 걸음과 거의 같다. 걸음의 두 배 넘게 밀려났으면
    // (좁아지는 틈에서 이쪽저쪽으로 튕김) 쓰지 않는다. 가려던 쪽으로 나아가지 못한 자리도 쓰지 않는다:
    // 벽 면과 튀어나온 모서리 사이 구석에서는 면에서 밀리고 모서리에서 또 밀려 뒤로 물러난 자리가 나오는데,
    // 그것을 받으면 다음 프레임에 다시 앞으로 가서 몸이 제자리에서 떤다
    if (slid && Math.hypot(slid.x - b.x, slid.z - b.z) <= 2 * Math.hypot(dx, dz) + 1e-9
      && (slid.x - b.x) * dx + (slid.z - b.z) * dz > 0) return slid;
  }
  // 높이로 막혔거나(경사면 옆·허공) 밀어내기로 못 풀면 축마다 따로 시도한다
  const ax = tryAt(p, b, b.x + dx, b.z, r) ?? b;
  return tryAt(p, ax, ax.x, ax.z + dz, r) ?? ax;
}

/** 한 번 움직이기. 빠르게 움직여도 벽을 뚫지 않게 작은 걸음으로 나눈다. */
export function step(p: Physics, b: Body, dx: number, dz: number, r = RADIUS): Body {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
  let cur = b;
  for (let i = 0; i < n; i++) cur = stepOnce(p, cur, dx / n, dz / n, r);
  return cur;
}

/**
 * a에서 (x,z)까지 곧게 걸어갈 수 있는가(같은 바닥·경사면을 따라 gap 간격으로 훑는다).
 * 자동 걷기가 모퉁이를 미리 돌아도 되는지 물을 때 쓴다. endY를 주면 닿은 높이가 그 높이여야 한다:
 * 옆이 트인 계단 옆 바닥에서 계단 위의 점을 보면, 곧게 걸어간 끝은 그 점이 아니라 계단 밑 바닥이다.
 */
export function clearLine(p: Physics, a: Body, x: number, z: number, r = RADIUS, gap = 0.05, endY?: number): boolean {
  const dx = x - a.x, dz = z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / gap));
  let y = a.y;
  for (let i = 1; i <= n; i++) {
    const px = a.x + (dx * i) / n, pz = a.z + (dz * i) / n;
    const ny = heightAt(p, px, pz, y);
    if (ny === null || blocked(p, levelOf(p, ny), px, pz, r)) return false;
    y = ny;
  }
  return endY === undefined || Math.abs(y - endY) <= STEP / 2;
}
