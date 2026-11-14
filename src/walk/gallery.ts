// 부엌 사진 갤러리: 부엌 구역의 벽에서 창·문·통로·붙박이·커튼과 겹치지 않는 빈 구간을 찾아 액자 틀을 건다.
// three.js 없이 도는 순수 함수다(서버의 걷기 손질이 부르고, 시험에서 그대로 돈다). 같은 집 데이터면 늘 같은 결과다.
// 이 집의 치수·방 이름은 여기 적지 않는다: 어느 구역이 부엌인지는 집 데이터의 이름표에서, 벽·창·문은 집 데이터에서 찾는다.
// 아래 상수는 어느 집에나 쓰는 일반 배치 기준이다(미터).
import { planCurtains } from './decor';
import { tuneWorld } from './tune';
import type { Box, GalleryFrame, HouseWorld, Level, WallSpec, Zone } from './types';

/** 갤러리로 쓰는 방의 종류: 이름표에 부엌을 뜻하는 말이 든 구역(방 하나하나의 이름이 아니라 종류로 찾는다) */
export const GALLERY_ROOM = /주방|부엌|키친|kitchen/i;

export type FrameSize = GalleryFrame['size'];

export const GALLERY = {
  /** 틀 모양 셋: p 세로, m 가로, l 큰 가로(바깥 틀 폭 w, 높이 h) */
  sizes: { p: { w: 0.6, h: 0.8 }, m: { w: 0.8, h: 0.6 }, l: { w: 1.0, h: 0.75 } } as Record<FrameSize, { w: number; h: number }>,
  /** 액자 가운데 높이(바닥에서) */
  centerY: 1.5,
  /** 액자 위 끝과 천장·벽 꼭대기 사이 */
  topGap: 0.2,
  /** 액자 아래 끝의 하한(벽 아랫단 장식 띠 위) */
  minBottom: 0.95,
  /** 벽 모서리(맞닿은 벽 면)에서 */
  corner: 0.3,
  /** 창·문·통로·커튼 가장자리에서 */
  opening: 0.2,
  /** 액자 사이 틈의 하한·상한과 고를 때 기준 */
  gapMin: 0.25,
  gapMax: 0.4,
  gapAim: 0.4,
  /**
   * 한 구간에 몇 개를 걸지 고를 때 기준 폭(이 폭 + 기준 틈마다 하나). 큰 액자 한 장 폭이라, 넓힌 방에서도 작은 액자로 빽빽하게
   * 채우지 않고 큰 액자를 가운데에 두고 여유 있게 건다. 더 촘촘하게 걸려면 이 값과 gapAim을 줄인다
   */
  aimWidth: 1.0,
  /** 액자 두께(뒤판에서 앞으로). 뒤판은 벽 면에서 6mm 떨어져 걸린다 */
  depth: 0.04,
  /** 벽 면 앞 이만큼 안에 서 있는 가구·상자·벽 끝은 액자 자리를 막는다고 본다 */
  strip: 0.5,
  /** 구역 가장자리 선에서 이만큼 안에 선 벽을 그 변의 벽으로 본다 */
  sideTol: 0.35,
  /** 벽 면이 이만큼 넘게 달라지면(벽이 꺾여 나옴) 따로 본다 */
  stepTol: 0.015,
  /** 액자 앞에 섰다고 보는 거리(벽 면에서)와 옆으로 벗어나도 되는 여유 */
  reach: 1.9,
  side: 0.45,
  /** 액자를 보고 있다고 보는 각(보는 쪽과 벽 쪽이 이루는 코사인, 0.35 ≈ 70도 안) */
  facing: 0.35,
  /**
   * 「약한」 가까움(휴대폰 3인칭: 몸이 걸어온 쪽을 보므로 액자 앞에 서도 옆을 보고 있기 쉽다): 벽 면에서 이 거리 안이고 몸이 대략
   * 액자 쪽(앞쪽 반, 코사인 0 이상)을 볼 때. 크게 보기 단추와 E에만 잡히고 Enter 말하기·반려동물 부르기는 막지 않는다
   */
  looseReach: 1.0,
  looseFacing: 0,
} as const;

