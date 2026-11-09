// 함께 걷기 서버 연기 시험. `npx wrangler dev --port 8788`로 띄운 로컬 서버에 두 손님 이상을 흉내 낸다.
//   GAME_TOKEN_SECRET=<.dev.vars와 같은 시험값> node test/smoke.mjs
// 비밀값은 환경 변수로만 받고 화면에 찍지 않는다. SMOKE_URL(기본 http://127.0.0.1:8788), SMOKE_ORIGIN(기본 http://localhost:3331).
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';

const BASE = (process.env.SMOKE_URL ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:3331';
const SECRET = process.env.GAME_TOKEN_SECRET ?? '';
if (SECRET.length < 16) {
  console.error('GAME_TOKEN_SECRET 환경 변수가 필요해요(.dev.vars와 같은 시험값).');
  process.exit(2);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function sign(payload, secret = SECRET) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
function token(sub, name = '시험 손님', over = {}) {
  return sign({ sub, name, color: '#9cc39a', role: 'guest', exp: Math.floor(Date.now() / 1000) + 600, ...over });
}
const space = (tag) => `room:smoke-${tag}-${randomBytes(3).toString('hex')}`;
const url = (sp, tok) => `${WS_BASE}/connect?space=${encodeURIComponent(sp)}&token=${encodeURIComponent(tok)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 업그레이드 요청을 직접 보내 HTTP 상태만 본다(브라우저 WebSocket은 상태 코드를 알려 주지 않으므로) */
function upgradeStatus(sp, tok, origin = ORIGIN) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${BASE}/connect`);
    u.searchParams.set('space', sp);
    u.searchParams.set('token', tok);
    const headers = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64') };
    if (origin) headers.Origin = origin;
    const req = request(u, { headers });
    req.on('upgrade', (res, sock) => {
      sock.destroy();
      resolve(res.statusCode);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

/** 손님 하나. 받은 메시지를 모두 쌓아 두고 조건이 맞을 때까지 기다릴 수 있다 */
function guest(sp, tok, origin = ORIGIN) {
  const ws = new WebSocket(url(sp, tok), { headers: { Origin: origin } });
  const g = { ws, msgs: [], id: null, closed: null };
  const waiters = new Set();
  const poke = () => {
    for (const w of waiters) if (w.check()) waiters.delete(w);
  };
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(String(e.data));
    if (m.t === 'hi') g.id = m.you;
    // 움직임 묶음은 사람별 's'로 풀어 둔다(내 것은 클라처럼 거른다)
    if (m.t === 'S' && Array.isArray(m.ps)) {
      for (const p of m.ps) if (p.id !== g.id) g.msgs.push({ t: 's', ...p });
    } else g.msgs.push(m);
    poke();
  });
  ws.addEventListener('close', (e) => {
    g.closed = { code: e.code, reason: e.reason };
    poke();
  });
  g.send = (o) => ws.send(JSON.stringify(o));
  g.wait = (pred, label, ms = 3000) =>
    new Promise((resolve, reject) => {
      const w = {
        check() {
          const hit = pred(g);
          if (hit) {
            clearTimeout(w.timer);
            resolve(hit);
          }
          return Boolean(hit);
        },
      };
      w.timer = setTimeout(() => {
        waiters.delete(w);
        reject(new Error(`기다림 시간 초과: ${label}`));
      }, ms);
      if (!w.check()) waiters.add(w);
    });
  g.find = (pred) => g.msgs.find(pred);
  g.count = (pred) => g.msgs.filter(pred).length;
  g.hi = () => g.wait((x) => x.find((m) => m.t === 'hi'), 'hi');
  return g;
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`  ok  ${name}`);
  } catch (e) {
    results.push([false, name]);
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log(`함께 걷기 연기 시험 → ${BASE}`);
const open = [];
const track = (g) => (open.push(g), g);

await check('나쁜 요청은 업그레이드 전에 거절(서명 틀림·만료·Origin·공간 이름)', async () => {
  const sp = space('deny');
  assert((await upgradeStatus(sp, token(randomUUID()))) === 101, '정상 출입증은 101');
  assert((await upgradeStatus(sp, sign({ sub: 'x', name: 'x', color: '#000000', role: 'guest', exp: 9e9 }, 'w'.repeat(32)))) === 401, '다른 키로 서명 → 401');
  const t = token('x').split('.');
  assert((await upgradeStatus(sp, `${t[0]}A.${t[1]}`)) === 401, '몸통 바꿔치기 → 401');
  assert((await upgradeStatus(sp, token('x', 'x', { exp: Math.floor(Date.now() / 1000) - 5 }))) === 401, '만료 → 401');
  assert((await upgradeStatus(sp, token('x', 'x', { role: 'visitor' }))) === 401, '손님 아닌 역할 → 401');
  assert((await upgradeStatus(sp, 'garbage')) === 401, '모양 틀림 → 401');
  assert((await upgradeStatus(sp, token('x'), 'https://evil.example')) === 403, '남의 Origin → 403');
  assert((await upgradeStatus(sp, token('x'), null)) === 403, 'Origin 없음 → 403');
  assert((await upgradeStatus('room:A', token('x'))) === 400, '공간 이름 형식 → 400');
  assert((await upgradeStatus('house:fake', token('x'))) === 400, 'house:real 말고는 → 400');
});

const sp = space('pair');
const subA = randomUUID();
const a = track(guest(sp, token(subA, '가나다')));
let b;
await check('들어오기: 나에게 hi, 남에게 j, 서로 보임', async () => {
  const hiA = await a.hi();
  assert(hiA.players.length === 0 && typeof hiA.you === 'string', 'A의 hi는 빈 목록');
  b = track(guest(sp, token(randomUUID(), '라마바')));
  const hiB = await b.hi();
  assert(hiB.players.length === 1 && hiB.players[0].id === a.id && hiB.players[0].n === '가나다', 'B는 A를 본다');
  const j = await a.wait((x) => x.find((m) => m.t === 'j'), 'A가 j를 받음');
  assert(j.p.id === b.id && j.p.n === '라마바' && j.p.c === '#9cc39a', 'A는 B를 본다');
});

await check('움직임 전달(소수 둘째 자리), 범위 밖은 버림', async () => {
  a.send({ t: 's', x: 1.23456, z: -2.0049, y: 0.5, l: 2, yw: 7, m: true });
  const s = await b.wait((x) => x.find((m) => m.t === 's'), 'B가 s를 받음');
  assert(s.id === a.id && s.x === 1.23 && s.z === -2 && s.l === 2 && s.m === true, `값 ${JSON.stringify(s)}`);
  assert(Math.abs(s.yw - 0.72) < 0.011, 'yaw는 -π~π로 감김');
  assert(!a.find((m) => m.t === 's'), '내 움직임은 나에게 돌아오지 않음');
  a.send({ t: 's', x: 1, z: 1, y: 0, l: 3, yw: 0, m: false });
  a.send({ t: 's', x: 1e6, z: 1, y: 0, l: 1, yw: 0, m: false });
  a.send({ t: 's', x: 'a', z: 1, y: 0, l: 1, yw: 0, m: false });
  await sleep(300);
  assert(b.count((m) => m.t === 's') === 1, '나쁜 상태 셋은 전달되지 않음');
});

await check('상태 속도 제한: 1초에 25번 보내면 10번까지만', async () => {
  await sleep(1100);
  const before = b.count((m) => m.t === 's');
  for (let i = 0; i < 25; i++) a.send({ t: 's', x: i, z: 0, y: 0, l: 1, yw: 0, m: true });
  await sleep(500);
  const got = b.count((m) => m.t === 's') - before;
  assert(got >= 1 && got <= 10, `받은 수 ${got}`);
});

await check('말 전달(모두에게, 제어문자 제거, 80자), 1.5초에 한 번', async () => {
  a.send({ t: 'c', text: `  안녕\u0007하세요\u202e ${'가'.repeat(100)}` });
  const cb = await b.wait((x) => x.find((m) => m.t === 'c'), 'B가 말을 받음');
  const ca = await a.wait((x) => x.find((m) => m.t === 'c'), 'A도 자기 말을 받음');
  assert(cb.id === a.id && ca.id === a.id && typeof cb.at === 'number', '말한 사람 id와 시각');
  assert(!/[\u0000-\u001f\u202e]/.test(cb.text) && cb.text.startsWith('안녕 하세요'), `제어문자 제거: ${cb.text.slice(0, 12)}`);
  assert(Array.from(cb.text).length <= 80, `길이 ${Array.from(cb.text).length}`);
  a.send({ t: 'c', text: '너무 빨라요' });
  a.send({ t: 'c', text: '   ' });
  await sleep(400);
  assert(b.count((m) => m.t === 'c') === 1, '1.5초 안의 둘째 말과 빈 말은 버림');
  await sleep(1200);
  a.send({ t: 'c', text: '이제 돼요' });
  await b.wait((x) => x.count((m) => m.t === 'c') === 2, '1.5초 뒤 말은 전달');
});

await check('같은 사람이 다시 들어오면 앞 연결을 닫음', async () => {
  const oldId = a.id;
  const a2 = track(guest(sp, token(subA, '가나다')));
  const hi = await a2.hi();
  await a.wait((x) => x.closed, 'A 앞 연결이 닫힘');
  assert(a.closed.code === 4000, `닫힘 코드 ${a.closed.code}`);
  assert(a.find((m) => m.t === 'bye' && m.why === 'replaced'), '닫기 전에 bye(replaced)를 알림');
  assert(hi.players.length === 1 && hi.players[0].id === b.id, '새 연결의 목록에는 B만');
  await b.wait((x) => x.find((m) => m.t === 'l' && m.id === oldId), 'B가 앞 연결의 l을 받음');
  await b.wait((x) => x.find((m) => m.t === 'j' && m.p.id === a2.id), 'B가 새 연결의 j를 받음');
  a2.ws.close();
  await b.wait((x) => x.find((m) => m.t === 'l' && m.id === a2.id), '나가면 l');
});

await check('아무것도 안 보낸 연결도 바뀌면 bye를 받음', async () => {
  const isp = space('idle');
  const sub = randomUUID();
  const first = track(guest(isp, token(sub)));
  await first.hi();
  const second = track(guest(isp, token(sub)));
  await second.hi();
  await first.wait((x) => x.find((m) => m.t === 'bye' && m.why === 'replaced'), '앞 연결이 bye를 받음');
});

await check('61번째는 full을 받고 닫힘', async () => {
  const fsp = space('full');
  const crowd = [];
  for (let i = 0; i < 60; i++) crowd.push(track(guest(fsp, token(randomUUID(), `손님${i}`))));
  await Promise.all(crowd.map((g) => g.hi()));
  const last = track(guest(fsp, token(randomUUID(), '늦은 손님')));
  await last.wait((x) => x.closed, '61번째 닫힘', 5000);
  assert(last.find((m) => m.t === 'full'), 'full 메시지');
  assert(last.closed.code === 4001, `닫힘 코드 ${last.closed.code}`);
  assert(!last.find((m) => m.t === 'hi'), 'hi는 받지 않음');
});

// 겉모습: 출입증의 look이 hi/j로 남에게 가고, {t:'k'}는 모두에게 알리되 10초에 한 번, 모르는 값은 기본으로 고친다
const DOLL_A = { hair: 'bob', hairColor: '#a8743f', skin: '#c99470', top: '#6b8fb5', bottom: '#ece4d6', acc: 'glasses' };
const DEF = { hair: 'short', hairColor: '#2b2420', skin: '#efcfb2', top: '#3e6b4f', bottom: '#3a3a3a', acc: 'none' };
const PHOTO = { kind: 'photo', url: '/api/avatar/0f8e2c1a-1234-4abc-9def-0123456789ab' };
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const lsp = space('look');
let la, lb, lc;
await check('겉모습: 출입증 look이 hi/j로 남에게 가고, 이상한 값은 기본 인형으로', async () => {
  la = track(guest(lsp, token(randomUUID(), '인형', { look: { kind: 'doll', doll: DOLL_A } })));
  await la.hi();
  lb = track(guest(lsp, token(randomUUID(), '사진', { look: PHOTO })));
  const hiB = await lb.hi();
  assert(same(hiB.players[0].k, { kind: 'doll', doll: DOLL_A }), `B가 본 A ${JSON.stringify(hiB.players[0].k)}`);
  const j = await la.wait((x) => x.find((m) => m.t === 'j' && m.p.id === lb.id), 'A가 B의 j');
  assert(same(j.p.k, PHOTO), `A가 본 B ${JSON.stringify(j.p.k)}`);
  lc = track(guest(lsp, token(randomUUID(), '이상', { look: { kind: 'photo', url: 'https://evil.example/x.png', doll: { hair: 'mohawk' } } })));
  await lc.hi(); // j를 내 id와 맞춰 보려면 hi가 먼저
  const jc = await la.wait((x) => x.find((m) => m.t === 'j' && m.p.id === lc.id), 'A가 C의 j');
  assert(same(jc.p.k, { kind: 'doll', doll: DEF }), `C는 기본 인형 ${JSON.stringify(jc.p.k)}`);
  const ld = track(guest(lsp, token(randomUUID(), '옛날')));
  await ld.hi();
  const jd = await la.wait((x) => x.find((m) => m.t === 'j' && m.p.id === ld.id), 'A가 D의 j');
  assert(jd.p.k === undefined, '겉모습 없는 출입증은 k 없음');
});

await check("겉모습 바꾸기 {t:'k'}: 모두에게(나 포함) 알리고, 10초 안 두 번째는 버림, 늦게 온 사람도 새 겉모습", async () => {
  const next = { kind: 'doll', doll: { ...DOLL_A, hair: 'curly', acc: 'bow' } };
  la.send({ t: 'k', look: next });
  const kb = await lb.wait((x) => x.find((m) => m.t === 'k' && m.id === la.id), 'B가 k를 받음');
  assert(same(kb.look, next), `k 값 ${JSON.stringify(kb.look)}`);
  await la.wait((x) => x.find((m) => m.t === 'k' && m.id === la.id), 'A도 자기 k를 받음');
  la.send({ t: 'k', look: { kind: 'doll', doll: { ...DOLL_A, hair: 'bun' } } });
  await sleep(400);
  assert(lb.count((m) => m.t === 'k' && m.id === la.id) === 1, '10초 안 두 번째 k는 전달되지 않음');
  const late = track(guest(lsp, token(randomUUID(), '늦게')));
  const hi = await late.hi();
  assert(same(hi.players.find((p) => p.id === la.id)?.k, next), '늦게 온 사람은 바뀐 겉모습을 본다');
});

await check("겉모습 바꾸기: 배열·문자열은 무시(제한을 쓰지 않음), 모르는 값은 기본으로 고쳐 알림", async () => {
  lc.send({ t: 'k', look: [PHOTO] });
  lc.send({ t: 'k', look: 'photo' });
  await sleep(300);
  assert(!lb.find((m) => m.t === 'k' && m.id === lc.id), '배열·문자열 k는 알리지 않음');
  lc.send({ t: 'k', look: { kind: 'doll', doll: { hair: 'mohawk', hairColor: '#ff0000', skin: 'red', top: '#6b8fb5', acc: 'crown' } } });
  const k = await lb.wait((x) => x.find((m) => m.t === 'k' && m.id === lc.id), 'B가 C의 k를 받음');
  assert(same(k.look, { kind: 'doll', doll: { ...DEF, top: '#6b8fb5' } }), `고친 값 ${JSON.stringify(k.look)}`);
});

for (const g of open) if (g.ws.readyState <= 1) g.ws.close();
await sleep(200);
const failed = results.filter(([ok]) => !ok).length;
console.log(`${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
