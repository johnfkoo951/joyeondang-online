// 실제 집 데이터를 「놀기 좋은 집」으로 손질한다(2026-11-10 결정: 실제 배치와 달라도 동선과 시야가 먼저).
// 가족 작업대의 변환기는 정본 모형을 그대로 옮겨 오고, 여기서 걷기용으로 한 번 더 다듬는다.
//   1. 넓히기: 집 평면을 SCALE배, 마당은 앞뒤로 YARD배 더 늘린다. 벽 두께·가구 크기·층 높이는 그대로라 길과 방이 넓어진다.
//   2. 테라스: 2층 발코니를 포치 지붕 위까지 내고 유리 난간으로 두른다(위층에서 마당이 내려다보이게).
//   3. 창: 있는 창은 크게, 실내를 둔 바깥벽에는 큰 창을 새로 낸다(안에서 바깥이 보이게).
//   4. 마당: 시야를 가리던 소나무를 옆 모서리로 옮기고 포토존을 둔다.
//   5. 거실 무대 자리는 늘 「누구의 문장일까」.
//   6. 꾸밈(theme): 'wedding'이면 마당에서 현관 앞(마당으로 나오는 자리)과 대각선으로 먼 모서리에 무대, 현관 앞에서 무대까지 버진로드, 방명록.
//   7. 사진 갤러리: 켰을 때만(KITCHEN_GALLERY=1) 부엌 구역 벽의 빈 구간에 액자 틀(gallery.ts).
// three.js 없이 도는 순수 함수다. 치수·이름은 여기 적지 않고 모두 받은 데이터(구역 이름, 살피기 자리 slug)에서 찾는다.
// @ts-expect-error Direct Node TypeScript tests require an explicit extension.
import { addLivingEasel } from './atelier-placement.ts';
import { hangGallery } from './gallery';
import type { Box, Furniture, FurnitureKind, HouseWorld, Level, Prop, WallSpec, WindowSpec } from './types';

export type WalkTheme = 'wedding' | 'plain';
/** 손질 선택: gallery가 true일 때만 액자를 건다(기본은 걸지 않는다, 서버는 KITCHEN_GALLERY로 정한다) */
export type StageOptions = { gallery?: boolean };

/** 서버 환경 변수 값 → 꾸밈. 모르는 값이면 지금 행사(결혼식) */
export function themeOf(v: string | undefined | null): WalkTheme {
  return v === 'plain' ? 'plain' : 'wedding';
}

/** 현판 아래 끝(바닥에서, m). 현판 뒤의 창은 이 높이까지만 낸다 */
const HYEONPAN_UNDER = 2.02;

export const STAGING = {
  /** 집 평면 배율 */
  scale: 1.3,
  /** 마당(잔디가 시작하는 선 앞)은 앞뒤로 이만큼 더 */
  yard: 1.45,
  /** 이보다 얇은 쪽은 두께로 보고 늘리지 않는다(벽·난간·문짝) */
  thin: 0.35,
  /** 벽 끝을 맞닿은 벽에 붙일 때 허용하는 틈 */
  eps: 0.03,
  /** 무대 높이(한 걸음에 오를 수 있게 physics STEP보다 낮게) */
  stageH: 0.2,
  /** 등 쪽 면이 벽 면에서 이 안에 있던 가구는 벽에 붙여 둔 것으로 본다(넓힌 뒤에도 그 틈 그대로 다시 붙인다) */
  attach: 0.1,
} as const;

type Rect = { x1: number; x2: number; z1: number; z2: number };
const cxOf = (r: Rect) => (r.x1 + r.x2) / 2;
const czOf = (r: Rect) => (r.z1 + r.z2) / 2;
const same = (a: Rect, b: Rect) =>
  Math.abs(a.x1 - b.x1) < 1e-6 && Math.abs(a.x2 - b.x2) < 1e-6 && Math.abs(a.z1 - b.z1) < 1e-6 && Math.abs(a.z2 - b.z2) < 1e-6;
const around = (x: number, z: number, w: number, d: number): Rect => ({ x1: x - w / 2, x2: x + w / 2, z1: z - d / 2, z2: z + d / 2 });
const inside = (r: Rect, x: number, z: number, pad = 0) => x > r.x1 - pad && x < r.x2 + pad && z > r.z1 - pad && z < r.z2 + pad;

/** 걷기용으로 손질한 새 세계. 실제 집이 아니거나 이미 손질했으면 그대로 돌려준다. 원본은 바꾸지 않는다. */
export function stageHouse(src: HouseWorld, theme: WalkTheme = 'wedding', opts: StageOptions = {}): HouseWorld {
  if (src.kind !== 'real' || src.theme) return src;
  const w = widen(structuredClone(src));
  lattices(w);
  terrace(w);
  windows(w);
  yard(w);
  living(w);
  if (theme === 'wedding') wedding(w);
  // 액자는 벽·창·가구가 모두 자리 잡은 뒤에 건다(넓히고 새로 낸 창을 비켜 가게)
  delete w.gallery;
  if (opts.gallery === true) {
    const frames = hangGallery(w);
    if (frames.length) w.gallery = frames;
  }
  w.theme = theme;
  return addLivingEasel(w);
}