/** nearFrame의 거리·각(기본은 GALLERY.reach, GALLERY.facing) */
export type NearOptions = { reach?: number; facing?: number };
/** 약한 가까움의 거리·각 */
export const LOOSE_NEAR: NearOptions = { reach: GALLERY.looseReach, facing: GALLERY.looseFacing };

/**
 * 액자 id 모양: 층(같은 층에 갤러리 방이 여럿이면 .2, .3 …) - 벽(a~d) - 순번(예: 1-a-2). 벽 글자와 순번 사이를 띄워 둔다:
 * 붙이면 영문자 하나에 숫자 하나가 붙은 모양이 되어 화면 글 검사의 방 ID 규칙과 헷갈린다
 */
export const FRAME_ID = /^[12](?:\.[2-9])?-[a-d]-[1-9][0-9]?$/;

/**
 * 서버 환경 변수 KITCHEN_GALLERY → 걸지. 1·on·true·yes일 때만 건다. 없거나 다른 값이면 걸지 않는다: 켜는 순간 부엌의 장식 그림·화분이
 * 빠지고 빈 액자가 걸리므로, 저장소(0023)를 준비하고 집주인이 정한 뒤에 켠다
 */
export function galleryOn(v: string | undefined | null): boolean {
  return /^(1|on|true|yes)$/i.test(String(v ?? '').trim());
}

type Rect = { x1: number; x2: number; z1: number; z2: number };
type Axis = 'x' | 'z';
type Span = [number, number];

/**
 * 구역의 네 변. 위에서 내려다볼 때 -z 쪽 변부터 시계 방향으로 a, b, c, d.
 * axis는 그 변의 벽이 뻗은 축(벽을 따라가는 좌표), edge는 변의 자리(벽에 수직인 좌표), inward는 방 안쪽 방향(+1이면 좌표가 커지는 쪽),
 * dir은 시계 방향으로 돌 때 벽을 따라가는 방향(순번을 매기는 차례)
 */
const SIDES = [
  { side: 'a', axis: 'x', edge: (r: Rect) => r.z1, inward: 1, dir: 1 },
  { side: 'b', axis: 'z', edge: (r: Rect) => r.x2, inward: -1, dir: 1 },
  { side: 'c', axis: 'x', edge: (r: Rect) => r.z2, inward: -1, dir: -1 },
  { side: 'd', axis: 'z', edge: (r: Rect) => r.x1, inward: 1, dir: -1 },
] as const;

/** 벽을 따라가는 구간 */
const alongOf = (r: Rect, axis: Axis): Span => (axis === 'x' ? [r.x1, r.x2] : [r.z1, r.z2]);
/** 벽에 수직인 구간 */
const perpOf = (r: Rect, axis: Axis): Span => (axis === 'x' ? [r.z1, r.z2] : [r.x1, r.x2]);
const overlap = (a: Span, b: Span) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
const lvOf = (lv: 0 | 1 | 2): Level => (lv === 2 ? 2 : 1);
const onLevel = (lv: 0 | 1 | 2, want: Level) => lv === 0 || lv === want;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** 액자 앞을 막지 않는 가구(바닥에 깔리거나 천장에 매달린 것) */
const FLAT = new Set<string>(['rug', 'roundRug', 'playMat', 'lightPattern', 'aisle', 'path', 'pendant', 'hanjiPendant', 'ridgeBeam', 'slopedCeiling', 'bunting', 'sentenceLine', 'stripeWall']);
/** 충돌 상자 가운데 벽·문 목록이 이미 말해 주는 것 */
const STRUCTURE = new Set<string>(['wall', 'door', 'header', 'invisible', 'stonewall', 'parapet']);

