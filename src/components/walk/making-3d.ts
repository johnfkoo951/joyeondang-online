// 사진 캐릭터의 3D 모형을 만드는 중인 일 하나(이 기기). 걷기 화면의 작은 칩, 캐릭터 창의 진행 상자, 걷기 엔진이 함께 본다.
// 2D(making.ts)와 같은 틀이다: 요청한 그림 id와 때를 이 기기(localStorage)에 두어 새로 고침해도 이어 묻고, 묻기는 여기 하나만
// 한다(보는 쪽이 하나라도 있고 끝나지 않았을 때만, 화면이 가려져 있으면 쉬었다가 돌아오면 바로). 묻는 간격도 2D와 같다(pollDelay).
// 다 되면 ready를 한 번 알린다: 걷기 화면이 엔진에게 그 모형을 바로 다시 묻게 해(다시 묻기 차례를 기다리지 않고) 3D가 곧 선다.
// 못 만들면 까닭과 셈 안내(한도를 돌려줬는가, 더 해 볼 수 있는가)를 서버 답 그대로 남긴다.
// 글을 만드는 함수는 lang을 받는다(기본 한국어). 서버가 준 까닭·셈 안내는 한국어 그대로 두고, 화면이 보일 때 옮긴다(Say).
import type { Lang } from '@/lib/i18n';
import { pollDelay } from './making';

/** 요청함 → 차례(waiting) → 만드는 중(making) → 다 됐어요(ready) / 못 만듦(failed) */
export type ModelPhase = 'waiting' | 'making' | 'ready' | 'failed';
export type ModelMaking = {
  id: string;
  /** 요청한 때(ms). 서버가 since를 주면 그 값으로 맞춘다(다른 화면에서 요청한 것도 같은 시간) */
  at: number;
  phase: ModelPhase;
  /** 만들기를 시작한 것을 이 기기가 처음 본 때(단계 글과 진행 막대에 쓴다) */
  makingAt: number | null;
  /** 3D 서비스가 쉬어서 이때쯤 다시 만든다(ms. 기다리는 동안만) */
  later: number | null;
  /** 못 만든 까닭 */
  message: string | null;
  /** 못 만들었을 때의 셈 안내(돌려줌, 더 해 볼 수 있는 수) */
  note: string | null;
  /** 끝난 때(ready·failed) */
  doneAt: number | null;
  /** 끝났다는 알림을 손님이 봤는가(창에서 봤거나 칩의 알림을 닫음) */
  seen: boolean;
};

const KEY = 'jy.walk.model.pending.v1';
const ID = /^[0-9a-f-]{8,40}$/;
/** 다 된 알림은 이만큼 지나면 저절로 접는다(못 만든 알림은 닫을 때까지 둔다) */
export const MODEL_NOTE_MS = 20_000;
/** 끝난 일을 이 기기에 남겨 두는 한도(그 뒤에 열면 조용히 버린다) */
const KEEP_DONE_MS = 30 * 60 * 1000;
/** 3D는 보통 이만큼 걸린다(안내 글. 진행 막대의 어림에도 쓴다) */
export const MODEL_USUAL = '보통 1~2분';
/** MODEL_USUAL의 영어(칩과 단계 글 끝에 붙는 짧은 말) */
export const MODEL_USUAL_EN = 'usually 1 to 2 min';
/**
 * 차례를 이만큼 넘게 기다리면 늦어지는 것으로 본다(「늦어지고 있어요」, 「보통 1~2분」을 말하지 않는다).
 * 3D 서비스가 쉬거나(잔액·키, 일꾼의 하루 상한, 일꾼이 꺼짐) 앞선 3D가 많을 때다. 화면은 까닭을 모른다
 */
export const MODEL_SLOW_WAIT_MS = 5 * 60 * 1000;
/** 만들기 시작한 지 이만큼 넘으면 「조금 더 걸리고 있어요」(「보통 1~2분」을 말하지 않는다) */
export const MODEL_SLOW_MAKE_MS = 180_000;

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const store = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const text = (x: unknown) => (typeof x === 'string' && x ? x.slice(0, 200) : null);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function load(now = Date.now()): ModelMaking | null {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !ID.test(o.id)) return null;
    const phase: ModelPhase = o.phase === 'making' || o.phase === 'ready' || o.phase === 'failed' ? o.phase : 'waiting';
    const m: ModelMaking = {
      id: o.id,
      at: num(o.at) ?? now,
      phase,
      makingAt: num(o.makingAt),
      later: num(o.later),
      message: text(o.message),
      note: text(o.note),
      doneAt: num(o.doneAt),
      seen: o.seen === true,
    };
    if (m.doneAt !== null && now - m.doneAt > KEEP_DONE_MS) return null;
    return m;
  } catch {
    return null;
  }
}

