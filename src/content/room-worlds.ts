// 문으로 들어가는 방 장면 일곱. 집과 따로 지은 작은 세계라 걷기 엔진이 같은 모양(HouseWorld, kind 'room')으로 그린다.
// 공개 묶음에 들어가므로 실명·장소 이름·실제 치수는 없다. 방 크기는 놀기 좋게 정한 약 5×6m.
// 좌표: 방 가운데가 (0, 0), 문 하나·창 하나 이상, 바닥 y=0(1층만). 앞쪽 방향 = (-sin yaw, -cos yaw).
// 가구 자리는 걷기 엔진의 손질(tuneWorld: 장식이 아닌 가구를 한 변 √0.8배로 줄임) 뒤의 크기로 적고,
// 저장할 때 그만큼 미리 키워 둔다. 그래서 벽을 따라 붙인 책장·벽지·줄이 손질 뒤에 벽 끝까지 꼭 맞는다.
import type {
  Box, CeilingSpec, DoorSpec, FloorMat, Furniture, FurnitureKind, Hotspot, HouseWorld, WallSpec, WindowSpec,
} from '@/walk/types';

/** 방 장면이 있는 방(rooms.ts slug) */
export const ROOM_SCENES: string[] = ['gable', 'toybox', 'target', 'mind', 'study', 'guest', 'garage'];

/**
 * 방마다 놀이(id·이름·한 줄). src/games/registry.ts의 gamesInRoom()과 같아야 한다(시험이 맞춰 본다).
 * registry를 직접 부르지 않는 까닭: 이 파일은 node 시험에서도 그대로 돌아야 해서 값 가져오기를 두지 않는다.
 */
export const ROOM_GAMES: Record<string, Array<{ id: string; title: string; blurb: string }>> = {
  gable: [{ id: 'jam', title: '박공 아래 잼', blurb: '네 박자를 듣고 그대로 받아 쳐요. 세 판을 넘기면 두 마디를 오늘의 곡에 이어 붙여요.' }],
  toybox: [{ id: 'shelf', title: '좋아하는 것 선반', blurb: '선반에 좋아하는 것들을 골라 올려 나만의 선반을 꾸며요.' }],
  target: [{ id: 'target', title: '종이공 과녁', blurb: '종이공을 던져 떠오르는 과녁을 맞혀요. 60초 동안 몇 개나 맞힐까요?' }],
  mind: [{ id: 'brain', title: '생각 지도 퀴즈', blurb: '낱말을 알맞은 지식 서랍에 넣고, 생각이 자라는 순서를 맞혀요.' }],
  study: [{ id: 'sentences', title: '문장 걸어 두기', blurb: '요즘 만난 좋은 문장 하나를 출처와 함께 옮겨 적어 벽에 걸어요. 걸린 문장도 한 장씩 읽어요.' }],
  // 손님방·작업 차고는 놀이 없이 둘러보는 방
  guest: [],
  garage: [],
};

export type ToyShape = 'dino' | 'car' | 'train' | 'blocks' | 'robot' | 'ball' | 'star' | 'book' | 'crayons' | 'drum' | 'boat' | 'bear';
/**
 * 아이 취향 선반에 올리는 소품(좋아하는 것 방·과녁 방의 선반과 장난감 상자). 취향이 바뀌면 이 배열만 고친다.
 * shape는 furnish.ts가 아는 모양 열둘 가운데 하나, color는 주된 색. 선반마다 이 목록을 다른 자리에서부터 차례로 올린다.
 */
export const TOY_SHELF: Array<{ name: string; shape: ToyShape; color: string }> = [
  { name: '초록 공룡', shape: 'dino', color: '#5fb85a' },
  { name: '빨간 자동차', shape: 'car', color: '#e2553f' },
  { name: '나무 블록', shape: 'blocks', color: '#f2b33d' },
  { name: '파란 기차', shape: 'train', color: '#3d7fd1' },
  { name: '로봇', shape: 'robot', color: '#9aa7b4' },
  { name: '줄무늬 공', shape: 'ball', color: '#f07aa0' },
  { name: '별', shape: 'star', color: '#ffd23f' },
  { name: '그림책', shape: 'book', color: '#7a5cc7' },
  { name: '크레파스 통', shape: 'crayons', color: '#ff8a3d' },
  { name: '작은 북', shape: 'drum', color: '#d8443a' },
  { name: '종이배', shape: 'boat', color: '#f4f1e8' },
  { name: '곰 인형', shape: 'bear', color: '#b0784a' },
  { name: '주황 공룡', shape: 'dino', color: '#f08c3a' },
  { name: '노란 버스', shape: 'car', color: '#f5c518' },
];

