// 집 안팎을 오가는 반려동물의 일정. 서버 없이 시각만으로 정한다: 같은 세계에서 같은 시각이면 어느 화면이든 같은 자리·같은 자세다.
// 시각을 PET_SLOT_MS 칸으로 나누고(유닉스 시각 기준이라 기기의 시간대와 상관없다), 칸 번호와 고정 씨앗으로 칸마다 갈 곳을 고른다.
// 칸 k에는 칸 k-1의 갈 곳에서 칸 k의 갈 곳까지 간다: 잠깐 더 앉아 있다가 → 떠날 쪽으로 돌아서서 → 길 찾기(findPath)의 길을
// 걷는 빠르기로 따라가고 → 닿으면 돌아 앉아 남은 시간을 쉰다. 칸은 서로 기대지 않아(앞 칸의 길을 몰라도 된다) 어느 때든 바로 계산한다.
// 갈 곳은 길 찾기 목록(destinations)과 마당 잔디 위의 몇 자리. 모두 들어오는 자리와 이어진 평평한 바닥 칸이라 서로 길이 있고,
// 계단·경사면 위에서는 쉬지 않는다. 세 칸마다 마당 한 번, 집 안 두 번이고 집 안 차례에 가끔 2층으로 간다.
//
// 친구 찾아가기(함께 걷기에서만): 친구(설정의 이름과 무게)가 같은 집에 있으면, 칸이 시작하기 조금 전(DECIDE_LEAD_MS)에 그 칸을
// 정한다. 주사위와 이름 차례로 늘어놓은 친구 목록만 보고 정하므로 같은 사람들을 보는 화면은 같은 판단을 한다. 찾아가기로 하면
// 무게로 친구 하나를 고르고, 그때 그 친구 자리에서 0.8~1.2m 떨어진 평평한 칸(주사위로 고른 쪽)으로 간다. 멀면 뛰어가고, 닿으면
// 친구 쪽을 보고 앉아 운다(일정이 띄우는 말풍선이라 모든 화면에서 같은 때). 그 칸을 정할 때를 보지 못한 화면(늦게 들어온 화면,
// 숨었던 탭)은 그 칸을 정해진 일정대로 둔다: 앞 칸의 끝 자리에서 이어 가므로 튀지 않는다. 친구가 없으면 정해진 일정 그대로다.
//
// 둘러보기: 쉬는 동안 몇 초마다 다른 쪽을 본다(주사위로 고른 쪽, 친구 곁이면 고개를 돌렸다가 다시 친구를 본다). 크게 돌 때는
// 일어서서 돌고 다시 앉는다. 쉬는 창이 시작할 때와 끝나기 조금 전에는 늘 원래 쪽을 보고 있어서, 떠날 때와 칸 경계에서 방향이 튀지 않는다.
// 말풍선이 떠 있는 동안에는 돌지 않는다(친구를 보고 말한다). 털을 고르는 중에는 둘러보지 않는다.
// three.js에 의존하지 않아 시험에서 그대로 돈다. 그리는 일은 pet-view.ts가 한다.
import { destinations, findPath, openSpot, type NavPoint } from './nav';
import type { PetExtraRest, PetFriend, PetRest } from './pet-spec';
import type { HouseWorld, Level } from './types';

export type PetZone = 'yard' | 'house' | 'up';
/** 반려동물이 가서 쉬는 자리(길 찾기 격자의 칸). yaw는 앉아서 보는 쪽: 로컬 +z가 (sin yaw, cos yaw)를 향한다 */
export type PetSpot = NavPoint & { yaw: number; zone: PetZone };
/** 한 칸이 끝날 때 쉬는 자리와 자세. friend는 친구 곁(찾아간 자리)인가 */
export type PetStop = PetSpot & { rest: PetRest; friend: boolean };
export type PetPose = 'walk' | 'rest';
/** 걸음: 걷기 또는 뛰기(먼 친구에게 갈 때) */
export type PetGait = 'walk' | 'run';
/**
 * 한 때의 모습. pitch는 오르내리는 기울기(rad, 오르막이 +, 계단에서 몸을 기울인다), dist는 이 칸에서 간 거리(m, 걸음 흔들림의 박자),
 * speed는 지금 빠르기(m/s), gait는 걷는지 뛰는지, rest는 쉬는 자세(걷는 동안은 닿아서 앉을 자세), meow는 일정이 띄우는 말풍선,
 * visit은 친구에게 가는 칸인가, talk는 일정이 띄우는 말을 고르는 주사위(pet-talk.ts), glance는 둘러보느라 원래 쪽에서 돈 각(rad,
 * yaw에 이미 들어 있다), resettle은 크게 돌려고 일어서 있는가(그동안 pose는 'walk')
 */
export type PetState = {
  x: number; y: number; z: number; level: Level; yaw: number; pitch: number; pose: PetPose; moving: boolean; speed: number; dist: number;
  gait: PetGait; rest: PetRest; meow: boolean; visit: boolean; talk: number; glance: number; resettle: boolean;
};

