import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { readFileSync } from 'node:fs';

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

const { ROOM_SCENES, buildRoomWorld } = await import('../../src/content/room-worlds.ts');
const { KIND_LABEL, ROOM_LOOK, ROOM_VIEW, voiceQuestions } = await import('../../src/content/room-voice.ts');
const { VOICE_KEY, VOICE_ROOMS, allVoiceRooms, cleanVoiceDraft, voiceChanges, voiceItems } = await import('../../src/lib/room-voice.ts');
const { computePrints, stampLedger, staleRooms, STAMP_KEEP } = await import('../../src/lib/room-voice-stamp.ts');

const LEDGER = JSON.parse(readFileSync(new URL('../../src/content/room-voice-stamps.json', import.meta.url), 'utf8'));

test('의견함은 방 장면이 있는 방 모두와 비어 있는 방을 받는다', () => {
  for (const slug of ROOM_SCENES) assert.ok(VOICE_ROOMS.includes(slug), slug);
  assert.ok(VOICE_ROOMS.includes('spare'));
  const spare = allVoiceRooms().find((r) => r.slug === 'spare');
  assert.equal(spare?.hasScene, false);
  assert.ok(voiceQuestions('spare').some((q) => q.id === 'fill'));
});

test('방 장면의 가구 종류마다 이름이 있고, 장면이 있는 방마다 벽·바닥과 창밖 한 줄이 있다', () => {
  for (const slug of ROOM_SCENES) {
    const world = buildRoomWorld(slug);
    assert.ok(world, slug);
    for (const f of world.furniture) assert.ok(KIND_LABEL[f.kind], `${slug}: 가구 「${f.kind}」의 이름을 content/room-voice.ts KIND_LABEL에 더해 주세요`);
    assert.ok(ROOM_LOOK[slug], `${slug}: ROOM_LOOK`);
    assert.ok(ROOM_VIEW[slug], `${slug}: ROOM_VIEW`);
  }
});

test('합치기로 한 가구는 그 방의 놀이·전시 자리에 실제로 합쳐진다', () => {
  for (const slug of ROOM_SCENES) {
    const world = buildRoomWorld(slug)!;
    const items = voiceItems(slug);
    for (const kind of new Set(world.furniture.map((f) => f.kind))) {
      const joins = KIND_LABEL[kind]?.joins;
      if (!joins) continue;
      const merged = items.some((it) => it.parts?.some((p) => p.ko === KIND_LABEL[kind].ko));
      assert.ok(merged, `${slug}: 「${kind}」가 합칠 자리(${joins})를 찾지 못했어요`);
    }
  }
});

test('항목 열쇠는 방마다 하나뿐이고 DB가 받는 모양이다', () => {
  for (const room of allVoiceRooms()) {
    const ids = room.items.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, room.slug);
    for (const id of ids) assert.ok(VOICE_KEY.test(id), `${room.slug}: ${id}`);
    for (const q of voiceQuestions(room.slug)) assert.ok(VOICE_KEY.test(q.id), q.id);
  }
  const toybox = voiceItems('toybox');
  const sword = toybox.find((i) => i.id === 'game:sword');
  assert.ok(sword?.parts?.some((p) => p.ko === KIND_LABEL.swordArcade.ko), '소드 콘티넌트 항목에 오락기가 합쳐진다');
  assert.equal(toybox.filter((i) => i.group === 'view').length, 1);
});

test('장부가 지금 방과 맞다(방을 고쳤으면 npm run room-stamps)', () => {
  const stale = staleRooms(LEDGER, computePrints());
  assert.deepEqual(stale, [], `의견함 장부가 밀린 방: ${stale.join(', ')}. npm run room-stamps 를 돌려 버전과 시각을 적어 주세요`);
  for (const slug of VOICE_ROOMS) {
    const top = LEDGER.rooms[slug].history[0];
    assert.match(top.version, /^\d+\.\d+\.\d+$/);
    assert.ok(!Number.isNaN(Date.parse(top.at)));
  }
});

test('장부는 바뀐 방에만 새 기록을 더하고, 새로 생긴 것과 없어진 것을 이름으로 남긴다', () => {
  const first = stampLedger({ rooms: {} }, { a: { hash: 'h1', items: ['x', 'y'], labels: { x: '엑스', y: '와이' } } }, '1.0.0', '2026-11-14T00:00:00.000Z');
  assert.deepEqual(first.changed, ['a']);
  assert.deepEqual(first.ledger.rooms.a.history[0].added, []);
  assert.equal(first.ledger.rooms.a.history[0].first, true);
  const same = stampLedger(first.ledger, { a: { hash: 'h1', items: ['x', 'y'], labels: { x: '엑스', y: '와이' } } }, '1.0.1', '2026-11-15T00:00:00.000Z');
  assert.deepEqual(same.changed, []);
  const next = stampLedger(first.ledger, { a: { hash: 'h2', items: ['x', 'z'], labels: { x: '엑스', z: '제트' } } }, '1.1.0', '2026-11-16T00:00:00.000Z');
  const top = next.ledger.rooms.a.history[0];
  assert.equal(top.version, '1.1.0');
  assert.equal(top.first, undefined);
  assert.deepEqual(top.added, ['z']);
  assert.deepEqual(top.removed, [{ id: 'y', ko: '와이' }]);
  assert.equal(next.ledger.rooms.a.history.length, 2);
  let l = next.ledger;
  for (let i = 0; i < STAMP_KEEP + 3; i += 1) {
    l = stampLedger(l, { a: { hash: `k${i}`, items: ['x'], labels: { x: '엑스' } } }, '2.0.0', '2026-11-17T00:00:00.000Z').ledger;
  }
  assert.equal(l.rooms.a.history.length, STAMP_KEEP);
});

test('저장 전 손질은 모르는 표시·빈 글·제어 문자를 버린다', () => {
  const d = cleanVoiceDraft({
    marks: { 'item:piano': 'keep', 'item:sofa': 'love', 'Bad Key': 'keep' },
    notes: { 'item:piano': '조율\u0007해 주세요\n고맙습니다', 'item:sofa': '   ', 'item:rug': 3 },
    answers: { add: 'x'.repeat(2500), name: '' },
    status: 'done',
  });
  assert.deepEqual(d.marks, { 'item:piano': 'keep' });
  assert.deepEqual(d.notes, { 'item:piano': '조율해 주세요\n고맙습니다' });
  assert.equal(d.answers.add.length, 2000);
  assert.equal('name' in d.answers, false);
  assert.equal(d.status, 'done');
  assert.equal(cleanVoiceDraft(null).status, 'draft');
});

test('쓴 뒤 생긴 것과 없어진 것을 가른다(처음 쓰는 의견은 비교하지 않는다)', () => {
  assert.deepEqual(voiceChanges(['a', 'b'], ['a', 'c']), { added: ['c'], removed: ['b'] });
  assert.deepEqual(voiceChanges([], ['a']), { added: [], removed: [] });
});

test('아이 방은 아이 말투로 묻고, 방마다 더 묻는 것을 제자리에 끼운다', () => {
  const kid = voiceQuestions('toybox');
  assert.equal(kid[0].ko, '방 이름을 바꾸고 싶어?');
  assert.equal(kid[kid.findIndex((q) => q.id === 'add') + 1].id, 'sword');
  const jazz = voiceQuestions('gable');
  assert.equal(jazz[jazz.findIndex((q) => q.id === 'add') + 1].id, 'music');
});