// ───────── 방 껍데기: 벽 넷, 문 하나, 창, 천장
const WALL_T = 0.2;
/** 걷기 엔진 손질 배율(src/walk/tune.ts FURNITURE_SIDE, 시험이 맞춰 본다) */
const TUNE_SIDE = Math.sqrt(0.8);
/** 손질에서 크기를 바꾸지 않는 가구(tune.ts DECOR와 소나무) */
const TUNE_KEEPS: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  'floorLamp', 'hanjiLantern', 'cushion', 'pendant', 'hanjiPendant', 'rug', 'path', 'lattice', 'ridgeBeam', 'stairs', 'pine',
]);

type WallSide = '-z' | '+z' | '-x' | '+x';
type Spot = { x: number; z: number; r: number };
type RoomSpec = {
  slug: string;
  name: string;
  /** 벽 가운데 선 사이 너비(x)와 깊이(z), 벽 높이, 천장 높이 */
  w: number; d: number; h: number; ceiling: number;
  floor: FloorMat;
  /** 문: 어느 벽, 벽을 따라간 가운데 자리, 너비, 높이 */
  door: { wall: WallSide; at: number; width: number; top: number };
  windows: Array<{ wall: WallSide; from: number; to: number; sill: number; top: number }>;
  spawn: { x: number; z: number; yaw: number };
  exit: Spot;
  /** ROOM_GAMES 차례대로 놀이 자리 */
  games: Spot[];
  /** 손질 뒤 크기로 적은 가구 */
  furniture: Furniture[];
};

/** 가구 한 줄: 종류, x1·x2·z1·z2, 정면, 충돌 */
function f(kind: FurnitureKind, x1: number, x2: number, z1: number, z2: number, face?: Furniture['face'], collide = false): Furniture {
  return face ? { kind, level: 1, x1, x2, z1, z2, face, collide } : { kind, level: 1, x1, x2, z1, z2, collide };
}

/** 걷기 엔진이 줄일 몫만큼 미리 키운다(가운데 기준). 줄이지 않는 장식은 그대로. */
function pre(item: Furniture): Furniture {
  if (TUNE_KEEPS.has(item.kind)) return item;
  const cx = (item.x1 + item.x2) / 2, cz = (item.z1 + item.z2) / 2;
  const hx = (item.x2 - item.x1) / 2 / TUNE_SIDE, hz = (item.z2 - item.z1) / 2 / TUNE_SIDE;
  return { ...item, x1: cx - hx, x2: cx + hx, z1: cz - hz, z2: cz + hz };
}

const axisOf = (wall: WallSide): 'x' | 'z' => (wall === '-z' || wall === '+z' ? 'x' : 'z');

/** 벽 하나의 선 좌표와 벽을 따라간 구간 */
function wallLine(spec: RoomSpec, wall: WallSide): { at: number; from: number; to: number } {
  const hw = spec.w / 2, hd = spec.d / 2;
  if (wall === '-z') return { at: -hd, from: -hw - WALL_T / 2, to: hw + WALL_T / 2 };
  if (wall === '+z') return { at: hd, from: -hw - WALL_T / 2, to: hw + WALL_T / 2 };
  return { at: wall === '-x' ? -hw : hw, from: -hd, to: hd };
}

function wallBox(axis: 'x' | 'z', at: number, p: number, q: number, tag?: string): Box {
  return axis === 'x'
    ? { x1: p, x2: q, z1: at - WALL_T / 2, z2: at + WALL_T / 2, level: 1, tag }
    : { x1: at - WALL_T / 2, x2: at + WALL_T / 2, z1: p, z2: q, level: 1, tag };
}

