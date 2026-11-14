'use client';
import type { HTMLAttributes } from 'react';
import { useTr } from '@/components/i18n/useLang';

// 서버 화면에서 이름(aria-label)이 화면 말을 따라야 하는 구역(nav, section, div). 안의 글은 서버가 그린 그대로 받아 넘긴다.
// 서버와 첫 그림은 한국어 이름이고, 바로 뒤에 고른 말로 바뀐다(속성이라 깜박임이 보이지 않는다)
export function NamedRegion({ as: Tag = 'section', ko, en, ...props }: Omit<HTMLAttributes<HTMLElement>, 'aria-label'> & {
  as?: 'section' | 'nav' | 'div';
  ko: string;
  en: string;
}) {
  const tr = useTr();
  return <Tag {...props} aria-label={tr(ko, en)} />;
}
