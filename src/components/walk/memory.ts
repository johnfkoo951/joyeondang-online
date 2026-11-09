// 걷기 화면이 이 기기에 남기는 기억(자리, 들어가 있던 방, 받은 도장)과 작은 글자 도우미.
// 순수 함수만 둔다. 저장소는 인자로 받아 시험에서 가짜 저장소로 부른다(이 파일은 타입만 가져온다).
import type { Level } from '@/walk/types';

export const POS_KEY = (kind: string) => `jy.walk.pos.v1.${kind}`;
export const ROOM_KEY = 'jy.walk.room.v1';
export const STAMPED_KEY = 'jy.walk.stamped.v1'; // gitleaks:allow (localStorage 키 이름, 비밀값 아님)
/** 이만큼 지난 기억은 버린다 */
export const KEEP_MS = 12 * 60 * 60 * 1000;

export type SavedPos = { x: number; z: number; y: number; level: Level; yaw: number; view: 'first' | 'third'; t: number };
export type SavedRoom = { slug: string; t: number };
export type StoreLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const SLUG = /^[a-z0-9-]{2,32}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 시계가 조금 어긋나도(1분) 받아 준다 */
const fresh = (t: unknown, now: number): t is number => num(t) && t <= now + 60_000 && now - t <= KEEP_MS;

function parse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parsePos(raw: string | null, now: number): SavedPos | null {
  const v = parse(raw);
  if (!v || !fresh(v.t, now)) return null;
  const { x, z, y, yaw, level } = v;
  if (!num(x) || !num(z) || !num(yaw) || Math.abs(x) > 5000 || Math.abs(z) > 5000) return null;
  if (level !== 1 && level !== 2) return null;
  return { x, z, y: num(y) ? y : 0, level, yaw, view: v.view === 'third' ? 'third' : 'first', t: v.t };
}

export function parseRoom(raw: string | null, now: number): SavedRoom | null {
  const v = parse(raw);
  if (!v || !fresh(v.t, now) || typeof v.slug !== 'string' || !SLUG.test(v.slug)) return null;
  return { slug: v.slug, t: v.t };
}

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const readPos = (s: StoreLike, kind: string, now = Date.now()) => safe(() => parsePos(s.getItem(POS_KEY(kind)), now), null);
export function writePos(s: StoreLike, kind: string, p: Omit<SavedPos, 't'>, now = Date.now()) {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const v: SavedPos = { x: r(p.x), z: r(p.z), y: r(p.y), level: p.level, yaw: r(p.yaw), view: p.view, t: now };
  safe(() => s.setItem(POS_KEY(kind), JSON.stringify(v)), undefined);
}

export const readRoom = (s: StoreLike, now = Date.now()) => safe(() => parseRoom(s.getItem(ROOM_KEY), now), null);
export const writeRoom = (s: StoreLike, slug: string, now = Date.now()) =>
  safe(() => s.setItem(ROOM_KEY, JSON.stringify({ slug, t: now })), undefined);
export const clearRoom = (s: StoreLike) => safe(() => s.removeItem(ROOM_KEY), undefined);

/** 주소의 ?room=<slug> */
export function roomFromSearch(search: string): string | null {
  const v = safe(() => new URLSearchParams(search).get('room'), null);
  return v && SLUG.test(v) ? v : null;
}

/** 방이면 ?room=<slug>, 집이면 room만 뺀 주소(다른 query와 #은 그대로) */
export function hrefWithRoom(href: string, slug: string | null): string {
  const u = new URL(href);
  if (slug) u.searchParams.set('room', slug);
  else u.searchParams.delete('room');
  return `${u.pathname}${u.search}${u.hash}`;
}

/** 처음 열 방: 주소가 먼저, 없으면 이 기기에 남은 방. 열 수 없는 방이면 null(집) */
export function startRoom(query: string | null, saved: SavedRoom | null, canEnter: (slug: string) => boolean): string | null {
  if (query) return canEnter(query) ? query : null;
  return saved && canEnter(saved.slug) ? saved.slug : null;
}

/** 이 방 도장을 이 기기에서 처음 받았으면 true(기억해 둔다) */
export function markStamped(s: StoreLike, slug: string): boolean {
  return safe(() => {
    const v: unknown = JSON.parse(s.getItem(STAMPED_KEY) ?? '[]');
    const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    if (list.includes(slug)) return false;
    s.setItem(STAMPED_KEY, JSON.stringify([...list, slug].slice(-50)));
    return true;
  }, false);
}

/** 받침에 맞춘 「로/으로」: 받침이 없거나 ㄹ이면 로 */
export function withRo(word: string): string {
  // 「2층으로」처럼 이미 '으로'로 끝난 이름에는 덧붙이지 않는다
  if (/으로$/.test(word.trim())) return word;
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const jong = (c - 0xac00) % 28;
    return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`;
  }
  return `${word}로`;
}

/** 걸린 시간: 「42초」, 「1분 5초」 */
export function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

/** 대략 걸리는 시간: 「1분 안팎」, 「30초 안팎」 */
export function aboutSeconds(sec: number): string {
  if (sec < 60) return `${Math.max(10, Math.round(sec / 10) * 10)}초 안팎`;
  return `${Math.round(sec / 60)}분 안팎`;
}
