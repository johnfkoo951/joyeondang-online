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
  const g = { ws, msgs: [], raw: [], id: null, closed: null };
  const waiters = new Set();
  const poke = () => {
    for (const w of waiters) if (w.check()) waiters.delete(w);
  };
  ws.addEventListener('message', (e) => {
    // JSON이 아닌 글자(관전 연결의 ping에 런타임이 답한 pong)는 따로 쌓는다
    if (!String(e.data).startsWith('{')) {
      g.raw.push(String(e.data));
      poke();
      return;
    }
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
  // 넘칠 때의 다음 공간(~2, ~3)은 받고, 그 밖의 꼬리는 받지 않는다
  assert((await upgradeStatus(`${sp}~2`, token(randomUUID()))) === 101, '다음 공간 ~2 → 101');
  assert((await upgradeStatus(`${sp}~3`, token(randomUUID()))) === 101, '다음 공간 ~3 → 101');
  for (const tail of ['~1', '~4', '~', '~2~3']) assert((await upgradeStatus(`${sp}${tail}`, token('x'))) === 400, `${tail} → 400`);
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

await check('움직임은 0.1초 묶음으로: 한꺼번에 25번 보내도 몇 번만 전해지고, 마지막(가장 새) 자리가 남는다', async () => {
  await sleep(1100);
  const before = b.count((m) => m.t === 's');
  for (let i = 0; i < 25; i++) a.send({ t: 's', x: i, z: 0, y: 0, l: 1, yw: 0, m: true });
  await sleep(500);
  const got = b.msgs.filter((m) => m.t === 's').slice(before);
  assert(got.length >= 1 && got.length <= 5, `받은 수 ${got.length}`);
  assert(got[got.length - 1].x === 24, `마지막 자리 ${got[got.length - 1].x}`);
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

// 한 공간 100명(protocol.ts MAX_PLAYERS). 넘치면 같은 집의 다음 공간(~2, ~3)을 알려 준다
const MAX = 100;
/** 한 공간을 걷는 사람 MAX명으로 채운다 */
async function fill(sp) {
  const crowd = [];
  for (let i = 0; i < MAX; i++) crowd.push(track(guest(sp, token(randomUUID(), `손님${i}`))));
  await Promise.all(crowd.map((g) => g.hi()));
  return crowd;
}
await check(`${MAX + 1}번째는 full과 다음 공간(to)을 받고 닫힘, 그 공간에는 들어감. 마지막 공간(~3)은 다음 공간 없이 full`, async () => {
  const fsp = space('full');
  await fill(fsp);
  const last = track(guest(fsp, token(randomUUID(), '늦은 손님')));
  await last.wait((x) => x.closed, `${MAX + 1}번째 닫힘`, 5000);
  const full = last.find((m) => m.t === 'full');
  assert(full && full.to === `${fsp}~2`, `full 메시지 ${JSON.stringify(full)}`);
  assert(last.closed.code === 4001, `닫힘 코드 ${last.closed.code}`);
  assert(!last.find((m) => m.t === 'hi'), 'hi는 받지 않음');
  const moved = track(guest(full.to, token(randomUUID(), '늦은 손님')));
  const hi2 = await moved.hi();
  assert(hi2.players.length === 0, '다음 공간은 따로(처음 공간 사람들은 보이지 않는다)');
  // 관전자는 사람 수에 세지 않는다: 가득 찬 공간에도 들어와 모두를 받는다
  const ob = track(guest(fsp, token(randomUUID(), '관전', { role: 'observer' })));
  const hi = await ob.hi();
  assert(hi.o === 1 && hi.players.length === MAX, `관전자 hi ${hi.players.length}명`);
  // 마지막 공간
  const lastShard = `${fsp}~3`;
  await fill(lastShard);
  const over = track(guest(lastShard, token(randomUUID(), '더 늦은 손님')));
  await over.wait((x) => x.closed, '마지막 공간의 넘친 사람 닫힘', 5000);
  const full3 = over.find((m) => m.t === 'full');
  assert(full3 && full3.to === undefined, `마지막 공간은 다음 공간 없이 ${JSON.stringify(full3)}`);
});

// 관전자(출입증 role 'observer'): 남에게 보이지 않고 받기만 한다. 살아 있는지는 ping → pong(런타임이 공간을 깨우지 않고 답한다)
await check('관전자: hi(o:1)로 지금 사람들을 받고, 걷는 사람에게 보이지 않으며, 보낸 것은 버려지고, 소식은 받는다. ping에는 pong', async () => {
  const osp = space('observe');
  const pa = track(guest(osp, token(randomUUID(), '걷는 손님')));
  await pa.hi();
  pa.send({ t: 's', x: 2, z: 3, y: 0, l: 1, yw: 0, m: false });
  await sleep(250);
  const subO = randomUUID();
  const ob = track(guest(osp, token(subO, '관전', { role: 'observer' })));
  const hi = await ob.hi();
  assert(hi.o === 1, '관전자 hi에는 o: 1');
  assert(hi.players.length === 1 && hi.players[0].n === '걷는 손님' && hi.players[0].x === 2, `목록 ${JSON.stringify(hi.players)}`);
  await sleep(200);
  assert(!pa.find((m) => m.t === 'j'), '걷는 사람은 관전자의 들어옴을 받지 않음');
  ob.send({ t: 's', x: 9, z: 9, y: 0, l: 1, yw: 0, m: true });
  ob.send({ t: 'c', text: '관전자의 말' });
  ob.send({ t: 'k', look: { kind: 'doll', doll: { hair: 'bob' } } });
  await sleep(400);
  assert(pa.count((m) => m.t === 's') === 0 && !pa.find((m) => m.t === 'c' || m.t === 'k'), '관전자가 보낸 것은 전해지지 않음');
  ob.ws.send('ping');
  await ob.wait((x) => x.raw.includes('pong'), '런타임이 ping에 pong');
  pa.send({ t: 's', x: 4, z: 3, y: 0, l: 1, yw: 0, m: true });
  await ob.wait((x) => x.find((m) => m.t === 's' && m.id === pa.id && m.x === 4), '관전자가 움직임을 받음');
  await sleep(1600);
  pa.send({ t: 'c', text: '안녕하세요' });
  await ob.wait((x) => x.find((m) => m.t === 'c' && m.id === pa.id), '관전자가 말을 받음');
  // 같은 사람이 걸어 들어와도 관전 연결은 닫히지 않는다(관리자가 걸으면서 관전 화면을 띄워 둘 수 있게)
  const pw = track(guest(osp, token(subO, '관전하던 사람')));
  await pw.hi();
  await ob.wait((x) => x.find((m) => m.t === 'j' && m.p.id === pw.id), '관전자가 그 사람의 들어옴을 받음');
  assert(!ob.closed, '같은 사람이 걸어 들어와도 관전 연결은 그대로');
  const late = track(guest(osp, token(randomUUID(), '늦게')));
  const hiLate = await late.hi();
  assert(hiLate.players.length === 2 && !hiLate.players.some((p) => p.id === ob.id), '늦게 온 사람의 목록에 관전자는 없음');
  ob.ws.close();
  await sleep(300);
  assert(!pa.find((m) => m.t === 'l' && m.id === ob.id), '관전자가 나가도 나감을 알리지 않음');
});

await check('관전 연결은 공간마다 6개, 같은 사람은 3개까지(모두 살아 있으면 넘친 새 연결을 돌려보낸다)', async () => {
  const osp = space('observers');
  const sub = randomUUID();
  const mine = [];
  for (let i = 0; i < 3; i++) {
    const o = track(guest(osp, token(sub, '관전', { role: 'observer' })));
    await o.hi();
    mine.push(o);
  }
  // 켜 둔 녹화 화면을 새로 연 탭이 밀어내지 않는다: 조용한(90초 넘게 소식 없는) 연결이 없으면 새 연결이 full
  // (조용한 연결을 비우는 경우는 단위 시험이 본다. 여기서 90초를 기다리지 않는다)
  const fourth = track(guest(osp, token(sub, '관전', { role: 'observer' })));
  await fourth.wait((x) => x.closed, '같은 사람의 4번째 관전 연결 닫힘');
  assert(fourth.find((m) => m.t === 'full') && fourth.closed.code === 4001, '4번째는 full');
  await sleep(300);
  assert(!mine.some((o) => o.closed || o.find((m) => m.t === 'bye')), '앞의 셋은 그대로');
  for (let i = 0; i < 3; i++) await track(guest(osp, token(randomUUID(), '관전', { role: 'observer' }))).hi();
  const over = track(guest(osp, token(randomUUID(), '관전', { role: 'observer' })));
  await over.wait((x) => x.closed, '7번째 관전 연결 닫힘');
  assert(over.find((m) => m.t === 'full') && over.closed.code === 4001, '7번째 관전자는 full');
  await track(guest(osp, token(randomUUID(), '걷는 손님'))).hi();
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

// 사진 겉모습은 내 그림일 때만: 출입증에 실려 온 사진이거나, 사이트가 서명한 증표(p)가 맞아야 한다
const lookProof = (sub, url, exp = Math.floor(Date.now() / 1000) + 600, secret = SECRET) =>
  `${exp}.${createHmac('sha256', secret).update(`look:${sub}:${url}:${exp}`).digest('base64url')}`;
const OTHER_PHOTO = { kind: 'photo', url: '/api/avatar/7a7a7a7a-0000-4000-8000-000000000002' };
await check('사진 겉모습: 남의 그림 주소·남의 증표·지난 증표는 알리지 않고(간격도 쓰지 않음), 맞는 증표가 붙으면 바로 알린다', async () => {
  const psp = space('proof');
  const subX = randomUUID();
  const px = track(guest(psp, token(subX, '바꾸는 손님', { look: { kind: 'doll', doll: DOLL_A } })));
  await px.hi();
  const py = track(guest(psp, token(randomUUID(), '보는 손님', { look: PHOTO })));
  await py.hi();
  const seen = () => py.count((m) => m.t === 'k' && m.id === px.id);
  px.send({ t: 'k', look: OTHER_PHOTO });
  px.send({ t: 'k', look: OTHER_PHOTO, p: lookProof(randomUUID(), OTHER_PHOTO.url) });
  px.send({ t: 'k', look: OTHER_PHOTO, p: lookProof(subX, PHOTO.url) });
  px.send({ t: 'k', look: OTHER_PHOTO, p: lookProof(subX, OTHER_PHOTO.url, Math.floor(Date.now() / 1000) - 5) });
  px.send({ t: 'k', look: OTHER_PHOTO, p: lookProof(subX, OTHER_PHOTO.url, undefined, 'w'.repeat(32)) });
  px.send({ t: 'k', look: OTHER_PHOTO, p: 'garbage' });
  await sleep(400);
  assert(seen() === 0, '증표 없는·틀린 사진 겉모습은 전달되지 않음');
  const late = track(guest(psp, token(randomUUID(), '늦게')));
  const hi = await late.hi();
  assert(same(hi.players.find((p) => p.id === px.id)?.k, { kind: 'doll', doll: DOLL_A }), '거절된 뒤에도 앞 겉모습 그대로');
  // 거절은 10초 간격을 쓰지 않는다: 맞는 증표를 붙이면 바로 받는다
  px.send({ t: 'k', look: OTHER_PHOTO, p: lookProof(subX, OTHER_PHOTO.url) });
  const k = await py.wait((x) => x.find((m) => m.t === 'k' && m.id === px.id), '증표가 맞는 사진 겉모습은 전달');
  assert(same(k.look, OTHER_PHOTO), `k 값 ${JSON.stringify(k.look)}`);
  // 출입증에 실려 온 사진으로는 증표 없이(인형으로 갔다가 돌아올 수 있게)
  py.send({ t: 'k', look: PHOTO });
  const ky = await px.wait((x) => x.find((m) => m.t === 'k' && m.id === py.id), '출입증의 사진은 증표 없이 전달');
  assert(same(ky.look, PHOTO), `k 값 ${JSON.stringify(ky.look)}`);
});

await check('막혔다 풀려 몰려 온 메시지는 받아 준다: 한꺼번에 80개(10초치)를 보내도 끊기지 않는다', async () => {
  const bsp = space('burst');
  const ba = track(guest(bsp, token(randomUUID(), '몰림')));
  await ba.hi();
  const bb = track(guest(bsp, token(randomUUID(), '보는 사람')));
  await bb.hi();
  for (let i = 0; i < 80; i++) ba.send({ t: 's', x: i / 10, z: 0, y: 0, l: 1, yw: 0, m: true });
  const s = await bb.wait((x) => x.msgs.filter((m) => m.t === 's' && m.id === ba.id).pop(), '보는 사람이 움직임을 받음');
  await sleep(400);
  assert(!ba.closed, '몰려 온 80개로는 끊지 않는다');
  const last = bb.msgs.filter((m) => m.t === 's' && m.id === ba.id).pop() ?? s;
  assert(last.x === 7.9, `마지막 자리 ${last.x}`);
});

await check('너무 많이 보내는 연결은 끊음: 한꺼번에 300개면 bye(flood)를 받고 닫히고, 남에게는 나감이 간다. 곧바로는 다시 들이지 않는다. 보통 빠르기는 그대로', async () => {
  const fsp = space('flood');
  const fsub = randomUUID();
  const fa = track(guest(fsp, token(fsub, '넘침')));
  await fa.hi();
  const fb = track(guest(fsp, token(randomUUID(), '보통')));
  await fb.hi();
  // 모르는 종류의 메시지도 센다(버려지는 메시지도 서버를 깨운다)
  for (let i = 0; i < 300; i++) fa.send({ t: 'x', n: i });
  await fa.wait((x) => x.find((m) => m.t === 'bye' && m.why === 'flood'), '넘친 연결이 bye(flood)를 받음');
  await fa.wait((x) => x.closed, '넘친 연결이 닫힘');
  assert(fa.closed.code === 4003, `닫힘 코드 ${fa.closed.code}`);
  await fb.wait((x) => x.find((m) => m.t === 'l' && m.id === fa.id), '남이 나감을 받음');
  // 끊긴 사람이 곧바로 다시 오면 들이지 않는다(같은 공간, 같은 사람). 다른 사람은 들어온다
  assert((await upgradeStatus(fsp, token(fsub, '넘침'))) === 429, '끊긴 직후 다시 오면 429');
  assert((await upgradeStatus(fsp, token(randomUUID(), '다른 사람'))) === 101, '다른 사람은 101');
  // 보통 화면(초당 열 번 안팎)은 끊기지 않는다
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 10; i++) fb.send({ t: 's', x: i, z: r, y: 0, l: 1, yw: 0, m: true });
    await sleep(1050);
  }
  assert(!fb.closed, '보통 빠르기로 보낸 연결은 그대로');
});

for (const g of open) if (g.ws.readyState <= 1) g.ws.close();
await sleep(200);
const failed = results.filter(([ok]) => !ok).length;
console.log(`${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
