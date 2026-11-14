// 반려동물이 하는 말 검사: 줄의 모양(한마디 + 괄호 속마음), 길이(말풍선에 들어가고 떠 있는 동안 읽힌다),
// 누를수록 다정해지는 결, 최근 말 피하기, 일정이 띄우는 말은 주사위만으로 정해진다(모든 화면이 같은 말).
// 영어 말: 한국어와 같은 차례·같은 수, 같은 모양(소리 + 괄호 속마음), 말풍선에 드는 길이, 언어를 바꿔도 일정이 띄우는 말은 같은 차례.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// 말 고르기가 지금 화면 말(./lang → @/components/i18n/useLang)을 읽는다: 이 시험에서만 @/와 확장자 없는 경로를 풀어 준다
const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const T = await import('../../src/walk/pet-talk.ts');
type PetLine = import('../../src/walk/pet-talk.ts').PetLine;

const chars = (s: string) => [...s].length;
const allTap = [...T.PET_TAP_LINES.cold, ...T.PET_TAP_LINES.lecture, ...T.PET_TAP_LINES.warm];
const scheduled = [...T.PET_FRIEND_LINES, ...T.PET_ALONE_LINES];

test('줄의 모양: 소리는 짧은 한마디, 속마음은 괄호로 감싼 한두 문장. 줄표는 쓰지 않는다', () => {
  for (const l of [...allTap, ...scheduled]) {
    assert.match(l.say, /^(야옹|냥|냐|냐앙|미야|미야옹)$/, `소리 ${l.say}`);
    assert.ok(l.aside.startsWith('(') && l.aside.endsWith(')'), `괄호 ${l.aside}`);
    assert.ok(chars(l.aside) <= 26, `말풍선 세 줄 안: ${l.aside}`);
    assert.doesNotMatch(l.aside, /[—–]/);
    assert.ok(l.aside.slice(1, -1).trim().length > 0);
  }
  // 같은 말이 두 번 들어 있지 않다
  const all = [...allTap, ...scheduled].map(T.petLineText);
  assert.equal(new Set(all).size, all.length);
});

test('결마다 말이 넉넉하다. 강의 잔소리에는 옵시디언과 메타데이터 이야기가 있다', () => {
  assert.ok(T.PET_TAP_LINES.cold.length >= 5);
  assert.ok(T.PET_TAP_LINES.lecture.length >= 12);
  assert.ok(T.PET_TAP_LINES.warm.length >= 5);
  assert.ok(T.PET_FRIEND_LINES.length >= 5 && T.PET_ALONE_LINES.length >= 5);
  const lecture = T.PET_TAP_LINES.lecture.map((l) => l.aside).join(' ');
  assert.match(lecture, /옵시디언/);
  assert.match(lecture, /메타데이터/);
});

test('떠 있는 시간: 글자 수에 맞추되 3.2~6초(일정이 띄우는 말이 그 시간 안에 읽히는지는 pet.test.ts)', () => {
  for (const l of allTap) {
    const ms = T.petTalkMs(l);
    assert.ok(ms >= 3200 && ms <= 6000, `${T.petLineText(l)} ${ms}`);
  }
  assert.ok(T.petTalkMs(T.PET_TAP_LINES.lecture[0]) < T.petTalkMs({ say: '야옹', aside: '(아주 길게 이어지는 속마음을 여기에 적어 본다)' }));
});

test('누를수록 다정해진다: 처음에는 다정한 말이 없고, 네 번째부터는 다정한 말이 가장 많다', () => {
  const grid = Array.from({ length: 1000 }, (_, i) => (i + 0.5) / 1000);
  const share = (n: number, mood: string) => grid.filter((r) => T.petTapMood(n, r) === mood).length / grid.length;
  assert.equal(share(1, 'warm'), 0);
  assert.ok(share(1, 'cold') > 0.4);
  assert.ok(share(2, 'warm') > 0 && share(2, 'warm') < share(5, 'warm'));
  assert.ok(share(5, 'warm') >= 0.5 && share(5, 'cold') <= 0.1);
  assert.equal(T.petTapMood(0, 0.99), 'lecture');
});

