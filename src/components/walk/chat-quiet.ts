// 말 숨기기: 휴대폰에서 여럿이 말하면 말 기록과 말풍선이 화면을 덮는다. 말 기록과 사람들 머리 위 말풍선을 함께 감추고,
// 감춘 동안 온 다른 사람의 말 수를 센다(단추 위 작은 숫자). 고른 값은 이 기기에 기억한다.
// 저장소는 사생활 보호 창·앱 안 브라우저에서 꺼내기만 해도 던질 수 있다: 그때는 이 탭에서만 기억한다.
// React·three에 기대지 않아 단위 시험으로 본다(tests/unit/walk-chat-quiet.test.ts).

export const QUIET_KEY = 'jy.walk.chat.hidden';

/** 저장소의 몫(시험에서는 가짜를 넘긴다) */
export type QuietStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

/** 이 기기의 저장소. 꺼내다 던지면 없는 것으로 */
function deviceStorage(): QuietStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 기억해 둔 값(없거나 읽지 못하면 보이기) */
export function readQuiet(storage: QuietStorage | null = deviceStorage()): boolean {
  try {
    return storage?.getItem(QUIET_KEY) === '1';
  } catch {
    return false;
  }
}

/** 기억하기. 저장하지 못하면 false(이 탭의 값은 그대로 쓴다) */
export function saveQuiet(on: boolean, storage: QuietStorage | null = deviceStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(QUIET_KEY, on ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

/** 감춘 동안 온 말 수. heard: 지금까지 들은 다른 사람의 말 수, from: 감출 때의 그 수 */
export function unreadCount(hidden: boolean, heard: number, from: number): number {
  return hidden ? Math.max(0, Math.floor(heard - from)) : 0;
}

/** 단추 위 작은 숫자. 없으면 빈 글, 100 이상은 「99+」 */
export function unreadBadge(n: number): string {
  if (!(n > 0)) return '';
  return n > 99 ? '99+' : String(Math.floor(n));
}

/** 휴대폰 말 기록에 보이는 줄 수. 화면이 작아 다섯 줄이면 3D를 많이 덮는다(한 줄도 두 줄까지만 보인다, CSS) */
export const PHONE_LINES = 3;

/** 말 기록에 보일 줄: 데스크탑은 받아 둔 그대로(다섯 줄), 휴대폰은 마지막 PHONE_LINES 줄 */
export function shownLines<T>(lines: readonly T[], coarse: boolean): T[] {
  return coarse ? lines.slice(-PHONE_LINES) : lines.slice();
}

// 이 탭의 값. 처음 읽을 때 저장소에서 가져오고, 바꾸면 듣는 쪽(걷기 화면)에 알린다
let hidden: boolean | null = null;
const subs = new Set<() => void>();

/** 지금 말을 숨겼는가(useSyncExternalStore가 읽는다) */
export function isQuiet(): boolean {
  if (hidden === null) hidden = readQuiet();
  return hidden;
}

/** 말 숨기기를 켜고 끈다. 이 기기에 기억하고(못 하면 이 탭에서만) 듣는 쪽에 알린다 */
export function setQuiet(on: boolean): void {
  hidden = on;
  saveQuiet(on);
  for (const fn of subs) fn();
}

/** useSyncExternalStore에 넘기는 구독 */
export function subscribeQuiet(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
