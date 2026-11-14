import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import {
  CHAR_COLUMNS,
  HISTORY_SHOWN,
  KEPT_STATUSES,
  SLOTS,
  SLOTS_MAX,
  arrangeSlots,
  benchCells,
  benchSize,
  countsOf,
  decideQuota,
  readCharacters,
  readQuota,
} from '@/lib/avatar/rules';
import { avatarConfig, avatarReady, meshyTrainingOptOut, modelProvider, modelsOn } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 내 사진 캐릭터: 작업대 칸과 이력(걷기 화면의 캐릭터 창이 연다). 명단 손님만, 내 줄만(보는 사람의 세션으로 읽어 RLS가 막는다).
//   GET /api/avatar/slots → {
//     enabled, max: 작업대 칸 수(0021: DB가 세션의 역할로 준다. 손님 3, 가족·관리자 9), cells: [그림 | null] × max,
//     history: [그림, …](지우지 않은 그림, 최근부터 HISTORY_SHOWN까지), more: 이력이 더 있는가,
//     counts: {history, keeps, models, tries, day}: 각각 {n, cap}(cap null = 제한 없음. tries는 돈이 든 3D 시도와 진행 중 요청,
//       day는 오늘 모두의 3D 요청),
//     quota, provider: 3D를 만드는 곳(meshy | trellis), models_on: 3D 요청을 받는가,
//     training_optout: Meshy에 학습 제외를 요청해 두었는가(동의 글·3D 확인 글이 따른다), extra: [] }
//   그림: {id, status: ready|queued|drawing, since, slot: 작업대 칸(아니면 null. 칸 수 밖의 번호도 null: 이력에 있는 것),
//         kept: ★ 보관, model: none|waiting|making|ready|failed,
//         blocked: 다시 해도 같은 실패(지금 3D를 만드는 곳 기준), reconsent: 만드는 곳이 바뀌어 돌려준 요청}
//   quota: { ok: true, left } 또는 { ok: false, reason, message }. left는 오늘 더 만들 수 있는 장수(제한 없으면 null).
//   이력이 다 찼을 때(history_full)도 left를 싣는다: 이력에서 지우면 오늘 몇 장 더 만들 수 있는지 머리줄이 알린다
// 0021 전의 DB: 예전처럼 칸 셋만(max 3, cells·extra), history·counts는 null(화면은 이력·★·3D를 숨긴다).
// 그 밖(명단 밖)은 있는지조차 알리지 않게 404.
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const hidden = () => Response.json({ status: 'not_found' }, { status: 404, headers: HEADERS });
const broken = () => Response.json({ status: 'error' }, { status: 503, headers: HEADERS });

export async function GET() {
  await connection();
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return hidden();
  if (!avatarReady()) return Response.json({ enabled: false }, { status: 503, headers: HEADERS });
  const supabase = await createClient();
  const kept = [...KEPT_STATUSES];
  const [histRes, benchRes, quotaRes] = await Promise.all([
    supabase.from('avatars').select(CHAR_COLUMNS).in('status', kept).order('created_at', { ascending: false }).limit(HISTORY_SHOWN + 1),
    // 작업대 줄은 따로 읽는다: 오래전에 만든 그림을 작업대로 꺼냈으면 최근 이력 창 밖에 있을 수 있다(가장 넓은 작업대의 두 배까지)
    supabase.from('avatars').select(CHAR_COLUMNS).in('status', kept).not('slot', 'is', null).limit(SLOTS_MAX * 2),
    supabase.rpc('avatar_quota'),
  ]);
  if (quotaRes.error) return broken();
  const read = readQuota(quotaRes.data);
  const quota = decideQuota(read, avatarConfig().totalCap);
  const counts = countsOf(read);
  const provider = modelProvider();
  // 작업대 칸 수는 DB가 세션의 역할로 준 값만 쓴다(0021 전의 DB는 SLOTS)
  const size = counts ? benchSize(read) : SLOTS;
  const base = { enabled: true, max: size, quota, provider, models_on: modelsOn(), training_optout: meshyTrainingOptOut() };
  if (counts) {
    if (histRes.error || benchRes.error) return broken();
    const history = readCharacters(histRes.data, provider, size);
    return Response.json({
      ...base,
      cells: benchCells(readCharacters(benchRes.data, provider, size), size),
      extra: [],
      history: history.slice(0, HISTORY_SHOWN),
      more: history.length > HISTORY_SHOWN,
      counts,
    }, { headers: HEADERS });
  }
  // 0021 전의 DB: 칸 번호(0019)로 놓는다. 그 전이면 칸 번호 없이 읽어 만든 차례대로
  const withSlot = await supabase.from('avatars').select('id, status, slot, created_at').in('status', kept).order('created_at').limit(20);
  let rows: unknown = withSlot.data;
  if (withSlot.error) {
    const plain = await supabase.from('avatars').select('id, status, created_at').in('status', kept).order('created_at').limit(20);
    if (plain.error) return broken();
    rows = plain.data;
  }
  return Response.json({ ...base, ...arrangeSlots(rows), history: null, more: false, counts: null }, { headers: HEADERS });
}
