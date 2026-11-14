// 걷기 화면 안의 창을 여는 신호. 단축키·메뉴(WalkClient)와 창을 가진 부품(대화창, 접속자 목록)이
// 서로를 가져오지 않고 창 이벤트로 이어진다.

export const WALK_EVENT = {
  /** 대화창(채팅 전체 이력) 열기. detail: { mention?: string } 이면 그 사람을 @멘션한 채로 연다 */
  openChat: 'jy:walk-open-chat',
  /** 접속자 목록 열기 */
  openPeople: 'jy:walk-open-people',
  /** 열린 창을 모두 닫기(Esc 한 번으로 닫히게) */
  closeAll: 'jy:walk-close-all',
  /**
   * 서버에 저장된 걷기 겉모습이 다른 화면(걷기 위에 연 「내 캐릭터」 시트 등)에서 바뀌었다. detail: { look }
   * 걷기 화면이 살아 있으면 받아서 바로 갈아입는다(다시 저장하지 않는다)
   */
  lookChanged: 'jy:walk-look-changed',
} as const;

export type WalkEventName = (typeof WALK_EVENT)[keyof typeof WALK_EVENT];

export function emitWalk(name: WalkEventName, detail?: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** 신호를 듣는다. 돌려준 함수를 부르면 그만 듣는다 */
export function onWalk(name: WalkEventName, fn: (detail: unknown) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = (e: Event) => fn((e as CustomEvent).detail);
  window.addEventListener(name, h);
  return () => window.removeEventListener(name, h);
}
