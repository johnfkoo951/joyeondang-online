// 방 장면 검사: 일곱 모두 방 세계 모양, 문에서 놀이 자리·나가는 문까지 걸어서 닿고, 벽이 닫혀 방 밖으로 못 나간다.
// 다시 그린 집의 포털 일곱은 걸을 수 있는 문 앞 자리이고, 공개 묶음에 들어가는 글에는 실명·장소 이름이 없다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { ROOM_GAMES, ROOM_SCENES, TOY_SHELF, authoredFurniture, buildRoomWorld } from '../../src/content/room-worlds.ts';
import { ROOM_BY_SLUG } from '../../src/content/rooms.ts';
import { HOTSPOTS, buildWorld, nearestHotspot } from '../../src/content/world.ts';
import { gamesInRoom } from '../../src/games/registry.ts';
import { blocked, step, type Body, type Physics } from '../../src/walk/physics.ts';
import { DECOR, FURNITURE_SIDE, tuneWorld } from '../../src/walk/tune.ts';
import type { HouseWorld } from '../../src/walk/types.ts';
import { loadRules, scan } from '../../tools/privacy-tokens.mjs';

const { ALWAYS, TEXT_ONLY } = await loadRules();

const G = 0.2;

/** walk.test.ts와 같은 방식: 화면이 쓰는 step()으로 출발점에서 닿는 칸을 모두 찾는다 */
function explore(p: Physics, from: { x: number; z: number }) {
  const key = (b: Body) => `${b.level}:${Math.round(b.x / G)}:${Math.round(b.z / G)}`;
  const start: Body = { x: from.x, z: from.z, y: 0, level: 1 };
  const seen = new Map<string, Body>([[key(start), start]]);
  const queue: Body[] = [start];
  while (queue.length) {
    const b = queue.shift()!;
    for (const [dx, dz] of [[G, 0], [-G, 0], [0, G], [0, -G]]) {
      const nb = step(p, b, dx, dz);
      if (Math.abs(nb.x - (b.x + dx)) > 1e-6 || Math.abs(nb.z - (b.z + dz)) > 1e-6) continue;
      const k = key(nb);
      if (!seen.has(k)) {
        seen.set(k, nb);
        queue.push(nb);
      }
    }
  }
  return [...seen.values()];
}
const reachable = (cells: Body[], level: 1 | 2, x: number, z: number, r: number) =>
  cells.some((c) => c.level === level && Math.hypot(c.x - x, c.z - z) <= r);

const rooms = ROOM_SCENES.map((slug) => [slug, buildRoomWorld(slug)!] as const);

test('방 장면 일곱은 방 세계 모양이고 rooms.ts에 있는 방이다', () => {
  assert.deepEqual([...ROOM_SCENES].sort(), ['gable', 'garage', 'guest', 'mind', 'study', 'target', 'toybox']);
  assert.equal(buildRoomWorld('kitchen'), null);
  assert.equal(buildRoomWorld('nope'), null);
  for (const [slug, w] of rooms) {
    assert.ok(ROOM_BY_SLUG.has(slug), `${slug}가 rooms.ts에 없음`);
    assert.equal(ROOM_BY_SLUG.get(slug)?.door, 'open', `${slug} 문패 기본값`);
    assert.equal(w.kind, 'room');
    assert.equal(w.room?.slug, slug);
    assert.equal(w.portals, undefined);
    assert.equal(w.props.length, 0, '지붕·바깥 소품 없음');
    const wide = w.house.x2 - w.house.x1, deep = w.house.z2 - w.house.z1;
    assert.ok(wide >= 4.5 && wide <= 11.0 && deep >= 5 && deep <= 10.5, `${slug} 크기 ${wide}×${deep}`);
    assert.equal(w.ceilings.length >= 1, true);
    for (const c of w.ceilings) assert.ok(c.y >= 2.4 && c.y <= 3.5, `${slug} 천장 ${c.y}`);
    assert.ok(w.windows.length >= 1, `${slug} 창 없음`);
    assert.equal(w.doors.length, 1);
    assert.equal(w.doors[0].closed, true, '나가는 문은 닫힌 문짝(들어가기·나가기는 단추로)');
    assert.equal(new Set(w.hotspots.map((h) => h.id)).size, w.hotspots.length, '살피기 id 겹침');
    assert.ok(w.hotspots.filter((h) => h.kind === 'exit').length >= 1);
    for (const h of w.hotspots) assert.ok(Math.hypot(h.x - w.spawn.x, h.z - w.spawn.z) > h.r, `${slug} 들어서자마자 ${h.title}이 잡힘`);
    assert.notEqual(buildRoomWorld(slug), w, '부를 때마다 새 객체');
  }
});

