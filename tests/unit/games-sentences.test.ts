// 문장 걸어 두기의 순수 계산(node --test, Node 22 타입 제거)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PUZZLE_SIZES,
  SENTENCE_MAX,
  SOURCE_MAX,
  chars,
  checkSentence,
  correctPrefix,
  formatBody,
  isCleared,
  isSolved,
  parseBody,
  pickVisibility,
  puzzleSet,
  rng,
  scoreOf,
  scramble,
  shuffle,
  splitPieces,
  wallFromRows,
  words,
} from '../../src/games/sentences/logic.ts';
import { SAMPLE_SENTENCES } from '../../src/games/sentences/samples.ts';

test('문장은 1~300자, 출처는 필수 1~80자', () => {
  assert.equal(checkSentence('', '책').ok, false);
  assert.equal(checkSentence('   \n ', '책').ok, false);
  assert.equal(checkSentence(42, '책').ok, false);
  assert.deepEqual(checkSentence('좋은 문장', ''), { ok: false, field: 'source', reason: '출처(책 이름이나 글쓴이)를 적어 주세요.' });
  assert.equal(checkSentence('가'.repeat(SENTENCE_MAX), '책').ok, true);
  const long = checkSentence('가'.repeat(SENTENCE_MAX + 1), '책');
  assert.equal(long.ok, false);
  assert.equal(!long.ok && long.field, 'text');
  assert.equal(checkSentence('좋은 문장', '가'.repeat(SOURCE_MAX + 1)).ok, false);
  assert.equal(checkSentence('나쁜\u0007글자', '책').ok, false);
  assert.equal(checkSentence('좋은 문장', '책\u0001').ok, false);
});

test('문장 검사는 다듬어서 돌려준다(NFC, 앞뒤 공백, 줄바꿈 셋 이상은 둘로, 출처는 한 줄)', () => {
  const r = checkSentence('  첫 줄\r\n\n\n\n둘째 줄  ', '  윤동주,\n 「새로운 길」 ');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.text, '첫 줄\n\n둘째 줄');
  assert.equal(r.source, '윤동주, 「새로운 길」');
  const nfd = '한'; // 조합 전 '한'
  const n = checkSentence(nfd, nfd);
  assert.equal(n.ok && n.text, '한');
  assert.equal(chars(nfd), 1);
});

test('records.body는 「문장\\n\\n출처: …」이고 되읽으면 같다', () => {
  const body = formatBody('빛이 든다.\n두 번째 줄', '이 방에서 지어 둔 문장');
  assert.equal(body, '빛이 든다.\n두 번째 줄\n\n출처: 이 방에서 지어 둔 문장');
  assert.deepEqual(parseBody(body), { text: '빛이 든다.\n두 번째 줄', source: '이 방에서 지어 둔 문장' });
  // 문장 안에 「출처:」가 있어도 마지막 표시를 출처로 본다
  const tricky = formatBody('출처: 를 적는 법\n\n출처: 가짜', '진짜 책');
  assert.equal(parseBody(tricky).source, '진짜 책');
  assert.deepEqual(parseBody('출처 없는 쪽지'), { text: '출처 없는 쪽지', source: '' });
  // 가장 긴 문장과 출처도 DB의 500자 안에 든다
  assert.ok(chars(formatBody('가'.repeat(SENTENCE_MAX), '나'.repeat(SOURCE_MAX))) <= 500);
});

test('읽기 벽은 문장 종이만, 숨김·거절·봉인은 빼고, 검토 전은 표시한다', () => {
  const rows = [
    { id: 'a', format: 'sentence', body: formatBody('하나', '책 하나'), status: 'approved', author_name: '손님', mine: false },
    { id: 'b', format: 'note', body: '쪽지', status: 'approved' },
    { id: 'c', format: 'sentence', body: formatBody('둘', '책 둘'), status: 'submitted', mine: true },
    { id: 'd', format: 'sentence', body: formatBody('셋', '책 셋'), status: 'hidden' },
    { id: 'e', format: 'sentence', body: '   ', status: 'approved' },
    null,
    'x',
    { id: 7, format: 'sentence', body: '숫자 id' },
  ];
  const wall = wallFromRows(rows);
  assert.deepEqual(wall.map((w) => w.id), ['a', 'c']);
  assert.equal(wall[0].pending, false);
  assert.equal(wall[0].by, '손님');
  assert.equal(wall[1].pending, true);
  assert.equal(wall[1].mine, true);
  assert.deepEqual(wallFromRows(null), []);
});

