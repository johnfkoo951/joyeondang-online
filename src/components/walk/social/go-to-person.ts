// 접속자 목록의 「걸어가기」·「바로 가기」: 목록의 한 줄이 같은 장면의 누구인지 가리고, 그 사람 옆 빈자리를 고른다.
// 접속자 목록(presence)과 함께 걷기 서버는 서로 다른 열쇠를 쓴다(서버는 연결마다 새 id만 보낸다). 그래서 같은 공간 안에서
// 이름으로 짝짓고, 이름이 겹치면 겉모습으로 가른다. 그래도 못 가르면 엉뚱한 사람에게 가지 않게 아무 데도 가지 않는다.
// three.js와 화면에 기대지 않아 시험에서 그대로 돈다.
import type { CharacterLook } from '@/walk/look';
import type { Destination } from '@/walk/nav';
import { RADIUS, blocked, clearLine, inRamp, levelOf, type Body } from '@/walk/physics';
import { tuneWorld } from '@/walk/tune';
import type { HouseWorld, Level, Physics, RemotePlayer } from '@/walk/types';

/** 사람 옆에 설 거리(m). 가운데를 먼저 해 보고, 가깝게, 멀게 */
export const NEAR_MIN = 1.2;
export const NEAR_MAX = 1.8;
const NEAR_BEST = 1.5;
const RINGS = [NEAR_BEST, NEAR_MIN, NEAR_MAX] as const;
/** 한 바퀴를 몇 방향으로 둘러보는가 */
const TURNS = 16;
/** 거리가 가운데서 1m 벗어날 때 더하는 값(방향 차이 라디안과 같은 저울). 방향을 먼저 보고 거리는 그다음 */
const RING_COST = 0.5;
/** 다른 사람과 이만큼 떨어져 선다(두 몸이 겹치지 않게, 조금 넉넉히) */
export const PERSON_GAP = 0.7;
/** 벽·가구에서 몸 반지름보다 이만큼 더 띄운다(옮기자마자 벽에 붙어 서지 않게) */
const WALL_GAP = 0.05;
/** 나와 그 사람이 이보다 가까우면 내 쪽 방향을 알 수 없어 그 사람 앞쪽부터 본다 */
const SAME_SPOT = 0.3;
/** 그 사람에게서 곧게 걸어 보는 간격(m) */
const LINE_GAP = 0.05;

/** 서버와 접속자 목록이 이름표를 자르는 길이(코드 포인트) */
const NAME_MAX = 16;
/** 서버가 이름표에서 빼는 글자(제어 문자, 보이지 않는 글자, 글자 방향 바꾸기) */
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** 이름 견주기용 열쇠: 서버가 이름표를 고치는 방식 그대로(숨은 글자는 빈칸, 빈칸은 하나로, 16자) */
export function nameKey(raw: string): string {
  const s = String(raw ?? '').normalize('NFC').replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, NAME_MAX).join('').trim();
}

/** 겉모습 견주기용 열쇠(칭호는 뺀다: 늦게 따라올 수 있다). 겉모습을 모르면 빈 글 */
export function lookKey(look: CharacterLook | null | undefined): string {
  if (!look) return '';
  return look.kind === 'photo' ? `photo:${look.url}` : `doll:${JSON.stringify(look.doll)}`;
}

/**
 * 접속자 한 줄에서 갈 수 있는가.
 * here = 같은 장면에서 찾았다(함께 걷기 id), away = 다른 장면(집과 방, 다른 방),
 * unseen = 같은 장면이라는데 아직 안 보인다(함께 걷기 연결 전, 사람이 많아 나눠 받는 다른 칸, 어딘지 모르는 사람,
 * 같은 이름이 보이지만 겉모습이 달라 그 사람인지 모름: 옷을 막 바꿔 한쪽이 아직 옛 옷일 때도),
 * twin = 이름과 겉모습이 같은 사람이 여럿이라 누군지 가를 수 없다
 */
export type Reach = { kind: 'here'; id: string } | { kind: 'away' } | { kind: 'unseen' } | { kind: 'twin' };

type Row = { sub: string; name: string; look: CharacterLook | null; space: string | null };
type Seen = Pick<RemotePlayer, 'id' | 'name' | 'look'>;

