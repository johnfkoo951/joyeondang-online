// 걷기 조작 판단 시험: E 들어가기·나가기, 휴대폰 단추 이름, P 포털 목록, 숫자키, 사진 이름, 시점 기억(v2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actLabel, digitIndex, interactFor, parseView, portalItems, shotFileName, walkKeyAction, type WalkKeyState } from '../../src/components/walk/controls.ts';

const open = (slug: string) => slug !== 'closed';

test('E: 열린 방 문이면 확인 없이 바로 들어간다', () => {
  assert.deepEqual(interactFor({ kind: 'portal', slug: 'study' }, open, false), { kind: 'enter', slug: 'study' });
  assert.equal(actLabel(interactFor({ kind: 'portal', slug: 'study' }, open, false)), '들어가기');
});

test('E: 닫힌 방 문, 놀이 자리, 물건은 패널(놀이는 설명을 보고 Enter로 시작)', () => {
  assert.deepEqual(interactFor({ kind: 'portal', slug: 'closed' }, open, false), { kind: 'panel' });
  assert.deepEqual(interactFor({ kind: 'game', slug: undefined }, open, true), { kind: 'panel' });
  assert.deepEqual(interactFor({ kind: 'room', slug: 'pine' }, open, false), { kind: 'panel' });
  assert.equal(actLabel({ kind: 'panel' }), '살피기');
});

test('E: 방 안의 나가는 문이면 바로 나간다(집에서는 패널)', () => {
  assert.deepEqual(interactFor({ kind: 'exit' }, open, true), { kind: 'leave' });
  assert.equal(actLabel({ kind: 'leave' }), '나가기');
  assert.deepEqual(interactFor({ kind: 'exit' }, open, false), { kind: 'panel' });
});

test('E: 가까운 곳이 없으면 아무것도 안 한다', () => {
  assert.equal(interactFor(null, open, false), null);
  assert.equal(actLabel(null), '살피기');
});

const ROOMS = [
  { slug: 'gable', name: '박공 방' }, { slug: 'toybox', name: '좋아하는 것 방' }, { slug: 'target', name: '과녁 방' },
  { slug: 'mind', name: '생각 지도 방' }, { slug: 'study', name: '빛이 드는 방' }, { slug: 'guest', name: '손님방' }, { slug: 'garage', name: '작업 차고' },
];

test('P: 집에서는 들어갈 수 있는 방만, 숨은 포털 방(차고)도 잘리지 않게(숫자키 1~9)', () => {
  const items = portalItems({ inRoom: false, current: null, rooms: ROOMS, canEnter: (s) => s !== 'target' });
  assert.deepEqual(items.map((i) => i.slug), ['gable', 'toybox', 'mind', 'study', 'guest', 'garage']);
  const many = Array.from({ length: 12 }, (_, i) => ({ slug: `r${i}`, name: `방 ${i}` }));
  assert.equal(portalItems({ inRoom: false, current: null, rooms: many, canEnter: () => true }).length, 9);
});

test('P: 방 안에서는 「집으로」가 먼저, 지금 방은 빼고', () => {
  const items = portalItems({ inRoom: true, current: 'mind', rooms: ROOMS, canEnter: () => true });
  assert.deepEqual(items[0], { slug: null, title: '집으로', owner: null });
  assert.ok(!items.some((i) => i.slug === 'mind'));
  assert.equal(items.length, 7);
  assert.equal(items.at(-1)?.slug, 'garage');
});

test('P: 손님이면 가족 방 앞에 주인 이름', () => {
  const owners = new Map([['gable', { owner: '가족 한 분' }]]);
  const items = portalItems({ inRoom: false, current: null, rooms: ROOMS.slice(0, 2), canEnter: () => true, owners });
  assert.equal(items[0].owner, '가족 한 분');
  assert.equal(items[1].owner, null);
});