// ───────── 1. 넓히기
function widen(w: HouseWorld): HouseWorld {
  const { scale: S, yard: Y, thin: T, eps: E, attach: A } = STAGING;
  const x0 = w.house.x1, z0 = w.house.z1;
  const lawns = w.floors.filter((f) => f.level === 1 && f.mat === 'lawn');
  const zf = lawns.length ? Math.min(...lawns.map((f) => f.z1)) : Infinity;
  const mx = (x: number) => x0 + S * (x - x0);
  const mz = (z: number) => (z <= zf ? z0 + S * (z - z0) : z0 + S * (zf - z0) + S * Y * (z - zf));
  // 벽 끝·바닥 가장자리를 맞닿은 벽과 같이 옮긴다(두께는 그대로라 그냥 늘리면 이음매가 벌어진다)
  const struct: Rect[] = [...w.walls, ...w.headers].map((s) => s.box);
  const thinX = (r: Rect) => r.x2 - r.x1 < T;
  const thinZ = (r: Rect) => r.z2 - r.z1 < T;
  const snapX = (x: number, za: number, zb: number) => {
    let best: Rect | null = null;
    let d = Infinity;
    for (const b of struct) {
      if (!thinX(b) || x < b.x1 - E || x > b.x2 + E || b.z2 < za - E || b.z1 > zb + E) continue;
      const dd = Math.abs(x - cxOf(b));
      if (dd < d) { d = dd; best = b; }
    }
    return best ? x + mx(cxOf(best)) - cxOf(best) : mx(x);
  };
  const snapZ = (z: number, xa: number, xb: number) => {
    let best: Rect | null = null;
    let d = Infinity;
    for (const b of struct) {
      if (!thinZ(b) || z < b.z1 - E || z > b.z2 + E || b.x2 < xa - E || b.x1 > xb + E) continue;
      const dd = Math.abs(z - czOf(b));
      if (dd < d) { d = dd; best = b; }
    }
    return best ? z + mz(czOf(best)) - czOf(best) : mz(z);
  };
  /** 상자: 얇은 쪽은 가운데만 옮기고, 긴 쪽은 끝을 맞닿은 벽에 붙여 늘린다 */
  const rect = <R extends Rect>(r: R): R => {
    const o = { ...r };
    if (thinX(r)) {
      const c = mx(cxOf(r)), h = (r.x2 - r.x1) / 2;
      o.x1 = c - h; o.x2 = c + h;
    } else {
      o.x1 = snapX(r.x1, r.z1, r.z2); o.x2 = snapX(r.x2, r.z1, r.z2);
    }
    if (thinZ(r)) {
      const c = mz(czOf(r)), h = (r.z2 - r.z1) / 2;
      o.z1 = c - h; o.z2 = c + h;
    } else {
      o.z1 = snapZ(r.z1, r.x1, r.x2); o.z2 = snapZ(r.z2, r.x1, r.x2);
    }
    return o;
  };
  /** 크기는 그대로 두고 가운데만 옮긴다(가구) */
  const move = <R extends Rect>(r: R): R => {
    const dx = mx(cxOf(r)) - cxOf(r), dz = mz(czOf(r)) - czOf(r);
    return { ...r, x1: r.x1 + dx, x2: r.x2 + dx, z1: r.z1 + dz, z2: r.z2 + dz };
  };
  // 벽에 등을 대고 있던 가구(책장·병풍·신발장·격자창)는 가운데만 배율로 옮기면 벽에서 뜬다: 벽은 두께가 그대로라
  // 벽 가운데에서 가구 가운데까지 거리만 늘어나기 때문이다. 등 쪽 면을, 옮겨진 그 벽 면에서 원래 틈만큼 떨어진 자리로 다시 붙인다
  const backWall = (f: Furniture): { box: Rect; gap: number; deep: 'x' | 'z'; back: -1 | 1 } | null => {
    if (!f.face) return null;
    const deep = f.face[1] as 'x' | 'z';
    const back = f.face[0] === '+' ? -1 : 1; // 등은 정면 반대쪽
    let best: { box: Rect; gap: number; deep: 'x' | 'z'; back: -1 | 1 } | null = null;
    for (const s of w.walls) {
      const b = s.box;
      if ((b.level !== 0 && b.level !== f.level) || s.axis === deep) continue;
      const over = deep === 'x' ? Math.min(f.z2, b.z2) - Math.max(f.z1, b.z1) : Math.min(f.x2, b.x2) - Math.max(f.x1, b.x1);
      if (over < 0.05) continue;
      const gap = deep === 'x' ? (back < 0 ? f.x1 - b.x2 : b.x1 - f.x2) : (back < 0 ? f.z1 - b.z2 : b.z1 - f.z2);
      if (Math.abs(gap) <= A && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { box: b, gap, deep, back };
    }
    return best;
  };
  const attach = (f: Furniture, r: Furniture): Furniture => {
    const hit = backWall(f);
    if (!hit) return r;
    const m = rect(hit.box);
    if (hit.deep === 'x') {
      const dx = hit.back < 0 ? m.x2 + hit.gap - r.x1 : m.x1 - hit.gap - r.x2;
      return { ...r, x1: r.x1 + dx, x2: r.x2 + dx };
    }
    const dz = hit.back < 0 ? m.z2 + hit.gap - r.z1 : m.z1 - hit.gap - r.z2;
    return { ...r, z1: r.z1 + dz, z2: r.z2 + dz };
  };
  // 바닥에 까는 것은 함께 늘리고, 나머지 가구는 크기 그대로 자리만 옮긴다
  const STRETCH = new Set<FurnitureKind>(['path', 'rug', 'lattice']);
  const furnTo = (f: Furniture) => attach(f, STRETCH.has(f.kind) ? rect(f) : move(f));
  const boxTo = (b: Box): Box => {
    const f = w.furniture.find((it) => it.collide && same(it, b));
    if (f) {
      const r = furnTo(f);
      return { x1: r.x1, x2: r.x2, z1: r.z1, z2: r.z2, level: b.level, tag: b.tag };
    }
    if (b.tag === 'column') return move(b);
    return rect(b);
  };
  const wall = (s: WallSpec): WallSpec => ({ ...s, box: rect(s.box) });
  const prop = (p: Prop): Prop => {
    if (p.type === 'column') return { ...p, x: mx(p.x), z: mz(p.z) };
    if (p.type === 'arch') return { ...p, x: mx(p.x), z: mz(p.z), span: p.span * S };
    // 지붕판은 벽에 붙이지 않고 네 변을 그대로 배율로 옮긴다: 같은 좌표는 같은 자리로 가므로 맞닿아 있던 지붕판
    // 사이가 벌어지지 않는다(벽에 붙이면 판마다 다른 벽을 따라가 틈으로 하늘이 보였다)
    if (p.type === 'slab' && p.part === 'roof') return { ...p, x1: mx(p.x1), x2: mx(p.x2), z1: mz(p.z1), z2: mz(p.z2) };
    return rect(p);
  };
  const win = (v: WindowSpec): WindowSpec =>
    v.axis === 'x' ? { ...v, at: mz(v.at), from: mx(v.from), to: mx(v.to) } : { ...v, at: mx(v.at), from: mz(v.from), to: mz(v.to) };
  const physicsBoxes = w.physics.boxes.map(boxTo);
  return {
    ...w,
    house: { x1: mx(w.house.x1), x2: mx(w.house.x2), z1: mz(w.house.z1), z2: mz(w.house.z2) },
    floors: w.floors.map(rect),
    walls: w.walls.map(wall),
    headers: w.headers.map(wall),
    doors: w.doors.map((d) => ({ ...d, box: rect(d.box) })),
    ceilings: w.ceilings.map(rect),
    windows: w.windows.map(win),
    furniture: w.furniture.map(furnTo),
    props: w.props.map(prop),
    zones: w.zones.map(rect),
    // 문·포털 자리는 벽에 붙어 있어 반경을 늘리면 벽 너머 옆방에서도 잡힌다: 그대로 둔다
    hotspots: w.hotspots.map((h) => ({ ...h, x: mx(h.x), z: mz(h.z), r: h.kind === 'portal' || h.kind === 'door' || h.kind === 'exit' ? h.r : h.r * S })),
    portals: w.portals?.map((p) => ({ ...p, x: mx(p.x), z: mz(p.z) })),
    physics: { ...w.physics, boxes: physicsBoxes, ramps: w.physics.ramps.map(rect) },
    spawn: { ...w.spawn, x: mx(w.spawn.x), z: mz(w.spawn.z) },
  };
}

/**
 * 격자창은 건 벽 안에만 둔다. 벽 끝을 넘어 옆 통로(문 없는 개구부) 위 허공에 걸친 것은, 같은 벽에 건 격자창들을
 * 통째로 벽 안쪽으로 민다(폭과 사이 간격은 그대로라 나란한 격자창의 폭이 달라지지 않는다). 그래도 넘치는 것만 자른다.
 */
function lattices(w: HouseWorld) {
  const IN = 0.05;
  const hung = new Map<WallSpec, Furniture[]>();
  for (const f of w.furniture) {
    if (f.kind !== 'lattice') continue;
    const alongX = f.x2 - f.x1 >= f.z2 - f.z1;
    const line = alongX ? czOf(f) : cxOf(f);
    let host: WallSpec | undefined;
    let most = 0;
    for (const s of w.walls) {
      const b = s.box;
      if ((b.level !== 0 && b.level !== f.level) || (s.axis === 'x') !== alongX) continue;
      if (Math.abs((alongX ? czOf(b) : cxOf(b)) - line) >= 0.35) continue;
      const over = alongX ? Math.min(f.x2, b.x2) - Math.max(f.x1, b.x1) : Math.min(f.z2, b.z2) - Math.max(f.z1, b.z1);
      if (over > most) { most = over; host = s; }
    }
    if (host) hung.set(host, [...(hung.get(host) ?? []), f]);
  }
  for (const [s, list] of hung) {
    const x = s.axis === 'x';
    const [a, c] = x ? [s.box.x1 + IN, s.box.x2 - IN] : [s.box.z1 + IN, s.box.z2 - IN];
    if (c - a < 0.3) continue;
    const lo = Math.min(...list.map((f) => (x ? f.x1 : f.z1))), hi = Math.max(...list.map((f) => (x ? f.x2 : f.z2)));
    if (lo >= a && hi <= c) continue;
    const d = lo < a ? Math.min(a - lo, Math.max(0, c - hi)) : -Math.min(hi - c, Math.max(0, lo - a));
    for (const f of list) {
      const old = { ...f };
      if (x) { f.x1 = Math.max(a, f.x1 + d); f.x2 = Math.min(c, f.x2 + d); }
      else { f.z1 = Math.max(a, f.z1 + d); f.z2 = Math.min(c, f.z2 + d); }
      for (const b of w.physics.boxes) if (same(b, old)) Object.assign(b, { x1: f.x1, x2: f.x2, z1: f.z1, z2: f.z2 });
    }
  }
}

// ───────── 2. 테라스: 발코니를 포치 지붕 끝까지 내고 낮은 벽 대신 유리 난간
function terrace(w: HouseWorld) {
  const bal = w.zones.find((z) => z.level === 2 && z.name.includes('발코니'));
  const porch = w.props.find((p): p is Extract<Prop, { type: 'slab' }> => p.type === 'slab' && p.part === 'porch');
  if (!bal || !porch) return;
  const edge = porch.z2;
  if (edge <= bal.z2 + 0.3) return;
  const f2 = w.floor2;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.35;
  const rails: Furniture[] = [];
  for (const s of w.walls) {
    const b = s.box;
    if (b.level !== 2 || s.height > 1.25 || s.style !== 'ext') continue;
    const old = { ...b };
    let hit = false;
    if (s.axis === 'x' && near(czOf(b), bal.z2) && b.x2 > bal.x1 && b.x1 < bal.x2) {
      const t = b.z2 - b.z1;
      b.z1 = edge - t; b.z2 = edge;
      hit = true;
    } else if (s.axis === 'z' && (near(cxOf(b), bal.x1) || near(cxOf(b), bal.x2)) && near(b.z2, bal.z2)) {
      b.z2 = edge;
      hit = true;
    }
    if (!hit) continue;
    for (const p of w.physics.boxes) if (same(p, old)) Object.assign(p, { x1: b.x1, x2: b.x2, z1: b.z1, z2: b.z2 });
    s.style = 'invisible';
    const rail: Furniture = {
      kind: 'glassRail', level: 2, x1: b.x1, x2: b.x2, z1: b.z1, z2: b.z2,
      face: s.axis === 'x' ? '+z' : '+x', collide: false,
    };
    w.furniture.push(rail);
    rails.push(rail);
  }
  // 모서리: 앞 난간과 옆 난간의 벽 상자는 두께만큼 통째로 겹쳐 있어, 그대로 그리면 끝 기둥이 둘씩 서고 손잡이가 엇갈린다.
  // 그림 상자만 서로의 가운데 선까지 맞춰 끝 기둥이 한 자리에 서게 한다(막는 상자는 그대로)
  for (const side of rails.filter((r) => r.face === '+x')) {
    const sx = cxOf(side);
    for (const front of rails.filter((r) => r.face === '+z')) {
      if (near(sx, front.x1)) front.x1 = sx;
      else if (near(sx, front.x2)) front.x2 = sx;
      else continue;
      side.z2 = czOf(front);
    }
  }
  for (const f of w.floors) if (f.level === 2 && near(f.z2, bal.z2) && f.x1 >= bal.x1 - 0.35 && f.x2 <= bal.x2 + 0.35) f.z2 = edge;
  bal.z2 = edge;
  // 포치 지붕판은 테라스 바닥 밑으로, 그 아래 기둥은 지붕판에 닿게 낮춘다
  porch.y = f2 - porch.t / 2;
  for (const p of w.props) {
    if (p.type === 'slab' && p.part === 'roof' && p.y < f2 + 0.6) p.y = Math.min(p.y, f2 - p.t / 2 - 0.02);
    if (p.type === 'column' && p.h > f2 - porch.t) p.h = f2 - porch.t;
  }
}

// ───────── 3. 창: 크게, 더 많이
function windows(w: HouseWorld) {
  const ceilingAbove = (lv: Level) => {
    const list = w.ceilings.filter((c) => c.level === lv).map((c) => c.y - (lv === 2 ? w.floor2 : 0));
    return list.length ? Math.min(...list) : 2.4;
  };
  const indoor = (lv: Level, x: number, z: number) =>
    w.floors.some((f) => f.level === lv && f.mat !== 'lawn' && f.mat !== 'porch' && inside(f, x, z));
  /** 창이 걸친 벽 가운데 가장 길게 겹치는 벽(짧은 벽 토막에 걸려 창이 쪼그라들지 않게) */
  const wallOf = (v: WindowSpec) => {
    let best: WallSpec | undefined;
    let most = 0;
    for (const s of w.walls) {
      const b = s.box;
      const lv = b.level === 2 ? 2 : 1;
      if (lv !== v.level || s.axis !== v.axis) continue;
      const line = s.axis === 'x' ? czOf(b) : cxOf(b);
      if (Math.abs(line - v.at) >= 0.2) continue;
      const [a, c] = s.axis === 'x' ? [b.x1, b.x2] : [b.z1, b.z2];
      const over = Math.min(v.to, c) - Math.max(v.from, a);
      if (over > most) { most = over; best = s; }
    }
    return best;
  };
  // 있는 창: 양옆으로 넓히고 창턱을 낮추고 위로 올린다
  for (const v of w.windows) {
    const s = wallOf(v);
    const top = Math.min(ceilingAbove(v.level) - 0.12, s ? s.height - 0.15 : 2.3);
    v.sill = Math.min(v.sill, v.level === 1 ? 0.4 : 0.45);
    v.top = Math.max(v.top, top);
    if (!s) continue;
    const [a, c] = s.axis === 'x' ? [s.box.x1, s.box.x2] : [s.box.z1, s.box.z2];
    const grow = Math.min((v.to - v.from) * 0.4, 0.9);
    const from = Math.max(a + 0.25, v.from - grow / 2), to = Math.min(c - 0.25, v.to + grow / 2);
    // 벽 안으로 조였더니 너무 좁아지면(짧은 벽) 넓히지 않고 그대로 둔다
    if (to - from >= 0.6) { v.from = from; v.to = to; }
  }
  w.windows = w.windows.filter((v) => v.to - v.from >= 0.3);
  // 새 창: 한쪽에 걸어 다니는 실내가 있는 바깥벽마다(긴 벽이면 두 칸)
  for (const s of w.walls) {
    if (s.style !== 'ext' || s.height < 2.2) continue;
    const lv: Level = s.box.level === 2 ? 2 : 1;
    const [a, c] = s.axis === 'x' ? [s.box.x1, s.box.x2] : [s.box.z1, s.box.z2];
    const len = c - a;
    if (len < 1.6) continue;
    const line = s.axis === 'x' ? czOf(s.box) : cxOf(s.box);
    if (w.windows.some((v) => v.level === lv && v.axis === s.axis && Math.abs(v.at - line) < 0.2 && v.to > a && v.from < c)) continue;
    const mid = (a + c) / 2;
    const off = (s.axis === 'x' ? s.box.z2 - s.box.z1 : s.box.x2 - s.box.x1) / 2 + 0.3;
    const sides = [-1, 1].filter((k) => (s.axis === 'x' ? indoor(lv, mid, line + k * off) : indoor(lv, line + k * off, mid)));
    if (sides.length !== 1) continue;
    const top = Math.min(ceilingAbove(lv) - 0.12, s.height - 0.15);
    const sill = lv === 1 ? 0.45 : 0.5;
    const parts = len > 4.6 ? 2 : 1;
    for (let i = 0; i < parts; i++) {
      const seg0 = a + (len * i) / parts, seg1 = a + (len * (i + 1)) / parts;
      const width = Math.min(seg1 - seg0 - 0.6, 2.8);
      if (width < 0.9) continue;
      const m = (seg0 + seg1) / 2;
      const v: WindowSpec = { level: lv, axis: s.axis, at: line, from: m - width / 2, to: m + width / 2, sill, top };
      // 창밖 바로 앞이 다른 벽이면(꺾인 집의 안쪽 모서리) 창을 내도 맨벽만 보인다
      if (windowBlocked(w, v, -sides[0] as -1 | 1, s) > 0.4) continue;
      w.windows.push(v);
    }
  }
}

/** 창밖을 가리는 벽을 찾는 거리(m) */
export const WINDOW_VIEW = 2.5;

/**
 * 창밖(벽 선에서 out 쪽으로 WINDOW_VIEW까지)에 같은 층의 보이는 벽이 창 폭의 몇 할을 가리는가(0~1).
 * host는 그 창이 난 벽(자기 자신은 세지 않는다). 창턱보다 낮은 벽은 가리지 않는 것으로 본다.
 */
export function windowBlocked(w: HouseWorld, v: WindowSpec, out: -1 | 1, host?: WallSpec): number {
  const near = v.at + out * 0.15, far = v.at + out * WINDOW_VIEW;
  const [d1, d2] = near < far ? [near, far] : [far, near];
  const base = v.level === 2 ? w.floor2 : 0;
  const covered: Array<[number, number]> = [];
  for (const s of w.walls) {
    if (s === host || s.style === 'invisible') continue;
    const b = s.box;
    if (b.level !== 0 && b.level !== v.level) continue;
    if (s.baseY + s.height - base <= v.sill + 0.1) continue;
    const [p1, p2, q1, q2] = v.axis === 'x' ? [b.z1, b.z2, b.x1, b.x2] : [b.x1, b.x2, b.z1, b.z2];
    if (p2 <= d1 || p1 >= d2) continue;
    const from = Math.max(q1, v.from), to = Math.min(q2, v.to);
    if (to > from) covered.push([from, to]);
  }
  covered.sort((p, q) => p[0] - q[0]);
  let total = 0, end = -Infinity;
  for (const [from, to] of covered) {
    if (to <= end) continue;
    total += to - Math.max(from, end);
    end = to;
  }
  return total / Math.max(1e-6, v.to - v.from);
}

// ───────── 4. 마당: 소나무는 옆 모서리로, 포토존과 환영 표지판
function lawnRect(w: HouseWorld): Rect | null {
  const l = w.floors.filter((f) => f.level === 1 && f.mat === 'lawn');
  if (!l.length) return null;
  return { x1: Math.min(...l.map((f) => f.x1)), x2: Math.max(...l.map((f) => f.x2)), z1: Math.min(...l.map((f) => f.z1)), z2: Math.max(...l.map((f) => f.z2)) };
}

function addFurniture(w: HouseWorld, f: Furniture) {
  w.furniture.push(f);
  if (f.collide) w.physics.boxes.push({ x1: f.x1, x2: f.x2, z1: f.z1, z2: f.z2, level: f.level, tag: f.kind });
}

function moveFurniture(w: HouseWorld, f: Furniture, x: number, z: number) {
  const dx = x - cxOf(f), dz = z - czOf(f);
  const old = { ...f };
  f.x1 += dx; f.x2 += dx; f.z1 += dz; f.z2 += dz;
  for (const b of w.physics.boxes) if (same(b, old)) Object.assign(b, { x1: f.x1, x2: f.x2, z1: f.z1, z2: f.z2 });
  return { dx, dz };
}

function yard(w: HouseWorld) {
  const L = lawnRect(w);
  if (!L) return;
  const pine = w.furniture.find((f) => f.kind === 'pine');
  if (pine) {
    // 집 쪽 오른편 모서리: 마당 가운데(버진로드)와 무대를 가리지 않는다
    const { dx, dz } = moveFurniture(w, pine, L.x2 - 1.9, L.z1 + 2.1);
    const spot = w.hotspots.find((h) => h.slug === 'pine');
    if (spot) { spot.x += dx; spot.z += dz; }
  }
  // 포토존: 오른쪽 가장자리 가운데쯤, 집 쪽(-x)을 보고 선다
  const px = L.x2 - 0.75, pz = (L.z1 + L.z2) / 2 + 0.6;
  addFurniture(w, { kind: 'photoFrame', level: 1, x1: px - 0.3, x2: px + 0.3, z1: pz - 1.4, z2: pz + 1.4, face: '-x', collide: true });
  for (const k of [-1, 1]) addFurniture(w, { kind: 'planter', level: 1, ...around(px - 0.35, pz + k * 1.85, 0.6, 0.6), collide: false });
  w.hotspots.push({
    id: 'photozone', level: 1, x: px - 1.9, z: pz, r: 1.5, slug: 'photozone', kind: 'room',
    title: '포토존', line: '여기서 찍은 사진을 올려 주세요. 가족이 먼저 보고, 그 사진으로 내 캐릭터도 꾸밀 수 있어요.',
  });
  // 길가 등: 디딤돌 길 양옆으로 띄엄띄엄(빛은 내지 않고 은은하게 빛나는 갓만)
  for (const pth of w.furniture.filter((f) => f.kind === 'path')) {
    const vertical = pth.z2 - pth.z1 > pth.x2 - pth.x1;
    const [a, b] = vertical ? [pth.z1, pth.z2] : [pth.x1, pth.x2];
    for (let u = a + 1.2, i = 0; u < b - 0.6; u += 2.4, i++) {
      const k = i % 2 ? 1 : -1;
      const [x, z] = vertical ? [k > 0 ? pth.x2 + 0.35 : pth.x1 - 0.35, u] : [u, k > 0 ? pth.z2 + 0.35 : pth.z1 - 0.35];
      if (inside(L, x, z, -0.3)) addFurniture(w, { kind: 'pathLight', level: 1, ...around(x, z, 0.22, 0.22), collide: false });
    }
  }
  // 양옆 담 안쪽을 따라 낮은 생울타리(포토존·소나무 자리는 비운다)
  // 소나무·포토존·화분 둘레는 넉넉히 비우고, 디딤돌 길은 덤불 반 너비만큼만 비킨다(길이 담 쪽에 붙어 있어도 줄이 통째로 빠지지 않게)
  const keepOut = w.furniture.filter((f) => f.kind === 'pine' || f.kind === 'photoFrame' || f.kind === 'planter');
  const paths = w.furniture.filter((f) => f.kind === 'path');
  for (const x of [L.x1 + 0.55, L.x2 - 0.55]) {
    for (let z = L.z1 + 1.6; z < L.z2 - 0.8; z += 1.5) {
      if (keepOut.some((f) => inside(f, x, z, f.kind === 'photoFrame' ? 0.7 : 1.1)) || paths.some((f) => inside(f, x, z, 0.5))) continue;
      // 처음 서는 자리 둘레는 비운다(들어서자마자 덤불이 화면을 가리지 않게)
      if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 3.4) continue;
      w.furniture.push({ kind: 'shrub', level: 1, ...around(x, z, 0.9, 1.2), collide: false });
    }
  }
  // 현판: 포치 안쪽 집 앞벽, 포치 가운데 위에 당호를 건다
  const porchSpot = w.hotspots.find((h) => h.slug === 'porch');
  if (porchSpot) {
    const front = w.walls
      .filter((s) => s.box.level === 1 && s.axis === 'x' && s.style !== 'invisible' && s.height >= 2.5 && czOf(s.box) < porchSpot.z && s.box.x1 < porchSpot.x && s.box.x2 > porchSpot.x)
      .sort((p, q) => czOf(q.box) - czOf(p.box))[0];
    if (front) {
      // 기둥 뒤에 숨지 않게: 그 벽 창의 가운데, 창이 없으면 포치 가운데에서 가장 가까운 기둥 사이
      const line = czOf(front.box);
      const win = w.windows.filter((v) => v.level === 1 && v.axis === 'x' && Math.abs(v.at - line) < 0.2).sort((p, q) => (q.to - q.from) - (p.to - p.from))[0];
      const cols = w.props.filter((p): p is Extract<Prop, { type: 'column' }> => p.type === 'column').map((p) => p.x).sort((a, b) => a - b);
      let x = win ? (win.from + win.to) / 2 : porchSpot.x;
      const hit = cols.find((c) => Math.abs(c - x) < 1.0);
      if (hit !== undefined) {
        const right = cols.find((c) => c > hit + 0.5);
        const left = [...cols].reverse().find((c) => c < hit - 0.5);
        const mids = [left, right].filter((c): c is number => c !== undefined).map((c) => (c + hit) / 2);
        if (mids.length) x = mids.reduce((p, q) => (Math.abs(q - x) < Math.abs(p - x) ? q : p));
      }
      addFurniture(w, { kind: 'hyeonpan', level: 1, ...around(x, front.box.z2 + 0.05, 1.5, 0.08), face: '+z', collide: false });
      // 현판은 창 위 벽에 건다: 현판 뒤의 창은 현판 밑까지만 내어 유리가 현판에 가리지 않게 한다
      const onLine = w.windows.filter((v) => v.level === 1 && v.axis === 'x' && Math.abs(v.at - line) < 0.2);
      for (const v of onLine) if (v.to > x - 0.8 && v.from < x + 0.8) v.top = Math.min(v.top, HYEONPAN_UNDER);
      // 현판 양옆 벽등: 유리 앞 허공이 아니라 벽에 건다(창에 걸리면 창 옆 벽으로 옮기고, 자리가 없으면 걸지 않는다)
      for (const k of [-1, 1]) {
        let sx = x + k * 1.25;
        const over = onLine.find((v) => sx > v.from - 0.2 && sx < v.to + 0.2);
        if (over) sx = k < 0 ? over.from - 0.35 : over.to + 0.35;
        const clear = !onLine.some((v) => sx > v.from - 0.2 && sx < v.to + 0.2);
        if (clear && sx > front.box.x1 + 0.3 && sx < front.box.x2 - 0.3) addFurniture(w, { kind: 'sconce', level: 1, ...around(sx, front.box.z2 + 0.08, 0.22, 0.14), face: '+z', collide: false });
      }
    }
    // 포치 양끝 앞 화분(드나드는 가운데는 비운다)
    const porchSlab = w.props.find((p): p is Extract<Prop, { type: 'slab' }> => p.type === 'slab' && p.part === 'porch');
    if (porchSlab) {
      for (const px of [porchSlab.x1 + 0.45, porchSlab.x2 - 0.45]) {
        const pz = porchSlab.z2 + 0.45;
        if (inside(L, px, pz, -0.2)) addFurniture(w, { kind: 'planter', level: 1, ...around(px, pz, 0.6, 0.6), collide: false });
      }
    }
  }
  // 처음 서는 자리 앞에 환영 표지판: 길 바로 옆, 몇 걸음 앞에서 처음 자리를 마주 본다
  // (바로 옆에 두면 휴대폰 세로 화면에서는 시야 밖이고, 작으면 글자를 읽을 수 없다)
  const sx = w.spawn.x + 1.25, sz = w.spawn.z - 4.4;
  if (inside(L, sx, sz, -0.6)) {
    addFurniture(w, { kind: 'welcomeSign', level: 1, ...around(sx, sz, 1.4, 0.6), rot: Math.atan2(w.spawn.x - sx, w.spawn.z - sz), collide: false });
  }
}

