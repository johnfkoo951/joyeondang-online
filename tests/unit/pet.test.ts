// 반려동물 검사: 갈 곳 고르기, 같은 시각이면 같은 자리(결정성), 칸 경계에서 튀지 않기, 길만 따라 걷기, 길이 없을 때·설정이 없을 때,
// 서버 설정 읽기와 이름을 주는 범위, 공개 폴더의 모형 파일 약속.
// 다시 그린 집, 걷기용으로 손질한 집, 그리고 실제 집 JSON(HOUSE_WORLD_JSON)이 있으면 그것도 돈다(좌표·이름은 찍지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import type { HouseWorld } from '../../src/walk/types.ts';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
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
const { buildRoomWorld, ROOM_SCENES } = await import('../../src/content/room-worlds.ts');
const { findPath, openSpot } = await import('../../src/walk/nav.ts');
const { RADIUS, blocked, inRamp } = await import('../../src/walk/physics.ts');
const { stageHouse } = await import('../../src/walk/staging.ts');
const { tuneWorld } = await import('../../src/walk/tune.ts');
const P = await import('../../src/walk/pet.ts');
const { petSpecFrom, PET_ASSET } = await import('../../src/walk/pet-spec.ts');
const { loadPet, petPayload, friendWalkName, resolvePetFriends, previewFriendLookup, petFriendNames, forgetPetFriends } = await import('../../src/lib/pet.ts');
const { gameName } = await import('../../src/lib/game-token.ts');
type PetSpot = import('../../src/walk/pet.ts').PetSpot;
type NavPoint = import('../../src/walk/nav.ts').NavPoint;

const realPath = process.env.HOUSE_WORLD_JSON || process.env.JY_HOUSE_WORLD_JSON;
const real: HouseWorld | null = realPath && existsSync(realPath) ? JSON.parse(readFileSync(realPath, 'utf8')) : null;
const worlds: Array<[string, HouseWorld]> = [
  ['다시 그린 집', buildWorld({})],
  ['다시 그린 집(손질)', stageHouse({ ...structuredClone(buildWorld({})), kind: 'real' }, 'wedding')],
  ...(real ? [['실제 집(손질)', stageHouse(structuredClone(real), 'wedding')] as [string, HouseWorld]] : []),
];
const S = P.PET_SLOT_MS;
/** 시험에 쓰는 칸 번호들의 출발점(아무 날의 오전) */
const K0 = P.petSlot(Date.UTC(2026, 10, 12, 1, 0, 0));
const spotsOf = new Map(worlds.map(([n, w]) => [n, P.petSpots(w)] as const));

