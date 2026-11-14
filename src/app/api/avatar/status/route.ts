import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { MODEL_JOB_COLUMNS, countsOf, isUuid, jobView, modelJobView, readQuota } from '@/lib/avatar/rules';
import { WORKER_QUIET_MS, avatarReady, modelProvider } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 그리기 대기열 묻기(화면이 몇 초마다 부른다). 명단 손님만, 내 작업만.
//   GET /api/avatar/status                     → { enabled }  (만들기를 열지 알려 주는 탐지용)
//   GET /api/avatar/status?id=<id>             → { status, url?, message? }  (2D 그림)
//   GET /api/avatar/status?id=<id>&kind=model  → { status: none|waiting|making|ready|failed, since?, later?, message?, note? }
//     (그 그림의 3D 요청. 걷기 화면의 3D 진행이 2D와 같은 간격으로 묻는다. 못 만들었으면 까닭과 셈 안내를 함께 준다)
// 그 밖(명단 밖, 남의 것, 지운 것)은 있는지조차 알리지 않게 404.
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const hidden = () => Response.json({ status: 'not_found' }, { status: 404, headers: HEADERS });
const broken = () => Response.json({ status: 'error' }, { status: 503, headers: HEADERS });

export async function GET(request: Request) {
  await connection();
  const viewer = await getViewer();
  // 역할을 확인하지 못했으면 404(「지웠거나 명단 밖」) 대신 503: 화면이 그리는 중 기록을 버리지 않고 다시 묻게
  if (viewer.unsure) return broken();
  if (!canSee(viewer.role, 'guests')) return hidden();
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  if (id === null) return Response.json({ enabled: avatarReady() }, { headers: HEADERS });
  if (!isUuid(id)) return hidden();
  // 보는 사람의 세션으로 묻는다: DB 함수가 auth.uid()로 내 것만 돌려주고, 표를 읽을 때는 RLS가 내 줄만 준다
  const supabase = await createClient();
  if (params.get('kind') === 'model') {
    const { data: row, error } = await supabase.from('avatars').select(MODEL_JOB_COLUMNS).eq('id', id).maybeSingle();
    if (error) return broken();
    // 못 만들었을 때만 지금의 수를 함께 읽는다(셈 안내: 돌려줬는가, 더 해 볼 수 있는가). 못 읽으면 시도 수를 말하지 않는다
    const failed = (row as { model_status?: unknown } | null)?.model_status === 'failed';
    const quota = failed ? await supabase.rpc('avatar_quota') : null;
    const counts = quota && !quota.error ? countsOf(readQuota(quota.data)) : null;
    const view = modelJobView(row, modelProvider(), counts, Date.now());
    return view ? Response.json(view, { headers: HEADERS }) : hidden();
  }
  const { data, error } = await supabase.rpc('avatar_job_status', { p_id: id });
  if (error) return broken();
  const view = jobView(data, id, Date.now(), WORKER_QUIET_MS);
  if (!view) return hidden();
  return Response.json(view, { headers: HEADERS });
}
