// 사진 캐릭터 칸 세 개의 규칙(순수 함수): 칸에 놓기, 장수와 칸 판정, 그리기 상태의 걸린 시간·앞에 선 수.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATTEMPTS_DAILY,
  MESSAGES,
  PER_USER_DAILY,
  SLOTS,
  arrangeSlots,
  decideQuota,
  jobView,
  readQuota,
} from '../../src/lib/avatar/rules.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (min: number) => new Date(Date.UTC(2026, 10, 11, 9, min)).toISOString();

test('칸 수는 DB(0019)와 같다', () => {
  assert.equal(SLOTS, 3);
  const sql = readFileSync(new URL('../../supabase/migrations/0019_avatar_slots.sql', import.meta.url), 'utf8');
  assert.match(sql, new RegExp(`'slots', ${SLOTS}`));
  assert.match(sql, new RegExp(`\\(v_q ->> 'kept'\\)::int >= ${SLOTS}`));
  assert.match(sql, new RegExp(`slot between 1 and ${SLOTS}`));
  assert.match(sql, new RegExp(`'per_user', ${PER_USER_DAILY}`));
  assert.match(sql, new RegExp(`'attempts_max', ${ATTEMPTS_DAILY}`));
});

test('칸 번호대로 놓고, 빈 칸은 null', () => {
  const layout = arrangeSlots([
    { id: id(1), status: 'ready', slot: 3, created_at: at(1) },
    { id: id(2), status: 'drawing', slot: 1, created_at: at(2) },
  ]);
  assert.deepEqual(layout.cells, [
    { id: id(2), status: 'drawing', since: at(2) },
    null,
    { id: id(1), status: 'ready', since: at(1) },
  ]);
  assert.deepEqual(layout.extra, []);
});

test('번호가 없으면(0019 전) 만든 차례대로 빈 칸을 채우고, 넘치면 extra', () => {
  const layout = arrangeSlots([
    { id: id(4), status: 'ready', created_at: at(4) },
    { id: id(1), status: 'ready', created_at: at(1) },
    { id: id(3), status: 'pending', created_at: at(3) },
    { id: id(2), status: 'ready', slot: 2, created_at: at(2) },
    { id: id(5), status: 'queued', created_at: at(5) },
  ]);
  assert.deepEqual(layout.cells.map((c) => c?.id), [id(1), id(2), id(3)]);
  assert.equal(layout.cells[2]?.status, 'queued', 'pending은 차례를 기다리는 것으로 본다');
  assert.deepEqual(layout.extra.map((c) => c.id), [id(4), id(5)]);
});

test('보관 중이 아닌 줄, 모양이 이상한 줄, 같은 번호의 둘째는 칸에 넣지 않거나 빈 칸으로 옮긴다', () => {
  const layout = arrangeSlots([
    { id: id(1), status: 'deleted', slot: 1, created_at: at(1) },
    { id: id(2), status: 'failed', slot: 2, created_at: at(2) },
    { id: 'not-a-uuid', status: 'ready', slot: 1, created_at: at(3) },
    { id: id(4), status: 'ready', slot: 9, created_at: at(4) },
    { id: id(5), status: 'ready', slot: 1, created_at: at(5) },
    { id: id(6), status: 'ready', slot: 1, created_at: at(6) },
  ]);
  assert.deepEqual(layout.cells.map((c) => c?.id ?? null), [id(5), id(4), id(6)]);
  assert.deepEqual(arrangeSlots(null), { cells: [null, null, null], extra: [] });
  assert.deepEqual(arrangeSlots('x').cells.length, SLOTS);
});

test('장수 판정: 하루 규칙이 먼저, 그다음 칸', () => {
  assert.deepEqual(decideQuota({ used: 0, attempts: 0, total: 0, kept: 2 }, 150), { ok: true, left: 3 });
  const full = decideQuota({ used: 1, attempts: 1, total: 1, kept: 3 }, 150);
  // 칸이 다 찬 것만으로는 오늘 장수가 줄지 않는다: 칸을 비우면 만들 수 있는 장수를 함께 싣는다
  assert.deepEqual(full, { ok: false, reason: 'slots_full', message: MESSAGES.slotsFull, left: 2 });
  const day = decideQuota({ used: 3, attempts: 3, total: 3, kept: 3 }, 150);
  assert.equal(!day.ok && day.reason, 'user_limit', '오늘 다 만들었으면 칸을 비우라고 하지 않는다');
  const all = decideQuota({ used: 0, attempts: 0, total: 150, kept: 3 }, 150);
  assert.equal(!all.ok && all.reason, 'total_limit');
  // 0019 전의 DB(kept가 없음): 칸은 묻지 않는다
  assert.deepEqual(decideQuota({ used: 0, attempts: 0, total: 0 }, 150), { ok: true, left: 3 });
});

test('장수 읽기: kept는 올 때만 싣고, 모양이 이상하면 가득 찬 것으로 본다', () => {
  assert.deepEqual(readQuota({ used: 1, attempts: 2, total: 3 }), { used: 1, attempts: 2, total: 3 });
  assert.deepEqual(readQuota({ used: 1, attempts: 2, total: 3, kept: 2 }), { used: 1, attempts: 2, total: 3, kept: 2 });
  assert.deepEqual(readQuota({ used: 1, attempts: 2, total: 3, kept: null }), { used: 1, attempts: 2, total: 3 });
  assert.equal(decideQuota(readQuota({ used: 0, attempts: 0, total: 0, kept: 'x' }), 150).ok, false);
});

test('칸이 다 찼다는 안내에 긴 줄표가 없고 짧다', () => {
  assert.equal(/[—–]/.test(MESSAGES.slotsFull), false);
  assert.ok(MESSAGES.slotsFull.length <= 60);
});

test('그리기 상태에 보낸 때와 앞에 선 수를 싣는다(있을 때만)', () => {
  const ID = id(7);
  const now = Date.parse('2026-11-11T10:00:00Z');
  const seen = new Date(now - 1000).toISOString();
  const v = jobView({ status: 'queued', worker_seen_at: seen, created_at: '2026-11-11T09:59:00+00:00', ahead: 4 }, ID, now, 600_000);
  assert.deepEqual(v, { status: 'queued', message: MESSAGES.queued, since: '2026-11-11T09:59:00.000Z', ahead: 4 });
  const d = jobView({ status: 'drawing', worker_seen_at: seen, created_at: 'nope', ahead: -1 }, ID, now, 600_000);
  assert.deepEqual(d, { status: 'drawing', message: MESSAGES.drawing });
  // 다 그렸거나 못 그렸으면 싣지 않는다(지금처럼)
  assert.deepEqual(jobView({ status: 'ready', created_at: '2026-11-11T09:59:00Z', ahead: 0 }, ID, now, 600_000), { status: 'ready', url: `/api/avatar/${ID}` });
});
