// 대화상자 Tab 가두기 판단 시험: 제목(Tab 자리가 아님)에 초점이 있을 때도 밖으로 나가지 않는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOCUSABLE, trapTarget } from '../../src/components/walk/focusTrap.ts';

// 문서 순서를 숫자로 흉내 낸다: 0 = 제목, 1~3 = 단추
const before = (a: number, b: number) => a < b;
const stops = [1, 2, 3];

test('Tab 가두기: 맨 끝에서 Tab은 처음으로, 맨 처음에서 Shift+Tab은 끝으로', () => {
  assert.equal(trapTarget(stops, 3, false, before), 1);
  assert.equal(trapTarget(stops, 1, true, before), 3);
});

test('Tab 가두기: 가운데에서는 브라우저에 맡긴다', () => {
  assert.equal(trapTarget(stops, 2, false, before), null);
  assert.equal(trapTarget(stops, 2, true, before), null);
  assert.equal(trapTarget(stops, 1, false, before), null);
  assert.equal(trapTarget(stops, 3, true, before), null);
});

test('Tab 가두기: 제목에 초점이 있을 때 Shift+Tab은 밖으로 나가지 않고 끝으로 간다', () => {
  assert.equal(trapTarget(stops, 0, true, before), 3);
  // 제목 뒤에는 단추가 있으니 Tab은 그대로 둬도 안에서 움직인다
  assert.equal(trapTarget(stops, 0, false, before), null);
});

test('Tab 가두기: Tab 자리가 아닌 맨 끝 요소에서 Tab은 처음으로', () => {
  assert.equal(trapTarget(stops, 9, false, before), 1);
  assert.equal(trapTarget(stops, 9, true, before), null);
});

test('Tab 가두기: 초점을 모르면 방향에 맞는 끝으로, 항목이 없으면 손대지 않는다', () => {
  assert.equal(trapTarget(stops, null, false, before), 1);
  assert.equal(trapTarget(stops, null, true, before), 3);
  assert.equal(trapTarget([], 0, true, before), null);
  assert.equal(trapTarget([5], 5, false, before), 5);
  assert.equal(trapTarget([5], 5, true, before), 5);
});

test('Tab 자리 선택자: 코드로만 초점을 주는 제목, 꺼진 단추, 숨은 입력칸은 뺀다', () => {
  assert.ok(!FOCUSABLE.split(', ').includes('[tabindex="-1"]'));
  assert.ok(FOCUSABLE.includes('button:not([disabled])'));
  assert.ok(FOCUSABLE.includes('input:not([disabled]):not([type="hidden"])'));
});
