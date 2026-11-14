// 도장 찍기 결과를 화면 상태로 바꾸는 규칙(순수 함수). 걷기 화면의 살피기 창, 방 화면, 현장 QR 도장이 같은 말을 쓴다.

/** 서버 동작 earnStamp(src/app/actions.ts)가 돌려주는 모양 */
export type StampReply = { ok: boolean; fresh: boolean; retry: boolean; reason?: string };

export type StampState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  /** 이번에 새로 찍혔다 */
  | { kind: 'new' }
  /** 이미 찍은 도장이다 */
  | { kind: 'have' }
  /** 못 찍었다. again: 다시 눌러 볼 만한가(연결·서버 문제) */
  | { kind: 'fail'; message: string; again: boolean };

export const STAMP_WORDS = {
  offline: '연결이 잠시 끊겼어요. 다시 눌러 주세요.',
  error: '지금은 도장을 찍지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  closed: '이 방은 지금 쉬는 중이라 도장을 찍을 수 없어요.',
  denied: '도장은 명단에 계신 분만 찍을 수 있어요.',
} as const;

/** 서버 답(못 받았으면 null) → 화면 상태 */
export function stampOutcome(r: StampReply | null): StampState {
  if (!r || typeof r !== 'object') return { kind: 'fail', message: STAMP_WORDS.offline, again: true };
  if (r.ok && r.fresh) return { kind: 'new' };
  if (r.ok && r.reason === 'closed') return { kind: 'fail', message: STAMP_WORDS.closed, again: false };
  if (r.ok) return { kind: 'have' };
  if (r.retry) return { kind: 'fail', message: STAMP_WORDS.error, again: true };
  if (r.reason === 'closed') return { kind: 'fail', message: STAMP_WORDS.closed, again: false };
  return { kind: 'fail', message: STAMP_WORDS.denied, again: false };
}

/** 찍은 뒤 보이는 한 줄. 방 이름이 있으면 「○○ 도장을 찍었어요」 */
export function stampLine(state: StampState, name: string): string | null {
  const who = name.trim();
  switch (state.kind) {
    case 'new':
      return who ? `${who} 도장을 찍었어요` : '도장을 찍었어요';
    case 'have':
      return who ? `${who} 도장은 이미 찍었어요` : '이미 찍은 도장이에요';
    case 'fail':
      return state.message;
    default:
      return null;
  }
}

/** 단추 글: 찍기 전, 찍는 중, 찍음, 다시 찍기 */
export function stampButton(state: StampState, label: string): { text: string; locked: boolean } {
  switch (state.kind) {
    case 'busy':
      return { text: '찍는 중', locked: true };
    case 'new':
    case 'have':
      return { text: '찍음', locked: true };
    case 'fail':
      return state.again ? { text: '다시 찍기', locked: false } : { text: label, locked: true };
    default:
      return { text: label, locked: false };
  }
}

// ───────── 화면이 영어일 때(같은 뜻). 상태(StampState)의 message는 한국어 그대로 두고, 보일 때 옮긴다
/** STAMP_WORDS의 영어(같은 열쇠) */
export const STAMP_WORDS_EN: Readonly<Record<keyof typeof STAMP_WORDS, string>> = {
  offline: 'The connection dropped for a moment. Please press it again.',
  error: 'We couldn’t stamp it just now. Please try again in a moment.',
  closed: 'This room is on a break right now, so it can’t be stamped.',
  denied: 'Only guests on the guest list can collect stamps.',
};

/** 실패 말(STAMP_WORDS의 한국어)의 영어. 모르는 말이면 받은 그대로 */
export function stampWordEn(message: string): string {
  const key = (Object.keys(STAMP_WORDS) as (keyof typeof STAMP_WORDS)[]).find((k) => STAMP_WORDS[k] === message);
  return key ? STAMP_WORDS_EN[key] : message;
}

/** stampLine의 영어(name은 영어 이름) */
export function stampLineEn(state: StampState, name: string): string | null {
  const who = name.trim();
  switch (state.kind) {
    case 'new':
      return who ? `You stamped ${who}` : 'You got the stamp';
    case 'have':
      return who ? `You already have the ${who} stamp` : 'You already have this stamp';
    case 'fail':
      return stampWordEn(state.message);
    default:
      return null;
  }
}

/** stampButton의 영어(label은 영어 단추 글) */
export function stampButtonEn(state: StampState, label: string): { text: string; locked: boolean } {
  const ko = stampButton(state, label);
  switch (state.kind) {
    case 'busy':
      return { ...ko, text: 'Stamping' };
    case 'new':
    case 'have':
      return { ...ko, text: 'Stamped' };
    case 'fail':
      return { ...ko, text: state.again ? 'Try again' : label };
    default:
      return { ...ko, text: label };
  }
}

/** 휴대폰이면 짧게 두 번 떤다(도장이 「쿵」 찍히는 느낌). 지원하지 않거나 막히면 아무것도 안 한다 */
export function buzz(nav: { vibrate?: (p: number | number[]) => boolean } | undefined = typeof navigator === 'undefined' ? undefined : navigator): void {
  try {
    nav?.vibrate?.([24, 60, 36]);
  } catch {
    // 막힌 기기: 그림과 글로만 알린다
  }
}
