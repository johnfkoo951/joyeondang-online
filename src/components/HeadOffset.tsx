'use client';
import { useEffect } from 'react';

// 머리줄이 붙어 다니는 넓은 화면에서, 키보드 초점이나 「본문으로 건너뛰기」로 옮겨 간 곳이 머리줄 밑에 숨지 않게 한다(WCAG 2.4.11).
// 머리줄 높이를 --head-h로 알리고 globals.css의 html scroll-padding-top이 그만큼 비워 둔다. 줄이 꺾이거나 큰 글씨·확대로 높이가 바뀌면
// 다시 잰다. 휴대폰처럼 머리줄이 붙지 않는 폭(position: static)과 머리줄을 접는 걷기 화면에서는 0.
export function HeadOffset() {
  useEffect(() => {
    const head = document.querySelector<HTMLElement>('.site-head');
    if (!head) return;
    const root = document.documentElement;
    const measure = () => {
      const sticky = getComputedStyle(head).position === 'sticky';
      root.style.setProperty('--head-h', sticky ? `${Math.ceil(head.getBoundingClientRect().height)}px` : '0px');
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--head-h');
    };
  }, []);
  return null;
}
