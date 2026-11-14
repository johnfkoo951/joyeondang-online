import { connection } from 'next/server';
import { HIDDEN, readBody, sameOrigin } from '@/lib/chat-server';
import { TRAIL_POINTS_MAX, readTrailInput } from '@/lib/social';
import { createClient } from '@/lib/supabase/server';

// 걸은 길 한 묶음: { space, points: [[t_ms, x, y, z, yaw], …], sent? }. 걷기 화면이 30초마다, 페이지를 떠날 때는
// navigator.sendBeacon(text/plain)으로 보낸다. 기기 시계는 sent로 받은 때에 맞춘다(readTrailInput).
// 명단 손님인지, 모양·때·양은 DB(trail_post)가 다시 본다. 남겼으면 204, 명단 밖이면 404, 그 밖은 400·429.
const STATUS: Record<string, number> = { not_guest: 404, too_many: 429, too_many_today: 429 };

export async function POST(request: Request) {
  await connection();
  if (!sameOrigin(request)) return new Response('Not found', HIDDEN);
  const raw = await readBody(request, TRAIL_POINTS_MAX * 2 * 120 + 1024);
  const read = readTrailInput(raw, Date.now());
  if (!read.ok) return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('trail_post', { p_space: read.space, p_points: read.points });
  if (error) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const out = (data ?? {}) as { ok?: unknown; reason?: unknown };
  if (out.ok === true) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  const reason = typeof out.reason === 'string' ? out.reason : '';
  if (reason === 'not_guest') return new Response('Not found', HIDDEN);
  return new Response(null, { status: STATUS[reason] ?? 400, headers: { 'Cache-Control': 'no-store' } });
}
