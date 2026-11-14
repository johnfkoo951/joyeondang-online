// 행사 초대 코드의 사이트 쪽 약속(src/lib/event-code.ts): 사람별 초대가 먼저, 0018을 올리기 전에도 지금처럼 돈다,
// 결과마다 사람이 읽는 말, 관리 화면의 입력은 DB(0018_event_codes.sql)와 같은 범위. 판정 자체는 tests/sql/event-codes.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EVENT_HOURS, EVENT_PEOPLE_DEFAULT, EVENT_PEOPLE_MAX, FLASH_WORD, asEventPeek, asEventRows, claimAnyCode, claimNote,
  eventHours, eventLabel, eventPeople, eventState, flashKey, joinLink, missingFunction,
  type ClaimOutcome, type RpcResult,
} from '../../src/lib/event-code.ts';
import { drawQr } from '../../src/lib/qr-draw.ts';

const SQL = readFileSync(new URL('../../supabase/migrations/0018_event_codes.sql', import.meta.url), 'utf8');
const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');

/** 부른 순서를 적어 두는 가짜 rpc */
function fakeRpc(answers: Record<string, RpcResult>) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push([fn, args]);
    return answers[fn] ?? { data: null, error: { code: 'PGRST202', message: 'not found' } };
  };
  return { rpc, calls };
}
const ok = (data: unknown): RpcResult => ({ data, error: null });

test('사람별 초대가 먼저고, invalid일 때만 행사 코드를 본다', async () => {
  for (const first of ['guest', 'family', 'admin', 'taken', 'already']) {
    const { rpc, calls } = fakeRpc({ claim_invite: ok(first), claim_event_code: ok('guest') });
    assert.equal(await claimAnyCode(rpc, 'ABCDEFGHJKMN'), first);
    assert.deepEqual(calls.map((c) => c[0]), ['claim_invite'], `${first}이면 행사 코드를 부르지 않는다`);
  }
  const { rpc, calls } = fakeRpc({ claim_invite: ok('invalid'), claim_event_code: ok('guest') });
  assert.equal(await claimAnyCode(rpc, 'ABCDEFGHJKMN'), 'guest');
  assert.deepEqual(calls, [['claim_invite', { p_code: 'ABCDEFGHJKMN' }], ['claim_event_code', { p_code: 'ABCDEFGHJKMN' }]]);
});

test('행사 코드의 결과를 그대로 옮긴다', async () => {
  const cases: Array<[string, ClaimOutcome]> = [
    ['guest', 'guest'], ['family', 'family'], ['admin', 'admin'], ['ended', 'ended'], ['full', 'full'],
    ['blocked', 'blocked'], ['invalid', 'invalid'], ['login_required', 'login'], ['뭔가 새것', 'invalid'],
  ];
  for (const [db, want] of cases) {
    const { rpc } = fakeRpc({ claim_invite: ok('invalid'), claim_event_code: ok(db) });
    assert.equal(await claimAnyCode(rpc, 'ABCDEFGHJKMN'), want, db);
  }
});

test('0018을 올리기 전(함수 없음)에는 지금처럼 「쓸 수 없는 코드」, 다른 실패는 「확인하지 못함」', async () => {
  const missing = fakeRpc({ claim_invite: ok('invalid') });
  assert.equal(await claimAnyCode(missing.rpc, 'ABCDEFGHJKMN'), 'invalid');
  const pg = fakeRpc({ claim_invite: ok('invalid'), claim_event_code: { data: null, error: { code: '42883' } } });
  assert.equal(await claimAnyCode(pg.rpc, 'ABCDEFGHJKMN'), 'invalid');
  const down = fakeRpc({ claim_invite: ok('invalid'), claim_event_code: { data: null, error: { code: '57014', message: 'timeout' } } });
  assert.equal(await claimAnyCode(down.rpc, 'ABCDEFGHJKMN'), 'error');
  const first = fakeRpc({ claim_invite: { data: null, error: { code: '08006' } } });
  assert.equal(await claimAnyCode(first.rpc, 'ABCDEFGHJKMN'), 'error');
  assert.deepEqual(first.calls.map((c) => c[0]), ['claim_invite'], '첫 확인이 실패하면 행사 코드로 넘어가지 않는다');
  assert.equal(missingFunction({ code: 'PGRST202' }), true);
  assert.equal(missingFunction({ code: '42501' }), false);
  assert.equal(missingFunction(null), false);
});

test('결과마다 말이 있고, 들어온 것만 ok', () => {
  const all: ClaimOutcome[] = ['guest', 'family', 'admin', 'invalid', 'taken', 'already', 'ended', 'full', 'blocked', 'login', 'error'];
  for (const o of all) {
    const note = claimNote(o);
    assert.equal(note.ok, ['guest', 'family', 'admin'].includes(o), o);
    assert.ok(note.message.length > 5, o);
    // 구글에서 돌아온 뒤에도 같은 까닭을 보여 줄 수 있다
    assert.ok(FLASH_WORD[flashKey(o)], `flash ${o}`);
  }
  assert.equal(flashKey('guest'), 'guest');
  assert.equal(flashKey('full'), 'invite_full');
  assert.match(claimNote('full').message, /자리가 다 찼어요/);
  assert.match(claimNote('ended').message, /끝났어요/);
  // 예전 결과 이름(수첩이 이미 알던 것)은 그대로
  for (const k of ['guest', 'family', 'admin', 'visitor', 'invite_invalid', 'invite_taken', 'invite_already']) assert.ok(FLASH_WORD[k], k);
  for (const v of Object.values(FLASH_WORD)) assert.ok(v.length <= 60, '쿠키 이름은 짧고 말은 한 줄');
  for (const k of Object.keys(FLASH_WORD)) assert.ok(k.length <= 32, '콜백이 쿠키 값을 32자로 자른다');
});

