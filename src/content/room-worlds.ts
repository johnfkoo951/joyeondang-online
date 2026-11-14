// 문으로 들어가는 방 장면 일곱. 집과 따로 지은 작은 세계라 걷기 엔진이 같은 모양(HouseWorld, kind 'room')으로 그린다.
// 공개 묶음에 들어가므로 실명·장소 이름·실제 치수는 없다. 각 방은 주인의 세계관에 맞춘 크기와 창밖 전망을 갖는다.
import type {
  Box, CeilingSpec, DoorSpec, FloorMat, Furniture, FurnitureKind, Hotspot, HouseWorld, WallSpec, WindowSpec,
} from '@/walk/types';

/** 방 장면이 있는 방(rooms.ts slug) */
export const ROOM_SCENES: string[] = ['gable', 'toybox', 'target', 'mind', 'study', 'guest', 'garage'];

/**
 * 방마다 놀이(id·이름·한 줄). src/games/registry.ts의 gamesInRoom()과 같아야 한다(시험이 맞춰 본다).
 */
export const ROOM_GAMES: Record<string, Array<{ id: string; title: string; blurb: string }>> = {
  gable: [
    {
      id: 'jam',
      title: '박공 아래 잼',
      blurb: '네 박자를 듣고 그대로 받아 쳐요. 세 판을 넘기면 두 마디를 오늘의 곡에 이어 붙여요.',
    },
    {
      id: 'groove',
      title: '리듬 천국 재즈 스튜디오',
      blurb: '트리오 박수·비밥 브라스 콜·5/4 변박 클라베·올스타 리믹스까지, 스윙 포켓을 귀로 짚어 내는 리듬 게임이에요.',
    },
    {
      id: 'pitch',
      title: '재즈 이어 트레이닝 · 음정과 화성',
      blurb: '상대음감 음정 찾기부터 Maj9·7alt 텐션 보이싱 구별, 3음 비밥 릭 받아적기까지 건반으로 도전해요.',
    },
  ],
  toybox: [
    { id: 'sword', title: '소드 콘티넌트', blurb: '5대 왕국 26스테이지를 돌파하며 사탕으로 레벨업하고, 몬스터 50마리를 잡아 얻은 황금 피리로 왕드래곤 대군주를 불러내 싸우는 3D 액션 RPG예요. 11대 스킨과 2인 협동도 있어요.' },
    { id: 'shelf', title: '좋아하는 것 선반', blurb: '선반에 좋아하는 것들을 골라 올려 나만의 선반을 꾸며요.' },
  ],
  target: [{ id: 'target', title: '종이공 과녁', blurb: '종이공을 던져 떠오르는 과녁을 맞혀요. 60초 동안 몇 개나 맞힐까요?' }],
  mind: [{ id: 'brain', title: '생각 지도 퀴즈', blurb: '낱말을 알맞은 지식 서랍에 넣고, 생각이 자라는 순서를 맞혀요.' }],
  study: [{ id: 'poetry', title: '문장의 주인을 찾아라', blurb: '시 구절을 읽고 네 개의 낙관 중 시인을 골라요. 여섯 문장 뒤에 오늘의 문장을 만나요.' }, { id: 'calligraphy', title: '글씨의 주인을 찾아라', blurb: '서안 위 체본을 따라 恒常心을 쓰고 나만의 낙관을 찍어요.' }, { id: 'sentences', title: '문장 걸어 두기', blurb: '요즘 만난 좋은 문장 하나를 출처와 함께 옮겨 적어 벽에 걸어요. 걸린 문장도 한 장씩 읽어요.' }],
  guest: [],
  garage: [],
};

export type ToyShape = 'dino' | 'car' | 'train' | 'blocks' | 'robot' | 'ball' | 'star' | 'book' | 'crayons' | 'drum' | 'boat' | 'bear';

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

