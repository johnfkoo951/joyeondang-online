import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { HIDDEN, NO_STORE, cursorTime } from '@/lib/chat-server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 걸은 길 읽기(가족·관리자, 컨트롤 룸의 다시 보기용). 걸은 길 표를 읽을 수 있는 사람(가족 이상)과 같게 연다.
//   GET ?from=<ISO>&to=<ISO>&after=<id>&limit=500
//   → { trails: [{ id, sub, name, space, t0, t1, points: [[t_ms, x, y, z, yaw], …] }], next: <다음 after> | null }
//   from·to가 없으면 지난 24시간. 묶음은 id 차례(대략 때 차례)로 오니, 다시 그릴 때는 점의 t_ms로 늘어놓는다.
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  await connection();
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'family')) return new Response('Not found', HIDDEN);
  const q = new URL(request.url).searchParams;
  const now = Date.now();
  const to = cursorTime(q.get('to')) ?? new Date(now).toISOString();
  const from = cursorTime(q.get('from')) ?? new Date(Date.parse(to) - DAY_MS).toISOString();
  const after = Math.max(0, Number.parseInt(q.get('after') ?? '0', 10) || 0);
  const limit = Math.min(1000, Math.max(1, Number.parseInt(q.get('limit') ?? '500', 10) || 500));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('walk_trails_read', { p_from: from, p_to: to, p_after: after, p_limit: limit });
  if (error || !Array.isArray(data)) return Response.json({ trails: [], next: null, reason: 'not_ready' }, { status: 503, headers: NO_STORE });
  const trails = data as Array<{ id: number }>;
  const next = trails.length >= limit ? trails[trails.length - 1].id : null;
  return Response.json({ trails, next }, { headers: NO_STORE });
}
