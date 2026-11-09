'use client';
// 생각 지도 퀴즈: 첫 화면(세 판 퀴즈 · 그림 서랍 놀이) → 1판 서랍 넣기 → 2판 생각이 자라는 순서 → 3판 짝 잇기 → 끝 화면.
// 덮개 화면이 Esc·닫기를 맡으므로 여기서는 Esc를 쓰지 않는다. 마치거나 그만하면 ctx.onExit(result).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameContext } from '../types';
import { DRAWERS } from './bank';
import { KidsRound } from './KidsRound';
import { KIDS_COUNT, TOTALS, buildQuiz, kidsResult, quizResult, summarize, type Tally } from './logic';
import { Icon } from './pictures';
import { RoundDrawers } from './RoundDrawers';
import { RoundOrder } from './RoundOrder';
import { RoundPairs } from './RoundPairs';
import { createSound, type Sound, type SoundKind } from './sound';
import s from './brain.module.css';

type View = 'home' | 'r1' | 'r2' | 'r3' | 'done' | 'kids';
export type Progress = { at: number; of: number } | null;
export type RoundProps = {
  play: (k: SoundKind, step?: number) => void;
  still: boolean;
  onProgress: (p: Progress) => void;
  onDone: (correct: number) => void;
};

const MUTE_KEY = 'jy.brain.mute.v1'; // gitleaks:allow (localStorage 키 이름, 비밀값 아님)
const TITLES: Record<View, string> = {
  home: '생각 지도',
  r1: '1판 · 서랍 넣기',
  r2: '2판 · 생각이 자라는 순서',
  r3: '3판 · 짝 잇기',
  done: '다 했어요',
  kids: '그림 서랍 놀이',
};

/** 판을 열 때의 진행 표시(1판은 문제 수, 2판은 두 단계, 그림 놀이는 넣은 장 수) */
const START: Record<View, Progress> = {
  home: null,
  r1: { at: 1, of: TOTALS.r1 },
  r2: { at: 1, of: 2 },
  r3: null,
  done: null,
  kids: { at: 0, of: KIDS_COUNT },
};

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function BrainGame({ ctx }: { ctx: GameContext }) {
  const [view, setView] = useState<View>('home');
  const [tally, setTally] = useState<Tally>({ r1: 0, r2: 0, r3: 0 });
  const [progress, setProgress] = useState<Progress>(null);
  const [muted, setMuted] = useState(readMuted);
  const quiz = useMemo(() => buildQuiz(ctx.seed), [ctx.seed]);
  const sound = useRef<Sound | null>(null);
  const started = useRef(0);
  const kids = useRef({ firstTry: 0, placed: 0 });

  useEffect(() => {
    started.current = performance.now();
    const snd = createSound(readMuted());
    sound.current = snd;
    return () => {
      snd.close();
      sound.current = null;
    };
  }, []);

  const play = useCallback<RoundProps['play']>((k, step) => sound.current?.play(k, step), []);
  const elapsed = () => performance.now() - started.current;

  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    sound.current?.setMuted(m);
    try {
      window.localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {}
    if (!m) sound.current?.play('pick');
  };

  const go = (v: View) => {
    setProgress(START[v]);
    setView(v);
  };

  const stop = () => {
    if (view === 'kids') ctx.onExit(kidsResult(kids.current.firstTry, kids.current.placed, elapsed()));
    else ctx.onExit(quizResult(tally, elapsed(), false));
  };

  const finishRound = (key: keyof Tally, next: View) => (correct: number) => {
    setTally((t) => ({ ...t, [key]: correct }));
    if (next === 'done') play('clear');
    go(next);
  };

  const playing = view === 'r1' || view === 'r2' || view === 'r3' || view === 'kids';
  const rp = { play, still: ctx.reducedMotion, onProgress: setProgress };

  return (
    <div className={s.root} data-theme={ctx.theme} data-still={ctx.reducedMotion ? '' : undefined} data-coarse={ctx.coarse ? '' : undefined}>
      <div className={s.bar}>
        <p className={s.barTitle}>
          <span>{TITLES[view]}</span>
          {progress && (
            <span className={s.barCount} aria-label={`진행 ${progress.at} / ${progress.of}`}>
              {progress.at} / {progress.of}
            </span>
          )}
        </p>
        <div className={s.barBtns}>
          <button type="button" className={s.iconBtn} onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? '소리 켜기' : '소리 끄기'} title={muted ? '소리 켜기' : '소리 끄기'}>
            <Icon name={muted ? 'soundOff' : 'soundOn'} />
          </button>
          {playing && (
            <button type="button" className={s.btn} onClick={stop}>
              그만하기
            </button>
          )}
        </div>
      </div>
      <div className={s.main}>
        {view === 'home' && <Home onQuiz={() => go('r1')} onKids={() => go('kids')} />}
        {view === 'r1' && <RoundDrawers {...rp} cards={quiz.drawers} onDone={finishRound('r1', 'r2')} />}
        {view === 'r2' && <RoundOrder {...rp} chips={quiz.order.chips} examples={quiz.order.examples} onDone={finishRound('r2', 'r3')} />}
        {view === 'r3' && <RoundPairs {...rp} cards={quiz.pairs.cards} parents={quiz.pairs.parents} onDone={finishRound('r3', 'done')} />}
        {view === 'done' && <Done tally={tally} onFinish={() => ctx.onExit(quizResult(tally, elapsed(), true))} />}
        {view === 'kids' && (
          <KidsRound
            {...rp}
            seed={ctx.seed}
            onCount={(firstTry, placed) => (kids.current = { firstTry, placed })}
            onFinish={() => ctx.onExit(kidsResult(kids.current.firstTry, kids.current.placed, elapsed()))}
          />
        )}
      </div>
    </div>
  );
}