test('누를 때 고르기: 그 결의 말에서, 최근에 한 말은 피한다(남은 말이 없으면 그중에서)', () => {
  const seq = [0.0, 0.0];
  let i = 0;
  const rnd = () => seq[i++ % seq.length];
  const first = T.petTapLine(1, rnd);
  assert.equal(first.mood, 'cold');
  assert.equal(first.line, T.PET_TAP_LINES.cold[0]);
  // 첫 말을 기억하면 다음 고르기는 다른 말
  const second = T.petTapLine(1, rnd, [first.line]);
  assert.notEqual(second.line, first.line);
  // 결의 말을 다 했으면 그중에서 다시 고른다
  const cold = T.PET_TAP_LINES.cold as readonly PetLine[];
  const again = T.petTapLine(1, rnd, cold);
  assert.ok(cold.includes(again.line));
  // 어떤 주사위 값에도 그 결의 말 안에서 고른다
  for (const r of [0, 0.3, 0.5, 0.75, 0.9999]) {
    const got = T.petTapLine(6, () => r);
    assert.ok((T.PET_TAP_LINES[got.mood] as readonly PetLine[]).includes(got.line));
  }
});

test('일정이 띄우는 말: 주사위만으로 정해진다. 친구 곁이면 친구에게 하는 말, 이상한 값도 받는다', () => {
  for (const talk of [0, 1, 7, 12345, 2 ** 32 - 1]) {
    assert.equal(T.petScheduledLine(talk, true), T.petScheduledLine(talk, true));
    assert.ok(T.PET_FRIEND_LINES.includes(T.petScheduledLine(talk, true)));
    assert.ok(T.PET_ALONE_LINES.includes(T.petScheduledLine(talk, false)));
  }
  assert.equal(T.petScheduledLine(Number.NaN, false), T.PET_ALONE_LINES[0]);
  assert.ok(T.PET_ALONE_LINES.includes(T.petScheduledLine(-3, false)));
  // 주사위 값이 고르게 퍼지면 말도 고르게 고른다
  const seen = new Set(Array.from({ length: 200 }, (_, k) => T.petScheduledLine(k * 2654435761 >>> 0, true)));
  assert.equal(seen.size, T.PET_FRIEND_LINES.length);
});

// ───────── 영어 말
const allTapEn = [...T.PET_TAP_LINES_EN.cold, ...T.PET_TAP_LINES_EN.lecture, ...T.PET_TAP_LINES_EN.warm];
const scheduledEn = [...T.PET_FRIEND_LINES_EN, ...T.PET_ALONE_LINES_EN];

test('영어 말: 한국어와 같은 수·같은 차례의 소리, 소리 + 괄호 속마음, 말풍선 세 줄 안, 한글·줄표 없음, 같은 말 두 번 없음', () => {
  const SOUND: Record<string, string> = { 야옹: 'Meow', 냥: 'Mew', 냐: 'Mrr', 냐앙: 'Mrrp', 미야: 'Mrow', 미야옹: 'Miaow' };
  const pairs: Array<[readonly PetLine[], readonly PetLine[]]> = [
    [T.PET_TAP_LINES.cold, T.PET_TAP_LINES_EN.cold],
    [T.PET_TAP_LINES.lecture, T.PET_TAP_LINES_EN.lecture],
    [T.PET_TAP_LINES.warm, T.PET_TAP_LINES_EN.warm],
    [T.PET_FRIEND_LINES, T.PET_FRIEND_LINES_EN],
    [T.PET_ALONE_LINES, T.PET_ALONE_LINES_EN],
  ];
  for (const [ko, en] of pairs) {
    assert.equal(en.length, ko.length, '같은 수');
    ko.forEach((k, i) => assert.equal(en[i].say, SOUND[k.say], `${i}: ${k.say} → ${en[i].say}`));
  }
  for (const l of [...allTapEn, ...scheduledEn]) {
    assert.ok(l.aside.startsWith('(') && l.aside.endsWith(')'), `괄호 ${l.aside}`);
    assert.ok(l.aside.slice(1, -1).trim().length > 0);
    // 말풍선 속마음은 300px에 25px 글씨로 세 줄까지: 영어 한 줄에 스무 자 남짓이라 50자 안
    assert.ok([...l.aside].length <= 50, `말풍선 세 줄 안: ${l.aside} (${[...l.aside].length})`);
    assert.doesNotMatch(l.say + l.aside, /[가-힣]/);
    assert.doesNotMatch(l.aside, /[—–]/);
  }
  const all = [...allTapEn, ...scheduledEn].map(T.petLineText);
  assert.equal(new Set(all).size, all.length);
  // 강의 잔소리의 옵시디언·메타데이터 이야기도 영어로 있다
  const lecture = T.PET_TAP_LINES_EN.lecture.map((l) => l.aside).join(' ');
  assert.match(lecture, /Obsidian/);
  assert.match(lecture, /metadata/);
  assert.equal(T.petLineText(T.PET_TAP_LINES_EN.lecture[0]), "Meow (You're using Obsidian, right?)");
  assert.equal(T.petLineText(T.PET_TAP_LINES_EN.lecture[1]), 'Mrrp (Did you decide on your metadata?)');
});

