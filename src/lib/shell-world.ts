// 실측 껍데기(1층 공용 공간의 벽·문·창·방 데이터, 원본 단위 cm)를 걷기 세계(HouseWorld, m)로 바꾼다.
// 관리자 전용 「실측 1층 (시험)」 지도의 원천이다. 데이터는 저장소에 없고 서버가 환경 변수에서 읽어 넘긴다(lib/house-shell.ts).
// 순수 함수라 시험에서 그대로 돈다. 모양이 어긋나면 고치려 들지 않고 null(부르는 쪽이 「없음」으로 다룬다).
//
// 좌표: 원본은 평면(x 오른쪽, y 아래). 세계는 x는 그대로, z는 원본 y를 쓰고, 집 앞(원본 y가 가장 큰 끝)이 z = 0이 되게 옮긴다.
//  - 벽은 두께 그대로 상자. 문·통로는 벽을 끊고 그 위에 인방(header)을 얹는다.
//  - 창은 벽을 끊지 않고 WindowSpec만 둔다: 엔진(scene.ts의 pieces)이 그 자리를 창턱 아래 조각과 창 위 조각으로 나눈다.
//    여기서 조각을 따로 만들면 엔진이 한 번 더 구멍을 낸다.
//  - 공용 칸끼리의 문·통로는 열고, 덩어리(가족 방·모르는 빈칸)나 바깥으로 나가는 문은 닫는다. 가족 방은 이름 없는 막힌 덩어리다.
//  - 계단실은 위로 트여 있다(1층 천장 없음, 2층 높이 위에 덮개 천장). 계단 덩이가 있으면 그 줄기·도착 바닥·난간을,
//    없으면 들어오는 쪽에서 맞은편으로 오르는 곧은 계단 하나를 짓는다. 2층은 도착 바닥까지만이고 그 밖의 2층 높이는 막는다.
import type { Box, CeilingSpec, DoorSpec, FloorSpec, HouseWorld, Level, Ramp, WallSpec, WallStyle, WindowSpec, Zone } from '@/walk/types';
import { RADIUS, STEP, blocked, rampY } from '@/walk/physics';

type Axis = 'x' | 'z';
type Rect = { x1: number; x2: number; z1: number; z2: number };
type Plan = { x: number; y: number; w: number; h: number };

/** 원본 한 변·좌표의 상한(원본 단위). 이보다 크면 깨진 데이터로 본다 */
const LIMIT = 100_000;
/** 목록 하나에 받는 줄 수 상한 */
const MAX_ITEMS = 2000;
/** 원본 단위 → m */
const UNIT = 0.01;
/** 2층 바닥 높이·천장 높이로 받는 범위(m) */
const LEVEL_RANGE = [1.5, 10] as const;
/** 문·창 머리로 받는 상한(m) */
const HEAD_MAX = 10;
/** 이보다 짧은 벽 조각은 버린다(m) */
const MIN_PIECE = 0.01;
/** 맞닿았다고 보는 틈(m) */
const TOUCH = 0.03;
/** 문 양쪽이 어느 칸인지 볼 때 문 면에서 떨어진 거리(m). 앞의 것에 아무것도 없으면 다음 것 */
const PROBE = [0.3, 0.6] as const;
/** 2층 도착 바닥 가장자리 난간 높이(m) */
const RAIL_H = 0.9;
/** 곧은 계단(계단 덩이가 없을 때): 들어오는 쪽 빈자리, 위 도착 바닥 깊이(m). 계단실 길이의 몫으로도 묶는다 */
const STRAIGHT = { clear: 0.8, clearShare: 0.15, arrival: 1.0, arrivalShare: 0.2, minRun: 1.0 } as const;
/** 들어오는 자리: 바깥문 안쪽으로 이만큼(m) */
const SPAWN_IN = 1.0;
/** 닫힌 가족 방 문(엔진이 문패를 달지 않는 이름) */
const CLOSED_LABEL = '닫힌 방';
/** 세계 종류 */
export const SHELL_KIND = 'shell' as const;
/** 받는 형식 이름(…/0.x) */
const FORMAT = /(^|-)house-shell\/0\.\d+$/;

type Room = Rect & { name: string; kitchen: boolean; ceiling: number | null; open: boolean };
type Opening = Rect & { kind: 'door' | 'passage' | 'window'; sill: number; head: number };
type Flight = Rect & { axis: Axis; y0: number; y1: number; steps?: number };
type Rail = Rect & { level: 0 | 1 | 2 };
/** 받은 데이터를 m·세계 좌표로 옮긴 것 */
export type Shell = {
  floor2: number;
  ceiling: number;
  steps: number;
  rooms: Room[];
  /** 계단실(위로 트인 칸) 번호, 없으면 -1 */
  stair: number;
  walls: Array<Rect & { outer: boolean }>;
  masses: Rect[];
  outdoors: Rect[];
  openings: Opening[];
  flights: { ramps: Flight[]; arrival: Rect | null; rails: Rail[] } | null;
};

