// 집을 꾸미는 장식의 자리(three.js 없이 계산한다). 그림·화분·커튼·깔개·처마·포치 등·화단 같은 것으로,
// 받은 집 데이터(벽·창·바닥·가구·지붕판)에서 규칙으로 찾는다. 배치(벽·문·가구·손질층)는 바꾸지 않고 충돌 상자도 만들지 않는다:
// 걷는 길·문 앞·계단·살피기 자리는 비켜 두므로 걷기를 막지 않는다. 다시 그린 집과 실제 집에 똑같이 쓴다.
// 치수·이름은 여기 적지 않는다(모두 받은 데이터에서 찾는다).
import type { Furniture, FurnitureKind, HouseWorld, Level, Prop, WallSpec, WindowSpec } from './types';

type Rect = { x1: number; x2: number; z1: number; z2: number };
type Side = -1 | 1;

/** 기둥 줄 위에 얹는 보(포치 지붕판 밑). y0~y1은 높이 */
export type Lintel = Rect & { y0: number; y1: number };
/** 벽에 거는 액자: 가운데(x, y, z), 크기, 벽에서 나오는 쪽(yaw: +z가 0), 그림 번호 */
export type Painting = { level: Level; x: number; y: number; z: number; w: number; h: number; yaw: number; art: number };
/**
 * 그림등(갤러리 조명): 그림마다 하나, 그림 위 벽에 붙인다. (x, y, z)는 벽 면에 붙는 받침의 가운데, w는 등 막대 길이,
 * reach는 벽에서 등 막대까지 나온 거리, yaw는 그림과 같은 쪽. 1층은 놋쇠, 2층은 은색
 */
export type PictureLight = { level: Level; x: number; y: number; z: number; w: number; reach: number; yaw: number; finish: 'brass' | 'silver' };
/** 방 모서리 화분(키 큰 잎 화분, 낮은 난 화분, 달항아리) */
export type Plant = { level: Level; x: number; z: number; kind: 'tall' | 'orchid' | 'jar'; seed: number };
/** 창 안쪽 커튼 한 폭(drape) 또는 창 위 대나무 발(blind). x·z는 벽 면에서 띄운 가운데, w는 벽을 따라간 폭 */
export type Curtain = { level: Level; x: number; z: number; y0: number; y1: number; w: number; yaw: number; kind: 'drape' | 'blind' };
/** 커튼 봉: 벽을 따라 a~b, 높이 y */
export type Rod = { level: Level; axis: 'x' | 'z'; line: number; a: number; b: number; y: number };
/** 바닥 깔개(그림 번호는 textures.RUGS) */
export type Rug = { level: Level; x: number; z: number; w: number; d: number; yaw: number; kind: number };
/** 처마: 바깥벽 꼭대기에서 바깥(s쪽)으로 내민 기와 띠. 벽을 따라 a~b, line은 벽 바깥 면 */
export type Eave = { axis: 'x' | 'z'; line: number; a: number; b: number; y: number; s: Side };
/** 포치 천장에 매단 등(x, z, 매다는 높이 top) */
export type Lantern = { x: number; z: number; top: number };
/** 화단 한 칸(마당 담 안쪽) */
export type Bed = Rect;
/** 담 위의 나무 울타리(벽을 따라 a~b, 담 꼭대기 y) */
export type Fence = { axis: 'x' | 'z'; line: number; a: number; b: number; y: number };
/** 테라스 모서리 꽃 상자 */
export type Planter = { level: Level; x: number; z: number; seed: number };
/** 따뜻한 빛 웅덩이(포치 등 밑 바닥, 벽등 뒤 벽). up이면 바닥에 눕히고, 아니면 yaw 쪽을 보고 벽에 세운다 */
export type Pool = { x: number; y: number; z: number; size: number; yaw: number; up: boolean; indoor?: Level };

export type DecorPlan = {
  lintels: Lintel[];
  /** 기둥 자리(x, z)마다 기둥머리 윗면 높이(보가 있으면 보 밑) */
  columnTops: Array<{ x: number; z: number; top: number }>;
  paintings: Painting[];
  /** 그림마다 하나씩, 그림 위에 거는 등 */
  pictureLights: PictureLight[];
  plants: Plant[];
  curtains: Curtain[];
  rods: Rod[];
  rugs: Rug[];
  eaves: Eave[];
  lanterns: Lantern[];
  beds: Bed[];
  fences: Fence[];
  pools: Pool[];
  planters: Planter[];
};

/** 장식 치수(미터). 공개해도 되는 일반 값이다 */
export const DECOR_SIZE = {
  lintelH: 0.2,
  eaveOut: 0.55,
  eaveDrop: 0.2,
  drapeW: 0.44,
  drapeGap: 0.16,
  paintingY: 1.6,
  plantFromWall: 0.38,
  /** 그림 위 끝에서 그림등 받침 가운데까지 */
  lightAbove: 0.13,
  /** 그림등 받침 높이(벽 꼭대기 몰딩과 겹치지 않게 그 아래에 둔다) */
  lightPlate: 0.09,
  lightReach: 0.17,
} as const;

/**
 * 3인칭(천장과 벽 윗부분을 걷어 낸 인형의 집 보기)에서 받쳐 줄 데가 사라지는 가구.
 * ceiling: 천장에 매다는 것(천장이 보이는 1인칭에서만 그린다). wall: 벽·창에 붙은 것(그 층 벽을 낮출 때 함께 숨긴다).
 * 여기에 없는 가구는 바닥에 선다.
 */
export const HUNG: Readonly<Partial<Record<FurnitureKind, 'ceiling' | 'wall'>>> = {
  pendant: 'ceiling',
  hanjiPendant: 'ceiling',
  constellationMobile: 'ceiling',
  garageTrackLight: 'ceiling',
  lattice: 'wall',
  ridgeBeam: 'wall',
  hyeonpan: 'wall',
  sconce: 'wall',
};

