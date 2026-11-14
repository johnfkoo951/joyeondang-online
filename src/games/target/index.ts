// 종이공 과녁(1인칭 과녁 놀이). 데스크탑은 마우스로 겨누고 눌러 던지고, 휴대폰은 던질 곳을 톡 누른다.
// 키보드만으로도: 화살표·WASD로 겨누고 Space·Enter로 던진다. Esc는 덮개 화면이 받는다.
// 판 계산은 logic.ts, 그림은 view.ts, 글자·단추는 hud.ts, 소리는 audio.ts.
// 100점을 넘은 순간부터 덮개 화면에 결과를 미리 알린다(ctx.report, 닫기·Esc로 끝내도 도장이 남게).
import { currentLang, onLangChange } from '@/components/i18n/useLang';
import { heldKeys, letterOf, shouldHandleShortcut } from '@/lib/keys';
import type { GameResult, MountGame } from '../types';
import { createSound, type SoundName } from './audio';
import { createHud } from './hud';
import {
  ROUND_MS, aimAt, canThrow, createRound, nextSeed, readBest, saveBest, step, summary, throwBall,
  type GameEvent, type Level, type Round, type Summary,
} from './logic';
import { readPalette } from './palette';
import { createView } from './view';
import { endSay, levelSay, streakText, word, type TargetWord } from './words';

const MUTE_KEY = 'jy.game.target.mute.v1';
const COUNT_MS = 600;
const AIM_KEYS: Record<string, [number, number]> = {
  arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1],
  a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hitWord(e: Extract<GameEvent, { t: 'hit' }>): TargetWord {
  if (e.kind === 'balloon') return e.gold ? 'gold' : 'pop';
  if (e.kind === 'duck') return 'duck';
  if (e.kind === 'can') return e.allDown ? 'allDown' : e.extra > 0 ? 'crash' : 'clang';
  return e.ring === 0 ? 'bull' : e.ring === 1 ? 'good' : 'hit';
}
/** 맞힌 자리 위에 뜨는 말(지금 화면 말로) */
const hitLabel = (e: Extract<GameEvent, { t: 'hit' }>): string => word(hitWord(e), currentLang());

const SOUND_OF: Record<string, SoundName> = { balloon: 'pop', duck: 'duck', can: 'can', board: 'board' };

