'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export const FADE_MS = 250;
/** 새 장면이 끝내 안 뜨더라도 이만큼 지나면 암전을 걷는다 */
const GIVE_UP_MS = 4000;

/**
 * 짧은 암전. run(fn)은 화면을 0.25초 어둡게 한 뒤 fn을 부르고 다시 밝힌다.
 * later면 fn 뒤에 밝히지 않고 reveal()을 기다린다(새 장면이 다 지어졌을 때 부른다).
 * 움직임 줄이기면 어둡게 하지 않고 바로 fn.
 */
export function useFade() {
  const [dark, setDark] = useState(false);
  const busy = useRef(false);
  const waiting = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => {
    timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  const show = useCallback(() => {
    busy.current = false;
    waiting.current = false;
    requestAnimationFrame(() => requestAnimationFrame(() => setDark(false)));
  }, []);

  const reveal = useCallback(() => {
    if (waiting.current) show();
  }, [show]);

  const run = useCallback((fn: () => void | Promise<void>, later = false) => {
    if (busy.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void Promise.resolve().then(fn).catch(() => {});
      return;
    }
    busy.current = true;
    setDark(true);
    timers.current.push(window.setTimeout(() => {
      // 새 장면이 fn 도중에 다 지어져 reveal()이 먼저 와도 놓치지 않게 미리 기다린다고 적어 둔다
      if (later) waiting.current = true;
      Promise.resolve().then(fn).catch(() => {}).finally(() => {
        if (!later) return show();
        if (waiting.current) timers.current.push(window.setTimeout(() => { if (waiting.current) show(); }, GIVE_UP_MS));
      });
    }, FADE_MS));
  }, [show]);

  return { dark, run, reveal };
}