/** 그림을 가리는 키 큰 가구(벽 앞에 서면 그 위에 액자를 걸지 않는다) */
const TALL = new Set<Furniture['kind']>([
  'bookshelf', 'lattice', 'foldingScreen', 'floorLamp', 'wardrobe', 'bookWall', 'corkBoard', 'chalkboard', 'wallFrames', 'pegboard',
  'piano', 'doubleBass', 'playTent', 'sheerCurtain', 'toyShelf', 'boxShelf', 'drawers9', 'bicycle', 'musicStand', 'pine', 'stoneLantern',
  'photoFrame', 'welcomeSign', 'flowerArch', 'puppetStage', 'hyeonpan', 'sconce', 'stage',
]);
/** 바닥에 깔리기만 하는 것(화분 자리를 막지 않는다) */
const FLAT = new Set<Furniture['kind']>(['lightShaft', 'garageBayLines', 'rug', 'roundRug', 'playMat', 'lightPattern', 'aisle', 'path', 'pendant', 'hanjiPendant', 'ridgeBeam', 'slopedCeiling', 'stripeWall', 'bunting', 'sentenceLine']);

const cx = (r: Rect) => (r.x1 + r.x2) / 2;
const cz = (r: Rect) => (r.z1 + r.z2) / 2;
const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.x1 - pad && x < r.x2 + pad && z > r.z1 - pad && z < r.z2 + pad;
const overlaps = (a: Rect, b: Rect) => a.x1 < b.x2 && a.x2 > b.x1 && a.z1 < b.z2 && a.z2 > b.z1;
const lvOf = (lv: 0 | 1 | 2): Level => (lv === 2 ? 2 : 1);
const baseOf = (w: HouseWorld, lv: Level) => (lv === 2 ? w.floor2 : 0);

/** 3인칭 계산과 같은 벽 선·두께·구간 */
const lineOf = (w: WallSpec) => (w.axis === 'x' ? cz(w.box) : cx(w.box));
const thickOf = (w: WallSpec) => (w.axis === 'x' ? w.box.z2 - w.box.z1 : w.box.x2 - w.box.x1);
const spanOf = (w: WallSpec): [number, number] => (w.axis === 'x' ? [w.box.x1, w.box.x2] : [w.box.z1, w.box.z2]);
/** 벽을 따라 u, 벽에서 v만큼 떨어진 점 */
const at = (axis: 'x' | 'z', u: number, v: number): [number, number] => (axis === 'x' ? [u, v] : [v, u]);
/** 벽 면에서 s쪽을 보는 방향(yaw, +z가 0) */
const yawOf = (axis: 'x' | 'z', s: Side) => (axis === 'x' ? (s > 0 ? 0 : Math.PI) : s > 0 ? Math.PI / 2 : -Math.PI / 2);

/** 걸어 다니는 실내 바닥인가(마당·포치 제외) */
export function indoorAt(w: HouseWorld, lv: Level, x: number, z: number) {
  return w.floors.some((f) => f.level === lv && f.mat !== 'lawn' && f.mat !== 'porch' && x > f.x1 && x < f.x2 && z > f.z1 && z < f.z2);
}

function windowsOn(w: HouseWorld, s: WallSpec): WindowSpec[] {
  const [a, b] = spanOf(s);
  return w.windows.filter((v) => v.level === lvOf(s.box.level) && v.axis === s.axis && Math.abs(v.at - lineOf(s)) <= thickOf(s) / 2 + 0.06 && v.to > a && v.from < b);
}

/** 벽의 실내 쪽(바깥벽은 한쪽, 안벽은 양쪽). scene.ts와 같은 판정 */
export function interiorSides(w: HouseWorld, s: WallSpec): Side[] {
  if (s.style !== 'ext') return [-1, 1];
  const lv = lvOf(s.box.level);
  const [a, b] = spanOf(s);
  const mid = (a + b) / 2;
  const off = thickOf(s) / 2 + 0.3;
  return ([-1, 1] as Side[]).filter((k) => {
    const [x, z] = at(s.axis, mid, lineOf(s) + k * off);
    return indoorAt(w, lv, x, z);
  });
}

/** 창 구멍 둘레로 나눈 벽 조각 가운데 바닥부터 꼭대기까지 이어진 구간들 */
function fullPieces(w: HouseWorld, s: WallSpec): Array<[number, number]> {
  const [s0, s1] = spanOf(s);
  const holes = windowsOn(w, s).map((v) => [Math.max(v.from, s0), Math.min(v.to, s1)] as [number, number]).sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cur = s0;
  for (const [a, b] of holes) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < s1) out.push([cur, s1]);
  return out.filter(([a, b]) => b - a > 0.05);
}

const solidWalls = (w: HouseWorld, lv: Level) => w.walls.filter((s) => s.style !== 'invisible' && (s.box.level === lv || s.box.level === 0));

/** (x, z)가 그 층의 보이는 벽 안인가 */
function inWall(w: HouseWorld, lv: Level, x: number, z: number, pad = 0.02) {
  return solidWalls(w, lv).some((s) => s.height > 1.5 && inRect(s.box, x, z, pad));
}

/**
 * 손님이 걸어 들어갈 수 있는 바닥(처음 서는 자리에서 열린 통로·계단으로 이어진 바닥). 닫힌 문 너머 방(문으로 들어가는 방 장면)에는
 * 그림·화분을 아껴 두고, 걸어 다니는 곳에 먼저 건다. 바닥 판끼리 맞닿은 변에 벽·닫힌 문이 없는 구간이 0.6m 넘으면 이어진 것으로 본다.
 */
