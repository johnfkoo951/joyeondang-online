// 걷기 지도: 오른쪽 아래 미니맵과 M 키로 여는 전체 지도(1층·2층 나란히, 같은 축척).
// DOM·three 없이 2D 캔버스 그리기만 한다. 범위·축척·배치 같은 순수 계산은 내보내서 시험한다.
// 방향: 북쪽(z가 작은 쪽)이 위, x가 오른쪽. 앞쪽 방향 = (-sin yaw, -cos yaw)라 yaw=0이면 위를 본다.
import type { FloorMat, HouseWorld, Level, Ramp, Zone } from './types';

export type MapMode = 'mini' | 'full';
export type MapTheme = 'light' | 'dark';
/** scene.ts WalkState에서 지도가 읽는 부분. Pick<WalkState, 'x' | 'z' | 'level' | 'yaw'>와 같은 모양이다. */
export type MapState = { x: number; z: number; level: Level; yaw: number };
export type Bounds = { x1: number; x2: number; z1: number; z2: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** 세계 좌표 → 캔버스(CSS 픽셀): px = ox + x·s, py = oy + z·s */
export type Transform = { s: number; ox: number; oy: number };

/** 미니맵 여백(px) */
export const MINI_PAD = 6;
/** 전체 지도에서 지금 층이 아닌 판의 투명도 */
export const INACTIVE_ALPHA = 0.45;
/** 전체 지도 배치 상수(px): 바깥 여백, 판 사이, 판 제목 띠, 판 안 여백, 범례 줄 */
export const FULL = { outer: 16, gap: 24, title: 30, pad: 10, legend: 34 } as const;
/** 낮은 캔버스(휴대폰 가로 등)에서 쓰는 촘촘한 배치. 판에 자리를 더 준다. */
export const FULL_COMPACT = { outer: 8, gap: 16, title: 24, pad: 6, legend: 28 } as const;
export const COMPACT_BELOW = 340;
/** 캔버스 높이에 맞는 배치 상수 */
export const fullSpacing = (height: number): { outer: number; gap: number; title: number; pad: number; legend: number } =>
  (height < COMPACT_BELOW ? FULL_COMPACT : FULL);

const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, sans-serif';

type PlanColors = {
  floor: Record<FloorMat, string>;
  wall: string;
  stonewall: string;
  door: string;
  stairs: string;
  tread: string;
};
export type MapPalette = {
  active: PlanColors;
  muted: PlanColors;
  /** 판 바탕(지금 층 / 다른 층)과 테두리 */
  panel: string;
  panelMuted: string;
  edge: string;
  /** 글자(판 위 4.5:1 이상)와 글자 둘레 */
  text: string;
  textMuted: string;
  halo: string;
  /**
   * 층마다 정해진 색(화면 위 층 배지와 같다: 1층 소나무, 2층 지붕). 전체 지도에서 지금 층 판의 테두리·제목·「지금 여기」 알약에 쓴다.
   * on은 그 색 위 글자색.
   */
  level: Record<Level, { accent: string; on: string }>;
  player: string;
  playerEdge: string;
  /** 바라보는 방향 부채꼴(마당 위에서도 보이게 진하게)과 그 테두리 */
  wedge: string;
  wedgeEdge: string;
};

// 조연당 색감: 따뜻한 종이, 소나무 초록, 지붕 주홍. 다른 층은 같은 구조의 회색조.
export const PALETTES: Record<MapTheme, MapPalette> = {
  light: {
    active: {
      floor: { oak: '#ead8b6', redstone: '#e2c3a8', blackwood: '#e3cfae', tile: '#e6ddcb', lawn: '#b7cda4', porch: '#d3cbbd' },
      wall: '#43382e',
      stonewall: '#857d70',
      door: '#b4593b',
      stairs: '#f1e4c8',
      tread: '#8a6f4e',
    },
    muted: {
      floor: { oak: '#dedbd5', redstone: '#dad6d0', blackwood: '#dcd9d3', tile: '#e1dfda', lawn: '#d2d4cf', porch: '#d6d4cf' },
      wall: '#6f6b65',
      stonewall: '#9a968f',
      door: '#8d8882',
      stairs: '#e7e5e1',
      tread: '#8d8984',
    },
    panel: '#fbf7ef',
    panelMuted: '#f1efeb',
    edge: '#d5cfc5',
    text: '#2a2622',
    textMuted: '#5c574f',
    halo: '#fbf7ef',
    // 사이트 토큰 --pine/--pine-on, --roof/--roof-on(밝음)과 같은 값
    level: { 1: { accent: '#3e5b47', on: '#f4f7f2' }, 2: { accent: '#a9553a', on: '#fff8f0' } },
    player: '#b4593b',
    playerEdge: '#fff8f0',
    wedge: 'rgba(180, 89, 59, 0.45)',
    wedgeEdge: 'rgba(150, 70, 44, 0.9)',
  },
  dark: {
    active: {
      floor: { oak: '#5c4b36', redstone: '#5f4536', blackwood: '#4f4334', tile: '#555049', lawn: '#36523f', porch: '#575147' },
      wall: '#efe6d6',
      stonewall: '#a39a8c',
      door: '#e48462',
      stairs: '#6b5b44',
      tread: '#e2cfab',
    },
    muted: {
      floor: { oak: '#3d3c3a', redstone: '#3e3d3b', blackwood: '#3b3a38', tile: '#403f3d', lawn: '#383a37', porch: '#3f3e3c' },
      wall: '#9d9993',
      stonewall: '#7f7b75',
      door: '#8f8b85',
      stairs: '#4a4947',
      tread: '#9a9690',
    },
    panel: '#25221f',
    panelMuted: '#2b2a28',
    edge: '#45403a',
    text: '#f3ece0',
    textMuted: '#bcb6ad',
    halo: '#25221f',
    // 사이트 토큰 --pine/--pine-on, --roof/--roof-on(어두움)과 같은 값
    level: { 1: { accent: '#8fb39a', on: '#142019' }, 2: { accent: '#d27a5c', on: '#1d1b19' } },
    player: '#f08a63',
    playerEdge: '#1d1b19',
    wedge: 'rgba(240, 138, 99, 0.45)',
    wedgeEdge: 'rgba(250, 170, 135, 0.9)',
  },
};

// ───────── 순수 계산(시험 대상)

const wallsOf = (w: HouseWorld, lv: Level) => w.walls.filter((x) => x.box.level === lv || x.box.level === 0);
const doorsOf = (w: HouseWorld, lv: Level) => w.doors.filter((d) => d.box.level === lv || d.box.level === 0);

/** 한 층의 범위: 그 층 바닥·벽 상자·문과 계단 경사면을 모두 덮는 사각형(1층은 마당 포함). */
export function floorBounds(world: HouseWorld, level: Level): Bounds {
  const items: Bounds[] = [
    ...world.floors.filter((f) => f.level === level),
    ...wallsOf(world, level).map((x) => x.box),
    ...doorsOf(world, level).map((d) => d.box),
    ...world.physics.ramps,
  ];
  if (!items.length) items.push(world.house);
  const b = { x1: Infinity, x2: -Infinity, z1: Infinity, z2: -Infinity };
  for (const it of items) {
    b.x1 = Math.min(b.x1, it.x1, it.x2);
    b.x2 = Math.max(b.x2, it.x1, it.x2);
    b.z1 = Math.min(b.z1, it.z1, it.z2);
    b.z2 = Math.max(b.z2, it.z1, it.z2);
  }
  return b;
}

/** 지도를 집에 맞출 때 집 둘레로 더 보여 주는 폭(m): 미니맵, 전체 지도 */
export const HOUSE_MARGIN = { mini: 0.8, full: 1.6 } as const;

/**
 * 집 범위: 그 층의 잔디가 아닌 바닥(실내·포치·발코니)과 계단을 덮고 둘레 margin(m)을 더한 사각형을 층 범위 안으로 자른다.
 * 마당이 넓은 1층도 집이 크게 보이게 하려고 쓴다. 그런 바닥이 없으면 층 범위 그대로.
 */
export function houseBounds(world: HouseWorld, level: Level, margin: number): Bounds {
  const full = floorBounds(world, level);
  const items: Bounds[] = [...world.floors.filter((f) => f.level === level && f.mat !== 'lawn'), ...world.physics.ramps];
  if (!items.length) return full;
  const b = { x1: Infinity, x2: -Infinity, z1: Infinity, z2: -Infinity };
  for (const it of items) {
    b.x1 = Math.min(b.x1, it.x1, it.x2);
    b.x2 = Math.max(b.x2, it.x1, it.x2);
    b.z1 = Math.min(b.z1, it.z1, it.z2);
    b.z2 = Math.max(b.z2, it.z1, it.z2);
  }
  return {
    x1: Math.max(full.x1, b.x1 - margin), x2: Math.min(full.x2, b.x2 + margin),
    z1: Math.max(full.z1, b.z1 - margin), z2: Math.min(full.z2, b.z2 + margin),
  };
}

/**
 * 지도에 담을 범위: 내가 그 층 집 범위 안에 있거나 다른 층에 있으면 집 범위, 그 층 마당에 나가 있으면 층 전체(마당 포함).
 * 문턱을 넘을 때만 바뀌어 걷는 동안 축척이 흔들리지 않는다.
 */
export function viewBounds(world: HouseWorld, level: Level, at: { x: number; z: number; level: Level } | null, margin: number): Bounds {
  const inner = houseBounds(world, level, margin);
  if (!at || at.level !== level) return inner;
  const inside = at.x >= inner.x1 && at.x <= inner.x2 && at.z >= inner.z1 && at.z <= inner.z2;
  return inside ? inner : floorBounds(world, level);
}

/** 범위를 사각형 안에 가운데 맞춰 넣는 변환(가로·세로 같은 축척, 여백 pad). */
export function fitTransform(b: Bounds, r: Rect, pad: number): Transform {
  const bw = Math.max(b.x2 - b.x1, 1e-6);
  const bh = Math.max(b.z2 - b.z1, 1e-6);
  const s = Math.max(0, Math.min((r.w - 2 * pad) / bw, (r.h - 2 * pad) / bh));
  return { s, ox: r.x + (r.w - bw * s) / 2 - b.x1 * s, oy: r.y + (r.h - bh * s) / 2 - b.z1 * s };
}

export function toCanvas(t: Transform, x: number, z: number): [number, number] {
  return [t.ox + x * t.s, t.oy + z * t.s];
}

/** 바라보는 방향의 캔버스 각도(arc 기준, y 아래가 +). yaw=0이면 -π/2(위). */
export function headingAngle(yaw: number): number {
  return Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
}

export type Panel = { level: Level; bounds: Bounds; frame: Rect; t: Transform; title: { x: number; y: number } };
export type FullLayout = {
  dir: 'row' | 'column';
  /** 두 판이 함께 쓰는 축척(px/m) */
  s: number;
  /** [1층, 2층] */
  panels: [Panel, Panel];
  /** 칠하는 순서: 지금 층 먼저 */
  order: [Level, Level];
  legend: { x: number; y: number };
};

/**
 * 전체 지도 배치: 1층·2층 판을 같은 축척으로 나란히. 가로가 넓으면 좌우, 세로가 길면 위아래.
 * bounds를 주면 그 범위로 판을 잡는다(없으면 층 전체). 범위 밖 그림은 판에서 잘린다.
 */
export function fullLayout(world: HouseWorld, width: number, height: number, active: Level, bounds?: [Bounds, Bounds]): FullLayout {
  const { outer, gap, title, pad, legend } = fullSpacing(height);
  const b = bounds ?? [floorBounds(world, 1), floorBounds(world, 2)];
  const bw = b.map((x) => Math.max(x.x2 - x.x1, 1e-6));
  const bh = b.map((x) => Math.max(x.z2 - x.z1, 1e-6));
  const aw = Math.max(0, width - 2 * outer);
  const ah = Math.max(0, height - 2 * outer - legend);
  const sRow = Math.max(0, Math.min((aw - gap - 4 * pad) / (bw[0] + bw[1]), (ah - title - 2 * pad) / Math.max(bh[0], bh[1])));
  const sCol = Math.max(0, Math.min((aw - 2 * pad) / Math.max(bw[0], bw[1]), (ah - gap - 2 * (title + 2 * pad)) / (bh[0] + bh[1])));
  // 화면 모양을 먼저 따르되, 반대 배치가 15% 넘게 크게 그려지면 그쪽을 쓴다(아주 길쭉한 집).
  let dir: 'row' | 'column' = width >= height ? 'row' : 'column';
  if (dir === 'row' && sCol > sRow * 1.15) dir = 'column';
  else if (dir === 'column' && sRow > sCol * 1.15) dir = 'row';
  const s = dir === 'row' ? sRow : sCol;
  const pw = bw.map((v) => v * s + 2 * pad);
  const ph = bh.map((v) => v * s + 2 * pad);
  let frames: [Rect, Rect];
  if (dir === 'row') {
    const gw = pw[0] + gap + pw[1];
    const gh = title + Math.max(ph[0], ph[1]);
    const x0 = outer + (aw - gw) / 2;
    const y0 = outer + (ah - gh) / 2 + title;
    frames = [{ x: x0, y: y0, w: pw[0], h: ph[0] }, { x: x0 + pw[0] + gap, y: y0, w: pw[1], h: ph[1] }];
  } else {
    const gh = 2 * title + ph[0] + gap + ph[1];
    const y0 = outer + (ah - gh) / 2;
    frames = [
      { x: outer + (aw - pw[0]) / 2, y: y0 + title, w: pw[0], h: ph[0] },
      { x: outer + (aw - pw[1]) / 2, y: y0 + title + ph[0] + gap + title, w: pw[1], h: ph[1] },
    ];
  }
  const panel = (i: 0 | 1): Panel => ({
    level: (i + 1) as Level,
    bounds: b[i],
    frame: frames[i],
    t: { s, ox: frames[i].x + pad - b[i].x1 * s, oy: frames[i].y + pad - b[i].z1 * s },
    title: { x: frames[i].x, y: frames[i].y - 10 },
  });
  return {
    dir, s,
    panels: [panel(0), panel(1)],
    order: active === 1 ? [1, 2] : [2, 1],
    legend: { x: width / 2, y: height - outer - legend / 2 },
  };
}

// ───────── 그리기

type Ctx = CanvasRenderingContext2D;
type Opts = { mode: MapMode; width: number; height: number; theme: MapTheme };

/** 세계 사각형 → 캔버스 사각형. 얇은 쪽은 minT(px)까지 가운데 기준으로 두껍게. */
function rectPx(t: Transform, b: Bounds, minT = 0): Rect {
  let x = t.ox + Math.min(b.x1, b.x2) * t.s;
  let y = t.oy + Math.min(b.z1, b.z2) * t.s;
  let w = Math.abs(b.x2 - b.x1) * t.s;
  let h = Math.abs(b.z2 - b.z1) * t.s;
  if (w < minT) { x -= (minT - w) / 2; w = minT; }
  if (h < minT) { y -= (minT - h) / 2; h = minT; }
  return { x, y, w, h };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// roundRect가 없는 옛 브라우저도 쓰도록 arcTo로 직접 만든다
function roundRectPath(ctx: Ctx, r: Rect, rad: number) {
  const k = Math.max(0, Math.min(rad, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

// 마당 → 포치 → 실내 순으로 칠해서 겹친 곳은 실내가 위에 온다
const MAT_ORDER: Record<FloorMat, number> = { lawn: 0, porch: 1, redstone: 2, tile: 2, oak: 2, blackwood: 2 };

/** 계단: 경사면 사각형에 디딤판 선. 평평한 계단참은 테두리만. */
function drawStairs(ctx: Ctx, t: Transform, r: Ramp, c: PlanColors) {
  const p = rectPx(t, r);
  ctx.fillStyle = c.stairs;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  const along = r.axis === 'z' ? r.z2 - r.z1 : r.x2 - r.x1;
  const len = r.axis === 'z' ? p.h : p.w;
  const flat = Math.abs(r.y1 - r.y0) < 1e-3;
  // 선이 3px보다 촘촘하면 줄인다
  const n = flat ? 1 : Math.max(1, Math.min(r.steps ?? Math.round(Math.abs(along) / 0.28), Math.floor(len / 3)));
  ctx.strokeStyle = c.tread;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const f = i / n;
    if (r.axis === 'z') {
      ctx.moveTo(p.x, p.y + p.h * f);
      ctx.lineTo(p.x + p.w, p.y + p.h * f);
    } else {
      ctx.moveTo(p.x + p.w * f, p.y);
      ctx.lineTo(p.x + p.w * f, p.y + p.h);
    }
  }
  ctx.stroke();
  ctx.strokeRect(p.x + 0.5, p.y + 0.5, Math.max(0, p.w - 1), Math.max(0, p.h - 1));
}

/** 계단이 그 층에 닿았다고 보는 높이 차(물리의 STEP과 같은 0.3m) */
const RAMP_REACH = 0.3;

/** 한 층 평면: 바닥, 계단, 벽, 닫힌 문 */
function drawPlan(ctx: Ctx, w: HouseWorld, lv: Level, t: Transform, c: PlanColors) {
  const floors = w.floors.filter((f) => f.level === lv).sort((a, b) => (MAT_ORDER[a.mat] ?? 2) - (MAT_ORDER[b.mat] ?? 2));
  for (const f of floors) {
    const p = rectPx(t, f);
    ctx.fillStyle = c.floor[f.mat] ?? c.floor.oak;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  // 그 층 바닥 높이에 닿는 계단만 그린다(2층 위에만 있는 계단참·줄기는 1층 평면에 안 나온다)
  const fy = lv === 2 ? w.physics.floor2 : 0;
  for (const r of w.physics.ramps) {
    const lo = Math.min(r.y0, r.y1), hi = Math.max(r.y0, r.y1);
    if (lo <= fy + RAMP_REACH && hi >= fy - RAMP_REACH) drawStairs(ctx, t, r, c);
  }
  for (const wl of wallsOf(w, lv)) {
    if (wl.style === 'invisible') continue;
    const p = rectPx(t, wl.box, 1.5);
    ctx.fillStyle = wl.style === 'stonewall' ? c.stonewall : c.wall;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  ctx.fillStyle = c.door;
  for (const d of doorsOf(w, lv)) {
    if (!d.closed) continue;
    const p = rectPx(t, d.box, 3);
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
}

/** 내 위치 점과 바라보는 방향 부채꼴(60°). 이름표가 피해 가도록 점 둘레 사각형을 돌려준다. */
function drawPlayer(ctx: Ctx, t: Transform, st: MapState, pal: MapPalette, mode: MapMode): Rect {
  const [px, py] = toCanvas(t, st.x, st.z);
  const a = headingAngle(st.yaw);
  const R = mode === 'mini' ? 20 : 34;
  const dot = mode === 'mini' ? 4.5 : 6.5;
  ctx.fillStyle = pal.wedge;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, R, a - Math.PI / 6, a + Math.PI / 6);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.wedgeEdge;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, dot, 0, Math.PI * 2);
  ctx.fillStyle = pal.player;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = pal.playerEdge;
  ctx.stroke();
  const k = dot + 5;
  return { x: px - k, y: py - k, w: 2 * k, h: 2 * k };
}

const area = (z: Bounds) => Math.abs((z.x2 - z.x1) * (z.z2 - z.z1));

/** 판 제목이 이미 층을 말하므로 이름 앞의 「N층 」은 판 안에서 뺀다(빼고 남는 게 없으면 그대로). */
export function zoneLabel(name: string, level: Level): string {
  const short = name.replace(new RegExp(`^${level}층\\s*`), '');
  return short || name;
}

/**
 * 구역 이름: 같은 이름은 가장 큰 칸에 한 번, 작은 칸부터 놓는다. 칸 너비 안에 들어가야 하고(넘치면 뺀다),
 * 다른 이름이나 avoid(내 위치 점)와 겹치면 칸 위쪽, 아래쪽 순으로 옮겨 보고 그래도 겹치면 뺀다.
 */
function drawZoneLabels(ctx: Ctx, w: HouseWorld, lv: Level, t: Transform, color: string, halo: string, avoid: Rect[] = []) {
  const best = new Map<string, Zone>();
  for (const z of w.zones) {
    if (z.level !== lv) continue;
    const prev = best.get(z.name);
    if (!prev || area(z) > area(prev)) best.set(z.name, z);
  }
  const placed: Rect[] = [...avoid];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const z of [...best.values()].sort((a, b) => area(a) - area(b))) {
    const p = rectPx(t, z);
    if (p.w < 26 || p.h < 14) continue;
    const text = zoneLabel(z.name, lv);
    let size = 12;
    ctx.font = `600 ${size}px ${FONT}`;
    let tw = ctx.measureText(text).width;
    if (tw > p.w - 6) {
      size = 10;
      ctx.font = `600 ${size}px ${FONT}`;
      tw = ctx.measureText(text).width;
    }
    if (tw > p.w - 4) continue;
    const cx = p.x + p.w / 2;
    const half = size / 2 + 3;
    const ys = [p.y + p.h / 2];
    if (p.h >= 2 * (size + 6) + 4) ys.push(p.y + half + 2, p.y + p.h - half - 2);
    const fit = ys.map((cy) => ({ cy, box: { x: cx - tw / 2 - 3, y: cy - half, w: tw + 6, h: 2 * half } }))
      .find((c) => !placed.some((q) => overlaps(q, c.box)));
    if (!fit) continue;
    placed.push(fit.box);
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.strokeText(text, cx, fit.cy);
    ctx.fillStyle = color;
    ctx.fillText(text, cx, fit.cy);
  }
}

/** 판 제목 「1층」「2층」, 지금 층이면 「지금 여기」 알약 */
function drawTitle(ctx: Ctx, p: Panel, active: boolean, pal: MapPalette) {
  const label = `${p.level}층`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 15px ${FONT}`;
  const lc = pal.level[p.level] ?? pal.level[1];
  ctx.fillStyle = active ? lc.accent : pal.textMuted;
  ctx.fillText(label, p.title.x + 2, p.title.y);
  if (!active) return;
  const tw = ctx.measureText(label).width;
  ctx.font = `700 11px ${FONT}`;
  const here = '지금 여기';
  const r = { x: p.title.x + 2 + tw + 8, y: p.title.y - 14, w: ctx.measureText(here).width + 14, h: 18 };
  roundRectPath(ctx, r, 9);
  ctx.fillStyle = lc.accent;
  ctx.fill();
  ctx.fillStyle = lc.on;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(here, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
}

/** 범례 한 줄: 닫힌 문 · 계단 · 나 · 위쪽이 북 */
function drawLegend(ctx: Ctx, L: FullLayout, pal: MapPalette) {
  const c = pal.active;
  const items = ['닫힌 문', '계단', '나', '위쪽이 북'];
  const sw = 16;
  const inner = 6;
  const between = 16;
  ctx.font = `500 12px ${FONT}`;
  const widths = items.map((s) => sw + inner + ctx.measureText(s).width);
  const total = widths.reduce((a, b) => a + b, 0) + between * (items.length - 1);
  const box = { x: L.legend.x - total / 2 - 12, y: L.legend.y - 12, w: total + 24, h: 24 };
  roundRectPath(ctx, box, 12);
  ctx.fillStyle = pal.panel;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.edge;
  ctx.stroke();
  const cy = L.legend.y;
  let x = box.x + 12;
  items.forEach((label, i) => {
    if (i === 0) {
      ctx.fillStyle = c.door;
      ctx.fillRect(x, cy - 2, sw, 4);
    } else if (i === 1) {
      drawStairs(ctx, { s: 1, ox: 0, oy: 0 }, { x1: x, x2: x + sw, z1: cy - 5, z2: cy + 5, axis: 'x', y0: 0, y1: 1, steps: 4 }, c);
    } else if (i === 2) {
      ctx.beginPath();
      ctx.arc(x + sw / 2, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = pal.player;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + sw / 2, cy - 6);
      ctx.lineTo(x + sw / 2 + 5, cy + 5);
      ctx.lineTo(x + sw / 2 - 5, cy + 5);
      ctx.closePath();
      ctx.fillStyle = pal.text;
      ctx.fill();
    }
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + sw + inner, cy);
    x += widths[i] + between;
  });
}

/**
 * 지도 그리기. mini = 지금 층 전체를 캔버스에 맞춰(이름 없이), full = 1층·2층을 같은 축척으로 나란히.
 * width·height는 CSS 픽셀이고, 호출자가 ctx를 devicePixelRatio로 미리 scale 해 둔다.
 */
export function drawMap(ctx: Ctx, world: HouseWorld, state: MapState, opts: Opts): void {
  const pal = PALETTES[opts.theme] ?? PALETTES.light;
  const { width, height } = opts;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (opts.mode === 'mini') {
    // 집 안에서는 집에 맞춰 크게, 마당에 나가면 층 전체(마당 포함)
    const t = fitTransform(viewBounds(world, state.level, state, HOUSE_MARGIN.mini), { x: 0, y: 0, w: width, h: height }, MINI_PAD);
    drawPlan(ctx, world, state.level, t, pal.active);
    drawPlayer(ctx, t, state, pal, 'mini');
  } else {
    const vb = (lv: Level) => viewBounds(world, lv, state, HOUSE_MARGIN.full);
    const L = fullLayout(world, width, height, state.level, [vb(1), vb(2)]);
    for (const lv of L.order) {
      const p = L.panels[lv - 1];
      const active = lv === state.level;
      ctx.save();
      roundRectPath(ctx, p.frame, 12);
      ctx.fillStyle = active ? pal.panel : pal.panelMuted;
      ctx.fill();
      ctx.clip();
      ctx.globalAlpha = active ? 1 : INACTIVE_ALPHA;
      drawPlan(ctx, world, lv, p.t, active ? pal.active : pal.muted);
      ctx.globalAlpha = 1;
      // 내 위치를 먼저 그리고, 이름표는 그 점을 피해 놓는다(부채꼴 위 글자는 둘레선으로 읽힌다)
      const me = active ? [drawPlayer(ctx, p.t, state, pal, 'full')] : [];
      drawZoneLabels(ctx, world, lv, p.t, active ? pal.text : pal.textMuted, active ? pal.halo : pal.panelMuted, me);
      ctx.restore();
      roundRectPath(ctx, p.frame, 12);
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeStyle = active ? (pal.level[lv] ?? pal.level[1]).accent : pal.edge;
      ctx.stroke();
      drawTitle(ctx, p, active, pal);
    }
    drawLegend(ctx, L, pal);
  }
  ctx.restore();
}
