// 걷기 세계의 데이터 계약. 다시 그린 집(공개)과 실제 집(손님 로그인 뒤 서버가 내려줌)이 같은 모양을 쓴다.
// 단위는 미터. x는 서→동, z는 북→남(집 앞 마당 쪽이 +z), y는 위. 1층 바닥 y=0, 2층 바닥 y=floor2.
// JSON으로 주고받으므로 함수·클래스를 넣지 않는다.
import type { CharacterLook } from './look';

export type Level = 1 | 2;

/** XZ 평면의 막힌 상자. level 0은 두 층 모두(계단 난간 등) */
export type Box = { x1: number; x2: number; z1: number; z2: number; level: 0 | 1 | 2; tag?: string };

/** 경사면(계단 한 줄기) 또는 평평한 계단참. axis 방향으로 낮은 좌표 끝이 y0, 높은 좌표 끝이 y1. */
export type Ramp = { x1: number; x2: number; z1: number; z2: number; axis: 'x' | 'z'; y0: number; y1: number; steps?: number };

export type Physics = { boxes: Box[]; ramps: Ramp[]; floor2: number };

export type WallStyle = 'ext' | 'int1' | 'int2' | 'stonewall' | 'invisible';
export type WallSpec = { box: Box; baseY: number; height: number; style: WallStyle; axis: 'x' | 'z' };
export type DoorSpec = { box: Box; baseY: number; height: number; style: 'wood' | 'lacquer'; axis: 'x' | 'z'; closed: boolean; label: string; slug?: string };
export type FloorMat = 'oak' | 'redstone' | 'blackwood' | 'lawn' | 'porch' | 'tile';
export type FloorSpec = { level: Level; x1: number; x2: number; z1: number; z2: number; mat: FloorMat };
/** 천장판. 1인칭에서 보이고, 3인칭으로 위에서 들여다볼 때는 숨긴다. */
export type CeilingSpec = { level: Level; x1: number; x2: number; z1: number; z2: number; y: number };
/** 벽에 낸 창. 유리는 바깥 빛을 은은하게 내뿜는다. at은 벽 선의 좌표, from~to는 벽을 따라간 구간. */
export type WindowSpec = { level: Level; axis: 'x' | 'z'; at: number; from: number; to: number; sill: number; top: number };
export type Zone = { level: Level; x1: number; x2: number; z1: number; z2: number; name: string };
export type Hotspot = {
  id: string; level: Level; x: number; z: number; r: number;
  title: string; line: string; slug?: string;
  /**
   * portal = 방 장면으로 들어가는 문(slug = 방), exit = 방 장면에서 집으로 나가는 문,
   * game = 방 안의 놀이 자리(game = src/games 등록 id),
   * frame = 갤러리 액자 앞(frame = 액자 id). 세계의 hotspots 목록에는 없고 엔진이 액자 앞에서만 만들어 알린다
   */
  kind: 'room' | 'door' | 'sign' | 'lantern' | 'stage' | 'portal' | 'exit' | 'game' | 'frame' | 'exhibit' | 'board';
  game?: string;
  frame?: string;
  /** 방 안 상호작용 전시물 id(src/content/room-exhibits.ts) */
  exhibit?: string;
  /** 리더보드 키오스크가 보여 줄 방 slug */
  boardRoom?: string;
  /** 시선(Gaze) 조준 중심 높이(m, 기본 1.15) */
  aimY?: number;
  /** 시선 또는 반경 안 하이라이트 대상 여부 */
  gazed?: boolean;
  /**
   * 엔진이 알린 「약한」 가까움(휴대폰 3인칭 액자 또는 방 안 시선 하이라이트): 크게 보기·열기 단추와 E에는
   * 잡히지만 Enter 말하기와 반려동물 부르기를 막지 않는다
   */
  weak?: boolean;
};

/**
 * 사진 갤러리 액자 하나(걷기 손질이 부엌 벽의 빈 구간에 건다, gallery.ts). (x, y, z)는 액자 뒤판 가운데(벽 면에 붙는다),
 * w·h는 바깥 틀 크기, yaw는 액자가 보는 쪽(+z가 0, 방 안쪽). size는 틀 모양(p 세로, m 가로, l 큰 가로).
 * id는 「층-벽-순번」(예: 1-a-2): 같은 집 데이터면 늘 같다. room은 액자가 걸린 구역의 이름표(집 데이터 그대로)
 */
export type GalleryFrame = {
  id: string; room: string; level: Level;
  x: number; y: number; z: number; w: number; h: number; yaw: number;
  size: 'p' | 'm' | 'l';
};

/**
 * 집에서 방 장면으로 들어가는 문. 방에서 나오면 늘 (x, z, level)에 yaw를 보고 선다.
 * (x, z)는 문 바로 앞 집 쪽의 걸을 수 있는 자리, yaw는 문을 등진 방향(집 안쪽을 본다).
 */
/** hidden이면 실제 문이 없는 포털: 살피기 자리 없이 포털 목록(P)·길 찾기 바로 가기로만 간다 */
export type Portal = { slug: string; level: Level; x: number; z: number; yaw: number; label: string; hidden?: boolean };

