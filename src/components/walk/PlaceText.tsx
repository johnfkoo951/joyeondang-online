'use client';
import { useLang } from '@/components/i18n/useLang';
import { placeName } from '@/lib/place-names';
import { FRAME_EN } from './hud-text';

/** 한글이 섞였는가(표에 없어 옮기지 못한 이름) */
export const hasHangul = (s: string) => /[가-힣]/.test(s);

/** 가까운 자리의 이름: 액자 앞의 빈 이름은 화면 말로, 그 밖은 장소 이름 표로(표에 없으면 받은 이름 그대로) */
export function spotName(lang: 'ko' | 'en', title: string, kind?: string): string {
  if (lang === 'en' && kind === 'frame' && FRAME_EN[title]) return FRAME_EN[title];
  return placeName(lang, title);
}

/**
 * 장소 이름(층 배지 옆, 살피기·길 찾기·포털·지도 머리). 영어 화면이면 장소 이름 표(lib/place-names)로 옮긴다.
 * 표에 없는 이름(사람이 지은 방 이름, 집 데이터의 새 이름, 그림 제목)은 한국어 그대로 두고 lang="ko"를 붙인다(낭독기가 한국어로 읽게).
 * kind: 가까운 자리의 종류(액자 앞이면 빈 이름도 옮긴다). 한국어 화면에서는 예전과 같은 span 하나에 같은 글자다
 */
export function PlaceText({ name, kind, className }: { name: string; kind?: string; className?: string }) {
  const lang = useLang();
  const text = spotName(lang, name, kind);
  return <span className={className} lang={lang === 'en' && hasHangul(text) ? 'ko' : undefined}>{text}</span>;
}
