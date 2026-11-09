'use client';
// 1판 서랍 넣기: 낱말 카드 한 장을 아홉 지식 서랍 중 맞는 곳에. 끌어다 놓기, 서랍 누르기(탭·Enter), 숫자 1~9 모두 된다.
import { useEffect, useRef, useState } from 'react';
import { shouldHandleShortcut } from '@/lib/keys';
import type { RoundProps } from './BrainGame';
import { DRAWERS, type Card, type Drawer } from './bank';
import { beginDrag } from './drag';
import { isRightDrawer } from './logic';
import { Icon } from './pictures';
import s from './brain.module.css';

export function DrawerFace({ d, compact }: { d: Drawer; compact?: boolean }) {
  return (
    <>
      <span className={s.dCode}>{d.code}</span>
      <span className={s.dName}>{d.name}</span>
      {!compact && <span className={s.dHint}>{d.hint}</span>}
      <span className={s.dHandle} aria-hidden="true" />
    </>
  );
}

export const drawerOf = (no: number) => DRAWERS[no - 1];

export function RoundDrawers({ cards, play, onProgress, onDone }: RoundProps & { cards: Card[] }) {
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const card = cards[i];
  const answered = chosen !== null;
  const right = chosen !== null && isRightDrawer(card, chosen);

  useEffect(() => {
    heading.current?.focus();
  }, [i]);
  useEffect(() => {
    if (answered) nextBtn.current?.focus();
  }, [answered]);

  const choose = (no: number) => {
    if (answered || !(no >= 1 && no <= 9)) return;
    setChosen(no);
    const ok = isRightDrawer(card, no);
    if (ok) setCorrect((c) => c + 1);
    play('drawer');
    play(ok ? 'good' : 'bad');
  };

  const next = () => {
    if (i + 1 >= cards.length) {
      onDone(correct);
      return;
    }
    onProgress({ at: i + 2, of: cards.length });
    setI(i + 1);
    setChosen(null);
  };

  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleShortcut(e) || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (!/^[1-9]$/.test(e.key)) return;
      e.preventDefault();
      chooseRef.current(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const answer = drawerOf(card.drawer);
  return (
    <section className={s.round} aria-labelledby="brain-r1-q">
      <div className={s.cardRow}>
        <div
          className={s.wordCard}
          data-drag={answered ? undefined : ''}
          data-state={answered ? (right ? 'right' : 'wrong') : undefined}
          onPointerDown={(e) => !answered && beginDrag(e, (drop) => choose(Number(drop.dataset.drop)))}
        >
          <span className={s.cardKicker}>낱말 카드</span>
          <h3 id="brain-r1-q" ref={heading} tabIndex={-1} className={s.cardLabel}>
            {card.label}
          </h3>
        </div>
      </div>
      <div className={s.feedback} aria-live="polite">
        {!answered ? (
          <p className={s.prompt}>어느 서랍에 들어갈까요? 서랍으로 끌어다 놓거나 서랍을 눌러요. 숫자 1~9도 돼요.</p>
        ) : (
          <div className={s.answer} data-state={right ? 'right' : 'wrong'}>
            <p className={s.answerHead}>
              <Icon name={right ? 'check' : 'cross'} />
              {right ? '맞았어요!' : `아쉬워요. 정답은 ${answer.code} ${answer.name} 서랍이에요.`}
            </p>
            <p className={s.why}>
              {card.why} <span className={s.code}>({card.code})</span>
            </p>
            <button ref={nextBtn} type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={next}>
              {i + 1 >= cards.length ? '2판으로' : '다음'} <Icon name="next" />
            </button>
          </div>
        )}
      </div>
      <div className={s.drawerGrid}>
        {DRAWERS.map((d) => {
          const state = !answered ? undefined : d.no === card.drawer ? 'right' : d.no === chosen ? 'wrong' : 'rest';
          return (
            <button
              key={d.no}
              type="button"
              className={s.drawer}
              data-tone={d.no}
              data-drop={d.no}
              data-state={state}
              disabled={answered}
              onClick={() => choose(d.no)}
              aria-keyshortcuts={String(d.no)}
              aria-label={`${d.code} ${d.name} 서랍, ${d.hint}`}
            >
              <DrawerFace d={d} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
