'use client';
// 생각 지도 퀴즈: 첫 화면(세 판 퀴즈 · 그림 서랍 놀이) → 1판 서랍 넣기 → 2판 생각이 자라는 순서 → 3판 짝 잇기 → 끝 화면.
// 덮개 화면이 Esc·닫기를 맡으므로 여기서는 Esc를 쓰지 않는다. 마치거나 그만하면 ctx.onExit(result).
// 마친 순간(세 판 통과·그림 여섯 장)에 덮개 화면에 결과를 미리 알린다(ctx.report). 손가락 기기는 그림 놀이가 먼저다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { GAMES } from '../registry';
import type { GameContext, GameResult } from '../types';
import { DRAWERS, KIDS_DRAWERS } from './bank';
import { KidsRound } from './KidsRound';
import { KIDS_COUNT, TOTALS, buildQuiz, kidsResult, quizResult, summarize, type Tally } from './logic';
import { Icon, Pic } from './pictures';
import { RoundDrawers, drawerEn } from './RoundDrawers';
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
/** 위 줄 제목 [한국어, 영어] */
const TITLES: Record<View, readonly [string, string]> = {
  home: ['생각 지도', 'Mind map'],
  r1: ['1판 · 서랍 넣기', 'Round 1 · Drawers'],
  r2: ['2판 · 생각이 자라는 순서', 'Round 2 · How thoughts grow'],
  r3: ['3판 · 짝 잇기', 'Round 3 · Match pairs'],
  done: ['다 했어요', 'All done'],
  kids: ['그림 서랍 놀이', 'Picture drawer game'],
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
  const tr = useTr();
  const sound = useRef<Sound | null>(null);
  const started = useRef(0);
  const kids = useRef({ firstTry: 0, placed: 0 });
  /** 한 번 마친 결과(그림 놀이를 한 번 더 하다 그만해도 마친 것으로 남긴다) */
  const clearedOnce = useRef(false);

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

  const keepCleared = (r: GameResult): GameResult => (clearedOnce.current && !r.cleared ? { ...r, cleared: true } : r);
  const report = (r: GameResult) => {
    if (r.cleared) clearedOnce.current = true;
    if (clearedOnce.current) ctx.report?.(keepCleared(r));
  };

  const stop = () => {
    if (view === 'kids') ctx.onExit(keepCleared(kidsResult(kids.current.firstTry, kids.current.placed, elapsed())));
    else ctx.onExit(keepCleared(quizResult(tally, elapsed(), false)));
  };

  const finishRound = (key: keyof Tally, next: View, correct: number) => {
    const t = { ...tally, [key]: correct };
    setTally(t);
    if (next === 'done') {
      play('clear');
      report(quizResult(t, elapsed(), true));
    }
    go(next);
  };
  const countKids = (firstTry: number, placed: number) => {
    kids.current = { firstTry, placed };
    if (placed > 0) report(kidsResult(firstTry, placed, elapsed()));
  };

  const playing = view === 'r1' || view === 'r2' || view === 'r3' || view === 'kids';
  const rp = { play, still: ctx.reducedMotion, onProgress: setProgress };

  return (
    <div className={s.root} data-theme={ctx.theme} data-still={ctx.reducedMotion ? '' : undefined} data-coarse={ctx.coarse ? '' : undefined}>
      <div className={s.bar}>
        <p className={s.barTitle}>
          <span>{tr(...TITLES[view])}</span>
          {progress && (
            <span className={s.barCount} aria-label={tr(`진행 ${progress.at} / ${progress.of}`, `Progress ${progress.at} of ${progress.of}`)}>
              {progress.at} / {progress.of}
            </span>
          )}
        </p>
        <div className={s.barBtns}>
          <button type="button" className={s.iconBtn} onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? tr('소리 켜기', 'Unmute') : tr('소리 끄기', 'Mute')} title={muted ? tr('소리 켜기', 'Unmute') : tr('소리 끄기', 'Mute')}>
            <Icon name={muted ? 'soundOff' : 'soundOn'} />
          </button>
          {playing && (
            <button type="button" className={s.btn} onClick={stop}>
              <Icon name="door" /> {tr('그만하기', 'Quit')}
            </button>
          )}
        </div>
      </div>
      <div className={s.main}>
        {view === 'home' && <Home coarse={ctx.coarse} onQuiz={() => go('r1')} onKids={() => go('kids')} />}
        {view === 'r1' && <RoundDrawers {...rp} cards={quiz.drawers} onDone={(c) => finishRound('r1', 'r2', c)} />}
        {view === 'r2' && <RoundOrder {...rp} chips={quiz.order.chips} examples={quiz.order.examples} onDone={(c) => finishRound('r2', 'r3', c)} />}
        {view === 'r3' && <RoundPairs {...rp} cards={quiz.pairs.cards} parents={quiz.pairs.parents} onDone={(c) => finishRound('r3', 'done', c)} />}
        {view === 'done' && <Done tally={tally} onFinish={() => ctx.onExit(keepCleared(quizResult(tally, elapsed(), true)))} />}
        {view === 'kids' && (
          <KidsRound
            {...rp}
            seed={ctx.seed}
            onCount={countKids}
            onFinish={() => ctx.onExit(keepCleared(kidsResult(kids.current.firstTry, kids.current.placed, elapsed())))}
          />
        )}
      </div>
    </div>
  );
}

