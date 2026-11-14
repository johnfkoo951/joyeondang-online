// 좋아하는 것 선반: 고르기 칸의 소품을 3단 선반 12칸에 탭(골라서 칸 누르기)이나 끌어 놓아 꾸민다.
// 글자를 몰라도 그림과 소리만으로 끝까지 할 수 있고, 키보드만으로도(방향키·Enter) 할 수 있다.
// 목표(3개 이상)는 별 세 개가 차오르는 것으로 보이고, 다 차면 「다 꾸몄어요」가 두근거린다.
// 「다 꾸몄어요」로 마친 순간부터 덮개 화면에 결과를 미리 알린다(ctx.report).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { Lang } from '@/lib/i18n';
import type { GameContext, GameResult } from '../types';
import { ItemArt } from './art';
import { ITEMS } from './items';
import {
  COLS, MIN_TO_FINISH, ROWS, SHELF_KEY, SLOTS, canFinish, emptyShelf, firstEmpty, parseShelf, place, placedCount, removeAt, serializeShelf, slotName, swap, trayOrder,
  type Shelf,
} from './logic';
import { createSound, type ShelfSound, type Sound } from './sound';
import s from './shelf.module.css';

const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
/** 아래 줄 알림의 열쇠(보일 때 지금 말로 고른다): 모두 내리기 한 번 더, 먼저 고르기, 더 올리기 */
type Note = '' | 'arm' | 'pickFirst' | 'needMore';
const itemName = (id: string, lang: Lang) => {
  const it = BY_ID.get(id);
  return it ? (lang === 'en' ? it.en : it.name) : '';
};
type Held = { from: 'tray' | number; id: string } | null;
type Down = { id: string; from: 'tray' | number; x: number; y: number; pid: number; moved: boolean };

function readShelf(): Shelf {
  try {
    return parseShelf(localStorage.getItem(SHELF_KEY), BY_ID.keys());
  } catch {
    return emptyShelf();
  }
}
function writeShelf(sh: Shelf): void {
  try {
    localStorage.setItem(SHELF_KEY, serializeShelf(sh, Date.now()));
  } catch {
    /* 저장 못 해도 이번에는 꾸밀 수 있다 */
  }
}

/** 선반 결과(점수 = 올린 소품 수). 단추·끌기 처리 안에서만 부른다 */
function shelfResult(sh: Shelf, done: boolean, start: number): GameResult {
  const k = placedCount(sh);
  return { cleared: done, score: k, ms: Math.round(performance.now() - start), detail: { items: k } };
}

const Art = ({ id }: { id: string }) => {
  const it = BY_ID.get(id);
  return it ? <ItemArt shape={it.shape} color={it.color} /> : null;
};