// ───────── 5. 결혼식 꾸밈
/** 구역 가장자리에서 벽·닫힌 문이 없는 구간(통로). 머리벽은 문 위에 있으므로 통로로 본다 */
export function openingsOf(w: HouseWorld, zone: Rect, level: Level): Array<{ x: number; z: number; len: number; axis: 'x' | 'z' }> {
  const solid: Rect[] = [
    ...w.walls.filter((s) => s.style !== 'invisible' && (s.box.level === level || s.box.level === 0)).map((s) => s.box),
    ...w.doors.filter((d) => d.closed && (d.box.level === level || d.box.level === 0)).map((d) => d.box),
  ];
  const stepLen = 0.1;
  const out: Array<{ x: number; z: number; len: number; axis: 'x' | 'z' }> = [];
  const edges: Array<{ axis: 'x' | 'z'; at: number; a: number; b: number }> = [
    { axis: 'x', at: zone.z1, a: zone.x1, b: zone.x2 },
    { axis: 'x', at: zone.z2, a: zone.x1, b: zone.x2 },
    { axis: 'z', at: zone.x1, a: zone.z1, b: zone.z2 },
    { axis: 'z', at: zone.x2, a: zone.z1, b: zone.z2 },
  ];
  for (const e of edges) {
    let run: number[] = [];
    const flush = () => {
      if (run.length * stepLen >= 0.6) {
        const m = (run[0] + run[run.length - 1]) / 2;
        out.push(e.axis === 'x' ? { x: m, z: e.at, len: run.length * stepLen, axis: 'x' } : { x: e.at, z: m, len: run.length * stepLen, axis: 'z' });
      }
      run = [];
    };
    for (let u = e.a + stepLen / 2; u < e.b; u += stepLen) {
      const [x, z] = e.axis === 'x' ? [u, e.at] : [e.at, u];
      if (solid.some((r) => inside(r, x, z, 0.03))) flush();
      else run.push(u);
    }
    flush();
  }
  return out;
}

