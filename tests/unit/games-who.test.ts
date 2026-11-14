// 누구의 문장일까 검사: 카드 묶음 모양 거르기(서버·놀이 공용), 같은 씨앗 같은 판, 점수, 연습판, 서버 환경 변수 읽기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// src/lib/who-deck.ts는 앱과 같은 꼴(확장자 없는 '../games/who/logic')로 가져오고 'server-only'를 부른다.
// 이 시험 프로세스에서만 .ts를 풀어 주고, server-only는 빈 모듈로 바꿔 끼운다.
type Next = (spec: string, ctx: unknown) => { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const { LIMITS, MAX_ROUNDS, WHO_COLORS, WHO_ICONS, cleanDeck, cleanText, countWord, parseDeckJson, pickRounds, scoreOf } = await import(
  '../../src/games/who/logic.ts'
);
const { SAMPLE_DECK } = await import('../../src/games/who/samples.ts');
const { loadWhoDeck } = await import('../../src/lib/who-deck.ts');

const person = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `${id} 인형`, icon: 'star', color: 'pine', intro: '지어낸 소개예요.', ...over });

test('카드 묶음: 맞는 모양은 그대로 받는다', () => {
  const deck = { people: [person('a'), person('b')], lines: [{ who: 'a', text: '하나' }, { who: 'b', text: '둘' }] };
  assert.deepEqual(cleanDeck(deck), deck);
  assert.deepEqual(cleanDeck(JSON.parse(JSON.stringify(SAMPLE_DECK))), SAMPLE_DECK);
});

test('카드 묶음: 틀린 사람·문장은 빼고, 남은 것이 모자라면 null', () => {
  assert.equal(cleanDeck(null), null);
  assert.equal(cleanDeck([]), null);
  assert.equal(cleanDeck({ people: [], lines: [] }), null);
  assert.equal(cleanDeck({ people: [person('a')], lines: [{ who: 'a', text: '혼자' }] }), null, '사람이 둘보다 적음');
  assert.equal(cleanDeck({ people: [person('a'), person('b')], lines: [] }), null, '문장 없음');
  assert.equal(cleanDeck({ people: [person('a'), person('b')], lines: [{ who: 'zz', text: '없는 사람' }] }), null);
  const messy = {
    people: [
      person('a'),
      person('a', { name: '겹친 id' }),
      person('Bad Id'),
      person('toolongidtoolongid'),
      person('c', { icon: 'rocket' }),
      person('d', { color: '#ff0000' }),
      person('e', { name: '' }),
      person('f', { name: '가'.repeat(LIMITS.name + 1) }),
      person('g', { intro: '나'.repeat(LIMITS.intro + 1) }),
      person('h', { intro: '줄\n바꿈' }),
      'not an object',
      person('b', { name: '  앞뒤 빈칸  ' }),
    ],
    lines: [
      { who: 'a', text: '좋아요' },
      { who: 'a', text: '좋아요' },
      { who: 'b', text: '다'.repeat(LIMITS.text + 1) },
      { who: 'b', text: '탭\t문자' },
      { who: 'c', text: '빠진 사람' },
      { who: 'b', text: '  괜찮아요  ' },
      { who: 'b' },
      7,
    ],
  };
  assert.deepEqual(cleanDeck(messy), {
    people: [person('a'), person('b', { name: '앞뒤 빈칸' })],
    lines: [
      { who: 'a', text: '좋아요' },
      { who: 'b', text: '괜찮아요' },
    ],
  });
  // 글자 수는 코드 포인트로 센다(이모지도 한 글자)
  assert.equal(cleanText('가'.repeat(LIMITS.name), LIMITS.name), '가'.repeat(LIMITS.name));
  assert.equal(cleanText('😀'.repeat(LIMITS.name), LIMITS.name), '😀'.repeat(LIMITS.name));
  assert.equal(cleanText('글자\u202e뒤집기', 40), null, '글 방향을 뒤집는 문자');
  assert.equal(cleanText(3, 40), null);
});

test('카드 묶음: 사람은 8명까지(앞에서부터), 그 밖 사람의 문장은 빠진다', () => {
  const ids = 'abcdefghij'.split('');
  const deck = cleanDeck({ people: ids.map((id) => person(id)), lines: ids.map((id) => ({ who: id, text: `${id}의 말` })) });
  assert.ok(deck);
  assert.equal(deck.people.length, LIMITS.maxPeople);
  assert.deepEqual(deck.people.map((p) => p.id), ids.slice(0, 8));
  assert.ok(deck.lines.every((l) => ids.slice(0, 8).includes(l.who)));
});

