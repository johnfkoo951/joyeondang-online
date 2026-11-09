// 걸어 다니는 조연당: 놀기 좋게 지어낸 배치다. 실제 평면(작업대의 정본 모형)을 보지 않고 만들었고,
// 방 크기·위치·연결·창은 실제와 다르다. 가족 생활 공간과 숨은 동선은 넣지 않았다.
// 단위는 미터. 집 앞면이 z=0, 집 안쪽이 z<0, 마당이 z>0. 1층 바닥 y=0, 2층 바닥 y=L2Y.
import type { Door } from '@/content/rooms';
import type {
  Box, CeilingSpec, DoorSpec, FloorSpec, Furniture, Hotspot, HouseWorld, Level, Portal, Prop, Ramp, WallSpec, WallStyle, WindowSpec, Zone,
} from '@/walk/types';

export type { DoorSpec, FloorSpec, Furniture, FurnitureKind, Hotspot, HouseWorld, Portal, WallSpec, WallStyle, Zone } from '@/walk/types';

export const L2Y = 3.2;
const WALL_T = 0.2;
const H1 = L2Y; // 1층 벽 높이
const H2 = 2.8; // 2층 벽 높이

type Seg = { level: Level; axis: 'x' | 'z'; at: number; from: number; to: number; style: WallStyle; height?: number };
type Opening = {
  level: Level;
  x1: number; x2: number; z1: number; z2: number;
  top: number; // 문 위쪽 높이(바닥 기준)
  /** portal = 방 장면으로 들어가는 문. 문짝은 늘 닫혀 있고(빈 방으로 걸어 들어가지 않게) 「들어가기」로만 들어간다 */
  door?: { slug?: string; label: string; style: 'wood' | 'lacquer'; portal?: true };
};


// ───────── 벽 선(같은 층 안에서 문·통로 자리는 Opening이 잘라 낸다)
const SEGS: Seg[] = [
  // 1층 바깥벽
  { level: 1, axis: 'x', at: 0, from: -10, to: 10, style: 'ext' },
  { level: 1, axis: 'x', at: -12, from: -10, to: 10, style: 'ext' },
  { level: 1, axis: 'z', at: -10, from: -12, to: 0, style: 'ext' },
  { level: 1, axis: 'z', at: 10, from: -12, to: 0, style: 'ext' },
  // 1층 안벽
  { level: 1, axis: 'z', at: -4, from: -12, to: 0, style: 'int1' },
  { level: 1, axis: 'x', at: -6, from: -10, to: -4, style: 'int1' },
  { level: 1, axis: 'x', at: -3.5, from: -4, to: 4, style: 'int1' },
  { level: 1, axis: 'z', at: 4, from: -12, to: 0, style: 'int1' },
  { level: 1, axis: 'x', at: -5, from: 4, to: 10, style: 'int1' },
  // 2층 바깥벽
  { level: 2, axis: 'x', at: 0, from: -10, to: 10, style: 'ext' },
  { level: 2, axis: 'x', at: -12, from: -10, to: 10, style: 'ext' },
  { level: 2, axis: 'z', at: -10, from: -12, to: 0, style: 'ext' },
  { level: 2, axis: 'z', at: 10, from: -12, to: 0, style: 'ext' },
  // 2층 안벽
  { level: 2, axis: 'x', at: -4.6, from: -10, to: 8.2, style: 'int2' },
  { level: 2, axis: 'z', at: -6, from: -12, to: -4.6, style: 'int2' },
  { level: 2, axis: 'z', at: 6, from: -12, to: -4.6, style: 'int2' },
  { level: 2, axis: 'x', at: -8, from: 6, to: 10, style: 'int2' },
  // 마당 둘레 낮은 돌담과 집 옆을 잇는 담
  { level: 1, axis: 'z', at: -16, from: 0, to: 18, style: 'stonewall', height: 0.7 },
  { level: 1, axis: 'z', at: 16, from: 0, to: 18, style: 'stonewall', height: 0.7 },
  { level: 1, axis: 'x', at: 18, from: -16, to: 16, style: 'stonewall', height: 0.7 },
  { level: 1, axis: 'x', at: 0, from: -16, to: -10, style: 'stonewall', height: 0.7 },
  { level: 1, axis: 'x', at: 0, from: 10, to: 16, style: 'stonewall', height: 0.7 },
];

