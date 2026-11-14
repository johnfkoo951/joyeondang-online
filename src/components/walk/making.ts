// 사진 캐릭터를 그리는 중인 일 하나(이 기기). 걷기 화면의 캐릭터 창, 메인 화면의 작은 칩, 겉모습(useCharacter)이 함께 본다.
// 보낸 뒤 받은 id와 보낸 때를 이 기기(localStorage)에 두어 새로 고침해도 이어 묻는다. 묻기는 여기 하나만 한다
// (창과 칩이 따로 묻지 않게): 보는 쪽이 하나라도 있고 일이 끝나지 않았을 때만, 화면이 가려져 있으면 쉬었다가 돌아오면 바로.
// 다 되면 ready를 한 번 알린다(useCharacter가 그 캐릭터로 바꿔 끼운다). 못 그리면 까닭을 남긴다.
// 이 기기에 두는 글(서버 안내, 못 그린 까닭)은 서버가 준 한국어 그대로다. 화면이 영어면 보일 때 옮긴다(components/avatar/Say).
import type { Lang } from '@/lib/i18n';

export type MakingPhase = 'queued' | 'drawing' | 'ready' | 'failed';
export type Making = {
  id: string;
  /** 보낸 때(ms). 서버가 since를 주면 그 값으로 맞춘다(다른 기기에서 보낸 것도 같은 시간) */
  at: number;
  phase: MakingPhase;
  /** 그리기를 시작한 것을 이 기기가 처음 본 때(단계 글을 고르는 데 쓴다) */
  drawingAt: number | null;
  /** 내 앞에 선 작업 수(기다리는 동안) */
  ahead: number | null;
  /** 서버 안내(일꾼이 쉬는 중 등) 또는 못 그린 까닭 */
  message: string | null;
  /** 들어간 칸 번호(1~3, 0019부터) */
  slot: number | null;
  /** 끝난 때(ready·failed) */
  doneAt: number | null;
  /** 끝났다는 알림을 손님이 봤는가(창에서 봤거나 칩을 닫음) */
  seen: boolean;
};

/** 예전에는 id 글자만 두었다(그 값도 이어 읽는다) */
const KEY = 'jy.walk.look.pending.v1';
const ID = /^[0-9a-f-]{8,40}$/;
/** 다 된 알림은 이만큼 지나면 저절로 접는다(못 그린 알림은 닫을 때까지 둔다) */
export const READY_NOTE_MS = 20_000;
/** 끝난 일을 이 기기에 남겨 두는 한도(그 뒤에 열면 조용히 버린다) */
const KEEP_DONE_MS = 30 * 60 * 1000;

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const store = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

function load(now = Date.now()): Making | null {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (typeof v === 'string') return ID.test(v) ? fresh(v, null, now) : null;
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== 'string' || !ID.test(o.id)) return null;
    const phase: MakingPhase = o.phase === 'drawing' || o.phase === 'ready' || o.phase === 'failed' ? o.phase : 'queued';
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const m: Making = {
      id: o.id,
      at: num(o.at) ?? now,
      phase,
      drawingAt: num(o.drawingAt),
      ahead: num(o.ahead),
      message: typeof o.message === 'string' ? o.message.slice(0, 160) : null,
      slot: num(o.slot),
      doneAt: num(o.doneAt),
      seen: o.seen === true,
    };
    if (m.doneAt !== null && now - m.doneAt > KEEP_DONE_MS) return null;
    return m;
  } catch {
    return null;
  }
}

function save(m: Making | null) {
  try {
    const s = store();
    if (!s) return;
    if (m) s.setItem(KEY, JSON.stringify(m));
    else s.removeItem(KEY);
  } catch {
    // 사생활 보호 창 등: 이 기기에 못 둘 뿐, 지금 화면에서는 그대로 보인다
  }
}

const fresh = (id: string, slot: number | null, now = Date.now()): Making => ({
  id, at: now, phase: 'queued', drawingAt: null, ahead: null, message: null, slot, doneAt: null, seen: false,
});

let state: Making | null | undefined; // undefined: 아직 이 기기에서 읽지 않음
const listeners = new Set<() => void>();
const readyListeners = new Set<(id: string) => void>();

function current(): Making | null {
  if (state === undefined) state = typeof window === 'undefined' ? null : load();
  return state;
}

function set(next: Making | null) {
  // 다른 일로 바뀌거나 상태가 바뀌면 연달은 404 셈은 처음부터
  gone = 0;
  state = next;
  save(next);
  for (const fn of [...listeners]) fn();
  schedule();
}

