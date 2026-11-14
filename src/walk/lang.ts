// 걷기 엔진이 화면 말(한국어·영어)을 읽는 곳. 엔진은 화면 밖 코드라 React 훅 대신 지금 언어를 그때그때 읽고(글자판을 만들 때),
// 언어가 바뀌면 onWalkLang으로 알림을 받아 캔버스 글을 다시 그린다. 사람이 쓴 글(이름, 말, 전시물 제목)은 옮기지 않는다.
import { currentLang, onLangChange } from '@/components/i18n/useLang';
import { tr, type Lang } from '@/lib/i18n';

export type { Lang };

/** 지금 화면 말. 읽지 못하면(시험의 가짜 document처럼 <html>이 없을 때) 한국어 */
export function walkLang(): Lang {
  try {
    return currentLang();
  } catch {
    return 'ko';
  }
}

/** 지금 화면 말로 고른 글(영어가 비면 한국어) */
export function walkTr(ko: string, en: string): string {
  return tr(walkLang(), ko, en);
}

/** 화면 말이 바뀌면 부른다. 끊는 함수를 돌려준다 */
export function onWalkLang(cb: () => void): () => void {
  return onLangChange(cb);
}
