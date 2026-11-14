import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXTERIOR, FLOOR1, FLOOR2, LAWN_BY_SEASON } from '@/content/interior';
import { zoneAt } from '@/content/world';
import { shownName } from '@/lib/guest-name';
import { heldKeys, isEditingTarget, letterOf, shouldHandleShortcut } from '@/lib/keys';
import { placeName } from '@/lib/place-names';
import {
  BUBBLE_MS, GROUNDED, LABEL_FONT, SHADE_LAYER, angleDiff, createAvatar, follow, gaitRate, headBob, hopStart, hopStep, ledgeEase, lookKey, modelNow,
  nearestOpen, pathStep, startPath, turnStep, type Avatar, type Hop, type PathRun,
} from './avatar';
import { dollFromColor, type CharacterLook, type DollLook } from './look';
import { bakeStatic } from './bake';
import { HUNG, planDecor } from './decor';
import { GLOW_POOL, dressHouse, tileMat, vertexMat } from './dress';
import { buildFurniture, makeFurnitureMats } from './furnish';
import { prepareEnvironmentModels } from './environment-models';
import { dressGalleryFacade } from './gallery-facade';
import { fovFor } from './fov';
import { LOOSE_NEAR, pressNear } from './gallery';
import { buildGallery, type GalleryArt, type GalleryScene } from './gallery-scene';
import { onWalkLang, walkLang } from './lang';
import { KEY_PITCH, KEY_YAW, WHEEL_PITCH, keyLookRate, mouseGain, mouseStep, wheelPx } from './mouse';
import type { PetSpec } from './pet-spec';
import { createPetView, type PetView } from './pet-view';
import { blocked, clearLine, inRamp, levelOf, rampY, step, type Body } from './physics';
import { buildScenery, lookFor, type Scenery } from './scenery';
import { skyLook, type WalkSky } from './sky';
import { ROOM_SHELLS, buildRoomVista } from './room-windows';
import { createHotspotBeacons, pickGazedHotspot } from './gaze';
import { stickTurn } from './stick';
import * as T from './textures';
import { tuneWorld } from './tune';
import type { CeilingSpec, DoorSpec, Furniture, Hotspot, HouseWorld, Level, Prop, Ramp, RemotePlayer, WallSpec, WindowSpec } from './types';

// 놀이가 있는 방 문의 색과 기호(공개 slug만 쓴다. 실제 방 이름과 주인의 한마디는 손님에게만 서버가 준다)
const ROOM_DOOR: Record<string, { tint: string; glyph: string }> = {
  gable: { tint: '#6f8fca', glyph: '♪' },
  toybox: { tint: '#f5cf6a', glyph: '★' },
  target: { tint: '#ec8a66', glyph: '◎' },
  mind: { tint: '#a98bd2', glyph: '✦' },
  study: { tint: '#f0d27e', glyph: '✎' },
  guest: { tint: '#a6c8b0', glyph: '☾' },
  garage: { tint: '#7f8c99', glyph: '⚙' },
};

export type Season = keyof typeof LAWN_BY_SEASON;
export type View = 'first' | 'third';

export type WalkOptions = {
  world: HouseWorld;
  dollColor: string;
  season: Season;
  reducedMotion: boolean;
  /** 휴대폰처럼 손가락으로 쓰는 기기: 그림자 해상도와 화소 밀도를 낮춘다 */
  coarse: boolean;
  view: View;
  label: HTMLElement | null;
  onNear: (h: Hotspot | null) => void;
  onPlace: (name: string) => void;
  onInteract: () => void;
  onView: (v: View) => void;
  onPointerLock?: (locked: boolean) => void;
  /** 그래픽 문맥을 잃었을 때(GPU 재시작, 탭이 너무 많을 때). 그리기는 멈춘다 */
  onLost?: () => void;
  /** 잃었던 그래픽 문맥이 돌아와 다시 그리기 시작했을 때 */
  onRestored?: () => void;
  /** 내 이름표(3인칭에서만 보인다). 주면 label 요소 대신 캐릭터 머리 위 글자로 그린다 */
  name?: string;
  /** 마우스·시선 스틱·화면 끌기 둘러보기 감도 배율(기본 1) */
  lookSensitivity?: number;
  /**
   * 화면 위 단추·카드의 사각형(화면 좌표). 데스크탑 마우스가 이 근처로 가면 둘러보기를 멈추고,
   * 단추로 손을 뻗는 동안 돌아간 시선을 되돌린다. 없으면 화면 가장자리만 본다.
   */
  uiRects?: () => ReadonlyArray<{ left: number; top: number; right: number; bottom: number }>;
  /** 내 캐릭터 겉모습. 없으면 dollColor로 기본 인형 */
  look?: CharacterLook;
  /** 문패 글(방 slug → 이름). 주면 그 문의 기본 이름 대신 쓴다(손님에게만 보이는 이름 등) */
  doorNames?: Record<string, string>;
  /** 방 주인의 한마디(slug → 짧은 글). 손님에게만 서버가 준다 */
  doorPhrases?: Record<string, string>;
  /** 집 안팎을 오가는 반려동물(모형 주소·이름·시계 차이, 화면이 서버에서 받는다). 집 세계에서만 보인다. 나중에 받으면 setPet */
  pet?: PetSpec | null;
  /** 부엌 사진 갤러리 전시 목록(액자 id → 전시물). 손님에게만 서버가 준다. 없으면 아직 모르는 것(빈 매트) */
  gallery?: ReadonlyMap<string, GalleryArt> | null;
  /** 갤러리 그림 주소가 낡은 것 같을 때(서명 주소가 끝남): 화면이 목록을 다시 받아 setGallery로 준다 */
  onGalleryStale?: () => void;
  /**
   * 관전(컨트롤 룸): 내 몸 없이 고정 카메라 여러 대로 캔버스를 나눠 그린다(setScreens). 그린 직후 그 화면 번호들로 onScreens를
   * 부른다. 그리기 버퍼는 그 프레임에만 남으므로 받는 쪽이 그 자리에서(같은 작업 안에서) 옮겨 담는다
   */
  observe?: { onScreens: (drawn: readonly number[]) => void };
  /** 하늘(sky.ts). 없으면 낮. 집 세계에만 쓰고 방 장면은 방마다 정한 창밖 세계를 그대로 둔다 */
  sky?: WalkSky;
};

/** 미니맵 등이 매 프레임 읽는 몸 상태. pitch는 지금 시점의 값(1인칭 시선 높이, 3인칭 궤도 높이). */
export type WalkState = {
  x: number; z: number; y: number; level: 1 | 2; yaw: number; pitch: number; view: View; moving: boolean;
  /**
   * 함께 걷기로 남에게 보내는 몸 방향(남은 이 값 + 180도로 몸을 그린다). 1인칭은 시선(yaw)과 같고, 3인칭은 카메라가 아니라
   * 캐릭터가 실제로 보는 쪽이다(3인칭에서 카메라 yaw를 보내면 멈춰 선 캐릭터가 남에게는 다른 쪽을 보는 것으로 그려졌다)
   */
  bodyYaw: number;
  /** 점프로 공중에 떠 있는지(보이는 높이만, y는 그대로 바닥) */
  jumping: boolean;
  /** 지금까지 뛴 수(0~255를 돈다: 함께 걷기로 보내 남의 화면에서도 뛰게 한다), 앉아 있는가 */
  jumps: number;
  sitting: boolean;
  /** 자동 걷기(walkPath) 중인지 */
  auto: boolean;
  /** 지금 시선·반경에 잡힌 살피기 자리 id */
  activeSpotId?: string | null;
};

/** 관전 화면 하나: 캔버스 안 자리(CSS px, 왼쪽 위가 0)와 고정 카메라. 사람은 people에 든 id만 그린다 */
export type ObserveScreen = {
  x: number; y: number; w: number; h: number;
  eye: { x: number; y: number; z: number };
  at: { x: number; y: number; z: number };
  /** 세로 시야각(도) */
  fov: number;
  /** 0 = 집 그대로, 1·2 = 그 층을 위에서 들여다보는 단면(지붕·위층을 걷고 그 층 벽을 낮춘다) */
  cut: 0 | 1 | 2;
  /** 이 화면에 그릴 사람(id). 화면 쪽이 같은 Set을 고쳐 가며 쓴다 */
  people: ReadonlySet<string>;
  /** 이름표를 보일지(말풍선은 늘 보인다) */
  names: boolean;
};

export type WalkController = {
  /** 첫 그림이 화면에 나오면 풀린다. 그때까지는 불러오는 화면을 그대로 둔다(셰이더를 준비하는 동안 빈 캔버스가 보이지 않게) */
  ready: Promise<void>;
  /** 왼쪽 이동 스틱 -1..1 (y>0 앞으로, x>0 오른쪽). 휴대폰 1인칭에서는 x가 회전이다. */
  setStick: (x: number, y: number) => void;
  /** 오른쪽 시선 스틱 -1..1 (x>0 오른쪽으로 돈다, y>0 위를 본다). 놓으면 (0,0) */
  setLook: (x: number, y: number) => void;
  setPaused: (paused: boolean) => void;
  /** 화면이 통째로 가려지는 동안(놀이 덮개) 3D 그리기를 쉰다. 풀면 바로 이어 그린다 */
  setFrozen: (on: boolean) => void;
  setView: (v: View) => void;
  getState: () => WalkState;
  /** 몸을 옮긴다. 그 자리가 막혔거나 허공이면 1.5m 안에서 가장 가까운 걸을 수 있는 자리로, 그것도 없으면 false */
  teleport: (x: number, z: number, level: Level, yaw?: number) => boolean;
  /**
   * 자동 걷기: 점들을 차례로 걸어간다(걷는 속도, 물리 그대로). 손으로 움직이면(키·스틱·끌기) 멈추고 onCancel.
   * faceYaw를 주면 도착한 뒤 그쪽으로 천천히 돈다(1인칭은 시선, 3인칭은 캐릭터만. 손으로 움직이거나 둘러보면 그만둔다)
   */
  walkPath: (points: Array<{ x: number; z: number; level: Level; y?: number }>, cb?: PathCallbacks, faceYaw?: number) => void;
  cancelPath: () => void;
  /** 점프(공중이면 무시, 앉아 있으면 일어서기만). 데스크탑 스페이스바는 엔진이 직접 받는다 */
  jump: () => void;
  /** 앉기·일어서기(on을 안 주면 바꾼다). 걷거나 뛰면 저절로 일어선다. 데스크탑 Ctrl(혼자 눌렀다 떼기)은 엔진이 직접 받는다 */
  sit: (on?: boolean) => void;
  /** 같은 공간의 다른 사람들. 부를 때마다 목록 전체를 준다 */
  setOthers: (players: RemotePlayer[]) => void;
  /** 내 말풍선(내 캐릭터 머리 위에 6초) */
  say: (text: string) => void;
  /**
   * 말 숨기기: 사람 머리 위 말풍선(내 것 포함)을 띄우지 않고, 떠 있던 것도 바로 내린다. 반려동물의 말풍선은 그대로.
   * 다시 보이게 해도 숨긴 동안 온 말은 다시 띄우지 않는다
   */
  setTalkHidden: (hidden: boolean) => void;
  /** 내 캐릭터를 바로 바꾼다(말풍선·이름표는 그대로) */
  setCharacter: (look: CharacterLook) => void;
  /**
   * 사진 캐릭터 그림 주소(/api/avatar/<id>)의 3D가 다 됐다(화면의 3D 진행이 알렸다). 그 모형을 다시 묻기 차례를 기다리지 않고
   * 바로 다시 묻는다: 그 캐릭터를 입고 있으면 3D가 곧 선다
   */
  refreshModel: (photoUrl: string) => void;
  /** 지금 화면을 한 번 그려 JPEG로(3D만, 화면 위 단추 없이). 긴 변 1920px 이하, 품질 0.85 */
  capture: () => Promise<Blob>;
  /** 둘러보기 감도 배율(0.3~3). 마우스·시선 스틱·화면 끌기에 바로 적용 */
  setSensitivity: (mult: number) => void;
  /** 문패 글을 바꾼다(방 slug → 이름). 목록에 없는 문은 기본 이름으로 */
  setDoorNames: (names: Record<string, string>, phrases?: Record<string, string>) => void;
  /** 반려동물을 두거나(이름·시계·친구만 바뀌면 그대로 고친다) null로 없앤다. 방 장면·관전에서는 아무 일도 없다 */
  setPet: (pet: PetSpec | null) => void;
  /**
   * 함께 걷기에 이어져 있는가(남의 화면에 내가 보이는가). 이어져 있을 때만 반려동물이 나를 친구로 센다(내 이름이 친구이면):
   * 남의 화면이 나를 보고 하는 판단과 같게
   */
  setNetLive: (live: boolean) => void;
  /** 부엌 사진 갤러리 전시 목록을 바꾼다(빈 표면 모든 액자가 「곧 전시해요」). 갤러리가 없는 세계면 아무 일도 없다 */
  setGallery: (items: ReadonlyMap<string, GalleryArt> | null) => void;
  /** 관전에서만: 그릴 화면들과 화면마다 초당 장수(1~30). 모두 곧 다시 그린다. 관전이 아니면 아무 일도 없다 */
  setScreens?: (screens: readonly ObserveScreen[], fps: number) => void;
  /** 관전에서만: 화면을 모두 곧 다시 그린다(받는 쪽 캔버스를 새로 만들었거나 그래픽 문맥이 돌아왔을 때) */
  redrawScreens?: () => void;
  dispose: () => void;
};

const WALK = 1.6;
const RUN = 3.6;
// 마우스 둘러보기는 가로·세로 같은 배율(화면 가운데 1px이 보이는 각)에 감도를 곱한다(mouse.ts). 버튼 없이 움직여도, 포인터 잠금이어도 같다
/** 오른쪽 시선 스틱(rad/s) */
const LOOK_YAW = 2.4;
const LOOK_PITCH = 1.6;
/** 휴대폰 1인칭: 이동 스틱 x로 도는 속도(rad/s) */
const STICK_TURN = 1.9;
/**
 * 휴대폰 3인칭: 카메라가 이동 방향 뒤로 따라오는 감쇠(1/s)와 최대 회전 속도(rad/s).
 * 이동이 카메라 기준이라 카메라가 돌면 이동 방향도 같이 돈다(따라오기가 끝나지 않는다).
 * 그래서 옆으로 민 만큼만, 낮은 상한으로 돌려 3초를 밀어도 큰 호를 그리며 곧게 나아가게 한다.
 */
const FOLLOW_RATE = 3;
const FOLLOW_MAX = 0.6;
/** 스틱을 민 뒤 따라오기가 다 붙기까지(초) */
const FOLLOW_RAMP = 0.35;
/** 이 각(rad)보다 뒤로 걸으면(카메라 쪽으로 다가오면) 따라 돌지 않는다 */
const FOLLOW_BACK = 2.4;
/** 데스크탑 마우스: 단추·카드 둘레(px)와 화면 가장자리(px)에서는 둘러보지 않는다 */
const UI_MARGIN = 64;
const EDGE_MARGIN = 24;
/** 한 번의 마우스 움직임으로 보는 묶음: 이만큼(ms) 쉬면 새 움직임. 단추로 뻗을 때 되돌리는 최대 길이(ms) */
const STROKE_GAP = 160;
const STROKE_MAX = 1200;
/** 되돌리는 데 걸리는 시간(ms) */
const UNDO_MS = 140;
const EYE = 1.6;
/** 앉으면 1인칭 눈높이가 내려가는 만큼(m), 3인칭 카메라가 보는 높이가 내려가는 만큼(m) */
const SIT_EYE = 0.72;
const SIT_AIM = 0.25;
/** 앉으면 내 이름표(3인칭)가 내려가는 만큼(m): 캐릭터 머리가 내려가는 만큼(모습마다 0.2~0.3m) */
const SIT_LABEL = 0.24;
const CUT_H = 1.15;
/** 3인칭 카메라가 보는 높이(캐릭터 가슴께) */
const AIM_H = 1.0;
/** 방 장면 3인칭 카메라: 집 거리에 곱하는 값, 최소·최대(m), 벽·천장에서 떨어질 틈(m), 아무리 좁아도 이만큼은(m) */
const ROOM_CAM_SCALE = 0.45;
const ROOM_CAM_MIN = 1.4;
const ROOM_CAM_MAX = 3.2;
const ROOM_CAM_GAP = 0.3;
const ROOM_CAM_NEAR = 0.7;
/** 사진 찍기: 긴 변 상한(px) */
const CAPTURE_MAX = 1920;
/** 다른 사람: 받은 자리로 따라가는 시정수(초), 이보다 멀리 떨어지면 바로 옮긴다(m), 그리는 거리(m) */
const OTHER_TAU = 0.12;
const OTHER_SNAP = 8;
const OTHER_FAR = 45;
/** 한 번에 그릴 수 있는 다른 사람 발밑 그림자 수(서버 정원 60명보다 조금 넉넉하게) */
const OTHER_BLOBS = 64;
/** 보이는 사람이 이보다 많으면 가까운 순서로 이만큼만 이름표를 보인다(말하는 사람은 늘 보인다). 휴대폰, 데스크탑 */
const NAMES_COARSE = 10;
const NAMES_FINE = 18;
/** 이름표가 켜졌다 꺼졌다 하지 않게, 한번 보인 이름은 기준 거리의 이 배수까지 남긴다 */
const NAME_KEEP = 1.15;
/** 내 캐릭터가 멈춘 뒤에도 해 그림자를 다시 굽는 시간(걸음이 가라앉는 동안) */
const SHADOW_TAIL_MS = 700;
/** 움직임이 그친 뒤에도 이만큼은 계속 그린다(걸음·카메라·벽 낮추기가 가라앉는 꼬리) */
const IDLE_TAIL_MS = 1500;
/** 가만히 있는 동안에도 이 간격으로 한 장씩은 그린다(늦게 온 그림·글씨가 화면에 나오게) */
const IDLE_KEEP_MS = 500;
/** 프레임 간격 평균이 이보다 길면 느린 기기로 본다(30fps로 묶인 기기의 33ms보다 넉넉히 위) */
const SLOW_GAP_MS = 40;
/** 셰이더 준비를 기다리는 한도. 넘으면 그냥 그리기 시작한다(예전처럼 첫 프레임이 스스로 컴파일한다) */
const WARM_MAX_MS = 8000;
/** 살피기 구역 예외(문 앞은 벽에 붙어 있어 옆 구역에서도 잡힌다) */
const ZONE_FREE = new Set<Hotspot['kind']>(['door', 'portal', 'exit']);

type Cut = { mesh: THREE.Mesh; level: Level; base: number; y0: number; y1: number };
/** 자동 걷기가 끝났을 때: 도착, 손으로 멈춤, 막혀서 멈춤(onStuck이 없으면 onCancel로 알린다) */
export type PathCallbacks = { onArrive?: () => void; onCancel?: () => void; onStuck?: () => void };


/** 실제 크기대로 무늬가 반복되는 상자(벽 10m에 회벽 무늬 하나가 늘어나지 않게). 면 순서 +x,-x,+y,-y,+z,-z. */
const TILE = 1.6;
function uvBox(sx: number, sy: number, sz: number, uvHeight = sy) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: Array<[number, number]> = [[sz, uvHeight], [sz, uvHeight], [sx, sz], [sx, sz], [sx, uvHeight], [sx, uvHeight]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / TILE, (uv.getY(k) * dims[f][1]) / TILE);
    }
  }
  uv.needsUpdate = true;
  return geo;
}
/**
 * 상자 여섯 면 가운데 고른 면(second)만 둘째 재질로 그리게 색인을 다시 늘어놓는다.
 * 면마다 재질을 따로 주면 상자 하나에 그리기 호출이 여섯 번 나간다: 두 묶음으로 줄인다.
 */
function splitFaces(geo: THREE.BoxGeometry, second: number[]) {
  const src = Array.from(geo.index!.array as ArrayLike<number>);
  const order = [0, 1, 2, 3, 4, 5].filter((f) => !second.includes(f)).concat(second);
  const out: number[] = [];
  for (const f of order) out.push(...src.slice(f * 6, f * 6 + 6));
  geo.setIndex(out);
  geo.clearGroups();
  const n = (6 - second.length) * 6;
  geo.addGroup(0, n, 0);
  geo.addGroup(n, second.length * 6, 1);
  return geo;
}
type Side = -1 | 1;

/**
 * 해 그림자 카메라의 상자를 집에 맞춘다: 바닥 둘레(rect)와 높이 0~top의 여덟 꼭짓점을 해 카메라 쪽에서 보아 그 범위만 담는다.
 * 예전에는 해 쪽 축과 상관없이 가장 긴 변 기준 정사각형이라 그림자 지도의 상당 부분이 빈 땅이었다.
 */
function fitSunShadow(sun: THREE.DirectionalLight, rect: { x1: number; x2: number; z1: number; z2: number }, top: number) {
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera;
  cam.position.setFromMatrixPosition(sun.matrixWorld);
  cam.lookAt(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld));
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const v = new THREE.Vector3();
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity, z1 = Infinity, z2 = -Infinity;
  for (const x of [rect.x1, rect.x2]) for (const z of [rect.z1, rect.z2]) for (const y of [-0.5, top + 0.5]) {
    v.set(x, y, z).applyMatrix4(inv);
    x1 = Math.min(x1, v.x); x2 = Math.max(x2, v.x); y1 = Math.min(y1, v.y); y2 = Math.max(y2, v.y); z1 = Math.min(z1, v.z); z2 = Math.max(z2, v.z);
  }
  const pad = 0.5;
  Object.assign(cam, { left: x1 - pad, right: x2 + pad, bottom: y1 - pad, top: y2 + pad, near: Math.max(0.5, -z2 - 5), far: -z1 + 5 });
  cam.updateProjectionMatrix();
}