/** 거실 무대 자리는 꾸밈과 상관없이 「누구의 문장일까」 */
function living(w: HouseWorld) {
  const spot = w.hotspots.find((h) => h.slug === 'living' && h.kind === 'stage');
  if (spot) spot.game = 'who';
}

// 행사 소품은 모두 걸리지 않게 둔다(걷다가 걸려 멈추지 않게). 무대는 한 단 올라서는 판만 있다.
function wedding(w: HouseWorld) {
  const L = lawnRect(w);
  const entrance = w.hotspots.find((h) => h.slug === 'entrance');
  if (!L || !entrance) return;
  // 마당으로 나오는 자리: 현관 앞, 잔디가 시작하는 선 바로 안
  const door = { x: Math.min(Math.max(entrance.x, L.x1 + 1), L.x2 - 1), z: L.z1 + 0.7 };
  // 무대: 그 자리에서 대각선으로 가장 먼 마당 모서리
  const corners = [[L.x1, L.z1], [L.x2, L.z1], [L.x1, L.z2], [L.x2, L.z2]] as const;
  const [kx, kz] = corners.reduce((p, q) => (Math.hypot(q[0] - door.x, q[1] - door.z) > Math.hypot(p[0] - door.x, p[1] - door.z) ? q : p));
  const sx = Math.sign(cxOf(L) - kx), sz = Math.sign(czOf(L) - kz);
  const lw = L.x2 - L.x1, ld = L.z2 - L.z1;
  const sw = Math.min(4.2, lw * 0.3), sd = Math.min(3.4, ld * 0.25), m = 0.55;
  const stage: Rect = {
    x1: Math.min(kx + sx * m, kx + sx * (m + sw)), x2: Math.max(kx + sx * m, kx + sx * (m + sw)),
    z1: Math.min(kz + sz * m, kz + sz * (m + sd)), z2: Math.max(kz + sz * m, kz + sz * (m + sd)),
  };
  // 무대 자리와 겹치는 마당 소품은 치운다(벤치·생울타리·길가 등)
  const clash = (f: Furniture) => f.level === 1 && f.kind !== 'pine' && f.kind !== 'photoFrame' && f.kind !== 'path'
    && f.x2 > stage.x1 - 0.8 && f.x1 < stage.x2 + 0.8 && f.z2 > stage.z1 - 0.8 && f.z1 < stage.z2 + 0.8;
  const gone = w.furniture.filter(clash);
  w.furniture = w.furniture.filter((f) => !gone.includes(f));
  w.physics.boxes = w.physics.boxes.filter((b) => !gone.some((f) => f.collide && same(f, b)));
  const scx = cxOf(stage), scz = czOf(stage);
  const face = Math.atan2(door.x - scx, door.z - scz); // 무대 앞(로컬 +z)이 현관 쪽
  const fx = Math.sin(face), fz = Math.cos(face);
  const H = STAGING.stageH;
  addFurniture(w, { kind: 'weddingStage', level: 1, ...stage, collide: false });
  w.physics.ramps.push({ ...stage, axis: 'x', y0: H, y1: H });
  // 무대 위 모서리 쪽에 꽃 아치
  const back = Math.min(sw, sd) * 0.3;
  addFurniture(w, { kind: 'flowerArch', level: 1, ...around(scx - fx * back, scz - fz * back, 2.2, 0.5), rot: face, collide: false });
  const front = { x: scx + fx * (Math.min(sw, sd) / 2 + 0.6), z: scz + fz * (Math.min(sw, sd) / 2 + 0.6) };
  // 버진로드: 현관 앞에서 무대 앞까지 곧게
  const len = Math.hypot(front.x - door.x, front.z - door.z);
  const rot = Math.atan2(front.x - door.x, front.z - door.z);
  addFurniture(w, { kind: 'aisle', level: 1, ...around((door.x + front.x) / 2, (door.z + front.z) / 2, 1.2, len + 0.6), rot, collide: false });
  // 길 양옆: 꽃대(처음과 끝)와 길가 등(사이사이). 의자 줄 대신 띄엄띄엄
  const ax = { x: Math.sin(rot), z: Math.cos(rot) }, px = { x: Math.cos(rot), z: -Math.sin(rot) };
  const at = (t: number, k: number, off: number) => ({ x: door.x + ax.x * t + px.x * k * off, z: door.z + ax.z * t + px.z * k * off });
  // 러너에 덮이는 디딤돌은 치운다: 디딤돌 길의 집 쪽 끝을 러너가 지나가는 데까지 물린다(돌이 러너를 뚫고 올라오지 않게)
  const distToAisle = (x: number, z: number) => {
    const tt = Math.min(len, Math.max(0, (x - door.x) * ax.x + (z - door.z) * ax.z));
    return Math.hypot(x - (door.x + ax.x * tt), z - (door.z + ax.z * tt));
  };
  const walkways = w.furniture.filter((f) => f.kind === 'path');
  for (const pth of walkways) {
    const vertical = pth.z2 - pth.z1 > pth.x2 - pth.x1;
    const [a, b] = vertical ? [pth.z1, pth.z2] : [pth.x1, pth.x2];
    const under = (u: number) => (vertical ? distToAisle(cxOf(pth), u) : distToAisle(u, czOf(pth))) < 0.6 + 0.5;
    let cut = a;
    for (let u = a; u < b - 1.5 && under(u); u += 0.1) cut = u + 0.1;
    if (cut > a + 0.05) {
      if (vertical) pth.z1 = cut;
      else pth.x1 = cut;
    }
  }
  /** 길 옆 소품 자리: 디딤돌 길 위면 길 밖으로 더 비켜 놓는다(끝내 못 비키면 null) */
  const beside = (t: number, k: number, off: number) => {
    for (let o = off; o <= off + 1.25; o += 0.3) {
      const p = at(t, k, o);
      if (!walkways.some((f) => inside(f, p.x, p.z, 0.3)) && inside(L, p.x, p.z, -0.2)) return p;
    }
    return null;
  };
  for (const t of [0.8, len - 0.6]) for (const k of [-1, 1]) {
    const p = beside(t, k, 1.0);
    if (p) addFurniture(w, { kind: 'flowerStand', level: 1, ...around(p.x, p.z, 0.4, 0.4), collide: false });
  }
  for (let t = 2.6; t < len - 1.6; t += 2.4) for (const k of [-1, 1]) {
    const p = beside(t, k, 0.95);
    // 디딤돌 길의 등이 바로 옆에 이미 서 있으면 또 세우지 않는다
    if (!p || w.furniture.some((f) => f.kind === 'pathLight' && Math.hypot(cxOf(f) - p.x, czOf(f) - p.z) < 0.9)) continue;
    addFurniture(w, { kind: 'pathLight', level: 1, ...around(p.x, p.z, 0.22, 0.22), collide: false });
  }
  // 방명록: 현관 앞, 길 오른쪽에 비켜서
  const book = at(1.6, 1, 1.9);
  if (inside(L, book.x, book.z, -0.3)) {
    addFurniture(w, { kind: 'guestbook', level: 1, ...around(book.x, book.z, 0.5, 0.42), rot: rot + Math.PI / 2, collide: false });
    w.hotspots.push({
      id: 'guestbook', level: 1, x: book.x - px.x * 0.8, z: book.z - px.z * 0.8, r: 1.0, slug: 'living', kind: 'room',
      title: '방명록', line: '이 집에 사는 다섯 사람에게 건네고 싶은 한마디를 남겨 주세요.',
    });
  }
  // 무대 살피기 자리(무대 앞 가운데)
  w.hotspots.push({
    id: 'wedding-stage', level: 1, x: front.x, z: front.z, r: 1.6, kind: 'stage', game: 'who',
    title: '결혼식 무대', line: '두 사람이 서는 무대예요. 올라서서 사진을 찍고(F2), 이 집 사람들의 문장도 맞혀 보세요.',
  });
}
