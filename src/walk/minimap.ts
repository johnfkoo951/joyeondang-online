// 걷기 지도: 오른쪽 아래 미니맵과 M 키로 여는 전체 지도(1층·2층 나란히. 넓은 화면은 같은 축척, 휴대폰은 지금 층을 크게).
// DOM·three 없이 2D 캔버스 그리기만 한다. 범위·축척·배치 같은 순수 계산은 내보내서 시험한다.
// 방향: 북쪽(z가 작은 쪽)이 위, x가 오른쪽. 앞쪽 방향 = (-sin yaw, -cos yaw)라 yaw=0이면 위를 본다.
// 화면이 영어이면 판 제목·범례·「지금 여기」와 구역·자리 이름(lib/place-names 표)을 영어로 적는다. 집 데이터는 한국어 그대로 두고 그릴 때만 옮긴다.
import { placeName } from '@/lib/place-names';
import { walkLang, type Lang } from './lang';
import type { FloorMat, Furniture, Hotspot, HouseWorld, Level, Ramp, Zone } from './types';

export type MapMode = 'mini' | 'full';
export type MapTheme = 'light' | 'dark';
/** scene.ts WalkState에서 지도가 읽는 부분. Pick<WalkState, 'x' | 'z' | 'level' | 'yaw'>와 같은 모양이다. */
export type MapState = { x: number; z: number; level: Level; yaw: number; activeSpotId?: string | null };
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
  // 계단(경사면)은 집 범위에 넣되, 집 밖 마당에 놓인 평평한 단(무대)은 뺀다: 넣으면 집 범위가 마당 끝까지 늘어나
  // 집 안에 들어가도 지도가 커지지 않는다
  const H = world.house;
  const ramps = world.physics.ramps.filter((r) => Math.abs(r.y1 - r.y0) > 1e-3 || (r.x2 > H.x1 && r.x1 < H.x2 && r.z2 > H.z1 && r.z1 < H.z2));
  const items: Bounds[] = [...world.floors.filter((f) => f.level === level && f.mat !== 'lawn'), ...ramps];
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
  /** 지금 층 판의 축척(px/m). 넓은 캔버스에서는 두 판이 같은 축척을 쓴다 */
  s: number;
  /** [1층, 2층] */
  panels: [Panel, Panel];
  /** 칠하는 순서: 지금 층 먼저 */
  order: [Level, Level];
  legend: { x: number; y: number };
};

/** 캔버스 짧은 변이 이보다 작고 긴 변도 FOCUS_LONG_BELOW보다 작으면(휴대폰) 지금 층 판을 더 크게 그린다 */
export const FOCUS_BELOW = 480;
/** 긴 변이 이만큼 되면 넓은 화면이다(낮게 줄인 데스크탑 창). 두 판을 같은 축척으로 둔다 */
export const FOCUS_LONG_BELOW = 960;
/** 휴대폰만 한 캔버스인가(세로든 가로든). 넓고 낮은 데스크탑 창은 아니다: 층을 오갈 때 판 크기가 바뀌지 않게 */
export function focusCanvas(width: number, height: number): boolean {
  return Math.min(width, height) < FOCUS_BELOW && Math.max(width, height) < FOCUS_LONG_BELOW;
}
/** 그때 두 판이 나눠 쓰는 길이에서 지금 층 판이 가져가는 몫 */
export const FOCUS_SHARE = 0.72;

/**
 * 전체 지도 배치: 1층·2층 판을 나란히. 가로가 넓으면 좌우, 세로가 길면 위아래.
 * 넓은 캔버스는 두 판이 같은 축척이다. 좁은 캔버스(휴대폰)는 같은 축척으로는 지금 층이 너무 작아서,
 * 지금 층 판에 자리를 더 주고 다른 층은 남은 자리에 작게 그린다(지금 층보다 크게 그리지는 않는다).
 * bounds를 주면 그 범위로 판을 잡는다(없으면 층 전체). 범위 밖 그림은 판에서 잘린다.
 */
