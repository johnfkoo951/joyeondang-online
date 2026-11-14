// 박공 아래 잼의 순수 계산(DOM·오디오 없음, node --test로 시험한다).
// 스윙 8분 박자 자리, 판 만들기(같은 씨앗이면 같은 판), 반주 사건표, 타이밍 판정, 두 마디 격자와 이 기기 저장 형식.

/** 씨앗 하나로 늘 같은 수열(mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: readonly T[], r: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 스윙 박자 ----------
/** 한 마디의 8분음표 자리 수(4박 × 2) */
export const SLOTS_PER_BAR = 8;

/** 앞 8분음표가 한 박에서 차지하는 몫. 대략 2:1(0.667)이고 빠를수록 조금 곧아진다 */
export function swingRatio(bpm: number): number {
  return Math.min(0.68, Math.max(0.6, 0.68 - (bpm - 80) * 0.0015));
}
export const beatLen = (bpm: number): number => 60 / bpm;
export const barLen = (bpm: number): number => 240 / bpm;

/** 마디 시작에서 8분 자리 slot(0부터, 마디를 넘어가도 된다)까지 걸리는 초 */
export function slotTime(slot: number, bpm: number, swing: number = swingRatio(bpm)): number {
  const beat = 60 / bpm;
  return Math.floor(slot / 2) * beat + (slot % 2 === 1 ? swing * beat : 0);
}

// ---------- 판 ----------
/** 판정 창(초): good 안이면 좋아요, ok 안이면 조금 빨라요·늦어요, 그 밖은 못 맞힘 */
export type JudgeWindow = { good: number; ok: number };
export type RoundSpec = {
  bpm: number;
  /** 들려주기+따라 치기 한 쌍의 수 */
  phrases: number;
  hits: [number, number];
  /** 엇박(8분 뒤쪽) 수의 범위 */
  offbeats: [number, number];
  /** 바로 붙은 두 자리(엇박→다음 박)를 허락하는지 */
  adjacent: boolean;
  win: JudgeWindow;
};

// 판마다 30초 남짓(세기 한 마디 + 쌍 + 끝 마디). 점점 빠르고 엇박이 많아지고 창이 좁아진다.
export const ROUNDS: readonly RoundSpec[] = [
  { bpm: 84, phrases: 5, hits: [2, 3], offbeats: [0, 0], adjacent: false, win: { good: 0.09, ok: 0.18 } },
  { bpm: 96, phrases: 6, hits: [3, 4], offbeats: [0, 1], adjacent: false, win: { good: 0.08, ok: 0.16 } },
  { bpm: 108, phrases: 7, hits: [3, 5], offbeats: [1, 2], adjacent: true, win: { good: 0.07, ok: 0.14 } },
];

/**
 * 손가락 기기(휴대폰·태블릿)는 판정 창을 조금 넓힌다(화면을 누르는 손은 키보드보다 들쭉날쭉하다).
 * 엇박이 있는 판은 가장 가까운 두 자리(엇박 → 다음 박)를 헷갈리지 않게 ok 창을 그 간격의 0.9배 안에 둔다.
 */
export const COARSE_WIDEN = 1.25;
export function judgeWindow(spec: RoundSpec, coarse = false): JudgeWindow {
  if (!coarse) return spec.win;
  let ok = spec.win.ok * COARSE_WIDEN;
  if (spec.adjacent || spec.offbeats[1] > 0) ok = Math.min(ok, (slotTime(2, spec.bpm) - slotTime(1, spec.bpm)) * 0.9);
  return { good: Math.min(spec.win.good * COARSE_WIDEN, ok * 0.6), ok };
}

/** 도장(마침)은 1판만 넘으면 받는다. 2·3판은 덤(점수와 두 마디 만들기로 가는 길) */
export const CLEAR_ROUNDS = 1;
export function isCleared(passed: readonly boolean[]): boolean {
  return passed.length >= CLEAR_ROUNDS && passed.slice(0, CLEAR_ROUNDS).every(Boolean);
}

/** 판 하나의 씨앗(같은 방문 씨앗·판·시도면 같은 판) */
export function roundSeed(seed: number, round: number, attempt = 0): number {
  return (seed + Math.imul(round + 1, 0x9e3779b1) + Math.imul(attempt, 104729)) >>> 0;
}

function hasAdjacent(p: number[]): boolean {
  for (let i = 1; i < p.length; i++) if (p[i] - p[i - 1] === 1) return true;
  return false;
}