function Home({ coarse, onQuiz, onKids }: { coarse: boolean; onQuiz: () => void; onKids: () => void }) {
  const total = TOTALS.r1 + TOTALS.r2 + TOTALS.r3;
  const lang = useLang();
  const tr = useTr();
  const en = lang === 'en';
  const quiz = (
    <button key="quiz" type="button" className={s.mode} onClick={onQuiz} autoFocus={!coarse}>
      <span className={s.modeIcon}>
        <Icon name="drawers" />
      </span>
      <span className={s.modeText}>
        <strong>{tr('세 판 퀴즈', 'Three-round quiz')}</strong>
        <span>{tr('서랍 넣기, 생각이 자라는 순서, 짝 잇기', 'Drawers, how thoughts grow, match pairs')}</span>
        <span className={s.modeNote}>{tr(`모두 ${total}문제, 70%를 넘기면 통과`, `${total} questions, pass with over 70%`)}</span>
      </span>
    </button>
  );
  // 그림 놀이: 글을 못 읽어도 알아보게 그림 카드 → 같은 색 서랍 미리보기를 붙인다
  const kids = (
    <button key="kids" type="button" className={`${s.mode} ${s.modeKids}`} onClick={onKids} autoFocus={coarse} aria-label={tr('그림 서랍 놀이, 그림 카드를 같은 색 서랍에 넣어요. 글을 몰라도 할 수 있어요', 'Picture drawer game: put each picture card in the drawer of the same color. No reading needed')}>
      <span className={s.modeIcon}>
        <Icon name="kid" />
      </span>
      <span className={s.modeText}>
        <strong>{tr('그림 서랍 놀이', 'Picture drawer game')}</strong>
        <span>{tr('그림 카드를 같은 색 서랍에 쏙', 'Pop picture cards into the same-color drawer')}</span>
        <span className={s.modeNote}>{tr('글을 몰라도 할 수 있어요', 'No reading needed')}</span>
      </span>
      <span className={s.modePreview} aria-hidden="true">
        {KIDS_DRAWERS.map((d) => (
          <span key={d.id} className={`${s.previewPair} ${s[KIDS_TONE[d.id]]}`}>
            <span className={s.previewCard}>
              <Pic name={PREVIEW_CARD[d.id]} />
            </span>
            <span className={s.previewArrow}>
              <Icon name="next" />
            </span>
            <span className={s.previewDrawer}>
              <Pic name={d.id} />
            </span>
          </span>
        ))}
        <span className={s.previewGo}>
          <Icon name="play" />
        </span>
      </span>
    </button>
  );
  return (
    <section className={s.home} data-kids-first={coarse ? '' : undefined} aria-labelledby="brain-home-title">
      <h3 id="brain-home-title" className={s.homeTitle}>
        {tr('생각을 아홉 서랍에 정리해 볼까요?', 'Shall we sort thoughts into nine drawers?')}
      </h3>
      <p className={s.lead}>
        {tr(
          '지식은 100부터 900까지 아홉 서랍에 나눠 담고, 연결, 합치기, 키우기, 나누기 차례로 자라요.',
          'Knowledge goes into nine drawers, 100 to 900, and grows in four steps: Connect, Merge, Develop, Share.',
        )}
      </p>
      {/* 영어 화면: 퀴즈 낱말은 한국어라는 것과 글 없이 하는 그림 놀이를 알린다 */}
      {en && GAMES.brain.koreanNoteEn ? <p className={s.lead}>{GAMES.brain.koreanNoteEn}</p> : null}
      <div className={s.modes}>{coarse ? [kids, quiz] : [quiz, kids]}</div>
      <details className={s.guide}>
        <summary>{tr('서랍 아홉 개 먼저 보기', 'See the nine drawers first')}</summary>
        <ol className={s.guideList}>
          {DRAWERS.map((d) => (
            <li key={d.no} data-tone={d.no}>
              {/* 영어 화면: 영어 이름을 앞에, 퀴즈 낱말과 맞춰 보게 한국어 이름을 곁에(설명은 문제은행 글이라 한국어 그대로) */}
              <b>
                {d.code} {en ? drawerEn(d) : d.name}
              </b>{' '}
              {en ? <span lang="ko">{d.name}</span> : <span lang="en">{d.en}</span>}
              <p lang="ko">{d.about}</p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

/** 첫 화면 미리보기: 서랍마다 들어갈 그림 카드 하나와 그 서랍 */
const KIDS_TONE = { read: 'kRead', screen: 'kScreen', make: 'kMake' } as const;
const PREVIEW_CARD = { read: 'book', screen: 'laptop', make: 'paint' } as const;

function Done({ tally, onFinish }: { tally: Tally; onFinish: () => void }) {
  const sum = summarize(tally);
  const tr = useTr();
  const rows: Array<[string, number, number]> = [
    [tr('1판 서랍 넣기', 'Round 1 · Drawers'), tally.r1, TOTALS.r1],
    [tr('2판 생각이 자라는 순서', 'Round 2 · How thoughts grow'), tally.r2, TOTALS.r2],
    [tr('3판 짝 잇기', 'Round 3 · Match pairs'), tally.r3, TOTALS.r3],
  ];
  return (
    <section className={s.done} aria-labelledby="brain-done-title">
      <span className={s.doneStar} data-on={sum.cleared ? '' : undefined}>
        <Icon name="star" />
      </span>
      <h3 id="brain-done-title" className={s.homeTitle} tabIndex={-1}>
        {sum.cleared ? tr('생각 지도를 잘 정리했어요', 'Your mind map is well sorted') : tr('조금만 더 하면 돼요', 'Almost there')}
      </h3>
      <p className={s.donePercent}>
        <b>{sum.percent}%</b> {tr(`(${sum.total}문제 중 ${sum.correct}문제)`, `(${sum.correct} of ${sum.total} questions)`)}
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
      <p className={s.lead}>
        {sum.cleared
          ? tr('70%를 넘겨 통과했어요.', 'You passed with over 70%.')
          : tr('70%를 넘기면 통과예요. 다시 하면 다른 문제가 나와요.', 'Over 70% passes. Play again for new questions.')}
      </p>
      <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={onFinish} autoFocus>
        <Icon name="check" /> {tr('마치기', 'Finish')}
      </button>
    </section>
  );
}
