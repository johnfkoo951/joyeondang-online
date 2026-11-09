'use client';
// 문장 걸어 두기: 첫 화면(세 갈래) + 읽기 벽 · 옮겨 적기 · 빛 무늬 퍼즐.
// 덮개 화면이 Esc·닫기를 맡으므로 여기서는 Esc를 쓰지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameContext, GameResult } from '../types';
import type { HangInput, HangState, WallResult } from './actions';
import { LightIcon, PenIcon, SoundIcon, WallIcon } from './icons';
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

  const result = (): GameResult => ({
    score: scoreOf(progress),
    cleared: isCleared(progress),
    ms: Math.round(performance.now() - started.current),
    detail: { hung: progress.hung ? 1 : 0, puzzle: progress.solved, read: progress.read },
  });

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
          <button type="button" className={s.chip} onClick={() => setView('home')} aria-label="처음 화면으로">
            처음으로
          </button>
        ) : (
          <span className={s.hello}>{ctx.nickname} 님, 어서 오세요</span>
        )}
        <span className={s.grow} />
        <button type="button" className={s.chip} onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? '소리 켜기' : '소리 끄기'}>
          <SoundIcon on={!muted} />
        </button>
        <button type="button" className={s.chip} onClick={() => ctx.onExit(result())}>
          그만하기
        </button>
      </header>

      {celebrate ? (
        <div className={s.cheer} role="status">
          <p>
            <strong>다 했어요!</strong> {progress.hung ? '문장 한 장을 걸어 두었어요.' : '빛 무늬 세 단계를 모두 맞췄어요.'}
          </p>
          <div className={s.row}>
            <button type="button" className={s.btnMain} onClick={() => ctx.onExit(result())}>결과 보기</button>
            <button type="button" className={s.btn} onClick={() => setCelebrate(false)}>더 놀기</button>
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
  return (
    <section className={s.home} aria-label="무엇을 할까요">
      <h2 className={s.title}>문장 걸어 두기</h2>
      <p className={s.lead}>창살 빛이 드는 벽에 좋은 문장을 한 장씩 걸어요.</p>
      <div className={s.picks}>
        <button ref={first} type="button" className={s.pick} onClick={() => onPick('read')}>
          <WallIcon size={56} />
          <span className={s.pickName}>읽기 벽</span>
          <span className={s.pickNote}>걸린 문장을 한 장씩 넘겨 봐요</span>
        </button>
        <button type="button" className={s.pick} onClick={() => onPick('write')}>
          <PenIcon size={56} />
          <span className={s.pickName}>옮겨 적기</span>
          <span className={s.pickNote}>{progress.hung ? '한 장 걸었어요' : '문장과 출처를 적어 걸어요'}</span>
        </button>
        <button type="button" className={s.pick} onClick={() => onPick('puzzle')}>
          <LightIcon size={56} />
          <span className={s.pickName}>빛 무늬 퍼즐</span>
          <span className={s.pickNote}>{progress.solved ? `${progress.solved} / 3 단계 맞춤` : '조각을 순서대로 맞춰요 · 그림만 보고도 돼요'}</span>
        </button>
      </div>
    </section>
  );
}
