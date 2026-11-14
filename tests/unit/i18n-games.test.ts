// 작은 놀이의 한국어·영어: 놀이 목록·놀이 모음·놀이마다의 표에 영어가 다 있고(비지 않고 한글이 없다), 한국어는 예전 글자 그대로인지 본다.
// 놀이 글 가운데 한국어가 본바탕인 것(생각 지도 문제은행, 문장 예시, 누구의 문장 연습판)은 옮기지 않으므로 여기서 영어를 찾지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';

// 놀이 파일들은 앱과 같은 꼴(확장자 없는 './logic')로 서로 가져온다. 이 시험 프로세스에서만 .ts를 풀어 준다.
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const { GAMES, gameTitle, gameBlurb } = await import('../../src/games/registry.ts');
const { GAME_EN } = await import('../../src/components/walk/hud-text.ts');
const { GAME_CATALOG, FILTERS, GAMES_TITLE_EN } = await import('../../src/components/games/catalog.ts');
const brain = await import('../../src/games/brain/bank.ts');
const brainLogic = await import('../../src/games/brain/logic.ts');
const jam = await import('../../src/games/jam/logic.ts');
const { ITEMS } = await import('../../src/games/shelf/items.ts');
const shelf = await import('../../src/games/shelf/logic.ts');
const sentences = await import('../../src/games/sentences/logic.ts');
const { SENTENCE_WORDS_EN, sentenceWordEn } = await import('../../src/games/sentences/words-en.ts');
const target = await import('../../src/games/target/words.ts');
const who = await import('../../src/games/who/logic.ts');
const groove = await import('../../src/games/groove/logic.ts');
const pitch = await import('../../src/games/pitch/logic.ts');
const text = await import('../../src/lib/text.ts');
const { recordLimitMessage } = await import('../../src/lib/record-errors.ts');

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const DASH = /[—―]/;

/** 영어 칸: 비지 않고, 한글이 없고, 엠대시가 없다 */
function english(v: unknown, where: string) {
  assert.equal(typeof v, 'string', `${where}: 영어가 없어요`);
  const s = v as string;
  assert.ok(s.trim().length > 0, `${where}: 영어가 비었어요`);
  assert.doesNotMatch(s, HANGUL, `${where}: 영어에 한글이 있어요 (${s})`);
  assert.doesNotMatch(s, DASH, `${where}: 영어에 엠대시가 있어요 (${s})`);
}

test('놀이 목록: 모든 놀이에 영어 이름·설명이 있고, 걷기 화면 표(GAME_EN)와 같은 말이다', () => {
  for (const [id, g] of Object.entries(GAMES)) {
    english(g.titleEn, `GAMES.${id}.titleEn`);
    english(g.blurbEn, `GAMES.${id}.blurbEn`);
    assert.match(g.title, HANGUL, `GAMES.${id}.title은 한국어 그대로`);
    assert.equal(g.titleEn, GAME_EN[id]?.title, `GAMES.${id}.titleEn은 GAME_EN과 같은 말`);
    assert.equal(g.blurbEn, GAME_EN[id]?.blurb, `GAMES.${id}.blurbEn은 GAME_EN과 같은 말`);
    assert.equal(gameTitle(g, 'ko'), g.title);
    assert.equal(gameTitle(g, 'en'), g.titleEn);
    assert.equal(gameBlurb(g, 'ko'), g.blurb);
    assert.equal(gameBlurb(g, 'en'), g.blurbEn);
  }
  // 글이 한국어인 놀이 셋은 영어 화면에 한 줄을 붙인다
  for (const id of ['brain', 'sentences', 'who', 'sword']) english(GAMES[id].koreanNoteEn, `GAMES.${id}.koreanNoteEn`);
  for (const id of ['jam', 'groove', 'pitch', 'shelf', 'target']) assert.equal(GAMES[id].koreanNoteEn, undefined, `${id}는 글 없이 하는 놀이`);
  // 예전 한국어 이름 그대로
  assert.equal(GAMES.jam.title, '박공 아래 잼');
  assert.equal(GAMES.who.title, '누구의 문장일까');
});

test('놀이 모음: 카드 차례가 놀이 목록과 같고, 한 줄 소개·갈래 단추에 영어가 다 있다', () => {
  assert.deepEqual(GAME_CATALOG.map((g) => g.id).sort(), Object.keys(GAMES).sort());
  for (const g of GAME_CATALOG) {
    assert.match(g.how, HANGUL, `${g.id}.how는 한국어 그대로`);
    english(g.howEn, `${g.id}.howEn`);
  }
  assert.deepEqual(FILTERS.map((f) => f.id), ['all', 'story', 'action', 'craft']);
  for (const f of FILTERS) {
    assert.match(f.ko, HANGUL);
    english(f.en, `FILTERS.${f.id}`);
  }
  assert.equal(FILTERS[0].ko, '전체 12종');
  english(GAMES_TITLE_EN, 'GAMES_TITLE_EN');
});

