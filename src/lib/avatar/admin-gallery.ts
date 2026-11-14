import {
  MODEL_WORD, PIC_WORD, hasShownModel, type CharacterRow, type ModelState, type PicStatus,
} from '@/lib/avatar/admin-rules';

// 캐릭터 관리 콘솔(/admin/characters)의 갤러리 규칙(순수 함수). 화면과 node --test가 함께 쓴다.
// 보기는 둘이다. 「2D 그림」은 읽은 캐릭터 모두(그림이 아직 없으면 그 자리에 상태), 「3D 모형」은 지금 보이는 3D가 있는 캐릭터만
// (다 된 것, 다시 만드는 동안의 이전 모형) 모형의 정지 사진으로. 보기는 거르기 칩·검색과 따로 논다: 서버가 거른 목록을 화면이 한 번 더 고른다.
// 3D 사진은 브라우저가 모형(GLB)을 받아 그리개 하나로 한 장씩 찍는다(화면 쪽 snapshot.ts). 여기서는 찍는 차례, 캐시, 사진기 자리를 정한다.

// ───────── 보기

export const GALLERY_VIEWS = [
  { id: '2d', label: '2D 그림' },
  { id: '3d', label: '3D 모형' },
] as const;
export type GalleryView = (typeof GALLERY_VIEWS)[number]['id'];
/** 보기를 담는 주소 칸(?view=3d). 2D는 기본이라 적지 않는다 */
export const VIEW_PARAM = 'view';

/** 주소의 보기. 3d만 알아듣고, 없거나 모르는 값은 2D */
export function readView(v: string | null | undefined): GalleryView {
  return v === '3d' ? '3d' : '2d';
}

/** 보기를 담은 주소(경로, 다른 칸, #은 그대로). 2D면 칸을 뺀다 */
export function hrefWithView(href: string, view: GalleryView): string {
  const u = new URL(href);
  if (view === '2d') u.searchParams.delete(VIEW_PARAM);
  else u.searchParams.set(VIEW_PARAM, view);
  return `${u.pathname}${u.search}${u.hash}`;
}

type Shown = Pick<CharacterRow, 'status' | 'model' | 'prev'>;

/** 이 보기에 드는가: 2D는 모두, 3D는 지금 보이는 3D가 있을 때(hasShownModel) */
export function inView(r: Shown, view: GalleryView): boolean {
  return view === '2d' || hasShownModel(r);
}

/** 이 보기에 보일 줄(읽은 차례 그대로) */
export function viewRows<T extends Shown>(rows: readonly T[], view: GalleryView): T[] {
  return rows.filter((r) => inView(r, view));
}

/** 보기마다 읽은 캐릭터 수 */
export function viewCounts(rows: readonly Shown[]): Record<GalleryView, number> {
  return { '2d': rows.length, '3d': rows.filter((r) => hasShownModel(r)).length };
}

/** 보기 단추의 수. 다음 장이 남았으면 「24+」(읽은 것보다 더 있을 수 있다) */
export function countWord(n: number, more: boolean): string {
  return more ? `${n}+` : String(n);
}

/**
 * 펼친 카드의 자세히를 놓을 자리: 그 카드가 있는 줄의 마지막 카드 바로 뒤(카드들은 제자리에 둔다).
 * at은 펼친 카드의 차례, cols는 갤러리의 칸 수, count는 보이는 카드 수. 펼친 카드가 없으면 -1
 */
export function rowEndOf(at: number, cols: number, count: number): number {
  if (at < 0 || at >= count) return -1;
  const c = Math.max(1, Math.floor(cols));
  return Math.min(count - 1, (Math.floor(at / c) + 1) * c - 1);
}

// ───────── 카드의 짧은 상태

export type Tone = 'ok' | 'busy' | 'warn' | undefined;

/** 그림 상태의 색: 다 그림은 초록, 거절·실패는 주황, 그 밖(올리는 중, 기다림, 그리는 중)은 노랑 */
export function picTone(s: PicStatus): Tone {
  return s === 'ready' ? 'ok' : s === 'rejected' || s === 'failed' ? 'warn' : 'busy';
}

/** 3D 상태의 색: 있음은 초록, 못 만듦·멈춤은 주황, 없음은 무색, 그 밖(기다림, 만드는 중)은 노랑 */
export function modelTone(m: ModelState): Tone {
  return m === 'ready' ? 'ok' : m === 'failed' || m === 'stuck' ? 'warn' : m === 'none' ? undefined : 'busy';
}