/** 한 칸(ms). 칸마다 한 번 옮겨 간다 */
export const PET_SLOT_MS = 45_000;
/** 걷는 빠르기(m/s). 길이 길면 칸 안에 닿도록 더 빨리 걷는다 */
export const PET_WALK = 0.8;
/** 뛰는 빠르기(m/s): 친구가 멀 때 */
export const PET_RUN = 2.2;
/** 이 빠르기(m/s) 이상이면 gait를 'run'으로 알린다(뛰기를 늦추는 동안 걷기로 바뀐다) */
export const PET_RUN_FROM = 1.4;
/** 떠날 때·닿았을 때 제자리에서 돌아서는 시간(ms) */
export const PET_TURN_MS = 700;
/** 일정이 띄우는 말풍선이 떠 있는 시간(ms): 한마디와 속마음을 읽을 만큼. 닿은 뒤 적어도 쉬는 시간(REST_MIN_MS)보다 짧아야 칸 안에서 끝난다 */
export const PET_MEOW_MS = 4500;
/** 다음 칸을 이만큼 앞서(ms) 정한다: 그사이 쉬는 틈에 길을 찾아 둔다 */
export const DECIDE_LEAD_MS = 2000;
/** 칸이 시작한 뒤 이만큼(ms) 안에 처음 보는 화면은 아직 그 칸을 정할 수 있다. 그 뒤로는 정해진 일정대로 */
export const DECIDE_LATE_MS = 1000;
/** 떠나기 전에 더 앉아 있는 시간의 상한(ms, 칸마다 다르다) */
const LINGER_MS = 8_000;
/** 친구에게 갈 때 떠나기 전에 앉아 있는 시간(ms): 이만큼에 주사위로 VISIT_LINGER_SPAN까지 더한다 */
const VISIT_LINGER_MIN = 300;
const VISIT_LINGER_SPAN = 1500;
/** 닿은 뒤 적어도 이만큼은 앉아 있다(ms) */
const REST_MIN_MS = 5_000;
/** 집 안으로 갈 차례에 2층으로 갈 몫 */
const UP_CHANCE = 0.12;
/** 마당 잔디 위 자리의 간격과, 잔디 가장자리·집 외곽에서 띄우는 거리(m) */
const YARD_STEP = 4;
const YARD_INSET = 1;
/** 마당 자리 상한(넓은 잔디도 이만큼만, 고르게 솎는다) */
const YARD_MAX = 16;
/** 이보다 가까운 자리는 하나로 친다(m) */
const SPOT_GAP = 1.2;
/** 길 찾기 목록의 자리를 평평한 칸으로 맞출 때 찾는 거리(m) */
const SNAP_DEST = 0.6;
/** 모퉁이를 부드럽게 돌게, 바라볼 쪽을 길의 앞뒤 이만큼(m)에서 잰다 */
const LOOK = 0.3;
/** 찾아가기 몫: 함께 있는 친구 무게의 합 W로 W / (W + VISIT_EASE), 많아도 VISIT_MAX까지(그래도 가끔은 돌아다닌다) */
const VISIT_EASE = 1.5;
const VISIT_MAX = 0.8;
/** 친구에게서 떨어져 앉는 거리(m): 주사위로 이 사이. 맞춘 칸이 VISIT_OK 밖이면 다른 쪽을 본다 */
const VISIT_NEAR = 0.8;
const VISIT_FAR = 1.2;
const VISIT_OK: readonly [number, number] = [0.7, 1.5];
/** 친구 둘레 칸을 맞출 때 찾는 거리(m)와 둘러보는 쪽 수 */
const VISIT_SNAP = 0.5;
const VISIT_SIDES = 8;
/** 친구에게 가는 길이 이보다 길면(m) 뛰어간다 */
const VISIT_RUN_LEN = 4;
/** 뛰기: 걷는 빠르기에서 뛰는 빠르기로 올리는 시간, 다시 걷는 빠르기로 늦추는 시간(ms), 마지막에 걸어서 다가가는 거리(m) */
const RUN_ACC_MS = 300;
const RUN_SLOW_MS = 400;
const RUN_APPROACH = 1;
/** 친구 곁에서 앉지 않고 식빵 자세로 쉬는 몫(그 모형이 있을 때) */
const FRIEND_LOAF = 0.2;
/** 혼자 닿았을 때 우는 몫(친구 곁에 닿으면 늘 운다) */
const MEOW_ALONE = 1 / 3;
/** 고정 씨앗. 바꾸면 모든 화면의 일정이 함께 바뀐다 */
export const PET_SEED = 0x7a3c51e9;
/** 둘러보기: 쉬기 시작해 처음 고개를 돌리기까지(ms), 한 쪽을 보고 있는 시간(ms)의 범위 */
const GLANCE_FIRST: readonly [number, number] = [900, 2200];
const GLANCE_HOLD: readonly [number, number] = [2000, 4800];
/** 도는 시간(ms): 기본에 돈 각(rad)마다 더한다 */
const GLANCE_TURN_MS = 420;
const GLANCE_TURN_PER_RAD = 300;
/** 쉬는 창이 끝나기 이만큼(ms) 전에는 원래 쪽으로 돌아와 있다 */
const GLANCE_EDGE = 800;
/** 이 각(rad, 약 92°)보다 크게 돌 때는 일어서서 돌고 다시 앉는다(자리를 고쳐 앉는다). 일어서는 데, 앉는 데 드는 시간(ms) */
export const GLANCE_STAND = 1.6;
const GLANCE_STAND_PAD = 260;
/** 쉬는 자세마다 둘러보는 각의 배수: 엎드리거나 누우면 덜 돈다. 털을 고르는 중에는 둘러보지 않는다 */
const GLANCE_SCALE: Readonly<Record<PetRest, number>> = { sit: 1, loaf: 0.7, lie: 0.5, groom: 0 };
/** 친구 곁에서 고개를 돌렸다가 다시 친구를 볼 몫, 혼자일 때 원래 쪽으로 돌아볼 몫 */
const GLANCE_BACK_FRIEND = 0.55;
const GLANCE_BACK = 0.25;
/** 한 번에 이보다 적게(rad) 돌 거면 차라리 원래 쪽을 본다, 이보다 많이 돌 거면(반대편 끝으로) 원래 쪽을 본다 */
const GLANCE_MIN_TURN = 0.3;
const GLANCE_MAX_TURN = 2.8;

// 주사위 번호: 1 2층 몫, 2 고르기, 3 피하기, 4 앉아 있는 시간, 5 혼자 닿았을 때 울기, 6 찾아가기 몫, 7 친구 고르기,
// 8 앉을 쪽, 9 떨어진 거리, 10 쉬는 자세, 11 일정이 띄우는 말, 32부터 둘러보기(쉬는 창마다 128개)

