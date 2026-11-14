// 「작은 놀이 몇 가지」처럼 놀이의 전체 수를 말하는 글자가 실제로 등록된 놀이 수와 같은지 본다
// (놀이를 더하고 첫 화면·팔레트·수첩·놀이 모음의 숫자를 잊지 않게). 일부만 세는 글(2층 놀이방 다섯, 재즈 순위표 셋)은 대상이 아니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = new URL('../../src/', import.meta.url);
const KO_NUM: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const EN_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const KO_WORD = '한|두|세|네|다섯|여섯|일곱|여덟|아홉|열';

/** 놀이의 전체 수를 말하는 파일들 */
const TOTAL_FILES = [
  'components/site-words.ts',
  'app/notebook/page.tsx',
  'components/home/MoreLinks.tsx',
  'components/home/home-words.ts',
  'components/home/FrontDoor.tsx',
  'components/games/GamesHub.tsx',
  'components/games/catalog.ts',
];

const PATTERNS: RegExp[] = [
  new RegExp(`(${KO_WORD}) 가지 (?:작은 )?놀이`, 'g'),
  new RegExp(`작은 놀이 (${KO_WORD}) 가지`, 'g'),
  /작은 놀이 (\d+)종/g,
  /전체 (\d+)종/g,
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:mini games|play rooms|games)\b/gi,
  /\ball (one|two|three|four|five|six|seven|eight|nine|ten|\d+) games\b/gi,
];

const value = (w: string) => KO_NUM[w] ?? EN_NUM[w.toLowerCase()] ?? Number(w);

test('놀이 수 글자: 놀이의 전체 수를 말하는 곳은 모두 등록된 놀이 수와 같다', () => {
  const registry = readFileSync(new URL('games/registry.ts', SRC), 'utf8');
  const count = (registry.match(/^\s+id: '[a-z]+',$/gm) ?? []).length;
  assert.ok(count >= 8, `등록된 놀이 ${count}개`);
  let seen = 0;
  for (const rel of TOTAL_FILES) {
    const s = readFileSync(new URL(rel, SRC), 'utf8');
    for (const re of PATTERNS) {
      for (const m of s.matchAll(re)) {
        seen++;
        assert.equal(value(m[1]), count, `${rel}: 「${m[0]}」`);
      }
    }
  }
  assert.ok(seen >= 10, `찾은 글자 ${seen}개`);
});