test('생각 지도: 서랍·단계는 공개 영어 이름이 있고, 그림 놀이의 서랍·카드는 영어 이름이 있다(문제은행 검사는 그대로 통과)', () => {
  assert.deepEqual(brainLogic.checkBank(brain.BANK), []);
  for (const d of brain.DRAWERS) {
    english(d.en, `drawer ${d.no}`);
    if (d.enShort !== undefined) english(d.enShort, `drawer ${d.no} enShort`);
  }
  for (const st of brain.STAGES) english(st.en, `stage ${st.id}`);
  for (const k of brain.KIDS_DRAWERS) {
    english(k.en, `kids drawer ${k.id}`);
    assert.match(k.name, HANGUL);
  }
  for (const k of brain.KIDS_CARDS) {
    english(k.en, `kids card ${k.id}`);
    assert.match(k.name, HANGUL);
  }
});

test('잼: 음 이름의 영어가 같은 차례로 다 있다', () => {
  assert.equal(jam.SCALE_NAMES_EN.length, jam.SCALE_NAMES.length);
  assert.equal(jam.SCALE_NAMES_EN.length, jam.SCALE.length);
  jam.SCALE_NAMES_EN.forEach((n: string, i: number) => english(n, `SCALE_NAMES_EN[${i}]`));
});

test('선반: 소품마다 영어 이름, 칸 이름은 두 말로(한국어는 예전 그대로)', () => {
  for (const it of ITEMS) {
    english(it.en, `item ${it.id}`);
    assert.match(it.name, HANGUL);
  }
  assert.equal(shelf.slotName(0), '1단 1번째 칸');
  assert.equal(shelf.slotName(5, 'ko'), '2단 2번째 칸');
  assert.equal(shelf.slotName(5, 'en'), 'Shelf 2, spot 2');
  for (let i = 0; i < shelf.SLOTS; i++) english(shelf.slotName(i, 'en'), `slotName(${i})`);
});

