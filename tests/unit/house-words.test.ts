// 집 데이터의 영어 표 검사: 코드가 만드는 모든 장소 이름(구역·문패·살피기 자리·방·층·놀이 이름)과 안내 문장(살피기 자리 한 줄,
// 방 안내·질문·여는 때, 층 안내)에 영어가 있다. 문패 상태·전시 칸 제목·표지판 말·이름 없는 사람의 이름표도 두 말이 다 있다.
// 반려동물의 영어 이름표는 설정(PET_JSON nameEn)에서만 오고, 이름과 같은 범위(명단 손님 이상)에만 실린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
const { ROOM_SCENES, buildRoomWorld } = await import('../../src/content/room-worlds.ts');
const { ROOMS, FLOORS, DOOR_LABEL, DOOR_LABEL_EN, doorLabel } = await import('../../src/content/rooms.ts');
const { EXHIBIT_SECTIONS } = await import('../../src/content/exhibit-sections.ts');
const { HOUSE_NAME, HOUSE_NAME_EN } = await import('../../src/content/house-name.ts');
const { stageHouse } = await import('../../src/walk/staging.ts');
const { placeEn, placeName } = await import('../../src/lib/place-names.ts');
const { HOUSE_LINE_KEYS, houseLine, lineEn } = await import('../../src/lib/house-lines.ts');
const { DEFAULT_NAME_KEYS, GUEST_NAME_EN, GUEST_NAME_KO, shownName } = await import('../../src/lib/guest-name.ts');
const { SIGN_WORDS } = await import('../../src/walk/furnish.ts');
const { petSpecFrom } = await import('../../src/walk/pet-spec.ts');
const { loadPet, petPayload } = await import('../../src/lib/pet.ts');
const { zoneAt } = await import('../../src/content/world.ts');

const hangul = /[가-힣]/;
/** 영어로 쓸 만한 글: 비어 있지 않고, 한글·줄표가 없다 */
const goodEn = (s: string | null | undefined) => Boolean(s && s.trim()) && !hangul.test(s!) && !/[—–]/.test(s!);

// 코드가 만드는 집들: 다시 그린 집, 방 장면 일곱, 걷기용으로 손질한 집(포토존·방명록·결혼식 무대가 붙는다)
const worlds: HouseWorld[] = [
  buildWorld({}),
  ...ROOM_SCENES.map((s: string) => buildRoomWorld(s)!),
  stageHouse({ ...structuredClone(buildWorld({})), kind: 'real' }, 'wedding'),
];

test('장소 이름: 코드가 만드는 구역·문패·살피기 자리 이름, 방 이름·놀이 이름, 층 이름이 모두 영어로 옮겨진다', () => {
  const names = new Set<string>();
  for (const w of worlds) {
    for (const z of w.zones) names.add(z.name);
    for (const d of w.doors) if (d.label) names.add(d.label);
    for (const h of w.hotspots) names.add(h.title);
  }
  for (const r of ROOMS) {
    names.add(r.name);
    if (r.game) names.add(r.game);
  }
  for (const f of FLOORS) names.add(f.label);
  // 구역 밖의 이름(집 뒤쪽 = 집 이름, 앞쪽 = 앞마당)
  names.add(zoneAt(1, 0, -100));
  names.add(zoneAt(1, 0, 100));
  names.delete('닫힌 방'); // 문패를 달지 않는 문이지만 표에는 있다
  for (const n of names) assert.ok(goodEn(placeEn(n)), `${n} → ${placeEn(n)}`);
  assert.equal(placeName('ko', '포토존'), '포토존');
  assert.equal(placeName('en', HOUSE_NAME), HOUSE_NAME_EN);
});

test('안내 문장: 코드가 만드는 살피기 자리 한 줄, 방 안내·쪽지 질문·여는 때, 층 안내가 모두 영어로 옮겨진다', () => {
  const lines = new Set<string>();
  for (const w of worlds) for (const h of w.hotspots) if (h.line) lines.add(h.line);
  for (const r of ROOMS) {
    lines.add(r.line);
    if (r.question) lines.add(r.question);
    if (r.opens) lines.add(r.opens);
  }
  for (const f of FLOORS) if (f.note) lines.add(f.note);
  for (const l of lines) assert.ok(goodEn(lineEn(l)), `${l} → ${lineEn(l)}`);
  // 표의 영어는 모두 쓸 만하다(쓰지 않는 줄도: 집 데이터 변환기의 일반 안내)
  for (const k of HOUSE_LINE_KEYS) assert.ok(goodEn(lineEn(k)), k);
  // 모르는 문장은 옮기지 않는다(가족이 새로 쓴 안내일 수 있다), 한국어 화면은 그대로
  assert.equal(lineEn('가족이 새로 쓴 안내'), null);
  assert.equal(houseLine('en', '가족이 새로 쓴 안내'), '가족이 새로 쓴 안내');
  assert.equal(houseLine('ko', '행사 뒤에 열어요'), '행사 뒤에 열어요');
  assert.equal(houseLine('en', ' 행사 뒤에 열어요 '), 'Opens after the event');
});

