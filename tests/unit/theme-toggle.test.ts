// 라이트(#f4f0e6 크림베이지 기본값) / 다크 수동 선택 스위치와 초기 부트 스크립트·CSS 토큰 대칭 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');

test('디폴트는 늘 밝은 크림베이지(#f4f0e6, light)이고, 사용자가 다크를 골랐을 때만 dark가 된다', () => {
  const layout = src('app/layout.tsx');
  assert.match(layout, /<html lang="ko" data-theme="light"/);
  assert.match(layout, /themeColor: '#f4f0e6'/);
  assert.match(layout, /<ThemeToggle \/>/);
  assert.match(layout, /localStorage\.getItem\('jy\.theme'\)==='dark'\?'dark':'light'/);

  const toggle = src('components/ThemeToggle.tsx');
  assert.match(toggle, /<span>라이트<\/span>/);
  assert.match(toggle, /<span>다크<\/span>/);
  assert.match(toggle, /setSiteTheme\('light'\)/);
  assert.match(toggle, /setSiteTheme\('dark'\)/);

  const css = src('app/globals.css');
  assert.match(css, /--paper: #f4f0e6;/);
});

test('수동 테마 CSS 블록(:root[data-theme="light"] / :root[data-theme="dark"])이 핵심 색 토큰을 모두 가진다', () => {
  const css = src('app/globals.css');
  const lightIdx = css.indexOf(':root[data-theme="light"]');
  const darkIdx = css.indexOf(':root[data-theme="dark"]');
  assert.ok(lightIdx > 0 && darkIdx > lightIdx, '수동 라이트·다크 블록 순서');
  const lightBlock = css.slice(lightIdx, darkIdx);
  const darkBlock = css.slice(darkIdx, darkIdx + 1200);
  for (const token of ['--paper: #f4f0e6;', '--ink:', '--roof:', '--pine:', '--lamp:', '--art-cobalt:', '--art-vermilion:']) {
    const key = token.split(':')[0] + ':';
    assert.ok(lightBlock.includes(token), `light 누락: ${token}`);
    assert.ok(darkBlock.includes(key), `dark 누락: ${key}`);
  }
});
