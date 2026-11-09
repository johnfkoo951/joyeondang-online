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

export function shouldHandleShortcut(event: KeyEventLike | null | undefined): boolean {
  if (!event || event.isComposing || event.keyCode === 229 || event.which === 229 || event.defaultPrevented) return false;
  const targets = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return ![event.target, ...targets].some(isEditingTarget);
}
