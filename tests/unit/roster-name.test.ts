// 명단 이름 다듬기: 보이지 않는 글자·줄바꿈을 걷고 공백을 하나로, NFC, 40자까지, 비면 null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER_NAME_MAX, cleanRosterName } from '../../src/lib/roster-name.ts';

test('명단 이름: 앞뒤와 사이 공백을 다듬고, 보이지 않는 글자와 줄바꿈을 걷는다', () => {
  assert.equal(cleanRosterName('  손님   하나  '), '손님 하나');
  assert.equal(cleanRosterName('손님​하나'), '손님 하나');
  assert.equal(cleanRosterName('손님\n하나\t'), '손님 하나');
  assert.equal(cleanRosterName('‮거꾸로'), '거꾸로');
});

test('명단 이름: 한글은 NFC로 맞춘다(같은 이름이 둘로 갈리지 않게)', () => {
  const nfd = '손님'.normalize('NFD');
  assert.notEqual(nfd, '손님');
  assert.equal(cleanRosterName(nfd), '손님');
});

test('명단 이름: 40자까지, 비거나 글자가 아니면 null', () => {
  assert.equal([...(cleanRosterName('가'.repeat(60)) ?? '')].length, ROSTER_NAME_MAX);
  for (const bad of ['', '   ', '​​', null, undefined, 3]) assert.equal(cleanRosterName(bad), null, String(bad));
});