// ───────── 받은 데이터 읽기

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const list = (v: unknown): unknown[] | null => (Array.isArray(v) && v.length <= MAX_ITEMS ? v : null);
const str = (v: unknown, max = 64): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const inRange = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;
/** mm로 반올림(JSON을 짧고 늘 같게) */
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function planRect(v: unknown): Plan | null {
  if (!isObj(v)) return null;
  const { x, y, w, h } = v;
  if (!num(x) || !num(y) || !num(w) || !num(h) || w <= 0 || h <= 0) return null;
  if (Math.abs(x) > LIMIT || Math.abs(y) > LIMIT || w > LIMIT || h > LIMIT) return null;
  return { x, y, w, h };
}

/** 원본 높이(원본 단위) → m. 범위 밖이면 null */
const height = (v: unknown, range: readonly [number, number]): number | null => (num(v) && inRange(v * UNIT, range) ? v * UNIT : null);

/**
 * 받은 JSON을 읽어 m·세계 좌표로 옮긴다. 필요한 칸이 없거나 모양이 틀리면 null. 모르는 필드는 무시하고, 모르는 종류의 개구부는 건너뛴다.
 * 공부·대기 메모(줄자·스캔·확인 대기 글)는 읽지 않는다.
 */
export function parseShell(input: unknown): Shell | null {
  if (!isObj(input) || typeof input.format !== 'string' || !FORMAT.test(input.format)) return null;
  if (isObj(input.source) && input.source.units !== undefined && input.source.units !== 'cm') return null;
  const H = input.heights;
  if (!isObj(H)) return null;
  const floor2 = height(H.floor2, LEVEL_RANGE);
  const ceiling = height(H.defaultCeiling1F, LEVEL_RANGE);
  if (floor2 === null || ceiling === null) return null;
  const doorHead = height(H.doorHead, [0.5, HEAD_MAX]);
  const archCrown = height(H.archCrown, [0.5, HEAD_MAX]);
  const steps = num(H.stairSteps) && Number.isInteger(H.stairSteps) && H.stairSteps >= 2 && H.stairSteps <= 80
    ? H.stairSteps : Math.max(2, Math.round(floor2 / 0.17));

  const roomList = list(input.rooms), wallList = list(input.walls);
  if (!roomList?.length || !wallList?.length) return null;
  const neighbourList = input.neighbours === undefined ? [] : list(input.neighbours);
  const voidList = input.voids === undefined ? [] : list(input.voids);
  const openingList = input.openings === undefined ? [] : list(input.openings);
  if (!neighbourList || !voidList || !openingList) return null;

  type Raw<T> = Plan & T;
  const rooms: Array<Raw<{ id: string; name: string; kitchen: boolean; ceiling: number | null; open: boolean }>> = [];
  for (const v of roomList) {
    const r = planRect(v);
    if (!r || !isObj(v)) return null;
    const id = str(v.id);
    if (!id) return null;
    const c = isObj(v.ceiling) ? v.ceiling : {};
    const open = c.value === null;
    rooms.push({ ...r, id, name: (str(v.name, 40) ?? '').trim(), kitchen: v.kind === 'kitchen', open, ceiling: open ? null : height(c.value, LEVEL_RANGE) });
  }
  const walls: Array<Raw<{ outer: boolean }>> = [];
  for (const v of wallList) {
    const r = planRect(v);
    if (!r || !isObj(v)) return null;
    walls.push({ ...r, outer: v.type === 'outer' });
  }
  const masses: Plan[] = [], outdoors: Plan[] = [];
  for (const v of neighbourList) {
    const r = planRect(v);
    if (!r || !isObj(v)) return null;
    if (v.kind === 'private-mass') masses.push(r);
    else if (v.kind === 'outdoor') outdoors.push(r);
  }
  for (const v of voidList) {
    const r = planRect(v);
    if (!r) return null;
    masses.push(r);
  }
  const openings: Array<Raw<{ kind: Opening['kind']; sill: number; head: number }>> = [];
  for (const v of openingList) {
    if (!isObj(v)) return null;
    const kind = v.type;
    if (kind !== 'door' && kind !== 'passage' && kind !== 'window') continue;
    const r = planRect(v);
    if (!r) return null;
    const sill = v.sill === undefined || v.sill === null ? 0 : height(v.sill, [0, HEAD_MAX]);
    // 머리 높이가 없으면 종류의 기본값(문 머리, 아치 꼭대기). 있는데 틀린 값이면 깨진 데이터
    const given = v.head !== undefined && v.head !== null;
    const head = given ? height(v.head, [0.5, HEAD_MAX]) : kind === 'passage' ? archCrown : kind === 'door' ? doorHead : null;
    if (sill === null || head === null || head <= sill) return null;
    openings.push({ ...r, kind, sill, head });
  }
  const over = isObj(input.stairOpening2F) ? str(input.stairOpening2F.over) : null;
  let stair = over ? rooms.findIndex((r) => r.id === over) : -1;
  if (stair < 0) stair = rooms.findIndex((r) => r.open);

  // 계단 덩이(없어도 된다): 줄기 높이는 from = 작은 좌표 끝, to = 큰 좌표 끝(원본 단위)
  type RawFlight = Raw<{ axis: Axis; y0: number; y1: number; steps?: number }>;
  type RawRail = Raw<{ level: 0 | 1 | 2 }>;
  let flights: { ramps: RawFlight[]; arrival: Plan | null; rails: RawRail[] } | null = null;
  if (input.stair !== undefined && input.stair !== null) {
    const s = input.stair;
    if (!isObj(s)) return null;
    const fl = list(s.flights), rl = s.rails === undefined ? [] : list(s.rails);
    if (!fl?.length || !rl) return null;
    const ramps: RawFlight[] = [];
    for (const v of fl) {
      const r = planRect(v);
      if (!r || !isObj(v) || (v.along !== 'x' && v.along !== 'y')) return null;
      const y0 = height(v.from, [0, floor2 + 1]), y1 = height(v.to, [0, floor2 + 1]);
      if (y0 === null || y1 === null) return null;
      const st = num(v.steps) && Number.isInteger(v.steps) && v.steps >= 1 && v.steps <= 80 ? v.steps : undefined;
      ramps.push({ ...r, axis: v.along === 'x' ? 'x' : 'z', y0, y1, ...(st ? { steps: st } : {}) });
    }
    const rails: RawRail[] = [];
    for (const v of rl) {
      const r = planRect(v);
      if (!r || !isObj(v)) return null;
      const level = v.level === 0 || v.level === 2 ? v.level : 1;
      rails.push({ ...r, level });
    }
    const arrival = s.arrival === undefined || s.arrival === null ? null : planRect(s.arrival);
    if (s.arrival !== undefined && s.arrival !== null && !arrival) return null;
    flights = { ramps, arrival, rails };
  }

  // 세계 좌표: 집(방·벽·덩어리)의 가운데 x가 0, 집 앞 끝이 z = 0
  const solid = [...rooms, ...walls, ...masses];
  const minX = Math.min(...solid.map((r) => r.x)), maxX = Math.max(...solid.map((r) => r.x + r.w));
  const maxY = Math.max(...solid.map((r) => r.y + r.h));
  const cx = (minX + maxX) / 2;
  const box = (r: Plan): Rect => ({ x1: r3((r.x - cx) * UNIT), x2: r3((r.x + r.w - cx) * UNIT), z1: r3((r.y - maxY) * UNIT), z2: r3((r.y + r.h - maxY) * UNIT) });
  return {
    floor2: r3(floor2), ceiling: r3(ceiling), steps,
    rooms: rooms.map((r) => ({ ...box(r), name: r.name, kitchen: r.kitchen, ceiling: r.ceiling === null ? null : r3(r.ceiling), open: r.open })),
    stair,
    walls: walls.map((w) => ({ ...box(w), outer: w.outer })),
    masses: masses.map(box),
    outdoors: outdoors.map(box),
    openings: openings.map((o) => ({ ...box(o), kind: o.kind, sill: r3(o.sill), head: r3(o.head) })),
    flights: flights && {
      ramps: flights.ramps.map((f) => ({ ...box(f), axis: f.axis, y0: r3(f.y0), y1: r3(f.y1), ...(f.steps ? { steps: f.steps } : {}) })),
      arrival: flights.arrival && box(flights.arrival),
      rails: flights.rails.map((r) => ({ ...box(r), level: r.level })),
    },
  };
}