function byName<T extends { name: string }>(list: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = nameKey(x.name);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

/**
 * 접속자 목록(나 빼고)의 줄마다 갈 수 있는지. mine은 내 공간('house:real' | 'room:<slug>', 함께 걷기를 안 하면 null),
 * players는 함께 걷기 서버가 알려 준 같은 공간 사람들(나 빼고).
 * 이름이 양쪽에 하나씩이면 그 사람이다(겉모습을 양쪽 다 아는데 다르면 짝짓지 않는다). 겹치면 겉모습까지 같은 사람이
 * 양쪽에 하나씩일 때만 짝짓는다
 */
export function reachOf(people: readonly Row[], mine: string | null, players: readonly Seen[]): Map<string, Reach> {
  const out = new Map<string, Reach>();
  const seen = byName(players);
  const rows = byName(people.filter((p) => mine !== null && p.space === mine));
  for (const p of people) {
    if (mine === null || p.space === null) {
      out.set(p.sub, { kind: 'unseen' });
      continue;
    }
    if (p.space !== mine) {
      out.set(p.sub, { kind: 'away' });
      continue;
    }
    const k = nameKey(p.name);
    const cands = seen.get(k) ?? [];
    const same = rows.get(k) ?? [];
    if (cands.length === 0) {
      out.set(p.sub, { kind: 'unseen' });
      continue;
    }
    if (cands.length === 1 && same.length === 1) {
      // 이름이 하나씩이어도 겉모습이 다르면 다른 사람이다. 목록은 몇 초 늦게 따라오고(알리기 간격) 함께 걷기는 바로 바뀌어,
      // 그사이 떠난 사람의 줄이 막 들어온 같은 이름의 다른 사람과 짝지어질 수 있다. 한쪽 겉모습을 모르면 이름만 본다
      const a = lookKey(p.look);
      const b = lookKey(cands[0].look);
      out.set(p.sub, a && b && a !== b ? { kind: 'unseen' } : { kind: 'here', id: cands[0].id });
      continue;
    }
    const lk = lookKey(p.look);
    const looks = lk ? cands.filter((c) => lookKey(c.look) === lk) : [];
    const twins = lk ? same.filter((r) => lookKey(r.look) === lk) : [];
    out.set(p.sub, looks.length === 1 && twins.length === 1 ? { kind: 'here', id: looks[0].id } : { kind: 'twin' });
  }
  return out;
}

/** 설 자리와 그 자리에서 볼 방향(엔진의 yaw: 앞 = (-sin yaw, -cos yaw)) */
export type Spot = { x: number; z: number; level: Level; yaw: number };
type Pos = { x: number; z: number };

/** 앞을 (dx, dz) 쪽으로 보게 하는 yaw */
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/**
 * 그 사람 둘레에서 설 자리를 고른다: 거리는 NEAR_MIN~NEAR_MAX, 방향은 내 쪽부터 양옆으로 번갈아 넓혀 간다
 * (나와 같은 자리면 그 사람 앞쪽부터). free는 몸이 설 수 있고 그 사람에게서 곧게 닿는 자리인지 묻는다.
 * 같은 층의 다른 사람과는 PERSON_GAP 넘게 떨어진 자리만 고른다. 고른 자리에서는 그 사람을 본다. 없으면 null
 */
export function pickSpot(o: {
  target: Pos & { level: Level; yaw: number };
  me: Pos | null;
  others: ReadonlyArray<Pos & { level: Level }>;
  free: (x: number, z: number) => boolean;
}): Spot | null {
  const t = o.target;
  const toMe = o.me ? Math.hypot(o.me.x - t.x, o.me.z - t.z) : 0;
  const base = o.me && toMe > SAME_SPOT ? Math.atan2(o.me.z - t.z, o.me.x - t.x) : Math.atan2(-Math.cos(t.yaw), -Math.sin(t.yaw));
  const turn = (Math.PI * 2) / TURNS;
  const tries: Array<Pos & { cost: number }> = [];
  for (let k = 0; k <= TURNS / 2; k++) {
    // 바로 내 쪽과 정반대 쪽은 한 번만, 나머지는 왼쪽·오른쪽 둘 다
    for (const side of k === 0 || k === TURNS / 2 ? [1] : [1, -1]) {
      const a = base + side * k * turn;
      for (const r of RINGS) tries.push({ x: t.x + r * Math.cos(a), z: t.z + r * Math.sin(a), cost: k * turn + RING_COST * Math.abs(r - NEAR_BEST) });
    }
  }
  // 값이 같으면 만든 차례 그대로(정렬은 안정적이다)
  tries.sort((a, b) => a.cost - b.cost);
  const crowd = o.others.filter((p) => p.level === t.level && Number.isFinite(p.x) && Number.isFinite(p.z));
  for (const c of tries) {
    if (crowd.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < PERSON_GAP)) continue;
    if (!o.free(c.x, c.z)) continue;
    return { x: c.x, z: c.z, level: t.level, yaw: yawTo(t.x - c.x, t.z - c.z) };
  }
  return null;
}