test('놀이 자리는 registry의 그 방 놀이마다 하나(id·이름 그대로)', () => {
  for (const [slug, w] of rooms) {
    const games = w.hotspots.filter((h) => h.kind === 'game');
    const want = gamesInRoom(slug);
    assert.deepEqual(games.map((h) => h.game), want.map((g) => g.id), slug);
    assert.deepEqual(games.map((h) => h.title), want.map((g) => g.title), slug);
    assert.deepEqual(w.room?.games, want.map((g) => g.id));
    assert.deepEqual(ROOM_GAMES[slug].map((g) => g.blurb), want.map((g) => g.blurb), `${slug} 한 줄 설명`);
  }
});

test('박공 아래 거실은 재즈만, 좋아하는 것 방은 아이 취향 소품과 선반 놀이', () => {
  const kinds = (slug: string) => new Set(buildRoomWorld(slug)!.furniture.map((it) => it.kind));
  const gable = kinds('gable');
  for (const k of ['recordShelf', 'piano', 'doubleBass', 'musicStand'] as const) assert.ok(gable.has(k), `박공 아래 거실에 ${k} 없음`);
  for (const k of ['toyShelf', 'playMat', 'toyChest', 'blockTower', 'playTent'] as const) assert.ok(!gable.has(k), `박공 아래 거실에 ${k}`);
  const toybox = kinds('toybox');
  for (const k of ['toyShelf', 'playMat', 'toyChest', 'blockTower', 'playTent'] as const) assert.ok(toybox.has(k), `좋아하는 것 방에 ${k} 없음`);
  assert.deepEqual(buildRoomWorld('gable')!.room?.games, ['jam', 'groove', 'pitch']);
  assert.deepEqual(buildRoomWorld('toybox')!.room?.games, ['sword', 'shelf']);
});

test('문 앞에서 나가는 문과 모든 놀이 자리까지 걸어서 닿고, 벽이 닫혀 방 밖으로 못 나간다', () => {
  for (const [slug, w] of rooms) {
    for (const world of [w, tuneWorld(w)] as HouseWorld[]) {
      assert.equal(blocked(world.physics, 1, world.spawn.x, world.spawn.z), false, `${slug} 시작 자리가 막힘`);
      const cells = explore(world.physics, world.spawn);
      assert.ok(cells.length > 150, `${slug} 걸을 칸 ${cells.length}`);
      for (const h of world.hotspots) assert.ok(reachable(cells, 1, h.x, h.z, h.r), `${slug} ${h.title}에 닿지 못함`);
      const inner = { x1: w.house.x1 + 0.2, x2: w.house.x2 - 0.2, z1: w.house.z1 + 0.2, z2: w.house.z2 - 0.2 };
      const out = cells.find((c) => c.x < inner.x1 || c.x > inner.x2 || c.z < inner.z1 || c.z > inner.z2 || c.level !== 1);
      assert.equal(out, undefined, `${slug} 방 밖 칸 ${JSON.stringify(out)}`);
    }
  }
});

test('걷기 엔진 손질 뒤 가구 자리가 적어 둔 크기와 꼭 맞는다(벽에 붙인 책장·벽지·줄)', () => {
  assert.ok(Math.abs(FURNITURE_SIDE - Math.sqrt(0.8)) < 1e-12);
  for (const [slug, w] of rooms) {
    const tuned = tuneWorld(w).furniture;
    const authored = authoredFurniture(slug);
    assert.equal(tuned.length, authored.length);
    tuned.forEach((t, i) => {
      for (const k of ['x1', 'x2', 'z1', 'z2'] as const) assert.ok(Math.abs(t[k] - authored[i][k]) < 1e-9, `${slug} ${t.kind} ${k}`);
      if (DECOR.has(t.kind)) assert.equal(t.collide, false);
    });
  }
});

