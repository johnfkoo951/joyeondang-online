// 박공 아래 잼: 처음 → 받아 치기 세 판 → 두 마디 만들기 → 오늘의 곡.
// 소리는 첫 단추를 누른 뒤에 켠다. 정리(unmount) 때 스케줄러를 멈추고 AudioContext를 닫는다.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameContext } from '../types';
import { createEngine, createTransport } from './audio';
import { Composer } from './Composer';
import { DrumArt, IconDoor, IconEar, IconHand, IconNote, IconPlay, IconSound, IconStar, IconStop } from './icons';
import {
  ROUNDS, SCALE, SONG_KEY, addPiece, decodeGrid, emptyGrid, heardAt, parseSong, serializeSong, songTimeline, summarizeRound, totalScore,
  type Grid, type Piece, type PhraseJudge,
} from './logic';
import { RoundPlay, type Audio } from './RoundPlay';
import s from './jam.module.css';

type Phase =
  | { k: 'intro' }
  | { k: 'round'; round: number; attempt: number }
  | { k: 'roundEnd'; round: number; attempt: number; tries: number; acc: number; points: number; passed: boolean; stars: number }
  | { k: 'compose' }
  | { k: 'song'; back: 'intro' | 'compose' };

function readSong(): Piece[] {
  try {
    return parseSong(localStorage.getItem(SONG_KEY));
  } catch {
    return [];
  }
}
function writeSong(p: Piece[]): void {
  try {
    localStorage.setItem(SONG_KEY, serializeSong(p));
  } catch {
    /* 저장 못 해도 이번 놀이에서는 들린다 */
  }
}

