'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MORE_LINKS, PALETTE_OPEN_EVENT, PRIMARY_LINKS } from '@/components/NavLinks';
import { TextSize } from '@/components/TextSize';
import { ThemeToggle } from '@/components/ThemeToggle';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { LangToggle } from '@/components/i18n/LangToggle';
import { InstallButton } from '@/components/pwa/InstallButton';
import { useInstallMode } from '@/components/pwa/pwa-store';
import head from '@/components/site-head.module.css';
import { showInstall } from '@/lib/pwa';

const ALL_NAV = [
  ...PRIMARY_LINKS.map((l) => ({ href: l.href, label: l.label, en: l.en })),
  ...MORE_LINKS.map((l) => ({ href: l.href, label: l.label, en: l.en })),
];

export function MobileMenuDrawer() {
  const [open, setOpen] = useState(false);
  const t = useTr();
  const installMode = useInstallMode();
  const path = usePathname();
  const [prevPath, setPrevPath] = useState(path);

  if (prevPath !== path) {
    setPrevPath(path);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="mob-menu-only">
      <button
        type="button"
        className="mob-menu-btn"
        aria-expanded={open}
        aria-label={open ? t('메뉴 닫기', 'Close menu') : t('전체 메뉴 열기', 'Open the full menu')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
        {/* 단추 글은 말마다 하나씩(CSS가 하나만 보인다). 영어 글은 아주 좁은 휴대폰에서 내 계정 캡슐과 한 줄에 들지 않으면
            접힌다(site-head.module.css, 이름은 aria-label이 그대로 말한다) */}
        <span data-ko="">메뉴</span>
        <span data-en="" lang="en" className={head.enMenuText}>Menu</span>
      </button>

      {open ? (
        <div className="mob-drawer-backdrop" onClick={() => setOpen(false)}>
          <div
            className="mob-drawer-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('전체 메뉴', 'Full menu')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mob-drawer-head">
              <strong><T ko="조연당 둘러보기" en="Explore Joyeondang" /></strong>
              <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
                <T ko="닫기" en="Close" />
              </button>
            </div>

            <nav className="mob-drawer-grid" aria-label={t('모바일 전체 메뉴', 'All pages')}>
              <Link
                href="/"
                className="mob-drawer-link"
                aria-current={path === '/' ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <T ko="첫 화면 (대문)" en="Home (front gate)" />
              </Link>
              {ALL_NAV.map((item) => {
                const active = path === item.href || path.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="mob-drawer-link"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <T ko={item.label} en={item.en} />
                  </Link>
                );
              })}
            </nav>

            <div className="mob-drawer-tools">
              <div className="mob-drawer-tool-row">
                <span className="small muted">
                  <T ko="언어 · Language" en="Language" />
                </span>
                <LangToggle />
              </div>
              {showInstall(installMode) ? (
                <div className="mob-drawer-tool-row">
                  <span className="small muted">
                    <T ko="앱처럼 쓰기" en="Use it like an app" />
                  </span>
                  <InstallButton className="chip" onOpen={() => setOpen(false)} />
                </div>
              ) : null}
              <div className="mob-drawer-tool-row">
                <span className="small muted"><T ko="화면 밝기" en="Light or dark" /></span>
                <ThemeToggle />
              </div>
              <div className="mob-drawer-tool-row">
                <span className="small muted"><T ko="글자 크기와 검색" en="Text size and search" /></span>
                <div className="btn-row">
                  <TextSize />
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      setOpen(false);
                      window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT));
                    }}
                  >
                    <T ko="빠른 검색" en="Quick search" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
