// 부엌 사진 갤러리 배치(src/walk/gallery.ts) 검사: 벽 안쪽 면의 빈 구간에만, 창·문·통로·붙박이를 비켜, 눈높이에 같은 간격으로.
// 지어낸 방으로 규칙을 보고, 실제 집 JSON(HOUSE_WORLD_JSON)이 있으면 걷기 손질을 마친 실제 집도 돈다(좌표·이름은 찍지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import type { GalleryFrame, HouseWorld, Level, WallSpec } from '../../src/walk/types.ts';

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

const { FRAME_ID, GALLERY, LOOSE_NEAR, fillRun, frameLabel, frameOrder, galleryOn, galleryRooms, hangGallery, nearFrame, placeRun, pressNear } = await import('../../src/walk/gallery.ts');
const { stageHouse } = await import('../../src/walk/staging.ts');
const { tuneWorld } = await import('../../src/walk/tune.ts');
const { planDecor } = await import('../../src/walk/decor.ts');

const realPath = process.env.HOUSE_WORLD_JSON || process.env.JY_HOUSE_WORLD_JSON;
const real: HouseWorld | null = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;

type R = { x1: number; x2: number; z1: number; z2: number };
const wall = (box: R, axis: 'x' | 'z', height = 2.6, style: WallSpec['style'] = 'int1', level: 0 | 1 | 2 = 1): WallSpec =>
  ({ box: { ...box, level, tag: 'wall' }, baseY: level === 2 ? 2.9 : 0, height, style, axis });

/**
 * 지어낸 부엌(6 × 5)과 옆 거실. 벽 a(-z 쪽)에 창, 벽 b에 기대 선 책장, 벽 c는 가운데가 통로(머리벽), 벽 d에는 닫힌 문.
 * opts로 천장 높이를 바꾸거나 벽 d를 낮은 난간으로 바꾼다
 */
function kitchen(opts: { ceiling?: number; railD?: boolean; name?: string } = {}): HouseWorld {
  const t = 0.1;
  const walls: WallSpec[] = [
    wall({ x1: -t, x2: 6 + t, z1: -t, z2: t }, 'x'),
    wall({ x1: 6 - t, x2: 6 + t, z1: 0, z2: 10 }, 'z'),
    wall({ x1: -t, x2: 2, z1: 5 - t, z2: 5 + t }, 'x'),
    wall({ x1: 3.5, x2: 6, z1: 5 - t, z2: 5 + t }, 'x'),
    ...(opts.railD
      ? [wall({ x1: -t, x2: t, z1: 0, z2: 5 }, 'z', 0.9)]
      : [wall({ x1: -t, x2: t, z1: 0, z2: 3.5 }, 'z'), wall({ x1: -t, x2: t, z1: 4.4, z2: 10 }, 'z')]),
    wall({ x1: -t, x2: 6 + t, z1: 10 - t, z2: 10 + t }, 'x'),
  ];
  const headers: WallSpec[] = [{ ...wall({ x1: 2, x2: 3.5, z1: 5 - t, z2: 5 + t }, 'x', 0.5), baseY: 2.1 }];
  const door = { box: { x1: -t, x2: t, z1: 3.5, z2: 4.4, level: 1 as const, tag: 'door' }, baseY: 0, height: 2.05, style: 'wood' as const, axis: 'z' as const, closed: true, label: '닫힌 방' };
  const shelf = { kind: 'bookshelf' as const, level: 1 as const, x1: 5.5, x2: 5.9, z1: 1, z2: 2, face: '-x' as const, collide: true };
  return {
    kind: 'real', floor2: 2.9,
    house: { x1: -1, x2: 7, z1: -1, z2: 11 },
    floors: [{ level: 1, x1: 0, x2: 6, z1: 0, z2: 5, mat: 'tile' }, { level: 1, x1: 0, x2: 6, z1: 5, z2: 10, mat: 'oak' }],
    walls,
    headers,
    doors: opts.railD ? [] : [door],
    ceilings: [{ level: 1, x1: 0, x2: 6, z1: 0, z2: 10, y: opts.ceiling ?? 2.4 }],
    windows: [{ level: 1, axis: 'x', at: 0, from: 2.0, to: 3.2, sill: 0.9, top: 2.1 }],
    furniture: [shelf],
    props: [],
    zones: [
      { level: 1, x1: 0, x2: 6, z1: 0, z2: 5, name: opts.name ?? '부엌' },
      { level: 1, x1: 0, x2: 6, z1: 5, z2: 10, name: '거실' },
    ],
    hotspots: [],
    physics: {
      boxes: [...walls.map((w) => w.box), ...(opts.railD ? [] : [door.box]), { x1: shelf.x1, x2: shelf.x2, z1: shelf.z1, z2: shelf.z2, level: 1, tag: 'bookshelf' }],
      ramps: [], floor2: 2.9,
    },
    spawn: { x: 3, z: 8, yaw: 0 },
  };
}