test('영어 말이 떠 있는 시간: 3.2~6초, 일정이 띄우는 말은 일정의 말풍선 시간 안에 읽힌다(한국어와 같은 셈)', async () => {
  const P = await import('../../src/walk/pet.ts');
  for (const l of allTapEn) {
    const ms = T.petTalkMs(l);
    assert.ok(ms >= 3200 && ms <= 6000, `${T.petLineText(l)} ${ms}`);
  }
  for (const l of scheduledEn) assert.ok(T.petTalkMs(l) <= P.PET_MEOW_MS + 300, `${T.petLineText(l)} ${T.petTalkMs(l)}ms`);
  // 한국어 줄은 예전 셈 그대로(글자 수 × 110ms)
  const ko = T.PET_TAP_LINES.lecture[0];
  assert.equal(T.petTalkMs(ko), Math.min(6000, Math.max(3200, 2400 + 110 * ([...ko.say].length + [...ko.aside].length))));
});

test('언어 고르기: 영어면 같은 결의 영어 말, 일정이 띄우는 말은 언어가 달라도 같은 차례, 언어를 바꿔도 최근 말은 피한다', () => {
  // 시험에는 화면이 없어 지금 화면 말은 한국어다
  assert.ok(T.PET_ALONE_LINES.includes(T.petScheduledLine(3, false)));
  for (const talk of [0, 1, 7, 12345, 2 ** 32 - 1, -3, Number.NaN]) {
    for (const friend of [true, false]) {
      const ko = T.petScheduledLine(talk, friend, 'ko');
      const en = T.petScheduledLine(talk, friend, 'en');
      const koList = friend ? T.PET_FRIEND_LINES : T.PET_ALONE_LINES;
      const enList = friend ? T.PET_FRIEND_LINES_EN : T.PET_ALONE_LINES_EN;
      assert.equal(enList.indexOf(en), koList.indexOf(ko), `${talk} ${friend}`);
    }
  }
  const first = T.petTapLine(1, () => 0, [], 'en');
  assert.equal(first.mood, 'cold');
  assert.equal(first.line, T.PET_TAP_LINES_EN.cold[0]);
  // 한국어로 한 말을 기억한 채 영어로 바꿔도 같은 차례의 말은 다시 하지 않는다
  const seq = [0.0, 0.0];
  let i = 0;
  const rnd = () => seq[i++ % seq.length];
  const next = T.petTapLine(1, rnd, [T.PET_TAP_LINES.cold[0]], 'en');
  assert.notEqual(next.line, T.PET_TAP_LINES_EN.cold[0]);
  assert.ok(T.PET_TAP_LINES_EN.cold.includes(next.line));
  for (const r of [0, 0.3, 0.5, 0.75, 0.9999]) {
    const got = T.petTapLine(6, () => r, [], 'en');
    assert.ok((T.PET_TAP_LINES_EN[got.mood] as readonly PetLine[]).includes(got.line));
  }
});
