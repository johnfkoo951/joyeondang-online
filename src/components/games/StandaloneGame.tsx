'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { earnStamp } from '@/app/actions';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { formatMs, markStamped } from '@/components/walk/memory';
import { isCoarse, subscribeCoarse } from '@/components/walk/prefs';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { GAMES } from '@/games/registry';
import type { GameContext, GameResult } from '@/games/types';
import type { Role } from '@/lib/access';
import { CANONICAL_GAME_IDS, JAZZ_GAME_IDS, standaloneGameHref, type CanonicalGameId } from '@/lib/game-routes';
import { placeEn } from '@/lib/place-names';
import { markVisited } from '@/lib/stamp-rally';
import { useSiteTheme } from '@/lib/theme';
import { SCORE_GAMES } from '@/lib/leaderboard';
import { LeaderboardPanel, recordGameScoreClient } from './LeaderboardPanel';
import css from './standalone-game.module.css';

const newSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  } catch {
    return Math.floor(Math.random() * 2 ** 31);
  }
};

type Props = {
  gameId: CanonicalGameId;
  nickname: string;
  role: Role;
  canStamp: boolean;
};

export function StandaloneGame({ gameId, nickname, role, canStamp }: Props) {
  const meta = GAMES[gameId];
  const room = meta ? ROOM_BY_SLUG.get(meta.room) : undefined;
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const theme = useSiteTheme();
  const lang = useLang();

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({ nickname, role, coarse, theme, canStamp });
  useEffect(() => {
    liveRef.current = { nickname, role, coarse, theme, canStamp };
  });

  const [round, setRound] = useState(0);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [stampMsg, setStampMsg] = useState<{ ko: string; en: string } | null>(null);
  const [lbRefresh, setLbRefresh] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!meta) return;
    document.title = lang === 'en' ? `${meta.titleEn} · Joyeondang Arcade` : `${meta.title} · 조연당 아케이드`;
  }, [lang, meta]);

  const handleOutcome = useCallback(
    (res: GameResult) => {
      if (!meta) return;
      setLastResult(res);
      const l = liveRef.current;

      if (typeof res.score === 'number' && (res.cleared || res.score > 0)) {
        void recordGameScoreClient({
          gameId: meta.id,
          roomSlug: meta.room,
          displayName: l.nickname || '손님',
          score: res.score,
          ms: res.ms,
          detail: res.detail,
        }).then(() => setLbRefresh((n) => n + 1));
      }

      if (res.cleared) {
        try {
          markVisited(localStorage, meta.room);
          markStamped(localStorage, meta.room);
        } catch {
          // 무시
        }
        if (!l.canStamp) {
          setStampMsg({
            ko: '체험 도장을 찍었어요! 도장 투어 맵에서 바로 확인할 수 있어요.',
            en: 'Trial stamp earned! Check it on the stamp tour map.',
          });
          return;
        }
        const fd = new FormData();
        fd.set('room', meta.room);
        void earnStamp(fd).then((sr) => {
          if (sr.ok && sr.fresh) {
            setStampMsg({
              ko: '이 방의 정식 도장을 새로 찍었어요!',
              en: 'You earned this room’s official stamp!',
            });
          }
        });
      }
    },
    [meta],
  );

  useEffect(() => {
    const host = mountRef.current;
    if (!meta || !host) return;
    host.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'game-stage-inner';
    inner.style.width = '100%';
    inner.style.height = '100%';
    host.appendChild(inner);

    let disposed = false;
    let cleanup: (() => void) | null = null;
    let reported: GameResult | null = null;

    try {
      markVisited(localStorage, meta.room);
    } catch {
      // 무시
    }

    const release = () => {
      const c = cleanup;
      cleanup = null;
      try {
        c?.();
      } catch {
        // 무시
      }
      inner.remove();
    };

    const ctx: GameContext = {
      game: meta.id,
      room: meta.room,
      nickname: liveRef.current.nickname,
      role: liveRef.current.role,
      seed: newSeed(),
      coarse: liveRef.current.coarse,
      reducedMotion: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      theme: liveRef.current.theme,
      report: (r) => {
        if (disposed || !r) return;
        reported = reported?.cleared && !r.cleared ? { ...r, cleared: true } : r;
        handleOutcome(reported);
      },
      onExit: (given) => {
        if (disposed) return;
        const finalRes = given ? (reported?.cleared && !given.cleared ? { ...given, cleared: true } : given) : reported;
        if (finalRes) handleOutcome(finalRes);
        // 단독 페이지에서는 빈 화면으로 닫히지 않고 새 판으로 이어 하거나 아래 순위표로 스크롤 안내
        setRound((n) => n + 1);
      },
    };

    meta
      .load()
      .then((m) => {
        if (disposed) return;
        const fn = m.default(inner, ctx);
        if (disposed) {
          try {
            fn();
          } catch {
            // 무시
          }
          return;
        }
        cleanup = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      release();
    };
  }, [meta, round, handleOutcome]);

  if (!meta) return null;

  const isJazz = (JAZZ_GAME_IDS as readonly string[]).includes(meta.id);
  const sharePath = `/games/${meta.id}`;
  const roomKo = room?.name ?? meta.room;
  const roomEn = placeEn(roomKo);

  const copyUrl = () => {
    const full = typeof window !== 'undefined' ? `${window.location.origin}${sharePath}` : sharePath;
    void navigator.clipboard?.writeText(full).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  const toggleFullscreen = () => {
    const el = stageWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  };

  return (
    <div className={css.wrap}>
      <div className={css.topBar}>
        <div className={css.navBtns}>
          <Link className="btn btn-small" href="/games">
            <T ko="← 전체 놀이 모음" en="← All mini games" />
          </Link>
          {isJazz ? (
            <Link className="btn btn-small" href="/games/jazz">
              <T ko="🎷 재즈 게임 모음" en="🎷 Jazz game suite" />
            </Link>
          ) : null}
          <Link className="btn btn-small" href={`/room/${meta.room}`}>
            <T ko={`공간 보기 · ${roomKo}`} en={`Room · ${roomEn}`} />
          </Link>
          <Link className="btn btn-small" href={`/walk?room=${meta.room}`}>
            <T ko="3D 방으로 들어가기" en="Enter 3D room" />
          </Link>
        </div>

        <div className={css.shareBtns}>
          <span className={css.urlChip}>{sharePath}</span>
          <button type="button" className="btn btn-small" onClick={copyUrl}>
            {copied ? <T ko="✓ 주소 복사됨!" en="✓ Link copied!" /> : <T ko="🔗 게임 주소 복사" en="🔗 Copy direct link" />}
          </button>
          <button type="button" className="btn btn-small" onClick={() => setRound((n) => n + 1)}>
            <T ko="↻ 새 판 시작" en="↻ Restart" />
          </button>
          <button type="button" className="btn btn-pine btn-small" onClick={toggleFullscreen}>
            <T ko="⛶ 전체화면" en="⛶ Fullscreen" />
          </button>
        </div>
      </div>

      <header className={css.headCard}>
        <div>
          <p className={css.kicker}>STANDALONE WEB ARCADE · DIRECT PLAY</p>
          <h1 className={css.title}>
            <T ko={meta.title} en={meta.titleEn} />
          </h1>
          <p className={css.blurb}>
            <T ko={meta.blurb} en={meta.blurbEn} />
          </p>
        </div>
      </header>

      {lastResult ? (
        <div className={css.resultBanner} role="status">
          <div>
            <strong>
              {lastResult.cleared ? <T ko="🎉 클리어 기록 반영 완료!" en="🎉 Clear recorded!" /> : <T ko="최근 플레이 기록" en="Recent play record" />}
            </strong>
            <span style={{ marginLeft: 12 }}>
              {typeof lastResult.score === 'number' ? `${lastResult.score.toLocaleString()} pts · ` : ''}
              {formatMs(lastResult.ms)}
            </span>
            {stampMsg ? (
              <span style={{ marginLeft: 12, fontWeight: 700 }}>
                <T ko={stampMsg.ko} en={stampMsg.en} />
              </span>
            ) : null}
          </div>
          <button type="button" className="btn btn-roof btn-small" onClick={() => setRound((n) => n + 1)}>
            <T ko="한 판 더 도전" en="Play another round" />
          </button>
        </div>
      ) : null}

      <div
        ref={stageWrapRef}
        className={`${css.stageFrame} walk-root play-root`}
        data-tall={gameId === 'sword' ? 'true' : undefined}
        data-coarse={coarse ? 'true' : undefined}
      >
        <div ref={mountRef} className={css.stageMount} />
      </div>

      {SCORE_GAMES.has(meta.id) ? <LeaderboardPanel
        gameIds={[meta.id]}
        refreshToken={lbRefresh}
        limit={10}
        title={`🏆 ${meta.title} · 실시간 순위표`}
        titleEn={`🏆 ${meta.titleEn} · Live leaderboard`}
        subtitle="이 단독 주소에서 플레이한 점수와 3D 방 안에서 플레이한 점수가 하나로 합산됩니다."
        subtitleEn="Scores from this direct link and from inside the 3D room share one live leaderboard."
      /> : null}

      <nav className={css.switcher} aria-label={lang === 'en' ? 'Other direct game links' : '다른 단독 게임 바로 가기'}>
        <strong className="small muted">
          <T ko="다른 게임도 별도 주소로 바로 열기" en="Open another game via its direct link" />
        </strong>
        <div className={css.switcherRow}>
          {CANONICAL_GAME_IDS.map((id) => {
            const g = GAMES[id];
            if (!g) return null;
            return (
              <Link
                key={id}
                href={standaloneGameHref(id)}
                className={id === gameId ? 'btn btn-roof btn-small' : 'btn btn-small'}
              >
                <T ko={g.title} en={g.titleEn} />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
