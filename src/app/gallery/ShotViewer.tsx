'use client';
import { useEffect, useRef } from 'react';
import { T } from '@/components/i18n/T';
import type { Shot } from '@/lib/shots';

type Props = {
  shot: Shot;
  url: string | null;
  title: string;
  onDownload: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** 앞뒤 사진(처음·끝이면 null) */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  /** 몇 번째인지 안내(예: 3 / 12) */
  position?: string;
};

// 사진 크게 보기. <dialog>를 모달로 열어 Esc로 닫히고, 포커스가 안에 머문다.
export function ShotViewer({ shot, url, title, onDownload, onDelete, onClose, onPrev, onNext, position }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    // 닫기는 부르지 않는다(개발 모드의 두 번 실행에서 close 이벤트가 곧바로 창을 닫지 않게). 빠지면 DOM과 함께 사라진다
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="gallery-viewer"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        // 한글 조합 중이거나 다른 키와 함께 누르면 넘기지 않는다
        if (e.nativeEvent.isComposing || e.keyCode === 229 || e.altKey || e.metaKey || e.ctrlKey) return;
        if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); onPrev(); }
        else if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); onNext(); }
      }}
      aria-keyshortcuts="ArrowLeft ArrowRight Escape"
    >
      <div className="gallery-viewer-body">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서명 주소라 이미지 최적화를 거치지 않는다
          <img src={url} alt={title} width={shot.w} height={shot.h} />
        ) : (
          <p className="muted"><T ko="사진을 불러오는 중이에요" en="Loading the photo" /></p>
        )}
        <p className="small muted">{title}{position ? ` · ${position}` : ''}</p>
        <div className="btn-row">
          <button type="button" className="btn btn-small" onClick={() => onPrev?.()} aria-disabled={!onPrev} aria-keyshortcuts="ArrowLeft">
            <T ko="← 앞 사진" en="← Previous" />
          </button>
          <button type="button" className="btn btn-small" onClick={() => onNext?.()} aria-disabled={!onNext} aria-keyshortcuts="ArrowRight">
            <T ko="다음 사진 →" en="Next →" />
          </button>
          <button type="button" className="btn btn-roof btn-small" onClick={onDownload}><T ko="내려받기" en="Download" /></button>
          <button type="button" className="btn btn-small" onClick={onDelete}><T ko="지우기" en="Delete" /></button>
          <button type="button" className="btn btn-small" onClick={onClose} autoFocus><T ko="닫기" en="Close" /></button>
        </div>
      </div>
    </dialog>
  );
}