function save(m: ModelMaking | null) {
  try {
    const s = store();
    if (!s) return;
    if (m) s.setItem(KEY, JSON.stringify(m));
    else s.removeItem(KEY);
  } catch {
    // 사생활 보호 창 등: 이 기기에 못 둘 뿐, 지금 화면에서는 그대로 보인다
  }
}

const fresh = (id: string, now = Date.now()): ModelMaking => ({
  id, at: now, phase: 'waiting', makingAt: null, later: null, message: null, note: null, doneAt: null, seen: false,
});

let state: ModelMaking | null | undefined; // undefined: 아직 이 기기에서 읽지 않음
const listeners = new Set<() => void>();
const readyListeners = new Set<(id: string) => void>();

function current(): ModelMaking | null {
  if (state === undefined) state = typeof window === 'undefined' ? null : load();
  return state;
}

function set(next: ModelMaking | null) {
  gone = 0;
  state = next;
  save(next);
  for (const fn of [...listeners]) fn();
  schedule();
}

/** 지금 3D를 만드는 중(또는 막 끝난) 일. 없으면 null */
export function getModelMaking(): ModelMaking | null {
  return current();
}
/** 서버 렌더링에는 만드는 중인 일이 없다 */
export function getServerModelMaking(): ModelMaking | null {
  return null;
}

/** 바뀔 때 알림을 받는다. 보는 쪽이 하나라도 있으면 묻기를 이어 간다 */
export function subscribeModelMaking(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) attach();
  schedule();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) detach();
  };
}

/** 3D가 다 된 순간 한 번(이 화면이 그 순간을 봤을 때). 돌려준 함수를 부르면 그만 듣는다 */
export function onModelReady(fn: (id: string) => void): () => void {
  readyListeners.add(fn);
  return () => readyListeners.delete(fn);
}

/** 3D를 요청했다(서버가 받았다). 같은 그림을 이미 보고 있으면 그대로 */
export function startModelMaking(id: string): void {
  if (!ID.test(id)) return;
  const m = current();
  if (m && m.id === id && (m.phase === 'waiting' || m.phase === 'making')) return;
  set(fresh(id));
}

/** 다른 화면에서 요청한 3D를 이어 본다(작업대·이력에 기다리거나 만드는 그림이 있을 때). 이미 보는 일이 있으면 그대로 */
export function adoptModelMaking(id: string): void {
  const m = current();
  if (!ID.test(id) || (m && m.id === id) || (m && (m.phase === 'waiting' || m.phase === 'making'))) return;
  set(fresh(id));
}

/** 끝난 알림을 봤다 */
export function seeModelMaking(): void {
  const m = current();
  if (!m || m.seen || (m.phase !== 'ready' && m.phase !== 'failed')) return;
  set({ ...m, seen: true });
}

/** 이 일을 더는 보지 않는다(그림을 지웠거나 알림을 닫음). id를 주면 그 일일 때만 */
export function clearModelMaking(id?: string): void {
  const m = current();
  if (!m || (id && m.id !== id)) return;
  set(null);
}

/** 진행 막대(0~100). 실제 남은 시간은 알 수 없어 단계와 걸린 시간으로 어림한다(다 되기 전에는 95를 넘지 않는다) */
export function modelPercent(m: Pick<ModelMaking, 'phase' | 'makingAt' | 'at'>, now: number): number {
  if (m.phase === 'ready') return 100;
  if (m.phase === 'failed') return 0;
  if (m.phase === 'waiting') return Math.min(18, 6 + Math.round((now - m.at) / 10_000));
  const t = Math.max(0, now - (m.makingAt ?? m.at)) / 1000;
  return Math.min(95, Math.round(20 + 75 * (1 - Math.exp(-t / 60))));
}

/**
 * 한국 시간 「15시 30분」(브라우저·서버의 언어 자료와 상관없이 같은 글. 한국은 일광 절약 시간이 없어 +9 고정).
 * lang 'en': 「3:30 PM」
 */
