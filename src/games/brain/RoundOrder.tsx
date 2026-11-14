'use client';
// 2판 생각이 자라는 순서: (가) 단계 칩 넷을 연결 → 합치기 → 키우기 → 나누기 차례로, (나) 예시 카드 넷을 맞는 단계 칸에.
// 카드를 누르고 칸을 누르거나, 칸으로 끌어다 놓는다. 카드를 든 채 숫자 1~4를 눌러도 된다.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { Lang } from '@/lib/i18n';
import { shouldHandleShortcut } from '@/lib/keys';
import type { RoundProps } from './BrainGame';
import { STAGES, type Example, type StageId } from './bank';
import { beginDrag, wasDragged } from './drag';
import { countTrue, gradeExamples, gradeOrder } from './logic';
import { Icon } from './pictures';
import { usePlacement, type Placement } from './place';
import s from './brain.module.css';

/** ko: 글이 한국어인 카드(예시 문장)라 영어 화면에서도 lang="ko"로 둔다 */
type Item = { id: string; label: string; ko?: boolean };
type Slot = { key: string; head: ReactNode; aria: string };
const stageOf = (id: StageId) => STAGES.find((x) => x.id === id)!;
/** 단계 이름: 한국어 화면은 「연결(Connect)」, 영어 화면은 공개 문서의 영어 이름 */
const stageName = (id: StageId, lang: Lang = 'ko') => (lang === 'en' ? stageOf(id).en : `${stageOf(id).name}(${stageOf(id).en})`);

