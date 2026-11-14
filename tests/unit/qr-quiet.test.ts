// 현장 QR 표식의 시간 창·주소·상태, 조용 모드 응답 읽기. 순수 함수만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODE_ALPHABET, makeCode, normalizeCode } from '../../src/lib/code.ts';
import {
  QR_CODE, QR_EVENT_DAY_DEFAULT, eventWindow, formatWindow, qrEventDay, qrPath, qrState, qrUrl, testWindow,
} from '../../src/lib/qr.ts';
import { isQuietAt, readSite } from '../../src/components/useSiteState.ts';

test('행사 날: 환경 변수가 없거나 이상하면 기본값, 한국 시간 하루', () => {
  assert.equal(qrEventDay(undefined), QR_EVENT_DAY_DEFAULT);
  assert.equal(qrEventDay(''), QR_EVENT_DAY_DEFAULT);
  assert.equal(qrEventDay('2026-13-40'), QR_EVENT_DAY_DEFAULT);
  assert.equal(qrEventDay('2026-02-30'), QR_EVENT_DAY_DEFAULT, '없는 날');
  assert.equal(qrEventDay(' 2026-12-05 '), '2026-12-05');
  const w = eventWindow('2026-11-28');
  assert.equal(w.from.toISOString(), '2026-11-27T15:00:00.000Z', '한국 시간 0시');
  assert.equal(w.until.getTime() - w.from.getTime(), 24 * 3600 * 1000);
  const now = new Date('2026-11-10T03:00:00Z');
  const t = testWindow(now);
  assert.equal(t.from.getTime(), now.getTime());
  assert.equal(t.until.getTime() - t.from.getTime(), 24 * 3600 * 1000);
});

test('표식 코드: makeCode 12자를 정규화하면 DB 제약 모양, 주소에는 방과 코드만', () => {
  for (let i = 0; i < 100; i++) {
    const code = normalizeCode(makeCode(3, 4));
    assert.match(code, QR_CODE);
    assert.equal(code.length, 12);
    assert.ok([...code].every((c) => CODE_ALPHABET.includes(c)));
  }
  assert.equal(qrPath('porch', 'ABCDEFGHJKMN'), '/q/porch/ABCDEFGHJKMN');
  assert.equal(qrUrl('https://example.test/', 'pine', 'ABCDEFGHJKMN'), 'https://example.test/q/pine/ABCDEFGHJKMN');
  assert.equal(QR_CODE.test('abc-def'), false);
  const sql = readFileSync(new URL('../../supabase/migrations/0010_qr_quiet.sql', import.meta.url), 'utf8');
  assert.match(sql, /code ~ '\^\[A-Z0-9\]\{8,24\}\$'/, 'DB 제약과 같은 모양');
});

test('표식 상태: 거둠 > 아직 > 지남 > 지금', () => {
  const m = { valid_from: '2026-11-27T15:00:00Z', valid_until: '2026-11-28T15:00:00Z', revoked_at: null };
  assert.equal(qrState(m, new Date('2026-11-27T14:59:59Z')), 'soon');
  assert.equal(qrState(m, new Date('2026-11-27T15:00:00Z')), 'live');
  assert.equal(qrState(m, new Date('2026-11-28T15:00:00Z')), 'past');
  assert.equal(qrState({ ...m, revoked_at: '2026-11-20T00:00:00Z' }, new Date('2026-11-28T00:00:00Z')), 'revoked');
  assert.match(formatWindow(m.valid_from, m.valid_until), /11\. 28\. 00:00 ~ 11\. 29\. 00:00/);
});

test('조용 모드 응답: 모양이 이상하거나 끝난 시각이면 조용하지 않음', () => {
  const later = new Date(Date.now() + 10 * 60_000).toISOString();
  const earlier = new Date(Date.now() - 60_000).toISOString();
  assert.deepEqual(readSite({ quiet: true, until: later, claps: 7 }), { quiet: true, until: later, claps: 7 });
  assert.equal(readSite({ quiet: true, until: earlier, claps: 1 }).quiet, false, '끝난 시각');
  assert.equal(readSite({ quiet: true, until: null }).quiet, false, '끝나는 때가 없으면');
  assert.deepEqual(readSite(null), { quiet: false, until: null, claps: 0 });
  assert.deepEqual(readSite({ quiet: 'yes', until: 'tomorrow', claps: -3 }), { quiet: false, until: null, claps: 0 });
});

test('조용 모드인가: 끝나는 때가 지나면 서버에 다시 묻기 전에도 조용하지 않다', () => {
  const now = Date.parse('2026-11-28T05:00:00Z');
  const until = new Date(now + 60_000).toISOString();
  assert.equal(isQuietAt({ quiet: true, until }, now), true);
  assert.equal(isQuietAt({ quiet: true, until }, now + 59_000), true);
  assert.equal(isQuietAt({ quiet: true, until }, now + 60_000), false, '끝나는 바로 그때');
  assert.equal(isQuietAt({ quiet: true, until }, now + 5 * 60_000), false, '마지막 답이 조용이어도 시각이 지났으면');
  assert.equal(isQuietAt({ quiet: false, until }, now), false);
  assert.equal(isQuietAt({ quiet: true, until: null }, now), false);
});