for (const [name, w] of worlds) {
  const spots = spotsOf.get(name)!;
  const p = tuneWorld(w).physics;
  const spawn: NavPoint = { x: w.spawn.x, z: w.spawn.z, y: 0, level: 1 };

  test(`${name}: 갈 곳은 마당과 집 안에 고루, 모두 평평한 바닥이고 들어오는 자리에서 걸어갈 수 있다`, () => {
    const zones = new Set(spots.map((s) => s.zone));
    assert.ok(zones.has('yard') && zones.has('house'), `갈래 ${[...zones].join(',')}`);
    assert.ok(spots.length >= 6 && spots.length <= 80, `갈 곳 ${spots.length}`);
    for (const s of spots) {
      assert.ok([s.x, s.y, s.z, s.yaw].every(Number.isFinite));
      assert.equal(p.ramps.some((r) => inRamp(r, s.x, s.z)), false, '계단 위에서 쉬지 않는다');
      assert.equal(blocked(p, s.level, s.x, s.z, RADIUS), false);
      assert.equal(s.zone === 'up', s.level === 2);
      assert.ok(findPath(w, spawn, s), '들어오는 자리에서 길이 있다');
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i], b = spots[j];
      if (a.level === b.level) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.2 - 1e-9, '가까운 자리는 하나로');
    }
  });

  test(`${name}: 같은 시각이면 같은 자리(일정을 따로 만들어도, 순서를 바꿔 물어도)`, () => {
    const a = P.petPlan(w, spots);
    const b = P.petPlan(w, P.petSpots(w));
    const times: number[] = [];
    for (let i = 0; i < 300; i++) times.push(K0 * S + i * 1777.7);
    const fa = times.map((t) => a.at(t));
    const fb = [...times].reverse().map((t) => b.at(t)).reverse();
    assert.deepEqual(fa, fb);
    // 칸 하나만 따로 계산해도 같다(앞 칸을 몰라도 된다)
    const t = (K0 + 7) * S + 12_345;
    assert.deepEqual(P.petPlan(w, spots).at(t), a.at(t));
  });

  test(`${name}: 칸 경계에서 튀지 않고, 칸 안에 닿아 쉬며, 길에서 벗어나지 않는다`, () => {
    const plan = P.petPlan(w, spots);
    let moving = 0, ups = 0, total = 0, steep = 0;
    for (let k = K0; k < K0 + 120; k++) {
      const leg = plan.leg(k)!;
      assert.ok(leg, '칸마다 길');
      assert.ok(leg.pts.length >= 2, '길을 찾았다');
      assert.ok(leg.arrive + P.PET_TURN_MS <= S - 4000, '칸이 끝나기 전에 닿아 쉰다');
      assert.ok(leg.speed >= P.PET_WALK && leg.speed < 4, `빠르기 ${leg.speed}`);
      if (leg.to.zone === 'up') ups++;
      const end = P.petState(leg, leg.t0 + S - 1);
      const next = plan.at(leg.t0 + S)!;
      assert.equal(end.pose, 'rest');
      // 다음 칸은 그 자리·그 방향에서 시작한다(바로 떠나는 칸이면 그때 일어선다)
      assert.deepEqual([next.x, next.y, next.z, next.yaw, next.moving], [end.x, end.y, end.z, end.yaw, false], '다음 칸은 그 자리에서 시작');
      let prev = P.petState(leg, leg.t0);
      for (let u = 100; u < S; u += 100) {
        const st = P.petState(leg, leg.t0 + u);
        assert.ok([st.x, st.y, st.z, st.yaw, st.dist].every(Number.isFinite));
        // 한 걸음(0.1초)에 빠르기만큼만 간다: 벽을 건너뛰지 않는다
        assert.ok(Math.hypot(st.x - prev.x, st.z - prev.z) <= leg.speed * 0.1 + 1e-6);
        assert.equal(blocked(p, st.level, st.x, st.z, 0.2), false, '벽·가구를 뚫지 않는다');
        if (st.pose === 'rest') {
          assert.equal(p.ramps.some((r) => inRamp(r, st.x, st.z)), false);
          assert.equal(st.pitch, 0, '앉아 있을 때는 기울지 않는다');
        }
        assert.ok(Math.abs(st.pitch) < 1, '계단에서도 몸은 조금만 기운다');
        steep = Math.max(steep, Math.abs(st.pitch));
        if (st.moving) moving++;
        total++;
        prev = st;
      }
    }
    assert.ok(moving / total > 0.2 && moving / total < 0.8, `걷는 몫 ${(moving / total).toFixed(2)}`);
    assert.ok(ups < 30, `2층은 가끔(${ups}/120)`);
    // 2층에 다녀왔으면 계단에서 몸을 기울였다
    if (ups > 0) assert.ok(steep > 0.2, `계단 기울기 ${steep.toFixed(2)}`);
  });

  test(`${name}: 친구 곁 자리는 친구에게서 0.7~1.5m, 같은 층의 평평한 칸, 들어오는 자리에서 길이 있고, 앉으면 친구를 본다`, () => {
    let found = 0, asked = 0;
    for (const s of spots) {
      // 친구가 갈 곳 둘레에 서 있다(조금 비켜서)
      const f = { n: '시험 손님', x: s.x + 0.31, z: s.z - 0.17, level: s.level };
      for (let k = K0; k < K0 + 4; k++) {
        asked++;
        const v = P.petVisitStop(w, f, k);
        if (!v) continue;
        found++;
        const d = Math.hypot(v.x - f.x, v.z - f.z);
        assert.ok(d >= 0.7 && d <= 1.5, `친구와 ${d.toFixed(2)}m`);
        assert.equal(v.level, f.level);
        assert.equal(v.friend, true);
        assert.equal(p.ramps.some((r) => inRamp(r, v.x, v.z)), false, '계단 위에서 쉬지 않는다');
        assert.equal(blocked(p, v.level, v.x, v.z, RADIUS), false);
        assert.ok(findPath(w, spawn, v), '들어오는 자리에서 길이 있다');
        const want = Math.atan2(f.x - v.x, f.z - v.z);
        assert.ok(Math.abs(Math.atan2(Math.sin(v.yaw - want), Math.cos(v.yaw - want))) < 1e-9, '앉으면 친구를 본다');
        // 같은 칸·같은 자리면 늘 같은 자리
        assert.deepEqual(P.petVisitStop(w, f, k), v);
      }
    }
    assert.ok(found >= asked * 0.9, `곁 자리 ${found}/${asked}`);
    // 걸을 수 없는 곳(세계 밖)에 있는 친구에게는 가지 않는다
    assert.equal(P.petVisitStop(w, { n: '시험 손님', x: 1e5, z: 1e5, level: 1 }, K0), null);
  });

  test(`${name}: 친구 찾아가기 일정 — 같은 사람들을 보는 화면은 같은 판단, 칸 경계에서 튀지 않고, 늦게 본 화면은 그 칸을 정해진 일정대로 두었다가 다음 칸에 만난다`, () => {
    const cfg = [{ n: '가람 손님', w: 3 }, { n: '누리 손님', w: 1 }];
    const yard = spots.find((s) => s.zone === 'yard')!, house = spots.filter((s) => s.zone === 'house').at(-1)!;
    const people = [
      { n: '누리 손님', x: house.x + 0.2, z: house.z, level: house.level },
      { n: '지나가는 손님', x: yard.x - 2, z: yard.z, level: yard.level },
      { n: '가람 손님', x: yard.x, z: yard.z + 0.3, level: yard.level },
    ];
    const seen = P.petPresent(cfg, people);
    assert.deepEqual(seen.map((f) => f.n), ['가람 손님', '누리 손님']);
    // 다른 화면은 사람 목록의 차례가 달라도 같은 목록을 본다
    assert.deepEqual(P.petPresent(cfg, [...people].reverse()), seen);
    const a = P.petPlan(w, spots), b = P.petPlan(w, spots), late = P.petPlan(w, spots), alone = P.petPlan(w, spots);
    const N = 60, LATE = K0 + 30;
    // 화면처럼 한 칸씩 앞서 정한다(정한 칸은 지금 칸 앞뒤 몇 칸만 기억한다)
    const decideAll = (k: number) => {
      a.decide(k, seen);
      b.decide(k, P.petPresent(cfg, [...people].reverse()));
      late.decide(k, k >= LATE + 1 ? seen : null);
    };
    decideAll(K0 - 1);
    decideAll(K0);
    let visits = 0, runs = 0, meows = 0, before = 0;
    for (let k = K0; k < K0 + N; k++) {
      decideAll(k + 1);
      const leg = a.leg(k)!;
      if (k === K0) before = a.visits() - (a.stop(K0 + 1)!.friend ? 1 : 0) - (a.stop(K0)!.friend ? 1 : 0);
      if (a.stop(k)!.friend) {
        visits++;
        assert.equal(leg.visit, true);
        assert.notEqual(leg.meowAt, null, '친구 곁에 닿으면 운다');
        if (leg.len > 4) {
          runs++;
          assert.equal(leg.gait, 'run');
          assert.ok(leg.speed >= 2 && leg.speed <= 2.6, `뛰는 빠르기 ${leg.speed}`);
        }
      }
      assert.ok(leg.arrive + P.PET_TURN_MS <= S - 4000, '칸이 끝나기 전에 닿아 쉰다');
      // 칸 경계: 다음 칸은 이 칸이 끝난 자리·방향에서 시작한다
      const end = P.petState(leg, leg.t0 + S - 1);
      const next = a.at(leg.t0 + S)!;
      assert.equal(end.pose, 'rest');
      assert.deepEqual([next.x, next.y, next.z, next.yaw, next.moving], [end.x, end.y, end.z, end.yaw, false]);
      let prev = P.petState(leg, leg.t0);
      let sawRun = false;
      for (let u = 100; u < S; u += 100) {
        const st = P.petState(leg, leg.t0 + u);
        assert.deepEqual(st, b.at(leg.t0 + u), '같은 사람들을 보는 두 화면은 같은 자리');
        assert.ok(Math.hypot(st.x - prev.x, st.z - prev.z) <= leg.speed * 0.1 + 1e-6, '한 걸음에 빠르기만큼만');
        if (st.moving && prev.moving) assert.ok(st.dist >= prev.dist - 1e-9, '가는 동안 간 거리는 줄지 않는다');
        assert.equal(blocked(p, st.level, st.x, st.z, 0.2), false, '벽·가구를 뚫지 않는다');
        if (st.moving) assert.equal(st.gait, st.speed >= P.PET_RUN_FROM ? 'run' : 'walk');
        if (st.gait === 'run') sawRun = true;
        if (st.meow) meows++;
        prev = st;
      }
      if (leg.gait === 'run') assert.ok(sawRun, '뛰는 길에서는 뛰는 때가 있다');
      // 늦게 본 화면: 보지 못한 칸은 정해진 일정, 그다음 칸 끝에는 같은 자리에서 만나고 그 뒤로는 같다
      if (k < LATE) assert.deepEqual(late.at(leg.t0 + 20_000), alone.at(leg.t0 + 20_000));
      if (k === LATE + 1) assert.deepEqual(late.at(leg.t0 + S - 1), a.at(leg.t0 + S - 1));
      if (k > LATE + 1) assert.deepEqual(late.at(leg.t0 + 12_345), a.at(leg.t0 + 12_345));
    }
    // 무게 합 4: 4 / 5.5 ≈ 0.73. 곁 자리가 없으면 돌아다닌다
    assert.ok(visits >= N * 0.5 && visits <= N * 0.9, `찾아간 칸 ${visits}/${N}`);
    assert.ok(runs > 0, '먼 친구에게는 뛰어간다');
    assert.ok(meows > 0);
    // 정한 칸 수: 앞서 정한 첫 칸(K0 - 1)과 마지막에 하나 더 정한 칸(K0 + N)까지
    assert.equal(a.visits(), before + visits + (a.stop(K0 + N)!.friend ? 1 : 0));
  });

  test(`${name}: 쉬는 동안 둘러본다 — 시선이 여러 쪽으로 바뀌고, 쉬는 창의 처음과 끝은 원래 쪽, 크게 돌 때만 일어서고, 털 고를 때와 말할 때는 돌지 않는다`, () => {
    const plan = P.petPlan(w, spots, { rests: ['loaf', 'groom', 'lie'] });
    let rested = 0, looked = 0, stood = 0, step = 0;
    const offs = new Set<number>();
    for (let k = K0; k < K0 + 120; k++) {
      const leg = plan.leg(k)!;
      for (const r of leg.rests) {
        if (r.b - r.a < 3) continue;
        // 칸 시작 시각이 커서 1ms 안쪽은 부동소수 반올림이 갈린다
        for (const u of [r.a + 1, r.b - 1]) {
          const st = P.petState(leg, leg.t0 + u);
          assert.equal(st.glance, 0, '쉬는 창의 처음과 끝에서는 원래 쪽');
          assert.equal(st.yaw, r.stop.yaw + 0);
        }
        if (r.stop.rest === 'groom') assert.equal(r.glances.length, 0, '털 고르는 중에는 둘러보지 않는다');
        for (const g of r.glances) {
          assert.ok(g.t0 >= r.a && g.t1 <= r.b - 800 + 1e-6, '창 안에서 돌고, 끝나기 전에 돌아와 있다');
          assert.equal(g.stand, Math.abs(g.to - g.from) >= P.GLANCE_STAND);
          assert.ok(Math.abs(g.to - g.from) <= 2.8 + 1e-9, '한 번에 반 바퀴 넘게 돌지 않는다');
        }
        if (r.glances.length) assert.equal(r.glances.at(-1)!.to, 0, '마지막에는 원래 쪽으로');
      }
      let prev = P.petState(leg, leg.t0);
      for (let u = 50; u < S; u += 50) {
        const st = P.petState(leg, leg.t0 + u);
        if (!st.moving && !prev.moving && st.x === prev.x && st.z === prev.z) {
          // 제자리에서 도는 빠르기(떠날 때·닿았을 때 돌기 포함): 50ms에 0.36rad 안
          const d = Math.abs(Math.atan2(Math.sin(st.yaw - prev.yaw), Math.cos(st.yaw - prev.yaw)));
          step = Math.max(step, d);
          assert.ok(d < 0.36, `제자리에서 ${d.toFixed(2)}rad를 50ms에`);
        }
        if (st.pose === 'rest' || st.resettle) {
          rested++;
          if (st.glance !== 0) {
            looked++;
            offs.add(Math.round(st.glance * 4));
          }
          if (st.resettle) {
            stood++;
            assert.equal(st.pose, 'walk', '크게 돌 때는 일어서서');
          }
          if (st.meow) assert.equal(st.glance, 0, '말하는 동안은 돌지 않는다');
          if (st.rest === 'groom') assert.equal(st.glance, 0);
        }
        prev = st;
      }
    }
    assert.ok(looked / rested > 0.25 && looked / rested < 0.9, `둘러보는 몫 ${(looked / rested).toFixed(2)}`);
    assert.ok(offs.size >= 8, `본 쪽 ${offs.size}가지`);
    assert.ok(stood > 0 && stood / rested < 0.1, `일어선 몫 ${(stood / rested).toFixed(3)}`);
  });

  test(`${name}: 친구 곁에서는 말하는 동안 친구를 보고, 그 뒤 고개를 돌렸다가 다시 친구를 본다`, () => {
    const cfg = [{ n: '가람 손님', w: 3 }];
    const yard = spots.find((s) => s.zone === 'yard')!;
    const seen = P.petPresent(cfg, [{ n: '가람 손님', x: yard.x, z: yard.z + 0.3, level: yard.level }]);
    const plan = P.petPlan(w, spots);
    let friendWins = 0, away = 0, back = 0;
    // 화면처럼 한 칸씩 앞서 정한다(정한 칸은 지금 칸 앞뒤 몇 칸만 기억한다)
    plan.decide(K0 - 1, seen);
    plan.decide(K0, seen);
    for (let k = K0; k < K0 + 60; k++) {
      plan.decide(k + 1, seen);
      const leg = plan.leg(k)!;
      if (!leg.to.friend || leg.meowAt === null || leg.len <= 1e-6) continue;
      // 말하는 동안은 친구를 본다
      for (let u = leg.meowAt + 50; u < leg.meowAt + P.PET_MEOW_MS; u += 250) {
        const st = P.petState(leg, leg.t0 + u);
        assert.equal(st.meow, true);
        assert.equal(st.yaw, leg.to.yaw + 0, '말하는 동안은 친구 쪽');
      }
      const end = leg.rests.find((r) => r.stop === leg.to)!;
      assert.ok(end.a >= leg.meowAt + P.PET_MEOW_MS, '둘러보기는 말을 마친 뒤');
      friendWins++;
      for (let i = 0; i < end.glances.length; i++) {
        const g = end.glances[i];
        if (g.from === 0 && g.to !== 0) away++;
        if (g.from !== 0 && g.to === 0 && i < end.glances.length - 1) back++;
      }
    }
    assert.ok(friendWins >= 10, `친구 곁에서 말한 칸 ${friendWins}`);
    assert.ok(away >= friendWins * 0.8, `고개를 돌린 번 ${away}/${friendWins}`);
    assert.ok(back > 0, '창이 끝나기 전에도 다시 친구를 본다');
  });
}

