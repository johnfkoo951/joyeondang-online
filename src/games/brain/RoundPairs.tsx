'use client';
// 3판 짝 잇기: 하위 서랍(예: 책 노트, 프롬프트, 강의) 여섯 장을 위 서랍과 실로 잇는다.
// 왼쪽 카드를 누르고 오른쪽 서랍을 누르거나, 카드를 서랍으로 끌어다 놓는다. 서랍 하나에 카드 하나.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RoundProps } from './BrainGame';
import type { Card, DrawerNo } from './bank';
import { beginDrag, wasDragged } from './drag';
import { countTrue, gradePairs } from './logic';
import { Icon } from './pictures';
import { usePlacement } from './place';
import { DrawerFace, drawerOf } from './RoundDrawers';
import s from './brain.module.css';

const SVG = 'http://www.w3.org/2000/svg';

export function RoundPairs({ cards, parents, play, onDone }: RoundProps & { cards: Card[]; parents: DrawerNo[] }) {
  const link = usePlacement();
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const full = cards.every((c) => link.at[c.id] !== undefined);

  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (marks) nextBtn.current?.focus();
  }, [marks]);

  // 이은 짝마다 카드 오른쪽 가운데에서 서랍 왼쪽 가운데로 실을 그린다(상태를 바꾸지 않고 SVG만 고친다)
  useLayoutEffect(() => {
    const box = wrap.current;
    const pad = svg.current;
    if (!box || !pad) return;
    const draw = () => {
      const r0 = box.getBoundingClientRect();
      const paths: SVGPathElement[] = [];
      cards.forEach((c, k) => {
        const slot = link.at[c.id];
        const a = box.querySelector<HTMLElement>(`[data-pair-card="${c.id}"]`);
        const b = slot ? box.querySelector<HTMLElement>(`[data-drop="${slot}"]`) : null;
        if (!a || !b) return;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const x1 = ra.right - r0.left;
        const y1 = ra.top + ra.height / 2 - r0.top;
        const x2 = rb.left - r0.left;
        const y2 = rb.top + rb.height / 2 - r0.top;
        const mid = (x1 + x2) / 2;
        const p = document.createElementNS(SVG, 'path');
        p.setAttribute('d', `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`);
        p.setAttribute('class', s.thread);
        p.setAttribute('data-tone', slot);
        if (marks) p.setAttribute('data-state', marks[k] ? 'right' : 'wrong');
        paths.push(p);
      });
      pad.replaceChildren(...paths);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [cards, link.at, marks]);

  const tie = (card: string, slot: string) => {
    if (marks) return;
    link.put(card, slot);
    play('link');
  };

  const check = () => {
    if (!full || marks) return;
    const m = gradePairs(cards, Object.fromEntries(Object.entries(link.at).map(([k, v]) => [k, Number(v)])));
    setMarks(m);
    play(countTrue(m) >= 4 ? 'good' : 'bad');
  };

  const got = marks ? countTrue(marks) : 0;
  return (
    <section className={s.round} aria-labelledby="brain-r3-q">
      <h3 id="brain-r3-q" ref={heading} tabIndex={-1} className={s.roundTitle}>
        하위 서랍을 위 서랍과 이어 보세요
      </h3>
      <p className={s.prompt}>왼쪽 카드를 누르고 오른쪽 서랍을 누르거나, 서랍으로 끌어다 놓아요. 서랍 하나에 카드 하나씩.</p>
      <div className={s.pairs} ref={wrap}>
        <svg ref={svg} className={s.threads} aria-hidden="true" focusable="false" />
        <ul className={s.pairCol} aria-label="하위 서랍">
          {cards.map((c, k) => {
            const slot = link.at[c.id];
            const mark = marks ? (marks[k] ? 'right' : 'wrong') : undefined;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={s.pairCard}
                  data-pair-card={c.id}
                  data-drag={marks ? undefined : ''}
                  data-tone={slot}
                  data-state={mark}
                  aria-pressed={link.sel === c.id}
                  disabled={!!marks}
                  aria-label={`${c.label}${slot ? `, ${drawerOf(Number(slot)).code} ${drawerOf(Number(slot)).name} 서랍에 이음` : ''}${mark ? (mark === 'right' ? ', 맞음' : ', 틀림') : ''}`}
                  onPointerDown={(e) =>
                    !marks &&
                    beginDrag(e, (drop) => {
                      if (drop.dataset.drop) tie(c.id, drop.dataset.drop);
                    })
                  }
                  onClick={(e) => {
                    if (wasDragged(e.currentTarget)) return;
                    link.tapItem(c.id);
                    play('pick');
                  }}
                >
                  <span>{c.label}</span>
                  {mark && (
                    <span className={s.mark} data-state={mark}>
                      <Icon name={mark === 'right' ? 'check' : 'cross'} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className={s.pairCol} aria-label="위 서랍">
          {parents.map((no) => {
            const d = drawerOf(no);
            const key = String(no);
            const card = cards.find((c) => c.id === link.inSlot(key));
            return (
              <li key={no}>
                <button
                  type="button"
                  className={`${s.drawer} ${s.pairDrawer}`}
                  data-tone={no}
                  data-drop={key}
                  data-ready={link.sel && !marks ? '' : undefined}
                  disabled={!!marks}
                  aria-label={`${d.code} ${d.name} 서랍${card ? `, ${card.label} 이어짐` : ''}`}
                  onClick={() => {
                    const r = link.tapSlot(key);
                    if (r === 'put') play('link');
                    else if (r === 'out') play('pick');
                  }}
                >
                  <DrawerFace d={d} compact />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div aria-live="polite">
        {!marks ? (
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={check} disabled={!full}>
            확인하기
          </button>
        ) : (
          <div className={s.answer} data-state={got === cards.length ? 'right' : 'wrong'}>
            <p className={s.answerHead}>
              <Icon name={got === cards.length ? 'check' : 'cross'} />
              {got === cards.length ? '여섯 짝 다 맞혔어요!' : `여섯 짝 중 ${got}개 맞았어요.`}
            </p>
            <ul className={s.explain}>
              {cards.map((c, k) => {
                const d = drawerOf(c.drawer);
                return (
                  <li key={c.id} data-state={marks[k] ? 'right' : 'wrong'}>
                    <b>{c.label}</b> → {d.code} {d.name} <span className={s.code}>({c.code})</span>. {c.why}
                  </li>
                );
              })}
            </ul>
            <button ref={nextBtn} type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => onDone(got)}>
              결과 보기 <Icon name="next" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