/** 액자가 벽을 따라 차지하는 구간과 방 안쪽 방향 */
function spanOf(f: GalleryFrame) {
  const nx = Math.round(Math.sin(f.yaw)), nz = Math.round(Math.cos(f.yaw));
  const alongX = nz !== 0;
  const c = alongX ? f.x : f.z;
  return { a: c - f.w / 2, b: c + f.w / 2, alongX, nx, nz, face: alongX ? f.z : f.x };
}

/** 액자 뒤가 폭 내내 액자 위 끝보다 높은 벽인가(벽 면 바로 뒤 몇 점을 짚는다) */
function backedByWall(w: HouseWorld, f: GalleryFrame): boolean {
  const s = spanOf(f);
  const base = f.level === 2 ? w.floor2 : 0;
  const top = f.y + f.h / 2 - base;
  for (let k = 0; k <= 10; k++) {
    const u = s.a + ((s.b - s.a) * k) / 10;
    const [x, z] = s.alongX ? [u, f.z - s.nz * 0.03] : [f.x - s.nx * 0.03, u];
    const ok = w.walls.some((q) => q.style !== 'invisible' && (q.box.level === 0 || q.box.level === f.level) && q.height >= top
      && Math.abs(q.baseY - base) < 0.05 && x >= q.box.x1 - 1e-6 && x <= q.box.x2 + 1e-6 && z >= q.box.z1 - 1e-6 && z <= q.box.z2 + 1e-6);
    if (!ok) return false;
  }
  return true;
}

const SIZES = new Set(Object.values(GALLERY.sizes).map((s) => `${s.w}x${s.h}`));

test('켜기: KITCHEN_GALLERY=1·on·true·yes일 때만 건다. 없거나 다른 값이면 걸지 않는다(켜는 순간 부엌 장식이 액자로 바뀐다)', () => {
  for (const v of ['1', 'on', 'true', 'yes', ' ON ', 'True']) assert.equal(galleryOn(v), true, v);
  for (const v of [undefined, null, '', '0', 'off', 'false', 'no', '2', 'kitchen']) assert.equal(galleryOn(v), false, String(v));
});

test('한 구간 채우기: 기준 폭 셋(세로·가로가 섞임), 틈은 하한~상한, 넘치지 않는다', () => {
  for (let room = 0; room <= 9; room += 0.05) {
    const sizes = fillRun(room);
    if (room < 0.6 - 1e-9) { assert.equal(sizes.length, 0, `${room}`); continue; }
    assert.ok(sizes.length >= 1, `${room}`);
    const centers = placeRun(0, room, sizes);
    const ws = sizes.map((s) => GALLERY.sizes[s].w);
    assert.ok(centers[0] - ws[0] / 2 >= -1e-9 && centers.at(-1)! + ws.at(-1)! / 2 <= room + 1e-9, `넘침 ${room}`);
    for (let i = 1; i < centers.length; i++) {
      const gap = centers[i] - ws[i] / 2 - (centers[i - 1] + ws[i - 1] / 2);
      assert.ok(gap >= GALLERY.gapMin - 1e-9 && gap <= GALLERY.gapMax + 1e-9, `틈 ${gap} @ ${room}`);
    }
    // 좌우가 같은 줄(가운데를 두고 같은 모양)
    assert.deepEqual(sizes, [...sizes].reverse(), `대칭 ${room}`);
    // 셋 넘게 건 줄은 세로와 가로가 섞인다
    if (sizes.length >= 3) assert.ok(sizes.includes('p') && sizes.some((s) => s !== 'p'), `섞임 ${room}`);
  }
});