export function RoundOrder({ chips, examples, play, onProgress, onDone }: RoundProps & { chips: StageId[]; examples: Example[] }) {
  const [step, setStep] = useState<'stages' | 'examples'>('stages');
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const [firstScore, setFirstScore] = useState(0);
  const order = usePlacement();
  const ex = usePlacement();
  const heading = useRef<HTMLHeadingElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const lang = useLang();
  const tr = useTr();
  const en = lang === 'en';

  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (marks) nextBtn.current?.focus();
  }, [marks]);

  const isStages = step === 'stages';
  const place = isStages ? order : ex;
  const items: Item[] = isStages
    ? chips.map((id) => ({ id, label: stageName(id, lang) }))
    : examples.map((e) => ({ id: e.id, label: e.text, ko: true }));
  const slots: Slot[] = isStages
    ? [0, 1, 2, 3].map((i) => ({ key: String(i), head: <span className={s.slotNum}>{i + 1}</span>, aria: tr(`${i + 1}번째 칸`, `Slot ${i + 1}`) }))
    : STAGES.map((st) => ({
        key: st.id,
        head: en ? (
          <span className={s.slotStage}>{st.en}</span>
        ) : (
          <span className={s.slotStage}>
            {st.name} <span lang="en">{st.en}</span>
          </span>
        ),
        aria: tr(`${st.name} 단계 칸`, `${st.en} step`),
      }));
  const full = items.every((it) => place.at[it.id] !== undefined);

  const check = () => {
    if (!full || marks) return;
    const m = isStages
      ? gradeOrder(slots.map((sl) => order.inSlot(sl.key) as StageId | undefined))
      : gradeExamples(examples, ex.at as Record<string, StageId>);
    setMarks(m);
    play(countTrue(m) >= 3 ? 'good' : 'bad');
  };

  const next = () => {
    if (!marks) return;
    const got = countTrue(marks);
    if (isStages) {
      setFirstScore(got);
      setMarks(null);
      setStep('examples');
      onProgress({ at: 2, of: 2 });
      return;
    }
    onDone(firstScore + got);
  };

  const putAt = (item: string, slot: string) => {
    if (marks) return;
    place.put(item, slot);
    play('step', slots.findIndex((sl) => sl.key === slot));
  };

  const keyRef = useRef<(n: number) => void>(() => {});
  useEffect(() => {
    keyRef.current = (n) => {
      if (place.sel && slots[n - 1]) putAt(place.sel, slots[n - 1].key);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleShortcut(e) || e.altKey || e.ctrlKey || e.metaKey || e.repeat || !/^[1-4]$/.test(e.key)) return;
      e.preventDefault();
      keyRef.current(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const slotMark = (key: string, i: number): 'right' | 'wrong' | undefined => {
    if (!marks) return undefined;
    if (isStages) return marks[i] ? 'right' : 'wrong';
    const occ = ex.inSlot(key);
    const idx = examples.findIndex((e) => e.id === occ);
    return idx >= 0 ? (marks[idx] ? 'right' : 'wrong') : undefined;
  };

  const got = marks ? countTrue(marks) : 0;
  const pool = items.filter((it) => place.at[it.id] === undefined);
  return (
    <section className={s.round} aria-labelledby="brain-r2-q">
      <h3 id="brain-r2-q" ref={heading} tabIndex={-1} className={s.roundTitle}>
        {isStages ? tr('생각이 자라는 순서대로 놓아 보세요', 'Put the steps in the order thoughts grow') : tr('이 일은 어느 단계일까요?', 'Which step is this?')}
      </h3>
      <p className={s.prompt}>
        {isStages
          ? tr('단계 카드를 1번 칸부터 차례로 놓아요.', 'Place the step cards in order, starting at slot 1.')
          : tr('예시 카드를 맞는 단계 칸에 하나씩 놓아요.', 'Put each example card in the right step slot.')}
        {tr(' 카드를 누르고 칸을 누르거나, 칸으로 끌어다 놓아요.', ' Tap a card and then a slot, or drag it to a slot.')}
      </p>
      <ol className={isStages ? s.slotsRow : s.stageCols}>
        {slots.map((sl, i) => {
          const occ = place.inSlot(sl.key);
          const item = items.find((it) => it.id === occ);
          const label = item?.label;
          const mark = slotMark(sl.key, i);
          return (
            <li key={sl.key} className={s.slotItem}>
              <button
                type="button"
                className={s.slot}
                data-drop={sl.key}
                data-state={mark}
                data-filled={occ ? '' : undefined}
                data-ready={place.sel && !marks ? '' : undefined}
                disabled={!!marks}
                onClick={() => {
                  const r = place.tapSlot(sl.key);
                  if (r === 'put') play('step', i);
                  else if (r === 'out') play('pick');
                }}
                aria-keyshortcuts={String(i + 1)}
                aria-label={`${sl.aria}${label ? `: ${label}` : tr(', 비어 있음', ', empty')}${mark ? (mark === 'right' ? tr(', 맞음', ', correct') : tr(', 틀림', ', wrong')) : ''}`}
                lang={en && item?.ko ? 'ko' : undefined}
              >
                {sl.head}
                <span className={s.slotBody}>{label ?? tr('여기에 놓기', 'Drop here')}</span>
                {mark && (
                  <span className={s.mark} data-state={mark}>
                    <Icon name={mark === 'right' ? 'check' : 'cross'} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {!marks && <Pool items={pool} place={place} onDrop={putAt} play={play} />}
      <div aria-live="polite">
        {!marks ? (
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={check} disabled={!full}>
            {tr('확인하기', 'Check')}
          </button>
        ) : (
          <div className={s.answer} data-state={got === 4 ? 'right' : 'wrong'}>
            <p className={s.answerHead}>
              <Icon name={got === 4 ? 'check' : 'cross'} />
              {got === 4 ? tr('넷 다 맞혔어요!', 'All four right!') : tr(`넷 중 ${got}개 맞았어요.`, `${got} of 4 right.`)}
            </p>
            {/* 단계 풀이(about)와 예시 문장은 문제은행 글이라 한국어 그대로(lang="ko") */}
            {isStages ? (
              <ol className={s.explain}>
                {STAGES.map((st) => (
                  <li key={st.id}>
                    <b>{en ? st.en : `${st.name}(${st.en})`}</b> <span lang="ko">{st.about}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul className={s.explain}>
                {examples.map((e, k) => (
                  <li key={e.id} data-state={marks[k] ? 'right' : 'wrong'}>
                    <b lang="ko">{e.text}</b>: {tr(`${stageName(e.stage)} 단계예요.`, `It’s the ${stageName(e.stage, 'en')} step.`)}
                    {!marks[k] && ex.at[e.id] && tr(` (놓은 곳: ${stageName(ex.at[e.id] as StageId)})`, ` You put it in ${stageName(ex.at[e.id] as StageId, 'en')}.`)}{' '}
                    <span lang="ko">{stageOf(e.stage).about}</span>
                  </li>
                ))}
              </ul>
            )}
            <button ref={nextBtn} type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={next}>
              {isStages ? tr('예시 카드로', 'To the example cards') : tr('3판으로', 'To round 3')} <Icon name="next" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Pool({ items, place, onDrop, play }: { items: Item[]; place: Placement; onDrop: (item: string, slot: string) => void; play: RoundProps['play'] }) {
  const tr = useTr();
  if (!items.length) return null;
  return (
    <div className={s.pool} role="group" aria-label={tr('놓을 카드', 'Cards to place')}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={s.chip}
          lang={it.ko ? 'ko' : undefined}
          data-drag=""
          aria-pressed={place.sel === it.id}
          onPointerDown={(e) =>
            beginDrag(e, (drop) => {
              if (drop.dataset.drop) onDrop(it.id, drop.dataset.drop);
            })
          }
          onClick={(e) => {
            if (wasDragged(e.currentTarget)) return;
            place.tapItem(it.id);
            play('pick');
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