export function fullLayout(world: HouseWorld, width: number, height: number, active: Level, bounds?: [Bounds, Bounds]): FullLayout {
  const { outer, gap, title, pad, legend } = fullSpacing(height);
  const b = bounds ?? [floorBounds(world, 1), floorBounds(world, 2)];
  const bw = b.map((x) => Math.max(x.x2 - x.x1, 1e-6));
  const bh = b.map((x) => Math.max(x.z2 - x.z1, 1e-6));
  const aw = Math.max(0, width - 2 * outer);
  const ah = Math.max(0, height - 2 * outer - legend);
  // 판 안쪽 그림에 쓸 수 있는 길이: main = 두 판이 나눠 쓰는 쪽, cross = 판마다 다 쓰는 쪽
  const rowMain = aw - gap - 4 * pad;
  const rowCross = ah - title - 2 * pad;
  const colMain = ah - gap - 2 * (title + 2 * pad);
  const colCross = aw - 2 * pad;
  const sRow = Math.max(0, Math.min(rowMain / (bw[0] + bw[1]), rowCross / Math.max(bh[0], bh[1])));
  const sCol = Math.max(0, Math.min(colCross / Math.max(bw[0], bw[1]), colMain / (bh[0] + bh[1])));
  const focus = focusCanvas(width, height);
  const a = active === 2 ? 1 : 0;
  const o = 1 - a;
  // [지금 층 축척, 다른 층 축척]. 지금 층은 같은 축척일 때보다 작아지지 않는다
  const scales = (shared: number, main: number, cross: number, m: number[], c: number[]): [number, number] => {
    if (!focus) return [shared, shared];
    const sa = Math.max(0, Math.min(cross / c[a], Math.max(shared, (FOCUS_SHARE * main) / m[a])));
    const so = Math.max(0, Math.min(sa, cross / c[o], (main - m[a] * sa) / m[o]));
    return [sa, so];
  };
  const row = scales(sRow, rowMain, rowCross, bw, bh);
  const col = scales(sCol, colMain, colCross, bh, bw);
  // 화면 모양을 먼저 따르되, 반대 배치가 15% 넘게 크게 그려지면 그쪽을 쓴다(아주 길쭉한 집).
  let dir: 'row' | 'column' = width >= height ? 'row' : 'column';
  if (dir === 'row' && col[0] > row[0] * 1.15) dir = 'column';
  else if (dir === 'column' && row[0] > col[0] * 1.15) dir = 'row';
  const [sa, so] = dir === 'row' ? row : col;
  const s = sa;
  const sc = a === 0 ? [sa, so] : [so, sa];
  const pw = bw.map((v, i) => v * sc[i] + 2 * pad);
  const ph = bh.map((v, i) => v * sc[i] + 2 * pad);
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
    t: { s: sc[i], ox: frames[i].x + pad - b[i].x1 * sc[i], oy: frames[i].y + pad - b[i].z1 * sc[i] },
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
/** lang을 주지 않으면 지금 화면 말 */
type Opts = { mode: MapMode; width: number; height: number; theme: MapTheme; lang?: Lang };

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
  // 구역마다 옅은 색(거실·주방·계단·마당…): 어디가 어디인지 색으로 먼저 읽히게
  for (const z of w.zones) {
    if (z.level !== lv) continue;
    const col = zoneTint(z.name);
    if (!col) continue;
    const p = rectPx(t, z);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = col;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.globalAlpha = 1;
  }
  // 행사 꾸밈: 무대·꽃길·포토존·소나무(놓인 자리를 그대로)
  for (const f of w.furniture) {
    if (f.level !== lv) continue;
    const col = FURNITURE_MARK[f.kind];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.globalAlpha = f.kind === 'aisle' ? 0.55 : 0.8;
    if (f.kind === 'pine') {
      const [x, y] = toCanvas(t, (f.x1 + f.x2) / 2, (f.z1 + f.z2) / 2);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, 1.6 * t.s), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pts = footprint(f).map(([x, z]) => toCanvas(t, x, z));
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 그 층 바닥 높이에 닿는 계단만 그린다(2층 위에만 있는 계단참·줄기는 1층 평면에 안 나온다)
  const fy = lv === 2 ? w.physics.floor2 : 0;
  for (const r of w.physics.ramps) {
    const lo = Math.min(r.y0, r.y1), hi = Math.max(r.y0, r.y1);
    // 바닥보다 한 단 높은 평평한 판(무대)은 계단이 아니다
    if (hi - lo < 1e-3 && Math.abs(lo - fy) > 0.05 && Math.abs(lo - fy) <= RAMP_REACH) continue;
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

// ───────── 색으로 읽는 지도: 구역 색, 행사 소품, 살피기 자리 점과 이름

/** 구역 이름의 낱말로 색을 고른다(없으면 칠하지 않는다) */
export function zoneTint(name: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/거실/, '#e8a87c'], [/주방|부엌/, '#e3c45a'], [/계단/, '#9aa0a6'], [/현관/, '#b98a5a'],
    [/발코니|테라스/, '#6b8fb5'], [/포치/, '#bfb6a6'], [/마당/, '#7fb069'], [/홀|복도|전실/, '#d8c3a5'],
  ];
  for (const [re, col] of rules) if (re.test(name)) return col;
  return null;
}

const FURNITURE_MARK: Partial<Record<Furniture['kind'], string>> = {
  weddingStage: '#d9667a', aisle: '#f0b8c2', photoFrame: '#d9667a', pine: '#3e6b4f',
  grenadier: '#35495e', cla45: '#4f5663', diecastDisplay: '#c98a3b', opsCommandRig: '#2e86ab',
  jisanDesk: '#1f6f58', leaderboardStand: '#d99b26', grooveStation: '#8c62c9', earTrainerDesk: '#5a7ec7', swordArcade: '#e09a32', mccFieldCart: '#3b6e52',
};

/** 가구 바닥 네 귀퉁이(돌려 놓은 장식이면 그 각도대로) */
function footprint(f: Furniture): Array<[number, number]> {
  const cx = (f.x1 + f.x2) / 2, cz = (f.z1 + f.z2) / 2, hw = (f.x2 - f.x1) / 2, hd = (f.z2 - f.z1) / 2;
  const r = f.rot ?? 0, c = Math.cos(r), s = Math.sin(r);
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Array<[number, number]>).map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
}

