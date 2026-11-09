import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { isUuid, jobView } from '@/lib/avatar/rules';
import { WORKER_QUIET_MS, avatarReady } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 그리기 대기열 묻기(화면이 몇 초마다 부른다). 명단 손님만, 내 작업만.
//   GET /api/avatar/status          → { enabled }  (만들기를 열지 알려 주는 탐지용)
//   GET /api/avatar/status?id=<id>  → { status, url?, message? }
// 그 밖(명단 밖, 남의 것, 지운 것)은 있는지조차 알리지 않게 404.
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const hidden = () => Response.json({ status: 'not_found' }, { status: 404, headers: HEADERS });

export async function GET(request: Request) {
  await connection();
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return hidden();
  const id = new URL(request.url).searchParams.get('id');
  if (id === null) return Response.json({ enabled: avatarReady() }, { headers: HEADERS });
  if (!isUuid(id)) return hidden();
  // 보는 사람의 세션으로 묻는다: DB 함수가 auth.uid()로 내 것만 돌려준다
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('avatar_job_status', { p_id: id });
  if (error) return Response.json({ status: 'error' }, { status: 503, headers: HEADERS });
  const view = jobView(data, id, Date.now(), WORKER_QUIET_MS);
  if (!view) return hidden();
  return Response.json(view, { headers: HEADERS });
}
