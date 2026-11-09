import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXTERIOR, FLOOR1, FLOOR2, LAWN_BY_SEASON } from '@/content/interior';
import { zoneAt } from '@/content/world';
import { isEditingTarget, shouldHandleShortcut } from '@/lib/keys';
import {
  BUBBLE_MS, GROUNDED, LABEL_FONT, angleDiff, createAvatar, follow, gaitRate, headBob, hopStart, hopStep, lookKey, nearestOpen, pathStep,
  startPath, type Avatar, type Hop, type PathRun,
} from './avatar';
import { dollFromColor, type CharacterLook, type DollLook } from './look';
import { buildFurniture, makeFurnitureMats } from './furnish';
import { fovFor } from './fov';
import { blocked, inRamp, levelOf, rampY, step, type Body } from './physics';
import { buildScenery, lookFor, type Scenery } from './scenery';
import * as T from './textures';
import { tuneWorld } from './tune';
import type { CeilingSpec, Furniture, Hotspot, HouseWorld, Level, Prop, Ramp, RemotePlayer, WallSpec, WindowSpec } from './types';

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
};

/** 미니맵 등이 매 프레임 읽는 몸 상태. pitch는 지금 시점의 값(1인칭 시선 높이, 3인칭 궤도 높이). */
export type WalkState = {
  x: number; z: number; y: number; level: 1 | 2; yaw: number; pitch: number; view: View; moving: boolean;
  /** 점프로 공중에 떠 있는지(보이는 높이만, y는 그대로 바닥) */
  jumping: boolean;
  /** 자동 걷기(walkPath) 중인지 */
  auto: boolean;
};

export type WalkController = {
  /** 왼쪽 이동 스틱 -1..1 (y>0 앞으로, x>0 오른쪽). 휴대폰 1인칭에서는 x가 회전이다. */
  setStick: (x: number, y: number) => void;
  /** 오른쪽 시선 스틱 -1..1 (x>0 오른쪽으로 돈다, y>0 위를 본다). 놓으면 (0,0) */
  setLook: (x: number, y: number) => void;
  setPaused: (paused: boolean) => void;
  setView: (v: View) => void;
  getState: () => WalkState;
  /** 몸을 옮긴다. 그 자리가 막혔거나 허공이면 1.5m 안에서 가장 가까운 걸을 수 있는 자리로, 그것도 없으면 false */
  teleport: (x: number, z: number, level: Level, yaw?: number) => boolean;
  /** 자동 걷기: 점들을 차례로 걸어간다(걷는 속도, 물리 그대로). 손으로 움직이면(키·스틱·끌기) 멈추고 onCancel */
  walkPath: (points: Array<{ x: number; z: number; level: Level }>, cb?: { onArrive?: () => void; onCancel?: () => void }) => void;
  cancelPath: () => void;
  /** 점프(공중이면 무시). 데스크탑 스페이스바는 엔진이 직접 받는다 */
  jump: () => void;
  /** 같은 공간의 다른 사람들. 부를 때마다 목록 전체를 준다 */
  setOthers: (players: RemotePlayer[]) => void;
  /** 내 말풍선(내 캐릭터 머리 위에 6초) */
  say: (text: string) => void;
  /** 내 캐릭터를 바로 바꾼다(말풍선·이름표는 그대로) */
  setCharacter: (look: CharacterLook) => void;
  /** 지금 화면을 한 번 그려 JPEG로(3D만, 화면 위 단추 없이). 긴 변 1920px 이하, 품질 0.85 */
  capture: () => Promise<Blob>;
  /** 둘러보기 감도 배율(0.3~3). 마우스·시선 스틱·화면 끌기에 바로 적용 */
  setSensitivity: (mult: number) => void;
  /** 문패 글을 바꾼다(방 slug → 이름). 목록에 없는 문은 기본 이름으로 */
  setDoorNames: (names: Record<string, string>) => void;
  dispose: () => void;
};

const WALK = 1.6;
const RUN = 3.6;
/** 마우스 둘러보기(rad/px): 버튼 없이 움직여도, 포인터 잠금이어도 같은 값 */
const MOUSE_YAW = 0.0035;
const MOUSE_PITCH = 0.0028;
/** 한 번에 받는 마우스 이동 상한(px): 창 밖에서 돌아올 때·잠금 직후 튀는 값을 자른다 */
const MOUSE_JUMP = 150;
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
/** 살피기 구역 예외(문 앞은 벽에 붙어 있어 옆 구역에서도 잡힌다) */
const ZONE_FREE = new Set<Hotspot['kind']>(['door', 'portal', 'exit']);