const WALL_T = 0.2;
const TUNE_SIDE = Math.sqrt(0.8);
/** 손질에서 크기를 바꾸지 않는 가구(tune.ts DECOR와 소나무) */
const TUNE_KEEPS: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  'floorLamp', 'hanjiLantern', 'cushion', 'pendant', 'hanjiPendant', 'rug', 'path', 'lattice', 'ridgeBeam', 'stairs', 'pine',
  'aisle', 'glassRail', 'weddingStage', 'flowerArch', 'puppetStage', 'hyeonpan', 'pathLight', 'sconce', 'welcomeSign',
  'pkmGallery', 'lectureWall', 'constellationMobile', 'tiguanPlanWall', 'blueprintWall', 'ledRibbonWall', 'garageTrackLight', 'garageBayLines',
]);

type WallSide = '-z' | '+z' | '-x' | '+x';
type Spot = { x: number; z: number; r: number };
type ExtraHotspot = {
  id: string;
  x: number;
  z: number;
  r: number;
  aimY?: number;
  title: string;
  line: string;
  kind: 'exhibit' | 'board';
  exhibit?: string;
  boardRoom?: string;
};

type RoomSpec = {
  slug: string;
  name: string;
  w: number; d: number; h: number; ceiling: number;
  floor: FloorMat;
  door: { wall: WallSide; at: number; width: number; top: number };
  windows: Array<{ wall: WallSide; from: number; to: number; sill: number; top: number }>;
  spawn: { x: number; z: number; yaw: number };
  exit: Spot;
  games: Spot[];
  extras?: ExtraHotspot[];
  furniture: Furniture[];
};

function f(kind: FurnitureKind, x1: number, x2: number, z1: number, z2: number, face?: Furniture['face'], collide = false): Furniture {
  return face ? { kind, level: 1, x1, x2, z1, z2, face, collide } : { kind, level: 1, x1, x2, z1, z2, collide };
}

function pre(item: Furniture): Furniture {
  if (TUNE_KEEPS.has(item.kind)) return item;
  const cx = (item.x1 + item.x2) / 2, cz = (item.z1 + item.z2) / 2;
  const hx = (item.x2 - item.x1) / 2 / TUNE_SIDE, hz = (item.z2 - item.z1) / 2 / TUNE_SIDE;
  return { ...item, x1: cx - hx, x2: cx + hx, z1: cz - hz, z2: cz + hz };
}

