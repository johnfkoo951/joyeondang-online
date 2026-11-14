// 없는 방·전시 이름을 쪽이 그려지기 전에 가려내는 판정(src/lib/known-path.ts)을 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

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

const { NO_DOOR_PATH, missingDoor } = await import('../../src/lib/known-path.ts');
const { ROOMS } = await import('../../src/content/rooms.ts');
const { EXHIBIT_SECTIONS } = await import('../../src/content/exhibit-sections.ts');

test('있는 방·전시 이름은 그대로 지나간다(끝 빗금이 붙어도)', () => {
  assert.ok(ROOMS.length > 0 && EXHIBIT_SECTIONS.length > 0);
  for (const r of ROOMS) {
    assert.equal(missingDoor(`/room/${r.slug}`), false, r.slug);
    assert.equal(missingDoor(`/room/${r.slug}/`), false, `${r.slug}/`);
  }
  for (const s of EXHIBIT_SECTIONS) assert.equal(missingDoor(`/exhibit/${s.slug}`), false, s.slug);
});

test('없는 이름, 방과 전시가 뒤바뀐 이름, 풀 수 없는 글자는 걸러 낸다', () => {
  assert.equal(missingDoor('/room/no-such-room'), true);
  assert.equal(missingDoor('/exhibit/no-such-section'), true);
  assert.equal(missingDoor('/room/%EC%97%86%EB%8A%94%EB%B0%A9'), true);
  assert.equal(missingDoor('/room/%E0%A4%A'), true, '깨진 % 글자');
  // 전시 이름을 방 주소에, 방 이름을 전시 주소에 넣으면 없다(둘이 겹치지 않는 이름일 때)
  const onlyRoom = ROOMS.find((r) => !EXHIBIT_SECTIONS.some((s) => s.slug === r.slug));
  const onlySection = EXHIBIT_SECTIONS.find((s) => !ROOMS.some((r) => r.slug === s.slug));
  if (onlyRoom) assert.equal(missingDoor(`/exhibit/${onlyRoom.slug}`), true);
  if (onlySection) assert.equal(missingDoor(`/room/${onlySection.slug}`), true);
  // 대소문자는 다른 이름이다(쪽도 그렇게 찾는다)
  assert.equal(missingDoor(`/room/${ROOMS[0].slug.toUpperCase()}`), ROOMS[0].slug.toUpperCase() !== ROOMS[0].slug);
});

test('다른 주소는 건드리지 않는다', () => {
  for (const p of ['/', '/room', '/room/', '/exhibit', '/walk', '/map', '/api/house', '/rooms/x', '/room/a/b', '/exhibit/a/b', '/q/room/code', '/_next/static/x.js']) {
    assert.equal(missingDoor(p), false, p);
  }
});

test('대신 그릴 주소는 어느 쪽과도 맞지 않는다', () => {
  assert.equal(missingDoor(NO_DOOR_PATH), false);
  assert.match(NO_DOOR_PATH, /^\/_[a-z-]+$/);
});

test('글씨 전시는 독립 경로이며 비슷한 잘못된 이름은 여전히 막는다', () => {
  assert.equal(missingDoor('/exhibit/lettering'), false);
  assert.equal(missingDoor('/exhibit/lettering/'), false);
  assert.equal(missingDoor('/exhibit/lettering-extra'), true);
  assert.equal(missingDoor('/exhibit/LETTERING'), true);
  assert.equal(missingDoor('/room/lettering'), true);
});
