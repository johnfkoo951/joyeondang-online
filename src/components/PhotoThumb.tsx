'use client';
import { useEffect, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';

// 쪽지에 붙은 사진: 작은 그림(320)을 누르면 보기용(1280)을 대화상자로 크게 연다.
// 주소는 서버가 만든 10분짜리 서명 주소다. 시간이 지나면 화면을 새로 열면 된다.
// label: 사진 이름(한국어, 예: 「OO 님이 붙인 사진」), labelEn: 그 영어(예: 「Photo from OO」). 영어 화면에서 labelEn이 없으면
// 「Attached photo」로 부른다(사람 이름이 든 한국어 이름을 영어 문장에 섞지 않는다).
export function PhotoThumb({ thumb, view, label, labelEn }: { thumb: string; view: string; label: string; labelEn?: string }) {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  const name = lang === 'en' ? labelEn || 'Attached photo' : label;
  return (
    <>
      <button
        type="button" className="photo-thumb-btn" onClick={() => setOpen(true)}
        aria-label={lang === 'en' ? `View larger: ${name}` : `${label} 크게 보기`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 짧은 서명 주소라 이미지 최적화를 거치지 않는다 */}
        <img className="photo-thumb" src={thumb} alt={name} loading="lazy" />
      </button>
      {open ? <PhotoDialog view={view} label={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PhotoDialog({ view, label, onClose }: { view: string; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="gallery-viewer"
      aria-label={label}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="gallery-viewer-body">
        {/* eslint-disable-next-line @next/next/no-img-element -- 짧은 서명 주소 */}
        <img src={view} alt={label} />
        <div className="btn-row">
          <button type="button" className="btn btn-small" onClick={onClose} autoFocus><T ko="닫기" en="Close" /></button>
        </div>
      </div>
    </dialog>
  );
}
