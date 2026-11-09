'use client';
import { useEffect, useRef, useState } from 'react';
import { earnStamp } from '@/app/actions';
import { GAMES } from '@/games/registry';
import type { GameContext, GameResult } from '@/games/types';
import type { Role } from '@/lib/access';
import { IconClose } from './icons';
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

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const newSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  } catch {
    return Math.floor(Math.random() * 2 ** 31);
  }
};

// 놀이 덮개 화면. 놀이를 지연 로딩해 빈 칸(stage)에 붙이고, 닫기 단추·Esc를 맡는다(놀이 안에서는 Esc를 쓰지 않는다).
// 놀이가 결과를 넘기면 결과 카드(점수·시간, 다시 하기·닫기)를 보이고, 손님 이상이고 마쳤으면 그 방 도장을 찍는다.
export function GameOverlay({ game, room, nickname, role, coarse, theme, canStamp, onClose }: Props) {
  const meta = GAMES[game];
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<() => void>(onClose);
  const live = useRef({ onClose, nickname, role, coarse, theme, canStamp });
  const [phase, setPhase] = useState<Phase>('loading');
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [stampNote, setStampNote] = useState<string | null>(null);
  useDialogFocus(closeBtn);

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
    let cleanup: (() => void) | null = null;
    const release = () => {
      const c = cleanup;
      cleanup = null;
      try { c?.(); } catch { /* 놀이 정리가 실패해도 덮개는 닫는다 */ }
      el.remove();
    };
    const finish = (r?: GameResult) => {
      if (done) return;
      done = true;
      release();
      if (!r) return live.current.onClose();
      setResult(r);
      setPhase('result');
      if (r.cleared) stamp();
    };
    const stamp = () => {
      const l = live.current;
      if (!l.canStamp) {
        setStampNote('초대 손님으로 들어오면 여기서 이 방 도장을 받아요.');
        return;
      }
      let first = false;
      try { first = markStamped(localStorage, room); } catch { /* 기억 못 해도 도장은 찍는다 */ }
      const fd = new FormData();
      fd.set('room', room);
      earnStamp(fd)
        .then(() => { if (first) setStampNote('이 방 도장을 찍었어요. 수첩에서 볼 수 있어요.'); })
        .catch(() => {});
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
        };
        const c = m.default(el, ctx);
        // 붙이는 도중에 이미 끝났으면 받은 정리 함수를 바로 부른다
        if (done) {
          try { c(); } catch { /* 괜찮다 */ }
          return;
        }
        cleanup = c;
        setPhase('playing');
      })
      .catch(() => { if (!done) setPhase('error'); });
    return () => {
      done = true;
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
    setPhase('loading');
    setRound((n) => n + 1);
  };
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
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

  const title = meta?.title ?? '놀이';
  return (
    <div ref={root} className="game-overlay" role="dialog" aria-modal="true" aria-label={title} onKeyDown={trap}>
      <div className="game-head">
        <h2>{title}</h2>
        <button ref={closeBtn} type="button" className="walk-tool" onClick={close} aria-label="놀이 닫기" title="놀이 닫기 (Esc)" aria-keyshortcuts="Escape">
          <IconClose />
          <span className="walk-tool-text">닫기</span>
        </button>
      </div>
      <div ref={stage} className="game-stage" data-phase={phase} />
      {meta && phase === 'loading' ? <p className="game-note" role="status">놀이를 펴는 중이에요</p> : null}
      {!meta || phase === 'error' ? (
        <div className="game-note walk-card" role="alert">
          <p>놀이를 열지 못했어요. 잠시 뒤 다시 해 주세요.</p>
          <button type="button" className="btn btn-small" onClick={onClose}>닫기</button>
        </div>
      ) : null}
      {phase === 'result' && result ? (
        <ResultCard title={title} result={result} note={stampNote} onAgain={again} onClose={onClose} />
      ) : null}
    </div>
  );
}

function ResultCard({ title, result, note, onAgain, onClose }: { title: string; result: GameResult; note: string | null; onAgain: () => void; onClose: () => void }) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  return (
    <section className="game-result walk-card" aria-label={`${title} 결과`}>
      <h3 ref={head} tabIndex={-1}>{result.cleared ? '해냈어요' : '여기까지 했어요'}</h3>
      <dl className="game-result-nums">
        {typeof result.score === 'number' ? (
          <div><dt>점수</dt><dd>{result.score}</dd></div>
        ) : null}
        <div><dt>걸린 시간</dt><dd>{formatMs(result.ms)}</dd></div>
      </dl>
      {note ? <p className="small" role="status">{note}</p> : null}
      <div className="btn-row">
        <button type="button" className="btn btn-roof btn-small" onClick={onAgain}>다시 하기</button>
        <button type="button" className="btn btn-small" onClick={onClose}>닫기</button>
      </div>
    </section>
  );
}