/** 지금 그리는 중(또는 막 끝난) 일. 없으면 null */
export function getMaking(): Making | null {
  return current();
}
/** 서버 렌더링에는 그리는 중인 일이 없다 */
export function getServerMaking(): Making | null {
  return null;
}

/** 바뀔 때 알림을 받는다. 보는 쪽이 하나라도 있으면 묻기를 이어 간다 */
export function subscribeMaking(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) attach();
  schedule();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) detach();
  };
}

/** 다 그린 순간 한 번(이 화면이 그 순간을 봤을 때). 돌려준 함수를 부르면 그만 듣는다 */
export function onMakingReady(fn: (id: string) => void): () => void {
  readyListeners.add(fn);
  return () => readyListeners.delete(fn);
}

/** 사진을 보냈다(서버가 202와 id를 줬다) */
export function startMaking(id: string, slot: number | null = null): void {
  if (!ID.test(id)) return;
  set(fresh(id, slot));
}

/** 다른 기기나 화면에서 보낸 일을 이어 본다(칸 목록에 그리는 중인 것이 있을 때). 이미 보는 일이 있으면 그대로 */
export function adoptMaking(id: string, since: string | null, slot: number | null): void {
  const m = current();
  if (!ID.test(id) || (m && m.id === id) || (m && (m.phase === 'queued' || m.phase === 'drawing'))) return;
  const at = since ? Date.parse(since) : NaN;
  set({ ...fresh(id, slot), at: Number.isFinite(at) ? Math.min(at, Date.now()) : Date.now() });
}

/** 끝난 알림을 봤다(창에서 결과를 봤거나 칩을 닫음) */
export function seeMaking(): void {
  const m = current();
  if (!m || m.seen || (m.phase !== 'ready' && m.phase !== 'failed')) return;
  set({ ...m, seen: true });
}

/** 이 일을 더는 보지 않는다(손님이 그리기를 그만뒀거나 칸을 비움). id를 주면 그 일일 때만 */
export function clearMaking(id?: string): void {
  const m = current();
  if (!m || (id && m.id !== id)) return;
  set(null);
}

/** 걸린 시간 「0:42」, 「12:05」, 「1:02:03」 */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** 진행 막대(0~100). 실제 남은 시간은 알 수 없어 단계와 걸린 시간으로 어림한다(다 되기 전에는 95를 넘지 않는다) */
export function makingPercent(m: Pick<Making, 'phase' | 'drawingAt' | 'at'>, now: number): number {
  if (m.phase === 'ready') return 100;
  if (m.phase === 'failed') return 0;
  if (m.phase === 'queued') return Math.min(18, 6 + Math.round((now - m.at) / 10_000));
  const t = Math.max(0, now - (m.drawingAt ?? m.at)) / 1000;
  return Math.min(95, Math.round(20 + 75 * (1 - Math.exp(-t / 50))));
}

const DRAW_STAGES: { from: number; text: string; en: string }[] = [
  { from: 0, text: '사진을 살펴보는 중이에요', en: 'Looking at your photo' },
  { from: 8, text: '옷 색깔과 머리 모양을 고르는 중이에요', en: 'Picking clothing colors and hairstyle' },
  { from: 20, text: '캐릭터를 그리는 중이에요', en: 'Drawing your character' },
  { from: 60, text: '거의 다 됐어요. 조금만 기다려 주세요', en: 'Almost done. Just a moment' },
];

/**
 * 지금 단계의 한 줄. lang 'en': 영어. 서버가 준 글(일꾼이 쉬는 중 안내, 못 그린 까닭)은 어느 말이든 그대로 돌려준다
 * (화면이 Say로 옮긴다)
 */
export function makingStage(
  m: Pick<Making, 'phase' | 'drawingAt' | 'at' | 'ahead' | 'message'>, now: number, resting: string, lang: Lang = 'ko',
): string {
  const en = lang === 'en';
  if (m.phase === 'ready') return en ? 'Done drawing' : '다 그렸어요';
  if (m.phase === 'failed') return m.message ?? '이번 사진으로는 그림을 만들지 못했어요.';
  // 일꾼이 쉬는 중이면 서버 안내를 그대로(언제 다시 그리는지 알려 준다)
  if (m.message === resting) return resting;
  if (m.phase === 'queued') {
    if (en) return m.ahead && m.ahead > 0 ? `Waiting for your turn · ${m.ahead} ahead` : 'Starting to draw soon';
    return m.ahead && m.ahead > 0 ? `차례를 기다리는 중이에요 · 앞에 ${m.ahead}명` : '곧 그리기 시작해요';
  }
  const t = Math.max(0, now - (m.drawingAt ?? m.at)) / 1000;
  const stage = [...DRAW_STAGES].reverse().find((s) => t >= s.from) ?? DRAW_STAGES[0];
  return en ? stage.en : stage.text;
}

