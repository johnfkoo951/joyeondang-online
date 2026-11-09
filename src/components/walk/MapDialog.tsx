'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { MapTheme } from '@/walk/minimap';
import type { WalkState } from '@/walk/scene';
import type { HouseWorld } from '@/walk/types';
import { IconClose } from './icons';
import { MapCanvas } from './MapCanvas';

type Props = {
  world: HouseWorld;
  read: () => WalkState | null;
  theme: MapTheme;
  level: 1 | 2;
  place: string;
  coarse: boolean;
  onClose: () => void;
};

// M으로 여는 전체 지도. 1층과 2층을 나란히, 지금 층만 색으로 그린다.
// 열리면 닫기 단추로 포커스를 옮기고, 닫히면 열기 전 자리로 돌려준다. Tab은 대화상자 안에서만 돈다.
export function MapDialog({ world, read, theme, level, place, coarse, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const downOutside = useRef(false);
  const room = world.kind === 'room';
  const name = room ? '방 지도' : '집 지도';

  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus();
    return () => {
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>('button, a[href]')];
    if (items.length === 0) return;
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="walk-map"
      // 바깥을 눌렀다 뗐을 때만 닫는다(누르는 순간 닫으면 아래 미니맵이 눌려 다시 열린다)
      onPointerDown={(e) => { downOutside.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOutside.current && e.target === e.currentTarget) onClose(); }}
    >
      <div ref={root} className="walk-map-card" role="dialog" aria-modal="true" aria-label={name} onKeyDown={trap}>
        <div className="walk-map-head">
          <div>
            <h2>{name}</h2>
            <p className="walk-map-sub">
              {room ? null : <span className="walk-floor" data-level={level}>{level}층</span>}
              <span>{place}</span>
            </p>
          </div>
          <button ref={closeBtn} type="button" className="walk-tool" onClick={onClose} aria-label="지도 닫기" title="지도 닫기 (M, Esc)" aria-keyshortcuts="M Escape">
            <IconClose />
          </button>
        </div>
        <div className="walk-map-full">
          <MapCanvas world={world} read={read} mode="full" theme={theme} />
        </div>
        <div className="walk-map-foot">
          {coarse ? (
            // 휴대폰: 바깥 여백이 좁아 누르기 어렵다. 엄지가 닿는 아래쪽에 큰 닫기 단추를 둔다.
            <button type="button" className="btn btn-small walk-map-close" onClick={onClose}>닫기</button>
          ) : (
            <span><kbd>M</kbd> 또는 <kbd>Esc</kbd>로 닫아요</span>
          )}
          <Link href="/map">그림 지도로 보기</Link>
        </div>
      </div>
    </div>
  );
}
