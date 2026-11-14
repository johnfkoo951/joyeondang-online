// 장소 이름의 영어: 통째로 맞는 이름, 층이 붙은 이름(1F …), 모르는 이름은 그대로(섞어 옮기지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const P = await import('../../src/lib/place-names.ts');

test('통째로 맞는 이름과 층이 붙은 이름', () => {
  assert.equal(P.placeEn('거실'), 'Living room');
  assert.equal(P.placeEn('1층 거실'), '1F Living room');
  assert.equal(P.placeEn('2층 주방'), '2F Kitchen');
  assert.equal(P.placeEn('2층 계단참'), '2F Stair landing');
  assert.equal(P.placeEn('1층'), '1F');
  assert.equal(P.placeEn(' 앞마당 '), 'Front yard');
  assert.equal(P.placeEn('1층 거실 무대'), '1F Living room stage');
});

test('모르는 이름은 그대로(층만 옮기지 않는다), 빈 이름도 그대로', () => {
  assert.equal(P.placeEn('누군가의 방'), '누군가의 방');
  assert.equal(P.placeEn('2층 누군가의 방'), '2층 누군가의 방');
  assert.equal(P.placeEn(''), '');
  assert.equal(P.placeName('ko', '거실'), '거실');
  assert.equal(P.placeName('en', '거실'), 'Living room');
});

test('표의 영어는 모두 비어 있지 않고 한글이 없다', () => {
  for (const k of P.PLACE_EN_KEYS) {
    const en = P.placeEn(k);
    assert.ok(en && en !== k && !/[가-힣]/.test(en), `${k} → ${en}`);
  }
});

test('방 놀이 이름: 표에 있는 놀이 이름의 영어는 놀이 목록의 영어 이름과 같은 말(놀이 덮개·놀이 모음·팔레트와 같게)', async () => {
  const { GAMES } = await import('../../src/games/registry.ts');
  let n = 0;
  for (const g of Object.values(GAMES)) {
    if (!P.PLACE_EN_KEYS.includes(g.title)) continue;
    assert.equal(P.placeEn(g.title), g.titleEn, g.title);
    n++;
  }
  assert.ok(n >= 6, `표에 있는 놀이 이름 ${n}개`);
  assert.equal(P.placeEn('누구의 문장일까'), 'Whose sentence is it?');
});
