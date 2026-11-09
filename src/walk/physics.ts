// 걷기 물리: 평평한 두 층과 경사면(계단 줄기·계단참). three.js에 의존하지 않아 테스트에서 그대로 돈다.
// 규칙은 실제 집 데이터 변환기(가족 작업대 쪽)의 걷기 검사와 같다. 한쪽을 바꾸면 다른 쪽도 바꾼다.
// 몸 반지름만 다르다: 화면은 좁은 문을 덜 걸리게 0.25로 걷고, 변환기 시험은 0.3으로 더 엄격하게 본다.
import type { Level, Physics, Ramp } from './types';

export type { Box, Level, Physics, Ramp } from './types';

export type Body = { x: number; z: number; y: number; level: Level };

export const RADIUS = 0.25;
/** 한 걸음에 오르내릴 수 있는 높이(경사면은 이어져 있어 거의 0, 바닥↔계단 끝 이음매만 흡수) */
export const STEP = 0.3;

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

export function blocked(p: Physics, level: Level, x: number, z: number, r = RADIUS): boolean {
  for (const b of p.boxes) {
    if (b.level !== 0 && b.level !== level) continue;
    if (x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r) return true;
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

function stepOnce(p: Physics, b: Body, dx: number, dz: number, r: number): Body {
  // 대각선이 막히면 축마다 따로 시도해서 벽을 따라 미끄러진다
  return tryAt(p, b, b.x + dx, b.z + dz, r)
    ?? (() => {
      const ax = tryAt(p, b, b.x + dx, b.z, r) ?? b;
      return tryAt(p, ax, ax.x, ax.z + dz, r) ?? ax;
    })();
}

/** 한 번 움직이기. 빠르게 움직여도 벽을 뚫지 않게 작은 걸음으로 나눈다. */
export function step(p: Physics, b: Body, dx: number, dz: number, r = RADIUS): Body {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
  let cur = b;
  for (let i = 0; i < n; i++) cur = stepOnce(p, cur, dx / n, dz / n, r);
  return cur;
}