const OPENINGS: Opening[] = [
  // 1층
  { level: 1, x1: -1, x2: 1, z1: -0.3, z2: 0.3, top: 2.4 }, // 현관문(열림)
  { level: 1, x1: -4.3, x2: -3.7, z1: -2.6, z2: -1.4, top: 2.2, door: { slug: 'atelier', label: '창이 큰 방', style: 'wood' } },
  { level: 1, x1: -4.3, x2: -3.7, z1: -9.6, z2: -8.4, top: 2.2, door: { slug: 'study', label: '빛이 드는 방', style: 'wood', portal: true } },
  { level: 1, x1: -1.5, x2: 1.5, z1: -3.8, z2: -3.2, top: 2.7 }, // 현관 → 거실 통로
  { level: 1, x1: 3.7, x2: 4.3, z1: -8.6, z2: -7.4, top: 2.2, door: { slug: 'kitchen', label: '주방과 식탁', style: 'wood' } },
  { level: 1, x1: 3.7, x2: 4.3, z1: -2.9, z2: -1.1, top: 2.6 }, // 현관 → 계단 홀
  // 계단 홀 안쪽 벽에 낸 문: 손님방(방 장면으로만 들어간다)
  { level: 1, x1: 5.2, x2: 6.4, z1: -5.3, z2: -4.7, top: 2.2, door: { slug: 'guest', label: '손님방', style: 'wood', portal: true } },
  { level: 1, x1: -1.5, x2: 1.5, z1: 17.7, z2: 18.3, top: 0.7 }, // 마당 대문 자리(밖으로는 못 나감)
  // 2층
  { level: 2, x1: 5.7, x2: 6.3, z1: -7.4, z2: -5.4, top: 2.4 }, // 계단참 → 박공 아래 거실
  { level: 2, x1: -0.6, x2: 0.6, z1: -4.9, z2: -4.3, top: 2.1, door: { label: '작은 방', style: 'lacquer' } },
  { level: 2, x1: -6.3, x2: -5.7, z1: -9.2, z2: -8.0, top: 2.1, door: { label: '사계절 창 방', style: 'lacquer' } },
  { level: 2, x1: 7.4, x2: 8.6, z1: -8.3, z2: -7.7, top: 2.1, door: { label: '2층 주방', style: 'lacquer' } },
  // 박공 아래 거실 앞벽에 새로 낸 두 문(작은 방 문 양옆): 방 장면으로만 들어간다
  { level: 2, x1: 2.8, x2: 4.0, z1: -4.9, z2: -4.3, top: 2.1, door: { slug: 'target', label: '종이공 과녁 방', style: 'lacquer', portal: true } },
  { level: 2, x1: -4.0, x2: -2.8, z1: -4.9, z2: -4.3, top: 2.1, door: { slug: 'mind', label: '생각 지도 방', style: 'lacquer', portal: true } },
  // 2층 계단참 벽에 새로 낸 문: 좋아하는 것 방(방 장면으로만 들어간다)
  { level: 2, x1: 6.5, x2: 7.7, z1: -4.9, z2: -4.3, top: 2.1, door: { slug: 'toybox', label: '좋아하는 것 방', style: 'lacquer', portal: true } },
  // 박공 아래 거실 벽(사계절 창 방 문 앞쪽)에 낸 문: 작업 차고(방 장면으로만 들어간다)
  { level: 2, x1: -6.3, x2: -5.7, z1: -7.0, z2: -5.8, top: 2.1, door: { slug: 'garage', label: '작업 차고', style: 'lacquer', portal: true } },
];

// 곧은 계단 한 줄기: 북쪽 끝(z=-4.6)이 2층 높이, 남쪽 끝(z=-1.2)이 1층 바닥
export const STAIRS: Ramp = { x1: 8.2, x2: 9.8, z1: -4.6, z2: -1.2, axis: 'z', y0: L2Y, y1: 0, steps: 17 };

// 계단 난간: 1층에서는 계단 옆으로, 2층에서는 빈 공간 옆으로 떨어지지 않게(두 층 공통)
const RAIL: Box = { x1: 8.1, x2: 8.3, z1: -5, z2: -1.2, level: 0, tag: 'rail' };
// 마당 대문 자리는 보기만 열려 있고 몸은 못 나간다
const GATE_BLOCK: Box = { x1: -1.5, x2: 1.5, z1: 18.1, z2: 18.6, level: 1, tag: 'gate' };

