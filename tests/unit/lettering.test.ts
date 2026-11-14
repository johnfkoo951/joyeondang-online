import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { LETTERING_WORKS } from '../../src/content/lettering.ts';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('lettering catalog preserves all sixteen studies and their groups', () => {
  assert.deepEqual(LETTERING_WORKS.map((w) => w.number), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal(new Set(LETTERING_WORKS.map((w) => w.slug)).size, 16);
  for (const [group, count] of [['plaque', 5], ['easel', 4], ['desk', 3], ['hanji', 4]] as const) {
    assert.equal(LETTERING_WORKS.filter((w) => w.group === group).length, count);
  }
  assert.equal(LETTERING_WORKS[12].direction, '오른쪽부터 조연당');
  assert.equal(LETTERING_WORKS[13].direction, '오른쪽부터 조연당');
  assert.equal(LETTERING_WORKS[14].direction, '위에서 아래로 조연당');
  assert.equal(LETTERING_WORKS[15].direction, '왼쪽부터 조연당');
});

test('web artwork has real dimensions, lightweight variants, and no embedded metadata', async () => {
  let bytes = 0;
  for (const work of LETTERING_WORKS) {
    for (const [path, expectedWidth] of [[work.src, work.width], [work.thumb, work.thumbWidth]] as const) {
      assert.match(path, /^\/web\/lettering\/[a-z0-9-]+\.webp$/);
      const file = new URL(`public${path}`, root);
      const image = await sharp(readFileSync(file)).metadata();
      assert.equal(image.width, expectedWidth);
      if (path === work.src) assert.equal(image.height, work.height);
      assert.ok(Math.abs(image.width! / image.height! - work.width / work.height) < .006);
      assert.equal(image.exif, undefined);
      assert.equal(image.xmp, undefined);
      bytes += statSync(file).size;
    }
  }
  assert.ok(bytes < 2_000_000, `image set too large: ${bytes}`);
});

test('both seals retain transparency', async () => {
  for (const kind of ['baiwen', 'zhuwen']) {
    const image = await sharp(readFileSync(new URL(`public/web/lettering/jisan-${kind}.webp`, root))).metadata();
    assert.equal(image.hasAlpha, true);
    assert.equal(image.width, 300);
    assert.equal(image.height, 480);
  }
});

test('exhibit explains authorship and does not ship local provenance', () => {
  const page = read('src/app/exhibit/lettering/page.tsx');
  assert.ok(page.includes('생성형 AI'));
  assert.ok(page.includes('실제 친필'));
  assert.ok(page.includes('紙散'));
  assert.ok(page.includes('造連堂'));
  assert.doesNotMatch(read('src/content/lettering.ts'), /eagle:\/\/|file:\/\/|\/Users\/|sourceMD5|eagleId/);
  assert.ok(read('.vercelignore').split('\n').includes('private/lettering-assets'));
});

test('lettering is reachable from exhibits, home, and the walking overlay', () => {
  assert.ok(read('src/app/exhibit/page.tsx').includes('<LetteringPreview />'));
  assert.ok(read('src/app/exhibit/[slug]/page.tsx').includes('<LetteringPreview />'));
  assert.ok(read('src/components/home/MoreLinks.tsx').includes('/exhibit/lettering'));
  const overlay = read('src/app/walk/@sheet/(..)exhibit/lettering/page.tsx');
  assert.ok(overlay.includes('<SheetMark />'));
  assert.ok(overlay.includes('<LetteringPage />'));
});

test('seal proofs sit on a light material even in dark mode', () => {
  assert.ok(read('src/app/exhibit/lettering/lettering.module.css').includes('background: var(--art-hanji-paper)'));
  assert.equal((read('src/app/globals.css').match(/--art-hanji-paper:/g) ?? []).length, 1);
});

test('main page features Jisan-stamped hanji brushwork and interactive curated slips', () => {
  const curated = read('src/components/home/CuratedMore.tsx');
  assert.ok(curated.includes('/web/lettering/14-hanji-running-horizontal.webp'));
  assert.ok(curated.includes('/web/lettering/jisan-baiwen.webp'));
  assert.ok(curated.includes('/gallery'));
  assert.ok(curated.includes('/notebook'));
  const stripped = curated.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(stripped, /종이/);
  assert.doesNotMatch(stripped, /造連堂/);
  const homeCss = read('src/components/home/home.module.css');
  assert.ok(homeCss.includes('.calligraphySheet'));
  assert.ok(homeCss.includes('background: var(--art-hanji-paper)'));
  assert.ok(homeCss.includes('.curatedSlip'));
});