test('숫자키: 윗줄·숫자판·한글 자판 상관없이 1~9', () => {
  assert.equal(digitIndex({ key: '1', code: 'Digit1' }), 0);
  assert.equal(digitIndex({ key: '!', code: 'Digit1' }), 0);
  assert.equal(digitIndex({ key: '5', code: 'Numpad5' }), 4);
  assert.equal(digitIndex({ key: '3' }), 2);
  assert.equal(digitIndex({ key: '0', code: 'Digit0' }), -1);
  assert.equal(digitIndex({ key: 'p', code: 'KeyP' }), -1);
});

test('사진 이름: 조연당-YYYYMMDD-HHMM.jpg(여러 장이면 뒤에 번호)', () => {
  const d = new Date(2026, 10, 9, 7, 5);
  assert.equal(shotFileName(d), '조연당-20261109-0705.jpg');
  assert.equal(shotFileName(d, 3), '조연당-20261109-0705-3.jpg');
});

test('시점 기억 v2: 처음 오는 분은 3인칭, 1인칭을 고른 분만 1인칭', () => {
  assert.equal(parseView(null), 'third');
  assert.equal(parseView(undefined), 'third');
  assert.equal(parseView('third'), 'third');
  assert.equal(parseView('first'), 'first');
  assert.equal(parseView('엉뚱한 값'), 'third');
});

const S: WalkKeyState = {
  game: false, ready: true, panel: false, anyOpen: false, canTalk: true, coarse: false,
  editing: false, locked: false, onControl: false, near: false,
};
const act = (key: string, s: Partial<WalkKeyState> = {}, e: Record<string, unknown> = {}) =>
  walkKeyAction({ key, ...e }, { ...S, ...s }).act;

test('키: M·G·P·C는 한글 자판(ㅡ·ㅎ·ㅔ·ㅊ)이어도 자리(code)로 받는다', () => {
  assert.equal(act('m'), 'map');
  assert.equal(act('ㅎ', {}, { code: 'KeyG' }), 'way');
  assert.equal(act('ㅔ', {}, { code: 'KeyP' }), 'portal');
  assert.equal(act('C'), 'look');
  assert.equal(act('F2'), 'shot');
  assert.equal(act('?'), 'help');
});

test('키: 한글 조합 중(isComposing·229)이면 아무것도 안 한다, Esc까지', () => {
  assert.equal(act('m', {}, { isComposing: true }), null);
  assert.equal(act('Process', {}, { keyCode: 229, code: 'KeyP' }), null);
  assert.equal(act('Escape', {}, { isComposing: true }), null);
});

test('키: 입력칸 안·다른 키와 함께·눌러 둔 반복은 무시(F2는 브라우저 기본만 막는다)', () => {
  assert.equal(act('m', { editing: true }), null);
  assert.equal(act('p', {}, { ctrlKey: true }), null);
  assert.equal(act('g', {}, { repeat: true }), null);
  assert.deepEqual(walkKeyAction({ key: 'F2', repeat: true }, S), { act: null, prevent: true });
  assert.equal(act('m', { ready: false }), null);
});

test('Esc: 열린 것이 있으면 닫고(입력칸 안이어도), 없으면 메뉴. 잠금 풀기·휴대폰·놀이 중은 아님', () => {
  assert.equal(act('Escape', { anyOpen: true, editing: true }), 'closeAll');
  assert.equal(act('Escape'), 'menu');
  assert.equal(act('Escape', { locked: true }), null);
  assert.equal(act('Escape', { coarse: true }), null);
  assert.equal(act('Escape', { game: true }), null);
});

test('Enter: 말하기. 가까운 곳·단추 위·패널이 열려 있으면 그쪽 몫', () => {
  assert.equal(act('Enter'), 'talk');
  assert.equal(act('Enter', { near: true }), null);
  assert.equal(act('Enter', { onControl: true }), null);
  assert.equal(act('Enter', { panel: true }), null);
  assert.equal(act('Enter', { canTalk: false }), null);
});
