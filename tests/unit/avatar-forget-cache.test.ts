// 지운 캐릭터 그림을 이 기기의 브라우저 캐시에서 버리기: 가짜 fetch로 무엇을 어떻게 묻는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 가져온다: 시험에서는 .ts를 붙여 찾게 한다
const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const { dropCachedAvatar } = await import('../../src/lib/avatar/forget-cache.ts');
const ID = '0b9d2c1e-5a4f-4e3b-9c7d-1f2a3b4c5d6e';

test('캐시를 건너뛰어 그 그림 주소를 한 번 다시 묻는다', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  await dropCachedAvatar(ID, fake);
  // 그림 한 장과, 걷기 화면이 받는 방향 그림 묶음 두 크기와 3D 모형
  assert.deepEqual(calls.map((c) => c.url),
    [`/api/avatar/${ID}`, `/api/avatar/${ID}/views?s=l`, `/api/avatar/${ID}/views?s=s`, `/api/avatar/${ID}/model`]);
  for (const c of calls) {
    assert.equal(c.init?.cache, 'reload');
    assert.equal(c.init?.method, undefined, '지우기 요청이 아니라 다시 받기여야 한다');
  }
});

test('한 주소가 실패해도 나머지는 묻는다', async () => {
  const seen: string[] = [];
  const fake = (async (url: string) => {
    seen.push(url);
    if (!url.includes('/views')) throw new TypeError('offline');
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  await assert.doesNotReject(dropCachedAvatar(ID, fake));
  assert.equal(seen.length, 4);
});

test('그림 id 모양이 아니면 아무것도 묻지 않는다', async () => {
  let n = 0;
  const fake = (async () => {
    n++;
    return new Response(null);
  }) as unknown as typeof fetch;
  for (const bad of ['', 'status', '../house', `${ID}/x`, `${ID}?a=1`]) await dropCachedAvatar(bad, fake);
  assert.equal(n, 0);
});

test('네트워크가 끊겨도 던지지 않는다', async () => {
  const fake = (async () => {
    throw new TypeError('offline');
  }) as unknown as typeof fetch;
  await assert.doesNotReject(dropCachedAvatar(ID, fake));
});
