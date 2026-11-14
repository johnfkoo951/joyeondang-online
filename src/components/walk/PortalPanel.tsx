'use client';
import { useEffect, useRef } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { ariaKey, digitIndex, type PortalItem } from './controls';
import { IconClose } from './icons';
import { KeyHint } from './KeyHint';
import { PlaceText } from './PlaceText';
import { trapTab, useDialogFocus } from './useDialogFocus';

type Props = {
  items: PortalItem[];
  inRoom: boolean;
  onPick: (slug: string | null) => void;
  onClose: () => void;
};

// 포털 바로 가기(P): 걷지 않고 바로 그 방으로(집이면 열린 방들, 방 안이면 「집으로」와 다른 방들). 숫자키 1~9로 고른다.
// 방 이름은 장소 이름 표로 옮기고(표에 없으면 한국어 그대로), 주인 이름은 한국어 그대로 둔다.
export function PortalPanel({ items, inRoom, onPick, onClose }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  const tr = useTr();
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
    <div className="walk-panel walk-panel-long walk-portals" role="dialog" aria-modal="true" aria-label={tr('포털 바로 가기', 'Portals')} onKeyDown={trapTab}>
      <div className="walk-panel-head">
        <h2 ref={head} tabIndex={-1}><T ko="포털 바로 가기" en="Portals" /></h2>
        <button type="button" className="walk-panel-x" onClick={onClose} aria-label={tr('포털 바로 가기 닫기', 'Close portals')} aria-keyshortcuts={`${ariaKey('portal')} ${ariaKey('menu')}`}>
          <IconClose />
          <KeyHint id="menu" />
        </button>
      </div>
      <div className="walk-panel-body">
      <p className="small walk-panel-meta">
        {inRoom
          ? <T ko="걷지 않고 바로 옮겨 가요. 방에서 나오면 그 방 문 앞에 서요." en="Go straight there without walking. When you leave a room, you stand at its door." />
          : <T ko="걷지 않고 바로 그 방으로 들어가요. 나오면 그 방 문 앞에 서요." en="Go straight into the room without walking. When you come out, you stand at its door." />}
      </p>
      {items.length === 0 ? (
        <p><T ko="지금 들어갈 수 있는 방이 없어요." en="There are no rooms you can enter right now." /></p>
      ) : (
        <ol className="walk-portal-list">
          {items.map((it, i) => (
            <li key={it.slug ?? 'home'}>
              <button type="button" className="walk-portal-btn" onClick={() => onPick(it.slug)} aria-keyshortcuts={String(i + 1)}>
                <kbd>{i + 1}</kbd>
                {it.owner ? <span className="walk-way-owner" lang="ko">{it.owner}</span> : null}
                {/* 「집으로」는 화면 말이고, 그 밖은 방 이름(장소 이름 표) */}
                {it.slug === null ? <span><T ko={it.title} en="Back to the house" /></span> : <PlaceText name={it.title} />}
              </button>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn btn-small" onClick={onClose} aria-keyshortcuts={ariaKey('menu')}><T ko="닫기" en="Close" /> <KeyHint id="menu" /></button>
      </div>
    </div>
  );
}
