import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_SCENES, buildRoomWorld } from '../../src/content/room-worlds.ts';
import { getRoomExhibit } from '../../src/content/room-exhibits.ts';
import { STAGES, buildStageChart, judgeTap, summarizeStage, type HitRecord } from '../../src/games/groove/logic.ts';
import { CHORD_QUALITIES, generateEarDeck, scoreEarAnswer } from '../../src/games/pitch/logic.ts';
import { mergeServerAndLocal, parseLocalScores, upsertLocalScore, validateScorePayload } from '../../src/lib/leaderboard.ts';
import { pickGazedHotspot } from '../../src/walk/gaze.ts';
import { ROOM_VISTA_THEMES } from '../../src/walk/room-windows.ts';
import { environmentModel } from '../../src/walk/environment-models.ts';

test('모든 방 장면은 고유 창밖 세계 팔레트를 가지며, 모든 전시 hotspot이 유효한 아카이브에 연결된다', () => {
  for (const slug of ROOM_SCENES) {
    assert.ok(ROOM_VISTA_THEMES[slug], `${slug} 창밖 전망 테마 누락`);
    const w = buildRoomWorld(slug)!;
    const exhibits = w.hotspots.filter((h) => h.kind === 'exhibit');
    assert.ok(exhibits.length >= 1, `${slug} 전시 자리 없음`);
    for (const h of exhibits) {
      assert.ok(h.exhibit, `${slug} ${h.id} exhibit 키 누락`);
      const ex = getRoomExhibit(h.exhibit!);
      assert.ok(ex, `${slug} ${h.exhibit} 아카이브 데이터 없음`);
      assert.equal(ex!.room, slug);
      assert.ok(ex!.cards.length >= 1);
    }
  }
});

test('작업 차고는 그레나디어·CLA 45 3D 모델 매핑과 티구안 변경 계획·하네스 전시를 모두 포함한다', () => {
  const gModel = environmentModel('grenadier', 0);
  const cModel = environmentModel('cla45', 0);
  assert.equal(gModel?.url, '/environment/ineos-grenadier-v1.glb');
  assert.equal(cModel?.url, '/environment/mercedes-cla45-v1.glb');

  const garage = buildRoomWorld('garage')!;
  const kinds = new Set(garage.furniture.map((it) => it.kind));
  for (const k of ['grenadier', 'cla45', 'tiguanPlanWall', 'diecastDisplay', 'opsCommandRig', 'blueprintWall'] as const) {
    assert.ok(kinds.has(k), `차고 가구 ${k} 누락`);
  }
  const tiguanEx = getRoomExhibit('garage-tiguan');
  assert.ok(tiguanEx?.title.includes('티구안'));
});

test('시선(Gaze) 감지기는 반경 밖에서도 정면으로 바라보는 방 안 오브제를 weak+gazed로 하이라이트한다', () => {
  const mind = buildRoomWorld('mind')!;
  const jisanSpot = mind.hotspots.find((h) => h.id === 'exhibit-mind-jisan')!;
  // 출발 자리에 서서 정면(-z)의 지산 책상 쪽을 바라본다
  const hit = pickGazedHotspot(
    {
      level: 1,
      bodyX: 0,
      bodyZ: 2.5,
      camX: 0,
      camY: 1.6,
      camZ: 2.5,
      dirX: 0,
      dirY: -0.08,
      dirZ: -1,
    },
    mind.hotspots,
    true,
    null,
  );
  assert.equal(hit?.id, jisanSpot.id);
  assert.equal(hit?.weak, true);
  assert.equal(hit?.gazed, true);

  // 반대 방향(+z 출구 쪽)을 보면 지산 책상이 잡히지 않고 출구가 잡힌다
  const backHit = pickGazedHotspot(
    {
      level: 1,
      bodyX: 0,
      bodyZ: 2.0,
      camX: 0,
      camY: 1.6,
      camZ: 2.0,
      dirX: 0,
      dirY: -0.1,
      dirZ: 1,
    },
    mind.hotspots,
    true,
    null,
  );
  assert.equal(backHit?.id, 'exit');
});

test('리듬 천국 재즈 스튜디오(groove): 4막 차트 생성, 포켓 판정, SUPERB 등급 계산', () => {
  assert.equal(STAGES.length, 4);
  for (let i = 0; i < STAGES.length; i++) {
    const chart = buildStageChart(i, 42);
    assert.ok(chart.targets.length >= 8, `${i}막 타겟 수 부족`);
    assert.ok(chart.events.length > chart.targets.length);
  }
  const c0 = buildStageChart(0, 77);
  const taken = new Set<number>();
  const records = new Map<number, HitRecord>();
  for (const t of c0.targets) {
    const r = judgeTap(t.t + 0.008, c0.targets, taken, c0.spec, false);
    assert.ok(r);
    assert.equal(r!.verdict, 'pocket');
    taken.add(r!.targetIndex);
    records.set(r!.targetIndex, r!);
  }
  const sum = summarizeStage(0, c0.targets, records);
  assert.equal(sum.grade, 'SUPERB');
  assert.equal(sum.passed, true);
  assert.equal(sum.miss, 0);
});

test('재즈 이어 트레이닝(pitch): 음정·텐션 보이싱·3음 비밥 릭 문제 덱 생성과 점수 계산', () => {
  for (const mode of ['interval', 'chord', 'lick'] as const) {
    const deck = generateEarDeck(mode, 12345, 5);
    assert.equal(deck.length, 5);
    assert.deepEqual(deck, generateEarDeck(mode, 12345, 5), '같은 씨앗이면 같은 문제');
  }
  assert.ok(CHORD_QUALITIES.some((q) => q.id === 'alt7'));
  assert.ok(scoreEarAnswer({ mode: 'chord', triesUsed: 0, usedHint: false, streak: 3 }) > scoreEarAnswer({ mode: 'interval', triesUsed: 1, usedHint: true, streak: 0 }));
});

test('리더보드 검증·병합: 최고 점수 우선, 동점 시 최단 시간 우선', () => {
  const valid = validateScorePayload({
    gameId: 'groove',
    roomSlug: 'gable',
    displayName: '  스윙러버\n ',
    score: 1480,
    ms: 52300,
    detail: { clearedStages: 4 },
  });
  assert.equal(valid?.displayName, '스윙러버');
  assert.equal(validateScorePayload({ gameId: 'unknown', roomSlug: 'gable', displayName: 'x', score: 10, ms: 1000 }), null);

  const first = upsertLocalScore(null, valid!, '2026-11-13T00:00:00.000Z');
  assert.equal(first.improved, true);
  const lower = upsertLocalScore(first.json, { ...valid!, score: 900, ms: 30000 }, '2026-11-13T00:01:00.000Z');
  assert.equal(lower.improved, false);
  assert.equal(parseLocalScores(lower.json).groove.score, 1480);

  const merged = mergeServerAndLocal(
    [
      { gameId: 'groove', roomSlug: 'gable', rank: 1, displayName: '챔피언', score: 1600, ms: 60000, updatedAt: '2026-11-13T00:00:00Z' },
      { gameId: 'groove', roomSlug: 'gable', rank: 2, displayName: '동점느림', score: 1480, ms: 59000, updatedAt: '2026-11-13T00:00:00Z' },
    ],
    parseLocalScores(lower.json),
    'groove',
    10,
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[0].displayName, '챔피언');
  assert.equal(merged[1].displayName, '스윙러버');
  assert.equal(merged[1].rank, 2);
  assert.equal(merged[2].rank, 3);
});
