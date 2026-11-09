// 문장 걸어 두기의 순수 계산. 화면·서버 액션·단위 시험이 함께 쓴다.
// node --test가 바로 읽도록 다른 파일을 import하지 않는다(DB 규칙은 supabase/migrations/0001_init.sql records).

export const SENTENCE_MAX = 300;
export const SOURCE_MAX = 80;
/** DB의 body 검사와 같은 제어문자 목록 */
const CONTROL = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const SOURCE_MARK = '\n\n출처: ';

export type Sentence = {
  id: string;
  text: string;
  source: string;
  /** 옮겨 적은 사람(DB author_name). 예시 문장은 비움 */
  by?: string;
  mine?: boolean;
  /** 아직 가족이 읽기 전 */
  pending?: boolean;
  /** 놀이에 든 예시 문장 */
  sample?: boolean;
};

/** 글자 수(한글 조합 중에도 그대로 센다) */
export function chars(s: string): number {
  return [...s.normalize('NFC')].length;
}

export type SentenceCheck =
  | { ok: true; text: string; source: string }
  | { ok: false; field: 'text' | 'source'; reason: string };

function cleanText(raw: string): string {
  return raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cleanSource(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** 문장 1~300자, 출처 1~80자(필수), 제어문자 없음 */
export function checkSentence(rawText: unknown, rawSource: unknown): SentenceCheck {
  const text = typeof rawText === 'string' ? cleanText(rawText) : '';
  if (!text) return { ok: false, field: 'text', reason: '문장을 적어 주세요.' };
  if (chars(text) > SENTENCE_MAX) return { ok: false, field: 'text', reason: `문장은 ${SENTENCE_MAX}자 안으로 줄여 주세요.` };
  if (CONTROL.test(text)) return { ok: false, field: 'text', reason: '쓸 수 없는 글자가 섞여 있어요.' };
  const source = typeof rawSource === 'string' ? cleanSource(rawSource) : '';
  if (!source) return { ok: false, field: 'source', reason: '출처(책 이름이나 글쓴이)를 적어 주세요.' };
  if (chars(source) > SOURCE_MAX) return { ok: false, field: 'source', reason: `출처는 ${SOURCE_MAX}자 안으로 적어 주세요.` };
  if (CONTROL.test(source)) return { ok: false, field: 'source', reason: '쓸 수 없는 글자가 섞여 있어요.' };
  return { ok: true, text, source };
}

/** records.body 모양: `문장\n\n출처: …` */
export function formatBody(text: string, source: string): string {
  return `${text}${SOURCE_MARK}${source}`;
}

export function parseBody(body: string): { text: string; source: string } {
  const b = body.replace(/\r\n?/g, '\n');
  const at = b.lastIndexOf(SOURCE_MARK);
  if (at < 0) return { text: b.trim(), source: '' };
  return { text: b.slice(0, at).trim(), source: b.slice(at + SOURCE_MARK.length).trim() };
}

/** room_records('study') 결과에서 문장 종이만 고른다(무엇이 보일지는 RPC가 이미 역할로 거른다) */
export function wallFromRows(rows: unknown): Sentence[] {
  if (!Array.isArray(rows)) return [];
  const out: Sentence[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    if (row.format !== 'sentence' || typeof row.body !== 'string' || typeof row.id !== 'string') continue;
    if (row.status === 'hidden' || row.status === 'rejected' || row.status === 'sealed') continue;
    const { text, source } = parseBody(row.body);
    if (!text) continue;
    out.push({
      id: row.id,
      text,
      source,
      by: typeof row.author_name === 'string' ? row.author_name : undefined,
      mine: row.mine === true,
      pending: row.status !== 'approved',
    });
  }
  return out;
}

export type Visibility = 'family' | 'guests' | 'public';
export type VisibilityPick = { ok: true; visibility: Visibility; consent: boolean } | { ok: false; reason: string };

/** 기본은 초대 손님까지. 인터넷 공개는 동의 칸이 있어야 한다 */
export function pickVisibility(raw: unknown, consent: unknown): VisibilityPick {
  const visibility: Visibility = raw === 'family' || raw === 'public' ? raw : 'guests';
  if (visibility === 'public' && consent !== true) {
    return { ok: false, reason: '인터넷에 걸려면 동의 칸을 눌러 주세요. 아니면 범위를 바꿔 주세요.' };
  }
  return { ok: true, visibility, consent: visibility === 'public' };
}

// ───────── 난수(같은 씨앗이면 같은 판)
export function rng(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────── 빛 무늬 퍼즐
export const PUZZLE_SIZES = [3, 4, 5] as const;
/** 화면 한 줄 띠에 올리기 좋은 길이 */
const PUZZLE_MAX_CHARS = 120;

export function words(text: string): string[] {
  const t = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ') : [];
}

/** 낱말 경계에서 n조각으로, 조각 길이가 고르게. 낱말이 모자라면 글자 단위로 */
export function splitPieces(text: string, n: number): string[] {
  const ws = words(text);
  if (ws.length >= n) {
    const len = ws.map((w) => chars(w));
    const total = len.reduce((s, x) => s + x, 0) + ws.length - 1;
    const target = total / n;
    const span = (a: number, b: number) => len.slice(a, b).reduce((s, x) => s + x, 0) + (b - a - 1);
    // cost[k][j]: 앞 j낱말을 k조각으로 나눈 가장 작은 비용, cut[k][j]: 마지막 조각의 시작
    const W = ws.length;
    const cost = Array.from({ length: n + 1 }, () => new Array<number>(W + 1).fill(Infinity));
    const cut = Array.from({ length: n + 1 }, () => new Array<number>(W + 1).fill(0));
    cost[0][0] = 0;
    for (let k = 1; k <= n; k++) {
      for (let j = k; j <= W - (n - k); j++) {
        for (let i = k - 1; i < j; i++) {
          if (cost[k - 1][i] === Infinity) continue;
          const c = cost[k - 1][i] + (span(i, j) - target) ** 2;
          if (c < cost[k][j]) {
            cost[k][j] = c;
            cut[k][j] = i;
          }
        }
      }
    }
    const pieces: string[] = [];
    let j = W;
    for (let k = n; k >= 1; k--) {
      const i = cut[k][j];
      pieces.unshift(ws.slice(i, j).join(' '));
      j = i;
    }
    return pieces;
  }
  const cs = [...ws.join(' ')].filter((c) => c !== ' ');
  if (cs.length <= n) return cs;
  const pieces: string[] = [];
  for (let k = 0; k < n; k++) {
    pieces.push(cs.slice(Math.round((k * cs.length) / n), Math.round(((k + 1) * cs.length) / n)).join(''));
  }
  return pieces;
}

/** 섞은 순서(조각 번호 배열). 섞은 결과가 정답과 같은 글 순서가 되지 않게 한다 */
export function scramble(pieces: readonly string[], rand: () => number): number[] {
  const ids = pieces.map((_, i) => i);
  if (pieces.length < 2 || pieces.every((p) => p === pieces[0])) return ids;
  for (let t = 0; t < 12; t++) {
    const s = shuffle(ids, rand);
    if (!isSolved(s.map((i) => pieces[i]), pieces)) return s;
  }
  return ids.slice(1).concat(ids[0]);
}

export function isSolved(placed: readonly string[], answer: readonly string[]): boolean {
  return placed.length === answer.length && placed.every((p, i) => p === answer[i]);
}

/** 앞에서부터 맞게 놓인 조각 수(같은 글 조각은 서로 바꿔 놓아도 맞다) */
export function correctPrefix(placed: readonly string[], answer: readonly string[]): number {
  let k = 0;
  while (k < placed.length && k < answer.length && placed[k] === answer[k]) k++;
  return k;
}

export type PuzzleRound = { sentence: Sentence; pieces: string[]; order: number[] };

/** 세 단계(3·4·5조각). 서로 다른 문장을 고르고, 모자라면 다시 쓴다 */
export function puzzleSet(pool: readonly Sentence[], seed: number): PuzzleRound[] {
  const rand = rng(seed);
  const deck = shuffle(pool.filter((s) => chars(s.text) <= PUZZLE_MAX_CHARS), rand);
  const all = deck.length ? deck : shuffle(pool, rand);
  const used = new Set<string>();
  return PUZZLE_SIZES.map((size) => {
    const pick =
      all.find((s) => !used.has(s.id) && words(s.text).length >= size) ??
      all.find((s) => !used.has(s.id)) ??
      all.find((s) => words(s.text).length >= size) ??
      all[0];
    used.add(pick.id);
    const pieces = splitPieces(pick.text, size);
    return { sentence: pick, pieces, order: scramble(pieces, rand) };
  });
}

// ───────── 점수
export type Progress = { hung: boolean; solved: number; misses: number; read: number };

/** 걸어 두기 100, 퍼즐 단계마다 100(틀린 확인 한 번에 10씩 빼되 단계마다 50까지만) */
export function scoreOf(p: Progress): number {
  const solved = Math.max(0, Math.min(PUZZLE_SIZES.length, p.solved));
  const penalty = Math.min(solved * 50, Math.max(0, p.misses) * 10);
  return (p.hung ? 100 : 0) + solved * 100 - penalty;
}

export function isCleared(p: Progress): boolean {
  return p.hung || p.solved >= PUZZLE_SIZES.length;
}
