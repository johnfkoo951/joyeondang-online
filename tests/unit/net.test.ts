// 함께 걷기 연결 시험: 가짜 WebSocket·fetch·시계로 끊김 감지, 물러났다 다시 잇기, 출입증 받는 횟수, 보내는 빈도를 본다.
import { test, mock } from 'node:test';
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

type Handler = (e: unknown) => void;
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  /** 새 소켓이 바로 열릴지(서버가 살아 있는가) */
  static up = true;
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onmessage: Handler | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
    if (FakeSocket.up) this.readyState = FakeSocket.OPEN;
  }
  send(s: string) { this.sent.push(s); }
  close() { this.readyState = FakeSocket.CLOSED; }
  /** 서버가 보낸 것처럼 */
  recv(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  /** 연결 실패(서버가 내려가 있음) */
  fail() { this.readyState = FakeSocket.CLOSED; this.onerror?.({}); }
  states() { return this.sent.map((s) => JSON.parse(s)).filter((m) => m.t === 's'); }
}

const listeners = new Map<string, Set<Handler>>();
const target = {
  addEventListener(type: string, fn: Handler) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
  removeEventListener(type: string, fn: Handler) { listeners.get(type)?.delete(fn); },
};
const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn({}));
const fetched = { n: 0, status: 200 };
/** 사진 겉모습 증표 요청(/api/game-token/look): 받은 주소들, 돌려줄 상태, 답을 붙잡아 둘지 */
const proofs = { urls: [] as string[], status: 200, hold: null as Promise<void> | null };
const g = globalThis as Record<string, unknown>;
g.window = target;
g.document = { visibilityState: 'visible', ...target };
g.WebSocket = FakeSocket;
g.fetch = async (input: unknown) => {
  if (String(input).startsWith('/api/game-token/look')) {
    proofs.urls.push(String(input));
    const status = proofs.status;
    if (proofs.hold) await proofs.hold;
    return { status, ok: status === 200, json: async () => ({ proof: `proof-${proofs.urls.length}`, exp: Math.floor(Date.now() / 1000) + 600 }) };
  }
  fetched.n++;
  const status = fetched.status;
  return { status, ok: status === 200, json: async () => ({ token: 'tok', url: 'wss://game.test', exp: Math.floor(Date.now() / 1000) + 600 }) };
};
const realRandom = Math.random;

const { connectNet } = await import('../../src/walk/net.ts');
type Net = ReturnType<typeof connectNet>;

/** 약속(fetch·await)이 풀리도록 한 박자 쉰다 */
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
/** 가짜 시계를 ms만큼, step씩 돌리며 그때마다 약속을 푼다 */
async function run(ms: number, step = 100) {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(step);
    await settle();
  }
}
const here = { x: 1, z: 2, y: 0, level: 1 as const, yaw: 0, moving: false };

async function setup() {
  FakeSocket.all = [];
  FakeSocket.up = true;
  fetched.n = 0;
  fetched.status = 200;
  proofs.urls = [];
  proofs.status = 200;
  proofs.hold = null;
  listeners.clear();
  Math.random = () => 0.5; // 흩뜨림 없이(×1.0)
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const statuses: string[] = [];
  const net: Net = connectNet({ space: 'house:real', onPlayers: () => {}, onStatus: (s) => statuses.push(s) });
  await settle();
  return { net, statuses, sock: () => FakeSocket.all[FakeSocket.all.length - 1] };
}
function teardown(net: Net) {
  net.close();
  mock.timers.reset();
  Math.random = realRandom;
}
/** 서버처럼: 받은 상태를 0.1초 묶음으로 되돌려 준다(내 것도 들어 있다) */
function echo(sock: FakeSocket) {
  let seen = 0;
  return () => {
    const n = sock.states().length;
    if (n > seen && sock.readyState === FakeSocket.OPEN) sock.recv({ t: 'S', ps: [{ id: 'me', x: 1, z: 2, y: 0, l: 1, yw: 0, m: false }] });
    seen = n;
  };
}

