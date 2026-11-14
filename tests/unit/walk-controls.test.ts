// 걷기 조작 판단 시험: E 들어가기·나가기, 휴대폰 단추 이름, P 포털 목록, 숫자키, 사진 이름, 시점 기억(v2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import type { WalkKeyState } from '../../src/components/walk/controls.ts';

// controls.ts는 앱과 같은 꼴(확장자 없는 './shortcuts')로 단축키 표를 가져온다. 이 시험 프로세스에서만 .ts를 풀어 준다.
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const { LETTER_ACTS, actLabel, ariaKey, arriveYaw, blocksTalk, digitIndex, interactFor, parseView, peopleEsc, portalItems, shotFileName, walkKeyAction, wayKind, wayOrder, waySlice } =
  await import('../../src/components/walk/controls.ts');
const { SHORTCUTS, letterOf } = await import('../../src/components/walk/shortcuts.ts');

const open = (slug: string) => slug !== 'closed';

test('E: 열린 방 문이면 확인 없이 바로 들어간다', () => {
  assert.deepEqual(interactFor({ kind: 'portal', slug: 'study' }, open, false), { kind: 'enter', slug: 'study' });
  assert.equal(actLabel(interactFor({ kind: 'portal', slug: 'study' }, open, false)), '들어가기');
});

