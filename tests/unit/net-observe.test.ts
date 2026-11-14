// 함께 걷기의 관전 연결(connectNet observe: true): 가짜 WebSocket·fetch·시계로 본다.
// 본 것: 관전 출입증을 받는다, 받기만 하고 보내지 않는다, 5초마다 ping으로 살아 있는지 묻고 답이 없으면 다시 잇는다,
// 숨은 탭에서도 끊지 않는다(페이지를 떠날 때만 끊는다), 사람 목록은 걷는 연결과 같이 받는다.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

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
  recv(msg: unknown) { this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) }); }
  json() { return this.sent.filter((s) => s.startsWith('{')).map((s) => JSON.parse(s)); }
  pings() { return this.sent.filter((s) => s === 'ping').length; }
}

const listeners = new Map<string, Set<Handler>>();
const target = {
  addEventListener(type: string, fn: Handler) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
  removeEventListener(type: string, fn: Handler) { listeners.get(type)?.delete(fn); },
};
const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn({}));
const asked: string[] = [];
const g = globalThis as Record<string, unknown>;
g.window = target;
const doc = { visibilityState: 'visible', ...target };
g.document = doc;
g.WebSocket = FakeSocket;
g.fetch = async (input: unknown) => {
  asked.push(String(input));
  return { status: 200, ok: true, json: async () => ({ token: 'tok', url: 'wss://game.test', exp: Math.floor(Date.now() / 1000) + 600 }) };
};
const realRandom = Math.random;

const { connectNet, createNet } = await import('../../src/walk/net.ts');
type Net = ReturnType<typeof connectNet>;
type Player = { id: string; name: string; x: number };

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
async function run(ms: number, step = 500, each?: () => void) {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(step);
    each?.();
    await settle();
  }
}

async function setup(observe = true) {
  FakeSocket.all = [];
  asked.length = 0;
  listeners.clear();
  doc.visibilityState = 'visible';
  Math.random = () => 0.5;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const statuses: string[] = [];
  const seen: Player[][] = [];
  const net: Net = connectNet({ space: 'house:real', observe, onPlayers: (ps) => seen.push(ps as Player[]), onStatus: (s) => statuses.push(s) });
  await settle();
  return { net, statuses, seen, sock: () => FakeSocket.all[FakeSocket.all.length - 1] };
}
function teardown(net: Net) {
  net.close();
  doc.visibilityState = 'visible';
  mock.timers.reset();
  Math.random = realRandom;
}

test('관전 출입증을 받고, 사람들의 소식을 받는다(목록·움직임·나감)', async () => {
  const { net, statuses, seen, sock } = await setup();
  try {
    assert.deepEqual(asked, ['/api/game-token?observe=1']);
    sock().recv({ t: 'hi', you: 'obs', o: 1, players: [{ id: 'a', n: '가나', c: '#c98a5a', x: 1, z: 2, y: 0, l: 1, yw: 0, m: false }] });
    assert.equal(statuses.at(-1), 'live');
    assert.deepEqual(seen.at(-1)?.map((p) => [p.id, p.name, p.x]), [['a', '가나', 1]]);
    sock().recv({ t: 'S', ps: [{ id: 'a', x: 4, z: 2, y: 0, l: 1, yw: 0, m: true }] });
    await run(100, 50);
    assert.equal(seen.at(-1)?.[0].x, 4);
    sock().recv({ t: 'l', id: 'a' });
    await run(100, 50);
    assert.deepEqual(seen.at(-1), []);
  } finally {
    teardown(net);
  }
});

test('관전 연결은 상태·말·겉모습을 보내지 않는다', async () => {
  const { net, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'obs', o: 1, players: [] });
    net.sendState({ x: 1, z: 2, y: 0, level: 1, yaw: 0, moving: true });
    net.setLook({ kind: 'doll', doll: { hair: 'bob', hairColor: '#a8743f', skin: '#c99470', top: '#6b8fb5', bottom: '#ece4d6', acc: 'none' } });
    assert.equal(net.say('안녕하세요'), false);
    await run(20_000, 500, () => sock().recv('pong'));
    assert.deepEqual(sock().json(), [], 'JSON 메시지는 하나도 보내지 않는다');
    assert.ok(sock().pings() >= 3, `ping만 보낸다(${sock().pings()}번)`);
  } finally {
    teardown(net);
  }
});