test('잇기: 출입증을 한 번 받고, 인사를 받으면 이어진 것. 붙어 있는 동안에는 출입증을 다시 받지 않는다', async () => {
  const { net, statuses, sock } = await setup();
  try {
    assert.equal(fetched.n, 1);
    assert.match(sock().url, /^wss:\/\/game\.test\/connect\?space=house%3Areal&token=tok$/);
    sock().recv({ t: 'hi', you: 'me', players: [] });
    assert.equal(statuses.at(-1), 'live');
    net.sendState(here);
    const reply = echo(sock());
    // 20분 동안 가만히: 3초마다 살아 있다고 알리고(서버가 되돌려 준다), 출입증은 그대로
    for (let i = 0; i < 20 * 60; i++) {
      mock.timers.tick(1000);
      reply();
      await settle();
    }
    assert.equal(statuses.at(-1), 'live');
    assert.equal(fetched.n, 1, '붙어 있는 동안 출입증을 새로 받지 않는다');
    assert.equal(FakeSocket.all.length, 1);
    const beats = sock().states().length;
    assert.ok(beats >= 390 && beats <= 410, `20분에 ${beats}번(3초마다)`);
  } finally {
    teardown(net);
  }
});

test('서버 소식이 10초 넘게 끊기면 스스로 끊고 다시 잇는다(닫힘 신호가 오지 않아도)', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    net.sendState(here);
    const first = sock();
    // 서버가 말이 없다(연결은 열린 채 죽었다)
    await run(9000, 1000);
    assert.equal(statuses.at(-1), 'live', '9초까지는 기다린다');
    await run(2000, 1000);
    assert.equal(statuses.at(-1), 'retrying');
    assert.equal(first.readyState, FakeSocket.CLOSED);
    // 1초 물러났다 다시 잇는다. 출입증은 아직 쓸 수 있어 새로 받지 않는다
    await run(1100);
    assert.equal(FakeSocket.all.length, 2);
    assert.equal(fetched.n, 1);
    sock().recv({ t: 'hi', you: 'me', players: [] });
    assert.equal(statuses.at(-1), 'live');
  } finally {
    teardown(net);
  }
});

test('아직 상태를 보내지 못한 동안(3D 장면을 짓는 중)에는 서버가 조용해도 끊지 않는다', async () => {
  const { net, statuses } = await setup();
  try {
    FakeSocket.all[0].recv({ t: 'hi', you: 'me', players: [] });
    // 장면이 아직 없어 sendState가 한 번도 불리지 않는다. 혼자라 서버도 보낼 것이 없다
    await run(40_000, 1000);
    assert.equal(statuses.at(-1), 'live');
    assert.equal(FakeSocket.all.length, 1, '다시 잇지 않는다');
    assert.equal(FakeSocket.all[0].states().length, 0);
    // 장면이 떠서 보내기 시작한 뒤에 답이 없으면 그때부터 10초를 센다
    net.sendState(here);
    await run(9000, 1000);
    assert.equal(statuses.at(-1), 'live');
    await run(2000, 1000);
    assert.equal(statuses.at(-1), 'retrying');
  } finally {
    teardown(net);
  }
});

test('기기가 통신이 끊겼다고 알리면 바로 끊고, 돌아오면 다시 잇는다', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    fire('offline');
    assert.equal(statuses.at(-1), 'retrying');
    fire('online');
    await settle();
    assert.equal(FakeSocket.all.length, 2);
    sock().recv({ t: 'hi', you: 'me', players: [] });
    assert.equal(statuses.at(-1), 'live');
  } finally {
    teardown(net);
  }
});

test('서버가 내려가 있으면 1·2·4·8·15·30초로 물러나고(그 뒤로는 30초마다), 출입증은 세 번에 한 번만 새로 받는다', async () => {
  const { net, sock } = await setup();
  try {
    FakeSocket.up = false;
    const at: number[] = [];
    const t0 = Date.now();
    let seen = 0;
    // 새 소켓이 생길 때마다 바로 실패시킨다. 5분 동안
    for (let ms = 0; ms < 5 * 60_000; ms += 100) {
      if (FakeSocket.all.length > seen) {
        seen = FakeSocket.all.length;
        at.push(Math.round((Date.now() - t0) / 1000));
        sock().fail();
        await settle();
      }
      mock.timers.tick(100);
      await settle();
    }
    // 처음 것(0초) 뒤로 1, 2, 4, 8, 15, 30, 30, 30…초 간격
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    assert.deepEqual(gaps.slice(0, 8), [1, 2, 4, 8, 15, 30, 30, 30]);
    // 인사 없이 닫힌 것이 세 번 쌓일 때마다 한 번 새로 받는다: 시도 수의 1/3 남짓
    assert.ok(fetched.n >= 2 && fetched.n <= Math.ceil(at.length / 3) + 1, `시도 ${at.length}번에 출입증 ${fetched.n}번`);
  } finally {
    teardown(net);
  }
});