// ───────── 사각형 셈

const along = (r: Rect, axis: Axis): [number, number] => (axis === 'x' ? [r.x1, r.x2] : [r.z1, r.z2]);
const across = (r: Rect, axis: Axis): [number, number] => (axis === 'x' ? [r.z1, r.z2] : [r.x1, r.x2]);
const axisOf = (r: Rect): Axis => (r.x2 - r.x1 >= r.z2 - r.z1 ? 'x' : 'z');
const area = (r: Rect) => Math.max(0, r.x2 - r.x1) * Math.max(0, r.z2 - r.z1);
function intersect(a: Rect, b: Rect): Rect | null {
  const r = { x1: Math.max(a.x1, b.x1), x2: Math.min(a.x2, b.x2), z1: Math.max(a.z1, b.z1), z2: Math.min(a.z2, b.z2) };
  return r.x2 - r.x1 > 1e-4 && r.z2 - r.z1 > 1e-4 ? r : null;
}
/** 두 사각형이 한 변을 맞대는가(모서리 한 점만 닿는 것은 아니다) */
function touches(a: Rect, b: Rect, tol = TOUCH): boolean {
  const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), oz = Math.min(a.z2, b.z2) - Math.max(a.z1, b.z1);
  return (ox > tol && oz > -tol) || (oz > tol && ox > -tol);
}
const inside = (r: Rect, x: number, z: number, pad = 0) => x > r.x1 - pad && x < r.x2 + pad && z > r.z1 - pad && z < r.z2 + pad;
const bounds = (rs: readonly Rect[]): Rect => ({
  x1: Math.min(...rs.map((r) => r.x1)), x2: Math.max(...rs.map((r) => r.x2)),
  z1: Math.min(...rs.map((r) => r.z1)), z2: Math.max(...rs.map((r) => r.z2)),
});
const rect = (r: Rect): Rect => ({ x1: r3(r.x1), x2: r3(r.x2), z1: r3(r.z1), z2: r3(r.z2) });
const boxOf = (r: Rect, level: 0 | 1 | 2, tag?: string): Box => ({ ...rect(r), level, ...(tag ? { tag } : {}) });