test('둘러보기 일정: 털 고를 때·짧은 창은 없음, 같은 값이면 같은 일정, 칸마다 다르다, 끝은 원래 쪽', () => {
  assert.deepEqual(P.petGlances(K0, 1, 0, S, 'groom', false), []);
  assert.deepEqual(P.petGlances(K0, 1, 0, 3000, 'sit', false), []);
  const a = P.petGlances(K0, 1, 5000, S, 'sit', false);
  assert.ok(a.length >= 3, `둘러본 번 ${a.length}`);
  assert.deepEqual(P.petGlances(K0, 1, 5000, S, 'sit', false), a);
  assert.notDeepEqual(P.petGlances(K0 + 1, 1, 5000, S, 'sit', false), a);
  assert.notDeepEqual(P.petGlances(K0, 0, 5000, S, 'sit', false), a);
  assert.equal(a.at(-1)!.to, 0);
  for (let i = 1; i < a.length; i++) {
    assert.equal(a[i].from, a[i - 1].to, '앞에서 본 쪽에서 이어서 돈다');
    assert.ok(a[i].t0 >= a[i - 1].t1 + 2000 - 1e-9, '한 쪽을 적어도 2초 본다');
  }
  // 누우면 덜 돈다
  const lie = P.petGlances(K0, 1, 5000, S, 'lie', false);
  const most = (g: typeof a) => Math.max(...g.map((x) => Math.abs(x.to)));
  assert.ok(most(lie) <= 2.6 * 0.5 + 1e-9 && most(a) <= 2.6 + 1e-9);
  // 도는 동안의 각은 앞뒤 값 사이, 일어서는 것은 크게 돌 때만
  for (const g of a) {
    for (let u = g.t0; u <= g.t1; u += 40) {
      const { off, stand } = P.petGlanceAt(a, u);
      assert.ok(off >= Math.min(g.from, g.to) - 1e-9 && off <= Math.max(g.from, g.to) + 1e-9);
      assert.equal(stand, u < g.t1 && g.stand);
    }
  }
  assert.deepEqual(P.petGlanceAt(a, a[0].t0 - 1), { off: 0, stand: false });
  assert.deepEqual(P.petGlanceAt([], 1234), { off: 0, stand: false });
});

