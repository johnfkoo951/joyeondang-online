import 'server-only';
import { canSee } from '@/lib/access';
import { sameOrigin, type ManageFail } from '@/lib/avatar/manage';
import { MESSAGES, isUuid } from '@/lib/avatar/rules';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 내 캐릭터를 고치는 요청(POST /api/avatar/<id>/keep·bench·model) 앞의 같은 확인. 걷기 화면의 캐릭터 창이 부른다.
// 화면은 404를 「그 그림이 없다」로 읽으므로, 로그인 끊김·권한 없음·역할 확인 실패는 404가 아닌 답을 준다
// (DELETE /api/avatar/<id>와 같은 순서).

export const MANAGE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export function replyJson(r: { status: number; body: unknown }): Response {
  return Response.json(r.body, { status: r.status, headers: MANAGE_HEADERS });
}

function refuse(status: number, reason: string, message: string): Response {
  const body: ManageFail = { ok: false, reason, message };
  return replyJson({ status, body });
}

type Session = { supabase: Awaited<ReturnType<typeof createClient>> };

/**
 * 모양이 틀린 id·다른 사이트의 요청 → 404, 역할 확인 실패 → 503, 로그인 끊김 → 401, 명단 밖 → 403.
 * 통과하면 보는 사람의 세션으로 만든 연결을 준다(그 뒤의 판정은 DB 함수가 한다)
 */
export async function guestSession(request: Request, id: string): Promise<Session | Response> {
  if (!isUuid(id) || !sameOrigin(request)) return refuse(404, 'not_found', MESSAGES.picGone);
  const viewer = await getViewer();
  if (viewer.unsure) return refuse(503, 'error', MESSAGES.tryLater);
  if (!viewer.signedIn) return refuse(401, 'signed_out', '로그인이 끊겼어요. 다시 들어온 뒤 해 주세요.');
  if (!canSee(viewer.role, 'guests')) return refuse(403, 'not_guest', MESSAGES.notGuest);
  return { supabase: await createClient() };
}

/** JSON 본문. 비었으면 value가 undefined, 읽지 못했거나 JSON이 아니면 ok: false */
export async function jsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await request.text().catch(() => null);
  if (text === null) return { ok: false };
  if (!text.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

export const badRequest = () => refuse(400, 'bad_request', MESSAGES.tryLater);
