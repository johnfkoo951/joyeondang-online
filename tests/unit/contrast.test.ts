// 색 대비 지킴이: 작은 보조 글자에 쓰는 흐린 글자색(--ink-3)이 종이 바탕 위에서 4.5:1을 넘는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');

/** WCAG 상대 휘도 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** 블록 안의 색 토큰들 */
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));
}

const dark = css.indexOf('@media (prefers-color-scheme: dark)');
const light = tokens(css.slice(css.indexOf(':root {'), dark));
const night = tokens(css.slice(dark, css.indexOf(':root[data-text')));

test('색 토큰을 읽었다', () => {
  for (const t of [light, night]) for (const k of ['paper', 'paper-2', 'ink-3']) assert.match(t[k] ?? '', /^#[0-9a-f]{6}$/i, k);
});

test('흐린 글자(--ink-3): 밝은·어두운 테마 모두 종이 바탕 위 4.5:1 이상', () => {
  for (const [name, t] of [['밝음', light], ['어두움', night]] as const) {
    for (const bg of ['paper', 'paper-2']) {
      const c = contrast(t['ink-3'], t[bg]);
      assert.ok(c >= 4.5, `${name} --ink-3 / --${bg} = ${c.toFixed(2)}`);
    }
  }
});