/** 살피기 자리 색: 무대·포토존은 장밋빛, 방 문은 파랑, 마당 것은 초록·호박색 */
export function spotColor(h: Hotspot): string {
  if (h.kind === 'stage') return '#d9667a';
  if (h.kind === 'portal') return '#2f6fa8';
  if (h.kind === 'game') return '#7a5cc0';
  if (h.kind === 'exhibit') return '#2e9d82';
  if (h.kind === 'board') return '#d99b26';
  if (h.kind === 'exit') return '#c96442';
  if (h.kind === 'lantern') return '#e09a3e';
  const by: Record<string, string> = { photozone: '#d9667a', pine: '#3e6b4f', living: '#c98a2e', entrance: '#8a6f4e', porch: '#8d8577', kitchen: '#b8901e', gable: '#7a5cc0' };
  return (h.slug && by[h.slug]) || '#6d6358';
}

/** 지도에 적는 짧은 이름: 판 제목이 층을 말하므로 「N층 」을 빼고, 길면 줄인다 */
/** 한 변이 이보다 작은 미니맵(휴대폰)은 이름을 조금만 적는다: 다 적으면 9px 글자 일고여덟 개가 평면을 덮는다 */
export const MINI_SMALL = 150;
/** 작은 미니맵에 적는 이름 수, 그리고 내 자리에서 이 거리(m) 안에 있는 자리만 */
export const MINI_SMALL_NAMES = 2;
export const MINI_SMALL_NAME_DIST = 9;