export const FLOORS: FloorSpec[] = [
  { level: 1, x1: -16, x2: 16, z1: 0, z2: 18, mat: 'lawn' },
  { level: 1, x1: -4.8, x2: 4.8, z1: 0, z2: 2.6, mat: 'porch' },
  { level: 1, x1: -4, x2: 4, z1: -3.5, z2: 0, mat: 'redstone' },
  { level: 1, x1: -4, x2: 4, z1: -12, z2: -3.5, mat: 'oak' },
  { level: 1, x1: -10, x2: -4, z1: -6, z2: 0, mat: 'oak' },
  { level: 1, x1: -10, x2: -4, z1: -12, z2: -6, mat: 'oak' },
  { level: 1, x1: 4, x2: 10, z1: -12, z2: -5, mat: 'tile' },
  { level: 1, x1: 4, x2: 10, z1: -5, z2: 0, mat: 'oak' },
  { level: 2, x1: -6, x2: 6, z1: -12, z2: -4.6, mat: 'blackwood' },
  { level: 2, x1: 6, x2: 10, z1: -8, z2: -4.6, mat: 'blackwood' },
  { level: 2, x1: 6, x2: 10, z1: -12, z2: -8, mat: 'blackwood' },
  { level: 2, x1: -10, x2: -6, z1: -12, z2: -4.6, mat: 'blackwood' },
  { level: 2, x1: -10, x2: 8.2, z1: -4.6, z2: 0, mat: 'blackwood' },
];

export const ZONES: Zone[] = [
  { level: 1, x1: -4.8, x2: 4.8, z1: 0, z2: 2.6, name: '세 아치 포치' },
  { level: 1, x1: -16, x2: 16, z1: 0, z2: 18, name: '앞마당' },
  { level: 1, x1: -4, x2: 4, z1: -3.5, z2: 0, name: '현관' },
  { level: 1, x1: -4, x2: 4, z1: -12, z2: -3.5, name: '1층 거실' },
  { level: 1, x1: 4, x2: 10, z1: -5, z2: 0, name: '계단' },
  { level: 2, x1: 8.2, x2: 9.8, z1: -4.6, z2: -1.2, name: '계단' },
  { level: 2, x1: 6, x2: 10, z1: -8, z2: -4.6, name: '2층 계단참' },
  { level: 2, x1: -6, x2: 6, z1: -12, z2: -4.6, name: '박공 아래 거실' },
];