test('관리 화면의 입력은 DB와 같은 범위로 맞춘다', () => {
  assert.match(SQL, /max_uses int not null check \(max_uses between 1 and 500\)/);
  assert.match(SQL, /least\(greatest\(coalesce\(p_hours, 4\), 1\), 168\)/);
  assert.match(SQL, /least\(greatest\(coalesce\(p_max, 120\), 1\), 500\)/);
  assert.equal(EVENT_PEOPLE_MAX, 500);
  assert.equal(EVENT_PEOPLE_DEFAULT, 120);
  assert.ok(EVENT_HOURS.every((h) => h >= 1 && h <= 168));
  assert.equal(eventHours('6'), 6);
  assert.equal(eventHours('5'), 4, '고를 수 있는 값이 아니면 기본 네 시간');
  assert.equal(eventHours(null), 4);
  assert.equal(eventPeople('80'), 80);
  assert.equal(eventPeople('80.6'), 81);
  assert.equal(eventPeople('9999'), 500);
  assert.equal(eventPeople('0'), 120);
  assert.equal(eventPeople('-3'), 120);
  assert.equal(eventPeople('많이'), 120);
});

test('이름표: 빈칸을 하나로, 40자, 비면 한국 날짜', () => {
  const now = new Date('2026-11-11T16:30:00Z'); // 한국 시간 11월 12일 01:30
  assert.equal(eventLabel('  11월   발표 ', now), '11월 발표');
  assert.equal(eventLabel('가'.repeat(50), now), '가'.repeat(40));
  assert.equal(eventLabel('', now), '11월 12일 행사');
  assert.equal(eventLabel(null, now), '11월 12일 행사');
});

test('주소와 상태', () => {
  assert.equal(joinLink('https://example.test/', 'ABCD-EFGH-JKMN'), 'https://example.test/join?c=ABCD-EFGH-JKMN');
  const base = { expires_at: '2026-11-12T12:00:00Z', revoked_at: null, used: 3, max_uses: 10 };
  const at = new Date('2026-11-12T11:00:00Z');
  assert.equal(eventState(base, at), 'open');
  assert.equal(eventState({ ...base, used: 10 }, at), 'full');
  assert.equal(eventState(base, new Date('2026-11-12T12:00:00Z')), 'ended');
  assert.equal(eventState({ ...base, revoked_at: '2026-11-12T10:00:00Z', used: 10 }, at), 'revoked');
});

test('DB 답 모양이 이상하면 버린다', () => {
  assert.deepEqual(asEventPeek({ label: '발표', state: 'open' }), { label: '발표', state: 'open' });
  assert.equal(asEventPeek({ label: '발표', state: 'weird' }), null);
  assert.equal(asEventPeek({ label: ' ', state: 'open' }), null);
  assert.equal(asEventPeek(null), null);
  assert.equal(asEventPeek('발표'), null);
  const rows = asEventRows([
    { id: 'a', label: '발표', expires_at: '2026-11-12T12:00:00Z', max_uses: 120, used: 3, revoked_at: null, created_at: '2026-11-12T08:00:00Z', active: 3 },
    { id: 1, label: '숫자 id' },
    null,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active, 3);
  assert.deepEqual(asEventRows(null), []);
});

test('QR 그림: 같은 글이면 같은 그림, 둘레 여백 네 칸', () => {
  const a = drawQr('https://example.test/join?c=ABCD-EFGH-JKMN');
  const b = drawQr('https://example.test/join?c=ABCD-EFGH-JKMN');
  assert.deepEqual(a, b);
  assert.ok(a.size >= 21 + 8, `가장 작은 QR(21칸) + 여백(${a.size})`);
  const xs = [...a.d.matchAll(/M(\d+) (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(xs.length > 100);
  assert.ok(xs.every(([x, y]) => x >= 4 && y >= 4 && x < a.size - 4 && y < a.size - 4), '여백에는 칸이 없다');
});

test('콜백과 초대장 폼은 같은 순서(사람별 초대 → 행사 코드)로 확인한다', () => {
  for (const rel of ['app/auth/callback/route.ts', 'app/actions.ts']) {
    const s = src(rel);
    assert.match(s, /claimAnyCode\(\(fn, args\) => supabase\.rpc\(fn, args\), (invite|code)\)/, rel);
    assert.doesNotMatch(s, /rpc\('claim_invite'/, `${rel}: claim_invite를 따로 부르지 않는다`);
  }
  // 한꺼번에 몰려 인증이 막히면(429) 「잠깐 막혔어요」, 가려던 곳(next)을 들고 들어가기 화면으로
  const callback = src('app/auth/callback/route.ts');
  assert.match(callback, /retry\(error\.status === 429 \? 'busy' : 'exchange'\)/);
  assert.match(callback, /\/login\?error=\$\{why\}&next=\$\{encodeURIComponent\(next\)\}/);
  assert.match(src('app/login/page.tsx'), /busy: '들어오는 분이 한꺼번에 몰려 잠깐 막혔어요/);
  const join = src('app/join/page.tsx');
  assert.match(join, /rpc\('event_code_peek', \{ p_code: code \}\)/);
  assert.match(join, /name="next" value=\{`\/join\?c=\$\{code\}`\}/, '행사 코드는 구글에서 돌아오면 이 화면으로(「집 안 걷기」 단추)');
  assert.match(join, /href="\/walk">집 안 걷기</);
});
