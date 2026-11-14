// 함께 걷기의 넘침 막기: 통 계산(protocol.ts takeFloodToken)과, 실제 화면 코드(src/walk/net.ts)가 보낸 것을
// 실제 서버 처리기(game-server/src/space.ts)에 그대로 넣어 보는 이어 돌리기.
// 본 것: 통신이 몇 초 막혔다 풀려 쌓인 정상 메시지가 한꺼번에 와도 끊기지 않고 마지막 자리가 남는가,
// 정말 넘치게 보내는 연결은 끊기고 잠깐 다시 들이지 않는가.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

const SRC = new URL('../../src/', import.meta.url);
const STUB = new URL('./helpers/cf-workers-stub.ts', import.meta.url).href;
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: STUB, shortCircuit: true };
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

type Handler = (e: unknown) => void;
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.OPEN;
  sent: string[] = [];
  onmessage: Handler | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(s: string) { this.sent.push(s); }
  close() { this.readyState = FakeSocket.CLOSED; }
  recv(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}
const listeners = new Map<string, Set<Handler>>();
const target = {
  addEventListener(type: string, fn: Handler) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
  removeEventListener(type: string, fn: Handler) { listeners.get(type)?.delete(fn); },
};
const g = globalThis as Record<string, unknown>;
g.window = target;
g.document = { visibilityState: 'visible', ...target };
g.WebSocket = FakeSocket;
g.fetch = async () => ({ status: 200, ok: true, json: async () => ({ token: 'tok', url: 'wss://game.test', exp: Math.floor(Date.now() / 1000) + 600 }) });
const realRandom = Math.random;

const { connectNet } = await import('../../src/walk/net.ts');
const { Space } = await import('../../game-server/src/space.ts');
const { CLOSE_FLOOD, FLOOD_BURST, FLOOD_PER_SEC, FLOOD_REST_MS, PLAYER_HEADER, takeFloodToken } = await import('../../game-server/src/protocol.ts');

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const T0 = 1_700_000_000_000;

type Person = { id: string; sub: string; pos?: { x: number; z: number } };
/** 서버 쪽: 사람 하나가 들어와 있는 실제 Space. 그 연결에 서버가 한 일을 적는다 */
function makeServer(now: number) {
  const log: { closed: null | { code: number; reason: string }; sent: string[] } = { closed: null, sent: [] };
  const ws = {
    send(s: string) { log.sent.push(s); },
    close(code: number, reason: string) { log.closed ??= { code, reason }; },
    serializeAttachment() {},
    deserializeAttachment() { return null; },
  };
  const ctx = { getWebSockets: () => [], acceptWebSocket() {} };
  const sp = new (Space as unknown as new (c: unknown, e: unknown) => Record<string, unknown>)(ctx, {});
  const me: Person = { id: 'p1', sub: 'u1' };
  (sp.people as Map<unknown, unknown>).set(ws, { ...me, n: '손님', c: '#c98a5a', seen: now, lastC: 0 });
  const person = () => (sp.people as Map<unknown, Person>).get(ws);
  const feed = (data: string) => (sp.webSocketMessage as (w: unknown, r: string) => Promise<void>).call(sp, ws, data);
  const enter = (sub: string) => (sp.fetch as (r: Request) => Promise<Response>).call(sp, new Request('https://game.test/connect', {
    headers: { [PLAYER_HEADER]: encodeURIComponent(JSON.stringify({ sub, name: '손님', color: '#c98a5a' })) },
  }));
  return { log, feed, person, enter };
}