/** 한 마디 리듬(8분 자리 번호, 오름차순) */
export function makePattern(r: () => number, spec: RoundSpec): number[] {
  const [h0, h1] = spec.hits;
  const [o0, o1] = spec.offbeats;
  for (let tries = 0; tries < 60; tries++) {
    const n = h0 + Math.floor(r() * (h1 - h0 + 1));
    const offs = Math.min(n - 1, o0 + Math.floor(r() * (o1 - o0 + 1)));
    const set = new Set<number>();
    if (!spec.adjacent || r() < 0.7) set.add(0);
    for (const s of shuffled([1, 3, 5, 7], r)) {
      if (set.size >= offs + (set.has(0) ? 1 : 0)) break;
      set.add(s);
    }
    for (const s of shuffled([0, 2, 4, 6], r)) {
      if (set.size >= n) break;
      set.add(s);
    }
    if (set.size !== n) continue;
    const p = [...set].sort((a, b) => a - b);
    const offCount = p.filter((s) => s % 2 === 1).length;
    if (offCount < o0 || offCount > o1) continue;
    if (!spec.adjacent && hasAdjacent(p)) continue;
    return p;
  }
  return [0, 2, 4, 6].slice(0, h0);
}

/** 판 하나의 리듬들. 바로 앞과 같은 리듬은 다시 고른다 */
export function makeRound(seed: number, round: number, attempt = 0): number[][] {
  const spec = ROUNDS[round];
  const r = rng(roundSeed(seed, round, attempt));
  const out: number[][] = [];
  for (let k = 0; k < spec.phrases; k++) {
    let p = makePattern(r, spec);
    for (let i = 0; i < 8 && k > 0 && p.join() === out[k - 1].join(); i++) p = makePattern(r, spec);
    out.push(p);
  }
  return out;
}

// ---------- 화음과 워킹 베이스 ----------
export type Quality = 'm7' | '7' | 'maj7';
/** root = 음이름 번호(C=0), voicing = 피아노 왼손 근음 없는 짚기(MIDI) */
export type Chord = { root: number; q: Quality; voicing: number[] };
export const CHORDS: Record<string, Chord> = {
  Gm7: { root: 7, q: 'm7', voicing: [58, 62, 65, 69] },
  C7: { root: 0, q: '7', voicing: [58, 62, 64, 69] },
  Fmaj7: { root: 5, q: 'maj7', voicing: [57, 60, 64, 67] },
  D7: { root: 2, q: '7', voicing: [60, 64, 66, 71] },
  F7: { root: 5, q: '7', voicing: [57, 62, 63, 67] },
  Bb7: { root: 10, q: '7', voicing: [56, 60, 62, 67] },
};
/** 받아 치기 반주: ii-V-I에 VI7로 되돌아오는 네 마디 */
export const II_V_I = ['Gm7', 'C7', 'Fmaj7', 'D7'] as const;
/** 두 마디 만들기 반주(블루스 첫 두 마디) */
export const COMPOSE_CHORDS = ['F7', 'Bb7'] as const;
/** 오늘의 곡: 12마디 블루스를 두 마디씩 이어 간다 */
export const BLUES_FORM = ['F7', 'Bb7', 'F7', 'F7', 'Bb7', 'Bb7', 'F7', 'D7', 'Gm7', 'C7', 'F7', 'C7'] as const;

const TONES: Record<Quality, number[]> = { m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11] };
export const BASS_RANGE: [number, number] = [28, 55];

function nearestPc(pc: number, near: number, lo: number, hi: number): number {
  let best = lo + ((pc - lo) % 12 + 12) % 12;
  for (let n = best; n <= hi; n += 12) if (Math.abs(n - near) < Math.abs(best - near)) best = n;
  return best;
}
function fit(n: number): number {
  let x = n;
  while (x < BASS_RANGE[0]) x += 12;
  while (x > BASS_RANGE[1]) x -= 12;
  return x;
}

/**
 * 마디마다 네 박의 워킹 베이스(MIDI). 첫 박은 근음, 셋째 박까지 화음 음, 넷째 박은 다음 마디 근음으로
 * 반음 다가가는 음(마지막 마디는 첫 마디로 되돌아가니 되풀이해도 이어진다).
 */