test('지어낸 부엌: 벽 넷의 빈 구간에만, 창·문·통로·책장을 비켜 걸고, 옆 거실에는 걸지 않는다', () => {
  const w = kitchen();
  const frames = hangGallery(w);
  assert.ok(frames.length >= 6, `액자 ${frames.length}개`);
  // 가구는 걷기 화면과 같이 손질(조금 작게)한 크기로 비킨다
  const shelf = tuneWorld(w).furniture.find((f) => f.kind === 'bookshelf')!;
  assert.deepEqual(new Set(frames.map((f) => f.room)), new Set(['부엌']));
  for (const f of frames) {
    assert.match(f.id, FRAME_ID);
    assert.ok(SIZES.has(`${f.w}x${f.h}`), `크기 ${f.w}x${f.h}`);
    assert.equal(f.y, GALLERY.centerY, '눈높이');
    assert.ok(backedByWall(w, f), `${f.id}: 액자 뒤가 벽`);
    // 방 안쪽을 본다
    const s = spanOf(f);
    const cx = 3, cz = 2.5;
    assert.ok((cx - f.x) * s.nx + (cz - f.z) * s.nz > 0, `${f.id}: 방 쪽을 본다`);
    const side = f.id.split('-')[1][0];
    if (side === 'a') assert.ok(s.b <= 2.0 - GALLERY.opening + 1e-6 || s.a >= 3.2 + GALLERY.opening - 1e-6, `${f.id}: 창을 비켰다`);
    if (side === 'b') assert.ok(s.b <= shelf.z1 - GALLERY.opening + 1e-6 || s.a >= shelf.z2 + GALLERY.opening - 1e-6, `${f.id}: 책장을 비켰다`);
    if (side === 'c') assert.ok(s.b <= 2 - GALLERY.opening + 1e-6 || s.a >= 3.5 + GALLERY.opening - 1e-6, `${f.id}: 통로를 비켰다`);
    if (side === 'd') assert.ok(s.b <= 3.5 - GALLERY.opening + 1e-6 || s.a >= 4.4 + GALLERY.opening - 1e-6, `${f.id}: 문을 비켰다`);
    // 모서리(맞닿은 벽 면)에서 띄웠다
    const lo = s.alongX ? 0.1 : 0.1, hi = s.alongX ? 5.9 : 4.9;
    assert.ok(s.a >= lo + GALLERY.corner - 1e-6 && s.b <= hi - GALLERY.corner + 1e-6, `${f.id}: 모서리에서 띄웠다`);
  }
  // 벽마다 하나 이상
  assert.deepEqual([...new Set(frames.map((f) => f.id.split('-')[1][0]))].sort(), ['a', 'b', 'c', 'd']);
  // 같은 벽의 이웃 액자는 겹치지 않고 하한보다 띄웠다
  for (const side of ['a', 'b', 'c', 'd']) {
    const mine = frames.filter((f) => f.id.split('-')[1][0] === side).map(spanOf).sort((p, q) => p.a - q.a);
    for (let i = 1; i < mine.length; i++) assert.ok(mine[i].a - mine[i - 1].b >= GALLERY.gapMin - 1e-6, `${side}벽 틈`);
  }
});

