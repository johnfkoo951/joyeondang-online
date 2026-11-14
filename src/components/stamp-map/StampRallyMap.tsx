'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { earnStamp } from '@/app/actions';
import { CrayonOrb, type PigmentToken } from '@/components/home/CrayonOrb';
import { T } from '@/components/i18n/T';
import { HouseLine } from '@/components/i18n/HouseLine';
import { useLang } from '@/components/i18n/useLang';
import { buzz } from '@/components/stamp/stamp-rules';
import { GameOverlay } from '@/components/walk/GameOverlay';
import { markStamped } from '@/components/walk/memory';
import { isCoarse, subscribeCoarse } from '@/components/walk/prefs';
import { DOOR_LABEL, FLOORS, ROOMS, type Door } from '@/content/rooms';
import type { Role } from '@/lib/access';
import { DOOR_EN, ordinalEn } from '@/lib/page-words';
import { placeName } from '@/lib/place-names';
import {
  RALLY_ZONES,
  STAMP_SPOTS,
  markVisited,
  readLocalStamped,
  readVisited,
  spotName,
  spotProgress,
  summarizeRally,
  walkHrefForSpot,
  type RallyZone,
  type StampSpot,
} from '@/lib/stamp-rally';
import { useSiteTheme } from '@/lib/theme';
import { CarvedSeal } from './CarvedSeal';
import css from './stamp-rally.module.css';

const ZONE_TOKEN: Record<RallyZone, PigmentToken> = {
  yard: '--art-green',
  first: '--art-cobalt',
  second: '--art-orange',
};

type Props = {
  initialStamps: string[];
  doors: Record<string, Door>;
  canStamp: boolean;
  signedIn: boolean;
  nickname: string;
  role: Role;
  initialSpot?: string;
};

