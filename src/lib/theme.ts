'use client';
import { useSyncExternalStore } from 'react';

export type SiteTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'jy.theme';
const THEME_COLORS: Record<SiteTheme, string> = {
  light: '#f4f0e6',
  dark: '#1d1b19',
};

const listeners = new Set<() => void>();

/** 디폴트는 늘 밝은 크림베이지(light). 사용자가 직접 다크를 골랐을 때만 dark */
export function getEffectiveTheme(): SiteTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function syncMetaThemeColor(theme: SiteTheme) {
  if (typeof document === 'undefined') return;
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    m.removeAttribute('media');
    m.content = THEME_COLORS[theme];
  });
}

export function setSiteTheme(next: SiteTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // 사생활 보호 창 등에서는 현재 탭 동안만 유지
  }
  syncMetaThemeColor(next);
  listeners.forEach((cb) => cb());
}

function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(cb);
    };
  }
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
      document.documentElement.dataset.theme = e.newValue;
      syncMetaThemeColor(e.newValue);
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    mo.disconnect();
    window.removeEventListener('storage', onStorage);
  };
}

/** 서버에서는 'light'(디폴트), 브라우저에서도 저장된 다크가 아니면 늘 'light' */
export function useOptionalSiteTheme(): SiteTheme {
  return useSyncExternalStore(subscribeTheme, getEffectiveTheme, () => 'light');
}

export function useSiteTheme(): SiteTheme {
  return useSyncExternalStore(subscribeTheme, getEffectiveTheme, () => 'light');
}
