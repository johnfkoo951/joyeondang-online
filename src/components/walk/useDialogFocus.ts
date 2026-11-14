'use client';
import { useEffect, type RefObject } from 'react';
import { FOCUSABLE, trapTarget } from './focusTrap';

// 걷기 화면의 작은 대화상자(도움말, 살피기)가 함께 쓰는 포커스 처리.
// 열리면 target으로 포커스를 옮기고, 닫히면 열기 전 자리로 돌려준다.
// 단, 닫힐 때 초점이 이미 다른 곳(새로 뜬 페이지 시트 등)에 가 있으면 그대로 둔다: 닫힌 창 안에 있던 초점만 돌려준다.
// 돌려주는 trap을 대화상자 루트의 onKeyDown에 걸면 Tab이 안에서만 돈다(제목에 초점이 있어도).
export function useDialogFocus(target: RefObject<HTMLElement | null>, key?: string) {
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const own = target.current;
    // 이 창의 테두리(대화상자 루트). 초점이 이 안에 있으면 「아직 이 창의 초점」으로 본다
    const box = own?.closest('[role="dialog"]') ?? own;
    own?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      const moved = now instanceof HTMLElement && now !== document.body && now.isConnected && !(box && box.contains(now));
      if (!moved && back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, [target, key]);
}

/**
 * 대화상자 안의 Tab 자리들(문서 순서). 고르지 않은 라디오는 Tab으로 닿지 않으므로 뺀다.
 * 그려지지 않은 것(display: none 안, 예: 페이지 시트에서 라우터가 숨겨 둔 앞 페이지)도 초점을 받지 못하므로 뺀다.
 */
export function tabStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((el) => el.tabIndex >= 0 && !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked) && el.getClientRects().length > 0);
}

const isBefore = (a: HTMLElement, b: HTMLElement) => (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;

export function trapTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const to = trapTarget(tabStops(e.currentTarget), active, e.shiftKey, isBefore);
  if (!to) return;
  e.preventDefault();
  to.focus();
}