test('id는 「층-벽-순번」, 벽마다 위에서 보아 시계 방향 차례이고, 같은 집이면 늘 같다', () => {
  const w = kitchen();
  const frames = hangGallery(w);
  assert.deepEqual(hangGallery(structuredClone(w)), frames);
  assert.equal(new Set(frames.map((f) => f.id)).size, frames.length);
  const by = (side: string) => frames.filter((f) => f.id.startsWith(`1-${side}`));
  const along = (side: string, key: 'x' | 'z') => by(side).map((f) => f[key]);
  const sorted = (v: number[], dir: 1 | -1) => v.every((x, i) => i === 0 || dir * (x - v[i - 1]) > 0);
  assert.ok(sorted(along('a', 'x'), 1) && sorted(along('b', 'z'), 1) && sorted(along('c', 'x'), -1) && sorted(along('d', 'z'), -1));
  for (const side of ['a', 'b', 'c', 'd']) by(side).forEach((f, i) => assert.equal(f.id, `1-${side}-${i + 1}`));
  // 넘겨 보는 차례: 층, 벽, 순번
  const shuffled = [...frames].reverse().sort(frameOrder).map((f) => f.id);
  assert.deepEqual(shuffled, frames.map((f) => f.id));
  assert.equal(frameLabel({ id: '2-c-3', room: '방' }), '방 2-c-3');
});

test('천장이 낮으면 액자를 내려 위를 띄우고, 낮은 난간 벽에는 걸지 않는다, 부엌이 아니면 걸지 않는다', () => {
  const low = hangGallery(kitchen({ ceiling: 2.0 }));
  assert.ok(low.length > 0);
  for (const f of low) assert.ok(f.y + f.h / 2 <= 2.0 - GALLERY.topGap + 1e-6 && f.y < GALLERY.centerY && f.y - f.h / 2 >= GALLERY.minBottom - 1e-6, `${f.id} 높이`);
  // 너무 낮아 아래 장식 띠까지 내려와야 하면 걸지 않는다
  assert.equal(hangGallery(kitchen({ ceiling: 1.7 })).length, 0);
  const rail = hangGallery(kitchen({ railD: true }));
  assert.equal(rail.filter((f) => f.id.includes('-d')).length, 0, '난간 쪽 벽은 비운다');
  assert.equal(hangGallery(kitchen({ name: '거실' })).length, 0);
  assert.deepEqual(galleryRooms(kitchen({ name: '2층 주방' })).map((z) => z.name), ['2층 주방']);
});

test('액자 앞에 서면 그 액자: 방 쪽 가까이·옆으로 조금까지만, 벽 뒤·다른 층·먼 곳은 아니다', () => {
  const frames = hangGallery(kitchen());
  const f = frames.find((q) => q.id === '1-b-1')!;
  const nx = Math.sin(f.yaw), nz = Math.cos(f.yaw);
  const at = (out: number, side = 0, lv: Level = 1) => nearFrame(frames, lv, f.x + nx * out + nz * side, f.z + nz * out - nx * side);
  assert.equal(at(1.0)?.id, f.id);
  assert.equal(at(GALLERY.reach + 0.2), null);
  assert.equal(at(-0.5), null, '벽 뒤');
  assert.equal(at(1.0, 0, 2), null, '다른 층');
  assert.equal(nearFrame(undefined, 1, 0, 0), null);
  // 보는 쪽을 주면 그 액자를 보고 있을 때만(방 이야기 자리보다 앞서는 경우)
  const x = f.x + nx, z = f.z + nz;
  assert.equal(nearFrame(frames, 1, x, z, { x: -nx, z: -nz })?.id, f.id, '액자를 본다');
  assert.equal(nearFrame(frames, 1, x, z, { x: nx, z: nz }), null, '등지고 섰다');
  assert.equal(nearFrame(frames, 1, x, z, { x: nz, z: -nx }), null, '옆을 본다');
});

