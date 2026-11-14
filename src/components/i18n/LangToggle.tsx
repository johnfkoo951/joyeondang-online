'use client';
import { setLang, useLang } from './useLang';

// 언어 바꾸기 칩: 지금 한국어면 「EN」, 영어면 「한국어」를 보인다(바꿀 말을 그 말로 쓴다: 그 말을 읽는 사람이 찾게).
// className을 주면 그 모양을 쓴다(걷기 화면 메뉴 같은 곳)
export function LangToggle({ className = 'chip' }: { className?: string }) {
  const lang = useLang();
  const next = lang === 'ko' ? 'en' : 'ko';
  return (
    <button
      type="button"
      className={className}
      onClick={() => setLang(next)}
      lang={next}
      aria-label={next === 'en' ? 'English' : '한국어로 보기'}
      title={next === 'en' ? 'View in English' : '한국어로 보기'}
    >
      {next === 'en' ? 'EN' : '한국어'}
    </button>
  );
}
