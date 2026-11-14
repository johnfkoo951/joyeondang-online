'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { LANG_KEY, pickLang, tr, type Lang } from '@/lib/i18n';

// 맨 바깥 틀에서 예외가 났을 때 보이는 화면. 이 화면은 틀 전체를 갈아 끼우므로 전역 스타일이 닿지 않는다:
// 꼭 필요한 모양만 여기 적는다(밝은·어두운 바탕은 기기 설정을 따른다).
// 전역 스타일과 BOOT가 없어 두 말을 CSS로 고를 수 없다: 기억한 언어(없으면 브라우저 언어)를 직접 읽어 고른다(서버와 첫 그림은 한국어)
const CSS = `
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f1e7; color: #2b2622;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
  main { padding: 24px; max-width: 420px; text-align: center; }
  h1 { font-size: 1.3rem; margin: 0 0 8px; }
  p { margin: 0 0 18px; line-height: 1.6; }
  button { margin: 0 4px; padding: 10px 18px; border-radius: 999px; border: 1px solid #3e6b4f; background: #3e6b4f; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  button.ghost { background: transparent; color: inherit; border-color: currentColor; }
  @media (prefers-color-scheme: dark) { body { background: #1d1b19; color: #f1e9db; } }
`;

const noSubscribe = () => () => {};
function readLang(): Lang {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LANG_KEY);
  } catch {
    // 저장이 막혀 있으면 브라우저 언어로
  }
  return pickLang(stored, navigator.languages);
}

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const lang = useSyncExternalStore(noSubscribe, readLang, () => 'ko' as Lang);
  useEffect(() => {
    console.error('[root] 화면을 여는 중에 난 오류', error);
  }, [error]);
  return (
    <html lang={lang}>
      <body>
        <title>조연당</title>
        <style>{CSS}</style>
        <main>
          <h1>{tr(lang, '화면을 여는 중에 문제가 생겼어요', 'Something went wrong while opening the page')}</h1>
          <p>{tr(lang, '잠시 뒤 다시 시도해 주세요.', 'Please try again in a moment.')}</p>
          <button type="button" onClick={() => retry()}>{tr(lang, '다시 시도', 'Try again')}</button>
          {/* 틀이 무너진 상태라 화면을 통째로 다시 받는 길도 둔다 */}
          <button type="button" className="ghost" onClick={() => window.location.reload()}>{tr(lang, '새로 고침', 'Reload')}</button>
        </main>
      </body>
    </html>
  );
}
