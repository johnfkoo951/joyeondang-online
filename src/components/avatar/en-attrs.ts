import type { Lang } from '@/lib/i18n';

/**
 * 영어 화면이면 덮어쓸 속성(aria-label, title 등). 한국어 속성 글은 그대로 적어 두고 그 뒤에 펼친다:
 * <section aria-label="작업대" {...enAttrs(lang, { 'aria-label': 'Workbench' })}>. 한국어 화면에는 아무것도 펼치지 않는다
 * (한국어 화면의 글과 속성이 전과 한 글자도 다르지 않다)
 */
export function enAttrs<A extends Record<string, string>>(lang: Lang, attrs: A): A | undefined {
  return lang === 'en' ? attrs : undefined;
}
