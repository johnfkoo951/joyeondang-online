'use client';
import { useMemo, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { placeName } from '@/lib/place-names';
import type { GalleryItem } from '@/lib/gallery-manifest';
import { frameLabel, frameOrder } from '@/walk/gallery';
import { artFailed, artLoaded, artNewUrl, artStart } from '@/walk/gallery-loads';
import type { GalleryFrame } from '@/walk/types';
import { ariaKey } from './controls';
import { IconClose } from './icons';
import { KeyHint } from './KeyHint';
import { trapTab, useDialogFocus } from './useDialogFocus';

type Props = {
  /** 걸린 액자들(세계의 gallery) */
  frames: readonly GalleryFrame[];
  /** 전시 목록(액자 id → 전시물). null이면 아직 모른다 */
  items: ReadonlyMap<string, GalleryItem> | null;
  /** 처음 볼 액자 */
  start: string;
  coarse: boolean;
  onClose: () => void;
  /** 그림을 받지 못했다(서명 주소가 끝났을 수 있다): 목록을 다시 받아 달라고 한다(받는 쪽이 간격·횟수를 막는다) */
  onBroken?: () => void;
};

/** 끌어서 넘기는 거리(px) */
const SWIPE = 48;

/**
 * 그림 한 장: 받는 동안 「불러오는 중」, 못 받으면 알림. 그림이 바뀌면(열쇠, key) 처음부터. 같은 그림의 주소만 바뀌면(목록을 다시
 * 받음) 보이는 그림은 그대로 두고, 실패해 있었으면 새 주소로 한 번만 더 받아 본다. 그래도 안 되면 알림을 남기고 멈춘다
 * (gallery-loads.ts). 목록을 다시 받자는 신호는 처음 실패에만
 */
function Art({ item, onBroken }: { item: GalleryItem; onBroken?: () => void }) {
  const [view, setView] = useState(() => artStart(item.image));
  // 앞 렌더의 주소와 견줘 렌더 중에 맞춘다(목록이 새 주소를 가져왔다)
  const [seen, setSeen] = useState(item.image);
  if (seen !== item.image) {
    setSeen(item.image);
    const next = artNewUrl(view, item.image);
    if (next !== view) setView(next);
  }
  return (
    <div className="walk-gallery-art" data-state={view.state}>
      {/* 서명 주소(다른 사이트)의 그림이라 next/image를 거치지 않는다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={view.src}
        alt={item.title}
        // 그림 제목은 사람이 쓴 글이라 한국어 그대로 둔다
        lang="ko"
        decoding="async"
        draggable={false}
        onLoad={() => setView(artLoaded(view))}
        onError={() => {
          const r = artFailed(view, item.image);
          setView(r.view);
          if (r.ask) onBroken?.();
        }}
      />
      {view.state === 'loading' ? <p className="walk-gallery-note" aria-hidden="true"><T ko="불러오는 중" en="Loading" /></p> : null}
      {view.state === 'error' ? (
        <p className="walk-gallery-note" role="status"><T ko="그림을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요." en="Couldn’t load the picture. Please open it again in a moment." /></p>
      ) : null}
    </div>
  );
}

// 부엌 사진 갤러리 크게 보기: 액자 앞에서 E(휴대폰은 「크게 보기」)로 연다. 제목, 설명, 앞뒤로 넘기기(←→, 끌기).
// 넘기는 차례는 그림이 걸린 액자들(층, 벽 a~d, 순번). 빈 액자에서 열었으면 그 액자도 제자리에 끼워 둔다.
// 화면 말은 한국어·영어를 따르고, 그림의 제목·설명(사람이 쓴 글)은 한국어 그대로 lang="ko"로 둔다.
export function GalleryViewer({ frames, items, start, coarse, onClose, onBroken }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  const lang = useLang();
  const tr = useTr();
  const order = useMemo(() => [...frames].sort(frameOrder), [frames]);
  const [current, setCurrent] = useState(start);
  const seq = useMemo(() => order.filter((f) => items?.has(f.id) || f.id === current).map((f) => f.id), [order, items, current]);
  const at = Math.max(0, seq.indexOf(current));
  const frame = order.find((f) => f.id === current) ?? null;
  const item = items?.get(current) ?? null;
  const many = seq.length > 1;
  const go = (d: -1 | 1) => {
    if (!many) return;
    setCurrent(seq[(at + d + seq.length) % seq.length]);
  };
  const drag = useRef<{ x: number; id: number } | null>(null);
  // 액자 자리 이름: 걸린 구역 이름(장소 이름 표로 옮김)과 액자 id(gallery.ts frameLabel과 같은 꼴)
  const where = frame ? (lang === 'en' ? `${placeName('en', frame.room)} ${frame.id}` : frameLabel(frame)) : '';

  return (
    <div
      className="walk-panel walk-panel-long walk-gallery"
      role="dialog"
      aria-modal="true"
      aria-label={tr('사진 갤러리', 'Photo gallery')}
      onKeyDown={(e) => {
        trapTab(e);
        if (e.nativeEvent.isComposing || e.keyCode === 229 || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        go(e.key === 'ArrowLeft' ? -1 : 1);
      }}
    >
      <div className="walk-panel-head">
        <h2 ref={head} tabIndex={-1} aria-live="polite">{item ? <span lang="ko">{item.title}</span> : <T ko="곧 전시해요" en="Coming soon" />}</h2>
        <button type="button" className="walk-panel-x" onClick={onClose} aria-label={tr('갤러리 닫기', 'Close gallery')} aria-keyshortcuts={ariaKey('menu')}>
          <IconClose />
          <KeyHint id="menu" />
        </button>
      </div>
      <figure
        className="walk-gallery-stage"
        onPointerDown={(e) => { drag.current = { x: e.clientX, id: e.pointerId }; }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.id !== e.pointerId || Math.abs(e.clientX - d.x) < SWIPE) return;
          go(e.clientX < d.x ? 1 : -1);
        }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {item ? (
          <Art key={`${item.id}:${item.key}`} item={item} onBroken={onBroken} />
        ) : (
          <div className="walk-gallery-soon">
            <p className="walk-gallery-soon-title"><T ko="곧 전시해요" en="Coming soon" /></p>
            <p className="small"><T ko="이 자리에 걸 그림을 고르고 있어요." en="We’re still choosing a picture for this spot." /></p>
          </div>
        )}
        {item?.desc ? <figcaption className="walk-gallery-desc" lang="ko">{item.desc}</figcaption> : null}
      </figure>
      <div className="walk-gallery-nav">
        <button type="button" className="btn btn-small" onClick={() => go(-1)} disabled={!many} aria-label={tr('앞 그림', 'Previous picture')} aria-keyshortcuts="ArrowLeft">
          <span aria-hidden="true">←</span> <T ko="앞" en="Back" />
        </button>
        <p className="walk-gallery-count small" aria-label={tr(`${seq.length}점 가운데 ${at + 1}번째`, `Picture ${at + 1} of ${seq.length}`)}>
          {at + 1} / {seq.length}
          {frame ? <span className="walk-panel-meta" lang={lang === 'en' && /[가-힣]/.test(where) ? 'ko' : undefined}> · {where}</span> : null}
        </p>
        <button type="button" className="btn btn-small" onClick={() => go(1)} disabled={!many} aria-label={tr('다음 그림', 'Next picture')} aria-keyshortcuts="ArrowRight">
          <T ko="다음" en="Next" /> <span aria-hidden="true">→</span>
        </button>
      </div>
      {!coarse && many ? <p className="small walk-panel-meta walk-gallery-hint"><T ko="← → 키로 넘겨요." en="Use the ← → keys to flip through." /></p> : null}
    </div>
  );
}
