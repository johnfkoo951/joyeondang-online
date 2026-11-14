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
  // 글은 늘 「큰 글씨」, 켜졌는지는 aria-pressed와 칩 모양(globals.css .chip[aria-pressed="true"])으로 보인다.
  // 글을 「보통 글씨」로 바꾸면 화면 읽기가 「보통 글씨, 눌림」으로 읽어 무엇이 켜졌는지 반대로 들린다.
  // 화면 말마다 단추를 하나씩 두고 CSS가 고른 말의 단추만 보인다(머리줄이라 그리기 전에 정해지게, components/i18n/T와 같은 방식)
  return (
    <>
      <button data-ko="" type="button" className="chip" onClick={toggle} aria-pressed={large}>
        큰 글씨
      </button>
      <button data-en="" lang="en" type="button" className="chip" onClick={toggle} aria-pressed={large}>
        Large text
      </button>
    </>
  );
}
