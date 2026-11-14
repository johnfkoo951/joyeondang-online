// 함께 걷기 공간: 실제 서버 처리기(game-server/src/space.ts)에 가짜 연결을 넣어 본다.
// 관전자(출입증 role 'observer'): 사람 수에 세지 않고 남의 목록·들어옴·나감에 나오지 않으며, 같은 소식을 받고, 보내는 것은 버려진다.
// 같은 사람이 걸으면서 관전해도 서로 닫지 않고, 관전 연결 수는 공간마다·사람마다 따로 막는다.
// 수용 인원: 가득 찬 공간은 걷는 사람에게 같은 집의 다음 공간(~2, ~3)을 알려 준다.
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

/** 서버 쪽 연결 하나. 서버가 보낸 것·닫음·붙임표를 적는다 */
class FakeWS {
  sent: string[] = [];
  closed: null | { code: number; reason: string } = null;
  attachment: unknown = null;
  send(s: string) {
    if (this.closed) throw new Error('closed');
    this.sent.push(s);
  }
  close(code: number, reason: string) { this.closed ??= { code, reason }; }
  accept() {}
  serializeAttachment(v: unknown) { this.attachment = v === null ? null : JSON.parse(JSON.stringify(v)); }
  deserializeAttachment() { return this.attachment; }
  /** 서버가 보낸 JSON 메시지(ping 답 같은 맨 글자는 뺀다) */
  msgs(): Array<Record<string, unknown>> { return this.sent.filter((s) => s.startsWith('{')).map((s) => JSON.parse(s)); }
  has(t: string, pred: (m: Record<string, unknown>) => boolean = () => true) { return this.msgs().some((m) => m.t === t && pred(m)); }
}
/** 노드에는 WebSocketPair가 없고, Response는 101을 받지 않는다. 이 시험 파일 안에서만 바꿔 끼운다(파일마다 따로 돈다) */
let lastServer: FakeWS | null = null;
const g = globalThis as Record<string, unknown>;
g.WebSocketPair = class {
  0: FakeWS;
  1: FakeWS;
  constructor() {
    this[0] = new FakeWS();
    this[1] = new FakeWS();
    lastServer = this[1];
  }
};
g.Response = class {
  status: number;
  constructor(_body: unknown, init?: { status?: number }) { this.status = init?.status ?? 200; }
};
/** 런타임의 자동 답 짝(있을 때 생성자가 'ping'→'pong'을 건다) */
g.WebSocketRequestResponsePair = class {
  request: string;
  response: string;
  constructor(request: string, response: string) {
    this.request = request;
    this.response = response;
  }
};

const { Space } = await import('../../game-server/src/space.ts');
const P = await import('../../game-server/src/protocol.ts');

const T0 = 1_700_000_000_000;
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
type Who = { sub: string; name?: string; role?: string; look?: unknown; exp?: number };

function makeSpace(restore: FakeWS[] = [], space = 'house:real') {
  const ctx = {
    accepted: [] as FakeWS[],
    auto: null as null | { request: string; response: string },
    /** 런타임이 그 연결의 ping에 마지막으로 답한 때 */
    pinged: new Map<FakeWS, number>(),
    getWebSockets: () => restore,
    acceptWebSocket(ws: FakeWS) { this.accepted.push(ws); },
    setWebSocketAutoResponse(pair: { request: string; response: string }) { this.auto = pair; },
    getWebSocketAutoResponseTimestamp(ws: FakeWS) {
      const t = this.pinged.get(ws);
      return t === undefined ? null : new Date(t);
    },
  };
  const sp = new (Space as unknown as new (c: unknown, e: unknown) => Record<string, unknown>)(ctx, { GAME_TOKEN_SECRET: 'x'.repeat(32) });
  const people = sp.people as Map<FakeWS, Record<string, unknown>>;
  /** 들어온다. 서버 쪽 연결과 응답 상태를 돌려준다 */
  const enter = async (who: Who) => {
    const r = await (sp.fetch as (q: Request) => Promise<{ status: number }>).call(sp, new Request(`https://game.test/connect?space=${encodeURIComponent(space)}`, {
      headers: { [P.PLAYER_HEADER]: encodeURIComponent(JSON.stringify({ name: '손님', color: '#c98a5a', role: 'guest', ...who })) },
    }));
    return { status: r.status, ws: lastServer as FakeWS };
  };
  const feed = (ws: FakeWS, data: string) => (sp.webSocketMessage as (w: unknown, r: string) => Promise<void>).call(sp, ws, data);
  const closeFrom = (ws: FakeWS) => (sp.webSocketClose as (w: unknown) => Promise<void>).call(sp, ws);
  const idOf = (ws: FakeWS) => people.get(ws)?.id as string;
  return { sp, ctx, people, enter, feed, closeFrom, idOf };
}
const watch = (sub: string) => ({ sub, name: '관전', role: 'observer' });
const state = (x: number) => JSON.stringify({ t: 's', x, z: 0, y: 0, l: 1, yw: 0, m: true });

