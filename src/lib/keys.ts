// 단축키는 한글 조합 중이거나 입력칸에 있을 때 동작하지 않는다.
// 가족용 배치 작업대 core.js 의 isEditingTarget / shouldHandleShortcut 을 그대로 옮겼다(2026-11-08, 동작 동일).

type NodeLike = {
  nodeType?: number;
  parentElement?: NodeLike | null;
  host?: NodeLike | null;
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
  getAttribute?: (name: string) => string | null;
};

export function isEditingTarget(target: unknown): boolean {
  if (!target) return false;
  let node = target as NodeLike | null;
  if (node && node.nodeType === 3) node = node.parentElement ?? null;
  if (node && typeof node.closest === 'function' &&
      node.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return true;
  while (node) {
    if (/^(INPUT|SELECT|TEXTAREA)$/i.test(node.tagName || '') || node.isContentEditable) return true;
    if (typeof node.getAttribute === 'function') {
      const editable = node.getAttribute('contenteditable');
      if (editable !== null && editable !== undefined && String(editable).toLowerCase() !== 'false') return true;
      if (node.getAttribute('role') === 'textbox') return true;
    }
    node = node.parentElement || node.host || null;
  }
  return false;
}

type KeyEventLike = {
  isComposing?: boolean;
  keyCode?: number;
  which?: number;
  defaultPrevented?: boolean;
  target?: unknown;
  composedPath?: () => unknown[];
};

/**
 * 글자 키를 읽는다. 라틴 글자가 왔으면 그 글자다. 한글 자판이 켜져 있으면 같은 자리 키의 key가 자모('ㅈ')로
 * 오므로 그때는 code('KeyW')에서 글자를 꺼낸다. 글자 키가 아니면(화살표·Shift·Space·Enter·숫자) key 그대로, 소문자로.
 * 누를 때와 뗄 때의 값이 늘 같지는 않다(글자 자리가 다른 자판에서 누른 채 보조 키나 자판을 바꾸면 달라진다).
 * 눌린 키를 기억했다가 뗄 때 지우는 곳은 heldKeys를 쓴다.
 */
export function letterOf(e: { key?: string; code?: string }): string {
  const key = e.key ?? '';
  // 라틴 글자가 왔으면 그 글자 그대로(드보락·콜맥처럼 글자 자리가 다른 자판에서도 「M은 지도」가 지켜진다)
  if (/^[a-z]$/i.test(key)) return key.toLowerCase();
  // 라틴 글자가 아니면(한글 자판의 'ㅈ' 등) 자판 자리로 읽는다
  const code = e.code ?? '';
  return /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : key.toLowerCase();
}

export function shouldHandleShortcut(event: KeyEventLike | null | undefined): boolean {
  if (!event || event.isComposing || event.keyCode === 229 || event.which === 229 || event.defaultPrevented) return false;
  const targets = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return ![event.target, ...targets].some(isEditingTarget);
}

/**
 * 떠 있는 창: 열린 <dialog>, 그리고 <dialog>가 아닌 모달 덮개(role="dialog" aria-modal="true"인 div: 놀이 덮개, 크게 보기 등).
 * 이런 창은 열려 있을 때만 그려진다
 */
export const MODAL_SELECTOR = 'dialog[open], [aria-modal="true"]';

type BoxLike = { getClientRects?: () => { length: number } };

/**
 * 창이 떠 있는가. 떠 있으면 사이트 단축키(숫자·글자 이동, 테마)는 쉰다: 놀이가 숫자·글자 키를 쓰기 때문이다.
 * 화면에 보이는 창만 센다: 다른 화면으로 넘어가도 앞 화면은 숨긴 채(display: none) 문서에 남으므로(Next의 Activity),
 * 놀이 덮개를 연 채 떠난 화면의 덮개가 다음 화면의 단축키를 막으면 안 된다
 */
export function isModalOpen(doc: { querySelectorAll: (selector: string) => ArrayLike<BoxLike> } | null | undefined): boolean {
  if (!doc) return false;
  return Array.from(doc.querySelectorAll(MODAL_SELECTOR)).some((el) => (typeof el.getClientRects === 'function' ? el.getClientRects().length > 0 : true));
}

export type HeldKeys = {
  /** 눌렀다. value는 그 키의 뜻(읽은 글자나 동작 이름) */
  down(e: { key?: string; code?: string }, value: string): void;
  /** 뗐다 */
  up(e: { key?: string; code?: string }): void;
  /** 그 뜻의 키를 모두 놓는다(양쪽 Shift처럼 같은 뜻의 키 둘 가운데 하나의 뗀 신호만 오는 경우) */
  drop(value: string): void;
  /** 그 뜻의 키가 하나라도 눌려 있는가 */
  has(value: string): boolean;
  /** 눌려 있는 뜻들(같은 뜻은 한 번만) */
  values(): string[];
  readonly size: number;
  clear(): void;
};

/**
 * 눌린 키 묶음. 누를 때 자판 자리(code)와 그 뜻을 적어 두고, 뗄 때는 자리로 찾아 지운다.
 * 뗄 때 key를 다시 읽으면 안 된다: 드보락·콜맥처럼 글자 자리가 다른 자판에서 누른 채 Option을 누르거나 한글 자판으로
 * 바꾸면 key가 다른 글자로 오고, 그러면 누른 키를 못 찾아 계속 눌린 채 남는다(걷기가 멈추지 않는다).
 * 같은 뜻의 키 둘(W와 ↑)을 함께 누르다 하나만 떼면 그 뜻은 남는다.
 */
export function heldKeys(): HeldKeys {
  const byPlace = new Map<string, string>();
  const read = (e: { key?: string; code?: string }) => `key:${letterOf(e)}`;
  return {
    down(e, value) {
      byPlace.set(e.code || read(e), value);
    },
    up(e) {
      // 자리 정보가 없는 환경(일부 화면 자판)은 읽은 글자로 찾는다
      if (!(e.code && byPlace.delete(e.code))) byPlace.delete(read(e));
    },
    drop(value) {
      for (const [place, v] of byPlace) if (v === value) byPlace.delete(place);
    },
    has(value) {
      for (const v of byPlace.values()) if (v === value) return true;
      return false;
    },
    values: () => [...new Set(byPlace.values())],
    get size() {
      return byPlace.size;
    },
    clear() {
      byPlace.clear();
    },
  };
}
