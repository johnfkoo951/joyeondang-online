'use client';
// 빛 무늬 퍼즐: 문장 하나를 3·4·5조각으로 나눠 빛 띠 위에 섞어 두고 순서대로 맞춘다(3단계).
// 「그림 힌트」를 켜면 조각마다 창살 빛 그림 한 토막과 해 점이 붙어, 글을 못 읽어도 그림을 이어 맞출 수 있다.
// 조각을 누르면 그 조각의 제자리 음이 나서(힌트 켰을 때) 맞는 순서면 음이 차례로 올라간다.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { correctPrefix, isSolved, puzzleSet, type PuzzleRound, type Sentence } from './logic';
import type { Sound } from './sound';
import { isTypingTarget } from './keys';
import s from './sentences.module.css';

type Props = {
  pool: Sentence[];
  seed: number;
  play: Sound['play'];
  onMiss: () => void;
  onSolved: (stages: number) => void;
};

type Status = 'play' | 'wrong' | 'right' | 'done';

export function LightPuzzle({ pool, seed, play, onMiss, onSolved }: Props) {
  const [run, setRun] = useState(0);
  const [rounds, setRounds] = useState<PuzzleRound[]>(() => puzzleSet(pool, seed));
  const [stage, setStage] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);
  const [status, setStatus] = useState<Status>('play');
  const [hint, setHint] = useState(true);
  const [kept, setKept] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const round = rounds[stage];
  const n = round.pieces.length;
  const left = round.order.filter((i) => !placed.includes(i));

  useEffect(() => heading.current?.focus({ preventScroll: true }), [stage, run]);

  const put = (i: number) => {
    if (status === 'right' || status === 'done' || placed.includes(i)) return;
    const next = [...placed, i];
    play('pick', hint ? i : 2);
    if (next.length < n) {
      setPlaced(next);
      setStatus('play');
      return;
    }
    const texts = next.map((k) => round.pieces[k]);
    if (isSolved(texts, round.pieces)) {
      setPlaced(next);
      play('good');
      onSolved(stage + 1);
      setStatus(stage + 1 >= rounds.length ? 'done' : 'right');
      return;
    }
    const k = correctPrefix(texts, round.pieces);
    onMiss();
    play('bad');
    setKept(k);
    setPlaced(next.slice(0, k));
    setStatus('wrong');
  };

  const take = (slot: number) => {
    if (status === 'right' || status === 'done') return;
    setPlaced(placed.filter((_, j) => j !== slot));
    setStatus('play');
  };

  const nextStage = () => {
    setStage(stage + 1);
    setPlaced([]);
    setStatus('play');
  };

  const again = () => {
    setRounds(puzzleSet(pool, seed + run + 1));
    setRun(run + 1);
    setStage(0);
    setPlaced([]);
    setStatus('play');
  };

  const keys = useRef({ put, take, left, placed });
  useEffect(() => {
    keys.current = { put, take, left, placed };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const k = keys.current;
      if (/^[1-9]$/.test(e.key)) {
        const i = k.left[Number(e.key) - 1];
        if (i !== undefined) {
          e.preventDefault();
          k.put(i);
        }
      } else if (e.key === 'Backspace' && k.placed.length) {
        e.preventDefault();
        k.take(k.placed.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** 그림 힌트: 조각마다 같은 그림의 i번째 토막을 보인다 */
  const pieceStyle = (i: number) => ({ '--n': n, '--p': `${n > 1 ? (i / (n - 1)) * 100 : 0}%` }) as CSSProperties;
  const dots = (i: number) => (hint ? <span className={s.dots} aria-hidden="true">{'●'.repeat(i + 1)}</span> : null);

  return (
    <section className={s.puzzle} aria-labelledby="sent-puz-h" data-hint={hint ? '1' : undefined}>
      <h2 id="sent-puz-h" ref={heading} tabIndex={-1} className={s.title}>
        빛 무늬 퍼즐 <span className={s.stage}>{stage + 1} / {rounds.length} 단계</span>
      </h2>
      <p className={s.lead}>조각을 순서대로 눌러 빛 띠에 올려요. 그림 힌트를 켜면 그림이 이어지게, 점이 하나씩 늘게 놓으면 돼요.</p>
      <div className={s.row}>
        <button type="button" className={s.chip} aria-pressed={hint} onClick={() => setHint(!hint)}>
          {hint ? '그림 힌트 끄기' : '그림 힌트 켜기'}
        </button>
      </div>

      <ol className={s.band} aria-label="빛 띠, 놓은 순서">
        {Array.from({ length: n }, (_, slot) => {
          const i = placed[slot];
          return (
            <li key={slot} className={s.slot}>
              {i === undefined ? (
                <span className={s.empty} aria-label={`${slot + 1}번째 자리 비어 있음`}>{slot + 1}</span>
              ) : (
                <button type="button" className={s.piece} data-placed="1" style={pieceStyle(i)} onClick={() => take(slot)} aria-label={`${slot + 1}번째: ${round.pieces[i]} (눌러서 되돌리기)`}>
                  {dots(i)}
                  <span>{round.pieces[i]}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <p className={s.status} role="status" aria-live="polite">
        {status === 'wrong'
          ? kept
            ? `앞의 ${kept}조각은 맞아요. 나머지를 다시 놓아 봐요.`
            : '순서가 달라요. 처음 조각부터 다시 놓아 봐요.'
          : status === 'right' || status === 'done'
            ? '맞았어요!'
            : `${left.length}조각 남았어요`}
      </p>

      {status === 'right' || status === 'done' ? (
        <div className={s.solved}>
          <p className={s.paperText}>{round.sentence.text}</p>
          <p className={s.paperSource}>출처: {round.sentence.source}</p>
          <div className={s.row}>
            {status === 'right' ? (
              <button type="button" className={s.btnMain} onClick={nextStage} autoFocus>다음 단계</button>
            ) : (
              <button type="button" className={s.btnMain} onClick={again} autoFocus>새 문장으로 다시</button>
            )}
          </div>
        </div>
      ) : (
        <ul className={s.pool} aria-label="섞인 조각">
          {left.map((i, k) => (
            <li key={i}>
              <button type="button" className={s.piece} style={pieceStyle(i)} onClick={() => put(i)} aria-keyshortcuts={k < 9 ? String(k + 1) : undefined}>
                {dots(i)}
                <span>{round.pieces[i]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