/** 갤러리로 쓰는 구역(층, 그다음 위치 순서로 늘 같은 차례) */
export function galleryRooms(w: HouseWorld): Zone[] {
  return w.zones
    .filter((z) => GALLERY_ROOM.test(z.name) && z.x2 - z.x1 > 1 && z.z2 - z.z1 > 1)
    .sort((p, q) => p.level - q.level || p.z1 - q.z1 || p.x1 - q.x1 || p.name.localeCompare(q.name));
}

/** 그 층 바닥 높이 */
const baseOf = (w: HouseWorld, lv: Level) => (lv === 2 ? w.floor2 : 0);

/** 구역 위 가장 낮은 천장(바닥에서 잰 높이). 없으면 Infinity */
function ceilingOver(w: HouseWorld, z: Zone): number {
  const list = w.ceilings.filter((c) => c.level === z.level && c.x2 > z.x1 && c.x1 < z.x2 && c.z2 > z.z1 && c.z1 < z.z2);
  return list.length ? Math.min(...list.map((c) => c.y)) - baseOf(w, z.level) : Infinity;
}

/** 구간 목록에서 막힌 구간들을 뺀다 */
function subtract(free: Span[], blocked: Span[]): Span[] {
  let out = free;
  for (const [b0, b1] of blocked) {
    out = out.flatMap(([a, b]) => {
      if (b1 <= a || b0 >= b) return [[a, b] as Span];
      const keep: Span[] = [];
      if (b0 > a) keep.push([a, b0]);
      if (b1 < b) keep.push([b1, b]);
      return keep;
    });
  }
  return out;
}

/** 크기 차례(작은 것부터) */
const LADDER: FrameSize[] = ['p', 'm', 'l'];
const widthOf = (s: FrameSize) => GALLERY.sizes[s].w;
const total = (sizes: FrameSize[], gap: number) => sizes.reduce((n, s) => n + widthOf(s), 0) + Math.max(0, sizes.length - 1) * gap;

/** n개의 기본 모양: 양 끝에서 세어 짝수 자리는 세로, 홀수 자리는 가로, 홀수 개면 가운데는 큰 가로(한 줄이 좌우로 같다) */
function pattern(n: number): FrameSize[] {
  if (n === 1) return ['l'];
  if (n === 2) return ['m', 'm'];
  return Array.from({ length: n }, (_, i) => {
    if (n % 2 === 1 && i === (n - 1) / 2) return 'l';
    return Math.min(i, n - 1 - i) % 2 === 0 ? 'p' : 'm';
  });
}

/** 바깥 짝부터 한 칸 줄인다(좌우 같게). 줄일 것이 없으면 false */
function shrink(sizes: FrameSize[]): boolean {
  const n = sizes.length;
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    const j = n - 1 - i;
    const k = LADDER.indexOf(sizes[i]);
    if (k <= 0) continue;
    sizes[i] = sizes[j] = LADDER[k - 1];
    return true;
  }
  return false;
}

/**
 * 가운데부터 한 칸 키운다(좌우 같게). 셋 넘게 건 줄은 양 끝 세로 액자를 그대로 둔다(가로·세로가 섞이게).
 * 키우면 넘치거나 키울 것이 없으면 false
 */
function grow(sizes: FrameSize[], room: number): boolean {
  const n = sizes.length;
  for (let i = Math.floor((n - 1) / 2); i >= (n >= 3 ? 1 : 0); i--) {
    const j = n - 1 - i;
    const k = LADDER.indexOf(sizes[i]);
    if (k >= LADDER.length - 1) continue;
    const next = sizes.slice();
    next[i] = next[j] = LADDER[k + 1];
    if (total(next, GALLERY.gapMin) > room + 1e-9) continue;
    sizes[i] = next[i];
    sizes[j] = next[j];
    return true;
  }
  return false;
}

/**
 * 길이 room인 빈 구간에 걸 액자 모양들. 기준 폭과 기준 틈으로 개수를 고르고(넘치면 줄인다), 틈이 상한을 넘을 만큼 남으면
 * 가운데부터 키운다. 들어가지 않으면 빈 목록
 */
