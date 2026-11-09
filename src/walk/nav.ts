// 길 찾기: 걷기 물리(physics.ts)의 heightAt·blocked·step·RADIUS를 그대로 써서 층마다 0.2m 격자를 만들고 A*로 길을 찾는다.
// three.js에 의존하지 않아 시험에서 그대로 돈다. 엔진은 tuneWorld를 거친 세계로 걸으므로 여기서도 손질한 물리를 쓴다.
// tuneWorld는 같은 입력에 늘 같은 결과를 주는 순수 함수다(이미 손질한 세계는 그대로 돌려준다). 그래서 격자 캐시는
// 넘겨받은 세계 객체를 열쇠로 한 WeakMap이고, 손질한 세계 객체도 같은 격자를 가리키게 해 둔다.
import { nearestHotspot } from '@/content/world';
import { RADIUS, blocked, heightAt, inRamp, levelOf, rampY, step, type Body } from './physics';
import { tuneWorld } from './tune';
import type { Box, Hotspot, HouseWorld, Level, Physics, Portal } from './types';

export type NavPoint = { x: number; z: number; y: number; level: Level };
export type Destination = {
  id: string; title: string; kind: Hotspot['kind'] | 'portal'; level: Level; x: number; z: number; yaw: number; slug?: string;
};

/** 격자 한 칸(미터) */
export const CELL = 0.2;
const EPS = 1e-6;
/** 상자 묶음 한 변(칸 수). 한 칸 움직임에 닿을 수 있는 상자만 모아 step()을 빠르게 돌린다(결과는 같다). */
const TILE = 8;
/** 묶음 여유: 대각선 한 칸(0.283) + 몸 반지름(0.25) + 여유 */
const TILE_MARGIN = 0.6;
/** 벽에 바짝 붙은 칸은 조금 비싸게(복도 가운데로 걷게) */
const NEAR_WALL = RADIUS + 0.15;
const WALL_COST = 0.15;
/** 높이 변화 비용(1m 오르내림마다) */
const CLIMB_COST = 0.5;
/** 다듬을 때는 몸 반지름에 여유를 더해 모서리를 스치지 않게 한다 */
const SMOOTH_R = RADIUS + 0.04;
const SMOOTH_STEP = 0.1;
/** 막힌 출발·도착을 맞출 때 찾는 거리 */
const SNAP_START = 2.0;
const SNAP_GOAL = 1.5;
/** 칸의 바닥 종류: 1층 바닥, 2층 바닥, 그 밖은 경사면 번호 */
const FLOOR1 = -1;
const FLOOR2 = -2;
const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

type Rect = { x1: number; x2: number; z1: number; z2: number };

type Grid = {
  p: Physics;
  ix0: number; iz0: number; nx: number; nz: number;
  /** 칸(열) 번호 → 그 열의 첫 마디. 길이 nx*nz+1 */
  colStart: Int32Array;
  col: Int32Array;
  x: Float64Array; z: Float64Array; y: Float64Array;
  level: Uint8Array; surf: Int16Array;
  eStart: Int32Array; eTo: Int32Array; eCost: Float32Array;
  comp: Int32Array;
  tiles: Physics[]; tnx: number;
  // A* 작업 공간(호출마다 지우지 않고 회차 번호로 가른다)
  g: Float64Array; from: Int32Array; seen: Uint32Array; done: Uint32Array; run: number;
};

function grow(r: Rect | null, o: Rect): Rect {
  if (!r) return { x1: Math.min(o.x1, o.x2), x2: Math.max(o.x1, o.x2), z1: Math.min(o.z1, o.z2), z2: Math.max(o.z1, o.z2) };
  return {
    x1: Math.min(r.x1, o.x1, o.x2), x2: Math.max(r.x2, o.x1, o.x2),
    z1: Math.min(r.z1, o.z1, o.z2), z2: Math.max(r.z2, o.z1, o.z2),
  };
}
const dot = (x: number, z: number): Rect => ({ x1: x, x2: x, z1: z, z2: z });
const pad = (r: Rect, m: number): Rect => ({ x1: r.x1 - m, x2: r.x2 + m, z1: r.z1 - m, z2: r.z2 + m });
const inside = (r: Rect | null, x: number, z: number) => !!r && x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;

