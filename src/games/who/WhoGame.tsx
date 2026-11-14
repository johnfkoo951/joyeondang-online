'use client';
// 누구의 문장일까: 종이 인형극처럼 막 아래에서 문장 카드가 올라오면, 이 집에 사는 사람 중 누가 한 말인지 인형을 눌러 맞힌다.
// 맞히든 틀리든 그 사람 소개 카드를 보여 주고, 끝에는 모든 사람 카드를 모아 보여 준다(보상은 카드).
// 카드는 명단 손님에게만 서버가 준다(/api/who). 받지 못하면 지어낸 종이 인형 연습판으로 논다.
// 덮개 화면이 Esc·닫기를 맡으므로 여기서는 Esc를 쓰지 않는다. 마지막 판을 답하면 덮개 화면에 결과를 미리 알린다(ctx.report).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { shouldHandleShortcut } from '@/lib/keys';
import { GAMES } from '../registry';
import type { GameContext, GameResult } from '../types';
import { IconArt, IconCheck, IconDoor, IconNext, IconPicture, PaperDoll, SoundArt, StarArt } from './art';
import { cleanDeck, countWord, countWordEn, pickRounds, scoreOf, type Deck, type Person } from './logic';
import { SAMPLE_DECK } from './samples';
import { createSound, type Sound, type WhoSound } from './sound';
import s from './who.module.css';

type Loaded = { deck: Deck; sample: boolean };
type Phase = 'intro' | 'ask' | 'reveal' | 'end';
type Answer = { picked: string; right: boolean };

const MUTE_KEY = 'jy.who.mute.v1';
const FETCH_MS = 5000;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 서버 카드(명단 손님만). 404·연결 끊김·모양 틀림이면 null */
async function fetchDeck(signal: AbortSignal): Promise<Deck | null> {
  const res = await fetch('/api/who', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal });
  if (!res.ok) return null;
  const body: unknown = await res.json();
  return body && typeof body === 'object' ? cleanDeck((body as { deck?: unknown }).deck) : null;
}