export function kstClock(ms: number, lang: Lang = 'ko'): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  if (lang === 'en') {
    const h = d.getUTCHours();
    return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return `${d.getUTCHours()}시 ${mm}분`;
}

/**
 * 보통보다 늦어지고 있는가: 차례를 오래 기다리거나(MODEL_SLOW_WAIT_MS), 3D 서비스가 쉬어 다시 만드는 때가 있거나,
 * 만들기가 오래 걸린다(MODEL_SLOW_MAKE_MS). 이때는 어디에서도 「보통 1~2분」을 말하지 않는다
 */
export function modelSlow(m: Pick<ModelMaking, 'phase' | 'makingAt' | 'at' | 'later'>, now: number): boolean {
  if (m.phase === 'waiting') return (m.later !== null && m.later > now) || now - m.at >= MODEL_SLOW_WAIT_MS;
  if (m.phase === 'making') return now - (m.makingAt ?? m.at) >= MODEL_SLOW_MAKE_MS;
  return false;
}

/** 지금 단계의 한 줄. lang 'en': 영어(서버가 준 못 만든 까닭은 그대로 돌려준다: 화면이 Say로 옮긴다) */
export function modelStage(m: Pick<ModelMaking, 'phase' | 'makingAt' | 'at' | 'later' | 'message'>, now: number, lang: Lang = 'ko'): string {
  if (lang === 'en') {
    if (m.phase === 'ready') return 'Your 3D is ready';
    if (m.phase === 'failed') return m.message ?? '3D를 만들지 못했어요.';
    if (m.phase === 'waiting') {
      if (m.later !== null && m.later > now) return `The 3D service is taking a short break and will try again around ${kstClock(m.later, 'en')} Korea time`;
      if (modelSlow(m, now)) return 'Your 3D turn is running late';
      return 'Waiting for your turn to make 3D';
    }
    return modelSlow(m, now) ? "It's taking a little longer. We'll let you know when it's done" : `Making your 3D model · ${MODEL_USUAL_EN}`;
  }
  if (m.phase === 'ready') return '3D가 다 됐어요';
  if (m.phase === 'failed') return m.message ?? '3D를 만들지 못했어요.';
  if (m.phase === 'waiting') {
    if (m.later !== null && m.later > now) return `3D 서비스가 잠시 쉬어서 ${kstClock(m.later)}쯤 다시 만들어요`;
    if (modelSlow(m, now)) return '3D 차례가 늦어지고 있어요';
    return '3D 만들 차례를 기다리는 중이에요';
  }
  return modelSlow(m, now) ? '조금 더 걸리고 있어요. 다 되면 알려 드려요' : `3D 모형을 만드는 중이에요 · ${MODEL_USUAL}`;
}

/** 진행 상자의 안내 한 줄(기다리거나 만드는 동안만). 늦어지면 「보통 1~2분」 대신 그럴 만한 까닭. lang 'en': 영어 */
export function modelNote(m: Pick<ModelMaking, 'phase' | 'makingAt' | 'at' | 'later'>, now: number, lang: Lang = 'ko'): string | null {
  if (m.phase !== 'waiting' && m.phase !== 'making') return null;
  if (lang === 'en') {
    const tailEn = "You can close the panel and keep walking. We'll let you know when it's done.";
    if (m.phase === 'waiting' && modelSlow(m, now)) {
      return `The 3D service may be on a break, or there may be many 3D models ahead. Your place in line stays the same. ${tailEn}`;
    }
    if (modelSlow(m, now)) return tailEn;
    return m.phase === 'waiting' ? `Once it's your turn, it usually takes 1 to 2 minutes. ${tailEn}` : `It usually takes 1 to 2 minutes. ${tailEn}`;
  }
  const tail = '창을 닫고 걸어도 돼요. 다 되면 알려 드려요.';
  if (m.phase === 'waiting' && modelSlow(m, now)) return `3D 서비스가 쉬는 중이거나 앞선 3D가 많을 수 있어요. 차례는 그대로예요. ${tail}`;
  if (modelSlow(m, now)) return tail;
  return m.phase === 'waiting' ? `차례가 오면 ${MODEL_USUAL} 걸려요. ${tail}` : `${MODEL_USUAL} 걸려요. ${tail}`;
}

