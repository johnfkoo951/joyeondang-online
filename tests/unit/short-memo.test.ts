// 서버 안 짧은 기억(/api/site가 쓴다): 가짜 시계로 기억하는 동안·지난 뒤·동시에 온 물음·실패를 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortMemo } from '../../src/lib/short-memo.ts';

test('기억하는 동안에는 다시 읽지 않고, 지나면 한 번 더 읽는다', async () => {
  let t = 1000;
  let calls = 0;
  const get = shortMemo(5000, async () => ({ n: ++calls }), () => t);
  assert.deepEqual(await get(), { n: 1 });
  t += 4999;
  assert.deepEqual(await get(), { n: 1 });
  assert.equal(calls, 1);
  t += 1;
  assert.deepEqual(await get(), { n: 2 });
  assert.equal(calls, 2);
});

test('동시에 온 물음은 한 번의 읽기를 함께 기다린다', async () => {
  let calls = 0;
  let open: (v: { n: number }) => void = () => {};
  const get = shortMemo(5000, () => {
    calls++;
    return new Promise<{ n: number }>((r) => (open = r));
  }, () => 0);
  const all = Promise.all([get(), get(), get()]);
  open({ n: 7 });
  assert.deepEqual(await all, [{ n: 7 }, { n: 7 }, { n: 7 }]);
  assert.equal(calls, 1);
});

test('못 읽은 답(null)과 던진 오류는 기억하지 않는다', async () => {
  let calls = 0;
  const answers: Array<() => Promise<string | null>> = [
    async () => null,
    async () => {
      throw new Error('down');
    },
    async () => 'ok',
  ];
  const get = shortMemo<string>(5000, () => answers[Math.min(calls++, 2)](), () => 0);
  assert.equal(await get(), null);
  await assert.rejects(get(), /down/);
  assert.equal(await get(), 'ok');
  assert.equal(await get(), 'ok');
  assert.equal(calls, 3);
});

test('답이 오지 않는 읽기에 매달리지 않는다: 기다리는 한도가 지나면 null을 주고, 다음 물음은 새로 읽는다', async () => {
  let calls = 0;
  const opens: Array<(v: string) => void> = [];
  const get = shortMemo<string>(5000, () => {
    calls++;
    return new Promise<string>((r) => opens.push(r));
  }, () => 0, 30);
  // 첫 읽기는 답이 없다: 함께 기다리던 물음 둘 다 한도 뒤 null
  const [a, b] = await Promise.all([get(), get()]);
  assert.equal(a, null);
  assert.equal(b, null);
  assert.equal(calls, 1);
  // 다음 물음은 새로 읽는다(앞의 읽기에 매달리지 않는다)
  const next = get();
  assert.equal(calls, 2);
  opens[1]('fresh');
  assert.equal(await next, 'fresh');
  // 한도를 넘겨 버린 첫 읽기의 답이 뒤늦게 와도 기억을 덮어쓰지 않는다
  opens[0]('stale');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await get(), 'fresh');
  assert.equal(calls, 2);
});
