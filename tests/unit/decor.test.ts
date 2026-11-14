// 집 꾸미기 자리(decor.ts) 검사: 장식은 집 데이터를 바꾸지 않고 충돌도 만들지 않으며, 걷는 길·문·계단을 막지 않는다(물리 시험).
// 다시 그린 집, 걷기용으로 손질한 집, 그리고 실제 집 JSON(HOUSE_WORLD_JSON)이 있으면 그것도 돈다(좌표·이름은 찍지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import type { HouseWorld } from '../../src/walk/types.ts';

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

const { buildWorld } = await import('../../src/content/world.ts');
const { stageHouse } = await import('../../src/walk/staging.ts');
const { tuneWorld } = await import('../../src/walk/tune.ts');
const { destinations, findPath } = await import('../../src/walk/nav.ts');
const { DECOR_SIZE, HUNG, indoorAt, interiorSides, openFloors, planDecor } = await import('../../src/walk/decor.ts');

// 가구를 실제로 지어 보기 위한 가짜 캔버스(node에는 문서가 없다): 그리기 호출은 모두 그냥 지나간다
const fakeCtx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} })
      : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}),
  set: () => true,
});
const g = globalThis as unknown as { document?: unknown };
g.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeCtx }) };
const THREE = await import('three');
const { buildFurniture, makeFurnitureMats } = await import('../../src/walk/furnish.ts');

const realPath = process.env.HOUSE_WORLD_JSON || process.env.JY_HOUSE_WORLD_JSON;
const real: HouseWorld | null = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;
const asReal = (): HouseWorld => ({ ...structuredClone(buildWorld({})), kind: 'real' });
const worlds: Array<[string, () => HouseWorld]> = [
  ['다시 그린 집', () => tuneWorld(buildWorld({}))],
  ['손질한 집(다시 그린 집을 실제 꼴로)', () => tuneWorld(stageHouse(asReal(), 'wedding'))],
  ...(real ? [['실제 집(손질)', () => tuneWorld(stageHouse(structuredClone(real), 'wedding'))] as [string, () => HouseWorld]] : []),
];

type Rect = { x1: number; x2: number; z1: number; z2: number };
const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.x1 - pad && x < r.x2 + pad && z > r.z1 - pad && z < r.z2 + pad;
/** 점에서 선분까지 거리 */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/** 점에서 사각형까지 거리(안이면 0) */
const rectDist = (r: Rect, x: number, z: number) => Math.hypot(Math.max(r.x1 - x, 0, x - r.x2), Math.max(r.z1 - z, 0, z - r.z2));