function buildRoom(spec: RoomSpec): HouseWorld {
  const walls: WallSpec[] = [];
  const headers: WallSpec[] = [];
  const doors: DoorSpec[] = [];
  const dw = spec.door.width / 2;
  for (const wall of ['-z', '+z', '-x', '+x'] as WallSide[]) {
    const axis = axisOf(wall);
    const { at, from, to } = wallLine(spec, wall);
    const parts: Array<[number, number]> = wall === spec.door.wall
      ? [[from, spec.door.at - dw], [spec.door.at + dw, to]]
      : [[from, to]];
    for (const [p, q] of parts) {
      if (q - p > 0.01) walls.push({ box: wallBox(axis, at, p, q), baseY: 0, height: spec.h, style: 'ext', axis });
    }
    if (wall !== spec.door.wall) continue;
    const a = spec.door.at - dw, b = spec.door.at + dw;
    headers.push({ box: wallBox(axis, at, a, b), baseY: spec.door.top, height: spec.h - spec.door.top, style: 'ext', axis });
    doors.push({
      box: wallBox(axis, at, a, b, `door:exit:${spec.slug}`), baseY: 0, height: spec.door.top, style: 'wood', axis,
      closed: true, label: '나가는 문',
    });
  }
  const windows: WindowSpec[] = spec.windows.map((win) => ({
    level: 1, axis: axisOf(win.wall), at: wallLine(spec, win.wall).at, from: win.from, to: win.to, sill: win.sill, top: win.top,
  }));
  const hw = spec.w / 2, hd = spec.d / 2;
  const ceilings: CeilingSpec[] = [{ level: 1, x1: -hw, x2: hw, z1: -hd, z2: hd, y: spec.ceiling }];
  const furniture = spec.furniture.map(pre);
  const games = ROOM_GAMES[spec.slug] ?? [];
  const hotspots: Hotspot[] = [
    { id: 'exit', level: 1, ...spec.exit, title: '나가는 문', line: '나가면 들어온 문 앞으로 돌아가요.', kind: 'exit' },
    ...games.map((g, i): Hotspot => ({
      id: `game-${g.id}`, level: 1, ...spec.games[i], title: g.title, line: g.blurb, kind: 'game', game: g.id,
    })),
  ];
  const boxes: Box[] = [
    ...walls.map((w) => w.box),
    ...doors.map((d) => d.box),
    ...furniture.filter((it) => it.collide).map((it) => ({ x1: it.x1, x2: it.x2, z1: it.z1, z2: it.z2, level: it.level, tag: it.kind })),
  ];
  const outer = { x1: -hw - WALL_T / 2, x2: hw + WALL_T / 2, z1: -hd - WALL_T / 2, z2: hd + WALL_T / 2 };
  return {
    kind: 'room',
    floor2: 3.2,
    house: outer,
    floors: [{ level: 1, x1: -hw, x2: hw, z1: -hd, z2: hd, mat: spec.floor }],
    walls, headers, doors, ceilings, windows, furniture,
    props: [],
    zones: [{ level: 1, ...outer, name: spec.name }],
    hotspots,
    physics: { boxes, ramps: [], floor2: 3.2 },
    spawn: { ...spec.spawn },
    room: { slug: spec.slug, games: games.map((g) => g.id) },
  };
}

// ───────── 방 일곱. 가구 줄: f(종류, x1, x2, z1, z2, 정면, 충돌)
const GABLE: RoomSpec = {
  slug: 'gable', name: '재즈가 흐르는 방', w: 5, d: 6, h: 2.9, ceiling: 2.89, floor: 'oak',
  // 재즈만 두는 방. 용마루가 앞뒤로 지나고 양옆으로 천장이 내려온다. 박공 끝벽에 키 큰 창, 옆벽에 낮은 창.
  door: { wall: '+z', at: 0, width: 1.0, top: 2.1 },
  windows: [
    { wall: '-z', from: -0.7, to: 0.7, sill: 0.8, top: 2.55 },
    { wall: '+x', from: -0.6, to: 0.6, sill: 0.95, top: 1.6 },
  ],
  spawn: { x: 0, z: 1.5, yaw: 0 },
  exit: { x: 0, z: 2.4, r: 0.8 },
  games: [{ x: -0.8, z: 0.1, r: 1.1 }],
  furniture: [
    f('slopedCeiling', -2.4, 2.4, -2.9, 2.9),
    // 재즈 쪽: 레코드장과 턴테이블, 업라이트 피아노와 의자, 작은 무대 러그, 보면대, 벽에 기대 둔 콘트라베이스
    f('recordShelf', -2.4, -2.0, -1.7, -0.1, '+x', true),
    f('piano', -2.3, -0.95, -2.9, -2.32, '+z', true),
    f('bench', -1.95, -1.3, -2.15, -1.82, undefined, true),
    f('roundRug', -1.85, -0.25, -1.2, 0.4),
    f('musicStand', -1.15, -0.75, -0.8, -0.5, '+z'),
    f('doubleBass', -1.55, -0.95, 2.45, 2.9, '-z', true),
    f('armchair', -2.35, -1.55, 0.9, 1.75, '+x', true),
    f('floorLamp', -2.3, -1.95, 0.25, 0.6),
    f('wallFrames', -2.2, -1.05, -2.9, -2.86, '+z'),
    // 듣는 자리: 낮은 창 아래 소파와 찻상, 턴테이블을 올린 레코드 장, 스탠드, 액자
    f('sofa', 1.65, 2.4, -1.1, 1.1, '-x', true),
    f('coffeeTable', 0.75, 1.35, -0.55, 0.55, undefined, true),
    f('recordCabinet', 2.0, 2.4, -2.6, -1.5, '-x', true),
    f('floorLamp', 2.0, 2.35, 1.4, 1.75),
    f('wallFrames', 0.9, 2.0, 2.86, 2.9, '-z'),
    f('plant', 1.0, 1.4, -2.85, -2.45, undefined, true),
    f('pendant', -0.2, 0.2, -0.6, -0.2),
  ],
};