/**
 * 갤러리 카드 밑의 짧은 상태 한 줄. 그림이 아직이거나 문제면 그림 상태(다시 그리는 중이면 그렇다고), 다 그렸으면 3D 상태.
 * prev: 다시 만드는 동안(또는 다시 만들다 실패해) 이전 3D가 보인다(3D 모형 보기의 사진이 이전 모형이다)
 */
export function tileState(r: Pick<CharacterRow, 'status' | 'model' | 'prev' | 'redrawing'>): { text: string; tone: Tone; prev: boolean } {
  if (r.status !== 'ready') return { text: r.redrawing ? '다시 그리는 중' : PIC_WORD[r.status], tone: picTone(r.status), prev: false };
  return { text: MODEL_WORD[r.model], tone: modelTone(r.model), prev: r.prev && r.model !== 'ready' };
}

// ───────── 3D 사진: 크기, 캐시 열쇠, 사진기 자리

/** 3D 사진의 크기(px): 관리자용 작은 그림(폭 360, 2:3)과 같다 */
export const SNAP_W = 360;
export const SNAP_H = 540;
/** 사진을 찍을 때 모형 그림의 상한(px). 사진이 작아 걷기(1024)보다 작게 */
export const SNAP_TEXTURE = 512;

/** 3D 사진의 캐시 열쇠: 캐릭터와 모형 판. 다시 만들어 판이 바뀌면 새로 찍는다 */
export function snapKey(r: Pick<CharacterRow, 'id' | 'modelVer'>): string {
  return `${r.id}:${r.modelVer}`;
}
const keyId = (key: string) => key.slice(0, key.lastIndexOf(':'));

export type Box = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

/**
 * 사진기 자리(모형은 발바닥이 원점, +Y 위, 세로축으로 돈다). 키 전체가 위아래 여백 10%씩을 두고 들어오는 거리와,
 * 어느 쪽으로 돌려도 옆이 잘리지 않는 거리(세로축에서 가장 먼 모서리가 사진기 쪽으로 와도 폭 안에 든다) 가운데 먼 쪽.
 * fovDeg는 세로 시야(도), aspect는 폭/높이. 눈은 몸 가운데보다 키의 6% 위에서 가운데를 본다
 */
export function frameFor(box: Box, fovDeg: number, aspect: number): { dist: number; eyeY: number; lookY: number } {
  const tall = Math.max(0.1, box.max.y - box.min.y);
  const mid = (box.max.y + box.min.y) / 2;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  let reach = 0;
  for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) reach = Math.max(reach, Math.hypot(x, z));
  const upright = (tall * 0.6) / t;
  const sideways = (reach * 1.1) / (t * Math.max(0.1, aspect)) + reach;
  return { dist: Math.max(upright, sideways), eyeY: mid + tall * 0.06, lookY: mid };
}

// ───────── 3D 사진 줄: 한 번에 한 장, 캐시, 쉬기

/** 사진을 기다리는 쪽에 주는 답: 사진 주소(object URL), 못 찍었으면 null */
export type SnapDone = (url: string | null) => void;

export type SnapIo = {
  /** 한 장 찍는다: 모형을 받아 풀고, gate를 지난 뒤에만 그림 문맥(WebGL)을 쓴다. 사진 주소, 못 찍으면 null(던져도 null로 본다) */
  shoot: (src: string, gate: () => Promise<void>) => Promise<string | null>;
  /** 그림 문맥을 놓는다(줄이 한동안 비었을 때, 멈출 때). 쥔 것이 없으면 아무것도 하지 않는다 */
  release: () => void;
  /** 캐시에서 버린 사진 주소를 놓는다(URL.revokeObjectURL) */
  drop: (url: string) => void;
  now: () => number;
  later: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
};

export type SnapQueue = {
  /**
   * 사진을 청한다. 캐시에 있으면 바로 done, 아니면 줄 끝에 선다(같은 열쇠는 한 번만 찍고 기다리는 쪽 모두에게 준다).
   * 돌려받은 함수로 물린다: 아직 찍기 시작하지 않았고 기다리는 쪽이 없으면 줄에서 빠진다(화면 밖으로 지나간 카드)
   */
  want: (key: string, src: string, done: SnapDone) => () => void;
  /** 움직이는 3D 보기가 열렸다: 새로 찍지 않고 그림 문맥을 놓는다(그리는 중이면 그 한 장이 끝난 뒤) */
  pause: () => void;
  resume: () => void;
  /** 점검용: 줄에 선 열쇠(차례대로), 찍는 중인 열쇠, 캐시의 열쇠(오래 안 쓴 것부터) */
  state: () => { queued: string[]; running: string | null; cached: string[]; paused: boolean };
};

