// 종이공 과녁 순수 계산 시험: 포물선, 명중 판정, 점수와 연속 보너스, 깡통 쓰러짐, 같은 씨앗이면 같은 판.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_R, CLEAR_SCORE, DUCK_UP_MS, EYE, HAND, POINTS, ROUND_MS, TUNE,
  accuracy, aimAt, ballAt, createRound, fitFov, flightTime, launchVelocity, nextSeed, readBest, ringOf,
  saveBest, segmentPlaneZ, segmentSphere, step, streakBonus, summary, throwBall,
  type GameEvent, type Level, type Round, type Target, type Vec3,
} from '../../src/games/target/logic.ts';

const rayTo = (p: Vec3) => ({ o: EYE, d: { x: p.x - EYE.x, y: p.y - EYE.y, z: p.z - EYE.z } });
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

/** ms만큼 16ms씩 진행하며 사건을 모은다 */
function run(s: Round, ms: number): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let t = 0; t < ms; t += 16) ev.push(...step(s, Math.min(16, ms - t)));
  return ev;
}

/** 과녁 하나를 겨눠 던지고 공이 닿을 때까지 기다린다 */
function shoot(s: Round, tg: Vec3): GameEvent[] {
  const { point } = aimAt(s, rayTo(tg));
  const ev = throwBall(s, point);
  assert.equal(ev.length, 1, '던지기가 받아들여져야 한다');
  return [...ev, ...run(s, 1200)];
}

const hitsOf = (ev: GameEvent[]) => ev.filter((e): e is Extract<GameEvent, { t: 'hit' }> => e.t === 'hit');
const byKind = (s: Round, kind: Target['kind']) => s.targets.filter((t) => t.kind === kind);

test('포물선: 처음 속도로 T초 뒤 정확히 겨눈 자리에 닿고, 가운데에서는 직선보다 위로 뜬다', () => {
  const to = { x: -1.35, y: 1.75, z: -4.1 };
  const T = flightTime(HAND, to);
  assert.ok(T >= 0.35 && T <= 0.72);
  const v = launchVelocity(HAND, to, T);
  const end = ballAt(HAND, v, T);
  for (const k of ['x', 'y', 'z'] as const) assert.ok(close(end[k], to[k], 1e-9), k);
  const mid = ballAt(HAND, v, T / 2);
  assert.ok(mid.y > (HAND.y + to.y) / 2 + 0.2, '종이공이 둥글게 날아간다');
  assert.ok(flightTime(HAND, to, 'easy') < T, '쉬운 판은 조금 더 빨리 닿는다');
});

test('판정: 선분과 공, 빠른 공도 건너뛰지 않음, 평면 지나기', () => {
  const c = { x: 0, y: 0, z: 0 };
  const t = segmentSphere({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -2 }, c, 0.5);
  assert.ok(t !== null && close(t, 0.375));
  assert.equal(segmentSphere({ x: 0.6, y: 0, z: 2 }, { x: 0.6, y: 0, z: -2 }, c, 0.5), null, '비껴가면 안 맞음');
  assert.equal(segmentSphere({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 3 }, c, 0.5), null, '아직 닿지 않음');
  assert.ok(segmentSphere({ x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: -50 }, c, 0.1) !== null, '한 걸음에 지나쳐도 잡는다');
  assert.equal(segmentSphere({ x: 0, y: 0, z: 0.1 }, { x: 0, y: 0, z: -1 }, c, 0.5), 0, '이미 안에 있으면 0');
  assert.ok(close(segmentPlaneZ({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, 0)!, 0.5));
  assert.equal(segmentPlaneZ({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, 0), null, '뒤에서 앞으로는 아님');
});

test('점수: 고리, 연속 보너스, 명중률', () => {
  assert.equal(ringOf(0.05, 0.32), 0);
  assert.equal(ringOf(0.16, 0.32), 1);
  assert.equal(ringOf(0.3, 0.32), 2);
  assert.equal(ringOf(0.33, 0.32), null);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 12].map(streakBonus), [0, 5, 10, 15, 20, 25, 25, 25]);
  assert.equal(accuracy(0, 0), 0);
  assert.equal(accuracy(2, 3), 67);
  assert.equal(nextSeed(7), nextSeed(7));
  assert.notEqual(nextSeed(7), 7);
});

