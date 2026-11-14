// 승인함의 글쓴이 표시: 쪽지에 찍힌 이름표와 명단 이름이 다르면 명단 이름을 함께 보여 준다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorLabel, rosterNames } from '../../src/lib/author-label.ts';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const C = '00000000-0000-4000-8000-0000000000c3';
const rows = [
  { display_name: '손님하나', claimed_by: A, revoked_at: null },
  { display_name: '손님둘', claimed_by: B, revoked_at: '2026-01-01T00:00:00Z' },
  { display_name: '아직 안 온 분', claimed_by: null, revoked_at: null },
];

test('rosterNames: 계정과 이어진 줄만, 뺀 줄은 표시를 달아 담는다', () => {
  const m = rosterNames(rows);
  assert.equal(m.size, 2);
  assert.deepEqual(m.get(A), { name: '손님하나', revoked: false });
  assert.deepEqual(m.get(B), { name: '손님둘', revoked: true });
  assert.equal(rosterNames(null).size, 0);
  assert.equal(rosterNames(undefined).size, 0);
});

test('rosterNames: 한 계정에 뺀 줄과 새 줄이 함께 있으면 빼지 않은 줄을 쓴다(순서와 무관)', () => {
  const old = { display_name: '옛 이름', claimed_by: A, revoked_at: '2026-01-01T00:00:00Z' };
  const now = { display_name: '새 이름', claimed_by: A, revoked_at: null };
  assert.deepEqual(rosterNames([old, now]).get(A), { name: '새 이름', revoked: false });
  assert.deepEqual(rosterNames([now, old]).get(A), { name: '새 이름', revoked: false });
});

test('authorLabel: 이름표가 명단 이름과 같으면 하나만 보인다(앞뒤 공백·글자 조합 차이는 같은 이름)', () => {
  const m = rosterNames(rows);
  assert.deepEqual(authorLabel('손님하나', m.get(A)), { shown: '손님하나', roster: null, warn: false });
  assert.equal(authorLabel(' 손님하나 ', m.get(A)).roster, null);
  assert.equal(authorLabel('손님하나'.normalize('NFD'), m.get(A)).roster, null);
});

test('authorLabel: 이름표를 다른 이름으로 바꿔 쓴 쪽지에는 명단 이름이 함께 보인다', () => {
  const m = rosterNames(rows);
  assert.deepEqual(authorLabel('집주인', m.get(A)), { shown: '집주인', roster: '명단: 손님하나', warn: true });
  // 남의 명단 이름을 이름표로 써도 글쓴이 계정의 명단 이름이 나온다
  assert.deepEqual(authorLabel('손님둘', m.get(A)), { shown: '손님둘', roster: '명단: 손님하나', warn: true });
});

test('authorLabel: 명단에서 뺀 사람은 이름이 같아도 (뺌)을 붙여 눈에 띄게 보인다', () => {
  const m = rosterNames(rows);
  assert.deepEqual(authorLabel('손님둘', m.get(B)), { shown: '손님둘', roster: '명단: 손님둘 (뺌)', warn: true });
});

test('authorLabel: 이메일로 명단에 맞았지만 아직 묶이지 않은 손님의 쪽지는 바깥 사람처럼 알리지 않는다', () => {
  // 먼저 들어온 뒤에 명단에 이메일이 올라간 손님: 명단 줄의 claimed_by가 비어 있어 계정으로는 찾지 못한다
  const m = rosterNames(rows);
  assert.equal(m.get(C), undefined);
  const who = authorLabel('아직 안 온 분', m.get(C));
  assert.deepEqual(who, { shown: '아직 안 온 분', roster: '명단과 아직 묶이지 않은 계정', warn: false });
  assert.doesNotMatch(String(who.roster), /찾지 못한/);
});
