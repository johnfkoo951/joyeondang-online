// 화면 말(한국어 ↔ 영어). 사전 없이 한국어와 영어를 쓰는 자리에 나란히 둔다: <T ko="지도" en="Map" /> 또는 tr(lang, '지도', 'Map').
// 언어는 이 기기에서만 기억한다(localStorage 'jy.lang'). 처음 온 손님은 브라우저 언어로 정한다: 한국어가 하나도 없으면 영어.
// 처음 값은 layout의 BOOT 스크립트가 그리기 전에 <html data-lang lang>에 붙인다. 서버는 늘 한국어 기준으로 그리고,
// 서버가 그린 글(<T>)은 두 말을 함께 싣고 CSS가 고른 말만 보인다(globals.css: 깜박임 없이). 속성·캔버스 글처럼 CSS로 못 바꾸는 말은
// 화면 코드가 언어를 읽어 고른다(components/i18n/useLang). 사람이 쓴 글(전시 원고, 방명록, 대화)은 옮기지 않는다.

export type Lang = 'ko' | 'en';
export const LANGS: readonly Lang[] = ['ko', 'en'];
/** 기억하는 자리(localStorage)와 BOOT가 붙이는 <html> 속성 이름 */
export const LANG_KEY = 'jy.lang';
export const LANG_ATTR = 'lang';

export const isLang = (v: unknown): v is Lang => v === 'ko' || v === 'en';

/**
 * 처음 언어: 기억한 값이 있으면 그것, 없으면 브라우저 언어 목록에 한국어(ko, ko-KR…)가 하나라도 있으면 한국어, 아니면 영어.
 * 목록이 비었으면(알 수 없음) 한국어
 */
export function pickLang(stored: unknown, languages: readonly string[] | null | undefined): Lang {
  if (isLang(stored)) return stored;
  const list = (languages ?? []).filter((l) => typeof l === 'string' && l.trim());
  if (!list.length) return 'ko';
  return list.some((l) => /^ko\b/i.test(l.trim())) ? 'ko' : 'en';
}

/** 고른 말: 영어가 비었으면 한국어 */
export function tr(lang: Lang, ko: string, en: string): string {
  return lang === 'en' && en ? en : ko;
}

/**
 * BOOT 스크립트에 넣는 글(그리기 전에 돈다). pickLang과 같은 규칙. 저장이 막혀 있어도(사생활 보호 모드) 브라우저 언어로 정한다
 */
export const LANG_BOOT = `try{var s=null;try{s=localStorage.getItem(${JSON.stringify(LANG_KEY)})}catch(e){}var L=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];L=Array.prototype.filter.call(L,function(x){return typeof x==='string'&&x.trim()});var g=s==='ko'||s==='en'?s:!L.length?'ko':L.some(function(x){return /^ko\\b/i.test(x.trim())})?'ko':'en';d.dataset.${LANG_ATTR}=g;d.lang=g}catch(e){}`;