/** 벽 조각 p에서 구멍 h가 지나는 자리를 뺀다. 벽 방향의 앞뒤 조각과, 구멍이 벽 두께를 다 덮지 못한 얇은 남은 조각 */
function cut(p: Rect, h: Rect, axis: Axis): Rect[] {
  const i = intersect(p, h);
  if (!i) return [p];
  const [a0, a1] = along(p, axis), [b0, b1] = along(i, axis), [c0, c1] = across(p, axis), [d0, d1] = across(i, axis);
  const mk = (u0: number, u1: number, w0: number, w1: number): Rect => (axis === 'x' ? { x1: u0, x2: u1, z1: w0, z2: w1 } : { x1: w0, x2: w1, z1: u0, z2: u1 });
  const out: Rect[] = [];
  if (b0 - a0 > MIN_PIECE) out.push(mk(a0, b0, c0, c1));
  if (a1 - b1 > MIN_PIECE) out.push(mk(b1, a1, c0, c1));
  if (d0 - c0 > MIN_PIECE) out.push(mk(b0, b1, c0, d0));
  if (c1 - d1 > MIN_PIECE) out.push(mk(b0, b1, d1, c1));
  return out;
}

/** 구간 목록에서 [a, b]를 뺀다 */
function minus(spans: Array<[number, number]>, a: number, b: number): Array<[number, number]> {
  return spans.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q] as [number, number]] : [
    ...(a > p ? [[p, a] as [number, number]] : []), ...(b < q ? [[b, q] as [number, number]] : []),
  ]));
}

// ───────── 세계 짓기

type Side = { kind: 'room'; at: number } | { kind: 'mass' } | { kind: 'outdoor' } | { kind: 'none' };