test('찾아가기 몫과 친구 고르기: 무게 합 W로 W/(W+1.5), 많아도 0.8. 무게만큼 자주 고른다. 같은 칸이면 늘 같은 판단', () => {
  const at = (n: string, w: number) => ({ n, w, x: 0, z: 0, level: 1 as const });
  const share = (list: ReturnType<typeof at>[], n = 4000) => {
    let hit = 0;
    const by = new Map<string, number>();
    for (let k = K0; k < K0 + n; k++) {
      const f = P.petVisitPick(list, k);
      assert.deepEqual(P.petVisitPick(list, k), f);
      if (f) { hit++; by.set(f.n, (by.get(f.n) ?? 0) + 1); }
    }
    return { p: hit / n, by };
  };
  const two = share([at('가람 손님', 3), at('누리 손님', 3)]);
  assert.ok(Math.abs(two.p - 0.8) < 0.03, `둘 다 무게 3: ${two.p}`);
  assert.ok(Math.abs(two.by.get('가람 손님')! / two.by.get('누리 손님')! - 1) < 0.15);
  const one = share([at('다솜 손님', 1)]);
  assert.ok(Math.abs(one.p - 0.4) < 0.03, `무게 1 한 명: ${one.p}`);
  const mix = share([at('가람 손님', 3), at('다솜 손님', 1)]);
  const r = mix.by.get('가람 손님')! / mix.by.get('다솜 손님')!;
  assert.ok(r > 2.4 && r < 3.7, `무게 3:1 → ${r.toFixed(2)}`);
  assert.equal(P.petVisitPick([], K0), null);
  // 이름이 아닌 사람, 무게 없는 이름, 자리가 이상한 사람은 친구로 세지 않는다
  assert.deepEqual(P.petPresent([{ n: '가람 손님', w: 3 }], [{ n: '가람', x: 0, z: 0, level: 1 }, { n: '가람 손님', x: Number.NaN, z: 0, level: 1 }]), []);
  assert.deepEqual(P.petPresent(undefined, [{ n: '가람 손님', x: 0, z: 0, level: 1 }]), []);
  // 같은 이름이 둘이면 자리 차례로 앞의 하나(어느 화면에서나 같은 하나)
  assert.deepEqual(P.petPresent([{ n: '가람 손님', w: 2 }], [{ n: '가람 손님', x: 3, z: 0, level: 1 }, { n: '가람 손님', x: 1, z: 5, level: 1 }]),
    [{ n: '가람 손님', w: 2, x: 1, z: 5, level: 1 }]);
});

test('칸 정하기: 지난 칸은 굳히고, 지금 칸은 시작한 지 1초 안에 처음 본 화면만 친구로 정한다. 다음 칸은 2초 앞서 정한다', () => {
  const w = buildWorld({});
  const spots = spotsOf.get('다시 그린 집')!;
  const s = spots.find((x) => x.zone === 'house')!;
  const seen = P.petPresent([{ n: '가람 손님', w: 3 }], [{ n: '가람 손님', x: s.x, z: s.z, level: s.level }]);
  // 찾아가기로 정해지는 칸을 고른다
  let k = K0;
  while (!P.petVisitPick(seen, k) || !P.petVisitPick(seen, k + 1)) k++;
  let asked = 0;
  const who = () => { asked++; return seen; };
  // 칸 k가 시작한 지 0.5초에 처음 본 화면: 지난 칸은 정해진 일정, 이 칸은 친구로
  const a = P.petPlan(w, spots);
  assert.equal(P.petSettle(a, k * S + 500, who), null);
  assert.equal(a.stop(k - 1)!.friend, false);
  assert.equal(a.stop(k)!.friend, true);
  // 칸이 끝나기 2초 전부터 다음 칸을 정한다(한 번만)
  assert.equal(P.petSettle(a, k * S + 30_000, who), null);
  assert.equal(P.petSettle(a, (k + 1) * S - 1500, who), k + 1);
  assert.equal(P.petSettle(a, (k + 1) * S - 1000, who), null);
  assert.equal(a.stop(k + 1)!.friend, true);
  assert.equal(asked, 2);
  // 칸 k가 시작한 지 5초에 처음 본 화면: 그 칸은 정해진 일정(보이던 모습을 바꾸지 않는다)
  const b = P.petPlan(w, spots);
  P.petSettle(b, k * S + 5000, who);
  assert.equal(b.stop(k)!.friend, false);
  assert.deepEqual(b.at(k * S + 20_000), P.petPlan(w, spots).at(k * S + 20_000));
  // 친구가 없으면(null) 늘 정해진 일정
  const c = P.petPlan(w, spots);
  for (let t = k * S - 3000; t < (k + 3) * S; t += 250) P.petSettle(c, t, () => null);
  assert.equal(c.visits(), 0);
  for (let t = k * S; t < (k + 3) * S; t += 999) assert.deepEqual(c.at(t), P.petPlan(w, spots).at(t));
  // 정한 칸을 담아 둔 곳을 나눠 쓰면(장면을 다시 지어도) 이어 간다
  const memory = new Map();
  const d = P.petPlan(w, spots, { memory });
  P.petSettle(d, k * S + 200, who);
  const again = P.petPlan(w, spots, { memory });
  P.petSettle(again, k * S + 9000, () => null);
  assert.deepEqual(again.at(k * S + 9000), d.at(k * S + 9000));
  assert.equal(again.stop(k)!.friend, true);
});

test('쉬는 자세: 더 있는 자세가 없으면 늘 앉고, 있으면 혼자일 때 고루, 친구 곁에서는 거의 앉는다(가끔 식빵 자세)', () => {
  const all = ['loaf', 'groom', 'lie'] as const;
  const count = (kinds: readonly ('loaf' | 'groom' | 'lie')[], friend: boolean) => {
    const by = new Map<string, number>();
    for (let k = K0; k < K0 + 3000; k++) {
      const r = P.petRestFor(k, kinds, friend);
      by.set(r, (by.get(r) ?? 0) + 1);
    }
    return by;
  };
  assert.deepEqual([...count([], false).keys()], ['sit']);
  assert.deepEqual([...count([], true).keys()], ['sit']);
  const alone = count(all, false);
  for (const r of ['sit', ...all]) assert.ok(Math.abs(alone.get(r)! / 3000 - 0.25) < 0.04, `${r} ${alone.get(r)}`);
  const near = count(all, true);
  assert.deepEqual([...near.keys()].sort(), ['loaf', 'sit']);
  assert.ok(near.get('sit')! / 3000 > 0.75 && near.get('sit')! / 3000 < 0.85);
  assert.deepEqual([...count(['lie'], false).keys()].sort(), ['lie', 'sit']);
  // 일정이 고른 자세는 그 칸 끝에 앉을 때와 다음 칸에 떠나기 전까지 같다
  const w = buildWorld({});
  const spots = spotsOf.get('다시 그린 집')!;
  const plan = P.petPlan(w, spots, { rests: all });
  const kinds = new Set<string>();
  for (let k = K0; k < K0 + 40; k++) {
    const leg = plan.leg(k)!;
    const st = P.petState(leg, leg.t0 + S - 1);
    assert.equal(st.pose, 'rest');
    assert.equal(st.rest, plan.stop(k)!.rest);
    const next = plan.at((k + 1) * S)!;
    if (next.pose === 'rest') assert.equal(next.rest, st.rest);
    kinds.add(st.rest);
  }
  assert.equal(kinds.size, 4);
});

