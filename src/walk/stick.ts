// 휴대폰 1인칭: 이동 스틱의 가로 값을 회전으로 바꾸는 모양. 순수 계산이라 따로 두고 시험한다.

/**
 * 이 안쪽의 가로 쏠림은 회전으로 치지 않는다(스틱 반지름의 5분의 1).
 * 곧게 앞으로 밀어도 엄지는 조금 옆으로 치우친다. 그대로 회전에 쓰면 걷는 동안 계속 돌아서
 * 문을 비스듬히 지나게 된다.
 */
export const TURN_DEAD = 0.2;

/**
 * 스틱 가로 값(-1..1)을 회전 세기(-1..1)로. 가운데 TURN_DEAD 안은 0, 그 밖은 0에서 완만하게 시작해
 * 끝까지 밀면 그대로 ±1(가장 빠른 회전은 전과 같다).
 */
export function stickTurn(x: number): number {
  const a = Math.min(1, Math.abs(x));
  if (!(a > TURN_DEAD)) return 0;
  return Math.sign(x) * ((a - TURN_DEAD) / (1 - TURN_DEAD)) ** 1.5;
}
