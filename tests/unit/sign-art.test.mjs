import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
const source = readFileSync(new URL('../../src/walk/furnish.ts', import.meta.url), 'utf8');
for (const [file, width, height] of [
  ['welcome-storybook-board', 1350, 1020],
  ['hyeonpan-jisan-board', 1500, 460],
  ['online-serif-banner', 1920, 640],
]) {
  test(`${file}: baked art keeps its display aspect ratio`, async () => {
    const image = await sharp(new URL(`../../public/web/lettering/${file}.webp`, import.meta.url).pathname).metadata();
    assert.equal(image.width, width);
    assert.equal(image.height, height);
  });
}
test('signs reuse scene-owned image loading and keep separate welcome materials', () => {
  assert.match(source, /kit.image\(board, '\/web\/lettering\/welcome-storybook-board.webp'\)/);
  assert.match(source, /kit.image\(board, '\/web\/lettering\/hyeonpan-jisan-board.webp'\)/);
  assert.match(source, /kit.once\('m:welcome-art'/);
  assert.match(source, /kit.tex\('welcome-art', 1350, 1020/);
  assert.match(source, /kit.tex\('hyeonpan', 1500, 460/);
});
