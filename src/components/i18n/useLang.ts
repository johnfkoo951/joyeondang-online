'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { LANG_ATTR, LANG_KEY, isLang, tr, type Lang } from '@/lib/i18n';

// 지금 언어를 읽고 바꾼다. 처음 값은 BOOT가 <html data-lang>에 붙여 둔 것을 읽는다.
// 서버와 첫 그림(하이드레이션)은 한국어로 맞추고, 바로 뒤에 고른 언어로 다시 그린다(useSyncExternalStore의 서버 값).
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const read = (): Lang => {
  const v = document.documentElement.dataset[LANG_ATTR];
  return isLang(v) ? v : 'ko';
};
const readOnServer = (): Lang => 'ko';

/** 지금 언어 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, read, readOnServer);
}

/** 지금 언어로 고르는 함수: tr('지도', 'Map') */
export function useTr(): (ko: string, en: string) => string {
  const lang = useLang();
  return useCallback((ko: string, en: string) => tr(lang, ko, en), [lang]);
}

/** 화면 밖 코드(걷기 엔진 같은 것)가 지금 언어를 읽을 때 */
export function currentLang(): Lang {
  return typeof document === 'undefined' ? 'ko' : read();
}

/** 언어가 바뀌면 부른다(걷기 엔진에 알릴 때). 끊는 함수를 돌려준다 */
export function onLangChange(cb: () => void): () => void {
  return subscribe(cb);
}

/** 언어를 바꾼다: <html>에 붙이고 이 기기에 기억한다(저장이 막혀 있어도 이번 방문 동안은 바뀐다) */
export function setLang(next: Lang) {
  if (!isLang(next) || typeof document === 'undefined') return;
  const d = document.documentElement;
  d.dataset[LANG_ATTR] = next;
  d.lang = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // 사생활 보호 모드 등: 기억만 못 할 뿐
  }
  listeners.forEach((l) => l());
}
