'use client';
// 1판 서랍 넣기: 낱말 카드 한 장을 아홉 지식 서랍 중 맞는 곳에. 끌어다 놓기, 서랍 누르기(탭·Enter), 숫자 1~9 모두 된다.
import { useEffect, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { shouldHandleShortcut } from '@/lib/keys';
import type { RoundProps } from './BrainGame';
import { DRAWERS, type Card, type Drawer } from './bank';
import { beginDrag } from './drag';
import { isRightDrawer } from './logic';
import { Icon } from './pictures';
import s from './brain.module.css';

/** 영어 화면의 서랍 이름: 화면 어디서나 같은 말(좁은 서랍 앞면에 맞는 짧은 이름이 있으면 그것, 없으면 공개 문서의 영어 이름) */
export const drawerEn = (d: Drawer) => d.enShort ?? d.en;

/** 영어 화면의 서랍 이름은 drawerEn. 서랍 앞 한 줄(hint)은 문제은행 글이라 한국어 그대로 */
export function DrawerFace({ d, compact }: { d: Drawer; compact?: boolean }) {
  const en = useLang() === 'en';
  return (
    <>
      <span className={s.dCode}>{d.code}</span>
      <span className={s.dName}>{en ? drawerEn(d) : d.name}</span>
      {!compact && (
        <span className={s.dHint} lang={en ? 'ko' : undefined}>
          {d.hint}
        </span>
      )}
      <span className={s.dHandle} aria-hidden="true" />
    </>
  );
}

export const drawerOf = (no: number) => DRAWERS[no - 1];

export function RoundDrawers({ cards, play, onProgress, onDone }: RoundProps & { cards: Card[] }) {
  const tr = useTr();
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
          <span className={s.cardKicker}>{tr('낱말 카드', 'Word card')}</span>
          <h3 id="brain-r1-q" ref={heading} tabIndex={-1} className={s.cardLabel} lang="ko">
            {card.label}
          </h3>
        </div>
      </div>
      {/* 답한 뒤에도 자리는 남긴다(글만 숨김). 풀이는 서랍 아래에 두어 답할 때 서랍이 손가락 밑에서 움직이지 않는다 */}
      <p className={s.prompt} data-off={answered ? '' : undefined}>
        {tr(
          '어느 서랍에 들어갈까요? 서랍으로 끌어다 놓거나 서랍을 눌러요. 숫자 1~9도 돼요.',
          'Which drawer does it go in? Drag it to a drawer or tap one. Keys 1 to 9 work too.',
        )}
      </p>
      <div className={s.board}>
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
                aria-label={tr(`${d.code} ${d.name} 서랍, ${d.hint}`, `Drawer ${d.code} ${drawerEn(d)}`)}
              >
                <DrawerFace d={d} />
              </button>
            );
          })}
        </div>
        <div className={s.feedback} aria-live="polite">
          {answered && (
            <div className={s.answer} data-state={right ? 'right' : 'wrong'}>
              <p className={s.answerHead}>
                <Icon name={right ? 'check' : 'cross'} />
                {right
                  ? tr('맞았어요!', 'Correct!')
                  : tr(`아쉬워요. 정답은 ${answer.code} ${answer.name} 서랍이에요.`, `Not quite. The answer is drawer ${answer.code} ${drawerEn(answer)}.`)}
              </p>
              <p className={s.why} lang="ko">
                {card.why} <span className={s.code}>({card.code})</span>
              </p>
              <button ref={nextBtn} type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={next}>
                {i + 1 >= cards.length ? tr('2판으로', 'To round 2') : tr('다음', 'Next')} <Icon name="next" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