export function fillRun(room: number): FrameSize[] {
  const { gapMin, gapMax, gapAim, aimWidth } = GALLERY;
  const most = Math.floor((room + gapMin) / (widthOf('p') + gapMin) + 1e-9);
  if (most < 1) return [];
  let n = Math.min(most, Math.max(1, Math.round((room + gapAim) / (aimWidth + gapAim))));
  for (; n >= 1; n--) {
    const sizes = pattern(n);
    while (total(sizes, gapMin) > room + 1e-9 && shrink(sizes)) { /* 줄인다 */ }
    if (total(sizes, gapMin) > room + 1e-9) continue;
    while (room - total(sizes, gapMax) > 1e-9 && grow(sizes, room)) { /* 키운다 */ }
    return sizes;
  }
  return [];
}

/** 빈 구간 [a, b]에 모양들을 늘어놓은 가운데 자리들(틈은 하한~상한, 남는 것은 양 끝에 나눠 무리를 가운데에) */
export function placeRun(a: number, b: number, sizes: FrameSize[]): number[] {
  const room = b - a;
  const sum = sizes.reduce((n, s) => n + widthOf(s), 0);
  const gap = sizes.length > 1 ? Math.min(GALLERY.gapMax, Math.max(GALLERY.gapMin, (room - sum) / (sizes.length - 1))) : 0;
  let u = a + (room - (sum + gap * (sizes.length - 1))) / 2;
  return sizes.map((s) => {
    const c = u + widthOf(s) / 2;
    u += widthOf(s) + gap;
    return c;
  });
}

type Run = { a: number; b: number; face: number; top: number; startGap: number; endGap: number };

/** 한 변의 벽 면들: 벽이 이어진 구간마다 방 쪽 면 자리와 벽 높이. 낮은 벽(난간 등)은 벽으로 치지 않는다 */
function runsOf(w: HouseWorld, z: Zone, s: (typeof SIDES)[number], minTop: number): Run[] {
  const base = baseOf(w, z.level);
  const edge = s.edge(z);
  const [from, to] = alongOf(z, s.axis);
  const band: Span = [edge - GALLERY.sideTol, edge + GALLERY.sideTol];
  const walls = w.walls.filter((q) => q.style !== 'invisible' && q.style !== 'stonewall' && q.axis === s.axis && onLevel(q.box.level, z.level)
    && Math.abs(q.baseY - base) < 0.05 && q.height >= minTop && overlap(perpOf(q.box, s.axis), band) > 0.01 && overlap(alongOf(q.box, s.axis), [from, to]) > 0.01);
  if (!walls.length) return [];
  const faceOf = (q: WallSpec) => (s.inward > 0 ? perpOf(q.box, s.axis)[1] : perpOf(q.box, s.axis)[0]);
  const cuts = [...new Set([from, to, ...walls.flatMap((q) => alongOf(q.box, s.axis)).filter((u) => u > from && u < to)])].sort((p, q) => p - q);
  const pieces: Array<{ a: number; b: number; face: number; top: number } | null> = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 1e-6) continue;
    const m = (a + b) / 2;
    const here = walls.filter((q) => { const [u0, u1] = alongOf(q.box, s.axis); return u0 <= m && u1 >= m; });
    if (!here.length) { pieces.push(null); continue; }
    // 겹쳐 선 벽이 여럿이면 방 쪽으로 가장 나온 면이 액자를 거는 면이다
    const inner = here.reduce((p, q) => (s.inward * (faceOf(q) - faceOf(p)) > 0 ? q : p));
    pieces.push({ a, b, face: faceOf(inner), top: inner.height });
  }
  const runs: Run[] = [];
  let prev: Run | null = null;
  pieces.forEach((p, i) => {
    if (!p) { prev = null; return; }
    const atStart = i === 0, before = pieces[i - 1];
    if (prev && Math.abs(prev.face - p.face) <= GALLERY.stepTol && prev.b >= p.a - 1e-6) {
      prev.b = p.b;
      prev.top = Math.min(prev.top, p.top);
      return;
    }
    // 앞 조각과 면이 다르면(꺾여 나온 벽) 모서리로 보고, 앞이 비었으면(문·통로) 통로 가장자리로 본다
    const startGap = atStart || before ? GALLERY.corner : GALLERY.opening;
    if (prev) prev.endGap = GALLERY.corner;
    prev = { a: p.a, b: p.b, face: p.face, top: p.top, startGap, endGap: GALLERY.opening };
    runs.push(prev);
  });
  // 변의 끝까지 이어진 구간의 끝은 모서리
  for (const r of runs) if (Math.abs(r.b - to) < 1e-6) r.endGap = GALLERY.corner;
  return runs;
}