/** 그 층에서 평평한 바닥 칸을 만들 범위: 바닥판·상자·경사면·살피기 자리·포털·spawn을 모두 덮는 사각형 */
function levelBounds(w: HouseWorld, level: Level): Rect | null {
  let r: Rect | null = null;
  for (const f of w.floors) if (f.level === level) r = grow(r, f);
  for (const b of w.physics.boxes) if (b.level === level) r = grow(r, b);
  for (const rp of w.physics.ramps) r = grow(r, rp);
  for (const h of w.hotspots) if (h.level === level) r = grow(r, dot(h.x, h.z));
  for (const pt of w.portals ?? []) if (pt.level === level) r = grow(r, dot(pt.x, pt.z));
  if (level === 1) r = grow(r, dot(w.spawn.x, w.spawn.z));
  return r && pad(r, 2 * CELL);
}

/** 사각형(몸 반지름 r만큼 넓혀서)에 닿을 수 있는 상자만 모은 물리. step()·blocked()의 결과는 원래 물리와 같다. */
function physicsNear(p: Physics, area: Rect, r: number): Physics {
  const boxes: Box[] = p.boxes.filter((b) => b.x1 - r < area.x2 && b.x2 + r > area.x1 && b.z1 - r < area.z2 && b.z2 + r > area.z1);
  return { boxes, ramps: p.ramps, floor2: p.floor2 };
}

// ───────── 격자 만들기(세계마다 한 번)

const grids = new WeakMap<HouseWorld, Grid>();

function gridFor(world: HouseWorld): Grid {
  const hit = grids.get(world);
  if (hit) return hit;
  const tuned = tuneWorld(world);
  const g = grids.get(tuned) ?? buildGrid(tuned);
  grids.set(world, g);
  grids.set(tuned, g);
  return g;
}