test('과녁판 가운데를 겨누면 가운데 고리, 연달아 맞히면 보너스, 빗나가면 연속이 끊긴다', () => {
  const s = createRound(1, 'easy');
  const left = byKind(s, 'board')[0];
  const right = byKind(s, 'board')[2];
  const h1 = hitsOf(shoot(s, left));
  assert.equal(h1.length, 1);
  assert.equal(h1[0].target, left.id);
  assert.equal(h1[0].ring, 0);
  assert.equal(h1[0].points, POINTS.board[0]);
  const h2 = hitsOf(shoot(s, right));
  assert.equal(h2[0].streak, 2);
  assert.equal(h2[0].bonus, 5);
  assert.equal(s.score, POINTS.board[0] * 2 + 5);
  // 과녁 없는 벽 높은 곳(쉬운 판 끌어당김도 닿지 않는 자리)
  const ev = shoot(s, { x: 2.6, y: 2.4, z: -4.18 });
  assert.equal(hitsOf(ev).length, 0);
  assert.ok(ev.some((e) => e.t === 'miss'));
  assert.equal(s.streak, 0);
  const h3 = hitsOf(shoot(s, left));
  assert.equal(h3[0].bonus, 0);
  assert.equal(s.hits, 3);
  assert.equal(s.throws, 4);
  assert.equal(summary(s).accuracy, 75);
});

test('깡통: 아래 가운데를 맞히면 위 셋도 쓰러지고, 다 쓰러지면 보너스 뒤 다시 선다', () => {
  const s = createRound(2, 'normal');
  const cans = byKind(s, 'can');
  const ev = shoot(s, cans[1]);
  const h = hitsOf(ev);
  assert.equal(h.length, 1);
  assert.equal(h[0].kind, 'can');
  assert.equal(h[0].target, cans[1].id, '아래 가운데 깡통');
  assert.equal(ev.filter((e) => e.t === 'fall').length, 4);
  assert.equal(h[0].extra, 3 * POINTS.can);
  assert.deepEqual(cans.map((c) => c.down), [false, true, false, true, true, true]);
  assert.equal(hitsOf(shoot(s, cans[0]))[0].extra, 0, '혼자 서 있던 깡통');
  const h2 = hitsOf(shoot(s, cans[2]));
  assert.equal(h2[0].extra, POINTS.allCans, '여섯 개를 다 쓰러뜨림');
  const back = run(s, 1300);
  assert.equal(back.filter((e) => e.t === 'reset').length, 6);
  assert.ok(cans.every((c) => !c.down));
});

test('오리: 맞으면 넘어지고 잠시 뒤 다시 일어선다', () => {
  const s = createRound(3, 'normal');
  const duck = byKind(s, 'duck')[1];
  const ev = shoot(s, duck);
  assert.equal(hitsOf(ev)[0]?.target, duck.id);
  assert.ok(duck.down);
  const later = run(s, DUCK_UP_MS);
  assert.ok(later.some((e) => e.t === 'reset' && e.target === duck.id));
  assert.equal(duck.down, false);
});

test('풍선: 떠오르다 천장 가까이에서 사라지고, 쉬운 판은 움직임을 미리 겨눠 맞힌다', () => {
  const s = createRound(4, 'easy');
  const spawned = run(s, 1300).filter((e) => e.t === 'spawn');
  assert.ok(spawned.length >= 1, '판이 시작되고 곧 풍선이 뜬다');
  const b = byKind(s, 'balloon')[0];
  const y0 = b.y;
  run(s, 500);
  assert.ok(b.y > y0, '위로 떠오른다');
  const ev = shoot(s, b);
  const h = hitsOf(ev).find((e) => e.kind === 'balloon');
  assert.ok(h, '풍선을 맞힌다');
  assert.equal(h.points, b.gold ? POINTS.gold : POINTS.balloon);
  assert.ok(!s.targets.includes(b), '터진 풍선은 사라진다');
  const t = createRound(4, 'normal');
  run(t, 30_000);
  assert.ok(t.targets.filter((x) => x.kind === 'balloon').every((x) => x.y <= 2.4 + 1e-9));
});

test('쉬운 판은 조금 빗나가게 겨눠도 가까운 과녁으로 끌어당긴다', () => {
  const s = createRound(5, 'easy');
  const duck = byKind(s, 'duck')[0];
  const off = { x: duck.x - 0.25, y: duck.y + 0.2, z: duck.z };
  assert.equal(aimAt(s, rayTo(off)).target, duck.id);
  const n = createRound(5, 'normal');
  assert.equal(aimAt(n, rayTo(off)).target, null, '보통 판은 끌어당기지 않는다');
  assert.ok(TUNE.easy.size > TUNE.normal.size);
});