/** 벽 면 앞 띠(방 쪽으로 strip까지)를 막는 것들의 벽 따라 구간 */
function blockersOf(w: HouseWorld, tuned: HouseWorld, curtains: ReturnType<typeof planCurtains>, z: Zone, s: (typeof SIDES)[number], run: Run, band: Span): Span[] {
  const lv = z.level;
  const base = baseOf(w, lv);
  const front: Span = s.inward > 0 ? [run.face + 0.002, run.face + GALLERY.strip] : [run.face - GALLERY.strip, run.face - 0.002];
  const span: Span = [run.a - 1, run.b + 1];
  const intrudes = (r: Rect) => overlap(perpOf(r, s.axis), front) > 0.005 && overlap(alongOf(r, s.axis), span) > 0;
  const out: Span[] = [];
  const add = (r: Rect, pad: number) => { const [a, b] = alongOf(r, s.axis); out.push([a - pad, b + pad]); };
  // 벽: 맞닿은 벽(모서리, T자로 붙은 벽)과 면 앞에 선 벽. 액자 높이에 닿지 않는 낮은 벽(난간)은 막지 않는다
  for (const q of w.walls) {
    if (q.style === 'invisible' || !onLevel(q.box.level, lv) || !intrudes(q.box)) continue;
    const top = q.baseY + q.height - base, bottom = q.baseY - base;
    if (top <= band[0] + 0.02 || bottom >= band[1]) continue;
    add(q.box, q.axis === s.axis ? GALLERY.opening : GALLERY.corner);
  }
  // 문 위 머리벽이 걸린 통로 끝, 닫힌 문
  for (const d of w.doors) if (onLevel(d.box.level, lv) && intrudes(d.box)) add(d.box, GALLERY.opening);
  // 창: 이 벽 면에 난 창(창턱·창 위가 액자 높이에 걸치면)
  for (const v of w.windows) {
    if (v.level !== lv || v.axis !== s.axis || Math.abs(v.at - run.face) > GALLERY.sideTol) continue;
    if (v.top <= band[0] || v.sill >= band[1]) continue;
    out.push([v.from - GALLERY.opening, v.to + GALLERY.opening]);
  }
  // 커튼: 창 둘레에 늘어뜨린 천과 봉, 창 위 발(장식 계획과 같은 계산)
  for (const r of curtains.rods) {
    if (r.level !== lv || r.axis !== s.axis || Math.abs(r.line - run.face) > GALLERY.strip) continue;
    out.push([r.a - GALLERY.opening / 2, r.b + GALLERY.opening / 2]);
  }
  for (const c of curtains.curtains) {
    if (c.level !== lv) continue;
    const [u, v] = s.axis === 'x' ? [c.x, c.z] : [c.z, c.x];
    if (Math.abs(v - run.face) > GALLERY.strip) continue;
    out.push([u - c.w / 2 - GALLERY.opening / 2, u + c.w / 2 + GALLERY.opening / 2]);
  }
  // 가구(바닥에 깔리거나 천장에 매단 것은 빼고)
  for (const f of tuned.furniture) if (f.level === lv && !FLAT.has(f.kind) && intrudes(f)) add(f, GALLERY.opening);
  // 충돌 상자: 벽·문 목록에 없는 것(계단 밑, 기둥, 가구 상자). 난간은 낮은 벽으로 이미 보았다
  const lowRail = (b: Box) => w.walls.some((q) => q.height < band[0] && Math.abs(q.box.x1 - b.x1) < 1e-6 && Math.abs(q.box.x2 - b.x2) < 1e-6 && Math.abs(q.box.z1 - b.z1) < 1e-6 && Math.abs(q.box.z2 - b.z2) < 1e-6);
  for (const b of tuned.physics.boxes) {
    if (!onLevel(b.level, lv) || STRUCTURE.has(b.tag ?? '') || !intrudes(b) || lowRail(b)) continue;
    add(b, GALLERY.opening);
  }
  // 계단(경사면·계단참): 그 위에 선 사람의 머리 높이까지가 액자 높이에 걸칠 때만. 아래층에서 올라오는 계단은
  // 이 층 바닥 밑이라 넓힌 뒤 벽 면 앞으로 몇 cm 비어져 나와도 막지 않는다(벽 너머 계단실)
  for (const r of w.physics.ramps) {
    const lo = Math.min(r.y0, r.y1), hi = Math.max(r.y0, r.y1);
    if (hi + 1.8 <= base + band[0] || lo >= base + band[1]) continue;
    if (intrudes(r)) add(r, GALLERY.corner);
  }
  return out;
}

