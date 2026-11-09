// 화면 글자와 단추: 위 줄(시간·점수·소리·그만하기), 시작판(그림으로 고르는 두 판), 3·2·1, 끝판, 튀어오르는 점수.
// 글을 못 읽어도 하게 그림·별·막대로 같이 보여 준다. DOM만 다루고 판 계산은 모른다.
import type { Level, Summary } from './logic';
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
const TARGET = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" ${F('paper-2')}/><circle cx="${cx}" cy="${cy}" r="${r}" ${ST('ink-2', 2)}/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r * 0.67}" ${F('focus')}/><circle cx="${cx}" cy="${cy}" r="${r * 0.34}" ${F('roof')}/>`;
const ICON = {
  soundOn: `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" ${F('ink')}/><path d="M16 8.5c1.6 1.8 1.6 5.2 0 7M18.6 6c3 3.2 3 8.8 0 12" ${ST('ink', 2)}/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" ${F('ink')}/><path d="M16.5 9.5l5 5m0-5l-5 5" ${ST('ink', 2)}/></svg>`,
  stop: `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" ${F('ink')}/></svg>`,
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
  setSound(muted: boolean): void;
  showStart(best: Record<Level, number>, onPick: (l: Level) => void): void;
  showCount(text: string | null): void;
  showEnd(sum: Summary, best: number, isNew: boolean, h: EndHandlers): void;
  pop(x: number, y: number, main: string, opt?: { sub?: string; note?: string; big?: boolean; gold?: boolean }): void;
  tap(x: number, y: number): void;
  cross(x: number, y: number, on: boolean, lock: boolean): void;
  say(text: string): void;
  dispose(): void;
};

type HudOpts = { coarse: boolean; reducedMotion: boolean; onStop: () => void; onSound: () => void };

