'use client';
// 문장 걸어 두기: 첫 화면(세 갈래) + 읽기 벽 · 옮겨 적기 · 빛 무늬 퍼즐.
// 덮개 화면이 Esc·닫기를 맡으므로 여기서는 Esc를 쓰지 않는다. 마친 뒤로는 진행이 바뀔 때마다 덮개 화면에 결과를 알린다(ctx.report).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { GAMES } from '../registry';
import type { GameContext, GameResult } from '../types';
import type { HangInput, HangState, WallResult } from './actions';
import { CheckIcon, DoorIcon, LightIcon, PenIcon, SoundIcon, WallIcon } from './icons';
import { isCleared, scoreOf, type Progress, type Sentence } from './logic';
import { SAMPLE_SENTENCES } from './samples';
import { createSound, type Sound } from './sound';
import { LightPuzzle } from './LightPuzzle';
import { ReadWall } from './ReadWall';
import { WriteForm } from './WriteForm';
import s from './sentences.module.css';

export type Api = {
  loadWall: () => Promise<WallResult>;
  hangSentence: (input: HangInput) => Promise<HangState>;
};

type View = 'home' | 'read' | 'write' | 'puzzle';
const MUTE_KEY = 'jy.sentences.mute.v1';

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function resultFrom(p: Progress, start: number): GameResult {
  return {
    score: scoreOf(p),
    cleared: isCleared(p),
    ms: Math.round(performance.now() - start),
    detail: { hung: p.hung ? 1 : 0, puzzle: p.solved, read: p.read },
  };
}