export function openFloors(w: HouseWorld): Set<number> {
  const F = w.floors;
  const R = w.physics.ramps;
  // 마디: 바닥 판 0..F-1, 경사면(계단 한 줄기·계단참) F..F+R-1
  const link = new Map<number, Set<number>>([...F, ...R].map((_, i) => [i, new Set<number>()]));
  const join = (i: number, j: number) => { link.get(i)!.add(j); link.get(j)!.add(i); };
  const shut = (lv: Level, x: number, z: number) => inWall(w, lv, x, z, 0.02) || w.doors.some((d) => d.closed && lvOf(d.box.level) === lv && inRect(d.box, x, z, 0.02));
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const a = F[i], b = F[j];
    if (a.level !== b.level) continue;
    // 맞닿은 변(세로 변 또는 가로 변)과 겹친 구간
    const seams: Array<{ axis: 'x' | 'z'; at: number; lo: number; hi: number }> = [];
    if (Math.abs(a.x2 - b.x1) < 0.03 || Math.abs(b.x2 - a.x1) < 0.03) seams.push({ axis: 'z', at: Math.abs(a.x2 - b.x1) < 0.03 ? a.x2 : a.x1, lo: Math.max(a.z1, b.z1), hi: Math.min(a.z2, b.z2) });
    if (Math.abs(a.z2 - b.z1) < 0.03 || Math.abs(b.z2 - a.z1) < 0.03) seams.push({ axis: 'x', at: Math.abs(a.z2 - b.z1) < 0.03 ? a.z2 : a.z1, lo: Math.max(a.x1, b.x1), hi: Math.min(a.x2, b.x2) });
    for (const s of seams) {
      let run = 0;
      for (let u = s.lo + 0.05; u < s.hi; u += 0.1) {
        const [x, z] = at(s.axis, u, s.at);
        run = shut(a.level, x, z) ? 0 : run + 0.1;
        if (run >= 0.6) { join(i, j); break; }
      }
    }
  }
  // 계단: 경사면 끝이 닿은 바닥(낮은 끝은 1층, 높은 끝은 2층)과, 높이가 이어지는 옆 경사면·계단참끼리 잇는다
  const grow = (r: Rect, d: number): Rect => ({ x1: r.x1 - d, x2: r.x2 + d, z1: r.z1 - d, z2: r.z2 + d });
  R.forEach((r, k) => {
    const lo = Math.min(r.y0, r.y1), hi = Math.max(r.y0, r.y1);
    F.forEach((f, i) => {
      if (!overlaps(f, grow(r, 0.3))) return;
      if ((f.level === 1 && lo < 0.3) || (f.level === 2 && hi > w.floor2 - 0.3)) join(i, F.length + k);
    });
    R.forEach((q, m) => {
      if (m <= k || !overlaps(grow(r, 0.12), q)) return;
      const qlo = Math.min(q.y0, q.y1), qhi = Math.max(q.y0, q.y1);
      if (qlo <= hi + 0.15 && lo <= qhi + 0.15) join(F.length + k, F.length + m);
    });
  });
  const start = F.findIndex((f) => f.level === 1 && inRect(f, w.spawn.x, w.spawn.z, 0.01));
  const seen = new Set<number>();
  const todo = [start >= 0 ? start : F.findIndex((f) => f.mat === 'lawn')].filter((i) => i >= 0);
  while (todo.length) {
    const i = todo.pop()!;
    if (seen.has(i)) continue;
    seen.add(i);
    for (const j of link.get(i)!) if (!seen.has(j)) todo.push(j);
  }
  return new Set([...seen].filter((i) => i < F.length));
}

/** (x, z)가 걸어 들어갈 수 있는 바닥 위인가 */
const openAt = (w: HouseWorld, open: Set<number>, lv: Level, x: number, z: number) =>
  w.floors.some((f, i) => open.has(i) && f.level === lv && x > f.x1 && x < f.x2 && z > f.z1 && z < f.z2);

/**
 * (x, z)가 사진 갤러리 액자가 걸린 구역 안인가(gallery.ts가 액자를 건 구역). 그 방의 벽은 갤러리 몫이라
 * 장식 그림과 모서리 화분을 두지 않는다(액자를 가리거나 겹치지 않게)
 */
function galleryAt(w: HouseWorld, lv: Level, x: number, z: number): boolean {
  if (!w.gallery?.length) return false;
  return w.zones.some((zn) => zn.level === lv && inRect(zn, x, z) && w.gallery!.some((f) => f.level === lv && f.room === zn.name));
}

// ───────── 포치: 기둥 줄 위의 보와 기둥머리 높이
function porch(w: HouseWorld) {
  const lintels: Lintel[] = [];
  const columnTops: DecorPlan['columnTops'] = [];
  const cols = w.props.filter((p): p is Extract<Prop, { type: 'column' }> => p.type === 'column');
  const slabs = w.props.filter((p): p is Extract<Prop, { type: 'slab' }> => p.type === 'slab' && p.part === 'porch');
  const arches = w.props.filter((p): p is Extract<Prop, { type: 'arch' }> => p.type === 'arch');
  const H = DECOR_SIZE.lintelH;
  const used = new Set<number>();
  for (const s of slabs) {
    const under = s.y - s.t / 2;
    // 지붕판에 닿는 기둥(머리가 판 밑 5cm 안)
    const touching = cols.map((c, i) => ({ c, i })).filter(({ c }) => inRect(s, c.x, c.z) && Math.abs(c.h - under) < 0.06);
    for (const axis of ['x', 'z'] as const) {
      const lines = new Map<number, typeof touching>();
      for (const t of touching) {
        const key = Math.round((axis === 'x' ? t.c.z : t.c.x) * 10);
        lines.set(key, [...(lines.get(key) ?? []), t]);
      }
      for (const line of lines.values()) {
        if (line.length < 2 || line.some((t) => used.has(t.i))) continue;
        const lv = axis === 'x' ? line[0].c.z : line[0].c.x;
        // 아치가 걸린 줄은 아치가 그 몫을 한다
        if (arches.some((a) => a.axis === axis && Math.abs((axis === 'x' ? a.z : a.x) - lv) < 0.1)) continue;
        const wMax = Math.max(...line.map((t) => t.c.w));
        const half = wMax / 2 + 0.07;
        const along = line.map((t) => (axis === 'x' ? t.c.x : t.c.z));
        const lo = Math.max(axis === 'x' ? s.x1 : s.z1, Math.min(...along) - wMax / 2 - 0.12);
        const hi = Math.min(axis === 'x' ? s.x2 : s.z2, Math.max(...along) + wMax / 2 + 0.12);
        // 지붕판 끝을 넘지 않게 앞뒤 폭을 맞춘다
        const [e1, e2] = axis === 'x' ? [s.z1, s.z2] : [s.x1, s.x2];
        // 지붕판 가장자리에 가까우면 그 끝에 맞춘다(판 밑면이 가는 줄로 비치지 않게)
        const d1 = lv - half - e1 < 0.1 ? e1 : lv - half, d2 = e2 - (lv + half) < 0.1 ? e2 : lv + half;
        lintels.push(axis === 'x'
          ? { x1: lo, x2: hi, z1: d1, z2: d2, y0: under - H, y1: under }
          : { x1: d1, x2: d2, z1: lo, z2: hi, y0: under - H, y1: under });
        for (const t of line) used.add(t.i);
      }
    }
  }
  cols.forEach((c, i) => columnTops.push({ x: c.x, z: c.z, top: used.has(i) ? c.h - H : c.h }));
  return { lintels, columnTops };
}

