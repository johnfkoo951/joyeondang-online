// 화면 글자와 단추: 위 줄(시간·점수·소리·그만하기), 시작판(그림으로 고르는 두 판), 3·2·1, 끝판, 튀어오르는 점수.
// 글을 못 읽어도 하게 그림·별·막대로 같이 보여 준다. DOM만 다루고 판 계산은 모른다.
// 글은 words.ts의 한국어·영어 표에서 지금 말(o.lang)로 고른다. 말이 바뀌면 relabel()이 위 줄 글과 열린 판(시작판·끝판)을 다시 쓴다.
import { CLEAR_SCORE, type Level, type Summary } from './logic';
import {
  bestHere, bestLine, goalLabel, pointsLabel, scoreLabel, starsLabel, streakText, timeLabel, timesLabel, word,
  type Lang, type TargetWord,
} from './words';
import s from './target.module.css';

type Attrs = Record<string, string>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, attrs: Attrs = {}, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

/** 고정된 그림(사용자 글자가 들어가지 않는 SVG 문자열만 innerHTML로) */
function svg(markup: string, label?: string): SVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = markup;
  const node = wrap.firstElementChild as SVGElement;
  if (label) {
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);
  } else node.setAttribute('aria-hidden', 'true');
  return node;
}

const F = (v: string) => `style="fill:var(--${v})"`;
const ST = (v: string, w = 3) => `style="fill:none;stroke:var(--${v});stroke-width:${w};stroke-linecap:round"`;
/** 단추 그림: 단추 글자색을 따른다(주 단추 위에서는 밝은 색) */
const SC = (w: number) => `style="fill:none;stroke:currentColor;stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"`;
const TARGET = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" ${F('paper-2')}/><circle cx="${cx}" cy="${cy}" r="${r}" ${ST('ink-2', 2)}/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r * 0.67}" ${F('focus')}/><circle cx="${cx}" cy="${cy}" r="${r * 0.34}" ${F('roof')}/>`;
const ICON = {
  soundOn: `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" ${F('ink')}/><path d="M16 8.5c1.6 1.8 1.6 5.2 0 7M18.6 6c3 3.2 3 8.8 0 12" ${ST('ink', 2)}/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" ${F('ink')}/><path d="M16.5 9.5l5 5m0-5l-5 5" ${ST('ink', 2)}/></svg>`,
  door: `<svg viewBox="0 0 24 24"><path d="M14 4H6v16h8M10 12h10M17 9l3 3-3 3" ${SC(2.2)}/></svg>`,
  again: `<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15" ${SC(2.4)}/></svg>`,
  swap: `<svg viewBox="0 0 24 24"><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" ${SC(2.2)}/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" ${SC(2.8)}/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="13" r="8" ${ST('ink', 2.2)}/><path d="M12 13V9M10 3h4" ${ST('ink', 2.2)}/></svg>`,
  easy: `<svg viewBox="0 0 56 56">${TARGET(28, 28, 25)}</svg>`,
  normal: `<svg viewBox="0 0 56 56">${TARGET(22, 32, 17)}<path d="M44 6c6 0 8 5 8 9s-4 9-8 9-8-5-8-9 2-9 8-9z" ${F('lamp')}/><path d="M44 24v6" ${ST('ink-3', 1.5)}/><path d="M38 16h12" ${ST('season', 2)}/></svg>`,
  star: (on: boolean) => `<svg viewBox="0 0 40 40"><path d="M20 3l5.2 10.8 11.8 1.6-8.6 8.2 2.1 11.7L20 29.6 9.5 35.3l2.1-11.7L3 15.4l11.8-1.6z" ${F(on ? 'lamp' : 'line-2')}/></svg>`,
  pics:
    `<svg viewBox="0 0 300 96"><path d="M30 80 Q 120 -10 228 46" ${ST('ink-3', 3)} stroke-dasharray="2 9"/>` +
    `<circle cx="30" cy="80" r="11" ${F('paper-3')}/><circle cx="30" cy="80" r="11" ${ST('ink-2', 2)}/>` +
    `${TARGET(240, 52, 30)}<path d="M262 14l6-8M276 26l9-3M250 6l1-6" ${ST('season', 3)}/>` +
    `<text x="150" y="92" text-anchor="middle" font-size="15" font-weight="800" ${F('pine')}>+20</text></svg>`,
};