test('공개 범위: 기본 초대 손님까지, 인터넷 공개는 동의가 있어야', () => {
  assert.deepEqual(pickVisibility(undefined, false), { ok: true, visibility: 'guests', consent: false });
  assert.deepEqual(pickVisibility('self', true), { ok: true, visibility: 'guests', consent: false });
  assert.deepEqual(pickVisibility('family', true), { ok: true, visibility: 'family', consent: false });
  assert.equal(pickVisibility('public', false).ok, false);
  assert.equal(pickVisibility('public', 'on').ok, false);
  assert.deepEqual(pickVisibility('public', true), { ok: true, visibility: 'public', consent: true });
});

test('같은 씨앗이면 같은 난수, 섞어도 원소는 그대로', () => {
  const a = rng(7);
  const b = rng(7);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  const r = rng(1);
  for (let i = 0; i < 200; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
  }
  const arr = [1, 2, 3, 4, 5, 6];
  const sh = shuffle(arr, rng(3));
  assert.deepEqual([...sh].sort(), arr);
  assert.deepEqual(shuffle(arr, rng(3)), sh);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6]);
});

test('조각 나누기: 낱말 경계, 조각 수, 이어 붙이면 원문, 길이가 고르게', () => {
  for (const s of SAMPLE_SENTENCES) {
    for (const n of PUZZLE_SIZES) {
      if (words(s.text).length < n) continue;
      const p = splitPieces(s.text, n);
      assert.equal(p.length, n, `${s.id} ${n}`);
      assert.equal(p.join(' '), words(s.text).join(' '));
      assert.ok(p.every((x) => x.length > 0 && x === x.trim()));
    }
  }
  const even = splitPieces('가나 다라 마바 사아 자차 카타', 3);
  assert.deepEqual(even, ['가나 다라', '마바 사아', '자차 카타']);
  // 낱말이 모자라면 글자로 나눈다
  assert.deepEqual(splitPieces('가나다라마바', 3), ['가나', '다라', '마바']);
  assert.deepEqual(splitPieces('가나', 3), ['가', '나']);
});

test('섞은 순서는 정답과 다르고, 같은 씨앗이면 같다', () => {
  for (let seed = 1; seed < 60; seed++) {
    const pieces = splitPieces(SAMPLE_SENTENCES[seed % SAMPLE_SENTENCES.length].text, 3 + (seed % 3));
    const order = scramble(pieces, rng(seed));
    assert.deepEqual([...order].sort((a, b) => a - b), pieces.map((_, i) => i));
    assert.equal(isSolved(order.map((i) => pieces[i]), pieces), false, `seed ${seed}`);
    assert.deepEqual(scramble(pieces, rng(seed)), order);
  }
  // 같은 글 조각만 있으면 섞을 것이 없다
  assert.deepEqual(scramble(['별', '별', '별'], rng(1)), [0, 1, 2]);
});

test('맞춤 판정: 같은 글 조각은 서로 바꿔 놓아도 맞다', () => {
  const answer = ['별 하나에', '추억과', '별 하나에', '사랑과'];
  assert.equal(isSolved(['별 하나에', '추억과', '별 하나에', '사랑과'], answer), true);
  assert.equal(isSolved(['별 하나에', '사랑과', '별 하나에', '추억과'], answer), false);
  assert.equal(isSolved(['별 하나에', '추억과'], answer), false);
  assert.equal(correctPrefix(['별 하나에', '사랑과', '별 하나에', '추억과'], answer), 1);
  assert.equal(correctPrefix(['추억과'], answer), 0);
  assert.equal(correctPrefix(answer, answer), 4);
});