export function createHud(container: HTMLElement, o: HudOpts): Hud {
  const root = el('div', s.root);
  if (o.reducedMotion) root.setAttribute('data-reduced', '');
  const stage = el('div', s.stage, {
    tabindex: '0',
    role: 'application',
    'aria-label': o.coarse
      ? '과녁 놀이 화면. 던질 곳을 눌러 종이공을 던져요.'
      : '과녁 놀이 화면. 마우스로 겨누고 눌러 던지거나, 화살표 키로 겨누고 Space 또는 Enter로 던져요.',
  });
  const fx = el('div', s.fx, { 'aria-hidden': 'true' });
  const crossEl = el('div', s.cross, { 'aria-hidden': 'true' });
  const bar = el('div', s.bar);
  const time = el('div', `${s.chip} ${s.time}`, { role: 'timer', 'aria-label': '남은 시간 60초' });
  const timeNum = el('b', undefined, {}, '60');
  const timeBar = el('span', s.timeBar, { 'aria-hidden': 'true' });
  timeBar.append(el('i'));
  time.append(svg(ICON.clock), timeNum, timeBar);
  const score = el('div', s.chip, { 'aria-label': '점수 0' });
  const scoreNum = el('b', undefined, {}, '0');
  score.append(el('span', s.label, { 'aria-hidden': 'true' }, '점수'), scoreNum);
  const tools = el('div', s.tools);
  const soundBtn = el('button', `${s.btn} ${s.icon}`, { type: 'button' });
  const stopBtn = el('button', s.btn, { type: 'button', 'aria-label': '그만하기' });
  stopBtn.append(svg(ICON.stop), el('span', undefined, {}, '그만하기'));
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

  const closePanel = () => {
    panel?.remove();
    panel = null;
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
      time.setAttribute('aria-label', `남은 시간 ${sec}초`);
      if (sec <= 10) root.setAttribute('data-hurry', '');
      else root.removeAttribute('data-hurry');
    },
    setScore(n) {
      if (n === lastScore) return;
      lastScore = n;
      scoreNum.textContent = String(n);
      score.setAttribute('aria-label', `점수 ${n}`);
    },
    setStreak(n) {
      if (n === lastStreak) return;
      lastStreak = n;
      if (n < 2) {
        streak.removeAttribute('data-on');
        return;
      }
      streak.textContent = `연속 ${n}번`;
      streak.setAttribute('data-on', '');
      streak.removeAttribute('data-bump');
      void streak.offsetWidth;
      streak.setAttribute('data-bump', '');
    },
    setSound(muted) {
      soundBtn.replaceChildren(svg(muted ? ICON.soundOff : ICON.soundOn));
      soundBtn.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
      soundBtn.title = muted ? '소리 켜기' : '소리 끄기';
    },
    showStart(best, onPick) {
      const p = openPanel('놀이 고르기');
      const h = el('h3', undefined, { tabindex: '-1' }, '종이공을 던져 과녁을 맞혀요');
      const hint = el('p', s.hint, {}, o.coarse ? '던질 곳을 톡 눌러요.' : '마우스로 겨누고 눌러서 던져요. 화살표 키로 겨누고 Space로 던져도 돼요.');
      const levels = el('div', s.levels);
      const pick = (lv: Level, title: string, sub: string, icon: string) => {
        const b = el('button', s.level, { type: 'button', 'aria-label': `${title}, ${sub}` });
        b.append(svg(icon), el('span', undefined, {}, title), el('small', undefined, {}, sub));
        b.addEventListener('click', () => onPick(lv));
        levels.append(b);
        return b;
      };
      const first = pick('easy', '쉬운 판', '과녁이 크고 천천히', ICON.easy);
      pick('normal', '보통 판', '움직이는 과녁', ICON.normal);
      const goal = el('p', s.hint, {}, '60초 동안 100점을 넘기면 해냈어요.');
      p.append(h, svg(ICON.pics, '종이공이 날아가 과녁에 맞는 그림'), hint, levels, goal);
      if (best.easy || best.normal) p.append(el('p', s.hint, {}, `이 기기 최고 점수: 쉬운 판 ${best.easy}점, 보통 판 ${best.normal}점`));
      first.focus({ preventScroll: true });
    },
    showCount(text) {
      count.replaceChildren();
      if (text) count.append(el('span', undefined, {}, text));
    },
    showEnd(sum, best, isNew, hd) {
      const p = openPanel('결과');
      const h = el('h3', undefined, { tabindex: '-1' }, sum.cleared ? '해냈어요!' : '끝!');
      const stars = el('div', s.stars, { role: 'img', 'aria-label': `별 ${sum.stars}개` });
      for (let i = 0; i < 3; i++) stars.append(svg(ICON.star(i < sum.stars)));
      const big = el('p', s.big, { 'aria-label': `${sum.score}점` }, String(sum.score));
      const nums = el('dl', s.nums);
      for (const [k, v] of [['맞힌 수', `${sum.hits}/${sum.throws}`], ['명중률', `${sum.accuracy}%`], ['가장 긴 연속', `${sum.bestStreak}번`]]) {
        const d = el('div');
        d.append(el('dt', undefined, {}, k), el('dd', undefined, {}, v));
        nums.append(d);
      }
      p.append(h, stars, big, nums);
      p.append(isNew ? el('p', s.badge, {}, '새 최고 점수!') : el('p', s.hint, {}, `이 기기 최고 점수 ${best}점`));
      const row = el('div', s.row);
      const again = el('button', `${s.btn} ${s.primary}`, { type: 'button' }, '한 번 더');
      const change = el('button', s.btn, { type: 'button' }, '다른 판');
      const finish = el('button', s.btn, { type: 'button' }, '마치기');
      again.addEventListener('click', hd.again);
      change.addEventListener('click', hd.change);
      finish.addEventListener('click', hd.finish);
      row.append(again, change, finish);
      p.append(row);
      again.focus({ preventScroll: true });
    },
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
    dispose() {
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
      root.remove();
    },
  };
}
