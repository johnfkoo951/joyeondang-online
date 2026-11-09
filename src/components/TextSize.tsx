'use client';
import { useSyncExternalStore } from 'react';

// 큰 글씨: 이 기기에서만 기억한다(per-viewer 편의). 저장이 막혀 있어도 토글은 동작한다.
// 처음 값은 layout의 BOOT 스크립트가 <html data-text>에 붙여 두고, 여기서는 그 값을 읽기만 한다.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const read = () => document.documentElement.dataset.text === 'large';
const readOnServer = () => false;

export function TextSize() {
  const large = useSyncExternalStore(subscribe, read, readOnServer);
  function toggle() {
    const next = !large;
    if (next) document.documentElement.dataset.text = 'large';
    else delete document.documentElement.dataset.text;
    try {
      localStorage.setItem('jy.text', next ? 'large' : 'normal');
    } catch {
      // 사생활 보호 모드 등: 기억만 못 할 뿐
    }
    listeners.forEach((l) => l());
  }
  return (
    <button type="button" className="chip" onClick={toggle} aria-pressed={large} title="큰 글씨">
      {large ? '보통 글씨' : '큰 글씨'}
    </button>
  );
}