/** 걷기 화면 칩의 단계 이름(기다림 → 늦어짐 → 만드는 중)과 걸린 시간 뒤에 붙일 말(늦어지면 붙이지 않는다) */
export function modelChipText(
  m: Pick<ModelMaking, 'phase' | 'makingAt' | 'at' | 'later'>, now: number, lang: Lang = 'ko',
): { label: string; tail: string } {
  const slow = modelSlow(m, now);
  if (lang === 'en') {
    if (m.phase === 'waiting') return { label: slow ? '3D turn running late' : 'Waiting for 3D turn', tail: '' };
    return { label: 'Making 3D', tail: slow ? '' : ` · ${MODEL_USUAL_EN}` };
  }
  if (m.phase === 'waiting') return { label: slow ? '3D 차례 늦어지는 중' : '3D 차례 기다리는 중', tail: '' };
  return { label: '3D 만드는 중', tail: slow ? '' : ` · ${MODEL_USUAL}` };
}

/** 단계 이름(걷기 화면 칩과 캐릭터 창의 진행 상자가 같은 말을 쓴다) */
export const MODEL_STEPS = ['요청함', '차례', '만드는 중', '다 됐어요'] as const;
/** MODEL_STEPS의 영어(같은 차례) */
export const MODEL_STEPS_EN = ['Sent', 'In line', 'Making', 'Done'] as const;

// ───────── 묻기(이 모듈 하나만)

let timer: ReturnType<typeof setTimeout> | undefined;
let asking = false;
let attached = false;
/** 상태 묻기의 404가 연달아 온 수. 이만큼이면 내려놓는다 */
let gone = 0;
const GONE_AFTER = 3;
const GONE_RECHECK_MS = 4_000;

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function schedule(delay?: number) {
  clearTimeout(timer);
  timer = undefined;
  const m = current();
  if (!m || listeners.size === 0 || (m.phase !== 'waiting' && m.phase !== 'making') || hidden()) return;
  timer = setTimeout(() => void ask(), delay ?? pollDelay(Date.now() - m.at));
}

async function ask() {
  const m = current();
  if (!m || asking || (m.phase !== 'waiting' && m.phase !== 'making')) return;
  asking = true;
  let next: number | undefined;
  try {
    const res = await fetch(`/api/avatar/status?id=${encodeURIComponent(m.id)}&kind=model`, { credentials: 'same-origin', cache: 'no-store' });
    const now = current();
    if (!now || now.id !== m.id) return; // 그사이 다른 그림을 요청했거나 그만뒀다
    if (res.status === 404) {
      // 그림을 지웠거나 들어온 상태가 풀렸다. 몰릴 때 잠깐 404가 올 수도 있어 연달아 세 번일 때만 조용히 내려놓는다
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

/** 서버 답을 상태에 옮긴다(시험에서도 부른다). none(요청이 없다)은 null: 더 보지 않는다 */
export function nextModelMaking(m: ModelMaking, data: Record<string, unknown>, now = Date.now()): ModelMaking | null {
  const since = typeof data.since === 'string' ? Date.parse(data.since) : NaN;
  const at = Number.isFinite(since) ? Math.min(since, now) : m.at;
  switch (data.status) {
    case 'waiting': {
      const later = typeof data.later === 'string' ? Date.parse(data.later) : NaN;
      return { ...m, at, phase: 'waiting', later: Number.isFinite(later) && later > now ? later : null };
    }
    case 'making':
      return { ...m, at, phase: 'making', makingAt: m.makingAt ?? now, later: null };
    case 'ready':
      return { ...m, at, phase: 'ready', later: null, message: null, note: null, doneAt: now, seen: false };
    case 'failed':
      return {
        ...m, at, phase: 'failed', later: null, message: text(data.message) ?? '3D를 만들지 못했어요.', note: text(data.note),
        doneAt: now, seen: false,
      };
    case 'none':
      return null;
    default:
      return m;
  }
}

function apply(m: ModelMaking, data: Record<string, unknown>) {
  const next = nextModelMaking(m, data);
  if (next === m) return;
  const becameReady = next !== null && next.phase === 'ready' && m.phase !== 'ready';
  set(next);
  if (becameReady) for (const fn of [...readyListeners]) fn(next.id);
}

function onVisible() {
  if (!hidden()) schedule(0);
}
/** 다른 탭에서 요청했거나 끝난 것을 이 탭도 따라간다 */
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