const TOYBOX: RoomSpec = {
  slug: 'toybox', name: '좋아하는 것 방', w: 5, d: 6, h: 2.6, ceiling: 2.59, floor: 'oak',
  // 아이 취향 방: 밝은 퍼즐 매트, 낮은 상자 선반 둘, 장난감 상자, 블록 탑, 구석의 작은 텐트, 창 아래 낮은 그림 책상
  door: { wall: '+z', at: 1.3, width: 1.0, top: 2.1 },
  windows: [
    { wall: '-z', from: -0.8, to: 0.6, sill: 0.75, top: 2.1 },
    { wall: '-x', from: -0.5, to: 0.7, sill: 0.85, top: 1.9 },
  ],
  spawn: { x: 1.3, z: 1.5, yaw: 0 },
  exit: { x: 1.3, z: 2.4, r: 0.8 },
  games: [{ x: 1.3, z: -1.5, r: 1.0 }],
  furniture: [
    f('stripeWall', 2.38, 2.4, -2.88, 2.88, '-x'),
    f('playMat', -1.1, 1.1, -1.4, 0.9),
    f('toyShelf', 0.85, 2.35, -2.9, -2.55, '+z', true),
    f('toyShelf', 2.05, 2.4, -2.2, -0.7, '-x', true),
    f('playTent', -2.35, -1.25, -2.85, -1.75, '+z', true),
    f('blockTower', -0.75, -0.3, -0.95, -0.5, undefined, true),
    f('toyChest', -2.4, -1.85, 1.0, 2.0, '+x', true),
    f('kidDesk', -2.35, -1.45, -0.6, 0.6, '+x', true),
    f('bunting', -2.38, 2.38, -0.42, -0.38),
    f('globeLantern', -0.2, 0.2, -0.2, 0.2),
    f('globeLantern', 1.1, 1.5, -1.9, -1.5),
    f('wallFrames', -2.1, 0.5, 2.86, 2.9, '-z'),
    f('plant', 1.95, 2.35, 2.3, 2.7, undefined, true),
  ],
};

const TARGET: RoomSpec = {
  slug: 'target', name: '종이공 과녁 방', w: 5, d: 6, h: 2.6, ceiling: 2.59, floor: 'oak',
  door: { wall: '+z', at: 0, width: 1.0, top: 2.1 },
  windows: [{ wall: '+x', from: -1.2, to: 0.4, sill: 0.85, top: 2.15 }],
  spawn: { x: 0, z: 1.5, yaw: 0 },
  exit: { x: 0, z: 2.4, r: 0.8 },
  games: [{ x: 0, z: 0.4, r: 1.0 }],
  furniture: [
    // 밝은 줄무늬 벽지(창 낸 벽은 회벽 그대로), 맞은편 벽에 과녁판 셋
    f('stripeWall', -2.4, 2.4, -2.9, -2.88, '+z'),
    f('stripeWall', -2.4, -2.38, -2.88, 2.88, '+x'),
    f('stripeWall', -2.38, -0.6, 2.88, 2.9, '-z'),
    f('stripeWall', 0.6, 2.4, 2.88, 2.9, '-z'),
    f('targets', -2.1, 2.1, -2.88, -2.8, '+z'),
    f('playMat', -1.3, 1.3, -0.4, 1.6),
    f('paperBasket', 1.45, 1.95, 0.95, 1.45, undefined, true),
    f('kidDesk', -2.35, -1.45, -1.7, -0.5, '+x', true),
    f('toyShelf', -2.38, -2.03, 0.5, 1.9, '+x', true),
    f('bunting', -2.38, 2.38, -1.32, -1.28),
    f('bunting', -2.38, 2.38, 0.88, 0.92),
    f('globeLantern', -0.25, 0.25, 0.35, 0.85),
    f('globeLantern', -1.7, -1.3, -1.0, -0.6),
    f('plant', 1.85, 2.3, -2.75, -2.3, undefined, true),
    f('wallFrames', 2.36, 2.4, 0.8, 2.1, '-x'),
  ],
};

