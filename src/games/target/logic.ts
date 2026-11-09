// 종이공 과녁의 순수 계산: 판 차리기, 과녁 움직이기, 종이공 포물선, 명중 판정, 점수와 연속 보너스.
// three·DOM을 모른다. 같은 씨앗과 같은 던지기면 늘 같은 판이 나온다(tests/unit/games-target.test.ts).
// 좌표: 미터, y 위, 놀이하는 사람은 +z 쪽에 서서 -z 벽을 본다.

export type Vec3 = { x: number; y: number; z: number };
export type Ray = { o: Vec3; d: Vec3 };
export type Level = 'easy' | 'normal';
export type TargetKind = 'board' | 'balloon' | 'duck' | 'can';

export const ROUND_MS = 60_000;
export const CLEAR_SCORE = 100;
/** 실제 중력보다 조금 약하게: 종이공이 둥실 날아 눈으로 따라가기 쉽다 */
export const GRAVITY = 6.5;
export const BALL_R = 0.07;
/** 눈(카메라)과 던지는 손 */
export const EYE: Vec3 = { x: 0, y: 1.2, z: 0.8 };
export const HAND: Vec3 = { x: 0.2, y: 0.92, z: 0.25 };
export const ROOM = { wallZ: -4.2, halfW: 2.9, ceil: 2.6 } as const;
export const BOARD_Z = ROOM.wallZ + 0.04;
export const SHELF = { y: 0.95, z: ROOM.wallZ + 0.3 } as const;
export const TABLE = { x: 1.2, y: 0.55, z: -3.35 } as const;
export const COOLDOWN_MS = 200;
export const MAX_FLYING = 4;
/** 깡통 크기(그림과 판정이 같이 쓴다) */
export const CAN = { r: 0.065, h: 0.15 } as const;

type Tune = {
  /** 과녁 크기 배수 */
  size: number;
  balloonSpeed: [number, number];
  spawnMs: [number, number];
  maxBalloons: number;
  /** 가운데 과녁판이 좌우로 미끄러지는 폭(0이면 가만히) */
  slide: number;
  /** 겨눈 곳에서 이만큼(m) 안의 과녁으로 끌어당긴다(0이면 끔) */
  assist: number;
  /** 날아가는 시간 배수(작을수록 빠르게 닿는다) */
  flight: number;
};

export const TUNE: Record<Level, Tune> = {
  easy: { size: 1.35, balloonSpeed: [0.15, 0.24], spawnMs: [1500, 2300], maxBalloons: 4, slide: 0, assist: 0.45, flight: 0.85 },
  normal: { size: 1, balloonSpeed: [0.24, 0.4], spawnMs: [1000, 1700], maxBalloons: 6, slide: 0.5, assist: 0, flight: 1 },
};

export const POINTS = { board: [20, 15, 10], slide: 5, balloon: 15, gold: 25, duck: 15, can: 10, allCans: 20 } as const;
export const DUCK_UP_MS = 2500;
const SLIDE_MS = 6000;

export type Target = {
  id: number;
  kind: TargetKind;
  x: number;
  y: number;
  z: number;
  /** 판정 반지름(과녁판은 판의 반지름) */
  r: number;
  /** 넘어졌는지(오리·깡통) */
  down: boolean;
  /** 마지막으로 넘어지거나 일어선 시각(ms) */
  changedAt: number;
  baseX: number;
  /** 풍선이 떠오르는 빠르기(m/s), 좌우 흔들림 폭과 위상 */
  vy: number;
  sway: number;
  phase: number;
  /** 가운데 과녁판이 미끄러지는 폭 */
  slide: number;
  gold: boolean;
  /** 깡통: 받치는 깡통 id */
  under: number[];
};

export type BallState = 'fly' | 'spent' | 'rest';
export type Ball = {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  bornAt: number;
  state: BallState;
  /** 처음 닿은 시각(ms), 굴러 멈춘 시각 */
  touchedAt: number;
  restAt: number;
  bumped: boolean;
};