export function SentencesGame({ ctx, api }: { ctx: GameContext; api: Api }) {
  const [view, setView] = useState<View>('home');
  const [wall, setWall] = useState<Sentence[] | null>(null);
  const [progress, setProgress] = useState<Progress>({ hung: false, solved: 0, misses: 0, read: 0 });
  const [muted, setMuted] = useState(readMuted);
  const [celebrate, setCelebrate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const started = useRef(0);
  const sound = useRef<Sound | null>(null);
  const wasCleared = useRef(false);
  const lang = useLang();
  const tr = useTr();
  /** 이름이 없을 때 페이지가 넘기는 말(사람 이름이 아니라 화면 말) */
  const unnamed = !ctx.nickname || ctx.nickname === '손님';

  useEffect(() => {
    started.current = performance.now();
    const snd = createSound(readMuted());
    sound.current = snd;
    return () => {
      snd.close();
      sound.current = null;
    };
  }, []);

  useEffect(() => {
    let live = true;
    api.loadWall().then(
      (r) => live && setWall(r.rows),
      () => live && setWall([]),
    );
    return () => {
      live = false;
    };
  }, [api, reloadKey]);

  const play = useCallback<Sound['play']>((k, step) => sound.current?.play(k, step), []);

  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    sound.current?.setMuted(m);
    try {
      window.localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {}
    if (!m) sound.current?.play('pick', 2);
  };

  /** 진행을 바꾸고, 이번에 처음 마쳤으면 축하 띠를 띄운다(이벤트 처리 안에서만 부른다) */
  const bump = (next: Progress, cheer = true) => {
    setProgress(next);
    if (isCleared(next) && !wasCleared.current) {
      wasCleared.current = true;
      if (cheer) setCelebrate(true);
      play('clear');
    }
  };

  const result = (): GameResult => resultFrom(progress, started.current);

  // 마친 상태(문장 하나를 걸었거나 퍼즐 세 단계)가 되면, 그 뒤로 진행이 바뀔 때마다 덮개 화면에 알린다
  useEffect(() => {
    if (isCleared(progress)) ctx.report?.(resultFrom(progress, started.current));
  }, [progress, ctx]);

  const open = (v: View) => {
    if (v === 'read' && progress.read === 0) setProgress({ ...progress, read: 1 });
    setView(v);
  };

  const readable = wall && wall.length ? wall : SAMPLE_SENTENCES;
  const puzzlePool = useMemo(() => [...(wall ?? []).filter((x) => !x.pending || x.mine), ...SAMPLE_SENTENCES], [wall]);
  const nextHref = `/login?next=${encodeURIComponent(`/walk?room=${ctx.room}`)}`;

  return (
    <div className={s.root} data-theme={ctx.theme} data-reduced={ctx.reducedMotion ? '1' : undefined} data-coarse={ctx.coarse ? '1' : undefined}>
      <div className={s.light} aria-hidden="true" />
      <header className={s.bar}>
        {view !== 'home' ? (
          <button type="button" className={s.chip} onClick={() => setView('home')} aria-label={tr('처음 화면으로', 'Back to the start screen')}>
            {tr('처음으로', 'Back')}
          </button>
        ) : lang === 'en' ? (
          // 부르는 이름은 사람이 정한 말이라 옮기지 않는다
          <span className={s.hello}>
            {unnamed ? (
              'Welcome!'
            ) : (
              <>
                Welcome, <span lang="ko">{ctx.nickname}</span>
              </>
            )}
          </span>
        ) : (
          <span className={s.hello}>{ctx.nickname} 님, 어서 오세요</span>
        )}
        <span className={s.grow} />
        <button
          type="button"
          className={s.chip}
          onClick={toggleSound}
          aria-pressed={!muted}
          aria-label={muted ? tr('소리 켜기', 'Unmute') : tr('소리 끄기', 'Mute')}
        >
          <SoundIcon on={!muted} />
        </button>
        <button type="button" className={s.chip} onClick={() => ctx.onExit(result())}>
          <DoorIcon /> {tr('그만하기', 'Quit')}
        </button>
      </header>

      {celebrate ? (
        <div className={s.cheer} role="status">
          <p>
            <strong>{tr('다 했어요!', 'All done!')}</strong>{' '}
            {progress.hung
              ? tr('문장 한 장을 걸어 두었어요.', 'You hung a sentence.')
              : tr('빛 무늬 세 단계를 모두 맞췄어요.', 'You solved all three light puzzle stages.')}
          </p>
          <div className={s.row}>
            <button type="button" className={s.btnMain} onClick={() => ctx.onExit(result())}>
              <CheckIcon /> {tr('결과 보기', 'See results')}
            </button>
            <button type="button" className={s.btn} onClick={() => setCelebrate(false)}>
              {tr('더 놀기', 'Keep playing')}
            </button>
          </div>
        </div>
      ) : null}

      <div className={s.main}>
        {view === 'home' ? (
          <Home onPick={open} progress={progress} />
        ) : view === 'read' ? (
          <ReadWall
            sentences={readable}
            loading={wall === null}
            samplesOnly={!!wall && wall.length === 0}
            play={play}
            onSeen={(n) => {
              if (n > progress.read) setProgress({ ...progress, read: n });
            }}
          />
        ) : view === 'write' ? (
          <WriteForm
            role={ctx.role}
            loginHref={nextHref}
            hang={api.hangSentence}
            play={play}
            onHung={() => {
              // 걸어 둔 화면에 철회 번호가 한 번만 보이므로 축하 띠로 가리지 않고, 그 화면의 「마치기」로 끝낸다
              bump({ ...progress, hung: true }, false);
              setReloadKey((k) => k + 1);
            }}
            onRead={() => setView('read')}
            onFinish={() => ctx.onExit(result())}
          />
        ) : (
          <LightPuzzle
            pool={puzzlePool}
            seed={ctx.seed}
            coarse={ctx.coarse}
            play={play}
            onMiss={() => setProgress({ ...progress, misses: progress.misses + 1 })}
            onSolved={(n) => {
              if (n > progress.solved) bump({ ...progress, solved: n });
            }}
          />
        )}
      </div>
    </div>
  );
}

function Home({ onPick, progress }: { onPick: (v: View) => void; progress: Progress }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const lang = useLang();
  const tr = useTr();
  return (
    <section className={s.home} aria-label={tr('무엇을 할까요', 'What would you like to do?')}>
      <h2 className={s.title}>{tr('문장 걸어 두기', 'Hang a sentence')}</h2>
      <p className={s.lead}>{tr('창살 빛이 드는 벽에 좋은 문장을 한 장씩 걸어요.', 'Hang good sentences, one at a time, on a wall lit through the window lattice.')}</p>
      {/* 영어 화면: 벽의 문장은 한국어라는 것과 글 없이 하는 길을 알린다 */}
      {lang === 'en' && GAMES.sentences.koreanNoteEn ? <p className={s.lead}>{GAMES.sentences.koreanNoteEn}</p> : null}
      <div className={s.picks}>
        <button ref={first} type="button" className={s.pick} onClick={() => onPick('read')}>
          <WallIcon size={56} />
          <span className={s.pickName}>{tr('읽기 벽', 'Reading wall')}</span>
          <span className={s.pickNote}>{tr('걸린 문장을 한 장씩 넘겨 봐요', 'Flip through the hung sentences one by one')}</span>
        </button>
        <button type="button" className={s.pick} onClick={() => onPick('write')}>
          <PenIcon size={56} />
          <span className={s.pickName}>{tr('옮겨 적기', 'Copy a sentence')}</span>
          <span className={s.pickNote}>
            {progress.hung ? tr('한 장 걸었어요', 'You hung one') : tr('문장과 출처를 적어 걸어요', 'Write a sentence and its source, then hang it')}
          </span>
        </button>
        <button type="button" className={s.pick} onClick={() => onPick('puzzle')}>
          <LightIcon size={56} />
          <span className={s.pickName}>{tr('빛 무늬 퍼즐', 'Light puzzle')}</span>
          <span className={s.pickNote}>
            {progress.solved
              ? tr(`${progress.solved} / 3 단계 맞춤`, `${progress.solved} / 3 stages solved`)
              : tr('조각을 순서대로 맞춰요 · 그림만 보고도 돼요', 'Put the pieces in order · the pictures alone are enough')}
          </span>
        </button>
      </div>
    </section>
  );
}