test('넘침 통: 처음에는 가득, 한꺼번에 FLOOD_BURST개까지 받고 초당 FLOOD_PER_SEC개씩 다시 찬다', () => {
  // 처음(값 없음)과 온전하지 않은 값은 가득 찬 통에서 하나를 꺼낸 것
  assert.equal(takeFloodToken(undefined, undefined, T0), FLOOD_BURST - 1);
  assert.equal(takeFloodToken(Number.NaN, T0, T0), FLOOD_BURST - 1);
  assert.equal(takeFloodToken(5, undefined, T0), FLOOD_BURST - 1);
  // 같은 순간에 잇달아: FLOOD_BURST개까지 받고 그다음은 -1
  let left: number | undefined;
  let taken = 0;
  for (;;) {
    const next = takeFloodToken(left, T0, T0);
    if (next < 0) break;
    left = next;
    taken++;
  }
  assert.equal(taken, FLOOD_BURST);
  // 빈 통은 1초에 FLOOD_PER_SEC개 찬다. 오래 쉬어도 FLOOD_BURST를 넘지 않는다
  assert.equal(takeFloodToken(0, T0, T0 + 1000), FLOOD_PER_SEC - 1);
  assert.equal(takeFloodToken(0, T0, T0 + 3_600_000), FLOOD_BURST - 1);
  // 시계가 뒤로 가도(값이 꼬여도) 줄지 않는다
  assert.equal(takeFloodToken(10, T0, T0 - 5000), 9);
  // 보통 화면(초당 8개쯤)은 아무리 오래 보내도 비지 않는다
  let l: number | undefined;
  let at = T0;
  for (let i = 0; i < 8 * 3600; i++) {
    const n = takeFloodToken(l, at, at + 125);
    assert.ok(n >= 0);
    l = n;
    at += 125;
  }
  assert.ok((l as number) >= FLOOD_BURST - 2, '보통 빠르기로는 통이 가득 찬 채다');
  // 초당 60개를 계속 보내면 몇 초 안에 빈다
  l = undefined;
  at = T0;
  let sent = 0;
  for (;;) {
    const n = takeFloodToken(l, at, at + 1000 / 60);
    if (n < 0) break;
    l = n;
    at += 1000 / 60;
    sent++;
    assert.ok(sent < 1000);
  }
  const secs = (at - T0) / 1000;
  assert.ok(secs > 2 && secs < 5, `초당 60개는 ${secs.toFixed(1)}초 만에 끊긴다`);
});

/** 걷는 중 올려 보내는 길이 stallMs 동안 막혔다가, 쌓인 것이 한꺼번에 서버에 닿는다 */
async function stallThenBurst(stallMs: number) {
  FakeSocket.all = [];
  listeners.clear();
  Math.random = () => 0.5;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 });
  const net = connectNet({ space: 'house:real', onPlayers: () => {}, onStatus: () => {} });
  try {
    await settle();
    const s = FakeSocket.all[0];
    const server = makeServer(T0);
    s.recv({ t: 'hi', you: 'p1', players: [] });
    let delivered = 0;
    let x = 0;
    const step = async (up: boolean) => {
      x += 0.14;
      net.sendState({ x, z: 0, y: 0, level: 1, yaw: 0, moving: true });
      mock.timers.tick(100);
      await settle();
      if (up) {
        while (delivered < s.sent.length) await server.feed(s.sent[delivered++]);
        s.recv({ t: 'S', ps: [] });
      }
    };
    for (let i = 0; i < 20; i++) await step(true);
    assert.equal(server.log.closed, null, '평소 걷기는 끊기지 않는다');
    const before = s.sent.length;
    for (let t = 0; t < stallMs; t += 100) await step(false);
    const queued = s.sent.length - before;
    const stillOpen = FakeSocket.all.length === 1 && s.readyState === FakeSocket.OPEN;
    // 길이 풀렸다: 쌓인 것이 같은 순간에 서버에 닿는다
    const last = JSON.parse(s.sent[s.sent.length - 1]) as { t: string; x: number };
    while (delivered < s.sent.length) await server.feed(s.sent[delivered++]);
    return { queued, stillOpen, closed: server.log.closed, last, pos: server.person()?.pos };
  } finally {
    net.close();
    mock.timers.reset();
    Math.random = realRandom;
  }
}

for (const stall of [3000, 5000, 6000, 9000]) {
  test(`걷는 중 ${stall / 1000}초 막혔다 풀려도 넘침으로 끊기지 않고, 서버에는 마지막 자리가 남는다`, async () => {
    const r = await stallThenBurst(stall);
    assert.equal(r.stillOpen, true, '화면도 10초가 되기 전에는 스스로 끊지 않는다');
    assert.equal(r.closed, null, `쌓인 ${r.queued}개가 한꺼번에 와도 끊지 않는다`);
    // 화면은 막힌 동안 쌓지 않는다(0.15초마다 보냈다면 5초에 33개, 9초에 60개)
    assert.ok(r.queued <= 8 + Math.ceil(stall / 1000), `막힌 동안 보낸 수 ${r.queued}`);
    assert.equal(r.last.t, 's');
    assert.equal(r.pos?.x, r.last.x, '몰려 온 것 가운데 가장 새 자리가 남는다');
  });
}