test('E: 갤러리 액자 앞이면 그 액자를 크게 본다(휴대폰 단추는 「크게 보기」)', () => {
  assert.deepEqual(interactFor({ kind: 'frame', frame: '1-a-2' }, open, false), { kind: 'frame', id: '1-a-2' });
  assert.equal(actLabel(interactFor({ kind: 'frame', frame: '1-a-2' }, open, false)), '크게 보기');
  // 액자 id가 없는 자리는 패널(엔진이 늘 id를 붙이지만, 빠져도 엉뚱한 액자를 열지 않게)
  assert.deepEqual(interactFor({ kind: 'frame' }, open, false), { kind: 'panel' });
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

test('키: M·G·P·B·C·U는 한글 자판(ㅡ·ㅎ·ㅔ·ㅠ·ㅊ·ㅕ)이어도 자리(code)로 받는다', () => {
  assert.equal(act('m'), 'map');
  assert.equal(act('ㅎ', {}, { code: 'KeyG' }), 'way');
  assert.equal(act('ㅔ', {}, { code: 'KeyP' }), 'portal');
  assert.equal(act('F2'), 'shot');
  assert.equal(act('?'), 'help');
});

test('키: B는 캐릭터 창(예전 C), C는 대화창, U는 접속자 목록', () => {
  assert.equal(act('b'), 'look');
  assert.equal(act('ㅠ', {}, { code: 'KeyB' }), 'look');
  assert.equal(act('C'), 'chat');
  assert.equal(act('ㅊ', {}, { code: 'KeyC' }), 'chat');
  assert.equal(act('u'), 'people');
  assert.equal(act('ㅕ', {}, { code: 'KeyU' }), 'people');
  // 입력칸 안에서는 글자 그대로(대화창에 「c」를 칠 수 있게), 놀이 중에는 놀이 몫
  assert.equal(act('c', { editing: true }), null);
  assert.equal(act('u', { game: true }), null);
});

test('키: 글자 키 표는 단축키 표(shortcuts.ts)에서 읽는다', () => {
  // 표의 글자 키마다 할 일이 하나씩 있고, 같은 글자가 두 번 나오지 않는다
  const letters = LETTER_ACTS.map(([l]) => l);
  assert.equal(new Set(letters).size, letters.length);
  for (const id of ['map', 'way', 'portal', 'character', 'chat', 'people', 'fullscreen'] as const) {
    assert.ok(letters.includes(letterOf(id) as string), `${id}(${SHORTCUTS[id].key})가 글자 키 표에 있다`);
  }
  // 키 이름을 aria-keyshortcuts 꼴로: Esc → Escape, 나머지는 그대로
  assert.equal(ariaKey('menu'), 'Escape');
  assert.equal(ariaKey('character'), 'B');
  assert.equal(ariaKey('help'), '?');
});

test('키: F는 전체 화면(한글 자판 ㄹ도 자리로). 입력칸 안·보조 키(찾기 Cmd+F)·눌러 둔 반복·놀이 중은 아님', () => {
  assert.equal(SHORTCUTS.fullscreen.key, 'F');
  assert.equal(act('f'), 'fullscreen');
  assert.equal(act('F'), 'fullscreen');
  assert.equal(act('ㄹ', {}, { code: 'KeyF' }), 'fullscreen');
  assert.deepEqual(walkKeyAction({ key: 'f' }, S), { act: 'fullscreen', prevent: true });
  assert.equal(act('f', { editing: true }), null);
  assert.equal(act('f', {}, { metaKey: true }), null);
  assert.equal(act('f', {}, { ctrlKey: true }), null);
  assert.equal(act('f', {}, { repeat: true }), null);
  assert.equal(act('f', { game: true }), null);
  // 패널이 열려 있어도 F는 전체 화면(패널은 그대로 둔다)
  assert.equal(act('f', { panel: true, anyOpen: true }), 'fullscreen');
});

test('Esc: 전체 화면을 끝내는 Esc(브라우저 몫, locked)는 패널을 닫지도 메뉴를 열지도 않는다', () => {
  assert.equal(act('Escape', { locked: true, anyOpen: true }), null);
  assert.equal(act('Escape', { locked: true }), null);
  // 그다음 Esc부터는 여느 때처럼
  assert.equal(act('Escape', { anyOpen: true }), 'closeAll');
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

test('Enter: 약한 가까움(휴대폰 3인칭에서 대략 보는 액자)은 말하기를 막지 않는다. 바라보는 액자·살피기 자리는 막는다', () => {
  const weakFrame = { id: 'frame:1-a-1', kind: 'frame' as const, frame: '1-a-1', weak: true };
  const frame = { id: 'frame:1-a-1', kind: 'frame' as const, frame: '1-a-1' };
  assert.equal(blocksTalk(weakFrame), false);
  assert.equal(blocksTalk(frame), true);
  assert.equal(blocksTalk({ kind: 'sign' }), true);
  assert.equal(blocksTalk(null), false);
  // 화면이 엔진에 알리는 대로(hasNear = blocksTalk(지금 가까운 곳)) 키를 읽으면
  assert.equal(act('Enter', { near: blocksTalk(weakFrame) }), 'talk', '약한 가까움에서도 Enter는 말하기');
  assert.equal(act('Enter', { near: blocksTalk(frame) }), null, '바라보는 액자 앞 Enter는 크게 보기(엔진 몫)');
  // 약한 가까움도 크게 보기 단추(휴대폰)와 E 안내에는 「크게 보기」로 보인다
  assert.equal(actLabel(interactFor(weakFrame, open, false)), '크게 보기');
});

test('사람 목록 Esc: 목록만 열려 있으면 닫고 삼킨다(메뉴가 열리지 않게)', () => {
  assert.deepEqual(peopleEsc({ key: 'Escape' }, false), { close: true, swallow: true });
});

test('사람 목록 Esc: 패널·놀이·말하기 칸이 위에 있으면 닫되 삼키지 않는다(그쪽도 같은 Esc로 닫힌다)', () => {
  assert.deepEqual(peopleEsc({ key: 'Escape' }, true), { close: true, swallow: false });
});

test('사람 목록 Esc: 다른 키와 한글 조합 중(isComposing·229)은 손대지 않는다', () => {
  const none = { close: false, swallow: false };
  assert.deepEqual(peopleEsc({ key: 'Enter' }, false), none);
  assert.deepEqual(peopleEsc({ key: 'Escape', isComposing: true }, false), none);
  assert.deepEqual(peopleEsc({ key: 'Escape', keyCode: 229 }, true), none);
});

test('길 찾기 목록: 행사 자리(결혼식 무대 → 포토존 → 방명록)가 맨 위, 나머지는 원래 순서 그대로', () => {
  const ids = ['porch', 'pine', 'lantern', 'entrance', 'living', 'study', 'photozone', 'guestbook', 'wedding-stage'];
  assert.deepEqual(wayOrder(ids.map((id) => ({ id }))).map((d) => d.id),
    ['wedding-stage', 'photozone', 'guestbook', 'porch', 'pine', 'lantern', 'entrance', 'living', 'study']);
  // 행사 자리가 없는 집은 순서가 그대로다
  const plain = ['porch', 'pine', 'study', 'stairs'].map((id) => ({ id }));
  assert.deepEqual(wayOrder(plain), plain);
});

test('길 찾기 딱지: 문과 놀이에만 붙고, 마당 자리에는 「방」이 붙지 않으며, 이름이 이미 말하면 두 번 적지 않는다', () => {
  assert.equal(wayKind({ kind: 'room', title: '세 아치 포치' }), null);
  assert.equal(wayKind({ kind: 'room', title: '포토존' }), null);
  assert.equal(wayKind({ kind: 'room', title: '방명록' }), null);
  assert.equal(wayKind({ kind: 'lantern', title: '석등' }), null);
  assert.equal(wayKind({ kind: 'stage', title: '결혼식 무대' }), null);
  assert.equal(wayKind({ kind: 'stage', title: '1층 거실' }), null);
  assert.equal(wayKind({ kind: 'portal', title: '빛이 드는 방' }), '들어가는 문');
  assert.equal(wayKind({ kind: 'door', title: '작은 방' }), '문');
  assert.equal(wayKind({ kind: 'game', title: '종이공 던지기' }), '놀이');
  assert.equal(wayKind({ kind: 'exit', title: '나가는 문' }), null);
});

test('길 찾기 조각: 이미 찾은 곳은 다시 찾지 않고, 시간이 다 돼도 한 곳은 찾는다', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const asked: string[] = [];
  const find = (d: { id: string }) => {
    asked.push(d.id);
    if (d.id === 'c') throw new Error('막힘');
    return d.id === 'd' ? null : [d.id];
  };
  // 시간이 이미 다 된 조각: 한 곳만
  let t = 0;
  const one = waySlice(list, { a: ['a'] }, find, 0, () => t);
  assert.deepEqual(asked, ['b']);
  assert.deepEqual(one.paths, { a: ['a'], b: ['b'] });
  assert.equal(one.left, 2);
  // 넉넉한 조각: 남은 곳을 모두. 찾다가 오류가 나면 길 없음(null)으로 적는다
  asked.length = 0;
  const rest = waySlice(list, one.paths, find, 12, () => t);
  assert.deepEqual(asked, ['c', 'd']);
  assert.deepEqual(rest.paths, { a: ['a'], b: ['b'], c: null, d: null });
  assert.equal(rest.left, 0);
  // 다 찾았으면 아무것도 묻지 않고 같은 내용을 돌려준다
  asked.length = 0;
  t = 100;
  assert.deepEqual(waySlice(list, rest.paths, find, 12, () => t), { paths: rest.paths, left: 0 });
  assert.deepEqual(asked, []);
});

test('걸어서 도착한 뒤 볼 방향: 방 문은 문 쪽으로(포털의 yaw는 문을 등진 방향), 그 밖은 정해 둔 방향 그대로', () => {
  assert.equal(arriveYaw({ kind: 'portal', yaw: 0 }), Math.PI);
  assert.equal(arriveYaw({ kind: 'room', yaw: 1.2 }), 1.2);
  assert.equal(arriveYaw({ kind: 'stage', yaw: -0.4 }), -0.4);
});