test('5초마다 ping, 답이 오면 그대로 이어지고, 답이 없으면 스스로 끊고 다시 잇는다', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'obs', o: 1, players: [] });
    const first = sock();
    // 사람이 없어 서버 소식이 없어도 pong이 오는 동안은 그대로(10분)
    await run(600_000, 1000, () => { if (first.sent.at(-1) === 'ping') first.recv('pong'); });
    assert.equal(statuses.at(-1), 'live');
    assert.equal(FakeSocket.all.length, 1);
    const pings = first.pings();
    assert.ok(pings >= 115 && pings <= 121, `10분에 ${pings}번(5초마다)`);
    // 이제 답이 없다(연결이 열린 채 죽었다): 다음 ping부터 10초 남짓 뒤에 끊고 다시 잇는다
    await run(16_000, 1000);
    assert.equal(first.readyState, FakeSocket.CLOSED);
    assert.ok(FakeSocket.all.length >= 2 || statuses.at(-1) === 'retrying', '다시 잇는 중');
    await run(2000, 500);
    assert.equal(FakeSocket.all.length, 2);
    sock().recv({ t: 'hi', you: 'obs2', o: 1, players: [] });
    assert.equal(statuses.at(-1), 'live');
  } finally {
    teardown(net);
  }
});

test('관전 연결이 자리를 내주면(bye replaced) 꺼지지 않고 물러났다가 다시 잇는다. 걷는 연결은 같은 일에 쉰다', async () => {
  const o = await setup();
  try {
    o.sock().recv({ t: 'hi', you: 'obs', o: 1, players: [] });
    const first = o.sock();
    first.recv({ t: 'bye', why: 'replaced' });
    assert.equal(first.readyState, FakeSocket.CLOSED);
    assert.equal(o.statuses.at(-1), 'retrying', '꺼지지 않고 다시 이을 차례를 기다린다');
    await run(14_000, 1000);
    assert.equal(FakeSocket.all.length, 1, '바로 붙지 않는다(서로 빼앗지 않게)');
    await run(2000, 500);
    assert.equal(FakeSocket.all.length, 2, '15초 뒤 다시 잇는다');
    o.sock().recv({ t: 'hi', you: 'obs2', o: 1, players: [] });
    assert.equal(o.statuses.at(-1), 'live');
  } finally {
    teardown(o.net);
  }
  const w = await setup(false);
  try {
    w.sock().recv({ t: 'hi', you: 'me', players: [] });
    w.sock().recv({ t: 'bye', why: 'replaced' });
    assert.equal(w.statuses.at(-1), 'off', '걷는 연결은 다른 창에 자리를 내주고 쉰다');
    await run(30_000, 1000);
    assert.equal(FakeSocket.all.length, 1);
  } finally {
    teardown(w.net);
  }
});

test('관전 연결은 탭이 숨어도 끊지 않는다(걷는 연결은 끊는다). 페이지를 떠나면 끊고 돌아오면 다시 잇는다', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'obs', o: 1, players: [] });
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    await run(30_000, 1000, () => { if (sock().sent.at(-1) === 'ping') sock().recv('pong'); });
    assert.equal(statuses.at(-1), 'live', '숨어도 이어진다');
    assert.equal(FakeSocket.all.length, 1);
    fire('pagehide');
    assert.equal(statuses.at(-1), 'off');
    assert.equal(FakeSocket.all[0].readyState, FakeSocket.CLOSED);
    // 숨은 채로 돌아와도(뒤로 가기 캐시에서 다시 보임) 관전은 다시 잇는다
    fire('pageshow');
    await settle();
    assert.equal(FakeSocket.all.length, 2);
  } finally {
    teardown(net);
  }
  // 걷는 연결은 그대로: 숨으면 끊는다
  const walk = await setup(false);
  try {
    walk.sock().recv({ t: 'hi', you: 'me', players: [] });
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    assert.equal(walk.statuses.at(-1), 'off');
    assert.deepEqual(asked, ['/api/game-token'], '걷는 연결은 보통 출입증');
  } finally {
    teardown(walk.net);
  }
});

test('숨은 탭에서 처음 띄워도 관전은 바로 잇는다. 약속 글의 이름 createNet으로도 부를 수 있다', async () => {
  FakeSocket.all = [];
  asked.length = 0;
  listeners.clear();
  doc.visibilityState = 'hidden';
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const statuses: string[] = [];
  const net = createNet({ space: 'house:real', observe: true, onPlayers: () => {}, onStatus: (s) => statuses.push(s) });
  try {
    await settle();
    assert.equal(createNet, connectNet);
    assert.deepEqual(asked, ['/api/game-token?observe=1']);
    assert.equal(FakeSocket.all.length, 1);
  } finally {
    teardown(net);
  }
});