export function WhoGame({ ctx }: { ctx: GameContext }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  // 「그림 짝」: 문장 카드에 말한 사람의 그림을 붙인다(글을 못 읽어도 그림끼리 맞출 수 있게). 손가락 기기는 켜고 시작
  const [pictures, setPictures] = useState(ctx.coarse);
  const [muted, setMuted] = useState(readMuted);
  const [focus, setFocus] = useState(0);
  const sound = useRef<Sound | null>(null);
  const started = useRef(0);
  const dollRow = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const lang = useLang();
  const tr = useTr();
  const en = lang === 'en';

  useEffect(() => {
    const snd = createSound(readMuted());
    sound.current = snd;
    return () => {
      snd.close();
      sound.current = null;
    };
  }, []);

  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), FETCH_MS);
    const done = (deck: Deck | null) => {
      if (live) setLoaded(deck ? { deck, sample: false } : { deck: SAMPLE_DECK, sample: true });
    };
    fetchDeck(ac.signal).then(done, () => done(null));
    return () => {
      live = false;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, []);

  const deck = loaded?.deck ?? null;
  const rounds = useMemo(() => (deck ? pickRounds(deck, ctx.seed) : []), [deck, ctx.seed]);
  const byId = useMemo(() => new Map((deck?.people ?? []).map((p) => [p.id, p])), [deck]);
  const round = rounds[idx];
  const speaker = round ? byId.get(round.who) : undefined;
  const answer = answers[idx];
  const right = scoreOf(answers);

  const play = (k: WhoSound) => sound.current?.play(k);
  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    sound.current?.setMuted(m);
    try {
      window.localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* 기억 못 해도 된다 */
    }
  };

  const resultOf = (list: Answer[], cleared: boolean): GameResult => ({
    cleared,
    score: scoreOf(list),
    ms: Math.max(0, Math.round(performance.now() - started.current)),
    detail: { right: scoreOf(list), rounds: rounds.length, sample: loaded?.sample ? 1 : 0 },
  });

  const focusDoll = (i: number) => {
    setFocus(i);
    requestAnimationFrame(() => dollRow.current?.querySelector<HTMLElement>(`[data-doll="${i}"]`)?.focus({ preventScroll: true }));
  };

  const start = () => {
    if (!deck || rounds.length === 0) return;
    started.current = performance.now();
    play('open');
    window.setTimeout(() => play('rise'), 250);
    setIdx(0);
    setAnswers([]);
    setPhase('ask');
    focusDoll(0);
  };

  const pick = (id: string) => {
    if (phase !== 'ask' || !round) return;
    const ok = id === round.who;
    const list = [...answers.slice(0, idx), { picked: id, right: ok }];
    setAnswers(list);
    setPhase('reveal');
    play(ok ? 'right' : 'wrong');
    // 마지막 판을 답했으면 여기서 마친 것(맞힌 수와 상관없이 카드를 모은다)
    if (idx >= rounds.length - 1) ctx.report?.(resultOf(list, true));
    requestAnimationFrame(() => {
      nextBtn.current?.focus({ preventScroll: true });
      nextBtn.current?.scrollIntoView({ block: 'nearest', behavior: ctx.reducedMotion ? 'auto' : 'smooth' });
    });
  };

  const next = () => {
    if (phase !== 'reveal') return;
    if (idx >= rounds.length - 1) {
      play('end');
      setPhase('end');
      return;
    }
    setIdx(idx + 1);
    setPhase('ask');
    play('rise');
    focusDoll(focus);
  };

  const finish = () => ctx.onExit(resultOf(answers, true));
  const stop = () => {
    if (phase === 'end' || answers.length >= rounds.length) return finish();
    if (answers.length === 0) return ctx.onExit();
    ctx.onExit(resultOf(answers, false));
  };

  // 숫자 1~8로 인형 고르기, Enter로 시작·다음(단추 위의 Enter는 그 단추 몫, 한글 조합 중이면 무시)
  const keys = useRef({ phase, people: deck?.people ?? [], pick, start, next });
  useEffect(() => {
    keys.current = { phase, people: deck?.people ?? [], pick, start, next };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleShortcut(e) || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = keys.current;
      if (/^[1-9]$/.test(e.key) && k.phase === 'ask') {
        const p = k.people[Number(e.key) - 1];
        if (!p) return;
        e.preventDefault();
        k.pick(p.id);
        return;
      }
      if (e.key !== 'Enter' || (e.target instanceof HTMLElement && e.target.closest('button, a'))) return;
      if (k.phase === 'intro') {
        e.preventDefault();
        k.start();
      } else if (k.phase === 'reveal') {
        e.preventDefault();
        k.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 방향키로 인형 사이를 옮긴다(인형 줄은 Tab 자리 하나)
  const rove = (e: RKeyboardEvent<HTMLDivElement>) => {
    const n = deck?.people.length ?? 0;
    if (e.nativeEvent.isComposing || e.keyCode === 229 || n === 0) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    let i = focus;
    if (e.key in step) i = (focus + step[e.key] + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    focusDoll(i);
  };

  const people = deck?.people ?? [];
  const word = countWord(people.length);
  const who = loaded?.sample ? '인형' : '사람';
  // 영어 화면: 연습판은 doll, 이 집 카드는 person(사람 이름·소개·문장은 사람이 쓴 글이라 옮기지 않는다)
  const whoEn = loaded?.sample ? 'doll' : 'person';
  return (
    <div className={s.root} data-theme={ctx.theme} data-still={ctx.reducedMotion ? '' : undefined} data-coarse={ctx.coarse ? '' : undefined}>
      <header className={s.bar}>
        <p className={s.barTitle}>
          {loaded?.sample ? (
            <span className={s.sampleTag} title={tr('이 집 사람들의 카드 대신 지어낸 종이 인형으로 놀아요', 'Plays with made-up paper dolls instead of the family’s cards')}>
              {tr('연습판', 'Practice')}
            </span>
          ) : null}
          {phase === 'ask' || phase === 'reveal' ? (
            <span className={s.count} aria-label={tr(`${rounds.length}판 중 ${idx + 1}번째`, `Round ${idx + 1} of ${rounds.length}`)}>
              {idx + 1} / {rounds.length}
            </span>
          ) : null}
        </p>
        <div className={s.tools}>
          <button
            type="button"
            className={s.tool}
            aria-pressed={pictures}
            onClick={() => setPictures(!pictures)}
            title={tr('문장 카드에 말한 사람의 그림을 붙여요', 'Adds the speaker’s picture to the sentence card')}
          >
            <IconPicture />
            <span className={s.toolText}>{tr('그림 짝', 'Picture match')}</span>
          </button>
          <button type="button" className={s.tool} aria-pressed={muted} onClick={toggleSound} aria-label={muted ? tr('소리 켜기', 'Unmute') : tr('소리 끄기', 'Mute')}>
            <SoundArt off={muted} />
          </button>
          <button type="button" className={s.tool} onClick={stop}>
            <IconDoor />
            <span>{tr('그만하기', 'Quit')}</span>
          </button>
        </div>
      </header>

      {phase === 'end' ? (
        <End
          people={people}
          answers={answers}
          rounds={rounds.length}
          title={tr(
            `${word} ${who} 카드를 모았어요`,
            whoEn === 'doll' ? `You collected all ${countWordEn(people.length)} doll cards` : `You collected cards for all ${countWordEn(people.length)} people`,
          )}
          onFinish={finish}
        />
      ) : (
        <>
          <section className={s.stage} data-open={phase !== 'intro' ? '' : undefined} aria-label={tr('무대', 'Stage')}>
            <span className={s.curtainL} aria-hidden="true" />
            <span className={s.curtainR} aria-hidden="true" />
            <span className={s.valance} aria-hidden="true" />
            <div className={s.stageInner}>
              {!loaded ? (
                <p className={s.wait} role="status">
                  {tr('막을 여는 중이에요', 'Opening the curtain')}
                </p>
              ) : phase === 'intro' ? (
                <div className={s.introBox}>
                  <h3 className={s.title}>{tr('누구의 문장일까?', 'Whose sentence is it?')}</h3>
                  <p className={s.lead}>
                    {tr(
                      `막 뒤에서 문장이 올라와요. 누가 한 말인지 아래 ${who}을 눌러 맞혀요.`,
                      `A sentence rises from behind the curtain. Tap a ${whoEn} below to guess who said it.`,
                    )}
                  </p>
                  {/* 영어 화면: 문장은 한국어라는 것과 그림 짝으로 하는 길을 알린다 */}
                  {en && GAMES.who.koreanNoteEn ? <p className={s.lead}>{GAMES.who.koreanNoteEn}</p> : null}
                  <button type="button" className={`${s.primary} ${s.big}`} onClick={start} autoFocus>
                    <IconNext /> {tr('시작', 'Start')}
                  </button>
                </div>
              ) : round ? (
                <figure
                  key={idx}
                  className={s.card}
                  data-state={answer ? (answer.right ? 'right' : 'wrong') : undefined}
                  data-color={pictures && speaker ? speaker.color : undefined}
                >
                  {pictures && speaker ? (
                    <span className={s.cardPic} aria-hidden="true">
                      <IconArt name={speaker.icon} size={30} />
                    </span>
                  ) : null}
                  <blockquote className={s.cardText} aria-live="polite" lang="ko">
                    {round.text}
                  </blockquote>
                  {pictures && speaker ? (
                    en ? (
                      <figcaption className={s.sr}>
                        Picture match: the picture of <span lang="ko">{speaker.name}</span> is attached
                      </figcaption>
                    ) : (
                      <figcaption className={s.sr}>그림 짝: {speaker.name}의 그림이 붙어 있어요</figcaption>
                    )
                  ) : null}
                </figure>
              ) : null}
            </div>
            <span className={s.lights} aria-hidden="true" />
          </section>

          {loaded ? (
            <div
              ref={dollRow}
              className={s.dolls}
              role="group"
              aria-label={
                phase === 'ask'
                  ? tr(`누가 한 말일까요? ${who}을 골라요. 숫자 1부터 ${people.length}까지로도 골라요`, `Who said it? Pick a ${whoEn}. You can also use keys 1 to ${people.length}`)
                  : tr(`${word} ${who}`, `${countWordEn(people.length)} ${whoEn === 'doll' ? 'dolls' : 'people'}`)
              }
              onKeyDown={rove}
            >
              {people.map((p, i) => {
                const picked = answer?.picked === p.id;
                const isSpeaker = phase === 'reveal' && round?.who === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-doll={i}
                    className={s.dollBtn}
                    data-color={p.color}
                    data-hop={isSpeaker && answer?.right ? '' : undefined}
                    data-answer={isSpeaker ? '' : undefined}
                    data-miss={picked && !answer?.right ? '' : undefined}
                    disabled={phase !== 'ask'}
                    tabIndex={i === focus ? 0 : -1}
                    aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                    aria-label={tr(`${i + 1}번 ${p.name}`, `${i + 1}. ${p.name}`)}
                    lang={en ? 'ko' : undefined}
                    onFocus={() => setFocus(i)}
                    onClick={() => pick(p.id)}
                  >
                    <PaperDoll icon={p.icon} />
                    <span className={s.dollName}>{p.name}</span>
                    {isSpeaker && answer?.right ? (
                      <span className={s.dollStar}>
                        <StarArt />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {phase === 'reveal' && speaker && answer ? (
            <section className={s.reveal} aria-live="polite">
              <p className={s.verdict} data-right={answer.right ? '' : undefined}>
                {answer.right ? (
                  tr('맞았어요!', 'Correct!')
                ) : en ? (
                  <>
                    Said by <span lang="ko">{speaker.name}</span>.
                  </>
                ) : (
                  `${speaker.name}의 문장이에요.`
                )}
              </p>
              <PersonCard person={speaker} />
              <button ref={nextBtn} type="button" className={`${s.primary} ${s.big}`} onClick={next}>
                <IconNext /> {tr('다음', 'Next')}
              </button>
            </section>
          ) : null}
        </>
      )}
      <p className={s.sr} role="status">
        {phase === 'end' ? tr(`${rounds.length}판 중 ${right}판 맞혔어요.`, `You got ${right} of ${rounds.length} right.`) : ''}
      </p>
    </div>
  );
}

function PersonCard({ person }: { person: Person }) {
  return (
    <article className={s.person} data-color={person.color}>
      <span className={s.personDoll}>
        <PaperDoll icon={person.icon} />
      </span>
      {/* 이름·소개는 사람이 쓴 글이라 옮기지 않는다 */}
      <div className={s.personText} lang="ko">
        <h4 className={s.personName}>
          <span className={s.personIcon} aria-hidden="true">
            <IconArt name={person.icon} size={20} />
          </span>
          {person.name}
        </h4>
        <p>{person.intro}</p>
      </div>
    </article>
  );
}

function End({ people, answers, rounds, title, onFinish }: { people: Person[]; answers: Answer[]; rounds: number; title: string; onFinish: () => void }) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus({ preventScroll: true }), []);
  const right = scoreOf(answers);
  const tr = useTr();
  return (
    <section className={s.end} aria-labelledby="who-end-title">
      <h3 id="who-end-title" ref={head} tabIndex={-1} className={s.title}>
        {title}
      </h3>
      <p className={s.score}>
        <span className={s.scoreStars} aria-hidden="true">
          {Array.from({ length: rounds }, (_, k) => (
            <span key={k} data-on={answers[k]?.right ? '' : undefined}>
              <StarArt />
            </span>
          ))}
        </span>
        <b>
          {right}/{rounds}
        </b>{' '}
        {tr('맞혔어요', 'right')}
      </p>
      <div className={s.grid}>
        {people.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </div>
      <button type="button" className={`${s.primary} ${s.big}`} onClick={onFinish}>
        <IconCheck /> {tr('마치기', 'Finish')}
      </button>
    </section>
  );
}
