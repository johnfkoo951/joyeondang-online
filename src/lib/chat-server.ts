import 'server-only';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';
import type { ChatMessage } from '@/lib/social';

// 걷기 화면 대화의 서버 쪽. 사람 구분값(sub = gameSubject)은 서명 키로만 계산되어 DB가 스스로 알 수 없다.
// 그래서 이 서버가 비밀 키(SUPABASE_SECRET_KEY)로 chat_register()를 불러 「이 로그인 id의 sub」를 한 번 적는다.
// 글 쓰기·읽기·지우기는 보는 사람의 세션으로 한다(DB 함수가 명단 손님인지 다시 본다).

export const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
export const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

/** 함께 걷기 출입증과 같은 서명 키(16자 이상). 없으면 대화를 열지 않는다 */
export function chatSecret(): string | null {
  const s = process.env.GAME_TOKEN_SECRET ?? '';
  return s.length >= 16 ? s : null;
}

/** 비밀 키 연결(sub 적기에만 쓴다). 없으면 null */
function chatAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 이 서버 인스턴스가 이미 적은 사람(같은 값을 매번 다시 적지 않게). 커지면 비운다 */
const registered = new Map<string, string>();

/** 로그인 id의 sub를 DB에 적는다(이미 같은 값이면 건너뛴다). 못 적었으면 false */
export async function ensureSubject(userId: string, sub: string, force = false): Promise<boolean> {
  if (!force && registered.get(userId) === sub) return true;
  const admin = chatAdmin();
  if (!admin) return false;
  try {
    const { data, error } = await admin.rpc('chat_register', { p_user: userId, p_sub: sub });
    if (error || data !== true) return false;
    if (registered.size > 5000) registered.clear();
    registered.set(userId, sub);
    return true;
  } catch {
    return false;
  }
}

/** 다른 사이트에서 몰래 보내는 요청을 막는다(쿠키가 붙어 와도). sendBeacon도 Origin을 붙인다 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 본문을 글자로 읽는다(크기를 넘으면 null). sendBeacon은 text/plain으로 오므로 내용 형식은 보지 않는다 */
export async function readBody(request: Request, max: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > max) return null;
  try {
    const text = await request.text();
    if (text.length > max) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** 시각 글자(커서). 서버가 준 것을 그대로 돌려받는다 */
export function cursorTime(v: string | null): string | null {
  return v && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null;
}

/** chat_list() 한 줄 → 화면으로 보내는 글 */
export function wireFromRow(row: Record<string, unknown>): ChatMessage | null {
  const at = typeof row.created_at === 'string' ? row.created_at : null;
  const ms = at ? Date.parse(at) : NaN;
  if (typeof row.id !== 'string' || typeof row.sub !== 'string' || typeof row.body !== 'string' || !at || !Number.isFinite(ms)) return null;
  return {
    id: row.id,
    sub: row.sub,
    name: typeof row.name === 'string' ? row.name : '손님',
    look: row.look && typeof row.look === 'object' ? row.look : null,
    body: row.body,
    mentions: Array.isArray(row.mentions) ? (row.mentions as ChatMessage['mentions']) : [],
    space: typeof row.space === 'string' ? row.space : null,
    via: row.via === 'say' ? 'say' : 'window',
    at,
    ms,
    mine: row.mine === true,
  };
}
