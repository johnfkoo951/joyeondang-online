// 걷기 조작의 순수 판단(E 살피기·들어가기, P 포털 목록, 숫자키, 사진 이름, 시점 기억).
// React·three에 기대지 않아 단위 시험으로 본다(tests/unit/walk-controls.test.ts).
import type { Destination } from '@/walk/nav';
import type { View } from '@/walk/scene';
import type { Hotspot } from '@/walk/types';
import { SHORTCUTS, letterOf as shortcutLetter, type ShortcutId } from './shortcuts';

/** E(휴대폰은 아래 가운데 단추)를 누르면 할 일: 바로 들어가기, 바로 나가기, 액자 크게 보기, 살피기 패널 */
export type Interact = { kind: 'enter'; slug: string } | { kind: 'leave' } | { kind: 'frame'; id: string } | { kind: 'exhibit'; id: string } | { kind: 'board'; room: string } | { kind: 'panel' };

export function interactFor(
  spot: Pick<Hotspot, 'kind' | 'slug' | 'frame' | 'exhibit' | 'boardRoom'> | null,
  canEnter: (slug: string) => boolean,
  inRoom: boolean,
): Interact | null {
  if (!spot) return null;
  // 갤러리 액자 앞이면 그 액자부터 크게 본다
  if (spot.kind === 'frame' && spot.frame) return { kind: 'frame', id: spot.frame };
  if (spot.kind === 'exhibit' && spot.exhibit) return { kind: 'exhibit', id: spot.exhibit };
  if (spot.kind === 'board' && spot.boardRoom) return { kind: 'board', room: spot.boardRoom };
  // 열린 방 문이면 확인 없이 들어간다(닫힌 문은 문패를 보여 주는 패널)
  if (spot.kind === 'portal' && spot.slug && canEnter(spot.slug)) return { kind: 'enter', slug: spot.slug };
  if (spot.kind === 'exit' && inRoom) return { kind: 'leave' };
  // 놀이 자리는 시작 전에 한 줄 설명이 필요해 패널을 둔다(패널 안에서 Enter로 바로 시작)
  return { kind: 'panel' };
}

/**
 * Enter 말하기를 막는 가까움인가(그때 Enter는 엔진의 살피기 몫). 약한 가까움(휴대폰 3인칭에서 대략 보는 액자)은 막지 않는다:
 * 크게 보기 단추와 E로만 연다
 */
export function blocksTalk(spot: Pick<Hotspot, 'weak'> | null): boolean {
  return Boolean(spot) && !spot!.weak;
}

/** 휴대폰 단추와 데스크탑 「E」 안내에 붙는 말(lang을 주지 않으면 한국어) */
export function actLabel(i: Interact | null, lang: 'ko' | 'en' = 'ko'): string {
  const en = lang === 'en';
  if (i?.kind === 'enter') return en ? 'Enter' : '들어가기';
  if (i?.kind === 'leave') return en ? 'Leave' : '나가기';
  if (i?.kind === 'frame') return en ? 'Enlarge' : '크게 보기';
  if (i?.kind === 'exhibit') return en ? 'View exhibit' : '전시 보기';
  if (i?.kind === 'board') return en ? 'Leaderboard' : '리더보드';
  return en ? 'Look closer' : '살피기';
}

/** P 포털 바로 가기 목록의 한 줄. slug가 null이면 「집으로」(영어 화면은 PortalPanel이 「Back to the house」로 보인다) */
export type PortalItem = { slug: string | null; title: string; owner: string | null };

/**
 * 집이면 들어갈 수 있는 방들, 방 안이면 「집으로」와 지금 방을 뺀 다른 방들.
 * 숫자키 1~9로 고르므로 아홉까지(방이 늘어 숨은 포털 방까지 잘리지 않게). 손님이면 가족 방 앞에 주인 이름을 붙인다.
 */
export function portalItems(o: {
  inRoom: boolean;
  current: string | null;
  rooms: ReadonlyArray<{ slug: string; name: string }>;
  canEnter: (slug: string) => boolean;
  owners?: ReadonlyMap<string, { owner: string }>;
}): PortalItem[] {
  const rooms = o.rooms
    .filter((r) => r.slug !== o.current && o.canEnter(r.slug))
    .map((r): PortalItem => ({ slug: r.slug, title: r.name, owner: o.owners?.get(r.slug)?.owner ?? null }));
  const list = o.inRoom ? [{ slug: null, title: '집으로', owner: null }, ...rooms] : rooms;
  return list.slice(0, 9);
}

/** 숫자키 1~9(윗줄·숫자판, 한글 자판 상관없이) → 0부터 센 자리. 아니면 -1 */
export function digitIndex(e: { key: string; code?: string }): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? '') ?? /^([1-9])$/.exec(e.key);
  return m ? Number(m[1]) - 1 : -1;
}

