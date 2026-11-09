'use client';
import { useEffect, useRef, useState } from 'react';
import type { NetStatus } from '@/walk/net';
import type { RemotePlayer } from '@/walk/types';
import { IconPeople } from './icons';

type Props = { status: NetStatus; players: RemotePlayer[]; me: string };

// 위 단추 줄의 「함께 N」 칩. 누르면 같은 공간 사람들 이름이 펼쳐진다(나 포함).
// 잇는 중이면 숫자 대신 「…」. 함께 걷기를 쓸 수 없으면 부르는 쪽이 아예 그리지 않는다.
export function PeopleChip({ status, players, me }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const live = status === 'live';
  const n = players.length + 1;
  const show = open && live;

  useEffect(() => {
    if (!show) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [show]);

  const label = live ? `함께 걷는 사람 ${n}명, 이름 보기` : '함께 걷기 잇는 중';
  return (
    <div ref={wrap} className="walk-people-wrap">
      <button
        type="button"
        className="walk-tool walk-people-chip"
        data-live={live ? 'true' : undefined}
        onClick={() => live && setOpen((o) => !o)}
        aria-expanded={show}
        aria-controls="walk-people-list"
        aria-label={label}
        title={live ? '함께 걷는 사람' : '잇는 중'}
      >
        <IconPeople />
        <span className="walk-tool-text" aria-hidden="true">함께</span>
        <span className="walk-people-n" aria-hidden="true">{live ? n : '…'}</span>
      </button>
      {show ? (
        <ul id="walk-people-list" className="walk-people" aria-label="같은 공간 사람들">
          <li data-me="true"><span className="walk-people-dot" aria-hidden="true" />{me} (나)</li>
          {players.map((p) => (
            <li key={p.id}>
              <span className="walk-people-dot" style={{ background: p.color }} aria-hidden="true" />
              {p.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