/** 걷기용으로 손질한 세계(세계마다 한 번). 엔진과 길 찾기도 손질한 물리로 걷는다 */
const tuned = new WeakMap<HouseWorld, HouseWorld>();
function walkWorld(world: HouseWorld): HouseWorld {
  let w = tuned.get(world);
  if (!w) {
    w = tuneWorld(world);
    tuned.set(world, w);
  }
  return w;
}

/** 엔진의 바로 옮기기처럼 그 층 바닥판 안인가(바닥판이 없는 세계는 어디든 바닥이다) */
function onFloor(w: HouseWorld, level: Level, x: number, z: number): boolean {
  return w.floors.length === 0 || w.floors.some((f) => f.level === level && x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2);
}

/**
 * 그 사람(target) 옆 빈자리. 계단·경사면이 아닌 그 층 바닥판 위, 벽·가구에 닿지 않고, 그 사람 자리에서 곧게 걸어 닿는 곳이다
 * (벽 너머 옆방에 서지 않게). me는 내 자리(내 쪽을 먼저 본다), others는 같은 장면의 다른 사람들. 없으면 null
 */
export function spotNear(
  world: HouseWorld,
  target: Pick<RemotePlayer, 'x' | 'z' | 'y' | 'level' | 'yaw'>,
  me: Pos | null,
  others: ReadonlyArray<Pick<RemotePlayer, 'x' | 'z' | 'level'>>,
): Spot | null {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
  const w = walkWorld(world);
  // 그 사람 둘레에 닿을 수 있는 상자만 모은다. 결과는 같고, 실제 크기 집에서도 누르자마자 답한다
  const m = NEAR_MAX + RADIUS + WALL_GAP + LINE_GAP;
  const p: Physics = {
    ...w.physics,
    boxes: w.physics.boxes.filter((b) => b.x1 < target.x + m && b.x2 > target.x - m && b.z1 < target.z + m && b.z2 > target.z - m),
  };
  const level: Level = target.level === 2 ? 2 : 1;
  const floor = level === 2 ? p.floor2 : 0;
  // 받은 높이가 그 층과 맞지 않으면(높이를 안 보내는 옛 화면) 그 층 바닥에 선 것으로 본다
  const y = Number.isFinite(target.y) && levelOf(p, target.y) === level ? target.y : floor;
  const from: Body = { x: target.x, z: target.z, y, level };
  return pickSpot({
    target: { x: target.x, z: target.z, level, yaw: Number.isFinite(target.yaw) ? target.yaw : 0 },
    me,
    others,
    free: (x, z) => !p.ramps.some((r) => inRamp(r, x, z))
      && onFloor(w, level, x, z)
      && !blocked(p, level, x, z, RADIUS + WALL_GAP)
      && clearLine(p, from, x, z, RADIUS, LINE_GAP, floor),
  });
}

/** 길 찾기와 같은 옮기기·걷기에 넘길 갈 곳. 띠에는 「(이름) 옆」으로 나온다(placeTitle) */
export function personDest(who: { id: string; name: string }, s: Spot): Destination {
  return { id: `person:${who.id}`, title: who.name, kind: 'person', level: s.level, x: s.x, z: s.z, yaw: s.yaw };
}

/**
 * 단추를 못 쓰는 까닭(화면 글은 hud-text의 GO_WHY): away·unseen·twin은 Reach 그대로,
 * nospot은 눌렀는데 옆에 빈자리가 없었다, wait는 걸어갈 길 격자를 아직 만드는 중이다
 */
export type GoWhy = 'away' | 'unseen' | 'twin' | 'nospot' | 'wait';
/** 접속자 한 줄의 두 단추(「걸어가기」 walk, 「바로 가기」 jump): 쓸 수 있는가와 못 쓰는 까닭(없으면 null) */
export type RowGo = { walk: boolean; jump: boolean; why: GoWhy | null };

/**
 * 한 줄의 두 단추. 같은 장면에서 찾은 사람만 누를 수 있다. 빈자리를 못 찾았던 줄도 단추는 그대로 둔다
 * (사람들이 움직이니 다시 누르면 될 수 있다). 「걸어가기」는 길 격자가 준비된 뒤에만
 */
export function rowGo(reach: Reach | undefined, o: { walkReady: boolean; miss: GoWhy | null }): RowGo {
  if (!reach) return { walk: false, jump: false, why: 'unseen' };
  if (reach.kind !== 'here') return { walk: false, jump: false, why: reach.kind };
  if (o.miss) return { walk: o.walkReady, jump: true, why: o.miss };
  return { walk: o.walkReady, jump: true, why: o.walkReady ? null : 'wait' };
}