export const HOTSPOTS: Hotspot[] = [
  { id: 'porch', level: 1, x: 0, z: 1.4, r: 1.8, title: '세 아치 포치', line: '세 개의 아치 가운데 하나로 들어와요.', slug: 'porch', kind: 'room' },
  { id: 'pine', level: 1, x: -7, z: 9, r: 2.3, title: '앞마당 소나무', line: '쪽지를 걸어 두는 나무예요.', slug: 'pine', kind: 'room' },
  { id: 'lantern', level: 1, x: 6, z: 7, r: 2.0, title: '석등', line: '남겨 주신 종이만큼 불이 밝아져요.', slug: 'lantern', kind: 'lantern' },
  { id: 'entrance', level: 1, x: 0, z: -1.6, r: 1.5, title: '현관', line: '신발을 벗고 이름표를 달아요.', slug: 'entrance', kind: 'room' },
  { id: 'living', level: 1, x: 0, z: -9.6, r: 2.0, title: '1층 거실 무대', line: '이 집에 사는 다섯 사람을 소개하는 작은 무대예요.', slug: 'living', kind: 'stage' },
  { id: 'atelier', level: 1, x: -3.4, z: -2, r: 1.2, title: '창이 큰 방', line: '창틀에 그림엽서를 그리는 방.', slug: 'atelier', kind: 'door' },
  { id: 'study', level: 1, x: -3.4, z: -9, r: 1.2, title: '빛이 드는 방', line: '바닥에 드는 빛 무늬 아래 좋은 문장을 걸어 두는 방이에요.', slug: 'study', kind: 'portal' },
  { id: 'kitchen', level: 1, x: 3.4, z: -8, r: 1.2, title: '주방과 식탁', line: '함께 차리는 식탁.', slug: 'kitchen', kind: 'door' },
  { id: 'guest', level: 1, x: 5.8, z: -4.3, r: 1.0, title: '손님방', line: '정돈된 침대와 방명록 책상이 있는 조용한 방이에요.', slug: 'guest', kind: 'portal' },
  { id: 'stairs', level: 1, x: 7.6, z: -0.8, r: 1.3, title: '2층으로', line: '계단을 오르면 박공 아래 거실이에요.', kind: 'sign' },
  { id: 'gable', level: 2, x: 0, z: -6.4, r: 2.4, title: '재즈가 흐르는 방', line: '경사진 천장 아래 레코드와 피아노가 있는 재즈 방이에요.', slug: 'gable', kind: 'portal' },
  { id: 'toybox', level: 2, x: 7.1, z: -5.2, r: 1.0, title: '좋아하는 것 방', line: '밝은 놀이 매트와 낮은 선반, 작은 텐트가 있는 아이 취향의 방이에요.', slug: 'toybox', kind: 'portal' },
  { id: 'target', level: 2, x: 3.4, z: -5.2, r: 1.0, title: '종이공 과녁 방', line: '종이공을 던져 과녁을 맞히는 놀이방이에요.', slug: 'target', kind: 'portal' },
  { id: 'mind', level: 2, x: -3.4, z: -5.2, r: 1.0, title: '생각 지도 방', line: '벽 가득 책과 실로 이은 카드가 있는 서재예요.', slug: 'mind', kind: 'portal' },
  { id: 'garage', level: 2, x: -5.3, z: -6.4, r: 1.0, title: '작업 차고', line: '작업대와 공구 벽, 상자 선반과 자전거가 가지런한 차고예요.', slug: 'garage', kind: 'portal' },
  { id: 'small-room', level: 2, x: 0, z: -5.2, r: 0.9, title: '작은 방', line: '이 방은 문을 닫아 두었어요.', kind: 'door' },
  { id: 'season-room', level: 2, x: -5.4, z: -8.6, r: 1.1, title: '사계절 창 방', line: '계절이 바뀌면 열어요.', kind: 'door' },
  { id: 'kitchen2', level: 2, x: 8, z: -7.4, r: 1.1, title: '2층 주방', line: '행사 뒤에 열어요.', kind: 'door' },
];