test('혼자 닿을 때는 셋에 하나쯤 운다. 말풍선은 앉은 뒤 4.5초, 칸 안에서 끝난다', async () => {
  const w = buildWorld({});
  const spots = spotsOf.get('다시 그린 집')!;
  const plan = P.petPlan(w, spots);
  let moved = 0, sang = 0;
  for (let k = K0; k < K0 + 600; k++) {
    const leg = plan.leg(k)!;
    if (leg.len <= 1e-6) continue;
    moved++;
    if (leg.meowAt === null) continue;
    sang++;
    assert.equal(leg.meowAt, leg.arrive + P.PET_TURN_MS);
    assert.ok(leg.meowAt + P.PET_MEOW_MS <= S);
    // 칸 시작 시각이 커서 1ms 안쪽은 부동소수 반올림이 갈린다
    assert.equal(P.petState(leg, leg.t0 + leg.meowAt - 1).meow, false);
    assert.equal(P.petState(leg, leg.t0 + leg.meowAt + 1).meow, true);
    assert.equal(P.petState(leg, leg.t0 + leg.meowAt + P.PET_MEOW_MS - 1).meow, true);
    assert.equal(P.petState(leg, leg.t0 + leg.meowAt + P.PET_MEOW_MS + 1).meow, false);
  }
  assert.ok(Math.abs(sang / moved - 1 / 3) < 0.06, `${sang}/${moved}`);
  // 일정이 띄우는 말은 말풍선이 떠 있는 동안 읽힌다(누른 말과 같은 셈법)
  const talk = await import('../../src/walk/pet-talk.ts');
  for (const l of [...talk.PET_FRIEND_LINES, ...talk.PET_ALONE_LINES]) {
    assert.ok(talk.petTalkMs(l) <= P.PET_MEOW_MS + 300, `${talk.petLineText(l)} ${talk.petTalkMs(l)}ms`);
  }
});

test('세 칸마다 마당 한 번, 집 안 두 번. 2층은 가끔이고 바로 앞 칸과 같은 자리는 고르지 않는다', () => {
  const spots = spotsOf.get('다시 그린 집')!;
  let up = 0, n = 0;
  for (let k = K0; k < K0 + 900; k++) {
    const d = P.petDest(spots, k)!;
    const m = ((k % 3) + 3) % 3;
    if (m === 0) assert.equal(d.zone, 'yard');
    else assert.notEqual(d.zone, 'yard');
    if (d.zone === 'up') up++;
    if (m !== 0) n++;
    assert.notEqual(d, P.petDest(spots, k - 1), '바로 앞 칸과 다른 자리');
  }
  assert.ok(up > 0 && up / n < 0.25, `2층 ${up}/${n}`);
  // 같은 씨앗이면 같은 고르기, 다른 씨앗이면 다른 일정
  const a = Array.from({ length: 30 }, (_, i) => P.petDest(spots, K0 + i));
  assert.deepEqual(Array.from({ length: 30 }, (_, i) => P.petDest(spots, K0 + i)), a);
  assert.notDeepEqual(Array.from({ length: 30 }, (_, i) => P.petDest(spots, K0 + i, 12345)), a);
});

test('주사위는 정수 계산만 쓴다: 값이 바뀌면 새 화면과 옛 화면의 일정이 서로 어긋난다(바꿀 때는 이 값도 함께)', () => {
  assert.deepEqual(
    [P.petDie(P.PET_SEED, 0, 0), P.petDie(P.PET_SEED, 1, 0), P.petDie(P.PET_SEED, 39_000_000, 2), P.petDie(1, 2, 3), P.petDie(P.PET_SEED, 2 ** 33 + 5, 1)],
    [1541738588, 1251320862, 2588293162, 925373698, 3328790712],
  );
  const seen = new Set<number>();
  for (let k = 0; k < 2000; k++) {
    const v = P.petDie(P.PET_SEED, k, 0);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32);
    seen.add(v % 10);
  }
  assert.equal(seen.size, 10);
  assert.equal(P.petSlot(0), 0);
  assert.equal(P.petSlot(S - 1), 0);
  assert.equal(P.petSlot(S), 1);
});

test('길이 없으면 그 칸 내내 출발 자리에 앉아 있다(길 찾기가 null이거나 던져도). 둘러보려고 잠깐 일어설 뿐 자리는 그대로', () => {
  const w = buildWorld({});
  const spots = spotsOf.get('다시 그린 집')!;
  for (const route of [() => null, () => { throw new Error('막힘'); }, () => [{ x: NaN, z: 0, y: 0, level: 1 as const }]]) {
    const plan = P.petPlan(w, spots, { route });
    for (let u = 0; u < S; u += 2500) {
      const t = (K0 + 4) * S + u;
      const st = plan.at(t)!;
      const from = P.petDest(spots, K0 + 3)!;
      assert.deepEqual([st.x, st.z, st.moving], [from.x, from.z, false]);
      assert.ok(st.pose === 'rest' || st.resettle, '앉아 있거나, 크게 돌려고 잠깐 일어섰다');
    }
  }
});

test('갈 곳이 없으면(방 장면, 빈 목록) 아무것도 보이지 않는다', () => {
  const w = buildWorld({});
  assert.equal(P.petPlan(w, []).at(K0 * S), null);
  assert.equal(P.petDest([], K0), null);
  assert.equal(P.petPlan(w, [] as PetSpot[]).at(Number.NaN), null);
  for (const slug of ROOM_SCENES.slice(0, 3)) {
    const room = buildRoomWorld(slug);
    assert.ok(room);
    assert.deepEqual(P.petSpots(room), []);
  }
});

test('열린 칸 맞추기: 들어오는 자리와 이어진 칸만, 평평한 바닥만 고를 수 있다', () => {
  const w = buildWorld({});
  const p = tuneWorld(w).physics;
  const at = openSpot(w, w.spawn.x, w.spawn.z, 1, 1, true)!;
  assert.ok(at && Math.hypot(at.x - w.spawn.x, at.z - w.spawn.z) <= 1);
  // 계단 한가운데를 물으면 평평한 칸만 고르라 했을 때 계단 밖으로 나온다
  const r = p.ramps[0];
  const mid = { x: (r.x1 + r.x2) / 2, z: (r.z1 + r.z2) / 2 };
  const onFlat = openSpot(w, mid.x, mid.z, 1, 3, true);
  if (onFlat) assert.equal(p.ramps.some((q) => inRamp(q, onFlat.x, onFlat.z)), false);
  assert.equal(openSpot(w, Number.NaN, 0, 1), null);
  assert.equal(openSpot(w, 1e6, 1e6, 1, 1), null);
});

// ───────── 서버 설정과 화면이 받는 값

test('PET_JSON: 없거나 깨졌거나 걷는 모형이 틀리면 꺼진다(null)', () => {
  assert.equal(loadPet(undefined), null);
  assert.equal(loadPet(''), null);
  assert.equal(loadPet('{'), null);
  assert.equal(loadPet('[]'), null);
  assert.equal(loadPet('"x"'), null);
  assert.equal(loadPet(JSON.stringify({ name: '이름' })), null);
  for (const walk of ['https://example.com/a.glb', '//example.com/a.glb', '/../a.glb', '/a/../b.glb', '/a.png', 'a.glb', '/a b.glb', '/.hidden.glb'])
    assert.equal(loadPet(JSON.stringify({ walk })), null, walk);
  const bare = { rests: null, friends: [] };
  assert.deepEqual(loadPet(JSON.stringify({ walk: '/pet-walk.glb' })), { name: null, walk: '/pet-walk.glb', rest: null, scale: 1, ...bare });
  assert.deepEqual(loadPet(JSON.stringify({ name: ' 지어낸 이름 ', walk: '/m/pet-walk.glb', rest: '/m/pet-rest.glb', scale: 0.6 })),
    { name: '지어낸 이름', walk: '/m/pet-walk.glb', rest: '/m/pet-rest.glb', scale: 0.6, ...bare });
  // 틀린 것은 그것만 뺀다
  assert.deepEqual(loadPet(JSON.stringify({ name: 'x'.repeat(21), walk: '/a.glb', rest: 'http://x/b.glb', scale: 9 })), { name: null, walk: '/a.glb', rest: null, scale: 1, ...bare });
  assert.equal(loadPet(JSON.stringify({ name: '줄\n바꿈', walk: '/a.glb' }))?.name, null);
});