test('약한 가까움(휴대폰 3인칭): 벽 면에서 1m 안이고 몸이 대략 액자 쪽(앞쪽 반)을 볼 때만. 등 뒤·먼 액자는 잡지 않는다', () => {
  const frames = hangGallery(kitchen());
  const f = frames.find((q) => q.id === '1-b-1')!;
  const nx = Math.sin(f.yaw), nz = Math.cos(f.yaw);
  const at = (out: number, look: { x: number; z: number }) => nearFrame(frames, 1, f.x + nx * out, f.z + nz * out, look, LOOSE_NEAR)?.id ?? null;
  const side = { x: nz, z: -nx };
  assert.equal(at(0.8, side), f.id, '벽을 따라 걷다 멈췄다(옆을 본다)');
  assert.equal(at(0.8, { x: -nx * 0.3 + nz * 0.95, z: -nz * 0.3 - nx * 0.95 }), f.id, '조금 벽 쪽');
  assert.equal(at(0.8, { x: nx * 0.2 + nz * 0.98, z: nz * 0.2 - nx * 0.98 }), null, '조금이라도 등진 쪽');
  assert.equal(at(0.8, { x: nx, z: nz }), null, '등지고 섰다');
  assert.equal(at(GALLERY.looseReach + 0.15, side), null, '벽에서 1m 넘게');
  // 보통(바라보는) 가까움은 옆을 보면 잡지 않는다: 약한 가까움만 잡는다
  assert.equal(nearFrame(frames, 1, f.x + nx * 0.8, f.z + nz * 0.8, side), null);
});

test('E·Enter 차례: 가까운 곳 → 반려동물 → (E만) 약한 가까움. 약한 가까움은 Enter 말하기와 반려동물 부르기를 막지 않는다', () => {
  let poked = 0;
  const pet = (here: boolean) => () => { if (here) poked++; return here; };
  const spot = { weak: false }, weak = { weak: true };
  // 보통 가까움은 늘 먼저(반려동물을 부르지 않는다)
  assert.equal(pressNear('e', spot, pet(true)), 'interact');
  assert.equal(pressNear('enter', spot, pet(true)), 'interact');
  assert.equal(poked, 0);
  // 약한 가까움: 곁의 반려동물을 먼저 부른다
  assert.equal(pressNear('e', weak, pet(true)), 'poke');
  assert.equal(pressNear('enter', weak, pet(true)), 'poke');
  assert.equal(poked, 2);
  // 반려동물이 없으면 E는 액자를 열고, Enter는 열지 않는다(말하기 몫)
  assert.equal(pressNear('e', weak, pet(false)), 'interact');
  assert.equal(pressNear('enter', weak, pet(false)), null);
  // 아무것도 없으면 반려동물, 그것도 없으면 아무 일도 없다
  assert.equal(pressNear('e', null, pet(true)), 'poke');
  assert.equal(pressNear('enter', null, pet(false)), null);
});

test('걷기 손질: 기본은 걸지 않고, 켜면(gallery: true) 건다. 장식 그림·화분은 갤러리 방을 비운다', () => {
  const w = kitchen();
  assert.equal(stageHouse(structuredClone(w)).gallery, undefined, '기본은 걸지 않는다');
  const on = stageHouse(structuredClone(w), 'wedding', { gallery: true });
  assert.ok((on.gallery?.length ?? 0) > 0);
  const off = stageHouse(structuredClone(w), 'wedding', { gallery: false });
  assert.equal(off.gallery, undefined);
  const decor = planDecor(tuneWorld(on));
  const zone = on.zones.find((z) => z.name === '부엌')!;
  const inside = (x: number, z: number) => x > zone.x1 && x < zone.x2 && z > zone.z1 && z < zone.z2;
  for (const p of decor.paintings) assert.ok(!inside(p.x + Math.sin(p.yaw) * 0.3, p.z + Math.cos(p.yaw) * 0.3), '갤러리 방 쪽 장식 그림 없음');
  for (const p of decor.plants) assert.ok(!inside(p.x, p.z), '갤러리 방 화분 없음');
});

