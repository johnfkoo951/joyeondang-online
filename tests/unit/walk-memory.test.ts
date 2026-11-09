// 걷기 화면의 기기 기억(자리·방·도장)과 글자 도우미 시험.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEEP_MS, POS_KEY, ROOM_KEY, aboutSeconds, clearRoom, formatMs, hrefWithRoom, markStamped, parsePos, readPos, readRoom,
  roomFromSearch, startRoom, withRo, writePos, writeRoom,
} from '../../src/components/walk/memory.ts';

function store() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test('자리: 쓰고 읽으면 그대로, 12시간 지나면 버림', () => {
  const s = store();
  const now = 1_700_000_000_000;
  writePos(s, 'redrawn', { x: 1.23456, z: -2, y: 0.1, level: 2, yaw: 3.1, view: 'third' }, now);
  assert.ok(s.m.has(POS_KEY('redrawn')));
  const p = readPos(s, 'redrawn', now + 1000);
  assert.deepEqual(p, { x: 1.235, z: -2, y: 0.1, level: 2, yaw: 3.1, view: 'third', t: now });
  assert.equal(readPos(s, 'redrawn', now + KEEP_MS + 1), null);
  assert.equal(readPos(s, 'real', now), null);
});

test('자리: 깨진 값·이상한 층·미래 시각은 버림', () => {
  const now = 1_700_000_000_000;
  assert.equal(parsePos('{', now), null);
  assert.equal(parsePos('[1,2]', now), null);
  assert.equal(parsePos(JSON.stringify({ x: 1, z: 1, yaw: 0, level: 3, t: now }), now), null);
  assert.equal(parsePos(JSON.stringify({ x: 'a', z: 1, yaw: 0, level: 1, t: now }), now), null);
  assert.equal(parsePos(JSON.stringify({ x: 1, z: 1, yaw: 0, level: 1, t: now + 3_600_000 }), now), null);
  assert.equal(parsePos(JSON.stringify({ x: 1, z: 1, yaw: 0, level: 1, t: now }), now)?.view, 'first');
});

test('저장소가 던져도 걷기는 계속', () => {
  const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(readPos(bad, 'redrawn'), null);
  assert.doesNotThrow(() => writePos(bad, 'redrawn', { x: 0, z: 0, y: 0, level: 1, yaw: 0, view: 'first' }));
  assert.equal(readRoom(bad), null);
  assert.doesNotThrow(() => clearRoom(bad));
  assert.equal(markStamped(bad, 'study'), false);
});

test('방 기억과 주소', () => {
  const s = store();
  const now = 1_700_000_000_000;
  writeRoom(s, 'study', now);
  assert.deepEqual(readRoom(s, now + 5), { slug: 'study', t: now });
  clearRoom(s);
  assert.equal(s.m.has(ROOM_KEY), false);
  assert.equal(roomFromSearch('?room=study'), 'study');
  assert.equal(roomFromSearch('?room=../x'), null);
  assert.equal(roomFromSearch(''), null);
  assert.equal(hrefWithRoom('https://a.test/walk?x=1#h', 'mind'), '/walk?x=1&room=mind#h');
  assert.equal(hrefWithRoom('https://a.test/walk?room=mind', null), '/walk');
});

test('처음 열 방: 주소가 먼저, 열 수 없으면 집', () => {
  const open = (s: string) => s === 'study' || s === 'gable';
  const saved = { slug: 'gable', t: 0 };
  assert.equal(startRoom('study', saved, open), 'study');
  assert.equal(startRoom('attic', saved, open), null);
  assert.equal(startRoom(null, saved, open), 'gable');
  assert.equal(startRoom(null, { slug: 'attic', t: 0 }, open), null);
  assert.equal(startRoom(null, null, open), null);
});

test('도장은 방마다 처음 한 번만 알림', () => {
  const s = store();
  assert.equal(markStamped(s, 'study'), true);
  assert.equal(markStamped(s, 'study'), false);
  assert.equal(markStamped(s, 'mind'), true);
});

test('로/으로, 시간 글자', () => {
  assert.equal(withRo('빛이 드는 방'), '빛이 드는 방으로');
  assert.equal(withRo('박공 아래 거실'), '박공 아래 거실로');
  assert.equal(withRo('현관'), '현관으로');
  assert.equal(withRo('석등'), '석등으로');
  assert.equal(withRo('2층으로'), '2층으로');
  assert.equal(withRo('앞마당 소나무'), '앞마당 소나무로');
  assert.equal(formatMs(42_400), '42초');
  assert.equal(formatMs(65_000), '1분 5초');
  assert.equal(formatMs(120_000), '2분');
  assert.equal(aboutSeconds(90), '2분 안팎');
  assert.equal(aboutSeconds(30), '30초 안팎');
});