test('다시 그린 집의 포털 일곱: 걸을 수 있는 문 앞 자리, 그 자리에서 들어가는 문 살피기가 잡힌다', () => {
  const house = buildWorld({});
  const portals = house.portals ?? [];
  assert.equal(portals.length, 7);
  assert.deepEqual(portals.map((p) => p.slug).sort(), [...ROOM_SCENES].sort());
  const cells = explore(house.physics, house.spawn);
  for (const p of portals) {
    assert.equal(blocked(house.physics, p.level, p.x, p.z), false, `${p.slug} 포털 자리가 막힘`);
    assert.ok(reachable(cells, p.level, p.x, p.z, 0.3), `${p.slug} 포털에 걸어서 닿지 못함`);
    const near = nearestHotspot(p.level, p.x, p.z, house);
    assert.equal(near?.kind, 'portal', `${p.slug} 앞 살피기 ${near?.id}`);
    assert.equal(near?.slug, p.slug);
    assert.ok(Number.isFinite(p.yaw) && p.label.length > 0);
  }
  for (const slug of ROOM_SCENES) assert.equal(HOTSPOTS.find((h) => h.slug === slug)?.kind, 'portal', slug);
});

test('포털 문짝은 문패가 열려도 닫혀 있고(방 장면으로만 들어간다), 다른 문은 문패대로 열린다', () => {
  const open = Object.fromEntries([...ROOM_SCENES, 'atelier'].map((s) => [s, 'open' as const]));
  const house = buildWorld(open);
  for (const slug of ['study', 'target', 'mind', 'toybox', 'guest', 'garage']) assert.equal(house.doors.find((d) => d.slug === slug)?.closed, true, slug);
  assert.equal(house.doors.find((d) => d.slug === 'atelier')?.closed, false);
  const cells = explore(house.physics, house.spawn);
  assert.ok(reachable(cells, 1, -7, -3, 0.3), '열린 창이 큰 방');
  assert.ok(!reachable(cells, 1, -7, -9, 0.3), '빛이 드는 방은 문으로 걸어 들어가지 않는다');
  assert.ok(!reachable(cells, 2, -5, -2, 0.3), '새로 낸 두 문 너머(2층 앞쪽)');
  assert.ok(!reachable(cells, 2, 4, -2, 0.3), '새로 낸 두 문 너머(2층 앞쪽)');
  assert.ok(!reachable(cells, 2, 7, -2, 0.3), '좋아하는 것 방 문 너머(2층 앞쪽)');
});

test('공개 묶음 글에 실명·장소 이름·방 ID·방위가 없다', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const file of ['src/content/room-worlds.ts', 'src/content/room-exhibits.ts', 'src/content/rooms.ts', 'src/content/world.ts']) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.deepEqual(scan(src, ALWAYS), [], file);
    assert.deepEqual(scan(strip(src), TEXT_ONLY), [], file);
  }
  const data = JSON.stringify([rooms, TOY_SHELF]);
  assert.deepEqual([...scan(data, ALWAYS), ...scan(data, TEXT_ONLY)], []);
  assert.deepEqual(scan(readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'), ALWAYS), []);
});

test('가족 방 이름표: 환경 변수 배열만 읽고, 없거나 깨지면 빈 목록', async () => {
  // server-only는 서버 묶음 밖에서 가져오면 오류를 내므로, 이 시험에서만 빈 모듈로 바꿔 끼운다
  registerHooks({
    resolve: (spec, ctx, next) => (spec === 'server-only' ? { url: 'data:text/javascript,export{}', shortCircuit: true } : next(spec, ctx)),
  });
  const { loadFamilyRooms } = await import('../../src/lib/family-rooms.ts');
  assert.deepEqual(loadFamilyRooms(undefined), []);
  assert.deepEqual(loadFamilyRooms(''), []);
  assert.deepEqual(loadFamilyRooms('{"slug":"study"}'), []);
  assert.deepEqual(loadFamilyRooms('[{"slug":"study",'), []);
  const raw = JSON.stringify([
    { slug: 'study', owner: '가족', title: '가족의 방', line: '한 줄' },
    { slug: 'study', owner: '둘째', title: '겹친 방' },
    { slug: 'Bad Slug', owner: '가족', title: '방' },
    { slug: 'gable', owner: '', title: '빈 주인' },
    { slug: 'mind', owner: '셋째', title: '생각 방', line: 3 },
    'not an object',
  ]);
  assert.deepEqual(loadFamilyRooms(raw), [
    { slug: 'study', owner: '가족', title: '가족의 방', line: '한 줄' },
    { slug: 'mind', owner: '셋째', title: '생각 방' },
  ]);
});
