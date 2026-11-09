// 걷기 지도 검사: 범위·변환·두 판 배치는 순수 계산으로, drawMap은 호출만 기록하는 가짜 캔버스로 본다.
// 실제 집은 JY_HOUSE_WORLD_JSON(저장소 밖 JSON 경로)이 있을 때만 함께 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildWorld } from '../../src/content/world.ts';
import {
  COMPACT_BELOW, FULL, FULL_COMPACT, HOUSE_MARGIN, INACTIVE_ALPHA, MINI_PAD, PALETTES, drawMap, fitTransform, floorBounds, fullLayout, headingAngle, houseBounds, toCanvas,
  fullSpacing, viewBounds, zoneLabel,
  type Bounds, type MapState, type MapTheme, type Rect,
} from '../../src/walk/minimap.ts';
import type { HouseWorld, Level } from '../../src/walk/types.ts';

const EPS = 1e-6;
const redrawn = buildWorld({});
const realPath = process.env.JY_HOUSE_WORLD_JSON;
const real: HouseWorld | null = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;
const worlds: Array<[string, HouseWorld]> = [['다시 그린 집', redrawn], ...(real ? [['실제 집', real] as [string, HouseWorld]] : [])];

const covers = (b: Bounds, r: Bounds) =>
  Math.min(r.x1, r.x2) >= b.x1 - EPS && Math.max(r.x1, r.x2) <= b.x2 + EPS && Math.min(r.z1, r.z2) >= b.z1 - EPS && Math.max(r.z1, r.z2) <= b.z2 + EPS;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const inside = (r: Rect, W: number, H: number) => r.x >= -EPS && r.y >= -EPS && r.x + r.w <= W + EPS && r.y + r.h <= H + EPS;

