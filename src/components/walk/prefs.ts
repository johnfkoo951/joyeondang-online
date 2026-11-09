// 걷기 화면의 작은 설정값·안내 글·기기 판정. WalkClient가 길어지지 않게 모아 둔다.
import type { View } from '@/walk/scene';
import { parseView } from './controls';

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
export const ONBOARD_DESK = '마우스를 움직여 둘러보세요 · WASD 걷기 · Space 점프 · E 들어가기·살피기 · P 포털 · C 캐릭터 · F2 사진 · Esc 메뉴';
export const ONBOARD_TOUCH = '왼쪽으로 걷고 오른쪽으로 둘러봐요 · 가운데 단추로 뛰어요 · 위 「메뉴」에 캐릭터·사진·포털이 있어요';

export const HINT: Array<[string, string]> = [
  ['마우스', '둘러보기'], ['클릭', '끝없이 둘러보기'], ['W A S D', '걷기'], ['Shift', '달리기'], ['Space', '점프'],
  ['E', '살피기·들어가기'], ['P', '포털'], ['M', '지도'], ['G', '길 찾기'], ['V', '시점'], ['C', '캐릭터'], ['F2', '사진'],
  ['Esc', '메뉴'], ['?', '조작'],
];
export const HINT_TALK: [string, string] = ['Enter', '말하기'];
/** 걷기를 시작했다고 보는 키(첫 방문 카드를 접는다) */
export const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
/** 마우스 둘러보기를 멈출 화면 위 단추·카드(걷기 엔진이 이 둘레에서는 돌지 않는다) */
export const HUD_SEL = [
  '.walk-place', '.walk-tools', '.walk-mini', '.walk-onboard[data-state="on"]', '.walk-near', '.walk-act', '.walk-hint[data-show]',
  '.walk-way-banner', '.walk-chat', '.walk-chat-btn', '.walk-people', '.walk-shot-toast',
].join(', ');
/** 층 배지 옆에서는 이름 앞의 「N층 」을 뺀다(실제 집 구역 이름은 「1층 거실」처럼 층으로 시작한다) */
export const placeName = (name: string) => name.replace(/^[12]층\s*/, '') || name;

/** 글자 단축키: 한글 자판이 켜져 있어도(e.key가 ㅎ 등) 같은 자리 키면 받는다 */
export const keyIs = (e: KeyboardEvent, letter: string) =>
  e.key.toLowerCase() === letter || e.code === `Key${letter.toUpperCase()}`;
/** Enter·Space가 단추나 링크 위에서 눌렸으면 그 단추 몫이다 */
export const onControl = (e: KeyboardEvent) =>
  Boolean((e.target as HTMLElement | null)?.closest?.('button, a, summary, [role="dialog"]'));
