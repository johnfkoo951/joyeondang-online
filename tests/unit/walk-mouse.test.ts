// 마우스 둘러보기 계산 시험: 가로·세로 같은 배율(움직인 각도 그대로), 화면이 포인터와 함께 움직이는 배율, 말이 안 되는 값만 버리기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_PITCH, KEY_RAMP, KEY_START, KEY_YAW, MOUSE_SPEED_MAX, MOUSE_STEP_MIN, WHEEL_PITCH, WHEEL_STEP_MAX, keyLookRate, mouseGain, mouseStep, wheelPx,
} from '../../src/walk/mouse.ts';

test('배율: 화면 가운데 1px이 보이는 각(2·tan(세로 시야각/2) / 화면 높이)', () => {
  const g = mouseGain(70, 800);
  assert.ok(Math.abs(g - (2 * Math.tan((35 * Math.PI) / 180)) / 800) < 1e-12);
  // 화면 높이만큼 움직이면 세로 시야(70도)를 가운데 셈으로 돈다: tan을 펴면 시야각과 거의 같다(작은 각에서 같아진다)
  const deg = (mouseGain(10, 1000) * 1000 * 180) / Math.PI;
  assert.ok(Math.abs(deg - 10) < 0.03, `${deg}`);
  // 화면이 크면 1px의 각이 작고, 시야가 넓으면 크다
  assert.ok(mouseGain(70, 1600) < mouseGain(70, 800));
  assert.ok(mouseGain(90, 800) > mouseGain(55, 800));
  // 이상한 값이 들어와도 숫자를 준다(시야 70도, 높이 800px로 본다)
  for (const [f, h] of [[NaN, 800], [70, 0], [0, 600], [200, NaN]] as const) assert.ok(Number.isFinite(mouseGain(f, h)) && mouseGain(f, h) > 0);
});

test('자르지 않는다: 빠른 손짓도 그대로 받고, 손이 낼 수 없는 값만 통째로 버린다', () => {
  // 지금까지 한 번에 150px로 잘라 빠른 손짓을 따라가지 못했다: 60Hz에서 600px(초당 3만 6천 px)도 그대로
  assert.deepEqual(mouseStep(600, -20, 16.7), [600, -20]);
  assert.deepEqual(mouseStep(-180, 90, 8), [-180, 90]);
  // 느린 화면(프레임이 늦어 움직임이 뭉쳐 온다)은 그만큼 더 받는다
  assert.deepEqual(mouseStep(1800, 0, 60), [1800, 0]);
  // 지난 움직임 뒤 시간에 비해 말이 안 되는 거리(잠금 직후·창 밖에서 돌아올 때 튀는 값): 버린다(자르지 않는다)
  assert.equal(mouseStep(2400, 0, 16.7), null);
  assert.equal(mouseStep(0, -5000, 33), null);
  // 아무리 짧은 사이여도 MOUSE_STEP_MIN까지는 받는다
  assert.deepEqual(mouseStep(MOUSE_STEP_MIN - 1, 0, 0.1), [MOUSE_STEP_MIN - 1, 0]);
  assert.equal(mouseStep(MOUSE_STEP_MIN + 1, 0, 0.1), null);
  // 숫자가 아니면 버린다. 사이 시간을 모르면 넉넉히(0.25초) 본다
  assert.equal(mouseStep(NaN, 3, 16), null);
  assert.equal(mouseStep(3, Infinity, 16), null);
  assert.deepEqual(mouseStep(5000, 0, NaN), [5000, 0]);
  assert.equal(mouseStep((MOUSE_SPEED_MAX * 0.25) + 10, 0, 10_000), null, '오래 쉬었어도 0.25초 몫까지만');
});

test('방향키 둘러보기: 처음에는 끝 빠르기의 KEY_START 몫, KEY_RAMP초에 끝 빠르기. 잠깐 누르면 조금만 돈다', () => {
  assert.equal(keyLookRate(KEY_YAW, 0), KEY_YAW * KEY_START);
  assert.equal(keyLookRate(KEY_PITCH, KEY_RAMP), KEY_PITCH);
  assert.equal(keyLookRate(KEY_PITCH, 10), KEY_PITCH, '끝 빠르기를 넘지 않는다');
  // 갈수록 빨라지기만 한다(줄지 않는다)
  let prev = 0;
  for (let t = 0; t <= KEY_RAMP + 0.1; t += 0.01) {
    const r = keyLookRate(KEY_YAW, t);
    assert.ok(r >= prev - 1e-12, `${t}초`);
    prev = r;
  }
  // 한 번 톡(60Hz로 6프레임, 0.1초): 위아래로 약 2도만. 1초 누르면 50도 남짓(1인칭 위아래 끝 ±74도에 1.5초 안쪽)
  const turned = (base: number, s: number) => {
    let a = 0;
    for (let t = 0; t < s; t += 1 / 60) a += keyLookRate(base, t) / 60;
    return (a * 180) / Math.PI;
  };
  assert.ok(turned(KEY_PITCH, 0.1) < 3, `톡 ${turned(KEY_PITCH, 0.1)}`);
  assert.ok(turned(KEY_PITCH, 1) > 45 && turned(KEY_PITCH, 1) < 60, `1초 ${turned(KEY_PITCH, 1)}`);
  // 이상한 시간은 처음 빠르기로
  assert.equal(keyLookRate(KEY_YAW, NaN), KEY_YAW * KEY_START);
  assert.equal(keyLookRate(KEY_YAW, -1), KEY_YAW * KEY_START);
});

test('휠 위아래 보기: 줄·쪽 단위를 픽셀로, 한 번에 받는 양은 WHEEL_STEP_MAX까지. 휠 한 칸은 약 4.6도', () => {
  assert.equal(wheelPx(100, 0, 800), 100);
  assert.equal(wheelPx(-3, 1, 800), -48, '줄 단위(Firefox 마우스 휠)');
  assert.equal(wheelPx(1, 2, 800), WHEEL_STEP_MAX, '쪽 단위는 화면 높이, 큰 값은 자른다');
  assert.equal(wheelPx(-5000, 0, 800), -WHEEL_STEP_MAX);
  assert.equal(wheelPx(NaN, 0, 800), 0);
  assert.equal(wheelPx(1, 2, NaN), WHEEL_STEP_MAX, '화면 높이를 모르면 800px로');
  const notch = (100 * WHEEL_PITCH * 180) / Math.PI;
  assert.ok(notch > 4 && notch < 5, `${notch}`);
});
