// 휴대폰 1인칭 이동 스틱: 가로 쏠림을 회전으로 바꾸는 모양(가운데 여유, 끝은 그대로).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURN_DEAD, stickTurn } from '../../src/walk/stick.ts';

// 화면의 스틱은 손잡이가 반지름 42px 안에서 움직인다(Stick.tsx의 R)
const R = 42;

test('곧게 앞으로 밀 때의 작은 가로 쏠림(8px)은 회전이 아니다', () => {
  for (const px of [0, 1, 2, 4, 8]) {
    assert.equal(stickTurn(px / R), 0, `${px}px`);
    assert.equal(stickTurn(-px / R), 0, `-${px}px`);
  }
  assert.equal(stickTurn(TURN_DEAD), 0, '여유의 끝까지는 0');
});

test('옆으로 분명히 밀면 민 쪽으로 돌고, 끝까지 밀면 가장 빠른 회전 그대로', () => {
  assert.ok(stickTurn(30 / R) > 0.3, '30px는 돈다');
  assert.ok(stickTurn(-30 / R) < -0.3);
  assert.equal(stickTurn(1), 1);
  assert.equal(stickTurn(-1), -1);
  // 스틱 값이 1을 조금 넘어 와도 1보다 빨리 돌지 않는다
  assert.equal(stickTurn(1.3), 1);
});

test('회전 세기는 좌우가 같고, 많이 밀수록 커지며, 여유를 벗어나는 순간 튀지 않는다', () => {
  let prev = 0;
  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    const v = stickTurn(x);
    assert.ok(v >= prev - 1e-12, `x=${x}에서 줄어든다`);
    assert.ok(Math.abs(stickTurn(-x) + v) < 1e-12, `x=${x} 좌우가 다르다`);
    // 예전(값 그대로)보다 세지 않다: 미세하게 돌릴 때 더 둔할 뿐 더 예민해지지 않는다
    assert.ok(v <= x + 1e-12, `x=${x}에서 예전보다 세다`);
    prev = v;
  }
  assert.ok(stickTurn(TURN_DEAD + 0.01) < 0.01, '여유 바로 밖은 아주 천천히');
});

test('숫자가 아닌 값은 회전 없음으로 본다', () => {
  assert.equal(stickTurn(Number.NaN), 0);
});