// ───────── 묻기(이 모듈 하나만)

let timer: ReturnType<typeof setTimeout> | undefined;
let asking = false;
let attached = false;

/**
 * 보낸 지 오래될수록, 그리고 앞에 선 사람이 많을수록 드물게 묻는다(사람이 많은 날 서버를 아낀다).
 * 앞에 선 사람 한 명에 3초씩 더 기다리되 30초를 넘지 않는다(차례가 가까워지면 다시 자주 묻는다).
 */
export function pollDelay(sinceMs: number, ahead: number | null = null): number {
  const base = sinceMs < 120_000 ? 4_000 : sinceMs < 600_000 ? 8_000 : 20_000;
  const queue = ahead !== null && ahead > 2 ? Math.min(30_000, ahead * 3_000) : 0;
  return Math.max(base, queue);
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function schedule(delay?: number) {
  clearTimeout(timer);
  timer = undefined;
  const m = current();
  if (!m || listeners.size === 0 || (m.phase !== 'queued' && m.phase !== 'drawing') || hidden()) return;
  const wait = delay ?? pollDelay(Date.now() - m.at, m.phase === 'queued' ? m.ahead : null);
  timer = setTimeout(() => void ask(), wait);
}

/** 상태 묻기의 404가 연달아 온 수. 이만큼이면 내려놓는다 */
let gone = 0;
const GONE_AFTER = 3;
const GONE_RECHECK_MS = 4_000;

async function ask() {
  const m = current();
  if (!m || asking || (m.phase !== 'queued' && m.phase !== 'drawing')) return;
  asking = true;
  let next: number | undefined;
  try {
    const res = await fetch(`/api/avatar/status?id=${encodeURIComponent(m.id)}`, { credentials: 'same-origin', cache: 'no-store' });
    const now = current();
    if (!now || now.id !== m.id) return; // 그사이 새 사진을 보냈거나 그만뒀다
    if (res.status === 404) {
      // 지웠거나(다른 화면에서 그만둠) 들어온 상태가 풀렸다. 몰릴 때 잠깐 404가 올 수도 있어 연달아 세 번일 때만 조용히 내려놓는다
      if (++gone >= GONE_AFTER) {
        gone = 0;
        set(null);
        return;
      }
      next = GONE_RECHECK_MS;
      return;
    }
    gone = 0;
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) return;
    apply(now, data);
  } catch {
    // 잠깐 끊김: 다음에 다시 묻는다
  } finally {
    asking = false;
    schedule(next);
  }
}

/** 서버 답을 상태에 옮긴다(시험에서도 부른다) */
export function nextMaking(m: Making, data: Record<string, unknown>, now = Date.now()): Making {
  const since = typeof data.since === 'string' ? Date.parse(data.since) : NaN;
  const at = Number.isFinite(since) ? Math.min(since, now) : m.at;
  const message = typeof data.message === 'string' && data.message ? data.message.slice(0, 160) : null;
  const ahead = typeof data.ahead === 'number' && Number.isInteger(data.ahead) && data.ahead >= 0 ? data.ahead : null;
  switch (data.status) {
    case 'queued':
      return { ...m, at, phase: 'queued', ahead, message };
    case 'drawing':
      return { ...m, at, phase: 'drawing', drawingAt: m.drawingAt ?? now, ahead: null, message };
    case 'ready':
      return { ...m, at, phase: 'ready', ahead: null, message: null, doneAt: now, seen: false };
    case 'failed':
    case 'rejected':
      return { ...m, at, phase: 'failed', ahead: null, message: message ?? '이번 사진으로는 그림을 만들지 못했어요.', doneAt: now, seen: false };
    default:
      return m;
  }
}

function apply(m: Making, data: Record<string, unknown>) {
  const next = nextMaking(m, data);
  if (next === m) return;
  const becameReady = next.phase === 'ready' && m.phase !== 'ready';
  set(next);
  if (becameReady) for (const fn of [...readyListeners]) fn(next.id);
}

function onVisible() {
  if (!hidden()) schedule(0);
}
/** 다른 탭에서 보냈거나 끝난 것을 이 탭도 따라간다 */
function onStorage(e: StorageEvent) {
  if (e.key !== KEY) return;
  state = load();
  for (const fn of [...listeners]) fn();
  schedule();
}

function attach() {
  if (attached || typeof window === 'undefined' || typeof document === 'undefined') return;
  attached = true;
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('storage', onStorage);
}
function detach() {
  clearTimeout(timer);
  timer = undefined;
  if (!attached) return;
  attached = false;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('storage', onStorage);
}