type WayItem = Pick<Destination, 'id' | 'kind' | 'title'>;

/** 길 찾기 목록의 순위: 행사 자리(결혼식 무대 → 포토존 → 방명록)가 맨 위. 지도가 이름 자리를 먼저 잡아 주는 순서와 같다 */
export function wayRank(d: Pick<WayItem, 'id'>): number {
  return d.id === 'wedding-stage' ? 0 : d.id === 'photozone' ? 1 : d.id === 'guestbook' ? 2 : 3;
}

/**
 * 길 찾기 목록 순서: 행사 자리를 앞으로 올리고 나머지는 원래 순서 그대로 둔다(열 때마다 줄이 바뀌지 않게).
 * 꾸밈으로 덧붙인 행사 자리는 세계의 목록 끝에 있어, 그대로 두면 휴대폰에서는 스크롤해야 보인다.
 */
export function wayOrder<T extends Pick<WayItem, 'id'>>(list: readonly T[]): T[] {
  return list.map((d, i) => ({ d, i })).sort((a, b) => wayRank(a.d) - wayRank(b.d) || a.i - b.i).map((x) => x.d);
}

const WAY_KIND: Partial<Record<Destination['kind'], string>> = { door: '문', portal: '들어가는 문', exit: '나가는 문', game: '놀이', exhibit: '전시', board: '리더보드' };
/** 딱지의 영어(WAY_KIND와 같은 열쇠) */
export const WAY_KIND_EN: Partial<Record<Destination['kind'], string>> = { door: 'door', portal: 'way in', exit: 'way out', game: 'game', exhibit: 'exhibit', board: 'leaderboard' };
/**
 * 길 찾기 목록에서 이름 옆에 붙는 딱지. 문과 놀이에만 붙인다: 마당·현관·포토존 같은 자리는 방이 아니고,
 * 석등·무대는 이름이 이미 말한다. 이름에 같은 말이 들어 있으면(「나가는 문」) 두 번 적지 않는다.
 * 붙일지는 한국어 이름으로 정하고(데이터의 이름은 한국어), lang이 영어면 영어 딱지를 준다.
 */
export function wayKind(d: Pick<WayItem, 'kind' | 'title'>, lang: 'ko' | 'en' = 'ko'): string | null {
  const k = WAY_KIND[d.kind];
  if (!k || d.title.includes(k)) return null;
  return lang === 'en' ? WAY_KIND_EN[d.kind] ?? k : k;
}

/**
 * 길 찾기 한 조각: 아직 찾지 않은 곳만 ms 동안 찾아 known에 더한 새 표를 돌려준다(적어도 한 곳은 찾는다).
 * 이미 찾은 곳은 다시 찾지 않는다: 패널이 다시 그려져도 「걸어가기」가 사라졌다 돌아오지 않는다.
 */
export function waySlice<T extends { id: string }, P>(
  list: readonly T[], known: Readonly<Record<string, P | null>>, find: (d: T) => P | null, ms: number, now: () => number = () => performance.now(),
): { paths: Record<string, P | null>; left: number } {
  const todo = list.filter((d) => known[d.id] === undefined);
  const paths = { ...known };
  const end = now() + ms;
  let i = 0;
  while (i < todo.length) {
    const d = todo[i++];
    let p: P | null = null;
    try { p = find(d); } catch { p = null; }
    paths[d.id] = p;
    if (now() >= end) break;
  }
  return { paths, left: todo.length - i };
}

/**
 * 걸어서 도착한 뒤 볼 방향. 방 문(포털)의 yaw는 방에서 나와 설 때의 방향(문을 등진다)이라, 걸어서 문 앞에 닿았을 때는 돌려서 문을 본다.
 * 그 밖의 자리는 목록이 정해 둔 볼 방향 그대로.
 */