const MIND: RoomSpec = {
  slug: 'mind', name: '생각 지도 방', w: 5, d: 6, h: 2.6, ceiling: 2.59, floor: 'oak',
  door: { wall: '+z', at: 1.0, width: 1.0, top: 2.1 },
  windows: [{ wall: '-z', from: -0.6, to: 0.6, sill: 0.9, top: 2.15 }],
  spawn: { x: 1.0, z: 1.5, yaw: 0 },
  exit: { x: 1.0, z: 2.4, r: 0.8 },
  games: [{ x: 1.35, z: -0.7, r: 1.1 }],
  furniture: [
    f('rug', -1.3, 1.1, -1.4, 1.0),
    // 벽 가득 책장(창 양옆까지), 창 아래 읽는 책상, 실로 이은 카드 보드, 아홉 칸 서랍장, 작은 칠판
    f('bookWall', -2.4, -2.05, -2.9, 2.1, '+x', true),
    f('bookWall', -2.05, -0.75, -2.9, -2.55, '+z', true),
    f('bookWall', 0.75, 2.4, -2.9, -2.55, '+z', true),
    f('readingDesk', -0.65, 0.65, -2.9, -2.3, '+z', true),
    f('chair', -0.25, 0.25, -2.15, -1.7, '-z', true),
    f('corkBoard', 2.34, 2.4, -2.0, 0.6, '-x'),
    f('drawers9', 1.95, 2.4, 0.95, 2.05, '-x', true),
    f('chalkboard', -1.7, -0.5, 2.84, 2.9, '-z'),
    f('armchair', -2.0, -1.2, 0.35, 1.15, '+x', true),
    f('floorLamp', -1.95, -1.6, 1.35, 1.7),
    f('plant', 1.9, 2.3, -2.5, -2.1, undefined, true),
    f('pendant', -0.2, 0.2, -0.6, -0.2),
  ],
};

const STUDY: RoomSpec = {
  slug: 'study', name: '빛이 드는 방', w: 5, d: 6, h: 2.6, ceiling: 2.59, floor: 'oak',
  // 문으로 들어서면 맞은편 큰 창과 바닥에 드는 창살 빛 무늬가 먼저 보인다
  door: { wall: '-z', at: 0, width: 1.0, top: 2.1 },
  windows: [{ wall: '+z', from: -1.6, to: 1.6, sill: 0.5, top: 2.3 }],
  spawn: { x: 0, z: -1.5, yaw: Math.PI },
  exit: { x: 0, z: -2.4, r: 0.8 },
  games: [{ x: -1.55, z: -0.1, r: 1.1 }],
  furniture: [
    f('roundRug', -1.2, 0.6, 0.2, 2.0, '+z'),
    f('lightPattern', -1.9, 1.5, -0.5, 2.4),
    f('windowSeat', -1.3, 1.3, 2.4, 2.85, '-z', true),
    f('sheerCurtain', -2.35, -1.62, 2.8, 2.86, '-z'),
    f('sheerCurtain', 1.62, 2.35, 2.8, 2.86, '-z'),
    // 문장 종이가 걸리는 긴 줄, 원고지 책상과 의자, 낮은 책장, 화분
    f('sentenceLine', -2.4, -2.3, -2.4, 2.2, '+x'),
    f('manuscriptDesk', 1.8, 2.4, -1.2, 0.3, '-x', true),
    f('chair', 1.25, 1.65, -0.7, -0.25, '+x', true),
    f('bookWall', 0.75, 2.4, -2.9, -2.55, '+z', true),
    f('wallFrames', -2.1, -0.8, -2.9, -2.86, '+z'),
    f('plant', 1.9, 2.35, 1.8, 2.3, undefined, true),
    f('plant', -2.25, -1.9, 2.25, 2.6, undefined, true),
    f('pendant', -0.5, -0.1, 0.7, 1.1),
  ],
};