// ───────── 주사위(어느 기기에서나 같은 정수 계산)

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 칸 k의 i번째 주사위: 0 이상 2^32 미만 정수. 씨앗·칸·번호가 같으면 늘 같다 */
export function petDie(seed: number, k: number, i: number): number {
  const lo = k >>> 0;
  const hi = Math.floor(k / 4294967296) >>> 0;
  return mix(mix((seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0) ^ lo ^ Math.imul(hi, 0x27d4eb2f));
}
const unit = (seed: number, k: number, i: number) => petDie(seed, k, i) / 4294967296;

/** 시각(ms)이 드는 칸 번호 */
export const petSlot = (t: number) => Math.floor(t / PET_SLOT_MS);

// ───────── 각

/** a에서 b로 가는 가장 짧은 각 차이(-π..π) */
function turnOf(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const ease = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

// ───────── 갈 곳

/** 세계의 집 외곽 안인가(pad만큼 넓혀 본다) */
function indoors(world: HouseWorld, x: number, z: number, pad = 0): boolean {
  const H = world.house;
  return x > H.x1 - pad && x < H.x2 + pad && z > H.z1 - pad && z < H.z2 + pad;
}
const zoneOf = (world: HouseWorld, p: NavPoint): PetZone => (p.level === 2 ? 'up' : indoors(world, p.x, p.z) ? 'house' : 'yard');

/**
 * 반려동물이 갈 곳: 길 찾기 목록의 자리(방 장면의 놀이·나가는 문, 실제 문이 없는 포털은 뺀다)와 마당 잔디 위 자리.
 * 모두 들어오는 자리와 이어진 평평한 바닥 칸으로 맞추고, 가까운 것은 하나로 친다. 방 장면이면 빈 목록.
 * 길 찾기 격자를 쓴다: 화면에서는 격자가 다 된 뒤(navReady)에 부른다.
 */
export function petSpots(world: HouseWorld): PetSpot[] {
  if (world.kind === 'room') return [];
  const H = world.house;
  const cx = (H.x1 + H.x2) / 2, cz = (H.z1 + H.z2) / 2;
  const out: PetSpot[] = [];
  const add = (p: NavPoint | null, yaw: number) => {
    if (!p) return;
    for (const q of out) if (q.level === p.level && Math.sqrt((q.x - p.x) ** 2 + (q.z - p.z) ** 2) < SPOT_GAP) return;
    out.push({ ...p, yaw, zone: zoneOf(world, p) });
  };
  const hidden = new Set((world.portals ?? []).filter((p) => p.hidden).map((p) => p.slug));
  for (const d of destinations(world)) {
    if (d.kind === 'exit' || d.kind === 'game') continue;
    if (d.kind === 'portal' && d.slug && hidden.has(d.slug)) continue;
    // 목록의 yaw는 걷는 사람 규칙(앞 = (-sin, -cos))이라 반 바퀴 돌려 로컬 +z 규칙으로
    add(openSpot(world, d.x, d.z, d.level, SNAP_DEST, true), d.yaw + Math.PI);
  }
  // 마당 잔디: 고르게 몇 자리(집 외곽과 잔디 가장자리는 띄운다). 앉으면 집 쪽을 본다
  const yard: Array<{ x: number; z: number }> = [];
  for (const f of world.floors) {
    if (f.level !== 1 || f.mat !== 'lawn') continue;
    const axis = (a: number, b: number) => {
      const n = Math.max(1, Math.floor((b - a - 2 * YARD_INSET) / YARD_STEP) + 1);
      const mid = (a + b) / 2;
      return Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * YARD_STEP);
    };
    for (const z of axis(f.z1, f.z2)) for (const x of axis(f.x1, f.x2)) if (!indoors(world, x, z, YARD_INSET)) yard.push({ x, z });
  }
  const step = Math.max(1, yard.length / YARD_MAX);
  for (let i = 0; i < yard.length && out.length < 200; i += step) {
    const p = yard[Math.floor(i)];
    add(openSpot(world, p.x, p.z, 1, YARD_STEP / 2, true), Math.atan2(cx - p.x, cz - p.z));
  }
  return out;
}

type Pools = { yard: PetSpot[]; house: PetSpot[]; up: PetSpot[] };
const pools = new WeakMap<readonly PetSpot[], Pools>();
function poolsOf(spots: readonly PetSpot[]): Pools {
  let p = pools.get(spots);
  if (!p) {
    p = { yard: spots.filter((s) => s.zone === 'yard'), house: spots.filter((s) => s.zone === 'house'), up: spots.filter((s) => s.zone === 'up') };
    pools.set(spots, p);
  }
  return p;
}

function pick(p: Pools, k: number, seed: number, avoid: PetSpot | null): PetSpot | null {
  const m = ((k % 3) + 3) % 3;
  // 마당이나 집 안이 없는 세계는 있는 쪽으로
  const home = p.house.length ? p.house : p.yard.length ? p.yard : p.up;
  const list = m === 0 ? (p.yard.length ? p.yard : home) : p.up.length && unit(seed, k, 1) < UP_CHANCE ? p.up : home;
  if (!list.length) return null;
  let i = petDie(seed, k, 2) % list.length;
  if (avoid && list[i] === avoid && list.length > 1) i = (i + 1 + (petDie(seed, k, 3) % (list.length - 1))) % list.length;
  return list[i];
}

/**
 * 칸 k가 끝날 때 가 있을 자리(정해진 일정). 세 칸마다 마당 한 번, 집 안 두 번(집 안 차례에 가끔 2층).
 * 집 안 두 번째 칸은 바로 앞 칸(앞을 보지 않고 고른 칸)과 같은 자리를 고르지 않는다. 다른 칸은 갈래가 달라 겹치지 않는다
 */
export function petDest(spots: readonly PetSpot[], k: number, seed = PET_SEED): PetSpot | null {
  const p = poolsOf(spots);
  const m = ((k % 3) + 3) % 3;
  return pick(p, k, seed, m === 2 ? pick(p, k - 1, seed, null) : null);
}

/**
 * 칸 k에 닿아 쉴 자세. 혼자면 앉기와 더 있는 자세(kinds) 가운데 주사위로, 친구 곁이면 거의 앉아서(가끔 식빵 자세) 친구를 본다.
 * 더 있는 자세가 없으면 늘 앉는다
 */
export function petRestFor(k: number, kinds: readonly PetExtraRest[], friend: boolean, seed = PET_SEED): PetRest {
  const u = unit(seed, k, 10);
  if (friend) return u >= 1 - FRIEND_LOAF && kinds.includes('loaf') ? 'loaf' : 'sit';
  const all: PetRest[] = ['sit', ...(['loaf', 'groom', 'lie'] as const).filter((x) => kinds.includes(x))];
  return all[Math.min(all.length - 1, Math.floor(u * all.length))];
}

/** 정해진 일정의 칸 k 끝 자리와 자세 */
export function petBaseStop(spots: readonly PetSpot[], k: number, kinds: readonly PetExtraRest[] = [], seed = PET_SEED): PetStop | null {
  const d = petDest(spots, k, seed);
  return d ? { ...d, rest: petRestFor(k, kinds, false, seed), friend: false } : null;
}

// ───────── 친구

/** 함께 걷는 사람(나 포함): 걷기 이름과 자리 */
export type PetPerson = { n: string; x: number; z: number; level: Level };
/** 같은 집에 있는 친구: 이름·무게·자리 */
export type PetSeen = PetPerson & { w: number };

/** 친구 이름과 같은 사람만 무게를 붙여, 이름 차례(같은 이름이면 자리 차례로 앞의 하나)로 늘어놓는다. 어느 기기에서나 같은 차례 */
export function petPresent(friends: readonly PetFriend[] | null | undefined, people: readonly PetPerson[]): PetSeen[] {
  if (!friends?.length || !people.length) return [];
  const weight = new Map(friends.map((f) => [f.n, f.w] as const));
  const out: PetSeen[] = [];
  for (const p of people) {
    const w = weight.get(p.n);
    if (w && w > 0 && Number.isFinite(p.x) && Number.isFinite(p.z) && (p.level === 1 || p.level === 2)) out.push({ n: p.n, x: p.x, z: p.z, level: p.level, w });
  }
  // 글자 코드 차례(기기의 언어 설정과 상관없다)
  out.sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : a.x - b.x || a.z - b.z));
  return out.filter((p, i) => i === 0 || out[i - 1].n !== p.n);
}

