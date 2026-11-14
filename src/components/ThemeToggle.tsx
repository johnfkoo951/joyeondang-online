'use client';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { setSiteTheme, useOptionalSiteTheme } from '@/lib/theme';

export function ThemeToggle() {
  const theme = useOptionalSiteTheme();
  const t = useTr();

  return (
    <div className="theme-switch" role="group" aria-label={t('화면 밝기 선택', 'Choose light or dark')}>
      <button
        type="button"
        className="theme-opt"
        aria-pressed={theme === 'light'}
        data-active={theme === 'light' || undefined}
        title={t('밝은 종이 테마 (라이트 모드)', 'Bright paper theme (light mode)')}
        onClick={() => setSiteTheme('light')}
      >
        <SunIcon />
        <T ko={<span>라이트</span>} en={<span>Light</span>} />
      </button>
      <button
        type="button"
        className="theme-opt"
        aria-pressed={theme === 'dark'}
        data-active={theme === 'dark' || undefined}
        title={t('어두운 밤 테마 (다크 모드)', 'Dark night theme (dark mode)')}
        onClick={() => setSiteTheme('dark')}
      >
        <MoonIcon />
        <T ko={<span>다크</span>} en={<span>Dark</span>} />
      </button>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.3M12 19.2v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.2 14.8A8.2 8.2 0 1 1 9.2 3.8a6.6 6.6 0 0 0 11 11Z" />
    </svg>
  );
}