export const FURNITURE: Furniture[] = [
  // 마당
  { kind: 'path', level: 1, x1: -0.9, x2: 0.9, z1: 2.6, z2: 17.6, collide: false },
  { kind: 'pine', level: 1, x1: -7.4, x2: -6.6, z1: 8.6, z2: 9.4, collide: true },
  { kind: 'stoneLantern', level: 1, x1: 5.6, x2: 6.4, z1: 6.6, z2: 7.4, collide: true },
  { kind: 'yardBench', level: 1, x1: -9.6, x2: -8.0, z1: 11.6, z2: 12.1, face: '-z', collide: true },
  { kind: 'shrub', level: 1, x1: -15.4, x2: -14.2, z1: 2.0, z2: 3.2, collide: true },
  { kind: 'shrub', level: 1, x1: 14.2, x2: 15.4, z1: 2.0, z2: 3.2, collide: true },
  { kind: 'shrub', level: 1, x1: -12.2, x2: -11.0, z1: 16.2, z2: 17.4, collide: true },
  { kind: 'shrub', level: 1, x1: 11.0, x2: 12.2, z1: 16.2, z2: 17.4, collide: true },
  { kind: 'shrub', level: 1, x1: 9.0, x2: 10.0, z1: 12.0, z2: 13.0, collide: true },
  // 현관
  { kind: 'shoeCabinet', level: 1, x1: 1.6, x2: 3.8, z1: -0.55, z2: -0.1, face: '-z', collide: true },
  { kind: 'bench', level: 1, x1: -3.6, x2: -1.8, z1: -0.55, z2: -0.1, face: '-z', collide: true },
  { kind: 'rug', level: 1, x1: -0.7, x2: 0.7, z1: -3.3, z2: -0.3, collide: false },
  // 1층 거실: 빈티지 우드, 코지
  { kind: 'rug', level: 1, x1: -2.2, x2: 2.2, z1: -8.8, z2: -5.4, collide: false },
  { kind: 'sofa', level: 1, x1: -3.9, x2: -3.0, z1: -8.3, z2: -5.7, face: '+x', collide: true },
  { kind: 'armchair', level: 1, x1: 2.2, x2: 3.1, z1: -7.4, z2: -6.4, face: '-x', collide: true },
  { kind: 'coffeeTable', level: 1, x1: -0.7, x2: 0.7, z1: -7.4, z2: -6.6, collide: true },
  { kind: 'bookshelf', level: 1, x1: 3.5, x2: 3.95, z1: -11.6, z2: -9.2, face: '-x', collide: true },
  { kind: 'floorLamp', level: 1, x1: -3.55, x2: -3.15, z1: -10.3, z2: -9.9, collide: true },
  { kind: 'recordCabinet', level: 1, x1: 3.45, x2: 3.95, z1: -5.6, z2: -4.2, face: '-x', collide: true },
  { kind: 'stage', level: 1, x1: -3, x2: 3, z1: -11.9, z2: -10.6, collide: true },
  { kind: 'pendant', level: 1, x1: -1.4, x2: -1.0, z1: -7.2, z2: -6.8, collide: false },
  { kind: 'pendant', level: 1, x1: 1.0, x2: 1.4, z1: -7.2, z2: -6.8, collide: false },
  // 2층: 블랙 앤 실버, 한국 전통 요소(창살, 한지, 좌식 상, 병풍, 반닫이)
  { kind: 'lattice', level: 2, x1: -5, x2: -2.4, z1: -11.95, z2: -11.85, face: '+z', collide: false },
  { kind: 'lattice', level: 2, x1: -1.3, x2: 1.3, z1: -11.95, z2: -11.85, face: '+z', collide: false },
  { kind: 'lattice', level: 2, x1: 2.4, x2: 5, z1: -11.95, z2: -11.85, face: '+z', collide: false },
  { kind: 'lowTable', level: 2, x1: -0.9, x2: 0.9, z1: -8.9, z2: -8.1, collide: true },
  { kind: 'cushion', level: 2, x1: -0.3, x2: 0.3, z1: -7.85, z2: -7.35, collide: false },
  { kind: 'cushion', level: 2, x1: -0.3, x2: 0.3, z1: -9.65, z2: -9.15, collide: false },
  { kind: 'cushion', level: 2, x1: -1.55, x2: -1.05, z1: -8.8, z2: -8.2, collide: false },
  { kind: 'cushion', level: 2, x1: 1.05, x2: 1.55, z1: -8.8, z2: -8.2, collide: false },
  { kind: 'foldingScreen', level: 2, x1: -5.85, x2: -5.4, z1: -11.2, z2: -9.6, face: '+x', collide: true },
  { kind: 'lacquerChest', level: 2, x1: 5.2, x2: 5.85, z1: -11.0, z2: -9.6, face: '-x', collide: true },
  { kind: 'hanjiLantern', level: 2, x1: -5.0, x2: -4.6, z1: -5.4, z2: -5.0, collide: true },
  { kind: 'hanjiLantern', level: 2, x1: 4.6, x2: 5.0, z1: -5.4, z2: -5.0, collide: true },
  { kind: 'hanjiLantern', level: 2, x1: 8.8, x2: 9.2, z1: -7.6, z2: -7.2, collide: true },
  { kind: 'hanjiPendant', level: 2, x1: -0.5, x2: 0.5, z1: -8.8, z2: -8.2, collide: false },
  { kind: 'ridgeBeam', level: 2, x1: -6, x2: 6, z1: -8.45, z2: -8.15, collide: false },
];

export const SPAWN = { x: 0, z: 15.5, yaw: 0 };

/**
 * 방 장면으로 들어가는 문. 방에서 나오면 늘 이 자리에 이 방향을 보고 선다(문을 등지고 집 안쪽을 본다).
 * 빛이 드는 방은 1층 거실 쪽 문 앞, 재즈가 흐르는 방은 박공 아래 거실 한가운데, 새로 낸 두 문은 박공 아래 거실 쪽 문 앞,
 * 좋아하는 것 방은 2층 계단참 벽 문 앞, 손님방은 1층 계단 홀 안쪽 벽 문 앞, 작업 차고는 박공 아래 거실 벽 문 앞.
 */