export function StampRallyMap({
  initialStamps,
  doors,
  canStamp,
  signedIn,
  nickname,
  role,
  initialSpot,
}: Props) {
  const [serverItems, setServerItems] = useState<Set<string>>(() => new Set(initialStamps));
  // 이 기기의 기억(다녀옴, 체험 도장)은 그린 뒤에 읽는다(syncLocal): 서버 그림과 첫 그림이 같아야 하이드레이션이 어긋나지 않는다
  const [localStamped, setLocalStamped] = useState<Set<string>>(() => new Set());
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    if (initialSpot && STAMP_SPOTS.some((s) => s.slug === initialSpot)) return initialSpot;
    return STAMP_SPOTS[0].slug;
  });
  const [tab, setTab] = useState<'rally' | 'section'>('rally');
  const [stampingSlug, setStampingSlug] = useState<string | null>(null);
  const [justStamped, setJustStamped] = useState<string | null>(null);
  // 알림은 두 말을 함께 둔다(알림이 떠 있는 동안 말을 바꿔도 따라간다)
  const [statusMsg, setStatusMsg] = useState<{ ko: string; en: string } | null>(null);
  const [playingGame, setPlayingGame] = useState<{ gameId: string; room: string } | null>(null);

  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const siteTheme = useSiteTheme();
  const lang = useLang();
  const en = lang === 'en';

  const syncLocal = useCallback(() => {
    try {
      setVisited(readVisited(localStorage));
      setLocalStamped(readLocalStamped(localStorage));
    } catch {
      // 저장소 접근 불가 환경 무시
    }
  }, []);

  useEffect(() => {
    queueMicrotask(syncLocal);
    window.addEventListener('focus', syncLocal);
    window.addEventListener('storage', syncLocal);
    return () => {
      window.removeEventListener('focus', syncLocal);
      window.removeEventListener('storage', syncLocal);
    };
  }, [syncLocal]);

  useEffect(() => {
    if (!playingGame) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [playingGame]);

  const summary = useMemo(
    () => summarizeRally(serverItems, localStamped, visited),
    [serverItems, localStamped, visited],
  );

  const selectedSpot = useMemo(
    () => STAMP_SPOTS.find((s) => s.slug === selectedSlug) ?? STAMP_SPOTS[0],
    [selectedSlug],
  );
  const selectedProg = spotProgress(selectedSpot.slug, serverItems, localStamped, visited);

  const stampSpotNow = async (spot: StampSpot) => {
    if (stampingSlug) return;
    setStatusMsg(null);
    if (!canStamp) {
      try {
        markVisited(localStorage, spot.slug);
        markStamped(localStorage, spot.slug);
      } catch {
        // 무시
      }
      buzz();
      syncLocal();
      setJustStamped(spot.slug);
      setStatusMsg({ ko: `${spot.name} 체험 도장을 맵에 찍었어요!`, en: `You got a trial stamp for ${spotName('en', spot)}. It’s on the map!` });
      return;
    }
    setStampingSlug(spot.slug);
    const fd = new FormData();
    fd.set('room', spot.slug);
    const res = await earnStamp(fd).catch(() => null);
    setStampingSlug(null);
    if (res?.ok) {
      try {
        markVisited(localStorage, spot.slug);
        markStamped(localStorage, spot.slug);
      } catch {
        // 무시
      }
      buzz();
      setServerItems((prev) => new Set([...prev, `room:${spot.slug}`]));
      syncLocal();
      setJustStamped(spot.slug);
      setStatusMsg(
        res.fresh
          ? { ko: `${spot.name} 도장을 맵에 쾅 찍었어요!`, en: `Thump! You stamped ${spotName('en', spot)} on the map.` }
          : { ko: `${spot.name} 도장은 이미 찍혀 있어요.`, en: `You already have the ${spotName('en', spot)} stamp.` },
      );
      return;
    }
    setStatusMsg({ ko: '도장을 찍지 못했어요. 잠시 뒤 다시 눌러 주세요.', en: 'We couldn’t stamp it. Please try again in a moment.' });
  };

  const pct = Math.round((summary.stamped / summary.total) * 100);

  return (
    <div className={css.wrap}>
      {/* 미니멀 점선 진행률 바 */}
      <section className={css.progressStrip} aria-label={en ? 'Stamp tour progress' : '도장 투어 진행 현황'}>
        <div className={css.progressTop}>
          <div className={css.progressTitleRow}>
            <span className={css.handLabel}><T ko="모은 도장" en="Stamps collected" /></span>
            <strong className={css.progressCount}>{summary.stamped} / {summary.total}</strong>
            <div className={css.zoneBadges}>
              {RALLY_ZONES.map((z) => {
                const st = summary.byZone[z.id];
                return (
                  <span key={z.id} className={css.zoneBadge} data-done={st.done || undefined}>
                    <b><T ko={z.label} en={z.en.label} /></b> {st.stamped}/{st.total}{st.done ? ' ✓' : ''}
                  </span>
                );
              })}
              {summary.visitedReady > 0 ? (
                <span className={css.readyAlert}>
                  <T ko={`찍기 가능 ${summary.visitedReady}곳!`} en={`${summary.visitedReady} ready to stamp!`} />
                </span>
              ) : null}
              {summary.qrCount > 0 ? (
                <span className={css.zoneBadge} data-done="true"><T ko={`현장 QR ${summary.qrCount}`} en={`On-site QR ${summary.qrCount}`} /></span>
              ) : null}
            </div>
          </div>

          <div className={css.modeTabs} role="tablist" aria-label={en ? 'Map view' : '지도 보기 방식'}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'rally'}
              className={css.modeTab}
              data-active={tab === 'rally' || undefined}
              onClick={() => setTab('rally')}
            >
              <T ko="콜라주 도장 맵" en="Collage stamp map" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'section'}
              className={css.modeTab}
              data-active={tab === 'section' || undefined}
              onClick={() => setTab('section')}
            >
              <T ko="층별 단면도" en="By floor" />
            </button>
          </div>
        </div>

        <div className={css.barTrack} role="progressbar" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.stamped}>
          <div className={css.barFill} style={{ width: `${pct}%` }} />
        </div>

        {!canStamp ? (
          <p className={css.trialNotice}>
            <T
              ko={<>지금은 <strong>체험 도장 모드</strong>예요. 방에 다녀오거나 작은 놀이를 즐기면 이 기기의 콜라주 지도에 전각 인장이 실제로 찍혀요 ·</>}
              en={<>You’re in <strong>trial stamp mode</strong>. Visit a room or play a mini game, and a carved seal really lands on the collage map on this device ·</>}
            />{' '}
            {signedIn ? (
              <Link href="/notebook"><T ko="수첩에서 초대 코드 넣기" en="Enter your invite code in the notebook" /></Link>
            ) : (
              <Link href="/login?next=/map"><T ko="초대 손님 로그인" en="Sign in as an invited guest" /></Link>
            )}
          </p>
        ) : null}

        {statusMsg ? (
          <p className={css.liveToast} role="status">
            <T ko={statusMsg.ko} en={statusMsg.en} />
          </p>
        ) : null}
      </section>

      {tab === 'rally' ? (
        <div className={css.rallyLayout}>
          {/* 오일파스텔 찢은 한지 콜라주 도장 맵 */}
          <div className={css.boardFrame}>
            <picture className={css.boardPic}>
              <source media="(min-width: 720px)" srcSet="/web/collage/stamp-rally-landscape-v2.webp" />
              <img
                src="/web/collage/stamp-rally-portrait-v2.webp"
                alt={
                  en
                    ? 'The stamp tour map of Joyeondang: 13 spots in the yard, 1F and 2F, drawn with oil pastels and torn hanji paper'
                    : '조연당 마당과 1층, 2층 열세 곳을 오일파스텔과 한지 조각으로 그린 도장 투어 지도'
                }
                className={css.boardImg}
              />
            </picture>

            {/* 13곳 크레용 구슬 핀 / 전각 인장 오버레이 */}
            <ol className={css.pinLayer} aria-label={en ? 'The 13 stamp tour spots' : '도장 투어 열세 지점'}>
              {STAMP_SPOTS.map((spot) => {
                const prog = spotProgress(spot.slug, serverItems, localStamped, visited);
                const active = spot.slug === selectedSpot.slug;
                const posStyle = {
                  '--lx': `${spot.lx}%`,
                  '--ly': `${spot.ly}%`,
                  '--px': `${spot.px}%`,
                  '--py': `${spot.py}%`,
                  '--pin-rot': `${spot.rot}deg`,
                } as CSSProperties;
                const stateLabel =
                  prog.status === 'stamped'
                    ? prog.trial
                      ? en ? 'trial stamp done' : '체험 도장 찍힘'
                      : en ? 'stamped' : '도장 받음'
                    : prog.status === 'visited'
                      ? en ? 'visited, ready to stamp' : '다녀옴, 도장 찍기 가능'
                      : en ? 'not visited yet' : '아직 안 가 봄';

                const orbToken: PigmentToken = active
                  ? '--art-vermilion'
                  : prog.status === 'visited'
                    ? '--art-yellow'
                    : ZONE_TOKEN[spot.zone];

                return (
                  <li key={spot.slug} className={css.pinItem} style={posStyle}>
                    <button
                      type="button"
                      className={css.pinBtn}
                      data-status={prog.status}
                      data-trial={prog.trial || undefined}
                      data-active={active || undefined}
                      aria-pressed={active}
                      aria-label={en ? `${spot.order}. ${spotName('en', spot)}, ${stateLabel}` : `${spot.order}번 ${spot.name}, ${stateLabel}`}
                      onClick={() => {
                        setSelectedSlug(spot.slug);
                        setStatusMsg(null);
                      }}
                    >
                      {prog.status === 'stamped' ? (
                        <span className={css.mapStampedSeal} data-press={justStamped === spot.slug || undefined}>
                          <CarvedSeal
                            label={spot.shortName}
                            labelEn={spot.en.short}
                            shape={spot.sealShape}
                            motif={spot.motif}
                            state={prog.trial ? 'trial' : 'stamped'}
                            size={56}
                            rot={spot.rot}
                            press={justStamped === spot.slug}
                          />
                        </span>
                      ) : (
                        <span className={css.pinOrbWrap}>
                          <CrayonOrb token={orbToken} seed={spot.order * 97 + 13} className={css.pinOrbCanvas} />
                          <span className={css.pinNum}>{spot.order}</span>
                          {prog.status === 'visited' ? <span className={css.pinReadyDot} aria-hidden="true">!</span> : null}
                        </span>
                      )}
                      <span className={css.pinCaption}><T ko={spot.shortName} en={spot.en.short} /></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* 선택한 지점 포스터 시트 */}
          <aside className={css.spotDetail} aria-live="polite" aria-label={en ? 'About the selected spot' : '선택한 지점 안내'}>
            <div className={css.spotDetailHead}>
              <CarvedSeal
                label={selectedSpot.shortName}
                labelEn={selectedSpot.en.short}
                shape={selectedSpot.sealShape}
                motif={selectedSpot.motif}
                state={
                  selectedProg.status === 'stamped'
                    ? selectedProg.trial
                      ? 'trial'
                      : 'stamped'
                    : selectedProg.status === 'visited'
                      ? 'ready'
                      : 'empty'
                }
                size={94}
                rot={selectedSpot.rot}
                press={justStamped === selectedSpot.slug}
              />
              <div>
                <p className={css.spotOrder}>
                  <T
                    ko={`${RALLY_ZONES.find((z) => z.id === selectedSpot.zone)?.label} · ${selectedSpot.order}번째 문`}
                    en={`${RALLY_ZONES.find((z) => z.id === selectedSpot.zone)?.en.label} · ${ordinalEn(selectedSpot.order)} door`}
                  />
                </p>
                <h3 className={css.spotName}><T ko={selectedSpot.name} en={spotName('en', selectedSpot)} /></h3>
                <span className={css.spotStateChip} data-status={selectedProg.status}>
                  {selectedProg.status === 'stamped'
                    ? selectedProg.trial
                      ? <T ko="✓ 체험 도장 찍힘" en="✓ Trial stamp done" />
                      : <T ko="✓ 정식 도장 완료" en="✓ Official stamp done" />
                    : selectedProg.status === 'visited'
                      ? <T ko="다녀왔어요 · 지금 도장 찍기 가능!" en="Visited · ready to stamp!" />
                      : <T ko="다녀오면 도장이 열려요" en="Visit to unlock" />}
                </span>
              </div>
            </div>

            <p className={css.spotCharm}><T ko={selectedSpot.charm} en={selectedSpot.en.charm} /></p>
            <p className={css.spotQuest}><T ko={selectedSpot.quest} en={selectedSpot.en.quest} /></p>

            <div className={css.spotActions}>
              {selectedProg.status === 'visited' ? (
                <button
                  type="button"
                  className={`btn btn-roof ${css.stampActionBtn}`}
                  disabled={stampingSlug === selectedSpot.slug}
                  onClick={() => void stampSpotNow(selectedSpot)}
                >
                  {stampingSlug === selectedSpot.slug
                    ? <T ko="도장을 찍는 중…" en="Stamping…" />
                    : canStamp
                      ? <T ko={`${selectedSpot.name} 도장 쾅 찍기!`} en={`Stamp ${spotName('en', selectedSpot)}!`} />
                      : <T ko={`${selectedSpot.name} 체험 도장 찍기!`} en={`Trial stamp: ${spotName('en', selectedSpot)}!`} />}
                </button>
              ) : null}

              {selectedSpot.gameId ? (
                <button
                  type="button"
                  className={selectedProg.status === 'visited' ? `btn ${css.outlineBtn}` : `btn ${css.fillBtn}`}
                  onClick={() => {
                    try {
                      markVisited(localStorage, selectedSpot.slug);
                    } catch {
                      // 무시
                    }
                    syncLocal();
                    setPlayingGame({ gameId: selectedSpot.gameId!, room: selectedSpot.slug });
                  }}
                >
                  <T ko={`놀이 시작: ${selectedSpot.gameTitle}`} en={`Play: ${selectedSpot.en.game ?? selectedSpot.gameTitle}`} />
                </button>
              ) : null}

              <Link
                className={!selectedSpot.gameId && selectedProg.status === 'unvisited' ? `btn ${css.fillBtn}` : `btn ${css.outlineBtn}`}
                href={`/room/${selectedSpot.slug}`}
              >
                {selectedSpot.acceptsNote
                  ? <T ko="이 방 둘러보고 쪽지 보기" en="See the room and notes" />
                  : <T ko="이 방 둘러보러 가기" en="Visit this room" />}
              </Link>

              <Link className={`btn ${css.outlineBtn}`} href={walkHrefForSpot(selectedSpot)}>
                <T ko="3D 집 안에서 가 보기" en="Go there in 3D" />
              </Link>
            </div>

            <div className={css.spotPager}>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  const idx = STAMP_SPOTS.findIndex((s) => s.slug === selectedSpot.slug);
                  const prev = STAMP_SPOTS[(idx - 1 + STAMP_SPOTS.length) % STAMP_SPOTS.length];
                  setSelectedSlug(prev.slug);
                }}
              >
                <T ko="← 이전" en="← Prev" />
              </button>
              <span className={css.pagerNum}>{selectedSpot.order} / {STAMP_SPOTS.length}</span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  const idx = STAMP_SPOTS.findIndex((s) => s.slug === selectedSpot.slug);
                  const next = STAMP_SPOTS[(idx + 1) % STAMP_SPOTS.length];
                  setSelectedSlug(next.slug);
                }}
              >
                <T ko="다음 →" en="Next →" />
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="house" aria-label={en ? 'Joyeondang by floor' : '조연당 단면 지도'}>
          <div className="roof-band" aria-hidden="true" />
          {FLOORS.map((floor) => {
            const rooms = ROOMS.filter((r) => r.floor === floor.id);
            if (!rooms.length) return null;
            return (
              <section key={floor.id} className={`floor ${floor.id === 'yard' ? 'yard' : ''}`} aria-label={placeName(lang, floor.label)}>
                <div className="floor-label">
                  <span><T ko={floor.label} en={placeName('en', floor.label)} /></span>
                  {floor.note ? <span className="small muted"><HouseLine text={floor.note} /></span> : null}
                </div>
                <div className="rooms">
                  {rooms.map((room) => {
                    const door = doors[room.slug] ?? room.door;
                    const prog = spotProgress(room.slug, serverItems, localStamped, visited);
                    return (
                      <Link key={room.slug} href={`/room/${room.slug}`} className="room-card" data-door={door}>
                        <span className="name"><T ko={room.name} en={placeName('en', room.name)} /></span>
                        <span className="door" data-door={door}><T ko={DOOR_LABEL[door]} en={DOOR_EN[door]} /></span>
                        {door !== 'open' && room.opens ? <span className="small muted"><HouseLine text={room.opens} /></span> : null}
                        {prog.status === 'stamped' ? (
                          <span className="stamp-mark">{prog.trial ? <T ko="체험 도장" en="Trial stamp" /> : <T ko="도장 받음" en="Stamped" />}</span>
                        ) : prog.status === 'visited' ? (
                          <span className="small muted"><T ko="다녀옴 · 도장 가능" en="Visited · ready to stamp" /></span>
                        ) : null}
                        {prog.qr ? <span className="stamp-mark"><T ko="현장 도장" en="On-site stamp" /></span> : null}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {summary.completed ? (
        <section className={css.keepsake} aria-label={en ? 'Joyeondang stamp tour complete' : '조연당 도장 투어 완주 기념'}>
          <div className={css.keepsakeHead}>
            <p className={css.kicker}>STAMP RALLY COMPLETE</p>
            <h3 className={css.keepsakeTitle}><T ko="열세 곳의 도장을 모두 모으셨어요!" en="You collected all 13 stamps!" /></h3>
            <p className={css.keepsakeSub}>
              <T
                ko="마당부터 1층 거실과 2층 박공방까지 구석구석 걸어 주셔서 고맙습니다. 방명록에도 오늘의 발자취를 한 줄 남겨 주세요."
                en="Thank you for walking every corner, from the yard to the 1F living room and the 2F gable rooms. Please leave a line about today in the guestbook too."
              />
            </p>
          </div>
          <div className={css.keepsakeSeals}>
            {STAMP_SPOTS.map((s) => {
              const p = spotProgress(s.slug, serverItems, localStamped, visited);
              return (
                <div key={s.slug} className={css.keepsakeCell}>
                  <CarvedSeal
                    label={s.shortName}
                    labelEn={s.en.short}
                    shape={s.sealShape}
                    motif={s.motif}
                    state={p.trial ? 'trial' : 'stamped'}
                    size={68}
                    rot={s.rot}
                  />
                  <span className="small"><T ko={s.shortName} en={s.en.short} /></span>
                </div>
              );
            })}
          </div>
          <div className="btn-row">
            <Link className={`btn ${css.fillBtn}`} href="/guestbook"><T ko="방명록에 완주 인사 남기기" en="Sign the guestbook" /></Link>
            <Link className={`btn ${css.outlineBtn}`} href="/walk"><T ko="3D 집 안 다시 걷기" en="Walk the house again in 3D" /></Link>
          </div>
        </section>
      ) : null}

      {playingGame ? (
        <div className="walk-root play-root" data-coarse={coarse ? 'true' : undefined}>
          <GameOverlay
            game={playingGame.gameId}
            room={playingGame.room}
            nickname={nickname}
            role={role}
            coarse={coarse}
            theme={siteTheme}
            canStamp={canStamp}
            onClose={() => {
              const closedRoom = playingGame.room;
              setPlayingGame(null);
              syncLocal();
              try {
                if (readLocalStamped(localStorage).has(closedRoom)) {
                  setJustStamped(closedRoom);
                }
              } catch {
                // 무시
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
