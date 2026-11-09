'use client';
import { useEffect, type RefObject } from 'react';

/**
 * 위 단추 줄의 실제 높이를 걷기 화면에 --walk-bar(px)로 알린다.
 * 좁은 휴대폰에서 단추가 늘어 줄이 둘로 접히면 그 아래 미니맵·안내·띠가 따라 내려간다.
 */
export function useBarHeight(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const r = root.current;
    const bar = r?.querySelector<HTMLElement>('.walk-top');
    if (!r || !bar || typeof ResizeObserver === 'undefined') return;
    const set = () => r.style.setProperty('--walk-bar', `${Math.round(bar.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    set();
    return () => ro.disconnect();
  }, [root]);
}