export function JamGame({ ctx }: { ctx: GameContext }) {
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [muted, setMuted] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>(readSong);
  const [noAudio, setNoAudio] = useState(false);
  const [passed, setPassed] = useState([false, false, false]);
  const audioRef = useRef<Audio | null>(null);
  const [audio, setAudio] = useState<Audio | null>(null);
  const mutedRef = useRef(false);
  const prog = useRef({ best: [0, 0, 0], passed: [false, false, false], attempts: [0, 0, 0], added: 0, played: false, start: 0 });
  type RoundEnd = Extract<Phase, { k: 'roundEnd' }>;

  useEffect(() => {
    prog.current.start = performance.now();
    return () => {
      audioRef.current?.transport.stop();
      audioRef.current?.engine.close();
      audioRef.current = null;
    };
  }, []);

  const ensure = (): Audio | null => {
    if (!audioRef.current) {
      const engine = createEngine(mutedRef.current);
      if (!engine) {
        setNoAudio(true);
        return null;
      }
      audioRef.current = { engine, transport: createTransport(engine) };
      setAudio(audioRef.current);
    }
    return audioRef.current;
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    audioRef.current?.engine.setMuted(m);
  };
  const startRound = (round: number, attempt: number) => {
    if (!ensure()) return;
    prog.current.played = true;
    setPhase({ k: 'round', round, attempt });
  };
  const roundDone = (round: number, attempt: number, judges: PhraseJudge[]) => {
    const sum = summarizeRound(judges);
    const p = prog.current;
    p.best[round] = Math.max(p.best[round], sum.points);
    p.attempts[round] += 1;
    if (sum.passed) {
      p.passed[round] = true;
      setPassed(p.passed.slice());
    }
    setPhase({ k: 'roundEnd', round, attempt, tries: p.attempts[round], ...sum } satisfies RoundEnd);
  };
  const addToSong = (g: Grid) => {
    const next = addPiece(pieces, g, Date.now());
    setPieces(next);
    writeSong(next);
    prog.current.added += 1;
  };
  const openSong = (back: 'intro' | 'compose') => {
    if (!ensure()) return;
    setPhase({ k: 'song', back });
  };
  const finish = () => {
    audioRef.current?.transport.stop();
    const p = prog.current;
    if (!p.played && p.added === 0) return ctx.onExit();
    ctx.onExit({
      cleared: p.passed.every(Boolean),
      score: totalScore(p.best, p.added),
      ms: Math.round(performance.now() - p.start),
      detail: { rounds: p.passed.filter(Boolean).length, pieces: p.added },
    });
  };

  const stepOf = phase.k === 'round' || phase.k === 'roundEnd' ? phase.round : phase.k === 'intro' ? -1 : 3;
  return (
    <div className={s.root} data-theme={ctx.theme} data-reduced={ctx.reducedMotion ? '' : undefined}>
      <div className={s.top}>
        <ol className={s.steps} aria-label="놀이 단계">
          {[0, 1, 2, 3].map((k) => {
            const done = k < 3 ? passed[k] : false;
            return (
              <li key={k} data-now={k === stepOf ? '' : undefined} data-done={done ? '' : undefined} aria-current={k === stepOf ? 'step' : undefined}>
                {k < 3 ? <span aria-hidden="true">{k + 1}</span> : <IconNote />}
                <span className={s.sr}>{k < 3 ? `${k + 1}판${done ? ', 넘음' : ''}` : '두 마디 만들기'}</span>
              </li>
            );
          })}
        </ol>
        <div className={s.tools}>
          <button type="button" className={s.tool} onClick={toggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} aria-pressed={muted}>
            <IconSound off={muted} />
            <span className={s.toolText}>{muted ? '소리 켜기' : '소리 끄기'}</span>
          </button>
          <button type="button" className={s.tool} onClick={finish}>
            <IconDoor />
            <span>그만하기</span>
          </button>
        </div>
      </div>
      <div className={s.main}>
        {phase.k === 'intro' ? (
          <section className={s.intro}>
            <div className={s.introArt} aria-hidden="true">
              <DrumArt />
            </div>
            <ol className={s.howto}>
              <li><IconEar /> 들어요</li>
              <li><IconHand /> 따라 쳐요</li>
              <li><IconNote /> 두 마디를 만들어요</li>
            </ol>
            <button type="button" className={`${s.primary} ${s.big}`} onClick={() => startRound(0, 0)}>
              <IconPlay /> 시작
            </button>
            {pieces.length > 0 ? (
              <button type="button" className={s.btn} onClick={() => openSong('intro')}>
                <IconPlay /> 오늘의 곡 듣기 ({pieces.length})
              </button>
            ) : null}
            {noAudio ? <p className={s.note} role="alert">이 브라우저에서는 소리를 낼 수 없어요.</p> : null}
            <p className={s.small}>스윙 리듬은 &quot;둥-가 둥-가&quot; 하고 길고 짧게 흔들려요.</p>
          </section>
        ) : null}
        {phase.k === 'round' && audio ? (
          <RoundPlay
            key={`${phase.round}-${phase.attempt}`}
            round={phase.round}
            attempt={phase.attempt}
            seed={ctx.seed}
            audio={audio}
            onDone={(j) => roundDone(phase.round, phase.attempt, j)}
          />
        ) : null}
        {phase.k === 'roundEnd' ? <RoundCard p={phase} onNext={startRound} onCompose={() => setPhase({ k: 'compose' })} /> : null}
        {phase.k === 'compose' ? (
          <Composer ensure={ensure} seed={ctx.seed} count={pieces.length} onAdd={addToSong} onSong={() => openSong('compose')} onFinish={finish} />
        ) : null}
        {phase.k === 'song' ? <SongPlay ensure={ensure} pieces={pieces} onBack={() => setPhase({ k: phase.back })} /> : null}
      </div>
    </div>
  );
}

