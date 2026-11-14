import { connection } from 'next/server';
import { noFunction } from '@/lib/avatar/assets';
import { OP_FN, opFail, opReply, readOp } from '@/lib/avatar/admin-rules';
import { adminJson, adminSession, adminStoreReady, drainAvatarTrash } from '@/lib/avatar/admin-server';
import { jsonBody } from '@/lib/avatar/route-gate';
import { isUuid } from '@/lib/avatar/rules';
import { modelProvider, modelsOn } from '@/lib/avatar/server';

// 캐릭터 관리 콘솔의 조작 넷(집주인만, 0024).
//   POST /api/admin/characters/<id>  {op: 'remake_model' | 'forget_model' | 'redraw' | 'forget', told?: boolean}
//   → 200 {ok: true, message[, consent]} | 409 {ok: false, reason, message} | 404 없는 캐릭터(또는 집주인 아님) | 503 쉬는 중·준비 안 됨
// 판정(집주인인지, 다 그린 그림인지, Meshy로 보낼 동의 근거, 주인의 셈)은 DB 함수가 집주인 세션으로 한다.
//   remake_model  3D 다시 만들기. 보낼 곳은 사이트가 고른다(AVATAR_MODEL_PROVIDER, 동의 글과 같은 곳). told: 집주인이 「본인에게
//                 Meshy로 보내도 된다고 들었어요」를 확인했다(DB가 필요한 때만 본다. 근거는 기록에 남는다). AVATAR_MODELS=0이면 쉰다
//   forget_model  3D 지우기 / redraw 그림 다시 그리기 / forget 캐릭터 지우기
// 파일을 지우는 셋은 서버 비밀 키가 있을 때만 한다(DB의 줄만 지우고 파일을 저장소에 남기지 않게). DB가 같은 트랜잭션에서
// 버릴 경로를 목록(avatar_trash)에 올리고, 여기서 비밀 키로 저장소에서 지운다(못 지운 것은 콘솔을 열 때 마저).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return adminJson(opFail('not_found').body, 404);
  const gate = await adminSession(request);
  if (gate instanceof Response) return gate;
  const body = await jsonBody(request);
  const op = body.ok ? readOp(body.value) : null;
  if (!op) return adminJson(opFail('bad_request').body, 400);
  if (op.op === 'remake_model' && !modelsOn()) return adminJson(opFail('model_off').body, 503);
  if (op.op !== 'remake_model' && !adminStoreReady()) return adminJson(opFail('store_off').body, 503);
  const args = op.op === 'remake_model' ? { p_id: id, p_via: modelProvider(), p_told: op.told } : { p_id: id };
  const { data, error } = await gate.supabase.rpc(OP_FN[op.op], args);
  if (error) {
    const r = opFail(noFunction(error) ? 'db_old' : 'error');
    return adminJson(r.body, r.status);
  }
  const reply = opReply(op.op, data);
  if (reply.body.ok && op.op !== 'remake_model') await drainAvatarTrash();
  return adminJson(reply.body, reply.status);
}