test('문패 상태·전시 칸 제목·표지판 말·집 이름: 두 말이 다 있다', () => {
  for (const d of Object.keys(DOOR_LABEL) as Array<keyof typeof DOOR_LABEL>) {
    assert.ok(goodEn(DOOR_LABEL_EN[d]), d);
    assert.equal(doorLabel('ko', d), DOOR_LABEL[d]);
    assert.equal(doorLabel('en', d), DOOR_LABEL_EN[d]);
  }
  for (const s of EXHIBIT_SECTIONS) {
    assert.ok(goodEn(s.titleEn), s.slug);
    assert.ok(goodEn(s.onsiteEn), s.slug);
  }
  for (const k of ['welcome', 'name', 'motto'] as const) {
    assert.ok(hangul.test(SIGN_WORDS.ko[k]), k);
    assert.ok(goodEn(SIGN_WORDS.en[k]), k);
  }
  assert.ok(goodEn(HOUSE_NAME_EN));
});

test('이름 없는 사람의 이름표: 영어 화면에서 이름 대신 쓴 말(손님, 역할 이름)만 영어로, 사람이 지은 이름과 한국어 화면은 그대로', async () => {
  assert.equal(shownName('en', GUEST_NAME_KO), GUEST_NAME_EN);
  assert.equal(shownName('en', ' 손님 '), GUEST_NAME_EN);
  assert.equal(shownName('ko', GUEST_NAME_KO), GUEST_NAME_KO);
  assert.equal(shownName('en', '별 손님'), '별 손님');
  assert.equal(shownName('en', ''), '');
  // 걷기 화면은 이름이 없으면 역할 이름을 내 이름표로 쓴다: 역할 이름이 모두 영어로 바뀐다
  const { ROLE_LABEL } = await import('../../src/lib/access.ts');
  for (const label of Object.values(ROLE_LABEL) as string[]) assert.ok(goodEn(shownName('en', label)) && shownName('ko', label) === label, label);
  for (const k of DEFAULT_NAME_KEYS) assert.ok(goodEn(shownName('en', k)), k);
});

test('반려동물 영어 이름표: 설정의 nameEn은 이름이 있을 때만 읽고, 이름과 같은 범위에만 싣는다. 없으면 열쇠도 없다', () => {
  const cfg = loadPet(JSON.stringify({ name: '지어낸 이름', nameEn: ' Made-up ', walk: '/w.glb' }))!;
  assert.equal(cfg.nameEn, 'Made-up');
  assert.equal('nameEn' in loadPet(JSON.stringify({ name: '지어낸 이름', walk: '/w.glb' }))!, false);
  assert.equal('nameEn' in loadPet(JSON.stringify({ nameEn: 'Made-up', walk: '/w.glb' }))!, false, '이름 없이 영어 이름만은 받지 않는다');
  assert.equal(loadPet(JSON.stringify({ name: '이름', nameEn: 'x'.repeat(21), walk: '/w.glb' }))!.nameEn, undefined);
  assert.deepEqual(petPayload(cfg, false, 1), { pet: { walk: '/w.glb' }, now: 1 }, '구경하는 분에게는 이름도 영어 이름도 없다');
  assert.deepEqual(petPayload(cfg, true, 1), { pet: { walk: '/w.glb', name: '지어낸 이름', nameEn: 'Made-up' }, now: 1 });
  assert.deepEqual(petSpecFrom({ walk: '/a.glb', name: '이름', nameEn: 'Name' }), { walk: '/a.glb', name: '이름', nameEn: 'Name' });
  assert.deepEqual(petSpecFrom({ walk: '/a.glb', nameEn: 'Name' }), { walk: '/a.glb' });
  assert.deepEqual(petSpecFrom({ walk: '/a.glb', name: '이름', nameEn: '줄\n바꿈' }), { walk: '/a.glb', name: '이름' });
});