export type Phase = 'play' | 'closing' | 'over';
export type Round = {
  seed: number;
  level: Level;
  rand: () => number;
  /** 판이 시작된 뒤 흐른 시간(ms) */
  now: number;
  phase: Phase;
  score: number;
  throws: number;
  hits: number;
  streak: number;
  bestStreak: number;
  cleared: boolean;
  targets: Target[];
  balls: Ball[];
  nextId: number;
  nextBalloonAt: number;
  lastThrowAt: number;
  canResetAt: number;
  lastTick: number;
};

export type GameEvent =
  | { t: 'throw'; ball: number }
  | { t: 'hit'; ball: number; target: number; kind: TargetKind; gold: boolean; allDown: boolean; ring: number; base: number; extra: number; bonus: number; points: number; streak: number; at: Vec3 }
  | { t: 'fall'; target: number }
  | { t: 'miss'; ball: number; at: Vec3; surface: 'wall' | 'floor' | 'air' }
  | { t: 'bump'; ball: number; at: Vec3 }
  | { t: 'spawn'; target: number }
  | { t: 'gone'; target: number }
  | { t: 'reset'; target: number }
  | { t: 'clear' }
  | { t: 'tick'; left: number }
  | { t: 'end' };

/** 씨앗 하나로 늘 같은 수열(mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 다음 판 씨앗(한 번 더 할 때) */
export function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1103515245) + 12345) >>> 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- 점수 ----------

/** 연속 맞힘 보너스: 두 번째부터 5점씩 늘고 여섯 번째부터 25점 */
export function streakBonus(streak: number): number {
  return streak < 2 ? 0 : Math.min(streak - 1, 5) * 5;
}

/** 과녁판 고리: 0 가운데, 1 둘째, 2 바깥, 판 밖이면 null */
export function ringOf(dist: number, r: number): number | null {
  const f = dist / r;
  if (f > 1) return null;
  return f < 0.34 ? 0 : f < 0.67 ? 1 : 2;
}

export function accuracy(hits: number, throws: number): number {
  return throws > 0 ? Math.round((hits / throws) * 100) : 0;
}

export function isCleared(score: number): boolean {
  return score >= CLEAR_SCORE;
}

/** 글을 못 읽어도 알아보게 별 0~3개 */
export function starsFor(score: number): number {
  return score >= 1000 ? 3 : score >= 500 ? 2 : score >= CLEAR_SCORE ? 1 : 0;
}

// ---------- 포물선과 판정 ----------

/** 닿기까지 걸리는 시간(초): 멀수록 조금 더 걸린다 */
export function flightTime(from: Vec3, to: Vec3, level: Level = 'normal'): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  return clamp(0.3 + d * 0.07, 0.35, 0.72) * TUNE[level].flight;
}

/** from에서 던져 T초 뒤 정확히 to에 닿는 처음 속도 */
export function launchVelocity(from: Vec3, to: Vec3, T: number, g = GRAVITY): Vec3 {
  return { x: (to.x - from.x) / T, y: (to.y - from.y) / T + 0.5 * g * T, z: (to.z - from.z) / T };
}

/** 던진 뒤 t초의 자리 */
export function ballAt(from: Vec3, v: Vec3, t: number, g = GRAVITY): Vec3 {
  return { x: from.x + v.x * t, y: from.y + v.y * t - 0.5 * g * t * t, z: from.z + v.z * t };
}

/** 선분 a→b가 공(중심 c, 반지름 r)에 처음 닿는 비율 0..1. 빠른 공도 건너뛰지 않는다 */
export function segmentSphere(a: Vec3, b: Vec3, c: Vec3, r: number): number | null {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const C = fx * fx + fy * fy + fz * fz - r * r;
  if (C <= 0) return 0;
  const A = dx * dx + dy * dy + dz * dz;
  if (A < 1e-12) return null;
  const B = 2 * (fx * dx + fy * dy + fz * dz);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}