export function walkingBass(chords: readonly string[], seed: number): number[] {
  const r = rng(seed ^ 0x5bd1e995);
  const roots: number[] = [];
  let prev = 41;
  for (const c of chords) {
    prev = nearestPc(CHORDS[c].root, prev, 33, 47);
    roots.push(prev);
  }
  const out: number[] = [];
  chords.forEach((c, i) => {
    const R = roots[i];
    const next = roots[(i + 1) % roots.length];
    const t = TONES[CHORDS[c].q];
    const shape = Math.floor(r() * 3);
    const mid = shape === 0 ? [R + t[1], R + t[2]] : shape === 1 ? [R + 2, R + t[1]] : [R + t[2], R + t[1]];
    const m0 = fit(mid[0]);
    const m1 = fit(mid[1]);
    const below = next - 1;
    const above = next + 1;
    // 셋째 박 음에서 가까운 쪽으로 다가가되, 같은 음을 두 번 치지 않는다
    let appr = Math.abs(below - m1) <= Math.abs(above - m1) ? below : above;
    if (appr === m1) appr = appr === below ? above : below;
    out.push(R, m0, m1, appr);
  });
  return out;
}

// ---------- 사건표 ----------
export type Inst = 'kick' | 'hat' | 'ride' | 'click' | 'tom' | 'piano' | 'bass' | 'vibe';
/** t = 시작에서 몇 초, v = 세기 0~1, n = 음(MIDI), d = 길이(초) */
export type Ev = { t: number; i: Inst; v: number; n?: number[]; d?: number };

function drumBar(out: Ev[], t0: number, bpm: number, sw: number, soft = 1): void {
  const at = (s: number) => t0 + slotTime(s, bpm, sw);
  // 라이드: 1, 2, 2&, 3, 4, 4& (딩, 딩가 딩, 딩가). 2·4박에 하이햇 발, 킥은 네 박을 아주 여리게
  for (const [s, v] of [[0, 0.42], [2, 0.5], [3, 0.3], [4, 0.42], [6, 0.5], [7, 0.3]] as const) out.push({ t: at(s), i: 'ride', v: v * soft });
  for (const s of [2, 6]) out.push({ t: at(s), i: 'hat', v: 0.55 * soft });
  for (const s of [0, 2, 4, 6]) out.push({ t: at(s), i: 'kick', v: 0.2 * soft });
}

function compBar(out: Ev[], t0: number, bpm: number, sw: number, chord: string, bar: number, v = 0.42): void {
  const beat = 60 / bpm;
  const n = CHORDS[chord].voicing;
  // 찰스턴(1, 2&)과 그 엇갈림(1&, 3&)을 번갈아
  const hits: Array<[number, number]> = bar % 2 === 0 ? [[0, 0.9], [3, 0.45]] : [[1, 0.5], [5, 0.9]];
  for (const [s, d] of hits) out.push({ t: t0 + slotTime(s, bpm, sw), i: 'piano', v: s === 0 ? v : v * 0.85, n, d: d * beat });
}

function bassBars(out: Ev[], t0: number, bpm: number, notes: number[]): void {
  const beat = 60 / bpm;
  notes.forEach((n, k) => out.push({ t: t0 + k * beat, i: 'bass', v: k % 4 === 0 ? 0.8 : 0.66, n: [n], d: beat * 0.92 }));
}

const byTime = (a: Ev, b: Ev) => a.t - b.t;

/** 따라 치기 한 쌍: callAt 마디에 들려주고 respAt 마디에 받아 친다. expected = 쳐야 할 시각(시작 기준 초) */
export type Phrase = { callAt: number; respAt: number; respEnd: number; pattern: number[]; expected: number[] };
export type Timeline = { events: Ev[]; phrases: Phrase[]; length: number; bpm: number; bar: number; countIn: number[] };