/** 옮긴 데이터로 걷기 세계를 짓는다 */
export function buildShellWorld(s: Shell): HouseWorld {
  const { floor2, ceiling } = s;
  const stairRoom = s.stair >= 0 ? s.rooms[s.stair] : null;
  /** 2층 높이 덮개 천장: 계단실은 2층 바닥에서 1층 기본 천장 높이만큼 더 올라간 곳까지 트여 있다 */
  const shaftTop = r3(floor2 + ceiling);
  const roomTop = (r: Room) => (r === stairRoom ? shaftTop : r.ceiling ?? ceiling);
  const house = rect(bounds([...s.rooms, ...s.walls, ...s.masses]));

  const sideAt = (x: number, z: number): Side => {
    const at = s.rooms.findIndex((r) => inside(r, x, z));
    if (at >= 0) return { kind: 'room', at };
    if (s.masses.some((m) => inside(m, x, z))) return { kind: 'mass' };
    if (s.outdoors.some((o) => inside(o, x, z))) return { kind: 'outdoor' };
    return { kind: 'none' };
  };
  /** 개구부가 놓인 벽(가장 많이 겹치는 벽)과 그 방향 */
  const hostOf = (o: Rect) => {
    let best: (typeof s.walls)[number] | null = null, most = 0;
    for (const w of s.walls) {
      const i = intersect(w, o);
      const a = i ? area(i) : 0;
      if (a > most) { most = a; best = w; }
    }
    return { wall: best, axis: best ? axisOf(best) : axisOf(o) };
  };
  /** 개구부 양쪽(벽 두께 방향으로 조금 떨어진 두 점)이 어느 칸인지 */
  const sidesOf = (o: Rect, axis: Axis): [Side, Side] => {
    const [u0, u1] = along(o, axis), [w0, w1] = across(o, axis), u = (u0 + u1) / 2;
    const look = (v: number, dir: number): Side => {
      for (const d of PROBE) {
        const w = v + dir * d;
        const side = axis === 'x' ? sideAt(u, w) : sideAt(w, u);
        if (side.kind !== 'none') return side;
      }
      return { kind: 'none' };
    };
    return [look(w0, -1), look(w1, 1)];
  };

  type Hole = Opening & { axis: Axis; open: boolean; sides: [Side, Side] };
  const holes: Hole[] = [];
  const windows: Array<Opening & { axis: Axis; at: number }> = [];
  for (const o of s.openings) {
    const { wall, axis } = hostOf(o);
    if (o.kind === 'window') {
      const [c0, c1] = across(wall ?? o, axis);
      windows.push({ ...o, axis, at: (c0 + c1) / 2 });
      continue;
    }
    const sides = sidesOf(o, axis);
    const rooms = sides.filter((x) => x.kind === 'room').length;
    // 공용 칸에 닿지 않는 문은 벽으로 둔다
    if (!rooms) continue;
    holes.push({ ...o, axis, sides, open: rooms === 2 });
  }

  const walls: WallSpec[] = [], headers: WallSpec[] = [], doors: DoorSpec[] = [], boxes: Box[] = [];
  const floors: FloorSpec[] = [], ceilings: CeilingSpec[] = [], zones: Zone[] = [], ramps: Ramp[] = [];
  const wallSpec = (r: Rect, level: 0 | Level, baseY: number, h: number, style: WallStyle, axis: Axis): WallSpec =>
    ({ box: boxOf(r, level), baseY: r3(baseY), height: r3(h), style, axis });

  // 벽: 맞닿은 공용 칸 가운데 가장 높은 천장까지(계단실에 닿으면 덮개 천장까지), 바깥에 닿으면 바깥벽 무늬
  for (const w of s.walls) {
    const axis = axisOf(w);
    const near = s.rooms.filter((r) => touches(w, r));
    const top = near.length ? Math.max(...near.map(roomTop)) : ceiling;
    const style: WallStyle = w.outer || s.outdoors.some((o) => touches(w, o)) ? 'ext' : 'int1';
    let pieces: Rect[] = [{ x1: w.x1, x2: w.x2, z1: w.z1, z2: w.z2 }];
    for (const h of holes) {
      const i = intersect(w, h);
      if (!i) continue;
      pieces = pieces.flatMap((p) => cut(p, h, axis));
      if (top - h.head > 0.01) headers.push(wallSpec(i, 1, h.head, top - h.head, style, h.axis));
    }
    for (const p of pieces) {
      walls.push(wallSpec(p, 1, 0, top, style, axis));
      boxes.push(boxOf(p, 1, 'wall'));
    }
  }
  // 가족 방·모르는 빈칸: 이름 없는 막힌 덩어리(1인칭에서는 벽 뒤라 보이지 않고, 3인칭·지도에서 막힌 칸으로 보인다)
  // 그리기 상자는 level 0: 엔진이 창을 같은 층 벽에서만 찾으므로, 얇은 벽 곁의 두꺼운 덩어리에 창 구멍이 나지 않는다
  for (const m of s.masses) {
    walls.push(wallSpec(m, 0, 0, ceiling, 'int1', axisOf(m)));
    boxes.push(boxOf(m, 1, 'wall'));
  }
  // 문·통로: 문턱 바닥, 닫을 곳은 문짝과 막힘 상자
  for (const h of holes) {
    floors.push({ level: 1, ...rect(h), mat: 'oak' });
    if (h.open) continue;
    const toMass = h.sides.some((x) => x.kind === 'mass');
    doors.push({ box: boxOf(h, 1), baseY: 0, height: r3(h.head), style: 'wood', axis: h.axis, closed: true, label: toMass ? CLOSED_LABEL : '' });
    boxes.push(boxOf(h, 1, 'door'));
  }
  // 창: 같은 벽의 문 자리와 겹치는 몫은 뺀다(문 위 인방에 창 구멍이 나지 않게)
  const windowSpecs: WindowSpec[] = [];
  for (const w of windows) {
    let spans: Array<[number, number]> = [along(w, w.axis)];
    for (const h of holes) {
      if (h.axis !== w.axis || Math.abs((across(h, h.axis)[0] + across(h, h.axis)[1]) / 2 - w.at) > 0.5) continue;
      const [a, b] = along(h, h.axis);
      spans = minus(spans, a, b);
    }
    for (const [from, to] of spans) {
      if (to - from < 0.2) continue;
      windowSpecs.push({ level: 1, axis: w.axis, at: r3(w.at), from: r3(from), to: r3(to), sill: r3(w.sill), top: r3(w.head) });
    }
  }
  // 방: 바닥, 천장(계단실은 2층 높이 위 덮개 하나), 구역 이름
  s.rooms.forEach((r) => {
    floors.push({ level: 1, ...rect(r), mat: r.kitchen ? 'tile' : 'oak' });
    if (r === stairRoom) ceilings.push({ level: 2, ...rect(r), y: shaftTop });
    else ceilings.push({ level: 1, ...rect(r), y: r3(roomTop(r)) });
    zones.push({ level: 1, ...rect(r), name: r.name });
  });
  // 열린 문턱도 한쪽 방 이름으로(문을 지나는 동안 장소 이름이 바깥으로 튀지 않게)
  for (const h of holes) {
    const side = h.sides.find((x): x is Extract<Side, { kind: 'room' }> => x.kind === 'room');
    if (h.open && side) zones.push({ level: 1, ...rect(h), name: s.rooms[side.at].name });
  }

  // ───────── 계단
  if (stairRoom) {
    const stair = s.flights?.ramps.length ? s.flights : straightStair(s, stairRoom, holes);
    if (stair) {
      for (const f of stair.ramps) ramps.push({ ...rect(f), axis: f.axis, y0: f.y0, y1: f.y1, ...(f.steps ? { steps: f.steps } : {}) });
      // 한 층 높이의 반보다 높은 줄기·계단참 밑은 1층에서 들어가지 못하게(그 위를 걷는 몸은 이미 2층으로 친다)
      for (const r of ramps) if (Math.min(r.y0, r.y1) > floor2 / 2) boxes.push(boxOf(r, 1, 'stair'));
      for (const r of stair.rails) {
        boxes.push(boxOf(r, r.level, 'rail'));
        // 2층 전용 난간은 엔진이 그리지 않는다: 낮은 벽으로 보인다
        if (r.level === 2) walls.push(wallSpec(r, 2, floor2, RAIL_H, 'int2', axisOf(r)));
      }
      if (stair.arrival) {
        floors.push({ level: 2, ...rect(stair.arrival), mat: 'oak' });
      }
      zones.push({ level: 2, ...rect(stairRoom), name: stairRoom.name });
      // 2층 높이는 계단실 안에서만: 계단실 둘레 바깥을 2층에서 통째로 막는다(1층 벽 상자는 1층에서만 막는다)
      const B = { x1: house.x1 - 1, x2: house.x2 + 1, z1: house.z1 - 1, z2: house.z2 + 1 };
      const R = stairRoom;
      for (const q of [
        { x1: B.x1, x2: R.x1, z1: B.z1, z2: B.z2 }, { x1: R.x2, x2: B.x2, z1: B.z1, z2: B.z2 },
        { x1: R.x1, x2: R.x2, z1: B.z1, z2: R.z1 }, { x1: R.x1, x2: R.x2, z1: R.z2, z2: B.z2 },
      ]) boxes.push(boxOf(q, 2, 'wall'));
      sealTop(floor2, stair.arrival, ramps, boxes, walls, wallSpec);
    }
  }

  const physics = { boxes, ramps, floor2 };
  return {
    kind: SHELL_KIND,
    floor2,
    house,
    floors, walls, headers, doors, ceilings, windows: windowSpecs,
    furniture: [], props: [], zones, hotspots: [],
    physics,
    spawn: spawnOf(s, stairRoom, holes, physics),
  };
}