test('관전자가 들어오면 지금 있는 사람들을 받고(o: 1), 걷는 사람들에게는 알리지 않는다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const a = await s.enter({ sub: 'a', name: '가나' });
    await s.feed(a.ws, state(3));
    mock.timers.tick(P.FLUSH_MS);
    const o = await s.enter(watch('fam'));
    assert.equal(o.status, 101);
    const hi = o.ws.msgs()[0];
    assert.equal(hi.t, 'hi');
    assert.equal(hi.o, 1);
    const players = hi.players as Array<Record<string, unknown>>;
    assert.equal(players.length, 1);
    assert.equal(players[0].n, '가나');
    assert.equal(players[0].x, 3, '관전자도 지금 자리를 받는다');
    assert.ok(!a.ws.has('j'), '걷는 사람에게 관전자의 들어옴을 알리지 않는다');
    // 뒤에 온 사람의 목록에도 관전자는 없다
    const b = await s.enter({ sub: 'b', name: '다라' });
    const hiB = b.ws.msgs()[0];
    assert.deepEqual((hiB.players as Array<Record<string, unknown>>).map((p) => p.n), ['가나']);
    assert.ok(o.ws.has('j', (m) => (m.p as Record<string, unknown>).n === '다라'), '관전자는 들어옴을 받는다');
  } finally {
    mock.timers.reset();
  }
});

test('점프 수와 앉음: 받은 그대로 남에게 묶음으로 전하고, 새로 온 사람의 목록에도 싣는다. 틀린 값은 상태를 버리지 않고 그 칸만 뺀다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const a = await s.enter({ sub: 'a', name: '가나' });
    const b = await s.enter({ sub: 'b', name: '다라' });
    const ida = s.idOf(a.ws);
    const send = (extra: Record<string, unknown>) => s.feed(a.ws, JSON.stringify({ t: 's', x: 2, z: 0, y: 0, l: 1, yw: 0, m: false, ...extra }));
    const lastOf = () => {
      const all = b.ws.msgs().filter((m) => m.t === 'S').flatMap((m) => m.ps as Array<Record<string, unknown>>).filter((p) => p.id === ida);
      return all.at(-1);
    };
    await send({ j: 3 });
    mock.timers.tick(P.FLUSH_MS);
    assert.equal(lastOf()?.j, 3, '점프 수');
    assert.equal(lastOf()?.st, undefined);
    await send({ j: 4, st: 1 });
    mock.timers.tick(P.FLUSH_MS);
    assert.deepEqual([lastOf()?.j, lastOf()?.st], [4, 1], '앉음');
    // 틀린 값: 상태는 받고(자리가 바뀐다) 그 칸만 없다
    await s.feed(a.ws, JSON.stringify({ t: 's', x: 2.5, z: 0, y: 0, l: 1, yw: 0, m: false, j: 900, st: 'yes' }));
    mock.timers.tick(P.FLUSH_MS);
    assert.deepEqual([lastOf()?.x, lastOf()?.j, lastOf()?.st], [2.5, undefined, undefined]);
    // 앉은 채로 새 사람이 들어오면 처음 목록에서 앉아 있다
    await send({ j: 4, st: 1 });
    mock.timers.tick(P.FLUSH_MS);
    const c = await s.enter({ sub: 'c', name: '마바' });
    const seen = (c.ws.msgs()[0].players as Array<Record<string, unknown>>).find((p) => p.id === ida);
    assert.deepEqual([seen?.j, seen?.st], [4, 1]);
    // 칸 검사(옛 화면은 보내지 않는다)
    assert.deepEqual(P.readState({ x: 1, z: 1, y: 0, l: 1, yw: 0, m: false }), { x: 1, z: 1, y: 0, l: 1, yw: 0, m: false });
    assert.equal(P.readState({ x: 1, z: 1, y: 0, l: 1, yw: 0, m: false, j: 255 })?.j, 255);
    assert.equal(P.readState({ x: 1, z: 1, y: 0, l: 1, yw: 0, m: false, j: 1.5 })?.j, undefined);
    assert.equal(P.readState({ x: 1, z: 1, y: 0, l: 1, yw: 0, m: false, j: -1 })?.j, undefined);
    assert.equal(P.readState({ x: 1, z: 1, y: 0, l: 1, yw: 0, m: false, st: true })?.st, 1);
    assert.equal(P.readState({ x: 1, z: 1, y: 0, l: 1, yw: 0, m: false, st: 0 })?.st, undefined);
  } finally {
    mock.timers.reset();
  }
});