/** 선분 a→b가 평면 z=zp를 앞에서 뒤로(+z → -z) 지나는 비율 */
export function segmentPlaneZ(a: Vec3, b: Vec3, zp: number): number | null {
  if (a.z < zp || b.z > zp) return null;
  if (a.z === b.z) return 0;
  return (a.z - zp) / (a.z - b.z);
}

const at = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
const along = (r: Ray, t: number): Vec3 => ({ x: r.o.x + r.d.x * t, y: r.o.y + r.d.y * t, z: r.o.z + r.d.z * t });

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** 광선이 공에 닿는 거리(d는 단위 벡터) */
export function raySphere(ray: Ray, c: Vec3, r: number): number | null {
  const fx = ray.o.x - c.x, fy = ray.o.y - c.y, fz = ray.o.z - c.z;
  const b = fx * ray.d.x + fy * ray.d.y + fz * ray.d.z;
  const cc = fx * fx + fy * fy + fz * fz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

/** 광선에서 점까지 가장 가까운 거리와 그 자리의 광선 거리 */
function rayGap(ray: Ray, p: Vec3): { gap: number; t: number } {
  const t = (p.x - ray.o.x) * ray.d.x + (p.y - ray.o.y) * ray.d.y + (p.z - ray.o.z) * ray.d.z;
  const q = along(ray, t);
  return { gap: Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z), t };
}

// ---------- 판 차리기 ----------

function add(s: Round, kind: TargetKind, x: number, y: number, z: number, r: number, more: Partial<Target> = {}): Target {
  const t: Target = {
    id: s.nextId++, kind, x, y, z, r, down: false, changedAt: s.now, baseX: x,
    vy: 0, sway: 0, phase: 0, slide: 0, gold: false, under: [], ...more,
  };
  s.targets.push(t);
  return t;
}

/** 새 판. 과녁판 셋(벽), 오리 셋(왼쪽 선반), 깡통 여섯(오른쪽 낮은 책상, 3-2-1 쌓기). 풍선은 판 중에 떠오른다 */
export function createRound(seed: number, level: Level = 'normal'): Round {
  const s: Round = {
    seed, level, rand: rng(seed), now: 0, phase: 'play', score: 0, throws: 0, hits: 0, streak: 0, bestStreak: 0,
    cleared: false, targets: [], balls: [], nextId: 1, nextBalloonAt: 0, lastThrowAt: -1e9, canResetAt: -1, lastTick: 6,
  };
  const k = TUNE[level].size;
  for (const x of [-1.35, 0, 1.35]) add(s, 'board', x, 1.75, BOARD_Z, 0.32 * k, { slide: x === 0 ? TUNE[level].slide : 0 });
  for (const x of [-1.55, -1.18, -0.81]) add(s, 'duck', x, SHELF.y + 0.14, SHELF.z, 0.15 * k);
  const cr = 0.085 * k;
  const b = [-0.14, 0, 0.14].map((dx) => add(s, 'can', TABLE.x + dx, TABLE.y + CAN.h / 2, TABLE.z, cr));
  const m = [-0.07, 0.07].map((dx, i) => add(s, 'can', TABLE.x + dx, TABLE.y + CAN.h * 1.5, TABLE.z, cr, { under: [b[i].id, b[i + 1].id] }));
  add(s, 'can', TABLE.x, TABLE.y + CAN.h * 2.5, TABLE.z, cr, { under: [m[0].id, m[1].id] });
  s.nextBalloonAt = 500 + s.rand() * 700;
  return s;
}

