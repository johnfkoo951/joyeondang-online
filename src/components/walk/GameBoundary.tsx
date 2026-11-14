'use client';
import { useEffect, useRef } from 'react';
import { catchError, type ErrorInfo } from 'next/error';
import { T } from '@/components/i18n/T';

// 놀이 하나가 그리다 터져도 걷기 화면까지 무너지지 않게 놀이 덮개를 감싼다.
// 터진 뒤에는 놀이 덮개의 Esc·초점 처리도 함께 사라지므로, 알림 카드가 초점을 받고 Esc로 닫힌다.
function FallbackCard({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div className="walk-center walk-card" role="alert">
      <p><T ko="놀이를 열다 문제가 생겼어요." en="Something went wrong opening the game." /></p>
      <div className="btn-row">
        <button ref={first} type="button" className="btn btn-pine" onClick={onRetry}><T ko="다시 해 보기" en="Try again" /></button>
        <button type="button" className="btn" onClick={onClose}><T ko="닫기" en="Close" /></button>
      </div>
    </div>
  );
}

function GameFallback({ onClose }: { onClose: () => void }, { error, retry }: ErrorInfo) {
  console.error('[game] 놀이를 그리다 난 오류', error);
  return <FallbackCard onClose={onClose} onRetry={() => retry()} />;
}

export const GameBoundary = catchError(GameFallback);
