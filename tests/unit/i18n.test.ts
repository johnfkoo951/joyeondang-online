// 화면 말 고르기: 기억한 값이 먼저, 없으면 브라우저 언어(한국어가 하나라도 있으면 한국어), 영어가 비면 한국어.
// BOOT 스크립트(그리기 전에 도는 글)가 같은 규칙으로 고르는지 실제로 돌려 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const I = await import('../../src/lib/i18n.ts');

test('처음 언어: 기억한 값 → 브라우저 언어(한국어가 하나라도 있으면 한국어) → 모르면 한국어', () => {
  assert.equal(I.pickLang('en', ['ko-KR']), 'en');
  assert.equal(I.pickLang('ko', ['en-US']), 'ko');
  assert.equal(I.pickLang(null, ['en-US', 'en']), 'en');
  assert.equal(I.pickLang(null, ['en-US', 'ko']), 'ko');
  assert.equal(I.pickLang(undefined, ['ko-KR']), 'ko');
  assert.equal(I.pickLang(null, ['ja-JP', 'zh-CN']), 'en');
  assert.equal(I.pickLang(null, []), 'ko');
  assert.equal(I.pickLang(null, null), 'ko');
  assert.equal(I.pickLang('fr', ['fr-FR']), 'en', '모르는 값은 기억하지 않은 것으로');
  // kok(콘칸어)처럼 ko로 시작하는 다른 말은 한국어가 아니다
  assert.equal(I.pickLang(null, ['kok']), 'en');
});

test('고르기: 영어가 비면 한국어', () => {
  assert.equal(I.tr('en', '지도', 'Map'), 'Map');
  assert.equal(I.tr('ko', '지도', 'Map'), '지도');
  assert.equal(I.tr('en', '지도', ''), '지도');
});

test('BOOT 글: pickLang과 같은 규칙으로 <html data-lang lang>을 붙이고, 저장이 막혀도 돈다', () => {
  const run = (stored: string | null, languages: string[], blocked = false) => {
    const d = { dataset: {} as Record<string, string>, lang: 'ko' };
    const ctx = {
      d,
      localStorage: { getItem: (k: string) => { if (blocked) throw new Error('blocked'); return k === I.LANG_KEY ? stored : null; } },
      navigator: { languages, language: languages[0] ?? '' },
    };
    runInNewContext(I.LANG_BOOT, ctx);
    return { attr: d.dataset[I.LANG_ATTR], lang: d.lang };
  };
  for (const [stored, langs] of [[null, ['en-US']], [null, ['ko-KR']], ['en', ['ko-KR']], ['ko', ['en-US']], [null, []], [null, ['kok']], ['xx', ['de-DE']]] as const) {
    const want = I.pickLang(stored, langs as unknown as string[]);
    assert.deepEqual(run(stored, [...langs]), { attr: want, lang: want }, `${stored} ${langs.join(',')}`);
  }
  assert.deepEqual(run(null, ['en-US'], true), { attr: 'en', lang: 'en' }, '저장이 막혀도 브라우저 언어로');
});
