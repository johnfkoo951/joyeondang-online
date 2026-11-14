import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { hiddenAsset, missingAsset, noFunction } from '@/lib/avatar/assets';
import { readKeep, requestModel } from '@/lib/avatar/manage';
import { MODEL_TYPE } from '@/lib/avatar/model';
import { versionedModel } from '@/lib/avatar/model-version';
import { previewResponse, readPreviewAvatar } from '@/lib/avatar/preview-source';
import { badRequest, guestSession, jsonBody, replyJson } from '@/lib/avatar/route-gate';
import { MESSAGES, isUuid } from '@/lib/avatar/rules';
import { AVATAR_BUCKET, modelProvider, modelsOn } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 캐릭터의 3D 모형(GLB 한 파일). 걷기 엔진이 모형 → 방향 그림 묶음 → 그림 한 장 차례로 쓴다.
//   GET /api/avatar/<id>/model[?v=<판>]
// 접근 규칙은 그림 한 장(/api/avatar/<id>)·묶음(/views)과 같다: 명단 손님에게만, 그림도 모형도 ready일 때만
// (0024부터는 관리자가 다시 만드는 동안의 이전 모형도).
// 그 밖에는(아직 안 만들었을 때도) 본문 없는 404이고, 머리 X-Avatar-Asset으로 기다리면 생기는지(pending)
// 만들 계획이 없는지(none)를 알린다(src/lib/avatar/assets.ts). 걷기 엔진은 none이면 그 화면에서 다시 묻지 않는다.
// 판 번호(0024): 판이 붙은 주소는 오래 캐시하고, 판 없이 물으면 지금 판의 주소로 보낸다(302). 같은 자리에 덮어쓴 새 모형이
// 옛 캐시로 보이지 않게(src/lib/avatar/model-version.ts). 판 함수가 없는 옛 DB면 아래 옛 길(판 없이 한 시간).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return hiddenAsset('none');
  // 이 컴퓨터 미리보기에서만: 미리보기 폴더에 둔 모형을 로그인 없이 준다(운영에서는 늘 건너뛴다)
  const local = await readPreviewAvatar(id, 'model');
  if (local) return previewResponse(local);
  const viewer = await getViewer();
  // 명단 밖으로 확인됐을 때만 none. 역할을 확인하지 못했으면(몰릴 때 잠깐) 머리 없이: 걷기 엔진이 나중에 다시 묻는다
  if (!canSee(viewer.role, 'guests')) return hiddenAsset(viewer.unsure ? null : 'none');
  // 경로 확인과 파일 읽기 모두 보는 사람의 세션으로(DB 함수와 저장소 정책이 한 번씩 더 막는다).
  // 0016을 올리기 전에는 함수가 없다: 모형을 만드는 기능이 아직 없으므로 none
  const supabase = await createClient();
  // 0024부터: 판 번호가 붙은 주소로(다시 만드는 동안은 이전 모형). 판 함수가 없는 옛 DB면 null이라 아래 옛 길로
  const versioned = await versionedModel(supabase, request, id, AVATAR_BUCKET);
  if (versioned) return versioned;
  const { data: path, error } = await supabase.rpc('avatar_model_path', { p_id: id });
  if (error) return hiddenAsset(noFunction(error) ? 'none' : null);
  if (typeof path !== 'string' || !path) return missingAsset(supabase, id, 'model');
  const { data: file, error: readError } = await supabase.storage.from(AVATAR_BUCKET).download(path);
  if (readError || !file) return hiddenAsset(null);
  return new Response(file.stream(), {
    headers: {
      'Content-Type': MODEL_TYPE,
      'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Content-Disposition': 'inline',
    },
  });
}

// 3D 만들기 요청(걷기 화면의 캐릭터 창과 2D를 다 그린 뒤의 확인 카드. 「내 캐릭터」 화면은 서버 액션으로 같은 일을 한다).
//   POST /api/avatar/<id>/model  [{keep: true}]
//   → 202 {ok: true, already: false}(줄에 섰다) | 200 {ok: true, already: true}(이미 있거나 만드는 중)
//   | 409 {ok: false, reason: not_kept|not_ready|model_full|model_blocked|model_tries_full|model_day_full|keep_full, message}
//   | 404 없는 그림 | 503 쉬는 중(AVATAR_MODELS=0) | 400 본문 모양이 틀림
// ★로 보관한 다 그린 내 그림 하나만, 역할의 3D 한도까지(실패한 요청은 세지 않되 돈이 든 시도는 센다). 판정은 DB 함수
// avatar_model_request(0021)가 보는 사람의 세션으로 한다. 일꾼은 요청한 줄만 요청한 차례로 잡는다.
// {keep: true}(확인 카드): ★가 없으면 3D가 남았는지 본 뒤 ★로 보관하고 요청한다. 요청이 막히면 단 ★를 다시 뗀다(manage.ts).
// 3D 서비스로 무엇을 보내는지는 화면이 누르기 전에 묻는다(src/lib/avatar/consent.ts의 modelConfirm). 그 글이 알린 곳
// (modelProvider())을 요청 줄에 함께 적는다: 바깥 3D 서비스 일꾼은 그곳으로 요청한 줄만 보낸다.
// AVATAR_MODELS=0은 이 라우트와 단추만 쉰다(DB 함수는 로그인한 손님이 직접 부를 수 있다). 돈을 실제로 멈추는 것은 일꾼의 AVATAR_MODELS=0.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const gate = await guestSession(request, id);
  if (gate instanceof Response) return gate;
  if (!modelsOn()) return replyJson({ status: 503, body: { ok: false, reason: 'model_off', message: MESSAGES.modelOff } });
  const body = await jsonBody(request);
  const keep = body.ok ? readKeep(body.value) : undefined;
  if (keep === undefined) return badRequest();
  return replyJson(await requestModel(gate.supabase, id, modelProvider(), { keep }));
}