/**
 * 부엌 구역마다 벽의 빈 구간에 액자를 건다. 걷기 손질(넓히기·창 늘리기)을 마친 세계에 부른다.
 * 벽 안쪽 면(방 쪽)에만, 창·문·통로·붙박이·커튼을 비켜, 눈높이에 같은 간격으로. 같은 세계면 늘 같은 목록이다
 */
export function hangGallery(w: HouseWorld): GalleryFrame[] {
  const rooms = galleryRooms(w);
  if (!rooms.length) return [];
  // 장식 계획(커튼)은 걷기 화면과 같은 손질을 거친 세계로 셈한다(화면이 그리는 커튼과 같게)
  const tuned = tuneWorld(w);
  const curtains = planCurtains(tuned);
  const frames: GalleryFrame[] = [];
  const seenOnLevel: Record<Level, number> = { 1: 0, 2: 0 };
  const tallest = Math.max(...Object.values(GALLERY.sizes).map((q) => q.h));
  for (const z of rooms) {
    const lv = lvOf(z.level);
    const k = seenOnLevel[lv]++;
    const key = k === 0 ? `${lv}` : `${lv}.${k + 1}`;
    const base = baseOf(w, lv);
    const ceiling = ceilingOver(w, z);
    for (const s of SIDES) {
      const runs = runsOf(w, z, s, GALLERY.centerY + GALLERY.topGap);
      const placed: Array<{ u: number; size: FrameSize; face: number; center: number }> = [];
      for (const run of runs) {
        // 액자 높이: 가운데를 눈높이에 두되, 벽 꼭대기·천장에서 띄운다. 바닥 장식 띠까지 내려와야 하면 걸지 않는다
        const roof = Math.min(run.top, ceiling) - GALLERY.topGap;
        const center = Math.min(GALLERY.centerY, roof - tallest / 2);
        if (center - tallest / 2 < GALLERY.minBottom) continue;
        const band: Span = [center - tallest / 2, center + tallest / 2];
        const blocked = blockersOf(w, tuned, curtains, z, s, run, band);
        const free = subtract([[run.a + run.startGap, run.b - run.endGap]], blocked).filter(([a, b]) => b - a >= widthOf('p') - 1e-9);
        for (const [a, b] of free) {
          const sizes = fillRun(b - a);
          placeRun(a, b, sizes).forEach((u, i) => placed.push({ u, size: sizes[i], face: run.face, center }));
        }
      }
      placed.sort((p, q) => s.dir * (p.u - q.u));
      placed.forEach((p, i) => {
        const { w: fw, h: fh } = GALLERY.sizes[p.size];
        const off = p.face + s.inward * 0.006;
        const [x, zz] = s.axis === 'x' ? [p.u, off] : [off, p.u];
        const yaw = s.axis === 'x' ? (s.inward > 0 ? 0 : Math.PI) : s.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
        frames.push({
          id: `${key}-${s.side}-${i + 1}`, room: z.name, level: lv,
          x: round(x), y: round(base + p.center), z: round(zz), w: fw, h: fh, yaw: round(yaw), size: p.size,
        });
      });
    }
  }
  return frames;
}