test('처음부터 출입증을 못 받는 사람(명단 밖·기능 꺼짐)은 한참 뒤 한 번만 더 물어보고 조용히 끈다', async () => {
  FakeSocket.all = [];
  fetched.n = 0;
  fetched.status = 404;
  listeners.clear();
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const statuses: string[] = [];
  const net = connectNet({ space: 'house:real', onPlayers: () => {}, onStatus: (s) => statuses.push(s) });
  try {
    await settle();
    assert.equal(fetched.n, 1);
    assert.notEqual(statuses.at(-1), 'denied', '첫 거절로는 아직 끄지 않는다(일시 오류일 수 있다)');
    await run(21_000, 1000);
    assert.equal(fetched.n, 2, '20초 뒤 한 번 더');
    assert.equal(statuses.at(-1), 'denied');
    await run(300_000, 5000);
    assert.equal(fetched.n, 2, '그 뒤로는 두드리지 않는다');
    assert.equal(FakeSocket.all.length, 0);
  } finally {
    teardown(net);
  }
});

test('처음 거절이 일시 오류였다면: 20초 뒤 다시 물어 이어진다', async () => {
  FakeSocket.all = [];
  FakeSocket.up = true;
  fetched.n = 0;
  fetched.status = 404;
  listeners.clear();
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const statuses: string[] = [];
  const net = connectNet({ space: 'house:real', onPlayers: () => {}, onStatus: (s) => statuses.push(s) });
  try {
    await settle();
    fetched.status = 200;
    await run(21_000, 1000);
    assert.equal(FakeSocket.all.length, 1);
    FakeSocket.all[0].recv({ t: 'hi', you: 'me', players: [] });
    assert.equal(statuses.at(-1), 'live');
  } finally {
    teardown(net);
  }
});

