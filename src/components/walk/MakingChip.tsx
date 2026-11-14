'use client';
import { useEffect, type MouseEvent } from 'react';
import { Say } from '@/components/avatar/Say';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { MESSAGES } from '@/lib/avatar/rules';
import { tr, type Lang } from '@/lib/i18n';
import {
  READY_NOTE_MS, clearMaking, formatElapsed, makingPercent, makingStage, seeMaking, type Making,
} from './making';
// READY_NOTE_MS: 3D를 맡길 수 없어 고를 것이 없는 확인 카드는 예전 알림처럼 이만큼 뒤 저절로 닫힌다(PickCard의 autoClose)
import {
  MODEL_NOTE_MS, MODEL_STEPS, MODEL_STEPS_EN, clearModelMaking, modelChipText, modelNote, modelPercent, modelStage, seeModelMaking, type ModelMaking,
} from './making-3d';
import { PickCard } from './PickCard';
import { useMaking, useModelMaking, useSecondClock } from './useMaking';
import css from './Making.module.css';

// 사진 캐릭터를 그리는 중(2D)과 3D 모형을 만드는 중일 때 메인 화면 왼쪽 위에 남는 작은 칩들과 알림 카드.
//   2D: 그리는 중 칩(「캐릭터 차례 기다리는 중 · 앞에 N명」 → 「캐릭터 그리는 중」) → 다 그리면 확인 카드(새 그림을 크게,
//       「이걸로 3D 만들기」와 「다른 그림 더 만들고 나중에 고르기」. PickCard) / 못 그리면 까닭 카드
//   3D: 만드는 중 칩(「3D 차례 기다리는 중」(오래 기다리면 「늦어지는 중」) → 「3D 만드는 중」) → 다 되면 짧은 알림 / 못 만들면
//       까닭과 셈 안내 카드. 2D 확인 카드가 떠 있는 동안은 3D의 끝(다 됨·못 만듦)을 칩 하나로 접는다(누르면 창에서 본다)
// 캐릭터 창을 닫아도 남고, 칩을 누르면 창이 다시 열린다. 창이 열려 있는 동안(hidden)은 창 안의 진행 상자가 대신 보인다.
// 자리(dock)는 위 단추 줄 아래에서 시작해 화면 아래(손가락 기기는 스틱 자리 위)에서 끝나고, 넘치면 그 안에서 스크롤한다.
// 걸린 시간은 화면에만 보이고, 화면 낭독기에는 단계가 바뀔 때만 한 줄 알린다(1초마다 읽지 않게).
// 화면 말: 보이는 글은 두 말을 함께 싣고(T), 속성은 지금 말로 고른다. 서버가 준 까닭·셈 안내는 보일 때 옮긴다(Say).

const running = (m: Making | null): boolean => m !== null && (m.phase === 'queued' || m.phase === 'drawing');
const running3d = (m: ModelMaking | null): boolean => m !== null && (m.phase === 'waiting' || m.phase === 'making');

/** 마우스로 누른 단추는 초점을 놓는다(뒤의 Space가 점프 대신 이 단추를 다시 누르지 않게) */
const tap = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  if (e.detail !== 0) e.currentTarget.blur();
  fn();
};

