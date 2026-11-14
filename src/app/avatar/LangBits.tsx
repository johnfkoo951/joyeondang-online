'use client';
import { useEffect, type ReactNode } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';

// 「내 캐릭터」 화면(서버 컴포넌트)이 언어를 고를 수 없는 두 자리: 이름표 속성(aria-label)과 창 제목(document.title).
// 서버와 첫 그림은 한국어이고, 화면이 살아난 뒤 지금 말로 바꾼다(보이는 글은 T가 두 말을 함께 싣는다).

/** 이름표(aria-label)를 지금 말로 고르는 목록·구역 */
export function Labeled({ as: Tag, ko, en, className, children }: {
  as: 'ul' | 'section'; ko: string; en: string; className?: string; children: ReactNode;
}) {
  const tr = useTr();
  return <Tag className={className} aria-label={tr(ko, en)}>{children}</Tag>;
}

/**
 * 창 제목에서 이 화면의 이름만 지금 말로 바꾼다(「내 캐릭터 만들기 · 조연당」의 앞쪽). 나머지(사이트 이름)는 그대로 둔다.
 * 떠나거나 한국어로 돌아가면 되돌린다
 */
export function TitleLang({ ko, en }: { ko: string; en: string }) {
  const lang = useLang();
  useEffect(() => {
    if (lang !== 'en' || !document.title.includes(ko)) return;
    document.title = document.title.replace(ko, en);
    return () => {
      if (document.title.includes(en)) document.title = document.title.replace(en, ko);
    };
  }, [lang, ko, en]);
  return null;
}