// ───────── 그림: 실내 벽의 빈 구간(창·키 큰 가구·계단·맞닿은 벽을 비켜) 눈높이에. 그림마다 위에 그림등 하나
function paintings(w: HouseWorld, open: Set<number>): { paintings: Painting[]; lights: PictureLight[] } {
  const out: Painting[] = [];
  const lights: PictureLight[] = [];
  const count: Record<Level, number> = { 1: 0, 2: 0 };
  const MAX: Record<Level, number> = { 1: 13, 2: 9 };
  for (const s of w.walls) {
    if (s.style === 'invisible' || s.style === 'stonewall' || s.height < 2.2) continue;
    const lv = lvOf(s.box.level);
    const base = baseOf(w, lv);
    if (Math.abs(s.baseY - base) > 0.05) continue; // 문 머리벽 등 바닥에서 떠 있는 벽
    const sides = interiorSides(w, s);
    const t = thickOf(s);
    for (const [a, b] of fullPieces(w, s)) {
      const len = b - a;
      if (len < 1.3) continue;
      for (const k of sides) {
        const face = lineOf(s) + k * (t / 2);
        const n = len >= 4.4 ? 2 : 1;
        const pw = Math.min(lv === 2 ? 0.8 : 1.1, (len - 0.5) / n - 0.25);
        if (pw < 0.55) continue;
        const ph = lv === 2 ? Math.min(pw * 1.3, s.height - 0.9) : pw * 0.72;
        for (let i = 0; i < n; i++) {
          if (count[lv] >= MAX[lv]) break;
          const u = a + (len * (i + 1)) / (n + 1);
          const [fx, fz] = at(s.axis, u, face + k * 0.45);
          if (!openAt(w, open, lv, fx, fz)) continue;
          // 그림 앞(벽 면에서 0.7m)에 키 큰 가구가 있으면 걸지 않는다
          const front: Rect = s.axis === 'x'
            ? { x1: u - pw / 2 - 0.15, x2: u + pw / 2 + 0.15, z1: Math.min(face, face + k * 0.7), z2: Math.max(face, face + k * 0.7) }
            : { x1: Math.min(face, face + k * 0.7), x2: Math.max(face, face + k * 0.7), z1: u - pw / 2 - 0.15, z2: u + pw / 2 + 0.15 };
          if (w.furniture.some((f) => f.level === lv && TALL.has(f.kind) && overlaps(f, front))) continue;
          // 그림 바로 앞에 맞닿은 다른 벽(T자로 붙은 벽), 문짝이 있으면 비킨다
          const skin: Rect = s.axis === 'x'
            ? { x1: u - pw / 2 - 0.1, x2: u + pw / 2 + 0.1, z1: Math.min(face, face + k * 0.15), z2: Math.max(face, face + k * 0.15) }
            : { x1: Math.min(face, face + k * 0.15), x2: Math.max(face, face + k * 0.15), z1: u - pw / 2 - 0.1, z2: u + pw / 2 + 0.1 };
          if (solidWalls(w, lv).some((o) => o !== s && overlaps(o.box, skin))) continue;
          if (w.doors.some((d) => lvOf(d.box.level) === lv && overlaps(d.box, skin))) continue;
          // 계단 옆 벽은 오르내리는 눈높이가 달라 건너뛴다
          const stair: Rect = { x1: front.x1 - 0.3, x2: front.x2 + 0.3, z1: front.z1 - 0.3, z2: front.z2 + 0.3 };
          if (w.physics.ramps.some((r) => Math.abs(r.y1 - r.y0) > 0.01 && overlaps(r, stair))) continue;
          // 같은 면 줄에 이미 건 그림과 너무 가깝지 않게
          const [px, pz] = at(s.axis, u, face + k * 0.012);
          const yaw = yawOf(s.axis, k);
          if (out.some((p) => p.level === lv && Math.abs(p.yaw - yaw) < 0.01 && Math.hypot(p.x - px, p.z - pz) < pw + 0.5)) continue;
          const art = lv === 2 ? 4 + (count[2] % 4) : count[1] % 4;
          const y = base + Math.min(DECOR_SIZE.paintingY, s.height - 0.25 - ph / 2);
          out.push({ level: lv, x: px, y, z: pz, w: pw, h: ph, yaw, art });
          // 그림등: 그림 위 끝 조금 위 벽 면(벽 꼭대기 몰딩 밑까지만)
          const [lx, lz] = at(s.axis, u, face);
          const ly = Math.min(y + ph / 2 + DECOR_SIZE.lightAbove, base + s.height - 0.16 - DECOR_SIZE.lightPlate / 2);
          lights.push({ level: lv, x: lx, y: ly, z: lz, w: Math.min(0.62, Math.max(0.28, pw * 0.55)), reach: DECOR_SIZE.lightReach, yaw, finish: lv === 2 ? 'silver' : 'brass' });
          count[lv]++;
        }
      }
    }
  }
  // 사진 갤러리 방 쪽을 보는 그림은 뺀다(그 방의 벽은 갤러리 액자 몫). 다 고른 뒤에 빼서 다른 방의 그림 자리·그림 번호는 그대로 둔다
  const keep = out.map((p) => !galleryAt(w, p.level, p.x + Math.sin(p.yaw) * 0.45, p.z + Math.cos(p.yaw) * 0.45));
  return { paintings: out.filter((_, i) => keep[i]), lights: lights.filter((_, i) => keep[i]) };
}