type Cut = { mesh: THREE.Mesh; level: Level; base: number; y0: number; y1: number };


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
type Side = -1 | 1;

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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'block';
  renderer.domElement.setAttribute('aria-label', '조연당 안을 걷는 화면');
  host.appendChild(renderer.domElement);

  const disposables: Array<{ dispose: () => void }> = [];
  const keep = <D extends { dispose: () => void }>(d: D) => (disposables.push(d), d);

  const scene = new THREE.Scene();
  // 집: 먼 산줄기까지 보이게 안개를 80m~3.2km로. 방 장면: 창 밖으로 은은한 하늘빛만(안개 없음)
  scene.background = keep(isRoom ? T.sky('#c9dcec', '#f1ead9') : T.sky('#a9c4dc', EXTERIOR.sky));
  if (LOOK.fog) scene.fog = new THREE.Fog(EXTERIOR.sky, LOOK.fog[0], LOOK.fog[1]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.65;

  const camera = new THREE.PerspectiveCamera(70, 1, 0.08, LOOK.far);

  // ───────── 빛: 하늘빛(그림자 없음) + 해(그림자) + 가구 등(따뜻한 점광). 방 장면은 해 없이 실내 조명만
  scene.add(new THREE.HemisphereLight('#fff4e2', '#6f5f4c', isRoom ? 1.45 : 1.3));
  const all = W.floors.reduce((b, f) => ({ x1: Math.min(b.x1, f.x1), x2: Math.max(b.x2, f.x2), z1: Math.min(b.z1, f.z1), z2: Math.max(b.z2, f.z2) }),
    { x1: W.house.x1, x2: W.house.x2, z1: W.house.z1, z2: W.house.z2 });
  const centre = new THREE.Vector3((all.x1 + all.x2) / 2, 0, (all.z1 + all.z2) / 2);
  const reach = Math.max(all.x2 - all.x1, all.z2 - all.z1) * 0.62;
  if (LOOK.sun) {
    const sun = new THREE.DirectionalLight('#fff0d6', 2.1);
    sun.position.copy(centre).add(new THREE.Vector3(0.45, 0.8, 0.6).normalize().multiplyScalar(reach * 2.2));
    sun.target.position.copy(centre);
    sun.castShadow = true;
    sun.shadow.mapSize.set(opt.coarse ? 1024 : 2048, opt.coarse ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: reach * 5 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
  }
  // 방 천장(데이터에 없으면 방 외곽 위 벽 높이에 하나)과 천장 등
  const roomTop = Math.max(2.4, ...W.walls.filter((w) => w.box.level !== 2).map((w) => w.baseY + w.height));
  const ceilingSpecs: CeilingSpec[] = isRoom && W.ceilings.length === 0
    ? [{ level: 1, x1: W.house.x1, x2: W.house.x2, z1: W.house.z1, z2: W.house.z2, y: roomTop - 0.01 }]
    : W.ceilings;
  if (isRoom) {
    const lamp = new THREE.PointLight('#ffe7c4', 9, Math.max(8, reach * 4), 2);
    lamp.position.set(centre.x, roomTop - 0.35, centre.z);
    scene.add(lamp);
  }

  // ───────── 재질
  const texFor = (t: THREE.Texture, w: number, d: number, per = 2) => {
    const c = keep(t.clone());
    c.repeat.set(Math.max(1, w / per), Math.max(1, d / per));
    c.needsUpdate = true;
    return c;
  };
  const baseTex = {
    oak: keep(T.planks(FLOOR1.oak, 7)),
    black: keep(T.planks(FLOOR2.floor, 9, 'rgba(255,255,255,0.05)')),
    redstone: keep(T.tiles(FLOOR1.redstone, '#5e3127', 3)),
    tile: keep(T.tiles(FLOOR1.tile, '#a99c86', 5)),
    porch: keep(T.tiles(EXTERIOR.stone, '#8d8577', 2)),
    lawn: keep(T.lawn(LAWN_BY_SEASON[opt.season])),
    plasterExt: keep(T.plaster(EXTERIOR.wall, 21, 0.045)),
    plaster1: keep(T.plaster(FLOOR1.wallTop, 22, 0.03)),
    plaster2: keep(T.plaster(FLOOR2.wall, 23, 0.025)),
  };
  const std = (p: THREE.MeshStandardMaterialParameters) => keep(new THREE.MeshStandardMaterial(p));
  const wallMat = {
    ext: std({ map: baseTex.plasterExt, bumpMap: baseTex.plasterExt, bumpScale: 0.6, roughness: 0.95 }),
    int1: std({ map: baseTex.plaster1, bumpMap: baseTex.plaster1, bumpScale: 0.4, roughness: 0.9 }),
    int2: std({ map: baseTex.plaster2, bumpMap: baseTex.plaster2, bumpScale: 0.4, roughness: 0.75 }),
    stonewall: std({ color: EXTERIOR.stoneWall, roughness: 1 }),
  };
  const trim = {
    wainscot: std({ map: keep(T.planks([FLOOR1.wainscot, '#634029', '#55351f'], 41)), roughness: 0.6 }),
    capRail: std({ color: FLOOR1.walnut, roughness: 0.45 }),
    crown1: std({ color: '#f4ead6', roughness: 0.8 }),
    band2: std({ color: FLOOR2.lacquer, roughness: 0.3, metalness: 0.1 }),
    silver: std({ color: FLOOR2.silver, roughness: 0.25, metalness: 0.9 }),
    plinth: std({ color: EXTERIOR.base, roughness: 1 }),
    frame: std({ color: EXTERIOR.trim, roughness: 0.6 }),
    frame2: std({ color: '#1b1b1d', roughness: 0.35, metalness: 0.2 }),
    tread: std({ map: keep(T.planks(FLOOR1.oak, 13)), roughness: 0.6 }),
    tread2: std({ color: '#2a2522', roughness: 0.4 }),
    rail: std({ color: FLOOR1.walnut, roughness: 0.4 }),
  };
  const glass = std({ color: '#a8c3d3', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, emissive: '#dfeaf2', emissiveIntensity: 0.12, depthWrite: false });
  const ceilingMat = { 1: std({ color: '#f1e8d6', roughness: 0.95 }), 2: std({ color: '#2b2622', roughness: 0.9 }) } as const;
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
  scene.add(ground, level1, level2, roof, ceilings);
  const levelGroup = (lv: 0 | 1 | 2) => (lv === 2 ? level2 : level1);
  const baseOf = (lv: 0 | 1 | 2) => (lv === 2 ? W.floor2 : 0);
  const occluders: THREE.Mesh[] = [];
  const cuttable: Cut[] = [];
  const hideOnCut: Array<{ obj: THREE.Object3D; level: Level }> = [];

  // 바닥
  const indoorAt = (lv: Level, x: number, z: number) =>
    W.floors.some((f) => f.level === lv && f.mat !== 'lawn' && f.mat !== 'porch' && x > f.x1 && x < f.x2 && z > f.z1 && z < f.z2);
  for (const f of W.floors) {
    const w = f.x2 - f.x1;
    const d = f.z2 - f.z1;
    const t = f.mat === 'oak' ? baseTex.oak : f.mat === 'blackwood' ? baseTex.black : f.mat === 'redstone' ? baseTex.redstone
      : f.mat === 'tile' ? baseTex.tile : f.mat === 'porch' ? baseTex.porch : baseTex.lawn;
    const per = f.mat === 'lawn' ? 4 : f.mat === 'porch' || f.mat === 'redstone' ? 1.6 : 2.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std({ map: texFor(t, w, d, per), roughness: f.mat === 'blackwood' ? 0.4 : f.mat === 'lawn' ? 1 : 0.7 }));
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
  for (const c of ceilingSpecs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.x2 - c.x1, c.z2 - c.z1), ceilingMat[c.level]);
    m.rotation.x = Math.PI / 2;
    m.position.set((c.x1 + c.x2) / 2, c.y, (c.z1 + c.z2) / 2);
    m.receiveShadow = true;
    ceilings.add(m);
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
      if (w.style === 'ext') {
        const arr = Array<THREE.Material>(6).fill(outerMat);
        for (const s of sides) arr[w.axis === 'x' ? (s > 0 ? 4 : 5) : s > 0 ? 0 : 1] = inner;
        material = arr;
      }
      const m = new THREE.Mesh(geo, material);
      const along = (p.a + p.b) / 2;
      m.position.set(w.axis === 'x' ? along : lineOf(w), w.baseY + (p.y0 + p.y1) / 2, w.axis === 'x' ? lineOf(w) : along);
      m.scale.y = p.y1 - p.y0;
      m.userData.base = material;
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      if (w.style === 'stonewall') continue;
      occluders.push(m);
      cuttable.push({ mesh: m, level: lv, base: floorBase, y0: off + p.y0, y1: off + p.y1 });
      // 바깥벽 밑동의 돌 띠(바깥쪽)
      if (w.style === 'ext' && p.y0 === 0) {
        for (const s of [-1, 1] as Side[]) if (!sides.includes(s)) parent.add(strip(w, p.a, p.b, 0, Math.min(0.45, p.y1), s, 0.03, trim.plinth));
      }
      for (const s of sides) {
        if (p.y0 === 0) {
          if (lv === 1) {
            // 1층: 허리 높이 월넛 징두리판과 손잡이 띠
            const top = Math.min(0.9, p.y1);
            parent.add(strip(w, p.a, p.b, 0, top, s, 0.015, trim.wainscot));
            if (p.y1 >= 0.92) parent.add(strip(w, p.a, p.b, 0.88, 0.93, s, 0.035, trim.capRail));
          } else {
            // 2층: 옻칠 검정 아랫단과 은빛 줄
            const top = Math.min(0.75, p.y1);
            parent.add(strip(w, p.a, p.b, 0, top, s, 0.012, trim.band2));
            if (p.y1 >= 0.77) parent.add(strip(w, p.a, p.b, 0.75, 0.765, s, 0.02, trim.silver));
          }
        }
        if (p.y1 >= w.height - 0.01 && w.height > 2) {
          const crown = strip(w, p.a, p.b, w.height - 0.07, w.height, s, 0.04, lv === 1 ? trim.crown1 : trim.silver);
          parent.add(crown);
          hideOnCut.push({ obj: crown, level: lv });
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
      if (len > 1.0) put(0, 0, 0, 0.04, h, 0.05, fm);
      for (const s of interiorSides(w)) put(0, -h / 2 - 0.02, s * (thick / 2 + 0.05), len + 0.1, 0.04, 0.12, lv === 2 ? trim.band2 : trim.capRail);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== glass) (o as THREE.Mesh).castShadow = true; });
      levelGroup(w.box.level).add(g);
      hideOnCut.push({ obj: g, level: lv });
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
    for (const s of interiorSides(pseudo)) {
      levelGroup(h.box.level).add(strip(pseudo, a - 0.07, a, 0, top + 0.07, s, 0.02, mt), strip(pseudo, b, b + 0.07, 0, top + 0.07, s, 0.02, mt), strip(pseudo, a - 0.07, b + 0.07, top, top + 0.07, s, 0.02, mt));
    }
  }

  // 닫힌 문짝
  const doorWood = std({ map: keep(T.planks(['#7a5134', '#6c472e', '#82583a'], 31)), roughness: 0.65 });
  const doorLacquer = std({ color: FLOOR2.lacquer, roughness: 0.25, metalness: 0.1 });
  const knobBrass = std({ color: FLOOR1.brass, metalness: 0.85, roughness: 0.3 });
  const knobSilver = std({ color: FLOOR2.silver, metalness: 0.92, roughness: 0.25 });
  for (const d of W.doors) {
    if (!d.closed) continue;
    const b = d.box;
    const lv = (b.level === 2 ? 2 : 1) as Level;
    const len = d.axis === 'x' ? b.x2 - b.x1 : b.z2 - b.z1;
    const geo = d.axis === 'x' ? uvBox(len, 1, 0.05, d.height) : uvBox(0.05, 1, len, d.height);
    const m = new THREE.Mesh(geo, d.style === 'wood' ? doorWood : doorLacquer);
    m.position.set((b.x1 + b.x2) / 2, d.baseY + d.height / 2, (b.z1 + b.z2) / 2);
    m.scale.y = d.height;
    m.userData.base = m.material;
    m.castShadow = m.receiveShadow = true;
    levelGroup(b.level).add(m);
    cuttable.push({ mesh: m, level: lv, base: d.baseY, y0: 0, y1: d.height });
    for (const s of [-1, 1]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), d.style === 'wood' ? knobBrass : knobSilver);
      if (d.axis === 'x') k.position.set(m.position.x + len * 0.38, d.baseY + 1.0, m.position.z + s * 0.05);
      else k.position.set(m.position.x + s * 0.05, d.baseY + 1.0, m.position.z + len * 0.38);
      levelGroup(b.level).add(k);
      hideOnCut.push({ obj: k, level: lv });
    }
  }

  // ───────── 문패: 이름 있는 문마다 작은 나무 판(앞뒤 두 면이 글 한 장을 함께 쓴다). 닫힌 문은 1.55m, 열린 문은 문틀 위.
  // 손님에게만 보이는 이름(doorNames, 방 slug → 이름)이 있으면 그 글로 덮는다
  type Plate = { slug?: string; label: string; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  const plates: Plate[] = [];
  let doorNames: Record<string, string> = { ...(opt.doorNames ?? {}) };
  const plateGeo = keep(new THREE.PlaneGeometry(0.46, 0.125));
  const drawPlate = (pl: Plate) => {
    const g = pl.canvas.getContext('2d');
    if (!g) return;
    const w = pl.canvas.width, h = pl.canvas.height;
    const raw = (pl.slug && doorNames[pl.slug]) || pl.label;
    const text = String(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 16);
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
    let size = 60;
    g.font = `600 ${size}px ${LABEL_FONT}`;
    while (size > 26 && g.measureText(text).width > w - 64) g.font = `600 ${(size -= 2)}px ${LABEL_FONT}`;
    g.fillStyle = '#fbf1de';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
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
      levelGroup(b.level).add(m);
      hideOnCut.push({ obj: m, level: lv });
    }
  }
  const setDoorNames = (names: Record<string, string>) => {
    doorNames = names && typeof names === 'object' ? { ...names } : {};
    plates.forEach(drawPlate);
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
    // 두 층에 걸친 난간은 2층에서는 계단 구멍 둘레 난간이 된다
    if (b.level === 0) {
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= n; i++) {
        const u = s0 + ((s1 - s0) * i) / n;
        const x = longX ? u : lx, z = longX ? lz : u;
        g.add(railPost(x, W.floor2, z, 0.95));
        const p = new THREE.Vector3(x, W.floor2 + 0.95, z);
        if (prev) g.add(railBar(prev, p));
        prev = p;
      }
    }
    level1.add(g);
  }

  // ───────── 집 바깥 도형
  const columnMat = std({ color: EXTERIOR.column, roughness: 0.9 });
  const archMat = std({ map: baseTex.plasterExt, roughness: 0.95 });
  const roofMat = std({ color: EXTERIOR.roof, roughness: 0.85 });
  const roofInside = std({ map: keep(T.planks(['#6e5643', '#644d3b', '#77604c'], 51)), roughness: 0.8 });
  const gableMat = std({ map: baseTex.plasterExt, roughness: 0.95, side: THREE.DoubleSide });
  const addProp = (p: Prop) => {
    if (p.type === 'column') {
      const c = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.w), columnMat);
      c.position.set(p.x, p.h / 2, p.z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.12, 0.25, p.w + 0.12), columnMat);
      base.position.set(p.x, 0.125, p.z);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.1, 0.14, p.w + 0.1), columnMat);
      cap.position.set(p.x, p.h - 0.07, p.z);
      ground.add(c, base, cap);
    } else if (p.type === 'arch') {
      const r = p.span / 2 - 0.22;
      const a = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 10, 32, Math.PI), archMat);
      a.position.set(p.x, p.spring, p.z);
      if (p.axis === 'z') a.rotation.y = Math.PI / 2;
      const fill = new THREE.Mesh(p.axis === 'x' ? new THREE.BoxGeometry(p.span, 0.3, 0.36) : new THREE.BoxGeometry(0.36, 0.3, p.span), archMat);
      fill.position.set(p.x, p.spring + r - 0.02, p.z);
      ground.add(a, fill);
    } else if (p.type === 'slab') {
      // 지붕판 밑면은 집 안에서 보이는 천장이다(계단 위처럼 천장판이 없는 곳)
      const under = p.part === 'roof' ? (p.y > W.floor2 + 0.5 ? ceilingMat[2] : ceilingMat[1]) : archMat;
      const top = p.part === 'porch' ? archMat : roofMat;
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.x2 - p.x1, p.t, p.z2 - p.z1), [top, top, top, under, top, top]);
      m.position.set((p.x1 + p.x2) / 2, p.y, (p.z1 + p.z2) / 2);
      (p.part === 'roof' ? roof : ground).add(m);
    } else {
      // 박공: 비탈 두 장(바깥 기와색, 안쪽 나무 천장)과 끝 삼각벽
      const along = p.ridgeAxis === 'x' ? p.x2 - p.x1 : p.z2 - p.z1;
      const half = (p.ridgeAxis === 'x' ? p.z2 - p.z1 : p.x2 - p.x1) / 2;
      const mid = p.ridgeAxis === 'x' ? (p.z1 + p.z2) / 2 : (p.x1 + p.x2) / 2;
      const rise = p.ridge - p.eave;
      const slope = Math.atan2(rise, half);
      const len = Math.hypot(half, rise) + 0.35;
      for (const s of [1, -1]) {
        const mats = [roofMat, roofMat, roofMat, roofInside, roofMat, roofMat];
        const geo = p.ridgeAxis === 'x' ? new THREE.BoxGeometry(along + 0.5, 0.16, len) : new THREE.BoxGeometry(len, 0.16, along + 0.5);
        const m = new THREE.Mesh(geo, mats);
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
  if (LOOK.props) W.props.forEach(addProp);
  ground.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  // 전망: 마당 밖 평지 대신 뒤로 바위산, 앞으로 산자락 동네(집 세계에만). 손가락 기기는 나무·집을 절반 이하로
  let scenery: Scenery | null = null;
  if (LOOK.scenery) {
    scenery = buildScenery(W, opt.season, opt.coarse);
    scene.add(scenery.group);
  }

  // ───────── 가구
  const fm = makeFurnitureMats();
  Object.values(fm).forEach((v) => (Array.isArray(v) ? v.forEach((x) => keep(x)) : keep(v)));
  const ceilingAt = (f: Furniture) => {
    const x = (f.x1 + f.x2) / 2, z = (f.z1 + f.z2) / 2;
    const c = ceilingSpecs.find((c) => c.level === f.level && x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2);
    return c ? c.y - baseOf(f.level) : f.level === 1 ? W.floor2 : 2.5;
  };
  const furn = buildFurniture(W.furniture, fm, { floor2: W.floor2, ceilingAt });
  for (const child of [...furn.byLevel[1].children]) {
    if (child.position.z > W.house.z2 + 0.01) ground.add(child);
    else level1.add(child);
  }
  if (furn.byLevel[2].children.length) level2.add(...furn.byLevel[2].children);
  for (const child of level2.children) if (child.userData.kind === 'ridgeBeam') hideOnCut.push({ obj: child, level: 2 });
  for (const g of [level1, level2, ground]) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.castShadow) return;
      const mat = m.material as THREE.Material;
      if (!mat.transparent && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) m.castShadow = m.receiveShadow = true;
    });
  }
  scene.updateMatrixWorld(true);
  // 빛은 숨기는 묶음 밖으로(숨김마다 셰이더를 다시 짓지 않게, 대신 세기를 0으로)
  for (const l of furn.lights) scene.attach(l.light);

  // ───────── 내 캐릭터(3인칭에서만 보인다)와 발밑 그림자. 다른 사람도 같은 그림자 판을 함께 쓴다
  // 사진 캐릭터는 그림이 오기 전과 실패했을 때 보일 인형이 필요하다: 마지막으로 꾸민 인형(없으면 옛 색)
  let myLook: CharacterLook = opt.look ?? { kind: 'doll', doll: dollFromColor(opt.dollColor) };
  let myDoll: DollLook = myLook.kind === 'doll' ? myLook.doll : dollFromColor(opt.dollColor);
  const makeMe = () => createAvatar({ look: myLook, fallback: myDoll, name: opt.name ?? null, reducedMotion: opt.reducedMotion });
  let me = makeMe();
  scene.add(me.group);
  const shadowTex = keep(T.blob());
  const blobGeo = keep(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2));
  const blobMat = keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  const blob = new THREE.Mesh(blobGeo, blobMat);
  scene.add(blob);

  // ───────── 상태
  let body: Body = { x: W.spawn.x, z: W.spawn.z, y: 0, level: 1 };
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
  let landed = false;
  let dip = 0;
  let fpPhase = 0;
  let fpAmt = 0;
  /** 지난 프레임에 실제로 움직인 빠르기(m/s, 캐릭터 걸음에 쓴다)와 달리기 여부 */
  let speedNow = 0;
  let runNow = false;
  /** 자동 걷기 */
  let path: { run: PathRun; cb: { onArrive?: () => void; onCancel?: () => void } } | null = null;
  /** 화면을 끌었는지(자동 걷기를 멈추는 손 움직임) */
  let dragged = false;
  /** 내 말풍선 글과 사라지는 때(performance.now 기준). 캐릭터를 바꿔도 이어 붙인다 */
  let myBubble = '';
  let myBubbleUntil = 0;
  const keys = new Set<string>();
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
  const ray = new THREE.Raycaster();
  let ghosted: THREE.Mesh[] = [];
  let lastNear: Hotspot | null = null;
  let lastPlace = '';
  const el = renderer.domElement;

  const setView = (v: View) => {
    if (v === view) return;
    view = v;
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
  const KEYMAP: Record<string, string> = {
    w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', d: 'r', arrowleft: 'tl', arrowright: 'tr', shift: 'run',
  };
  // 입력칸(input·textarea·contenteditable) 안에서 온 키, 한글 조합 중인 키는 받지 않는다(말하기 칸에서 WASD로 걷지 않게)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!shouldHandleShortcut(e)) return;
    const k = e.key.toLowerCase();
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
      if (lastNear && !paused) {
        e.preventDefault();
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
      keys.add(a);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const a = KEYMAP[e.key.toLowerCase()];
    if (a) keys.delete(a);
  };
  const onBlur = () => {
    keys.clear();
    lookStick.x = lookStick.y = 0;
  };
  // 입력칸으로 초점이 옮겨 가면 누르고 있던 걷기 키를 놓는다(keyup이 입력칸으로 가도 계속 걷지 않게)
  const onFocusIn = (e: FocusEvent) => { if (isEditingTarget(e.target)) keys.clear(); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focusin', onFocusIn);
  const jump = () => {
    if (paused || hop.air) return;
    hop = hopStart(hop);
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
  const cut = (v: number) => Math.max(-MOUSE_JUMP, Math.min(MOUSE_JUMP, v || 0));
  const mouseLook = (dx: number, dy: number) => look(cut(dx), cut(dy), MOUSE_YAW, MOUSE_PITCH);
  const pitchNow = () => (view === 'first' ? pitch1 : pitch3);
  // 움직임이 이어지는 중인가: 프레임이 여럿(3개 넘게) 지나도록 움직임이 없고 STROKE_GAP도 지났으면 쉰 것이다.
  // 화면이 느리거나 한 프레임이 길게 걸려도(움직이는 동안에는 프레임마다 움직임이 온다) 한 손짓을 둘로 자르지 않는다.
  const strokeLive = (now: number) => {
    const l = stroke[stroke.length - 1];
    return Boolean(l) && !(frames - l.f > 3 && now - l.t > STROKE_GAP);
  };
  /** 버튼 없이 둘러보고, 실제로 돌아간 양(높이 한계 반영)을 지금 움직임 묶음에 적는다 */
  const hoverLook = (dx: number, dy: number) => {
    const y0 = yaw, p0 = pitchNow();
    mouseLook(dx, dy);
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
        if (!paused) mouseLook(dx, dy);
        return;
      }
      // 단추·카드 둘레와 화면 가장자리에서는 돌지 않는다. 단추 둘레에 들어서면 뻗는 동안 돈 만큼 되돌린다.
      const zone = zoneOf(e.clientX, e.clientY);
      markLook(!zone);
      if (zone === 'ui') { enterUi(); return; }
      nearUi = false;
      if (zone || paused) return;
      hoverLook(dx, dy);
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      pointers.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (view === 'third') dist = Math.min(11, Math.max(3, dist * (pinch / Math.max(1, d))));
      pinch = d;
      return;
    }
    look(e.clientX - p.x, e.clientY - p.y);
    const movedNow = p.moved + Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
    if (movedNow > 6) dragged = true;
    pointers.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY, moved: movedNow });
  };
  const onUp = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    // 마우스로 화면을 한 번 누르면(끌지 않고) 1인칭 시선 잠금: 마우스만 움직여 둘러본다. Esc로 풀린다.
    if (p && e.pointerType === 'mouse' && view === 'first' && !coarse && p.moved < 4 && performance.now() - p.t < 350 && !paused) {
      // 요즘 브라우저는 Promise를 돌려주고, 거절(문서가 안 보이는 중 등)을 처리하지 않으면 페이지 오류가 된다
      try {
        const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => { /* 잠금 거절: 끝없이 둘러보기만 빠지고 마우스 둘러보기는 그대로 */ });
      } catch { /* 지원하지 않는 브라우저 */ }
    }
  };
  const onLockedMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== el || paused) return;
    mouseLook(e.movementX, e.movementY);
  };
  const onLockChange = () => opt.onPointerLock?.(document.pointerLockElement === el);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (view === 'third') dist = Math.min(11, Math.max(3, dist * (1 + Math.sign(e.deltaY) * 0.08)));
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('mousemove', onLockedMove);
  document.addEventListener('pointerlockchange', onLockChange);

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    // 그리는 화소 수에 상한을 둔다(큰 모니터·레티나에서 GPU 메모리가 쌓여 브라우저가 3D를 끄는 일을 줄인다)
    const cap = opt.coarse ? 1.5 : 2;
    const budget = opt.coarse ? 2.2e6 : 4.2e6;
    renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(budget / (w * h)))));
    renderer.setSize(w, h, false);
    el.style.width = '100%';
    el.style.height = '100%';
    camera.aspect = w / h;
    camera.fov = fovFor(view, camera.aspect);
    camera.updateProjectionMatrix();
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
  const endPath = (why: 'arrive' | 'cancel' | 'quiet') => {
    const p = path;
    path = null;
    if (!p || why === 'quiet') return;
    try { (why === 'arrive' ? p.cb.onArrive : p.cb.onCancel)?.(); } catch { /* 화면 쪽 오류가 그리기를 멈추지 않게 */ }
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
    if (faceYaw !== undefined && Number.isFinite(faceYaw)) yaw = faceYaw;
    face = yaw + Math.PI;
    hop = GROUNDED;
    endPath('quiet');
    camPos.set(0, 0, 0);
    stroke = [];
    undo = null;
    return true;
  };

  const walkPath = (points: Array<{ x: number; z: number; level: Level }>, cb?: { onArrive?: () => void; onCancel?: () => void }) => {
    const pts = (Array.isArray(points) ? points : []).map((p) => ({ x: Number(p.x), z: Number(p.z), level: (p.level === 2 ? 2 : 1) as Level }));
    path = { run: startPath(pts), cb: cb ?? {} };
  };

  // ───────── 다른 사람: 목록마다 캐릭터 하나. 받은 자리로 0.12초 시정수로 따라가고, 같은 층 사람만 보인다
  type Other = { av: Avatar; shadow: THREE.Mesh; p: RemotePlayer; key: string; x: number; y: number; z: number; face: number; speed: number; bubbleKey: string; bubbleUntil: number };
  const others = new Map<string, Other>();
  let othersDrawn = 0;
  const finite = (p: RemotePlayer) => [p.x, p.y, p.z, p.yaw].every(Number.isFinite);
  const dropOther = (o: Other) => { o.av.dispose(); o.shadow.removeFromParent(); };
  const setOthers = (players: RemotePlayer[]) => {
    const seen = new Set<string>();
    for (const p of Array.isArray(players) ? players : []) {
      if (!p || typeof p.id !== 'string' || !finite(p) || seen.has(p.id)) continue;
      seen.add(p.id);
      let o = others.get(p.id);
      // 겉모습(꾸민 인형·사진 캐릭터, 없으면 옛 색)이 바뀌면 캐릭터를 새로 만든다(자리는 이어서, 말풍선은 아래에서 다시 붙는다)
      const lk = lookKey(p.look, p.color);
      const was = o && o.key !== lk ? o : undefined;
      if (was) { dropOther(was); others.delete(p.id); o = undefined; }
      if (!o) {
        const av = createAvatar({ look: p.look ?? null, color: p.color, name: p.name || '손님', reducedMotion: opt.reducedMotion, shadow: !coarse });
        const shadow = new THREE.Mesh(blobGeo, blobMat);
        scene.add(av.group, shadow);
        o = { av, shadow, p, key: lk, x: was?.x ?? p.x, y: was?.y ?? p.y, z: was?.z ?? p.z, face: was?.face ?? p.yaw + Math.PI, speed: 0, bubbleKey: '', bubbleUntil: 0 };
        others.set(p.id, o);
      }
      o.p = p;
      o.av.setName(p.name || '손님');
      const key = p.bubble && p.bubbleAt ? `${p.bubbleAt}:${p.bubble}` : '';
      if (key && key !== o.bubbleKey) {
        o.bubbleKey = key;
        // 받은 때가 앞서 있어도(시계 차) 지금부터 6초를 넘지 않게
        const left = Math.min(BUBBLE_MS, BUBBLE_MS - (Date.now() - (p.bubbleAt ?? 0)));
        if (left > 0) { o.av.setBubble(p.bubble ?? null); o.bubbleUntil = performance.now() + left; }
      }
    }
    for (const [id, o] of others) if (!seen.has(id)) { dropOther(o); others.delete(id); }
  };
  const updateOthers = (dt: number, unitsPerPx: number) => {
    const k = follow(dt, OTHER_TAU);
    const now = performance.now();
    othersDrawn = 0;
    for (const o of others.values()) {
      const p = o.p;
      const px = o.x, pz = o.z;
      if (Math.hypot(p.x - o.x, p.z - o.z) > OTHER_SNAP || Math.abs(p.y - o.y) > 2.5) { o.x = p.x; o.y = p.y; o.z = p.z; }
      else { o.x += (p.x - o.x) * k; o.y += (p.y - o.y) * k; o.z += (p.z - o.z) * k; }
      const mv = Math.hypot(o.x - px, o.z - pz);
      o.speed += ((dt > 0 ? mv / dt : 0) - o.speed) * follow(dt, 0.15);
      // 걷는 중이면 움직이는 쪽을, 서 있으면 그 사람이 보는 쪽을 본다
      const want = mv > 0.002 ? Math.atan2(o.x - px, o.z - pz) : p.yaw + Math.PI;
      o.face += angleDiff(o.face, want) * follow(dt, 0.1);
      if (o.bubbleUntil && now > o.bubbleUntil) { o.bubbleUntil = 0; o.av.setBubble(null); }
      const show = p.level === body.level && Math.hypot(o.x - camera.position.x, o.z - camera.position.z) < OTHER_FAR;
      o.av.group.visible = o.shadow.visible = show;
      if (!show) continue;
      othersDrawn++;
      o.av.group.position.set(o.x, o.y, o.z);
      o.av.group.rotation.y = o.face;
      o.shadow.position.set(o.x, o.y + 0.02, o.z);
      o.av.setPixelScale(unitsPerPx);
      const spd = p.moving ? Math.min(RUN, Math.max(0.8, o.speed)) : o.speed > 0.3 ? o.speed : 0;
      o.av.update(dt, { speed: spd, running: spd > 2.6, airborne: false, landing: false });
    }
  };

  // ───────── 매 프레임
  let raf = 0;
  let last = performance.now();
  let running = true;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    frames++;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    applyUndo(now);
    if (!paused) {
      if (keys.has('tl')) yaw += 1.8 * dt;
      if (keys.has('tr')) yaw -= 1.8 * dt;
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
    if (turnStick && !paused && Math.abs(stick.x) > 0.04) yaw -= stick.x * STICK_TURN * dt;
    let ix = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + (turnStick ? 0 : stick.x);
    let iy = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) + stick.y;
    if (paused) ix = iy = 0;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const before = { x: body.x, z: body.z };
    // 자동 걷기는 손으로 움직이면(걷기·돌기 키, 두 스틱, 화면 끌기) 멈춘다
    if (path && !paused && (mag > 0.05 || keys.has('tl') || keys.has('tr') || Math.hypot(lookStick.x, lookStick.y) > 0.05
      || Math.abs(stick.x) > 0.05 || dragged)) endPath('cancel');
    dragged = false;
    moving = mag > 0.05;
    runNow = false;
    if (path && !paused) {
      const r = pathStep(path.run, body, dt, WALK, (b, dx, dz) => step(W.physics, b, dx, dz));
      body = r.body;
      moving = r.heading !== null;
      // 1인칭은 시선도 다음 점 쪽으로 천천히 돈다
      if (r.heading !== null && view === 'first') yaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, angleDiff(yaw, r.heading) * follow(dt, 0.35)));
      if (r.done) endPath(r.done === 'arrive' ? 'arrive' : 'cancel');
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
    // 점프: 보이는 높이만 바뀌고 충돌·층 판정은 그대로
    const hs = hopStep(hop, dt);
    hop = hs.hop;
    landed = hs.landed;
    const reduce = opt.reducedMotion;
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
    level2.visible = showL2;
    roof.visible = !dollhouse;
    ceilings.visible = !third || isRoom;
    for (const l of furn.lights) l.light.intensity = l.level === 2 && !showL2 ? 0 : l.base;
    const cutLevel: 0 | 1 | 2 = !dollhouse ? 0 : body.y > W.floor2 / 2 ? 2 : 1;
    const ease = opt.reducedMotion ? 1 : 1 - Math.pow(0.002, dt);
    for (const c of cuttable) {
      const top = cutLevel === c.level ? Math.min(c.y1, Math.max(c.y0, CUT_H)) : c.y1;
      const want = Math.max(0.001, top - c.y0);
      const cur = c.mesh.scale.y;
      const h = Math.abs(cur - want) < 0.005 ? want : cur + (want - cur) * ease;
      c.mesh.scale.y = h;
      c.mesh.position.y = c.base + c.y0 + h / 2;
      c.mesh.visible = h > 0.02;
    }
    for (const o of hideOnCut) o.obj.visible = cutLevel !== o.level;

    for (const m of ghosted) m.material = m.userData.base as THREE.Material | THREE.Material[];
    ghosted = [];
    if (third) {
      target.set(body.x, body.y + AIM_H, body.z);
      const minPitch = isRoom ? 0.12 : inHouse ? 0.85 : 0.12;
      const pt = Math.max(pitch3, minPitch);
      const d = isRoom ? roomCamera(pt) : inHouse ? Math.min(dist, 6.5) : dist;
      const want = new THREE.Vector3(
        target.x + Math.sin(yaw) * Math.cos(pt) * d,
        target.y + Math.sin(pt) * d,
        target.z + Math.cos(yaw) * Math.cos(pt) * d,
      );
      if (opt.reducedMotion || camPos.lengthSq() === 0) camPos.copy(want);
      else camPos.lerp(want, 1 - Math.pow(0.0008, dt));
      camera.position.copy(camPos);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      // 인형을 가리는 벽은 비쳐 보이게
      const dir = new THREE.Vector3().subVectors(camPos, target);
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
      camPos.set(body.x + rx * b.x, body.y + EYE + hop.h + b.y - 0.07 * dip, body.z + rz * b.x);
      camera.position.copy(camPos);
      camera.lookAt(camPos.x - Math.sin(yaw) * Math.cos(pitch1), camPos.y + Math.sin(pitch1), camPos.z - Math.cos(yaw) * Math.cos(pitch1));
      if (b.roll) camera.rotateZ(b.roll);
      camera.updateMatrixWorld();
    }

    // 내 캐릭터: 3인칭에서만. 걸음에 맞춰 팔다리가 엇갈리고, 점프하면 쪼그렸다 늘어난다
    me.group.visible = blob.visible = third;
    if (third) {
      me.group.position.set(body.x, body.y + hop.h, body.z);
      me.group.rotation.y = face;
      me.update(dt, { speed: moving ? speedNow : 0, running: runNow, airborne: hop.air, landing: landed, vy: hop.v });
      blob.position.set(body.x, body.y + 0.02, body.z);
      blob.scale.setScalar(Math.max(0.55, 1 - hop.h * 0.8));
    }
    if (performance.now() > myBubbleUntil && myBubbleUntil) { myBubbleUntil = 0; me.setBubble(null); }
    // 이름표·말풍선은 화면에서 늘 같은 크기(카메라 1m 앞 1px의 길이)
    const unitsPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, el.clientHeight);
    me.setPixelScale(unitsPerPx);
    updateOthers(dt, unitsPerPx);
    if (opt.label) {
      if (opt.name !== undefined) opt.label.style.opacity = '0';
      else if (third) {
        const v = new THREE.Vector3(body.x, body.y + hop.h + 1.32, body.z).project(camera);
        const w = el.clientWidth;
        const h = el.clientHeight;
        opt.label.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
        opt.label.style.opacity = v.z < 1 ? '1' : '0';
      } else opt.label.style.opacity = '0';
    }

    const near = nearHotspot(body.level, body.x, body.z);
    if (near?.id !== lastNear?.id) {
      lastNear = near;
      opt.onNear(near);
    }
    const place = zoneAt(body.level, body.x, body.z, W);
    if (place !== lastPlace) {
      lastPlace = place;
      opt.onPlace(place);
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const onVisibility = () => {
    if (document.hidden && running) {
      cancelAnimationFrame(raf);
      running = false;
    } else if (!document.hidden && !running && !lost) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // 그래픽 문맥을 잃으면(GPU가 다시 시작되거나 3D 탭이 너무 많을 때) 그리기를 멈추고 화면에 알린다(얼어붙은 화면 대신)
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    running = false;
    opt.onLost?.();
  };
  el.addEventListener('webglcontextlost', onLost);

  // 브라우저 시험용 손잡이(좌표만, 개인 정보 없음)
  const debug = {
    get body() { return { ...body }; },
    get place() { return lastPlace; },
    get near() { return lastNear?.id ?? null; },
    get view() { return view; },
    get yaw() { return yaw; },
    get pitch() { return view === 'first' ? pitch1 : pitch3; },
    get flags() { return { level2: level2.visible, roof: roof.visible, ceilings: ceilings.visible, frames, kind: W.kind, scenery: Boolean(scenery) }; },
    get jumping() { return hop.air; },
    get hop() { return hop.h; },
    get auto() { return Boolean(path); },
    /** 지금 그려진 다른 사람 수(같은 층, 가까운 사람) */
    get others() { return othersDrawn; },
    /** 내 캐릭터가 지금 무엇으로 보이는지('doll' | 'photo')와 문패 수 */
    get character() { return me.shown(); },
    get plates() { return plates.map((p) => (p.slug && doorNames[p.slug]) || p.label); },
    setView,
    jump,
    walkPath: (pts: Array<{ x: number; z: number; level: Level }>) => walkPath(pts),
    // 시선을 코드로 정하면 마우스 되돌리기 기록도 버린다(그 앞의 움직임을 되돌리지 않게)
    teleport: (x: number, z: number, level: Level = 1, faceYaw?: number) => teleport(x, z, level, faceYaw),
    /** 검사 없이 그 자리에 둔다(시험용) */
    put(x: number, z: number, level: Level = 1) { body = { x, z, level, y: level === 2 ? W.floor2 : 0 }; camPos.set(0, 0, 0); stroke = []; undo = null; },
    look(y: number, p?: number) { yaw = y; if (p !== undefined) { if (view === 'first') pitch1 = p; else pitch3 = p; } camPos.set(0, 0, 0); stroke = []; undo = null; },
  };
  (window as unknown as { __jyWalk?: typeof debug }).__jyWalk = debug;

  const unit = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return {
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
        // 멈춘 사이 손을 뗀 신호를 놓쳐도 계속 돌지 않게
        lookStick.x = lookStick.y = 0;
        if (document.pointerLockElement === el) document.exitPointerLock();
      }
    },
    setView,
    getState() {
      return { x: body.x, z: body.z, y: body.y, level: body.level, yaw, pitch: view === 'first' ? pitch1 : pitch3, view, moving, jumping: hop.air, auto: Boolean(path) };
    },
    teleport,
    walkPath,
    cancelPath: () => endPath('quiet'),
    jump,
    setOthers,
    say(text) {
      const t = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
      me.setBubble(t || null);
      myBubble = t;
      myBubbleUntil = t ? performance.now() + BUBBLE_MS : 0;
    },
    setCharacter(look) {
      if (!look || (look.kind !== 'doll' && look.kind !== 'photo')) return;
      if (lookKey(look) === lookKey(myLook)) return;
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
    dispose() {
      cancelAnimationFrame(raf);
      running = false;
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
      el.removeEventListener('pointerleave', onLeave);
      coarseMq?.removeEventListener?.('change', onCoarse);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('focusin', onFocusIn);
      endPath('quiet');
      // 함께 쓰는 캐릭터 기하는 참조 수로 놓는다(장면을 훑어 지우기 전에 떼어 낸다)
      for (const o of others.values()) dropOther(o);
      others.clear();
      me.dispose();
      scenery?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      // 방을 드나들 때마다 컨트롤러를 새로 만들므로, 쓰레기 수거를 기다리지 않고 WebGL 문맥을 바로 놓는다
      renderer.forceContextLoss();
      el.removeEventListener('webglcontextlost', onLost);
      el.remove();
      delete (window as unknown as { __jyWalk?: unknown }).__jyWalk;
    },
  };
}
