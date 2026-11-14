import { connection } from 'next/server';
import { keepCharacter, readOn } from '@/lib/avatar/manage';
import { badRequest, guestSession, jsonBody, replyJson } from '@/lib/avatar/route-gate';

// ★ 보관 켜고 끄기(걷기 화면의 캐릭터 창).
//   POST /api/avatar/<id>/keep  {on: true|false}
//   → 200 {ok: true, kept} | 409 {ok: false, reason: keep_full|not_ready, message} | 404 없는 그림
// 다 그린 내 그림만, 역할의 보관 한도까지. 판정은 DB 함수 avatar_keep(0021)이 보는 사람의 세션으로 한다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const gate = await guestSession(request, id);
  if (gate instanceof Response) return gate;
  const body = await jsonBody(request);
  const on = body.ok ? readOn(body.value) : null;
  if (on === null) return badRequest();
  return replyJson(await keepCharacter(gate.supabase, id, on));
}