/** wearing: 지금 입은 사진 캐릭터의 그림 id(3D 알림의 말을 고른다) */
export function MakingChip({ hidden = false, onOpen, wearing = null }: { hidden?: boolean; onOpen: () => void; wearing?: string | null }) {
  const m = useMaking();
  const m3 = useModelMaking();
  const now = useSecondClock((running(m) || running3d(m3)) && !hidden);
  // 다 된 3D 알림은 잠시 뒤 저절로 접는다(못 만든 알림과 2D 확인 카드는 닫을 때까지 둔다: 고를 것이 있다)
  useEffect(() => {
    if (!m3 || m3.phase !== 'ready' || m3.seen || hidden) return;
    const left = Math.max(1500, MODEL_NOTE_MS - (Date.now() - (m3.doneAt ?? 0)));
    const t = window.setTimeout(seeModelMaking, left);
    return () => window.clearTimeout(t);
  }, [m3, hidden]);
  if (hidden) return null;

  /** 2D 확인 카드가 떠 있다(고를 때까지 남는다): 3D의 끝 알림은 칩 하나로 접어 카드와 스틱 자리를 덮지 않게 */
  const picking = m !== null && !running(m) && !m.seen && m.phase === 'ready';
  const two = !m ? null : running(m) ? (
    <DrawChip m={m} now={now} onOpen={onOpen} />
  ) : m.seen ? null : m.phase === 'ready' ? (
    <PickCard
      key={m.id} id={m.id} where="walk" onClose={() => clearMaking(m.id)} onSent={() => clearMaking(m.id)}
      onOpenPanel={onOpen} autoClose={{ after: READY_NOTE_MS, from: m.doneAt ?? 0 }}
    />
  ) : (
    <div className={`walk-making ${css.card}`} data-tone="fail" role="alert">
      <span className={css.failMark} aria-hidden="true">!</span>
      <p className={css.cardTitle}><T ko="캐릭터를 그리지 못했어요" en="Couldn't draw your character" /></p>
      <p className={css.cardLine}><Say text={m.message ?? '이번 사진으로는 그림을 만들지 못했어요.'} /></p>
      <div className={css.cardBtns}>
        {/* 창을 먼저 열어(사진 탭으로 열리게) 그다음 못 그린 기록을 지운다 */}
        <button type="button" className="btn btn-small btn-pine" onClick={tap(() => { onOpen(); window.setTimeout(() => clearMaking(m.id), 0); })}>
          <T ko="다시 해 보기" en="Retry" />
        </button>
        <button type="button" className="btn btn-small" onClick={tap(() => clearMaking(m.id))}><T ko="닫기" en="Close" /></button>
      </div>
    </div>
  );

  const three = !m3 ? null : running3d(m3) ? (
    <ModelChip m={m3} now={now} onOpen={onOpen} />
  ) : m3.seen ? null : picking ? (
    <DoneChip m={m3} onOpen={onOpen} />
  ) : m3.phase === 'ready' ? (
    <div className={`walk-making ${css.card}`} role="status">
      {/* 비공개 그림이라 이미지 최적화 서버를 거치지 않고 세션으로 바로 받는다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={css.thumb} src={`/api/avatar/${m3.id}`} alt="" />
      <p className={css.cardTitle}><T ko="3D가 다 됐어요" en="Your 3D is ready" /></p>
      <p className={css.cardLine}>
        {wearing === m3.id
          ? <T ko="지금 3D로 걷고 있어요." en="You're walking in 3D now." />
          : <T ko="이 캐릭터를 입으면 3D로 걸어요. 캐릭터 창에서 고를 수 있어요." en="Wear this character to walk in 3D. You can choose it in the character panel." />}
      </p>
      <div className={css.cardBtns}>
        {wearing !== m3.id ? (
          <button type="button" className="btn btn-small btn-pine" onClick={tap(() => { seeModelMaking(); onOpen(); })}>
            <T ko="캐릭터 창" en="Choose" />
          </button>
        ) : null}
        <button type="button" className="btn btn-small" onClick={tap(() => clearModelMaking(m3.id))}><T ko="닫기" en="Close" /></button>
      </div>
    </div>
  ) : (
    <div className={`walk-making ${css.card}`} data-tone="fail" role="alert">
      <span className={css.failMark} aria-hidden="true">!</span>
      <p className={css.cardTitle}><T ko="3D를 만들지 못했어요" en="Couldn't make the 3D model" /></p>
      <p className={css.cardLine}>
        <Say text={m3.message ?? '3D를 만들지 못했어요.'} />
        {m3.note ? <>{' '}<Say text={m3.note} /></> : null}
      </p>
      <div className={css.cardBtns}>
        <button type="button" className="btn btn-small btn-pine" onClick={tap(() => { seeModelMaking(); onOpen(); })}>
          <T ko="캐릭터 창" en="Details" />
        </button>
        <button type="button" className="btn btn-small" onClick={tap(() => clearModelMaking(m3.id))}><T ko="닫기" en="Close" /></button>
      </div>
    </div>
  );

  if (!two && !three) return null;
  return (
    <div className={css.dock}>
      {two}
      {three}
    </div>
  );
}

/** 2D 그리는 중 칩: 지금 단계(차례·앞에 선 수, 그리는 중)와 걸린 시간, 가는 진행 막대 */
function DrawChip({ m, now, onOpen }: { m: Making; now: number; onOpen: () => void }) {
  const lang = useLang();
  const queued = m.phase === 'queued';
  const ahead = queued && m.ahead !== null && m.ahead > 0 ? m.ahead : null;
  return (
    <>
      <button
        type="button" className={`walk-making ${css.chip}`} onClick={tap(onOpen)}
        aria-label={tr(lang, '캐릭터 그리는 중. 눌러서 캐릭터 창 열기', 'Drawing your character. Tap to open the character panel')}
      >
        <span className={css.chipIcon} aria-hidden="true"><IconBrush /></span>
        <span className={css.chipText} aria-hidden="true">
          <span><T ko={queued ? '캐릭터 차례 기다리는 중' : '캐릭터 그리는 중'} en={queued ? 'Waiting to draw' : 'Drawing character'} /></span>
          <span className={css.chipTime}>{formatElapsed(now ? now - m.at : 0)}{ahead ? tr(lang, ` · 앞에 ${ahead}명`, ` · ${ahead} ahead`) : ''}</span>
        </span>
        <span className={css.chipBar} aria-hidden="true"><span style={{ width: `${makingPercent(m, now || m.at)}%` }} /></span>
      </button>
      <p className="sr-only" role="status">
        {queued
          ? <T ko="캐릭터를 그릴 차례를 기다리는 중이에요." en="Waiting for your turn to draw your character." />
          : <T ko="캐릭터를 그리는 중이에요." en="Drawing your character." />}
      </p>
    </>
  );
}

/** 3D 만드는 중 칩: 차례 기다리는 중(오래 기다리면 늦어지는 중) → 만드는 중(보통 1~2분, 늦어지면 빼다), 걸린 시간, 가는 진행 막대 */
function ModelChip({ m, now, onOpen }: { m: ModelMaking; now: number; onOpen: () => void }) {
  const lang = useLang();
  const at = now || m.at;
  const { label, tail } = modelChipText(m, at);
  const en = modelChipText(m, at, 'en');
  return (
    <>
      <button
        type="button" className={`walk-making ${css.chip}`} data-kind="3d" onClick={tap(onOpen)}
        aria-label={tr(lang, '3D 만드는 중. 눌러서 캐릭터 창 열기', 'Making 3D. Tap to open the character panel')}
      >
        <span className={css.chipIcon} aria-hidden="true"><IconCube /></span>
        <span className={css.chipText} aria-hidden="true">
          <span><T ko={label} en={en.label} /></span>
          <span className={css.chipTime}>{formatElapsed(now ? now - m.at : 0)}<T ko={tail} en={en.tail} /></span>
        </span>
        <span className={css.chipBar} aria-hidden="true"><span style={{ width: `${modelPercent(m, at)}%` }} /></span>
      </button>
      <p className="sr-only" role="status"><Stage3d m={m} at={at} /></p>
    </>
  );
}

/** 3D 단계 한 줄(두 말). 못 만든 까닭은 서버가 준 글이라 보일 때 옮긴다 */
function Stage3d({ m, at }: { m: ModelMaking; at: number }) {
  return m.phase === 'failed' ? <Say text={modelStage(m, at)} /> : <T ko={modelStage(m, at)} en={modelStage(m, at, 'en')} />;
}

/**
 * 2D 확인 카드가 떠 있을 때 3D의 끝(다 됨·못 만듦)을 접은 칩. 누르면 캐릭터 창(진행 상자에 까닭과 셈 안내가 그대로 보인다).
 * 알림은 그대로 남는다(창에서 보거나 확인 카드를 닫으면 다시 카드로 펼친다)
 */
function DoneChip({ m, onOpen }: { m: ModelMaking; onOpen: () => void }) {
  const lang = useLang();
  const failed = m.phase === 'failed';
  const title = failed ? '3D를 만들지 못했어요' : '3D가 다 됐어요';
  const titleEn = failed ? "Couldn't make the 3D model" : 'Your 3D is ready';
  return (
    <>
      <button
        type="button" className={`walk-making ${css.chip}`} data-kind="3d" data-done data-tone={failed ? 'fail' : undefined} onClick={tap(onOpen)}
        aria-label={tr(lang, `${title}. 눌러서 캐릭터 창에서 보기`, `${titleEn}. Tap to see it in the character panel`)}
      >
        <span className={css.chipIcon} aria-hidden="true">{failed ? '!' : <IconCube />}</span>
        <span className={css.chipText} aria-hidden="true">
          <span><T ko={title} en={titleEn} /></span>
          <T ko={<span className={css.chipTime}>캐릭터 창에서 보기</span>} en={<span className={css.chipTime}>See details</span>} />
        </span>
      </button>
      <p className="sr-only" role="status"><T ko={title} en={titleEn} /></p>
    </>
  );
}

/** 단계 줄: 앞은 다 함(done), 지금(now), 뒤(next). 못 했으면 그 단계에서 멈춘 것으로(fail) */
function Steps({ names, namesEn, at, failed, done, label }: {
  names: readonly string[]; namesEn: readonly string[]; at: number; failed: boolean; done: boolean; label: string;
}) {
  return (
    <ol className={css.steps} aria-label={label}>
      {names.map((s, i) => {
        const state = done ? 'done' : failed ? (i < at ? 'done' : i === at ? 'fail' : 'next') : i < at ? 'done' : i === at ? 'now' : 'next';
        return <li key={i} className={css.step} data-state={state} aria-current={state === 'now' ? 'step' : undefined}><T ko={s} en={namesEn[i] ?? s} /></li>;
      })}
    </ol>
  );
}

/** 2D 단계 이름: 보냄 → 차례(앞에 N명) → 그리는 중 → 다 됐어요. lang 'en': 영어 */
export function drawSteps(ahead: number | null, lang: Lang = 'ko'): string[] {
  if (lang === 'en') return ['Sent', ahead !== null && ahead > 0 ? `In line · ${ahead} ahead` : 'In line', 'Drawing', 'Done'];
  return ['보냄', ahead !== null && ahead > 0 ? `차례 · 앞에 ${ahead}명` : '차례', '그리는 중', '다 됐어요'];
}

/** 캐릭터 창 안의 2D 진행 상자: 단계, 진행 막대, 걸린 시간. 못 그렸으면 까닭 한 줄(다 그리면 창은 확인 카드를 보인다) */
export function MakingProgress({ m }: { m: Making }) {
  const lang = useLang();
  const live = running(m);
  const now = useSecondClock(live);
  // 창에서 못 그린 결과를 봤으면 메인 화면 칩의 알림은 띄우지 않는다(다 그린 것은 확인 카드에서 고를 때까지 둔다)
  useEffect(() => {
    if (m.phase === 'failed') seeMaking();
  }, [m.phase]);
  const at = now || m.at;
  const failed = m.phase === 'failed';
  const title = failed ? '그리지 못했어요' : m.phase === 'ready' ? '다 그렸어요' : m.phase === 'queued' ? '보냈어요 · 차례 기다리는 중' : '보냈어요 · 그리는 중';
  const titleEn = failed ? "Couldn't draw" : m.phase === 'ready' ? 'Done drawing' : m.phase === 'queued' ? 'Sent · Waiting for a turn' : 'Sent · Drawing';
  const stage = makingStage(m, at, MESSAGES.workerResting);
  const stageEn = makingStage(m, at, MESSAGES.workerResting, 'en');
  return (
    <section className={css.progress} data-tone={failed ? 'fail' : undefined} aria-label={tr(lang, '캐릭터 그리기 진행', 'Character drawing progress')}>
      <div className={css.progressHead}>
        <span className={css.progressTitle} role="status"><T ko={title} en={titleEn} /></span>
        {live ? <span className={css.progressTime} aria-hidden="true">{formatElapsed(at - m.at)}</span> : null}
      </div>
      {/* 단계: 보냄(0) → 차례(1) → 그리는 중(2) → 다 됐어요(3). 못 그렸으면 그리는 중에서 멈춘 것으로 보인다 */}
      <Steps
        names={drawSteps(m.phase === 'queued' ? m.ahead : null)} namesEn={drawSteps(m.phase === 'queued' ? m.ahead : null, 'en')}
        at={m.phase === 'queued' ? 1 : 2} failed={failed} done={m.phase === 'ready'} label={tr(lang, '그리기 단계', 'Drawing steps')}
      />
      {failed ? null : (
        <div className={css.bar} aria-hidden="true"><span style={{ width: `${makingPercent(m, at)}%` }} /></div>
      )}
      {/* 서버가 준 글(쉬는 중 안내, 못 그린 까닭)은 영어 쪽도 한국어 그대로 오므로 보일 때 옮긴다 */}
      <p className={css.stage}>{stageEn === stage ? <Say text={stage} /> : <T ko={stage} en={stageEn} />}</p>
      {live ? (
        <p className={css.stageNote}>
          <T
            ko="보통 1~2분쯤 걸려요. 창을 닫고 걸어도 돼요. 다 그리면 알려 드려요."
            en="It usually takes 1 to 2 minutes. You can close the panel and keep walking. We'll let you know when it's done."
          />
        </p>
      ) : null}
    </section>
  );
}

/** 캐릭터 창 안의 3D 진행 상자: 요청함 → 차례 → 만드는 중(보통 1~2분) → 다 됐어요. 못 만들었으면 까닭과 셈 안내 */
export function ModelProgress({ m }: { m: ModelMaking }) {
  const lang = useLang();
  const live = running3d(m);
  const now = useSecondClock(live);
  // 창에서 끝난 결과를 봤으면 메인 화면 칩의 알림은 띄우지 않는다
  useEffect(() => {
    if (m.phase === 'ready' || m.phase === 'failed') seeModelMaking();
  }, [m.phase]);
  const at = now || m.at;
  const failed = m.phase === 'failed';
  const title = failed ? '3D를 만들지 못했어요' : m.phase === 'ready' ? '3D가 다 됐어요' : m.phase === 'waiting' ? '3D 요청함 · 차례 기다리는 중' : '3D 요청함 · 만드는 중';
  const titleEn = failed
    ? "Couldn't make the 3D model" : m.phase === 'ready' ? 'Your 3D is ready' : m.phase === 'waiting' ? '3D requested · Waiting for a turn' : '3D requested · Making';
  const note = modelNote(m, at);
  return (
    <section className={css.progress} data-tone={failed ? 'fail' : undefined} data-kind="3d" aria-label={tr(lang, '3D 만들기 진행', '3D progress')}>
      <div className={css.progressHead}>
        <span className={css.progressTitle} role="status"><T ko={title} en={titleEn} /></span>
        {live ? <span className={css.progressTime} aria-hidden="true">{formatElapsed(at - m.at)}</span> : null}
      </div>
      <Steps names={MODEL_STEPS} namesEn={MODEL_STEPS_EN} at={m.phase === 'waiting' ? 1 : 2} failed={failed} done={m.phase === 'ready'} label={tr(lang, '3D 단계', '3D steps')} />
      {failed ? null : (
        <div className={css.bar} aria-hidden="true"><span style={{ width: `${modelPercent(m, at)}%` }} /></div>
      )}
      <p className={css.stage}><Stage3d m={m} at={at} /></p>
      {failed && m.note ? <p className={css.stageNote}><Say text={m.note} /></p> : null}
      {live && note ? <p className={css.stageNote}><T ko={note} en={modelNote(m, at, 'en') ?? note} /></p> : null}
      {m.phase === 'ready' ? <p className={css.stageNote}><T ko="이 캐릭터를 입고 걸으면 3D로 보여요." en="Wear this character and walk to see it in 3D." /></p> : null}
    </section>
  );
}

/** 붓(그리는 중): 글자색을 따른다 */
function IconBrush() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14.5 4.5l5 5L10 19l-5 1 1-5z" />
      <path d="M13 6l5 5" />
    </svg>
  );
}

/** 상자(3D): 글자색을 따른다 */
function IconCube() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </svg>
  );
}