/** 칸 k에 찾아갈 친구. 찾아가지 않으면 null(돌아다닌다). present는 petPresent의 차례 그대로 */
export function petVisitPick(present: readonly PetSeen[], k: number, seed = PET_SEED): PetSeen | null {
  if (!present.length) return null;
  const W = present.reduce((s, f) => s + f.w, 0);
  if (!(W > 0) || unit(seed, k, 6) >= Math.min(VISIT_MAX, W / (W + VISIT_EASE))) return null;
  let r = unit(seed, k, 7) * W;
  for (const f of present) {
    r -= f.w;
    if (r < 0) return f;
  }
  return present[present.length - 1];
}

/**
 * 친구 f의 곁 자리: 주사위로 고른 쪽에서 0.8~1.2m, 친구와 같은 층의 평평한 칸(들어오는 자리와 이어진 칸이라 길이 있다).
 * 그 쪽이 막혔으면 다른 쪽을 차례로 본다. 맞는 칸이 없으면 null. 앉으면 친구를 본다
 */
export function petVisitStop(world: HouseWorld, f: PetPerson, k: number, kinds: readonly PetExtraRest[] = [], seed = PET_SEED): PetStop | null {
  if (world.kind === 'room') return null;
  const a0 = unit(seed, k, 8) * Math.PI * 2;
  const d = VISIT_NEAR + unit(seed, k, 9) * (VISIT_FAR - VISIT_NEAR);
  for (let i = 0; i < VISIT_SIDES; i++) {
    // 고른 쪽부터 양옆으로 번갈아 넓혀 간다
    const a = a0 + Math.ceil(i / 2) * (i % 2 ? 1 : -1) * ((Math.PI * 2) / VISIT_SIDES);
    const p = openSpot(world, f.x + Math.sin(a) * d, f.z + Math.cos(a) * d, f.level, VISIT_SNAP, true);
    if (!p) continue;
    const away = Math.hypot(p.x - f.x, p.z - f.z);
    if (away < VISIT_OK[0] || away > VISIT_OK[1]) continue;
    return { ...p, yaw: Math.atan2(f.x - p.x, f.z - p.z), zone: zoneOf(world, p), rest: petRestFor(k, kinds, true, seed), friend: true };
  }
  return null;
}

// ───────── 둘러보기

/** 한 번 고개(몸)를 돌리는 일: t0~t1(칸 시작에서 ms) 동안 원래 쪽에서 돈 각 from → to(rad). stand면 일어서서 돈다 */
export type PetGlance = { t0: number; t1: number; from: number; to: number; stand: boolean };
/** 쉬는 창(칸 시작에서 ms, a 이상 b 미만): 그동안 stop에 앉아 glances대로 둘러본다 */
export type PetRestWindow = { a: number; b: number; stop: PetStop; glances: PetGlance[] };

const glanceTurn = (d: number, stand: boolean) => GLANCE_TURN_MS + GLANCE_TURN_PER_RAD * Math.abs(d) + (stand ? 2 * GLANCE_STAND_PAD : 0);

/**
 * 다음에 볼 쪽(원래 쪽에서 돈 각, rad). cur는 지금 보는 쪽. 혼자면 작게(26~63°) 볼 때가 많고 다섯에 하나쯤 크게(83~149°) 돌아본다.
 * 친구 곁이면 고개를 40~92° 돌렸다가 자주 다시 친구를 본다. 지금 본 쪽의 반대편을 더 자주 본다.
 * 거의 그대로이거나 반대편 끝까지 한 바퀴 가깝게 돌 차례면 원래 쪽을 본다
 */
