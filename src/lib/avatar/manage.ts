import { noFunction } from '@/lib/avatar/assets';
import type { ModelProvider } from '@/lib/avatar/consent';
import { MESSAGES, SLOTS_MAX, countsOf, modelRoom, readQuota } from '@/lib/avatar/rules';

// 사진 캐릭터의 ★ 보관·작업대로 꺼내기·3D 요청: DB 함수를 부르고, 그 답을 화면에 줄 모양(상태 코드와 글)으로 바꾼다.
// 걷기 화면의 캐릭터 창(POST /api/avatar/<id>/keep·bench·model)과 「내 캐릭터」 화면(서버 액션)이 함께 쓴다.
// 권한과 한도는 DB 함수가 세션(auth.uid())과 명단 역할로 판정한다(supabase/migrations/0021_avatar_history_keep_3d.sql).
// 그래서 보는 사람의 세션으로 만든 연결만 받는다(비밀 키를 쓰지 않는다. 남의 그림은 DB가 not_found로 막는다).

export type ManageFn = 'avatar_keep' | 'avatar_to_bench' | 'avatar_model_request' | 'avatar_quota';
/** 보는 사람의 세션으로 만든 연결에서 쓰는 만큼만 받는다(시험에서 가짜를 넣을 수 있게) */
export type ManageClient = {
  rpc: (fn: ManageFn, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};
export type ManageFail = { ok: false; reason: string; message: string };
export type ManageReply =
  | { status: number; body: { ok: true; kept: boolean } }
  | { status: number; body: { ok: true; slot: number | null; moved: string | null } }
  | { status: number; body: { ok: true; already: boolean } }
  | { status: number; body: ManageFail };

/** DB가 준 거절 까닭 → 안내 글. cap: DB가 함께 준 한도(보관·3D) */
export function failMessage(reason: string, cap?: number | null): string {
  switch (reason) {
    case 'keep_full':
      return MESSAGES.keepFull(cap);
    case 'model_full':
      return MESSAGES.modelFull(cap);
    case 'model_blocked':
      return MESSAGES.modelBlocked;
    case 'model_tries_full':
      return MESSAGES.modelTriesFull(cap);
    case 'model_day_full':
      return MESSAGES.modelDayFull;
    case 'not_kept':
      return MESSAGES.notKept;
    case 'not_ready':
      return MESSAGES.picNotReady;
    case 'bench_full':
      return MESSAGES.benchFull;
    case 'bad_slot':
      return MESSAGES.benchChanged;
    case 'not_found':
      return MESSAGES.picGone;
    case 'not_guest':
      return MESSAGES.notGuest;
    case 'unavailable':
      return MESSAGES.featureSoon;
    default:
      return MESSAGES.tryLater;
  }
}

/** 거절 까닭 → 상태 코드. 명단 밖 403, 없는 그림 404, DB 오류·함수 없음 503, 그 밖(한도·조건) 409 */
function failStatus(reason: string): number {
  if (reason === 'not_guest') return 403;
  if (reason === 'not_found') return 404;
  if (reason === 'error' || reason === 'unavailable') return 503;
  return 409;
}

export function fail(reason: string, cap?: number | null): { status: number; body: ManageFail } {
  return { status: failStatus(reason), body: { ok: false, reason, message: failMessage(reason, cap) } };
}

/**
 * DB가 칸 번호를 받지 않았다(avatar_to_bench의 bad_slot: 칸 번호가 지금 역할의 작업대 칸 수 밖이다).
 * 화면이 보인 칸 수가 낡았을 때(그사이 역할이 바뀌었다) 생긴다
 */
function badSlot(error: unknown): boolean {
  const e = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return e.code === '22023' && e.message === 'bad_slot';
}

/** DB 함수를 부르고 jsonb 답을 받는다. 함수가 없으면(0021 전) unavailable, 칸 번호를 받지 않으면 bad_slot, 그 밖의 오류는 error */
async function call(client: ManageClient, fn: ManageFn, args: Record<string, unknown>):
  Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; reply: { status: number; body: ManageFail } }> {
  let res: { data: unknown; error: unknown };
  try {
    res = await client.rpc(fn, args);
  } catch {
    return { ok: false, reply: fail('error') };
  }
  if (res.error) return { ok: false, reply: fail(noFunction(res.error) ? 'unavailable' : badSlot(res.error) ? 'bad_slot' : 'error') };
  const d = res.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reply: fail('error') };
  const o = d as Record<string, unknown>;
  if (o.ok === true) return { ok: true, data: o };
  const reason = typeof o.reason === 'string' && /^[a-z_]{1,32}$/.test(o.reason) ? o.reason : 'error';
  const cap = typeof o.cap === 'number' && Number.isFinite(o.cap) ? o.cap : null;
  return { ok: false, reply: fail(reason, cap) };
}

const uuidOrNull = (v: unknown): string | null =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;

/** ★ 보관 켜고 끄기 → 200 {ok, kept} */
export async function keepCharacter(client: ManageClient, id: string, on: boolean): Promise<ManageReply> {
  const r = await call(client, 'avatar_keep', { p_id: id, p_on: on });
  if (!r.ok) return r.reply;
  return { status: 200, body: { ok: true, kept: r.data.kept === true } };
}