test('PET_JSON: 더 있는 쉬는 자세와 친구(사용자 id·무게 1~3). 틀린 항목은 빼고, 같은 사람은 한 번, 여덟 명까지', () => {
  const A = '0f0e0d0c-0b0a-4908-8706-050403020100', B = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
  const cfg = loadPet(JSON.stringify({
    walk: '/pet-walk.glb',
    rests: { loaf: '/pet-loaf.glb', groom: 'https://x/g.glb', lie: '/m/pet-lie.glb', dance: '/d.glb' },
    friends: [{ user: A, w: 3 }, { user: B, w: 1 }, { user: A, w: 1 }, { user: 'not-an-id', w: 2 }, { user: B.toLowerCase(), w: 2 }, { user: A, w: 0 }, { w: 2 }, 7, null],
  }))!;
  assert.deepEqual(cfg.rests, { loaf: '/pet-loaf.glb', lie: '/m/pet-lie.glb' });
  assert.deepEqual(cfg.friends, [{ user: A, w: 3 }, { user: B.toLowerCase(), w: 1 }]);
  for (const w of [0, 4, 0.5, Number.NaN, '3', null]) assert.deepEqual(loadPet(JSON.stringify({ walk: '/a.glb', friends: [{ user: A, w }] }))?.friends, [], String(w));
  assert.equal(loadPet(JSON.stringify({ walk: '/a.glb', rests: { loaf: '../x.glb' } }))?.rests, null);
  const many = Array.from({ length: 20 }, (_, i) => ({ user: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, w: 1 }));
  assert.equal(loadPet(JSON.stringify({ walk: '/a.glb', friends: many }))?.friends.length, 8);
});

test('이름은 명단 손님 이상에게만, 모형은 누구에게나. 설정이 없으면 pet: null', () => {
  const cfg = loadPet(JSON.stringify({ name: '지어낸 이름', walk: '/pet-walk.glb', rest: '/pet-rest.glb' }));
  assert.deepEqual(petPayload(cfg, false, 5), { pet: { walk: '/pet-walk.glb', rest: '/pet-rest.glb' }, now: 5 });
  assert.deepEqual(petPayload(cfg, true, 5), { pet: { walk: '/pet-walk.glb', rest: '/pet-rest.glb', name: '지어낸 이름' }, now: 5 });
  assert.deepEqual(petPayload(null, true, 5), { pet: null, now: 5 });
  assert.deepEqual(petPayload(loadPet(JSON.stringify({ walk: '/a.glb', scale: 0.6 })), true, 1), { pet: { walk: '/a.glb', scale: 0.6 }, now: 1 });
});

test('화면이 받은 값 고치기: 모양이 틀리면 null, 시계 차이를 싣는다', () => {
  assert.equal(petSpecFrom(null), null);
  assert.equal(petSpecFrom({ rest: '/b.glb' }), null);
  assert.equal(petSpecFrom({ walk: 'https://x/a.glb' }), null);
  assert.deepEqual(petSpecFrom({ walk: '/a.glb' }), { walk: '/a.glb' });
  assert.deepEqual(petSpecFrom({ walk: '/a.glb', rest: '/b.glb', name: ' 이름 ', scale: 0.5 }, 1234), { walk: '/a.glb', rest: '/b.glb', name: '이름', scale: 0.5, clock: 1234 });
  assert.deepEqual(petSpecFrom({ walk: '/a.glb', rest: '../b.glb', name: 7, scale: 'big' }, Number.NaN), { walk: '/a.glb' });
  assert.ok(PET_ASSET.test('/pet-walk.glb') && !PET_ASSET.test('/pet-walk.glb?x=1'));
  // 더 있는 쉬는 자세, 친구(이름·무게), 내 이름(친구가 있을 때만)
  assert.deepEqual(
    petSpecFrom({ walk: '/a.glb', rests: { loaf: '/l.glb', groom: '//x/g.glb' }, friends: [{ n: '별 손님', w: 3 }, { n: ' 띄움', w: 1 }, { n: '별 손님', w: 1 }, { n: '달 손님', w: 9 }, { n: '해 손님', w: 1 }], me: '별 손님' }),
    { walk: '/a.glb', rests: { loaf: '/l.glb' }, friends: [{ n: '별 손님', w: 3 }, { n: '해 손님', w: 1 }], me: '별 손님' },
  );
  assert.deepEqual(petSpecFrom({ walk: '/a.glb', me: '별 손님' }), { walk: '/a.glb' });
  assert.deepEqual(petSpecFrom({ walk: '/a.glb', friends: [{ n: '', w: 1 }, { n: 'x'.repeat(17), w: 1 }, { n: '줄\n바꿈', w: 1 }] }), { walk: '/a.glb' });
});