export function ShelfGame({ ctx }: { ctx: GameContext }) {
  const [shelf, setShelf] = useState<Shelf>(readShelf);
  const [held, setHeld] = useState<Held>(null);
  const [muted, setMuted] = useState(false);
  /** 「다 꾸몄어요」를 누른 때(사진 카드의 날짜). 날짜 글은 보일 때 지금 말로 만든다 */
  const [photo, setPhoto] = useState<Date | null>(null);
  const [note, setNote] = useState<Note>('');
  const lang = useLang();
  const tr = useTr();
  const [drag, setDrag] = useState<string | null>(null);
  const [fs, setFs] = useState(0);
  const [ft, setFt] = useState(0);
  // 「모두 내리기」는 한 번 더 눌러야 내린다(실수로 다 내리지 않게). 손가락 기기에서는 숨긴다
  const [armed, setArmed] = useState(false);
  const [cleared, setCleared] = useState(false);
  const order = useMemo(() => trayOrder(ITEMS.map((i) => i.id), ctx.seed), [ctx.seed]);
  const root = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const sound = useRef<Sound | null>(null);
  const live = useRef({ start: 0, changed: false, cleared: false, suppress: false, down: null as Down | null });

  useEffect(() => {
    live.current.start = performance.now();
    return () => {
      sound.current?.close();
      sound.current = null;
    };
  }, []);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => {
      setArmed(false);
      setNote((x) => (x === 'arm' ? '' : x));
    }, 3500);
    return () => window.clearTimeout(t);
  }, [armed]);

  const onShelf = new Set(shelf.filter((x): x is string => !!x));
  const tray = order.filter((id) => !onShelf.has(id));
  const ftc = Math.max(0, Math.min(ft, tray.length - 1));
  const n = placedCount(shelf);

  const play = (k: ShelfSound, slot?: number) => {
    if (muted) return;
    if (!sound.current) sound.current = createSound();
    sound.current.play(k, slot);
  };
  const resultOf = (sh: Shelf, done: boolean): GameResult => shelfResult(sh, done, live.current.start);
  const commit = (next: Shelf) => {
    setShelf(next);
    writeShelf(next);
    live.current.changed = true;
    setArmed(false);
    // 한 번 마쳤으면 더 꾸밀 때마다 바뀐 결과를 알린다
    if (live.current.cleared) ctx.report?.(resultOf(next, true));
  };
  const focusEl = (sel: string) => requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(sel)?.focus());

  const pickTray = (id: string, viaKey: boolean) => {
    setNote('');
    if (held?.id === id) return setHeld(null);
    setHeld({ from: 'tray', id });
    play('pick');
    if (viaKey) {
      const i = Math.max(0, firstEmpty(shelf));
      setFs(i);
      focusEl(`[data-slot="${i}"]`);
    }
  };
  const tapSlot = (i: number, viaKey: boolean) => {
    setNote('');
    if (held) {
      if (held.from === i) return setHeld(null);
      commit(held.from === 'tray' ? place(shelf, i, held.id) : swap(shelf, held.from, i));
      setHeld(null);
      play('place', i);
      // 키보드로 고르기 칸에서 가져와 놓았으면 다음 소품을 바로 고를 수 있게 고르기 칸으로 돌아간다
      if (viaKey && held.from === 'tray') focusEl(`[data-item]:nth-child(${Math.min(ftc + 1, Math.max(1, tray.length - 1))})`);
      return;
    }
    const id = shelf[i];
    if (id) {
      setHeld({ from: i, id });
      play('pick');
    } else setNote('pickFirst');
  };
  const putBack = () => {
    if (held && held.from !== 'tray') {
      commit(removeAt(shelf, held.from));
      play('remove');
    }
    setHeld(null);
  };
  const clearAll = () => {
    if (!armed) {
      setArmed(true);
      setNote('arm');
      return;
    }
    commit(emptyShelf());
    setHeld(null);
    setNote('');
    play('remove');
  };
  const finishDecor = () => {
    if (!canFinish(shelf)) return setNote('needMore');
    setHeld(null);
    play('done');
    live.current.cleared = true;
    setCleared(true);
    ctx.report?.(resultOf(shelf, true));
    setPhoto(new Date());
  };
  const exit = (finished: boolean) => {
    const l = live.current;
    const done = finished || l.cleared; // 한 번 「다 꾸몄어요」를 했으면 더 꾸미다 그만해도 다 꾸민 것
    if (!done && !l.changed) return ctx.onExit();
    ctx.onExit(resultOf(shelf, done));
  };

  // 끌어 놓기: 8px 넘게 움직이면 끌기, 아니면 그냥 탭(click이 처리)
  const onDown = (e: RPointerEvent<HTMLButtonElement>, id: string, from: 'tray' | number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    live.current.down = { id, from, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 붙잡지 못해도 root가 받는다 */
    }
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = live.current.down;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    if (!d.moved) {
      d.moved = true;
      setDrag(d.id);
      setHeld(null);
    }
    const box = root.current;
    if (ghost.current && box) {
      // 덮개 바깥 조상의 변형과 상관없이, 선반 화면(스크롤하지 않는 틀) 안 좌표로 놓는다
      const b = box.getBoundingClientRect();
      ghost.current.style.transform = `translate(${e.clientX - b.left}px, ${e.clientY - b.top}px)`;
    }
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = live.current.down;
    live.current.down = null;
    if (!d || d.pid !== e.pointerId || !d.moved) return;
    live.current.suppress = true; // 끌기 뒤에 오는 click은 탭으로 보지 않는다
    window.setTimeout(() => {
      live.current.suppress = false;
    }, 0);
    setDrag(null);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest<HTMLElement>('[data-slot]');
    if (slotEl && root.current?.contains(slotEl)) {
      const i = Number(slotEl.dataset.slot);
      commit(d.from === 'tray' ? place(shelf, i, d.id) : swap(shelf, d.from, i));
      play('place', i);
    } else if (d.from !== 'tray' && el?.closest('[data-tray]')) {
      commit(removeAt(shelf, d.from));
      play('remove');
    }
  };
  const onCancel = () => {
    live.current.down = null;
    setDrag(null);
  };
  const clicked = () => {
    if (!live.current.suppress) return true;
    live.current.suppress = false;
    return false;
  };

  // 방향키로 칸 사이를 옮긴다(무리마다 Tab 자리 하나)
  const rove = (e: RKeyboardEvent<HTMLElement>, cur: number, count: number, cols: number, go: (i: number) => void) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229 || count === 0) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    let i = cur;
    if (e.key in step) i = Math.max(0, Math.min(count - 1, cur + step[e.key]));
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = count - 1;
    else return;
    e.preventDefault();
    go(i);
  };
  const trayCols = () => {
    const kids = [...(root.current?.querySelectorAll<HTMLElement>('[data-item]') ?? [])];
    return Math.max(1, kids.filter((k) => k.offsetTop === kids[0]?.offsetTop).length);
  };
  const toTray = (i: number) => {
    setFt(i);
    focusEl(`[data-item="${tray[i]}"]`);
  };
  const toSlot = (i: number) => {
    setFs(i);
    focusEl(`[data-slot="${i}"]`);
  };

  const heldName = held ? itemName(held.id, lang) : '';
  const noteText =
    note === 'arm'
      ? tr('한 번 더 누르면 모두 내려요.', 'Press once more to take everything down.')
      : note === 'pickFirst'
        ? tr('먼저 소품을 하나 골라요.', 'First pick something.')
        : note === 'needMore'
          ? tr(`소품을 ${MIN_TO_FINISH}개 이상 올려 주세요.`, `Put at least ${MIN_TO_FINISH} things on the shelf.`)
          : '';
  return (
    <div
      ref={root}
      className={s.root}
      data-theme={ctx.theme}
      data-reduced={ctx.reducedMotion ? '' : undefined}
      data-holding={held || drag ? '' : undefined}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      <div className={s.top}>
        <p className={s.count} aria-live="polite">
          <span className={s.countArt} aria-hidden="true" />
          <span className={s.sr}>{tr('선반에 올린 소품', 'Things on the shelf')}</span> {n} / {SLOTS}
          <Goal n={n} />
        </p>
        <div className={s.tools}>
          <button type="button" className={s.tool} onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
            <SoundIcon off={muted} />
            <span className={s.toolText}>{muted ? tr('소리 켜기', 'Unmute') : tr('소리 끄기', 'Mute')}</span>
          </button>
          {ctx.coarse ? null : (
            <button type="button" className={s.tool} onClick={clearAll} disabled={n === 0} data-armed={armed ? '' : undefined} aria-label={armed ? tr('모두 내리기: 한 번 더 누르면 모두 내려요', 'Clear shelf: press once more to take everything down') : tr('모두 내리기', 'Clear shelf')}>
              <DownIcon />
              <span className={s.toolText}>{armed ? tr('한 번 더 누르면 내려요', 'Press again to clear') : tr('모두 내리기', 'Clear shelf')}</span>
            </button>
          )}
          <button type="button" className={s.tool} onClick={() => exit(false)}>
            <DoorIcon />
            <span>{tr('그만하기', 'Quit')}</span>
          </button>
        </div>
      </div>
      <div className={s.main}>
        <section className={s.shelfWrap} aria-label={tr('선반', 'Shelf')}>
          <div
            className={s.shelf}
            role="group"
            aria-label={tr('선반 12칸. 방향키로 옮기고 Enter로 놓거나 들어요', 'Shelf with 12 spots. Move with the arrow keys, and press Enter to place or pick up')}
            onKeyDown={(e) => rove(e, fs, SLOTS, COLS, toSlot)}
          >
            {Array.from({ length: ROWS }, (_, row) => (
              <div key={row} className={s.tier}>
                {Array.from({ length: COLS }, (_, col) => {
                  const i = row * COLS + col;
                  const id = shelf[i];
                  const name = id ? itemName(id, lang) : null;
                  const mine = held?.from === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      data-slot={i}
                      className={s.slot}
                      data-filled={id ? '' : undefined}
                      data-held={mine ? '' : undefined}
                      tabIndex={i === fs ? 0 : -1}
                      aria-label={`${slotName(i, lang)}, ${name ?? tr('빈칸', 'empty')}${mine ? tr(', 들고 있음', ', holding') : ''}`}
                      onFocus={() => setFs(i)}
                      onClick={(e) => clicked() && tapSlot(i, e.detail === 0)}
                      onPointerDown={id ? (e) => onDown(e, id, i) : undefined}
                    >
                      {id ? <Art id={id} /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
        <section className={s.trayWrap} data-tray="" aria-label={tr('고르기', 'Pick')}>
          <div className={s.tray}>
            <div
              className={s.trayGrid}
              role="group"
              aria-label={tr('소품 고르기. 방향키로 옮기고 Enter로 골라요', 'Pick a thing. Move with the arrow keys and press Enter to choose')}
              style={{ '--cols': Math.max(1, Math.ceil(tray.length / 2)) } as CSSProperties}
              onKeyDown={(e) => rove(e, ftc, tray.length, trayCols(), toTray)}
            >
              {tray.map((id, k) => (
                <button
                  key={id}
                  type="button"
                  data-item={id}
                  className={s.item}
                  aria-pressed={held?.id === id}
                  tabIndex={k === ftc ? 0 : -1}
                  onFocus={() => setFt(k)}
                  onClick={(e) => clicked() && pickTray(id, e.detail === 0)}
                  onPointerDown={(e) => onDown(e, id, 'tray')}
                >
                  <Art id={id} />
                  <span className={s.itemName}>{itemName(id, lang)}</span>
                </button>
              ))}
            </div>
            {tray.length === 0 ? <p className={s.hintLine}>{tr('모두 선반에 올렸어요', 'Everything is on the shelf')}</p> : null}
          </div>
        </section>
      </div>
      <div className={s.bottom}>
        <div className={s.status}>
          {held && held.from !== 'tray' ? (
            <button type="button" className={s.btn} onClick={putBack}>
              <DownIcon /> {tr(`${heldName} 내리기`, `Take down: ${heldName}`)}
            </button>
          ) : (
            <p className={s.hintLine} role="status">
              <HandIcon /> {noteText || (held ? tr(`${heldName}: 선반 칸을 눌러요`, `${heldName}: tap a shelf spot`) : tr('좋아하는 것을 골라요', 'Pick something you like'))}
            </p>
          )}
        </div>
        <button type="button" className={s.primary} onClick={finishDecor} aria-disabled={!canFinish(shelf)} data-ready={canFinish(shelf) && !cleared ? '' : undefined}>
          <CheckIcon /> {tr('다 꾸몄어요', 'All done')}
        </button>
      </div>
      <div ref={ghost} className={s.ghost} data-on={drag ? '' : undefined} aria-hidden="true">
        {drag ? <Art id={drag} /> : null}
      </div>
      {photo ? <Photo shelf={shelf} at={photo} onDone={() => exit(true)} onMore={() => setPhoto(null)} /> : null}
    </div>
  );
}

/** 「다 꾸몄어요」 뒤의 선반 사진 카드 */
function Photo({ shelf, at, onDone, onMore }: { shelf: Shelf; at: Date; onDone: () => void; onMore: () => void }) {
  const n = placedCount(shelf);
  const lang = useLang();
  const tr = useTr();
  const date = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(at);
  const things = n === 1 ? '1 thing' : `${n} things`;
  return (
    <div className={s.photoBack}>
      <section className={s.photo} role="group" aria-label={tr(`나의 선반 사진, 소품 ${n}개`, `Photo of my shelf, ${things}`)}>
        <div className={s.photoPic} aria-hidden="true">
          {Array.from({ length: ROWS }, (_, row) => (
            <div key={row} className={s.tier}>
              {Array.from({ length: COLS }, (_, col) => {
                const id = shelf[row * COLS + col];
                return (
                  <span key={col} className={s.slot} data-filled={id ? '' : undefined}>
                    {id ? <Art id={id} /> : null}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className={s.caption}>
          <strong>{tr('나의 선반', 'My shelf')}</strong>
          <span>{tr(`${date} · 소품 ${n}개`, `${date} · ${things}`)}</span>
        </p>
        <div className={s.actions}>
          <button type="button" className={s.primary} onClick={onDone} autoFocus>
            <CheckIcon /> {tr('마치기', 'Finish')}
          </button>
          <button type="button" className={s.btn} onClick={onMore}>
            <HandIcon /> {tr('더 꾸미기', 'Decorate more')}
          </button>
        </div>
      </section>
    </div>
  );
}

const svgBase = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
function SoundIcon({ off }: { off: boolean }) {
  return (
    <svg {...svgBase} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
      {off ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}
const HandIcon = () => (
  <svg {...svgBase} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5A5.5 5.5 0 0 1 5 16.5L4 13a1.5 1.5 0 0 1 2.6-1.4L8 13.5" />
  </svg>
);
const DownIcon = () => (
  <svg {...svgBase} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v13M6 11l6 6 6-6M5 20h14" />
  </svg>
);
const DoorIcon = () => (
  <svg {...svgBase} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4H6v16h8M10 12h10M17 9l3 3-3 3" />
  </svg>
);
/** 목표: 소품 3개(MIN_TO_FINISH)를 별 세 개로. 올릴 때마다 하나씩 찬다 */
function Goal({ n }: { n: number }) {
  const tr = useTr();
  return (
    <span className={s.goal} role="img" aria-label={tr(`목표 ${MIN_TO_FINISH}개 중 ${Math.min(n, MIN_TO_FINISH)}개`, `Goal: ${Math.min(n, MIN_TO_FINISH)} of ${MIN_TO_FINISH}`)}>
      {Array.from({ length: MIN_TO_FINISH }, (_, k) => (
        <svg key={k} {...svgBase} viewBox="0 0 24 24" data-on={k < n ? '' : undefined}>
          <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" />
        </svg>
      ))}
    </span>
  );
}
const CheckIcon = () => (
  <svg {...svgBase} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
