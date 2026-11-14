// 사진 캐릭터의 주인 확인: 겉모습을 저장하거나 서버에서 읽을 때, 사진이면 「내 그림인가」를 물어 아니면 기본 인형으로 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 가져온다: 시험에서는 .ts를 붙여 찾게 한다
const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const { ownedLook } = await import('../../src/lib/look-own.ts');
const { cleanLook, photoId, DEFAULT_DOLL } = await import('../../src/walk/look.ts');

const MINE = '0f8e2c1a-1234-4abc-9def-0123456789ab';
const THEIRS = '7a7a7a7a-0000-4000-8000-000000000002';
const photo = (id: string) => ({ kind: 'photo' as const, url: `/api/avatar/${id}` });
const DOLL = { kind: 'doll' as const, doll: { ...DEFAULT_DOLL, top: '#6b8fb5' } };
const BASE = { kind: 'doll' as const, doll: DEFAULT_DOLL };

/** 내 그림 목록만 아는 가짜 DB. 물어본 id를 적어 둔다 */
function db(mine: string[]) {
  const asked: string[] = [];
  return { asked, isMine: async (id: string) => (asked.push(id), mine.includes(id)) };
}

test('photoId: 사진이면 주소 끝의 id, 인형이면 null', () => {
  assert.equal(photoId(photo(MINE)), MINE);
  assert.equal(photoId(DOLL), null);
  assert.equal(photoId(cleanLook({ kind: 'photo', url: 'https://evil.example/x.png' })), null, '우리 주소가 아니면 인형으로 고쳐진 뒤라 id가 없다');
});

test('내 그림이면 사진 겉모습 그대로', async () => {
  const d = db([MINE]);
  assert.deepEqual(await ownedLook(photo(MINE), d.isMine, BASE), photo(MINE));
  assert.deepEqual(d.asked, [MINE]);
});

test('남의 그림(또는 지운 그림)이면 기본 인형으로 돌린다', async () => {
  const d = db([MINE]);
  assert.deepEqual(await ownedLook(photo(THEIRS), d.isMine, BASE), BASE);
  assert.deepEqual(d.asked, [THEIRS]);
});

test('인형은 묻지 않고 그대로', async () => {
  const d = db([]);
  assert.deepEqual(await ownedLook(DOLL, d.isMine, BASE), DOLL);
  assert.deepEqual(d.asked, []);
});

test('물어보다 실패하면(잠깐의 오류) 사진을 싣지 않는다', async () => {
  const boom = async () => { throw new Error('db down'); };
  assert.deepEqual(await ownedLook(photo(MINE), boom, BASE), BASE);
});

test('사진을 싣지 못해 기본 인형으로 돌려도 내가 단 칭호는 그대로 옮긴다', async () => {
  const d = db([MINE]);
  assert.deepEqual(await ownedLook({ ...photo(THEIRS), title: '집 구경 중' }, d.isMine, BASE), { ...BASE, title: '집 구경 중' });
  assert.deepEqual(await ownedLook({ ...photo(MINE), title: '집 구경 중' }, d.isMine, BASE), { ...photo(MINE), title: '집 구경 중' });
});
