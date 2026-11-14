'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { CarvedSeal } from '@/components/stamp-map/CarvedSeal';
import { GameOverlay } from '@/components/walk/GameOverlay';
import { LeaderboardPanel } from './LeaderboardPanel';
import { aboutSeconds } from '@/components/walk/memory';
import { SCORE_GAMES } from '@/lib/leaderboard';
import { isCoarse, subscribeCoarse } from '@/components/walk/prefs';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { GAMES } from '@/games/registry';
import type { Role } from '@/lib/access';
import { placeEn } from '@/lib/place-names';
import { SPOT_BY_SLUG, markVisited, readLocalStamped, readVisited, spotProgress } from '@/lib/stamp-rally';
import { FILTERS, GAME_CATALOG, GAMES_TITLE_EN, type Category } from './catalog';
import css from './games-hub.module.css';

import { useSiteTheme } from '@/lib/theme';

type Props = {
  nickname: string;
  role: Role;
  canStamp: boolean;
  initialStamps: string[];
  initialPlay?: string;
};

export function GamesHub({ nickname, role, canStamp, initialStamps, initialPlay }: Props) {
  const [filter, setFilter] = useState<Category>('all');
  const [activeGame, setActiveGame] = useState<string | null>(() => (initialPlay && GAMES[initialPlay] ? initialPlay : null));
  const [serverItems] = useState<Set<string>>(() => new Set(initialStamps));
  const [localStamped, setLocalStamped] = useState<Set<string>>(() => new Set());
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [lbRefresh, setLbRefresh] = useState(0);

  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const siteTheme = useSiteTheme();
  const lang = useLang();
  const tr = useTr();
  /** 서버가 붙인 한국어 쪽 제목(영어에서 한국어로 돌아올 때 되살린다) */
  const koTitle = useRef<string | null>(null);

  // 쪽 제목은 서버 metadata(한국어)라 영어 화면에서만 여기서 바꾼다
  useEffect(() => {
    if (koTitle.current === null) koTitle.current = document.title;
    if (lang === 'en') document.title = GAMES_TITLE_EN;
    else if (document.title === GAMES_TITLE_EN) document.title = koTitle.current;
  }, [lang]);
  useEffect(
    () => () => {
      if (koTitle.current !== null && document.title === GAMES_TITLE_EN) document.title = koTitle.current;
    },
    [],
  );

  const syncLocal = useCallback(() => {
    try {
      setLocalStamped(readLocalStamped(localStorage));
      setVisited(readVisited(localStorage));
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    queueMicrotask(syncLocal);
    window.addEventListener('focus', syncLocal);
    return () => window.removeEventListener('focus', syncLocal);
  }, [syncLocal]);

  useEffect(() => {
    if (!activeGame) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeGame]);

  const items = GAME_CATALOG.filter((g) => filter === 'all' || g.category === filter);
  const clearedCount = GAME_CATALOG.filter((g) => {
    const meta = GAMES[g.id];
    if (!meta) return false;
    return spotProgress(meta.room, serverItems, localStamped, visited).status === 'stamped';
  }).length;

  const activeMeta = activeGame ? GAMES[activeGame] : null;

  return (
    <div className={css.wrap}>
      <section className={css.hero} aria-label={tr('작은 놀이 소개', 'About the mini games')}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 일러스트 */}
        <img
          src="/web/collage/collage-games-v2.webp"
          alt={tr(
            '피아노, 나무 블록 선반, 과녁과 종이공, 문장 카드와 작은 무대가 놓인 놀이 책상 일러스트',
            'Illustration of a play desk with a piano, a wooden block shelf, a target and paper balls, sentence cards and a small stage',
          )}
          className={css.heroImg}
        />
        <div className={css.heroText}>
          <p className={css.kicker}>MINI-GAMES ARCADE</p>
          <h1 className={css.heroTitle}>
            <T ko="집 안의 작은 놀이 12가지" en="12 mini games in the house" />
          </h1>
          <p className={css.heroLead}>
            <T
              ko="3D 걷기에 들어가지 않아도 웹에서 바로 12가지 놀이를 즐길 수 있고, 게임마다 전용 외부 주소(/games/이름)로도 바로 실행할 수 있어요!"
              en="Play all 12 games right here on the web without walking the 3D house, or open any game directly via its standalone /games link!"
            />
          </p>
          <div className={css.heroMeta}>
            <span className={css.statPill}>
              <T ko={`놀이 도장 ${clearedCount} / ${GAME_CATALOG.length}`} en={`Game stamps ${clearedCount} / ${GAME_CATALOG.length}`} />
            </span>
            <Link className="btn btn-small" href="/map"><T ko="도장 투어 맵 보기" en="See the stamp tour map" /></Link>
            <Link className="btn btn-small" href="/games/jazz"><T ko="🎷 재즈 전용 주소 (/games/jazz)" en="🎷 Jazz suite (/games/jazz)" /></Link>
            <Link className="btn btn-small" href="/walk"><T ko="3D 집 안에서 찾기" en="Find them in the 3D house" /></Link>
          </div>
        </div>
      </section>

      <div className={css.filters} role="tablist" aria-label={tr('놀이 갈래', 'Game types')}>
        {FILTERS.map(({ id, ko, en }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={css.filterBtn}
            data-active={filter === id || undefined}
            onClick={() => setFilter(id)}
          >
            <T ko={ko} en={en} />
          </button>
        ))}
      </div>

      <div className={css.grid}>
        {items.map((entry) => {
          const meta = GAMES[entry.id];
          if (!meta) return null;
          const room = ROOM_BY_SLUG.get(meta.room);
          const spot = SPOT_BY_SLUG.get(meta.room);
          const prog = spotProgress(meta.room, serverItems, localStamped, visited);
          const roomKo = room?.name ?? meta.room;
          const roomEn = placeEn(roomKo);
          return (
            <article key={entry.id} className={css.card}>
              <div className="stack">
                <div className={css.cardTop}>
                  {spot ? (
                    <CarvedSeal
                      label={spot.shortName}
                      shape={spot.sealShape}
                      motif={spot.motif}
                      state={prog.status === 'stamped' ? (prog.trial ? 'trial' : 'stamped') : prog.status === 'visited' ? 'ready' : 'empty'}
                      size={74}
                      rot={spot.rot}
                    />
                  ) : null}
                  <div>
                    <div className={css.cardBadges}>
                      <span className={css.roomBadge}>
                        <T ko={roomKo} en={roomEn === roomKo ? <span lang="ko">{roomKo}</span> : roomEn} />
                      </span>
                      <span className={css.timeBadge}>
                        <T ko={aboutSeconds(meta.seconds)} en={aboutSeconds(meta.seconds, 'en')} />
                      </span>
                      {prog.status === 'stamped' ? (
                        <span className={css.doneBadge}>
                          <T ko="✓ 도장 획득" en="✓ Stamp earned" />
                        </span>
                      ) : null}
                    </div>
                    <h2 className={css.cardTitle}>
                      <T ko={meta.title} en={meta.titleEn} />
                    </h2>
                  </div>
                </div>
                <p className={css.cardBlurb}>
                  <T ko={meta.blurb} en={meta.blurbEn} />
                </p>
                <p className={css.cardHint}>
                  <T ko={entry.how} en={entry.howEn} />
                </p>
                {/* 글이 한국어인 놀이: 영어 화면에서만 한 줄(한국어 화면에서는 CSS가 숨긴다) */}
                {meta.koreanNoteEn ? (
                  <p className={css.cardHint} data-en="" lang="en">
                    {meta.koreanNoteEn}
                  </p>
                ) : null}
              </div>
              <div className={css.cardFoot}>
                <button
                  type="button"
                  className="btn btn-roof"
                  onClick={() => {
                    try {
                      markVisited(localStorage, meta.room);
                    } catch {
                      // 무시
                    }
                    syncLocal();
                    setActiveGame(meta.id);
                  }}
                >
                  <T ko="바로 놀이 시작" en="Play now" />
                </button>
                <Link className="btn btn-small" href={`/games/${entry.id}`}>
                  <T ko="단독 주소 열기 ↗" en="Direct link ↗" />
                </Link>
                <Link className="btn btn-small" href={`/room/${meta.room}`}>
                  <T ko="방 구경하기" en="Visit the room" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <LeaderboardPanel
        gameIds={GAME_CATALOG.map((g) => g.id).filter((id) => SCORE_GAMES.has(id))}
        refreshToken={lbRefresh}
        limit={10}
        title="🏆 조연당 온라인 · 웹 통합 리더보드"
        titleEn="🏆 Joyeondang online · All-games leaderboard"
        subtitle="재즈 스튜디오·이어 트레이닝·과녁·생각 지도 등 모든 방 놀이의 최고 기록이 실시간으로 모입니다."
        subtitleEn="Top scores from every room game, from the jazz studio and ear training to the target and the mind map, gathered live."
        onPlayGame={(gid) => setActiveGame(gid)}
      />

      {activeMeta ? (
        <div className="walk-root play-root" data-coarse={coarse ? 'true' : undefined}>
          <GameOverlay
            game={activeMeta.id}
            room={activeMeta.room}
            nickname={nickname}
            role={role}
            coarse={coarse}
            theme={siteTheme}
            canStamp={canStamp}
            onClose={() => {
              setActiveGame(null);
              syncLocal();
              setLbRefresh((n) => n + 1);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