/** 정해진 손: 0.9초마다 과녁을 돌아가며 겨눈다(풍선이 있으면 풍선 먼저). 씨앗으로 겨눔이 조금씩 흔들린다 */
function bot(seed: number, level: Level, wobble: number) {
  const s = createRound(seed, level);
  const log: string[] = [];
  let k = 0;
  let r = seed;
  const jitter = () => ((r = nextSeed(r)) / 2 ** 31 - 0.5) * 2 * wobble;
  while (s.phase !== 'over') {
    if (s.now % 900 < 16 && s.phase === 'play') {
      const live = s.targets.filter((t) => !t.down);
      const tg = live.find((t) => t.kind === 'balloon') ?? live[k++ % live.length];
      const p = { x: tg.x + jitter(), y: tg.y + jitter(), z: tg.z };
      for (const e of throwBall(s, aimAt(s, rayTo(p)).point)) log.push(JSON.stringify(e));
    }
    for (const e of step(s, 16)) log.push(JSON.stringify(e));
    assert.ok(s.now < ROUND_MS + 5000, '판이 끝나야 한다');
  }
  return { s, log };
}

test('같은 씨앗·같은 던지기면 같은 판, 씨앗이 다르면 풍선이 다르게 뜬다', () => {
  const a = bot(77, 'normal', 0.1);
  const b = bot(77, 'normal', 0.1);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(summary(a.s), summary(b.s));
  const firstSpawn = (seed: number) => {
    const s = createRound(seed, 'normal');
    run(s, 2000);
    return byKind(s, 'balloon').map((t) => [t.x, t.z, t.vy]);
  };
  assert.deepEqual(firstSpawn(9), firstSpawn(9));
  assert.notDeepEqual(firstSpawn(9), firstSpawn(10));
});

test('60초가 지나면 더 던질 수 없고, 날아가던 공이 닿은 뒤 한 번만 끝난다', () => {
  const s = createRound(11, 'normal');
  run(s, ROUND_MS - 100);
  assert.equal(s.phase, 'play');
  const left = byKind(s, 'board')[0];
  throwBall(s, aimAt(s, rayTo(left)).point);
  const ev = run(s, 2000);
  assert.equal(s.phase, 'over');
  assert.equal(ev.filter((e) => e.t === 'end').length, 1);
  assert.ok(ev.findIndex((e) => e.t === 'hit') < ev.findIndex((e) => e.t === 'end'), '종 울리기 전에 던진 공은 점수에 든다');
  assert.deepEqual(throwBall(s, left), []);
  assert.deepEqual(step(s, 16), []);
  assert.equal(summary(s).ms, ROUND_MS);
  const ticks = createRound(12, 'easy');
  const t = run(ticks, ROUND_MS).filter((e) => e.t === 'tick').map((e) => (e as { left: number }).left);
  assert.deepEqual(t, [5, 4, 3, 2, 1]);
});

test('쉬운 판은 서툴게 던져도 100점을 넘고, 보통 판도 차분히 던지면 넘는다', () => {
  for (const seed of [1, 2, 3]) {
    const easy = bot(seed, 'easy', 0.25);
    assert.ok(easy.s.score >= CLEAR_SCORE, `쉬운 판 ${seed}: ${easy.s.score}`);
    assert.ok(summary(easy.s).cleared);
    assert.ok(easy.log.some((l) => l.includes('"t":"clear"')));
    const normal = bot(seed, 'normal', 0.04);
    assert.ok(normal.s.score >= CLEAR_SCORE, `보통 판 ${seed}: ${normal.s.score}`);
  }
});

test('던지기 쉬는 틈과 날아가는 공 수', () => {
  const s = createRound(13, 'normal');
  const p = { x: 0, y: 1.5, z: -4 };
  assert.equal(throwBall(s, p).length, 1);
  assert.equal(throwBall(s, p).length, 0, '바로 또 던질 수는 없다');
  run(s, 200);
  assert.equal(throwBall(s, p).length, 1);
});

test('최고 점수는 이 기기에, 깨진 값은 0으로 본다', () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(readBest(store, 'easy'), 0);
  assert.equal(saveBest(store, 'easy', 120), true);
  assert.equal(saveBest(store, 'easy', 90), false);
  assert.equal(saveBest(store, 'normal', 60), true);
  assert.equal(readBest(store, 'easy'), 120);
  assert.equal(readBest(store, 'normal'), 60);
  m.set('jy.game.target.best.v1', '{망가짐');
  assert.equal(readBest(store, 'easy'), 0);
  assert.equal(readBest(null, 'easy'), 0);
  assert.equal(saveBest(store, 'easy', 10), true);
});

test('세로 화면은 시야를 넓혀 벽 좌우가 보이게', () => {
  assert.equal(fitFov(1.6), 50);
  assert.ok(fitFov(0.56) > 62 && fitFov(0.56) <= 82);
  assert.equal(fitFov(0.2), 82);
  assert.ok(BALL_R > 0 && HAND.z < EYE.z);
});
