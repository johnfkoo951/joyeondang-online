// 생각 지도 퀴즈의 순수 계산: 씨앗 난수, 판 차리기, 채점, 문제은행 검사. DOM·React를 모른다.
// 같은 씨앗이면 늘 같은 판이 나온다(tests/unit/games-brain.test.ts).
import type { GameResult } from '../types';
import { BANK, type Bank, type Card, type DrawerNo, type Example, type KidsCard, type StageId } from './bank';

export const R1_COUNT = 8;
export const R3_COUNT = 6;
/** 2판은 단계 순서 넷 + 예시 카드 넷 */
export const R2_COUNT = 8;
export const KIDS_COUNT = 6;
/** 이 비율을 넘기면 통과(공개 규칙: 70% 넘으면 cleared) */
export const CLEAR_RATIO = 0.7;
export const STAGE_ORDER: StageId[] = ['connect', 'merge', 'develop', 'share'];
export const DRAWER_NOS: DrawerNo[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 씨앗을 0 이상 정수로(숫자가 아니면 0) */
export const normSeed = (seed: number) => (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;

/** mulberry32: 작고 빠른 씨앗 난수(0 이상 1 미만) */
export function rng(seed: number): () => number {
  let a = normSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(items: readonly T[], rand: () => number): T {
  if (!items.length) throw new Error('고를 것이 없어요');
  return items[Math.floor(rand() * items.length)];
}

/** 섞은 결과가 정답 순서와 똑같으면 한 칸 돌려서, 섞지 않은 것처럼 보이지 않게 한다 */
function notIdentity<T>(shuffled: T[], key: (t: T) => unknown, answer: readonly unknown[]): T[] {
  if (shuffled.length < 2 || shuffled.some((t, i) => key(t) !== answer[i])) return shuffled;
  return [...shuffled.slice(1), shuffled[0]];
}

export type Quiz = {
  seed: number;
  /** 1판: 낱말 카드 8장(서로 다른 서랍) */
  drawers: Card[];
  /** 2판: 섞인 단계 칩과, 단계마다 하나씩 고른 예시 카드(섞음) */
  order: { chips: StageId[]; examples: Example[] };
  /** 3판: 하위 서랍 6장(서로 다른 위 서랍, 1판과 겹치지 않음)과 섞인 위 서랍 번호 */
  pairs: { cards: Card[]; parents: DrawerNo[] };
};

export function buildQuiz(seed: number, bank: Bank = BANK): Quiz {
  const rand = rng(seed);
  const of = (d: DrawerNo) => bank.cards.filter((c) => c.drawer === d);
  const r1 = shuffle(DRAWER_NOS, rand).slice(0, R1_COUNT).map((d) => pick(of(d), rand));
  const used = new Set(r1.map((c) => c.id));
  const r3 = shuffle(DRAWER_NOS, rand)
    .slice(0, R3_COUNT)
    .map((d) => pick(of(d).filter((c) => !used.has(c.id)), rand));
  const parents = notIdentity(shuffle(r3.map((c) => c.drawer), rand), (d) => d, r3.map((c) => c.drawer));
  const order = bank.stages.map((s) => s.id);
  const chips = notIdentity(shuffle(order, rand), (s) => s, order);
  const picked = order.map((s) => pick(bank.examples.filter((e) => e.stage === s), rand));
  const examples = notIdentity(shuffle(picked, rand), (e) => e.stage, order);
  return { seed: normSeed(seed), drawers: r1, order: { chips, examples }, pairs: { cards: r3, parents } };
}

/** 어린아이 판: 그림 카드 여섯 장을 섞는다(서랍 셋은 늘 같은 자리·같은 색) */
export function buildKids(seed: number, bank: Bank = BANK): KidsCard[] {
  return notIdentity(shuffle(bank.kidsCards, rng(seed)), (c) => c.id, bank.kidsCards.map((c) => c.id));
}

export const isRightDrawer = (card: { drawer: number }, drawer: number) => card.drawer === drawer;

/** 단계 칸마다 맞았는지(칸 i에 STAGE_ORDER[i]가 들어가야 한다) */
export function gradeOrder(answer: ReadonlyArray<StageId | null | undefined>): boolean[] {
  return STAGE_ORDER.map((s, i) => answer[i] === s);
}

/** 예시 카드마다 맞는 단계 칸에 놓였는지 */
export function gradeExamples(examples: readonly Example[], placed: Readonly<Record<string, StageId | undefined>>): boolean[] {
  return examples.map((e) => placed[e.id] === e.stage);
}

/** 하위 서랍 카드마다 맞는 위 서랍에 이어졌는지 */
export function gradePairs(cards: readonly Card[], links: Readonly<Record<string, number | undefined>>): boolean[] {
  return cards.map((c) => links[c.id] === c.drawer);
}

export const countTrue = (marks: readonly boolean[]) => marks.filter(Boolean).length;

export type Tally = { r1: number; r2: number; r3: number };
export const TOTALS: Tally = { r1: R1_COUNT, r2: R2_COUNT, r3: R3_COUNT };

export type Summary = { correct: number; total: number; ratio: number; percent: number; cleared: boolean };

/** 처음 고른 답으로만 센다. 70%를 넘기면 통과 */
export function summarize(t: Tally, totals: Tally = TOTALS): Summary {
  const correct = t.r1 + t.r2 + t.r3;
  const total = totals.r1 + totals.r2 + totals.r3;
  const ratio = total ? correct / total : 0;
  return { correct, total, ratio, percent: Math.round(ratio * 100), cleared: ratio > CLEAR_RATIO };
}

/** 세 판을 마쳤을 때(또는 그만하기, done=false) 걷기 화면에 넘길 결과 */
export function quizResult(t: Tally, ms: number, done = true): GameResult {
  const s = summarize(t);
  return {
    score: s.percent,
    cleared: done && s.cleared,
    ms: Math.max(0, Math.round(ms)),
    detail: { mode: 'quiz', r1: t.r1, r2: t.r2, r3: t.r3, correct: s.correct, total: s.total },
  };
}

/** 어린아이 판: 여섯 장을 다 넣으면 통과. 점수는 한 번에 맞힌 장 수의 비율 */
export function kidsResult(firstTry: number, placed: number, ms: number): GameResult {
  const done = placed >= KIDS_COUNT;
  return {
    score: Math.round((Math.min(firstTry, KIDS_COUNT) / KIDS_COUNT) * 100),
    cleared: done,
    ms: Math.max(0, Math.round(ms)),
    detail: { mode: 'kids', firstTry, placed, total: KIDS_COUNT },
  };
}

const DASH = /[\u2014\u2015]/;

/** 문제은행 검사. 문제가 없으면 빈 배열 */
export function checkBank(bank: Bank): string[] {
  const out: string[] = [];
  const texts: string[] = [];
  const nos = bank.drawers.map((d) => d.no);
  if (nos.join() !== DRAWER_NOS.join()) out.push('서랍은 1부터 9까지 차례로 아홉 개여야 해요');
  for (const d of bank.drawers) {
    if (d.code !== d.no * 100) out.push(`서랍 ${d.no}의 번호가 ${d.code}예요`);
    texts.push(d.name, d.hint, d.about);
  }
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const c of bank.cards) {
    if (ids.has(c.id)) out.push(`카드 id가 겹쳐요: ${c.id}`);
    if (labels.has(c.label)) out.push(`카드 이름이 겹쳐요: ${c.label}`);
    ids.add(c.id);
    labels.add(c.label);
    if (!Number.isInteger(c.drawer) || c.drawer < 1 || c.drawer > 9) out.push(`정답 서랍이 1~9가 아니에요: ${c.id}`);
    if (Math.floor(c.code / 100) !== c.drawer || c.code % 100 < 1) out.push(`하위 칸 번호가 서랍과 달라요: ${c.id}`);
    if (!c.why.trim() || !c.label.trim()) out.push(`풀이나 이름이 비었어요: ${c.id}`);
    if (!c.why.includes(`${c.drawer}00`)) out.push(`풀이에 정답 서랍 번호가 없어요: ${c.id}`);
    texts.push(c.label, c.why);
  }
  for (const d of DRAWER_NOS) {
    // 1판과 3판이 같은 서랍에서 서로 다른 카드를 하나씩 뽑을 수 있어야 한다
    if (bank.cards.filter((c) => c.drawer === d).length < 3) out.push(`서랍 ${d}에 카드가 셋보다 적어요`);
  }
  if (bank.stages.map((s) => s.id).join() !== STAGE_ORDER.join()) out.push('단계는 연결, 합치기, 키우기, 나누기 차례여야 해요');
  const exIds = new Set<string>();
  for (const e of bank.examples) {
    if (exIds.has(e.id)) out.push(`예시 id가 겹쳐요: ${e.id}`);
    exIds.add(e.id);
    if (!STAGE_ORDER.includes(e.stage)) out.push(`예시의 단계가 없어요: ${e.id}`);
    texts.push(e.text);
  }
  for (const s of bank.stages) {
    if (!bank.examples.some((e) => e.stage === s.id)) out.push(`예시가 없는 단계: ${s.id}`);
    texts.push(s.name, s.about);
  }
  const kidIds = new Set(bank.kidsDrawers.map((k) => k.id));
  for (const k of bank.kidsDrawers) {
    if (!DRAWER_NOS.includes(k.drawer)) out.push(`그림 서랍의 정답 서랍이 1~9가 아니에요: ${k.id}`);
    texts.push(k.name);
  }
  if (bank.kidsCards.length !== KIDS_COUNT) out.push(`그림 카드는 ${KIDS_COUNT}장이어야 해요`);
  if (new Set(bank.kidsCards.map((k) => k.id)).size !== bank.kidsCards.length) out.push('그림 카드 id가 겹쳐요');
  for (const k of bank.kidsCards) {
    if (!kidIds.has(k.to)) out.push(`그림 카드의 서랍이 없어요: ${k.id}`);
    texts.push(k.name, k.why);
  }
  for (const t of texts) if (DASH.test(t)) out.push(`엠대시가 들어 있어요: ${t}`);
  return out;
}
