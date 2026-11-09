// Your family's privacy rules. Copy this folder to `private/` (git ignores it) and fill in your own words.
// tools/privacy-tokens.mjs merges these with the general rules, and `npm run verify` fails the build on a hit.
// 우리 집만의 금지어. 이 폴더를 `private/`로 복사하고(git이 무시해요) 우리 집 낱말을 채워요.
// tools/privacy-tokens.mjs가 일반 규칙에 합치고, `npm run verify`가 걸리면 빌드를 멈춰요.

/** Blocked everywhere: source, built HTML, bundled JS · 어디서나 막는 것 */
export const ALWAYS = [
  // { id: 'kids', re: /Name1|Name2/g, why: "children's real names" },
  // { id: 'place', re: /Our Street|Our Town/g, why: 'where we live' },
];

/** Blocked only in visible text (after removing tags and comments) · 화면 글자에서만 막는 것 */
export const TEXT_ONLY = [
  // { id: 'room-ids', re: /\b(r1|r2|k1)\b/g, why: 'IDs from the real floor plan' },
];
