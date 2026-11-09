// 걷기용 손질 검사: 원본을 바꾸지 않고, 장식은 걸리지 않고, 가구는 작아지고, 걸어서 닿는 곳은 줄지 않는다.
// 실제 집 데이터는 저장소 밖 파일이 있을 때만 같은 시험을 돈다(값은 찍지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildWorld } from '../../src/content/world.ts';
import { step, type Body, type Physics } from '../../src/walk/physics.ts';
import { DECOR, FURNITURE_AREA, PINE_TRUNK, tuneWorld } from '../../src/walk/tune.ts';
import type { Box, Furniture, HouseWorld } from '../../src/walk/types.ts';

// 실제 집 세계 파일은 공개하지 않는다. 원본 저장소는 private/test.env의 HOUSE_WORLD_JSON으로 가리키고, 없으면 그 시험만 건너뛴다.
const REAL = process.env.HOUSE_WORLD_JSON ?? '';
const G = 0.25;
const EPS = 1e-6;

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

type Rect = { x1: number; x2: number; z1: number; z2: number };
const same = (a: Rect, b: Rect) => (['x1', 'x2', 'z1', 'z2'] as const).every((k) => Math.abs(a[k] - b[k]) <= EPS);
const area = (r: Rect) => (r.x2 - r.x1) * (r.z2 - r.z1);
const centre = (r: Rect) => [(r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2];
const boxOf = (boxes: Box[], f: Furniture) => boxes.find((b) => b.level === f.level && b.tag === f.kind && same(b, f));
const isFurnitureBox = (w: HouseWorld, b: Box) => w.furniture.some((f) => f.level === b.level && f.kind === b.tag);

function checkWorld(name: string, w: HouseWorld) {
  const before = JSON.stringify(w);
  const t = tuneWorld(w);

  test(`${name}: 원본은 그대로, 새 세계를 돌려준다`, () => {
    assert.notEqual(t, w);
    assert.notEqual(t.physics.boxes, w.physics.boxes);
    assert.equal(JSON.stringify(w), before);
    assert.equal(tuneWorld(t), t, '두 번 손질해도 더 줄지 않는다');
    assert.equal(t.furniture.length, w.furniture.length);
  });

  test(`${name}: 장식에는 충돌 상자가 없다`, () => {
    for (const f of t.furniture) {
      if (!DECOR.has(f.kind)) continue;
      assert.equal(f.collide, false, `${f.kind} 충돌 표시`);
      assert.ok(!t.physics.boxes.some((b) => b.level === f.level && same(b, f) && b.tag === f.kind), `${f.kind} 상자 남음`);
    }
    assert.ok(!t.physics.boxes.some((b) => b.tag !== undefined && DECOR.has(b.tag as Furniture['kind'])), '장식 꼬리표 상자 남음');
  });

  test(`${name}: 가구 상자는 가운데 그대로 면적만 줄고, 소나무는 줄기만 막는다`, () => {
    let was = 0, now = 0;
    w.furniture.forEach((f, i) => {
      const g = t.furniture[i];
      assert.equal(g.kind, f.kind);
      if (DECOR.has(f.kind)) return;
      const [cx, cz] = centre(f);
      const [gx, gz] = centre(g);
      assert.ok(Math.abs(cx - gx) < EPS && Math.abs(cz - gz) < EPS, `${f.kind} 가운데가 움직임`);
      const ob = f.collide ? boxOf(w.physics.boxes, f) : undefined;
      // 충돌하는 가구인데 상자를 못 찾으면 줄인 그림 밑에 원래 크기 충돌이 남는다. 조용히 넘기지 않는다.
      if (f.collide) assert.ok(ob, `${f.kind}(${f.level}층) 충돌 상자를 찾지 못함`);
      if (f.kind === 'pine') {
        assert.ok(same(g, f), '소나무 그림은 그대로');
        if (!ob) return;
        const nb = t.physics.boxes.find((b) => b.level === f.level && b.tag === 'pine' && Math.abs(centre(b)[0] - cx) < EPS && Math.abs(centre(b)[1] - cz) < EPS);
        assert.ok(nb, '소나무 줄기 상자');
        assert.ok(Math.abs(nb.x2 - nb.x1 - PINE_TRUNK) < EPS && Math.abs(nb.z2 - nb.z1 - PINE_TRUNK) < EPS);
        was += area(ob);
        now += area(nb);
        return;
      }
      assert.ok(Math.abs(area(g) - area(f) * FURNITURE_AREA) < 1e-6, `${f.kind} 그림 면적`);
      if (!ob) return;
      const nb = boxOf(t.physics.boxes, g);
      assert.ok(nb, `${f.kind} 줄인 상자`);
      assert.ok(nb.x1 >= ob.x1 - EPS && nb.x2 <= ob.x2 + EPS && nb.z1 >= ob.z1 - EPS && nb.z2 <= ob.z2 + EPS, `${f.kind} 상자가 원래 안에 있음`);
      was += area(ob);
      now += area(nb);
    });
    assert.ok(was > 0, '가구 상자가 있어야 시험이 뜻이 있다');
    assert.ok(now < was, `가구 상자 면적 ${now.toFixed(2)} < ${was.toFixed(2)}`);
  });

  test(`${name}: 벽·문·기둥 상자는 손대지 않는다`, () => {
    const keep = (x: HouseWorld) => JSON.stringify(x.physics.boxes.filter((b) => !isFurnitureBox(w, b)));
    assert.equal(keep(t), keep(w));
    assert.deepEqual(t.physics.ramps, w.physics.ramps);
  });

  test(`${name}: 걸어서 닿는 칸 수가 줄지 않는다`, () => {
    const a = explore(w.physics, w.spawn);
    const b = explore(t.physics, t.spawn);
    assert.ok(a.length > 500, `원래 칸 ${a.length}`);
    assert.ok(b.length >= a.length, `손질 뒤 ${b.length} < 원래 ${a.length}`);
    const key = (c: Body) => `${c.level}:${Math.round(c.x / G)}:${Math.round(c.z / G)}`;
    const reach = new Set(b.map(key));
    assert.ok(a.every((c) => reach.has(key(c))), '원래 닿던 칸은 손질 뒤에도 닿는다');
  });
}

checkWorld('다시 그린 집', buildWorld({}));

test('다시 그린 집: 손질 뒤에도 닫힌 방에는 못 들어간다', () => {
  const cells = explore(tuneWorld(buildWorld({})).physics, buildWorld({}).spawn);
  const near = (lv: 1 | 2, x: number, z: number) => cells.some((c) => c.level === lv && Math.hypot(c.x - x, c.z - z) <= 0.3);
  for (const [lv, x, z] of [[1, -7, -9], [1, 7, -9], [1, 0, 21], [1, 0, -14], [2, -8, -8], [2, 8, -10]] as const) {
    assert.ok(!near(lv, x, z), `${lv}층 (${x}, ${z})에 들어갈 수 있음`);
  }
});

if (existsSync(REAL)) checkWorld('실제 집', JSON.parse(readFileSync(REAL, 'utf8')) as HouseWorld);
else test('실제 집: 파일이 없어 건너뜀', { skip: true }, () => {});
