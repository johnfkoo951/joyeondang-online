'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { earnStamp } from '@/app/actions';
import { LeaderboardPanel, recordGameScoreClient } from '@/components/games/LeaderboardPanel';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { LoafCat } from '@/components/QuietArt';
import { isQuietAt, useSiteState } from '@/components/useSiteState';
import { GAMES } from '@/games/registry';
import type { GameContext, GameResult } from '@/games/types';
import type { Role } from '@/lib/access';
import { IconClose } from './icons';
import { FOCUSABLE } from './focusTrap';
import { GAME_EN, pick, type Pair } from './hud-text';
import { KeyHint } from './KeyHint';
import { markVisited } from '@/lib/stamp-rally';
import { formatMs, markStamped } from './memory';
import { useDialogFocus } from './useDialogFocus';

type Props = {
  game: string;
  room: string;
  nickname: string;
  role: Role;
  coarse: boolean;
  theme: 'light' | 'dark';
  canStamp: boolean;
  onClose: () => void;
};
type Phase = 'loading' | 'playing' | 'error' | 'result';

const newSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  } catch {
    return Math.floor(Math.random() * 2 ** 31);
  }
};

/** 결과 카드의 도장 알림(한국어·영어). 상태에는 열쇠만 두고 보일 때 고른다 */
const STAMP_NOTES = {
  stamped: ['이 방 도장을 찍었어요. 수첩에서 볼 수 있어요.', 'You got this room’s stamp. You can see it in your notebook.'],
  trial: ['체험 도장을 찍었어요! 도장 투어 맵에서 바로 볼 수 있어요.', 'You got a trial stamp! You can see it on the stamp tour map right away.'],
  retry: ['도장을 아직 못 찍었어요. 연결을 확인한 뒤 다시 찍어 주세요.', 'Couldn’t get the stamp yet. Check your connection and try again.'],
  cannot: ['지금은 도장을 찍을 수 없어요.', 'You can’t get a stamp right now.'],
  pressing: ['도장을 찍는 중이에요', 'Getting your stamp'],
} satisfies Record<string, Pair>;
type StampNote = keyof typeof STAMP_NOTES;
const STAMPED_NOTE: StampNote = 'stamped';
/** 공통 세션 동안의 쉬는 말(결과 카드와 쉬는 카드가 함께 쓴다) */
const QUIET_LINE: Pair = ['지금은 거실에 모여 있어요. 끝나면 다시 할 수 있어요.', 'Everyone is gathered in the living room right now. You can play again when it’s over.'];

/** 놀이 이름: 영어 화면이면 hud-text.ts의 영어(없으면 목록의 한국어 이름), 놀이를 모르면 「놀이」 */
function gameTitle(game: string, lang: 'ko' | 'en'): string {
  const meta = GAMES[game];
  if (!meta) return lang === 'en' ? 'Game' : '놀이';
  return lang === 'en' ? GAME_EN[meta.id]?.title ?? meta.title : meta.title;
}
/**
 * 결과 카드가 치워진 뒤에(다시 하기·닫기) 「새로 찍었다」는 답이 온 방들. 그 방의 다음 결과 카드에서 알리고 지운다.
 * 덮개를 닫았다 다시 열어도 남도록 덮개 밖(이 화면이 떠 있는 동안)에 둔다
 */
const lateFresh = new Set<string>();