export const PORTALS: Portal[] = [
  { slug: 'study', level: 1, x: -3.4, z: -9.0, yaw: -Math.PI / 2, label: '빛이 드는 방' },
  { slug: 'gable', level: 2, x: 0, z: -6.4, yaw: 0, label: '재즈가 흐르는 방' },
  { slug: 'target', level: 2, x: 3.4, z: -5.35, yaw: 0, label: '종이공 과녁 방' },
  { slug: 'mind', level: 2, x: -3.4, z: -5.35, yaw: 0, label: '생각 지도 방' },
  { slug: 'toybox', level: 2, x: 7.1, z: -5.35, yaw: 0, label: '좋아하는 것 방' },
  { slug: 'guest', level: 1, x: 5.8, z: -4.3, yaw: Math.PI, label: '손님방' },
  { slug: 'garage', level: 2, x: -5.3, z: -6.4, yaw: -Math.PI / 2, label: '작업 차고' },
];

const HOUSE = { x1: -10, x2: 10, z1: -12, z2: 0 };
const EAVE = L2Y + 2.8;
const PROPS: Prop[] = [
  // 포치: 화강석 기둥 넷, 회벽 아치 셋, 평지붕
  ...[-4.5, -1.5, 1.5, 4.5].map((x): Prop => ({ type: 'column', x, z: 2.3, w: 0.44, h: 3.0 })),
  ...[-3, 0, 3].map((x): Prop => ({ type: 'arch', x, z: 2.3, span: 3, spring: 1.72, axis: 'x' })),
  { type: 'slab', x1: -4.9, x2: 4.9, z1: -0.1, z2: 2.7, y: 3.24, t: 0.24, part: 'porch' },
  // 지붕: 동서로 길게 용마루가 지나는 박공
  { type: 'gable', x1: -10, x2: 10, z1: -12, z2: 0, eave: EAVE, ridge: EAVE + 2.2, ridgeAxis: 'x' },
];
// 앞벽의 창(놀이용 배치)
const WINDOWS: WindowSpec[] = [
  { level: 1, axis: 'x', at: 0, from: -8.5, to: -5.5, sill: 0.9, top: 2.5 },
  { level: 1, axis: 'x', at: 0, from: 6.4, to: 7.6, sill: 1.0, top: 2.2 },
  { level: 2, axis: 'x', at: 0, from: -7.7, to: -6.3, sill: 0.9, top: 2.1 },
  { level: 2, axis: 'x', at: 0, from: -3.2, to: -1.8, sill: 0.9, top: 2.1 },
  { level: 2, axis: 'x', at: 0, from: 2.3, to: 3.7, sill: 0.9, top: 2.1 },
  { level: 2, axis: 'x', at: -12, from: -5, to: 5, sill: 0.6, top: 2.2 },
];
// 1층 천장은 2층 바닥 아래. 2층은 박공 지붕 안쪽이 그대로 천장이다.
const CEILINGS: CeilingSpec[] = [
  { level: 1, x1: -10, x2: 8.2, z1: -12, z2: 0, y: H1 - 0.01 },
  { level: 1, x1: 8.2, x2: 10, z1: -12, z2: -4.6, y: H1 - 0.01 }, // 계단 위는 2층까지 트여 있다
];

function cut(seg: Seg): Array<[number, number]> {
  let parts: Array<[number, number]> = [[Math.min(seg.from, seg.to), Math.max(seg.from, seg.to)]];
  for (const o of OPENINGS) {
    if (o.level !== seg.level) continue;
    const onLine = seg.axis === 'x' ? o.z1 <= seg.at && seg.at <= o.z2 : o.x1 <= seg.at && seg.at <= o.x2;
    if (!onLine) continue;
    const [a, b] = seg.axis === 'x' ? [o.x1, o.x2] : [o.z1, o.z2];
    parts = parts.flatMap(([p, q]) => {
      if (b <= p || a >= q) return [[p, q] as [number, number]];
      const out: Array<[number, number]> = [];
      if (a > p) out.push([p, a]);
      if (b < q) out.push([b, q]);
      return out;
    });
  }
  return parts.filter(([p, q]) => q - p > 0.01);
}

function segBox(axis: 'x' | 'z', at: number, p: number, q: number, level: 0 | 1 | 2, tag?: string): Box {
  return axis === 'x'
    ? { x1: p, x2: q, z1: at - WALL_T / 2, z2: at + WALL_T / 2, level, tag }
    : { x1: at - WALL_T / 2, x2: at + WALL_T / 2, z1: p, z2: q, level, tag };
}