test('처음 거절 뒤 다시 물어보기는 20초를 지킨다: 그사이 창을 누르거나 탭을 오가거나 방을 옮겨도 당겨지지 않는다', async () => {
  FakeSocket.all = [];
  FakeSocket.up = true;
  fetched.n = 0;
  fetched.status = 404;
  listeners.clear();
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const statuses: string[] = [];
  const net = connectNet({ space: 'house:real', onPlayers: () => {}, onStatus: (s) => statuses.push(s) });
  const doc = g.document as { visibilityState: string };
  try {
    await settle();
    assert.equal(fetched.n, 1);
    // 0.5초 뒤 창을 누른다, 통신이 돌아왔다고 알린다, 방으로 들어간다, 탭을 숨겼다 돌아온다: 어느 것도 두 번째 물음을 당기지 않는다
    await run(500);
    fire('focus');
    fire('online');
    await settle();
    net.join('room:porch');
    await settle();
    doc.visibilityState = 'hidden';
    fire('visibilitychange');
    await run(2000);
    doc.visibilityState = 'visible';
    fire('visibilitychange');
    await settle();
    fire('pageshow');
    await run(10_000, 500);
    assert.equal(fetched.n, 1, '20초가 되기 전에는 다시 묻지 않는다');
    assert.notEqual(statuses.at(-1), 'denied');
    // 20초가 지나면 한 번 더 묻고, 그때는 풀려 있어 이어진다(옮겨 간 방으로)
    fetched.status = 200;
    await run(9_000, 500);
    assert.equal(fetched.n, 2, '20초 뒤 한 번 더');
    assert.equal(FakeSocket.all.length, 1);
    assert.match(FakeSocket.all[0].url, /space=room%3Aporch/);
    FakeSocket.all[0].recv({ t: 'hi', you: 'me', players: [] });
    assert.equal(statuses.at(-1), 'live');
  } finally {
    doc.visibilityState = 'visible';
    teardown(net);
  }
});
test('올려 보내는 길이 막히면 쌓지 않는다: 답이 1초 넘게 없으면 1초에 한 번만 보내고, 답이 오면 제 빠르기로 돌아간다', async () => {
  const { net, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    let x = 1;
    /** ms 동안 걷는다(0.05초마다 자리가 바뀐다). reply가 있으면 서버가 답한다 */
    const walk = async (ms: number, reply?: () => void) => {
      for (let t = 0; t < ms; t += 50) {
        x += 0.1;
        net.sendState({ ...here, x, moving: true });
        mock.timers.tick(50);
        reply?.();
        await settle();
      }
    };
    await walk(3000, echo(sock()));
    const normal = sock().states().length;
    assert.ok(normal >= 18 && normal <= 22, `평소 3초 걷기 ${normal}번`);
    // 8초 동안 서버 소식이 없다(올려 보내는 길이 막힘). 0.15초마다 보냈다면 53번이 쌓였을 것이다
    const before = sock().states().length;
    await walk(8000);
    const stalled = sock().states().length - before;
    assert.ok(stalled >= 8 && stalled <= 16, `막힌 8초 동안 ${stalled}번`);
    assert.equal(FakeSocket.all.length, 1, '10초가 안 됐으므로 끊지는 않는다');
    // 마지막으로 보낸 것은 가장 새 자리에 가깝다(1초보다 오래된 값이 아니다)
    const lastSent = sock().states().at(-1).x;
    assert.ok(x - lastSent <= 2.01, `마지막 보낸 자리 ${lastSent} / 지금 ${x.toFixed(2)}`);
    // 답이 다시 오면 제 빠르기로
    const again = sock().states().length;
    await walk(3000, echo(sock()));
    const after = sock().states().length - again;
    assert.ok(after >= 18 && after <= 22, `풀린 뒤 3초 걷기 ${after}번`);
  } finally {
    teardown(net);
  }
});
test('서버가 넘친다며 끊으면 길게 쉬고(30초, 거듭되면 두 배), 창을 눌러도 당겨지지 않는다. 탈 없이 붙어 있으면 다시 센다', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    sock().recv({ t: 'bye', why: 'flood' });
    assert.equal(statuses.at(-1), 'retrying');
    await run(5000, 500);
    fire('focus');
    fire('online');
    await run(20_000, 500);
    assert.equal(FakeSocket.all.length, 1, '30초가 되기 전에는 다시 잇지 않는다');
    await run(6000, 500);
    assert.equal(FakeSocket.all.length, 2, '30초 뒤 다시 잇는다');
    // 닫힘 코드만 와도(말로 알리는 bye를 못 받아도) 같다. 두 번째는 60초
    sock().recv({ t: 'hi', you: 'me', players: [] });
    sock().onclose?.({ code: 4003 });
    assert.equal(statuses.at(-1), 'retrying');
    await run(55_000, 500);
    assert.equal(FakeSocket.all.length, 2, '두 번째는 60초를 쉰다');
    await run(6000, 500);
    assert.equal(FakeSocket.all.length, 3);
    // 1분 넘게 탈 없이 붙어 있다가 다시 넘치면 처음처럼 30초
    sock().recv({ t: 'hi', you: 'me', players: [] });
    net.sendState(here);
    const reply = echo(sock());
    for (let i = 0; i < 70; i++) {
      mock.timers.tick(1000);
      reply();
      await settle();
    }
    assert.equal(statuses.at(-1), 'live');
    sock().recv({ t: 'bye', why: 'flood' });
    await run(25_000, 500);
    assert.equal(FakeSocket.all.length, 3);
    await run(6000, 500);
    assert.equal(FakeSocket.all.length, 4, '다시 30초 뒤에 잇는다');
  } finally {
    teardown(net);
  }
});
test('이어졌던 사람이 다시 이을 때 출입증을 한 번 거절당해도 끄지 않고 다시 받아 본다', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    // 출입증 수명(10분)이 다 된 뒤에 끊긴다 → 다시 이으려면 새 출입증이 필요한데, 그 한 번이 404
    const reply = echo(sock());
    net.sendState(here);
    for (let i = 0; i < 601; i++) {
      mock.timers.tick(1000);
      reply();
      await settle();
    }
    fetched.status = 404;
    sock().onclose?.({ code: 1006 });
    await run(1100);
    assert.equal(statuses.at(-1), 'retrying', '한 번 거절로는 끄지 않는다');
    fetched.status = 200;
    await run(2100);
    sock().recv({ t: 'hi', you: 'me', players: [] });
    assert.equal(statuses.at(-1), 'live');
    // 계속 거절이면(명단에서 빠짐) 몇 번 뒤에는 끈다
    for (let i = 0; i < 601; i++) {
      mock.timers.tick(1000);
      echo(sock())();
      await settle();
    }
    fetched.status = 404;
    sock().onclose?.({ code: 1006 });
    await run(40_000, 500);
    assert.equal(statuses.at(-1), 'denied');
  } finally {
    teardown(net);
  }
});

