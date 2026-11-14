'use client';
import { useEffect, useMemo, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { formatMs } from '@/components/walk/memory';
import { GAMES, gamesInRoom } from '@/games/registry';
import { placeEn } from '@/lib/place-names';
import {
  LOCAL_SCORES_KEY,
  mergeServerAndLocal,
  parseLocalScores,
  upsertLocalScore,
  type LeaderboardEntry,
  type SubmitScorePayload,
} from '@/lib/leaderboard';
import s from './leaderboard.module.css';

export async function recordGameScoreClient(payload: SubmitScorePayload): Promise<{
  improvedLocal: boolean;
  rank: number | null;
}> {
  let improvedLocal = false;
  try {
    const prev = localStorage.getItem(LOCAL_SCORES_KEY);
    const up = upsertLocalScore(prev, payload);
    localStorage.setItem(LOCAL_SCORES_KEY, up.json);
    improvedLocal = up.improved;
  } catch {
    // 개인 창 등 저장 불가 환경 무시
  }

  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { ok?: boolean; rank?: number } | null;
      return { improvedLocal, rank: typeof data?.rank === 'number' ? data.rank : null };
    }
  } catch {
    // 오프라인 시 기기 기록만 유지
  }
  return { improvedLocal, rank: null };
}

/** 영어 칸의 짧은 글은 줄을 바꾸지 않는다(좁은 휴대폰 표에서 「Tim/e」, 「1,24/0」처럼 가운데서 끊기지 않게). 한국어 칸은 예전 그대로 */
const NOWRAP = { whiteSpace: 'nowrap' } as const;