function spawnBalloon(s: Round): Target {
  const tune = TUNE[s.level];
  const r = s.rand;
  const gold = r() < 0.12;
  const z = -2.0 - r() * 1.2;
  // 휴대폰 세로 화면에서도 보이게 거리만큼만 좌우로 벌린다
  const half = 0.34 * (EYE.z - z);
  const x = (r() * 2 - 1) * half;
  const [lo, hi] = tune.balloonSpeed;
  return add(s, 'balloon', x, 0.2, z, (gold ? 0.13 : 0.15) * Math.sqrt(tune.size), {
    vy: lerp(lo, hi, r()) * (gold ? 1.3 : 1),
    sway: 0.06 + r() * 0.1,
    phase: r() * Math.PI * 2,
    gold,
  });
}

/** dt초 뒤 과녁 자리(움직이는 과녁을 미리 겨눌 때) */
export function predict(s: Round, tg: Target, dt: number): Vec3 {
  const t = s.now / 1000 + dt;
  if (tg.kind === 'balloon') return { x: tg.baseX + tg.sway * Math.sin(tg.phase + t * 1.3), y: tg.y + tg.vy * dt, z: tg.z };
  if (tg.slide > 0) return { x: tg.baseX + tg.slide * Math.sin((t * 1000 * 2 * Math.PI) / SLIDE_MS), y: tg.y, z: tg.z };
  return { x: tg.x, y: tg.y, z: tg.z };
}

function clampAim(p: Vec3): Vec3 {
  return { x: clamp(p.x, -ROOM.halfW, ROOM.halfW), y: clamp(p.y, BALL_R, ROOM.ceil - 0.15), z: clamp(p.z, ROOM.wallZ + BALL_R, EYE.z - 0.5) };
}

/**
 * 화면에서 쏜 광선으로 겨눈 자리. 광선이 처음 닿는 과녁(판·풍선·오리·깡통)의 그 점,
 * 쉬운 판이면 광선 가까이 있는 과녁의 (날아가는 동안 움직일) 가운데로 끌어당긴다. 과녁이 없으면 벽이나 바닥.
 */
export function aimAt(s: Round, ray: Ray, from: Vec3 = HAND): { point: Vec3; target: number | null } {
  const r: Ray = { o: ray.o, d: unit(ray.d) };
  const tune = TUNE[s.level];
  const live = s.targets.filter((t) => !t.down);
  if (tune.assist > 0) {
    let best: { tg: Target; score: number } | null = null;
    for (const tg of live) {
      const { gap, t } = rayGap(r, tg);
      if (t <= 0 || gap > tg.r + tune.assist) continue;
      const score = gap / (tg.r + tune.assist);
      if (!best || score < best.score) best = { tg, score };
    }
    if (best) {
      let p = predict(s, best.tg, flightTime(from, best.tg, s.level));
      p = predict(s, best.tg, flightTime(from, p, s.level));
      return { point: clampAim(p), target: best.tg.id };
    }
  }
  let hit: { t: number; id: number } | null = null;
  for (const tg of live) {
    let t: number | null;
    if (tg.kind === 'board') {
      t = r.d.z < 0 ? (tg.z - r.o.z) / r.d.z : null;
      if (t !== null) {
        const q = along(r, t);
        if (Math.hypot(q.x - tg.x, q.y - tg.y) > tg.r) t = null;
      }
    } else t = raySphere(r, tg, tg.r);
    if (t !== null && t > 0 && (!hit || t < hit.t)) hit = { t, id: tg.id };
  }
  if (hit) return { point: clampAim(along(r, hit.t)), target: hit.id };
  const ts: number[] = [];
  if (r.d.z < 0) ts.push((ROOM.wallZ + 0.02 - r.o.z) / r.d.z);
  if (r.d.y < 0) ts.push((0.02 - r.o.y) / r.d.y);
  const t = ts.length ? Math.min(...ts) : 5;
  return { point: clampAim(along(r, t)), target: null };
}

// ---------- 던지기와 진행 ----------

export function flying(s: Round): number {
  return s.balls.filter((b) => b.state === 'fly').length;
}

