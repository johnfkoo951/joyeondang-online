// 걷기 전에 세계를 손질한다: 밟고 지나가는 장식은 걸리지 않게, 가구는 조금 작게, 소나무는 줄기만 막는다.
// three.js에 의존하지 않는 순수 함수라 시험에서 그대로 돈다. 다시 그린 집과 실제 집에 똑같이 쓴다.
import type { Box, Furniture, FurnitureKind, HouseWorld } from './types';

/** 그림만 남기고 충돌 상자를 없애는 장식 */
export const DECOR: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  'floorLamp', 'hanjiLantern', 'cushion', 'pendant', 'hanjiPendant', 'rug', 'path', 'lattice', 'ridgeBeam', 'stairs',
  // 걷기 손질(staging.ts)의 바닥·난간·무대 장식: 크기를 줄이면 이음매가 벌어진다
  'aisle', 'glassRail', 'weddingStage', 'flowerArch', 'puppetStage', 'hyeonpan', 'pathLight', 'sconce', 'welcomeSign',
  'pkmGallery', 'lectureWall', 'constellationMobile', 'tiguanPlanWall', 'blueprintWall', 'ledRibbonWall', 'garageTrackLight', 'garageBayLines',
]);
/** 가구 바닥 면적 배율(가운데 기준). 그림과 충돌 상자에 똑같이 쓴다. */
export const FURNITURE_AREA = 0.8;
/** 한 변의 배율 = 면적 배율의 제곱근 */
export const FURNITURE_SIDE = Math.sqrt(FURNITURE_AREA);
/** 소나무 충돌은 줄기만(한 변, 미터) */
export const PINE_TRUNK = 0.45;

const EPS = 1e-6;
type Rect = { x1: number; x2: number; z1: number; z2: number };

const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.x1 - b.x1) <= EPS && Math.abs(a.x2 - b.x2) <= EPS && Math.abs(a.z1 - b.z1) <= EPS && Math.abs(a.z2 - b.z2) <= EPS;

/** 가운데를 그대로 두고 한 변을 k배로 */
function scaled(r: Rect, k: number): Rect {
  const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
  const hx = ((r.x2 - r.x1) * k) / 2, hz = ((r.z2 - r.z1) * k) / 2;
  return { x1: cx - hx, x2: cx + hx, z1: cz - hz, z2: cz + hz };
}

/** 가운데에 놓인 한 변 s짜리 정사각형 */
function square(r: Rect, s: number): Rect {
  const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
  return { x1: cx - s / 2, x2: cx + s / 2, z1: cz - s / 2, z2: cz + s / 2 };
}

/**
 * 가구 하나의 충돌 상자를 찾는다: 좌표가 같은(±1e-6) 같은 층 상자. 꼬리표가 가구 종류와 같은 것을 먼저,
 * 꼬리표 없는 것은 그다음으로 보고, 벽·문 같은 다른 꼬리표 상자는 좌표가 같아도 건드리지 않는다.
 * 한 상자는 한 가구에만 짝짓는다.
 */
function findBox(boxes: readonly Box[], used: ReadonlySet<number>, f: Furniture): number {
  let fallback = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (used.has(i) || b.level !== f.level || !sameRect(b, f)) continue;
    if (b.tag === f.kind) return i;
    if (b.tag === undefined && fallback < 0) fallback = i;
  }
  return fallback;
}

const tunedWorlds = new WeakSet<HouseWorld>();

/** 걷기용으로 손질한 새 세계를 돌려준다. 원본은 바꾸지 않는다. 이미 손질한 세계를 넣으면 그대로 돌려준다. */
export function tuneWorld(w: HouseWorld): HouseWorld {
  if (tunedWorlds.has(w)) return w;
  const boxes: Box[] = w.physics.boxes.map((b) => ({ ...b }));
  const used = new Set<number>();
  const drop = new Set<number>();
  const furniture: Furniture[] = w.furniture.map((f) => {
    const i = f.collide ? findBox(boxes, used, f) : -1;
    if (i >= 0) used.add(i);
    if (DECOR.has(f.kind)) {
      if (i >= 0) drop.add(i);
      return { ...f, collide: false };
    }
    if (f.kind === 'pine') {
      if (i >= 0) boxes[i] = { ...boxes[i], ...square(f, PINE_TRUNK) };
      return { ...f };
    }
    const r = scaled(f, FURNITURE_SIDE);
    if (i >= 0) boxes[i] = { ...boxes[i], ...r };
    return { ...f, ...r };
  });
  const out: HouseWorld = {
    ...w,
    furniture,
    physics: { ...w.physics, boxes: boxes.filter((_, i) => !drop.has(i)) },
  };
  tunedWorlds.add(out);
  return out;
}