function glanceTarget(cur: number, friend: boolean, d0: number, d1: number, d2: number): number {
  if (cur !== 0 && d0 < (friend ? GLANCE_BACK_FRIEND : GLANCE_BACK)) return 0;
  const flip = d1 < 0.75;
  const side = cur > 0 ? (flip ? -1 : 1) : cur < 0 ? (flip ? 1 : -1) : d1 < 0.5 ? -1 : 1;
  const mag = friend ? 0.7 + d2 * 0.9 : d2 < 0.8 ? 0.45 + (d2 / 0.8) * 0.65 : 1.45 + ((d2 - 0.8) / 0.2) * 1.15;
  const next = side * mag;
  const turn = Math.abs(next - cur);
  return turn < GLANCE_MIN_TURN || turn > GLANCE_MAX_TURN ? 0 : next;
}

/**
 * 쉬는 창 하나의 둘러보기(칸 k, 창 번호 w). 처음 얼마간은 원래 쪽을 보고, 한 쪽을 몇 초씩 보다가 돌고, 창이 끝나기 GLANCE_EDGE 전에는
 * 원래 쪽으로 돌아와 있다. 돌 자리가 모자라면 덜 둘러본다. 주사위만 쓰므로 어느 화면에서나 같다
 */
export function petGlances(k: number, w: number, a: number, b: number, rest: PetRest, friend: boolean, seed = PET_SEED): PetGlance[] {
  const out: PetGlance[] = [];
  const scale = GLANCE_SCALE[rest] ?? 0;
  if (!(scale > 0) || !(b > a)) return out;
  const die = (j: number, i: number) => unit(seed, k, 32 + w * 128 + j * 4 + i);
  let raw = 0;
  let t = a + GLANCE_FIRST[0] + die(0, 0) * (GLANCE_FIRST[1] - GLANCE_FIRST[0]);
  for (let j = 1; j <= 30; j++) {
    const nextRaw = glanceTarget(raw, friend, die(j, 0), die(j, 1), die(j, 2));
    const from = raw * scale, to = nextRaw * scale;
    const stand = Math.abs(to - from) >= GLANCE_STAND;
    const d = glanceTurn(to - from, stand);
    // 이 쪽을 보고 난 뒤에도 원래 쪽으로 돌아올 자리가 있어야 돈다
    if (t + d + GLANCE_HOLD[0] + glanceTurn(to, Math.abs(to) >= GLANCE_STAND) + GLANCE_EDGE > b) break;
    out.push({ t0: t, t1: t + d, from, to, stand });
    raw = nextRaw;
    t += d + GLANCE_HOLD[0] + die(j, 3) * (GLANCE_HOLD[1] - GLANCE_HOLD[0]);
  }
  if (raw !== 0) {
    const from = raw * scale;
    const stand = Math.abs(from) >= GLANCE_STAND;
    const d = glanceTurn(from, stand);
    const t0 = Math.min(t, b - GLANCE_EDGE - d);
    out.push({ t0, t1: t0 + d, from, to: 0, stand });
  }
  return out;
}

/** 쉬는 창의 u(칸 시작에서 ms)에서 원래 쪽에서 돈 각과, 일어서 있는가. 일어서서 돌 때는 일어선 뒤 돌고 돈 뒤 앉는다 */
export function petGlanceAt(glances: readonly PetGlance[], u: number): { off: number; stand: boolean } {
  let g: PetGlance | null = null;
  for (const x of glances) {
    if (x.t0 > u) break;
    g = x;
  }
  if (!g) return { off: 0, stand: false };
  if (u >= g.t1) return { off: g.to, stand: false };
  const pad = g.stand ? GLANCE_STAND_PAD : 0;
  const a = ease((u - g.t0 - pad) / Math.max(1, g.t1 - g.t0 - 2 * pad));
  return { off: g.from + (g.to - g.from) * a, stand: g.stand };
}

/**
 * 칸의 쉬는 창: 떠나기 전(출발 자리, 칸 시작부터 돌아서기 전까지)과 닿은 뒤(끝 자리, 돌아 앉은 뒤부터 칸 끝까지).
 * 길이 없는 칸은 칸 내내 출발 자리. 말풍선이 떠 있는 동안은 창에서 뺀다(말하는 동안은 돌지 않는다)
 */
function restWindows(k: number, from: PetStop, to: PetStop, len: number, depart: number, arrive: number, meowAt: number | null, visit: boolean, seed: number): PetRestWindow[] {
  const win = (w: number, a: number, b: number, stop: PetStop, friend: boolean): PetRestWindow => ({ a, b, stop, glances: petGlances(k, w, a, b, stop.rest, friend, seed) });
  if (len <= 1e-6) {
    const friend = visit || from.friend;
    if (meowAt === null) return [win(2, 0, PET_SLOT_MS, from, friend)];
    return [win(2, 0, meowAt, from, friend), win(3, meowAt + PET_MEOW_MS, PET_SLOT_MS, from, friend)];
  }
  return [
    win(0, 0, depart - PET_TURN_MS, from, from.friend),
    win(1, meowAt !== null ? Math.max(meowAt + PET_MEOW_MS, arrive + PET_TURN_MS) : arrive + PET_TURN_MS, PET_SLOT_MS, to, to.friend),
  ];
}

// ───────── 한 칸의 길

/** 빠르기가 고르게 바뀌는 한 토막: t0~t1(칸 시작에서 ms), 시작 거리 s0(m), 빠르기 v0 → v1(m/s) */
type PetPhase = { t0: number; t1: number; s0: number; v0: number; v1: number };

export type PetLeg = {
  k: number;
  /** 칸이 시작하는 때(ms) */
  t0: number;
  from: PetStop;
  to: PetStop;
  /** 걸을 길(첫 점 from, 끝 점 to). 길이 없거나 같은 자리면 [from]: 그 칸 내내 앉아 있다 */
  pts: NavPoint[];
  /** 점마다 처음부터 걸은 거리(m, 바닥 위 거리) */
  cum: number[];
  len: number;
  /** 칸 시작에서 걷기 시작하는 때와 닿는 때(ms) */
  depart: number;
  arrive: number;
  /** 가장 빠를 때의 빠르기(m/s). 걷는 길이면 내내 이 빠르기 */
  speed: number;
  /** 이 길의 걸음(뛰어가는 길이면 run: 걷는 빠르기로 떠나 뛰다가 늦춰 걸어서 다가간다) */
  gait: PetGait;
  /** 빠르기 토막들(걷는 길은 하나) */
  phases: PetPhase[];
  /** 친구에게 가는 칸인가 */
  visit: boolean;
  /** 일정이 말풍선을 띄우는 때(칸 시작에서 ms). 없으면 null */
  meowAt: number | null;
  /** 일정이 띄우는 말을 고르는 주사위(pet-talk.ts petScheduledLine) */
  talk: number;
  /** 쉬는 창과 그동안의 둘러보기 */
  rests: PetRestWindow[];
  /** 층 판정(2층 바닥 높이) */
  floor2: number;
};