function Home({ onQuiz, onKids }: { onQuiz: () => void; onKids: () => void }) {
  const total = TOTALS.r1 + TOTALS.r2 + TOTALS.r3;
  return (
    <section className={s.home} aria-labelledby="brain-home-title">
      <h3 id="brain-home-title" className={s.homeTitle}>
        생각을 아홉 서랍에 정리해 볼까요?
      </h3>
      <p className={s.lead}>
        지식은 100부터 900까지 아홉 서랍에 나눠 담고, 연결, 합치기, 키우기, 나누기 차례로 자라요.
      </p>
      <div className={s.modes}>
        <button type="button" className={s.mode} onClick={onQuiz} autoFocus>
          <span className={s.modeIcon}>
            <Icon name="drawers" />
          </span>
          <span className={s.modeText}>
            <strong>세 판 퀴즈</strong>
            <span>서랍 넣기, 생각이 자라는 순서, 짝 잇기</span>
            <span className={s.modeNote}>모두 {total}문제, 70%를 넘기면 통과</span>
          </span>
        </button>
        <button type="button" className={`${s.mode} ${s.modeKids}`} onClick={onKids}>
          <span className={s.modeIcon}>
            <Icon name="kid" />
          </span>
          <span className={s.modeText}>
            <strong>그림 서랍 놀이</strong>
            <span>그림 카드를 같은 색 서랍에 쏙</span>
            <span className={s.modeNote}>글을 몰라도 할 수 있어요</span>
          </span>
        </button>
      </div>
      <details className={s.guide}>
        <summary>서랍 아홉 개 먼저 보기</summary>
        <ol className={s.guideList}>
          {DRAWERS.map((d) => (
            <li key={d.no} data-tone={d.no}>
              <b>
                {d.code} {d.name}
              </b>{' '}
              <span lang="en">{d.en}</span>
              <p>{d.about}</p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function Done({ tally, onFinish }: { tally: Tally; onFinish: () => void }) {
  const sum = summarize(tally);
  const rows: Array<[string, number, number]> = [
    ['1판 서랍 넣기', tally.r1, TOTALS.r1],
    ['2판 생각이 자라는 순서', tally.r2, TOTALS.r2],
    ['3판 짝 잇기', tally.r3, TOTALS.r3],
  ];
  return (
    <section className={s.done} aria-labelledby="brain-done-title">
      <span className={s.doneStar} data-on={sum.cleared ? '' : undefined}>
        <Icon name="star" />
      </span>
      <h3 id="brain-done-title" className={s.homeTitle} tabIndex={-1}>
        {sum.cleared ? '생각 지도를 잘 정리했어요' : '조금만 더 하면 돼요'}
      </h3>
      <p className={s.donePercent}>
        <b>{sum.percent}%</b> ({sum.total}문제 중 {sum.correct}문제)
      </p>
      <dl className={s.doneRows}>
        {rows.map(([name, ok, of]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              {ok} / {of}
            </dd>
          </div>
        ))}
      </dl>
      <p className={s.lead}>{sum.cleared ? '70%를 넘겨 통과했어요.' : '70%를 넘기면 통과예요. 다시 하면 다른 문제가 나와요.'}</p>
      <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={onFinish} autoFocus>
        마치기
      </button>
    </section>
  );
}
