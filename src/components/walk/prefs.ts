// 걷기 화면의 작은 설정값·안내 글·기기 판정. WalkClient가 길어지지 않게 모아 둔다.
import type { View } from '@/walk/scene';
import { parseView } from './controls';
import { SHORTCUTS, type ShortcutId } from './shortcuts';

/** 안내 글에 넣는 키 이름(단축키 표에서 읽는다: 키를 바꾸면 안내도 따라 바뀐다) */
const K = (id: ShortcutId) => SHORTCUTS[id].key;

export const COARSE = '(pointer: coarse)';
export const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
export const isCoarse = () => window.matchMedia(COARSE).matches;
export const isStill = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** v2(2026-11-09): 처음에는 내 캐릭터가 보이게 3인칭으로. 예전 키의 'first'도 한 번은 3인칭으로 시작한다 */
const VIEW_KEY = 'jy.walk.view.v2';
const ONBOARD_KEY = 'jy.walk.onboarded';
/** 둘러보기 빠르기(기본 1, 0.3~3). 메뉴의 「마우스 감도」에서 바꾼다 */
const SENS_KEY = 'jy.walk.sens';

export const readView = (): View => {
  try {
    return parseView(localStorage.getItem(VIEW_KEY));
  } catch {
    return 'third';
  }
};
export const saveView = (v: View) => {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* 저장 안 돼도 괜찮다 */ }
};
export const readOnboarded = () => {
  try {
    return localStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    return false;
  }
};
export const saveOnboarded = () => {
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* 저장 안 돼도 괜찮다 */ }
};
export const readSens = () => {
  try {
    const v = Number(localStorage.getItem(SENS_KEY));
    return Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.3, v)) : 1;
  } catch {
    return 1;
  }
};

export const saveSens = (v: number) => {
  try { localStorage.setItem(SENS_KEY, String(Math.min(3, Math.max(0.3, v)))); } catch { /* 저장 안 돼도 괜찮다 */ }
};

/** 놀이마다 따로 기억하는 「소리 끄기」. 메뉴의 소리 설정은 이 기본값을 한꺼번에 바꾼다(놀이 안에서 다시 바꿀 수 있다) */
const GAME_MUTE_KEYS = ['jy.game.target.mute.v1', 'jy.sentences.mute.v1', 'jy.brain.mute.v1'];
export const readGameSound = () => {
  try {
    return !GAME_MUTE_KEYS.every((k) => localStorage.getItem(k) === '1');
  } catch {
    return true;
  }
};
export const saveGameSound = (on: boolean) => {
  try { for (const k of GAME_MUTE_KEYS) localStorage.setItem(k, on ? '0' : '1'); } catch { /* 저장 안 돼도 괜찮다 */ }
};

export const HINT_MS = 8000;
/** 첫 방문 카드: 이만큼 지나면 혼자 접힌다(그 전에 걷거나 둘러보기 시작해도 접힌다) */
export const ONBOARD_MS = 12000;
export const ONBOARD_FADE_MS = 320;
/** 첫 방문 카드의 안내(한국어·영어). 「 · 」로 마디를 나눠 보인다(WalkGuide) */
export const ONBOARD_DESK = {
  ko: `마우스나 방향키로 둘러보세요 · WASD 걷기 · ${K('jump')} 점프 · ${K('act')} 들어가기·살피기 · ${K('portal')} 포털 · ${K('character')} 캐릭터 · ${K('shot')} 사진 · ${K('menu')} 메뉴`,
  en: `Look around with the mouse or arrow keys · WASD walk · ${K('jump')} jump · ${K('act')} enter or look closer · ${K('portal')} portal · ${K('character')} character · ${K('shot')} photo · ${K('menu')} menu`,
} as const;
/** 휴대폰: 앉기 단추는 두 스틱 사이 아래, 점프 단추 옆 */
export const ONBOARD_TOUCH = {
  ko: '왼쪽으로 걷고 오른쪽으로 둘러봐요 · 가운데 단추로 뛰거나 앉아요 · 위 「메뉴」에 캐릭터·사진·포털이 있어요',
  en: 'Walk with the left circle, look with the right · The middle buttons jump and sit · “Menu” at the top has character, photos and portals',
} as const;