test('관전자는 같은 소식(움직임 묶음, 말, 겉모습, 나감)을 받는다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const o = await s.enter(watch('fam'));
    const a = await s.enter({ sub: 'a' });
    const ida = s.idOf(a.ws);
    await s.feed(a.ws, state(1.5));
    mock.timers.tick(P.FLUSH_MS);
    assert.ok(o.ws.has('S', (m) => (m.ps as Array<Record<string, unknown>>).some((p) => p.id === ida && p.x === 1.5)), '움직임 묶음');
    await s.feed(a.ws, JSON.stringify({ t: 'c', text: '안녕하세요' }));
    assert.ok(o.ws.has('c', (m) => m.id === ida && m.text === '안녕하세요'), '말');
    mock.timers.tick(P.LOOK_GAP_MS);
    await s.feed(a.ws, JSON.stringify({ t: 'k', look: { kind: 'doll', doll: { hair: 'bob' } } }));
    assert.ok(o.ws.has('k', (m) => m.id === ida), '겉모습');
    await s.closeFrom(a.ws);
    assert.ok(o.ws.has('l', (m) => m.id === ida), '나감');
  } finally {
    mock.timers.reset();
  }
});

test('관전자가 보낸 상태·말·겉모습은 버린다(남에게 가지 않고 목록에도 생기지 않는다). ping에는 pong', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const a = await s.enter({ sub: 'a' });
    const o = await s.enter(watch('fam'));
    const before = a.ws.sent.length;
    await s.feed(o.ws, state(5));
    await s.feed(o.ws, JSON.stringify({ t: 'c', text: '몰래 말하기' }));
    await s.feed(o.ws, JSON.stringify({ t: 'k', look: { kind: 'doll', doll: { hair: 'bob' } } }));
    mock.timers.tick(P.FLUSH_MS * 3);
    await settle();
    assert.equal(a.ws.sent.length, before, '걷는 사람에게 아무것도 가지 않는다');
    assert.equal((s.sp.dirty as Set<unknown>).size, 0);
    assert.equal(s.people.get(o.ws)?.pos, undefined);
    // 살아 있는지 묻는 글자(런타임 답이 없는 환경에서는 공간이 직접 답한다)
    await s.feed(o.ws, P.PING);
    assert.equal(o.ws.sent.at(-1), P.PONG);
    // 늦게 온 사람의 목록에도 관전자는 없다
    const b = await s.enter({ sub: 'b' });
    assert.equal((b.ws.msgs()[0].players as unknown[]).length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('관전자는 사람 수에 세지 않는다: 가득 찬 공간에도 들어오고, 관전자가 있어도 걷는 사람은 MAX_PLAYERS명까지', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const o1 = await s.enter(watch('fam'));
    for (let i = 0; i < P.MAX_PLAYERS; i++) {
      const r = await s.enter({ sub: `p${i}` });
      assert.ok(r.ws.has('hi'), `${i + 1}번째 사람`);
    }
    const late = await s.enter({ sub: 'late' });
    assert.ok(late.ws.has('full'), `${P.MAX_PLAYERS + 1}번째 사람은 full`);
    assert.deepEqual(late.ws.closed, { code: P.CLOSE_FULL, reason: 'full' });
    const o2 = await s.enter(watch('admin'));
    assert.ok(o2.ws.has('hi'), '가득 차도 관전자는 들어온다');
    assert.equal((o2.ws.msgs()[0].players as unknown[]).length, P.MAX_PLAYERS);
    // 관전자가 나가도 걷는 사람들에게 나감을 알리지 않는다
    const anyone = [...s.people.keys()].find((w) => !s.people.get(w)?.o) as FakeWS;
    const seen = anyone.sent.length;
    await s.closeFrom(o1.ws);
    assert.equal(anyone.sent.length, seen);
  } finally {
    mock.timers.reset();
  }
});