export function arriveYaw(d: Pick<Destination, 'kind' | 'yaw'>): number {
  return d.kind === 'portal' ? d.yaw + Math.PI : d.yaw;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** 기기에 내려받는 사진 이름: 조연당-YYYYMMDD-HHMM.jpg(이 기기 시각). 화면이 영어면 Joyeondang-YYYYMMDD-HHMM.jpg */
export function shotFileName(d: Date, n?: number, lang: 'ko' | 'en' = 'ko'): string {
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `${lang === 'en' ? 'Joyeondang' : '조연당'}-${day}-${pad(d.getHours())}${pad(d.getMinutes())}${n ? `-${n}` : ''}.jpg`;
}

/** 시점 기억(jy.walk.view.v2): 처음 오는 분과 예전 키만 있는 분은 3인칭, 1인칭을 고른 분만 1인칭 */
export function parseView(raw: string | null | undefined): View {
  return raw === 'first' ? 'first' : 'third';
}

/**
 * 걷기 화면 데스크탑 단축키가 할 일(걷기·점프·V·E는 엔진이 직접 받는다).
 * look은 캐릭터 창, chat·people은 대화창·접속자 목록을 여는 신호(walk-events.ts)다. fullscreen은 전체 화면 켜고 끄기.
 */
export type WalkKeyAct = 'menu' | 'closeAll' | 'shot' | 'help' | 'map' | 'way' | 'portal' | 'look' | 'talk' | 'chat' | 'people' | 'fullscreen';
export type WalkKeyEvent = {
  key: string; code?: string; keyCode?: number; isComposing?: boolean;
  metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; repeat?: boolean;
};
export type WalkKeyState = {
  game: boolean; ready: boolean; panel: boolean; anyOpen: boolean; canTalk: boolean; coarse: boolean;
  /** 입력칸 안이거나 다른 곳이 이미 받은 키(shouldHandleShortcut이 거절) */
  editing: boolean;
  /** 포인터 잠금 중이거나 막 풀린 참, 또는 전체 화면 중이거나 막 끝난 참(그 Esc는 잠금 풀기·전체 화면 끝내기 몫) */
  locked: boolean;
  /** 단추·링크·대화상자 위에서 누름(Enter는 그 단추 몫) */
  onControl: boolean;
  /** 가까이 살필 것이 있음(Enter는 엔진의 살피기 몫) */
  near: boolean;
};

const letterIs = (e: WalkKeyEvent, l: string) => e.key.toLowerCase() === l || e.code === `Key${l.toUpperCase()}`;

/** 글자 단축키가 여는 것. 어느 글자인지는 단축키 표(shortcuts.ts)가 정한다 */
const LETTER_IDS: ReadonlyArray<[ShortcutId, WalkKeyAct]> = [
  ['map', 'map'], ['way', 'way'], ['portal', 'portal'], ['character', 'look'], ['chat', 'chat'], ['people', 'people'],
  ['fullscreen', 'fullscreen'],
];
/** 글자(소문자) → 할 일. 표에서 글자 키가 아닌 것으로 바뀐 항목은 빠진다 */
export const LETTER_ACTS: ReadonlyArray<[string, WalkKeyAct]> = LETTER_IDS.flatMap(([id, act]): Array<[string, WalkKeyAct]> => {
  const l = shortcutLetter(id);
  return l ? [[l, act]] : [];
});

/** 표에 적힌 키 이름(「Esc」, 「Space」) → 브라우저가 주는 e.key 값과 aria-keyshortcuts 이름 */
const KEY_VALUE: Readonly<Record<string, string>> = { Esc: 'Escape', Space: ' ' };
const keyValue = (id: ShortcutId) => KEY_VALUE[SHORTCUTS[id].key] ?? SHORTCUTS[id].key;
/** aria-keyshortcuts에 쓰는 이름(Esc → Escape, Space → Space) */
export const ariaKey = (id: ShortcutId): string => (SHORTCUTS[id].key === 'Esc' ? 'Escape' : SHORTCUTS[id].key);

/**
 * 키 하나 → 할 일과 기본 동작을 막을지. 한글 조합 중이면 아무것도 안 한다.
 * Esc: 열린 것이 있으면 닫고, 없으면 메뉴(휴대폰·잠금 풀기 Esc는 제외). 입력칸 안에서도 Esc는 닫기.
 */
export function walkKeyAction(e: WalkKeyEvent, s: WalkKeyState): { act: WalkKeyAct | null; prevent: boolean } {
  const none = { act: null, prevent: false };
  if (e.isComposing || e.keyCode === 229 || s.game) return none;
  if (e.key === keyValue('menu')) {
    if (s.locked) return none;
    if (s.anyOpen) return { act: 'closeAll', prevent: false };
    return s.ready && !s.coarse ? { act: 'menu', prevent: false } : none;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || s.editing) return none;
  if (e.key === keyValue('shot')) return { act: s.ready && !e.repeat ? 'shot' : null, prevent: true };
  if (e.key === keyValue('help')) return { act: 'help', prevent: true };
  if (!s.ready || e.repeat) return none;
  for (const [l, act] of LETTER_ACTS) if (letterIs(e, l)) return { act, prevent: true };
  if (e.key === keyValue('talk') && s.canTalk && !s.panel && !s.near && !s.onControl) return { act: 'talk', prevent: true };
  return none;
}

/**
 * 사람 목록이 열려 있을 때의 Esc. 목록은 늘 닫는다.
 * 위에 다른 것(패널·놀이·말하기 칸)이 없을 때만 삼켜 메뉴가 열리지 않게 하고, 있으면 흘려보내 그것도 같은 Esc로 닫히게 한다.
 */
export function peopleEsc(e: WalkKeyEvent, covered: boolean): { close: boolean; swallow: boolean } {
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return { close: false, swallow: false };
  return { close: true, swallow: !covered };
}
