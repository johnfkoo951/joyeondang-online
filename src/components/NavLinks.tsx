'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { MORE_LINKS, PRIMARY_LINKS } from '@/components/site-words';
import head from '@/components/site-head.module.css';

export const PALETTE_OPEN_EVENT = 'jy:open-palette';

// 메뉴 말(한국어·영어)은 site-words.ts에 둔다. 휴대폰 메뉴(MobileMenuDrawer)도 같은 표를 쓴다
export { MORE_LINKS, PRIMARY_LINKS };

function isRouteActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`) || (href === '/map' && path.startsWith('/room/'));
}

export function NavLinks() {
  const path = usePathname();
  const t = useTr();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [prevPath, setPrevPath] = useState(path);

  if (prevPath !== path) {
    setPrevPath(path);
    if (moreOpen) setMoreOpen(false);
  }

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
        setMoreOpen(false);
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
  }, [moreOpen]);

  const moreActive = MORE_LINKS.some((l) => isRouteActive(path, l.href));

  return (
    <nav className={`nav ${head.nav}`} aria-label={t('주요 메뉴', 'Main menu')}>
      {PRIMARY_LINKS.map((l) => {
        const active = isRouteActive(path, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            aria-keyshortcuts={l.key}
          >
            <T ko={l.label} en={l.en} />
          </Link>
        );
      })}

      <div ref={moreRef} className="nav-more-wrap">
        <button
          type="button"
          className="nav-more-btn"
          data-active={moreActive || undefined}
          aria-expanded={moreOpen}
          aria-haspopup="true"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <T ko={<span>더보기</span>} en={<span>More</span>} />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {moreOpen ? (
          <div className="nav-more-popover" role="region" aria-label={t('더 많은 메뉴', 'More pages')}>
            {MORE_LINKS.map((l) => {
              const active = isRouteActive(path, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="nav-more-item"
                  aria-current={active ? 'page' : undefined}
                  aria-keyshortcuts={l.key}
                  onClick={() => setMoreOpen(false)}
                >
                  {/* <T>의 span을 넣지 않는다(.nav-more-item span이 글을 줄인다): 말마다 따로 두고 CSS가 하나만 보인다 */}
                  <strong data-ko="">{l.label}</strong>
                  <strong data-en="" lang="en">{l.en}</strong>
                  <span data-ko="">{l.desc}</span>
                  <span data-en="" lang="en">{l.descEn}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

export function QuickSearchButton() {
  const t = useTr();
  return (
    <button
      type="button"
      className="head-icon-btn head-desktop-only"
      title={t('빠른 이동 검색 (/ 또는 ⌘K)', 'Quick search (/ or ⌘K)')}
      aria-label={t('빠른 이동 검색 열기', 'Open quick search')}
      aria-keyshortcuts="/ Meta+K Control+K"
      onClick={() => window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT))}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </svg>
    </button>
  );
}
