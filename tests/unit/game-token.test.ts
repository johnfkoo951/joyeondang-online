// 함께 걷기 출입증: 사이트가 서명한 것을 게임 서버(game-server/src/token.ts, WebCrypto)가 그대로 받아들이는지,
// 위조·만료·모양 틀림은 양쪽 모두 거절하는지. node --test 로 바로 돈다(Node 22 타입 제거).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHmac } from 'node:crypto';

// src/lib/game-token.ts 는 'server-only'를 불러온다. 시험에서는 빈 모듈로 바꿔 끼운다.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function resolve(s, c, next) { return s === "server-only" ? { url: "data:text/javascript,", shortCircuit: true } : next(s, c); }',
    ),
);
const site = await import('../../src/lib/game-token.ts');
const server = await import('../../game-server/src/token.ts');

const SECRET = 'test-secret-for-unit-tests-only-0123456789';
const nowSec = () => Math.floor(Date.now() / 1000);
const payload = (over: Record<string, unknown> = {}) => ({
  sub: 'abc123', name: '시험 손님', color: '#9cc39a', role: 'guest' as const, exp: nowSec() + 600, ...over,
});

test('사이트가 서명한 출입증을 사이트·게임 서버 둘 다 받아들인다', async () => {
  const p = payload();
  const tok = site.signGameToken(p, SECRET);
  assert.match(tok, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(site.verifyGameToken(tok, SECRET), p);
  const r = await server.verifyToken(tok, SECRET);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.payload, p);
});

test('형식이 손으로 만든 HMAC과 같다(payload base64url 글자 위에 서명)', () => {
  const p = payload();
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  assert.equal(site.signGameToken(p, SECRET), `${body}.${sig}`);
});

test('위조는 거절: 다른 키, 몸통 바꿔치기, 서명 자르기, 모양 틀림', async () => {
  const tok = site.signGameToken(payload(), SECRET);
  const [body, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify(payload({ role: 'admin' }))).toString('base64url');
  const bad = [
    site.signGameToken(payload(), 'another-secret-another-secret'),
    `${forged}.${sig}`,
    `${body}.${sig.slice(0, 40)}`,
    `${body}.${sig}.x`,
    'garbage',
    '',
  ];
  for (const t of bad) {
    assert.equal(site.verifyGameToken(t, SECRET), null, `사이트: ${t.slice(0, 16)}`);
    const r = await server.verifyToken(t, SECRET);
    assert.equal(r.ok, false, `서버: ${t.slice(0, 16)}`);
    if (!r.ok) assert.equal(r.reason, 'bad');
  }
});

test('만료는 거절하고 서버는 까닭을 expired로 알린다', async () => {
  const tok = site.signGameToken(payload({ exp: nowSec() - 1 }), SECRET);
  assert.equal(site.verifyGameToken(tok, SECRET), null);
  const r = await server.verifyToken(tok, SECRET);
  assert.deepEqual(r, { ok: false, reason: 'expired' });
  // 10분 뒤에는 새 출입증도 만료
  const fresh = site.signGameToken(payload({ exp: nowSec() + site.GAME_TOKEN_TTL }), SECRET);
  assert.equal((await server.verifyToken(fresh, SECRET, Date.now() + 601_000)).ok, false);
});

test('손님 아닌 역할을 넣은 출입증은 서버가 받지 않는다', async () => {
  const body = Buffer.from(JSON.stringify(payload({ role: 'visitor' }))).toString('base64url');
  const tok = `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
  assert.equal((await server.verifyToken(tok, SECRET)).ok, false);
  assert.equal(site.verifyGameToken(tok, SECRET), null);
});

test('사람 구분값은 로그인 id를 감추되 같은 사람이면 같고, 이름표는 16자·제어문자 없음', () => {
  const a = site.gameSubject('00000000-0000-0000-0000-000000000001', SECRET);
  assert.equal(a, site.gameSubject('00000000-0000-0000-0000-000000000001', SECRET));
  assert.notEqual(a, site.gameSubject('00000000-0000-0000-0000-000000000002', SECRET));
  assert.doesNotMatch(a, /0000/);
  assert.equal(a.length, 22);
  assert.equal(site.gameName(null), '손님');
  assert.equal(site.gameName('  \u0007  '), '손님');
  assert.equal(Array.from(site.gameName('가'.repeat(30))).length, 16);
  assert.equal(site.gameName('달\n빛'), '달 빛');
});

test('짧은 서명 키로는 서명하지 않는다', () => {
  assert.throws(() => site.signGameToken(payload(), 'short'));
});
