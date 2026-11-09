'use client';
import { useEffect, type RefObject } from 'react';

// 걷기 화면의 작은 대화상자(도움말, 살피기)가 함께 쓰는 포커스 처리.
// 열리면 target으로 포커스를 옮기고, 닫히면 열기 전 자리로 돌려준다.
// 돌려주는 trap을 대화상자 루트의 onKeyDown에 걸면 Tab이 안에서만 돈다.
export function useDialogFocus(target: RefObject<HTMLElement | null>, key?: string) {
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    target.current?.focus({ preventScroll: true });
    return () => {
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, [target, key]);
}

export function trapTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button, a[href], [tabindex="-1"]')];
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
