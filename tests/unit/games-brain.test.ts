// 생각 지도 퀴즈 검사: 문제은행(정답 서랍 1~9, 중복 없음, 공개 분류 번호와 맞음), 같은 씨앗 같은 판, 채점과 통과 기준.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// logic.ts는 앱과 같은 꼴(확장자 없는 './bank')로 가져온다. 이 시험 프로세스에서만 .ts를 풀어 준다.
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

const bankMod = await import('../../src/games/brain/bank.ts');
const L = await import('../../src/games/brain/logic.ts');
const { BANK, CARDS, DRAWERS, EXAMPLES, KIDS_CARDS, KIDS_DRAWERS, STAGES } = bankMod;
type Bank = import('../../src/games/brain/bank.ts').Bank;

const SEEDS = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 1);

test('문제은행: 검사 함수가 문제를 하나도 찾지 않는다', () => {
  assert.deepEqual(L.checkBank(BANK), []);
});

test('문제은행: 모든 카드의 정답 서랍이 1~9이고 하위 칸 번호의 백의 자리와 같다', () => {
  assert.ok(CARDS.length >= 45, `카드 ${CARDS.length}장`);
  for (const c of CARDS) {
    assert.ok(Number.isInteger(c.drawer) && c.drawer >= 1 && c.drawer <= 9, c.id);
    assert.equal(Math.floor(c.code / 100), c.drawer, c.id);
    assert.ok(c.why.length > 8, c.id);
  }
  for (const k of KIDS_DRAWERS) assert.ok(k.drawer >= 1 && k.drawer <= 9, k.id);
  assert.deepEqual(DRAWERS.map((d) => d.code), [100, 200, 300, 400, 500, 600, 700, 800, 900]);
  assert.deepEqual(DRAWERS.map((d) => d.en), ['Themes', 'Literature', 'Data', 'Methodologies', 'Products', 'Specialties', 'Creatives', 'Outputs', 'Divisions']);
  assert.deepEqual(STAGES.map((s) => s.en), ['Connect', 'Merge', 'Develop', 'Share']);
});

test('문제은행: id·이름·예시·그림 카드에 중복이 없다', () => {
  const uniq = (xs: string[]) => new Set(xs).size === xs.length;
  assert.ok(uniq(CARDS.map((c) => c.id)), '카드 id');
  assert.ok(uniq(CARDS.map((c) => c.label)), '카드 이름');
  assert.ok(uniq(CARDS.map((c) => String(c.code))), '하위 칸 번호');
  assert.ok(uniq(EXAMPLES.map((e) => e.id)) && uniq(EXAMPLES.map((e) => e.text)), '예시');
  assert.ok(uniq(KIDS_CARDS.map((k) => k.id)), '그림 카드');
  for (const s of STAGES) assert.ok(EXAMPLES.filter((e) => e.stage === s.id).length >= 2, s.id);
  for (const d of DRAWERS) assert.ok(CARDS.filter((c) => c.drawer === d.no).length >= 4, `서랍 ${d.no}`);
});

test('문제은행: 서랍 앞 한 줄은 좁은 서랍에서 낱말 가운데가 끊기지 않는다', () => {
  // 휴대폰 3열 서랍 한 줄은 한글 일곱 자쯤이다. 띄어 쓴 한 덩어리가 그보다 길면 글자 단위로 끊긴다(로마자·기호는 반 자로 센다)
  const width = (w: string) => [...w].reduce((n, ch) => n + (ch.charCodeAt(0) < 0x2000 ? 0.55 : 1), 0);
  for (const d of DRAWERS) {
    assert.ok(!d.hint.includes('·'), `${d.code}: 가운뎃점으로 이으면 줄바꿈 자리가 없어요`);
    for (const w of d.hint.split(/\s+/)) assert.ok(width(w) <= 7, `${d.code}: 「${w}」가 서랍 한 줄보다 길어요`);
  }
});

test('문제은행: 검사 함수가 나쁜 은행을 잡아낸다', () => {
  const bad: Bank = {
    ...BANK,
    cards: [
      ...BANK.cards,
      { ...BANK.cards[0] },
      { id: 'x1', label: '틀린 서랍', drawer: 10 as 1, code: 1001, why: '1000 서랍' },
      { id: 'x2', label: '번호 어긋남', drawer: 2, code: 301, why: '200 문헌' },
      { id: 'x3', label: '엠대시', drawer: 1, code: 199, why: '100 주제 \u2014 서랍' },
    ],
    examples: [...BANK.examples, { ...BANK.examples[0] }],
  };
  const issues = L.checkBank(bad).join('\n');
  for (const want of ['id가 겹쳐요', '이름이 겹쳐요', '1~9가 아니에요', '서랍과 달라요', '엠대시', '예시 id가 겹쳐요']) {
    assert.ok(issues.includes(want), want);
  }
});

