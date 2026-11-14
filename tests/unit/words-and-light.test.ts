import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(spec, ctx, next) { try { return next(spec, ctx); } catch(e) { if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx); throw e; } } });
const { QUESTIONS, makeQuiz, parseCollection } = await import('../../src/games/poetry/questions.ts');
const { coverage, brushRadius, alphaMask, dilate } = await import('../../src/games/atelier/brush.ts');
const { buildWorld } = await import('../../src/content/world.ts');
const { buildRoomWorld } = await import('../../src/content/room-worlds.ts');
const { stageHouse } = await import('../../src/walk/staging.ts');
const { addLivingEasel } = await import('../../src/walk/atelier-placement.ts');
// 글과 빛이 드는 곳: 받은 시 문항, 문장 수집함, 글씨 판정, 붓 굵기, 방 소품, 거실 창가 이젤
test('시 문항: 받은 구절 20개와 비워 둔 6자리를 그대로 두고, 한 판은 서로 다른 6문항·보기 넷', () => {
  assert.equal(QUESTIONS.length, 26);
  assert.equal(QUESTIONS.filter(q => q.passage.trim()).length, 20);
  assert.equal(QUESTIONS.filter(q => !q.passage.trim()).length, 6);
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, 26);
  for (let seed = 0; seed < 100; seed++) {
    const deck = makeQuiz(seed);
    assert.equal(deck.length, 6);
    assert.equal(new Set(deck.map(q => q.question.id)).size, 6);
    for (const row of deck) { assert.ok(row.question.passage.trim()); assert.equal(new Set(row.choices).size, 4); assert.ok(row.choices.includes(row.question.poet)); }
  }
  assert.notDeepEqual(makeQuiz(10), makeQuiz(20));
});
test('문장 수집함: 겹친 id·모르는 id·빈 구절·깨진 값은 버린다', () => {
  assert.deepEqual(parseCollection('["han-1","han-1","baek-1",null,"unknown"]'), ['han-1']);
  assert.deepEqual(parseCollection('{broken'), []);
});
test('글씨 판정: 체본 60% 이상을 덮고 바깥 먹이 30%를 넘지 않아야 완성', () => {
  const guide = new Uint8Array(100); guide.fill(1, 0, 10);
  const ink = new Uint8Array(100); ink.fill(1, 0, 6);
  assert.equal(coverage(guide, ink).complete, true);
  ink[5] = 0; assert.equal(coverage(guide, ink).complete, false);
  ink.fill(1); assert.equal(coverage(guide, ink).complete, false);
  assert.equal(coverage(new Uint8Array(100), ink).complete, false);
  const rgba = new Uint8ClampedArray([0,0,0,0, 0,0,0,255]); assert.deepEqual([...alphaMask(rgba)], [0,1]);
  const single = new Uint8Array(25); single[12] = 1; assert.equal(dilate(single, 5, 1).reduce((a,b) => a+b,0),9);
});
test('붓 굵기: 펜은 필압, 마우스와 필압 없는 손가락은 속도', () => {
  const p = { x: 10, y: 0, time: 10, pressure: .8, pointerType: 'pen' };
  assert.ok(brushRadius(p, null, 12) > brushRadius({...p,pressure:.2},null,12));
  const from = {...p, x:0,time:0,pointerType:'mouse'};
  assert.ok(brushRadius({...from, x:100,time:10},from,12) < brushRadius({...from,x:10,time:100},from,12));
  // 필압 없는 손가락(0.5 고정)은 마우스처럼 속도로 굵기를 정한다
  const touch = {...from, pointerType:'touch', pressure:.5};
  assert.ok(brushRadius({...touch, x:100,time:10},touch,12) < brushRadius({...touch,x:10,time:100},touch,12));
});
test('글과 빛이 드는 곳: 창은 하나, 시집 책장·벼루 서안이 놀이 입구, 비스듬한 빛줄기', () => {
  const room = buildRoomWorld('study')!;
  assert.equal(room.windows.length,1);
  assert.equal(room.zones[0].name,'글과 빛이 드는 곳');
  assert.deepEqual(room.room?.games,['poetry','calligraphy','sentences']);
  assert.ok(room.furniture.some(f => f.kind === 'poetryShelf'));
  assert.ok(room.furniture.some(f => f.kind === 'inkWritingDesk'));
  assert.equal(room.hotspots.some(h => h.game === 'watercolor'),false);
  assert.ok(room.furniture.some(f => f.kind === 'lightShaft'), 'slanted light shaft');
});
test('거실 창가 이젤: 다시 그린 집과 손질한 실제 집 모두 한 번만, 창 앞 걸을 수 있는 자리', () => {
  const redrawn = buildWorld();
  assert.equal(redrawn.hotspots.filter(h => h.game === 'watercolor').length,1);
  assert.equal(addLivingEasel(redrawn),redrawn);
  // 이젤은 창에서 1m 안쪽, 그 앞에 서는 자리는 부딪히는 상자 밖
  const easel = redrawn.furniture.find(f => f.kind === 'watercolorEasel')!;
  const spot = redrawn.hotspots.find(h => h.game === 'watercolor')!;
  const nearWindow = redrawn.windows.some(w => w.level === easel.level && w.axis === 'x' && Math.abs((easel.z1 + easel.z2) / 2 - w.at) <= 1.0 && (easel.x1 + easel.x2) / 2 > w.from - .1 && (easel.x1 + easel.x2) / 2 < w.to + .1);
  assert.ok(nearWindow, 'easel stands at a window');
  assert.ok(!redrawn.physics.boxes.some(b => b.level === spot.level && spot.x > b.x1 && spot.x < b.x2 && spot.z > b.z1 && spot.z < b.z2), 'spot is walkable');
  const raw = structuredClone(redrawn); raw.kind = 'real';
  raw.hotspots = raw.hotspots.filter(h => h.game !== 'watercolor'); raw.furniture = raw.furniture.filter(f => f.kind !== 'watercolorEasel');
  const real = stageHouse(raw,'plain');
  assert.equal(real.hotspots.filter(h => h.game === 'watercolor').length,1);
  assert.equal(raw.hotspots.some(h => h.game === 'watercolor'),false);
});
test('글씨·수채는 점수를 지어내지 않는다', () => {
  for (const file of ['calligraphy/CalligraphyGame.tsx','watercolor/WatercolorGame.tsx']) {
    assert.doesNotMatch(readFileSync(new URL('../../src/games/'+file, import.meta.url),'utf8'), /\bscore\s*:/);
  }
});