/** 영어 순위표의 시간 칸: 좁은 칸에 맞게 「1:35」(한국어는 formatMs의 「1분 35초」 그대로) */
function clockEn(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type PanelProps = {
  /** 특정 놀이 하나로 고정하거나 여러 놀이 탭을 보여 준다 */
  gameIds: string[];
  initialGameId?: string;
  /** 제목·한 줄(한국어). 영어 화면의 말은 titleEn·subtitleEn(주지 않으면 title·subtitle을 그대로 쓴다: 부르는 쪽이 이미 고른 말) */
  title?: string;
  titleEn?: string;
  subtitle?: string;
  subtitleEn?: string;
  limit?: number;
  refreshToken?: number;
  onPlayGame?: (gameId: string) => void;
};

const DEFAULT_TITLE = { ko: '명예의 전당 · 리더보드', en: 'Hall of fame · Leaderboard' };
const DEFAULT_SUBTITLE = {
  ko: '방 안의 놀이와 웹 아케이드 기록이 실시간으로 함께 집계됩니다.',
  en: 'Scores from the room games and the web arcade are counted together, live.',
};

export function LeaderboardPanel({
  gameIds,
  initialGameId,
  title,
  titleEn,
  subtitle,
  subtitleEn,
  limit = 8,
  refreshToken = 0,
  onPlayGame,
}: PanelProps) {
  const tr = useTr();
  const head = title === undefined ? DEFAULT_TITLE : { ko: title, en: titleEn ?? title };
  const sub = subtitle === undefined ? DEFAULT_SUBTITLE : { ko: subtitle, en: subtitleEn ?? subtitle };
  const validIds = useMemo(() => gameIds.filter((id) => Boolean(GAMES[id])), [gameIds]);
  const [selected, setSelected] = useState<string>(() => (initialGameId && GAMES[initialGameId] ? initialGameId : validIds[0] ?? 'jam'));
  const [serverEntries, setServerEntries] = useState<LeaderboardEntry[]>([]);
  const [localRaw, setLocalRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeGame = validIds.includes(selected) ? selected : (validIds[0] ?? selected);

  useEffect(() => {
    let stop = false;
    const q = validIds.length === 1 ? `?game=${encodeURIComponent(validIds[0])}&limit=${limit}` : `?limit=${limit}`;
    queueMicrotask(() => {
      if (stop) return;
      setLoading(true);
      try {
        setLocalRaw(localStorage.getItem(LOCAL_SCORES_KEY));
      } catch {
        setLocalRaw(null);
      }
    });
    fetch(`/api/leaderboard${q}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok || stop) return;
        const json = (await res.json().catch(() => null)) as { entries?: LeaderboardEntry[] } | null;
        if (!stop) setServerEntries(Array.isArray(json?.entries) ? json!.entries : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [validIds, limit, refreshToken]);

  const rows = useMemo(() => {
    const localMap = parseLocalScores(localRaw);
    return mergeServerAndLocal(serverEntries, localMap, activeGame, limit);
  }, [serverEntries, localRaw, activeGame, limit]);

  const meta = GAMES[activeGame];

  return (
    <section className={s.wrap} aria-label={tr(head.ko, head.en)}>
      <div className={s.head}>
        <div>
          <h3 className={s.title}>
            <T ko={head.ko} en={head.en} />
          </h3>
          <p className={s.sub}>
            <T ko={sub.ko} en={sub.en} />
          </p>
        </div>
        {onPlayGame && meta ? (
          <button type="button" className="btn btn-roof btn-small" onClick={() => onPlayGame(meta.id)}>
            <T ko="이 놀이 바로 도전" en="Play this game" />
          </button>
        ) : null}
      </div>

      {validIds.length > 1 ? (
        <div className={s.tabs} role="tablist" aria-label={tr('리더보드 놀이 선택', 'Choose a game')}>
          {validIds.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === activeGame}
              className={s.tab}
              data-active={id === activeGame ? 'true' : undefined}
              onClick={() => setSelected(id)}
            >
              {GAMES[id] ? <T ko={GAMES[id].title} en={GAMES[id].titleEn} /> : id}
            </button>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className={s.empty}>
          {loading ? (
            <T ko="순위표를 불러오는 중이에요…" en="Loading the ranking…" />
          ) : (
            <T
              ko={`아직 「${meta?.title ?? activeGame}」 첫 기록이 비어 있어요. 첫 주인공이 되어 보세요!`}
              en={`No scores for “${meta?.titleEn ?? activeGame}” yet. Be the first!`}
            />
          )}
        </p>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th style={{ width: 52 }}>
                <T ko="순위" en={<span style={NOWRAP}>Rank</span>} />
              </th>
              <th>
                <T ko="이름표" en={<span style={NOWRAP}>Name</span>} />
              </th>
              <th style={{ textAlign: 'right' }}>
                <T ko="최고 점수" en={<span style={NOWRAP}>Best</span>} />
              </th>
              <th style={{ textAlign: 'right' }}>
                <T ko="시간" en={<span style={NOWRAP}>Time</span>} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.rank}-${r.displayName}-${r.updatedAt}`} className={r.isMe ? s.rowMe : undefined}>
                <td>
                  {r.rank <= 3 ? (
                    <span className={`${s.medal} ${s[`medal${r.rank}`]}`}>{r.rank}</span>
                  ) : (
                    <span>
                      <T ko={`${r.rank}위`} en={String(r.rank)} />
                    </span>
                  )}
                </td>
                <td>
                  {/* 이름표는 사람이 쓴 말이라 옮기지 않는다. 이름 없이 남긴 기록의 「손님」(덮개 화면이 넣는 기본 이름)만 화면 말로 옮긴다 */}
                  {r.displayName === '손님' ? <T ko="손님" en="Guest" /> : <span lang="ko">{r.displayName}</span>}
                  {r.isMe ? <T ko=" (나)" en=" (you)" /> : ''}
                  {r.localOnly ? <T ko=" · 이 기기" en=" · this device" /> : ''}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800 }}>
                  <T ko={`${r.score.toLocaleString()}점`} en={<span style={NOWRAP}>{r.score.toLocaleString('en-US')}</span>} />
                </td>
                <td style={{ textAlign: 'right', opacity: 0.8 }}>
                  <T ko={formatMs(r.ms)} en={<span style={NOWRAP}>{clockEn(r.ms)}</span>} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function RoomLeaderboardModal({
  roomSlug,
  roomTitle,
  onClose,
  onPlayGame,
}: {
  roomSlug: string;
  roomTitle: string;
  onClose: () => void;
  onPlayGame?: (gameId: string) => void;
}) {
  const games = useMemo(() => gamesInRoom(roomSlug).map((g) => g.id), [roomSlug]);
  const tr = useTr();
  // 방 이름: 집 자료의 이름이면 장소 이름 표의 영어, 가족이 지은 이름(사람이 쓴 말)이나 모르는 이름이면 한국어 그대로
  const roomEn = roomTitle === '방' ? 'Room' : placeEn(roomTitle);
  const known = roomEn !== roomTitle;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className={s.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={tr(`${roomTitle} 리더보드`, known ? `${roomEn} leaderboard` : 'Room leaderboard')}
      onClick={onClose}
    >
      <div className={s.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong>
            <T
              ko={`🏆 ${roomTitle} 순위표`}
              en={known ? `🏆 ${roomEn} ranking` : <>🏆 Ranking · <span lang="ko">{roomTitle}</span></>}
            />
          </strong>
          <button type="button" className="btn btn-small" onClick={onClose}>
            <T ko="닫기 (Esc)" en="Close (Esc)" />
          </button>
        </div>
        <LeaderboardPanel
          gameIds={games.length ? games : Object.keys(GAMES)}
          title={`${roomTitle} 최고 기록`}
          titleEn={known ? `${roomEn} top scores` : 'Top scores in this room'}
          subtitle="이 방에서 마친 점수는 웹 아케이드(/games) 리더보드에도 함께 표시됩니다."
          subtitleEn="Scores finished in this room also show on the web arcade (/games) leaderboard."
          limit={10}
          onPlayGame={
            onPlayGame
              ? (gid) => {
                  onClose();
                  onPlayGame(gid);
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