test('보내는 빈도: 걸으면 0.15초, 서서 둘러보기만 하면 0.4초, 가만히 있으면 3초 간격', async () => {
  const { net, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    const s = sock();
    const reply = echo(s);
    const count = () => s.states().length;
    net.sendState(here);
    await run(500, 50);
    // 걷기: 0.05초마다 자리가 바뀐다 → 3초에 20번 안팎(0.15초 간격)
    let n0 = count();
    for (let i = 0; i < 60; i++) {
      net.sendState({ ...here, x: 1 + i * 0.08, moving: true });
      mock.timers.tick(50);
      reply();
      await settle();
    }
    const walking = count() - n0;
    assert.ok(walking >= 18 && walking <= 21, `걷기 3초에 ${walking}번`);
    // 서서 둘러보기: 자리는 그대로, 보는 쪽만 바뀐다 → 3초에 7~8번(0.4초 간격)
    await run(600, 50);
    n0 = count();
    for (let i = 0; i < 60; i++) {
      net.sendState({ ...here, x: 9, yaw: i * 0.05 });
      mock.timers.tick(50);
      reply();
      await settle();
    }
    const turning = count() - n0;
    assert.ok(turning >= 6 && turning <= 9, `둘러보기 3초에 ${turning}번`);
    // 둘러보다 걷기 시작하면 0.4초를 다 기다리지 않고 바로(0.15초 안에) 자리를 보낸다
    await run(450, 50);
    n0 = count();
    net.sendState({ ...here, x: 9, yaw: 9 });
    mock.timers.tick(50);
    net.sendState({ ...here, x: 9.3, yaw: 9, moving: true });
    await run(200, 50);
    const lastSent = s.states().at(-1);
    assert.equal(lastSent.x, 9.3, '걷기 시작한 자리가 곧바로 나간다');
    // 가만히: 9초에 3번
    await run(1000, 50);
    n0 = count();
    for (let i = 0; i < 9; i++) {
      mock.timers.tick(1000);
      reply();
      await settle();
    }
    const idle = count() - n0;
    assert.ok(idle >= 3 && idle <= 4, `가만히 9초에 ${idle}번`);
  } finally {
    teardown(net);
  }
});