// 놀이 덮개 화면. 놀이를 지연 로딩해 빈 칸(stage)에 붙이고, 닫기 단추·Esc를 맡는다(놀이 안에서는 Esc를 쓰지 않는다).
// 놀이가 결과를 넘기면 결과 카드(점수·시간, 다시 하기·닫기)를 보이고, 손님 이상이고 마쳤으면 그 방 도장을 찍는다.
function GameOverlayPlay({ game, room, nickname, role, coarse, theme, canStamp, onClose, quiet }: Props & { quiet: boolean }) {
  const meta = GAMES[game];
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<() => void>(onClose);
  const live = useRef({ onClose, nickname, role, coarse, theme, canStamp });
  const [phase, setPhase] = useState<Phase>('loading');
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [stampNote, setStampNote] = useState<StampNote | null>(null);
  /** 도장을 못 찍어 「다시 찍기」를 보여야 하는가 */
  const [stampAgain, setStampAgain] = useState(false);
  const [scoreSync, setScoreSync] = useState(0);
  const stampRef = useRef<() => void>(() => {});
  /** 놀이를 잇달아 못 연 횟수: 두 번째부터는 새로 고침을 권한다(새 배포 뒤 없어진 코드 조각은 다시 해도 안 열린다) */
  const [fails, setFails] = useState(0);
  useDialogFocus(closeBtn);
  const lang = useLang();
  const tr = useTr();

  useEffect(() => {
    live.current = { onClose, nickname, role, coarse, theme, canStamp };
  });

  // 판마다 새 칸을 만들어 놀이를 붙인다. 정리 함수는 놀이가 끝나거나 덮개가 닫힐 때 한 번만 부른다.
  useEffect(() => {
    const host = stage.current;
    if (!meta || !host) return;
    const el = document.createElement('div');
    el.className = 'game-stage-inner';
    host.appendChild(el);
    let done = false;
    /** 이 판의 칸이 치워졌다(덮개가 닫혔거나 다음 판으로 넘어갔다) */
    let gone = false;
    let cleanup: (() => void) | null = null;
    const release = () => {
      const c = cleanup;
      cleanup = null;
      try { c?.(); } catch { /* 놀이 정리가 실패해도 덮개는 닫는다 */ }
      el.remove();
    };
    // 놀이가 미리 알린 마지막 결과(report). 닫기·Esc로 끝내도 이 결과로 결과 카드와 도장을 처리한다
    let reported: GameResult | null = null;
    const report = (r: GameResult) => {
      if (done || !r) return;
      reported = reported?.cleared && !r.cleared ? { ...r, cleared: true } : r;
    };
    const finish = (given?: GameResult) => {
      if (done) return;
      done = true;
      release();
      const r = given ? (reported?.cleared && !given.cleared ? { ...given, cleared: true } : given) : reported;
      if (!r) return live.current.onClose();
      setResult(r);
      setPhase('result');
      if (typeof r.score === 'number' && (r.cleared || r.score > 0)) {
        void recordGameScoreClient({
          gameId: game,
          roomSlug: room,
          displayName: live.current.nickname || '손님',
          score: r.score,
          ms: r.ms,
          detail: r.detail,
        }).then(() => { if (!gone) setScoreSync((n) => n + 1); });
      }
      if (r.cleared) stamp();
      // 이번 판은 끝까지 못 했어도, 앞 판에서 찍고 알리지 못한 도장이 있으면 이 카드에서 알린다
      else if (lateFresh.delete(room)) setStampNote(STAMPED_NOTE);
    };
    // 도장은 서버가 찍었다고 답한 뒤에만 이 기기에 적는다. 연결 문제로 못 찍으면 두 번 더 해 보고(1초, 3초 뒤),
    // 그래도 안 되면 결과 카드에 알리고 「도장 다시 찍기」를 보인다.
    let stampTimer = 0;
    const stamp = (attempt = 0) => {
      const l = live.current;
      if (!l.canStamp) {
        try { markVisited(localStorage, room); markStamped(localStorage, room); } catch { /* 무시 */ }
        setStampNote('trial');
        return;
      }
      const failed = () => {
        if (gone) return;
        if (attempt < 2) {
          stampTimer = window.setTimeout(() => stamp(attempt + 1), attempt === 0 ? 1000 : 3000);
          return;
        }
        setStampNote('retry');
        setStampAgain(true);
      };
      const fd = new FormData();
      fd.set('room', room);
      earnStamp(fd).then((r) => {
        if (r.ok) {
          // 서버가 찍었다: 이 기기에도 적어 둔다. 답을 기다리는 사이 카드가 치워졌으면(다시 하기·닫기)
          // 「새로 찍었다」는 것만 기억했다가 다음 결과 카드에서 알린다
          try { markVisited(localStorage, room); markStamped(localStorage, room); } catch { /* 기억 못 해도 도장은 찍혔다 */ }
          if (gone && r.fresh) lateFresh.add(room);
        }
        if (gone) return;
        if (!r.ok) {
          if (r.retry) failed();
          else {
            // 다시 해도 같은 답(들어온 상태가 풀렸거나 도장을 받을 수 없는 사람): 알리고 끝낸다
            setStampAgain(false);
            setStampNote('cannot');
          }
          return;
        }
        setStampAgain(false);
        // 서버가 이번에(또는 방금 놓친 답에서) 새로 찍었을 때만 알린다(이미 찍은 방, 도장을 받지 않는 방이면 조용히).
        // 이 기기의 기억으로 가리지 않는다: 같은 기기를 다른 손님이 이어 쓰면 그 손님의 첫 도장이다
        const late = lateFresh.delete(room);
        setStampNote(r.fresh || late ? STAMPED_NOTE : null);
      }, failed);
    };
    stampRef.current = () => {
      setStampAgain(false);
      setStampNote('pressing');
      stamp(2);
    };
    exitRef.current = () => finish();
    meta.load()
      .then((m) => {
        if (done) return;
        const l = live.current;
        const ctx: GameContext = {
          game, room, nickname: l.nickname, role: l.role, seed: newSeed(), coarse: l.coarse,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, theme: l.theme,
          onExit: finish,
          report,
        };
        const c = m.default(el, ctx);
        // 붙이는 도중에 이미 끝났으면 받은 정리 함수를 바로 부른다
        if (done) {
          try { c(); } catch { /* 괜찮다 */ }
          return;
        }
        cleanup = c;
        setFails(0);
        setPhase('playing');
      })
      .catch(() => {
        if (done) return;
        // 반쯤 붙인 칸을 치우고 알린다
        release();
        setFails((n) => n + 1);
        setPhase('error');
      });
    return () => {
      done = true;
      gone = true;
      window.clearTimeout(stampTimer);
      release();
    };
  }, [meta, game, room, round]);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });
  // Esc는 덮개가 받는다(걷기 화면의 Esc보다 먼저). 조합 중이면 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (phaseRef.current === 'playing' || phaseRef.current === 'loading') exitRef.current();
      else live.current.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const close = () => (phase === 'playing' || phase === 'loading' ? exitRef.current() : onClose());
  const again = () => {
    setResult(null);
    setStampNote(null);
    setStampAgain(false);
    setPhase('loading');
    setRound((n) => n + 1);
  };
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !root.current) return;
    // 놀이 안의 묶음 단추(화살표로 옮기는 것, tabindex=-1)는 Tab 자리가 아니다: 끝 자리로 세면 Tab이 덮개 밖으로 나간다
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((n) => n === document.activeElement || (n.tabIndex >= 0 && n.offsetParent !== null));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const title = gameTitle(game, lang);
  return (
    <div ref={root} className="game-overlay" role="dialog" aria-modal="true" aria-label={title} onKeyDown={trap}>
      <div className="game-head">
        <h2>{title}</h2>
        <button ref={closeBtn} type="button" className="walk-tool" onClick={close} aria-label={tr('놀이 닫기', 'Close game')} title={tr('놀이 닫기 (Esc)', 'Close game (Esc)')} aria-keyshortcuts="Escape">
          <IconClose />
          <span className="walk-tool-text"><T ko="닫기" en="Close" /></span>
          <KeyHint k="Esc" />
        </button>
      </div>
      <div ref={stage} className="game-stage" data-phase={phase} />
      {meta && phase === 'loading' ? (
        <p className="game-note" role="status" style={NOTE_ROW}>
          <Spinner />
          <T ko="놀이를 펴는 중이에요" en="Setting up the game" />
        </p>
      ) : null}
      {!meta || phase === 'error' ? (
        <div className="game-note walk-card" role="alert">
          <p>
            {!meta
              ? <T ko="놀이를 찾지 못했어요." en="Couldn’t find the game." />
              : fails >= 2
                ? <T ko="놀이를 받지 못했어요. 연결을 확인하고 화면을 새로 고쳐 주세요." en="Couldn’t load the game. Check your connection and refresh the page." />
                : <T ko="놀이를 열지 못했어요." en="Couldn’t open the game." />}
          </p>
          <div className="btn-row">
            {meta && fails < 2 ? (
              <button type="button" className="btn btn-roof btn-small" onClick={again}><IconAgain /> <T ko="다시 해 보기" en="Try again" /></button>
            ) : null}
            {meta && fails >= 2 ? (
              <button type="button" className="btn btn-roof btn-small" onClick={() => window.location.reload()}><T ko="새로 고침" en="Refresh" /></button>
            ) : null}
            <button type="button" className="btn btn-small" onClick={onClose}><T ko="닫기" en="Close" /></button>
          </div>
        </div>
      ) : null}
      {phase === 'result' && result ? (
        <ResultCard game={game} title={title} result={result} scoreSync={scoreSync} note={stampNote} quiet={quiet} onStamp={stampAgain ? () => stampRef.current() : null} onAgain={again} onClose={onClose} />
      ) : null}
    </div>
  );
}