test('씨앗: 같은 씨앗이면 같은 판, 다른 씨앗이면 대개 다른 판', () => {
  for (const s of SEEDS.slice(0, 40)) {
    assert.deepEqual(L.buildQuiz(s), L.buildQuiz(s));
    assert.deepEqual(L.buildKids(s), L.buildKids(s));
  }
  const keys = new Set(SEEDS.map((s) => L.buildQuiz(s).drawers.map((c) => c.id).join()));
  assert.ok(keys.size > SEEDS.length * 0.9, `서로 다른 1판 ${keys.size}개`);
  const r = L.rng(42);
  const a = [r(), r(), r()];
  const r2 = L.rng(42);
  assert.deepEqual([r2(), r2(), r2()], a);
  assert.ok(a.every((v) => v >= 0 && v < 1));
  assert.deepEqual(L.buildQuiz(Number.NaN), L.buildQuiz(0));
});

test('판 차리기: 1판 8장·3판 6장은 서로 다른 서랍, 둘은 겹치지 않고, 섞인 채로 나온다', () => {
  const order = STAGES.map((s) => s.id);
  for (const s of SEEDS) {
    const q = L.buildQuiz(s);
    assert.equal(q.drawers.length, L.R1_COUNT);
    assert.equal(new Set(q.drawers.map((c) => c.drawer)).size, L.R1_COUNT);
    assert.equal(q.pairs.cards.length, L.R3_COUNT);
    assert.equal(new Set(q.pairs.cards.map((c) => c.drawer)).size, L.R3_COUNT);
    const used = new Set(q.drawers.map((c) => c.id));
    assert.ok(q.pairs.cards.every((c) => !used.has(c.id)));
    assert.deepEqual([...q.pairs.parents].sort(), q.pairs.cards.map((c) => c.drawer).sort());
    assert.notDeepEqual(q.pairs.parents, q.pairs.cards.map((c) => c.drawer));
    assert.deepEqual([...q.order.chips].sort(), [...order].sort());
    assert.notDeepEqual(q.order.chips, order);
    assert.deepEqual(q.order.examples.map((e) => e.stage).sort(), [...order].sort());
    assert.notDeepEqual(q.order.examples.map((e) => e.stage), order);
    const kids = L.buildKids(s);
    assert.equal(kids.length, L.KIDS_COUNT);
    assert.notDeepEqual(kids.map((k) => k.id), KIDS_CARDS.map((k) => k.id));
  }
});

test('채점: 서랍·순서·예시·짝', () => {
  const q = L.buildQuiz(7);
  const c = q.drawers[0];
  assert.equal(L.isRightDrawer(c, c.drawer), true);
  assert.equal(L.isRightDrawer(c, (c.drawer % 9) + 1), false);
  assert.deepEqual(L.gradeOrder(['connect', 'merge', 'develop', 'share']), [true, true, true, true]);
  assert.deepEqual(L.gradeOrder(['merge', 'connect', 'develop', null]), [false, false, true, false]);
  const right = Object.fromEntries(q.order.examples.map((e) => [e.id, e.stage]));
  assert.equal(L.countTrue(L.gradeExamples(q.order.examples, right)), 4);
  assert.equal(L.countTrue(L.gradeExamples(q.order.examples, {})), 0);
  const links = Object.fromEntries(q.pairs.cards.map((p) => [p.id, p.drawer]));
  assert.equal(L.countTrue(L.gradePairs(q.pairs.cards, links)), 6);
  const first = q.pairs.cards[0];
  links[first.id] = (first.drawer % 9) + 1;
  assert.equal(L.countTrue(L.gradePairs(q.pairs.cards, links)), 5);
});

test('통과 기준: 22문제 중 16개(73%)면 통과, 15개(68%)면 아직, 정확히 70%는 넘은 것이 아니다', () => {
  assert.equal(L.summarize({ r1: 8, r2: 8, r3: 6 }).total, 22);
  assert.equal(L.summarize({ r1: 6, r2: 6, r3: 4 }).cleared, true);
  assert.equal(L.summarize({ r1: 6, r2: 5, r3: 4 }).cleared, false);
  assert.equal(L.summarize({ r1: 7, r2: 0, r3: 0 }, { r1: 10, r2: 0, r3: 0 }).cleared, false);
  const done = L.quizResult({ r1: 8, r2: 7, r3: 5 }, 61_234.6);
  assert.equal(done.cleared, true);
  assert.equal(done.score, 91);
  assert.equal(done.ms, 61_235);
  assert.equal(done.detail?.mode, 'quiz');
  assert.equal(L.quizResult({ r1: 8, r2: 8, r3: 6 }, 1000, false).cleared, false);
  const kids = L.kidsResult(4, 6, 30_000);
  assert.equal(kids.cleared, true);
  assert.equal(kids.score, 67);
  assert.equal(L.kidsResult(6, 5, 1).cleared, false);
});