test('문장 걸어 두기: 서버 액션·검사 함수의 한국어 말이 모두 영어 표에 있다', () => {
  // 소스에서 한글이 든 글자 마디를 찾는다(주석·body 모양 표시 「출처: 」는 뺀다)
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const found = new Set<string>();
  for (const file of ['src/games/sentences/actions.ts', 'src/games/sentences/logic.ts']) {
    const src = strip(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    for (const m of src.matchAll(/'([^'\n]*[가-힣][^'\n]*)'|`([^`\n]*[가-힣][^`\n]*)`/g)) {
      const raw = (m[1] ?? m[2])
        .replace('${SENTENCE_MAX}', String(sentences.SENTENCE_MAX))
        .replace('${SOURCE_MAX}', String(sentences.SOURCE_MAX));
      if (raw.startsWith('\\n\\n출처')) continue;
      found.add(raw);
    }
  }
  assert.ok(found.size >= 10, `찾은 말 ${found.size}개`);
  for (const ko of found) {
    assert.doesNotMatch(ko, /\$\{/, `풀지 못한 자리: ${ko}`);
    english(SENTENCE_WORDS_EN[ko], `SENTENCE_WORDS_EN[${ko}]`);
  }
  // 검사 함수가 실제로 내는 말
  const bad = [
    sentences.checkSentence('', 'x'),
    sentences.checkSentence('가'.repeat(sentences.SENTENCE_MAX + 1), 'x'),
    sentences.checkSentence('가\u0001', 'x'),
    sentences.checkSentence('가', ''),
    sentences.checkSentence('가', '가'.repeat(sentences.SOURCE_MAX + 1)),
    sentences.checkSentence('가', '가\u0001'),
  ];
  for (const r of bad) {
    assert.equal(r.ok, false);
    if (!r.ok) english(sentenceWordEn(r.reason), `checkSentence: ${r.reason}`);
  }
  const vis = sentences.pickVisibility('public', false);
  assert.equal(vis.ok, false);
  if (!vis.ok) english(sentenceWordEn(vis.reason), 'pickVisibility');
  // 같은 화면에 보이는 글 검사(lib/text)·기록 한도(lib/record-errors)의 말
  const body = [text.checkBody(''), text.checkBody('가'.repeat(5000)), text.checkBody('가\u0001')];
  for (const r of body) {
    assert.equal(r.ok, false);
    if (!r.ok) english(sentenceWordEn(r.reason), `checkBody: ${r.reason}`);
  }
  const warns = text.contactWarnings('010-1234-5678 a@b.co 서울로 12 https://x.y');
  assert.equal(warns.length, 4);
  for (const w of warns) english(sentenceWordEn(w), `contactWarnings: ${w}`);
  for (const code of ['too_many_today', 'too_many']) english(sentenceWordEn(recordLimitMessage(code)), `recordLimitMessage(${code})`);
  // 모르는 말은 옮기지 않는다
  assert.equal(sentenceWordEn('처음 보는 말'), null);
  assert.equal(sentenceWordEn(undefined), null);
});

test('종이공 과녁: 고정된 말과 숫자 말 모두 영어가 있고, 한국어는 예전 그대로', () => {
  for (const [k, p] of Object.entries(target.TARGET_WORDS)) {
    assert.match((p as readonly [string, string])[0], HANGUL, `${k}는 한국어`);
    english((p as readonly [string, string])[1], `TARGET_WORDS.${k}`);
  }
  assert.equal(target.timeLabel(60, 'ko'), '남은 시간 60초');
  assert.equal(target.scoreLabel(0, 'ko'), '점수 0');
  assert.equal(target.streakText(3, 'ko'), '연속 3번');
  assert.equal(target.goalLabel(100, false, 'ko'), '목표 100점, 아직');
  assert.equal(target.goalLabel(100, true, 'ko'), '목표 100점, 해냈어요');
  assert.equal(target.levelSay('easy', 'ko'), '쉬운 판. 셋, 둘, 하나 뒤에 시작해요.');
  assert.equal(target.endSay(120, 64, 'ko'), '끝. 120점, 명중률 64퍼센트.');
  assert.equal(target.bestLine(10, 20, 'ko'), '이 기기 최고 점수: 쉬운 판 10점, 보통 판 20점');
  for (const s of [
    target.timeLabel(5, 'en'), target.scoreLabel(9, 'en'), target.streakText(2, 'en'), target.goalLabel(100, true, 'en'),
    target.bestLine(1, 2, 'en'), target.starsLabel(1, 'en'), target.starsLabel(3, 'en'), target.pointsLabel(1, 'en'),
    target.pointsLabel(40, 'en'), target.bestHere(88, 'en'), target.timesLabel(4, 'en'), target.levelSay('normal', 'en'), target.endSay(1, 2, 'en'),
  ]) english(s, s);
  assert.equal(target.starsLabel(1, 'en'), '1 star');
  assert.equal(target.pointsLabel(2, 'en'), '2 points');
});

test('누구의 문장일까: 수 낱말의 영어(한국어는 예전 그대로)', () => {
  assert.equal(who.countWord(5), '다섯');
  assert.equal(who.countWordEn(5), 'five');
  assert.equal(who.countWordEn(2), 'two');
  assert.equal(who.countWordEn(12), '12');
  for (let n = 1; n <= who.LIMITS.maxPeople; n++) english(who.countWordEn(n), `countWordEn(${n})`);
});

test('재즈 스튜디오: 막 이름·설명의 영어, 모든 판의 소리 말이 영어 표에 있다', () => {
  for (const st of groove.STAGES) {
    english(st.titleEn, `${st.id}.titleEn`);
    english(st.subtitleEn, `${st.id}.subtitleEn`);
    assert.match(st.title, HANGUL);
  }
  for (const [k, v] of Object.entries(groove.CUE_EN)) {
    assert.match(k, HANGUL);
    english(v, `CUE_EN[${k}]`);
  }
  const seen = new Set<string>();
  for (let stage = 0; stage < groove.STAGES.length; stage++) {
    for (let seed = 0; seed < 60; seed++) {
      const chart = groove.buildStageChart(stage, seed * 7919 + 13);
      for (const ev of chart.events) if (ev.cueText) seen.add(ev.cueText);
      for (const t of chart.targets) seen.add(t.label);
    }
  }
  assert.ok(seen.size >= 20, `소리 말 ${seen.size}개`);
  for (const cue of seen) english(groove.cueWord(cue, 'en'), `cueWord(${cue})`);
  // 한국어 화면은 그대로
  for (const cue of seen) assert.equal(groove.cueWord(cue, 'ko'), cue);
});

test('이어 트레이닝: 건반 음정·화성·릭 이름의 영어, 문제 묶음의 영어 칸', () => {
  for (const k of pitch.PIANO_KEYS) english(k.intervalNameEn, `${k.note}.intervalNameEn`);
  for (const c of pitch.CHORD_QUALITIES) {
    english(c.labelEn, `${c.id}.labelEn`);
    english(c.colorHintEn, `${c.id}.colorHintEn`);
  }
  for (const l of pitch.BEBOP_LICKS) english(l.titleEn, `lick ${l.notes.join('-')}`);
  for (const seed of [1, 42, 777, 9001]) {
    for (const q of pitch.generateEarDeck('interval', seed, 5)) if (q.mode === 'interval') english(q.intervalLabelEn, q.intervalLabel);
    for (const q of pitch.generateEarDeck('lick', seed, 5)) if (q.mode === 'lick') english(q.titleEn, q.title);
  }
  // 한국어 음정 이름은 예전 그대로
  assert.equal(pitch.PIANO_KEYS[0].intervalName, '완전1도 (Root)');
});