test('점프와 앉기: 점프 수가 바뀌거나 앉으면 서서 둘러볼 때보다 빨리 보낸다. 받은 사람의 점프 수와 앉음을 목록에 싣고, 옛 서버(칸 없음)면 서 있는 것으로', async () => {
  const lists: Array<Array<{ id: string; jumps?: number; sitting?: boolean }>> = [];
  FakeSocket.all = [];
  FakeSocket.up = true;
  fetched.n = 0;
  fetched.status = 200;
  listeners.clear();
  Math.random = () => 0.5;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const net = connectNet({ space: 'house:real', onPlayers: (ps) => lists.push(ps), onStatus: () => {} });
  await settle();
  try {
    const s = FakeSocket.all.at(-1)!;
    s.recv({ t: 'hi', you: 'me', players: [{ id: 'b', n: '다른 손님', c: '#336699', x: 3, z: 3, y: 0, l: 1, yw: 0, m: false, j: 4 }] });
    await settle();
    const reply = echo(s);
    net.sendState({ ...here, jumps: 0 });
    await run(500, 50);
    const n0 = s.states().length;
    // 제자리에서 뛴다: 자리는 그대로라도 0.15초 안에 나간다(보는 쪽만 바뀔 때의 0.4초를 기다리지 않는다)
    net.sendState({ ...here, jumps: 1 });
    await run(200, 50);
    reply();
    const jumped = s.states().slice(n0);
    assert.equal(jumped.length, 1);
    assert.equal(jumped[0].j, 1);
    assert.equal(jumped[0].st, undefined, '서 있으면 앉음 칸을 싣지 않는다');
    // 256번째 점프는 0으로 돈다
    net.sendState({ ...here, jumps: 256 });
    await run(200, 50);
    reply();
    assert.equal(s.states().at(-1).j, 0);
    // 앉는다
    net.sendState({ ...here, jumps: 256, sitting: true });
    await run(200, 50);
    reply();
    assert.equal(s.states().at(-1).st, 1);
    // 받기: 처음 목록의 점프 수, 그다음 묶음의 새 점프 수와 앉음
    await run(100, 50);
    assert.equal(lists.at(-1)!.find((p) => p.id === 'b')!.jumps, 4);
    assert.equal(lists.at(-1)!.find((p) => p.id === 'b')!.sitting, false);
    s.recv({ t: 'S', ps: [{ id: 'b', x: 3, z: 3, y: 0, l: 1, yw: 0, m: false, j: 5, st: 1 }] });
    await run(100, 50);
    assert.deepEqual([lists.at(-1)!.find((p) => p.id === 'b')!.jumps, lists.at(-1)!.find((p) => p.id === 'b')!.sitting], [5, true]);
    // 옛 서버: 칸이 없으면 점프 수는 그대로 두고 앉음은 끈다
    s.recv({ t: 'S', ps: [{ id: 'b', x: 3.1, z: 3, y: 0, l: 1, yw: 0, m: true }] });
    await run(100, 50);
    assert.deepEqual([lists.at(-1)!.find((p) => p.id === 'b')!.jumps, lists.at(-1)!.find((p) => p.id === 'b')!.sitting], [5, false]);
  } finally {
    teardown(net);
  }
});

const DOLL = { kind: 'doll' as const, doll: { hair: 'bob' as const, hairColor: '#a8743f', skin: '#c99470', top: '#6b8fb5', bottom: '#ece4d6', acc: 'glasses' as const } };
const PHOTO = { kind: 'photo' as const, url: '/api/avatar/0f8e2c1a-1234-4abc-9def-0123456789ab' };
const PHOTO2 = { kind: 'photo' as const, url: '/api/avatar/7a7a7a7a-0000-4000-8000-000000000002' };
const looks = (sock: FakeSocket) => sock.sent.map((x) => JSON.parse(x)).filter((m) => m.t === 'k');

test('겉모습: 인형은 증표 없이 바로 보내고, 사진은 내 그림이라는 증표를 받아 함께 보낸다', async () => {
  const { net, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    net.setLook(DOLL);
    await settle();
    assert.deepEqual(looks(sock()), [{ t: 'k', look: DOLL }]);
    assert.equal(proofs.urls.length, 0, '인형은 증표를 묻지 않는다');
    // 10초 간격 뒤 사진으로: 증표를 받아 한 메시지에 싣는다(그동안 서버 소식은 이어진다)
    net.sendState(here);
    const reply = echo(sock());
    for (let i = 0; i < 11; i++) {
      mock.timers.tick(1000);
      reply();
      await settle();
    }
    assert.equal(FakeSocket.all.length, 1);
    net.setLook(PHOTO);
    await settle();
    assert.deepEqual(proofs.urls, ['/api/game-token/look?id=0f8e2c1a-1234-4abc-9def-0123456789ab']);
    assert.deepEqual(looks(sock()).at(-1), { t: 'k', look: PHOTO, p: 'proof-1' });
    assert.equal(fetched.n, 1, '출입증은 새로 받지 않는다');
    // 끊겼다 다시 이어도(출입증에는 옛 겉모습이 실려 있다) 받아 둔 증표를 붙여 다시 보낸다
    fire('offline');
    await run(1500);
    assert.equal(FakeSocket.all.length, 2);
    sock().recv({ t: 'hi', you: 'me2', players: [] });
    await settle();
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO, p: 'proof-1' }]);
    assert.equal(proofs.urls.length, 1, '살아 있는 증표는 다시 받지 않는다');
  } finally {
    teardown(net);
  }
});