type Route = (world: HouseWorld, from: NavPoint, to: { x: number; z: number; level: Level }) => NavPoint[] | null;

const flat = (a: NavPoint, b: NavPoint) => Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
const finitePt = (p: NavPoint) => Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.y);
const bare = (s: NavPoint): NavPoint => ({ x: s.x, z: s.z, y: s.y, level: s.level });
const room = (d: number) => PET_SLOT_MS - d - PET_TURN_MS - REST_MIN_MS;

/** 뛰어가는 길의 토막들(가장 빠를 때 v): 올리기 → 뛰기 → 늦추기 → 걸어서 다가가기. 길이가 모자라면 null */
function runPhases(len: number, depart: number, v: number): PetPhase[] | null {
  const acc = ((PET_WALK + v) / 2) * (RUN_ACC_MS / 1000);
  const slow = ((v + PET_WALK) / 2) * (RUN_SLOW_MS / 1000);
  const run = len - acc - slow - RUN_APPROACH;
  if (run < 0) return null;
  const t1 = depart + RUN_ACC_MS, t2 = t1 + (run / v) * 1000, t3 = t2 + RUN_SLOW_MS, t4 = t3 + (RUN_APPROACH / PET_WALK) * 1000;
  return [
    { t0: depart, t1, s0: 0, v0: PET_WALK, v1: v },
    { t0: t1, t1: t2, s0: acc, v0: v, v1: v },
    { t0: t2, t1: t3, s0: acc + run, v0: v, v1: PET_WALK },
    { t0: t3, t1: t4, s0: acc + run + slow, v0: PET_WALK, v1: PET_WALK },
  ];
}

/**
 * from에서 to까지 칸 k의 길과 때. route는 시험이 바꿔 끼우는 길 찾기(기본 findPath). 길을 못 찾거나 이상한 길이면 그 칸은 앉아 있는다.
 * 걷는 시간은 칸 안에 들어오게 정한다: 떠나기 전 돌기 + 걷기 + 닿은 뒤 돌기 + 적어도 쉬는 시간 ≤ 한 칸.
 * 정해진 일정의 칸(to가 친구 곁이 아님)은 예전과 같은 때·빠르기로 걷는다. 친구에게 가는 칸은 곧 떠나고, 길이 길면 뛰어간다
 */
