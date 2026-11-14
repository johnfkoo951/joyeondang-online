'use client';
import { useSyncExternalStore } from 'react';

// 사이트 전체 상태(조용 모드, 박수 수). 화면 어디서 불러도 한 곳에서만 묻는다(모듈 하나에 상태 하나).
// 화면이 보이는 동안 15초마다 /api/site를 묻고, 탭이 숨으면 멈추고, 다시 보이거나 창이 앞으로 오면 바로 묻는다.

export type SiteState = {
  /** 공통 세션(조용 모드) 중인가 */
  quiet: boolean;
  /** 조용 모드가 끝나는 때(ISO) */
  until: string | null;
  claps: number;
  /** 한 번이라도 서버 답을 받았는가(받기 전에는 조용하지 않은 것으로 본다) */
  known: boolean;
};

const POLL_MS = 15_000;
const INITIAL: SiteState = { quiet: false, until: null, claps: 0, known: false };

let state: SiteState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: AbortController | null = null;

function set(next: SiteState) {
  if (next.quiet === state.quiet && next.until === state.until && next.claps === state.claps && next.known === state.known) return;
  state = next;
  for (const l of listeners) l();
}

/** 서버 답을 화면 상태로(모양이 이상하면 조용하지 않은 것으로) */
export function readSite(raw: unknown): Omit<SiteState, 'known'> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const until = typeof r.until === 'string' && !Number.isNaN(Date.parse(r.until)) ? r.until : null;
  const claps = typeof r.claps === 'number' && Number.isFinite(r.claps) && r.claps >= 0 ? Math.floor(r.claps) : 0;
  return { quiet: r.quiet === true && until !== null && Date.parse(until) > Date.now(), until, claps };
}

async function poll() {
  inflight?.abort();
  const ctl = new AbortController();
  inflight = ctl;
  try {
    const res = await fetch('/api/site', { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) return;
    set({ ...readSite(await res.json()), known: true });
  } catch {
    // 연결이 잠시 끊겨도 마지막 상태를 그대로 둔다
  } finally {
    if (inflight === ctl) inflight = null;
  }
}

function startTimer() {
  if (timer || document.visibilityState === 'hidden') return;
  timer = setInterval(() => void poll(), POLL_MS);
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}
function onVisible() {
  if (document.visibilityState === 'hidden') {
    stopTimer();
    return;
  }
  void poll();
  startTimer();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void poll();
    startTimer();
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      stopTimer();
      inflight?.abort();
    }
  };
}

export function useSiteState(): SiteState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

/** 박수를 친 뒤 서버가 돌려준 수를 바로 반영한다 */
export function setClaps(n: number) {
  if (Number.isFinite(n) && n >= 0) set({ ...state, claps: Math.floor(n) });
}

/** 지금 상태(구독 없이 한 번 읽기) */
export function siteSnapshot(): SiteState {
  return state;
}

/** now(ms)에 조용 모드인가. 끝나는 때가 지났으면 서버에 다시 묻기 전이라도 조용하지 않다(띠와 같은 기준) */
export function isQuietAt(site: Pick<SiteState, 'quiet' | 'until'>, now: number): boolean {
  return site.quiet && site.until !== null && Date.parse(site.until) > now;
}