export type EndHandlers = { again: () => void; change: () => void; finish: () => void };

export type Hud = {
  root: HTMLDivElement;
  stage: HTMLDivElement;
  setPhase(p: 'start' | 'count' | 'play' | 'end'): void;
  setTime(leftMs: number, totalMs: number): void;
  setScore(n: number): void;
  setStreak(n: number): void;
  /** 목표(100점) 별을 밝힌다 */
  setGoal(reached: boolean): void;
  setSound(muted: boolean): void;
  showStart(best: Record<Level, number>, onPick: (l: Level) => void): void;
  showCount(text: string | null): void;
  showEnd(sum: Summary, best: number, isNew: boolean, h: EndHandlers): void;
  pop(x: number, y: number, main: string, opt?: { sub?: string; note?: string; big?: boolean; gold?: boolean }): void;
  tap(x: number, y: number): void;
  cross(x: number, y: number, on: boolean, lock: boolean): void;
  say(text: string): void;
  /** 화면 말이 바뀌었을 때: 위 줄 글과 열린 판을 지금 말로 다시 쓴다 */
  relabel(): void;
  dispose(): void;
};

type HudOpts = { coarse: boolean; reducedMotion: boolean; onStop: () => void; onSound: () => void; /** 지금 화면 말(없으면 한국어) */ lang?: () => Lang };

