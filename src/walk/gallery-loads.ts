// 부엌 사진 갤러리 그림을 언제 받고, 언제 다시 받고, 언제 그만두는지(three.js·React 없이 시험에서 그대로 돈다).
// 서명 주소는 목록을 받을 때마다 모두 바뀐다. 그래서 「같은 그림」은 그림 열쇠(key, 그림이 바뀔 때만 바뀐다)로 알아보고,
// 실패는 그림마다 세어 끝없이 다시 받지 않는다.
//   - 3D 액자(gallery-scene.ts): 새 목록이 와도 열쇠가 같으면 실린 그림을 그대로 두고 주소만 바꾼다. 한 그림을 두 번(처음 주소,
//     다시 받은 목록의 새 주소) 받지 못하면 이번에는 그만둔다(빈 매트). 목록을 다시 받자는 신호는 그림의 첫 실패에만, staleMs에 한 번.
//   - 크게 보기(GalleryViewer): 그림 한 장을 두 번까지 받아 보고, 그래도 안 되면 알림을 남기고 멈춘다. 보이는 그림은 목록을 다시
//     받아도 새 주소로 또 받지 않는다.
//   - 목록 다시 받기(useGallery): 앞의 두 신호를 모아 가장 짧은 간격과 화면을 연 동안의 횟수 상한 안에서만.

export const ART_RETRY = {
  /** 한 그림(열쇠)을 받아 보는 횟수: 처음 주소와, 다시 받은 목록의 새 주소 */
  tries: 2,
  /** 3D: 같은 주소로 실패했으면 이만큼 뒤에 다시 받아 본다(ms). 주소가 바뀌면 바로 */
  sameUrlMs: 60_000,
  /** 3D: 목록을 다시 받자고 알리는 가장 짧은 간격(ms) */
  staleMs: 60_000,
  /** 목록을 다시 받는 가장 짧은 간격(ms)과, 화면을 연 동안의 횟수 상한(서명 주소는 세 시간이라 넉넉하다) */
  refreshGapMs: 45_000,
  refreshMax: 5,
  /** 방에 다녀와 다시 켤 때 이만큼 안에 받은 목록이면 다시 받지 않는다(ms): 주소가 같아 그림도 브라우저가 들고 있다 */
  freshMs: 30 * 60_000,
} as const;

// ───────── 목록 다시 받기
export type RefreshGate = { take: (now: number) => boolean; readonly count: number };

/** 목록 다시 받기 문지기: 가장 짧은 간격 안이거나 횟수를 다 썼으면 false(그때는 받지 않는다) */
export function refreshGate(gapMs: number = ART_RETRY.refreshGapMs, max: number = ART_RETRY.refreshMax): RefreshGate {
  let last = -Infinity;
  let n = 0;
  return {
    take(now) {
      if (n >= max || now - last < gapMs) return false;
      last = now;
      n++;
      return true;
    },
    get count() { return n; },
  };
}

/** 방에 다녀와 다시 켤 때 받아 둔 목록을 그대로 써도 되는가(같은 차례의 목록을 freshMs 안에 받았다) */
export function listFresh(got: { at: number; round: number } | null, round: number, now: number): boolean {
  return got !== null && got.round === round && now - got.at < ART_RETRY.freshMs;
}

// ───────── 3D 액자
/** 실린(또는 받는 중인) 그림을 새 목록에서도 그대로 둘까: 열쇠가 같으면(주소만 바뀌었으면) 그대로 */
export function keepArt(had: { key: string }, now: { key: string } | null): boolean {
  return now !== null && now.key === had.key;
}

/** 한 액자 그림의 실패 기록: 어느 그림(열쇠)을 어느 주소로 몇 번 */
export type ArtFail = { key: string; url: string; at: number; n: number };

/** 새 목록에서 실패 기록을 이어 갈까: 그림이 바뀌었거나(열쇠가 다름) 빠졌으면 지운다(새 그림은 처음부터 센다) */
export function failAfter(f: ArtFail, now: { key: string } | null): ArtFail | null {
  return now && now.key === f.key ? f : null;
}

/** 3D: 지금 받아 봐도 되는가. 같은 그림을 tries번 못 받았으면 그만, 같은 주소로 실패했으면 sameUrlMs 뒤에 */
export function mayLoad(f: ArtFail | undefined, key: string, url: string, now: number): boolean {
  if (!f || f.key !== key) return true;
  if (f.n >= ART_RETRY.tries) return false;
  return f.url !== url || now - f.at >= ART_RETRY.sameUrlMs;
}

/** 3D: 실패를 적는다. stale은 목록을 다시 받자고 알릴지(그 그림의 첫 실패에만, 마지막 신호에서 staleMs 지났을 때) */
export function noteFail(f: ArtFail | undefined, key: string, url: string, now: number, staleAt: number): { fail: ArtFail; stale: boolean } {
  const n = f && f.key === key ? f.n + 1 : 1;
  return { fail: { key, url, at: now, n }, stale: n < ART_RETRY.tries && now - staleAt >= ART_RETRY.staleMs };
}

// ───────── 크게 보기
/** 크게 보는 그림 한 장의 상태: 받는(받은) 주소, 지금 상태, 받아 본 횟수 */
export type ArtView = { src: string; state: 'loading' | 'ready' | 'error'; tries: number };

export const artStart = (src: string): ArtView => ({ src, state: 'loading', tries: 1 });

/** 그림을 받았다 */
export const artLoaded = (v: ArtView): ArtView => (v.state === 'ready' ? v : { ...v, state: 'ready' });

/**
 * 같은 그림의 주소가 바뀌었다(목록을 다시 받음). 실패해 있었고 아직 한 번 더 받아 볼 수 있으면 새 주소로, 아니면 그대로
 * (보이는 그림·받는 중인 그림을 새 주소로 또 받지 않는다)
 */
export function artNewUrl(v: ArtView, src: string): ArtView {
  if (v.state !== 'error' || v.tries >= ART_RETRY.tries || src === v.src) return v;
  return { src, state: 'loading', tries: v.tries + 1 };
}

/**
 * 그림을 받지 못했다. latest는 지금 목록의 주소: 받는 사이 목록이 이미 새 주소를 가져왔으면 그것으로 바로 한 번 더.
 * 아니면 알림을 띄우고, ask(목록을 다시 받자)는 첫 실패에만
 */
export function artFailed(v: ArtView, latest: string): { view: ArtView; ask: boolean } {
  if (v.tries < ART_RETRY.tries && latest !== v.src) return { view: { src: latest, state: 'loading', tries: v.tries + 1 }, ask: false };
  return { view: { ...v, state: 'error' }, ask: v.tries < ART_RETRY.tries };
}