/** 같은 공간에 있는 다른 사람(게임 서버가 알려 준다). 엔진은 이 값을 목표로 부드럽게 따라간다. */
export type RemotePlayer = {
  id: string; name: string; color: string;
  x: number; z: number; y: number; level: Level; yaw: number; moving: boolean;
  /** 그 사람이 지금까지 뛴 수(바뀌면 이 화면에서 한 번 뛰게 한다. 옛 화면·옛 서버면 없다), 앉아 있는가 */
  jumps?: number; sitting?: boolean;
  /** 말풍선 글과 받은 때(ms, Date.now 기준). 6초 뒤 사라진다 */
  bubble?: string; bubbleAt?: number;
  /** 나중에 AI 캐릭터 그림을 붙일 자리(지금은 비움) */
  avatarUrl?: string;
  /** 겉모습(꾸민 인형 또는 사진 캐릭터). 없으면 color로 기본 인형 */
  look?: CharacterLook;
};
export type FurnitureKind =
  | 'rug' | 'sofa' | 'armchair' | 'coffeeTable' | 'bookshelf' | 'floorLamp' | 'recordCabinet' | 'stage' | 'shoeCabinet'
  | 'bench' | 'pendant' | 'stairs' | 'pine' | 'stoneLantern' | 'shrub' | 'path' | 'yardBench'
  | 'lattice' | 'lowTable' | 'cushion' | 'foldingScreen' | 'lacquerChest' | 'hanjiLantern' | 'hanjiPendant' | 'ridgeBeam'
  | 'slopedCeiling' | 'stripeWall' | 'lightPattern' | 'roundRug' | 'playMat' | 'recordShelf' | 'piano' | 'doubleBass' | 'musicStand' | 'toyShelf' | 'wallFrames' | 'targets' | 'paperBasket' | 'kidDesk' | 'bunting' | 'globeLantern' | 'bookWall' | 'corkBoard' | 'drawers9' | 'chalkboard' | 'readingDesk' | 'chair' | 'sentenceLine' | 'manuscriptDesk' | 'sheerCurtain' | 'plant' | 'windowSeat' | 'toyChest' | 'blockTower' | 'playTent'
  | 'bed' | 'sideTable' | 'wardrobe' | 'guestDesk' | 'workbench' | 'pegboard' | 'boxShelf' | 'bicycle' | 'stool'
  // 걷기 놀이판 손질(staging.ts)이 놓는 행사·마당 소품
  | 'weddingStage' | 'flowerArch' | 'aisle' | 'glassRail' | 'photoFrame' | 'flowerStand' | 'guestbook' | 'puppetStage' | 'welcomeSign' | 'planter' | 'hyeonpan' | 'pathLight' | 'sconce'
  // 방 업그레이드 전용 가구·차량·장비·전시물
  | 'pkmGallery' | 'jisanDesk' | 'lectureWall' | 'constellationMobile' | 'leaderboardStand'
  | 'grenadier' | 'cla45' | 'tiguanPlanWall' | 'diecastDisplay' | 'opsCommandRig' | 'blueprintWall' | 'toolCabinet'
  | 'grooveStation' | 'earTrainerDesk' | 'ledRibbonWall'
  | 'celadonShelf' | 'trophyDesk' | 'treasureTable' | 'swordArcade' | 'garageTrackLight' | 'garageBayLines' | 'mccFieldCart' | 'poetryShelf' | 'inkWritingDesk' | 'watercolorEasel' | 'lightShaft';
/**
 * rot이 있으면 face 대신 그 각도(라디안, y축)로 돌려 놓는다. 이때 W는 x 폭, D는 z 폭으로 읽는다(대각선으로 놓는 장식용).
 */
export type Furniture = { kind: FurnitureKind; level: Level; x1: number; x2: number; z1: number; z2: number; face?: '+x' | '-x' | '+z' | '-z'; rot?: number; collide: boolean };

/** 집 바깥을 꾸미는 단순 도형. 엔진이 종류별로 그린다. */
export type Prop =
  | { type: 'column'; x: number; z: number; w: number; h: number }
  | { type: 'arch'; x: number; z: number; span: number; spring: number; axis: 'x' | 'z' }
  | { type: 'slab'; x1: number; x2: number; z1: number; z2: number; y: number; t: number; part: 'roof' | 'porch' }
  | { type: 'gable'; x1: number; x2: number; z1: number; z2: number; eave: number; ridge: number; ridgeAxis: 'x' | 'z' };

export type HouseWorld = {
  /**
   * 'redrawn' = 놀기 좋게 다시 그린 집, 'real' = 실제 축척의 집(손님 전용), 'room' = 문으로 들어가는 방 장면,
   * 'shell' = 실측 껍데기만 지은 가벼운 시험 지도(관리자 전용, lib/shell-world.ts. 전망·가구·함께 걷기 없음)
   */
  kind: 'redrawn' | 'real' | 'room' | 'shell';
  floor2: number;
  /** 집 안 판정용 외곽(이 안에서는 지붕을 걷고, 3인칭이면 벽을 낮춘다) */
  house: { x1: number; x2: number; z1: number; z2: number };
  floors: FloorSpec[];
  walls: WallSpec[];
  headers: WallSpec[];
  doors: DoorSpec[];
  ceilings: CeilingSpec[];
  windows: WindowSpec[];
  furniture: Furniture[];
  props: Prop[];
  zones: Zone[];
  hotspots: Hotspot[];
  physics: Physics;
  spawn: { x: number; z: number; yaw: number };
  /** 집 세계에만: 방 장면으로 들어가는 문들 */
  portals?: Portal[];
  /** 방 장면에만: 어느 방인지와 그 방의 놀이 id */
  room?: { slug: string; games: string[] };
  /** 실제 집을 걷기용으로 손질했으면 그때 고른 꾸밈(staging.ts). 한 번 손질한 세계는 다시 손질하지 않는다 */
  theme?: string;
  /** 실제 집에만: 부엌 사진 갤러리 액자(걷기 손질이 건다, gallery.ts). 없으면 걸지 않은 것(끈 경우 포함) */
  gallery?: GalleryFrame[];
};
