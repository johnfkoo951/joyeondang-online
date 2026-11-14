// 걷기 화면 전체 화면: 쓸 수 있는지 가리기, 표준 이름과 사파리(webkit) 이름 고르기, 거절·예전 구현, 끝내기, 끝내기 Esc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FS_CHANGE, FS_ERROR, FS_ESC_GRACE_MS, canFullscreen, enterFullscreen, exitFullscreen, isExitEsc, isFullscreen, onFullscreenChange,
  type FsDoc, type FsTarget,
} from '../../src/components/walk/fullscreen.ts';

type Fake = FsDoc & {
  /** 알림 보내기(브라우저 대신) */
  fire: (type: string) => void;
  /** 지금 듣고 있는 처리 수 */
  listening: () => number;
  calls: string[];
};

/** 가짜 문서. 넘긴 값만 갖는다(없는 이름은 정말 없는 것으로) */
function fakeDoc(over: Partial<FsDoc> & { el?: FsTarget } = {}): Fake {
  const subs = new Map<string, Set<() => void>>();
  const calls: string[] = [];
  const { el, ...rest } = over;
  const doc: Fake = {
    documentElement: el ?? {},
    addEventListener: (t, fn) => {
      if (!subs.has(t)) subs.set(t, new Set());
      subs.get(t)?.add(fn);
    },
    removeEventListener: (t, fn) => {
      subs.get(t)?.delete(fn);
    },
    fire: (t) => {
      for (const fn of [...(subs.get(t) ?? [])]) fn();
    },
    listening: () => [...subs.values()].reduce((n, s) => n + s.size, 0),
    calls,
    ...rest,
  };
  return doc;
}

test('쓸 수 있는지: 허락 표시와 여는 함수가 함께 있어야 한다', () => {
  // 크롬·파이어폭스·안드로이드 크롬, 요즘 사파리
  assert.equal(canFullscreen(fakeDoc({ fullscreenEnabled: true, el: { requestFullscreen: async () => {} } })), true);
  // 예전 사파리(macOS, iPadOS): webkit 이름만
  assert.equal(canFullscreen(fakeDoc({ webkitFullscreenEnabled: true, el: { webkitRequestFullscreen: () => {} } })), true);
  // 아이폰 사파리: 함수가 있어도 허락 표시가 false(영상만 전체 화면)
  assert.equal(canFullscreen(fakeDoc({ fullscreenEnabled: false, webkitFullscreenEnabled: false, el: { requestFullscreen: async () => {} } })), false);
  // 허락 표시조차 없는 앱 안 브라우저
  assert.equal(canFullscreen(fakeDoc({ el: { webkitRequestFullscreen: () => {} } })), false);
  // 허락 표시는 있는데 여는 함수가 없다
  assert.equal(canFullscreen(fakeDoc({ fullscreenEnabled: true })), false);
  // 참 비슷한 값(1, 'true')은 허락으로 보지 않는다
  assert.equal(canFullscreen(fakeDoc({ fullscreenEnabled: 1 as unknown as boolean, el: { requestFullscreen: async () => {} } })), false);
});

test('지금 전체 화면인가: 표준 이름이 null이면 webkit 이름도 본다', () => {
  assert.equal(isFullscreen(fakeDoc()), false);
  assert.equal(isFullscreen(fakeDoc({ fullscreenElement: null, webkitFullscreenElement: null })), false);
  assert.equal(isFullscreen(fakeDoc({ fullscreenElement: {} })), true);
  assert.equal(isFullscreen(fakeDoc({ fullscreenElement: null, webkitFullscreenElement: {} })), true);
});

test('열기: 표준 이름을 먼저, 휴대폰 탐색 막대도 숨겨 달라고 청한다', async () => {
  const seen: unknown[] = [];
  const doc = fakeDoc({
    fullscreenEnabled: true,
    el: {
      requestFullscreen: async (o) => {
        seen.push(o);
        doc.fullscreenElement = doc.documentElement;
      },
      webkitRequestFullscreen: () => assert.fail('표준 이름이 있으면 webkit 이름은 부르지 않는다'),
    },
  });
  assert.equal(await enterFullscreen(doc), true);
  assert.deepEqual(seen, [{ navigationUI: 'hide' }]);
  // 이미 전체 화면이면 다시 청하지 않는다
  assert.equal(await enterFullscreen(doc), true);
  assert.equal(seen.length, 1);
});

test('열기: 거절되거나(앱 안 브라우저) 바로 던지면 false', async () => {
  const no = fakeDoc({ fullscreenEnabled: true, el: { requestFullscreen: () => Promise.reject(new TypeError('Permissions check failed')) } });
  assert.equal(await enterFullscreen(no), false);
  const thrown = fakeDoc({ fullscreenEnabled: true, el: { requestFullscreen: () => { throw new Error('막힘'); } } });
  assert.equal(await enterFullscreen(thrown), false);
  // 여는 함수가 아예 없으면 false
  assert.equal(await enterFullscreen(fakeDoc({ fullscreenEnabled: true })), false);
});