test('라우트: 매번 누가 묻는지 확인하고, 이름·친구는 명단 손님(또는 이 맥의 미리보기)일 때만 읽고 싣는다. 응답은 저장하지 않는다', () => {
  const src = readFileSync(new URL('../../src/app/api/pet/route.ts', import.meta.url), 'utf8');
  const steps = [
    'await connection()', 'getViewer()', 'const preview = await previewForRequest()', "canUse(viewer.role, 'realHouse') || preview", 'loadPet()',
    '(preview && previewFriendLookup()) || dbFriendLookup', 'named && cfg ? await petFriendNames(cfg, lookup) : []',
    'petPayload(cfg, named, Date.now(), friends, gameName(viewer.name))',
  ];
  const at = steps.map((s) => src.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `빠진 단계 ${steps.filter((_, i) => at[i] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(src, /'Cache-Control': 'private, no-store'/);
});

test('친구 이름: 출입증 이름과 같은 차례(별명 → 명단 이름, gameName). 못 읽은 사람·「손님」으로 보일 사람은 빼고, 같은 이름은 무게가 큰 쪽', async () => {
  assert.equal(friendWalkName(undefined), null);
  assert.equal(friendWalkName({ nickname: null, roster: null }), null);
  assert.equal(friendWalkName({ nickname: '  ', roster: '명단 이름' }), '명단 이름');
  assert.equal(friendWalkName({ nickname: ' 별명 ', roster: '명단 이름' }), '별명');
  assert.equal(friendWalkName({ nickname: null, roster: '이름이 아주 길어서 열여섯 글자를 넘는 사람' }), gameName('이름이 아주 길어서 열여섯 글자를 넘는 사람'));
  assert.equal(friendWalkName({ nickname: '손님', roster: '명단 이름' }), null);
  const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', C = '00000000-0000-4000-8000-00000000000c';
  const table = new Map([[A, { nickname: '바람 손님', roster: null }], [B, { nickname: null, roster: '바람 손님' }], [C, { nickname: null, roster: null }]]);
  let asked: readonly string[] = [];
  const lookup = async (u: readonly string[]) => { asked = u; return table; };
  assert.deepEqual(await resolvePetFriends([{ user: A, w: 1 }, { user: B, w: 3 }, { user: C, w: 2 }], lookup), [{ n: '바람 손님', w: 3 }]);
  assert.deepEqual(asked, [A, B, C]);
  assert.deepEqual(await resolvePetFriends([{ user: A, w: 1 }], async () => { throw new Error('x'); }), []);
  assert.deepEqual(await resolvePetFriends([], lookup), []);
  // 미리보기 이름 표(이 맥에서만 부르는 쪽이 쓴다)
  const pv = previewFriendLookup(JSON.stringify({ [A.toUpperCase()]: '가짜 손님' }))!;
  assert.deepEqual(await resolvePetFriends([{ user: A, w: 2 }, { user: B, w: 1 }], pv), [{ n: '가짜 손님', w: 2 }]);
  assert.equal(previewFriendLookup('{'), null);
  assert.equal(previewFriendLookup(undefined), null);
});

test('친구 이름은 잠깐 기억한다(설정이 같을 때만). 아무도 못 읽었으면 짧게만', async () => {
  forgetPetFriends();
  const A = '00000000-0000-4000-8000-0000000000aa';
  const cfg = loadPet(JSON.stringify({ walk: '/a.glb', friends: [{ user: A, w: 2 }] }))!;
  let calls = 0;
  const ok = async () => { calls++; return new Map([[A, { nickname: '숲 손님', roster: null }]]); };
  assert.deepEqual(await petFriendNames(cfg, ok, 1_000), [{ n: '숲 손님', w: 2 }]);
  assert.deepEqual(await petFriendNames(cfg, ok, 30_000), [{ n: '숲 손님', w: 2 }]);
  assert.equal(calls, 1);
  await petFriendNames(cfg, ok, 70_000);
  assert.equal(calls, 2);
  forgetPetFriends();
  let fails = 0;
  const bad = async () => { fails++; throw new Error('x'); };
  assert.deepEqual(await petFriendNames(cfg, bad, 0), []);
  await petFriendNames(cfg, bad, 5_000);
  assert.equal(fails, 1, '실패도 잠깐은 기억한다');
  await petFriendNames(cfg, bad, 11_000);
  assert.equal(fails, 2);
  assert.deepEqual(await petFriendNames(loadPet(JSON.stringify({ walk: '/a.glb' }))!, bad, 0), []);
  forgetPetFriends();
});

test('친구와 내 이름은 명단 손님 이상에게만, 친구가 있을 때만 내 이름. 사용자 id는 나가지 않는다', () => {
  const A = '00000000-0000-4000-8000-0000000000ab';
  const cfg = loadPet(JSON.stringify({ name: '지어낸 이름', walk: '/w.glb', rests: { lie: '/l.glb' }, friends: [{ user: A, w: 3 }] }))!;
  const friends = [{ n: '들꽃 손님', w: 3 }];
  const open = petPayload(cfg, false, 5, friends, '나');
  assert.deepEqual(open, { pet: { walk: '/w.glb', rests: { lie: '/l.glb' } }, now: 5 });
  const named = petPayload(cfg, true, 5, friends, '나');
  assert.deepEqual(named, { pet: { walk: '/w.glb', rests: { lie: '/l.glb' }, name: '지어낸 이름', friends: [{ n: '들꽃 손님', w: 3 }], me: '나' }, now: 5 });
  assert.equal(JSON.stringify(named).includes(A), false);
  assert.deepEqual(petPayload(cfg, true, 5, [], '나'), { pet: { walk: '/w.glb', rests: { lie: '/l.glb' }, name: '지어낸 이름' }, now: 5 });
});

// ───────── 공개 폴더의 모형 파일(있을 때만: 공개 레포에는 없다)

const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
await MeshoptDecoder.ready;
type Vec3 = [number, number, number];

/**
 * GLB의 JSON 청크와 꼭짓점(meshopt를 풀어, 메시 노드부터 맨 위 노드까지 배율·Y축 돌림·옮김을 곱한 자리. 사람 캐릭터 키 = 1).
 * 노드는 배율·옮김과 Y축 돌림만 쓴다(엔진은 노드 변환을 기하에 구워 넣으므로 다른 돌림도 그리기는 하지만, 약속을 잴 수 있게)
 */
function glbInfo(file: URL) {
  const b = readFileSync(file);
  assert.equal(b.readUInt32LE(0), 0x46546c67);
  assert.equal(b.readUInt32LE(4), 2);
  assert.equal(b.readUInt32LE(8), b.length);
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString('utf8'));
  const bin = b.subarray(20 + jlen + 8);
  type Node = { mesh?: number; children?: number[]; scale?: number[]; translation?: number[]; rotation?: number[]; matrix?: number[] };
  const nodes: Node[] = j.nodes;
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  for (const n of nodes) {
    assert.equal(n.matrix ?? null, null, '노드는 배율·옮김·돌림으로');
    if (n.rotation) assert.ok(Math.abs(n.rotation[0]) < 1e-9 && Math.abs(n.rotation[2]) < 1e-9, 'Y축 돌림만(위가 +Y 그대로)');
  }
  const meshNode = nodes.findIndex((n) => n.mesh !== undefined);
  const chain: Node[] = [];
  for (let i: number | undefined = meshNode; i !== undefined; i = parent.get(i)) chain.push(nodes[i]);
  const a = j.accessors[j.meshes[nodes[meshNode].mesh!].primitives[0].attributes.POSITION];
  const view = j.bufferViews[a.bufferView];
  const ext = view.extensions?.EXT_meshopt_compression;
  const stride: number = ext?.byteStride ?? view.byteStride;
  let raw: Uint8Array;
  if (ext) {
    raw = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(raw, ext.count, ext.byteStride, bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
  } else raw = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  assert.equal(a.componentType, 5122, 'short로 줄여 담은 꼭짓점');
  const pts: Vec3[] = [];
  for (let i = 0; i < a.count; i++) {
    const o = (a.byteOffset ?? 0) + i * stride;
    let p = [0, 1, 2].map((k) => {
      const v = dv.getInt16(o + k * 2, true);
      return a.normalized ? Math.max(v / 32767, -1) : v;
    }) as Vec3;
    for (const n of chain) {
      const s = n.scale ?? [1, 1, 1], t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1];
      // Y축 돌림 각(쿼터니언 [0, sin(a/2), 0, cos(a/2)])
      const ang = 2 * Math.atan2(q[1], q[3]), c = Math.cos(ang), sn = Math.sin(ang);
      const x = p[0] * s[0], y = p[1] * s[1], z = p[2] * s[2];
      p = [x * c + z * sn + t[0], y + t[1], -x * sn + z * c + t[2]];
    }
    pts.push(p);
  }
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  return { j, pts, size: hi.map((v, k) => v - lo[k]), low: lo[1], center: [0, 2].map((k) => (lo[k] + hi[k]) / 2), bytes: b.length };
}

const degOf = (dx: number, dz: number) => (Math.atan2(dx, dz) * 180) / Math.PI;
const meanOf = (a: Vec3[]) => [0, 1, 2].map((k) => a.reduce((s, p) => s + p[k], 0) / Math.max(1, a.length));

/** 걷는 자세: 뒷발 → 앞발(맨 아래 6% 꼭짓점을 앞뒤로 나눈 두 무리의 가운데) 방향(도, 0 = +Z) */
function pawAxis(pts: Vec3[]): number {
  const y0 = Math.min(...pts.map((p) => p[1])), h = Math.max(...pts.map((p) => p[1])) - y0;
  const low = pts.filter((p) => p[1] < y0 + 0.06 * h);
  const m = meanOf(low);
  const f = meanOf(low.filter((p) => p[2] > m[2])), b = meanOf(low.filter((p) => p[2] <= m[2]));
  return degOf(f[0] - b[0], f[2] - b[2]);
}

/** 걷는 자세: 몸통(높이 35~65%)을 앞뒤로 썬 조각마다 좌우 가운데를 잇는 선의 방향(도, 0 = +Z). 둥근 앞뒤 끝은 빼고 맞춘다 */
function torsoLine(pts: Vec3[]): number {
  const y0 = Math.min(...pts.map((p) => p[1])), h = Math.max(...pts.map((p) => p[1])) - y0;
  const band = pts.filter((p) => p[1] > y0 + 0.35 * h && p[1] < y0 + 0.65 * h);
  const z0 = Math.min(...band.map((p) => p[2])), z1 = Math.max(...band.map((p) => p[2]));
  const rows: Array<{ z: number; x: number }> = [];
  for (let i = 0; i < 16; i++) {
    const a = z0 + ((z1 - z0) * i) / 16, b = z0 + ((z1 - z0) * (i + 1)) / 16;
    const xs = band.filter((p) => p[2] >= a && p[2] < b).map((p) => p[0]).sort((p, q) => p - q);
    if (xs.length < 30) continue;
    rows.push({ z: (a + b) / 2, x: (xs[Math.floor(xs.length * 0.02)] + xs[Math.ceil(xs.length * 0.98) - 1]) / 2 });
  }
  const use = rows.slice(Math.floor(rows.length * 0.2), Math.ceil(rows.length * 0.8));
  const mz = use.reduce((s, r) => s + r.z, 0) / use.length, mx = use.reduce((s, r) => s + r.x, 0) / use.length;
  let num = 0, den = 0;
  for (const r of use) { num += (r.z - mz) * (r.x - mx); den += (r.z - mz) ** 2; }
  return degOf(num / den, 1);
}

/** 쉬는 자세: 가장 높은 2%(두 귀 끝)를 두 무리로 나눠 그 사이 선에 수직인, 머리 쪽 방향(도, 0 = +Z) */
function earFacing(pts: Vec3[]): number {
  const y0 = Math.min(...pts.map((p) => p[1])), h = Math.max(...pts.map((p) => p[1])) - y0;
  const top = [...pts].sort((p, q) => q[1] - p[1]).slice(0, Math.max(40, Math.floor(pts.length * 0.02)));
  let c = [top.reduce((m, p) => (p[0] < m[0] ? p : m)), top.reduce((m, p) => (p[0] > m[0] ? p : m))].map((p) => [p[0], p[2]]);
  for (let it = 0; it < 30; it++) {
    const g: number[][][] = [[], []];
    for (const p of top) g[(p[0] - c[0][0]) ** 2 + (p[2] - c[0][1]) ** 2 <= (p[0] - c[1][0]) ** 2 + (p[2] - c[1][1]) ** 2 ? 0 : 1].push([p[0], p[2]]);
    c = g.map((q, i) => (q.length ? [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length] : c[i]));
  }
  const mid = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
  let nx = -(c[1][1] - c[0][1]), nz = c[1][0] - c[0][0];
  const head = pts.filter((p) => p[1] > y0 + 0.62 * h);
  if (head.reduce((s, p) => s + (p[0] - mid[0]) * nx + (p[2] - mid[1]) * nz, 0) < 0) { nx = -nx; nz = -nz; }
  return degOf(nx, nz);
}

// 더 있는 쉬는 자세(식빵 자세·털 고르기·눕기)는 귀 끝 사이 거리를 걷는 자세와 같게 맞춘 배율로 구웠다(머리 크기가 같다)
for (const [file, tall] of [['pet-walk.glb', 0.498], ['pet-rest.glb', 0.446], ['pet-loaf.glb', 0.2757], ['pet-groom.glb', 0.4471], ['pet-lie.glb', 0.2822]] as const) {
  const url = new URL(`../../public/${file}`, import.meta.url);
  test(`모형 파일 ${file}: GLB 2, 메시 하나·그림 하나, 삼각형 1만 이하, 맨 아래 0, 사람 키 1 기준 크기, x·z 가운데가 원점`, { skip: !existsSync(url) }, () => {
    const { j, size, low, center, bytes } = glbInfo(url);
    assert.ok(bytes <= 2 * 1024 * 1024);
    assert.equal(j.meshes.length, 1);
    assert.equal(j.meshes[0].primitives.length, 1);
    assert.equal(j.images.length, 1);
    assert.equal(j.materials.length, 1);
    const tris = j.accessors[j.meshes[0].primitives[0].indices].count / 3;
    assert.ok(tris <= 10_000, `삼각형 ${tris}`);
    assert.ok(Math.abs(low) < 1e-4, `맨 아래가 y 0: ${low}`);
    assert.ok(Math.abs(size[1] - tall) < 0.01, `키 ${size[1]}`);
    assert.ok(Math.hypot(center[0], center[1]) < 0.005, `x·z 상자 가운데 ${center.map((v) => v.toFixed(4))}`);
    // 이름이 들어갈 자리(노드·메시·재질·그림 이름, 덧붙인 값)는 비워 둔다
    const text = JSON.stringify([j.nodes, j.meshes, j.materials, j.images, j.textures, j.extras ?? null, j.asset?.extras ?? null]);
    assert.doesNotMatch(text, /"name"|"extras"|"uri"/);
  });
}

// 엔진은 로컬 +Z를 가는 쪽(쉴 때는 보는 쪽)에 맞춘다. 걷는 자세가 비스듬하면 게걸음으로 걷고, 자세를 바꿀 때마다 몸이 그만큼 휙 돈다
const walkUrl = new URL('../../public/pet-walk.glb', import.meta.url);
const restUrl = new URL('../../public/pet-rest.glb', import.meta.url);
test('모형 방향: 걷는 자세는 앞뒤 발 축과 몸통 가운데 선이 +Z에서 5° 안, 쉬는 자세는 두 귀에 수직인 얼굴이 +Z에서 5° 안', { skip: !existsSync(walkUrl) || !existsSync(restUrl) }, () => {
  const walk = glbInfo(walkUrl).pts, rest = glbInfo(restUrl).pts;
  const paws = pawAxis(walk), torso = torsoLine(walk), face = earFacing(rest);
  assert.ok(Math.abs(paws) <= 5, `걷는 자세 앞뒤 발 축 ${paws.toFixed(1)}°`);
  assert.ok(Math.abs(torso) <= 5, `걷는 자세 몸통 가운데 선 ${torso.toFixed(1)}°`);
  assert.ok(Math.abs(face) <= 5, `쉬는 자세 얼굴 ${face.toFixed(1)}°`);
  // 재는 법 자체의 확인: 비스듬히(-25°) 돌려 놓으면 두 값 모두 크게 벗어난다(예전 파일이 이 꼴이었다)
  const c = Math.cos(-25 * Math.PI / 180), s = Math.sin(-25 * Math.PI / 180);
  const turned = walk.map(([x, y, z]) => [x * c + z * s, y, -x * s + z * c] as Vec3);
  assert.ok(pawAxis(turned) < -15 && torsoLine(turned) < -15, `비스듬한 모형 ${pawAxis(turned).toFixed(1)}° ${torsoLine(turned).toFixed(1)}°`);
});