function ResultCard({ game, title, result, scoreSync, note, quiet, onStamp, onAgain, onClose }: {
  game: string; title: string; result: GameResult; scoreSync: number; note: StampNote | null; quiet: boolean; onStamp: (() => void) | null; onAgain: () => void; onClose: () => void;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  const lang = useLang();
  const tr = useTr();
  // 조용 모드가 켜져 「다시 하기」가 사라질 때 초점이 그 단추에 있었으면 제목으로 옮긴다(쪽 밖으로 떨어지지 않게)
  useEffect(() => {
    if (quiet && (!document.activeElement || document.activeElement === document.body)) head.current?.focus();
  }, [quiet]);
  return (
    <section className="game-result walk-card" aria-label={tr(`${title} 결과`, `${title} result`)}>
      {result.cleared ? <StampArt /> : null}
      <h3 ref={head} tabIndex={-1}>{result.cleared ? <T ko="해냈어요" en="You did it!" /> : <T ko="여기까지 했어요" en="Here’s how far you got" />}</h3>
      <dl className="game-result-nums">
        {typeof result.score === 'number' ? (
          <div><dt><T ko="점수" en="Score" /></dt><dd>{result.score}</dd></div>
        ) : null}
        <div><dt><T ko="걸린 시간" en="Time" /></dt><dd>{formatMs(result.ms, lang)}</dd></div>
      </dl>
      {note ? <p className="small" role="status">{pick(STAMP_NOTES[note], lang)}</p> : null}
      <div style={{ width: '100%', maxWidth: 460, marginTop: 8 }}>
        <LeaderboardPanel
          gameIds={[game]}
          limit={5}
          refreshToken={scoreSync}
          title={lang === 'en' ? '🏆 Live ranking for this game' : '🏆 이 놀이 실시간 순위'}
          subtitle={lang === 'en' ? 'Scores go to both the web arcade and the room leaderboard.' : '웹 아케이드와 방 리더보드에 함께 기록됩니다.'}
        />
      </div>
      {/* 공통 세션 동안에는 새 판을 펴지 않는다(띠의 「놀이는 잠시 쉬어요」와 같게). 끝나면 「다시 하기」가 돌아온다 */}
      {quiet ? <p className="small">{pick(QUIET_LINE, lang)}</p> : null}
      <div className="btn-row">
        {/* 누르면 단추가 사라지므로 초점을 제목으로 옮긴 뒤 찍는다(초점이 쪽 밖으로 떨어지지 않게) */}
        {onStamp ? <button type="button" className="btn btn-pine btn-small" onClick={() => { head.current?.focus(); onStamp(); }}><T ko="도장 다시 찍기" en="Try the stamp again" /></button> : null}
        {quiet ? null : <button type="button" className="btn btn-roof btn-small" onClick={onAgain}><IconAgain /> <T ko="다시 하기" en="Play again" /></button>}
        <button type="button" className="btn btn-small" onClick={onClose}><IconClose /> <T ko="닫기" en="Close" /></button>
      </div>
    </section>
  );
}

// ───────── 조용 모드(기획서 7.1): 공통 세션 동안에는 놀이를 새로 펴지 않고 쉬는 카드를 보인다.
// 조용할 때 열었으면 쉬는 카드, 조용 모드가 끝나면 그 카드에서 바로 「놀이 시작」을 누를 수 있다.
// 놀이 도중에 조용 모드가 켜지면 하던 판은 그대로 둔다.
// 끝나는 때는 5초 시계와 견준다: 서버에 다시 묻기 전(또는 물음이 실패하는 동안)에도 띠와 같이 풀린다.
const TICK_MS = 5_000;
const clockSubscribe = (cb: () => void) => {
  const t = setInterval(cb, TICK_MS);
  return () => clearInterval(t);
};
const clockNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const clockOff = () => 0;

export function GameOverlay(props: Props) {
  const site = useSiteState();
  const lang = useLang();
  // 조용하지 않을 때는 시계를 읽지 않는다(하던 놀이를 5초마다 다시 그리지 않게)
  const now = useSyncExternalStore(clockSubscribe, site.quiet ? clockNow : clockOff, clockOff);
  const quiet = isQuietAt(site, now);
  const [started, setStarted] = useState(!quiet);
  if (started) return <GameOverlayPlay {...props} quiet={quiet} />;
  return <QuietPause quiet={quiet} title={gameTitle(props.game, lang)} onStart={() => setStarted(true)} onClose={props.onClose} />;
}

function QuietPause({ quiet, title, onStart, onClose }: { quiet: boolean; title: string; onStart: () => void; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const live = useRef(onClose);
  useDialogFocus(btn);
  const lang = useLang();
  const tr = useTr();
  useEffect(() => {
    live.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      live.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-label={quiet ? tr('놀이 쉬는 중', 'Games are paused') : title}>
      <div className="game-head">
        <h2>{quiet ? <T ko="놀이 쉬는 중" en="Games are paused" /> : title}</h2>
      </div>
      <div className="game-stage">
        <div className="game-note walk-card quiet-pause" role="status">
          <LoafCat className="quiet-pause-cat" />
          <p>{quiet ? pick(QUIET_LINE, lang) : <T ko="이제 놀 수 있어요." en="You can play now." />}</p>
          <div className="btn-row">
            {quiet ? null : <button type="button" className="btn btn-roof btn-small" onClick={onStart}><T ko="놀이 시작" en="Start game" /></button>}
            <button ref={btn} type="button" className="btn btn-small" onClick={onClose}><T ko="닫기" en="Close" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 글을 못 읽어도 알아보게: 마친 판의 큰 별 도장, 다시 하기(↻), 불러오는 중 도는 고리. 움직임 줄이기면 돌지 않는다.
const NOTE_ROW = { display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' } as const;
const stillMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function IconAgain() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4v4.5H15" />
    </svg>
  );
}

function Spinner() {
  const [still] = useState(stillMotion);
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line-2)" strokeWidth={3} />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="var(--roof)" strokeWidth={3} strokeLinecap="round">
        {still ? null : <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />}
      </path>
    </svg>
  );
}

/** 마친 판의 도장: 붉은 고리 안의 큰 별 */
function StampArt() {
  const [still] = useState(stillMotion);
  return (
    <svg width={104} height={104} viewBox="0 0 120 120" aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
      <g transform="translate(60 60) rotate(-8)">
        <g>
          {still ? null : <animateTransform attributeName="transform" type="scale" values="1.5;0.92;1" keyTimes="0;0.7;1" dur="0.45s" fill="freeze" />}
          <g transform="translate(-60 -60)">
            <circle cx="60" cy="60" r="54" fill="var(--season-soft)" stroke="var(--roof)" strokeWidth={6} />
            <circle cx="60" cy="60" r="44" fill="none" stroke="var(--roof)" strokeWidth={2} strokeDasharray="4 5" />
            <path d="M60 22l10.6 21.6 23.8 3.4-17.2 16.8 4 23.7L60 76.3 38.8 87.5l4-23.7L25.6 47l23.8-3.4z" fill="var(--lamp)" stroke="var(--roof)" strokeWidth={3} strokeLinejoin="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}