/** 문패 상태(DB)를 받아 이번에 걸을 다시 그린 집을 만든다. 열린 문패의 방은 문짝이 없어진다. */
export function buildWorld(doorStates: Record<string, Door> = {}): HouseWorld {
  const walls: WallSpec[] = [];
  const headers: WallSpec[] = [];
  const doors: DoorSpec[] = [];
  for (const seg of SEGS) {
    const baseY = seg.level === 2 ? L2Y : 0;
    const height = seg.height ?? (seg.level === 2 ? H2 : H1);
    for (const [p, q] of cut(seg)) {
      walls.push({ box: segBox(seg.axis, seg.at, p, q, seg.level), baseY, height, style: seg.style, axis: seg.axis });
    }
  }
  for (const o of OPENINGS) {
    const seg = SEGS.find((s) => s.level === o.level && (s.axis === 'x' ? o.z1 <= s.at && s.at <= o.z2 : o.x1 <= s.at && s.at <= o.x2));
    if (!seg) continue;
    const baseY = o.level === 2 ? L2Y : 0;
    const wallH = seg.height ?? (o.level === 2 ? H2 : H1);
    const [a, b] = seg.axis === 'x' ? [o.x1, o.x2] : [o.z1, o.z2];
    if (wallH > o.top + 0.01) {
      headers.push({ box: segBox(seg.axis, seg.at, a, b, o.level), baseY: baseY + o.top, height: wallH - o.top, style: seg.style, axis: seg.axis });
    }
    if (o.door) {
      const state = o.door.slug ? doorStates[o.door.slug] ?? 'resting' : 'closed';
      doors.push({
        box: segBox(seg.axis, seg.at, a, b, o.level, `door:${o.door.slug ?? o.door.label}`),
        baseY, height: o.top, style: o.door.style, axis: seg.axis,
        closed: o.door.portal ? true : state !== 'open', label: o.door.label, slug: o.door.slug,
      });
    }
  }
  const boxes: Box[] = [
    ...walls.map((w) => w.box),
    ...doors.filter((d) => d.closed).map((d) => d.box),
    ...FURNITURE.filter((f) => f.collide).map((f) => ({ x1: f.x1, x2: f.x2, z1: f.z1, z2: f.z2, level: f.level, tag: f.kind })),
    // 포치 기둥 네 개
    ...[-4.5, -1.5, 1.5, 4.5].map((x) => ({ x1: x - 0.22, x2: x + 0.22, z1: 2.08, z2: 2.52, level: 1 as const, tag: 'column' })),
    RAIL,
    GATE_BLOCK,
  ];
  return {
    kind: 'redrawn', floor2: L2Y, house: HOUSE, floors: FLOORS, walls, headers, doors, ceilings: CEILINGS, windows: WINDOWS,
    furniture: FURNITURE, props: PROPS, zones: ZONES, hotspots: HOTSPOTS, spawn: SPAWN,
    physics: { boxes, ramps: [STAIRS], floor2: L2Y },
    portals: PORTALS.map((p) => ({ ...p })),
  };
}

type Lookup = Pick<HouseWorld, 'zones' | 'hotspots'>;
const REDRAWN: Lookup = { zones: ZONES, hotspots: HOTSPOTS };

export function zoneAt(level: Level, x: number, z: number, w: Lookup = REDRAWN): string {
  return w.zones.find((zn) => zn.level === level && x >= zn.x1 && x <= zn.x2 && z >= zn.z1 && z <= zn.z2)?.name ?? (z > 0 ? '앞마당' : '조연당');
}

export function nearestHotspot(level: Level, x: number, z: number, w: Lookup = REDRAWN): Hotspot | null {
  let best: Hotspot | null = null;
  let bestD = Infinity;
  // 살피기는 같은 공간에 있을 때만(벽 너머 옆방·포치가 잡히지 않게). 문 앞 살피기(문·들어가는 문·나가는 문)는 벽에 붙어 있어 예외.
  const here = zoneAt(level, x, z, w);
  for (const h of w.hotspots) {
    if (h.level !== level) continue;
    const atDoor = h.kind === 'door' || h.kind === 'portal' || h.kind === 'exit';
    if (!atDoor && zoneAt(h.level, h.x, h.z, w) !== here) continue;
    const d = Math.hypot(h.x - x, h.z - z);
    if (d <= h.r && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