const mount: MountGame = (container, ctx) => {
  const store = storage();
  let muted = false;
  try {
    muted = store?.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }
  const sound = createSound(muted);
  let exited = false;
  const hud = createHud(container, {
    coarse: ctx.coarse,
    reducedMotion: ctx.reducedMotion,
    lang: currentLang,
    onStop: () => exit(),
    onSound: () => {
      muted = !muted;
      sound.setMuted(muted);
      if (!muted) sound.unlock();
      hud.setSound(muted);
      try {
        store?.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        /* 기억 못 해도 된다 */
      }
    },
  });
  hud.setSound(muted);
  // 놀이 중에 화면 말이 바뀌면 위 줄 글과 열린 판을 다시 쓴다
  const offLang = onLangChange(() => hud.relabel());
  const view = createView(hud.stage, { palette: readPalette(container, ctx.theme), reducedMotion: ctx.reducedMotion, coarse: ctx.coarse });

  let seed = ctx.seed >>> 0;
  let played = 0;
  let level: Level = 'easy';
  let round: Round = createRound(seed, level);
  view.reset(round);
  type Phase = 'start' | 'count' | 'play' | 'end';
  let phase: Phase = 'start';
  let countMs = 0;
  let shown = 0;
  let goMs = -1;
  let idleUntil = 0;
  const done: Array<Summary & { level: Level }> = [];

  let w = container.clientWidth || 1;
  let h = container.clientHeight || 1;
  const aim = { x: w / 2, y: h * 0.42, on: false };
  const held = heldKeys();
  let slow = false;
  const wake = () => (idleUntil = performance.now() + 1500);

  const setPhase = (p: Phase) => {
    phase = p;
    hud.setPhase(p);
    wake();
  };

  function showStart() {
    setPhase('start');
    hud.showStart({ easy: readBest(store, 'easy'), normal: readBest(store, 'normal') }, begin);
  }

  function begin(lv: Level) {
    sound.unlock();
    level = lv;
    if (played > 0) seed = nextSeed(seed);
    played++;
    round = createRound(seed, level);
    view.reset(round);
    hud.setScore(0);
    hud.setStreak(0);
    hud.setGoal(false);
    hud.setTime(ROUND_MS, ROUND_MS);
    countMs = 0;
    shown = 0;
    goMs = -1;
    setPhase('count');
    hud.showCount('3');
    sound.play('count');
    hud.stage.focus({ preventScroll: true });
    hud.say(levelSay(lv, currentLang()));
  }

  function handle(ev: GameEvent[]) {
    if (ev.length === 0) return;
    view.events(round, ev);
    for (const e of ev) {
      if (e.t === 'throw') sound.play('throw');
      else if (e.t === 'hit') {
        sound.play(e.kind === 'balloon' && e.gold ? 'gold' : SOUND_OF[e.kind], { streak: e.streak, ring: e.ring });
        const at = view.project(e.at);
        hud.pop(at.x, at.y - 10, `+${e.points}`, {
          sub: hitLabel(e),
          note: e.streak >= 2 ? streakText(e.streak, currentLang()) : undefined,
          big: e.points >= 40 || e.allDown,
          gold: e.gold,
        });
        hud.setStreak(e.streak);
      } else if (e.t === 'miss') {
        if (e.surface !== 'air') sound.play('miss');
        hud.setStreak(0);
      } else if (e.t === 'bump') sound.play('bump');
      else if (e.t === 'tick') sound.play('tick');
      else if (e.t === 'clear') {
        sound.play('clear');
        hud.pop(w / 2, h * 0.36, word('clearPop', currentLang()), { sub: word('clearSub', currentLang()), big: true });
        hud.say(word('clearSay', currentLang()));
        hud.setGoal(true);
      } else if (e.t === 'end') finishRound();
    }
    hud.setScore(round.score);
    // 해낸 판이 하나라도 있으면 점수가 바뀔 때마다 알린다
    if (ev.some((e) => e.t === 'hit' || e.t === 'clear' || e.t === 'end')) {
      const r = result();
      if (r?.cleared) ctx.report?.(r);
    }
  }

  function finishRound() {
    const sum = summary(round);
    const isNew = saveBest(store, level, sum.score);
    done.push({ ...sum, level });
    setPhase('end');
    sound.play('end');
    hud.showEnd(sum, readBest(store, level), isNew, { again: () => begin(level), change: showStart, finish: () => exit() });
    hud.say(endSay(sum.score, sum.accuracy, currentLang()));
  }

  function shoot() {
    if (phase !== 'play' || !canThrow(round)) return;
    const from = view.hand();
    const { point } = aimAt(round, view.ray(aim.x, aim.y), from);
    handle(throwBall(round, point, from));
  }

  /** 지금까지 한 판 중 가장 좋은 판(하던 판도 던졌으면 넣는다). 한 번도 안 던졌으면 결과 없이 닫는다 */
  function result(): GameResult | undefined {
    const all = [...done];
    if ((phase === 'play' || phase === 'count') && round.throws > 0) all.push({ ...summary(round), level });
    if (all.length === 0) return undefined;
    const best = all.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      score: best.score,
      cleared: all.some((r) => r.cleared),
      ms: best.ms,
      detail: { hits: best.hits, throws: best.throws, accuracy: best.accuracy, bestStreak: best.bestStreak, level: best.level, rounds: all.length },
    };
  }

  function exit() {
    if (exited) return;
    exited = true;
    ctx.onExit(result());
  }

  // ---------- 입력 ----------
  const local = (e: PointerEvent) => {
    const r = hud.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    Object.assign(aim, local(e), { on: true });
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') aim.on = false;
  };
  const onDown = (e: PointerEvent) => {
    sound.unlock();
    if (phase !== 'play' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = local(e);
    aim.x = p.x;
    aim.y = p.y;
    if (e.pointerType !== 'mouse') hud.tap(p.x, p.y);
    else aim.on = true;
    hud.stage.focus({ preventScroll: true });
    shoot();
  };
  const noMenu = (e: Event) => e.preventDefault();
  const onKey = (e: KeyboardEvent) => {
    if (phase !== 'play' || e.key === 'Escape' || !shouldHandleShortcut(e)) return;
    // 글자 키는 자판 자리로 읽는다(한글 자판이 켜져 있어도 W A S D로 조준하게)
    const k = letterOf(e);
    slow = e.shiftKey;
    if (k === ' ' || k === 'enter') {
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      sound.unlock();
      aim.on = true;
      shoot();
      return;
    }
    if (!AIM_KEYS[k] || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    held.down(e, k);
    aim.on = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    // 맥은 Command를 누르고 있는 동안 다른 키를 뗀 신호를 주지 않는다: Command를 떼면 조준 키를 모두 놓는다
    // (아직 누르고 있던 키는 다시 눌러야 한다. 조준점이 혼자 계속 흐르는 것보다 멈추는 쪽이 낫다)
    if (e.key === 'Meta') held.clear();
    else held.up(e);
    slow = e.shiftKey;
  };
  const onBlur = () => held.clear();
  const st = hud.stage;
  st.addEventListener('pointermove', onMove);
  st.addEventListener('pointerleave', onLeave);
  st.addEventListener('pointerdown', onDown);
  st.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur);

  // ---------- 크기와 그리기 ----------
  const fit = () => {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    view.resize(w, h);
    aim.x = Math.min(aim.x, w);
    aim.y = Math.min(aim.y, h);
    wake();
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(container);
  fit();

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dtMs = Math.min(50, Math.max(0, now - last));
    last = now;
    if (held.size) {
      let dx = 0;
      let dy = 0;
      for (const k of held.values()) {
        dx += AIM_KEYS[k][0];
        dy += AIM_KEYS[k][1];
      }
      const v = (Math.min(w, h) * (slow ? 0.3 : 0.85) * dtMs) / 1000;
      aim.x = Math.min(w, Math.max(0, aim.x + dx * v));
      aim.y = Math.min(h, Math.max(0, aim.y + dy * v));
    }
    if (phase === 'count') {
      countMs += dtMs;
      const n = Math.floor(countMs / COUNT_MS);
      if (n !== shown) {
        shown = n;
        if (n < 3) {
          hud.showCount(String(3 - n));
          sound.play('count');
        } else {
          hud.showCount(word('go', currentLang()));
          sound.play('go');
          goMs = 0;
          setPhase('play');
          hud.say(word('start', currentLang()));
        }
      }
    } else if (phase === 'play') {
      handle(step(round, dtMs));
      hud.setTime(ROUND_MS - round.now, ROUND_MS);
    }
    if (goMs >= 0 && (goMs += dtMs) > 550) {
      goMs = -1;
      hud.showCount(null);
    }
    if (phase === 'play' && aim.on) hud.cross(aim.x, aim.y, true, aimAt(round, view.ray(aim.x, aim.y)).target !== null);
    else hud.cross(0, 0, false, false);
    if (phase === 'play' || phase === 'count' || now < idleUntil) view.frame(round, dtMs / 1000, phase === 'play' && canThrow(round));
  };
  showStart();
  raf = requestAnimationFrame(frame);

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    exited = true;
    cancelAnimationFrame(raf);
    offLang();
    ro?.disconnect();
    st.removeEventListener('pointermove', onMove);
    st.removeEventListener('pointerleave', onLeave);
    st.removeEventListener('pointerdown', onDown);
    st.removeEventListener('contextmenu', noMenu);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    view.dispose();
    hud.dispose();
    sound.close();
  };
};

export default mount;