const axisOf = (wall: WallSide): 'x' | 'z' => (wall === '-z' || wall === '+z' ? 'x' : 'z');

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
    { id: 'exit', level: 1, ...spec.exit, aimY: 1.2, title: '나가는 문', line: '나가면 들어온 문 앞으로 돌아가요.', kind: 'exit' },
    ...games.map((g, i): Hotspot => ({
      id: `game-${g.id}`, level: 1, ...spec.games[i], aimY: 1.1, title: g.title, line: g.blurb, kind: 'game', game: g.id,
    })),
    ...(spec.extras ?? []).map((ex): Hotspot => ({
      id: ex.id,
      level: 1,
      x: ex.x,
      z: ex.z,
      r: ex.r,
      aimY: ex.aimY ?? 1.25,
      title: ex.title,
      line: ex.line,
      kind: ex.kind,
      exhibit: ex.exhibit,
      boardRoom: ex.boardRoom,
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

// ───────── 1. 재즈가 흐르는 방 (스윙 잼 · 리듬 천국 스튜디오 · 재즈 이어 트레이닝 · 리더보드)
const GABLE: RoomSpec = {
  slug: 'gable', name: '재즈가 흐르는 방', w: 6.8, d: 7.6, h: 3.1, ceiling: 3.09, floor: 'oak',
  door: { wall: '+z', at: 0, width: 1.05, top: 2.15 },
  windows: [
    { wall: '-z', from: -1.45, to: 1.45, sill: 0.72, top: 2.68 },
    { wall: '+x', from: -1.35, to: 1.05, sill: 0.88, top: 2.22 },
  ],
  spawn: { x: 0, z: 2.25, yaw: 0 },
  exit: { x: 0, z: 3.25, r: 0.75 },
  games: [
    { x: -1.85, z: -1.85, r: 0.95 }, // 박공 아래 잼(피아노·베이스 옆)
    { x: 0.0, z: -0.65, r: 0.95 },   // 리듬 천국 재즈 스튜디오(중앙 패드 스테이션)
    { x: 1.85, z: -1.85, r: 0.95 },  // 재즈 이어 트레이닝(로즈 건반 책상)
  ],
  extras: [
    {
      id: 'exhibit-gable-vinyl',
      x: -2.45, z: 0.55, r: 0.9, aimY: 1.35,
      title: '재즈 레코드 & 무대 리본 노트',
      line: '2주간 변박을 반복해 익힌 사연과 공연 무대 빛의 리본 연출 노트를 펼쳐 봅니다.',
      kind: 'exhibit',
      exhibit: 'gable-vinyl',
    },
    {
      id: 'board-gable',
      x: 2.35, z: 2.15, r: 0.85, aimY: 1.25,
      title: '재즈 스튜디오 리더보드',
      line: '박공 아래 잼 · 리듬 천국 · 이어 트레이닝 세 놀이의 실시간 최고 순위표예요.',
      kind: 'board',
      boardRoom: 'gable',
    },
  ],
  furniture: [
    f('slopedCeiling', -3.3, 3.3, -3.7, 3.7),
    f('ledRibbonWall', -3.3, -3.26, -3.1, -1.3, '+x'),
    f('recordShelf', -3.3, -2.85, -0.5, 1.5, '+x', true),
    f('piano', -3.05, -1.65, -3.7, -3.1, '+z', true),
    f('bench', -2.65, -2.0, -2.92, -2.58, undefined, true),
    f('doubleBass', -3.25, -2.65, 2.2, 2.85, '+x', true),
    f('musicStand', -1.55, -1.15, -2.55, -2.25, '+z'),
    f('roundRug', -1.35, 1.35, -1.75, 0.55),
    f('grooveStation', -0.45, 0.45, -1.45, -0.88, '+z', true),
    f('earTrainerDesk', 1.55, 2.85, -3.68, -3.08, '+z', true),
    f('sofa', 2.45, 3.28, -0.95, 1.15, '-x', true),
    f('coffeeTable', 1.55, 2.1, -0.45, 0.55, undefined, true),
    f('recordCabinet', 2.8, 3.28, -2.55, -1.45, '-x', true),
    f('leaderboardStand', 2.65, 3.2, 2.25, 2.75, '-x', true),
    f('armchair', -3.25, -2.45, 2.95, 3.65, '+x', true),
    f('floorLamp', -3.2, -2.85, 1.75, 2.1),
    f('plant', 2.8, 3.22, 3.05, 3.5, undefined, true),
    f('pendant', -0.2, 0.2, -0.4, 0.0),
  ],
};

// ───────── 2. 좋아하는 것 방 (조개와 조약돌 채집함 · 상상 스케치 · 선반 놀이 · 리더보드)
const TOYBOX: RoomSpec = {
  slug: 'toybox', name: '좋아하는 것 방', w: 6.0, d: 6.8, h: 2.75, ceiling: 2.74, floor: 'oak',
  door: { wall: '+z', at: 1.35, width: 1.0, top: 2.1 },
  windows: [
    { wall: '-z', from: -1.55, to: 1.15, sill: 0.68, top: 2.22 },
    { wall: '-x', from: -0.95, to: 1.05, sill: 0.82, top: 2.02 },
  ],
  spawn: { x: 1.35, z: 1.85, yaw: 0 },
  exit: { x: 1.35, z: 2.85, r: 0.75 },
  games: [
    { x: -1.55, z: -0.25, r: 0.95 }, // 소드 콘티넌트 3D 대검 아케이드 포털
    { x: 1.65, z: -1.75, r: 0.95 },  // 좋아하는 것 선반
  ],
  extras: [
    {
      id: 'exhibit-toybox-treasure',
      x: -0.55, z: -1.95, r: 0.9, aimY: 0.85,
      title: '바닷가 조개 & 예쁜 돌 보물상자',
      line: '지나치지 않고 모아 온 조개껍데기와 색색의 산길 조약돌, 엉뚱한 상상 스케치북이에요.',
      kind: 'exhibit',
      exhibit: 'toybox-treasure',
    },
    {
      id: 'board-toybox',
      x: -1.95, z: 2.05, r: 0.85, aimY: 1.2,
      title: '좋아하는 것 방 리더보드',
      line: '소드 콘티넌트와 선반 꾸미기 놀이의 실시간 최고 기록을 함께 확인해요.',
      kind: 'board',
      boardRoom: 'toybox',
    },
  ],
  furniture: [
    f('stripeWall', 2.88, 2.9, -3.28, 3.28, '-x'),
    f('playMat', -1.15, 1.25, -1.35, 1.05),
    f('toyShelf', 1.25, 2.82, -3.3, -2.92, '+z', true),
    f('toyShelf', 2.52, 2.88, -2.4, -0.8, '-x', true),
    f('treasureTable', -1.15, 0.15, -3.22, -2.62, '+z', true),
    f('playTent', -2.85, -1.75, -3.25, -2.15, '+z', true),
    f('swordArcade', -2.85, -1.92, -0.75, 0.15, '+x', true),
    f('blockTower', -0.55, -0.15, -0.85, -0.45, undefined, true),
    f('toyChest', -2.88, -2.32, 0.85, 1.8, '+x', true),
    f('kidDesk', 2.15, 2.85, 0.35, 1.25, '-x', true),
    f('leaderboardStand', -2.82, -2.28, 2.15, 2.68, '+x', true),
    f('bunting', -2.88, 2.88, -0.42, -0.38),
    f('globeLantern', -0.2, 0.2, -0.2, 0.2),
    f('globeLantern', 1.3, 1.7, -2.1, -1.7),
    f('plant', 2.35, 2.8, 2.55, 3.0, undefined, true),
  ],
};

// ───────── 3. 종이공 과녁 방 (만능 도전자 책상 · 바위산 전망 · 과녁 놀이 · 리더보드)
const TARGET: RoomSpec = {
  slug: 'target', name: '종이공 과녁 방', w: 6.0, d: 6.8, h: 2.75, ceiling: 2.74, floor: 'oak',
  door: { wall: '+z', at: 0, width: 1.0, top: 2.1 },
  windows: [
    { wall: '+x', from: -1.75, to: 1.15, sill: 0.72, top: 2.28 },
  ],
  spawn: { x: 0, z: 1.85, yaw: 0 },
  exit: { x: 0, z: 2.85, r: 0.75 },
  games: [{ x: 0, z: 0.25, r: 0.95 }],
  extras: [
    {
      id: 'exhibit-target-summit',
      x: -1.85, z: -1.45, r: 0.9, aimY: 1.0,
      title: '만능 도전자 책상 & 첫 노트',
      line: '수학 퍼즐과 스포츠 공, 스스로 정리하는 첫 볼트 기록장이 놓인 책상이에요.',
      kind: 'exhibit',
      exhibit: 'target-summit',
    },
    {
      id: 'board-target',
      x: 1.95, z: 2.05, r: 0.85, aimY: 1.25,
      title: '종이공 과녁 리더보드',
      line: '60초 동안 누가 가장 높은 점수를 맞혔는지 순위를 겨뤄 보세요!',
      kind: 'board',
      boardRoom: 'target',
    },
  ],
  furniture: [
    f('stripeWall', -2.9, 2.9, -3.3, -3.28, '+z'),
    f('stripeWall', -2.9, -2.88, -3.28, 3.28, '+x'),
    f('targets', -2.2, 2.2, -3.28, -3.2, '+z'),
    f('playMat', -1.45, 1.45, -0.65, 1.45),
    f('paperBasket', 1.65, 2.15, 0.75, 1.25, undefined, true),
    f('trophyDesk', -2.85, -1.95, -2.15, -0.85, '+x', true),
    f('toyShelf', -2.88, -2.45, 0.35, 1.85, '+x', true),
    f('leaderboardStand', 2.32, 2.85, 2.1, 2.65, '-x', true),
    f('bunting', -2.88, 2.88, -1.42, -1.38),
    f('globeLantern', -0.25, 0.25, 0.35, 0.85),
    f('plant', 2.3, 2.78, -3.15, -2.65, undefined, true),
  ],
};

// ───────── 4. 생각 지도 방 (구요한의 방: PKM 일러스트 갤러리 · 지산 책상 · 강의 자산 보드 · 생각 퀴즈 · 리더보드)
const MIND: RoomSpec = {
  slug: 'mind', name: '생각 지도 방', w: 7.8, d: 8.6, h: 3.0, ceiling: 2.99, floor: 'blackwood',
  door: { wall: '+z', at: 0, width: 1.08, top: 2.15 },
  windows: [
    { wall: '-z', from: -2.15, to: 2.15, sill: 0.65, top: 2.55 },
    { wall: '-x', from: -1.45, to: 1.45, sill: 0.85, top: 2.35 },
  ],
  spawn: { x: 0, z: 2.75, yaw: 0 },
  exit: { x: 0, z: 3.75, r: 0.75 },
  games: [{ x: 2.45, z: 1.45, r: 1.0 }],
  extras: [
    {
      id: 'exhibit-mind-jisan',
      x: 0, z: -2.25, r: 1.05, aimY: 1.15,
      title: '지산(紙散) 에세이 & 개념 책상',
      line: '에이전트 하네스 7층, 루만의 소통이론, Schema는 Harness다, 나만의 확률값 등 지산 블로그 핵심 글을 읽어요.',
      kind: 'exhibit',
      exhibit: 'mind-jisan',
    },
    {
      id: 'exhibit-mind-lectures',
      x: 2.75, z: -1.35, r: 1.05, aimY: 1.5,
      title: '메인 볼트 강의 자산 아카이브',
      line: '부트캠프·임원 AX·LLM Wiki·연구자 세컨드 브레인 강의에서 뽑아낸 핵심 명제들을 검색해 볼 수 있어요.',
      kind: 'exhibit',
      exhibit: 'mind-lectures',
    },
    {
      id: 'exhibit-mind-illustrations',
      x: -2.65, z: -2.35, r: 1.05, aimY: 1.55,
      title: '지식관리 일러스트 갤러리',
      line: 'CMDS 프로세스, 제텔카스텐 연결망, 멀티볼트 생태계를 그린 오리지널 일러스트 액자 컬렉션이에요.',
      kind: 'exhibit',
      exhibit: 'mind-illustrations',
    },
    {
      id: 'board-mind',
      x: -2.55, z: 2.35, r: 0.9, aimY: 1.25,
      title: '생각 지도 퀴즈 리더보드',
      line: '생각 지도 퀴즈 최고 기록과 내 순위를 확인해요.',
      kind: 'board',
      boardRoom: 'mind',
    },
  ],
  furniture: [
    f('constellationMobile', -0.7, 0.7, -0.7, 0.7),
    f('rug', -2.1, 2.1, -2.0, 1.6),
    // 정면 파노라마 창 아래 지산 집필·리뷰 데스크
    f('jisanDesk', -1.15, 1.15, -3.75, -2.95, '+z', true),
    f('chair', -0.3, 0.3, -2.75, -2.25, '-z', true),
    // 왼쪽·뒤쪽 지식관리 일러스트 액자 갤러리
    f('pkmGallery', -3.72, -2.25, -4.18, -4.12, '+z'),
    f('pkmGallery', -3.78, -3.72, 1.65, 3.85, '+x'),
    // 오른쪽 벽: 메인 볼트 강의 자산 보드 + 아홉 칸 CMDS 서랍장 + 코르크 보드
    f('lectureWall', 3.72, 3.78, -2.85, 0.05, '-x'),
    f('drawers9', 3.25, 3.76, 0.75, 2.15, '-x', true),
    f('corkBoard', 3.72, 3.78, 2.35, 3.75, '-x'),
    // 장서 벽면과 독서 암체어, 리더보드 스탠드
    f('bookWall', 2.25, 3.72, -4.18, -3.78, '+z', true),
    f('bookWall', -3.76, -3.28, -3.85, -1.65, '+x', true),
    f('armchair', -3.45, -2.55, -0.45, 0.45, '+x', true),
    f('floorLamp', -3.45, -3.05, 0.65, 1.05),
    f('leaderboardStand', -3.55, -2.95, 2.25, 2.82, '+x', true),
    f('plant', 3.15, 3.65, -3.65, -3.15, undefined, true),
  ],
};

// ───────── 5. 글과 빛이 드는 곳 (문장 걸어 두기 · 청자 비색 & 우주의 호두 선반 · 리더보드)
const STUDY: RoomSpec = {
  slug: 'study', name: '글과 빛이 드는 곳', w: 6.0, d: 6.8, h: 2.75, ceiling: 2.74, floor: 'oak',
  door: { wall: '-z', at: 0, width: 1.0, top: 2.1 },
  windows: [
    { wall: '+z', from: -1.95, to: 1.95, sill: 0.48, top: 2.38 },
  ],
  spawn: { x: 0, z: -1.85, yaw: Math.PI },
  exit: { x: 0, z: -2.85, r: 0.75 },
  games: [{ x: -1.45, z: -1.55, r: .8 }, { x: 1.6, z: -.15, r: .85 }, { x: -1.85, z: 1.1, r: .8 }],
  extras: [
    {
      id: 'exhibit-study-walnut',
      x: 1.75, z: 1.35, r: 0.95, aimY: 1.05,
      title: '청자 비색 선반 & 호두 오브제',
      line: '오늘 만난 좋은 문장과 고려청자·단청 문양 노트, 작은 호두 오브제를 살펴봅니다.',
      kind: 'exhibit',
      exhibit: 'study-walnut',
    },
    {
      id: 'board-study',
      x: 1.95, z: -2.05, r: 0.85, aimY: 1.25,
      title: '문장 퍼즐 리더보드',
      line: '빛 무늬 문장 놀이 최고 기록을 확인해요.',
      kind: 'board',
      boardRoom: 'study',
    },
  ],
  furniture: [
    f('roundRug', -1.35, 0.85, 0.1, 2.15, '+z'),
    f('lightPattern', -2.05, 1.75, -0.4, 2.65),
    f('lightShaft', -2.0, 1.95, -0.4, 3.33),
    f('windowSeat', -1.55, 1.55, 2.82, 3.28, '-z', true),
    f('sheerCurtain', -2.75, -2.02, 3.2, 3.26, '-z'),
    f('sheerCurtain', 2.02, 2.75, 3.2, 3.26, '-z'),
    f('sentenceLine', -2.85, -2.75, -2.55, 2.45, '+x'),
    f('inkWritingDesk', 2.15, 2.85, -0.95, 0.55, '-x', true),
    f('chair', 1.55, 1.98, -0.45, 0.05, '+x', true),
    f('celadonShelf', 2.25, 2.85, 1.05, 2.15, '-x', true),
    f('leaderboardStand', 2.28, 2.82, -2.55, -1.98, '-x', true),
    f('poetryShelf', -2.65, -0.85, -3.3, -2.92, '+z', true),
    f('plant', 2.25, 2.75, 2.45, 2.95, undefined, true),
    f('pendant', -0.4, 0.0, 0.65, 1.05),
  ],
};

// ───────── 6. 손님방 (달빛 소나무 정원 전망 · 환영 다기 세트)
const GUEST: RoomSpec = {
  slug: 'guest', name: '손님방', w: 5.6, d: 6.4, h: 2.7, ceiling: 2.69, floor: 'oak',
  door: { wall: '+z', at: 1.45, width: 1.0, top: 2.1 },
  windows: [{ wall: '-z', from: -0.95, to: 1.65, sill: 0.78, top: 2.25 }],
  spawn: { x: 1.45, z: 1.65, yaw: 0 },
  exit: { x: 1.45, z: 2.65, r: 0.75 },
  games: [],
  extras: [
    {
      id: 'exhibit-guest-welcome',
      x: 1.45, z: -0.45, r: 0.95, aimY: 1.0,
      title: '손님맞이 다기 세트 & 안내첩',
      line: '조연당을 찾아 주신 손님을 위한 환영 인사와 계절 차 안내 카드가 놓여 있어요.',
      kind: 'exhibit',
      exhibit: 'guest-welcome',
    },
  ],
  furniture: [
    f('rug', -1.65, 1.15, -0.95, 1.45),
    f('bed', -2.65, -1.15, -3.1, -1.05, '+z', true),
    f('sideTable', -1.02, -0.55, -3.1, -2.62, '+z', true),
    f('bench', -2.45, -1.3, -0.88, -0.52, '+z', true),
    f('sheerCurtain', -1.35, -0.98, -3.06, -3.0, '+z'),
    f('sheerCurtain', 1.7, 2.25, -3.06, -3.0, '+z'),
    f('wardrobe', 2.12, 2.68, -2.85, -1.65, '-x', true),
    f('guestDesk', 2.12, 2.68, -1.05, 0.15, '-x', true),
    f('chair', 1.52, 1.95, -0.68, -0.22, '+x', true),
    f('wallFrames', -2.68, -2.62, 0.35, 1.75, '+x'),
    f('plant', -2.55, -2.1, 2.45, 2.9, undefined, true),
    f('pendant', -0.4, 0, -0.2, 0.2),
  ],
};

// ───────── 7. 작업 차고 · 이동식 작전 본부 (그레나디어+스타링크 · CLA 45 AMG · X3 취소→티구안 도면/다이캐스트 · AI 하네스 랩)
const GARAGE: RoomSpec = {
  slug: 'garage', name: '작업 차고', w: 10.2, d: 9.6, h: 3.4, ceiling: 3.39, floor: 'tile',
  door: { wall: '+z', at: 0, width: 1.15, top: 2.2 },
  windows: [
    { wall: '-z', from: -3.85, to: -0.65, sill: 0.45, top: 2.85 },
    { wall: '-z', from: 0.65, to: 3.85, sill: 0.45, top: 2.85 },
    { wall: '+x', from: -1.85, to: 1.05, sill: 0.92, top: 2.48 },
  ],
  spawn: { x: 0, z: 3.25, yaw: 0 },
  exit: { x: 0, z: 4.25, r: 0.78 },
  games: [],
  extras: [
    {
      id: 'exhibit-garage-grenadier',
      x: -1.05, z: 1.45, r: 1.1, aimY: 1.35,
      title: '이네오스 그레나디어 · 스타링크 이동식 작전 본부',
      line: '루프랙 위 스타링크 위성 안테나와 카고 오피스를 탑재한 1호 이동식 작전 본부(이작본)를 점검해요.',
      kind: 'exhibit',
      exhibit: 'garage-grenadier',
    },
    {
      id: 'exhibit-garage-cla45',
      x: 1.05, z: 1.45, r: 1.1, aimY: 1.05,
      title: '메르세데스-AMG CLA 45 · 퍼포먼스 쿠페',
      line: '실버 스트라이프와 옐로우 에어로 립 포인트가 살아 있는 4MATIC+ 퍼포먼스 쿠페와 듀얼 도면을 살펴봐요.',
      kind: 'exhibit',
      exhibit: 'garage-cla45',
    },
    {
      id: 'exhibit-garage-harness',
      x: -3.55, z: -0.15, r: 1.1, aimY: 1.2,
      title: '멀티디바이스 AI 하네스 & 장비 설계 본부',
      line: '주 관제 노트북·스튜디오 워커·GPU 노드·스타링크·인산철 파워뱅크를 설계하고 세팅하는 엔지니어링 벤치예요.',
      kind: 'exhibit',
      exhibit: 'garage-harness',
    },
    {
      id: 'exhibit-garage-tiguan',
      x: 3.55, z: 2.55, r: 1.1, aimY: 1.35,
      title: '구매 계획 도면(X3 취소 → 티구안 확정!) & 다이캐스트',
      line: '아버님께 "왜 X3를 사냐!" 혼나고 급선회한 폭스바겐 티구안 확정 도면과 1:18 다이캐스트 전시대예요.',
      kind: 'exhibit',
      exhibit: 'garage-tiguan',
    },
  ],
  furniture: [
    f('garageBayLines', -3.65, 3.65, -3.85, 1.55),
    f('garageTrackLight', -3.45, 3.45, -2.95, 2.35),
    // Bay 1: 이네오스 그레나디어 3D + 후면 이동식 작전 본부(MCC) 필드 전개 카트 / Bay 2: 벤츠 CLA 45 AMG 3D
    f('grenadier', -2.62, -0.62, -3.15, 1.25, '+z', true),
    f('mccFieldCart', -2.25, -1.05, -4.52, -3.95, '+z', true),
    f('cla45', 0.65, 2.65, -3.15, 1.15, '+z', true),

    // 왼쪽 엔지니어링 구역: 멀티디바이스 AI 하네스 관제 벤치 + 공구 캐비닛 + 익스페디션 블루프린트 월
    f('opsCommandRig', -4.95, -4.05, -1.55, 1.25, '+x', true),
    f('stool', -3.98, -3.62, 0.85, 1.21, undefined, true),
    f('pegboard', -4.98, -4.92, -1.55, 1.25, '+x'),
    f('toolCabinet', -4.95, -4.25, 1.55, 3.05, '+x', true),
    f('blueprintWall', -4.98, -4.92, -4.35, -1.85, '+x'),
    f('boxShelf', -4.95, -4.35, 3.25, 4.45, '+x', true),

    // 오른쪽 구역: 듀얼 차량 도면 월 + (X3 취소 → 티구안 확정!) 벽면 구매 계획 보드 & 1:18 다이캐스트 전시대
    f('blueprintWall', 4.92, 4.98, -4.35, -2.05, '-x'),
    f('tiguanPlanWall', 4.92, 4.98, 1.35, 3.85, '-x'),
    f('diecastDisplay', 4.15, 4.82, 1.95, 3.15, '-x', true),
    f('bicycle', 4.35, 4.92, -1.65, -0.15, '-x', true),

    // 천장 작업등 두 줄
    f('pendant', -2.35, -1.95, -1.2, -0.8),
    f('pendant', 1.95, 2.35, -1.2, -0.8),
    f('pendant', -0.2, 0.2, 1.8, 2.2),
  ],
};

const SPECS: Record<string, RoomSpec> = {
  gable: GABLE, toybox: TOYBOX, target: TARGET, mind: MIND, study: STUDY, guest: GUEST, garage: GARAGE,
};

export function authoredFurniture(slug: string): Furniture[] {
  return SPECS[slug]?.furniture.map((it) => ({ ...it })) ?? [];
}

export function buildRoomWorld(slug: string): HouseWorld | null {
  const spec = SPECS[slug];
  return spec ? buildRoom(spec) : null;
}
