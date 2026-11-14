'use client';
import type { ReactNode } from 'react';
import { T } from '@/components/i18n/T';
import { showInstall } from '@/lib/pwa';
import { IconAddHome } from './icons';
import { startInstall, useInstallMode } from './pwa-store';

// 「홈 화면에 추가」 단추. 브라우저 설치 창이 있으면 바로 띄우고, 없으면 기기에 맞는 안내 창을 연다.
// 이미 앱으로 보고 있거나 안내할 길이 없으면(데스크톱 사파리 등) 그리지 않는다.
export function InstallButton({
  className = 'btn',
  onOpen,
  children,
}: {
  className?: string;
  /** 누르는 순간(메뉴를 닫을 때 쓴다) */
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const mode = useInstallMode();
  if (!showInstall(mode)) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onOpen?.();
        void startInstall();
      }}
    >
      {children ?? (
        <>
          <IconAddHome /> <T ko="홈 화면에 추가" en="Add to Home Screen" />
        </>
      )}
    </button>
  );
}
