'use client';
import { useEffect } from 'react';

// 걷기 화면의 탭 이름. 서버의 metadata는 늘 한국어(「집 안 걷기 · 조연당」)라, 영어 화면이면 그리는 쪽에서 바꿔 둔다.
// 라우터가 탭 이름을 다시 붙여도(시트를 닫고 걷기로 돌아올 때) 따라 바꾸도록 <head>를 지켜본다. 한국어 화면에서는 손대지 않는다.
const KO = '집 안 걷기';
const EN = 'Walk the house';
const SITE_KO = '조연당';
const SITE_EN = 'Joyeondang';

export function useWalkTitle(lang: 'ko' | 'en') {
  useEffect(() => {
    if (lang !== 'en' || typeof document === 'undefined') return;
    const fix = () => {
      const t = document.title;
      if (!t.startsWith(KO)) return;
      const next = t.replace(KO, EN).replace(SITE_KO, SITE_EN);
      if (next !== t) document.title = next;
    };
    fix();
    const mo = new MutationObserver(fix);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      // 한국어로 돌아가면 예전 이름으로(다른 쪽으로 옮겨 가 이름이 바뀌었으면 그대로 둔다)
      const t = document.title;
      if (t.startsWith(EN)) document.title = t.replace(EN, KO).replace(SITE_EN, SITE_KO);
    };
  }, [lang]);
}