test('그림과 색은 정해진 목록에서만', () => {
  assert.ok(WHO_ICONS.length >= 10 && new Set(WHO_ICONS).size === WHO_ICONS.length);
  assert.ok(WHO_COLORS.length >= LIMITS.maxPeople && new Set(WHO_COLORS).size === WHO_COLORS.length, '여덟 사람에게 다른 색을 줄 수 있다');
  for (const icon of WHO_ICONS) assert.ok(cleanDeck({ people: [person('a', { icon }), person('b')], lines: [{ who: 'a', text: '말' }] }));
  for (const color of WHO_COLORS) assert.ok(cleanDeck({ people: [person('a', { color }), person('b')], lines: [{ who: 'a', text: '말' }] }));
});

test('판 고르기: 사람마다 한 판, 같은 씨앗이면 같은 판, 씨앗이 다르면 차례가 바뀐다', () => {
  const rounds = pickRounds(SAMPLE_DECK, 42);
  assert.equal(rounds.length, 5);
  assert.deepEqual([...rounds.map((r) => r.who)].sort(), SAMPLE_DECK.people.map((p) => p.id).sort(), '다섯 사람 한 번씩');
  for (const r of rounds) assert.ok(SAMPLE_DECK.lines.some((l) => l.who === r.who && l.text === r.text), '그 사람의 문장');
  assert.deepEqual(pickRounds(SAMPLE_DECK, 42), rounds);
  const orders = new Set<string>();
  const texts = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    const rs = pickRounds(SAMPLE_DECK, seed);
    orders.add(rs.map((r) => r.who).join());
    for (const r of rs) texts.add(r.text);
  }
  assert.ok(orders.size > 10, '차례가 섞인다');
  assert.equal(texts.size, SAMPLE_DECK.lines.length, '문장이 둘 이상이면 판마다 다른 문장도 나온다');
  // 문장이 없는 사람은 판이 없고(고르기에는 나온다), 사람이 적으면 판도 적다
  const few = cleanDeck({ people: [person('a'), person('b'), person('c')], lines: [{ who: 'a', text: '하나' }, { who: 'c', text: '셋' }] });
  assert.ok(few);
  assert.deepEqual(pickRounds(few, 1).map((r) => r.who).sort(), ['a', 'c']);
  assert.equal(pickRounds(SAMPLE_DECK, 1, 2).length, 2);
  assert.ok(MAX_ROUNDS >= LIMITS.maxPeople);
});

test('점수와 수 낱말', () => {
  assert.equal(scoreOf([]), 0);
  assert.equal(scoreOf([{ right: true }, { right: false }, { right: true }]), 2);
  assert.equal(countWord(5), '다섯');
  assert.equal(countWord(2), '두');
  assert.equal(countWord(8), '여덟');
});

test('연습판: 지어낸 종이 인형 다섯, 사람마다 문장이 있다', () => {
  assert.equal(SAMPLE_DECK.people.length, 5);
  for (const p of SAMPLE_DECK.people) {
    assert.match(p.name, /인형$/, '물건 이름의 인형');
    assert.ok(SAMPLE_DECK.lines.some((l) => l.who === p.id), `${p.name} 문장 없음`);
  }
  assert.equal(new Set(SAMPLE_DECK.people.map((p) => p.color)).size, 5, '인형마다 다른 색');
});

test('서버 카드: 환경 변수 JSON만 읽고, 없거나 깨지거나 너무 크면 null', () => {
  assert.equal(loadWhoDeck(undefined), null);
  assert.equal(loadWhoDeck(''), null);
  assert.equal(loadWhoDeck('{"people":'), null);
  assert.equal(loadWhoDeck('[]'), null);
  const deck = { people: [person('cup'), person('kite')], lines: [{ who: 'cup', text: '천천히 마셔도 괜찮아요.' }] };
  assert.deepEqual(loadWhoDeck(JSON.stringify(deck)), deck);
  assert.equal(loadWhoDeck(JSON.stringify(deck) + ' '.repeat(LIMITS.raw)), null, '크기 상한');
  assert.deepEqual(parseDeckJson(JSON.stringify(deck)), deck);
});

test('.env.example의 예시도 그대로 읽힌다', async () => {
  const { readFileSync } = await import('node:fs');
  const env = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('# WHO_DECK_JSON='));
  assert.ok(line, '.env.example에 WHO_DECK_JSON 예시');
  const deck = loadWhoDeck(line.slice('# WHO_DECK_JSON='.length));
  assert.ok(deck && deck.people.length >= 2 && deck.lines.length >= 1);
});