function buildGrid(w: HouseWorld): Grid {
  const p = w.physics;
  const b1 = levelBounds(w, 1), b2 = levelBounds(w, 2);
  const all = b1 && b2 ? grow(b1, b2) : b1 ?? b2 ?? pad(dot(w.spawn.x, w.spawn.z), CELL);
  const ix0 = Math.floor(all.x1 / CELL), iz0 = Math.floor(all.z1 / CELL);
  const nx = Math.ceil(all.x2 / CELL) - ix0 + 1, nz = Math.ceil(all.z2 / CELL) - iz0 + 1;
  const tnx = Math.ceil(nx / TILE), tnz = Math.ceil(nz / TILE);
  const tiles: Physics[] = [];
  for (let tz = 0; tz < tnz; tz++) {
    for (let tx = 0; tx < tnx; tx++) {
      const x1 = (ix0 + tx * TILE) * CELL, z1 = (iz0 + tz * TILE) * CELL;
      tiles.push(physicsNear(p, pad({ x1, x2: x1 + (TILE - 1) * CELL, z1, z2: z1 + (TILE - 1) * CELL }, TILE_MARGIN), 0));
    }
  }
  const tileOf = (cx: number, cz: number) => Math.floor(cx / TILE) + Math.floor(cz / TILE) * tnx;

  // 마디: 열마다 설 수 있는 높이(경사면 먼저, 그다음 1층·2층 바닥). heightAt이 그 높이를 그대로 돌려주고 막히지 않은 것만.
  const X: number[] = [], Z: number[] = [], Y: number[] = [], L: number[] = [], S: number[] = [], C: number[] = [], NW: number[] = [];
  const colStart = new Int32Array(nx * nz + 1);
  const cand: Array<[number, number]> = [];
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      const c = cz * nx + cx;
      colStart[c] = X.length;
      const x = (ix0 + cx) * CELL, z = (iz0 + cz) * CELL;
      const tp = tiles[tileOf(cx, cz)];
      cand.length = 0;
      p.ramps.forEach((r, i) => { if (inRamp(r, x, z)) cand.push([rampY(r, x, z), i]); });
      if (inside(b1, x, z)) cand.push([0, FLOOR1]);
      if (inside(b2, x, z)) cand.push([p.floor2, FLOOR2]);
      for (const [y, s] of cand) {
        const h = heightAt(tp, x, z, y);
        if (h === null || Math.abs(h - y) > EPS) continue;
        let dup = false;
        for (let k = colStart[c]; k < Y.length; k++) if (Math.abs(Y[k] - y) <= EPS) dup = true;
        if (dup) continue;
        const lv = levelOf(p, y);
        if (blocked(tp, lv, x, z)) continue;
        X.push(x); Z.push(z); Y.push(y); L.push(lv); S.push(s); C.push(c);
        NW.push(blocked(tp, lv, x, z, NEAR_WALL) ? 1 : 0);
      }
    }
  }
  const n = X.length;
  colStart[nx * nz] = n;

  // 잇기: 이웃 칸 가운데로 실제 step()이 그대로 넘어가면 잇는다. 대각선은 양옆 두 칸이 모두 이어졌을 때만.
  const eStart = new Int32Array(n + 1);
  const eTo: number[] = [], eCost: number[] = [];
  const ok = [false, false, false, false];
  for (let a = 0; a < n; a++) {
    eStart[a] = eTo.length;
    const cx = C[a] % nx, cz = (C[a] - cx) / nx;
    const tp = tiles[tileOf(cx, cz)];
    const body: Body = { x: X[a], z: Z[a], y: Y[a], level: L[a] as Level };
    ok.fill(false);
    for (let d = 0; d < 8; d++) {
      const [dx, dz] = DIRS[d];
      if (d >= 4 && !(ok[dx > 0 ? 0 : 1] && ok[dz > 0 ? 2 : 3])) continue;
      const ncx = cx + dx, ncz = cz + dz;
      if (ncx < 0 || ncz < 0 || ncx >= nx || ncz >= nz) continue;
      const tx = (ix0 + ncx) * CELL, tz = (iz0 + ncz) * CELL;
      const nb = step(tp, body, tx - body.x, tz - body.z);
      if (Math.abs(nb.x - tx) > EPS || Math.abs(nb.z - tz) > EPS) continue;
      const nc = ncz * nx + ncx;
      let j = -1;
      for (let k = colStart[nc]; k < colStart[nc + 1]; k++) if (Math.abs(Y[k] - nb.y) <= EPS) { j = k; break; }
      if (j < 0) continue;
      if (d < 4) ok[d] = true;
      eTo.push(j);
      eCost.push((d < 4 ? CELL : CELL * SQRT2) + CLIMB_COST * Math.abs(Y[j] - Y[a]) + (NW[j] ? WALL_COST : 0));
    }
  }
  eStart[n] = eTo.length;

  // 이어진 덩어리(어느 쪽으로든 이어지면 한 덩어리). 다른 덩어리 사이에는 길이 없다.
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (let a = 0; a < n; a++) {
    for (let e = eStart[a]; e < eStart[a + 1]; e++) {
      const ra = find(a), rb = find(eTo[e]);
      if (ra !== rb) parent[rb] = ra;
    }
  }
  const comp = new Int32Array(n);
  for (let i = 0; i < n; i++) comp[i] = find(i);

  return {
    p, ix0, iz0, nx, nz, colStart, col: Int32Array.from(C),
    x: Float64Array.from(X), z: Float64Array.from(Z), y: Float64Array.from(Y),
    level: Uint8Array.from(L), surf: Int16Array.from(S),
    eStart, eTo: Int32Array.from(eTo), eCost: Float32Array.from(eCost), comp, tiles, tnx,
    g: new Float64Array(n), from: new Int32Array(n), seen: new Uint32Array(n), done: new Uint32Array(n), run: 0,
  };
}

// ───────── 출발·도착 맞추기

