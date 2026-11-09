// 「두 마디 만들기」: 8분음표 16칸 격자에 블루스 음계 음을 찍고, 워킹 베이스 반주 위에 되풀이해 들어 본다.
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import type { Audio } from './RoundPlay';
import { IconNote, IconPlay, IconStop } from './icons';
import {
  GRID_CELLS, SCALE, SCALE_NAMES, composeTimeline, emptyGrid, exampleGrid, heardAt, noteCount, slotTime, swingRatio, toggleCell,
  COMPOSE_BPM, type Grid,
} from './logic';
import s from './jam.module.css';

const ROWS = SCALE.map((_, r) => SCALE.length - 1 - r); // 위가 높은 음
const BEAT_MARK = ['1', '', '2', '', '3', '', '4', ''];

/** 칸 c의 사람 말 이름(보조기술용) */
const cellName = (c: number, r: number) => `${Math.floor(c / 8) + 1}마디 ${Math.floor((c % 8) / 2) + 1}박 ${c % 2 ? '뒤' : '앞'} 칸, ${SCALE_NAMES[r]}`;

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
  const [note, setNote] = useState('');
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
    setNote('예시 가락을 채웠어요. 칸을 눌러 바꿔 보세요.');
  };
  const clear = () => {
    update(emptyGrid());
    setNote('');
  };
  const add = () => {
    if (noteCount(gridRef.current) === 0) {
      setNote('먼저 칸을 하나 이상 눌러 음을 찍어요.');
      return;
    }
    onAdd(gridRef.current);
    setNote(`오늘의 곡에 ${count + 1}번째 두 마디를 붙였어요.`);
    update(emptyGrid());
  };

  // 방향키로 칸을 옮겨 다닌다(칸 하나만 Tab 자리). Space·Enter는 단추가 직접 누른다
  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
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
        <IconNote /> 칸을 눌러 음을 찍고 들어 봐요. 위로 갈수록 높은 음이에요.
      </p>
      <div ref={box} className={s.bars} role="group" aria-label="두 마디 격자. 방향키로 옮기고 Space로 찍어요" onKeyDown={onKey}>
        {[0, 1].map((bar) => (
          <div key={bar} className={s.barBlock} aria-label={`${bar + 1}마디`} role="group">
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
                      aria-label={cellName(c, r)}
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
              <IconStop /> 멈추기
            </button>
          ) : (
            <button type="button" className={s.primary} onClick={play}>
              <IconPlay /> 들어 보기
            </button>
          )}
          <button type="button" className={s.btn} onClick={example}>예시로 채우기</button>
          <button type="button" className={s.btn} onClick={clear}>모두 지우기</button>
          <button type="button" className={s.btn} onClick={add}>곡에 붙이기</button>
        </div>
        <p className={s.note} role="status">{note}</p>
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
          <IconPlay /> 오늘의 곡 ({count})
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={() => {
            stop();
            onFinish();
          }}
        >
          다 했어요
        </button>
      </div>
    </div>
  );
}
