// 전체 화면: 걷기 화면의 단추·메뉴·F 키가 문서 전체(머리줄 밖의 창·시트까지)를 화면 가득 채운다.
// 표준 이름과 사파리(macOS·iPadOS)의 webkit 이름을 함께 본다. 아이폰 사파리는 영상 말고는 전체 화면이 없고,
// 앱 안 브라우저 가운데도 막힌 곳이 있다: 그때는 단추를 아예 보이지 않는다(누르면 아무 일도 없는 단추를 두지 않게).
// React·three에 기대지 않아 단위 시험으로 본다(tests/unit/walk-fullscreen.test.ts).

/** 전체 화면으로 여는 것(문서의 맨 위 요소) */
export type FsTarget = {
  /** 예전 구현은 약속을 돌려주지 않는다(undefined) */
  requestFullscreen?: (options?: { navigationUI?: 'auto' | 'show' | 'hide' }) => Promise<void> | undefined;
  webkitRequestFullscreen?: () => void;
};

/** 이 모듈이 읽는 문서의 몫(시험에서는 가짜 문서를 넘긴다) */
export type FsDoc = {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void> | undefined;
  webkitExitFullscreen?: () => void;
  documentElement: FsTarget;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

/** 전체 화면이 바뀌었다는 알림(표준, 사파리). 둘 다 내는 브라우저도 있어 받는 쪽은 상태를 다시 읽는다 */
export const FS_CHANGE = ['fullscreenchange', 'webkitfullscreenchange'] as const;
/** 전체 화면을 거절했다는 알림 */
export const FS_ERROR = ['fullscreenerror', 'webkitfullscreenerror'] as const;
/** 예전 사파리(약속을 돌려주지 않는 webkit 이름)에서 열렸다는 알림을 기다리는 시간 */
export const FS_WAIT_MS = 3000;
/** 전체 화면이 끝난 지 이만큼 안의 Esc는 끝내기 몫으로 본다(포인터 잠금 풀기와 같은 여유) */
export const FS_ESC_GRACE_MS = 300;

/** 문서 전체를 전체 화면으로 열 수 있는가. 허락 표시와 여는 함수가 함께 있어야 한다 */
export function canFullscreen(doc: FsDoc): boolean {
  const allowed = doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;
  const el = doc.documentElement;
  return allowed && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function');
}

/** 지금 전체 화면인가(무엇을 전체 화면으로 열었든) */
export function isFullscreen(doc: FsDoc): boolean {
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * 이 Esc가 전체 화면을 끝내는 몫인가. 전체 화면 동안의 Esc는 브라우저가 전체 화면을 끝내는 데 쓴다(크롬은 페이지에 넘기지 않고,
 * 넘겨주는 브라우저도 있다). 그 Esc로 패널을 닫거나 메뉴를 열지 않게, 걷기 단축키가 키마다 묻는다.
 * leftAt: 마지막으로 전체 화면이 끝난 때, now: 지금(둘 다 performance.now 기준)
 */
export function isExitEsc(doc: FsDoc, leftAt: number, now: number): boolean {
  return isFullscreen(doc) || now - leftAt < FS_ESC_GRACE_MS;
}

/** 전체 화면이 바뀔 때마다(단추, F, Esc, 휴대폰 뒤로 가기) cb. 돌려준 함수를 부르면 그만 듣는다 */
export function onFullscreenChange(doc: FsDoc, cb: () => void): () => void {
  for (const t of FS_CHANGE) doc.addEventListener(t, cb);
  return () => {
    for (const t of FS_CHANGE) doc.removeEventListener(t, cb);
  };
}

/** 열렸다(바뀜)·거절됐다(오류) 알림 가운데 먼저 오는 것을 기다린다. 아무것도 오지 않으면 그때의 상태로 */
function waitResult(doc: FsDoc, ms: number): { promise: Promise<boolean>; stop: () => void } {
  let stop = () => {};
  const promise = new Promise<boolean>((done) => {
    const finish = (ok: boolean) => {
      stop();
      done(ok);
    };
    const changed = () => finish(isFullscreen(doc));
    const failed = () => finish(false);
    const timer = setTimeout(changed, ms);
    for (const t of FS_CHANGE) doc.addEventListener(t, changed);
    for (const t of FS_ERROR) doc.addEventListener(t, failed);
    stop = () => {
      clearTimeout(timer);
      for (const t of FS_CHANGE) doc.removeEventListener(t, changed);
      for (const t of FS_ERROR) doc.removeEventListener(t, failed);
    };
  });
  return { promise, stop };
}

/**
 * 문서 전체를 전체 화면으로. 단추·키를 누른 그 순간(같은 처리 안)에 불러야 한다: 브라우저가 사용자 동작 안에서만 허락한다.
 * 열렸으면 true, 거절되면(앱 안 브라우저 등) false. 이미 전체 화면이면 그대로 true.
 */
export function enterFullscreen(doc: FsDoc, waitMs = FS_WAIT_MS): Promise<boolean> {
  if (isFullscreen(doc)) return Promise.resolve(true);
  const el = doc.documentElement;
  try {
    if (typeof el.requestFullscreen === 'function') {
      // navigationUI: 휴대폰 크롬의 아래 탐색 막대도 숨긴다(모르는 브라우저는 그냥 지나친다)
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && typeof p.then === 'function') return p.then(() => true, () => false);
      // 약속을 돌려주지 않는 예전 구현: 알림을 기다린다
      return waitResult(doc, waitMs).promise;
    }
    if (typeof el.webkitRequestFullscreen === 'function') {
      const w = waitResult(doc, waitMs);
      try {
        el.webkitRequestFullscreen();
      } catch {
        w.stop();
        return Promise.resolve(false);
      }
      return w.promise;
    }
  } catch {
    // 여는 함수가 바로 던졌다(허락하지 않는 곳)
  }
  return Promise.resolve(false);
}

/** 전체 화면 끝내기. 전체 화면이 아니면 아무것도 하지 않는다 */
export function exitFullscreen(doc: FsDoc): void {
  if (!isFullscreen(doc)) return;
  try {
    if (typeof doc.exitFullscreen === 'function') {
      const p = doc.exitFullscreen();
      if (p && typeof p.then === 'function') p.then(undefined, () => {});
    } else doc.webkitExitFullscreen?.();
  } catch {
    // 이미 끝나 가는 중이면 그만
  }
}