/** 작업대로 꺼내기(slot null: 빈 칸, 1~칸 수: 그 칸과 맞바꾸기) → 200 {ok, slot, moved}. 칸 수 밖이면 409 bad_slot */
export async function benchCharacter(client: ManageClient, id: string, slot: number | null): Promise<ManageReply> {
  const r = await call(client, 'avatar_to_bench', { p_id: id, p_slot: slot });
  if (!r.ok) return r.reply;
  const at = typeof r.data.slot === 'number' && Number.isInteger(r.data.slot) ? r.data.slot : null;
  return { status: 200, body: { ok: true, slot: at, moved: uuidOrNull(r.data.moved) } };
}

/**
 * 3D 요청 → 202 {ok, already: false}(새로 줄에 섰다) 또는 200 {ok, already: true}(이미 있거나 만드는 중).
 * via: 누르기 전에 확인 글이 알린 3D 만드는 곳(서버의 modelProvider()). DB가 요청 줄에 적고, 바깥 3D 서비스 일꾼은
 * 그곳으로 요청한 줄만 보낸다(다르면 보내지 않고 돌려준다: 화면이 새 확인 글로 다시 묻는다)
 * keep: 2D를 다 그린 뒤의 확인 카드(「이걸로 3D 만들기」)에서 왔다. 3D는 ★ 그림으로만 만드므로(DB의 not_kept),
 *   ★가 없어 막히면 3D가 남았는지 먼저 보고(장수 응답), 남았으면 ★로 보관한 뒤 한 번 더 요청한다. 보관함이 차 있으면
 *   keep_full(화면이 보관함에서 ★ 하나를 빼라고 안내한다). 한 번 더 요청해도 막히면 방금 단 ★를 다시 뗀다
 *   (막힌 요청이 보관함 자리를 말없이 차지하지 않게). 판정은 모두 DB 함수가 보는 사람의 세션으로 한다
 *   (avatar_model_request의 잠금과 셈이 동시 요청·여러 번 누르기를 막는다).
 */
export async function requestModel(client: ManageClient, id: string, via: ModelProvider, opts: { keep?: boolean } = {}): Promise<ManageReply> {
  const args = { p_id: id, p_via: via };
  const r = await call(client, 'avatar_model_request', args);
  if (r.ok) return accepted(r.data);
  if (opts.keep !== true || r.reply.body.reason !== 'not_kept') return r.reply;
  const short = await modelShort(client);
  if (short) return short;
  const kept = await call(client, 'avatar_keep', { p_id: id, p_on: true });
  if (!kept.ok) return kept.reply;
  const again = await call(client, 'avatar_model_request', args);
  if (again.ok) return accepted(again.data);
  await call(client, 'avatar_keep', { p_id: id, p_on: false });
  return again.reply;
}

function accepted(data: Record<string, unknown>): ManageReply {
  const already = data.already === true;
  return { status: already ? 200 : 202, body: { ok: true, already } };
}

/**
 * ★를 달기 전에: 3D가 남지 않았으면 그 까닭(DB의 avatar_model_request와 같은 이름과 한도). 남았거나 셈을 읽지 못했으면 null
 * (읽지 못해도 그대로 간다: 한 번 더 요청할 때 DB가 판정한다)
 */
async function modelShort(client: ManageClient): Promise<{ status: number; body: ManageFail } | null> {
  let res: { data: unknown; error: unknown };
  try {
    res = await client.rpc('avatar_quota', {});
  } catch {
    return null;
  }
  const counts = res.error ? null : countsOf(readQuota(res.data));
  if (!counts) return null;
  switch (modelRoom(counts).why) {
    case 'used':
      return fail('model_full', counts.models.cap);
    case 'tried':
      return fail('model_tries_full', counts.tries?.cap ?? null);
    case 'today':
      return fail('model_day_full');
    default:
      return null;
  }
}

// ───────── 요청 읽기(라우트)

/**
 * 3D 요청의 본문: 비었거나 {}면 false(★ 보관함의 「3D 만들기」), {keep: true}면 true(확인 카드: ★가 없으면 달고 요청),
 * {keep: false}도 false. 그 밖의 모양은 undefined(잘못된 요청)
 */
export function readKeep(body: unknown): boolean | undefined {
  if (body === undefined || body === null) return false;
  if (typeof body !== 'object' || Array.isArray(body)) return undefined;
  const keep = (body as Record<string, unknown>).keep;
  if (keep === undefined) return false;
  return typeof keep === 'boolean' ? keep : undefined;
}

/** 보관 켜고 끄기: 본문 {on: true|false}만 받는다. 그 밖은 null(잘못된 요청) */
export function readOn(body: unknown): boolean | null {
  const on = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).on : undefined;
  return typeof on === 'boolean' ? on : null;
}

/**
 * 칸 번호: 본문 {slot: 1~SLOTS_MAX}이면 그 수, slot이 없거나 null이면 null(빈 칸), 그 밖은 undefined(잘못된 요청).
 * 이 사람의 작업대 칸 수(손님 3)까지인지는 DB가 세션의 역할로 본다(넘으면 bad_slot)
 */
export function readSlot(body: unknown): number | null | undefined {
  if (body === null || body === undefined) return null;
  if (typeof body !== 'object' || Array.isArray(body)) return undefined;
  const slot = (body as Record<string, unknown>).slot;
  if (slot === undefined || slot === null) return null;
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= SLOTS_MAX ? slot : undefined;
}

/** 다른 사이트에서 몰래 보내는 요청을 막는다(쿠키가 붙어 와도). Origin이 없으면(같은 사이트의 옛 브라우저 등) 받는다 */
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