export function createHud(container: HTMLElement, o: HudOpts): Hud {
  const getLang = o.lang ?? (() => 'ko' as const);
  let L: Lang = getLang();
  const w = (k: TargetWord) => word(k, L);
  const root = el('div', s.root);
  if (o.reducedMotion) root.setAttribute('data-reduced', '');
  const stage = el('div', s.stage, {
    tabindex: '0',
    role: 'application',
    'aria-label': w(o.coarse ? 'stageTouch' : 'stageMouse'),
  });
  const fx = el('div', s.fx, { 'aria-hidden': 'true' });
  const crossEl = el('div', s.cross, { 'aria-hidden': 'true' });
  const bar = el('div', s.bar);
  const time = el('div', `${s.chip} ${s.time}`, { role: 'timer', 'aria-label': timeLabel(60, L) });
  const timeNum = el('b', undefined, {}, '60');
  const timeBar = el('span', s.timeBar, { 'aria-hidden': 'true' });
  timeBar.append(el('i'));
  // 시간 막대 옆 목표 별: 100점을 넘으면 노랗게 켜진다(글을 몰라도 「별을 켜면 해낸 것」)
  const goal = el('span', s.goal, { role: 'img', 'aria-label': goalLabel(CLEAR_SCORE, false, L) });
  goal.append(svg(ICON.star(false)), el('small', undefined, { 'aria-hidden': 'true' }, String(CLEAR_SCORE)));
  time.append(svg(ICON.clock), timeNum, timeBar, goal);
  const score = el('div', s.chip, { 'aria-label': scoreLabel(0, L) });
  const scoreNum = el('b', undefined, {}, '0');
  const scoreWord = el('span', s.label, { 'aria-hidden': 'true' }, w('score'));
  score.append(scoreWord, scoreNum);
  const tools = el('div', s.tools);
  const soundBtn = el('button', `${s.btn} ${s.icon}`, { type: 'button' });
  const stopBtn = el('button', s.btn, { type: 'button', 'aria-label': w('stop') });
  const stopText = el('span', s.stopText, {}, w('stop'));
  stopBtn.append(svg(ICON.door), stopText);
  tools.append(soundBtn, stopBtn);
  bar.append(time, score, tools);
  const streak = el('div', `${s.chip} ${s.streak}`, { 'aria-hidden': 'true' });
  const count = el('div', s.count, { 'aria-hidden': 'true' });
  const live = el('p', s.sr, { 'aria-live': 'polite', role: 'status' });
  let panel: HTMLElement | null = null;
  root.append(stage, fx, crossEl, bar, streak, count, live);
  container.append(root);

  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  stopBtn.addEventListener('click', () => o.onStop());
  soundBtn.addEventListener('click', () => o.onSound());

  /** 열린 판(시작판·끝판)을 지금 말로 다시 그리는 일. 판이 닫히면 비운다 */
  let redraw: (() => void) | null = null;
  const closePanel = () => {
    panel?.remove();
    panel = null;
    redraw = null;
  };
  const openPanel = (label: string) => {
    closePanel();
    panel = el('section', s.panel, { 'aria-label': label });
    root.append(panel);
    return panel;
  };
  let lastSec = -1;
  let lastScore = -1;
  let lastStreak = 0;
  let goalOn = false;
  let mutedNow: boolean | null = null;
  const soundLabels = () => {
    if (mutedNow === null) return;
    soundBtn.setAttribute('aria-label', w(mutedNow ? 'unmute' : 'mute'));
    soundBtn.title = w(mutedNow ? 'unmute' : 'mute');
  };

  function showStart(best: Record<Level, number>, onPick: (l: Level) => void) {
    const p = openPanel(w('pickPanel'));
    const h = el('h3', undefined, { tabindex: '-1' }, w('startTitle'));
    const hint = el('p', s.hint, {}, w(o.coarse ? 'hintTouch' : 'hintMouse'));
    const levels = el('div', s.levels);
    const pick = (lv: Level, title: string, sub: string, icon: string) => {
      const b = el('button', s.level, { type: 'button', 'aria-label': `${title}, ${sub}` });
      b.append(svg(icon), el('span', undefined, {}, title), el('small', undefined, {}, sub));
      b.addEventListener('click', () => onPick(lv));
      levels.append(b);
      return b;
    };
    const first = pick('easy', w('easy'), w('easySub'), ICON.easy);
    pick('normal', w('normal'), w('normalSub'), ICON.normal);
    const goalLine = el('p', s.hint, {}, w('goalLine'));
    p.append(h, svg(ICON.pics, w('pics')), hint, levels, goalLine);
    if (best.easy || best.normal) p.append(el('p', s.hint, {}, bestLine(best.easy, best.normal, L)));
    first.focus({ preventScroll: true });
    redraw = () => showStart(best, onPick);
  }

  function showEnd(sum: Summary, best: number, isNew: boolean, hd: EndHandlers) {
    const p = openPanel(w('resultPanel'));
    const h = el('h3', undefined, { tabindex: '-1' }, w(sum.cleared ? 'cleared' : 'over'));
    const stars = el('div', s.stars, { role: 'img', 'aria-label': starsLabel(sum.stars, L) });
    for (let i = 0; i < 3; i++) stars.append(svg(ICON.star(i < sum.stars)));
    const big = el('p', s.big, { 'aria-label': pointsLabel(sum.score, L) }, String(sum.score));
    const nums = el('dl', s.nums);
    for (const [k, v] of [[w('hits'), `${sum.hits}/${sum.throws}`], [w('accuracy'), `${sum.accuracy}%`], [w('bestStreak'), timesLabel(sum.bestStreak, L)]]) {
      const d = el('div');
      d.append(el('dt', undefined, {}, k), el('dd', undefined, {}, v));
      nums.append(d);
    }
    p.append(h, stars, big, nums);
    p.append(isNew ? el('p', s.badge, {}, w('newBest')) : el('p', s.hint, {}, bestHere(best, L)));
    // 그림 단추: 한 번 더(↻) · 다른 판(⇄) · 마치기(✓). 해낸 판이면 「마치기」가 주 단추
    const row = el('div', s.row);
    const button = (icon: string, text: string, main: boolean) => {
      const b = el('button', main ? `${s.btn} ${s.primary}` : s.btn, { type: 'button' });
      b.append(svg(icon), el('span', undefined, {}, text));
      return b;
    };
    const again = button(ICON.again, w('again'), !sum.cleared);
    const change = button(ICON.swap, w('change'), false);
    const finish = button(ICON.check, w('finish'), sum.cleared);
    again.addEventListener('click', hd.again);
    change.addEventListener('click', hd.change);
    finish.addEventListener('click', hd.finish);
    row.append(...(sum.cleared ? [finish, again, change] : [again, change, finish]));
    p.append(row);
    (sum.cleared ? finish : again).focus({ preventScroll: true });
    redraw = () => showEnd(sum, best, isNew, hd);
  }

  return {
    root,
    stage,
    setPhase(p) {
      root.dataset.phase = p;
      bar.style.visibility = p === 'start' ? 'hidden' : 'visible';
      stopBtn.hidden = p === 'end';
      if (p !== 'play') crossEl.removeAttribute('data-on');
      if (p === 'count' || p === 'play') closePanel();
    },
    setTime(left, total) {
      const sec = Math.max(0, Math.ceil(left / 1000));
      (timeBar.firstElementChild as HTMLElement).style.setProperty('--left', String(Math.max(0, Math.min(1, left / total))));
      if (sec === lastSec) return;
      lastSec = sec;
      timeNum.textContent = String(sec);
      time.setAttribute('aria-label', timeLabel(sec, L));
      if (sec <= 10) root.setAttribute('data-hurry', '');
      else root.removeAttribute('data-hurry');
    },
    setScore(n) {
      if (n === lastScore) return;
      lastScore = n;
      scoreNum.textContent = String(n);
      score.setAttribute('aria-label', scoreLabel(n, L));
    },
    setStreak(n) {
      if (n === lastStreak) return;
      lastStreak = n;
      if (n < 2) {
        streak.removeAttribute('data-on');
        return;
      }
      streak.textContent = streakText(n, L);
      streak.setAttribute('data-on', '');
      streak.removeAttribute('data-bump');
      void streak.offsetWidth;
      streak.setAttribute('data-bump', '');
    },
    setGoal(reached) {
      goalOn = reached;
      goal.toggleAttribute('data-on', reached);
      goal.firstElementChild?.replaceWith(svg(ICON.star(reached)));
      goal.setAttribute('aria-label', goalLabel(CLEAR_SCORE, reached, L));
    },
    setSound(muted) {
      mutedNow = muted;
      soundBtn.replaceChildren(svg(muted ? ICON.soundOff : ICON.soundOn));
      soundLabels();
    },
    showStart,
    showCount(text) {
      count.replaceChildren();
      if (text) count.append(el('span', undefined, {}, text));
    },
    showEnd,
    pop(x, y, main, opt = {}) {
      const n = el('div', [s.pop, opt.big ? s.popBig : '', opt.gold ? s.popGold : ''].filter(Boolean).join(' '));
      n.style.left = `${x}px`;
      n.style.top = `${y}px`;
      n.append(document.createTextNode(main));
      if (opt.sub) n.append(el('small', undefined, {}, opt.sub));
      if (opt.note) n.append(el('em', undefined, {}, opt.note));
      fx.append(n);
      // 한꺼번에 너무 많이 쌓이지 않게
      while (fx.childElementCount > 14) fx.firstElementChild?.remove();
      later(() => n.remove(), 1000);
    },
    tap(x, y) {
      const n = el('div', s.tap);
      n.style.left = `${x}px`;
      n.style.top = `${y}px`;
      fx.append(n);
      later(() => n.remove(), 400);
    },
    cross(x, y, on, lock) {
      if (!on) {
        crossEl.removeAttribute('data-on');
        return;
      }
      crossEl.setAttribute('data-on', '');
      crossEl.toggleAttribute('data-lock', lock);
      crossEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    },
    say(text) {
      live.textContent = '';
      later(() => (live.textContent = text), 30);
    },
    relabel() {
      const next = getLang();
      if (next === L) return;
      L = next;
      stage.setAttribute('aria-label', w(o.coarse ? 'stageTouch' : 'stageMouse'));
      time.setAttribute('aria-label', timeLabel(lastSec < 0 ? 60 : lastSec, L));
      goal.setAttribute('aria-label', goalLabel(CLEAR_SCORE, goalOn, L));
      score.setAttribute('aria-label', scoreLabel(Math.max(0, lastScore), L));
      scoreWord.textContent = w('score');
      stopBtn.setAttribute('aria-label', w('stop'));
      stopText.textContent = w('stop');
      soundLabels();
      if (lastStreak >= 2) streak.textContent = streakText(lastStreak, L);
      redraw?.();
    },
    dispose() {
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
      root.remove();
    },
  };
}