test('퍼즐 세 단계: 3·4·5조각, 서로 다른 문장, 같은 씨앗이면 같은 판', () => {
  for (let seed = 1; seed < 40; seed++) {
    const set = puzzleSet(SAMPLE_SENTENCES, seed);
    assert.equal(set.length, 3);
    assert.deepEqual(set.map((r) => r.pieces.length), [...PUZZLE_SIZES]);
    assert.equal(new Set(set.map((r) => r.sentence.id)).size, 3);
    for (const r of set) {
      assert.equal(r.order.length, r.pieces.length);
      assert.equal(isSolved(r.order.map((i) => r.pieces[i]), r.pieces), false);
    }
    assert.deepEqual(puzzleSet(SAMPLE_SENTENCES, seed), set);
  }
  const a = puzzleSet(SAMPLE_SENTENCES, 1).map((r) => r.sentence.id).join();
  const differs = [2, 3, 4, 5, 6].some((s) => puzzleSet(SAMPLE_SENTENCES, s).map((r) => r.sentence.id).join() !== a);
  assert.ok(differs, '씨앗이 바뀌면 판도 바뀐다');
  // 문장이 하나뿐이어도 세 단계를 만든다
  const one = puzzleSet([{ id: 'x', text: '하나 둘 셋 넷 다섯 여섯', source: '책' }], 9);
  assert.deepEqual(one.map((r) => r.pieces.length), [3, 4, 5]);
});

test('점수와 마침: 걸어 두기 하나나 퍼즐 세 단계면 cleared', () => {
  const base = { hung: false, solved: 0, misses: 0, read: 0 };
  assert.equal(isCleared(base), false);
  assert.equal(isCleared({ ...base, solved: 2 }), false);
  assert.equal(isCleared({ ...base, solved: 3 }), true);
  assert.equal(isCleared({ ...base, hung: true }), true);
  assert.equal(scoreOf(base), 0);
  assert.equal(scoreOf({ ...base, hung: true }), 100);
  assert.equal(scoreOf({ ...base, solved: 3 }), 300);
  assert.equal(scoreOf({ ...base, solved: 3, misses: 4 }), 260);
  assert.equal(scoreOf({ ...base, solved: 1, misses: 99 }), 50);
  assert.equal(scoreOf({ ...base, misses: 5 }), 0);
});

test('예시 문장: 모두 검사를 통과하고 출처가 있다', () => {
  assert.ok(SAMPLE_SENTENCES.length >= 5);
  assert.equal(new Set(SAMPLE_SENTENCES.map((s) => s.id)).size, SAMPLE_SENTENCES.length);
  for (const s of SAMPLE_SENTENCES) {
    const c = checkSentence(s.text, s.source);
    assert.equal(c.ok, true, s.id);
    assert.equal(s.sample, true);
    assert.ok(s.source.length > 0);
  }
  // 퍼즐 5조각 단계에 쓸 수 있는 문장이 셋 이상
  assert.ok(SAMPLE_SENTENCES.filter((s) => words(s.text).length >= 5).length >= 3);
});

test('서버 액션은 손님 이상만, study 방 sentence 형식으로 쓴다(DB 규칙과 맞물림)', () => {
  const src = readFileSync(new URL('../../src/games/sentences/actions.ts', import.meta.url), 'utf8');
  assert.match(src, /^'use server';/);
  assert.match(src, /canUse\(viewer\.role, 'write'\)/);
  assert.match(src, /const ROOM = 'study';/);
  assert.match(src, /format: 'sentence'/);
  assert.match(src, /rpc\('room_records', \{ p_room: ROOM/);
  const sql = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.match(sql, /check \(format in \([^)]*'sentence'/);
  assert.match(sql, /char_length\(body\) between 1 and 500/);
});
