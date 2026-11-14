// 걷기 화면의 대화·멘션·걸은 길이 함께 쓰는 규칙. 사이트 서버(app/api/chat, app/api/trail)와 화면이 같은 값을 쓴다.
// 숫자는 DB의 social_limits()(supabase/migrations/0017_chat_trails.sql)와 같다. 하나를 바꾸면 둘 다 바꾼다.
// 이 파일은 아무것도 불러오지 않는다(단위 시험이 바로 읽는다).

export const CHAT_BODY_MAX = 300;
export const CHAT_MENTIONS_MAX = 5;
/** 같은 사람이 이 간격(ms)에 하나, 1분에 CHAT_MINUTE_MAX개 */
export const CHAT_GAP_MS = 1500;
export const CHAT_MINUTE_MAX = 20;
/** 말풍선(함께 걷기 서버)에 실리는 글자 수 */
export const SAY_MAX = 80;

/** 걸은 길: 움직일 때 1초에 한 점, 30초마다 보낸다. 한 번에 120점까지 */
export const TRAIL_SAMPLE_MS = 1000;
export const TRAIL_FLUSH_MS = 30_000;
export const TRAIL_POINTS_MAX = 120;
/** 이만큼(m) 움직였으면 한 점 */
export const TRAIL_MIN_MOVE = 0.05;
/** 서버가 받는 때: 받은 때보다 이만큼 앞(ms)의 점까지, 묶음 하나의 길이 */
const TRAIL_PAST_MS = 19 * 60 * 1000;
const TRAIL_SPAN_MS = 15 * 60 * 1000;

/** 함께 걷기 서버의 사람 구분값(gameSubject, 22자) */
export const SUB_RE = /^[A-Za-z0-9_-]{22}$/;
/** 걷는 공간: 실제 집 또는 방 장면 */
export const SPACE_RE = /^(house:real|room:[a-z0-9-]{2,32})$/;

export type ChatVia = 'window' | 'say';
export type ChatMention = { sub: string; name: string };
/** 화면이 그리는 글 한 줄. at은 서버 시각 글자(다음 쪽을 물을 때 그대로 돌려준다), ms는 정렬·표시용 */
export type ChatMessage = {
  id: string;
  sub: string;
  name: string;
  /** 쓴 때의 겉모습(그리는 쪽이 cleanLook으로 고쳐 쓴다). 없으면 null */
  look: unknown;
  body: string;
  mentions: ChatMention[];
  space: string | null;
  via: ChatVia;
  at: string;
  ms: number;
  mine: boolean;
};

export type ChatReason =
  | 'empty' | 'too_long' | 'too_many_mentions' | 'bad_space' | 'bad_via' | 'too_fast' | 'too_many'
  | 'not_guest' | 'no_subject' | 'not_ready' | 'error';

/** 손님에게 보이는 까닭(대화창 아래 한 줄) */
export const CHAT_REASON_TEXT: Record<ChatReason, string> = {
  empty: '할 말을 적어 주세요.',
  too_long: `${CHAT_BODY_MAX}자까지 쓸 수 있어요.`,
  too_many_mentions: `멘션은 ${CHAT_MENTIONS_MAX}명까지 할 수 있어요.`,
  bad_space: '보내지 못했어요. 다시 해 주세요.',
  bad_via: '보내지 못했어요. 다시 해 주세요.',
  too_fast: '조금 천천히 보내 주세요.',
  too_many: `1분에 ${CHAT_MINUTE_MAX}개까지 보낼 수 있어요. 잠시 뒤에 다시 보내 주세요.`,
  not_guest: '초대 손님만 대화할 수 있어요.',
  no_subject: '대화 준비 중이에요. 잠시 뒤에 다시 해 주세요.',
  not_ready: '대화 준비 중이에요. 잠시 뒤에 다시 해 주세요.',
  error: '보내지 못했어요. 다시 해 주세요.',
};

export function chatReason(v: unknown): ChatReason {
  return typeof v === 'string' && v in CHAT_REASON_TEXT ? (v as ChatReason) : 'error';
}

/** 한 줄로: 줄바꿈·제어문자·겹친 공백을 한 칸으로, 앞뒤 공백을 뺀다(DB의 chat_post와 같은 고치기) */
export function cleanBody(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim();
}

/** 글자 수(코드 포인트, DB의 char_length와 같다. 이모지 하나는 한 글자) */
export const charCount = (s: string) => Array.from(s).length;

/** 앞에서 n글자(코드 포인트)까지, 잘렸으면 끝에 '…' */
export function clip(s: string, n: number): string {
  const a = Array.from(s);
  return a.length <= n ? s : `${a.slice(0, Math.max(0, n - 1)).join('').trimEnd()}…`;
}

export const cleanSpace = (v: unknown): string | null => (typeof v === 'string' && SPACE_RE.test(v) ? v : null);

export type ChatInput = { body: string; mentions: string[]; space: string | null; via: ChatVia };

/** POST /api/chat 본문을 읽는다. 멘션은 모양이 맞는 sub만, 같은 것은 한 번 */
export function readChatInput(raw: unknown): { ok: true; input: ChatInput } | { ok: false; reason: ChatReason } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const body = cleanBody(o.body);
  if (!body) return { ok: false, reason: 'empty' };
  if (charCount(body) > CHAT_BODY_MAX) return { ok: false, reason: 'too_long' };
  const list = Array.isArray(o.mentions) ? o.mentions : [];
  const mentions = [...new Set(list.filter((m): m is string => typeof m === 'string' && SUB_RE.test(m)))];
  if (mentions.length > CHAT_MENTIONS_MAX) return { ok: false, reason: 'too_many_mentions' };
  const via: ChatVia = o.via === 'say' ? 'say' : 'window';
  return { ok: true, input: { body, mentions, space: cleanSpace(o.space), via } };
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/**
 * 서버(API·실시간 채널)에서 온 글 한 줄을 믿지 않고 읽는다. 모양이 틀리면 null.
 * mine이 없으면(실시간 채널) 내 sub와 견준다.
 */