/**
 * 계단 덩이가 없을 때: 계단실 폭을 다 쓰는 곧은 계단. 열린 문이 난 변에서 맞은편 변으로 오르고, 맨 위는 2층 도착 바닥.
 * 계단실이 너무 짧으면 짓지 않는다(위로 트인 빈 칸으로 남는다)
 */
function straightStair(s: Shell, R: Room, holes: ReadonlyArray<Rect & { open: boolean }>): { ramps: Flight[]; arrival: Rect | null; rails: Rail[] } | null {
  // 들어오는 변: 열린 문 가운데가 가장 가까운 변(없으면 집 앞쪽 변)
  const door = holes.find((h) => h.open && touches(h, R));
  const cx = door ? (door.x1 + door.x2) / 2 : (R.x1 + R.x2) / 2, cz = door ? (door.z1 + door.z2) / 2 : R.z2;
  const gaps = [
    { axis: 'x' as Axis, from: R.x1, dir: 1, d: Math.abs(cx - R.x1) }, { axis: 'x' as Axis, from: R.x2, dir: -1, d: Math.abs(cx - R.x2) },
    { axis: 'z' as Axis, from: R.z1, dir: 1, d: Math.abs(cz - R.z1) }, { axis: 'z' as Axis, from: R.z2, dir: -1, d: Math.abs(cz - R.z2) },
  ].sort((a, b) => a.d - b.d);
  const e = gaps[0];
  const [u0, u1] = along(R, e.axis);
  const len = u1 - u0;
  const clear = Math.min(STRAIGHT.clear, len * STRAIGHT.clearShare), arrive = Math.min(STRAIGHT.arrival, len * STRAIGHT.arrivalShare);
  const run = len - clear - arrive;
  if (run < STRAIGHT.minRun) return null;
  // 낮은 끝(들어오는 쪽)과 높은 끝 좌표
  const low = e.from + e.dir * clear, high = low + e.dir * run, end = high + e.dir * arrive;
  const [lo, hi] = [Math.min(low, high), Math.max(low, high)];
  const [ao, ai] = [Math.min(high, end), Math.max(high, end)];
  const mk = (a: number, b: number): Rect => (e.axis === 'x' ? { x1: a, x2: b, z1: R.z1, z2: R.z2 } : { x1: R.x1, x2: R.x2, z1: a, z2: b });
  // y0은 작은 좌표 끝의 높이
  const up = e.dir > 0;
  const ramp: Flight = { ...mk(lo, hi), axis: e.axis, y0: up ? 0 : s.floor2, y1: up ? s.floor2 : 0, steps: s.steps };
  return { ramps: [ramp], arrival: mk(ao, ai), rails: [] };
}

