// 걷기 지도 검사: 범위·변환·두 판 배치는 순수 계산으로, drawMap은 호출만 기록하는 가짜 캔버스로 본다.
// 실제 집은 JY_HOUSE_WORLD_JSON(저장소 밖 JSON 경로)이 있을 때만 함께 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { buildWorld } from '../../src/content/world.ts';
import type { Bounds, MapState, MapTheme, Rect } from '../../src/walk/minimap.ts';
import type { HouseWorld, Level } from '../../src/walk/types.ts';

// 걷기 손질(staging.ts)은 앱과 같은 꼴(확장자 없는 './gallery')로 갤러리 배치를 가져오고, 지도는 장소 이름 표(@/lib/place-names)와
// 지금 화면 말(./lang)을 읽는다. 이 시험 프로세스에서만 @/와 확장자 없는 경로를 풀어 준다(그래서 지도는 아래에서 불러온다)
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
const { stageHouse } = await import('../../src/walk/staging.ts');
const {
  COMPACT_BELOW, FULL, FULL_COMPACT, HOUSE_MARGIN, INACTIVE_ALPHA, MINI_PAD, PALETTES, drawMap, fitTransform, floorBounds, focusCanvas, fullLayout, headingAngle, houseBounds, toCanvas,
  FOCUS_BELOW, FOCUS_LONG_BELOW, MINI_SMALL, MINI_SMALL_NAMES, MINI_SMALL_NAME_DIST, fullSpacing, miniNames, spotLabel, viewBounds, zoneLabel,
  MAP_WORDS, SPOT_EN_MAX, SPOT_EN_SMALL_MAX, clipEn, floorTitle,
} = await import('../../src/walk/minimap.ts');

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

  test(`${name}: 전체 지도 두 판은 겹치지 않고 화면 안에 있다(넓은 캔버스는 같은 축척, 휴대폰은 지금 층이 더 크게)`, () => {
    const sizes: Array<[number, number, 'row' | 'column' | null]> = [
      [1280, 800, 'row'], [1440, 900, 'row'], [844, 390, 'row'], [800, 1280, 'column'], [390, 780, 'column'], [390, 664, 'column'], [1024, 1024, null],
      [334, 673, null], [304, 469, null],
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
        if (!focusCanvas(W, H)) assert.equal(p1.t.s, p2.t.s, '같은 축척');
        else {
          const [on, off] = active === 1 ? [p1, p2] : [p2, p1];
          assert.ok(off.t.s > 0 && on.t.s >= off.t.s - EPS, `${W}x${H} 지금 층이 다른 층보다 작게 그려진다`);
          assert.equal(L.s, on.t.s, '배치의 축척은 지금 층 것');
        }
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
    test(`${name} ${theme}: 미니맵은 지금 층만, 살피기 자리 이름만(구역 이름 없이), 내 위치 부채꼴까지 그린다`, () => {
      for (const lv of [1, 2] as Level[]) {
        const st: MapState = { x: w.spawn.x, z: w.spawn.z, level: lv, yaw: 0.4 };
        const { ctx, log } = fakeCtx();
        drawMap(ctx, w, st, { mode: 'mini', width: 180, height: 180, theme });
        // 2026-11-10 사용자 요청: 미니맵에도 어디에 뭐가 있는지 이름과 색으로. 적는 글은 그 층 살피기 자리 이름뿐
        const allowed = new Set(w.hotspots.filter((h) => h.level === lv).map((h) => spotLabel(h, lv)));
        for (const t of texts(log)) assert.ok(allowed.has(t), `미니맵에 살피기 자리가 아닌 글자: ${t}`);
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

// ───────── 작은 미니맵(휴대폰): 이름은 가까운 한두 곳만, 캔버스 밖으로 나가지 않게
const staged = stageHouse({ ...structuredClone(redrawn), kind: 'real' }, 'wedding');

test('작은 미니맵에 적을 이름의 순서: 정한 거리 안의 자리를 가까운 순으로', () => {
  const spots = staged.hotspots.filter((h) => h.level === 1);
  const me = { x: staged.spawn.x, z: staged.spawn.z };
  const order = miniNames(spots, me);
  const d = (h: { x: number; z: number }) => Math.hypot(h.x - me.x, h.z - me.z);
  for (const h of order) assert.ok(d(h) <= MINI_SMALL_NAME_DIST, `${h.id}가 멀다`);
  for (let i = 1; i < order.length; i++) assert.ok(d(order[i]) >= d(order[i - 1]) - EPS, '가까운 순');
  // 거리 안의 자리는 빠짐없이 들어 있다(적는 수는 그릴 때 MINI_SMALL_NAMES개까지로 자른다)
  assert.equal(order.length, spots.filter((h) => d(h) <= MINI_SMALL_NAME_DIST).length);
  // 둘레에 아무것도 없으면 이름 없이 점만
  assert.deepEqual(miniNames(spots, { x: 9999, z: 9999 }), []);
});

test('작은 미니맵: 가장 가까운 자리에 이름 적을 틈이 없으면 그다음 자리가 그 칸을 쓴다', () => {
  // 내가 살피기 자리 바로 위에 서 있으면 그 자리 이름은 내 점에 가려 못 적는다. 그래도 둘레의 다른 이름이 나와야 한다
  for (const w of [redrawn, staged]) {
    const lv1 = w.hotspots.filter((h) => h.level === 1 && h.kind !== 'exit' && h.kind !== 'door');
    for (const at of lv1) {
      const near = miniNames(lv1, at);
      if (near.length < 3) continue;
      const { ctx, log } = fakeCtx();
      drawMap(ctx, w, { x: at.x, z: at.z, level: 1, yaw: 0 }, { mode: 'mini', width: 120, height: 120, theme: 'light' });
      const names = log.filter((c) => c.op === 'fillText').length;
      assert.ok(names >= 1 && names <= MINI_SMALL_NAMES, `${at.id}: 이름 ${names}개(둘레에 자리 ${near.length}곳)`);
    }
  }
});

test('작은 미니맵(120px)은 이름을 두 개까지만 적고, 글자가 캔버스 밖으로 나가지 않는다', () => {
  for (const w of [redrawn, staged]) {
    const lv1 = w.hotspots.filter((h) => h.level === 1);
    for (const at of [w.spawn, ...lv1]) {
      const { ctx, log } = fakeCtx();
      drawMap(ctx, w, { x: at.x, z: at.z, level: 1, yaw: 0 }, { mode: 'mini', width: 120, height: 120, theme: 'light' });
      const names = log.filter((c) => c.op === 'fillText');
      assert.ok(names.length <= MINI_SMALL_NAMES, `이름 ${names.length}개`);
      for (const c of names) {
        const [text, x, y] = c.args as [string, number, number];
        // 가짜 캔버스의 글자 너비는 글자 수 × 7. 어느 쪽 정렬이든 글자 가운데에서 반 너비 안에 있어야 한다
        assert.ok(x > -text.length * 7 && x < 120 + text.length * 7 && y > 4 && y < 116, `「${text}」 (${x}, ${y})`);
        assert.ok([...text].length <= 6, `「${text}」가 길다`);
      }
      // 점은 그 층의 모든 자리에 찍는다(내 점 하나 더)
      const dots = log.filter((c) => c.op === 'arc').length;
      assert.ok(dots >= lv1.filter((h) => h.kind !== 'exit' && h.kind !== 'door').length, `점 ${dots}개`);
    }
  }
  // 데스크탑 미니맵(184px)은 예전처럼 여러 이름을 적는다
  assert.ok(184 >= MINI_SMALL);
  const { ctx, log } = fakeCtx();
  drawMap(ctx, staged, { x: staged.spawn.x, z: staged.spawn.z, level: 1, yaw: 0 }, { mode: 'mini', width: 184, height: 184, theme: 'light' });
  assert.ok(log.filter((c) => c.op === 'fillText').length > MINI_SMALL_NAMES);
});

test('이름은 그릴 칸 밖으로 나가지 않는다(미니맵 184px, 전체 지도)', () => {
  for (const w of [redrawn, staged]) {
    const { ctx, log } = fakeCtx();
    drawMap(ctx, w, { x: w.spawn.x, z: w.spawn.z, level: 1, yaw: 0 }, { mode: 'mini', width: 184, height: 184, theme: 'light' });
    let align = 'left';
    for (const c of log) {
      if (c.op === '=textAlign') align = String(c.args[0]);
      if (c.op !== 'fillText') continue;
      const [text, x] = c.args as [string, number, number];
      const tw = text.length * 7;
      const left = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2;
      assert.ok(left >= 0 && left + tw <= 184, `「${text}」가 미니맵 밖으로 나간다(${left.toFixed(1)}~${(left + tw).toFixed(1)})`);
    }
  }
});

test('집 범위: 마당 끝의 평평한 단(무대)은 집 범위를 늘리지 않는다', () => {
  // 손질한 집에는 마당 모서리에 무대 단이 경사면 목록에 들어 있다
  const flat = staged.physics.ramps.filter((r) => Math.abs(r.y1 - r.y0) < 1e-3 && r.z1 > staged.house.z2);
  assert.ok(flat.length >= 1, '마당 무대 단이 없다');
  const hb = houseBounds(staged, 1, HOUSE_MARGIN.mini);
  const fb = floorBounds(staged, 1);
  for (const r of flat) assert.ok(hb.z2 < r.z1, '집 범위가 무대까지 늘어났다');
  assert.ok(hb.z2 - hb.z1 < (fb.z2 - fb.z1) * 0.8, '집 범위가 층 전체와 거의 같다');
  // 집 안에 서면 미니맵은 집에 맞춰 크게, 마당에 나가면 층 전체
  const inHouse = viewBounds(staged, 1, { x: (staged.house.x1 + staged.house.x2) / 2, z: (staged.house.z1 + staged.house.z2) / 2, level: 1 }, HOUSE_MARGIN.mini);
  const inYard = viewBounds(staged, 1, { x: staged.spawn.x, z: staged.spawn.z, level: 1 }, HOUSE_MARGIN.mini);
  assert.ok(inHouse.z2 - inHouse.z1 < inYard.z2 - inYard.z1);
  // 계단(기울어진 경사면)은 그대로 집 범위 안
  for (const r of staged.physics.ramps.filter((q) => Math.abs(q.y1 - q.y0) > 1e-3)) assert.ok(covers(hb, r), '계단이 집 범위 밖');
});

// ───────── 전체 지도 이름표: 구역 이름과 자리 점·자리 이름이 서로 덮지 않고, 판 밖으로 잘리지 않는다
type Label = { text: string; font: string; box: Rect };
/** 가짜 캔버스 기록에서 적힌 글자와 그 칸(가짜 글자 너비 = 글자 수 × 7, 정렬·글자 크기 반영)을 꺼낸다 */
function labelsOf(log: Call[]): Label[] {
  let align = 'left';
  let font = '';
  const out: Label[] = [];
  for (const c of log) {
    if (c.op === '=textAlign') align = String(c.args[0]);
    else if (c.op === '=font') font = String(c.args[0]);
    else if (c.op === 'fillText') {
      const [text, x, y] = c.args as [string, number, number];
      const tw = text.length * 7;
      const size = Number(/(\d+)px/.exec(font)?.[1] ?? 12);
      const left = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2;
      out.push({ text, font, box: { x: left, y: y - size / 2, w: tw, h: size } });
    }
  }
  return out;
}
const isZoneLabel = (l: Label) => l.font.startsWith('600 ');
const isSpotLabel = (l: Label) => l.font.startsWith('700 11px') && l.text !== '지금 여기';
const within = (r: Rect, f: Rect) => r.x >= f.x - EPS && r.y >= f.y - EPS && r.x + r.w <= f.x + f.w + EPS && r.y + r.h <= f.y + f.h + EPS;
const PHONE_AND_DESK: Array<[number, number]> = [[1150, 640], [334, 673], [304, 469], [788, 272]];

for (const [name, w] of [...worlds, ['꾸민 집', staged] as [string, HouseWorld]]) {
  test(`${name}: 전체 지도의 구역 이름은 자리 점에 덮이지 않고, 자리 이름과 겹치지 않고, 판 안에 있다`, () => {
    const mid = centreOf(houseBounds(w, 1, HOUSE_MARGIN.full));
    const stands: MapState[] = [
      { x: w.spawn.x, z: w.spawn.z, level: 1, yaw: 0 },
      { ...mid, level: 1, yaw: 0 },
      { ...centreOf(houseBounds(w, 2, HOUSE_MARGIN.full)), level: 2, yaw: 0 },
    ];
    let zoneCount = 0;
    for (const st of stands) {
      for (const [W, H] of PHONE_AND_DESK) {
        const { ctx, log } = fakeCtx();
        drawMap(ctx, w, st, { mode: 'full', width: W, height: H, theme: 'light' });
        const vb = (lv: Level) => viewBounds(w, lv, st, HOUSE_MARGIN.full);
        const L = fullLayout(w, W, H, st.level, [vb(1), vb(2)]);
        const all = labelsOf(log);
        const zones = all.filter(isZoneLabel);
        const spots = all.filter(isSpotLabel);
        zoneCount += zones.length;
        // 자리 점: 반지름 4.5px 원(전체 지도). 지금 층 판 안의 것만 본다
        const dots = log.filter((c) => c.op === 'arc' && Math.abs(Number(c.args[2]) - 4.5) < 1e-9)
          .map((c) => ({ x: Number(c.args[0]) - 4.5, y: Number(c.args[1]) - 4.5, w: 9, h: 9 }));
        for (const z of zones) {
          assert.ok(L.panels.some((p) => within(z.box, p.frame)), `${W}x${H} 「${z.text}」가 판 밖으로 나간다`);
          for (const d of dots) assert.ok(!overlap(z.box, d), `${W}x${H} 「${z.text}」가 자리 점에 덮인다`);
          for (const s of spots) assert.ok(!overlap(z.box, s.box), `${W}x${H} 「${z.text}」와 「${s.text}」가 겹친다`);
        }
        for (const s of spots) assert.ok(within(s.box, L.panels[st.level - 1].frame), `${W}x${H} 「${s.text}」가 판 밖으로 나간다`);
      }
    }
    assert.ok(zoneCount > 0, '구역 이름이 하나도 없다');
  });
}

test('전체 지도: 구역 이름을 적을 틈이 없으면 같은 이름의 자리가 제 이름을 적는다(둘 다 빠지지 않는다)', () => {
  // 작은 칸 한가운데에 같은 이름의 자리 점이 있으면 구역 이름은 점에 막힌다. 그때 자리 이름이 점 옆에 나와야 한다
  const hb = houseBounds(redrawn, 1, HOUSE_MARGIN.full);
  const c = centreOf(hb);
  const tiny: HouseWorld = {
    ...redrawn,
    zones: [{ level: 1, x1: c.x - 1.5, x2: c.x + 1.5, z1: c.z - 0.5, z2: c.z + 0.5, name: '쉼터' }],
    hotspots: [{ id: 'rest', level: 1, x: c.x, z: c.z, r: 1, title: '쉼터', line: '', kind: 'room' }],
  };
  const { ctx, log } = fakeCtx();
  drawMap(ctx, tiny, { x: hb.x1 + 0.5, z: hb.z1 + 0.5, level: 1, yaw: 0 }, { mode: 'full', width: 1150, height: 640, theme: 'light' });
  const named = labelsOf(log).filter((l) => l.text === '쉼터');
  assert.equal(named.length, 1, '이름은 한 번만');
  assert.ok(isSpotLabel(named[0]), '자리 이름으로 적힌다');
  // 칸이 넉넉하면 예전처럼 구역 이름으로 한 번만 적는다
  const roomy: HouseWorld = { ...tiny, zones: [{ ...tiny.zones[0], z1: c.z - 3, z2: c.z + 3 }] };
  const second = fakeCtx();
  drawMap(second.ctx, roomy, { x: hb.x1 + 0.5, z: hb.z1 + 0.5, level: 1, yaw: 0 }, { mode: 'full', width: 1150, height: 640, theme: 'light' });
  const again = labelsOf(second.log).filter((l) => l.text === '쉼터');
  assert.equal(again.length, 1);
  assert.ok(isZoneLabel(again[0]), '구역 이름으로 적힌다');
});

// ───────── 휴대폰 큰 지도: 같은 축척으로는 지금 층이 너무 작다. 지금 층 판에 자리를 더 준다
test('좁은 캔버스(휴대폰)의 전체 지도는 지금 층을 같은 축척일 때보다 크게, 다른 층은 작게 함께 그린다', () => {
  // 세로로 긴 집을 지어낸다(두 층이 같은 크기). 같은 축척이면 두 판이 길이를 반씩 나눠 쓴다
  const tall: [Bounds, Bounds] = [{ x1: 0, x2: 10, z1: 0, z2: 16 }, { x1: 0, x2: 10, z1: 0, z2: 16 }];
  // 세로 휴대폰에서 위아래로 놓을 때 같은 축척이 쓰던 값: (높이 − 바깥 여백 − 범례 − 판 사이 − 제목·안 여백 두 벌) ÷ 두 층 깊이
  const shared = (673 - 2 * FULL.outer - FULL.legend - FULL.gap - 2 * (FULL.title + 2 * FULL.pad)) / 32;
  for (const active of [1, 2] as Level[]) {
    const L = fullLayout(redrawn, 334, 673, active, tall);
    const on = L.panels[active - 1];
    const off = L.panels[active === 1 ? 1 : 0];
    assert.ok(on.t.s >= shared * 1.3, `지금 층이 충분히 커지지 않았다: ${on.t.s.toFixed(1)} / ${shared.toFixed(1)}`);
    assert.ok(off.t.s > 0 && off.t.s < on.t.s, '다른 층은 작게');
    assert.ok(off.frame.w >= 60 && off.frame.h >= 60, `다른 층 판이 너무 작다: ${off.frame.w.toFixed(0)}x${off.frame.h.toFixed(0)}`);
    const withTitle = (p: typeof on): Rect => ({ x: p.frame.x, y: p.frame.y - FULL.title, w: p.frame.w, h: p.frame.h + FULL.title });
    assert.ok(!overlap(withTitle(on), withTitle(off)), '두 판이 겹친다');
    for (const p of L.panels) {
      assert.ok(inside(withTitle(p), 334, 673), `${p.level}층 판이 화면 밖`);
      assert.ok(p.frame.y + p.frame.h <= L.legend.y - 12 + EPS, '범례와 겹친다');
      // 판 범위의 두 귀퉁이가 판 안쪽에 들어온다(층마다 제 축척으로)
      for (const [x, z] of [[p.bounds.x1, p.bounds.z1], [p.bounds.x2, p.bounds.z2]]) {
        const [px, py] = toCanvas(p.t, x, z);
        assert.ok(px >= p.frame.x + FULL.pad - EPS && px <= p.frame.x + p.frame.w - FULL.pad + EPS);
        assert.ok(py >= p.frame.y + FULL.pad - EPS && py <= p.frame.y + p.frame.h - FULL.pad + EPS);
      }
    }
  }
  // 층을 바꾸면 큰 판이 바뀐다(1층은 늘 위, 2층은 늘 아래)
  const up = fullLayout(redrawn, 334, 673, 1, tall);
  const down = fullLayout(redrawn, 334, 673, 2, tall);
  assert.ok(up.panels[0].frame.h > up.panels[1].frame.h && down.panels[1].frame.h > down.panels[0].frame.h);
  assert.ok(up.panels[0].frame.y < up.panels[1].frame.y && down.panels[0].frame.y < down.panels[1].frame.y);
  // 넓은 캔버스(데스크탑)는 예전 그대로 같은 축척
  const desk = fullLayout(redrawn, 1150, 640, 1, tall);
  assert.equal(desk.panels[0].t.s, desk.panels[1].t.s);
  assert.equal(desk.panels[0].frame.w, desk.panels[1].frame.w);
});

test('넓고 낮은 데스크탑 창은 휴대폰 배치가 아니다: 어느 층에 서 있어도 두 판이 같은 축척이고 판 자리가 같다', () => {
  // 창 높이를 줄여 캔버스 짧은 변이 FOCUS_BELOW보다 작아져도 긴 변이 넓으면 그대로 둔다(층을 오갈 때 판이 바뀌지 않게)
  assert.ok(453 < FOCUS_BELOW && 1152 >= FOCUS_LONG_BELOW);
  assert.equal(focusCanvas(1152, 453), false);
  assert.equal(focusCanvas(453, 1152), false);
  const on1 = fullLayout(redrawn, 1152, 453, 1);
  const on2 = fullLayout(redrawn, 1152, 453, 2);
  for (const L of [on1, on2]) assert.equal(L.panels[0].t.s, L.panels[1].t.s, '같은 축척');
  assert.deepEqual(on1.panels.map((p) => p.frame), on2.panels.map((p) => p.frame), '층이 바뀌어도 판 자리는 같다');
  // 휴대폰은 세로든 가로든 그대로 지금 층을 크게(가장 큰 휴대폰 가로 화면도 포함)
  for (const [W, H] of [[390, 664], [334, 673], [844, 390], [932, 430], [800, 300]]) assert.equal(focusCanvas(W, H), true, `${W}x${H}`);
  // 태블릿과 보통 데스크탑은 아니다
  for (const [W, H] of [[1024, 613], [1280, 645], [768, 869], [960, 400]]) assert.equal(focusCanvas(W, H), false, `${W}x${H}`);
});

test('좁은 캔버스에서도 지금 층은 같은 축척일 때보다 작아지지 않는다(층 크기가 크게 달라도)', () => {
  // 한 층이 다른 층보다 훨씬 큰 경우: 큰 층이 이미 길이의 대부분을 쓰고 있어도 줄이지 않는다
  const uneven: [Bounds, Bounds] = [{ x1: 0, x2: 12, z1: 0, z2: 30 }, { x1: 0, x2: 8, z1: 0, z2: 4 }];
  const main = 673 - 2 * FULL.outer - FULL.legend - FULL.gap - 2 * (FULL.title + 2 * FULL.pad);
  const cross = 334 - 2 * FULL.outer - 2 * FULL.pad;
  const shared = Math.min(cross / 12, main / 34);
  for (const active of [1, 2] as Level[]) {
    const L = fullLayout(redrawn, 334, 673, active, uneven);
    if (L.dir !== 'column') continue;
    assert.ok(L.panels[active - 1].t.s >= shared - EPS, `${active}층: ${L.panels[active - 1].t.s} < ${shared}`);
    for (const p of L.panels) assert.ok(p.t.s > 0 && inside(p.frame, 334, 673));
  }
});

test('drawMap은 캔버스를 스스로 지우지 않는다(호출자가 화소에 맞춰 한 번 지운다)', () => {
  for (const mode of ['mini', 'full'] as const) {
    const { ctx, log } = fakeCtx();
    drawMap(ctx, redrawn, { x: redrawn.spawn.x, z: redrawn.spawn.z, level: 1, yaw: 0 }, { mode, width: 300, height: 300, theme: 'light' });
    assert.equal(log.filter((c) => c.op === 'clearRect').length, 0, `${mode}: 두 번 지운다`);
    assert.ok(log.some((c) => c.op === 'fillRect'), `${mode}: 그리기는 한다`);
  }
});

// ───────── 영어 지도: 판 제목 1F·2F, 「You are here」, 범례 넷, 구역·자리 이름은 장소 이름 표로(집 데이터는 한국어 그대로)
const hangul = /[가-힣]/;
test('지도 말 표: 한국어와 영어가 같은 차례로 다 있고, 영어에 한글이 없다', () => {
  assert.equal(MAP_WORDS.en.legend.length, MAP_WORDS.ko.legend.length);
  for (const s of [MAP_WORDS.en.here, ...MAP_WORDS.en.legend]) assert.ok(s.trim() && !hangul.test(s), s);
  assert.equal(floorTitle(1), '1층');
  assert.equal(floorTitle(2, 'en'), '2F');
});

test('영어 자리 이름: 판이 말하는 층은 빼고 옮기며, 길면 낱말 끝에서 줄인다. 모르는 이름·가족이 지은 이름은 한국어 줄이기 그대로', () => {
  const spot = (title: string, kind = 'room') => ({ id: title, level: 1, x: 0, z: 0, r: 1, title, line: '', kind }) as unknown as Parameters<typeof spotLabel>[0];
  assert.equal(spotLabel(spot('1층 거실 무대'), 1, undefined, 'en'), 'Living room stage'.length > SPOT_EN_MAX ? 'Living room…' : 'Living room stage');
  assert.equal(spotLabel(spot('포토존'), 1, undefined, 'en'), 'Photo spot');
  assert.equal(spotLabel(spot('1층 거실'), 2, undefined, 'en'), '1F Living room');
  assert.equal(spotLabel(spot('누군가의 아주 긴 방 이름'), 1, undefined, 'en'), '누군가의 아주…');
  assert.equal(spotLabel(spot('1층 거실 무대'), 1), '거실 무대', '한국어는 예전 그대로');
  const family = { id: 'p', level: 1, x: 0, z: 0, r: 1, title: '생각 지도 방', line: '', kind: 'portal', slug: 'mind' } as unknown as Parameters<typeof spotLabel>[0];
  assert.equal(spotLabel(family, 1, () => '별이의 방', 'en'), '별이의 방');
  assert.equal(clipEn('Paper ball target room', SPOT_EN_MAX), 'Paper ball…');
  assert.equal(clipEn('Favorite things room', SPOT_EN_MAX), 'Favorite things…');
  assert.equal(clipEn('Photo spot', SPOT_EN_SMALL_MAX), 'Photo spot');
  assert.equal(clipEn('Wedding stage', SPOT_EN_SMALL_MAX), 'Wedding…');
  assert.equal(clipEn('Supercalifragilistic', 10), 'Supercali…');
});

for (const [name, w0] of worlds) {
  const w = name === '다시 그린 집' ? w0 : stageHouse(structuredClone(w0), 'wedding');
  test(`${name}: 영어 지도에는 한글이 없다(미니맵·전체 지도, 넓은 화면·휴대폰). 판 제목·알약·범례는 영어`, () => {
    for (const lv of [1, 2] as Level[]) {
      const st: MapState = { x: w.spawn.x, z: w.spawn.z, level: lv, yaw: 0.3 };
      for (const [mode, W, H] of [['mini', 180, 180], ['mini', 120, 120], ['full', 1280, 800], ['full', 390, 780], ['full', 360, 640]] as const) {
        const { ctx, log } = fakeCtx();
        drawMap(ctx, w, st, { mode, width: W, height: H, theme: 'light', lang: 'en' });
        const tx = texts(log);
        // 실제 집의 이름이 표에 없으면 한국어로 남는다(그때는 표에 더한다)
        for (const t of tx) assert.ok(!hangul.test(t), `${mode} ${W}x${H} ${lv}층: ${t}`);
        if (mode === 'full') {
          assert.ok(tx.includes('1F') && tx.includes('2F'), '두 층 제목');
          assert.equal(tx.filter((s) => s === 'You are here').length, 1);
          for (const legend of MAP_WORDS.en.legend) assert.ok(tx.includes(legend), `범례 ${legend}`);
        }
      }
    }
  });
}

test('영어 범례는 휴대폰 너비 안에 든다(넘치면 글씨를 줄인다), 한국어 범례 글씨는 그대로 12px', () => {
  for (const W of [320, 360, 390]) {
    const { ctx, log } = fakeCtx();
    drawMap(ctx, redrawn, { x: redrawn.spawn.x, z: redrawn.spawn.z, level: 1, yaw: 0 }, { mode: 'full', width: W, height: 640, theme: 'light', lang: 'en' });
    // 범례 상자: 마지막 roundRect 경로(arcTo 넷) 앞의 moveTo가 왼쪽 끝 + 반지름
    const fonts = log.filter((c) => c.op === '=font').map((c) => String(c.args[0]));
    const legendFont = fonts.filter((f) => /^500 \d+px/.test(f)).pop()!;
    const size = Number(/^500 (\d+)px/.exec(legendFont)![1]);
    // 가짜 캔버스는 글자당 7px: 범례 글 너비 + 표시·간격이 캔버스 안
    const total = MAP_WORDS.en.legend.reduce((a, s) => a + 22 + s.length * 7, 0) + 16 * 3 + 24;
    assert.ok(size <= 12 && size >= 9, `${W}: ${size}px`);
    if (total <= W - 8) assert.equal(size, 12, `${W}: 들어가면 줄이지 않는다`);
  }
  const { ctx, log } = fakeCtx();
  drawMap(ctx, redrawn, { x: redrawn.spawn.x, z: redrawn.spawn.z, level: 1, yaw: 0 }, { mode: 'full', width: 320, height: 640, theme: 'light', lang: 'ko' });
  assert.ok(!log.some((c) => c.op === '=font' && /^500 (9|10|11)px/.test(String(c.args[0]))), '한국어는 줄이지 않는다');
});
