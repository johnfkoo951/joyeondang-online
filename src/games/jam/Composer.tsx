// 「두 마디 만들기」: 8분음표 16칸 격자에 블루스 음계 음을 찍고, 워킹 베이스 반주 위에 되풀이해 들어 본다.
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { Lang } from '@/lib/i18n';
import type { Audio } from './RoundPlay';
import { IconCheck, IconNote, IconPlay, IconStop } from './icons';
import {
  GRID_CELLS, SCALE, SCALE_NAMES, SCALE_NAMES_EN, composeTimeline, emptyGrid, exampleGrid, heardAt, noteCount, slotTime, swingRatio, toggleCell,
  COMPOSE_BPM, type Grid,
} from './logic';
import s from './jam.module.css';

const ROWS = SCALE.map((_, r) => SCALE.length - 1 - r); // 위가 높은 음
const BEAT_MARK = ['1', '', '2', '', '3', '', '4', ''];

/** 칸 c의 사람 말 이름(보조기술용) */
const cellName = (c: number, r: number, lang: Lang = 'ko') =>
  lang === 'en'
    ? `Bar ${Math.floor(c / 8) + 1}, beat ${Math.floor((c % 8) / 2) + 1} ${c % 2 ? 'off' : 'on'}, ${SCALE_NAMES_EN[r]}`
    : `${Math.floor(c / 8) + 1}마디 ${Math.floor((c % 8) / 2) + 1}박 ${c % 2 ? '뒤' : '앞'} 칸, ${SCALE_NAMES[r]}`;

/** 아래 줄 알림(열쇠만 두고 보일 때 지금 말로 고른다) */
type Note = { k: 'example' } | { k: 'empty' } | { k: 'added'; n: number } | null;
function noteText(note: Note, tr: (ko: string, en: string) => string): string {
  if (!note) return '';
  if (note.k === 'example') return tr('예시 가락을 채웠어요. 칸을 눌러 바꿔 보세요.', 'Filled in an example tune. Tap cells to change it.');
  if (note.k === 'empty') return tr('먼저 칸을 하나 이상 눌러 음을 찍어요.', 'First tap at least one cell to place a note.');
  return tr(`오늘의 곡에 ${note.n}번째 두 마디를 붙였어요.`, `Added two bars to today’s song (piece ${note.n}).`);
}

/** 되풀이 재생 중 지금 칸(0~15) */
function cellAt(pos: number): number {
  const sw = swingRatio(COMPOSE_BPM);
  let k = 0;
  for (let i = 0; i < GRID_CELLS; i++) if (slotTime(i, COMPOSE_BPM, sw) <= pos) k = i;
  return k;
}

type Props = {
  ensure: () => Audio | null;
  seed: number;
  count: number;
  onAdd: (g: Grid) => void;
  onSong: () => void;
  onFinish: () => void;
};