test('겉모습: 증표를 못 받아도 사진 겉모습은 보낸다(서버가 출입증의 사진과 같으면 받는다)', async () => {
  const { net, sock } = await setup();
  try {
    proofs.status = 404;
    sock().recv({ t: 'hi', you: 'me', players: [] });
    net.setLook(PHOTO);
    await settle();
    assert.equal(proofs.urls.length, 1);
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO }]);
  } finally {
    teardown(net);
  }
});

/** 서버 소식이 이어지는 채로(끊긴 것으로 치지 않게) 가짜 시계를 돌린다 */
async function pass(sock: FakeSocket, ms: number) {
  const reply = echo(sock);
  for (let t = 0; t < ms; t += 500) {
    mock.timers.tick(500);
    reply();
    await settle();
  }
}

test('겉모습: 증표를 못 받으면 물러났다 다시 받아 보고, 받으면 증표를 붙여 다시 보낸다', async () => {
  const { net, sock } = await setup();
  try {
    proofs.status = 404;
    sock().recv({ t: 'hi', you: 'me', players: [] });
    net.sendState(here);
    net.setLook(PHOTO);
    await settle();
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO }]);
    // 잠깐의 실패였다: 3초 뒤 다시 받아 보니 된다. 겉모습 간격(10초)을 기다리지 않고 증표를 붙여 다시 보낸다
    proofs.status = 200;
    await pass(sock(), 2500);
    assert.equal(proofs.urls.length, 1, '아직 물러나 있다');
    await pass(sock(), 1000);
    assert.equal(proofs.urls.length, 2);
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO }, { t: 'k', look: PHOTO, p: 'proof-2' }]);
    // 받은 뒤에는 더 묻지도 보내지도 않는다
    await pass(sock(), 60_000);
    assert.equal(proofs.urls.length, 2);
    assert.equal(looks(sock()).length, 2);
    assert.equal(FakeSocket.all.length, 1, '연결은 그대로');
  } finally {
    teardown(net);
  }
});

test('겉모습: 증표를 끝내 못 받으면 세 번만 더 묻고 멈춘다. 증표 없는 사진을 되풀이해 보내지 않는다', async () => {
  const { net, sock } = await setup();
  try {
    proofs.status = 404;
    sock().recv({ t: 'hi', you: 'me', players: [] });
    net.sendState(here);
    net.setLook(PHOTO);
    await settle();
    await pass(sock(), 3500);
    assert.equal(proofs.urls.length, 2, '3초 뒤');
    await pass(sock(), 10_000);
    assert.equal(proofs.urls.length, 3, '그 10초 뒤');
    await pass(sock(), 120_000);
    assert.equal(proofs.urls.length, 4, '그 30초 뒤 한 번 더 묻고 멈춘다');
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO }]);
    // 다시 이어지면 처음부터 다시 해 본다
    proofs.status = 200;
    fire('offline');
    await run(1500);
    assert.equal(FakeSocket.all.length, 2);
    sock().recv({ t: 'hi', you: 'me2', players: [] });
    await settle();
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO, p: 'proof-5' }]);
  } finally {
    teardown(net);
  }
});

test('겉모습: 다시 받아 보려고 물러난 사이 겉모습을 바꾸면 앞의 사진은 더 묻지 않는다', async () => {
  const { net, sock } = await setup();
  try {
    proofs.status = 404;
    sock().recv({ t: 'hi', you: 'me', players: [] });
    net.sendState(here);
    net.setLook(PHOTO);
    await settle();
    await pass(sock(), 1000);
    net.setLook(DOLL);
    await pass(sock(), 60_000);
    assert.equal(proofs.urls.length, 1);
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO }, { t: 'k', look: DOLL }], '인형은 10초 간격 뒤에 한 번');
  } finally {
    teardown(net);
  }
});

test('겉모습: 증표를 기다리는 사이 다시 바꾸면 마지막 것만 보낸다', async () => {
  const { net, sock } = await setup();
  try {
    sock().recv({ t: 'hi', you: 'me', players: [] });
    let release = () => {};
    proofs.hold = new Promise<void>((r) => { release = r; });
    net.setLook(PHOTO);
    await settle();
    assert.deepEqual(looks(sock()), [], '증표를 기다리는 중');
    proofs.hold = null;
    net.setLook(PHOTO2);
    await settle();
    release();
    await settle();
    assert.deepEqual(looks(sock()), [{ t: 'k', look: PHOTO2, p: 'proof-2' }], '늦게 온 앞 증표의 답은 버린다');
  } finally {
    teardown(net);
  }
});