/** (x,z)에서 radius 안의 마디 가운데 score가 가장 낮은 것(null이면 후보 아님). 없으면 -1 */
function nearest(g: Grid, x: number, z: number, radius: number, score: (i: number, d: number) => number | null): number {
  const k = Math.ceil(radius / CELL);
  const cx0 = Math.round(x / CELL) - g.ix0, cz0 = Math.round(z / CELL) - g.iz0;
  let best = -1, bestS = Infinity;
  for (let cz = Math.max(0, cz0 - k); cz <= Math.min(g.nz - 1, cz0 + k); cz++) {
    for (let cx = Math.max(0, cx0 - k); cx <= Math.min(g.nx - 1, cx0 + k); cx++) {
      const c = cz * g.nx + cx;
      for (let i = g.colStart[c]; i < g.colStart[c + 1]; i++) {
        const d = Math.hypot(g.x[i] - x, g.z[i] - z);
        if (d > radius + EPS) continue;
        const s = score(i, d);
        if (s !== null && s < bestS) { bestS = s; best = i; }
      }
    }
  }
  return best;
}

/** 지금 몸이 선 마디: 같은 층에서 가깝고 높이가 맞는 것(계단 밑 바닥과 계단 위를 높이로 가른다) */
function snapStart(g: Grid, from: NavPoint): number {
  return nearest(g, from.x, from.z, SNAP_START, (i, d) => (g.level[i] === from.level ? d + 2 * Math.abs(g.y[i] - from.y) : null));
}

/**
 * 도착 마디. 그 자리가 열려 있으면 그 칸(출발과 다른 덩어리면 길 없음, 다만 0.5m 안의 이어진 칸은 받아 준다).
 * 막혀 있으면 1.5m 안에서 출발과 이어진 가장 가까운 열린 칸.
 */
function snapGoal(g: Grid, to: { x: number; z: number; level: Level }, comp: number): number {
  const base = to.level === 2 ? g.p.floor2 : 0;
  const score = (i: number, d: number) => (g.level[i] === to.level && g.comp[i] === comp ? d + 0.1 * Math.abs(g.y[i] - base) : null);
  const here = nearest(g, to.x, to.z, CELL * 0.75, (i, d) => (g.level[i] === to.level ? d + 0.1 * Math.abs(g.y[i] - base) : null));
  if (here >= 0 && g.comp[here] === comp) return here;
  return nearest(g, to.x, to.z, here >= 0 ? 0.5 : SNAP_GOAL, score);
}

// ───────── A*(8방향)

function astar(g: Grid, s: number, t: number): number[] | null {
  if (g.run >= 0xfffffff0) { g.seen.fill(0); g.done.fill(0); g.run = 0; }
  const run = ++g.run;
  const tx = g.x[t], tz = g.z[t], ty = g.y[t];
  const h = (i: number) => {
    const dx = Math.abs(g.x[i] - tx), dz = Math.abs(g.z[i] - tz);
    return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz) + CLIMB_COST * Math.abs(g.y[i] - ty);
  };
  const hn: number[] = [], hk: number[] = [];
  const push = (i: number, k: number) => {
    let c = hn.length;
    hn.push(i); hk.push(k);
    while (c > 0) {
      const up = (c - 1) >> 1;
      if (hk[up] <= k) break;
      hn[c] = hn[up]; hk[c] = hk[up]; c = up;
    }
    hn[c] = i; hk[c] = k;
  };
  const pop = () => {
    const top = hn[0];
    const li = hn.pop()!, lk = hk.pop()!;
    const n = hn.length;
    if (n) {
      let c = 0;
      for (;;) {
        let m = 2 * c + 1;
        if (m >= n) break;
        if (m + 1 < n && hk[m + 1] < hk[m]) m++;
        if (hk[m] >= lk) break;
        hn[c] = hn[m]; hk[c] = hk[m]; c = m;
      }
      hn[c] = li; hk[c] = lk;
    }
    return top;
  };
  g.g[s] = 0; g.from[s] = -1; g.seen[s] = run;
  push(s, h(s));
  while (hn.length) {
    const a = pop();
    if (g.done[a] === run) continue;
    g.done[a] = run;
    if (a === t) {
      const out: number[] = [];
      for (let i = t; i >= 0; i = g.from[i]) out.push(i);
      return out.reverse();
    }
    const ga = g.g[a];
    for (let e = g.eStart[a]; e < g.eStart[a + 1]; e++) {
      const b = g.eTo[e];
      if (g.done[b] === run) continue;
      const nb = ga + g.eCost[e];
      if (g.seen[b] !== run || nb < g.g[b]) {
        g.seen[b] = run; g.g[b] = nb; g.from[b] = a;
        push(b, nb + h(b));
      }
    }
  }
  return null;
}