/** 걸린 액자들의 차례(갤러리를 넘겨 볼 때): 층, 방, 벽 a~d, 순번 */
export function frameOrder(a: Pick<GalleryFrame, 'id'>, b: Pick<GalleryFrame, 'id'>): number {
  const parse = (id: string) => {
    const m = /^(\d)(?:\.(\d))?-([a-d])-(\d+)$/.exec(id);
    return m ? [Number(m[1]), Number(m[2] ?? 1), m[3].charCodeAt(0), Number(m[4])] : [9, 9, 999, 999];
  };
  const p = parse(a.id), q = parse(b.id);
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] - q[i];
  return 0;
}

/**
 * (level, x, z)에 선 사람이 바라보고 설 만한 액자: 액자 앞(벽 면에서 reach 안, 방 쪽)이고 옆으로 크게 벗어나지 않은 것 가운데
 * 가장 가까운 것. facing(보는 쪽 단위 벡터)을 주면 그 액자 쪽을 보고 있을 때만(옆 벽·등 뒤의 액자는 아니다). 없으면 null.
 * o로 거리(reach)와 보는 각의 코사인 하한(facing)을 바꾼다(약한 가까움 LOOSE_NEAR)
 */
export function nearFrame(
  frames: readonly GalleryFrame[] | undefined, level: Level, x: number, z: number, facing?: { x: number; z: number }, o: NearOptions = {},
): GalleryFrame | null {
  if (!frames?.length) return null;
  const reach = o.reach ?? GALLERY.reach, look = o.facing ?? GALLERY.facing;
  let best: GalleryFrame | null = null;
  let score = Infinity;
  for (const f of frames) {
    if (f.level !== level) continue;
    const nx = Math.sin(f.yaw), nz = Math.cos(f.yaw);
    const dx = x - f.x, dz = z - f.z;
    const out = dx * nx + dz * nz;
    const along = dx * nz - dz * nx;
    if (out < 0.15 || out > reach || Math.abs(along) > f.w / 2 + GALLERY.side) continue;
    // 보는 쪽이 액자를 향하는가(액자 앞면 쪽에서 벽을 본다: 보는 쪽과 액자가 보는 쪽이 마주 선다)
    if (facing && -(facing.x * nx + facing.z * nz) < look) continue;
    const sc = out + Math.abs(along) * 1.5;
    if (sc < score) { score = sc; best = f; }
  }
  return best;
}

/**
 * E·Enter를 눌렀을 때 할 일. 가까운 곳(약하지 않은)이 있으면 살피기, 없으면 곁의 반려동물 부르기(poke가 이름표를 띄웠으면),
 * 그것도 없으면 E만 약한 가까움(휴대폰 3인칭에서 대략 보는 액자)을 연다. Enter는 약한 가까움을 열지 않는다(말하기 몫이다:
 * 화면 쪽도 약한 가까움으로는 말하기를 막지 않는다)
 */
export function pressNear(k: 'e' | 'enter', near: { weak?: boolean } | null, poke: () => boolean): 'interact' | 'poke' | null {
  if (near && !near.weak) return 'interact';
  if (poke()) return 'poke';
  return k === 'e' && near ? 'interact' : null;
}

/** 액자를 사람이 읽는 말로: 걸린 방의 이름표(집 데이터에서 받은 그대로)와 빈 액자 판에 적힌 자리 번호 */
export function frameLabel(f: Pick<GalleryFrame, 'id' | 'room'>): string {
  return `${f.room} ${f.id}`;
}