test('막힌 동안 쌓지 않는 장치가 없는 옛 화면이 10초치(0.15초마다 67개)와 말 몇 마디를 한꺼번에 보내도 끊기지 않는다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 });
  try {
    const server = makeServer(T0);
    mock.timers.tick(10_000);
    for (let i = 0; i < 67; i++) await server.feed(JSON.stringify({ t: 's', x: i / 10, z: 0, y: 0, l: 1, yw: 0, m: true }));
    for (let i = 0; i < 6; i++) await server.feed(JSON.stringify({ t: 'c', text: `말 ${i}` }));
    assert.equal(server.log.closed, null);
    assert.equal(server.person()?.pos?.x, 6.6);
  } finally {
    mock.timers.reset();
  }
});

test('사진 겉모습 확인을 기다리는 사이 떨어진 연결은 붙임표를 되살리지 않는다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 });
  try {
    const log: { closed: null | { code: number }; attach: unknown[] } = { closed: null, attach: [] };
    const ws = {
      send() {},
      close(code: number) { log.closed ??= { code }; },
      serializeAttachment(v: unknown) { log.attach.push(v); },
      deserializeAttachment() { return null; },
    };
    const sp = new (Space as unknown as new (c: unknown, e: unknown) => Record<string, unknown>)({ getWebSockets: () => [], acceptWebSocket() {} }, {});
    const people = sp.people as Map<unknown, Record<string, unknown>>;
    // 붙임표를 쓴 지 오래된 사람(다음 메시지에서 다시 쓸 차례)
    people.set(ws, { id: 'p1', sub: 'u1', n: '손님', c: '#c98a5a', seen: T0, lastC: 0, sv: T0 - 60_000 });
    const feed = (sp.webSocketMessage as (w: unknown, r: string) => Promise<void>).call(sp, ws, JSON.stringify({
      t: 'k', look: { kind: 'photo', url: '/api/avatar/0f8e2c1a-1234-4abc-9def-0123456789ab' }, p: 'not-a-real-proof',
    }));
    // 서명을 확인하는 사이 같은 사람이 다시 들어와 앞 연결이 떨어진 것처럼: 목록에서 빼고 붙임표를 비운다
    (sp.drop as (w: unknown, code: number, why: string) => void).call(sp, ws, 4000, 'replaced');
    await feed;
    await settle();
    assert.equal(people.has(ws), false);
    assert.deepEqual(log.closed, { code: 4000 });
    assert.equal(log.attach.at(-1), null, '비운 붙임표가 마지막이다(사람을 다시 써 넣지 않는다)');
  } finally {
    mock.timers.reset();
  }
});

test('정말 넘치게 보내는 연결은 끊고(4003, bye flood), 그 사람은 잠깐 다시 들이지 않는다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 });
  try {
    const server = makeServer(T0);
    // 초당 60개를 계속 보낸다(모르는 종류의 메시지도 센다)
    let n = 0;
    while (!server.log.closed && n < 1000) {
      await server.feed(JSON.stringify({ t: 'x', n }));
      mock.timers.tick(1000 / 60);
      n++;
    }
    assert.deepEqual(server.log.closed, { code: CLOSE_FLOOD, reason: 'flood' });
    assert.ok(n > FLOOD_BURST && n < 400, `끊기기까지 ${n}개`);
    assert.ok(server.log.sent.some((m) => m.includes('"bye"') && m.includes('"flood"')), '닫기 전에 까닭을 알린다');
    assert.equal(server.person(), undefined, '목록에서 뺀다');
    // 끊긴 직후와 쉬는 시간 안에는 들이지 않는다. 다른 사람은 그동안에도 막지 않는다
    // (이 시험 환경에는 WebSocketPair가 없어 들이는 길은 던진다: 429만 아니면 된다)
    assert.equal((await server.enter('u1')).status, 429);
    assert.notEqual((await server.enter('u2').catch(() => null))?.status, 429, '쉬는 시간 안에도 다른 사람은 들어온다');
    mock.timers.tick(FLOOD_REST_MS - 1000);
    assert.equal((await server.enter('u1')).status, 429);
    assert.notEqual((await server.enter('u3').catch(() => null))?.status, 429);
    // 쉬는 시간이 지나면 막지 않는다
    mock.timers.tick(1500);
    const later = await server.enter('u1').catch(() => null);
    assert.notEqual(later?.status, 429);
  } finally {
    mock.timers.reset();
  }
});