/**
 * 2층 높이에서 허공으로 걸어 나가지 못하게 막는다. 걷기 물리에서 2층 바닥은 끝없는 평면이라, 도착 바닥이나 2층 바닥 높이에 가까운
 * 계단 끝에서 바깥이 다른 계단·도착 바닥이 아니고 막는 상자도 없으면 그 변을 따라 2층 상자와 낮은 난간을 둔다.
 */
function sealTop(
  floor2: number, arrival: Rect | null, ramps: readonly Ramp[], boxes: Box[], walls: WallSpec[],
  wallSpec: (r: Rect, level: 0 | Level, baseY: number, h: number, style: WallStyle, axis: Axis) => WallSpec,
) {
  const STEP_GAP = 0.1, IN = 0.02, T = 0.06;
  const heightIn = (x: number, z: number): number | null => {
    if (arrival && inside(arrival, x, z, 1e-6)) return floor2;
    for (const r of ramps) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return rampY(r, x, z);
    return null;
  };
  const covered = (x: number, z: number) => boxes.some((b) => (b.level === 0 || b.level === 2) && inside(b, x, z, T));
  const tops: Rect[] = [...(arrival ? [arrival] : []), ...ramps.filter((r) => Math.max(r.y0, r.y1) >= floor2 - STEP)];
  const seals: Array<{ r: Rect; axis: Axis }> = [];
  for (const t of tops) {
    const edges: Array<{ axis: Axis; at: number; out: number; u0: number; u1: number }> = [
      { axis: 'x', at: t.z1, out: -1, u0: t.x1, u1: t.x2 }, { axis: 'x', at: t.z2, out: 1, u0: t.x1, u1: t.x2 },
      { axis: 'z', at: t.x1, out: -1, u0: t.z1, u1: t.z2 }, { axis: 'z', at: t.x2, out: 1, u0: t.z1, u1: t.z2 },
    ];
    for (const e of edges) {
      let run: [number, number] | null = null;
      const flush = () => {
        if (!run) return;
        const [a, b] = run;
        const r = e.axis === 'x'
          ? { x1: a, x2: b, z1: e.out < 0 ? e.at - T : e.at, z2: e.out < 0 ? e.at : e.at + T }
          : { x1: e.out < 0 ? e.at - T : e.at, x2: e.out < 0 ? e.at : e.at + T, z1: a, z2: b };
        seals.push({ r, axis: e.axis });
        run = null;
      };
      for (let u = e.u0 + STEP_GAP / 2; u < e.u1; u += STEP_GAP) {
        const pin = e.axis === 'x' ? [u, e.at - e.out * IN] : [e.at - e.out * IN, u];
        const pout = e.axis === 'x' ? [u, e.at + e.out * IN] : [e.at + e.out * IN, u];
        const hin = heightIn(pin[0], pin[1]);
        const hout = heightIn(pout[0], pout[1]);
        const leak = hin !== null && hin >= floor2 - STEP && (hout === null || Math.abs(hout - hin) > STEP) && !covered(pout[0], pout[1]);
        if (leak) {
          const a = Math.max(e.u0, u - STEP_GAP / 2), b = Math.min(e.u1, u + STEP_GAP / 2);
          run = run ? [run[0], b] : [a, b];
        } else flush();
      }
      flush();
    }
  }
  for (const { r, axis } of seals) {
    boxes.push(boxOf(r, 2, 'rail'));
    walls.push(wallSpec(r, 2, floor2, RAIL_H, 'int2', axis));
  }
}