for (const [name, make] of worlds) {
  test(`${name}: 장식은 집 데이터를 바꾸지 않고, 같은 집이면 늘 같은 자리다`, () => {
    const w = make();
    const before = JSON.stringify(w);
    const a = planDecor(w);
    assert.equal(JSON.stringify(w), before, '집 데이터가 바뀌었다');
    assert.deepEqual(planDecor(make()), a, '같은 집인데 자리가 다르다');
    // 실내 장식이 실제로 생긴다(빈 계획으로 시험을 통과하지 않게)
    assert.ok(a.paintings.length >= 4, `그림 ${a.paintings.length}`);
    assert.ok(a.plants.length >= 2, `화분 ${a.plants.length}`);
    assert.ok(a.curtains.length >= 2, `커튼 ${a.curtains.length}`);
  });

  test(`${name}: 장식을 놓아도 모든 갈 곳에 길이 있고, 길 위에 화분·화단이 없다(물리 시험)`, () => {
    const w = make();
    const plan = planDecor(w);
    const sp = { x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 as const };
    const paths = destinations(w).map((d) => ({ d, path: findPath(w, sp, d) }));
    assert.deepEqual(paths.filter((p) => !p.path).map((p) => p.d.title), [], '길이 없는 곳');
    for (const { d, path } of paths) {
      for (let i = 1; i < path!.length; i++) {
        const a = path![i - 1], b = path![i];
        if (a.level !== b.level) continue;
        for (const p of [...plan.plants, ...plan.planters].filter((q) => q.level === a.level)) {
          assert.ok(segDist(p.x, p.z, a.x, a.z, b.x, b.z) > 0.3, `「${d.title}」 가는 길이 화분 옆 0.3m 안을 지난다`);
        }
        if (a.level === 1) for (const r of plan.beds) {
          assert.ok(rectDist(r, a.x, a.z) > 0.2 && rectDist(r, b.x, b.z) > 0.2, `「${d.title}」 가는 길이 화단을 밟는다`);
        }
      }
    }
    // 화분은 문짝·계단·살피기 자리와 떨어져 있다
    for (const p of plan.plants) {
      assert.ok(!w.doors.some((door) => (door.box.level === p.level || door.box.level === 0) && inRect(door.box, p.x, p.z, 0.6)), '문 앞 화분');
      assert.ok(!w.physics.ramps.some((r) => inRect(r, p.x, p.z, 0.5)), '계단 화분');
      assert.ok(!w.physics.boxes.some((b) => (b.level === p.level || b.level === 0) && inRect(b, p.x, p.z)), '막힌 상자 안 화분');
      assert.ok(indoorAt(w, p.level, p.x, p.z), '실내 바닥 밖 화분');
    }
  });

  test(`${name}: 그림·커튼은 벽 면에 붙고, 키 큰 가구·창을 가리지 않는다`, () => {
    const w = make();
    const plan = planDecor(w);
    const walls = w.walls.filter((s) => s.style !== 'invisible');
    for (const p of plan.paintings) {
      // 그림 뒤 5cm는 벽 안이다
      const bx = p.x - Math.sin(p.yaw) * 0.05, bz = p.z - Math.cos(p.yaw) * 0.05;
      assert.ok(walls.some((s) => (s.box.level === p.level || s.box.level === 0) && inRect(s.box, bx, bz, 0.01)), '벽에 붙지 않은 그림');
      // 눈높이 둘레, 천장 아래
      const base = p.level === 2 ? w.floor2 : 0;
      assert.ok(p.y - p.h / 2 > base + 0.95 && p.y + p.h / 2 < base + 2.6, `그림 높이 ${(p.y - base).toFixed(2)}`);
      // 창 구멍 위에 걸리지 않는다
      for (const v of w.windows.filter((q) => q.level === p.level)) {
        const along = v.axis === 'x' ? p.x : p.z, line = v.axis === 'x' ? p.z : p.x;
        const onLine = Math.abs(line - v.at) < 0.3 && Math.abs(Math.sin(p.yaw)) === (v.axis === 'z' ? 1 : 0);
        assert.ok(!(onLine && along > v.from + 0.05 && along < v.to - 0.05), '창 위에 건 그림');
      }
    }
    for (const c of plan.curtains) {
      // 커튼 자리 바로 뒤는 실내가 아니다(벽 또는 창): 방 가운데 떠 있지 않다
      const bx = c.x - Math.sin(c.yaw) * 0.3, bz = c.z - Math.cos(c.yaw) * 0.3;
      assert.ok(!indoorAt(w, c.level, bx, bz) || walls.some((s) => inRect(s.box, bx, bz, 0.05)), '방 가운데 뜬 커튼');
      assert.ok(c.y1 > c.y0, '거꾸로 된 커튼');
    }
  });

  test(`${name}: 처마는 걷는 바닥 위에 걸리지 않고, 포치 보는 기둥과 지붕판 사이에 맞는다`, () => {
    const w = make();
    const plan = planDecor(w);
    for (const e of plan.eaves) {
      assert.ok(e.b - e.a >= (e.y > w.floor2 + 1 ? 1.0 : 2.0), '짧은 토막 처마');
      // 처마 끝 바로 밖(바깥 0.3m)은 위층 바닥·포치가 아니다
      const mid = (e.a + e.b) / 2;
      const [x, z] = e.axis === 'x' ? [mid, e.line + e.s * 0.3] : [e.line + e.s * 0.3, mid];
      assert.ok(!w.floors.some((f) => f.level === 2 && inRect(f, x, z)), '위층 바닥 위 처마');
      assert.ok(!w.props.some((p) => p.type === 'slab' && p.part === 'porch' && inRect(p, x, z)), '포치 지붕 밑 처마');
    }
    const porch = w.props.filter((p): p is Extract<HouseWorld['props'][number], { type: 'slab' }> => p.type === 'slab' && p.part === 'porch');
    for (const l of plan.lintels) {
      assert.ok(porch.some((s) => Math.abs(s.y - s.t / 2 - l.y1) < 1e-6 && l.x1 >= s.x1 - 1e-6 && l.x2 <= s.x2 + 1e-6 && l.z1 >= s.z1 - 1e-6 && l.z2 <= s.z2 + 1e-6), '보가 포치 지붕판 밖');
      assert.ok(Math.abs(l.y1 - l.y0 - DECOR_SIZE.lintelH) < 1e-6);
    }
    const columns = w.props.filter((p) => p.type === 'column');
    assert.equal(plan.columnTops.length, columns.length);
    for (const c of plan.columnTops) {
      const col = columns.find((p) => p.type === 'column' && p.x === c.x && p.z === c.z);
      assert.ok(col && col.type === 'column' && c.top <= col.h + 1e-9 && c.top > col.h - DECOR_SIZE.lintelH - 1e-9, '기둥머리 높이');
    }
    // 아치가 있는 줄에는 보를 얹지 않는다
    for (const a of w.props.filter((p) => p.type === 'arch')) {
      if (a.type !== 'arch') continue;
      assert.ok(!plan.lintels.some((l) => a.axis === 'x' ? a.z > l.z1 && a.z < l.z2 : a.x > l.x1 && a.x < l.x2), '아치 줄 위의 보');
    }
    // 포치 등은 포치 지붕판 밑에 매단다
    for (const l of plan.lanterns) assert.ok(porch.some((s) => inRect(s, l.x, l.z) && Math.abs(s.y - s.t / 2 - l.top) < 1e-6), '포치 밖 등');
  });

  test(`${name}: 깔개·꽃 상자는 바닥 위에 있고 계단에 걸리지 않는다`, () => {
    const w = make();
    const plan = planDecor(w);
    for (const r of plan.rugs) {
      const rect = { x1: r.x - r.w / 2, x2: r.x + r.w / 2, z1: r.z - r.d / 2, z2: r.z + r.d / 2 };
      assert.ok(w.floors.some((f) => f.level === r.level && inRect(f, r.x, r.z)), '바닥 밖 깔개');
      assert.ok(!w.physics.ramps.some((q) => Math.abs(q.y1 - q.y0) > 0.01 && q.x1 < rect.x2 && q.x2 > rect.x1 && q.z1 < rect.z2 && q.z2 > rect.z1), '계단에 걸친 깔개');
    }
    for (const p of plan.planters) {
      assert.ok(w.floors.some((f) => f.level === p.level && inRect(f, p.x, p.z, -0.25)), '바닥 끝에 걸친 꽃 상자');
    }
  });

  test(`${name}: 그림등은 그림마다 하나, 그 그림 바로 위 벽에 붙고 천장 몰딩 밑에 있다`, () => {
    const w = make();
    const plan = planDecor(w);
    assert.equal(plan.pictureLights.length, plan.paintings.length, '그림과 그림등 수가 다르다');
    const walls = w.walls.filter((s) => s.style !== 'invisible');
    plan.paintings.forEach((p, i) => {
      const l = plan.pictureLights[i];
      assert.equal(l.level, p.level);
      assert.ok(Math.abs(l.yaw - p.yaw) < 1e-9, '그림과 다른 쪽을 보는 등');
      assert.equal(l.finish, p.level === 2 ? 'silver' : 'brass');
      // 벽을 따라간 자리는 그림 가운데, 벽에서 나온 거리는 그림보다 벽 쪽(그림은 벽 면에서 조금 띄운다)
      const along = Math.abs(Math.cos(p.yaw)) > 0.5 ? l.x - p.x : l.z - p.z;
      assert.ok(Math.abs(along) < 1e-6, '그림 가운데를 비킨 등');
      assert.ok(l.w <= p.w, '그림보다 긴 등 막대');
      // 높이: 받침 밑이 그림 위 끝보다 위, 받침 위가 그 벽 꼭대기 몰딩(0.14m)보다 아래
      const host = walls.find((s) => (s.box.level === p.level || s.box.level === 0) && inRect(s.box, l.x - Math.sin(l.yaw) * 0.05, l.z - Math.cos(l.yaw) * 0.05, 0.01));
      assert.ok(host, '벽에 붙지 않은 그림등');
      assert.ok(l.y - DECOR_SIZE.lightPlate / 2 > p.y + p.h / 2, `그림에 걸친 등 ${(l.y - p.y - p.h / 2).toFixed(3)}`);
      assert.ok(l.y + DECOR_SIZE.lightPlate / 2 < host!.baseY + host!.height - 0.14, '천장 몰딩에 박힌 등');
    });
  });

  test(`${name}: 3인칭에서 천장·벽을 걷어 내도 허공에 뜬 가구가 없다(바닥에서 뜬 것은 모두 천장·벽과 함께 숨는다)`, () => {
    const w = make();
    const base = (lv: 1 | 2) => (lv === 2 ? w.floor2 : 0);
    const ceilingAt = (f: (typeof w.furniture)[number]) => {
      const x = (f.x1 + f.x2) / 2, z = (f.z1 + f.z2) / 2;
      const c = w.ceilings.find((q) => q.level === f.level && x >= q.x1 && x <= q.x2 && z >= q.z1 && z <= q.z2);
      return c ? c.y - base(f.level) : f.level === 1 ? w.floor2 : 2.5;
    };
    const fm = makeFurnitureMats();
    const furn = buildFurniture(w.furniture, fm, { floor2: w.floor2, ceilingAt });
    const floating: string[] = [];
    for (const lv of [1, 2] as const) {
      for (const child of furn.byLevel[lv].children) {
        const box = new THREE.Box3().setFromObject(child);
        if (box.isEmpty()) continue;
        const kind = child.userData.kind as keyof typeof HUNG;
        // 바닥에서 30cm 넘게 떠 있으면 매다는 것(천장 또는 벽)이어야 한다
        if (box.min.y > base(lv) + 0.3 && !HUNG[kind]) floating.push(kind);
      }
    }
    fm.kit.dispose();
    assert.deepEqual([...new Set(floating)], [], '받칠 데 없이 뜬 가구');
    // 천장에 매다는 등은 실제로 천장 가까이에서 내려온다(바닥에 놓인 것을 잘못 분류하지 않았다)
    for (const f of w.furniture.filter((q) => HUNG[q.kind] === 'ceiling')) assert.ok(ceilingAt(f) > 2, `${f.kind} 천장 높이`);
  });

  test(`${name}: 걸어 들어갈 수 있는 바닥에는 처음 서는 자리가 있다`, () => {
    const w = make();
    const open = openFloors(w);
    assert.ok(open.size >= 2, `이어진 바닥 ${open.size}`);
    const spawnFloor = w.floors.findIndex((f) => f.level === 1 && inRect(f, w.spawn.x, w.spawn.z));
    if (spawnFloor >= 0) assert.ok(open.has(spawnFloor));
    // 실내 바닥도 하나 이상 이어진다(포치·마당만 열린 것이 아니다)
    assert.ok([...open].some((i) => w.floors[i].mat !== 'lawn' && w.floors[i].mat !== 'porch'), '실내로 이어지지 않는다');
  });
}

test('벽의 실내 쪽: 안벽은 양쪽, 바깥벽은 한쪽 이하', () => {
  const w = tuneWorld(buildWorld({}));
  for (const s of w.walls) {
    const sides = interiorSides(w, s);
    if (s.style === 'ext') assert.ok(sides.length <= 1 || s.box.level === 0);
    else assert.deepEqual(sides, [-1, 1]);
  }
});