/**
 * 작은 미니맵(휴대폰)에 이름을 적을 자리의 순서를 정한다. 색 점은 모든 자리에 찍고, 이름은 이 순서대로
 * 자리가 나는 것부터 MINI_SMALL_NAMES개까지 적는다(적을 틈이 없는 자리는 건너뛰고 다음 자리가 그 칸을 쓴다).
 * 지금 규칙: 내 자리에서 가까운 순으로, MINI_SMALL_NAME_DIST 안.
 * 행사 날 늘 보여야 하는 자리가 있으면(무대처럼) 여기서 먼저 넣는다.
 */
export function miniNames(spots: readonly Hotspot[], me: { x: number; z: number }): Hotspot[] {
  return spots
    .map((h) => ({ h, d: Math.hypot(h.x - me.x, h.z - me.z) }))
    .filter((q) => q.d <= MINI_SMALL_NAME_DIST)
    .sort((a, b) => a.d - b.d)
    .map((q) => q.h);
}

/** 지도에 적는 말(판 제목 뒤 「지금 여기」 알약, 범례 넷: 닫힌 문 · 계단 · 나 · 위쪽이 북). 영어는 같은 차례 */
export const MAP_WORDS: Readonly<Record<Lang, { here: string; legend: readonly [string, string, string, string] }>> = {
  ko: { here: '지금 여기', legend: ['닫힌 문', '계단', '나', '위쪽이 북'] },
  en: { here: 'You are here', legend: ['Closed door', 'Stairs', 'You', 'North is up'] },
};
/** 판 제목: 1층·2층, 영어는 1F·2F */
export const floorTitle = (level: Level, lang: Lang = 'ko') => (lang === 'en' ? `${level}F` : `${level}층`);

/** 영어 자리 이름의 글자 수 상한(전체 지도·큰 미니맵, 작은 미니맵). 낱말 중간에서 자르지 않는다 */
export const SPOT_EN_MAX = 16;
export const SPOT_EN_SMALL_MAX = 10;
/** 영어 이름을 max 글자 안으로: 넘치면 낱말 끝에서 자르고 「…」(한 낱말이 너무 길면 그 안에서 자른다) */
export function clipEn(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  // 자른 자리 바로 뒤가 빈칸이면 자른 글이 낱말로 끝난다
  const sp = text[max - 1] === ' ' ? cut.length : cut.lastIndexOf(' ');
  return `${(sp >= max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,]+$/, '')}…`;
}

export function spotLabel(h: Hotspot, level: Level, family?: (slug: string) => string | undefined, lang: Lang = 'ko'): string {
  const own = h.kind === 'portal' && h.slug ? family?.(h.slug) : undefined;
  const t = (own ?? h.title).replace(new RegExp(`^${level}층\\s*`), '').trim();
  // 가족이 지은 이름과 표에 없는 이름은 옮기지 않는다(한국어 줄이기 그대로)
  const en = lang === 'en' && !own ? placeName('en', t) : t;
  if (en === t) return t.length > 8 ? `${t.slice(0, 7)}…` : t;
  return clipEn(en, SPOT_EN_MAX);
}

/** 지도에 점을 찍는 살피기 자리(나가는 문·그냥 문은 뺀다) */
const spotsOf = (w: HouseWorld, lv: Level) => w.hotspots.filter((h) => h.level === lv && h.kind !== 'door' && (w.kind === 'room' || h.kind !== 'exit'));
/** 전체 지도의 자리 점 반지름(px) */
const FULL_DOT = 4.5;
/** 그릴 칸(area)에 걸치는 자리 점들의 칸. 구역 이름이 점에 덮이지 않게 먼저 알아 둔다 */
const dotBoxes = (w: HouseWorld, lv: Level, t: Transform, r: number, area: Rect): Rect[] =>
  spotsOf(w, lv).map((h) => {
    const [x, y] = toCanvas(t, h.x, h.z);
    return { x: x - r, y: y - r, w: 2 * r, h: 2 * r };
  }).filter((b) => overlaps(b, area));

