// 방 놀이 리더보드 순수 계산과 이 기기 기록 병합.
// 서버(Supabase game_scores)가 있으면 전 세계/초대 손님 공통 순위표를 보여 주고,
// 로그인 전 체험 모드이거나 오프라인일 때도 이 기기에 남은 최고 기록을 같은 모양으로 합쳐 보여 준다.

export type LeaderboardEntry = {
  gameId: string;
  roomSlug: string;
  rank: number;
  displayName: string;
  score: number;
  ms: number;
  updatedAt: string;
  isMe?: boolean;
  localOnly?: boolean;
};

export type SubmitScorePayload = {
  gameId: string;
  roomSlug: string;
  displayName: string;
  score: number;
  ms: number;
  detail?: Record<string, number | string>;
};

export const LOCAL_SCORES_KEY = 'jy.games.leaderboard.v1';
export const SCORE_GAMES = new Set(['poetry', 'sword', 'jam', 'groove', 'pitch', 'target', 'brain', 'who', 'shelf', 'sentences']);

const GAME_ID_RE = /^[a-z0-9-]{2,24}$/;
const ROOM_RE = /^[a-z0-9-]{2,32}$/;

export function cleanDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return '손님';
  const cleaned = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 24);
  return cleaned || '손님';
}

export function validateScorePayload(input: unknown): SubmitScorePayload | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const gameId = typeof o.gameId === 'string' && GAME_ID_RE.test(o.gameId) && SCORE_GAMES.has(o.gameId) ? o.gameId : null;
  const roomSlug = typeof o.roomSlug === 'string' && ROOM_RE.test(o.roomSlug) ? o.roomSlug : null;
  const score = typeof o.score === 'number' && Number.isFinite(o.score) ? Math.round(o.score) : null;
  const ms = typeof o.ms === 'number' && Number.isFinite(o.ms) ? Math.max(500, Math.min(3_600_000, Math.round(o.ms))) : null;
  if (!gameId || !roomSlug || score === null || score < 0 || score > 100_000 || ms === null) return null;
  const displayName = cleanDisplayName(o.displayName);
  const detail: Record<string, number | string> = {};
  if (o.detail && typeof o.detail === 'object') {
    for (const [k, v] of Object.entries(o.detail as Record<string, unknown>).slice(0, 12)) {
      if (!/^[a-zA-Z0-9_]{1,24}$/.test(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) detail[k] = Math.round(v * 100) / 100;
      else if (typeof v === 'string') detail[k] = v.slice(0, 40);
    }
  }
  return { gameId, roomSlug, displayName, score, ms, detail };
}

/** 두 점수 비교: 높은 점수 우선, 같으면 걸린 시간 짧은 순 */
export function isBetterScore(next: { score: number; ms: number }, prev: { score: number; ms: number }): boolean {
  if (next.score !== prev.score) return next.score > prev.score;
  return next.ms < prev.ms;
}

export function rankEntries(entries: ReadonlyArray<Omit<LeaderboardEntry, 'rank'>>, limit = 10): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.ms !== b.ms) return a.ms - b.ms;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  return sorted.slice(0, Math.max(1, Math.min(limit, 30))).map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

type StoredLocalMap = Record<string, Omit<LeaderboardEntry, 'rank'>>;

export function parseLocalScores(raw: string | null | undefined): StoredLocalMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: StoredLocalMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!SCORE_GAMES.has(k) || !v || typeof v !== 'object') continue;
      const e = v as Record<string, unknown>;
      const valid = validateScorePayload({
        gameId: k,
        roomSlug: e.roomSlug,
        displayName: e.displayName,
        score: e.score,
        ms: e.ms,
      });
      if (!valid) continue;
      out[k] = {
        gameId: valid.gameId,
        roomSlug: valid.roomSlug,
        displayName: valid.displayName,
        score: valid.score,
        ms: valid.ms,
        updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : new Date(0).toISOString(),
        isMe: true,
        localOnly: true,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function upsertLocalScore(
  raw: string | null | undefined,
  payload: SubmitScorePayload,
  nowIso = new Date().toISOString(),
): { json: string; improved: boolean; best: Omit<LeaderboardEntry, 'rank'> } {
  const map = parseLocalScores(raw);
  const prev = map[payload.gameId];
  const improved = !prev || isBetterScore(payload, prev);
  const best: Omit<LeaderboardEntry, 'rank'> = improved
    ? {
      gameId: payload.gameId,
      roomSlug: payload.roomSlug,
      displayName: payload.displayName,
      score: payload.score,
      ms: payload.ms,
      updatedAt: nowIso,
      isMe: true,
      localOnly: true,
    }
    : { ...prev, displayName: payload.displayName };
  map[payload.gameId] = best;
  return { json: JSON.stringify(map), improved, best };
}

/** 서버 순위표에 내 기기 기록이 아직 반영되지 않았을 때(비로그인 체험 등) 자연스럽게 합쳐 순위를 매긴다 */
export function mergeServerAndLocal(
  server: ReadonlyArray<LeaderboardEntry>,
  localMap: StoredLocalMap,
  gameId: string,
  limit = 10,
): LeaderboardEntry[] {
  const base: Array<Omit<LeaderboardEntry, 'rank'>> = server
    .filter((e) => e.gameId === gameId)
    .map((e) => ({ gameId: e.gameId, roomSlug: e.roomSlug, displayName: e.displayName, score: e.score, ms: e.ms, updatedAt: e.updatedAt, isMe: e.isMe, localOnly: e.localOnly }));
  const local = localMap[gameId];
  if (local) {
    const mineIdx = base.findIndex((e) => e.isMe);
    if (mineIdx >= 0) {
      if (isBetterScore(local, base[mineIdx])) {
        base[mineIdx] = { ...base[mineIdx], score: local.score, ms: local.ms, updatedAt: local.updatedAt };
      }
    } else {
      base.push(local);
    }
  }
  return rankEntries(base, limit);
}