/** 캐시에 두는 사진 수. 넘치면 가장 오래 안 쓴 것부터 버린다 */
export const SNAP_CACHE_MAX = 150;
/** 못 찍은 사진을 다시 해 보기까지(ms). 그 사이에는 바로 「못 찍음」을 준다 */
export const SNAP_RETRY_MS = 60_000;
/** 줄이 비고 이만큼(ms) 지나면 그림 문맥을 놓는다(카드가 줄줄이 들어올 때마다 새로 만들지 않게) */
export const SNAP_IDLE_MS = 4_000;

type Job = { key: string; src: string; waiters: Set<SnapDone> };
type Kept = { url: string } | { failedAt: number };

export function makeSnapQueue(io: SnapIo, o: { max?: number; retryMs?: number; idleMs?: number } = {}): SnapQueue {
  const max = o.max ?? SNAP_CACHE_MAX;
  const retryMs = o.retryMs ?? SNAP_RETRY_MS;
  const idleMs = o.idleMs ?? SNAP_IDLE_MS;
  /** Map은 넣은 차례를 지킨다: 쓸 때마다 뒤로 옮겨 앞이 가장 오래 안 쓴 것 */
  const cache = new Map<string, Kept>();
  const queue: Job[] = [];
  let running: Job | null = null;
  /** 찍는 중인 한 장이 gate를 지나 그림 문맥을 쓰고 있다 */
  let drawing = false;
  let paused = false;
  let waking: (() => void)[] = [];
  let idle: unknown = null;

  const stopIdle = () => {
    if (idle === null) return;
    io.cancel(idle);
    idle = null;
  };
  const idleSoon = () => {
    if (idle !== null || running) return;
    idle = io.later(() => {
      idle = null;
      if (!running && !queue.length) io.release();
    }, idleMs);
  };
  const forget = (k: string) => {
    const v = cache.get(k);
    cache.delete(k);
    if (v && 'url' in v) io.drop(v.url);
  };
  const keep = (key: string, url: string | null) => {
    // 같은 캐릭터의 옛 판 사진은 버린다(다시 만들어 판이 바뀌었다)
    const id = keyId(key);
    for (const k of [...cache.keys()]) if (k !== key && keyId(k) === id) forget(k);
    forget(key);
    cache.set(key, url ? { url } : { failedAt: io.now() });
    while (cache.size > max) forget(cache.keys().next().value as string);
  };
  // 그림 문맥을 쓰기 직전에 지난다. 멈춰 있으면 풀릴 때까지 기다린다
  const gate = () => new Promise<void>((ok) => {
    const go = () => {
      drawing = true;
      ok();
    };
    if (paused) waking.push(go);
    else go();
  });
  const pump = () => {
    if (running || paused) return;
    const job = queue.shift();
    if (!job) {
      idleSoon();
      return;
    }
    stopIdle();
    running = job;
    void Promise.resolve()
      .then(() => io.shoot(job.src, gate))
      .catch(() => null)
      .then((got) => {
        const url = typeof got === 'string' && got ? got : null;
        running = null;
        drawing = false;
        keep(job.key, url);
        for (const done of [...job.waiters]) {
          try {
            done(url);
          } catch {
            // 한 카드의 잘못이 줄을 멈추지 않게
          }
        }
        // 그리는 동안 멈췄으면 이제 그림 문맥을 놓는다
        if (paused) io.release();
        pump();
      });
  };

  const want = (key: string, src: string, done: SnapDone): (() => void) => {
    const hit = cache.get(key);
    if (hit && 'url' in hit) {
      cache.delete(key);
      cache.set(key, hit);
      done(hit.url);
      return () => {};
    }
    if (hit && io.now() - hit.failedAt < retryMs) {
      done(null);
      return () => {};
    }
    let job = running?.key === key ? running : queue.find((j) => j.key === key);
    if (!job) {
      job = { key, src, waiters: new Set() };
      queue.push(job);
    }
    job.waiters.add(done);
    const mine = job;
    pump();
    return () => {
      mine.waiters.delete(done);
      if (mine === running || mine.waiters.size) return;
      const i = queue.indexOf(mine);
      if (i >= 0) queue.splice(i, 1);
      if (!running && !queue.length) idleSoon();
    };
  };

  const pause = () => {
    if (paused) return;
    paused = true;
    stopIdle();
    if (!drawing) io.release();
  };
  const resume = () => {
    if (!paused) return;
    paused = false;
    const go = waking;
    waking = [];
    for (const f of go) f();
    pump();
  };
  const state = () => ({ queued: queue.map((j) => j.key), running: running?.key ?? null, cached: [...cache.keys()], paused });
  return { want, pause, resume, state };
}