// ───────── 경로 다듬기

function onSurf(g: Grid, b: Body, surf: number): boolean {
  if (surf === FLOOR1) return Math.abs(b.y) <= EPS;
  if (surf === FLOOR2) return Math.abs(b.y - g.p.floor2) <= EPS;
  const r = g.p.ramps[surf];
  return inRamp(r, b.x, b.z) && Math.abs(b.y - rampY(r, b.x, b.z)) <= EPS;
}

/** a에서 b까지 곧게 0.1m씩 step()으로 걸어 미끄러지지 않고 같은 바닥(같은 층·같은 경사) 위로 닿는지 */
function straightFrom(g: Grid, a: NavPoint, surf: number, b: NavPoint): boolean {
  const p = physicsNear(g.p, grow(dot(a.x, a.z), dot(b.x, b.z)), SMOOTH_R + SMOOTH_STEP);
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SMOOTH_STEP));
  let body: Body = { x: a.x, z: a.z, y: a.y, level: a.level };
  for (let k = 1; k <= n; k++) {
    const tx = a.x + ((b.x - a.x) * k) / n, tz = a.z + ((b.z - a.z) * k) / n;
    body = step(p, body, tx - body.x, tz - body.z, SMOOTH_R);
    if (Math.abs(body.x - tx) > EPS || Math.abs(body.z - tz) > EPS || !onSurf(g, body, surf)) return false;
  }
  return Math.abs(body.y - b.y) <= EPS && body.level === b.level;
}

/** 경로 점이 선 바닥 종류(점은 마디이거나 그 마디 바닥 위의 몸이다) */
function surfAt(g: Grid, q: NavPoint): number {
  const i = nearest(g, q.x, q.z, CELL, (k, d) => (g.level[k] === q.level ? d + 2 * Math.abs(g.y[k] - q.y) : null));
  return i >= 0 ? g.surf[i] : q.level === 2 ? FLOOR2 : FLOOR1;
}

const toPoint = (g: Grid, i: number): NavPoint => ({ x: g.x[i], z: g.z[i], y: g.y[i], level: g.level[i] as Level });
const straight = (g: Grid, a: number, b: number) => straightFrom(g, toPoint(g, a), g.surf[a], toPoint(g, b));

