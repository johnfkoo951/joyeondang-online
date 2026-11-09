'use client';
import { useEffect, useRef } from 'react';
import { digitIndex, type PortalItem } from './controls';
import { trapTab, useDialogFocus } from './useDialogFocus';

type Props = {
  items: PortalItem[];
  inRoom: boolean;
  onPick: (slug: string | null) => void;
  onClose: () => void;
};

// 포털 바로 가기(P): 걷지 않고 바로 그 방으로(집이면 열린 방들, 방 안이면 「집으로」와 다른 방들). 숫자키 1~9로 고른다.
export function PortalPanel({ items, inRoom, onPick, onClose }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  const live = useRef({ items, onPick });
  useEffect(() => {
    live.current = { items, onPick };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const i = digitIndex(e);
      const it = i >= 0 ? live.current.items[i] : undefined;
      if (!it) return;
      e.preventDefault();
      live.current.onPick(it.slug);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="walk-panel walk-portals" role="dialog" aria-modal="true" aria-label="포털 바로 가기" onKeyDown={trapTab}>
      <h2 ref={head} tabIndex={-1}>포털 바로 가기</h2>
      <p className="small walk-panel-meta">
        {inRoom ? '걷지 않고 바로 옮겨 가요. 방에서 나오면 그 방 문 앞에 서요.' : '걷지 않고 바로 그 방으로 들어가요. 나오면 그 방 문 앞에 서요.'}
      </p>
      {items.length === 0 ? (
        <p>지금 들어갈 수 있는 방이 없어요.</p>
      ) : (
        <ol className="walk-portal-list">
          {items.map((it, i) => (
            <li key={it.slug ?? 'home'}>
              <button type="button" className="walk-portal-btn" onClick={() => onPick(it.slug)} aria-keyshortcuts={String(i + 1)}>
                <kbd>{i + 1}</kbd>
                {it.owner ? <span className="walk-way-owner">{it.owner}</span> : null}
                <span>{it.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn btn-small" onClick={onClose}>닫기</button>
    </div>
  );
}