test('같은 사람이 걸으면서 관전해도 서로 닫지 않는다. 다시 걸어 들어오면 앞의 걷는 연결만 닫는다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const walk1 = await s.enter({ sub: 'same', role: 'family' });
    const o = await s.enter(watch('same'));
    assert.equal(walk1.ws.closed, null, '관전 연결이 걷는 연결을 닫지 않는다');
    const walk2 = await s.enter({ sub: 'same', role: 'family' });
    assert.deepEqual(walk1.ws.closed, { code: P.CLOSE_REPLACED, reason: 'replaced' });
    assert.equal(o.ws.closed, null, '다시 걸어 들어와도 관전 연결은 그대로');
    assert.ok(walk2.ws.has('hi'));
    assert.ok(o.ws.has('l') && o.ws.has('j'), '관전자는 앞 연결의 나감과 새 연결의 들어옴을 받는다');
  } finally {
    mock.timers.reset();
  }
});

test('관전 연결은 공간마다 MAX_OBSERVERS개, 같은 사람은 OBSERVERS_PER_SUB개까지. 넘치면 조용한 연결만 비우고, 모두 살아 있으면 새 연결을 돌려보낸다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const mine: FakeWS[] = [];
    for (let i = 0; i < P.OBSERVERS_PER_SUB; i++) {
      mine.push((await s.enter(watch('same'))).ws);
      mock.timers.tick(10);
    }
    // 모두 살아 있다: 켜 둔 화면(녹화)을 밀어내지 않고 새 연결을 돌려보낸다
    const live = await s.enter(watch('same'));
    assert.ok(live.ws.has('full'), '모두 살아 있으면 full');
    assert.deepEqual(live.ws.closed, { code: P.CLOSE_FULL, reason: 'full' });
    assert.ok(mine.every((w) => w.closed === null), '살아 있는 연결은 닫지 않는다');
    // 첫 연결만 소식이 끊긴다(닫기 없이 죽은 휴대폰). 나머지는 런타임이 ping에 답한다
    const tick = (ms: number, alive: FakeWS[]) => {
      for (let t = 0; t < ms; t += 5000) {
        mock.timers.tick(5000);
        for (const w of alive) s.ctx.pinged.set(w, Date.now());
      }
    };
    tick(P.OBSERVER_QUIET_MS + 5000, mine.slice(1));
    const next = await s.enter(watch('same'));
    assert.ok(next.ws.has('hi'), '조용한 자리를 비우고 들어온다');
    assert.deepEqual(mine[0].closed, { code: P.CLOSE_REPLACED, reason: 'replaced' }, '조용한 것만 비운다');
    assert.ok(mine[0].has('bye', (m) => m.why === 'replaced'));
    assert.ok(mine.slice(1).every((w) => w.closed === null), '살아 있는 연결은 그대로');
    // 다른 사람들로 공간의 관전 자리를 채운다. 모두 살아 있으면 넘친 관전자는 full
    const count = () => [...s.people.values()].filter((p) => p.o).length;
    const others: FakeWS[] = [];
    for (let i = 0; count() < P.MAX_OBSERVERS; i++) others.push((await s.enter(watch(`other${i}`))).ws);
    const over = await s.enter(watch('one-more'));
    assert.ok(over.ws.has('full'));
    assert.deepEqual(over.ws.closed, { code: P.CLOSE_FULL, reason: 'full' });
    // 다른 사람 자리 하나가 조용해지면 그 자리를 내준다
    tick(P.OBSERVER_QUIET_MS + 5000, [...mine.slice(1), next.ws, ...others.slice(1)]);
    const later = await s.enter(watch('one-more'));
    assert.ok(later.ws.has('hi'));
    assert.deepEqual(others[0].closed, { code: P.CLOSE_REPLACED, reason: 'replaced' });
    assert.equal(count(), P.MAX_OBSERVERS);
    // 걷는 사람은 그래도 들어온다
    assert.ok((await s.enter({ sub: 'walker' })).ws.has('hi'));
  } finally {
    mock.timers.reset();
  }
});

