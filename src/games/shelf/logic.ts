// 좋아하는 것 선반의 순수 계산(DOM 없음, node --test로 시험한다).
// 선반은 3단 × 4칸 = 12칸, 칸마다 소품 id 하나 또는 빈칸(null). 소품 하나는 선반에 한 번만 놓인다.
// 소품 목록(items.ts)은 여기서 가져오지 않는다: 알아볼 id 목록을 인자로 받는다(시험에서도 같은 목록을 넘긴다).

export const ROWS = 3;
export const COLS = 4;
export const SLOTS = ROWS * COLS;
/** 「다 꾸몄어요」를 누를 수 있는 최소 소품 수 */
export const MIN_TO_FINISH = 3;
/** localStorage 열쇠. 값 = {"v":1,"s":[12칸, id 또는 null],"t":ms} */
export const SHELF_KEY = 'jy.shelf.v1';

export type Shelf = Array<string | null>;

export const emptyShelf = (): Shelf => new Array<string | null>(SLOTS).fill(null);

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

/** 고르기 칸의 소품 순서(같은 씨앗이면 같은 순서) */
export function trayOrder(ids: readonly string[], seed: number): string[] {
  const r = rng(seed ^ 0x51ed270b);
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function norm(shelf: readonly (string | null)[]): Shelf {
  const out = shelf.slice(0, SLOTS).map((x) => (typeof x === 'string' ? x : null));
  while (out.length < SLOTS) out.push(null);
  return out;
}

/**
 * 소품 id를 칸 slot에 놓는다. 이미 선반 다른 칸에 있으면 그 칸은 비우고(옮기기),
 * 놓을 칸에 다른 소품이 있으면 그 소품은 내려간다(고르기 칸으로).
 */
export function place(shelf: readonly (string | null)[], slot: number, id: string): Shelf {
  const out = norm(shelf);
  if (slot < 0 || slot >= SLOTS || !id) return out;
  for (let i = 0; i < SLOTS; i++) if (out[i] === id) out[i] = null;
  out[slot] = id;
  return out;
}

/** 두 칸을 맞바꾼다(빈칸과 바꾸면 옮기기) */
export function swap(shelf: readonly (string | null)[], a: number, b: number): Shelf {
  const out = norm(shelf);
  if (a < 0 || b < 0 || a >= SLOTS || b >= SLOTS || a === b) return out;
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

export function removeAt(shelf: readonly (string | null)[], slot: number): Shelf {
  const out = norm(shelf);
  if (slot >= 0 && slot < SLOTS) out[slot] = null;
  return out;
}

export const placedCount = (shelf: readonly (string | null)[]): number => shelf.filter((x) => typeof x === 'string').length;
export const canFinish = (shelf: readonly (string | null)[]): boolean => placedCount(shelf) >= MIN_TO_FINISH;

/** from부터 차례로 찾은 첫 빈칸(없으면 -1) */
export function firstEmpty(shelf: readonly (string | null)[], from = 0): number {
  for (let k = 0; k < SLOTS; k++) {
    const i = (from + k) % SLOTS;
    if (!shelf[i]) return i;
  }
  return -1;
}

export function serializeShelf(shelf: readonly (string | null)[], now: number): string {
  return JSON.stringify({ v: 1, s: norm(shelf), t: now });
}

/**
 * 저장한 선반을 읽는다. 깨졌거나 판이 다르면 빈 선반. 모르는 id·두 번 나온 id는 빈칸으로,
 * 칸 수가 모자라면 빈칸으로 채우고 넘치면 자른다.
 */
export function parseShelf(raw: string | null | undefined, validIds: Iterable<string>): Shelf {
  const out = emptyShelf();
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object' || (data as { v?: unknown }).v !== 1) return out;
  const list = (data as { s?: unknown }).s;
  if (!Array.isArray(list)) return out;
  const ok = new Set(validIds);
  const seen = new Set<string>();
  for (let i = 0; i < SLOTS && i < list.length; i++) {
    const x = list[i];
    if (typeof x !== 'string' || !ok.has(x) || seen.has(x)) continue;
    seen.add(x);
    out[i] = x;
  }
  return out;
}

/** 칸 번호 → (단, 칸) 사람 말(위 칸이 1단) */
export function slotName(slot: number): string {
  return `${Math.floor(slot / COLS) + 1}단 ${(slot % COLS) + 1}번째 칸`;
}

/** #rrggbb를 밝게(+) 또는 어둡게(-). amt는 -1~1 */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
