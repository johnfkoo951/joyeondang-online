// 마우스 둘러보기 계산(three 없이, 노드 시험에서 그대로 돈다).
// 포인터가 화면에서 움직인 만큼 화면도 움직이게 한다: 가로·세로 같은 배율(비스듬히 움직이면 그 각도 그대로),
// 배율은 세로 시야각과 화면 높이에서 나온다(화면 가운데 1px이 보이는 각). 감도 설정은 그 위에 곱한다.

/** 화면 가운데에서 1px(CSS)이 보이는 각(rad): 2·tan(세로 시야각/2) / 화면 높이 */
export function mouseGain(fovDeg: number, viewH: number): number {
  const f = Number.isFinite(fovDeg) && fovDeg > 1 && fovDeg < 179 ? fovDeg : 70;
  const h = Number.isFinite(viewH) && viewH >= 1 ? viewH : 800;
  return (2 * Math.tan((f * Math.PI) / 360)) / h;
}

/** 손으로 낼 수 있는 가장 빠른 포인터 빠르기(px/s). 이보다 빠른 한 번의 움직임은 말이 안 되는 값이다 */
export const MOUSE_SPEED_MAX = 40_000;
/** 움직임 사이가 아무리 짧아도 이만큼(px)까지는 받는다(이벤트가 몰려 오는 기기) */
export const MOUSE_STEP_MIN = 400;
/** 움직임 사이 시간(ms)을 이 범위로 본다: 오래 쉬었다 움직여도 한 번에 받는 양은 이 안 */
const GAP_MIN = 1;
const GAP_MAX = 250;

/**
 * 한 번 들어온 마우스 움직임(px)을 걸러 준다. 말이 되면 그대로(자르지 않는다), 말이 안 되면 null(통째로 버린다).
 * 말이 안 되는 값: 숫자가 아니거나, 지난 움직임 뒤 흐른 시간(gapMs)으로 손이 낼 수 없는 거리.
 * 포인터 잠금 직후·창 밖에서 돌아올 때 한꺼번에 오는 튀는 값이 여기에 걸린다(들어온 첫 움직임은 부르는 쪽이 따로 버린다).
 */
export function mouseStep(dx: number, dy: number, gapMs: number): [number, number] | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const gap = Number.isFinite(gapMs) ? Math.min(GAP_MAX, Math.max(GAP_MIN, gapMs)) : GAP_MAX;
  const limit = Math.max(MOUSE_STEP_MIN, (MOUSE_SPEED_MAX * gap) / 1000);
  return Math.hypot(dx, dy) > limit ? null : [dx, dy];
}

// ───────── 방향키와 휠로 둘러보기
// 마우스는 화면 안에서만 움직여 위아래로 볼 수 있는 폭이 화면 높이에 묶인다(아래 단추 둘레에 들어서면 되돌린다).
// 방향키(←→ 돌기, ↑↓ 위아래 보기)와 1인칭의 휠·트랙패드는 그 폭 없이 끝까지 본다.

/** 방향키로 도는 끝 빠르기(rad/s): ←→ 돌기, ↑↓ 위아래 보기 */
export const KEY_YAW = 1.8;
export const KEY_PITCH = 1.1;
/** 방향키를 누르고 있으면 처음 빠르기(끝 빠르기의 몫)에서 이만큼(초)에 걸쳐 끝 빠르기까지 오른다 */
export const KEY_START = 0.3;
export const KEY_RAMP = 0.35;

/**
 * 방향키를 heldS초 누르고 있을 때의 빠르기(rad/s). 잠깐 누르면 조금만 돌아 원하는 각에 맞추기 쉽고,
 * 누르고 있으면 부드럽게 끝 빠르기까지 오른다(갑자기 빨라지지 않게 가운데가 가파른 곡선)
 */
export function keyLookRate(base: number, heldS: number): number {
  const t = Number.isFinite(heldS) ? Math.min(1, Math.max(0, heldS / KEY_RAMP)) : 0;
  return base * (KEY_START + (1 - KEY_START) * t * t * (3 - 2 * t));
}

/** 휠·트랙패드 위아래 보기(1인칭): 픽셀로 바꾼 휠 양 1px에 도는 각(rad). 마우스 휠 한 칸(약 100px)이 약 4.6도 */
export const WHEEL_PITCH = 0.0008;
/** 한 번에 받는 휠 양의 상한(px): 줄·쪽 단위로 오는 큰 값과 관성 끝에서 튀는 값이 한꺼번에 돌지 않게 */
export const WHEEL_STEP_MAX = 240;

/** 휠 이벤트 양을 픽셀로(deltaMode 0 픽셀, 1 줄(16px), 2 쪽(화면 높이)). 아래로 굴리면 양수 = 아래를 본다 */
export function wheelPx(deltaY: number, deltaMode: number, pageH: number): number {
  if (!Number.isFinite(deltaY)) return 0;
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * (Number.isFinite(pageH) && pageH > 0 ? pageH : 800) : deltaY;
  return Math.max(-WHEEL_STEP_MAX, Math.min(WHEEL_STEP_MAX, px));
}
