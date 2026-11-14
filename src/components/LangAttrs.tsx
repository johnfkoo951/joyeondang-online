'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { AnchorHTMLAttributes, ComponentProps, HTMLAttributes, ImgHTMLAttributes } from 'react';
import { useTr } from '@/components/i18n/useLang';

// 서버 화면의 속성(title, aria-label, alt)을 화면 말로 고르는 얇은 감싸개. 글은 서버가 <T>로 그린 그대로 받아 넘긴다.
// 서버와 첫 그림은 한국어 속성이고, 바로 뒤에 고른 말로 바뀐다(속성이라 깜박임이 보이지 않는다).
type Pair = readonly [ko: string, en: string];

/** Next 링크 + 화면 말을 따르는 title·aria-label */
export function LangLink({ title, label, ...props }: Omit<ComponentProps<typeof Link>, 'title' | 'aria-label'> & { title?: Pair; label?: Pair }) {
  const t = useTr();
  return <Link {...props} title={title ? t(title[0], title[1]) : undefined} aria-label={label ? t(label[0], label[1]) : undefined} />;
}

/** 이름(aria-label)이 화면 말을 따르는 구역(section, nav, div, aside)이나 목록(ul) */
export function LangRegion({ as = 'section', label, ...props }: Omit<HTMLAttributes<HTMLElement>, 'aria-label'> & { as?: 'section' | 'nav' | 'div' | 'aside' | 'ul'; label: Pair }) {
  const t = useTr();
  const Tag = as;
  return <Tag {...props} aria-label={t(label[0], label[1])} />;
}

/** 보통 링크(<a>: 그림 파일을 새 탭으로 여는 것처럼 Next 링크가 아닌 곳)의 이름(aria-label)이 화면 말을 따른다 */
export function LangAnchor({ label, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label'> & { label: Pair }) {
  const t = useTr();
  return <a {...props} aria-label={t(label[0], label[1])} />;
}

/** 그림의 대체 글(alt)이 화면 말을 따른다 */
export function LangImg({ alt, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & { alt: Pair }) {
  const t = useTr();
  return <img {...props} alt={t(alt[0], alt[1])} />;
}