test('출입증이 끝나고 OBSERVER_EXP_GRACE_MS가 지난 관전 연결은 ping에 답해도 정리한다(다시 이으며 역할을 다시 확인하게)', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const exp = Math.floor(T0 / 1000) + 600;
    const o = await s.enter({ ...watch('fam'), exp });
    const walker = await s.enter({ sub: 'w', exp } as Who);
    const tick = (ms: number) => {
      for (let t = 0; t < ms; t += 5000) {
        mock.timers.tick(5000);
        s.ctx.pinged.set(o.ws, Date.now());
        void s.feed(walker.ws, JSON.stringify({ t: 's', x: 1, z: 1, y: 0, l: 1, yw: 0, m: false }));
      }
    };
    tick(600_000 + P.OBSERVER_EXP_GRACE_MS - 10_000);
    await s.enter({ sub: 'wake' });
    assert.equal(o.ws.closed, null, '유예 안에서는 그대로');
    tick(20_000);
    await s.enter({ sub: 'wake2' });
    assert.deepEqual(o.ws.closed, { code: P.CLOSE_STALE, reason: 'stale' }, '유예가 지나면 정리');
    assert.equal(walker.ws.closed, null, '걷는 연결은 출입증 끝으로 닫지 않는다(숨으면 끊고 새로 받는다)');
  } finally {
    mock.timers.reset();
  }
});

test('소식 없는 연결 정리: 걷는 사람은 STALE_MS, 관전자는 ping 답을 함께 보고 OBSERVER_STALE_MS', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const walker = await s.enter({ sub: 'w' });
    const quiet = await s.enter(watch('quiet'));
    const pinging = await s.enter(watch('pinging'));
    // 런타임이 ping에 답하는 동안(공간은 깨어나지 않는다)
    const tick = (ms: number) => {
      for (let t = 0; t < ms; t += 5000) {
        mock.timers.tick(5000);
        s.ctx.pinged.set(pinging.ws, Date.now());
      }
    };
    tick(P.STALE_MS + 5000);
    await s.enter({ sub: 'wake' }); // 들어옴이 정리를 부른다
    assert.deepEqual(walker.ws.closed, { code: P.CLOSE_STALE, reason: 'stale' }, '걷는 사람은 30초');
    assert.equal(quiet.ws.closed, null, '관전자는 30초로는 정리하지 않는다');
    tick(P.OBSERVER_STALE_MS);
    await s.enter({ sub: 'wake2' });
    assert.deepEqual(quiet.ws.closed, { code: P.CLOSE_STALE, reason: 'stale' }, '소식 없는 관전자는 정리');
    assert.equal(pinging.ws.closed, null, 'ping에 답을 받는 관전자는 그대로');
  } finally {
    mock.timers.reset();
  }
});

