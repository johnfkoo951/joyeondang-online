// 한글 조합 규칙 지킴이: 조합 중 키를 거르는 곳은 isComposing과 keyCode 229를 함께 본다.
// 사파리는 조합을 끝내는 키를 isComposing=false, keyCode=229로 보내서 한쪽만 보면 그 키가 새어 나간다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.tsx?$/.test(d.name) ? [p] : [];
  });

test('조합 중 검사: isComposing만 보고 keyCode 229를 빼먹은 줄이 없다', () => {
  const bad: string[] = [];
  for (const f of files(SRC)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!line.includes('isComposing')) return;
      // 타입 선언(isComposing?: boolean)과 주석은 검사가 아니다
      if (/isComposing\?\s*:/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (!line.includes('229')) bad.push(`${relative(SRC, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
