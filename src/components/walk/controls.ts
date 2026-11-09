// 걷기 조작의 순수 판단(E 살피기·들어가기, P 포털 목록, 숫자키, 사진 이름, 시점 기억).
// React·three에 기대지 않아 단위 시험으로 본다(tests/unit/walk-controls.test.ts).
import type { View } from '@/walk/scene';
import type { Hotspot } from '@/walk/types';

/** E(휴대폰은 아래 가운데 단추)를 누르면 할 일: 바로 들어가기, 바로 나가기, 살피기 패널 */
export type Interact = { kind: 'enter'; slug: string } | { kind: 'leave' } | { kind: 'panel' };

export function interactFor(
  spot: Pick<Hotspot, 'kind' | 'slug'> | null,
  canEnter: (slug: string) => boolean,
  inRoom: boolean,
): Interact | null {
  if (!spot) return null;
  // 열린 방 문이면 확인 없이 들어간다(닫힌 문은 문패를 보여 주는 패널)
  if (spot.kind === 'portal' && spot.slug && canEnter(spot.slug)) return { kind: 'enter', slug: spot.slug };
  if (spot.kind === 'exit' && inRoom) return { kind: 'leave' };
  // 놀이 자리는 시작 전에 한 줄 설명이 필요해 패널을 둔다(패널 안에서 Enter로 바로 시작)
  return { kind: 'panel' };
}

/** 휴대폰 단추와 데스크탑 「E」 안내에 붙는 말 */
export function actLabel(i: Interact | null): string {
  if (i?.kind === 'enter') return '들어가기';
  if (i?.kind === 'leave') return '나가기';
  return '살피기';
}

/** P 포털 바로 가기 목록의 한 줄. slug가 null이면 「집으로」 */
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

const pad = (n: number) => String(n).padStart(2, '0');
/** 기기에 내려받는 사진 이름: 조연당-YYYYMMDD-HHMM.jpg(이 기기 시각) */
export function shotFileName(d: Date, n?: number): string {
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `조연당-${day}-${pad(d.getHours())}${pad(d.getMinutes())}${n ? `-${n}` : ''}.jpg`;
}

/** 시점 기억(jy.walk.view.v2): 처음 오는 분과 예전 키만 있는 분은 3인칭, 1인칭을 고른 분만 1인칭 */
export function parseView(raw: string | null | undefined): View {
  return raw === 'first' ? 'first' : 'third';
}

/** 걷기 화면 데스크탑 단축키가 할 일(걷기·점프·V·E는 엔진이 직접 받는다) */
export type WalkKeyAct = 'menu' | 'closeAll' | 'shot' | 'help' | 'map' | 'way' | 'portal' | 'look' | 'talk';
export type WalkKeyEvent = {
  key: string; code?: string; keyCode?: number; isComposing?: boolean;
  metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; repeat?: boolean;
};
export type WalkKeyState = {
  game: boolean; ready: boolean; panel: boolean; anyOpen: boolean; canTalk: boolean; coarse: boolean;
  /** 입력칸 안이거나 다른 곳이 이미 받은 키(shouldHandleShortcut이 거절) */
  editing: boolean;
  /** 포인터 잠금 중이거나 막 풀린 참(그 Esc는 잠금 풀기 몫) */
  locked: boolean;
  /** 단추·링크·대화상자 위에서 누름(Enter는 그 단추 몫) */
  onControl: boolean;
  /** 가까이 살필 것이 있음(Enter는 엔진의 살피기 몫) */
  near: boolean;
};

const letterIs = (e: WalkKeyEvent, l: string) => e.key.toLowerCase() === l || e.code === `Key${l.toUpperCase()}`;
const LETTER_ACTS: ReadonlyArray<[string, WalkKeyAct]> = [['m', 'map'], ['g', 'way'], ['p', 'portal'], ['c', 'look']];

/**
 * 키 하나 → 할 일과 기본 동작을 막을지. 한글 조합 중이면 아무것도 안 한다.
 * Esc: 열린 것이 있으면 닫고, 없으면 메뉴(휴대폰·잠금 풀기 Esc는 제외). 입력칸 안에서도 Esc는 닫기.
 */
export function walkKeyAction(e: WalkKeyEvent, s: WalkKeyState): { act: WalkKeyAct | null; prevent: boolean } {
  const none = { act: null, prevent: false };
  if (e.isComposing || e.keyCode === 229 || s.game) return none;
  if (e.key === 'Escape') {
    if (s.locked) return none;
    if (s.anyOpen) return { act: 'closeAll', prevent: false };
    return s.ready && !s.coarse ? { act: 'menu', prevent: false } : none;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || s.editing) return none;
  if (e.key === 'F2') return { act: s.ready && !e.repeat ? 'shot' : null, prevent: true };
  if (e.key === '?') return { act: 'help', prevent: true };
  if (!s.ready || e.repeat) return none;
  for (const [l, act] of LETTER_ACTS) if (letterIs(e, l)) return { act, prevent: true };
  if (e.key === 'Enter' && s.canTalk && !s.panel && !s.near && !s.onControl) return { act: 'talk', prevent: true };
  return none;
}