/** 받아 치기 판 하나의 사건표: 세기 한 마디 → (들려주기, 받아 치기) × n → 끝 마디 */
export function roundTimeline(patterns: number[][], bpm: number, seed = 1): Timeline {
  const sw = swingRatio(bpm);
  const bar = barLen(bpm);
  const events: Ev[] = [];
  const countIn = [0, 2, 4, 6].map((s) => slotTime(s, bpm, sw));
  countIn.forEach((t, k) => events.push({ t, i: 'click', v: k === 0 ? 0.9 : 0.65 }));
  for (const s of [2, 6]) events.push({ t: slotTime(s, bpm, sw), i: 'hat', v: 0.5 });
  const bars = patterns.length * 2;
  const chords = Array.from({ length: bars }, (_, b) => II_V_I[b % 4]);
  bassBars(events, bar, bpm, walkingBass(chords, seed));
  const phrases: Phrase[] = [];
  for (let b = 0; b < bars; b++) {
    const t0 = (b + 1) * bar;
    drumBar(events, t0, bpm, sw, b % 2 === 0 ? 0.8 : 1);
    compBar(events, t0, bpm, sw, chords[b], b, b % 2 === 0 ? 0.32 : 0.42);
    if (b % 2 === 1) continue;
    const pattern = patterns[b / 2];
    for (const s of pattern) events.push({ t: t0 + slotTime(s, bpm, sw), i: 'tom', v: 0.95 });
    const respAt = t0 + bar;
    phrases.push({ callAt: t0, respAt, respEnd: respAt + bar, pattern, expected: pattern.map((s) => respAt + slotTime(s, bpm, sw)) });
  }
  const end = (bars + 1) * bar;
  events.push({ t: end, i: 'piano', v: 0.5, n: CHORDS.Fmaj7.voicing, d: bar * 0.9 });
  events.push({ t: end, i: 'bass', v: 0.8, n: [41], d: bar * 0.8 });
  events.push({ t: end, i: 'ride', v: 0.6 });
  events.push({ t: end, i: 'kick', v: 0.4 });
  return { events: events.sort(byTime), phrases, length: end + bar, bpm, bar, countIn };
}

/** 같은 방문 씨앗·판·시도면 같은 사건표 */
export function buildRound(seed: number, round: number, attempt = 0): Timeline {
  return roundTimeline(makeRound(seed, round, attempt), ROUNDS[round].bpm, roundSeed(seed, round, attempt));
}

/**
 * 시작 기준 [from, to) 초에 울릴 사건(at = 시작 기준 초). loop가 있으면 그 길이마다 되풀이한다.
 * 스케줄러가 앞질러 보는 창을 이어 붙여 불러도 빠지거나 겹치는 사건이 없다.
 */