function RoundCard({ p, onNext, onCompose }: { p: Extract<Phase, { k: 'roundEnd' }>; onNext: (round: number, attempt: number) => void; onCompose: () => void }) {
  const last = p.round === ROUNDS.length - 1;
  const title = p.passed ? (last ? '세 판을 모두 넘었어요' : `${p.round + 1}판을 넘었어요`) : '한 번 더 들어 볼까요?';
  return (
    <section className={s.card} aria-label={title}>
      <div className={s.stars} aria-hidden="true">
        {[1, 2, 3].map((k) => <IconStar key={k} on={k <= p.stars} />)}
      </div>
      <h3>{title}</h3>
      <p>
        맞힌 정도 {Math.round(p.acc * 100)}% · 점수 {p.points}
      </p>
      <div className={s.actions}>
        {p.passed && !last ? (
          <button type="button" className={`${s.primary} ${s.big}`} onClick={() => onNext(p.round + 1, 0)} autoFocus>
            <IconPlay /> 다음 판
          </button>
        ) : null}
        {p.passed && last ? (
          <button type="button" className={`${s.primary} ${s.big}`} onClick={onCompose} autoFocus>
            <IconNote /> 두 마디 만들기
          </button>
        ) : null}
        {!p.passed ? (
          <button type="button" className={`${s.primary} ${s.big}`} onClick={() => onNext(p.round, p.attempt + 1)} autoFocus>
            <IconPlay /> 다시 하기
          </button>
        ) : null}
        {!p.passed && p.tries >= 2 ? (
          <button type="button" className={s.btn} onClick={onCompose}>
            두 마디 만들기로 가기
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SongPlay({ ensure, pieces, onBack }: { ensure: () => Audio | null; pieces: Piece[]; onBack: () => void }) {
  const grids = useMemo(() => pieces.map((p) => decodeGrid(p.g) ?? emptyGrid()), [pieces]);
  const [cur, setCur] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const loop = useRef({ raf: 0, audio: null as Audio | null });

  const stop = () => {
    const l = loop.current;
    cancelAnimationFrame(l.raf);
    l.audio?.transport.stop();
    setPlaying(false);
    setCur(-1);
  };
  const play = () => {
    const a = ensure();
    if (!a || grids.length === 0) return;
    const l = loop.current;
    l.audio = a;
    const tl = songTimeline(grids);
    const t0 = a.transport.start(tl.events, null);
    setPlaying(true);
    let last = -2;
    const frame = () => {
      const now = heardAt(performance.now(), a.engine.stamp()) - t0;
      if (now >= tl.length) return stop();
      const k = now < 0 ? -1 : Math.min(grids.length - 1, Math.floor(now / (2 * tl.bar)));
      if (k !== last) {
        last = k;
        setCur(k);
        document.querySelector(`[data-piece="${k}"]`)?.scrollIntoView({ block: 'nearest' });
      }
      l.raf = requestAnimationFrame(frame);
    };
    l.raf = requestAnimationFrame(frame);
  };
  useEffect(() => {
    const l = loop.current;
    return () => {
      cancelAnimationFrame(l.raf);
      l.audio?.transport.stop();
    };
  }, []);

  return (
    <section className={s.song} aria-label="오늘의 곡">
      <p className={s.lead}>
        <IconNote /> 지금까지 만든 두 마디 {grids.length}개를 블루스 반주 위에 이어 들어요.
      </p>
      <ol className={s.pieces}>
        {grids.map((g, k) => (
          <li key={k} data-piece={k} data-now={k === cur ? '' : undefined} aria-current={k === cur ? 'true' : undefined}>
            <span className={s.pieceNo}>{k + 1}</span>
            <svg viewBox="0 0 160 70" aria-hidden="true" focusable="false">
              <line x1="80" y1="0" x2="80" y2="70" className={s.pieceBar} />
              {g.map((r, c) => (r === null ? null : <rect key={c} x={c * 10 + 1} y={(SCALE.length - 1 - r) * 10} width="8" height="9" rx="2" data-row={r} />))}
            </svg>
          </li>
        ))}
      </ol>
      <div className={s.actions}>
        {playing ? (
          <button type="button" className={s.primary} onClick={stop}><IconStop /> 멈추기</button>
        ) : (
          <button type="button" className={`${s.primary} ${s.big}`} onClick={play} autoFocus><IconPlay /> 곡 듣기</button>
        )}
        <button type="button" className={s.btn} onClick={() => { stop(); onBack(); }}>돌아가기</button>
      </div>
    </section>
  );
}