export function Composer({ ensure, seed, count, onAdd, onSong, onFinish }: Props) {
  const [grid, setGrid] = useState<Grid>(emptyGrid);
  const [playing, setPlaying] = useState(false);
  const [col, setCol] = useState(-1);
  const [focus, setFocus] = useState({ c: 0, r: 0 });
  const [note, setNote] = useState<Note>(null);
  const lang = useLang();
  const tr = useTr();
  const gridRef = useRef(grid);
  const box = useRef<HTMLDivElement>(null);
  const loop = useRef({ raf: 0, audio: null as Audio | null, ex: 0 });

  useEffect(() => {
    gridRef.current = grid;
  });
  useEffect(() => {
    const l = loop.current;
    return () => {
      cancelAnimationFrame(l.raf);
      l.audio?.transport.stop();
    };
  }, []);

  const stop = () => {
    const l = loop.current;
    cancelAnimationFrame(l.raf);
    l.audio?.transport.stop();
    setPlaying(false);
    setCol(-1);
  };
  const play = () => {
    const a = ensure();
    if (!a) return;
    const l = loop.current;
    l.audio = a;
    const tl = composeTimeline(gridRef.current);
    const t0 = a.transport.start(tl.events, tl.length);
    setPlaying(true);
    let last = -2;
    const frame = () => {
      const now = heardAt(performance.now(), a.engine.stamp()) - t0;
      const c = now < 0 ? -1 : cellAt(now % tl.length);
      if (c !== last) {
        last = c;
        setCol(c);
      }
      l.raf = requestAnimationFrame(frame);
    };
    l.raf = requestAnimationFrame(frame);
  };
  const update = (g: Grid) => {
    setGrid(g);
    gridRef.current = g;
    if (playing) loop.current.audio?.transport.setEvents(composeTimeline(g).events);
  };
  const toggle = (c: number, r: number) => {
    const g = toggleCell(gridRef.current, c, r);
    update(g);
    setFocus({ c, r });
    if (g[c] === r) ensure()?.engine.preview(SCALE[r]);
  };
  const example = () => {
    loop.current.ex += 1;
    update(exampleGrid(seed + loop.current.ex * 7919));
    setNote({ k: 'example' });
  };
  const clear = () => {
    update(emptyGrid());
    setNote(null);
  };
  const add = () => {
    if (noteCount(gridRef.current) === 0) {
      setNote({ k: 'empty' });
      return;
    }
    onAdd(gridRef.current);
    setNote({ k: 'added', n: count + 1 });
    update(emptyGrid());
  };

  // 방향키로 칸을 옮겨 다닌다(칸 하나만 Tab 자리). Space·Enter는 단추가 직접 누른다
  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    let { c, r } = focus;
    if (d[e.key]) {
      c = Math.max(0, Math.min(GRID_CELLS - 1, c + d[e.key][0]));
      r = Math.max(0, Math.min(SCALE.length - 1, r + d[e.key][1]));
    } else if (e.key === 'Home') c = 0;
    else if (e.key === 'End') c = GRID_CELLS - 1;
    else return;
    e.preventDefault();
    setFocus({ c, r });
    box.current?.querySelector<HTMLButtonElement>(`[data-cell="${c}-${r}"]`)?.focus();
  };

  return (
    <div className={s.compose}>
      <p className={s.lead}>
        <IconNote /> {tr('칸을 눌러 음을 찍고 들어 봐요. 위로 갈수록 높은 음이에요.', 'Tap cells to place notes, then listen. Higher rows are higher notes.')}
      </p>
      <div
        ref={box}
        className={s.bars}
        role="group"
        aria-label={tr('두 마디 격자. 방향키로 옮기고 Space로 찍어요', 'Two-bar grid. Move with the arrow keys and press Space to place a note')}
        onKeyDown={onKey}
      >
        {[0, 1].map((bar) => (
          <div key={bar} className={s.barBlock} aria-label={tr(`${bar + 1}마디`, `Bar ${bar + 1}`)} role="group">
            <div className={s.beats} aria-hidden="true">
              {BEAT_MARK.map((m, k) => (
                <span key={k} data-now={col === bar * 8 + k ? '' : undefined}>{m}</span>
              ))}
            </div>
            {ROWS.map((r) => (
              <div key={r} className={s.row}>
                {Array.from({ length: 8 }, (_, k) => {
                  const c = bar * 8 + k;
                  const on = grid[c] === r;
                  return (
                    <button
                      key={c}
                      type="button"
                      data-cell={`${c}-${r}`}
                      data-row={r}
                      data-on={on ? '' : undefined}
                      data-now={col === c ? '' : undefined}
                      data-off={k % 2 ? '' : undefined}
                      className={s.cell}
                      tabIndex={focus.c === c && focus.r === r ? 0 : -1}
                      aria-pressed={on}
                      aria-label={cellName(c, r, lang)}
                      onClick={() => toggle(c, r)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* 듣기·붙이기 줄은 화면 아래에 붙어 있어 격자를 넘겨도 늘 보인다(휴대폰) */}
      <div className={s.dock}>
        <div className={s.actions}>
          {playing ? (
            <button type="button" className={s.primary} onClick={stop}>
              <IconStop /> {tr('멈추기', 'Stop')}
            </button>
          ) : (
            <button type="button" className={s.primary} onClick={play}>
              <IconPlay /> {tr('들어 보기', 'Listen')}
            </button>
          )}
          <button type="button" className={s.btn} onClick={example}>{tr('예시로 채우기', 'Fill an example')}</button>
          <button type="button" className={s.btn} onClick={clear}>{tr('모두 지우기', 'Clear all')}</button>
          <button type="button" className={s.btn} onClick={add}>{tr('곡에 붙이기', 'Add to song')}</button>
        </div>
        <p className={s.note} role="status">{noteText(note, tr)}</p>
      </div>
      <div className={s.actions}>
        <button
          type="button"
          className={s.btn}
          onClick={() => {
            stop();
            onSong();
          }}
          disabled={count === 0}
        >
          <IconPlay /> {tr(`오늘의 곡 (${count})`, `Today’s song (${count})`)}
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={() => {
            stop();
            onFinish();
          }}
        >
          <IconCheck /> {tr('다 했어요', 'All done')}
        </button>
      </div>
    </div>
  );
}