export function createWalk(host: HTMLElement, opt: WalkOptions): WalkController {
  const W = tuneWorld(opt.world);
  const LOOK = lookFor(W);
  const isRoom = W.kind === 'room';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opt.coarse ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // 해 그림자는 집이 바뀔 때만 다시 굽는다(아래 shadowDirty). 서 있는 집의 그림자를 프레임마다 다시 그리지 않는다
  renderer.shadowMap.autoUpdate = false;
  // 셰이더 오류 확인(getProgramInfoLog)은 셰이더마다 GPU의 답을 기다리며 화면을 멈춘다(처음 온 휴대폰에서 첫 프레임 0.6초).
  // 손님이 보는 빌드에서는 끄고, 개발할 때만 켜 둔다
  renderer.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'block';
  // 캔버스는 역할이 없으면 낭독기가 이름을 읽지 않는다: 그림으로 알린다
  renderer.domElement.setAttribute('role', 'img');
  // 화면 말(한국어·영어). 캔버스에 그리는 화면 말(문패·이름표·액자 판·표지판)은 이 값으로 고르고, 바뀌면 아래 onWalkLang이 다시 그린다
  let lang = walkLang();
  const labelCanvas = () => renderer.domElement.setAttribute('aria-label', lang === 'en' ? 'Walking inside Joyeondang' : '조연당 안을 걷는 화면');
  labelCanvas();
  host.appendChild(renderer.domElement);

  const disposables: Array<{ dispose: () => void }> = [];
  const keep = <D extends { dispose: () => void }>(d: D) => (disposables.push(d), d);

  const scene = new THREE.Scene();
  // 집: 먼 산줄기까지 보이게 안개를 80m~3.2km로. 방 장면: 창 밖으로 은은한 하늘빛만(안개 없음)
  const roomShell = isRoom && W.room?.slug ? (ROOM_SHELLS[W.room.slug] ?? null) : null;
  const roomVista = isRoom ? buildRoomVista(W) : null;
  if (roomVista) { keep(roomVista); scene.add(roomVista.group); }
  // 하늘 고르기: 집 세계에만(방 장면은 방마다 창밖 세계가 따로 있다). 낮이면 null이고 아래 값은 원래대로다
  const SKY = isRoom ? null : skyLook(opt.sky ?? 'day');
  scene.background = keep(roomVista ? T.sky(roomVista.skyTop, roomVista.skyHorizon) : isRoom ? T.sky('#c9dcec', '#f1ead9')
    : SKY ? T.sky(SKY.background[0], SKY.background[1]) : T.sky('#a9c4dc', EXTERIOR.sky));
  if (LOOK.fog) scene.fog = new THREE.Fog(SKY?.fog ?? EXTERIOR.sky, LOOK.fog[0], LOOK.fog[1]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = SKY?.environment ?? 0.65;

  const camera = new THREE.PerspectiveCamera(70, 1, 0.08, LOOK.far);

  // ───────── 빛: 하늘빛(그림자 없음) + 해(그림자) + 가구 등(따뜻한 점광). 방 장면은 해 없이 실내 조명만
  scene.add(SKY ? new THREE.HemisphereLight(SKY.hemi[0], SKY.hemi[1], SKY.hemi[2]) : new THREE.HemisphereLight('#fff4e2', '#6f5f4c', isRoom ? 1.45 : 1.3));
  const all = W.floors.reduce((b, f) => ({ x1: Math.min(b.x1, f.x1), x2: Math.max(b.x2, f.x2), z1: Math.min(b.z1, f.z1), z2: Math.max(b.z2, f.z2) }),
    { x1: W.house.x1, x2: W.house.x2, z1: W.house.z1, z2: W.house.z2 });
  const centre = new THREE.Vector3((all.x1 + all.x2) / 2, 0, (all.z1 + all.z2) / 2);
  const reach = Math.max(all.x2 - all.x1, all.z2 - all.z1) * 0.62;
  /** 해가 있는 쪽(집 가운데에서 해로 가는 방향). 방 장면은 해가 없다 */
  const sunDir = LOOK.sun ? new THREE.Vector3(0.45, 0.8, 0.6).normalize() : null;
  /** 해의 방위각(세계 +z가 0, +x 쪽이 +). 사진 캐릭터의 그림자 판이 이쪽을 본다 */
  const sunAt = sunDir ? Math.atan2(sunDir.x, sunDir.z) : null;
  if (sunDir) {
    const sun = SKY ? new THREE.DirectionalLight(SKY.sun[0], SKY.sun[1]) : new THREE.DirectionalLight('#fff0d6', 2.1);
    sun.position.copy(centre).add(sunDir.clone().multiplyScalar(reach * 2.2));
    sun.target.position.copy(centre);
    sun.castShadow = true;
    sun.shadow.mapSize.set(opt.coarse ? 1024 : 2048, opt.coarse ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: reach * 5 });
    // 그림자 상자를 해 쪽에서 본 집(바닥 둘레·지붕 높이)에 꼭 맞춘다: 같은 그림자 지도에 집이 더 크게 담겨 계단이 잘아진다
    fitSunShadow(sun, all, Math.max(W.floor2 * 2.6, ...W.props.map((p) => (p.type === 'gable' ? p.ridge : p.type === 'slab' ? p.y : p.type === 'column' ? p.h : 0))));
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    // 그림자 가장자리를 텍셀 두어 칸 넓이로 고르게 흐린다(기둥머리·처마처럼 가는 것에 진 그림자 경계가 계단으로 보이지 않게)
    sun.shadow.radius = opt.coarse ? 1.6 : 2.4;
    // 사진 캐릭터의 그림자 전용 판은 그림자를 구울 때만 그린다: 그 레이어를 해의 그림자 카메라에만 켠다(화면을 그리는 카메라는 보지 않는다)
    sun.shadow.camera.layers.enable(SHADE_LAYER);
    scene.add(sun, sun.target);
  }
  // 방 천장(데이터에 없으면 방 외곽 위 벽 높이에 하나)과 천장 등
  const roomTop = Math.max(2.4, ...W.walls.filter((w) => w.box.level !== 2).map((w) => w.baseY + w.height));
  const ceilingSpecs: CeilingSpec[] = isRoom && W.ceilings.length === 0
    ? [{ level: 1, x1: W.house.x1, x2: W.house.x2, z1: W.house.z1, z2: W.house.z2, y: roomTop - 0.01 }]
    : W.ceilings;
  if (isRoom) {
    const lamp = new THREE.PointLight(roomShell?.lampColor ?? '#ffe7c4', roomShell?.lampIntensity ?? 9, Math.max(8, reach * 4), 2);
    lamp.position.set(centre.x, roomTop - 0.35, centre.z);
    scene.add(lamp);
  }

  // ───────── 재질
  const baseTex = {
    // 1층 헤링본 오크(한 장 1m), 2층 윤이 나는 짙은 돌(한 장 1.6m에 큰 판 넷, 은빛 결)
    oak: keep(T.herringbone(FLOOR1.oak, 7)),
    black: keep(T.polishedStone(FLOOR2.floor[1], '#9aa0a8', 9)),
    redstone: keep(T.tiles(FLOOR1.redstone, '#5e3127', 3)),
    tile: keep(roomShell?.epoxyFloor ? T.polishedStone(roomShell.epoxyFloor[0], roomShell.epoxyFloor[1], 19) : T.tiles(FLOOR1.tile, '#a99c86', 5)),
    porch: keep(T.tiles(EXTERIOR.stone, '#8d8577', 2)),
    lawn: keep(T.lawn(LAWN_BY_SEASON[opt.season])),
    plasterExt: keep(T.plaster(EXTERIOR.wall, 21, 0.05)),
    /** 1층 벽: 집은 미색 벽지, 방 장면은 주인별 전용 벽 마감(적벽돌·딥그린·인디고·한지 등) */
    plaster1: keep(
      roomShell
        ? roomShell.wallKind === 'brick'
          ? T.stone(roomShell.wallColor, 53, { joints: true, rows: 12 })
          : roomShell.wallKind === 'hanji'
            ? T.hanji(roomShell.wallColor, 31)
            : T.plaster(roomShell.wallColor, 29, 0.035)
        : T.wallpaper(FLOOR1.wallTop, 22),
    ),
    plaster2: keep(T.plaster(FLOOR2.wall, 23, 0.03)),
    /** 기둥·보·창턱: 잔 반점 석회석 */
    limestone: keep(T.stone(EXTERIOR.column, 33)),
    /** 벽 밑동·돌담: 줄눈을 낸 돌 쌓기 */
    ashlar: keep(T.stone(EXTERIOR.base, 35, { joints: true, rows: 8 })),
    ashlarWall: keep(T.stone(EXTERIOR.stoneWall, 37, { joints: true, rows: 6 })),
  };
  const std = (p: THREE.MeshStandardMaterialParameters) => keep(new THREE.MeshStandardMaterial(p));
  const wallMat = {
    ext: std({ map: baseTex.plasterExt, bumpMap: baseTex.plasterExt, bumpScale: 0.35, roughness: 0.95 }),
    int1: std({ map: baseTex.plaster1, roughness: 0.88 }),
    int2: std({ map: baseTex.plaster2, bumpMap: baseTex.plaster2, bumpScale: 0.25, roughness: 0.75 }),
    stonewall: std({ map: baseTex.ashlarWall, bumpMap: baseTex.ashlarWall, bumpScale: 0.5, roughness: 0.95 }),
  };
  const trim = {
    // 징두리판: 집은 월넛, 방 장면은 방별 테마 색
    wainscot: std({ map: keep(T.panelWainscot(roomShell?.wainscotColor ?? FLOOR1.wainscot, roomShell?.wainscotStroke ?? '#694530', 41)), roughness: 0.52 }),
    capRail: std({ color: roomShell?.capRailColor ?? FLOOR1.walnut, roughness: 0.4, metalness: W.room?.slug === 'mind' ? 0.55 : 0.08 }),
    crown1: std({ color: roomShell?.ceilingColor ?? '#f4ead6', roughness: 0.8 }),
    band2: std({ color: FLOOR2.lacquer, roughness: 0.3, metalness: 0.1 }),
    silver: std({ color: FLOOR2.silver, roughness: 0.25, metalness: 0.9 }),
    plinth: std({ map: baseTex.ashlar, bumpMap: baseTex.ashlar, bumpScale: 0.5, roughness: 0.95 }),
    frame: std({ color: roomShell?.frameColor ?? EXTERIOR.trim, roughness: 0.55 }),
    frame2: std({ color: '#1b1b1d', roughness: 0.35, metalness: 0.2 }),
    tread: std({ map: keep(T.planks(FLOOR1.oak, 13)), roughness: 0.6 }),
    tread2: std({ color: '#2a2522', roughness: 0.4 }),
    rail: std({ color: FLOOR1.walnut, roughness: 0.4 }),
    cornice: std({ color: '#f6efe1', roughness: 0.75 }),
  };
  const glass = std({ color: '#a8c3d3', roughness: 0.05, metalness: 0, transparent: true, opacity: isRoom ? 0.13 : 0.22, emissive: '#dfeaf2', emissiveIntensity: isRoom ? 0.05 : 0.12, depthWrite: false });
  // 밤: 창유리가 하늘색으로 희게 뜨지 않고 안의 불빛처럼 은은히 따뜻하다(안에서 밖의 별을 가리지 않을 만큼만)
  if (SKY) { glass.emissive.set(SKY.glass[0]); glass.emissiveIntensity = SKY.glass[1]; }
  const ceilingMat = { 1: std({ color: roomShell?.ceilingColor ?? '#f1e8d6', roughness: 0.92 }), 2: std({ color: '#2b2622', roughness: 0.9 }) } as const;
  const ghostCache = new Map<THREE.Material, THREE.Material>();
  const ghostOf = (m: THREE.Material) => {
    let gm = ghostCache.get(m);
    if (!gm) {
      gm = keep(m.clone());
      gm.transparent = true;
      gm.opacity = 0.16;
      gm.depthWrite = false;
      ghostCache.set(m, gm);
    }
    return gm;
  };

  // ───────── 묶음
  const ground = new THREE.Group();
  const level1 = new THREE.Group();
  const level2 = new THREE.Group();
  const roof = new THREE.Group();
  const ceilings = new THREE.Group();
  const beacons = keep(createHotspotBeacons(W.hotspots, isRoom));
  scene.add(ground, level1, level2, roof, ceilings, beacons.group);
  const levelGroup = (lv: 0 | 1 | 2) => (lv === 2 ? level2 : level1);
  const baseOf = (lv: 0 | 1 | 2) => (lv === 2 ? W.floor2 : 0);
  const occluders: THREE.Mesh[] = [];
  /** 포치 지붕판: 인형의 집 보기(3인칭으로 집 안)에서는 지붕·위층과 함께 걷는다 */
  const porchSlabs: THREE.Object3D[] = [];
  const cuttable: Cut[] = [];
  // 3인칭으로 벽을 낮출 때 함께 숨기는 것(천장 몰딩·문틀·창·문손잡이·문패)은 층마다 한 묶음에 모아 통째로 켜고 끈다
  const hide1 = new THREE.Group();
  const hide2 = new THREE.Group();
  level1.add(hide1);
  level2.add(hide2);
  const hideGroup = (lv: Level) => (lv === 2 ? hide2 : hide1);
  const hideOnCut: Array<{ obj: THREE.Object3D; level: Level }> = [{ obj: hide1, level: 1 }, { obj: hide2, level: 2 }];

  // 바닥
  const indoorAt = (lv: Level, x: number, z: number) =>
    W.floors.some((f) => f.level === lv && f.mat !== 'lawn' && f.mat !== 'porch' && x > f.x1 && x < f.x2 && z > f.z1 && z < f.z2);
  // 바닥 재질은 종류마다 하나(무늬 크기는 판마다 UV로 맞춘다): 판마다 재질을 따로 두면 굽고 나서도 판 수만큼 그리기 호출이 나간다
  const floorMats = new Map<string, THREE.Material>();
  const floorMat = (mat: string, t: THREE.Texture) => {
    let m = floorMats.get(mat);
    if (!m) {
      m = std({ map: t, roughness: mat === 'blackwood' ? 0.34 : mat === 'tile' && roomShell?.epoxyFloor ? 0.28 : mat === 'lawn' ? 1 : mat === 'oak' ? 0.5 : 0.7 });
      // 짙은 돌은 비친 하늘빛에 잿빛으로 뜨지 않게 반사를 줄인다(윤기는 남긴다)
      if (mat === 'blackwood') (m as THREE.MeshStandardMaterial).envMapIntensity = 0.55;
      floorMats.set(mat, m);
    }
    return m;
  };
  for (const f of W.floors) {
    const w = f.x2 - f.x1;
    const d = f.z2 - f.z1;
    const t = f.mat === 'oak' ? baseTex.oak : f.mat === 'blackwood' ? baseTex.black : f.mat === 'redstone' ? baseTex.redstone
      : f.mat === 'tile' ? baseTex.tile : f.mat === 'porch' ? baseTex.porch : baseTex.lawn;
    const per = f.mat === 'lawn' ? 4 : f.mat === 'oak' ? 1 : f.mat === 'porch' || f.mat === 'redstone' || f.mat === 'blackwood' ? 1.6 : 2.4;
    const plane = new THREE.PlaneGeometry(w, d);
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    // 헤링본·돌 판은 세계 좌표로 무늬를 깐다: 방과 방 사이 바닥 판이 바뀌어도 무늬가 끊기지 않는다
    const worldUV = f.mat === 'oak' || f.mat === 'blackwood';
    const fp = plane.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      if (worldUV) uv.setXY(i, ((f.x1 + f.x2) / 2 + fp.getX(i)) / per, -((f.z1 + f.z2) / 2 - fp.getY(i)) / per);
      else uv.setXY(i, uv.getX(i) * Math.max(1, w / per), uv.getY(i) * Math.max(1, d / per));
    }
    const m = new THREE.Mesh(plane, floorMat(f.mat, t));
    m.rotation.x = -Math.PI / 2;
    const y = f.level === 2 ? W.floor2 + 0.005 : f.mat === 'lawn' ? 0 : f.mat === 'porch' ? 0.006 : 0.004;
    m.position.set((f.x1 + f.x2) / 2, y, (f.z1 + f.z2) / 2);
    m.receiveShadow = true;
    (f.level === 2 ? level2 : f.mat === 'lawn' || f.mat === 'porch' ? ground : level1).add(m);
    // 2층 바닥 밑면: 1층에서 천장판이 없는 곳(계단 위)을 올려다볼 때 바닥이 비쳐 보이지 않게
    if (f.level === 2 && f.mat !== 'porch') {
      const u = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat[1]);
      u.rotation.x = Math.PI / 2;
      u.position.set((f.x1 + f.x2) / 2, W.floor2 - 0.004, (f.z1 + f.z2) / 2);
      level2.add(u);
    }
  }

  // 천장(아래를 보는 판): 1인칭에서만 보인다
  // 넓은 천장에는 짧은 변을 가로지르는 나무 들보(1층 월넛, 2층 먹색)를 1.2m쯤마다 건다: 빈티지 우드·한옥 서까래 느낌
  const beamParts: THREE.BufferGeometry[] = [];
  const beamColor = { 1: new THREE.Color(FLOOR1.walnut), 2: new THREE.Color(FLOOR2.beam) } as const;
  for (const c of ceilingSpecs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.x2 - c.x1, c.z2 - c.z1), ceilingMat[c.level]);
    m.rotation.x = Math.PI / 2;
    m.position.set((c.x1 + c.x2) / 2, c.y, (c.z1 + c.z2) / 2);
    m.receiveShadow = true;
    ceilings.add(m);
    const w = c.x2 - c.x1, d = c.z2 - c.z1;
    if (isRoom || Math.min(w, d) < 1.6 || w * d < 5) continue;
    const alongX = w < d; // 들보는 짧은 변을 가로지른다
    const span = alongX ? w : d, run = alongX ? d : w;
    const n = Math.max(1, Math.round(run / 1.2) - 1);
    for (let i = 1; i <= n; i++) {
      const u = (alongX ? c.z1 : c.x1) + (run * i) / (n + 1);
      const g = (alongX ? new THREE.BoxGeometry(span - 0.04, 0.12, 0.11) : new THREE.BoxGeometry(0.11, 0.12, span - 0.04))
        .translate(alongX ? (c.x1 + c.x2) / 2 : u, c.y - 0.06, alongX ? u : (c.z1 + c.z2) / 2).toNonIndexed();
      g.deleteAttribute('uv');
      const col = new Float32Array(g.attributes.position.count * 3);
      const bc = beamColor[c.level];
      for (let k = 0; k < col.length; k += 3) col.set([bc.r, bc.g, bc.b], k);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      beamParts.push(g);
    }
  }

  // ───────── 벽: 창 자리를 비우고, 굽도리·징두리판·몰딩을 실제 부재로 붙인다
  const lineOf = (w: WallSpec) => (w.axis === 'x' ? (w.box.z1 + w.box.z2) / 2 : (w.box.x1 + w.box.x2) / 2);
  const thickOf = (w: WallSpec) => (w.axis === 'x' ? w.box.z2 - w.box.z1 : w.box.x2 - w.box.x1);
  const spanOf = (w: WallSpec): [number, number] => (w.axis === 'x' ? [w.box.x1, w.box.x2] : [w.box.z1, w.box.z2]);
  const windowsOn = (w: WallSpec): WindowSpec[] => W.windows.filter((win) => win.level === w.box.level && win.axis === w.axis
    && Math.abs(win.at - lineOf(w)) <= thickOf(w) / 2 + 0.06 && win.to > spanOf(w)[0] && win.from < spanOf(w)[1]);
  /** 벽 하나를 창 구멍 둘레의 조각으로 나눈다. a~b는 벽을 따라간 구간, y0~y1은 벽 밑에서 잰 높이. */
  function pieces(w: WallSpec) {
    const [s0, s1] = spanOf(w);
    const H = w.height;
    const holes = windowsOn(w).map((win) => ({ a: Math.max(win.from, s0), b: Math.min(win.to, s1), sill: win.sill, top: Math.min(win.top, H) })).sort((p, q) => p.a - q.a);
    const out: Array<{ a: number; b: number; y0: number; y1: number }> = [];
    let cur = s0;
    for (const h of holes) {
      if (h.a > cur) out.push({ a: cur, b: h.a, y0: 0, y1: H });
      if (h.sill > 0.01) out.push({ a: h.a, b: h.b, y0: 0, y1: h.sill });
      if (h.top < H - 0.01) out.push({ a: h.a, b: h.b, y0: h.top, y1: H });
      cur = Math.max(cur, h.b);
    }
    if (cur < s1) out.push({ a: cur, b: s1, y0: 0, y1: H });
    return out.filter((p) => p.b - p.a > 0.005 && p.y1 - p.y0 > 0.005);
  }
  /** 벽의 어느 면이 실내인지(바깥벽은 한쪽만, 안벽은 양쪽) */
  function interiorSides(w: WallSpec): Side[] {
    if (w.style !== 'ext') return [-1, 1];
    const lv = (w.box.level === 2 ? 2 : 1) as Level;
    const [s0, s1] = spanOf(w);
    const mid = (s0 + s1) / 2;
    const off = thickOf(w) / 2 + 0.3;
    return ([-1, 1] as Side[]).filter((s) => (w.axis === 'x' ? indoorAt(lv, mid, lineOf(w) + s * off) : indoorAt(lv, lineOf(w) + s * off, mid)));
  }
  /** 축을 따라 a~b, 높이 y0~y1, 벽 면에서 s쪽으로 붙는 얇은 부재 */
  function strip(w: WallSpec, a: number, b: number, y0: number, y1: number, s: Side, depth: number, mat: THREE.Material) {
    const len = b - a;
    const h = y1 - y0;
    const at = lineOf(w) + s * (thickOf(w) / 2 + depth / 2);
    const geo = w.axis === 'x' ? uvBox(len, h, depth) : uvBox(depth, h, len);
    const m = new THREE.Mesh(geo, mat);
    const along = (a + b) / 2;
    m.position.set(w.axis === 'x' ? along : at, w.baseY + y0 + h / 2, w.axis === 'x' ? at : along);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  function addWall(w: WallSpec) {
    if (w.style === 'invisible') return;
    const lv = (w.box.level === 2 ? 2 : 1) as Level;
    const parent = w.style === 'stonewall' ? ground : levelGroup(w.box.level);
    const inner = lv === 2 ? wallMat.int2 : wallMat.int1;
    const outerMat = w.style === 'ext' ? wallMat.ext : w.style === 'stonewall' ? wallMat.stonewall : inner;
    const sides = w.style === 'stonewall' ? [] : interiorSides(w);
    const thick = thickOf(w);
    // 잘라 보기는 층 바닥에서 잰 높이로 한다(문 머리벽은 문 위에서 시작)
    const floorBase = baseOf(w.box.level);
    const off = w.baseY - floorBase;
    for (const p of pieces(w)) {
      const len = p.b - p.a;
      const ph = p.y1 - p.y0;
      const geo = w.axis === 'x' ? uvBox(len, 1, thick, ph) : uvBox(thick, 1, len, ph);
      // 바깥벽은 실내 쪽 면에만 그 층의 실내 벽 재질을 쓴다(상자 면 순서 +x,-x,+y,-y,+z,-z)
      let material: THREE.Material | THREE.Material[] = outerMat;
      if (w.style === 'ext' && sides.length) {
        splitFaces(geo, sides.map((s) => (w.axis === 'x' ? (s > 0 ? 4 : 5) : s > 0 ? 0 : 1)));
        material = [outerMat, inner];
      }
      const m = new THREE.Mesh(geo, material);
      const along = (p.a + p.b) / 2;
      m.position.set(w.axis === 'x' ? along : lineOf(w), w.baseY + (p.y0 + p.y1) / 2, w.axis === 'x' ? lineOf(w) : along);
      m.scale.y = p.y1 - p.y0;
      m.userData.base = material;
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      if (w.style === 'stonewall') continue;
      // 높이를 바꾸고 비쳐 보이게 하는 벽 조각은 굽지 않는다
      m.userData.live = true;
      occluders.push(m);
      cuttable.push({ mesh: m, level: lv, base: floorBase, y0: off + p.y0, y1: off + p.y1 });
      // 문 위 머리벽(바닥에서 떠 있는 벽)은 3인칭으로 벽을 낮추면 통째로 사라진다. 거기 붙인 띠도 숨김 묶음에 둬야
      // 허공에 판만 남지 않는다
      const header = off > 0.01;
      const trimTo = header ? hideGroup(lv) : parent;
      // 바깥벽 밑동의 돌 띠(바깥쪽). 문 위 머리벽은 밑동이 아니라 띠를 두르지 않는다
      if (w.style === 'ext' && p.y0 === 0 && !header) {
        for (const s of [-1, 1] as Side[]) if (!sides.includes(s)) parent.add(strip(w, p.a, p.b, 0, Math.min(0.45, p.y1), s, 0.03, trim.plinth));
      }
      // 바깥벽 꼭대기 몰딩(처마 띠): 층마다 위 끝을 크림색 두 단으로 둘러 외관을 정돈한다
      if (w.style === 'ext' && p.y1 >= w.height - 0.01 && w.height > 2) {
        for (const s of [-1, 1] as Side[]) {
          if (sides.includes(s)) continue;
          // 벽 꼭대기에 붙으므로, 3인칭으로 그 층 벽을 낮출 때 함께 숨긴다(안 그러면 띠만 허공에 남는다)
          hideGroup(lv).add(
            strip(w, p.a - 0.02, p.b + 0.02, w.height - 0.16, w.height - 0.04, s, 0.05, trim.cornice),
            // 1층 띠는 벽 꼭대기까지만(위로 솟으면 그 위에 얹힌 테라스 바닥을 뚫고 흰 줄로 보인다)
            strip(w, p.a - 0.04, p.b + 0.04, w.height - 0.04, w.height + (lv === 1 ? 0 : 0.02), s, 0.09, trim.cornice),
          );
        }
      }
      for (const s of sides) {
        if (p.y0 === 0 && header) {
          // 머리벽 밑: 문 위를 가로지르는 인방(1층 월넛, 2층 옻칠)
          trimTo.add(strip(w, p.a, p.b, 0.003, Math.min(0.16, p.y1), s, 0.02, lv === 1 ? trim.capRail : trim.band2));
        } else if (p.y0 === 0) {
          if (lv === 1) {
            // 1층: 허리 높이 월넛 징두리판(틀과 도드라진 판), 손잡이 띠, 걸레받이
            const top = Math.min(0.9, p.y1);
            parent.add(strip(w, p.a, p.b, 0, top, s, 0.015, trim.wainscot));
            if (p.y1 >= 0.92) parent.add(strip(w, p.a, p.b, 0.88, 0.93, s, 0.035, trim.capRail));
            // 걸레받이는 양끝을 1mm 더 내민다(벽 끝에서 징두리판 끝면과 같은 면에 겹치지 않게)
            parent.add(strip(w, p.a - 0.001, p.b + 0.001, 0, Math.min(0.13, p.y1), s, 0.028, trim.capRail));
          } else {
            // 2층: 옻칠 검정 아랫단과 은빛 줄, 조금 나온 걸레받이와 그 위 은 줄
            const top = Math.min(0.75, p.y1);
            parent.add(strip(w, p.a, p.b, 0, top, s, 0.012, trim.band2));
            if (p.y1 >= 0.77) parent.add(strip(w, p.a, p.b, 0.75, 0.765, s, 0.02, trim.silver));
            parent.add(strip(w, p.a - 0.001, p.b + 0.001, 0, Math.min(0.11, p.y1), s, 0.026, trim.band2));
            if (p.y1 >= 0.125) parent.add(strip(w, p.a, p.b, 0.11, 0.118, s, 0.03, trim.silver));
          }
        }
        // 벽과 천장 사이 몰딩(코니스): 1층은 월넛 두 단 밑에 미색 구슬띠, 2층은 먹색 두 단 밑에 은 줄.
        // 문 위 머리벽에도 같은 높이로 이어 단다(문마다 몰딩이 끊기지 않게)
        if (p.y1 >= w.height - 0.01 && off + p.y1 > 2) {
          const H = w.height, lo = (y: number) => Math.max(p.y0, y);
          const crown = lv === 1 ? trim.capRail : trim.frame2;
          hideGroup(lv).add(strip(w, p.a, p.b, lo(H - 0.12), H, s, 0.03, crown), strip(w, p.a, p.b, lo(H - 0.06), H, s, 0.07, crown));
          if (H - 0.135 > p.y0) hideGroup(lv).add(strip(w, p.a, p.b, H - 0.135, H - 0.12, s, 0.04, lv === 1 ? trim.crown1 : trim.silver));
        }
      }
    }
    // 창: 유리, 문틀, 가운데 살, 실내 창대
    for (const win of windowsOn(w)) {
      const [s0, s1] = spanOf(w);
      const a = Math.max(win.from, s0), b = Math.min(win.to, s1);
      const top = Math.min(win.top, w.height);
      const g = new THREE.Group();
      const fm = lv === 2 ? trim.frame2 : trim.frame;
      const len = b - a, h = top - win.sill, ft = 0.06;
      const along = (a + b) / 2, yc = w.baseY + win.sill + h / 2;
      const put = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, mt: THREE.Material) => {
        const geo = w.axis === 'x' ? new THREE.BoxGeometry(sx, sy, sz) : new THREE.BoxGeometry(sz, sy, sx);
        const m = new THREE.Mesh(geo, mt);
        m.position.set(w.axis === 'x' ? along + lx : lineOf(w) + lz, yc + ly, w.axis === 'x' ? lineOf(w) + lz : along + lx);
        g.add(m);
        return m;
      };
      put(0, 0, 0, len, h, 0.02, glass);
      put(0, h / 2 - ft / 2, 0, len, ft, thick + 0.02, fm);
      put(0, -h / 2 + ft / 2, 0, len, ft, thick + 0.02, fm);
      put(-len / 2 + ft / 2, 0, 0, ft, h, thick + 0.02, fm);
      put(len / 2 - ft / 2, 0, 0, ft, h, thick + 0.02, fm);
      // 창살: 폭 0.9m쯤마다 세로 살, 키 큰 창은 위 3할에 가로 살(여러 칸 유리창이 집다운 얼굴을 만든다)
      const panes = Math.max(1, Math.round(len / 0.95));
      for (let i = 1; i < panes; i++) put(-len / 2 + (len * i) / panes, 0, 0, 0.04, h, 0.05, fm);
      if (h > 1.3) put(0, h / 2 - h * 0.3, 0, len, 0.04, 0.05, fm);
      for (const s of interiorSides(w)) {
        put(0, -h / 2 - 0.02, s * (thick / 2 + 0.05), len + 0.1, 0.04, 0.12, lv === 2 ? trim.band2 : trim.capRail);
        // 실내 쪽 창 둘레 틀(1층 월넛, 2층 먹색): 양옆과 머리(몰딩에 닿을 만큼 높으면 머리는 몰딩이 대신한다)
        const casing = lv === 2 ? trim.frame2 : trim.capRail;
        for (const k of [-1, 1]) put(k * (len / 2 + 0.036), 0.02, s * (thick / 2 + 0.012), 0.08, h + 0.04, 0.024, casing);
        if (top + 0.08 <= w.height - 0.14) put(0, h / 2 + 0.04, s * (thick / 2 + 0.012), len + 0.16, 0.08, 0.024, casing);
      }
      // 바깥벽의 바깥 면: 크림색 창 둘레(머리 띠와 양옆)와 내민 창턱
      if (w.style === 'ext') {
        const inside = interiorSides(w);
        for (const s of [-1, 1] as Side[]) {
          if (inside.includes(s)) continue;
          const face = s * (thick / 2);
          if (top < w.height - 0.1) put(0, h / 2 + 0.06, face + s * 0.02, len + 0.24, 0.12, 0.04, trim.cornice);
          for (const k of [-1, 1]) put(k * (len / 2 + 0.05), 0.0, face + s * 0.015, 0.1, h, 0.03, trim.cornice);
          if (win.sill > 0.12) put(0, -h / 2 - 0.03, face + s * 0.05, len + 0.2, 0.06, 0.1, trim.cornice);
        }
      }
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== glass) (o as THREE.Mesh).castShadow = true; });
      hideGroup(lv).add(g);
    }
  }
  W.walls.forEach(addWall);
  W.headers.forEach(addWall);

  // 문틀: 문·통로 자리(머리벽이 있는 곳)의 양쪽 기둥과 머리
  for (const h of W.headers) {
    if (h.style === 'stonewall' || h.style === 'invisible') continue;
    const lv = (h.box.level === 2 ? 2 : 1) as Level;
    const [a, b] = spanOf(h);
    const top = h.baseY - baseOf(h.box.level);
    const pseudo: WallSpec = { ...h, baseY: baseOf(h.box.level), height: top };
    const mt = lv === 2 ? trim.frame2 : trim.capRail;
    // 머리벽 꼭대기(천장 몰딩 자리). 문틀 머리 위 갓은 몰딩 밑에 들어갈 때만 단다
    const headTop = h.baseY + h.height - baseOf(h.box.level);
    // 문틀은 문 자리 안쪽으로 몇 mm 내민다: 옆 벽의 징두리판·걸레받이 끝면, 머리벽 인방 밑면과 같은 면에 겹쳐 깜빡이지 않게
    const cw = 0.085, e = 0.004;
    for (const s of interiorSides(pseudo)) {
      // 3인칭으로 벽을 허리까지 낮출 때 문틀만 우뚝 남아 기둥처럼 보이지 않게, 벽과 함께 숨긴다
      hideGroup(lv).add(strip(pseudo, a - cw, a + e, 0, top + cw, s, 0.03, mt), strip(pseudo, b - e, b + cw, 0, top + cw, s, 0.03, mt), strip(pseudo, a - cw, b + cw, top - e, top + cw, s, 0.03, mt));
      if (top + cw + 0.05 <= headTop - 0.14) hideGroup(lv).add(strip(pseudo, a - cw - 0.03, b + cw + 0.03, top + cw, top + cw + 0.045, s, 0.045, mt));
      // 1층 문틀 밑동 받침(걸레받이보다 조금 두껍게), 2층은 문틀 안쪽 은 줄(문틀보다 조금 더 안쪽·앞으로)
      if (lv === 1) hideGroup(lv).add(strip(pseudo, a - cw - 0.01, a + e, 0, 0.17, s, 0.038, mt), strip(pseudo, b - e, b + cw + 0.01, 0, 0.17, s, 0.038, mt));
      else hideGroup(lv).add(strip(pseudo, a - 0.008, a + 0.007, 0, top - e, s, 0.034, trim.silver), strip(pseudo, b - 0.007, b + 0.008, 0, top - e, s, 0.034, trim.silver), strip(pseudo, a - 0.008, b + 0.008, top - 0.019, top - e, s, 0.034, trim.silver));
    }
  }

  // 닫힌 문짝
  // 문짝: 월넛 틀에 도드라진 판 여섯(문 한 짝에 그림 한 장이 맞게 문 면 UV는 0~1)
  const doorTex = keep(T.panelDoor('#6c472e', '#7d5536', 31));
  const doorWood = std({ map: doorTex, roughness: 0.65 });
  const doorLacquer = std({ color: FLOOR2.lacquer, roughness: 0.25, metalness: 0.1 });
  // 놀이가 있는 방 문은 방마다 색을 달리한다(나무결 위에 색을 얹는다)
  const roomDoor = new Map<string, THREE.Material>();
  const doorMatFor = (d: DoorSpec): THREE.Material => {
    const tint = d.slug ? ROOM_DOOR[d.slug]?.tint : undefined;
    if (!d.slug || !tint) return d.style === 'wood' ? doorWood : doorLacquer;
    let mt = roomDoor.get(d.slug);
    if (!mt) {
      mt = std(d.style === 'wood' ? { map: doorTex, color: tint, roughness: 0.6 } : { color: tint, roughness: 0.3, metalness: 0.1 });
      roomDoor.set(d.slug, mt);
    }
    return mt;
  };
  const knobBrass = std({ color: FLOOR1.brass, metalness: 0.85, roughness: 0.3 });
  const knobSilver = std({ color: FLOOR2.silver, metalness: 0.92, roughness: 0.25 });
  for (const d of W.doors) {
    if (!d.closed) continue;
    const b = d.box;
    const lv = (b.level === 2 ? 2 : 1) as Level;
    const len = d.axis === 'x' ? b.x2 - b.x1 : b.z2 - b.z1;
    const geo = d.axis === 'x' ? new THREE.BoxGeometry(len, 1, 0.05) : new THREE.BoxGeometry(0.05, 1, len);
    const m = new THREE.Mesh(geo, doorMatFor(d));
    m.position.set((b.x1 + b.x2) / 2, d.baseY + d.height / 2, (b.z1 + b.z2) / 2);
    m.scale.y = d.height;
    m.userData.base = m.material;
    m.userData.live = true;
    m.castShadow = m.receiveShadow = true;
    levelGroup(b.level).add(m);
    cuttable.push({ mesh: m, level: lv, base: d.baseY, y0: 0, y1: d.height });
    for (const s of [-1, 1]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), d.style === 'wood' ? knobBrass : knobSilver);
      if (d.axis === 'x') k.position.set(m.position.x + len * 0.38, d.baseY + 1.0, m.position.z + s * 0.05);
      else k.position.set(m.position.x + s * 0.05, d.baseY + 1.0, m.position.z + len * 0.38);
      hideGroup(lv).add(k);
    }
  }

  // ───────── 문패: 이름 있는 문마다 작은 나무 판(앞뒤 두 면이 글 한 장을 함께 쓴다). 닫힌 문은 1.55m, 열린 문은 문틀 위.
  // 손님에게만 보이는 이름(doorNames, 방 slug → 이름)이 있으면 그 글로 덮는다
  type Card = { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; meshes: THREE.Mesh[] };
  type Plate = { slug?: string; label: string; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; card?: Card };
  const plates: Plate[] = [];
  let doorNames: Record<string, string> = { ...(opt.doorNames ?? {}) };
  // 방 주인의 한마디(손님에게만 서버가 준다). 문패 아래 작은 종이 카드에 적는다
  let doorPhrases: Record<string, string> = { ...(opt.doorPhrases ?? {}) };
  const cardGeo = keep(new THREE.PlaneGeometry(0.5, 0.17));
  const drawCard = (pl: Plate) => {
    const c = pl.card;
    if (!c) return;
    const phrase = String((pl.slug && doorPhrases[pl.slug]) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40);
    c.meshes.forEach((m) => (m.visible = Boolean(phrase)));
    const g = c.canvas.getContext('2d');
    if (!g || !phrase) return;
    const w = c.canvas.width, h = c.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fbf6ec';
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, w - 8, h - 8, 14);
    else g.rect(4, 4, w - 8, h - 8);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = (pl.slug && ROOM_DOOR[pl.slug]?.tint) || '#c9a36b';
    g.stroke();
    g.fillStyle = '#4a3423';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 두 줄까지: 글자 수로 반을 나누고, 넘치면 글씨를 줄인다
    const half = Math.ceil(phrase.length / 2);
    const lines = phrase.length > 18 ? [phrase.slice(0, half), phrase.slice(half)] : [phrase];
    let size = lines.length > 1 ? 34 : 40;
    g.font = `500 ${size}px ${LABEL_FONT}`;
    while (size > 18 && Math.max(...lines.map((l) => g.measureText(l).width)) > w - 40) g.font = `500 ${(size -= 2)}px ${LABEL_FONT}`;
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (size + 6)));
    c.tex.needsUpdate = true;
  };
  const plateGeo = keep(new THREE.PlaneGeometry(0.46, 0.125));
  const drawPlate = (pl: Plate) => {
    const g = pl.canvas.getContext('2d');
    if (!g) return;
    const w = pl.canvas.width, h = pl.canvas.height;
    // 손님에게만 보이는 이름(가족이 지은 이름)은 그대로, 문의 기본 이름은 화면 말로(영어 이름은 더 길어 24자, 글씨는 22px까지)
    const own = pl.slug ? doorNames[pl.slug] : undefined;
    const raw = own || placeName(lang, pl.label);
    const en = !own && raw !== pl.label;
    const text = String(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, en ? 24 : 16);
    g.clearRect(0, 0, w, h);
    const wood = g.createLinearGradient(0, 0, 0, h);
    wood.addColorStop(0, '#a0704a');
    wood.addColorStop(1, '#7a5134');
    g.fillStyle = wood;
    g.beginPath();
    if (g.roundRect) g.roundRect(3, 3, w - 6, h - 6, 22);
    else g.rect(3, 3, w - 6, h - 6);
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(58, 34, 18, 0.55)';
    g.stroke();
    // 놀이가 있는 방이면 왼쪽에 방 표시(색 동그라미와 기호)
    const mark = pl.slug ? ROOM_DOOR[pl.slug] : undefined;
    const left = mark ? 112 : 0;
    if (mark) {
      g.fillStyle = mark.tint;
      g.beginPath();
      g.arc(66, h / 2, 42, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#fbf1de';
      g.stroke();
      g.fillStyle = '#fbf1de';
      g.font = `700 48px ${LABEL_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(mark.glyph, 66, h / 2 + 2);
    }
    let size = 60;
    g.font = `600 ${size}px ${LABEL_FONT}`;
    while (size > (en ? 22 : 26) && g.measureText(text).width > w - 64 - left) g.font = `600 ${(size -= 2)}px ${LABEL_FONT}`;
    g.fillStyle = '#fbf1de';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, left + (w - left) / 2, h / 2 + 3);
    pl.tex.needsUpdate = true;
  };
  for (const d of W.doors) {
    const label = (d.label ?? '').trim();
    if (!label || label === '닫힌 방') continue;
    const b = d.box;
    const lv = (b.level === 2 ? 2 : 1) as Level;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 140;
    const tex = keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const pl: Plate = { slug: d.slug, label, canvas, tex };
    if (d.closed && d.slug) {
      const cc = document.createElement('canvas');
      cc.width = 512;
      cc.height = 174;
      const ct = keep(new THREE.CanvasTexture(cc));
      ct.colorSpace = THREE.SRGBColorSpace;
      ct.anisotropy = 4;
      pl.card = { canvas: cc, tex: ct, meshes: [] };
    }
    drawPlate(pl);
    plates.push(pl);
    const mat = std({ map: tex, roughness: 0.6 });
    const thick = d.axis === 'x' ? b.z2 - b.z1 : b.x2 - b.x1;
    const off = (d.closed ? 0.025 : thick / 2) + 0.006;
    const y = d.closed ? d.baseY + Math.min(1.55, d.height - 0.2) : d.baseY + d.height + 0.1;
    const cx = (b.x1 + b.x2) / 2, cz = (b.z1 + b.z2) / 2;
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(plateGeo, mat);
      if (d.axis === 'x') {
        m.position.set(cx, y, cz + s * off);
        m.rotation.y = s > 0 ? 0 : Math.PI;
      } else {
        m.position.set(cx + s * off, y, cz);
        m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      // 문패·카드는 글이 바뀌면 다시 그리고(카드는 글이 없으면 숨긴다) 문마다 그림이 달라 굽지 않는다
      m.userData.live = true;
      hideGroup(lv).add(m);
      if (pl.card) {
        const card = new THREE.Mesh(cardGeo, std({ map: pl.card.tex, roughness: 0.9 }));
        card.position.copy(m.position).setY(y - 0.2);
        card.rotation.y = m.rotation.y;
        card.userData.live = true;
        hideGroup(lv).add(card);
        pl.card.meshes.push(card);
      }
    }
    drawCard(pl);
  }
  const setDoorNames = (names: Record<string, string>, phrases?: Record<string, string>) => {
    doorNames = names && typeof names === 'object' ? { ...names } : {};
    if (phrases !== undefined) doorPhrases = phrases && typeof phrases === 'object' ? { ...phrases } : {};
    plates.forEach((pl) => { drawPlate(pl); drawCard(pl); });
    invalidate(2);
  };

  // ───────── 계단: 경사면마다 디딤판, 계단참은 판 하나, 난간은 rail 상자를 따라
  const isLanding = (r: Ramp) => Math.abs(r.y1 - r.y0) < 0.01;
  for (const r of W.physics.ramps) {
    const lowLevel = Math.min(r.y0, r.y1) > W.floor2 / 2 ? 2 : 1;
    const mt = lowLevel === 2 || W.kind === 'redrawn' ? trim.tread : trim.tread;
    const g = new THREE.Group();
    if (isLanding(r)) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.x2 - r.x1, 0.2, r.z2 - r.z1), mt);
      m.position.set((r.x1 + r.x2) / 2, r.y0 - 0.1, (r.z1 + r.z2) / 2);
      g.add(m);
    } else {
      const along = r.axis === 'x' ? r.x2 - r.x1 : r.z2 - r.z1;
      const n = r.steps ?? Math.max(2, Math.round(Math.abs(r.y1 - r.y0) / 0.18));
      const lowAtMin = r.y0 < r.y1;
      const yLow = Math.min(r.y0, r.y1);
      const rise = Math.abs(r.y1 - r.y0) / n;
      const run = along / n;
      for (let i = 0; i < n; i++) {
        const top = yLow + (i + 1) * rise;
        const c = lowAtMin ? (r.axis === 'x' ? r.x1 : r.z1) + (i + 0.5) * run : (r.axis === 'x' ? r.x2 : r.z2) - (i + 0.5) * run;
        const blockH = Math.min(top - yLow + 0.001, 0.36);
        const geo = r.axis === 'x' ? uvBox(run, blockH, r.z2 - r.z1) : uvBox(r.x2 - r.x1, blockH, run);
        const m = new THREE.Mesh(geo, mt);
        m.position.set(r.axis === 'x' ? c : (r.x1 + r.x2) / 2, top - blockH / 2, r.axis === 'x' ? (r.z1 + r.z2) / 2 : c);
        g.add(m);
      }
      // 디딤판 밑을 받치는 경사진 판
      const slope = Math.atan2(Math.abs(r.y1 - r.y0), along);
      const sl = Math.hypot(along, Math.abs(r.y1 - r.y0));
      const geo = r.axis === 'x' ? new THREE.BoxGeometry(sl, 0.12, r.z2 - r.z1) : new THREE.BoxGeometry(r.x2 - r.x1, 0.12, sl);
      const s = new THREE.Mesh(geo, trim.rail);
      s.position.set((r.x1 + r.x2) / 2, yLow + Math.abs(r.y1 - r.y0) / 2 - 0.25, (r.z1 + r.z2) / 2);
      if (r.axis === 'x') s.rotation.z = lowAtMin ? slope : -slope;
      else s.rotation.x = lowAtMin ? -slope : slope;
      g.add(s);
    }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true; });
    (lowLevel === 2 ? level2 : level1).add(g);
  }
  const rampsNear = (x: number, z: number, pad: number) => W.physics.ramps.filter((r) => !isLanding(r) && x >= r.x1 - pad && x <= r.x2 + pad && z >= r.z1 - pad && z <= r.z2 + pad);
  const railPost = (x: number, y: number, z: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), trim.rail);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    return m;
  };
  const railBar = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), trim.rail);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.lookAt(b);
    m.castShadow = true;
    return m;
  };
  for (const b of W.physics.boxes) {
    // 2층 전용 난간 상자는 데이터가 낮은 벽으로 이미 보여 준다. 계단을 따라가는 난간은 1층·두 층 상자만.
    if (b.tag !== 'rail' || b.level === 2) continue;
    const longX = b.x2 - b.x1 > b.z2 - b.z1;
    const lx = (b.x1 + b.x2) / 2, lz = (b.z1 + b.z2) / 2;
    const [s0, s1] = longX ? [b.x1, b.x2] : [b.z1, b.z2];
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.4));
    const g = new THREE.Group();
    // 옆에 붙은 계단 줄기마다 그 기울기를 따라 난간을 하나씩
    const seen = new Set<Ramp>();
    for (let i = 0; i <= n; i++) {
      const u = s0 + ((s1 - s0) * i) / n;
      for (const r of rampsNear(longX ? u : lx, longX ? lz : u, 0.25)) seen.add(r);
    }
    for (const r of seen) {
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= n; i++) {
        const u = s0 + ((s1 - s0) * i) / n;
        const x = longX ? u : lx, z = longX ? lz : u;
        const px = Math.min(r.x2, Math.max(r.x1, x)), pz = Math.min(r.z2, Math.max(r.z1, z));
        if (Math.hypot(px - x, pz - z) > 0.26 || !inRamp(r, px, pz)) { prev = null; continue; }
        const y = rampY(r, px, pz);
        g.add(railPost(x, y, z, 0.92));
        const p = new THREE.Vector3(x, y + 0.92, z);
        if (prev) g.add(railBar(prev, p));
        prev = p;
      }
    }
    // 두 층에 걸친 난간은 2층에서는 계단 구멍 둘레 난간이 된다. 2층과 함께 숨도록 2층 묶음에 둔다
    // (1층 묶음에 두면 3인칭으로 위층을 걷어도 허공에 난간 기둥만 남는다)
    if (b.level === 0) {
      const up = new THREE.Group();
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= n; i++) {
        const u = s0 + ((s1 - s0) * i) / n;
        const x = longX ? u : lx, z = longX ? lz : u;
        up.add(railPost(x, W.floor2, z, 0.95));
        const p = new THREE.Vector3(x, W.floor2 + 0.95, z);
        if (prev) up.add(railBar(prev, p));
        prev = p;
      }
      level2.add(up);
    }
    level1.add(g);
  }

  // ───────── 집 바깥 도형
  // 장식 자리(기둥 줄의 보, 그림·화분·커튼·처마·포치 등 …)는 데이터에서 한 번 고른다(decor.ts). 배치는 그대로 두고 충돌도 만들지 않는다
  const decor = planDecor(W);
  const fm = makeFurnitureMats(() => { if (dirty < 2) dirty = 2; });
  Object.values(fm).forEach((v) => (Array.isArray(v) ? v.forEach((x) => keep(x)) : keep(v)));
  // 기둥·보는 잔 반점 석회석(실제 크기 UV), 아치는 회벽
  const columnMat = std({ map: baseTex.limestone, roughness: 0.82 });
  const archMat = std({ map: baseTex.plasterExt, roughness: 0.95 });
  const roofMat = std({ color: EXTERIOR.roof, roughness: 0.85 });
  const roofInside = std({ map: keep(T.planks(['#6e5643', '#644d3b', '#77604c'], 51)), roughness: 0.8 });
  const gableMat = std({ map: baseTex.plasterExt, roughness: 0.95, side: THREE.DoubleSide });
  // 박공 비탈과 처마가 함께 쓰는 기와(수키와 8줄 = 1.76m, 4단 = 1.2m를 도형 UV로 맞춘다)
  const tiles = tileMat(fm.kit);
  const porchTex = keep(T.planks(['#a77a52', '#9a6e48', '#b3875e'], 71));
  // 포치 천장은 지붕판마다 재질을 새로 만들지 않고 하나를 나눠 쓴다(무늬 크기는 실제 크기 UV)
  const porchCeiling = std({ map: porchTex, roughness: 0.7 });
  // 포치 지붕판과 함께 숨는 것(지붕판 가장자리 몰딩, 포치 천장에 매단 등): 3인칭으로 집 안에 들면 지붕판처럼 걷힌다
  const porchDecor = new THREE.Group();
  scene.add(porchDecor);
  porchSlabs.push(porchDecor);
  /** 상자 한 면(face: +x,-x,+y,-y,+z,-z 차례)의 UV를 다시 늘인다 */
  const faceUV = (geo: THREE.BufferGeometry, face: number, fn: (u: number, v: number) => [number, number]) => {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) { const k = face * 4 + i; const [u, v] = fn(uv.getX(k), uv.getY(k)); uv.setXY(k, u, v); }
    uv.needsUpdate = true;
  };
  const colTop = (p: Extract<Prop, { type: 'column' }>) => decor.columnTops.find((c) => Math.abs(c.x - p.x) < 1e-6 && Math.abs(c.z - p.z) < 1e-6)?.top ?? p.h;
  const addProp = (p: Prop) => {
    if (p.type === 'column') {
      // 기둥: 두 단 받침, 몸, 목 띠·접시 모양으로 벌어지는 머리·네모 판(머리 위가 보나 지붕판에 닿는다).
      // 예전에는 얇은 상자 하나가 머리였다: 지붕판 그림자 경계가 그 옆면을 비스듬히 지나며 계단으로 보였다
      const top = colTop(p), w = p.w, capH = 0.24, foot = 0.22;
      const piece = (geo: THREE.BufferGeometry, y: number) => { const m = new THREE.Mesh(geo, columnMat); m.position.set(p.x, y, p.z); ground.add(m); };
      piece(uvBox(w + 0.2, 0.1, w + 0.2), 0.05);
      piece(uvBox(w + 0.12, 0.08, w + 0.12), 0.14);
      piece(uvBox(w + 0.05, 0.04, w + 0.05), 0.2);
      piece(uvBox(w, top - capH - foot, w), (foot + top - capH) / 2);
      piece(uvBox(w + 0.05, 0.04, w + 0.05), top - capH + 0.02);
      const flare = new THREE.CylinderGeometry((w + 0.18) / Math.SQRT2, (w + 0.04) / Math.SQRT2, 0.1, 4, 1).rotateY(Math.PI / 4).toNonIndexed();
      flare.computeVertexNormals();
      piece(flare, top - capH + 0.09);
      piece(uvBox(w + 0.22, 0.1, w + 0.22), top - 0.05);
    } else if (p.type === 'arch') {
      const r = p.span / 2 - 0.22;
      // 아치의 회벽 무늬가 휘어진 길이만큼 늘어나지 않게 UV를 실제 길이로
      const torus = new THREE.TorusGeometry(r, 0.16, 10, 32, Math.PI);
      const tuv = torus.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < tuv.count; i++) tuv.setXY(i, (tuv.getX(i) * Math.PI * r) / TILE, (tuv.getY(i) * Math.PI * 2 * 0.16) / TILE);
      const a = new THREE.Mesh(torus, archMat);
      a.position.set(p.x, p.spring, p.z);
      if (p.axis === 'z') a.rotation.y = Math.PI / 2;
      const fill = new THREE.Mesh(p.axis === 'x' ? uvBox(p.span, 0.3, 0.36) : uvBox(0.36, 0.3, p.span), archMat);
      fill.position.set(p.x, p.spring + r - 0.02, p.z);
      ground.add(a, fill);
    } else if (p.type === 'slab') {
      // 지붕판 밑면은 집 안에서 보이는 천장이다(계단 위처럼 천장판이 없는 곳)
      // 포치 지붕판 밑면은 따뜻한 나무 천장(손님이 처음 올려다보는 곳)
      const under = p.part === 'roof' ? (p.y > W.floor2 + 0.5 ? ceilingMat[2] : ceilingMat[1]) : porchCeiling;
      const top = p.part === 'porch' ? archMat : roofMat;
      // 옆면 회벽 무늬가 판 길이(십여 m)로 늘어나 줄무늬로 보이지 않게 실제 크기 UV
      const m = new THREE.Mesh(splitFaces(uvBox(p.x2 - p.x1, p.t, p.z2 - p.z1), [3]), [top, under]);
      m.position.set((p.x1 + p.x2) / 2, p.y, (p.z1 + p.z2) / 2);
      (p.part === 'roof' ? roof : ground).add(m);
      // 포치 지붕판은 3인칭으로 현관·포치에 섰을 때 카메라와 캐릭터 사이에 낀다: 집 안에서는 지붕처럼 걷고,
      // 포치 위에서는 벽처럼 비쳐 보이게 한다
      if (p.part === 'porch') {
        m.userData.base = m.material;
        m.userData.live = true;
        occluders.push(m);
        porchSlabs.push(m);
        // 드러난 가장자리(집 벽에 붙지 않은 변)에 위 몰딩과 아래 구슬띠
        const yTop = p.y + p.t / 2, yBot = p.y - p.t / 2;
        const edges = [
          { axis: 'x' as const, at: p.z2, a: p.x1, b: p.x2, n: 1 }, { axis: 'x' as const, at: p.z1, a: p.x1, b: p.x2, n: -1 },
          { axis: 'z' as const, at: p.x2, a: p.z1, b: p.z2, n: 1 }, { axis: 'z' as const, at: p.x1, a: p.z1, b: p.z2, n: -1 },
        ];
        for (const e of edges) {
          const walled = W.walls.some((s) => s.style === 'ext' && s.axis === e.axis && Math.abs((e.axis === 'x' ? (s.box.z1 + s.box.z2) / 2 : (s.box.x1 + s.box.x2) / 2) - e.at) < 0.3
            && Math.min(e.b, e.axis === 'x' ? s.box.x2 : s.box.z2) - Math.max(e.a, e.axis === 'x' ? s.box.x1 : s.box.z1) > (e.b - e.a) * 0.5);
          if (walled) continue;
          for (const [h, d, y] of [[0.075, 0.07, yTop - 0.0375], [0.035, 0.04, yBot + 0.0175]] as const) {
            const len = e.b - e.a + d * 2;
            const g = e.axis === 'x' ? uvBox(len, h, d + 0.02) : uvBox(d + 0.02, h, len);
            const mm = new THREE.Mesh(g, trim.cornice);
            const c = (e.a + e.b) / 2, off = e.at + e.n * (d / 2 - 0.01);
            mm.position.set(e.axis === 'x' ? c : off, y, e.axis === 'x' ? off : c);
            porchDecor.add(mm);
          }
        }
      }
    } else {
      // 박공: 비탈 두 장(바깥 기와색, 안쪽 나무 천장)과 끝 삼각벽
      const along = p.ridgeAxis === 'x' ? p.x2 - p.x1 : p.z2 - p.z1;
      const half = (p.ridgeAxis === 'x' ? p.z2 - p.z1 : p.x2 - p.x1) / 2;
      const mid = p.ridgeAxis === 'x' ? (p.z1 + p.z2) / 2 : (p.x1 + p.x2) / 2;
      const rise = p.ridge - p.eave;
      const slope = Math.atan2(rise, half);
      const len = Math.hypot(half, rise) + 0.35;
      for (const s of [1, -1]) {
        // 기와: 수키와 줄이 비탈을 따라 내려가고 단마다 그늘이 진다(처마와 같은 기와 재질, 윗면 UV를 실제 크기로)
        const geo = p.ridgeAxis === 'x' ? new THREE.BoxGeometry(along + 0.5, 0.16, len) : new THREE.BoxGeometry(len, 0.16, along + 0.5);
        if (p.ridgeAxis === 'x') faceUV(geo, 2, (u, v) => [(u * (along + 0.5)) / 1.76, ((s > 0 ? v : 1 - v) * len) / 1.2]);
        else faceUV(geo, 2, (u, v) => [(v * (along + 0.5)) / 1.76, ((s > 0 ? 1 - u : u) * len) / 1.2]);
        const m = new THREE.Mesh(splitFaces(geo, [3]), [tiles, roofInside]);
        if (p.ridgeAxis === 'x') {
          m.position.set((p.x1 + p.x2) / 2, (p.eave + p.ridge) / 2, mid + s * (half / 2));
          m.rotation.x = s * slope;
        } else {
          m.position.set(mid + s * (half / 2), (p.eave + p.ridge) / 2, (p.z1 + p.z2) / 2);
          m.rotation.z = -s * slope;
        }
        m.castShadow = m.receiveShadow = true;
        roof.add(m);
      }
      for (const e of p.ridgeAxis === 'x' ? [p.x1, p.x2] : [p.z1, p.z2]) {
        const geo = new THREE.BufferGeometry();
        const v = p.ridgeAxis === 'x'
          ? [e, p.eave, mid - half, e, p.eave, mid + half, e, p.ridge, mid]
          : [mid - half, p.eave, e, mid + half, p.eave, e, mid, p.ridge, e];
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, gableMat);
        m.castShadow = true;
        roof.add(m);
      }
    }
  };
  // 방 장면에는 지붕·박공·바깥 소품이 없다
  if (LOOK.props) {
    W.props.forEach(addProp);
    // 기둥 줄 위의 보(지붕판 밑): 기둥이 판을 받치는 얼개가 보이게. 앞면 아래 모서리에 가는 띠
    for (const l of decor.lintels) {
      const bw = l.x2 - l.x1, bh = l.y1 - l.y0, bd = l.z2 - l.z1;
      const beam = new THREE.Mesh(uvBox(bw, bh, bd), columnMat);
      beam.position.set((l.x1 + l.x2) / 2, (l.y0 + l.y1) / 2, (l.z1 + l.z2) / 2);
      const bead = new THREE.Mesh(bw >= bd ? uvBox(bw, 0.035, bd + 0.04) : uvBox(bw + 0.04, 0.035, bd), columnMat);
      bead.position.set((l.x1 + l.x2) / 2, l.y0 + 0.0175, (l.z1 + l.z2) / 2);
      ground.add(beam, bead);
    }
  }
  ground.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  // 전망: 마당 밖 평지 대신 뒤로 바위산, 앞으로 산자락 동네(집 세계에만). 손가락 기기는 나무·집을 절반 이하로
  let scenery: Scenery | null = null;
  if (LOOK.scenery) {
    scenery = buildScenery(W, opt.season, opt.coarse, () => { if (dirty < 2) dirty = 2; },
      { sky: opt.sky, still: opt.reducedMotion, pixelRatio: renderer.getPixelRatio() });
    scene.add(scenery.group);
  }

  // ───────── 가구
  const ceilingAt = (f: Furniture) => {
    const x = (f.x1 + f.x2) / 2, z = (f.z1 + f.z2) / 2;
    const c = ceilingSpecs.find((c) => c.level === f.level && x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2);
    return c ? c.y - baseOf(f.level) : f.level === 1 ? W.floor2 : 2.5;
  };
  const furn = buildFurniture(W.furniture, fm, { floor2: W.floor2, ceilingAt });
  const environmentModels = prepareEnvironmentModels(furn.byLevel, ground, decor, () => {
    invalidate(2);
    // Replacing a static caster must also clear its cached shadow on touch devices.
    shadowDirty = Math.max(shadowDirty, 1);
  });
  if (LOOK.props) dressGalleryFacade(W, fm.kit, hideGroup);
  // 천장에 매다는 등은 천장과 함께(1인칭만 보인다), 벽·창에 붙은 것은 벽 윗부분과 함께 숨긴다(decor.ts HUNG):
  // 3인칭 인형의 집 보기에서 천장·벽을 걷어 내면 이것들만 허공에 남는다
  for (const lv of [1, 2] as const) {
    for (const child of [...furn.byLevel[lv].children]) {
      const mount = HUNG[child.userData.kind as Furniture['kind']];
      if (mount === 'ceiling') ceilings.add(child);
      else if (mount === 'wall') hideGroup(lv).add(child);
      else if (lv === 1 && child.position.z > W.house.z2 + 0.01) ground.add(child);
      else levelGroup(lv).add(child);
    }
  }
  for (const g of [level1, level2, ground]) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.castShadow) return;
      const mat = m.material as THREE.Material;
      if (!mat.transparent && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) m.castShadow = m.receiveShadow = true;
    });
  }
  // ───────── 장식: 그림·커튼·발(벽에 걸어 벽과 함께 숨는다), 화분·깔개(층 바닥), 처마(지붕), 포치 등·빛 웅덩이, 화단·울타리·갓돌(마당)
  if (beamParts.length) {
    const merged = mergeGeometries(beamParts, false);
    beamParts.forEach((g) => g.dispose());
    if (merged) ceilings.add(new THREE.Mesh(merged, vertexMat(fm.kit)));
  }
  if (LOOK.props) {
    dressHouse(W, decor, fm.kit, {
      onPlant: environmentModels.addTarget,
      level: (lv) => (lv === 2 ? level2 : level1),
      hide: hideGroup,
      ground,
      roof,
      porch: porchDecor,
      outdoor: (x, z) => W.floors.some((f) => f.level === 1 && (f.mat === 'porch' || f.mat === 'lawn') && x > f.x1 && x < f.x2 && z > f.z1 && z < f.z2),
    });
  }
  // ───────── 부엌 사진 갤러리(실제 집에만): 틀·매트·그림등은 벽과 함께 굽고, 빈 액자 판과 그림은 전시 목록이 오면 단다
  const gallery: GalleryScene | null = LOOK.props && W.gallery?.length
    ? buildGallery(W.gallery, fm.kit, { hide: hideGroup }, {
      coarse: opt.coarse,
      // 그림·빈 액자 판은 그림자를 드리우지 않는다: 다시 그리기만 하고 해 그림자는 굽지 않는다
      onChange: () => { if (dirty < 2) dirty = 2; },
      onStale: () => { try { opt.onGalleryStale?.(); } catch { /* 화면 쪽 오류가 그리기를 멈추지 않게 */ } },
    })
    : null;
  // 밤: 등 밑 따뜻한 빛 웅덩이를 밝힌다(더하기로 섞는 재질이라 색을 키우면 웅덩이가 밝아진다). 같은 재질을 여러 번 키우지 않게 한 번씩만
  if (SKY) {
    const boosted = new Set<THREE.Material>();
    const poolMats: THREE.MeshBasicMaterial[] = [];
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m || Array.isArray(m) || m.name !== GLOW_POOL || boosted.has(m)) return;
      boosted.add(m);
      poolMats.push(m as THREE.MeshBasicMaterial);
      (m as THREE.MeshBasicMaterial).color.multiplyScalar(SKY.pools);
    });
    // 밤에만 길가 등 밑에도 빛 웅덩이를 깐다(낮에는 두지 않는다). 같은 재질이라 그리기 한 번에 다 그린다
    const lamps = W.furniture.filter((f) => f.kind === 'pathLight');
    if (poolMats[0] && lamps.length) {
      const parts = lamps.map((f) => new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2).translate((f.x1 + f.x2) / 2, 0.018, (f.z1 + f.z2) / 2));
      const merged = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      if (merged) {
        keep(merged);
        const pools = new THREE.Mesh(merged, poolMats[0]);
        pools.name = 'night-path-pools';
        scene.add(pools);
      }
    }
  }
  scene.updateMatrixWorld(true);
  // 빛은 숨기는 묶음 밖으로(숨김마다 셰이더를 다시 짓지 않게, 대신 세기를 0으로)
  for (const l of furn.lights) scene.attach(l.light);
  // 한 번 지으면 바뀌지 않는 도형(몰딩·징두리판·문틀·바닥·계단·지붕·가구)은 묶음·재질마다 한 덩어리로 굽는다.
  // 높이가 바뀌는 벽 조각·문짝과 문패(userData.live), 투명한 것은 그대로 둔다. 숨김 묶음은 따로 구워 통째로 켜고 끈다.
  const sealed = new Set<THREE.Object3D>([hide1, hide2, porchDecor]);
  const baked = [hide1, hide2, porchDecor, ground, level1, level2, roof, ceilings].map((g) => bakeStatic(g, { stop: sealed }));
  const bakedFrom = baked.reduce((n, b) => n + b.before, 0), bakedTo = baked.reduce((n, b) => n + b.after, 0);

  // ───────── 내 캐릭터(3인칭에서만 보인다)와 발밑 그림자. 다른 사람도 같은 그림자 판을 함께 쓴다
  // 사진 캐릭터는 그림이 오기 전과 실패했을 때 보일 인형이 필요하다: 마지막으로 꾸민 인형(없으면 옛 색)
  let myLook: CharacterLook = opt.look ?? { kind: 'doll', doll: dollFromColor(opt.dollColor) };
  let myDoll: DollLook = myLook.kind === 'doll' ? myLook.doll : dollFromColor(opt.dollColor);
  // 손가락 기기에서는 캐릭터가 해 그림자를 드리우지 않는다(발밑 동그란 그림자만): 걷는 동안 집 그림자를 다시 굽지 않아도 된다.
  // 사진 캐릭터의 방향 그림 묶음도 손가락 기기는 작은 것을 받는다(그림 메모리가 절반 아래)
  const photoSize = opt.coarse ? 's' : 'l';
  // 사진 그림이 도착하거나 방향 그림 묶음이 뒤늦게 오면 캐릭터가 알린다(onChange): 그때 다시 그린다.
  // 사진 캐릭터의 3D 모형은 셰이더를 미리 지은 뒤에 세운다(처음 보이는 프레임이 멈추지 않게). 내 캐릭터는 늘 모형을 원한다
  const prepare = (o: THREE.Object3D) => renderer.compileAsync(o, camera, scene);
  const makeMe = () => createAvatar({ look: myLook, fallback: myDoll, name: opt.name !== undefined ? shownName(lang, opt.name) : null, reducedMotion: opt.reducedMotion, cast: !opt.coarse, photoSize, sun: sunAt, onChange: () => invalidate(3), model: true, prepare });
  let me = makeMe();
  scene.add(me.group);
  const shadowTex = keep(T.blob());
  const blobGeo = keep(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2));
  const blobMat = keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  const blob = new THREE.Mesh(blobGeo, blobMat);
  scene.add(blob);

  // ───────── 상태
  let body: Body = { x: W.spawn.x, z: W.spawn.z, y: 0, level: 1 };
  // 턱 완충: 보이는 높이는 body.y + ledge(낮은 무대에 오르내릴 때 눈높이가 한 프레임에 튀지 않게). 충돌·층 판정은 body.y 그대로
  let ledge = 0;
  let yaw = W.spawn.yaw;
  let pitch3 = 0.42;
  let pitch1 = -0.05;
  let dist = 6.2;
  // 방 장면도 정한 시점 그대로(3인칭이면 카메라를 짧게 당겨 방 안에 둔다)
  let view: View = opt.view;
  let paused = false;
  /** 내 캐릭터가 보는 쪽(로컬 +z 기준 rotation.y). 처음에는 카메라 앞쪽 */
  let face = yaw + Math.PI;
  /** 점프(보이는 높이만), 착지 내려앉음(1인칭 시선), 1인칭 걸음 위상·세기 */
  let hop: Hop = GROUNDED;
  /**
   * 앉아 있는가(Ctrl만 눌렀다 떼기, 휴대폰은 앉기 단추. 걷거나 뛰면 일어선다), 지금까지 뛴 수(함께 걷기로 보낸다: 남의 화면은 이 수가
   * 바뀌면 그 자리에서 한 번 뛴다. 점프는 바닥 높이를 바꾸지 않아 따로 알려야 한다), 앉은 몫(0..1, 1인칭 눈높이·3인칭 카메라 높이)
   */
  let sitting = false;
  let jumps = 0;
  let sitAmt = 0;
  /** Ctrl을 혼자 눌렀는가(다른 키나 마우스와 함께 누르면 그쪽 단축키 몫이라 앉지 않는다) */
  let ctrlAlone = false;
  let landed = false;
  let dip = 0;
  let fpPhase = 0;
  let fpAmt = 0;
  /** 지난 프레임에 실제로 움직인 빠르기(m/s, 캐릭터 걸음에 쓴다)와 달리기 여부 */
  let speedNow = 0;
  let runNow = false;
  /** 자동 걷기 */
  let path: { run: PathRun; cb: PathCallbacks; face?: number } | null = null;
  /** 걸어서 도착한 뒤 돌아볼 방향(다 돌았거나 손으로 움직이면 null)과, 지난 프레임에 맞춰 둔 시선(그 사이 손으로 둘러봤는지 본다) */
  let turnTo: number | null = null;
  let turnSeen: number | null = null;
  /** 해 그림자를 다시 구울 프레임 수(처음 몇 프레임, 그 뒤로는 집 모양이 바뀔 때만) */
  let shadowDirty = 3;
  /** 화면이 통째로 가려져 그리기를 쉬는 중인가(놀이 덮개) */
  let frozen = false;
  // 가만히 서 있으면 화면은 한 화소도 바뀌지 않는다: 바뀐 것이 있을 때만 그린다(휴대폰이 덜 뜨거워지고 배터리가 오래 간다).
  // 바뀜을 놓쳐도 화면이 옛 그림에 멈추지 않게, 움직임이 그친 뒤에도 잠깐(IDLE_TAIL_MS) 더 그리고 가끔(IDLE_KEEP_MS) 한 장씩 그린다.
  /** 무조건 그릴 프레임 수(시점·자리·겉모습·화면 크기가 코드로 바뀌었을 때) */
  let dirty = 3;
  // 코드로 무언가 바꿨을 때(시점·자리·겉모습·사람이 오고 감)는 해 그림자도 다시 굽는다.
  // 손가락 기기는 캐릭터가 해 그림자를 드리우지 않으므로 굽지 않는다(집 모양이 바뀔 때는 따로 올린다)
  const invalidate = (n = 2) => { if (dirty < n) dirty = n; if (!opt.coarse && shadowDirty < 1) shadowDirty = 1; };
  // 이미 받아 둔 전시 목록이 있으면(방에 다녀와 장면을 새로 지을 때) 바로 단다
  if (gallery && opt.gallery) gallery.setItems(opt.gallery);
  /** 마지막으로 무언가 바뀐 때와 마지막으로 그린 때 */
  let activeAt = performance.now();
  let drawnAt = 0;
  /** 내 캐릭터가 마지막으로 움직인 때(걷기·점프·자동 걷기) */
  let meActiveAt = performance.now();
  /** 지난번 그릴 때의 시선(이것과 다르면 다시 그린다) */
  const drawn = { yaw: NaN, p1: NaN, p3: NaN, dist: NaN, view: '' as View | '' };
  /** 그래픽 문맥을 잃은 동안 */
  let lost = false;
  /** 화면을 끌었는지(자동 걷기를 멈추는 손 움직임) */
  let dragged = false;
  /** 내 말풍선 글과 사라지는 때(performance.now 기준). 캐릭터를 바꿔도 이어 붙인다 */
  let myBubble = '';
  let myBubbleUntil = 0;
  /** 말 숨기기(setTalkHidden): 사람 머리 위 말풍선을 띄우지 않는다. 반려동물의 말풍선은 말이 아니라 그대로 */
  let talkHidden = false;
  /** 집 안팎을 오가는 반려동물(받은 설정이 있을 때만, 아래 setPet) */
  let pet: PetView | null = null;
  const petBlobAt = new THREE.Matrix4();
  /** 눌린 걷기·둘러보기 키의 동작(f·b·l·r·run 걷기, tl·tr 돌기, lu·ld 위아래 보기). 뗄 때는 자판 자리로 찾는다(lib/keys heldKeys) */
  const keys = heldKeys();
  /** 방향키 둘러보기: 같은 쪽으로 누르고 있는 시간(초)과 그 쪽(1·-1). 쪽이 바뀌거나 떼면 처음 빠르기부터 */
  const keyTurn = { dir: 0, held: 0 };
  const keyTilt = { dir: 0, held: 0 };
  const stick = { x: 0, y: 0 };
  const lookStick = { x: 0, y: 0 };
  const clampSens = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(3, Math.max(0.3, v)) : 1);
  let sens = clampSens(opt.lookSensitivity ?? 1);
  /** 시선 스틱을 놓은 뒤 잠시 카메라 자동 따라오기를 쉰다(초) */
  let lookHold = 0;
  /** 이동 스틱을 계속 민 시간(초): 따라오기를 천천히 붙인다 */
  let stickHeld = 0;
  let moving = false;
  /** 버튼 없이 캔버스 위를 지나는 마우스의 마지막 자리. 캔버스를 떠나면 null */
  let hover: { x: number; y: number } | null = null;
  /** 지금 마우스 움직임이 돌린 시선(되돌리기용). 시점이 바뀌거나 쉬면 비운다 */
  let stroke: Array<{ t: number; f: number; yaw: number; pitch: number }> = [];
  /** 진행 중인 되돌리기: 전체 양과 지금까지 돌린 몫 */
  let undo: { t0: number; yaw: number; pitch: number; done: number } | null = null;
  /** 마우스가 단추 둘레에 들어가 있는지(들어갈 때 한 번만 되돌린다) */
  let nearUi = false;
  /** 그린 프레임 수. 마우스 움직임은 프레임마다 뭉쳐 오므로 쉼과 길이를 시간과 프레임으로 함께 잰다 */
  let frames = 0;
  /** 실제로 그린 프레임 수(가만히 있으면 늘지 않는다) */
  let draws = 0;
  /** 해 그림자를 다시 구운 프레임 수(측정용) */
  let bakes = 0;
  // 손가락 기기인지는 화면 쪽과 같은 미디어 질의를 따라간다(아이패드에 트랙패드를 붙이는 등 도중에 바뀔 수 있다).
  // 화소 밀도·그림자 해상도는 처음 값 그대로 두고, 입력 해석만 바꾼다.
  let coarse = opt.coarse;
  const coarseMq = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
  const onCoarse = () => {
    if (!coarseMq || coarseMq.matches === coarse) return;
    coarse = coarseMq.matches;
    stick.x = stick.y = 0;
    lookStick.x = lookStick.y = 0;
    hover = null;
    stroke = [];
  };
  coarseMq?.addEventListener?.('change', onCoarse);
  const camPos = new THREE.Vector3();
  const target = new THREE.Vector3();
  // 프레임마다 새로 만들지 않고 돌려 쓰는 벡터
  const camWant = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const labelAt = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let ghosted: THREE.Mesh[] = [];
  let lastNear: Hotspot | null = null;
  let lastPlace = '';
  const el = renderer.domElement;

  const setView = (v: View) => {
    if (v === view) return;
    view = v;
    invalidate(3);
    // 되돌리기는 시점마다 높이 값이 달라서 시점이 바뀌면 버린다
    stroke = [];
    undo = null;
    camPos.set(0, 0, 0);
    if (v === 'third' && document.pointerLockElement === el) document.exitPointerLock();
    camera.fov = fovFor(v, camera.aspect);
    camera.updateProjectionMatrix();
    opt.onView(v);
  };

  // 방 장면 3인칭: 집보다 짧은 거리(휠·집기로 1.4~3.2m), 그리고 카메라가 벽·천장 밖으로 나가지 않게 줄인다
  const roomIn = (() => {
    const fl = W.floors.filter((f) => f.level === 1);
    const ceil = ceilingSpecs.filter((c) => c.level === 1).map((c) => c.y);
    return {
      x1: Math.min(...fl.map((f) => f.x1), W.house.x2), x2: Math.max(...fl.map((f) => f.x2), W.house.x1),
      z1: Math.min(...fl.map((f) => f.z1), W.house.z2), z2: Math.max(...fl.map((f) => f.z2), W.house.z1),
      top: ceil.length ? Math.min(...ceil) : roomTop,
    };
  })();
  const roomCamera = (pt: number) => {
    let d = Math.min(ROOM_CAM_MAX, Math.max(ROOM_CAM_MIN, dist * ROOM_CAM_SCALE));
    const u = [Math.sin(yaw) * Math.cos(pt), Math.sin(pt), Math.cos(yaw) * Math.cos(pt)];
    const t = [target.x, target.y, target.z];
    const lo = [roomIn.x1 + ROOM_CAM_GAP, -Infinity, roomIn.z1 + ROOM_CAM_GAP];
    const hi = [roomIn.x2 - ROOM_CAM_GAP, body.y + roomIn.top - ROOM_CAM_GAP, roomIn.z2 - ROOM_CAM_GAP];
    for (let i = 0; i < 3; i++) {
      if (u[i] > 1e-6) d = Math.min(d, (hi[i] - t[i]) / u[i]);
      else if (u[i] < -1e-6) d = Math.min(d, (lo[i] - t[i]) / u[i]);
    }
    return Math.max(ROOM_CAM_NEAR, d);
  };

  // ───────── 입력
  // 걷기는 W A S D, 방향키는 둘러보기(←→ 돌기, ↑↓ 위아래 보기). 마우스로는 위아래 폭이 화면 높이에 묶여 방향키로 끝까지 본다
  const KEYMAP: Record<string, string> = {
    w: 'f', s: 'b', a: 'l', d: 'r', arrowleft: 'tl', arrowright: 'tr', arrowup: 'lu', arrowdown: 'ld', shift: 'run',
  };
  // 입력칸(input·textarea·contenteditable) 안에서 온 키, 한글 조합 중인 키는 받지 않는다(말하기 칸에서 WASD로 걷지 않게)
  const onKeyDown = (e: KeyboardEvent) => {
    // Ctrl은 뗄 때 앉기·일어서기(혼자 눌렀다 뗐을 때만). 누르는 동안 다른 키가 오면 그 키의 단축키다
    if (e.key === 'Control') {
      if (!e.repeat) ctrlAlone = !e.metaKey && !e.altKey && !e.shiftKey;
      return;
    }
    ctrlAlone = false;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!shouldHandleShortcut(e)) return;
    // 글자 키는 자판 자리로 읽는다(한글 자판이 켜져 있어도 W A S D·V·E가 먹게)
    const k = letterOf(e);
    // Space·Enter가 단추·링크 위에서 눌렸으면 그 단추 몫이다(마우스·손가락으로 누른 화면 단추는 화면 쪽이 바로 초점을 놓는다)
    if ((k === ' ' || k === 'enter') && (e.target as HTMLElement | null)?.closest?.('button, a, summary')) return;
    if (k === 'v' && !paused) {
      e.preventDefault();
      setView(view === 'first' ? 'third' : 'first');
      return;
    }
    // 스페이스바는 점프(반복 키 무시). 살피기는 E·Enter만
    if (k === ' ') {
      if (paused) return;
      e.preventDefault();
      if (!e.repeat) jump();
      return;
    }
    if (k === 'e' || k === 'enter') {
      if (paused) return;
      // 살필 곳이 있으면 살피기, 없고 반려동물이 곁에 있으면 이름표와 말풍선(키보드로도 부를 수 있게), 그것도 없으면 E만
      // 약한 가까움(휴대폰 3인칭의 대략 보는 액자)을 연다
      const act = pressNear(k, lastNear, () => Boolean(pet?.poke(body)));
      if (act) e.preventDefault();
      if (act === 'interact') {
        if (document.pointerLockElement === el) document.exitPointerLock();
        opt.onInteract();
      }
      return;
    }
    // 지도·도움말·살피기가 열려 있으면 걷기 키를 받지 않는다(패널을 방향키로 스크롤할 수 있게 기본 동작도 막지 않는다)
    if (paused) return;
    const a = KEYMAP[k];
    if (a) {
      e.preventDefault();
      keys.down(e, a);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Control') {
      const alone = ctrlAlone;
      ctrlAlone = false;
      if (alone && !paused && shouldHandleShortcut(e)) setSit(!sitting);
      return;
    }
    if (e.key === 'Meta') {
      // 맥은 Command를 누르고 있는 동안 다른 키를 뗀 신호를 주지 않는다. 그사이 뗀 키가 눌린 채 남아 혼자 계속 걷지 않게,
      // Command를 떼면 걷기 키를 모두 놓는다(아직 누르고 있던 키는 다시 눌러야 한다: 멈추는 쪽이 혼자 걷는 쪽보다 낫다).
      // Shift는 눌려 있는지 알 수 있으므로 그대로 둔다
      const run = e.shiftKey && keys.has('run');
      keys.clear();
      if (run) keys.down({ code: 'ShiftLeft' }, 'run');
      return;
    }
    keys.up(e);
    // 양쪽 Shift를 함께 눌렀다 떼면 운영체제가 뗀 신호를 하나만 준다: Shift가 모두 떨어졌으면 달리기를 놓는다
    if (e.key === 'Shift' && !e.shiftKey) keys.drop('run');
  };
  // 창이 초점을 잃으면(전화·알림·앱 전환) 누르던 것을 모두 놓는다: 손을 뗀 신호를 못 받아도 계속 걷지 않게
  const onBlur = () => {
    keys.clear();
    ctrlAlone = false;
    lookStick.x = lookStick.y = 0;
    stick.x = stick.y = 0;
    pointers.clear();
  };
  // 입력칸으로 초점이 옮겨 가면 누르고 있던 걷기 키를 놓는다(keyup이 입력칸으로 가도 계속 걷지 않게)
  const onFocusIn = (e: FocusEvent) => { if (isEditingTarget(e.target)) keys.clear(); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focusin', onFocusIn);
  const jump = () => {
    if (paused || hop.air) return;
    // 앉아 있으면 뛰지 않고 일어선다
    if (sitting) {
      setSit(false);
      return;
    }
    hop = hopStart(hop);
    jumps = (jumps + 1) % 256;
  };
  /** 앉기·일어서기. 공중이거나 멈춘 화면이면 앉지 않는다. 앉으면 자동 걷기·도착 뒤 돌기를 그만둔다 */
  const setSit = (on: boolean) => {
    if (on === sitting || (on && (paused || hop.air))) return;
    sitting = on;
    if (on) {
      if (path) endPath('cancel');
      turnTo = null;
    }
    invalidate(2);
  };

  const clampPitch = () => {
    pitch1 = Math.min(1.3, Math.max(-1.3, pitch1));
    pitch3 = Math.min(1.25, Math.max(0.12, pitch3));
  };
  /** 화면 이동량(px)으로 둘러본다. 아래로 끌면 아래를 본다(3인칭은 카메라가 올라가 내려다본다). */
  const look = (dx: number, dy: number, ky = 0.005, kp = 0.004) => {
    yaw -= dx * ky * sens;
    if (view === 'first') pitch1 -= dy * kp * sens;
    else pitch3 += dy * kp * sens;
    clampPitch();
  };
  /** 지난 마우스 움직임의 때(이벤트 시각, ms): 그 사이 시간으로 손이 낼 수 없는 거리를 가린다 */
  let mouseAt = -Infinity;
  /** 포인터 잠금이 막 걸렸다: 잠금 뒤 첫 움직임은 버린다(포인터를 가운데로 옮긴 몫이 한꺼번에 올 수 있다) */
  let lockFresh = false;
  /**
   * 마우스로 둘러본다: 포인터가 움직인 만큼 화면이 따라 움직이게 가로·세로 같은 배율(세로 시야각과 화면 높이에서), 그 위에 감도.
   * 빠른 손짓은 자르지 않고 그대로 받고, 말이 안 되는 값만 통째로 버린다(mouse.ts)
   */
  const mouseLook = (dx: number, dy: number, at: number) => {
    const gap = at - mouseAt;
    mouseAt = at;
    const d = mouseStep(dx || 0, dy || 0, gap);
    if (!d) return;
    const g = mouseGain(camera.fov, viewH);
    look(d[0], d[1], g, g);
  };
  const pitchNow = () => (view === 'first' ? pitch1 : pitch3);
  // 움직임이 이어지는 중인가: 프레임이 여럿(3개 넘게) 지나도록 움직임이 없고 STROKE_GAP도 지났으면 쉰 것이다.
  // 화면이 느리거나 한 프레임이 길게 걸려도(움직이는 동안에는 프레임마다 움직임이 온다) 한 손짓을 둘로 자르지 않는다.
  const strokeLive = (now: number) => {
    const l = stroke[stroke.length - 1];
    return Boolean(l) && !(frames - l.f > 3 && now - l.t > STROKE_GAP);
  };
  /** 버튼 없이 둘러보고, 실제로 돌아간 양(높이 한계 반영)을 지금 움직임 묶음에 적는다 */
  const hoverLook = (dx: number, dy: number, at: number) => {
    const y0 = yaw, p0 = pitchNow();
    mouseLook(dx, dy, at);
    const now = performance.now();
    if (!strokeLive(now)) stroke = [];
    stroke.push({ t: now, f: frames, yaw: yaw - y0, pitch: pitchNow() - p0 });
    if (stroke.length > 300) stroke.splice(0, stroke.length - 300);
  };
  /** 매 프레임: 되돌리기를 UNDO_MS 동안 부드럽게(줄인 움직임이면 한 번에) 나눠 돌린다 */
  const applyUndo = (now: number) => {
    if (!undo) return;
    const f = opt.reducedMotion ? 1 : Math.min(1, Math.max(0, (now - undo.t0) / UNDO_MS));
    const k = f * f * (3 - 2 * f);
    const part = k - undo.done;
    yaw += undo.yaw * part;
    if (view === 'first') pitch1 += undo.pitch * part;
    else pitch3 += undo.pitch * part;
    clampPitch();
    undo.done = k;
    if (f >= 1) undo = null;
  };
  /** 단추·카드로 손을 뻗는 동안 돌아간 시선을 되돌린다. 쉬었다가 뻗었으면(묶음이 끊겼으면) 그대로 둔다. */
  const undoStroke = () => {
    const now = performance.now();
    if (!strokeLive(now)) { stroke = []; return; }
    let dyaw = 0, dp = 0;
    // 되돌리는 길이: 1.2초와 30프레임 중 긴 쪽(느린 화면에서는 같은 손짓이 더 오래 걸려 온다)
    for (const s of stroke) if (now - s.t <= STROKE_MAX || frames - s.f <= 30) { dyaw += s.yaw; dp += s.pitch; }
    stroke = [];
    if (Math.abs(dyaw) < 1e-4 && Math.abs(dp) < 1e-4) return;
    undo = { t0: now, yaw: -dyaw, pitch: -dp, done: 0 };
    if (opt.reducedMotion) applyUndo(now);
  };
  // 단추·카드 사각형은 자주 바뀌지 않아 잠깐 모아 둔다(움직일 때마다 화면 배치를 읽지 않게)
  type Box2 = { left: number; top: number; right: number; bottom: number };
  let uiCache: { t: number; rects: ReadonlyArray<Box2>; box: Box2 | null } = { t: -Infinity, rects: [], box: null };
  /** 마우스 자리: 단추·카드 둘레('ui'), 화면 가장자리('edge'), 둘러보는 자리(null) */
  const zoneOf = (x: number, y: number): 'ui' | 'edge' | null => {
    const now = performance.now();
    if (now - uiCache.t > 200) {
      let rects: ReadonlyArray<Box2> = [];
      try { rects = opt.uiRects?.() ?? []; } catch { /* 화면 쪽 오류는 무시 */ }
      uiCache = { t: now, rects, box: el.getBoundingClientRect() };
    }
    for (const r of uiCache.rects) {
      if (r.right <= r.left || r.bottom <= r.top) continue;
      if (x > r.left - UI_MARGIN && x < r.right + UI_MARGIN && y > r.top - UI_MARGIN && y < r.bottom + UI_MARGIN) return 'ui';
    }
    const b = uiCache.box;
    if (b && (x < b.left + EDGE_MARGIN || x > b.right - EDGE_MARGIN || y < b.top + EDGE_MARGIN || y > b.bottom - EDGE_MARGIN)) return 'edge';
    return null;
  };
  /** 단추 둘레에 처음 들어설 때 한 번 되돌린다 */
  const enterUi = () => {
    if (nearUi) return;
    nearUi = true;
    undoStroke();
  };
  const markLook = (on: boolean) => {
    const v = on ? 'on' : 'off';
    if (el.dataset.look !== v) el.dataset.look = v;
  };
  // 버튼 없이 캔버스 위를 지나는 마우스: movementX가 없거나 0으로만 오는 브라우저는 좌표 차이로 대신한다.
  // 캔버스에 막 들어온 첫 움직임은 세지 않는다(단추 위나 창 밖에서 움직인 몫이 한꺼번에 오는 것을 막는다).
  const hoverDelta = (e: PointerEvent): [number, number] => {
    const prev = hover;
    hover = { x: e.clientX, y: e.clientY };
    if (!prev) return [0, 0];
    if (e.movementX || e.movementY) return [e.movementX || 0, e.movementY || 0];
    return [e.clientX - prev.x, e.clientY - prev.y];
  };
  const onLeave = (e: PointerEvent) => {
    hover = null;
    if (e.pointerType !== 'mouse' || coarse || pointers.has(e.pointerId)) return;
    // 빠르게 뻗으면 둘레에서 움직임이 안 잡히고 바로 단추 위로 넘어간다. 떠난 자리가 단추 둘레면 되돌린다.
    if (zoneOf(e.clientX, e.clientY) === 'ui') enterUi();
  };
  const pointers = new Map<number, { x: number; y: number; t: number; moved: number }>();
  let pinch = 0;
  const onDown = (e: PointerEvent) => {
    // Ctrl을 누른 채 누르기(맥의 오른쪽 누르기)는 앉기가 아니다
    ctrlAlone = false;
    // 포인터 잡기는 덤이다. 브라우저(인앱 포함)가 거부해도 둘러보기는 계속된다.
    try { el.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (document.pointerLockElement === el) return; // 잠금 중에는 onLockedMove가 센다
    // 데스크탑 마우스: 누르지 않아도 바로 둘러본다. 누른 채 끌어도 같은 이동을 한 번만 센다.
    if (e.pointerType === 'mouse' && !coarse) {
      const [dx, dy] = hoverDelta(e);
      const held = pointers.get(e.pointerId);
      if (held) {
        // 누른 채 끄는 것은 일부러 둘러보는 것이라 어디서나 돈다
        pointers.set(e.pointerId, { ...held, x: e.clientX, y: e.clientY, moved: held.moved + Math.abs(dx) + Math.abs(dy) });
        if (held.moved + Math.abs(dx) + Math.abs(dy) > 6) dragged = true;
        if (!paused) mouseLook(dx, dy, e.timeStamp);
        return;
      }
      // 단추·카드 둘레와 화면 가장자리에서는 돌지 않는다. 단추 둘레에 들어서면 뻗는 동안 돈 만큼 되돌린다.
      const zone = zoneOf(e.clientX, e.clientY);
      markLook(!zone);
      if (zone === 'ui') { enterUi(); return; }
      nearUi = false;
      if (zone || paused) return;
      hoverLook(dx, dy, e.timeStamp);
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      const mine = { ...p, x: e.clientX, y: e.clientY, moved: p.moved + Math.abs(dx) + Math.abs(dy) };
      pointers.set(e.pointerId, mine);
      const [a, b] = [...pointers.values()];
      const other = a === mine ? b : a;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      // 다른 손가락이 얹혀만 있으면(스틱을 빗나간 엄지, 화면 가장자리에 닿은 손) 움직이는 손가락으로 둘러본다.
      // 두 손가락이 함께 움직일 때만 집기(3인칭 거리)로 본다. 1인칭은 집기가 없으니 늘 둘러본다.
      if (view === 'first' || other.moved < 8) {
        look(dx, dy);
        if (mine.moved > 6) dragged = true;
      } else dist = Math.min(11, Math.max(3, dist * (pinch / Math.max(1, d))));
      pinch = d;
      return;
    }
    look(e.clientX - p.x, e.clientY - p.y);
    const movedNow = p.moved + Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
    if (movedNow > 6) dragged = true;
    pointers.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY, moved: movedNow });
  };
  const tapRay = new THREE.Raycaster();
  const tapAt = new THREE.Vector2();
  /** 누른 자리(시선 잠금이면 화면 가운데)로 반려동물을 찾는다. 이름표와 말풍선을 띄웠으면 true */
  const tapPet = (e: PointerEvent): boolean => {
    if (!pet) return false;
    if (document.pointerLockElement === el) tapAt.set(0, 0);
    else {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      tapAt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    }
    tapRay.setFromCamera(tapAt, camera);
    return pet.tap(tapRay.ray, body, wallBefore) === 'meow';
  };
  /** 보이는 벽 조각인가(묶음째 숨겼거나 비쳐 보이게 한 벽은 가리지 않는다) */
  const walling = (m: THREE.Mesh): boolean => {
    if (m.material !== m.userData.base) return false;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  /** 누른 광선에서 dist(m)보다 앞에 보이는 벽·지붕판이 있는가. 낮춘 벽은 낮춘 높이로, 비쳐 보이게 한 벽은 가리지 않는 것으로 본다 */
  const wallBefore = (dist: number): boolean => {
    tapRay.far = dist;
    const hits = tapRay.intersectObjects(occluders, false);
    tapRay.far = Infinity;
    return hits.some((h) => h.distance < dist - 0.05 && walling(h.object as THREE.Mesh));
  };
  // 반려동물이 벽 너머·다른 층 바닥 너머에 있는가(보이지 않으면 다시 그리기를 청하지 않는다). 벽은 그린 벽 조각 그대로(창·문 자리는
  // 비어 있어 그 너머는 보인다), 층 사이는 2층 바닥판: 두 점이 2층 바닥 높이의 양쪽이고 그 높이를 지나는 자리가 2층 바닥 안이면
  // 가렸다(계단 구멍·집 밖은 바닥이 없다). 인형의 집 보기로 위층을 걷었으면 바닥판도 없다
  const floor2 = W.floors.filter((f) => f.level === 2);
  const occRay = new THREE.Raycaster();
  const occDir = new THREE.Vector3();
  const floorBetween = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    if (!level2.visible) return false;
    const y = W.floor2;
    if ((a.y - y) * (b.y - y) >= 0) return false;
    const t = (y - a.y) / (b.y - a.y);
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    return floor2.some((f) => x > f.x1 && x < f.x2 && z > f.z1 && z < f.z2);
  };
  const petHidden = (from: THREE.Vector3, to: readonly THREE.Vector3[]): boolean => {
    for (const p of to) {
      if (floorBetween(from, p)) continue;
      occDir.subVectors(p, from);
      const d = occDir.length();
      if (d < 0.05) return false;
      occRay.set(from, occDir.multiplyScalar(1 / d));
      occRay.far = d - 0.05;
      if (!occRay.intersectObjects(occluders, false).some((h) => walling(h.object as THREE.Mesh))) return false;
    }
    return true;
  };
  const onUp = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    // 끌지 않고 짧게 누른 것이 반려동물에 닿았고 몸이 가까우면 이름표와 말풍선(시선 잠금은 하지 않는다)
    if (p && e.type === 'pointerup' && pointers.size === 0 && !paused && p.moved < 8 && performance.now() - p.t < 450 && tapPet(e)) return;
    // 마우스로 화면을 한 번 누르면(끌지 않고) 시선 잠금(1인칭·3인칭): 화면 끝 없이 마우스만 움직여 둘러본다. Esc로 풀린다.
    if (p && e.pointerType === 'mouse' && !coarse && p.moved < 4 && performance.now() - p.t < 350 && !paused) {
      // 요즘 브라우저는 Promise를 돌려주고, 거절(문서가 안 보이는 중 등)을 처리하지 않으면 페이지 오류가 된다
      try {
        const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => { /* 잠금 거절: 끝없이 둘러보기만 빠지고 마우스 둘러보기는 그대로 */ });
      } catch { /* 지원하지 않는 브라우저 */ }
    }
  };
  const onLockedMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== el || paused) return;
    if (lockFresh) {
      lockFresh = false;
      mouseAt = e.timeStamp;
      return;
    }
    mouseLook(e.movementX, e.movementY, e.timeStamp);
  };
  const onLockChange = () => {
    lockFresh = document.pointerLockElement === el;
    opt.onPointerLock?.(lockFresh);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Ctrl과 함께 굴리기(두 손가락 오므리기)는 앉기가 아니다
    ctrlAlone = false;
    if (view === 'third') dist = Math.min(11, Math.max(3, dist * (1 + Math.sign(e.deltaY) * 0.08)));
    // 1인칭: 휠·트랙패드로 위아래를 본다(아래로 굴리면 아래). 트랙패드 집기(ctrlKey)는 받지 않는다
    else if (!paused && !e.ctrlKey) {
      pitch1 -= wheelPx(e.deltaY, e.deltaMode, viewH) * WHEEL_PITCH * sens;
      clampPitch();
    }
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('mousemove', onLockedMove);
  document.addEventListener('pointerlockchange', onLockChange);

  /** 캔버스 크기(CSS px). 프레임마다 화면 배치를 읽지 않게 resize에서 적어 둔다 */
  let viewW = 1, viewH = 1;
  /** 느린 기기에서 그리는 화소를 줄이는 배율(1 → 0.85 → 0.7 → 0.6, 내려가기만 한다) */
  let scale = 1;
  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    viewW = w;
    viewH = h;
    // 그리는 화소 수에 상한을 둔다(큰 모니터·레티나에서 GPU 메모리가 쌓여 브라우저가 3D를 끄는 일을 줄인다)
    const cap = opt.coarse ? 1.5 : 2;
    const budget = opt.coarse ? 2.2e6 : 4.2e6;
    renderer.setPixelRatio(Math.max(0.75, scale * Math.max(1, Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(budget / (w * h))))));
    renderer.setSize(w, h, false);
    el.style.width = '100%';
    el.style.height = '100%';
    camera.aspect = w / h;
    camera.fov = fovFor(view, camera.aspect);
    camera.updateProjectionMatrix();
    invalidate(2);
    // 쉬는 중에 화면 크기가 바뀌면(휴대폰을 돌림) 캔버스가 비므로 한 장만 다시 그린다
    if (frozen && !lost) renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ───────── 살피기 자리: 같은 구역에 있을 때만. 문·포털·나가는 문은 벽에 붙어 있어 구역 예외
  const hotspotZone = new Map(W.hotspots.map((h) => [h.id, zoneAt(h.level, h.x, h.z, W)] as const));
  const nearHotspot = (lv: Level, x: number, z: number): Hotspot | null => {
    const here = zoneAt(lv, x, z, W);
    let best: Hotspot | null = null;
    let bestD = Infinity;
    for (const h of W.hotspots) {
      if (h.level !== lv) continue;
      if (!ZONE_FREE.has(h.kind) && hotspotZone.get(h.id) !== here) continue;
      const d = Math.hypot(h.x - x, h.z - z);
      if (d <= h.r && d < bestD) { best = h; bestD = d; }
    }
    return best;
  };

  // ───────── 자동 걷기 끝내기: 도착·막힘·손 움직임(콜백), 코드로 멈추기·바로 옮기기(콜백 없음)
  const endPath = (why: 'arrive' | 'cancel' | 'stuck' | 'quiet') => {
    const p = path;
    path = null;
    if (!p || why === 'quiet') return;
    // 막혀서 멈춘 것은 손으로 멈춘 것과 다르다: 화면이 길을 다시 찾을 수 있게 따로 알린다(받는 쪽이 없으면 그만두기로)
    const cb = why === 'arrive' ? p.cb.onArrive : why === 'stuck' ? (p.cb.onStuck ?? p.cb.onCancel) : p.cb.onCancel;
    try { cb?.(); } catch { /* 화면 쪽 오류가 그리기를 멈추지 않게 */ }
  };

  // ───────── 바로 옮기기: 서 있을 수 있는 자리인지(막힘·허공·계단 밑을 가린다)
  const onFloor = (lv: Level, x: number, z: number) =>
    W.floors.length === 0 || W.floors.some((f) => f.level === lv && x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2);
  const standY = (lv: Level, x: number, z: number): number | null => {
    let onRamp = false;
    let best: number | null = null;
    const base = lv === 2 ? W.floor2 : 0;
    for (const r of W.physics.ramps) {
      if (!inRamp(r, x, z)) continue;
      onRamp = true;
      const y = rampY(r, x, z);
      if (levelOf(W.physics, y) === lv && (best === null || Math.abs(y - base) < Math.abs(best - base))) best = y;
    }
    if (best !== null) return best;
    if (onRamp || !onFloor(lv, x, z)) return null;
    return base;
  };
  const canStand = (lv: Level, x: number, z: number) => {
    const y = standY(lv, x, z);
    return y !== null && !blocked(W.physics, levelOf(W.physics, y), x, z);
  };
  const teleport = (x: number, z: number, level: Level, faceYaw?: number): boolean => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const lv: Level = level === 2 ? 2 : 1;
    const spot = nearestOpen((px, pz) => canStand(lv, px, pz), x, z, 1.5, 0.1);
    if (!spot) return false;
    const y = standY(lv, spot.x, spot.z) ?? (lv === 2 ? W.floor2 : 0);
    body = { x: spot.x, z: spot.z, y, level: levelOf(W.physics, y) };
    ledge = 0;
    invalidate(3);
    if (faceYaw !== undefined && Number.isFinite(faceYaw)) yaw = faceYaw;
    face = yaw + Math.PI;
    turnTo = null;
    hop = GROUNDED;
    endPath('quiet');
    camPos.set(0, 0, 0);
    stroke = [];
    undo = null;
    return true;
  };

  const walkPath = (points: Array<{ x: number; z: number; level: Level; y?: number }>, cb?: PathCallbacks, faceYaw?: number) => {
    const pts = (Array.isArray(points) ? points : []).map((p) => ({
      x: Number(p.x), z: Number(p.z), level: (p.level === 2 ? 2 : 1) as Level, y: Number.isFinite(p.y) ? Number(p.y) : undefined,
    }));
    path = { run: startPath(pts), cb: cb ?? {}, face: faceYaw !== undefined && Number.isFinite(faceYaw) ? faceYaw : undefined };
    turnTo = null;
  };

  // ───────── 다른 사람: 목록마다 캐릭터 하나. 받은 자리로 0.12초 시정수로 따라가고, 같은 층 사람만 보인다
  /** jumps는 마지막으로 받은 점프 수(아직 못 받았으면 null), hop은 이 화면이 셈하는 그 사람의 점프 */
  type Other = { av: Avatar; p: RemotePlayer; key: string; x: number; y: number; z: number; face: number; speed: number; bubbleKey: string; bubbleUntil: number; named: boolean; model: boolean; jumps: number | null; hop: Hop };
  const others = new Map<string, Other>();
  // 사진 캐릭터를 3D 모형으로 보일 다른 사람: 보이는 사진 캐릭터 가운데 가까운 순서로 몇 명, 그리고 이 거리(m) 안에서만.
  // 나머지(멀거나 순위 밖)는 방향 그림 판으로 선다. 순위 경계에서 들락거리지 않게 한번 모형이 된 사람은 기준 거리의 MODEL_KEEP배까지 남긴다
  const MODELS_NEAR = opt.coarse ? 6 : 12;
  const MODEL_FAR = opt.coarse ? 12 : 20;
  const MODEL_KEEP = 1.2;
  let modelCut = Infinity;
  const modelDists: number[] = [];
  let othersDrawn = 0;
  /** 지금 보이는 다른 사람 가운데 사진 캐릭터(카메라를 따라 도는 판)가 있는가 */
  let othersPhoto = false;
  /** 발밑 그림자 묶음을 GPU에 다시 올려야 하는가(사람이 바뀌었는데 수와 움직임은 그대로일 때) */
  let blobsDirty = false;
  // 다른 사람들의 발밑 그림자는 한 번에 그린다(사람마다 메시를 두면 50명에 그리기 50번)
  const otherBlobs = new THREE.InstancedMesh(blobGeo, blobMat, OTHER_BLOBS);
  otherBlobs.name = 'other-blobs';
  otherBlobs.count = 0;
  otherBlobs.frustumCulled = false;
  scene.add(otherBlobs);
  const blobAt = new THREE.Matrix4();
  // 캐릭터를 아직 만들지 않은 사람들. 한꺼번에 들어와도(처음 이어졌을 때, 방을 드나들 때) 프레임마다 몇 명씩만 만든다:
  // 겉모습이 서로 다른 50명을 한 프레임에 만들면 휴대폰에서 화면이 0.2~0.4초 멈춘다
  const waiting = new Map<string, RemotePlayer>();
  const SPAWN_PER_FRAME = opt.coarse ? 2 : 4;
  const NAME_MAX = opt.coarse ? NAMES_COARSE : NAMES_FINE;
  let nameCut = Infinity;
  const nameDists: number[] = [];
  const finite = (p: RemotePlayer) => [p.x, p.y, p.z, p.yaw].every(Number.isFinite);
  const dropOther = (o: Other) => { o.av.dispose(); };
  /** 한 사람을 장면에 반영한다(없으면 캐릭터를 만든다). 이름·말풍선까지 */
  const admit = (p: RemotePlayer) => {
    let o = others.get(p.id);
    // 겉모습(꾸민 인형·사진 캐릭터, 없으면 옛 색)이 바뀌면 캐릭터를 새로 만든다(자리는 이어서, 말풍선은 아래에서 다시 붙는다)
    const lk = lookKey(p.look, p.color);
    const was = o && o.key !== lk ? o : undefined;
    if (was) { dropOther(was); others.delete(p.id); o = undefined; }
    if (!o) {
      // 손가락 기기에서는 다른 사람도 해 그림자를 드리우지 않는다(발밑 동그란 그림자만)
      const av = createAvatar({ look: p.look ?? null, color: p.color, name: shownName(lang, p.name || '손님'), reducedMotion: opt.reducedMotion, shadow: !coarse, cast: !opt.coarse, photoSize, sun: sunAt, onChange: () => invalidate(3), prepare });
      scene.add(av.group);
      blobsDirty = true;
      // 새로 온 사람은 다시 그린다(사진 캐릭터의 그림이 늦게 온 때는 캐릭터가 onChange로 알린다)
      invalidate(2);
      o = {
        av, p, key: lk, x: was?.x ?? p.x, y: was?.y ?? p.y, z: was?.z ?? p.z, face: was?.face ?? p.yaw + Math.PI, speed: 0, bubbleKey: '', bubbleUntil: 0, named: true, model: false,
        // 처음 보는 사람의 점프 수는 그대로 받아 둔다(들어오자마자 뛰지 않게)
        jumps: was ? was.jumps : (p.jumps ?? null), hop: was?.hop ?? GROUNDED,
      };
      others.set(p.id, o);
    }
    o.p = p;
    o.av.setName(shownName(lang, p.name || '손님'));
    // 칭호는 겉모습에 실려 오지만 캐릭터를 새로 만들 일은 아니다(이름표만 다시 그린다)
    if (o.av.setTitle(p.look?.title ?? null) && dirty < 2) dirty = 2;
    const key = p.bubble && p.bubbleAt ? `${p.bubbleAt}:${p.bubble}` : '';
    if (key && key !== o.bubbleKey) {
      o.bubbleKey = key;
      // 받은 때가 앞서 있어도(시계 차) 지금부터 6초를 넘지 않게
      const left = Math.min(BUBBLE_MS, BUBBLE_MS - (Date.now() - (p.bubbleAt ?? 0)));
      if (left > 0 && !talkHidden) { o.av.setBubble(p.bubble ?? null); o.bubbleUntil = performance.now() + left; invalidate(2); }
    }
  };
  const setOthers = (players: RemotePlayer[]) => {
    const seen = new Set<string>();
    let made = 0;
    for (const p of Array.isArray(players) ? players : []) {
      if (!p || typeof p.id !== 'string' || !finite(p) || seen.has(p.id)) continue;
      seen.add(p.id);
      // 이미 있는 사람은 바로 반영하고, 새 사람은 이번에 몇 명만 만들고 나머지는 다음 프레임들로 미룬다
      if (others.has(p.id) || (!waiting.has(p.id) && made++ < SPAWN_PER_FRAME)) admit(p);
      else waiting.set(p.id, p);
    }
    for (const [id, o] of others) if (!seen.has(id)) { dropOther(o); others.delete(id); blobsDirty = true; invalidate(2); }
    for (const id of waiting.keys()) if (!seen.has(id)) waiting.delete(id);
  };
  /**
   * 다른 사람들을 받은 자리로 옮긴다. 보이는 사람 가운데 움직이거나 모습이 바뀐 사람이 있으면 true(다시 그려야 한다).
   * extra는 사람들 다음 칸에 함께 그릴 발밑 그림자(반려동물), extraMoved는 그 자리가 바뀌었는지(그림자 묶음을 다시 올린다)
   */
  const updateOthers = (dt: number, unitsPerPx: number, extra: THREE.Matrix4 | null = null, extraMoved = false): boolean => {
    const k = follow(dt, OTHER_TAU);
    const now = performance.now();
    // 사람이 많이 보이면 가까운 몇 명만 이름표를 보인다(휴대폰 화면을 이름표 수십 개가 덮지 않게).
    // 기준 거리(nameCut)는 앞 프레임에 보인 사람들의 거리로 정한다
    const cut = nameCut;
    othersDrawn = 0;
    othersPhoto = false;
    let changed = false;
    // 기다리던 사람을 몇 명씩 만든다
    if (waiting.size > 0) {
      let made = 0;
      for (const [id, p] of waiting) {
        waiting.delete(id);
        admit(p);
        if (++made >= SPAWN_PER_FRAME) break;
      }
      changed = true;
    }
    for (const o of others.values()) {
      const p = o.p;
      const px = o.x, pz = o.z;
      if (Math.hypot(p.x - o.x, p.z - o.z) > OTHER_SNAP || Math.abs(p.y - o.y) > 2.5) { o.x = p.x; o.y = p.y; o.z = p.z; }
      else { o.x += (p.x - o.x) * k; o.y += (p.y - o.y) * k; o.z += (p.z - o.z) * k; }
      const mv = Math.hypot(o.x - px, o.z - pz);
      o.speed += ((dt > 0 ? mv / dt : 0) - o.speed) * follow(dt, 0.15);
      // 걷는 중이면 움직이는 쪽을, 서 있으면 그 사람이 보는 쪽을 본다
      const want = mv > 0.002 ? Math.atan2(o.x - px, o.z - pz) : p.yaw + Math.PI;
      const turn = angleDiff(o.face, want);
      o.face += turn * follow(dt, 0.1);
      // 점프: 받은 점프 수가 바뀌면 그 자리에서 한 번 뛴다(높이는 내 점프와 같은 계산으로 이 화면이 셈한다).
      // 옛 화면·옛 서버라 점프 수가 없으면 아무것도 하지 않는다
      if (typeof p.jumps === 'number') {
        if (o.jumps === null) o.jumps = p.jumps;
        else if (p.jumps !== o.jumps) {
          o.jumps = p.jumps;
          if (!o.hop.air) o.hop = hopStart(o.hop);
        }
      }
      const hs = hopStep(o.hop, dt);
      o.hop = hs.hop;
      if (o.bubbleUntil && now > o.bubbleUntil) { o.bubbleUntil = 0; o.av.setBubble(null); changed = true; }
      const away = Math.hypot(o.x - camera.position.x, o.z - camera.position.z);
      const show = observer !== null || (p.level === body.level && away < OTHER_FAR);
      if (o.av.group.visible !== show) changed = true;
      o.av.group.visible = show;
      // 사진 캐릭터: 가까운 몇 명만 3D 모형으로(기준 거리는 앞 프레임에 보인 사진 캐릭터들의 거리로 정한다). 안 보이면 모형을 놓는다
      const near3d = show && p.look?.kind === 'photo' && away <= MODEL_FAR && away <= (o.model ? modelCut * MODEL_KEEP : modelCut);
      if (near3d !== o.model) {
        o.model = near3d;
        o.av.setModel(near3d);
      }
      if (!show) continue;
      if (p.look?.kind === 'photo') modelDists.push(away);
      if (othersDrawn < OTHER_BLOBS) otherBlobs.setMatrixAt(othersDrawn, blobAt.makeTranslation(o.x, o.y + 0.02, o.z));
      othersDrawn++;
      if (o.av.form() === 'card') othersPhoto = true;
      // 자리는 그대로여도 걷는 몸짓이 이어지는 동안(벽에 막혀 제자리걸음, 멈춘 뒤 가라앉는 걸음)은 다시 그린다
      if (mv > 5e-4 || Math.abs(turn) > 2e-3 || o.speed > 0.02 || Math.abs(p.y - o.y) > 1e-3 || o.hop.air || hs.landed || !o.av.resting()) changed = true;
      o.av.group.position.set(o.x, o.y + o.hop.h, o.z);
      o.av.group.rotation.y = o.face;
      nameDists.push(away);
      o.named = o.bubbleUntil > 0 || away <= (o.named ? cut * NAME_KEEP : cut);
      if (o.av.setNameShown(o.named)) changed = true;
      o.av.setPixelScale(unitsPerPx);
      const spd = p.moving ? Math.min(RUN, Math.max(0.8, o.speed)) : o.speed > 0.3 ? o.speed : 0;
      o.av.update(dt, { speed: spd, running: spd > 2.6, airborne: o.hop.air, landing: hs.landed, vy: o.hop.v, sitting: p.sitting === true });
    }
    if (nameDists.length > NAME_MAX) {
      nameDists.sort((x, y) => x - y);
      nameCut = nameDists[NAME_MAX - 1];
    } else nameCut = Infinity;
    nameDists.length = 0;
    if (modelDists.length > MODELS_NEAR) {
      modelDists.sort((x, y) => x - y);
      modelCut = modelDists[MODELS_NEAR - 1];
    } else modelCut = Infinity;
    modelDists.length = 0;
    let blobs = Math.min(othersDrawn, OTHER_BLOBS);
    if (extra && blobs < OTHER_BLOBS) otherBlobs.setMatrixAt(blobs++, extra);
    if (changed || blobsDirty || extraMoved || blobs !== otherBlobs.count) {
      blobsDirty = false;
      otherBlobs.count = blobs;
      otherBlobs.instanceMatrix.needsUpdate = true;
    }
    return changed;
  };

  // ───────── 매 프레임
  let raf = 0;
  let last = performance.now();
  /** 셰이더 준비가 끝나 프레임을 돌려도 되는가 */
  let warm = false;
  let firstDrawn: (() => void) | null = null;
  const ready = new Promise<void>((done) => { firstDrawn = done; });

  // ───────── 반려동물: 집 세계에서만(방 장면·관전에는 없다). 모형과 이름은 화면이 서버에서 받아 준다
  /** 함께 걷기에 이어져 있는가(setNetLive). 이어져 있을 때만 반려동물이 나를 같은 집에 있는 사람으로 센다 */
  let netLive = false;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  /**
   * 반려동물이 칸을 정할 때 보는 사람들: 같은 공간의 다른 사람(받은 자리 그대로, 아직 캐릭터를 만들지 않은 사람도)과,
   * 이어져 있으면 나(남에게 보내는 자리처럼 1cm로 반올림해 남의 화면과 같은 값을 쓴다)
   */
  const petPeople = () => {
    const list: Array<{ n: string; x: number; z: number; level: Level }> = [];
    for (const o of others.values()) list.push({ n: o.p.name, x: o.p.x, z: o.p.z, level: o.p.level });
    for (const p of waiting.values()) list.push({ n: p.name, x: p.x, z: p.z, level: p.level });
    const mine = netLive && !opt.observe ? { x: r2(body.x), z: r2(body.z), level: body.level } : null;
    return { me: mine, others: list };
  };
  /** 받은 반려동물 설정 그대로(화면 말이 바뀌면 이름표만 다시 고른다) */
  let petSpec: PetSpec | null = null;
  const setPet = (spec: PetSpec | null | undefined) => {
    petSpec = spec ?? null;
    // 영어 화면은 영어 이름표(설정에 있을 때만, 없으면 이름 그대로)
    const named = spec && lang === 'en' && spec.nameEn ? { ...spec, name: spec.nameEn } : spec;
    const want = named && !isRoom && !opt.observe ? named : null;
    if (want && pet?.configure(want)) return;
    pet?.dispose();
    pet = null;
    if (want) {
      pet = createPetView({
        scene, world: opt.world, spec: want, coarse: opt.coarse, reducedMotion: opt.reducedMotion, ready, prepare,
        // 모형이 왔을 때, 이름표가 뜨거나 질 때: 해 그림자는 그대로라 몇 장만 다시 그린다
        onChange: () => { if (dirty < 2) dirty = 2; },
      });
    }
    if (dirty < 2) dirty = 2;
  };
  setPet(opt.pet);
  // ───────── 화면 말이 바뀌면: 캔버스 이름, 문패, 이름 없는 사람의 이름표, 반려동물 이름표, 빈 액자 판, 표지판을 지금 말로 다시 그린다.
  // 반려동물의 말풍선은 다음에 고르는 말부터 바뀐다(pet-talk). 사람이 지은 이름·말은 그대로
  const offLang = onWalkLang(() => {
    const next = walkLang();
    if (next === lang) return;
    lang = next;
    labelCanvas();
    plates.forEach(drawPlate);
    for (const o of others.values()) o.av.setName(shownName(lang, o.p.name || '손님'));
    if (opt.name !== undefined) me.setName(shownName(lang, opt.name));
    setPet(petSpec);
    gallery?.relabel();
    fm.kit.relabel();
    invalidate(2);
  });
  let running = false;
  // 느린 기기 살피기: 프레임 간격을 2초씩 모아 보고, 계속 느리면(평균 40ms 넘게 = 25fps 아래) 그리는 화소를 한 단계 줄인다.
  // 저전력 모드처럼 화면을 30fps로 묶은 기기(간격 33ms)는 느린 것이 아니다: 화소를 줄여도 빨라지지 않고 흐려지기만 한다.
  // 올리지는 않는다(오르내리면 화면이 출렁인다). 처음 3초와 긴 멈춤(탭 전환·불러오기)은 세지 않는다.
  const SCALES = [1, 0.85, 0.7, 0.6];
  let scaleStep = 0;
  let slowSum = 0, slowN = 0, slowRounds = 0;
  let born = performance.now();
  const watchPace = (now: number, gap: number) => {
    if (now - born < 3000 || gap > 250 || scaleStep >= SCALES.length - 1) return;
    slowSum += gap;
    slowN++;
    if (slowSum < 2000) return;
    const avg = slowSum / slowN;
    slowSum = slowN = 0;
    slowRounds = avg > SLOW_GAP_MS ? slowRounds + 1 : 0;
    if (slowRounds < 2) return;
    slowRounds = 0;
    scale = SCALES[++scaleStep];
    resize();
  };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    // 관전(컨트롤 룸)은 내 몸 없이 화면들을 나눠 그린다(아래 관전 절)
    if (observer) return observer.frame(now);
    frames++;
    watchPace(now, now - last);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    applyUndo(now);
    // 방향키 둘러보기: ←→ 돌기, ↑↓ 위아래 보기(3인칭은 카메라가 내려가 올려다본다). 잠깐 누르면 조금, 누르고 있으면 빨라진다
    const turnDir = paused ? 0 : (keys.has('tl') ? 1 : 0) - (keys.has('tr') ? 1 : 0);
    const tiltDir = paused ? 0 : (keys.has('lu') ? 1 : 0) - (keys.has('ld') ? 1 : 0);
    keyTurn.held = turnDir && turnDir === keyTurn.dir ? keyTurn.held + dt : 0;
    keyTurn.dir = turnDir;
    keyTilt.held = tiltDir && tiltDir === keyTilt.dir ? keyTilt.held + dt : 0;
    keyTilt.dir = tiltDir;
    if (turnDir) yaw += turnDir * keyLookRate(KEY_YAW, keyTurn.held) * dt;
    if (tiltDir) {
      const a = tiltDir * keyLookRate(KEY_PITCH, keyTilt.held) * dt;
      if (view === 'first') pitch1 += a;
      else pitch3 -= a;
      clampPitch();
    }
    // 오른쪽 시선 스틱: 미는 동안 계속 돈다
    if (!paused && (lookStick.x || lookStick.y)) {
      yaw -= lookStick.x * LOOK_YAW * dt * sens;
      if (view === 'first') pitch1 += lookStick.y * LOOK_PITCH * dt * sens;
      else pitch3 -= lookStick.y * LOOK_PITCH * dt * sens;
      clampPitch();
      lookHold = 0.8;
    } else lookHold = Math.max(0, lookHold - dt);
    // 휴대폰 1인칭: 이동 스틱 x는 옆걸음이 아니라 회전(제자리에서도 돈다). 대각선으로 밀면 곡선으로 걷는다.
    const turnStick = coarse && view === 'first';
    const stickOn = !paused && Math.hypot(stick.x, stick.y) > 0.05;
    stickHeld = stickOn ? stickHeld + dt : 0;
    // 가운데 조금의 가로 쏠림은 버린다: 곧게 밀 때 엄지가 치우친 만큼 계속 돌지 않게
    const turn = turnStick && !paused ? stickTurn(stick.x) : 0;
    if (turn) yaw -= turn * STICK_TURN * dt;
    let ix = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + (turnStick ? 0 : stick.x);
    let iy = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) + stick.y;
    if (paused) ix = iy = 0;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const before = { x: body.x, z: body.z, y: body.y };
    // 자동 걷기는 손으로 움직이면(걷기·돌기 키, 두 스틱, 화면 끌기) 멈춘다
    if (!paused && (mag > 0.05 || keys.has('tl') || keys.has('tr') || Math.hypot(lookStick.x, lookStick.y) > 0.05
      || (turnStick ? turn !== 0 : Math.abs(stick.x) > 0.05) || dragged)) {
      if (path) endPath('cancel');
      turnTo = null;
    }
    dragged = false;
    moving = mag > 0.05;
    // 앉아 있다가 걷기 시작하면(손으로든 자동 걷기든) 일어서며 걷는다
    if (sitting && (moving || path)) sitting = false;
    runNow = false;
    if (path && !paused) {
      const r = pathStep(path.run, body, dt, WALK, (b, dx, dz) => step(W.physics, b, dx, dz), (b, to) => clearLine(W.physics, b, to.x, to.z, undefined, undefined, to.y));
      body = r.body;
      moving = r.heading !== null;
      // 1인칭은 시선도 다음 점 쪽으로 천천히 돈다
      if (r.heading !== null && view === 'first') yaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, angleDiff(yaw, r.heading) * follow(dt, 0.35)));
      if (r.done) {
        // 도착하면 목적지 쪽으로 돌기 시작한다(콜백이 새 길을 걸거나 바로 옮기면 그쪽이 지운다)
        if (r.done === 'arrive' && path.face !== undefined) { turnTo = path.face; turnSeen = null; }
        endPath(r.done);
      }
    } else if (moving) {
      const speed = keys.has('run') || Math.hypot(stick.x, stick.y) > 0.92 ? RUN : WALK;
      runNow = speed === RUN;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      body = step(W.physics, body, (rx * ix + fx * iy) * speed * dt, (rz * ix + fz * iy) * speed * dt);
      // 휴대폰 3인칭: 카메라 기준으로 걷고, 카메라가 이동 방향 뒤로 부드럽게 따라온다.
      // 이동이 카메라 기준이라 카메라가 돌면 이동 방향도 돌아서 따라오기가 끝나지 않는다. 그래서 옆으로 민 몫(sin)만큼만,
      // 낮은 상한(FOLLOW_MAX)으로 돌린다: 옆으로 계속 밀면 작은 원이 아니라 큰 호를 그리며 나아간다.
      // 카메라 쪽으로 다가올 때(거의 뒤로)는 돌지 않고, 시선 스틱을 쓰는 동안과 놓은 직후에도 쉰다.
      if (coarse && view === 'third' && lookHold === 0 && stickOn) {
        const d = Math.atan2(-ix, iy);
        const ad = Math.abs(d);
        const side = ad <= Math.PI / 2 ? Math.sin(ad) : Math.max(0, (FOLLOW_BACK - ad) / (FOLLOW_BACK - Math.PI / 2));
        const ramp = Math.min(1, stickHeld / FOLLOW_RAMP);
        yaw += Math.sign(d) * Math.min(ad * FOLLOW_RATE, FOLLOW_MAX * side) * ramp * dt;
      }
    }
    // 실제로 움직인 만큼으로 걸음 빠르기와 캐릭터가 볼 쪽을 정한다(벽에 막히면 제자리걸음 대신 멈춘다)
    const mvx = body.x - before.x, mvz = body.z - before.z;
    const mv = Math.hypot(mvx, mvz);
    speedNow += ((dt > 0 ? mv / dt : 0) - speedNow) * follow(dt, 0.08);
    if (!moving && mv <= 1e-4) speedNow = 0;
    if (mv > 1e-4 && view === 'third') face += angleDiff(face, Math.atan2(mvx, mvz)) * follow(dt, 0.08);
    else if (view === 'first') face = yaw + Math.PI;
    // 걸어서 도착한 뒤 목적지 쪽으로 돈다: 1인칭은 시선, 3인칭은 캐릭터만(카메라까지 돌면 시야가 크게 바뀐다).
    // 그 사이 마우스로 둘러봤으면(시선이 맞춰 둔 값과 다르다) 손에 맡기고 그만둔다
    if (turnTo !== null && !paused) {
      if (view === 'first' && turnSeen !== null && yaw !== turnSeen) turnTo = null;
      else {
        const t = turnStep(view === 'first' ? yaw : face - Math.PI, turnTo, opt.reducedMotion ? Infinity : dt);
        if (view === 'first') { yaw = t.a; face = yaw + Math.PI; } else face = t.a + Math.PI;
        turnSeen = yaw;
        if (t.done) turnTo = null;
      }
    }
    // 점프: 보이는 높이만 바뀌고 충돌·층 판정은 그대로
    const hs = hopStep(hop, dt);
    hop = hs.hop;
    landed = hs.landed;
    const reduce = opt.reducedMotion;
    // 앉기: 1인칭 눈높이와 3인칭 카메라가 내려간다(캐릭터는 스스로 앉는다). 줄인 움직임이면 바로
    const sitGoal = sitting && !hop.air ? 1 : 0;
    const sitWas = sitAmt;
    sitAmt = reduce ? sitGoal : sitAmt + (sitGoal - sitAmt) * follow(dt, 0.08);
    if (Math.abs(sitGoal - sitAmt) < 0.002) sitAmt = sitGoal;
    const sitMoved = sitAmt !== sitWas;
    ledge = reduce ? 0 : ledgeEase(ledge, body.y - before.y, mv, dt);
    const shownY = body.y + ledge;
    dip = landed && !reduce ? 1 : dip * Math.exp(-dt * 9);
    fpAmt += ((moving && !hop.air && speedNow > 0.2 && !reduce ? 1 : 0) - fpAmt) * follow(dt, 0.12);
    fpPhase = (fpPhase + gaitRate(fpAmt > 0.01 ? Math.max(speedNow, 0.8) : 0, runNow) * dt) % (Math.PI * 2);

    const H = W.house;
    const inHouse = body.x > H.x1 && body.x < H.x2 && body.z > H.z1 && body.z < H.z2;
    const third = view === 'third';
    // 3인칭으로 집 안에 있으면 인형의 집처럼 지붕·위층을 걷고 벽을 허리까지 낮춘다. 1인칭은 집 그대로.
    // 방 장면은 3인칭이어도 벽·천장을 그대로 두고 카메라를 방 안에 둔다(아래 roomCamera)
    const dollhouse = third && inHouse && !isRoom;
    const showL2 = !(dollhouse && body.level === 1 && body.y < 1.0);
    // 집 모양이 바뀌면(위층·지붕을 걷거나 벽을 낮추는 동안) 해 그림자를 다시 굽는다
    let reshaped = level2.visible !== showL2 || roof.visible === dollhouse;
    level2.visible = showL2;
    roof.visible = !dollhouse;
    for (const m of porchSlabs) m.visible = !dollhouse;
    ceilings.visible = !third || isRoom;
    for (const l of furn.lights) l.light.intensity = l.level === 2 && !showL2 ? 0 : l.base;
    const cutLevel: 0 | 1 | 2 = !dollhouse ? 0 : body.y > W.floor2 / 2 ? 2 : 1;
    const ease = opt.reducedMotion ? 1 : 1 - Math.pow(0.002, dt);
    for (const c of cuttable) {
      const top = cutLevel === c.level ? Math.min(c.y1, Math.max(c.y0, CUT_H)) : c.y1;
      const want = Math.max(0.001, top - c.y0);
      const cur = c.mesh.scale.y;
      if (cur === want) continue;
      const h = Math.abs(cur - want) < 0.005 ? want : cur + (want - cur) * ease;
      c.mesh.scale.y = h;
      c.mesh.position.y = c.base + c.y0 + h / 2;
      c.mesh.visible = h > 0.02;
      reshaped = true;
    }
    for (const o of hideOnCut) {
      const show = cutLevel !== o.level;
      if (o.obj.visible !== show) { o.obj.visible = show; reshaped = true; }
    }
    if (reshaped) shadowDirty = Math.max(shadowDirty, 1);

    // 다른 사람들과 말풍선은 그리지 않는 프레임에도 따라간다(움직임이 있으면 다시 그린다)
    const unitsPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH);
    // 반려동물: 시각으로 정한 자리로. 화면에서 보이게 바뀐 프레임만 한 장씩 그린다(걸음이 가라앉는 꼬리 없이, 해 그림자도 굽지 않는다)
    const petMoved = pet ? pet.update({ now: Date.now(), camera, showUpper: level2.visible, unitsPerPx, hidden: petHidden, people: petPeople }) : false;
    if (petMoved && dirty < 1) dirty = 1;
    const othersMoved = updateOthers(dt, unitsPerPx, pet?.blob(petBlobAt) ? petBlobAt : null, petMoved);
    let bubbleGone = false;
    if (myBubbleUntil && performance.now() > myBubbleUntil) { myBubbleUntil = 0; me.setBubble(null); bubbleGone = true; }

    // 바뀐 것이 있는가: 몸·시선·점프·자동 걷기·집 모양·다른 사람
    const lookMoved = yaw !== drawn.yaw || pitch1 !== drawn.p1 || pitch3 !== drawn.p3 || dist !== drawn.dist || view !== drawn.view;
    if (moving || mv > 1e-5 || lookMoved || hop.air || landed || sitMoved || ledge !== 0 || undo !== null || path !== null || turnTo !== null || reshaped || othersMoved || bubbleGone) activeAt = now;
    if (moving || mv > 1e-5 || hop.air || landed || sitMoved || ledge !== 0 || undo !== null || path !== null || turnTo !== null) meActiveAt = now;
    // 갤러리: 가까운 액자 그림을 싣고 먼 것은 내린다. 그리지 않는 프레임에도 이어 받고(다 실리면 onChange가 다시 그리게 한다)
    gallery?.update(body.level, body.x, body.z, now);
    // 밤하늘: 별 반짝임 시각과 지금 그리기 배율을 넘기고, 별똥별이 화면 안에 보이는 동안만 매 프레임 그린다(그 밖엔 쉬는 동안 0.5초에 한 장)
    if (scenery?.update?.(now, camera, renderer.getPixelRatio(), !inHouse) && dirty < 1) dirty = 1;
    if (dirty === 0 && now - activeAt > IDLE_TAIL_MS && now - drawnAt < IDLE_KEEP_MS) return;
    if (dirty > 0) dirty--;
    drawnAt = now;
    drawn.yaw = yaw; drawn.p1 = pitch1; drawn.p3 = pitch3; drawn.dist = dist; drawn.view = view;
    // 데스크탑은 캐릭터도 해 그림자를 드리운다: 내 캐릭터나 다른 사람이 움직이는 동안만 다시 굽는다
    // (서 있는 사람들 사이에서 둘러보기만 할 때는 그림자가 그대로다)
    if (!opt.coarse && ((third && now - meActiveAt < SHADOW_TAIL_MS) || othersMoved)) shadowDirty = Math.max(shadowDirty, 1);
    for (const m of ghosted) m.material = m.userData.base as THREE.Material | THREE.Material[];
    ghosted = [];
    if (third) {
      target.set(body.x, shownY + AIM_H - SIT_AIM * sitAmt, body.z);
      const minPitch = isRoom ? 0.12 : inHouse ? 0.85 : 0.12;
      const pt = Math.max(pitch3, minPitch);
      const d = isRoom ? roomCamera(pt) : inHouse ? Math.min(dist, 6.5) : dist;
      const want = camWant.set(
        target.x + Math.sin(yaw) * Math.cos(pt) * d,
        target.y + Math.sin(pt) * d,
        target.z + Math.cos(yaw) * Math.cos(pt) * d,
      );
      if (opt.reducedMotion || camPos.lengthSq() === 0 || camPos.distanceToSquared(want) < 1e-8) camPos.copy(want);
      else camPos.lerp(want, 1 - Math.pow(0.0008, dt));
      camera.position.copy(camPos);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      // 인형을 가리는 벽은 비쳐 보이게
      const dir = rayDir.subVectors(camPos, target);
      const len = dir.length();
      ray.set(target, dir.normalize());
      ray.far = len;
      for (const hit of ray.intersectObjects(occluders, false)) {
        const m = hit.object as THREE.Mesh;
        if (!m.parent?.visible) continue;
        const base = m.userData.base as THREE.Material | THREE.Material[];
        m.material = Array.isArray(base) ? base.map(ghostOf) : ghostOf(base);
        ghosted.push(m);
      }
    } else {
      // 1인칭: 눈높이(점프하면 따라 오른다). 걸음에 맞춰 위아래·좌우로 조금 출렁이고 아주 조금 기운다.
      // 멈추면 세기가 부드럽게 0으로, 착지하면 짧게 내려앉는다. 줄인 움직임이면 모두 끈다(fpAmt·dip이 0)
      const b = headBob(fpPhase, fpAmt, runNow);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      camPos.set(body.x + rx * b.x, shownY + EYE + hop.h + b.y - 0.07 * dip - SIT_EYE * sitAmt, body.z + rz * b.x);
      camera.position.copy(camPos);
      camera.lookAt(camPos.x - Math.sin(yaw) * Math.cos(pitch1), camPos.y + Math.sin(pitch1), camPos.z - Math.cos(yaw) * Math.cos(pitch1));
      if (b.roll) camera.rotateZ(b.roll);
      camera.updateMatrixWorld();
    }

    // 내 캐릭터: 3인칭에서만. 걸음에 맞춰 팔다리가 엇갈리고, 점프하면 쪼그렸다 늘어난다
    me.group.visible = blob.visible = third;
    if (third) {
      me.group.position.set(body.x, shownY + hop.h, body.z);
      me.group.rotation.y = face;
      me.update(dt, { speed: moving ? speedNow : 0, running: runNow, airborne: hop.air, landing: landed, vy: hop.v, sitting });
      blob.position.set(body.x, shownY + 0.02, body.z);
      blob.scale.setScalar(Math.max(0.55, 1 - hop.h * 0.8));
    }
    // 이름표·말풍선은 화면에서 늘 같은 크기(카메라 1m 앞 1px의 길이)
    me.setPixelScale(unitsPerPx);
    if (opt.label) {
      if (opt.name !== undefined) opt.label.style.opacity = '0';
      else if (third) {
        const v = labelAt.set(body.x, shownY + hop.h + 1.32 - SIT_LABEL * sitAmt, body.z).project(camera);
        opt.label.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * viewW}px, ${((1 - v.y) / 2) * viewH}px)`;
        opt.label.style.opacity = v.z < 1 ? '1' : '0';
      } else opt.label.style.opacity = '0';
    }

    // 살피기: 바라보는 액자가 가까우면 그 액자, 아니면 살피기 자리. 휴대폰 3인칭은 몸이 걸어온 쪽을 봐 액자 앞에서도 옆을 보기 쉬워,
    // 벽 바로 앞(1m)에서 몸이 대략 액자 쪽을 보면 그 액자도 「약한」 가까움으로 알린다(크게 보기 단추·E에만, Enter 말하기와
    // 반려동물 부르기는 막지 않는다). 등 뒤·먼 액자는 잡지 않는다.
    // 갤러리 액자는 세계의 살피기 목록에 넣지 않는다(지도·길 찾기에 액자가 늘어서지 않게)
    const facing = { x: Math.sin(face), z: Math.cos(face) };
    const weakNear = (): Hotspot | null => {
      const h = opt.coarse && third ? gallery?.near(body.level, body.x, body.z, facing, LOOSE_NEAR) : null;
      return h ? { ...h, weak: true } : null;
    };
    const camForward = camera.getWorldDirection(rayDir);
    const directSpot = nearHotspot(body.level, body.x, body.z);
    const gazedOrDirect = pickGazedHotspot(
      {
        level: body.level,
        bodyX: body.x,
        bodyZ: body.z,
        camX: camera.position.x,
        camY: camera.position.y,
        camZ: camera.position.z,
        dirX: camForward.x,
        dirY: camForward.y,
        dirZ: camForward.z,
      },
      W.hotspots,
      isRoom,
      directSpot,
    );
    const near = gallery?.near(body.level, body.x, body.z, facing) ?? gazedOrDirect ?? weakNear();
    if (beacons.setActive(near?.id ?? null) && dirty < 2) dirty = 2;
    if (near?.id !== lastNear?.id || (near && (near.title !== lastNear?.title || Boolean(near.weak) !== Boolean(lastNear?.weak)))) {
      lastNear = near;
      opt.onNear(near);
    }
    const place = zoneAt(body.level, body.x, body.z, W);
    if (place !== lastPlace) {
      lastPlace = place;
      opt.onPlace(place);
    }

    // 사진 캐릭터의 판을 그리기 전에 카메라에 맞춰 세우고, 보는 방향에 맞는 그림을 고른다. 1인칭은 판이 카메라 자리를 보고,
    // 3인칭은 모든 판이 화면과 나란히 선다(여럿이 나란히 서고 화면 가장자리에서도 비틀리지 않는다).
    // 해 그림자는 따로 둔 판이 해 쪽을 보며 드리우므로 카메라가 움직여도 그대로다: 여기서는 그림자를 다시 굽지 않는다
    // (캐릭터가 움직이거나 돌 때, 오고 갈 때, 그림이 늦게 올 때는 위의 othersMoved·meActiveAt·invalidate가 굽는다).
    const myCard = third && me.form() === 'card';
    if (othersPhoto || myCard) {
      const stand = third ? 'plane' : 'position';
      let turning = myCard && me.face(camera, stand);
      if (othersPhoto) for (const o of others.values()) if (o.av.group.visible && o.av.face(camera, stand)) turning = true;
      // 보이던 그림이 바뀌어 판 폭이 줄었다 돌아오는 동안은 계속 그린다(그림자는 그대로)
      if (turning && dirty < 1) dirty = 1;
    }
    if (shadowDirty > 0) {
      shadowDirty--;
      bakes++;
      renderer.shadowMap.needsUpdate = true;
    }
    draws++;
    renderer.render(scene, camera);
    pet?.drawn();
    if (firstDrawn) {
      firstDrawn();
      firstDrawn = null;
    }
  };

  // ───────── 관전(컨트롤 룸): 내 몸 없이 고정 카메라 여러 대로 캔버스를 나눠 그린다(한 WebGL 문맥, viewport·scissor).
  // 화면마다 초당 rate장까지, 한 프레임에 OBS_PER_FRAME개까지(오래 기다린 화면부터). 사람이 움직이거나 모습이 바뀐 뒤에만 다시 그리고,
  // 아무 일 없어도 OBS_KEEP_MS마다 한 번은 그린다. 사람은 모두 따라가고(위 updateOthers), 화면마다 people에 든 사람만 보인다.
  // 걷는 화면의 프레임(tick)과 내 몸·시점·입력은 쓰지 않는다
  const OBS_PER_FRAME = 3;
  const OBS_TAIL_MS = 600;
  const OBS_KEEP_MS = 5000;
  /** 사람이 움직이는 동안 해 그림자를 다시 굽는 가장 짧은 간격(데스크탑만, 캐릭터도 그림자를 드리운다) */
  const OBS_BAKE_MS = 500;
  const observer = opt.observe ? (() => {
    const onScreens = opt.observe.onScreens;
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.08, LOOK.far);
    let screens: ObserveScreen[] = [];
    let rate = 4;
    let due: number[] = [];
    let drawnAt: number[] = [];
    let changedAt = performance.now();
    let bakedAt = -Infinity;
    let size = '';
    me.group.visible = blob.visible = false;
    // 거리로 고르는 일(이름표 수, 사진 캐릭터 모양)의 기준을 집 가운데 눈높이로 둔다
    camera.position.set(centre.x, EYE, centre.z);
    /** 지금 집 모양(-1은 아직 안 정함). 0은 그대로, 1·2는 그 층 단면: 3인칭 인형의 집 보기와 같은 규칙을 바로(천천히가 아니라) */
    let cutNow = -1;
    const applyCut = (cut: 0 | 1 | 2) => {
      if (cut === cutNow) return;
      cutNow = cut;
      const doll = cut !== 0;
      const showL2 = cut !== 1;
      level2.visible = showL2;
      roof.visible = !doll;
      for (const m of porchSlabs) m.visible = !doll;
      ceilings.visible = !doll;
      for (const l of furn.lights) l.light.intensity = l.level === 2 && !showL2 ? 0 : l.base;
      for (const c of cuttable) {
        const top = cut === c.level ? Math.min(c.y1, Math.max(c.y0, CUT_H)) : c.y1;
        const h = Math.max(0.001, top - c.y0);
        c.mesh.scale.y = h;
        c.mesh.position.y = c.base + c.y0 + h / 2;
        c.mesh.visible = h > 0.02;
      }
      for (const o of hideOnCut) o.obj.visible = cut !== o.level;
    };
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    const valid = (s: ObserveScreen) => Boolean(s) && [s.x, s.y, s.w, s.h, s.fov, s.eye?.x, s.eye?.y, s.eye?.z, s.at?.x, s.at?.y, s.at?.z].every(num)
      && s.w >= 1 && s.h >= 1 && s.people instanceof Set;
    const draw = (s: ObserveScreen) => {
      applyCut(s.cut === 1 || s.cut === 2 ? s.cut : 0);
      cam.fov = Math.min(120, Math.max(10, s.fov));
      cam.aspect = s.w / s.h;
      cam.position.set(s.eye.x, s.eye.y, s.eye.z);
      cam.lookAt(s.at.x, s.at.y, s.at.z);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      // 이름표·말풍선은 이 화면에서 늘 같은 크기(카메라 1m 앞 1px의 길이)
      const upp = (2 * Math.tan((cam.fov * Math.PI) / 360)) / s.h;
      let n = 0;
      for (const o of others.values()) {
        const vis = s.people.has(o.p.id);
        o.av.group.visible = vis;
        if (!vis) continue;
        o.av.setPixelScale(upp);
        o.av.setNameShown(s.names);
        // 사진 판은 이 카메라에 맞춰 세운다(위에서 내려다보는 화면이라 3인칭처럼 화면과 나란히)
        o.av.face(cam, 'plane');
        if (n < OTHER_BLOBS) otherBlobs.setMatrixAt(n++, blobAt.makeTranslation(o.x, o.y + 0.02, o.z));
      }
      otherBlobs.count = n;
      otherBlobs.instanceMatrix.needsUpdate = true;
      // three의 viewport는 왼쪽 아래가 0이다
      const y = viewH - s.y - s.h;
      renderer.setViewport(s.x, y, s.w, s.h);
      renderer.setScissor(s.x, y, s.w, s.h);
      renderer.setScissorTest(true);
      renderer.render(scene, cam);
    };
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const moved = updateOthers(dt, 2 * Math.tan((35 * Math.PI) / 180) / Math.max(1, viewH));
      if (moved || dirty > 0) changedAt = now;
      if (dirty > 0) dirty--;
      if (!screens.length) return;
      // 캔버스 크기가 바뀌면(창 크기) 버퍼가 비므로 모든 화면을 곧 다시 그린다
      const key = `${el.width}x${el.height}`;
      if (key !== size) {
        size = key;
        due.fill(0);
        drawnAt.fill(0);
      }
      const pick: number[] = [];
      for (let i = 0; i < screens.length; i++) {
        if (now < due[i]) continue;
        if (drawnAt[i] === 0 || drawnAt[i] < changedAt + OBS_TAIL_MS || now - drawnAt[i] >= OBS_KEEP_MS) pick.push(i);
      }
      if (!pick.length) return;
      pick.sort((a, b) => due[a] - due[b] || a - b);
      if (pick.length > OBS_PER_FRAME) pick.length = OBS_PER_FRAME;
      if (moved && !opt.coarse && now - bakedAt > OBS_BAKE_MS && shadowDirty < 1) shadowDirty = 1;
      for (const i of pick) {
        // 해 그림자는 집 그대로인 화면을 그릴 때 굽는다(단면 화면은 지붕을 걷어 그 그림자가 빠진다)
        if (shadowDirty > 0 && screens[i].cut === 0) {
          shadowDirty--;
          bakes++;
          bakedAt = now;
          renderer.shadowMap.needsUpdate = true;
        }
        draw(screens[i]);
        drawnAt[i] = now;
        // 같은 때에 몰리지 않게 조금 흩뜨린다
        due[i] = now + (1000 / rate) * (0.9 + Math.random() * 0.2);
        draws++;
      }
      renderer.setScissorTest(false);
      // 나눠 그리며 바꾼 것을 사람 따라가기(updateOthers의 바뀜 셈)와 맞춰 둔다: 모두 보이게, 이름표는 원래대로
      for (const o of others.values()) {
        o.av.group.visible = true;
        o.av.setNameShown(o.named);
      }
      try { onScreens(pick); } catch { /* 화면 쪽 오류가 그리기를 멈추지 않게 */ }
      if (firstDrawn) {
        firstDrawn();
        firstDrawn = null;
      }
    };
    return {
      frame,
      set(list: readonly ObserveScreen[], fps: number) {
        screens = (Array.isArray(list) ? list : []).filter(valid);
        rate = Math.min(30, Math.max(1, num(fps) ? fps : 4));
        due = screens.map(() => 0);
        drawnAt = screens.map(() => 0);
        changedAt = performance.now();
      },
      redraw() {
        due.fill(0);
        drawnAt.fill(0);
      },
    };
  })() : null;

  /** 그릴 수 있으면(셰이더 준비됨, 보이는 화면, 문맥 있음, 쉬는 중 아님) 프레임을 다시 돌린다 */
  const resume = () => {
    if (running || !warm || document.hidden || lost || frozen) return;
    running = true;
    invalidate(3);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const halt = () => {
    cancelAnimationFrame(raf);
    running = false;
  };
  // 처음 온 손님은 셰이더 캐시가 비어 있어, 그냥 그리면 첫 프레임이 셰이더를 다 만들 때까지 화면을 통째로 멈춘다
  // (휴대폰에서 몇 초). 첫 프레임 전에 브라우저가 뒤에서 만들게 맡기고(KHR_parallel_shader_compile), 다 되면 그리기 시작한다.
  // 그 확장이 없는 기기는 바로 풀려 예전처럼 그린다.
  const begin = () => {
    if (warm) return;
    warm = true;
    window.clearTimeout(warmTimer);
    born = performance.now();
    resume();
  };
  const warmTimer = window.setTimeout(begin, WARM_MAX_MS);
  renderer.compileAsync(scene, camera).then(begin, begin);
  const onVisibility = () => {
    if (document.hidden) {
      halt();
      // 화면이 가려지는 동안 손을 뗀 신호를 놓쳐도 계속 걷지 않게
      onBlur();
    } else resume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // 그래픽 문맥을 잃으면(휴대폰에서 다른 앱에 다녀오거나 GPU가 다시 시작될 때) 그리기를 멈추고 화면에 알린다.
  // 문맥이 돌아오면 스스로 다시 그린다: 환경 빛과 해 그림자는 GPU에만 있던 그림이라 다시 만든다.
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    halt();
    opt.onLost?.();
  };
  const onRestored = () => {
    if (!lost) return;
    lost = false;
    try {
      const old = scene.environment;
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      old?.dispose();
    } catch { /* 환경 빛을 다시 못 만들면 그대로 둔다 */ }
    shadowDirty = 3;
    resume();
    opt.onRestored?.();
  };
  el.addEventListener('webglcontextlost', onLost);
  el.addEventListener('webglcontextrestored', onRestored);

  // 브라우저 시험용 손잡이(좌표만, 개인 정보 없음)
  const debug = {
    get body() { return { ...body }; },
    get place() { return lastPlace; },
    get near() { return lastNear?.id ?? null; },
    get view() { return view; },
    get yaw() { return yaw; },
    get pitch() { return view === 'first' ? pitch1 : pitch3; },
    get flags() { return { level2: level2.visible, roof: roof.visible, ceilings: ceilings.visible, frames, kind: W.kind, scenery: Boolean(scenery) }; },
    /** 그리기 통계: 지난 프레임의 그리기 호출·삼각형, 구운 도형 수(굽기 전 → 뒤) */
    get stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, bakedFrom, bakedTo, scale, pixelRatio: renderer.getPixelRatio(), draws, bakes }; },
    get jumping() { return hop.air; },
    get hop() { return hop.h; },
    /** 앉아 있는가, 앉은 몫, 지금까지 뛴 수 */
    get sitting() { return sitting; },
    get sitAmt() { return sitAmt; },
    get jumps() { return jumps; },
    /** 다른 사람들이 지금 어떻게 보이는지(차례만, 이름 없이): 공중 높이(m), 뛰는 중, 앉음, 서 있는 한 덩이 또는 다 앉아 가만히 */
    get othersPose() { return [...others.values()].map((o) => ({ hop: o.hop.h, air: o.hop.air, sitting: Boolean(o.p.sitting), still: o.av.resting(), y: o.av.group.position.y })); },
    /** 지금 카메라 높이(측정용: 턱을 오르내릴 때 눈높이가 한 프레임에 튀지 않는지 본다) */
    get eye() { return camera.position.y; },
    get auto() { return Boolean(path); },
    /** 지금 그려진 다른 사람 수(같은 층, 가까운 사람) */
    get others() { return othersDrawn; },
    /** 내 캐릭터가 지금 무엇으로 보이는지('doll' | 'photo')와 문패 수 */
    get character() { return me.shown(); },
    /** 사진 캐릭터가 쓰는 그림의 방향 수(인형 0, 그림 한 장 1, 방향 그림 묶음 5): 내 것과 다른 사람들 */
    get photoViews() { return { me: me.views(), others: [...others.values()].map((o) => o.av.views()) }; },
    /** 캐릭터가 지금 무엇으로 서 있는지('doll' | 'card' | 'model'): 내 것과 다른 사람들 */
    get photoForms() { return { me: me.form(), others: [...others.values()].map((o) => o.av.form()) }; },
    get plates() { return plates.map((p) => (p.slug && doorNames[p.slug]) || p.label); },
    /** 반려동물: 받았는지·갈 곳 수·보이는지·지금 자리와 자세, 그리고 at(시각 ms)으로 그때의 자리(이름은 싣지 않는다) */
    get pet() { return pet?.debug() ?? null; },
    /** 반려동물 몸 가운데의 화면 자리(캔버스 CSS px, 왼쪽 위 0). 안 보이면 null(누르기 시험용) */
    get petScreen() {
      const d = pet?.debug();
      if (!d?.visible || !d.state) return null;
      const v = new THREE.Vector3(d.state.x, d.state.y + 0.25, d.state.z).project(camera);
      return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 ? { x: ((v.x + 1) / 2) * viewW, y: ((1 - v.y) / 2) * viewH } : null;
    },
    /** 사진 갤러리: 액자 수, 빈 액자 판 묶음 수, 실린·받는 중·실패한 그림 수 */
    get gallery() { return gallery?.stats() ?? null; },
    /** 사람 머리 위 말풍선: 말 숨기기 중인지, 내 말풍선이 떠 있는지, 말풍선이 뜬 다른 사람 수(글은 싣지 않는다) */
    get talk() {
      let shown = 0;
      for (const o of others.values()) if (o.bubbleUntil > 0) shown++;
      return { hidden: talkHidden, me: myBubbleUntil > performance.now(), others: shown };
    },
    setView,
    jump,
    sit: (on?: boolean) => setSit(on ?? !sitting),
    walkPath: (pts: Array<{ x: number; z: number; level: Level; y?: number }>) => walkPath(pts),
    // 시선을 코드로 정하면 마우스 되돌리기 기록도 버린다(그 앞의 움직임을 되돌리지 않게)
    teleport: (x: number, z: number, level: Level = 1, faceYaw?: number) => teleport(x, z, level, faceYaw),
    /** 검사 없이 그 자리에 둔다(시험용) */
    put(x: number, z: number, level: Level = 1) { body = { x, z, level, y: level === 2 ? W.floor2 : 0 }; ledge = 0; camPos.set(0, 0, 0); stroke = []; undo = null; invalidate(3); },
    look(y: number, p?: number) { yaw = y; if (p !== undefined) { if (view === 'first') pitch1 = p; else pitch3 = p; } camPos.set(0, 0, 0); stroke = []; undo = null; invalidate(3); },
    /** 손으로 둘러볼 때처럼 시선만 아주 조금 돌린다(측정용: 다시 그리게 하되 그림자·카메라는 건드리지 않는다) */
    nudge(d = 0.0004) { yaw += d; },
  };
  (window as unknown as { __jyWalk?: typeof debug }).__jyWalk = debug;

  const unit = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return {
    ready,
    setStick(x, y) {
      stick.x = x;
      stick.y = y;
    },
    setLook(x, y) {
      lookStick.x = unit(x);
      lookStick.y = unit(y);
    },
    setPaused(p) {
      paused = p;
      if (p) {
        keys.clear();
        // 도착해서 도는 중이었으면 그만둔다: 멈춘 채 남겨 두면 패널이 열린 내내 「움직이는 중」으로 쳐서 계속 다시 그린다
        turnTo = null;
        // 멈춘 사이 손을 뗀 신호를 놓쳐도 계속 돌지 않게
        lookStick.x = lookStick.y = 0;
        if (document.pointerLockElement === el) document.exitPointerLock();
      }
    },
    setFrozen(on) {
      if (frozen === on) return;
      frozen = on;
      if (on) halt();
      else resume();
    },
    setView,
    getState() {
      return { x: body.x, z: body.z, y: body.y, level: body.level, yaw, bodyYaw: face - Math.PI, pitch: view === 'first' ? pitch1 : pitch3, view, moving, jumping: hop.air, jumps, sitting, auto: Boolean(path), activeSpotId: lastNear?.id ?? null };
    },
    teleport,
    walkPath,
    cancelPath: () => endPath('quiet'),
    jump,
    sit: (on?: boolean) => setSit(on ?? !sitting),
    setOthers,
    say(text) {
      // 말을 숨긴 동안에는 내 말풍선도 띄우지 않는다(말은 그대로 나간다)
      const t = talkHidden ? '' : String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
      me.setBubble(t || null);
      myBubble = t;
      myBubbleUntil = t ? performance.now() + BUBBLE_MS : 0;
      invalidate(2);
    },
    setTalkHidden(on) {
      if (talkHidden === (on === true)) return;
      talkHidden = on === true;
      if (!talkHidden) return;
      // 떠 있던 말풍선을 바로 내린다. 다시 보이게 해도 숨긴 동안의 말은 다시 띄우지 않는다.
      // 말풍선은 해 그림자에 들지 않으니 그림자는 굽지 않고 몇 장만 다시 그린다
      for (const o of others.values()) {
        if (!o.bubbleUntil) continue;
        o.bubbleUntil = 0;
        o.av.setBubble(null);
      }
      myBubble = '';
      myBubbleUntil = 0;
      me.setBubble(null);
      if (dirty < 2) dirty = 2;
    },
    setCharacter(look) {
      if (!look || (look.kind !== 'doll' && look.kind !== 'photo')) return;
      if (lookKey(look) === lookKey(myLook)) {
        // 칭호만 바뀌었다: 캐릭터는 그대로 두고 이름표만 다시 그린다
        myLook = look;
        if (me.setTitle(look.title ?? null) && dirty < 2) dirty = 2;
        return;
      }
      myLook = look;
      if (look.kind === 'doll') myDoll = look.doll;
      const old = me;
      me = makeMe();
      me.group.position.copy(old.group.position);
      me.group.rotation.y = old.group.rotation.y;
      me.group.visible = old.group.visible;
      if (myBubbleUntil > performance.now() && myBubble) me.setBubble(myBubble);
      scene.add(me.group);
      old.dispose();
      invalidate(3);
    },
    refreshModel(photoUrl) {
      if (typeof photoUrl !== 'string' || !/^\/api\/avatar\/[0-9a-f-]{36}$/.test(photoUrl)) return;
      modelNow(photoUrl);
    },
    capture() {
      return new Promise<Blob>((resolve, reject) => {
        if (lost) return reject(new Error('lost'));
        try {
          // 그린 직후 같은 작업 안에서 옮겨 담는다(그리기 버퍼를 보존하지 않는 문맥이라 다음 프레임이면 비어 있다)
          renderer.render(scene, camera);
          const src = renderer.domElement;
          const k = Math.min(1, CAPTURE_MAX / Math.max(1, src.width, src.height));
          const out = document.createElement('canvas');
          out.width = Math.max(1, Math.round(src.width * k));
          out.height = Math.max(1, Math.round(src.height * k));
          const g = out.getContext('2d');
          if (!g) return reject(new Error('2d'));
          g.drawImage(src, 0, 0, out.width, out.height);
          out.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85);
        } catch (e) {
          reject(e instanceof Error ? e : new Error('capture'));
        }
      });
    },
    setSensitivity(mult) {
      sens = clampSens(mult);
    },
    setDoorNames,
    setPet,
    setNetLive(live) {
      netLive = live === true;
    },
    setGallery(items) {
      if (!gallery) return;
      gallery.setItems(items && typeof items.get === 'function' ? items : null);
    },
    setScreens(list, fps) {
      observer?.set(list, fps);
    },
    redrawScreens() {
      observer?.redraw();
    },
    dispose() {
      halt();
      window.clearTimeout(warmTimer);
      // 정리하는 동안 문맥이 돌아오거나 화면이 다시 보여도 프레임을 되살리지 않는다
      frozen = true;
      ro.disconnect();
      if (document.pointerLockElement === el) document.exitPointerLock();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('mousemove', onLockedMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
      el.removeEventListener('pointerleave', onLeave);
      coarseMq?.removeEventListener?.('change', onCoarse);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('focusin', onFocusIn);
      endPath('quiet');
      offLang();
      // 함께 쓰는 캐릭터 기하는 참조 수로 놓는다(장면을 훑어 지우기 전에 떼어 낸다)
      for (const o of others.values()) dropOther(o);
      others.clear();
      waiting.clear();
      otherBlobs.removeFromParent();
      otherBlobs.dispose();
      pet?.dispose();
      pet = null;
      gallery?.dispose();
      me.dispose();
      scenery?.dispose();
      environmentModels.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
      // 무늬·문패를 그린 2D 캔버스도 바로 비운다(다음 장면의 캔버스와 겹쳐 남지 않게)
      disposables.forEach(T.releaseCanvas);
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      // 방을 드나들 때마다 컨트롤러를 새로 만들므로, 쓰레기 수거를 기다리지 않고 WebGL 문맥을 바로 놓는다
      renderer.forceContextLoss();
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', onRestored);
      el.remove();
      delete (window as unknown as { __jyWalk?: unknown }).__jyWalk;
    },
  };
}
