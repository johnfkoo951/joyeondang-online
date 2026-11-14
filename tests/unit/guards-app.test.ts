// 0014_guards.sql과 짝인 화면 쪽 순수 로직: 쪽지 한도 안내 문구, 걷기 사진 저장소에 남은 파일 가려내기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordLimitMessage, recordRoomMessage } from '../../src/lib/record-errors.ts';
import { ORPHAN_MIN_AGE_MS, orphanPaths } from '../../src/lib/shots-orphans.ts';

test('쪽지 한도 안내: 잠깐 사이 한도와 하루 한도를 다른 말로, 쉬운 한국어로 알린다', () => {
  const soon = recordLimitMessage('too_many');
  const today = recordLimitMessage('too_many_today');
  assert.equal(soon, '잠깐 사이에 많이 남겨 주셨어요. 조금 쉬었다가 다시 걸어 주세요.');
  assert.equal(today, '오늘은 많이 남겨 주셨어요. 내일 다시 걸어 주세요.');
  for (const m of [soon, today]) assert.doesNotMatch(String(m), /[A-Za-z_]/, '영어 오류 글자를 그대로 보이지 않는다');
});

test('쪽지 한도 안내: 다른 까닭이나 오류가 없을 때는 null(마이그레이션 전에는 늘 이쪽)', () => {
  for (const m of ['room_closed', 'not_on_roster', 'media_not_yours', 'new row violates row-level security policy', '', null, undefined]) {
    assert.equal(recordLimitMessage(m), null, String(m));
  }
});

test('넣기 전에 묻기: 한도에 찼으면 안내 문구, 자리가 있으면 null. record_room만 한 번 묻는다', async () => {
  const asked: string[] = [];
  const answer = (data: unknown) => ({ rpc: async (fn: string) => { asked.push(fn); return { data, error: null }; } });
  assert.equal(await recordRoomMessage(answer('ok')), null);
  assert.equal(await recordRoomMessage(answer('too_many')), '잠깐 사이에 많이 남겨 주셨어요. 조금 쉬었다가 다시 걸어 주세요.');
  assert.equal(await recordRoomMessage(answer('too_many_today')), '오늘은 많이 남겨 주셨어요. 내일 다시 걸어 주세요.');
  assert.deepEqual(asked, ['record_room', 'record_room', 'record_room']);
});

test('넣기 전에 묻기: 함수가 없거나(마이그레이션 전) 묻지 못하면 null이라 전처럼 진행한다', async () => {
  // 마이그레이션 전: 그런 함수가 없다는 오류가 온다
  const missing = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.record_room' } }) };
  assert.equal(await recordRoomMessage(missing), null);
  // 오류와 함께 온 값은 믿지 않는다
  assert.equal(await recordRoomMessage({ rpc: async () => ({ data: 'too_many', error: { message: 'x' } }) }), null);
  // 연결이 끊겨 던져도, 뜻밖의 값이 와도 막지 않는다
  assert.equal(await recordRoomMessage({ rpc: async () => { throw new Error('network'); } }), null);
  for (const data of [null, undefined, true, 0, { v: 'too_many' }, ['too_many']]) {
    assert.equal(await recordRoomMessage({ rpc: async () => ({ data, error: null }) }), null, JSON.stringify(data));
  }
});

test('넣기 전에 묻기: 쪽지 보내기는 사진을 확인하고 올리기 전에 한도부터 묻는다', () => {
  const src = readFileSync(new URL('../../src/app/actions.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function submitNote'), src.indexOf('function isBlob'));
  const ask = body.indexOf('recordRoomMessage(');
  assert.ok(ask > 0, '한도를 묻는다');
  assert.ok(ask < body.indexOf('prepareNotePhoto(') && ask < body.indexOf('storeNotePhoto('), '사진 일보다 먼저');
});

const UID = '00000000-0000-4000-8000-0000000000a1';
const NOW = Date.parse('2026-01-10T12:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

test('남은 파일: 표에 없고 올린 지 10분이 지난 내 사진만 치울 것으로 고른다', () => {
  const files = [
    { name: 'kept.jpg', created_at: at(600) },   // 표에 있다
    { name: 'orphan.jpg', created_at: at(11) },  // 표에 없고 오래됐다
    { name: 'fresh.jpg', created_at: at(2) },    // 다른 창이 지금 올리는 중일 수 있다
    { name: 'edge.jpg', created_at: new Date(NOW - ORPHAN_MIN_AGE_MS).toISOString() },
  ];
  assert.deepEqual(orphanPaths(UID, files, [`${UID}/kept.jpg`], NOW), [`${UID}/orphan.jpg`, `${UID}/edge.jpg`]);
});

test('남은 파일: 올린 때를 모르는 것, 사진이 아닌 것, 폴더는 건드리지 않는다', () => {
  const files = [
    { name: 'no-time.jpg' },
    { name: 'null-time.jpg', created_at: null },
    { name: 'bad-time.jpg', created_at: 'yesterday' },
    { name: 'folder', created_at: at(600) },
    { name: '.emptyFolderPlaceholder', created_at: at(600) },
  ];
  assert.deepEqual(orphanPaths(UID, files, [], NOW), []);
  assert.deepEqual(orphanPaths(UID, [], [], NOW), []);
});

test('남은 파일: 표에 다 있으면 아무것도 고르지 않는다(남의 폴더 경로와 섞이지 않는다)', () => {
  const files = [{ name: 'a.jpg', created_at: at(100) }, { name: 'b.jpg', created_at: at(100) }];
  assert.deepEqual(orphanPaths(UID, files, [`${UID}/a.jpg`, `${UID}/b.jpg`], NOW), []);
  // 다른 사람 폴더의 같은 이름은 내 파일을 지켜 주지 않는다
  assert.deepEqual(orphanPaths(UID, files, ['someone-else/a.jpg', `${UID}/b.jpg`], NOW), [`${UID}/a.jpg`]);
});
