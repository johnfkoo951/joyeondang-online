'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTr } from '@/components/i18n/useLang';
import { nameLang } from '@/lib/name-lang';

// 머리줄의 내 계정 캡슐과 드롭다운. 이름(name)은 사람이 지은 것이라 옮기지 않는다(한글이면 lang="ko").
// 이름이 없으면 역할 이름을 보이는데, 그것은 화면 말이라 한국어·영어를 함께 두고 CSS가 하나만 보인다(머리줄이라 깜박이지 않게).
// <T>의 span을 드롭다운 머리에 넣지 않는다(.acct-dropdown-head span이 글을 줄인다): 말마다 따로 둔다.
export function AccountPopover({
  name,
  roleLabel,
  roleLabelEn,
  isAdmin,
  children,
}: {
  name: string | null;
  roleLabel: string;
  roleLabelEn: string;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTr();
  const path = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [prevPath, setPrevPath] = useState(path);

  if (prevPath !== path) {
    setPrevPath(path);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="acct-menu-wrap">
      <button
        type="button"
        className="acct-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="acct-dot" aria-hidden="true" />
        {name ? (
          <span className="acct-name" lang={nameLang(name)}>{name}</span>
        ) : (
          <>
            <span className="acct-name" data-ko="">{roleLabel}</span>
            {/* 영어 역할 이름(Pending guest 등)은 한국어보다 길어 칸을 조금 넓힌다(잘리지 않게, 영어 쪽에만) */}
            <span className="acct-name" data-en="" lang="en" style={{ maxWidth: 120 }}>{roleLabelEn}</span>
          </>
        )}
        {isAdmin ? (
          <>
            <span className="acct-role-tag" data-ko="">관리</span>
            <span className="acct-role-tag" data-en="" lang="en">Admin</span>
          </>
        ) : null}
        <svg className="acct-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          className="acct-dropdown"
          role="region"
          aria-label={t('내 계정 메뉴', 'My account menu')}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setOpen(false);
          }}
        >
          <div className="acct-dropdown-head">
            {name ? (
              <strong lang={nameLang(name)}>{name}</strong>
            ) : (
              <>
                <strong data-ko="">{roleLabel}</strong>
                <strong data-en="" lang="en">{roleLabelEn}</strong>
              </>
            )}
            <span data-ko="">{roleLabel}</span>
            <span data-en="" lang="en">{roleLabelEn}</span>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