export function canThrow(s: Round): boolean {
  return s.phase === 'play' && s.now - s.lastThrowAt >= COOLDOWN_MS && flying(s) < MAX_FLYING;
}

/** 겨눈 자리로 종이공 하나를 던진다(쉬는 틈·날아가는 공 수가 차면 아무 일 없음) */
export function throwBall(s: Round, aim: Vec3, from: Vec3 = HAND): GameEvent[] {
  if (!canThrow(s)) return [];
  const to = clampAim(aim);
  const v = launchVelocity(from, to, flightTime(from, to, s.level));
  const id = s.nextId++;
  s.balls.push({ id, x: from.x, y: from.y, z: from.z, vx: v.x, vy: v.y, vz: v.z, bornAt: s.now, state: 'fly', touchedAt: -1, restAt: -1, bumped: false });
  s.throws++;
  s.lastThrowAt = s.now;
  return [{ t: 'throw', ball: id }];
}

function knockCans(s: Round, first: Target): Target[] {
  const cans = s.targets.filter((t) => t.kind === 'can');
  const fallen = [first];
  first.down = true;
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of cans) {
      if (c.down || !c.under.some((id) => cans.find((o) => o.id === id)?.down)) continue;
      c.down = true;
      fallen.push(c);
      changed = true;
    }
  }
  for (const c of fallen) c.changedAt = s.now;
  return fallen;
}

function award(s: Round, ball: Ball, tg: Target, p: Vec3, ev: GameEvent[]) {
  s.hits++;
  s.streak++;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  let base = 0;
  let extra = 0;
  let ring = -1;
  let allDown = false;
  if (tg.kind === 'board') {
    ring = ringOf(Math.hypot(p.x - tg.x, p.y - tg.y), tg.r + BALL_R * 0.5) ?? 2;
    base = POINTS.board[ring] + (tg.slide > 0 ? POINTS.slide : 0);
  } else if (tg.kind === 'balloon') {
    base = tg.gold ? POINTS.gold : POINTS.balloon;
    s.targets = s.targets.filter((t) => t !== tg);
  } else if (tg.kind === 'duck') {
    base = POINTS.duck;
    tg.down = true;
    tg.changedAt = s.now;
    ev.push({ t: 'fall', target: tg.id });
  } else {
    base = POINTS.can;
    const fallen = knockCans(s, tg);
    extra = (fallen.length - 1) * POINTS.can;
    const all = s.targets.every((t) => t.kind !== 'can' || t.down);
    if (all) extra += POINTS.allCans;
    allDown = all;
    s.canResetAt = s.now + (all ? 1200 : 6000);
    for (const c of fallen) ev.push({ t: 'fall', target: c.id });
  }
  const bonus = streakBonus(s.streak);
  const points = base + extra + bonus;
  s.score += points;
  ev.push({ t: 'hit', ball: ball.id, target: tg.id, kind: tg.kind, gold: tg.gold, allDown, ring, base, extra, bonus, points, streak: s.streak, at: p });
  if (!s.cleared && isCleared(s.score)) {
    s.cleared = true;
    ev.push({ t: 'clear' });
  }
}

function miss(s: Round, ball: Ball, p: Vec3, surface: 'wall' | 'floor' | 'air', ev: GameEvent[]) {
  s.streak = 0;
  ev.push({ t: 'miss', ball: ball.id, at: p, surface });
}

