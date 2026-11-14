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

test('관전 출입증(역할 observer)도 사이트·게임 서버 둘 다 받아들인다', async () => {
  const p = payload({ role: 'observer' as const });
  const tok = site.signGameToken(p, SECRET);
  assert.deepEqual(site.verifyGameToken(tok, SECRET), p);
  const r = await server.verifyToken(tok, SECRET);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.payload.role, 'observer');
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

const URL_A = '/api/avatar/0f8e2c1a-1234-4abc-9def-0123456789ab';
const URL_B = '/api/avatar/7a7a7a7a-0000-4000-8000-000000000002';

test('사진 겉모습 증표: 사이트가 서명한 것을 게임 서버가 받아들이고, 형식은 손으로 만든 HMAC과 같다', async () => {
  const exp = nowSec() + 600;
  const proof = site.signLookProof('sub-a', URL_A, exp, SECRET);
  assert.match(proof, /^\d{10}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(proof, `${exp}.${createHmac('sha256', SECRET).update(`look:sub-a:${URL_A}:${exp}`).digest('base64url')}`);
  assert.equal(await server.verifyLookProof(proof, 'sub-a', URL_A, SECRET), true);
  assert.throws(() => site.signLookProof('sub-a', URL_A, exp, 'short'));
});

test('사진 겉모습 증표: 다른 사람·다른 그림·다른 키·지난 것·모양 틀린 것은 거절', async () => {
  const exp = nowSec() + 600;
  const proof = site.signLookProof('sub-a', URL_A, exp, SECRET);
  assert.equal(await server.verifyLookProof(proof, 'sub-b', URL_A, SECRET), false, '남에게 준 증표');
  assert.equal(await server.verifyLookProof(proof, 'sub-a', URL_B, SECRET), false, '다른 그림');
  assert.equal(await server.verifyLookProof(proof, 'sub-a', URL_A, 'another-secret-another-secret'), false, '다른 키');
  assert.equal(await server.verifyLookProof(proof, 'sub-a', URL_A, SECRET, (exp + 1) * 1000), false, '지난 증표');
  // 만료를 늘려 적으면 서명이 맞지 않는다
  assert.equal(await server.verifyLookProof(`${exp + 600}.${proof.split('.')[1]}`, 'sub-a', URL_A, SECRET), false);
  for (const junk of [undefined, null, 3, {}, '', 'garbage', `${exp}`, `${exp}.short`, `0${exp}.${proof.split('.')[1]}`, 'x'.repeat(200)]) {
    assert.equal(await server.verifyLookProof(junk, 'sub-a', URL_A, SECRET), false, `모양: ${String(junk).slice(0, 12)}`);
  }
  assert.equal(await server.verifyLookProof(proof, 'sub-a', URL_A, ''), false, '키가 없는 서버');
});

test('사진 겉모습을 받는 조건: 출입증에 실려 온 그 사진이거나 증표가 맞을 때만', async () => {
  const proof = site.signLookProof('sub-a', URL_A, nowSec() + 600, SECRET);
  // 출입증의 사진으로는 증표 없이
  assert.equal(await server.photoAllowed(URL_A, URL_A, undefined, 'sub-a', SECRET), true);
  // 출입증에는 인형(또는 다른 사진)이 실려 있어도 증표가 맞으면
  assert.equal(await server.photoAllowed(URL_A, undefined, proof, 'sub-a', SECRET), true);
  assert.equal(await server.photoAllowed(URL_A, URL_B, proof, 'sub-a', SECRET), true);
  // 남의 그림 주소를 그냥 보내거나, 남의 증표를 붙이면 받지 않는다
  assert.equal(await server.photoAllowed(URL_B, URL_A, undefined, 'sub-a', SECRET), false);
  assert.equal(await server.photoAllowed(URL_B, undefined, proof, 'sub-a', SECRET), false);
  assert.equal(await server.photoAllowed(URL_A, undefined, proof, 'sub-b', SECRET), false);
});