/** 소켓이 들어가려는 공간 이름 */
const spaceOf = (s: FakeSocket) => decodeURIComponent(/space=([^&]+)/.exec(s.url)![1]);

test('가득 찬 공간이 다음 공간을 알려 주면 바로 그리로 들어가고(가득 찼다는 알림 없이), 다시 이을 때는 처음 공간부터', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'full', to: 'house:real~2' });
    await run(100, 50);
    assert.equal(FakeSocket.all.length, 2);
    assert.equal(spaceOf(sock()), 'house:real~2');
    assert.ok(!statuses.includes('full'), '가득 찼다고 알리지 않는다');
    sock().recv({ t: 'hi', you: 'me', players: [] });
    assert.equal(statuses.at(-1), 'live');
    // 끊겼다 다시 이으면 처음 공간부터(자리가 났으면 돌아오게)
    fire('offline');
    await run(1500);
    assert.equal(FakeSocket.all.length, 3);
    assert.equal(spaceOf(sock()), 'house:real');
    assert.equal(fetched.n, 1, '출입증은 그대로 쓴다');
  } finally {
    teardown(net);
  }
});

test('다음 공간도 차면 그다음(~3)으로, 마지막 공간도 차면 가득 찼다고 알리고 30초 뒤 처음 공간부터', async () => {
  const { net, statuses, sock } = await setup();
  try {
    sock().recv({ t: 'full', to: 'house:real~2' });
    await run(100, 50);
    sock().recv({ t: 'full', to: 'house:real~3' });
    await run(100, 50);
    assert.equal(spaceOf(sock()), 'house:real~3');
    sock().recv({ t: 'full' });
    await settle();
    assert.equal(statuses.at(-1), 'full');
    await run(29_000, 1000);
    assert.equal(FakeSocket.all.length, 3);
    await run(2000, 500);
    assert.equal(FakeSocket.all.length, 4);
    assert.equal(spaceOf(sock()), 'house:real');
  } finally {
    teardown(net);
  }
});

test('엉뚱한 다음 공간(다른 집·되돌아가기·같은 공간·범위 밖·글자 아님)은 따르지 않고 가득 찬 것으로 본다', async () => {
  const cases: Array<[string, unknown]> = [
    ['house:real', 'room:porch~2'], ['house:real', 'house:real~4'], ['house:real', 'house:real'], ['house:real', 'house:realx~2'],
    ['house:real', 'house:real~2~3'], ['house:real', 5], ['house:real~2', 'house:real~2'], ['house:real~2', 'house:real'],
  ];
  for (const [from, to] of cases) {
    const { net, statuses, sock } = await setup();
    try {
      if (from !== 'house:real') {
        sock().recv({ t: 'full', to: from });
        await run(100, 50);
      }
      const n = FakeSocket.all.length;
      sock().recv({ t: 'full', to });
      await run(1000, 100);
      assert.equal(FakeSocket.all.length, n, `${from} → ${String(to)}: 따르지 않는다`);
      assert.equal(statuses.at(-1), 'full', `${from} → ${String(to)}`);
    } finally {
      teardown(net);
    }
  }
});

test('다음 공간으로 가기 전에 방을 옮기면 새 공간의 처음으로 간다. 공간 이름 모두(spaceShards)', async () => {
  const { net, sock } = await setup();
  try {
    sock().recv({ t: 'full', to: 'house:real~2' });
    net.join('room:porch');
    await run(500, 50);
    assert.equal(spaceOf(sock()), 'room:porch');
    await run(1000, 100);
    assert.equal(spaceOf(sock()), 'room:porch', '앞 공간의 다음 공간으로 가지 않는다');
    const { spaceShards, NET_SHARDS } = await import('../../src/walk/net.ts');
    assert.deepEqual(spaceShards('house:real'), ['house:real', 'house:real~2', 'house:real~3']);
    assert.equal(spaceShards('room:porch').length, NET_SHARDS);
  } finally {
    teardown(net);
  }
});
