import { connection } from 'next/server';
import { benchCharacter, readSlot } from '@/lib/avatar/manage';
import { badRequest, guestSession, jsonBody, replyJson } from '@/lib/avatar/route-gate';

// 이력의 그림을 작업대로 꺼내기(걷기 화면의 캐릭터 창).
//   POST /api/avatar/<id>/bench  {slot?: 1~9}(작업대 칸 수까지: 손님 3, 가족·관리자 9. DB가 세션의 역할로 본다)
//   slot이 없으면 빈 칸에(빈 칸이 없으면 409 bench_full: 화면이 바꿀 칸을 고르게 한다), 있으면 그 칸과 맞바꾼다
//   (맞바꾼 그림은 작업대에서 빠지고 이력에는 그대로 있다. 작업대 안에서 옮기면 두 칸이 맞바뀐다).
//   → 200 {ok: true, slot, moved} | 409 {ok: false, reason, message}(칸 수 밖이면 bad_slot) | 404 없는 그림
// 판정은 DB 함수 avatar_to_bench(0021)가 보는 사람의 세션으로 한다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const gate = await guestSession(request, id);
  if (gate instanceof Response) return gate;
  const body = await jsonBody(request);
  const slot = body.ok ? readSlot(body.value) : undefined;
  if (slot === undefined) return badRequest();
  return replyJson(await benchCharacter(gate.supabase, id, slot));
}