test('잠들었다 깨어나도 관전자는 관전자다(붙임표의 o), 생성자는 ping→pong 자동 답을 건다', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const a = await s.enter({ sub: 'a', name: '가나' });
    const o = await s.enter(watch('fam'));
    assert.deepEqual({ ...s.ctx.auto }, { request: P.PING, response: P.PONG });
    // 깨어난 새 공간이 붙임표에서 목록을 되살린다
    const woke = makeSpace([a.ws, o.ws]);
    assert.equal(woke.people.get(o.ws)?.o, 1);
    const b = await woke.enter({ sub: 'b' });
    assert.deepEqual((b.ws.msgs()[0].players as Array<Record<string, unknown>>).map((p) => p.n), ['가나'], '깨어난 뒤에도 목록에 관전자는 없다');
    assert.ok(o.ws.has('j', (m) => (m.p as Record<string, unknown>).id === woke.idOf(b.ws)), '깨어난 뒤에도 관전자는 소식을 받는다');
  } finally {
    mock.timers.reset();
  }
});

test('넘쳐서 끊긴 관전 연결은 관전만 잠깐 막는다(그 사람이 걷는 것은 막지 않는다)', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    const s = makeSpace();
    const o = await s.enter(watch('fam'));
    for (let i = 0; i < P.FLOOD_BURST + 5 && !o.ws.closed; i++) await s.feed(o.ws, JSON.stringify({ t: 'x', n: i }));
    assert.deepEqual(o.ws.closed, { code: P.CLOSE_FLOOD, reason: 'flood' });
    assert.equal((await s.enter(watch('fam'))).status, 429, '관전은 잠깐 막는다');
    assert.ok((await s.enter({ sub: 'fam', role: 'family' })).ws.has('hi'), '걷는 것은 막지 않는다');
  } finally {
    mock.timers.reset();
  }
});

test('공간 이름과 다음 공간: house:real → ~2 → ~3 → 없음. 방도 같다. 입구는 그 밖의 이름을 받지 않는다', () => {
  assert.equal(P.nextShard('house:real'), 'house:real~2');
  assert.equal(P.nextShard('house:real~2'), 'house:real~3');
  assert.equal(P.nextShard('house:real~3'), null);
  assert.equal(P.nextShard('room:porch'), 'room:porch~2');
  assert.equal(P.nextShard('house:fake'), null);
  for (const ok of ['house:real', 'house:real~2', 'house:real~3', 'room:ab', 'room:porch~2', 'room:porch~3']) assert.ok(P.SPACE_RE.test(ok), ok);
  for (const bad of ['house:real~1', 'house:real~4', 'house:real~10', 'house:real~', 'house:real~2~3', 'room:porch~02', 'room:a', 'house:fake~2', 'house:real ~2']) {
    assert.ok(!P.SPACE_RE.test(bad), bad);
  }
});

test(`가득 찬 공간(걷는 사람 ${P.MAX_PLAYERS}명)은 다음 사람에게 다음 공간을 알려 준다. 마지막 공간과 관전 자리는 알리지 않는다`, async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    for (const [space, to] of [['house:real', 'house:real~2'], ['house:real~2', 'house:real~3'], ['house:real~3', null], ['room:porch', 'room:porch~2']] as const) {
      const s = makeSpace([], space);
      for (let i = 0; i < P.MAX_PLAYERS; i++) assert.ok((await s.enter({ sub: `p${i}` })).ws.has('hi'));
      const late = await s.enter({ sub: 'late' });
      assert.deepEqual(late.ws.msgs(), [to ? { t: 'full', to } : { t: 'full' }], space);
      assert.deepEqual(late.ws.closed, { code: P.CLOSE_FULL, reason: 'full' });
    }
    const s = makeSpace();
    for (let i = 0; i < P.MAX_OBSERVERS; i++) await s.enter(watch(`o${i}`));
    assert.deepEqual((await s.enter(watch('over'))).ws.msgs(), [{ t: 'full' }], '관전 자리가 차면 다음 공간 없이');
  } finally {
    mock.timers.reset();
  }
});