export function readChatMessage(raw: unknown, mySub?: string | null): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, 64);
  const sub = typeof o.sub === 'string' && SUB_RE.test(o.sub) ? o.sub : null;
  const body = str(o.body, 2000);
  const at = str(o.at, 64);
  const ms = typeof o.ms === 'number' && Number.isFinite(o.ms) ? o.ms : at ? Date.parse(at) : NaN;
  if (!id || !sub || !body || !at || !Number.isFinite(ms)) return null;
  const mentions = (Array.isArray(o.mentions) ? o.mentions : [])
    .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : {}))
    .filter((m) => typeof m.sub === 'string' && SUB_RE.test(m.sub) && typeof m.name === 'string')
    .slice(0, CHAT_MENTIONS_MAX)
    .map((m) => ({ sub: m.sub as string, name: String(m.name).slice(0, 40) }));
  return {
    id,
    sub,
    name: str(o.name, 40) ?? '손님',
    look: o.look && typeof o.look === 'object' ? o.look : null,
    body,
    mentions,
    space: cleanSpace(o.space),
    via: o.via === 'say' ? 'say' : 'window',
    at,
    ms,
    mine: typeof o.mine === 'boolean' ? o.mine : Boolean(mySub && sub === mySub),
  };
}

/** 글 목록 차례: 오래된 것부터(같은 때면 id) */
export function byTime(a: Pick<ChatMessage, 'ms' | 'id'>, b: Pick<ChatMessage, 'ms' | 'id'>): number {
  return a.ms - b.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 가진 글에 새 글들을 합친다(같은 id는 새것으로). 오래된 것부터, 많으면 뒤에서 max개 */
export function mergeMessages(have: readonly ChatMessage[], add: readonly ChatMessage[], max = 500): ChatMessage[] {
  const by = new Map(have.map((m) => [m.id, m]));
  for (const m of add) by.set(m.id, m);
  const all = [...by.values()].sort(byTime);
  return all.length > max ? all.slice(all.length - max) : all;
}

// ───────────────────────────── 걸은 길
/** [ms, x, y, z, yaw] */
export type TrailPoint = [number, number, number, number, number];

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
function wrapYaw(a: number): number {
  const tau = Math.PI * 2;
  let v = a % tau;
  if (v > Math.PI) v -= tau;
  if (v < -Math.PI) v += tau;
  return v;
}

/** 걷기 상태 → 보낼 점 하나(cm, 밀리라디안까지) */
export function trailPoint(t: number, s: { x: number; y: number; z: number; yaw: number }): TrailPoint {
  return [Math.round(t), round(s.x, 2), round(s.y, 2), round(s.z, 2), round(wrapYaw(s.yaw), 3)];
}

/** 앞 점에서 이만큼 움직였으면 새 점을 찍는다(높이까지 보아 계단도 센다) */
export function movedEnough(prev: TrailPoint | null, s: { x: number; y: number; z: number }, min = TRAIL_MIN_MOVE): boolean {
  if (!prev) return true;
  return Math.hypot(s.x - prev[1], s.y - prev[2], s.z - prev[3]) >= min;
}

/**
 * POST /api/trail 본문 {space, points, sent?}을 고친다. sent(보낸 기기의 Date.now())가 있으면 기기 시계의 어긋남을
 * 받은 때(now)에 맞춘다. 모양이 틀린 점, 너무 오래된 점, 앞날의 점은 버리고, 차례대로 두고, 묶음은 15분·120점 안으로.
 */
export function readTrailInput(raw: unknown, now: number): { ok: true; space: string; points: TrailPoint[] } | { ok: false; reason: 'bad_space' | 'empty' } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const space = cleanSpace(o.space);
  if (!space) return { ok: false, reason: 'bad_space' };
  const sent = typeof o.sent === 'number' && Number.isFinite(o.sent) && o.sent > 0 ? o.sent : null;
  const skew = sent === null ? 0 : now - sent;
  const list = Array.isArray(o.points) ? o.points.slice(-TRAIL_POINTS_MAX * 2) : [];
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  let points: TrailPoint[] = [];
  for (const p of list) {
    if (!Array.isArray(p) || p.length < 5 || !p.slice(0, 5).every(fin)) continue;
    const [t, x, y, z, yaw] = p as number[];
    const at = Math.round(t + skew);
    if (at < now - TRAIL_PAST_MS || at > now + 30_000) continue;
    if (Math.abs(x) > 1000 || Math.abs(y) > 100 || Math.abs(z) > 1000) continue;
    points.push([at, round(x, 2), round(y, 2), round(z, 2), round(wrapYaw(yaw), 3)]);
  }
  points.sort((a, b) => a[0] - b[0]);
  if (points.length > TRAIL_POINTS_MAX) points = points.slice(points.length - TRAIL_POINTS_MAX);
  if (points.length > 0) {
    const last = points[points.length - 1][0];
    points = points.filter((p) => last - p[0] <= TRAIL_SPAN_MS);
  }
  if (points.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, space, points };
}