/** 들어오는 자리: 집 앞쪽 바깥문 안쪽 1m쯤에서 집 안을 본다. 바깥문이 없거나 그 자리가 막혔으면 가장 큰 방 가운데 */
function spawnOf(s: Shell, stairRoom: Room | null, holes: ReadonlyArray<Opening & { axis: Axis; open: boolean; sides: [Side, Side] }>, physics: HouseWorld['physics']) {
  const free = (x: number, z: number) => !blocked(physics, 1, x, z, RADIUS + 0.05) && s.rooms.some((r) => inside(r, x, z));
  const outside = holes
    .map((h) => ({ h, i: h.sides.findIndex((x) => x.kind === 'room'), o: h.sides.findIndex((x) => x.kind === 'outdoor' || x.kind === 'none') }))
    .filter((c) => !c.h.open && c.i >= 0 && c.o >= 0)
    .sort((a, b) => b.h.z2 - a.h.z2);
  for (const { h, i } of outside) {
    const room = s.rooms[(h.sides[i] as { at: number }).at];
    const [w0, w1] = across(h, h.axis), [u0, u1] = along(h, h.axis);
    // 안쪽 방향(i = 0이면 작은 좌표 쪽)
    const dir = i === 0 ? -1 : 1;
    const face = i === 0 ? w0 : w1;
    const u = (u0 + u1) / 2;
    const [r0, r1] = across(room, h.axis);
    const t = Math.min(Math.max(face + dir * SPAWN_IN, r0 + 0.35), Math.max(r0 + 0.35, r1 - 0.35));
    const x = h.axis === 'x' ? u : t, z = h.axis === 'x' ? t : u;
    // 앞쪽 = (-sin yaw, -cos yaw): 안쪽 방향을 본다
    const nx = h.axis === 'x' ? 0 : dir, nz = h.axis === 'x' ? dir : 0;
    if (free(x, z)) return { x: r3(x), z: r3(z), yaw: r3(Math.atan2(-nx, -nz)) };
  }
  // 계단실 가운데는 계단 밑 막힘 상자 안일 수 있어 빼고 고른다
  const big = [...s.rooms].filter((r) => r !== stairRoom || s.rooms.length === 1).sort((a, b) => area(b) - area(a))[0];
  return { x: r3((big.x1 + big.x2) / 2), z: r3((big.z1 + big.z2) / 2), yaw: 0 };
}

/** 지은 세계가 엔진이 기대하는 모양인가(실측 지도 전용 종류) */
export function isShellWorld(w: unknown): w is HouseWorld {
  if (!isObj(w)) return false;
  const arrays = ['floors', 'walls', 'headers', 'doors', 'ceilings', 'windows', 'furniture', 'props', 'zones', 'hotspots'];
  const physics = w.physics;
  return w.kind === SHELL_KIND && num(w.floor2) && arrays.every((k) => Array.isArray(w[k]))
    && isObj(physics) && Array.isArray(physics.boxes) && Array.isArray(physics.ramps) && num(physics.floor2)
    && isObj(w.spawn) && num(w.spawn.x) && num(w.spawn.z) && num(w.spawn.yaw) && isObj(w.house);
}

/** 받은 JSON → 걷기 세계. 모양이 틀리면 null */
export function shellToWorld(input: unknown): HouseWorld | null {
  const s = parseShell(input);
  if (!s) return null;
  const w = buildShellWorld(s);
  return isShellWorld(w) ? w : null;
}