const GUEST: RoomSpec = {
  slug: 'guest', name: '손님방', w: 5, d: 6, h: 2.6, ceiling: 2.59, floor: 'oak',
  // 문으로 들어서면 왼쪽 안에 정돈된 침대, 오른쪽 벽에 옷장과 방명록 책상. 놀이는 없고 쉬어 가는 방
  door: { wall: '+z', at: 1.4, width: 1.0, top: 2.1 },
  windows: [{ wall: '-z', from: 0.2, to: 1.6, sill: 0.9, top: 2.15 }],
  spawn: { x: 1.4, z: 1.5, yaw: 0 },
  exit: { x: 1.4, z: 2.4, r: 0.8 },
  games: [],
  furniture: [
    f('rug', -1.4, 1.0, -0.8, 1.4),
    // 머리판을 뒤 벽에 댄 침대와 개어 둔 담요, 침대 옆 탁자와 등, 발치의 짐 의자
    f('bed', -2.35, -0.95, -2.9, -0.9, '+z', true),
    f('sideTable', -0.85, -0.4, -2.9, -2.45, '+z', true),
    f('bench', -2.2, -1.1, -0.75, -0.4, '+z', true),
    f('sheerCurtain', -0.3, 0.15, -2.86, -2.8, '+z'),
    f('sheerCurtain', 1.65, 2.1, -2.86, -2.8, '+z'),
    // 오른쪽 벽: 작은 옷장, 방명록과 「어서 오세요」 카드가 놓인 책상과 의자
    f('wardrobe', 1.85, 2.4, -2.6, -1.5, '-x', true),
    f('guestDesk', 1.85, 2.4, -0.9, 0.2, '-x', true),
    f('chair', 1.3, 1.7, -0.6, -0.15, '+x', true),
    f('wallFrames', -2.4, -2.36, 0.4, 1.6, '+x'),
    f('plant', -2.3, -1.9, 2.3, 2.7, undefined, true),
    f('pendant', -0.4, 0, -0.2, 0.2),
  ],
};

const GARAGE: RoomSpec = {
  slug: 'garage', name: '작업 차고', w: 5, d: 6, h: 2.8, ceiling: 2.79, floor: 'tile',
  // 문으로 들어서면 맞은편 벽에 작업대와 공구 벽, 왼쪽에 상자 선반, 오른쪽에 세워 둔 자전거
  door: { wall: '+z', at: -1.4, width: 1.0, top: 2.1 },
  windows: [{ wall: '+x', from: -1.0, to: 0.4, sill: 1.1, top: 2.1 }],
  spawn: { x: -1.4, z: 1.5, yaw: 0 },
  exit: { x: -1.4, z: 2.4, r: 0.8 },
  games: [],
  furniture: [
    f('workbench', -1.3, 0.7, -2.9, -2.25, '+z', true),
    f('pegboard', -1.3, 0.7, -2.9, -2.86, '+z'),
    f('stool', -0.5, -0.1, -1.95, -1.55, undefined, true),
    f('boxShelf', -2.4, -1.95, -2.6, -0.6, '+x', true),
    f('bicycle', 1.9, 2.4, 0.6, 2.3, '-x', true),
    f('corkBoard', 0.2, 1.6, 2.84, 2.9, '-z'),
    f('plant', 1.95, 2.35, -2.5, -2.1, undefined, true),
    f('pendant', -0.4, 0, -0.6, -0.2),
  ],
};

const SPECS: Record<string, RoomSpec> = {
  gable: GABLE, toybox: TOYBOX, target: TARGET, mind: MIND, study: STUDY, guest: GUEST, garage: GARAGE,
};

/** 시험용: 손질 뒤 크기로 적은 가구 자리(벽에 꼭 맞는지 맞춰 본다) */
export function authoredFurniture(slug: string): Furniture[] {
  return SPECS[slug]?.furniture.map((it) => ({ ...it })) ?? [];
}

/** 방 장면 하나를 짓는다. 장면이 없는 방이면 null. 부를 때마다 새 객체를 돌려준다. */
export function buildRoomWorld(slug: string): HouseWorld | null {
  const spec = SPECS[slug];
  return spec ? buildRoom(spec) : null;
}