test('열기: 사파리 webkit 이름은 약속이 없어 알림을 기다린다(열림·거절·시간 끝)', async () => {
  // 열렸다는 알림
  const ok = fakeDoc({ webkitFullscreenEnabled: true });
  ok.documentElement = {
    webkitRequestFullscreen: () => {
      ok.webkitFullscreenElement = ok.documentElement;
      queueMicrotask(() => ok.fire('webkitfullscreenchange'));
    },
  };
  assert.equal(await enterFullscreen(ok), true);
  assert.equal(ok.listening(), 0, '기다리던 처리는 모두 거둔다');
  // 거절 알림
  const no = fakeDoc({ webkitFullscreenEnabled: true });
  no.documentElement = { webkitRequestFullscreen: () => queueMicrotask(() => no.fire('webkitfullscreenerror')) };
  assert.equal(await enterFullscreen(no), false);
  assert.equal(no.listening(), 0);
  // 아무 알림도 없으면 기다린 끝에 그때의 상태로
  const quiet = fakeDoc({ webkitFullscreenEnabled: true });
  quiet.documentElement = { webkitRequestFullscreen: () => {} };
  assert.equal(await enterFullscreen(quiet, 20), false);
  assert.equal(quiet.listening(), 0);
  // 바로 던지면 기다리지 않고 false
  const thrown = fakeDoc({ webkitFullscreenEnabled: true });
  thrown.documentElement = { webkitRequestFullscreen: () => { throw new Error('막힘'); } };
  assert.equal(await enterFullscreen(thrown), false);
  assert.equal(thrown.listening(), 0);
});

test('열기: 약속을 돌려주지 않는 예전 표준 구현도 알림으로 판단한다', async () => {
  const doc = fakeDoc({ fullscreenEnabled: true });
  doc.documentElement = {
    requestFullscreen: () => {
      doc.fullscreenElement = doc.documentElement;
      queueMicrotask(() => doc.fire('fullscreenchange'));
      return undefined;
    },
  };
  assert.equal(await enterFullscreen(doc), true);
  assert.equal(doc.listening(), 0);
});

test('끝내기: 표준 이름을 먼저, 없으면 webkit 이름. 전체 화면이 아니면 아무것도 하지 않는다', async () => {
  const calls: string[] = [];
  const both = fakeDoc({
    fullscreenElement: {},
    exitFullscreen: () => { calls.push('std'); return Promise.reject(new Error('이미 끝나는 중')); },
    webkitExitFullscreen: () => { calls.push('webkit'); },
  });
  exitFullscreen(both);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ['std'], '거절은 삼킨다(처리되지 않은 거절이 남지 않게)');
  const webkitOnly = fakeDoc({ webkitFullscreenElement: {}, webkitExitFullscreen: () => { calls.push('webkit'); } });
  exitFullscreen(webkitOnly);
  assert.deepEqual(calls, ['std', 'webkit']);
  const notFull = fakeDoc({ exitFullscreen: async () => { calls.push('없어야 함'); } });
  exitFullscreen(notFull);
  assert.deepEqual(calls, ['std', 'webkit']);
});

test('바뀜 알림: 표준과 webkit 이름을 함께 듣고, 그만 들으면 모두 거둔다', () => {
  const doc = fakeDoc();
  let n = 0;
  const off = onFullscreenChange(doc, () => n++);
  assert.equal(doc.listening(), FS_CHANGE.length);
  for (const t of FS_CHANGE) doc.fire(t);
  assert.equal(n, 2);
  for (const t of FS_ERROR) doc.fire(t);
  assert.equal(n, 2, '거절 알림은 바뀜이 아니다');
  off();
  assert.equal(doc.listening(), 0);
});

test('끝내기 Esc: 전체 화면 동안과 막 끝난 참의 Esc는 브라우저 몫', () => {
  const full = fakeDoc({ fullscreenElement: {} });
  const plain = fakeDoc({ fullscreenElement: null });
  assert.equal(isExitEsc(full, -Infinity, 1000), true, '전체 화면 동안');
  assert.equal(isExitEsc(plain, 1000, 1000 + FS_ESC_GRACE_MS - 1), true, '막 끝난 참');
  assert.equal(isExitEsc(plain, 1000, 1000 + FS_ESC_GRACE_MS), false, '여유가 지나면 걷기 화면 몫');
  assert.equal(isExitEsc(plain, -Infinity, 5), false, '한 번도 전체 화면이 아니었으면');
});