// ───────── 화분: 방 모서리(두 벽이 1m 넘게 막혀 있는 구석). 가구·계단·살피기 자리·문을 비킨다
function plants(w: HouseWorld, open: Set<number>): Plant[] {
  const out: Plant[] = [];
  const perLevel: Record<Level, number> = { 1: 0, 2: 0 };
  const MAX: Record<Level, number> = { 1: 5, 2: 4 };
  const inset = DECOR_SIZE.plantFromWall;
  const spots = [
    ...w.hotspots.map((h) => ({ level: h.level, x: h.x, z: h.z })),
    ...(w.portals ?? []).map((p) => ({ level: p.level, x: p.x, z: p.z })),
  ];
  const floors = w.floors.filter((f) => f.mat !== 'lawn' && f.mat !== 'porch' && f.x2 - f.x1 >= 1.6 && f.z2 - f.z1 >= 1.6);
  for (const f of floors) {
    const lv = f.level;
    for (const [px, pz, dx, dz] of [[f.x1, f.z1, 1, 1], [f.x2, f.z1, -1, 1], [f.x1, f.z2, 1, -1], [f.x2, f.z2, -1, -1]] as const) {
      if (perLevel[lv] >= MAX[lv]) break;
      // 두 변 모두 모서리에서 1m까지 벽이 막혀 있어야 구석이다(문·통로 옆은 아니다)
      // 바닥 판 가장자리 선 위를 짚는다(벽이 그 선을 가운데로 서든, 안쪽 면을 그 선에 대든 잡힌다)
      const wallX = [0.25, 0.6, 1.0].every((d) => inWall(w, lv, px + dx * d, pz, 0.06));
      const wallZ = [0.25, 0.6, 1.0].every((d) => inWall(w, lv, px, pz + dz * d, 0.06));
      if (!wallX || !wallZ) continue;
      const x = px + dx * inset, z = pz + dz * inset;
      if (!openAt(w, open, lv, x, z)) continue;
      if (w.furniture.some((g) => g.level === lv && !FLAT.has(g.kind) && inRect(g, x, z, 0.35))) continue;
      if (w.physics.ramps.some((r) => inRect(r, x, z, 0.6))) continue;
      if (w.physics.boxes.some((b) => (b.level === lv || b.level === 0) && inRect(b, x, z, 0.12))) continue;
      if (spots.some((s) => s.level === lv && Math.hypot(s.x - x, s.z - z) < 0.9)) continue;
      if (w.doors.some((d) => lvOf(d.box.level) === lv && inRect(d.box, x, z, 0.7))) continue;
      if (out.some((p) => p.level === lv && Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
      const seed = out.length * 7 + perLevel[lv];
      out.push({ level: lv, x, z, kind: lv === 1 ? 'tall' : perLevel[2] % 2 ? 'jar' : 'orchid', seed });
      perLevel[lv]++;
    }
  }
  // 사진 갤러리 방의 모서리 화분은 뺀다(모서리 옆 액자를 잎이 가리지 않게). 다 고른 뒤에 빼서 다른 방의 화분은 그대로 둔다
  return out.filter((p) => !galleryAt(w, p.level, p.x, p.z));
}

// ───────── 커튼: 1층 창은 양옆에 바닥까지 늘어진 천, 2층 창은 위쪽에 반쯤 내린 대나무 발
// (사진 갤러리 배치도 이 계산으로 커튼 자리를 비켜 간다: gallery.ts)
export function planCurtains(w: HouseWorld): { curtains: Curtain[]; rods: Rod[] } {
  const out: Curtain[] = [];
  const rods: Rod[] = [];
  const { drapeW, drapeGap } = DECOR_SIZE;
  for (const v of w.windows) {
    const host = w.walls.find((s) => s.style !== 'invisible' && lvOf(s.box.level) === v.level && s.axis === v.axis
      && Math.abs(v.at - lineOf(s)) <= thickOf(s) / 2 + 0.06 && v.to > spanOf(s)[0] && v.from < spanOf(s)[1]);
    if (!host) continue;
    const lv = v.level;
    const base = baseOf(w, lv);
    const [s0, s1] = spanOf(host);
    const from = Math.max(v.from, s0), to = Math.min(v.to, s1);
    if (to - from < 0.5) continue;
    const t = thickOf(host);
    // 창 앞에 창살·커튼 같은 것이 이미 서 있으면 그대로 둔다
    const sill: Rect = host.axis === 'x'
      ? { x1: from, x2: to, z1: lineOf(host) - t / 2 - 0.4, z2: lineOf(host) + t / 2 + 0.4 }
      : { x1: lineOf(host) - t / 2 - 0.4, x2: lineOf(host) + t / 2 + 0.4, z1: from, z2: to };
    if (w.furniture.some((f) => f.level === lv && (f.kind === 'lattice' || f.kind === 'sheerCurtain' || f.kind === 'windowSeat') && overlaps(f, sill))) continue;
    const top = Math.min(v.top, host.height);
    for (const k of interiorSides(w, host)) {
      const face = lineOf(host) + k * (t / 2);
      const off = face + k * drapeGap;
      if (lv === 2) {
        // 대나무 발: 창 폭 그대로, 창 높이의 3할쯤 내려 둔다
        const [x, z] = at(host.axis, (from + to) / 2, face + k * 0.07);
        const y1 = base + top + 0.04;
        out.push({ level: lv, x, z, y0: y1 - Math.max(0.3, (top - v.sill) * 0.3), y1, w: to - from + 0.08, yaw: yawOf(host.axis, k), kind: 'blind' });
        continue;
      }
      const y1 = base + Math.min(top + 0.2, host.height - 0.08);
      let lo = Infinity, hi = -Infinity;
      for (const e of [-1, 1] as const) {
        const edge = e < 0 ? from : to;
        // 창 끝 밖으로 벽이 이어지면 천을 벽 쪽에 걸고, 바로 옆이 꺾인 벽이면 창 안쪽으로 들인다
        const beyond = edge + e * (drapeW - 0.12);
        const [bx, bz] = at(host.axis, beyond, face + k * 0.1);
        const blocked = beyond < s0 || beyond > s1 || inWall(w, lv, bx, bz, 0) || !indoorAt(w, lv, ...at(host.axis, beyond, face + k * 0.3));
        const u = blocked ? edge - e * (drapeW / 2) : edge + e * (drapeW / 2 - 0.12);
        const [x, z] = at(host.axis, u, off);
        out.push({ level: lv, x, z, y0: base + 0.03, y1: y1 - 0.04, w: drapeW, yaw: yawOf(host.axis, k), kind: 'drape' });
        lo = Math.min(lo, u - drapeW / 2 - 0.06);
        hi = Math.max(hi, u + drapeW / 2 + 0.06);
      }
      rods.push({ level: lv, axis: host.axis, line: off, a: lo, b: hi, y: y1 });
    }
  }
  return { curtains: out, rods };
}

// ───────── 깔개: 좌식 상 밑 화문석, 깔개 없는 넓은 방·복도에 러너(1층)·화문석(2층), 포치에서 집으로 드는 문 앞 매트
function rugs(w: HouseWorld, open: Set<number>): Rug[] {
  const out: Rug[] = [];
  for (const t of w.furniture.filter((f) => f.kind === 'lowTable')) {
    if (w.furniture.some((f) => f.level === t.level && (f.kind === 'rug' || f.kind === 'roundRug') && overlaps(f, t))) continue;
    const near = w.furniture.filter((f) => f.level === t.level && f.kind === 'cushion' && Math.hypot(cx(f) - cx(t), cz(f) - cz(t)) < 1.4);
    const r: Rect = { ...t };
    for (const c of near) { r.x1 = Math.min(r.x1, c.x1); r.x2 = Math.max(r.x2, c.x2); r.z1 = Math.min(r.z1, c.z1); r.z2 = Math.max(r.z2, c.z2); }
    out.push({ level: t.level, x: cx(r), z: cz(r), w: r.x2 - r.x1 + 0.4, d: r.z2 - r.z1 + 0.4, yaw: 0, kind: 0 });
  }
  // 걸어 들어가는 넓은 바닥(8㎡ 넘고 짧은 변 1.8m 넘게) 가운데 깔개가 없고 계단이 닿지 않는 곳: 긴 쪽으로 깐다
  w.floors.forEach((f, i) => {
    if (!open.has(i) || f.mat === 'lawn' || f.mat === 'porch' || f.mat === 'tile') return;
    const fw = f.x2 - f.x1, fd = f.z2 - f.z1;
    if (Math.min(fw, fd) < 1.8 || fw * fd < 8) return;
    const pad: Rect = { x1: f.x1 - 0.5, x2: f.x2 + 0.5, z1: f.z1 - 0.5, z2: f.z2 + 0.5 };
    if (w.physics.ramps.some((r) => overlaps(r, pad))) return;
    if (w.furniture.some((g) => g.level === f.level && (g.kind === 'rug' || g.kind === 'roundRug' || g.kind === 'playMat' || g.kind === 'lowTable') && overlaps(g, f))) return;
    if (out.some((r) => r.level === f.level && inRect(f, r.x, r.z))) return;
    const alongX = fw >= fd;
    const short = alongX ? fd : fw, long = alongX ? fw : fd;
    const rw = Math.min(short - 1.0, f.level === 1 ? 1.2 : 1.8), rl = Math.min(long - 1.4, 4.0);
    if (rw < 0.8 || rl < 1.6) return;
    out.push({ level: f.level, x: cx(f), z: cz(f), w: alongX ? rl : rw, d: alongX ? rw : rl, yaw: 0, kind: f.level === 1 ? 1 : 0 });
  });
  // 포치 바닥 가장자리 가운데 실내로 이어진 구간(벽이 비어 있고 바로 안이 실내)마다 매트
  for (const p of w.floors.filter((f) => f.level === 1 && f.mat === 'porch')) {
    const edges = [
      { axis: 'x' as const, at: p.z1, a: p.x1, b: p.x2, n: -1 as Side },
      { axis: 'x' as const, at: p.z2, a: p.x1, b: p.x2, n: 1 as Side },
      { axis: 'z' as const, at: p.x1, a: p.z1, b: p.z2, n: -1 as Side },
      { axis: 'z' as const, at: p.x2, a: p.z1, b: p.z2, n: 1 as Side },
    ];
    for (const e of edges) {
      let run: number[] = [];
      const flush = () => {
        if (run.length * 0.1 >= 0.7) {
          const mid = (run[0] + run[run.length - 1]) / 2;
          const len = Math.min(1.5, run.length * 0.1 * 0.75);
          const [x, z] = at(e.axis, mid, e.at - e.n * 0.5);
          out.push({ level: 1, x, z, w: e.axis === 'x' ? len : 0.7, d: e.axis === 'x' ? 0.7 : len, yaw: 0, kind: 2 });
        }
        run = [];
      };
      for (let u = e.a + 0.05; u < e.b; u += 0.1) {
        const [ox, oz] = at(e.axis, u, e.at);
        const [ix, iz] = at(e.axis, u, e.at + e.n * 0.4);
        const open = !inWall(w, 1, ox, oz, 0.02) && !w.doors.some((d) => d.closed && inRect(d.box, ox, oz, 0.02)) && indoorAt(w, 1, ix, iz);
        if (open) run.push(u); else flush();
      }
      flush();
    }
  }
  return out;
}

// ───────── 처마: 지붕판 가장자리에 선 바깥벽 꼭대기에 바깥으로 내민 기와 띠(박공 지붕 밑은 박공이 한다)
function eaves(w: HouseWorld): Eave[] {
  const roofs = w.props.filter((p): p is Extract<Prop, { type: 'slab' }> => p.type === 'slab' && p.part === 'roof');
  const gables = w.props.filter((p): p is Extract<Prop, { type: 'gable' }> => p.type === 'gable');
  const raw: Eave[] = [];
  for (const s of w.walls) {
    if (s.style !== 'ext' || s.height < 2) continue;
    const lv = lvOf(s.box.level);
    const top = s.baseY + s.height;
    const t = thickOf(s);
    const [a, b] = spanOf(s);
    const inside = interiorSides(w, s);
    for (const k of [-1, 1] as Side[]) {
      if (inside.includes(k)) continue;
      // 바깥쪽이 실내(꺾인 집의 안쪽)면 처마를 내지 않는다
      const [ox, oz] = at(s.axis, (a + b) / 2, lineOf(s) + k * (t / 2 + 0.4));
      if (indoorAt(w, lv, ox, oz) || indoorAt(w, 2, ox, oz)) continue;
      // 바깥이 다른 지붕판·포치 지붕 밑이거나 위층 바닥 밑이면(처마가 지붕판에 박힌다) 내지 않는다
      // 바깥이 위층 바닥(테라스 포함) 위나 밑이어도 내지 않는다(걷는 사람 머리 위·발밑에 처마가 걸린다)
      const sheltered = shelteredAt(w, ox, oz, top) || w.floors.some((f) => f.level === 2 && inRect(f, ox, oz));
      if (sheltered) continue;
      const [ix, iz] = at(s.axis, (a + b) / 2, lineOf(s) - k * (t / 2 + 0.3));
      const covered = roofs.some((r) => inRect(r, ix, iz) && r.y - r.t / 2 > top - 0.3 && r.y - r.t / 2 < top + 0.35);
      if (!covered || gables.some((g) => inRect(g, ix, iz))) continue;
      raw.push({ axis: s.axis, line: lineOf(s) + k * (t / 2), a, b, y: top, s: k });
    }
  }
  // 같은 줄에 겹치거나 이어진 처마는 하나로(겹쳐 그리면 깜빡인다)
  const merged: Eave[] = [];
  for (const e of raw.sort((p, q) => p.a - q.a)) {
    const m = merged.find((o) => o.axis === e.axis && o.s === e.s && Math.abs(o.line - e.line) < 0.15 && Math.abs(o.y - e.y) < 0.3 && e.a <= o.b + 0.05 && e.b >= o.a - 0.05);
    if (m) {
      m.a = Math.min(m.a, e.a); m.b = Math.max(m.b, e.b); m.y = Math.max(m.y, e.y);
      m.line = e.s > 0 ? Math.max(m.line, e.line) : Math.min(m.line, e.line);
    } else merged.push({ ...e });
  }
  // 짧은 토막 벽의 처마는 허공에 뜬 판처럼 보여 내지 않는다(위층 1m, 아래층은 현관 둘레 구석이 어지럽지 않게 2m)
  const kept = merged.filter((e) => e.b - e.a >= (e.y > w.floor2 + 1 ? 1.0 : 2.0));
  // 바깥 모서리에서는 처마 끝을 내민 만큼 늘여 옆 처마와 만나게 한다(안쪽 모서리는 벽에 막혀, 지붕판·포치 밑은 판에 박혀 늘이지 않는다)
  const out = DECOR_SIZE.eaveOut;
  for (const e of kept) {
    for (const end of [-1, 1] as const) {
      const u = end < 0 ? e.a : e.b;
      const lv: Level = e.y > w.floor2 + 1 ? 2 : 1;
      const clear = [0.15, 0.3, 0.5].every((d) => {
        const [px, pz] = at(e.axis, u + end * d, e.line + e.s * 0.3);
        return !inWall(w, lv, px, pz, 0) && !indoorAt(w, lv, px, pz) && !shelteredAt(w, px, pz, e.y) && !w.floors.some((f) => f.level === 2 && inRect(f, px, pz));
      });
      if (clear) {
        if (end < 0) e.a -= out; else e.b += out;
      }
    }
  }
  return kept;
}

/** (x, z) 바로 위나 조금 위에 다른 지붕판·포치 지붕판이 덮여 있는가(높이 y 기준) */
function shelteredAt(w: HouseWorld, x: number, z: number, y: number) {
  return w.props.some((p) => p.type === 'slab' && inRect(p, x, z) && p.y - p.t / 2 > y - 0.6 && p.y - p.t / 2 < y + 1.2);
}

// ───────── 포치 등: 기둥 사이마다(가운데부터 하나 건너) 포치 천장에 매단다
function lanterns(w: HouseWorld): Lantern[] {
  const out: Lantern[] = [];
  const slabs = w.props.filter((p): p is Extract<Prop, { type: 'slab' }> => p.type === 'slab' && p.part === 'porch');
  const cols = w.props.filter((p): p is Extract<Prop, { type: 'column' }> => p.type === 'column');
  for (const s of slabs) {
    const under = s.y - s.t / 2;
    const mine = cols.filter((c) => inRect(s, c.x, c.z));
    if (mine.length < 2) continue;
    const alongX = Math.max(...mine.map((c) => c.x)) - Math.min(...mine.map((c) => c.x)) >= Math.max(...mine.map((c) => c.z)) - Math.min(...mine.map((c) => c.z));
    const sorted = [...mine].sort((p, q) => (alongX ? p.x - q.x : p.z - q.z));
    // 기둥 줄과 집 사이(지붕판 안쪽 가장자리와 기둥 줄의 가운데)
    const colLine = mine.reduce((sum, c) => sum + (alongX ? c.z : c.x), 0) / mine.length;
    const [e1, e2] = alongX ? [s.z1, s.z2] : [s.x1, s.x2];
    const inner = Math.abs(colLine - e1) > Math.abs(colLine - e2) ? e1 : e2;
    const mid = (colLine + inner) / 2;
    for (let i = 0; i + 1 < sorted.length; i++) {
      const u = alongX ? (sorted[i].x + sorted[i + 1].x) / 2 : (sorted[i].z + sorted[i + 1].z) / 2;
      const [x, z] = alongX ? [u, mid] : [mid, u];
      if (w.furniture.some((f) => f.kind === 'hyeonpan' && Math.abs(cx(f) - x) < 0.9 && Math.abs(cz(f) - z) < 1.6)) continue;
      out.push({ x, z, top: under });
    }
  }
  return out;
}

// ───────── 마당: 앞 담 안쪽 화단, 옆 담 위 나무 울타리
function yard(w: HouseWorld): { beds: Bed[]; fences: Fence[] } {
  const beds: Bed[] = [];
  const fences: Fence[] = [];
  const lawn = w.floors.filter((f) => f.level === 1 && f.mat === 'lawn');
  if (!lawn.length) return { beds, fences };
  const L: Rect = { x1: Math.min(...lawn.map((f) => f.x1)), x2: Math.max(...lawn.map((f) => f.x2)), z1: Math.min(...lawn.map((f) => f.z1)), z2: Math.max(...lawn.map((f) => f.z2)) };
  const houseZ = cz(w.house);
  const stones = w.walls.filter((s) => s.style === 'stonewall');
  // 옆 담(앞뒤로 뻗은 담): 담 위에 기둥과 가로대 둘
  for (const s of stones.filter((s) => s.axis === 'z')) {
    const [a, b] = spanOf(s);
    if (b - a > 2) fences.push({ axis: 'z', line: lineOf(s), a, b, y: s.baseY + s.height });
  }
  // 앞 담: 집에서 가장 먼 가로 담. 그 안쪽 0.55m 띠에 화단(길·놓인 것·처음 서는 자리를 비운다)
  const front = stones.filter((s) => s.axis === 'x' && Math.abs(lineOf(s) - houseZ) > Math.abs(L.z2 - houseZ) - 1 && inRect({ ...L, z1: L.z1 - 1, z2: L.z2 + 1 }, (s.box.x1 + s.box.x2) / 2, lineOf(s)));
  for (const s of front) {
    const inward = Math.sign(houseZ - lineOf(s)) || -1;
    const z0 = lineOf(s) + inward * (thickOf(s) / 2 + 0.05), z1 = z0 + inward * 0.55;
    const [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
    const [a, b] = spanOf(s);
    const busy = (x0: number, x1: number) => {
      const r: Rect = { x1: x0, x2: x1, z1: za, z2: zb };
      return w.furniture.some((f) => f.level === 1 && f.kind !== 'shrub' && overlaps(f, { ...r, x1: r.x1 - 0.3, x2: r.x2 + 0.3, z1: r.z1 - 0.3, z2: r.z2 + 0.3 }))
        || Math.hypot((x0 + x1) / 2 - w.spawn.x, (za + zb) / 2 - w.spawn.z) < 1.0 + (x1 - x0) / 2
        || w.hotspots.some((h) => h.level === 1 && inRect(r, h.x, h.z, h.r * 0.5));
    };
    let start: number | null = null;
    for (let x = a + 0.3; x <= b - 0.3 + 1e-6; x += 0.25) {
      const free = !busy(x - 0.125, x + 0.125);
      if (free && start === null) start = x;
      if ((!free || x + 0.25 > b - 0.3) && start !== null) {
        const end = free ? x + 0.125 : x - 0.25 + 0.125;
        if (end - (start - 0.125) >= 0.9) beds.push({ x1: start - 0.125, x2: end, z1: za, z2: zb });
        start = null;
      }
    }
  }
  return { beds, fences };
}

// ───────── 테라스(위층의 바깥 바닥) 앞 모서리 꽃 상자: 집에서 먼 쪽 두 구석
function planters(w: HouseWorld): Planter[] {
  const out: Planter[] = [];
  const hx = cx(w.house), hz = cz(w.house);
  for (const f of w.floors.filter((g) => g.level === 2 && g.mat === 'porch')) {
    if (f.x2 - f.x1 < 2.4 || f.z2 - f.z1 < 2.4) continue;
    // 집 가운데에서 가장 먼 변 쪽 두 모서리
    const edges = [
      { d: Math.abs(f.z2 - hz), pts: [[f.x1, f.z2, 1, -1], [f.x2, f.z2, -1, -1]] },
      { d: Math.abs(f.z1 - hz), pts: [[f.x1, f.z1, 1, 1], [f.x2, f.z1, -1, 1]] },
      { d: Math.abs(f.x2 - hx), pts: [[f.x2, f.z1, -1, 1], [f.x2, f.z2, -1, -1]] },
      { d: Math.abs(f.x1 - hx), pts: [[f.x1, f.z1, 1, 1], [f.x1, f.z2, 1, -1]] },
    ].sort((p, q) => q.d - p.d)[0];
    for (const [px, pz, dx, dz] of edges.pts) {
      const x = px + dx * 0.5, z = pz + dz * 0.5;
      if (w.hotspots.some((h) => h.level === 2 && Math.hypot(h.x - x, h.z - z) < 1.0)) continue;
      out.push({ level: 2, x, z, seed: out.length * 13 + 3 });
    }
  }
  return out;
}

// ───────── 빛 웅덩이: 포치 등 밑 바닥, 벽등 뒤 벽(빛을 따로 두지 않고 더하기 섞기 판으로 따뜻하게)
function pools(w: HouseWorld, lamps: Lantern[]): Pool[] {
  const out: Pool[] = lamps.map((l) => ({ x: l.x, y: 0.014, z: l.z, size: 1.8, yaw: 0, up: true }));
  for (const f of w.furniture.filter((g) => g.kind === 'sconce')) {
    const dir = f.face === '-z' ? [0, -1] : f.face === '+x' ? [1, 0] : f.face === '-x' ? [-1, 0] : [0, 1];
    out.push({ x: cx(f) - dir[0] * 0.07, y: baseOf(w, f.level) + 2.04, z: cz(f) - dir[1] * 0.07, size: 1.5, yaw: Math.atan2(dir[0], dir[1]), up: false });
  }
  // 실내 등 밑 바닥(펜던트·스탠드·한지 등): 집 안이 낮에도 따뜻하게 보이게. 깔개 위에 얹히도록 바닥에서 조금 띄운다
  const LAMP: Partial<Record<Furniture['kind'], number>> = { pendant: 1.5, floorLamp: 1.3, hanjiPendant: 2.0, hanjiLantern: 1.0, globeLantern: 1.2 };
  for (const f of w.furniture) {
    const size = LAMP[f.kind];
    if (!size || !indoorAt(w, f.level, cx(f), cz(f))) continue;
    out.push({ x: cx(f), y: baseOf(w, f.level) + 0.017, z: cz(f), size, yaw: 0, up: true, indoor: f.level });
  }
  return out;
}

/** 집 하나의 장식 자리 전부. 같은 집이면 늘 같은 결과(난수 없음) */
export function planDecor(w: HouseWorld): DecorPlan {
  const { lintels, columnTops } = porch(w);
  const open = openFloors(w);
  const { curtains: cs, rods } = planCurtains(w);
  const { beds, fences } = yard(w);
  const lamps = lanterns(w);
  const art = paintings(w, open);
  return {
    lintels,
    columnTops,
    paintings: art.paintings,
    pictureLights: art.lights,
    plants: plants(w, open),
    curtains: cs,
    rods,
    rugs: rugs(w, open),
    eaves: eaves(w),
    lanterns: lamps,
    beds,
    fences,
    pools: pools(w, lamps),
    planters: planters(w),
  };
}