type Call = { op: string; args: unknown[] };
/** 메서드 호출과 속성 쓰기만 기록하는 가짜 2D 컨텍스트 */
function fakeCtx() {
  const log: Call[] = [];
  const props: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key === 'measureText') return (s: string) => ({ width: String(s).length * 7 });
      if (key in target) return target[key];
      return (...args: unknown[]) => { log.push({ op: key, args }); };
    },
    set(target, key: string, v) {
      log.push({ op: `=${key}`, args: [v] });
      target[key] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

for (const [name, w] of worlds) {
  test(`${name}: 층 범위가 그 층의 모든 바닥·벽·문을 덮는다`, () => {
    for (const lv of [1, 2] as Level[]) {
      const b = floorBounds(w, lv);
      assert.ok(Number.isFinite(b.x1 + b.x2 + b.z1 + b.z2) && b.x2 > b.x1 && b.z2 > b.z1, `${lv}층 범위가 비었다`);
      for (const f of w.floors.filter((f) => f.level === lv)) assert.ok(covers(b, f), `${lv}층 바닥 ${f.mat}`);
      for (const x of w.walls.filter((x) => x.box.level === lv || x.box.level === 0)) assert.ok(covers(b, x.box), `${lv}층 벽`);
      for (const d of w.doors.filter((d) => d.box.level === lv)) assert.ok(covers(b, d.box), `${lv}층 문 ${d.label}`);
    }
    // 1층은 마당까지 들어가 2층보다 넓거나 같다
    const b1 = floorBounds(w, 1);
    assert.ok(w.floors.filter((f) => f.level === 1 && f.mat === 'lawn').every((f) => covers(b1, f)));
  });

  test(`${name}: 미니맵 변환은 범위를 여백 안으로 보내고 한쪽은 꽉 채운다`, () => {
    for (const [W, H] of [[180, 180], [120, 120], [240, 150], [150, 240]]) {
      for (const lv of [1, 2] as Level[]) {
        const b = floorBounds(w, lv);
        const t = fitTransform(b, { x: 0, y: 0, w: W, h: H }, MINI_PAD);
        for (const [x, z] of [[b.x1, b.z1], [b.x2, b.z2], [b.x1, b.z2], [b.x2, b.z1]]) {
          const [px, py] = toCanvas(t, x, z);
          assert.ok(px >= MINI_PAD - EPS && px <= W - MINI_PAD + EPS, `${W}x${H} ${lv}층 x ${px}`);
          assert.ok(py >= MINI_PAD - EPS && py <= H - MINI_PAD + EPS, `${W}x${H} ${lv}층 y ${py}`);
        }
        const fillW = (b.x2 - b.x1) * t.s;
        const fillH = (b.z2 - b.z1) * t.s;
        assert.ok(Math.abs(fillW - (W - 2 * MINI_PAD)) < 1e-6 || Math.abs(fillH - (H - 2 * MINI_PAD)) < 1e-6, '한쪽은 꽉 찬다');
        // 북쪽(z 작은 쪽)이 위
        assert.ok(toCanvas(t, 0, b.z1)[1] < toCanvas(t, 0, b.z2)[1]);
      }
    }
  });

  test(`${name}: 전체 지도 두 판은 같은 축척으로 겹치지 않고 화면 안에 있다`, () => {
    const sizes: Array<[number, number, 'row' | 'column' | null]> = [
      [1280, 800, 'row'], [1440, 900, 'row'], [844, 390, 'row'], [800, 1280, 'column'], [390, 780, 'column'], [390, 664, 'column'], [1024, 1024, null],
    ];
    for (const [W, H, dir] of sizes) {
      for (const active of [1, 2] as Level[]) {
        const L = fullLayout(w, W, H, active);
        if (dir && name === '다시 그린 집') assert.equal(L.dir, dir, `${W}x${H} 배치`);
        assert.ok(L.s > 0, `${W}x${H} 축척`);
        assert.deepEqual(L.order, active === 1 ? [1, 2] : [2, 1], '지금 층을 먼저 칠한다');
        const [p1, p2] = L.panels;
        assert.equal(p1.level, 1);
        assert.equal(p2.level, 2);
        assert.equal(p1.t.s, p2.t.s, '같은 축척');
        const withTitle = (p: typeof p1): Rect => ({ x: p.frame.x, y: p.frame.y - FULL.title, w: p.frame.w, h: p.frame.h + FULL.title });
        assert.ok(!overlap(withTitle(p1), withTitle(p2)), `${W}x${H} 두 판이 겹친다`);
        for (const p of L.panels) {
          assert.ok(inside(withTitle(p), W, H), `${W}x${H} ${p.level}층 판이 화면 밖`);
          assert.ok(p.frame.y + p.frame.h <= L.legend.y - 12 + EPS, `${W}x${H} 범례와 겹친다`);
          const b = p.bounds;
          for (const [x, z] of [[b.x1, b.z1], [b.x2, b.z2]]) {
            const [px, py] = toCanvas(p.t, x, z);
            assert.ok(px >= p.frame.x + FULL.pad - EPS && px <= p.frame.x + p.frame.w - FULL.pad + EPS);
            assert.ok(py >= p.frame.y + FULL.pad - EPS && py <= p.frame.y + p.frame.h - FULL.pad + EPS);
          }
        }
        assert.ok(L.legend.y + 12 <= H + EPS);
      }
    }
  });
}

test('바라보는 방향: yaw=0은 위(북), π/2는 왼쪽(서), -π/2는 오른쪽(동)', () => {
  const dir = (yaw: number) => [Math.cos(headingAngle(yaw)), Math.sin(headingAngle(yaw))];
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.ok(near(dir(0), [0, -1]));
  assert.ok(near(dir(Math.PI / 2), [-1, 0]));
  assert.ok(near(dir(-Math.PI / 2), [1, 0]));
  assert.ok(near(dir(Math.PI), [0, 1]));
});

const texts = (log: Call[]) => log.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
const firstIndex = (log: Call[], pred: (c: Call) => boolean) => log.findIndex(pred);

for (const [name, w] of worlds) {
  for (const theme of ['light', 'dark'] as MapTheme[]) {
    test(`${name} ${theme}: 미니맵은 지금 층만, 이름 없이, 내 위치 부채꼴까지 그린다`, () => {
      for (const lv of [1, 2] as Level[]) {
        const st: MapState = { x: w.spawn.x, z: w.spawn.z, level: lv, yaw: 0.4 };
        const { ctx, log } = fakeCtx();
        drawMap(ctx, w, st, { mode: 'mini', width: 180, height: 180, theme });
        assert.equal(texts(log).length, 0, '미니맵에는 글자가 없다');
        assert.ok(log.some((c) => c.op === 'fillRect'), '바닥·벽을 칠한다');
        assert.equal(log.filter((c) => c.op === 'save').length, log.filter((c) => c.op === 'restore').length, 'save/restore 짝');
        assert.ok(!log.some((c) => c.op === '=globalAlpha' && c.args[0] === INACTIVE_ALPHA), '미니맵에 옅은 층은 없다');
        const t = fitTransform(viewBounds(w, lv, st, HOUSE_MARGIN.mini), { x: 0, y: 0, w: 180, h: 180 }, MINI_PAD);
        const [px, py] = toCanvas(t, st.x, st.z);
        const wedge = log.find((c) => c.op === 'arc' && Math.abs(Number(c.args[2]) - 20) < 1e-9);
        assert.ok(wedge, '부채꼴');
        assert.ok(Math.abs(Number(wedge!.args[0]) - px) < 1e-6 && Math.abs(Number(wedge!.args[1]) - py) < 1e-6, '부채꼴이 내 위치에서');
        const span = Number(wedge!.args[4]) - Number(wedge!.args[3]);
        assert.ok(Math.abs(span - Math.PI / 3) < 1e-9, '60°');
        // 다른 층 바닥만 있는 색(다시 그린 집: 1층 마당 초록)은 2층 미니맵에 없다
        if (name === '다시 그린 집' && lv === 2) {
          assert.ok(!log.some((c) => c.op === '=fillStyle' && c.args[0] === PALETTES[theme].active.floor.lawn));
        }
      }
    });

    test(`${name} ${theme}: 전체 지도는 지금 층 판을 먼저, 색으로 칠하고 다른 층은 회색·옅게`, () => {
      for (const lv of [1, 2] as Level[]) {
        for (const [W, H] of [[1280, 800], [390, 780]]) {
          const pal = PALETTES[theme];
          const { ctx, log } = fakeCtx();
          drawMap(ctx, w, { x: w.spawn.x, z: w.spawn.z, level: lv, yaw: 0 }, { mode: 'full', width: W, height: H, theme });
          const firstPanel = firstIndex(log, (c) => c.op === '=fillStyle' && (c.args[0] === pal.panel || c.args[0] === pal.panelMuted));
          assert.equal(log[firstPanel].args[0], pal.panel, '첫 판은 지금 층(색 있는 판)');
          const activeColors = new Set(Object.values(pal.active.floor));
          const firstActiveFloor = firstIndex(log, (c) => c.op === '=fillStyle' && activeColors.has(String(c.args[0])));
          const firstFade = firstIndex(log, (c) => c.op === '=globalAlpha' && c.args[0] === INACTIVE_ALPHA);
          assert.ok(firstActiveFloor >= 0 && firstFade > firstActiveFloor, '색 바닥을 먼저, 옅은 층은 나중');
          const mutedColors = new Set(Object.values(pal.muted.floor));
          const fadedFloor = firstIndex(log, (c) => c.op === '=fillStyle' && mutedColors.has(String(c.args[0])));
          assert.ok(fadedFloor > firstFade, '다른 층은 회색 바닥');
          const tx = texts(log);
          assert.ok(tx.includes('1층') && tx.includes('2층'), '두 층 제목');
          assert.equal(tx.filter((s) => s === '지금 여기').length, 1, '지금 여기는 한 번');
          for (const legend of ['닫힌 문', '계단']) assert.ok(tx.includes(legend), `범례 ${legend}`);
          assert.ok(tx.some((s) => w.zones.some((z) => zoneLabel(z.name, z.level) === s)), '구역 이름이 보인다');
          const wedges = log.filter((c) => c.op === 'arc' && Math.abs(Number(c.args[2]) - 34) < 1e-9);
          assert.equal(wedges.length, 1, '내 위치는 지금 층 판에만');
          assert.equal(log.filter((c) => c.op === 'save').length, log.filter((c) => c.op === 'restore').length, 'save/restore 짝');
        }
      }
    });
  }
}

test('아주 작은 캔버스나 빈 층도 예외 없이 지나간다', () => {
  const empty2: HouseWorld = { ...redrawn, floors: redrawn.floors.filter((f) => f.level === 1), walls: redrawn.walls.filter((x) => x.box.level === 1), doors: [] };
  for (const [W, H] of [[1, 1], [40, 30], [0, 0]]) {
    for (const mode of ['mini', 'full'] as const) {
      const { ctx } = fakeCtx();
      assert.doesNotThrow(() => drawMap(ctx, empty2, { x: 0, z: 0, level: 2, yaw: 0 }, { mode, width: W, height: H, theme: 'light' }));
    }
  }
  const b = floorBounds(empty2, 2);
  assert.ok(Number.isFinite(b.x1) && Number.isFinite(b.z2));
});

// 손질 뒤(2026-11-09 검토): 집 안에서는 집에 맞춰 크게, 이름표는 내 점을 피하고, 판 색은 층 배지와 같다
const centreOf = (b: Bounds) => ({ x: (b.x1 + b.x2) / 2, z: (b.z1 + b.z2) / 2 });

for (const [name, w] of worlds) {
  test(`${name}: 집 범위는 층 범위 안에서 실내·계단을 덮고, 마당에 나가면 층 전체로 바뀐다`, () => {
    for (const lv of [1, 2] as Level[]) {
      const full = floorBounds(w, lv);
      const inner = houseBounds(w, lv, HOUSE_MARGIN.full);
      assert.ok(covers(full, inner), `${lv}층 집 범위가 층 범위 안`);
      for (const f of w.floors) if (f.level === lv && f.mat !== 'lawn') assert.ok(covers(inner, f), `${lv}층 ${f.mat} 바닥이 집 범위 안`);
      const c = centreOf(inner);
      assert.deepEqual(viewBounds(w, lv, { ...c, level: lv }, HOUSE_MARGIN.full), inner, '집 안이면 집 범위');
      assert.deepEqual(viewBounds(w, lv, { ...c, level: lv === 1 ? 2 : 1 }, HOUSE_MARGIN.full), inner, '다른 층에 있으면 집 범위');
    }
    assert.deepEqual(viewBounds(w, 1, { x: w.spawn.x, z: w.spawn.z, level: 1 }, HOUSE_MARGIN.full), floorBounds(w, 1), '마당(출발점)이면 층 전체');
  });

  test(`${name}: 집 안에서 연 전체 지도는 마당까지 담을 때보다 크게 그린다`, () => {
    const c = centreOf(houseBounds(w, 1, HOUSE_MARGIN.full));
    for (const [W, H] of [[1150, 640], [760, 270], [358, 520]]) {
      const all = fullLayout(w, W, H, 1);
      const vb = (lv: Level) => viewBounds(w, lv, { ...c, level: 1 }, HOUSE_MARGIN.full);
      const crop = fullLayout(w, W, H, 1, [vb(1), vb(2)]);
      assert.ok(crop.s >= all.s - EPS, `${W}x${H}: ${crop.s.toFixed(2)} >= ${all.s.toFixed(2)}`);
      for (const p of crop.panels) assert.ok(inside(p.frame, W, H), `${W}x${H} 판이 화면 안`);
    }
  });

  test(`${name}: 전체 지도 이름표는 어느 구역에 서 있어도 내 위치 점을 가리지 않는다`, () => {
    for (const z of w.zones) {
      const st: MapState = { x: (z.x1 + z.x2) / 2, z: (z.z1 + z.z2) / 2, level: z.level as Level, yaw: 0 };
      const { ctx, log } = fakeCtx();
      drawMap(ctx, w, st, { mode: 'full', width: 1150, height: 640, theme: 'light' });
      const dot = log.find((c) => c.op === 'arc' && Math.abs(Number(c.args[2]) - 6.5) < 1e-9);
      assert.ok(dot, '내 위치 점');
      const [px, py] = [Number(dot!.args[0]), Number(dot!.args[1])];
      const me = { x: px - 6.5, y: py - 6.5, w: 13, h: 13 };
      for (const c of log.filter((q) => q.op === 'fillText')) {
        const s = String(c.args[0]);
        if (!w.zones.some((q) => zoneLabel(q.name, q.level) === s)) continue;
        const tw = s.length * 7; // 가짜 measureText
        const box = { x: Number(c.args[1]) - tw / 2, y: Number(c.args[2]) - 5, w: tw, h: 10 };
        assert.ok(!overlap(box, me), `${z.name}에 서면 「${s}」가 점을 가린다`);
      }
    }
  });
}

test('구역 이름 앞의 층은 판 안에서 뺀다', () => {
  assert.equal(zoneLabel('1층 거실', 1), '거실');
  assert.equal(zoneLabel('2층 계단 홀', 2), '계단 홀');
  assert.equal(zoneLabel('1층', 1), '1층');
  assert.equal(zoneLabel('2층 거실', 1), '2층 거실');
  assert.equal(zoneLabel('앞마당', 1), '앞마당');
});

test('판 테두리·제목·「지금 여기」는 층 배지와 같은 층 색(1층 소나무, 2층 지붕)', () => {
  for (const theme of ['light', 'dark'] as MapTheme[]) {
    const pal = PALETTES[theme];
    assert.notEqual(pal.level[1].accent, pal.level[2].accent);
    for (const lv of [1, 2] as Level[]) {
      const { ctx, log } = fakeCtx();
      drawMap(ctx, redrawn, { x: 0, z: -5, level: lv, yaw: 0 }, { mode: 'full', width: 1280, height: 800, theme });
      const strokes = log.filter((c) => c.op === '=strokeStyle').map((c) => c.args[0]);
      assert.ok(strokes.includes(pal.level[lv].accent), `${theme} ${lv}층 테두리`);
      assert.ok(!strokes.includes(pal.level[lv === 1 ? 2 : 1].accent), `${theme} 다른 층 색 테두리 없음`);
    }
  }
});

test('낮은 캔버스(휴대폰 가로)는 촘촘한 배치로 판을 더 크게, 그래도 겹치거나 넘치지 않는다', () => {
  assert.equal(fullSpacing(COMPACT_BELOW - 1), FULL_COMPACT);
  assert.equal(fullSpacing(COMPACT_BELOW), FULL);
  for (const [, w] of worlds) {
    for (const [W, H] of [[760, 260], [700, 230], [520, 300]]) {
      const L = fullLayout(w, W, H, 1);
      assert.ok(L.s > 0);
      const F = FULL_COMPACT;
      const withTitle = (p: (typeof L.panels)[0]): Rect => ({ x: p.frame.x, y: p.frame.y - F.title, w: p.frame.w, h: p.frame.h + F.title });
      assert.ok(!overlap(withTitle(L.panels[0]), withTitle(L.panels[1])), `${W}x${H} 겹침`);
      for (const p of L.panels) {
        assert.ok(inside(withTitle(p), W, H), `${W}x${H} 화면 밖`);
        assert.ok(p.frame.y + p.frame.h <= L.legend.y - 12 + EPS, `${W}x${H} 범례와 겹침`);
      }
      assert.ok(L.legend.y + 12 <= H + EPS);
    }
  }
});
