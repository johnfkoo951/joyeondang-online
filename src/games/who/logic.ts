// 누구의 문장일까: 순수 계산(DOM·소리 없음, node --test로 시험한다).
// 카드 묶음(deck) 모양 검사, 판 고르기(같은 씨앗이면 같은 판), 점수와 수 낱말.
// 실제 사람 이름과 문장은 저장소에 없다. 서버 환경 변수(WHO_DECK_JSON)에만 있고 명단 손님에게만 내려간다(src/lib/who-deck.ts).
// 서버와 놀이가 같은 검사(cleanDeck)를 쓴다: 서버는 환경 변수를, 놀이는 받은 응답을 한 번 더 거른다.

/** 사람 카드 그림(놀이 안의 작은 SVG 이름) */
export const WHO_ICONS = ['pen', 'piano', 'brush', 'ball', 'book', 'leaf', 'star', 'heart', 'music', 'spark'] as const;
export type WhoIcon = (typeof WHO_ICONS)[number];
/** 사람 카드 색(사이트 색 토큰과 그 섞음으로 칠한다, who.module.css) */
export const WHO_COLORS = ['roof', 'pine', 'lamp', 'sky', 'oak', 'clay', 'plum', 'moss'] as const;
export type WhoColor = (typeof WHO_COLORS)[number];

export type Person = { id: string; name: string; icon: WhoIcon; color: WhoColor; intro: string };
export type Line = { who: string; text: string };
export type Deck = { people: Person[]; lines: Line[] };
export type Round = { who: string; text: string };

export const LIMITS = {
  minPeople: 2,
  maxPeople: 8,
  name: 20,
  intro: 140,
  text: 140,
  maxLines: 200,
  /** 환경 변수 원문 크기 상한(바이트 대신 글자 수) */
  raw: 64_000,
} as const;
/** 한 번에 내는 판 수의 상한(사람마다 한 판) */
export const MAX_ROUNDS = LIMITS.maxPeople;

const ID = /^[a-z0-9-]{1,16}$/;
// 제어 문자(C0·C1)와 줄·문단 구분자, 글 방향을 뒤집는 문자는 받지 않는다
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const ICON_SET: ReadonlySet<string> = new Set(WHO_ICONS);
const COLOR_SET: ReadonlySet<string> = new Set(WHO_COLORS);

/** 앞뒤 빈칸을 뗀 글. 비었거나, max 글자(코드 포인트)를 넘거나, 제어 문자가 있으면 null */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || [...t].length > max || CONTROL.test(t)) return null;
  return t;
}

function cleanPerson(item: unknown): Person | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const id = typeof o.id === 'string' && ID.test(o.id) ? o.id : null;
  const name = cleanText(o.name, LIMITS.name);
  const intro = cleanText(o.intro, LIMITS.intro);
  const icon = typeof o.icon === 'string' && ICON_SET.has(o.icon) ? (o.icon as WhoIcon) : null;
  const color = typeof o.color === 'string' && COLOR_SET.has(o.color) ? (o.color as WhoColor) : null;
  if (!id || !name || !intro || !icon || !color) return null;
  return { id, name, icon, color, intro };
}

/**
 * 카드 묶음을 거른다. 모양이 틀린 사람·문장은 빼고(같은 id는 처음 것만, 사람은 앞에서 8명까지),
 * 없는 사람을 가리키는 문장도 뺀다. 남은 사람이 둘보다 적거나 문장이 하나도 없으면 null.
 */
export function cleanDeck(input: unknown): Deck | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as { people?: unknown; lines?: unknown };
  if (!Array.isArray(o.people) || !Array.isArray(o.lines)) return null;
  const people: Person[] = [];
  const ids = new Set<string>();
  for (const item of o.people.slice(0, 40)) {
    if (people.length >= LIMITS.maxPeople) break;
    const p = cleanPerson(item);
    if (!p || ids.has(p.id)) continue;
    ids.add(p.id);
    people.push(p);
  }
  if (people.length < LIMITS.minPeople) return null;
  const lines: Line[] = [];
  const seen = new Set<string>();
  for (const item of o.lines.slice(0, LIMITS.maxLines * 2)) {
    if (lines.length >= LIMITS.maxLines) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const l = item as Record<string, unknown>;
    const who = typeof l.who === 'string' && ids.has(l.who) ? l.who : null;
    const text = cleanText(l.text, LIMITS.text);
    if (!who || !text) continue;
    const key = `${who}\n${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ who, text });
  }
  if (lines.length === 0) return null;
  return { people, lines };
}

/** 환경 변수 원문(JSON) → 카드 묶음. 없거나 깨졌거나 너무 크면 null */
export function parseDeckJson(raw: string | null | undefined): Deck | null {
  if (!raw || raw.length > LIMITS.raw) return null;
  try {
    return cleanDeck(JSON.parse(raw));
  } catch {
    return null;
  }
}

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

/** 판 고르기: 문장이 있는 사람마다 문장 하나씩, 차례는 섞는다(같은 씨앗이면 같은 판). 사람이 적으면 판도 적다 */
export function pickRounds(deck: Deck, seed: number, max: number = MAX_ROUNDS): Round[] {
  const r = rng(seed ^ 0x51ed27);
  const byWho = new Map<string, Line[]>();
  for (const l of deck.lines) {
    const list = byWho.get(l.who);
    if (list) list.push(l);
    else byWho.set(l.who, [l]);
  }
  const rounds: Round[] = [];
  for (const p of deck.people) {
    const list = byWho.get(p.id);
    if (!list) continue;
    const l = list[Math.floor(r() * list.length)];
    rounds.push({ who: p.id, text: l.text });
  }
  return shuffled(rounds, r).slice(0, Math.max(0, max));
}

/** 맞힌 수 */
export function scoreOf(answers: ReadonlyArray<{ right: boolean }>): number {
  return answers.reduce((n, a) => n + (a.right ? 1 : 0), 0);
}

/** 사람 수를 우리말 수 낱말로(두 사람, 세 사람 …) */
export function countWord(n: number): string {
  return ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'][n] ?? String(n);
}

/** 영어 화면의 수 낱말(two, three …). 열을 넘으면 숫자 */
export function countWordEn(n: number): string {
  return ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
}
