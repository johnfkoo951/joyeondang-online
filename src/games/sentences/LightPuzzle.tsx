'use client';
// 빛 무늬 퍼즐: 문장 하나를 3·4·5조각으로 나눠 빛 띠 위에 섞어 두고 순서대로 맞춘다(3단계).
// 「그림 힌트」를 켜면 조각마다 창살 빛 그림 한 토막과 해 점이 붙어, 글을 못 읽어도 그림을 이어 맞출 수 있다.
// 빈 자리에도 같은 수의 점을 찍어 「점 하나 → 점 둘 …」 차례를 숫자 없이 맞춘다. 손가락 기기는 힌트를 끄지 않는다.
// 조각을 누르면 그 조각의 제자리 음이 나서(힌트 켰을 때) 맞는 순서면 음이 차례로 올라간다.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { correctPrefix, isSolved, puzzleSet, type PuzzleRound, type Sentence } from './logic';
import type { Sound } from './sound';
import { AgainIcon, NextIcon } from './icons';
import { isTypingTarget } from './keys';
import s from './sentences.module.css';

type Props = {
  pool: Sentence[];
  seed: number;
  /** 손가락 기기면 그림 힌트 끄기 단추를 숨긴다(늘 켜 둔다) */
  coarse?: boolean;
  play: Sound['play'];
  onMiss: () => void;
  onSolved: (stages: number) => void;
};

type Status = 'play' | 'wrong' | 'right' | 'done';

export function LightPuzzle({ pool, seed, coarse = false, play, onMiss, onSolved }: Props) {
  const [run, setRun] = useState(0);
  const [rounds, setRounds] = useState<PuzzleRound[]>(() => puzzleSet(pool, seed));
  const [stage, setStage] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);
  const [status, setStatus] = useState<Status>('play');
  const [hint, setHint] = useState(true);
  const [kept, setKept] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const en = useLang() === 'en';
  const tr = useTr();
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
  const dotRow = (i: number) => (
    <span className={s.dots} aria-hidden="true">
      {Array.from({ length: i + 1 }, (_, k) => (
        <i key={k} />
      ))}
    </span>
  );
  const dots = (i: number) => (hint ? dotRow(i) : null);

  return (
    <section className={s.puzzle} aria-labelledby="sent-puz-h" data-hint={hint ? '1' : undefined}>
      <h2 id="sent-puz-h" ref={heading} tabIndex={-1} className={s.title}>
        {tr('빛 무늬 퍼즐', 'Light puzzle')}{' '}
        <span className={s.stage}>{tr(`${stage + 1} / ${rounds.length} 단계`, `Stage ${stage + 1} / ${rounds.length}`)}</span>
      </h2>
      <p className={s.lead}>
        {coarse
          ? tr(
              '점이 하나, 둘, 셋 늘어나게 조각을 눌러 빛 띠에 올려요. 그림이 이어지면 맞아요.',
              'Tap the pieces so the dots go one, two, three, and they land on the light band. When the picture joins up, it’s right.',
            )
          : tr(
              '조각을 순서대로 눌러 빛 띠에 올려요. 그림 힌트를 켜면 그림이 이어지게, 점이 하나씩 늘게 놓으면 돼요.',
              'Tap the pieces in order to put them on the light band. With picture hints on, place them so the picture joins up and the dots grow one by one.',
            )}
      </p>
      {coarse ? null : (
        <div className={s.row}>
          <button type="button" className={s.chip} aria-pressed={hint} onClick={() => setHint(!hint)}>
            {hint ? tr('그림 힌트 끄기', 'Hide picture hints') : tr('그림 힌트 켜기', 'Show picture hints')}
          </button>
        </div>
      )}

      <ol className={s.band} aria-label={tr('빛 띠, 놓은 순서', 'Light band, in the order placed')}>
        {Array.from({ length: n }, (_, slot) => {
          const i = placed[slot];
          return (
            <li key={slot} className={s.slot}>
              {i === undefined ? (
                <span className={s.empty} aria-label={tr(`${slot + 1}번째 자리 비어 있음`, `Spot ${slot + 1}, empty`)}>
                  {dotRow(slot)}
                </span>
              ) : (
                <button
                  type="button"
                  className={s.piece}
                  data-placed="1"
                  style={pieceStyle(i)}
                  onClick={() => take(slot)}
                  aria-label={tr(`${slot + 1}번째: ${round.pieces[i]} (눌러서 되돌리기)`, `Spot ${slot + 1}: ${round.pieces[i]} (tap to take back)`)}
                  lang={en ? 'ko' : undefined}
                >
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
            ? tr(`앞의 ${kept}조각은 맞아요. 나머지를 다시 놓아 봐요.`, `The first ${kept === 1 ? 'piece is' : `${kept} pieces are`} right. Place the rest again.`)
            : tr('순서가 달라요. 처음 조각부터 다시 놓아 봐요.', 'The order is off. Start again from the first piece.')
          : status === 'right' || status === 'done'
            ? tr('맞았어요!', 'Correct!')
            : tr(`${left.length}조각 남았어요`, `${left.length} ${left.length === 1 ? 'piece' : 'pieces'} left`)}
      </p>

      {status === 'right' || status === 'done' ? (
        <div className={s.solved}>
          <p className={s.paperText} lang="ko">
            {round.sentence.text}
          </p>
          <p className={s.paperSource}>
            {en ? (
              <>
                Source: <span lang="ko">{round.sentence.source}</span>
              </>
            ) : (
              <>출처: {round.sentence.source}</>
            )}
          </p>
          <div className={s.row}>
            {status === 'right' ? (
              <button type="button" className={s.btnMain} onClick={nextStage} autoFocus>
                <NextIcon /> {tr('다음 단계', 'Next stage')}
              </button>
            ) : (
              <button type="button" className={s.btnMain} onClick={again} autoFocus>
                <AgainIcon /> {tr('새 문장으로 다시', 'Again with a new sentence')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className={s.pool} aria-label={tr('섞인 조각', 'Shuffled pieces')}>
          {left.map((i, k) => (
            <li key={i}>
              <button
                type="button"
                className={s.piece}
                style={pieceStyle(i)}
                onClick={() => put(i)}
                aria-keyshortcuts={k < 9 ? String(k + 1) : undefined}
                lang={en ? 'ko' : undefined}
              >
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