export function eventsBetween(events: readonly Ev[], from: number, to: number, loop: number | null = null): Array<{ ev: Ev; at: number }> {
  const out: Array<{ ev: Ev; at: number }> = [];
  if (!(to > from)) return out;
  if (!loop || loop <= 0) {
    for (const ev of events) if (ev.t >= from && ev.t < to) out.push({ ev, at: ev.t });
    return out;
  }
  for (let k = Math.floor(from / loop); k * loop < to; k++) {
    const base = k * loop;
    for (const ev of events) {
      const at = base + ev.t;
      if (at >= from && at < to) out.push({ ev, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------- 판정 ----------
export type Verdict = 'good' | 'early' | 'late' | 'miss';
/** 어긋남 d(초, 음수 = 빠름) 하나의 판정. 창 밖이면 null(이 음을 친 것으로 보지 않는다) */
export function verdictOf(d: number, win: JudgeWindow): Exclude<Verdict, 'miss'> | null {
  const a = Math.abs(d);
  if (a <= win.good) return 'good';
  if (a <= win.ok) return d < 0 ? 'early' : 'late';
  return null;
}

/** 친 순간 바로 보여 줄 판정: 가장 가까운 기대 음 하나와 견준다 */
export function nearestVerdict(expected: readonly number[], t: number, win: JudgeWindow): { verdict: Exclude<Verdict, 'miss'>; d: number } | null {
  let best: number | null = null;
  for (const e of expected) if (best === null || Math.abs(t - e) < Math.abs(t - best)) best = e;
  if (best === null) return null;
  const v = verdictOf(t - best, win);
  return v ? { verdict: v, d: t - best } : null;
}

export const POINTS = { good: 10, early: 6, late: 6, miss: 0, extra: -3 } as const;
const WEIGHT = { good: 1, early: 0.6, late: 0.6, miss: 0 } as const;
export type NoteJudge = { at: number; verdict: Verdict; d: number | null };
export type PhraseJudge = { notes: NoteJudge[]; extras: number; points: number; acc: number };

const MISS_COST = 1;
const EXTRA_COST = 0.5;

/**
 * 받아 친 한 마디의 판정. 기대 음과 친 시각을 순서를 지키며 짝짓는다(편집 거리 꼴 DP):
 * 짝 비용 = |어긋남|/ok, 놓친 음 = 1, 남는 탭 = 0.5. 창 밖의 짝은 맺지 않는다.
 */
export function judgePhrase(expected: readonly number[], tapsIn: readonly number[], win: JudgeWindow): PhraseJudge {
  const taps = tapsIn.slice().sort((a, b) => a - b);
  const E = expected.length;
  const T = taps.length;
  const cost: number[][] = Array.from({ length: E + 1 }, () => new Array<number>(T + 1).fill(Infinity));
  const how: number[][] = Array.from({ length: E + 1 }, () => new Array<number>(T + 1).fill(0));
  cost[0][0] = 0;
  for (let i = 0; i <= E; i++) {
    for (let j = 0; j <= T; j++) {
      const c = cost[i][j];
      if (c === Infinity) continue;
      if (i < E && c + MISS_COST < cost[i + 1][j]) { cost[i + 1][j] = c + MISS_COST; how[i + 1][j] = 1; }
      if (j < T && c + EXTRA_COST < cost[i][j + 1]) { cost[i][j + 1] = c + EXTRA_COST; how[i][j + 1] = 2; }
      if (i < E && j < T) {
        const d = taps[j] - expected[i];
        const m = c + Math.abs(d) / win.ok;
        if (verdictOf(d, win) && m < cost[i + 1][j + 1]) { cost[i + 1][j + 1] = m; how[i + 1][j + 1] = 3; }
      }
    }
  }
  const notes: NoteJudge[] = expected.map((at) => ({ at, verdict: 'miss' as Verdict, d: null }));
  let extras = 0;
  for (let i = E, j = T; i > 0 || j > 0; ) {
    const h = how[i][j];
    if (h === 3) {
      const d = taps[j - 1] - expected[i - 1];
      notes[i - 1] = { at: expected[i - 1], verdict: verdictOf(d, win) ?? 'miss', d };
      i--; j--;
    } else if (h === 2) { extras++; j--; }
    else i--;
  }
  let points = extras * POINTS.extra;
  let weight = 0;
  for (const n of notes) { points += POINTS[n.verdict]; weight += WEIGHT[n.verdict]; }
  const acc = E === 0 ? 1 : Math.max(0, Math.min(1, (weight - extras * 0.15) / E));
  return { notes, extras, points: Math.max(0, points), acc };
}

/** 한 마디를 한마디로: 거의 맞으면 good, 놓친 게 많으면 miss, 아니면 더 많이 기운 쪽 */
export function phraseVerdict(j: PhraseJudge): Verdict {
  const E = j.notes.length;
  const c = { good: 0, early: 0, late: 0, miss: 0 };
  let sum = 0;
  for (const n of j.notes) { c[n.verdict]++; if (n.d !== null) sum += n.d; }
  if (E === 0) return 'good';
  if (c.miss === 0 && c.good >= Math.ceil(E * 0.75) && j.extras <= 1) return 'good';
  if (c.miss * 2 > E || c.early + c.late === 0) return c.miss > 0 || j.extras > 0 ? 'miss' : 'good';
  if (c.early !== c.late) return c.early > c.late ? 'early' : 'late';
  return sum < 0 ? 'early' : 'late';
}

/** 판을 넘기려면 고른 정확도가 이만큼 */
export const PASS_ACC = 0.6;
export function summarizeRound(judges: readonly PhraseJudge[]): { points: number; acc: number; passed: boolean; stars: 0 | 1 | 2 | 3 } {
  const points = judges.reduce((s, j) => s + j.points, 0);
  const acc = judges.length ? judges.reduce((s, j) => s + j.acc, 0) / judges.length : 0;
  const stars = acc >= 0.9 ? 3 : acc >= 0.75 ? 2 : acc >= PASS_ACC ? 1 : 0;
  return { points, acc, passed: acc >= PASS_ACC, stars };
}

/** 친 시각 t가 어느 받아 치기 마디의 것인지(들려주는 마디에서 친 것은 -1, 따라 치기 연습으로 본다) */
export function phraseIndexAt(phrases: readonly Phrase[], t: number, win: JudgeWindow): number {
  for (let k = 0; k < phrases.length; k++) {
    const p = phrases[k];
    if (t >= p.respAt - win.ok && t < p.respEnd + win.ok / 2) return k;
  }
  return -1;
}

/** 오디오 시계와 performance 시계의 짝(AudioContext.getOutputTimestamp 모양) */
export type ClockStamp = { contextTime: number; performanceTime: number };
/**
 * 입력 시각(performance.now 기준 ms)을 그 순간 귀에 들리던 오디오 시각(초)으로 바꾼다.
 * stamp가 출력 지연을 담고 있으므로 사람이 들은 소리에 맞춰 친 탭은 그 소리의 예약 시각과 견줄 수 있다.
 * inputLagMs = 손가락·키가 닿은 뒤 이벤트가 되기까지 걸리는 시간.
 */
export function heardAt(eventMs: number, stamp: ClockStamp, inputLagMs = 0): number {
  return stamp.contextTime + (eventMs - inputLagMs - stamp.performanceTime) / 1000;
}

// ---------- 두 마디 만들기 ----------
/** 두 마디 × 8분음표 8칸 */
export const GRID_CELLS = 16;
/** F 블루스 음계(낮은 파부터): 파 라♭ 시♭ 시 도 미♭ 높은 파 */
export const SCALE = [65, 68, 70, 71, 72, 75, 77] as const;
export const SCALE_NAMES = ['파', '라♭', '시♭', '시', '도', '미♭', '높은 파'] as const;
/** 영어 화면의 음 이름(같은 차례) */
export const SCALE_NAMES_EN = ['F', 'A♭', 'B♭', 'B', 'C', 'E♭', 'high F'] as const;
/** 칸마다 음 하나(SCALE 번호) 또는 쉼(null) */
export type Grid = Array<number | null>;

export const emptyGrid = (): Grid => new Array<number | null>(GRID_CELLS).fill(null);

/** 칸 하나를 찍는다. 같은 음이면 지우고, 다른 음이면 바꾼다(한 칸에 한 음) */
export function toggleCell(g: readonly (number | null)[], col: number, row: number): Grid {
  const out = g.slice(0, GRID_CELLS);
  while (out.length < GRID_CELLS) out.push(null);
  if (col < 0 || col >= GRID_CELLS || row < 0 || row >= SCALE.length) return out;
  out[col] = out[col] === row ? null : row;
  return out;
}
export const noteCount = (g: readonly (number | null)[]): number => g.filter((x) => x !== null).length;

/** 16글자: 쉼은 '-', 음은 '0'~'6' */
export function encodeGrid(g: readonly (number | null)[]): string {
  let s = '';
  for (let i = 0; i < GRID_CELLS; i++) {
    const x = g[i];
    s += typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < SCALE.length ? String(x) : '-';
  }
  return s;
}
export function decodeGrid(s: unknown): Grid | null {
  if (typeof s !== 'string' || !/^[-0-6]{16}$/.test(s)) return null;
  return [...s].map((c) => (c === '-' ? null : Number(c)));
}

/** 「예시로 채우기」: 씨앗마다 다른, 한 걸음씩 오르내리는 짧은 블루스 가락 */
export function exampleGrid(seed: number): Grid {
  const r = rng(seed ^ 0x2545f491);
  const g = emptyGrid();
  let row = Math.floor(r() * 3);
  let up = r() < 0.6;
  g[0] = row;
  for (let c = 1; c < 12; c++) {
    if (r() > (c % 2 === 0 ? 0.7 : 0.42)) continue;
    if (row >= SCALE.length - 1) up = false;
    if (row <= 0) up = true;
    if (r() < 0.2) up = !up;
    row = Math.max(0, Math.min(SCALE.length - 1, row + (up ? 1 : -1) * (r() < 0.25 ? 2 : 1)));
    g[c] = row;
  }
  // 두째 마디 셋째 박에 으뜸음·딸림음 중 가까운 데로 맺는다
  g[12] = [0, 4, 6].reduce((a, b) => (Math.abs(b - row) < Math.abs(a - row) ? b : a));
  return g;
}

function melody(out: Ev[], g: readonly (number | null)[], t0: number, bpm: number, sw: number): void {
  g.forEach((row, c) => {
    if (row === null || row === undefined) return;
    let len = 1;
    while (c + len < GRID_CELLS && g[c + len] === null && len < 3) len++;
    const t = t0 + slotTime(c, bpm, sw);
    const d = t0 + slotTime(c + len, bpm, sw) - t;
    out.push({ t, i: 'vibe', v: c % 2 === 0 ? 0.7 : 0.6, n: [SCALE[row]], d });
  });
}

export const COMPOSE_BPM = 112;
/** 두 마디 되풀이(loop = length): 워킹 베이스·드럼·옅은 피아노 위에 내 가락 */
export function composeTimeline(g: readonly (number | null)[], bpm = COMPOSE_BPM, seed = 7): { events: Ev[]; length: number; bar: number } {
  const sw = swingRatio(bpm);
  const bar = barLen(bpm);
  const events: Ev[] = [];
  bassBars(events, 0, bpm, walkingBass(COMPOSE_CHORDS, seed));
  COMPOSE_CHORDS.forEach((c, b) => {
    drumBar(events, b * bar, bpm, sw, 0.85);
    compBar(events, b * bar, bpm, sw, c, b, 0.26);
  });
  melody(events, g, 0, bpm, sw);
  return { events: events.sort(byTime), length: 2 * bar, bar };
}

/** 오늘의 곡: 저장한 두 마디들을 블루스 열두 마디 꼴을 따라 차례로 잇고, 끝에 한 마디 맺음 */
export function songTimeline(grids: ReadonlyArray<readonly (number | null)[]>, bpm = COMPOSE_BPM, seed = 11): { events: Ev[]; length: number; starts: number[]; bar: number } {
  const sw = swingRatio(bpm);
  const bar = barLen(bpm);
  const events: Ev[] = [];
  const chords = grids.flatMap((_, k) => [BLUES_FORM[(2 * k) % 12], BLUES_FORM[(2 * k + 1) % 12]]);
  const starts = grids.map((_, k) => 2 * k * bar);
  bassBars(events, 0, bpm, walkingBass(chords.length ? chords : ['F7'], seed).slice(0, chords.length * 4));
  chords.forEach((c, b) => {
    drumBar(events, b * bar, bpm, sw, 0.85);
    compBar(events, b * bar, bpm, sw, c, b, 0.26);
  });
  grids.forEach((g, k) => melody(events, g, starts[k], bpm, sw));
  const end = chords.length * bar;
  events.push({ t: end, i: 'piano', v: 0.45, n: CHORDS.F7.voicing, d: bar });
  events.push({ t: end, i: 'bass', v: 0.8, n: [41], d: bar * 0.9 });
  events.push({ t: end, i: 'vibe', v: 0.6, n: [77], d: bar });
  events.push({ t: end, i: 'ride', v: 0.55 });
  return { events: events.sort(byTime), length: end + bar, starts, bar };
}

// ---------- 이 기기 저장 ----------
/** localStorage 열쇠. 값 = {"v":1,"pieces":[{"g":"0-2-...16글자","t":ms}]} */
export const SONG_KEY = 'jy.jam.song.v1';
export const MAX_PIECES = 24;
export type Piece = { g: string; t: number };

/** 깨졌거나 모르는 판이면 빈 목록. 잘못된 조각은 빼고 나머지는 살린다 */
export function parseSong(raw: string | null | undefined): Piece[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object' || (data as { v?: unknown }).v !== 1) return [];
  const list = (data as { pieces?: unknown }).pieces;
  if (!Array.isArray(list)) return [];
  const out: Piece[] = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const { g, t } = p as { g?: unknown; t?: unknown };
    const grid = decodeGrid(g);
    if (!grid || noteCount(grid) === 0) continue;
    out.push({ g: g as string, t: typeof t === 'number' && Number.isFinite(t) ? t : 0 });
  }
  return out.slice(-MAX_PIECES);
}

export function serializeSong(pieces: readonly Piece[]): string {
  return JSON.stringify({ v: 1, pieces: pieces.slice(-MAX_PIECES).map((p) => ({ g: p.g, t: p.t })) });
}

/** 두 마디 하나를 곡 끝에 붙인다(빈 격자는 붙이지 않고, 오래된 것부터 MAX_PIECES 밖으로 민다) */
export function addPiece(pieces: readonly Piece[], g: readonly (number | null)[], now: number): Piece[] {
  if (noteCount(g) === 0) return pieces.slice();
  return [...pieces, { g: encodeGrid(g), t: now }].slice(-MAX_PIECES);
}

/** 놀이 전체 점수: 넘긴 판마다 가장 좋은 점수 + 붙인 두 마디마다 20 */
export function totalScore(bestPoints: readonly number[], piecesAdded: number): number {
  return bestPoints.reduce((s, p) => s + Math.max(0, p), 0) + 20 * Math.max(0, piecesAdded);
}
