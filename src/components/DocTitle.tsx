'use client';
import { useEffect } from 'react';
import { useLang } from '@/components/i18n/useLang';
import { isSheetOpen } from '@/components/walk/sheet-state';

// 화면이 영어일 때 문서 제목(브라우저 탭, 카카오톡 위 막대에 보이는 글)을 영어로 바꾼다. 한국어 화면은 Next가 붙인 제목 그대로다.
// 걷기 화면 위 시트로 뜬 페이지는 제목을 건드리지 않는다(한국어 화면에서도 시트는 걷기 제목을 그대로 둔다).
// 떠나거나 한국어로 돌아갈 때는 제목이 아직 이것이 붙인 그대로일 때만 되돌린다(다음 페이지가 이미 제 제목을 붙였으면 두고 간다).
export function DocTitle({ en }: { en: string }) {
  const lang = useLang();
  useEffect(() => {
    if (lang !== 'en' || isSheetOpen()) return;
    const before = document.title;
    const mine = `${en} · Joyeondang`;
    document.title = mine;
    return () => {
      if (document.title === mine) document.title = before;
    };
  }, [lang, en]);
  return null;
}