export function petLegBetween(world: HouseWorld, k: number, from: PetStop, to: PetStop, seed = PET_SEED, route: Route = findPath): PetLeg {
  let pts: NavPoint[] = [bare(from)];
  const same = from === to || (flat(from, to) <= 1e-6 && from.level === to.level);
  if (!same) {
    let found: NavPoint[] | null = null;
    try {
      found = route(world, bare(from), { x: to.x, z: to.z, level: to.level });
    } catch {
      found = null;
    }
    if (found && found.length >= 1 && found.every(finitePt)) {
      const path = found.map((p) => ({ x: p.x, z: p.z, y: p.y, level: p.level }));
      if (flat(path[0], bare(from)) > 1e-6 || path[0].level !== from.level) path.unshift(bare(from));
      const last = path[path.length - 1];
      if (flat(last, bare(to)) > 1e-6 || last.level !== to.level) path.push(bare(to));
      pts = path;
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + flat(pts[i - 1], pts[i]));
  const len = cum[cum.length - 1];
  const visit = to.friend;
  let depart = visit ? PET_TURN_MS + VISIT_LINGER_MIN + Math.floor(unit(seed, k, 4) * VISIT_LINGER_SPAN) : PET_TURN_MS + Math.floor(unit(seed, k, 4) * LINGER_MS);
  let speed = PET_WALK;
  let phases: PetPhase[] = [];
  let gait: PetGait = 'walk';
  if (len > 1e-6) {
    if (visit && len > VISIT_RUN_LEN) {
      // 뛰어간다. 그래도 칸 안에 못 닿으면 곧 떠나고, 그래도 모자라면 더 빨리 뛴다
      for (let v = PET_RUN; v <= 6 + 1e-9 && !phases.length; v += 0.2) {
        for (const d of [depart, PET_TURN_MS]) {
          const ph = runPhases(len, d, v);
          if (ph && ph[ph.length - 1].t1 - d <= room(d)) {
            phases = ph;
            depart = d;
            speed = v;
            gait = 'run';
            break;
          }
        }
      }
    }
    if (!phases.length) {
      // 길이 길면 덜 앉아 있다가 떠나고, 그래도 모자라면 더 빨리 걷는다(칸을 넘기면 다음 칸 시작에 자리가 튄다)
      if ((len / PET_WALK) * 1000 > room(depart)) depart = PET_TURN_MS;
      speed = Math.max(PET_WALK, len / (room(depart) / 1000));
      phases = [{ t0: depart, t1: depart + (len / speed) * 1000, s0: 0, v0: speed, v1: speed }];
      if (speed >= PET_RUN_FROM) gait = 'run';
    }
  }
  const arrive = phases.length ? phases[phases.length - 1].t1 : depart;
  // 친구 곁에 닿으면 늘, 혼자 닿으면 가끔 운다(돌아 앉은 뒤). 움직이지 않는 칸은 친구 곁일 때만(떠날 때쯤)
  const meowAt = len > 1e-6 ? (visit || unit(seed, k, 5) < MEOW_ALONE ? arrive + PET_TURN_MS : null) : visit ? depart : null;
  const rests = restWindows(k, from, to, len, depart, arrive, meowAt, visit, seed);
  return { k, t0: k * PET_SLOT_MS, from, to, pts, cum, len, depart, arrive, speed, gait, phases, visit, meowAt, talk: petDie(seed, k, 11), rests, floor2: world.floor2 };
}

/** 정해진 일정의 칸 k 길(칸 k-1의 끝 자리에서 칸 k의 끝 자리로) */
export function petLeg(world: HouseWorld, spots: readonly PetSpot[], k: number, seed = PET_SEED, route: Route = findPath, kinds: readonly PetExtraRest[] = []): PetLeg | null {
  const from = petBaseStop(spots, k - 1, kinds, seed);
  const to = petBaseStop(spots, k, kinds, seed);
  if (!from || !to) return null;
  return petLegBetween(world, k, from, to, seed, route);
}

/** 길 위에서 칸 시작으로부터 u(ms)일 때 간 거리와 빠르기 */
function travel(leg: PetLeg, u: number): { s: number; v: number } {
  const ph = leg.phases;
  if (!ph.length || u <= ph[0].t0) return { s: 0, v: ph[0]?.v0 ?? 0 };
  for (const p of ph) {
    if (u > p.t1) continue;
    const dt = (u - p.t0) / 1000, span = (p.t1 - p.t0) / 1000;
    const a = span > 1e-9 ? (p.v1 - p.v0) / span : 0;
    return { s: Math.min(leg.len, p.s0 + p.v0 * dt + 0.5 * a * dt * dt), v: p.v0 + a * dt };
  }
  return { s: leg.len, v: ph[ph.length - 1].v1 };
}

/** 길 위 s(m)의 자리 */
function pointAt(leg: PetLeg, s: number): { x: number; y: number; z: number; level: Level } {
  const { pts, cum } = leg;
  const lvl = (y: number): Level => (y > leg.floor2 / 2 ? 2 : 1);
  if (pts.length === 1 || s <= 0) return { x: pts[0].x, y: pts[0].y, z: pts[0].z, level: lvl(pts[0].y) };
  const n = pts.length - 1;
  if (s >= leg.len) return { x: pts[n].x, y: pts[n].y, z: pts[n].z, level: lvl(pts[n].y) };
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg > 1e-9 ? (s - cum[lo]) / seg : 0;
  const a = pts[lo], b = pts[hi];
  const y = a.y + (b.y - a.y) * t;
  return { x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t, level: lvl(y) };
}

/** 길 위 s에서 가는 쪽과 오르내리는 기울기(앞뒤 LOOK m 사이로 재어 모퉁이·계단 끝에서 부드럽게 바뀐다) */
function aimAt(leg: PetLeg, s: number): { yaw: number; pitch: number } {
  const a = pointAt(leg, Math.max(0, s - LOOK));
  const b = pointAt(leg, Math.min(leg.len, s + LOOK));
  let dx = b.x - a.x, dz = b.z - a.z;
  const run = Math.sqrt(dx * dx + dz * dz);
  // 길 양 끝(쉬는 자리는 평평하다)에서는 기울기를 0으로 풀어 떠날 때·닿을 때 몸이 툭 기울지 않게
  const fade = Math.max(0, Math.min(1, s / LOOK, (leg.len - s) / LOOK));
  const pitch = run > 1e-6 ? Math.atan2(b.y - a.y, run) * fade : 0;
  if (dx * dx + dz * dz < 1e-10) {
    // 아주 짧은 길: 길이가 있는 첫 마디 쪽
    for (let i = 1; i < leg.pts.length; i++) {
      dx = leg.pts[i].x - leg.pts[i - 1].x;
      dz = leg.pts[i].z - leg.pts[i - 1].z;
      if (dx * dx + dz * dz > 1e-10) break;
    }
  }
  return { yaw: dx * dx + dz * dz > 1e-10 ? Math.atan2(dx, dz) : leg.from.yaw, pitch };
}

/** 칸 안의 시각 t(ms)의 모습 */
export function petState(leg: PetLeg, t: number): PetState {
  const u = t - leg.t0;
  const meow = leg.meowAt !== null && u >= leg.meowAt && u < leg.meowAt + PET_MEOW_MS;
  const more = { meow, visit: leg.visit, talk: leg.talk, glance: 0, resettle: false };
  const resting = (s: PetStop): PetState => {
    // 쉬는 창 안이면 둘러본다(창 밖: 말하는 동안, 쉬는 창이 없는 옛 길)
    const win = leg.rests.find((r) => r.stop === s && u >= r.a && u < r.b);
    const g = win ? petGlanceAt(win.glances, u) : null;
    const off = g?.off ?? 0;
    return {
      x: s.x, y: s.y, z: s.z, level: s.y > leg.floor2 / 2 ? 2 : 1, yaw: s.yaw + off, pitch: 0, pose: g?.stand ? 'walk' : 'rest', moving: false, speed: 0, dist: 0,
      gait: 'walk', rest: s.rest, ...more, glance: off, resettle: Boolean(g?.stand),
    };
  };
  if (leg.len <= 1e-6 || u < leg.depart - PET_TURN_MS) return resting(leg.from);
  const rest = leg.to.rest;
  if (u < leg.depart) {
    // 떠날 쪽으로 돌아선다(일어선 채)
    const a = ease((u - (leg.depart - PET_TURN_MS)) / PET_TURN_MS);
    const p = pointAt(leg, 0);
    const yaw = leg.from.yaw + turnOf(leg.from.yaw, aimAt(leg, 0).yaw) * a;
    return { ...p, yaw, pitch: 0, pose: 'walk', moving: false, speed: 0, dist: 0, gait: 'walk', rest, ...more };
  }
  if (u < leg.arrive) {
    const { s, v } = travel(leg, u);
    return { ...pointAt(leg, s), ...aimAt(leg, s), pose: 'walk', moving: true, speed: v, dist: s, gait: v >= PET_RUN_FROM ? 'run' : 'walk', rest, ...more };
  }
  if (u < leg.arrive + PET_TURN_MS) {
    // 닿아서 앉을 쪽으로 돈다
    const a = ease((u - leg.arrive) / PET_TURN_MS);
    const end = aimAt(leg, leg.len).yaw;
    return { ...pointAt(leg, leg.len), yaw: end + turnOf(end, leg.to.yaw) * a, pitch: 0, pose: 'walk', moving: false, speed: 0, dist: leg.len, gait: 'walk', rest, ...more };
  }
  return resting(leg.to);
}

// ───────── 일정(칸마다 길을 한 번 찾아 둔다)

export type PetPlan = {
  spots: readonly PetSpot[];
  /** 시각 t(ms)의 모습. 갈 곳이 없으면 null. 그 칸의 길이 아직 없으면 지금 찾는다(아무것도 정하지 않는다) */
  at: (t: number) => PetState | null;
  /** 칸 k의 길을 미리 찾아 둔다 */
  prepare: (k: number) => void;
  has: (k: number) => boolean;
  leg: (k: number) => PetLeg | null;
  /** 칸 k의 끝 자리(정했으면 정한 것, 아니면 정해진 일정) */
  stop: (k: number) => PetStop | null;
  /** 칸 k를 이미 정했는가 */
  decided: (k: number) => boolean;
  /**
   * 칸 k를 정한다(이미 정했으면 그대로): present는 그때 같은 집에 있는 친구(petPresent의 차례). 찾아가기로 하고 곁 자리가 있으면
   * 친구에게, 아니면 정해진 일정. 친구가 없거나 null이면 정해진 일정으로 굳힌다
   */
  decide: (k: number, present: readonly PetSeen[] | null) => void;
  /** 이 일정이 친구에게 가기로 정한 칸 수(측정용) */
  visits: () => number;
};

/**
 * 시각 t(ms)에 정할 칸을 정한다. 지난 칸은 아직 안 정했으면 정해진 일정으로 굳히고, 지금 칸은 시작한 지 DECIDE_LATE_MS 안이면
 * 지금 친구들로(아니면 정해진 일정으로) 정한다: 그 칸이 시작할 때를 보지 못한 화면은 정해진 일정대로 두어, 보이던 모습이 바뀌지 않는다.
 * 다음 칸은 시작하기 DECIDE_LEAD_MS 전부터 지금 친구들로 정한다. present는 정할 때만 부른다(칸마다 한두 번).
 * 다음 칸을 새로 정했으면 그 번호(길을 미리 찾으라고), 아니면 null
 */
export function petSettle(plan: PetPlan, t: number, present: () => readonly PetSeen[] | null): number | null {
  const k = petSlot(t);
  const u = t - k * PET_SLOT_MS;
  if (!plan.decided(k - 1)) plan.decide(k - 1, null);
  if (!plan.decided(k)) plan.decide(k, u <= DECIDE_LATE_MS ? present() : null);
  if (!plan.decided(k + 1) && PET_SLOT_MS - u <= DECIDE_LEAD_MS) {
    plan.decide(k + 1, present());
    return k + 1;
  }
  return null;
}

/**
 * 세계와 갈 곳으로 일정을 만든다. 길은 칸마다 한 번 찾고 가까운 몇 칸만 기억한다.
 * rests는 더 있는 쉬는 자세(설정에 있는 것), memory는 정한 칸을 담아 두는 곳(장면을 다시 지어도 이어지게 화면이 나눠 준다)
 */
export function petPlan(
  world: HouseWorld,
  spots: readonly PetSpot[],
  o: { seed?: number; route?: Route; rests?: readonly PetExtraRest[]; memory?: Map<number, PetStop> } = {},
): PetPlan {
  const seed = o.seed ?? PET_SEED;
  const route = o.route ?? findPath;
  const kinds = o.rests ?? [];
  const chosen = o.memory ?? new Map<number, PetStop>();
  const bases = new Map<number, PetStop | null>();
  const legs = new Map<number, { from: PetStop; to: PetStop; leg: PetLeg } | null>();
  const trim = <V>(m: Map<number, V>, keep: number) => {
    while (m.size > keep) m.delete(m.keys().next().value as number);
  };
  const base = (k: number): PetStop | null => {
    if (bases.has(k)) return bases.get(k) ?? null;
    const s = petBaseStop(spots, k, kinds, seed);
    bases.set(k, s);
    trim(bases, 12);
    return s;
  };
  const stop = (k: number): PetStop | null => chosen.get(k) ?? base(k);
  let visits = 0;
  const leg = (k: number): PetLeg | null => {
    const from = stop(k - 1), to = stop(k);
    if (!from || !to) return null;
    const had = legs.get(k);
    if (had && had.from === from && had.to === to) return had.leg;
    const l = petLegBetween(world, k, from, to, seed, route);
    legs.delete(k);
    legs.set(k, { from, to, leg: l });
    // 지난 칸은 버린다(앞뒤 몇 칸이면 된다)
    trim(legs, 6);
    return l;
  };
  return {
    spots,
    at(t) {
      if (!Number.isFinite(t) || !spots.length) return null;
      const l = leg(petSlot(t));
      return l ? petState(l, t) : null;
    },
    prepare(k) { if (spots.length) leg(k); },
    has: (k) => {
      const had = legs.get(k);
      return Boolean(had) && had!.from === stop(k - 1) && had!.to === stop(k);
    },
    leg: (k) => (spots.length ? leg(k) : null),
    stop: (k) => (spots.length ? stop(k) : null),
    decided: (k) => chosen.has(k),
    decide(k, present) {
      if (chosen.has(k) || !spots.length) return;
      const f = present?.length ? petVisitPick(present, k, seed) : null;
      let s: PetStop | null = null;
      if (f) {
        try {
          s = petVisitStop(world, f, k, kinds, seed);
        } catch {
          s = null;
        }
      }
      s ??= base(k);
      if (!s) return;
      if (s.friend) visits++;
      chosen.set(k, s);
      // 오래된 칸은 잊는다(지금 칸 앞뒤 몇 칸만 쓴다)
      for (const j of chosen.keys()) if (j < k - 8 || j > k + 8) chosen.delete(j);
    },
    visits: () => visits,
  };
}
