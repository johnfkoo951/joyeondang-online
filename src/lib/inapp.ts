// 카카오톡 같은 앱 안 브라우저에서는 구글이 로그인을 막는다(403 disallowed_useragent).
// 로그인을 시작하기 전에 Safari·Chrome으로 나가야 한다. 도중에 나가면 PKCE 검증값이 사라져 실패한다.

export type InApp = 'kakao' | 'naver' | 'instagram' | 'facebook' | 'line' | 'band' | 'webview' | null;

export function detectInApp(ua: string): InApp {
  if (!ua) return null;
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/NAVER\(inapp/i.test(ua)) return 'naver';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/\bLine\//i.test(ua)) return 'line';
  if (/BAND\//i.test(ua)) return 'band';
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'webview';
  if (/iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) return 'webview';
  return null;
}

export const INAPP_NAME: Record<Exclude<InApp, null>, string> = {
  kakao: '카카오톡',
  naver: '네이버 앱',
  instagram: '인스타그램',
  facebook: '페이스북',
  line: '라인',
  band: '밴드',
  webview: '앱 안 브라우저',
};

/** 화면이 영어일 때의 이름. 「○○ 안에서는」 자리에 그대로 들어가게 쓴다(inside KakaoTalk, inside this app's browser) */
export const INAPP_NAME_EN: Record<Exclude<InApp, null>, string> = {
  kakao: 'KakaoTalk',
  naver: 'the NAVER app',
  instagram: 'Instagram',
  facebook: 'Facebook',
  line: 'LINE',
  band: 'BAND',
  webview: "this app's browser",
};

/**
 * 바깥 브라우저로 여는 주소. 카카오톡 주소 체계는 공식 기능이 아니어서 언제든 막힐 수 있다
 * (Kakao DevTalk 2025-04, 2025-07). 실패하면 화면의 안내(⋯ → 다른 브라우저로 열기)가 남는다.
 */
export function escapeUrl(kind: InApp, href: string, ua: string): string | null {
  if (!kind) return null;
  if (kind === 'kakao') return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
  if (/Android/i.test(ua)) {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  }
  return null;
}

/** 바깥으로 여는 단추의 글. 카카오톡 주소는 기기의 기본 브라우저로 열리므로 브라우저 이름을 박지 않는다. lang 'en'이면 영어 */
export function escapeLabel(kind: InApp, ua: string, lang: 'ko' | 'en' = 'ko'): string {
  const en = lang === 'en';
  if (kind === 'kakao') return en ? 'Open in your browser' : '바깥 브라우저로 열기';
  if (/Android/i.test(ua)) return en ? 'Open in Chrome' : 'Chrome에서 열기';
  return en ? 'Open in Safari' : 'Safari에서 열기';
}