/**
 * 조작 안내(처음 8초) 한 칸: 키 이름과 뜻(한국어·영어). 키 이름이 낱말이면(마우스·클릭·방향키) 영어 이름(keyEn)도 둔다.
 * tag: click은 마우스가 잠긴 동안 「Esc 마우스 풀기」로 바뀌는 칸, fullscreen은 전체 화면을 쓸 수 있는 브라우저에서만 보이는 칸
 */
export type HintItem = { key: string; keyEn?: string; ko: string; en: string; tag?: 'click' | 'fullscreen' };

export const HINT: readonly HintItem[] = [
  { key: '마우스', keyEn: 'Mouse', ko: '둘러보기', en: 'Look around' },
  { key: '클릭', keyEn: 'Click', ko: '끝없이 둘러보기', en: 'Turn freely', tag: 'click' },
  { key: '방향키', keyEn: 'Arrows', ko: '돌기·위아래 보기', en: 'Turn, look up and down' },
  { key: 'W A S D', ko: '걷기', en: 'Walk' },
  { key: K('run'), ko: '달리기', en: 'Run' },
  { key: K('jump'), ko: '점프', en: 'Jump' },
  { key: K('sit'), ko: '앉기·일어서기', en: 'Sit or stand' },
  { key: K('act'), ko: '살피기·들어가기', en: 'Look closer or enter' },
  { key: K('portal'), ko: '포털', en: 'Portal' },
  { key: K('map'), ko: '지도', en: 'Map' },
  { key: K('way'), ko: '길 찾기', en: 'Find the way' },
  { key: K('view'), ko: '시점', en: 'View' },
  { key: K('fullscreen'), ko: '전체 화면', en: 'Full screen', tag: 'fullscreen' },
  { key: K('character'), ko: '캐릭터', en: 'Character' },
  { key: K('shot'), ko: '사진', en: 'Photo' },
  { key: K('menu'), ko: '메뉴', en: 'Menu' },
  { key: K('help'), ko: '조작', en: 'Controls' },
];
/** 마우스가 잠긴 동안 「클릭」 칸 대신 보이는 칸 */
export const HINT_LOCKED: HintItem = { key: 'Esc', ko: '마우스 풀기', en: 'Release the mouse' };
export const HINT_TALK: HintItem = { key: K('talk'), ko: '말하기', en: 'Say' };
/** 초대 손님(함께 걷기)에게만 보이는 안내: 대화창, 접속자 목록 */
export const HINT_TOGETHER: readonly HintItem[] = [
  { key: K('chat'), ko: '대화', en: 'Chat' },
  { key: K('people'), ko: '접속자', en: 'People here' },
];
/** 걷기를 시작했다고 보는 키(첫 방문 카드를 접는다) */
export const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
/** 마우스 둘러보기를 멈출 화면 위 단추·카드(걷기 엔진이 이 둘레에서는 돌지 않는다) */
export const HUD_SEL = [
  '.walk-place', '.walk-tools', '.walk-mini', '.walk-onboard[data-state="on"]', '.walk-near', '.walk-act', '.walk-act-side', '.walk-hint[data-show]',
  '.walk-way-banner', '.walk-chat', '.walk-chat-btn', '.walk-chat-quiet', '.walk-people', '.walk-shot-toast', '.walk-social', '.walk-making',
].join(', ');
/** 걷는 화면 위에 떠 있는 단추(패널·대화상자 밖): 마우스·손가락으로 누른 뒤 초점을 놓는다 */
export const HUD_BTN_SEL = '.walk-tools button, .walk-place, .walk-mini, .walk-act button, .walk-act-side button, .walk-jump, .walk-sit, .walk-chat-btn, .walk-chat-quiet, .walk-near';
/** 층 배지 옆에서는 이름 앞의 「N층 」을 뺀다(실제 집 구역 이름은 「1층 거실」처럼 층으로 시작한다) */
export const placeName = (name: string) => name.replace(/^[12]층\s*/, '') || name;

/** 글자 단축키: 한글 자판이 켜져 있어도(e.key가 ㅎ 등) 같은 자리 키면 받는다 */
export const keyIs = (e: KeyboardEvent, letter: string) =>
  e.key.toLowerCase() === letter || e.code === `Key${letter.toUpperCase()}`;
/** Enter·Space가 단추나 링크 위에서 눌렸으면 그 단추 몫이다 */
export const onControl = (e: KeyboardEvent) =>
  Boolean((e.target as HTMLElement | null)?.closest?.('button, a, summary, [role="dialog"]'));