/** 날아가는 공 하나를 dt초 움직이고, 처음 닿는 것(과녁·벽·바닥)을 찾는다 */
function fly(s: Round, b: Ball, dt: number, ev: GameEvent[]) {
  const a: Vec3 = { x: b.x, y: b.y, z: b.z };
  const n: Vec3 = { x: b.x + b.vx * dt, y: b.y + b.vy * dt - 0.5 * GRAVITY * dt * dt, z: b.z + b.vz * dt };
  b.vy -= GRAVITY * dt;
  let first: { t: number; tg: Target | null; surface: 'wall' | 'floor' } | null = null;
  const take = (t: number | null, tg: Target | null, surface: 'wall' | 'floor') => {
    if (t !== null && (!first || t < first.t)) first = { t, tg, surface };
  };
  for (const tg of s.targets) {
    if (tg.down) continue;
    if (tg.kind === 'board') {
      const t = segmentPlaneZ(a, n, tg.z + BALL_R);
      if (t !== null) {
        const q = at(a, n, t);
        if (Math.hypot(q.x - tg.x, q.y - tg.y) <= tg.r + BALL_R * 0.5) take(t, tg, 'wall');
      }
    } else take(segmentSphere(a, n, tg, tg.r + BALL_R), tg, 'wall');
  }
  take(segmentPlaneZ(a, n, ROOM.wallZ + BALL_R), null, 'wall');
  if (a.y >= BALL_R && n.y < BALL_R) take((a.y - BALL_R) / (a.y - n.y), null, 'floor');
  const hit = first as { t: number; tg: Target | null; surface: 'wall' | 'floor' } | null;
  if (!hit) {
    Object.assign(b, n);
    if (s.now - b.bornAt > 3000) {
      b.state = 'spent';
      miss(s, b, n, 'air', ev);
    }
    return;
  }
  const p = at(a, n, hit.t);
  Object.assign(b, p);
  b.state = 'spent';
  b.touchedAt = s.now;
  if (hit.tg) award(s, b, hit.tg, p, ev);
  else miss(s, b, p, hit.surface, ev);
  // 맞고 나면 힘이 빠져 앞으로 살짝 튀어 떨어진다
  if (hit.surface === 'floor' && !hit.tg) b.vy = Math.abs(b.vy) * 0.25;
  else {
    b.vz = Math.abs(b.vz) * 0.22;
    b.vy = Math.max(b.vy, 0) * 0.3 + 0.4;
  }
  b.vx *= 0.35;
}

/** 맞고 떨어지는 공: 바닥에 몇 번 통통 튀고 멈춘다 */
function fall(s: Round, b: Ball, dt: number, ev: GameEvent[]) {
  b.x += b.vx * dt;
  b.y += b.vy * dt - 0.5 * GRAVITY * dt * dt;
  b.z += b.vz * dt;
  b.vy -= GRAVITY * dt;
  if (b.z < ROOM.wallZ + BALL_R) {
    b.z = ROOM.wallZ + BALL_R;
    b.vz = Math.abs(b.vz) * 0.3;
  }
  if (b.y > BALL_R) return;
  b.y = BALL_R;
  if (!b.bumped) {
    b.bumped = true;
    ev.push({ t: 'bump', ball: b.id, at: { x: b.x, y: b.y, z: b.z } });
  }
  b.vy = Math.abs(b.vy) * 0.3;
  b.vx *= 0.6;
  b.vz *= 0.6;
  if (b.vy < 0.35) {
    b.vy = 0;
    b.state = 'rest';
    b.restAt = s.now;
  }
}

function moveTargets(s: Round, ev: GameEvent[]) {
  for (const tg of s.targets) {
    if (tg.kind === 'balloon' || tg.slide > 0) {
      const p = predict(s, tg, 0);
      tg.x = p.x;
    }
    if (tg.kind === 'duck' && tg.down && s.now - tg.changedAt >= DUCK_UP_MS) {
      tg.down = false;
      tg.changedAt = s.now;
      ev.push({ t: 'reset', target: tg.id });
    }
  }
  if (s.canResetAt >= 0 && s.now >= s.canResetAt) {
    s.canResetAt = -1;
    for (const c of s.targets) {
      if (c.kind !== 'can' || !c.down) continue;
      c.down = false;
      c.changedAt = s.now;
      ev.push({ t: 'reset', target: c.id });
    }
  }
}