test('실제 집(있으면): 부엌 두 곳에 걸고, 모두 벽에 기대며 창·문·서로와 겹치지 않는다', { skip: !real }, () => {
  const w = stageHouse(structuredClone(real!), 'wedding', { gallery: true });
  const frames = w.gallery ?? [];
  const rooms = galleryRooms(w);
  assert.ok(rooms.length >= 2, '부엌 구역 둘');
  for (const z of rooms) {
    const n = frames.filter((f) => f.room === z.name && f.level === z.level).length;
    assert.ok(n >= 6 && n <= 20, `방마다 액자 수가 알맞다: ${n}`);
  }
  for (const f of frames) {
    assert.match(f.id, FRAME_ID);
    assert.ok(backedByWall(w, f), `${f.id}: 뒤가 액자보다 높은 벽`);
    const s = spanOf(f);
    for (const v of w.windows) {
      if (v.level !== f.level || (v.axis === 'x') !== s.alongX || Math.abs(v.at - s.face) > 0.35) continue;
      assert.ok(s.b <= v.from - GALLERY.opening + 1e-6 || s.a >= v.to + GALLERY.opening - 1e-6, `${f.id}: 창을 비켰다`);
    }
    for (const d of w.doors) {
      const b = d.box;
      if ((b.level !== 0 && b.level !== f.level) || (d.axis === 'x') !== s.alongX) continue;
      const near = s.alongX ? Math.abs((b.z1 + b.z2) / 2 - s.face) < 0.35 : Math.abs((b.x1 + b.x2) / 2 - s.face) < 0.35;
      if (!near) continue;
      const [a, c] = s.alongX ? [b.x1, b.x2] : [b.z1, b.z2];
      assert.ok(s.b <= a - GALLERY.opening + 1e-6 || s.a >= c + GALLERY.opening - 1e-6, `${f.id}: 문을 비켰다`);
    }
  }
  for (const f of frames) for (const g of frames) {
    if (f === g || f.level !== g.level || Math.abs(f.yaw - g.yaw) > 1e-3) continue;
    const p = spanOf(f), q = spanOf(g);
    if (Math.abs(p.face - q.face) > 0.05) continue;
    assert.ok(p.b <= q.a - GALLERY.gapMin + 1e-6 || q.b <= p.a - GALLERY.gapMin + 1e-6, `${f.id}·${g.id}: 겹치지 않는다`);
  }
  // 같은 집 데이터면 같은 액자들(id까지)
  assert.deepEqual(stageHouse(structuredClone(real!), 'wedding', { gallery: true }).gallery, frames);
  // 장식 그림·화분은 갤러리 방을 비운다
  const decor = planDecor(tuneWorld(w));
  const into = (lv: Level, x: number, z: number) => rooms.some((r) => r.level === lv && x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2);
  for (const p of decor.paintings) assert.ok(!into(p.level, p.x + Math.sin(p.yaw) * 0.3, p.z + Math.cos(p.yaw) * 0.3));
  for (const p of decor.plants) assert.ok(!into(p.level, p.x, p.z));
  // 갤러리 방 밖의 장식(그림 자리·그림 번호·그림등·화분)은 갤러리를 껐을 때와 똑같다
  const off = planDecor(tuneWorld(stageHouse(structuredClone(real!), 'wedding', { gallery: false })));
  const outside = <T extends { level: Level; x: number; z: number; yaw?: number }>(list: T[]) =>
    list.filter((p) => !into(p.level, p.x + Math.sin(p.yaw ?? 0) * (p.yaw === undefined ? 0 : 0.3), p.z + Math.cos(p.yaw ?? 0) * (p.yaw === undefined ? 0 : 0.3)));
  assert.deepEqual(decor.paintings, outside(off.paintings));
  assert.deepEqual(decor.pictureLights, off.pictureLights.filter((_, i) => outside([off.paintings[i]]).length === 1));
  assert.deepEqual(decor.plants, outside(off.plants));
  assert.deepEqual(decor.curtains, off.curtains);
});