function smooth(g: Grid, path: number[]): number[] {
  if (path.length <= 2) return path;
  // 1) 같은 방향·같은 바닥으로 곧게 이어진 가운데 마디를 뺀다(물리 검사 없이도 이미 이어진 칸들이다)
  const pts: number[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1];
    const sameSurf = g.surf[a] === g.surf[b] && g.surf[b] === g.surf[c];
    const sameDir = g.col[b] - g.col[a] === g.col[c] - g.col[b];
    if (!(sameSurf && sameDir)) pts.push(b);
  }
  pts.push(path[path.length - 1]);
  // 2) 앞 점에서 곧게 막힘 없이 닿는 데까지 가운데 점을 뺀다(같은 바닥 안에서만)
  const out: number[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    const s = g.surf[pts[i]];
    while (j + 1 < pts.length && g.surf[pts[j]] === s && g.surf[pts[j + 1]] === s && straight(g, pts[i], pts[j + 1])) j++;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/**
 * from(지금 몸)에서 to까지 걸어갈 점들. 첫 점은 몸 자리(다음 점까지 곧게 못 가면 출발 칸),
 * 마지막 점은 목표 자리(막혔으면 맞춘 칸). 출발·도착이 막힌 칸이면 가장 가까운 열린 칸으로 맞추고,
 * 이어지지 않으면 null. 다른 층으로 가는 길은 계단(경사면)으로만 이어진다.
 */
export function findPath(world: HouseWorld, from: NavPoint, to: { x: number; z: number; level: Level }): NavPoint[] | null {
  const g = gridFor(world);
  const s = snapStart(g, from);
  if (s < 0) return null;
  const t = snapGoal(g, to, g.comp[s]);
  if (t < 0) return null;
  const nodes = s === t ? [s] : astar(g, s, t);
  if (!nodes) return null;
  const path = smooth(g, nodes).map((i) => toPoint(g, i));
  // 첫 점은 몸 자리 그대로(격자 칸으로 한 뼘 되돌아가지 않게). 몸에서 다음 점까지 곧게 닿을 때만.
  const body: NavPoint = { x: from.x, z: from.z, y: from.y, level: from.level };
  if (path.length >= 2 && onSurf(g, body, g.surf[s]) && straightFrom(g, body, g.surf[s], path[1])) path[0] = body;
  // 끝점은 목표 자리 그대로(열려 있고 곧게 닿을 때만). 포털처럼 칸 사이에 적힌 자리도 정확히 닿게.
  const last = path[path.length - 1];
  const y = heightAt(g.p, to.x, to.z, last.y);
  if (y !== null && levelOf(g.p, y) === to.level && !blocked(g.p, to.level, to.x, to.z) && (to.x !== last.x || to.z !== last.z)) {
    const end: NavPoint = { x: to.x, z: to.z, y, level: to.level };
    const n = path.length;
    // 칸 좌표의 부동소수 찌꺼기(1mm 안)는 그냥 목표 자리로 바꾼다
    if (Math.hypot(to.x - last.x, to.z - last.z) <= 1e-3 && Math.abs(y - last.y) <= EPS) { path[n - 1] = end; return path; }
    const ps = n >= 2 ? surfAt(g, path[n - 2]) : NaN;
    if (ps === g.surf[t] && onSurf(g, end, ps) && straightFrom(g, path[n - 2], ps, end)) path[n - 1] = end;
    else if (straightFrom(g, last, g.surf[t], end)) path.push(end);
  }
  return path;
}

// ───────── 갈 곳 목록

/** 앞을 (dx, dz) 쪽으로 보게 하는 yaw(엔진: 앞 = (-sin yaw, -cos yaw)) */
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** 접근 자리에서 볼 방향: 살피기 자리가 떨어져 있으면 그쪽, 문 앞이면 문, 아니면 마당에서 걸어온 방향 */
function faceFor(w: HouseWorld, h: Hotspot, x: number, z: number): number {
  const dx = h.x - x, dz = h.z - z, d = Math.hypot(dx, dz);
  if (d > 0.3) return yawTo(dx, dz);
  let door: [number, number] | null = null;
  let best = 1.5;
  for (const dr of w.doors) {
    if (dr.box.level !== h.level) continue;
    const cx = (dr.box.x1 + dr.box.x2) / 2, cz = (dr.box.z1 + dr.box.z2) / 2;
    const dd = Math.hypot(cx - x, cz - z);
    if (dd < best) { best = dd; door = [cx, cz]; }
  }
  if (door) return yawTo(door[0] - x, door[1] - z);
  if (d > 0.05) return yawTo(dx, dz);
  const sx = h.x - w.spawn.x, sz = h.z - w.spawn.z;
  return Math.hypot(sx, sz) > EPS ? yawTo(sx, sz) : w.spawn.yaw;
}

/** 살피기 자리마다 걸어서 설 칸: 반지름 안 걸을 수 있는 칸 가운데 그 자리에 가장 가까운 칸(마당과 이어진 칸 먼저) */
function approach(w: HouseWorld, g: Grid, h: Hotspot, home: number): number {
  const r = Math.max(h.r, CELL);
  const lv = (i: number) => g.level[i] === h.level;
  const linked = (i: number) => home < 0 || g.comp[i] === home;
  const picks: Array<() => number> = [
    () => nearest(g, h.x, h.z, r, (i, d) => (lv(i) && linked(i) && nearestHotspot(g.level[i] as Level, g.x[i], g.z[i], w)?.id === h.id ? d : null)),
    () => nearest(g, h.x, h.z, r, (i, d) => (lv(i) && linked(i) ? d : null)),
    () => nearest(g, h.x, h.z, r + 1, (i, d) => (lv(i) && linked(i) ? d : null)),
    () => nearest(g, h.x, h.z, r, (i, d) => (lv(i) ? d : null)),
  ];
  for (const pick of picks) {
    const i = pick();
    if (i >= 0) return i;
  }
  return -1;
}

/** 포털은 적힌 (x, z) 그대로. 걸을 수 없는 자리면 1.5m 안 가장 가까운 열린 칸(마당과 이어진 칸 먼저) */
function portalSpot(g: Grid, pt: Portal, home: number): { x: number; z: number } | null {
  const y = heightAt(g.p, pt.x, pt.z, pt.level === 2 ? g.p.floor2 : 0);
  if (y !== null && levelOf(g.p, y) === pt.level && !blocked(g.p, pt.level, pt.x, pt.z)) return { x: pt.x, z: pt.z };
  const i = nearest(g, pt.x, pt.z, SNAP_GOAL, (k, d) => (g.level[k] === pt.level ? d + (home >= 0 && g.comp[k] !== home ? 100 : 0) : null));
  return i < 0 ? null : { x: g.x[i], z: g.z[i] };
}

function buildDestinations(world: HouseWorld): Destination[] {
  const g = gridFor(world);
  const w = tuneWorld(world);
  const s = snapStart(g, { x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 });
  const home = s >= 0 ? g.comp[s] : -1;
  // 같은 방(slug)·같은 층의 문 살피기(portal·door)는 포털과 한 곳으로 친다(목록에 같은 문이 두 번 나오지 않게)
  const portals = w.portals ?? [];
  const rep = new Map<string, Portal>();
  const skip = new Set<string>();
  for (const pt of portals) {
    const hs = w.hotspots.filter((h) => h.slug === pt.slug && h.level === pt.level && (h.kind === 'portal' || h.kind === 'door'));
    const main = hs.find((h) => h.kind === 'portal') ?? hs[0];
    if (main && !rep.has(main.id)) rep.set(main.id, pt);
    for (const h of hs) skip.add(h.id);
  }
  const out: Destination[] = [];
  const used = new Set<Portal>();
  const addPortal = (pt: Portal, h?: Hotspot) => {
    used.add(pt);
    const at = portalSpot(g, pt, home);
    if (!at) return;
    out.push({ id: h?.id ?? `portal:${pt.slug}`, title: pt.label || h?.title || pt.slug, kind: 'portal', level: pt.level, x: at.x, z: at.z, yaw: pt.yaw, slug: pt.slug });
  };
  for (const h of w.hotspots) {
    const pt = rep.get(h.id);
    if (pt) { addPortal(pt, h); continue; }
    if (skip.has(h.id)) continue;
    const i = approach(w, g, h, home);
    if (i < 0) continue;
    const d: Destination = { id: h.id, title: h.title, kind: h.kind, level: h.level, x: g.x[i], z: g.z[i], yaw: faceFor(w, h, g.x[i], g.z[i]) };
    if (h.slug) d.slug = h.slug;
    out.push(d);
  }
  for (const pt of portals) if (!used.has(pt)) addPortal(pt);
  return out;
}

const dests = new WeakMap<HouseWorld, Destination[]>();

/** 길 찾기 목록: 살피기 자리(실제로 걸어서 설 접근 칸)와 방 포털(포털 자리 그대로). 세계마다 한 번 계산해 둔다. */
export function destinations(world: HouseWorld): Destination[] {
  let list = dests.get(world);
  if (!list) {
    list = buildDestinations(world);
    dests.set(world, list);
  }
  return list.map((d) => ({ ...d }));
}