/**
 * 판을 dtMs만큼 진행한다(한 번에 최대 50ms: 탭이 숨었다 돌아와도 시간이 건너뛰지 않는다).
 * 60초가 지나면 새로 던질 수 없고, 날아가던 공이 다 닿으면 끝난다.
 */
export function step(s: Round, dtMs: number): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.phase === 'over') return ev;
  const ms = Math.max(0, Math.min(dtMs, 50));
  const dt = ms / 1000;
  s.now += ms;
  for (const tg of s.targets) if (tg.kind === 'balloon') tg.y += tg.vy * dt;
  moveTargets(s, ev);
  const up = ROOM.ceil - 0.2;
  for (const tg of s.targets.filter((t) => t.kind === 'balloon' && t.y > up)) ev.push({ t: 'gone', target: tg.id });
  s.targets = s.targets.filter((t) => t.kind !== 'balloon' || t.y <= up);
  if (s.phase === 'play') {
    const tune = TUNE[s.level];
    const balloons = s.targets.filter((t) => t.kind === 'balloon').length;
    if (s.now >= s.nextBalloonAt && balloons < tune.maxBalloons) {
      ev.push({ t: 'spawn', target: spawnBalloon(s).id });
      s.nextBalloonAt = s.now + lerp(tune.spawnMs[0], tune.spawnMs[1], s.rand());
    }
    const left = Math.ceil((ROUND_MS - s.now) / 1000);
    if (left < s.lastTick && left >= 1) {
      s.lastTick = left;
      ev.push({ t: 'tick', left });
    }
    if (s.now >= ROUND_MS) s.phase = 'closing';
  }
  for (const b of s.balls) {
    if (b.state === 'fly') fly(s, b, dt, ev);
    else if (b.state === 'spent') fall(s, b, dt, ev);
  }
  s.balls = s.balls.filter((b) => b.state !== 'rest' || s.now - b.restAt < 700);
  if (s.phase === 'closing' && flying(s) === 0) {
    s.phase = 'over';
    ev.push({ t: 'end' });
  }
  return ev;
}

/** 판 하나의 요약(끝 화면·결과) */
export function summary(s: Round) {
  return {
    score: s.score,
    hits: s.hits,
    throws: s.throws,
    accuracy: accuracy(s.hits, s.throws),
    bestStreak: s.bestStreak,
    cleared: isCleared(s.score),
    ms: Math.round(Math.min(s.now, ROUND_MS)),
    stars: starsFor(s.score),
  };
}
export type Summary = ReturnType<typeof summary>;

// ---------- 이 기기의 최고 점수 ----------

export const BEST_KEY = 'jy.game.target.best.v1';
type StoreLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function readBest(store: StoreLike | null, level: Level): number {
  try {
    const v = JSON.parse(store?.getItem(BEST_KEY) ?? '{}') as Partial<Record<Level, unknown>>;
    const n = v[level];
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** 최고 점수를 넘었으면 적고 true */
export function saveBest(store: StoreLike | null, level: Level, score: number): boolean {
  const prev = readBest(store, level);
  if (score <= prev) return false;
  try {
    const v = JSON.parse(store?.getItem(BEST_KEY) ?? '{}') as Record<string, unknown>;
    store?.setItem(BEST_KEY, JSON.stringify({ ...(v && typeof v === 'object' ? v : {}), [level]: score }));
  } catch {
    try { store?.setItem(BEST_KEY, JSON.stringify({ [level]: score })); } catch { /* 기억 못 해도 놀이는 된다 */ }
  }
  return true;
}

/** 세로로 긴 휴대폰에서도 벽 좌우가 보이게 세로 시야각(도)을 넓힌다 */
export function fitFov(aspect: number): number {
  const need = (2 * Math.atan(0.37 / Math.max(aspect, 0.3)) * 180) / Math.PI;
  return clamp(need, 50, 82);
}
