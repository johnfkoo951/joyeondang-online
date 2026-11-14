// 도장 찍기의 반응 규칙(src/components/stamp/stamp-rules.ts): 서버 답 → 화면 상태, 결과 한 줄, 단추 글, 진동.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAMP_WORDS, buzz, stampButton, stampLine, stampOutcome } from '../../src/components/stamp/stamp-rules.ts';

test('새로 찍힘, 이미 있음, 방이 쉬는 중, 서버 문제, 받을 수 없는 사람, 답을 못 받음', () => {
  assert.deepEqual(stampOutcome({ ok: true, fresh: true, retry: false, reason: 'new' }), { kind: 'new' });
  assert.deepEqual(stampOutcome({ ok: true, fresh: false, retry: false, reason: 'have' }), { kind: 'have' });
  // 옛 서버(까닭 없음): 새로 찍히지 않았으면 이미 있는 것으로 본다(지금까지의 뜻과 같다)
  assert.deepEqual(stampOutcome({ ok: true, fresh: false, retry: false }), { kind: 'have' });
  assert.deepEqual(stampOutcome({ ok: true, fresh: false, retry: false, reason: 'closed' }), { kind: 'fail', message: STAMP_WORDS.closed, again: false });
  assert.deepEqual(stampOutcome({ ok: false, fresh: false, retry: true, reason: 'error' }), { kind: 'fail', message: STAMP_WORDS.error, again: true });
  assert.deepEqual(stampOutcome({ ok: false, fresh: false, retry: false, reason: 'denied' }), { kind: 'fail', message: STAMP_WORDS.denied, again: false });
  assert.deepEqual(stampOutcome({ ok: false, fresh: false, retry: false, reason: 'closed' }), { kind: 'fail', message: STAMP_WORDS.closed, again: false });
  assert.deepEqual(stampOutcome(null), { kind: 'fail', message: STAMP_WORDS.offline, again: true });
});

test('찍은 뒤 한 줄은 「○○ 도장을 찍었어요」', () => {
  assert.equal(stampLine({ kind: 'new' }, '연습방'), '연습방 도장을 찍었어요');
  assert.equal(stampLine({ kind: 'new' }, ' '), '도장을 찍었어요');
  assert.equal(stampLine({ kind: 'have' }, '연습방'), '연습방 도장은 이미 찍었어요');
  assert.equal(stampLine({ kind: 'fail', message: STAMP_WORDS.error, again: true }, '연습방'), STAMP_WORDS.error);
  assert.equal(stampLine({ kind: 'idle' }, '연습방'), null);
  assert.equal(stampLine({ kind: 'busy' }, '연습방'), null);
});

test('단추: 찍은 뒤에는 「찍음」이고 다시 눌리지 않는다, 다시 해 볼 만한 실패만 「다시 찍기」', () => {
  assert.deepEqual(stampButton({ kind: 'idle' }, '도장 찍기'), { text: '도장 찍기', locked: false });
  assert.deepEqual(stampButton({ kind: 'busy' }, '도장 찍기'), { text: '찍는 중', locked: true });
  assert.deepEqual(stampButton({ kind: 'new' }, '도장 찍기'), { text: '찍음', locked: true });
  assert.deepEqual(stampButton({ kind: 'have' }, '이 방 도장 찍기'), { text: '찍음', locked: true });
  assert.deepEqual(stampButton({ kind: 'fail', message: 'x', again: true }, '도장 찍기'), { text: '다시 찍기', locked: false });
  assert.deepEqual(stampButton({ kind: 'fail', message: 'x', again: false }, '도장 찍기'), { text: '도장 찍기', locked: true });
});

test('진동: 되는 기기에서만 짧게, 안 되거나 막히면 조용히', () => {
  const seen: unknown[] = [];
  buzz({ vibrate: (p) => { seen.push(p); return true; } });
  assert.deepEqual(seen, [[24, 60, 36]]);
  buzz({});
  buzz(undefined);
  buzz({ vibrate: () => { throw new Error('blocked'); } });
});

test('안내 글에 긴 줄표를 쓰지 않는다', () => {
  for (const m of Object.values(STAMP_WORDS)) assert.equal(/[—–]/.test(m), false, m);
});

test('찍히는 움직임은 줄인 움직임 설정에서는 꺼진다', () => {
  const cssText = readFileSync(new URL('../../src/components/stamp/stamp.module.css', import.meta.url), 'utf8');
  const motion = cssText.slice(cssText.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.ok(motion.length > 0);
  // 움직임(animation)은 모두 「움직임을 줄이지 않은」 조건 안에만 있다
  const outside = cssText.slice(0, cssText.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.equal(/animation\s*:/.test(outside), false);
  const block = motion.slice(0, motion.indexOf('}\n@keyframes') + 1);
  assert.match(block, /stamp-press/);
  assert.match(block, /stamp-ink/);
});
