'use client';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { nameLang } from '@/lib/name-lang';
import { drawQr } from '@/lib/qr-draw';
import styles from './EventQr.module.css';

/** 브라우저에서 그리는 QR(행사 초대 코드는 만든 화면에만 있어서 서버가 다시 그릴 수 없다). 흰 바탕에 검은 칸 */
export function EventQr({ text, label, className }: { text: string; label: string; className?: string }) {
  const { d, size } = useMemo(() => drawQr(text), [text]);
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/**
 * 발표 화면에 크게 띄우기: 화면 전체를 덮는 QR, 짧은 주소, 코드. 닫기 단추나 Esc로 돌아온다.
 * 전체 화면은 여는 단추를 누른 순간에 부탁한다(브라우저가 사용자 동작 안에서만 허락한다). 닫을 때 전체 화면도 끝낸다.
 */
export function EventQrStage({ link, code, label, extra, onClose }: {
  link: string;
  code: string;
  label: string;
  extra?: ReactNode;
  onClose: () => void;
}) {
  const t = useTr();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        // 덮은 화면 안의 단추는 닫기 하나다: 뒤의 관리 화면으로 초점이 빠져나가지 않게
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      back?.focus();
    };
  }, []);
  const short = link.replace(/^https?:\/\//, '');
  // body 바로 아래에 그린다: 관리 화면 안의 쌓임 맥락(움직임 효과 등) 아래로 머리줄이 비쳐 보이지 않게.
  // 행사 이름표(label)는 행사를 연 분이 지은 글이라 옮기지 않는다
  const qrName = t(`${label} 초대 QR`, `Invite QR for ${label}`);
  return createPortal(
    <div className={styles.stage} role="dialog" aria-modal="true" aria-label={qrName}>
      <EventQr text={link} label={qrName} className={styles.stageQr} />
      <div className={styles.stageText}>
        <p className={styles.stageLabel} lang={nameLang(label)}>{label}</p>
        <p className={styles.stageHow}><T ko="휴대폰 카메라로 찍고 구글 계정으로 들어오세요" en="Scan with your phone camera and come in with Google" /></p>
        <p className={styles.stageLink}>{short}</p>
        <p className={styles.stageCode} aria-label={t(`코드 ${code.split('').join(' ')}`, `Code ${code.split('').join(' ')}`)}>{code}</p>
        {extra}
      </div>
      <button ref={closeRef} type="button" className={`btn ${styles.stageClose}`} onClick={() => onCloseRef.current()}>
        <T ko="닫기" en="Close" /> <kbd className={styles.key}>Esc</kbd>
      </button>
    </div>,
    document.body,
  );
}

/** 여는 단추에서 부른다: 전체 화면을 부탁한다(안 되면 그냥 화면을 덮는다. 휴대폰 사파리는 전체 화면이 없다) */
export function askFullscreen(): void {
  const el = document.documentElement;
  if (document.fullscreenElement || typeof el.requestFullscreen !== 'function') return;
  el.requestFullscreen().catch(() => {});
}
