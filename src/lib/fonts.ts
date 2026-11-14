// 글꼴 CSS(바깥 CDN)는 화면 그리기를 막지 않게 늦게 붙인다. 그 연결이 느리거나 끊겨도 화면은 기본 글꼴로 바로 뜬다.
// layout.tsx의 첫 스크립트가 이 주소들로 <link>를 만들고, 3D 안 글씨는 FONT_LINK_ID로 CSS가 왔는지 본 뒤 글꼴을 기다린다.
export const FONT_CSS_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
export const FONT_LINK_ID = 'jy-font-css';

// 아티스틱 포스터 랜딩용 손글씨·바탕·필기체 글꼴 (비차단 로드)
export const ART_FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Gowun+Batang:wght@400;700&family=Great+Vibes&family=Libre+Caslon+Text:wght@400;700&display=swap';
export const ART_FONT_LINK_ID = 'jy-art-font-css';
