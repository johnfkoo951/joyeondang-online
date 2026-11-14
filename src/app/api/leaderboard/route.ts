import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { SCORE_GAMES, type LeaderboardEntry, validateScorePayload } from '@/lib/leaderboard';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

type RpcRow = {
  game_id: string;
  room_slug: string;
  rank: number;
  display_name: string;
  score: number;
  ms: number;
  updated_at: string;
  is_me: boolean;
};

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const rawGame = url.searchParams.get('game');
  const game = rawGame && SCORE_GAMES.has(rawGame) ? rawGame : null;
  const limitRaw = Number(url.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(30, Math.round(limitRaw))) : 10;

  if (!supabaseReady()) {
    return Response.json({ ok: true, available: false, entries: [] as LeaderboardEntry[] }, { headers: NO_STORE });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('list_game_leaderboard', {
      p_game: game,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) {
      return Response.json({ ok: true, available: false, entries: [] as LeaderboardEntry[] }, { headers: NO_STORE });
    }
    const entries: LeaderboardEntry[] = (data as RpcRow[]).map((row) => ({
      gameId: String(row.game_id),
      roomSlug: String(row.room_slug),
      rank: Number(row.rank) || 1,
      displayName: String(row.display_name || '손님'),
      score: Number(row.score) || 0,
      ms: Number(row.ms) || 0,
      updatedAt: String(row.updated_at || new Date().toISOString()),
      isMe: Boolean(row.is_me),
    }));
    return Response.json({ ok: true, available: true, entries }, { headers: NO_STORE });
  } catch {
    return Response.json({ ok: true, available: false, entries: [] as LeaderboardEntry[] }, { headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  await connection();
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: 'invalid_json' }, { status: 400, headers: NO_STORE });
  }

  const payload = validateScorePayload(body);
  if (!payload) {
    return Response.json({ ok: false, reason: 'invalid_payload' }, { status: 400, headers: NO_STORE });
  }

  if (!supabaseReady()) {
    return Response.json({ ok: false, reason: 'offline' }, { status: 202, headers: NO_STORE });
  }

  const viewer = await getViewer();
  if (!canUse(viewer.role, 'stamps')) {
    return Response.json({ ok: false, reason: 'guest_only' }, { status: 403, headers: NO_STORE });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('submit_game_score', {
      p_game: payload.gameId,
      p_room: payload.roomSlug,
      p_display_name: payload.displayName || viewer.name || '손님',
      p_score: payload.score,
      p_ms: payload.ms,
      p_detail: payload.detail ?? {},
    });
    if (error || !data) {
      return Response.json({ ok: false, reason: 'rpc_unavailable' }, { status: 202, headers: NO_STORE });
    }
    return Response.json({ ok: true, ...(data as Record<string, unknown>) }, { headers: NO_STORE });
  } catch {
    return Response.json({ ok: false, reason: 'server_error' }, { status: 202, headers: NO_STORE });
  }
}
