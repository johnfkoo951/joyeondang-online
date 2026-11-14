'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { T } from '@/components/i18n/T';
import { GameOverlay } from '@/components/walk/GameOverlay';
import { LeaderboardPanel } from '@/components/games/LeaderboardPanel';
import { isCoarse, subscribeCoarse } from '@/components/walk/prefs';
import { gamesInRoom } from '@/games/registry';
import type { Role } from '@/lib/access';
import { SCORE_GAMES } from '@/lib/leaderboard';
import { placeEn } from '@/lib/place-names';

import { useSiteTheme } from '@/lib/theme';

type Props = {
  room: string;
  nickname: string;
  role: Role;
  canStamp: boolean;
  /** 놀이가 아직 목록에 없을 때 보일 이름(rooms.ts의 game) */
  pendingName?: string;
};

// 방 화면에서 바로 하는 놀이. 3D 걷기 없이(목록으로 보는 분도) 걷기 화면과 같은 놀이 덮개를 연다.
export function RoomGames({ room, nickname, role, canStamp, pendingName }: Props) {
  const games = gamesInRoom(room);
  const scored = games.filter((g) => SCORE_GAMES.has(g.id)).map((g) => g.id);
  const [open, setOpen] = useState<string | null>(null);
  const [lbRefresh, setLbRefresh] = useState(0);
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const siteTheme = useSiteTheme();

  // 덮개가 열려 있는 동안 뒤 페이지가 같이 밀리지 않게
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!games.length) {
    if (!pendingName) return null;
    // 놀이 이름(rooms.ts의 game)은 장소 이름 표에 있으면 영어로, 없으면 한국어 그대로
    const pendingEn = placeEn(pendingName);
    return (
      <p className="note-box">
        <T
          ko={`이 방의 놀이 「${pendingName}」는 준비 중이에요.`}
          en={pendingEn === pendingName ? <>This room’s game, <span lang="ko">「{pendingName}」</span>, is coming soon.</> : `This room’s game, “${pendingEn}”, is coming soon.`}
        />
      </p>
    );
  }
  return (
    <section className="stack" aria-labelledby="room-play">
      <h2 id="room-play">
        <T ko="이 방의 놀이" en="Games in this room" />
      </h2>
      {games.map((g) => (
        <article key={g.id} className="card stack room-game">
          <h3 style={{ margin: 0 }}>
            <T ko={g.title} en={g.titleEn} />
          </h3>
          <p style={{ margin: 0 }}>
            <T ko={g.blurb} en={g.blurbEn} />
          </p>
          {/* 글이 한국어인 놀이: 영어 화면에서만 한 줄(한국어 화면에서는 CSS가 숨긴다) */}
          {g.koreanNoteEn ? (
            <p className="small muted" style={{ margin: 0 }} data-en="" lang="en">
              {g.koreanNoteEn}
            </p>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn btn-roof" onClick={() => setOpen(g.id)}>
              <T ko="놀이 시작" en="Start" />
            </button>
            <Link className="btn btn-small" href={`/games/${g.id}`}>
              <T ko="단독 주소로 열기 ↗" en="Open direct URL ↗" />
            </Link>
            <span className="small muted">
              <T
                ko={g.seconds >= 90 ? `${Math.round(g.seconds / 60)}분쯤` : `${g.seconds}초쯤`}
                en={g.seconds >= 90 ? `About ${Math.round(g.seconds / 60)} min` : `About ${g.seconds} sec`}
              />
            </span>
          </div>
        </article>
      ))}
      {scored.length ? <LeaderboardPanel
        gameIds={scored}
        refreshToken={lbRefresh}
        limit={8}
        title="🏆 이 방의 리더보드"
        titleEn="🏆 This room’s leaderboard"
        subtitle="3D 방 안과 웹에서 함께 집계되는 최고 기록이에요."
        subtitleEn="Top scores from the 3D room and the web, counted together."
        onPlayGame={(gid) => setOpen(gid)}
      /> : null}
      {open ? (
        // 걷기 화면과 같은 판(전체 화면, 같은 여백 변수) 위에 놀이 덮개를 얹는다
        <div className="walk-root play-root" data-coarse={coarse ? 'true' : undefined}>
          <GameOverlay
            game={open}
            room={room}
            nickname={nickname}
            role={role}
            coarse={coarse}
            theme={siteTheme}
            canStamp={canStamp}
            onClose={() => { setOpen(null); setLbRefresh((n) => n + 1); }}
          />
        </div>
      ) : null}
    </section>
  );
}
