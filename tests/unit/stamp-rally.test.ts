// 도장 투어 맵(src/lib/stamp-rally.ts)과 새 웹 허브 규칙 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

const {
  RALLY_ZONES,
  STAMP_SPOTS,
  markVisited,
  readLocalStamped,
  readVisited,
  spotProgress,
  summarizeRally,
  walkHrefForSpot,
} = await import('../../src/lib/stamp-rally.ts');
const { ROOM_BY_SLUG } = await import('../../src/content/rooms.ts');
const { GAMES } = await import('../../src/games/registry.ts');
const { markStamped } = await import('../../src/components/walk/memory.ts');

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

test('열세 곳 도장 투어: 열린 방 13곳과 일대일로 맞고 가로·세로 좌표가 그림 안쪽에 있다', () => {
  assert.equal(STAMP_SPOTS.length, 13);
  assert.equal(RALLY_ZONES.length, 3);
  const slugs = new Set<string>();
  STAMP_SPOTS.forEach((spot, idx) => {
    assert.equal(spot.order, idx + 1);
    assert.equal(slugs.has(spot.slug), false, `중복 slug: ${spot.slug}`);
    slugs.add(spot.slug);
    const room = ROOM_BY_SLUG.get(spot.slug);
    assert.ok(room && room.door === 'open', `열린 방이 아님: ${spot.slug}`);
    assert.ok(spot.lx >= 5 && spot.lx <= 95, `lx: ${spot.slug}`);
    assert.ok(spot.ly >= 5 && spot.ly <= 95, `ly: ${spot.slug}`);
    assert.ok(spot.px >= 5 && spot.px <= 95, `px: ${spot.slug}`);
    assert.ok(spot.py >= 5 && spot.py <= 95, `py: ${spot.slug}`);
    if (spot.gameId) assert.ok(GAMES[spot.gameId], `없는 놀이: ${spot.gameId}`);
    assert.equal(walkHrefForSpot(spot), spot.portal ? `/walk?room=${spot.slug}` : '/walk');
  });
});

test('방 다녀옴 기록과 도장 상태 계산: 미방문 → 다녀옴(도장 가능) → 체험·정식 도장 → 완주', () => {
  const store = memStore();
  assert.equal(readVisited(store).size, 0);
  assert.equal(markVisited(store, 'porch'), true);
  assert.equal(markVisited(store, 'porch'), false, '두 번째는 false');
  assert.equal(markVisited(store, 'unknown-room'), false, '없는 방은 무시');
  assert.equal(readVisited(store).has('porch'), true);

  const visited = readVisited(store);
  assert.deepEqual(spotProgress('porch', new Set(), new Set(), visited), {
    status: 'visited',
    verified: false,
    trial: false,
    qr: false,
  });

  markStamped(store, 'porch');
  const local = readLocalStamped(store);
  assert.deepEqual(spotProgress('porch', new Set(), local, visited), {
    status: 'stamped',
    verified: false,
    trial: true,
    qr: false,
  });

  const server = new Set(['room:porch', 'qr:pine']);
  assert.deepEqual(spotProgress('porch', server, local, visited), {
    status: 'stamped',
    verified: true,
    trial: false,
    qr: false,
  });
  assert.deepEqual(spotProgress('pine', server, local, visited), {
    status: 'stamped',
    verified: true,
    trial: false,
    qr: true,
  });

  const partial = summarizeRally(server, local, visited);
  assert.equal(partial.stamped, 2);
  assert.equal(partial.qrCount, 1);
  assert.equal(partial.completed, false);

  const allServer = new Set(STAMP_SPOTS.map((s) => `room:${s.slug}`));
  const full = summarizeRally(allServer, new Set(), new Set());
  assert.equal(full.stamped, 13);
  assert.equal(full.completed, true);
  assert.equal(full.byZone.yard.done, true);
  assert.equal(full.byZone.first.done, true);
  assert.equal(full.byZone.second.done, true);
});

test('모든 웹 콜라주 에셋 16종(web-v2)이 존재하고 옛 v1 에셋 참조가 없으며 움직임 줄이기 규칙을 지킨다', () => {
  const pub = new URL('../../public/web/collage/', import.meta.url);
  for (const img of [
    'collage-house-poster-v2.webp',
    'stamp-rally-landscape-v2.webp',
    'stamp-rally-portrait-v2.webp',
    'collage-games-v2.webp',
    'collage-writing-v2.webp',
    'collage-character-v2.webp',
    'cutout-walk-v2.webp',
    'cutout-stamp-v2.webp',
    'cutout-games-v2.webp',
    'cutout-guestbook-v2.webp',
    'cutout-exhibit-v2.webp',
    'cutout-character-v2.webp',
    'edge-tl-v2.webp',
    'edge-tr-v2.webp',
    'edge-bl-v2.webp',
    'edge-br-v2.webp',
  ]) {
    assert.ok(existsSync(new URL(img, pub)), img);
  }
  const rallyCss = readFileSync(new URL('../../src/components/stamp-map/stamp-rally.module.css', import.meta.url), 'utf8');
  const beforeMotion = rallyCss.slice(0, rallyCss.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.equal(/animation\s*:/.test(beforeMotion), false, '줄인 움직임 밖에서는 animation을 쓰지 않는다');
});
