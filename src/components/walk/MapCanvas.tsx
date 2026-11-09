'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { drawMap, type MapMode, type MapTheme } from '@/walk/minimap';
import type { WalkState } from '@/walk/scene';
import type { HouseWorld } from '@/walk/types';

const DARK = '(prefers-color-scheme: dark)';
const subscribeTheme = (cb: () => void) => {
  const mq = window.matchMedia(DARK);
  mq.addEventListener('change', cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    mq.removeEventListener('change', cb);
    mo.disconnect();
  };
};
const readTheme = (): MapTheme => {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia(DARK).matches ? 'dark' : 'light';
};

/** 사이트 테마(data-theme가 있으면 그것, 없으면 기기 설정)를 지도 색표로 */
export function useMapTheme(): MapTheme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => 'light');
}

type Props = {
  world: HouseWorld;
  /** 매 그림마다 걷기 상태를 읽는다. 아직 걷기가 없으면 null */
  read: () => WalkState | null;
  mode: MapMode;
  theme: MapTheme;
  /** 읽은 상태를 알려 준다(층 배지 등). mini에서만 쓰면 된다 */
  onState?: (s: WalkState) => void;
};

// 2D 지도 캔버스. 칸 크기에 맞춰 화소 밀도를 반영하고, 상태가 바뀐 때만 다시 그린다.
// mini는 초당 약 15번, full은 약 30번 읽는다.
export function MapCanvas({ world, read, mode, theme, onState }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const live = useRef({ read, onState, theme });

  useEffect(() => {
    live.current = { read, onState, theme };
  });

  useEffect(() => {
    const el = box.current;
    const c = cvs.current;
    const ctx = c?.getContext('2d');
    if (!el || !c || !ctx) return;
    let w = 1;
    let h = 1;
    let dpr = 1;
    let raf = 0;
    let lastT = -Infinity;
    let lastKey = '';
    const size = () => {
      const r = el.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      dpr = Math.min(2.5, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      lastKey = '';
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();
    const every = mode === 'mini' ? 1000 / 15 : 1000 / 30;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - lastT < every) return;
      lastT = t;
      const { read: get, onState: tell, theme: th } = live.current;
      const s = get();
      if (s) tell?.(s);
      const st = s ?? { x: world.spawn.x, z: world.spawn.z, level: 1 as const, yaw: world.spawn.yaw };
      const key = `${st.x.toFixed(2)}|${st.z.toFixed(2)}|${st.level}|${st.yaw.toFixed(3)}|${w}x${h}@${dpr}|${th}`;
      if (key === lastKey) return;
      lastKey = key;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      try {
        // 방 장면은 한 층뿐이라 전체 지도도 방 평면 한 장만(mini 그리기를 크게)
        const draw = world.kind === 'room' ? 'mini' : mode;
        drawMap(ctx, world, { x: st.x, z: st.z, level: st.level, yaw: st.yaw }, { mode: draw, width: w, height: h, theme: th });
      } catch {
        // 지도가 그려지지 않아도 걷기는 계속된다
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [world, mode]);

  return (
    <div ref={box} className="walk-map-box">
      <canvas ref={cvs} aria-hidden="true" />
    </div>
  );
}