/**
 * 살피기 자리마다 색 점과 이름. 이름끼리·avoid와 겹치거나 그릴 칸(area) 밖으로 나가면 이름만 뺀다(점은 늘 그린다).
 * written = 구역 이름으로 이미 적힌 글자: 같은 이름의 자리는 점만 찍는다.
 */
function drawSpots(
  ctx: Ctx, w: HouseWorld, lv: Level, t: Transform, pal: MapPalette, mode: MapMode, avoid: Rect[], area: Rect,
  small?: { x: number; z: number }, written: ReadonlySet<string> = new Set(), activeSpotId?: string | null, lang: Lang = 'ko',
) {
  const spots = spotsOf(w, lv);
  // 작은 미니맵은 가까운 자리 한두 곳(시선이 닿은 자리는 최우선)만 이름을 적는다
  const named = small ? new Set([...(activeSpotId ? [activeSpotId] : []), ...miniNames(spots, small).map((h) => h.id)]) : null;
  let left = small ? MINI_SMALL_NAMES : Infinity;
  const placed: Rect[] = [...avoid];
  const dot = small ? 2.6 : mode === 'mini' ? 3.2 : FULL_DOT;
  const size = small ? 10 : mode === 'mini' ? 9 : 11;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 중요한 자리(무대·포토존·방명록·방 문)부터 이름 자리를 잡는다. 작은 미니맵은 고른 순서(가까운 순)대로
  const rank = (h: Hotspot) => (h.kind === 'stage' ? 0 : h.slug === 'photozone' ? 1 : h.id === 'guestbook' ? 2 : h.kind === 'portal' ? 3 : 4);
  const order = small ? [...miniNames(spots, small), ...spots.filter((h) => !named!.has(h.id))] : [...spots].sort((a, b) => rank(a) - rank(b));
  const within = (r: Rect) => r.x >= area.x + 1 && r.y >= area.y + 1 && r.x + r.w <= area.x + area.w - 1 && r.y + r.h <= area.y + area.h - 1;
  // 점을 먼저 모두 찍고 이름을 적는다(나중에 찍은 점이 먼저 적은 이름을 덮지 않게). 이름은 다른 자리의 점도 피한다
  const at = order.map((h) => ({ h, p: toCanvas(t, h.x, h.z), col: spotColor(h) }));
  for (const { h, p: [x, y], col } of at) {
    if (activeSpotId && h.id === activeSpotId) {
      ctx.beginPath();
      ctx.arc(x, y, dot + (small ? 3.2 : 4.5), 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, activeSpotId && h.id === activeSpotId ? dot + 1.2 : dot, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = small ? 1 : 1.5;
    ctx.strokeStyle = pal.halo;
    ctx.stroke();
  }
  const dots = at.map(({ h, p: [x, y] }) => ({ id: h.id, box: { x: x - dot, y: y - dot, w: dot * 2, h: dot * 2 } }));
  for (const { h, p: [x, y], col } of at) {
    if (left <= 0) break;
    if (named && !named.has(h.id)) continue;
    const full = spotLabel(h, lv, undefined, lang);
    // 영어로 옮긴 이름은 낱말 끝에서 줄인다(한국어 이름은 예전 그대로 다섯 글자)
    const english = lang === 'en' && !/[가-힣]/.test(full);
    const text = small && english ? clipEn(full, SPOT_EN_SMALL_MAX) : small && full.length > 6 ? `${full.replace(/…$/, '').slice(0, 5)}…` : full;
    if (written.has(text)) continue;
    const tw = ctx.measureText(text).width;
    const bh = size + 4;
    // 이름 자리 후보: 점 오른쪽, 왼쪽, 위, 아래
    const cands = [
      { x: x + dot + 3, y, align: 'left' as const, box: { x: x + dot + 1, y: y - bh / 2, w: tw + 4, h: bh } },
      { x: x - dot - 3, y, align: 'right' as const, box: { x: x - dot - 5 - tw, y: y - bh / 2, w: tw + 4, h: bh } },
      { x, y: y - dot - size / 2 - 3, align: 'center' as const, box: { x: x - tw / 2 - 2, y: y - dot - size - 5, w: tw + 4, h: bh } },
      { x, y: y + dot + size / 2 + 3, align: 'center' as const, box: { x: x - tw / 2 - 2, y: y + dot + 1, w: tw + 4, h: bh } },
    ];
    const free = (c: { box: Rect }) => within(c.box) && !placed.some((q) => overlaps(q, c.box)) && !dots.some((d) => d.id !== h.id && overlaps(d.box, c.box));
    const fit = cands.find(free);
    if (!fit) continue;
    left--;
    placed.push(fit.box);
    ctx.textAlign = fit.align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal.halo;
    ctx.strokeText(text, fit.x, fit.y);
    ctx.fillStyle = col;
    ctx.fillText(text, fit.x, fit.y);
  }
}

/** 내 위치 점과 바라보는 방향 부채꼴(60°). 이름표가 피해 가도록 점 둘레 사각형을 돌려준다. */
function drawPlayer(ctx: Ctx, t: Transform, st: MapState, pal: MapPalette, mode: MapMode, small = false): Rect {
  const [px, py] = toCanvas(t, st.x, st.z);
  const a = headingAngle(st.yaw);
  const R = small ? 14 : mode === 'mini' ? 20 : 34;
  const dot = small ? 4 : mode === 'mini' ? 4.5 : 6.5;
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

/** 두 사각형이 겹치는 부분(없으면 너비·높이 0) */
function clipRect(r: Rect, a: Rect): Rect {
  const x = Math.max(r.x, a.x);
  const y = Math.max(r.y, a.y);
  return { x, y, w: Math.max(0, Math.min(r.x + r.w, a.x + a.w) - x), h: Math.max(0, Math.min(r.y + r.h, a.y + a.h) - y) };
}

/**
 * 구역 이름: 같은 이름은 가장 큰 칸에 한 번, 작은 칸부터 놓는다. 칸 너비 안에 들어가야 하고(넘치면 뺀다),
 * 다른 이름이나 avoid(내 위치 점, 자리 점)와 겹치면 칸 위쪽, 아래쪽 순으로 옮겨 보고 그래도 겹치면 뺀다.
 * 칸이 판(frame) 밖으로 나가 있으면 안에 보이는 부분에만 적는다(이름이 판 끝에서 잘리지 않게).
 * 적은 이름의 칸과 글자를 돌려준다: 자리 이름이 그 칸을 피하고, 같은 글자를 두 번 적지 않는다.
 */
function drawZoneLabels(
  ctx: Ctx, w: HouseWorld, lv: Level, t: Transform, color: string, halo: string, avoid: Rect[], frame: Rect, lang: Lang = 'ko',
): { boxes: Rect[]; names: Set<string> } {
  const out = { boxes: [] as Rect[], names: new Set<string>() };
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
    const p = clipRect(rectPx(t, z), { x: frame.x + 2, y: frame.y + 2, w: frame.w - 4, h: frame.h - 4 });
    if (p.w < 26 || p.h < 14) continue;
    const text = placeName(lang, zoneLabel(z.name, lv));
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
    // 가운데가 막혔을 때 옮길 자리. 낮은 칸도 위·아래로 몇 px 비켜 볼 수 있게 한다
    if (p.h >= 2 * half + 6) ys.push(p.y + half + 2, p.y + p.h - half - 2);
    const fit = ys.map((cy) => ({ cy, box: { x: cx - tw / 2 - 3, y: cy - half, w: tw + 6, h: 2 * half } }))
      .find((c) => !placed.some((q) => overlaps(q, c.box)));
    if (!fit) continue;
    placed.push(fit.box);
    out.boxes.push(fit.box);
    out.names.add(text);
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.strokeText(text, cx, fit.cy);
    ctx.fillStyle = color;
    ctx.fillText(text, cx, fit.cy);
  }
  return out;
}

/** 판 제목 「1층」「2층」, 지금 층이면 「지금 여기」 알약 */
function drawTitle(ctx: Ctx, p: Panel, active: boolean, pal: MapPalette, lang: Lang = 'ko') {
  const label = floorTitle(p.level, lang);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 15px ${FONT}`;
  const lc = pal.level[p.level] ?? pal.level[1];
  ctx.fillStyle = active ? lc.accent : pal.textMuted;
  ctx.fillText(label, p.title.x + 2, p.title.y);
  if (!active) return;
  const tw = ctx.measureText(label).width;
  ctx.font = `700 11px ${FONT}`;
  const here = MAP_WORDS[lang].here;
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
function drawLegend(ctx: Ctx, L: FullLayout, pal: MapPalette, lang: Lang = 'ko') {
  const c = pal.active;
  const items = MAP_WORDS[lang].legend;
  const sw = 16;
  const inner = 6;
  const between = 16;
  let size = 12;
  ctx.font = `500 ${size}px ${FONT}`;
  let widths = items.map((s) => sw + inner + ctx.measureText(s).width);
  let total = widths.reduce((a, b) => a + b, 0) + between * (items.length - 1);
  // 영어 범례는 한국어보다 길다: 좁은 캔버스(휴대폰)에서 넘치면 글씨를 줄인다(가운데 x의 두 배가 캔버스 너비)
  while (lang === 'en' && size > 9 && total + 24 > 2 * L.legend.x - 8) {
    ctx.font = `500 ${(size -= 1)}px ${FONT}`;
    widths = items.map((s) => sw + inner + ctx.measureText(s).width);
    total = widths.reduce((a, b) => a + b, 0) + between * (items.length - 1);
  }
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
 * 지도 그리기. mini = 지금 층을 캔버스에 맞춰(자리 이름만), full = 1층·2층을 나란히(구역 이름과 자리 이름).
 * width·height는 CSS 픽셀이고, 호출자가 캔버스를 비우고 ctx를 devicePixelRatio로 미리 scale 해 둔다.
 * (여기서 또 지우면 같은 넓이를 두 번 지운다. 화소 단위로 딱 맞게 지울 수 있는 쪽도 호출자다.)
 */
export function drawMap(ctx: Ctx, world: HouseWorld, state: MapState, opts: Opts): void {
  const pal = PALETTES[opts.theme] ?? PALETTES.light;
  const { width, height } = opts;
  const lang = opts.lang ?? walkLang();
  ctx.save();
  if (opts.mode === 'mini') {
    // 집 안에서는 집에 맞춰 크게, 마당에 나가면 층 전체(마당 포함)
    const t = fitTransform(viewBounds(world, state.level, state, HOUSE_MARGIN.mini), { x: 0, y: 0, w: width, h: height }, MINI_PAD);
    drawPlan(ctx, world, state.level, t, pal.active);
    const small = Math.min(width, height) < MINI_SMALL;
    const me = drawPlayer(ctx, t, state, pal, 'mini', small);
    drawSpots(ctx, world, state.level, t, pal, 'mini', [me], { x: 0, y: 0, w: width, h: height }, small ? state : undefined, new Set(), state.activeSpotId, lang);
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
      // 구역 이름은 자리 점도 피해 놓고(점에 덮이면 읽히지 않는다), 자리 이름은 구역 이름을 피한다
      const dots = active ? dotBoxes(world, lv, p.t, FULL_DOT, p.frame) : [];
      const zones = drawZoneLabels(ctx, world, lv, p.t, active ? pal.text : pal.textMuted, active ? pal.halo : pal.panelMuted, [...me, ...dots], p.frame, lang);
      if (active) drawSpots(ctx, world, lv, p.t, pal, 'full', [...me, ...zones.boxes], p.frame, undefined, zones.names, state.activeSpotId, lang);
      ctx.restore();
      roundRectPath(ctx, p.frame, 12);
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeStyle = active ? (pal.level[lv] ?? pal.level[1]).accent : pal.edge;
      ctx.stroke();
      drawTitle(ctx, p, active, pal, lang);
    }
    drawLegend(ctx, L, pal, lang);
  }
  ctx.restore();
}
