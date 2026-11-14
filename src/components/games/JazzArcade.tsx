'use client';
import Link from 'next/link';
import { useState } from 'react';
import { T } from '@/components/i18n/T';
import { GAMES } from '@/games/registry';
import { JAZZ_GAME_IDS, standaloneGameHref } from '@/lib/game-routes';
import { LeaderboardPanel } from './LeaderboardPanel';
import css from './games-hub.module.css';

export function JazzArcade() {
  const [copied, setCopied] = useState(false);

  const copySuiteLink = () => {
    const full = typeof window !== 'undefined' ? `${window.location.origin}/games/jazz` : '/games/jazz';
    void navigator.clipboard?.writeText(full).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className={css.wrap}>
      <div className="btn-row">
        <Link className="btn btn-small" href="/games">
          <T ko="← 전체 놀이 허브" en="← All mini games" />
        </Link>
        <Link className="btn btn-small" href="/walk?room=gable">
          <T ko="3D 재즈 방으로 들어가기" en="Enter 3D jazz room" />
        </Link>
        <button type="button" className="btn btn-small" onClick={copySuiteLink}>
          {copied ? <T ko="✓ 재즈 허브 주소 복사됨" en="✓ Jazz suite link copied" /> : <T ko="🔗 /games/jazz 주소 복사" en="🔗 Copy /games/jazz link" />}
        </button>
      </div>

      <section className={css.hero} aria-label="Jazz Studio">
        <div className={css.heroText}>
          <p className={css.kicker}>JAZZ RHYTHM & EAR TRAINING SUITE</p>
          <h1 className={css.heroTitle}>
            <T ko="박공 아래 재즈 게임 스튜디오 3종" en="Jazz Rhythm & Ear Training Suite" />
          </h1>
          <p className={css.heroLead}>
            <T
              ko="3D 집 안을 걷지 않고도 외부 링크(/games/jazz)로 바로 접속해 리듬 천국 스튜디오·재즈 이어 트레이닝·스윙 잼 세 가지 음악 게임을 즐기고 순위를 겨룰 수 있어요."
              en="Jump straight in via /games/jazz without walking the 3D house: play the Rhythm Heaven jazz studio, Rhodes ear training, and swing jam, all linked to the live leaderboard."
            />
          </p>
        </div>
      </section>

      <div className={css.grid}>
        {JAZZ_GAME_IDS.map((id) => {
          const meta = GAMES[id];
          if (!meta) return null;
          return (
            <article key={id} className={css.card}>
              <div className="stack">
                <div className={css.cardBadges}>
                  <span className={css.roomBadge}>/games/{id}</span>
                </div>
                <h2 className={css.cardTitle}>
                  <T ko={meta.title} en={meta.titleEn} />
                </h2>
                <p className={css.cardBlurb}>
                  <T ko={meta.blurb} en={meta.blurbEn} />
                </p>
              </div>
              <div className={css.cardFoot}>
                <Link className="btn btn-roof" href={standaloneGameHref(id)}>
                  <T ko="단독 화면으로 바로 실행" en="Launch standalone game" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <LeaderboardPanel
        gameIds={[...JAZZ_GAME_IDS]}
        limit={10}
        title="🏆 재즈 스튜디오 명예의 전당"
        titleEn="🏆 Jazz Studio Hall of Fame"
        subtitle="리듬 천국 스튜디오 · 이어 트레이닝 · 박공 아래 잼 실시간 통합 순위표"
        subtitleEn="Live combined leaderboard for Jazz Rhythm Studio, Ear Training, and Jam under the Gable"
      />
    </div>
  );
}
