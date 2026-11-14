// 사진 갤러리 액자 짓기(three.js). gallery.ts가 고른 자리에 틀·매트·그림등을 짓고(한 번 지으면 그대로라 함께 굽는다),
// 전시 목록에 따라 빈 액자에는 은은한 「곧 전시해요」 판을, 그림이 있는 액자에는 가까이 갔을 때만 그림을 싣는다.
// 휴대폰을 아끼려고: 그림은 같은 층 가까운 것만 몇 장까지, 긴 변을 줄여(휴대폰 512, 데스크탑 1024) 싣고, 멀어지면 내린다.
// 빈 액자 판은 액자마다 한 칸씩 그린 그림 묶음 한 장을 나눠 써서 층마다 한 번에 그린다.
// 목록을 다시 받으면 서명 주소가 모두 바뀌지만, 그림 열쇠(key)가 같은 그림은 그대로 두고 주소만 바꿔 적는다(다시 받지 않는다).
// 못 받은 그림은 그림마다 세어 두 번이면 이번에는 그만둔다(gallery-loads.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LABEL_FONT } from './avatar';
import { DECOR_SIZE } from './decor';
import { Batch, cbox, metalMat, pictureLightGeometry, place, vertexMat, washMaterial, washPlane } from './dress';
import type { FurnitureKit } from './furnish';
import { GALLERY, nearFrame, type NearOptions } from './gallery';
import { failAfter, keepArt, mayLoad, noteFail, type ArtFail } from './gallery-loads';
import { walkLang, walkTr, type Lang } from './lang';
import type { GalleryFrame, Hotspot, Level } from './types';

/** 빈 액자 판의 글(화면 말을 따른다. 전시물 제목은 옮기지 않는다) */
const SOON: Readonly<Record<Lang, string>> = { ko: '곧 전시해요', en: 'Coming soon' };

/**
 * 액자 하나의 전시물(서버가 손님에게만 준다): 제목, 그림 주소(서명 주소 또는 미리보기 주소), 그림 열쇠(그림이 바뀔 때만 바뀐다.
 * 없으면 주소를 열쇠로 쓴다)
 */
export type GalleryArt = { title: string; key?: string; image?: string; thumb?: string };

export type GalleryScene = {
  /** 전시 목록(액자 id → 전시물). null이면 아직 모른다(빈 매트), 빈 표면 모두 「곧 전시해요」 */
  setItems: (items: ReadonlyMap<string, GalleryArt> | null) => void;
  /** 매 프레임 부른다(안에서 0.25초마다): 가까운 액자 그림을 싣고, 먼 것은 내린다 */
  update: (level: Level, x: number, z: number, now: number) => void;
  /**
   * (level, x, z)에 선 사람 앞의 액자 살피기 자리. facing(보는 쪽)을 주면 그 액자를 보고 있을 때만. 없으면 null.
   * 거리·각을 바꾸려면 near 옵션(gallery.ts nearFrame)
   */
  near: (level: Level, x: number, z: number, facing?: { x: number; z: number }, o?: NearOptions) => Hotspot | null;
  stats: () => { frames: number; placeholders: number; loaded: number; loading: number; failed: number };
  /** 화면 말이 바뀌었다: 빈 액자 판의 글을 지금 말로 다시 그린다 */
  relabel: () => void;
  dispose: () => void;
};

export type GalleryTargets = { hide: (lv: Level) => THREE.Group };
export type GalleryOptions = {
  coarse: boolean;
  /** 화면이 바뀌었다(다시 그려야 한다) */
  onChange: () => void;
  /** 그림 주소가 낡은 것 같다(서명 주소가 끝남 등): 전시 목록을 다시 받아 setItems로 다시 준다 */
  onStale?: () => void;
};

/** 같은 층 이 거리(m) 안의 그림만 싣고, 이보다 멀어지면 내린다 */
const LOAD_NEAR = 7;
const UNLOAD_FAR = 10;
/** 한꺼번에 실어 두는 그림 수(휴대폰, 데스크탑)와 동시에 받는 수 */
const KEEP = { coarse: 8, fine: 16 } as const;
const PARALLEL = 2;
/** 그림 긴 변(px) */
const EDGE = { coarse: 512, fine: 1024 } as const;
/** 받은 파일 상한(이보다 크면 싣지 않는다) */
const MAX_BYTES = 12 * 1024 * 1024;
const TICK_MS = 250;

/** 층마다 틀 차림: 1층은 월넛 틀에 놋쇠 테, 2층은 은 틀에 먹색 테(장식 그림과 같은 짝). 매트는 미색 */
const LOOK = {
  1: { outer: '#4a2f1d', lip: '#c29a5b', mat: '#f1e8d6', board: '#e8decb', ink: '74,58,44', fw: 0.05, metalOuter: false },
  2: { outer: '#c9ccd1', lip: '#151515', mat: '#efede7', board: '#e4e1d9', ink: '52,50,48', fw: 0.034, metalOuter: true },
} as const;

type Slot = {
  f: GalleryFrame;
  /** 그림 자리(매트 안) 폭·높이와 앞뒤 자리(액자 뒤판에서) */
  iw: number; ih: number; artZ: number;
  /** 빈 액자 판 묶음 안의 칸(UV) */
  uv: [number, number, number, number];
};

/** 실린 그림: 어느 그림(열쇠)을 어느 주소로 받았는지 */
type Loaded = { key: string; url: string; mesh: THREE.Mesh; tex: THREE.CanvasTexture };

/** 액자 하나의 틀·뒤판·매트(그림 자리는 비운다). 장식 그림(dress.painting)과 같은 차림 */
function frameParts(s: Slot, wood: Batch, metal: Batch) {
  const f = s.f;
  const look = LOOK[f.level];
  const depth = GALLERY.depth;
  const fw = look.fw;
  const outer = look.metalOuter ? metal : wood, lip = look.metalOuter ? wood : metal;
  const m = place(f.x, f.y, f.z, f.yaw);
  for (const k of [-1, 1]) {
    outer.add(cbox(f.w, fw, depth, look.outer, 0, k * (f.h / 2 - fw / 2), depth / 2), m);
    outer.add(cbox(fw, f.h - fw * 2, depth, look.outer, k * (f.w / 2 - fw / 2), 0, depth / 2), m);
    lip.add(cbox(f.w - fw * 2, 0.012, 0.012, look.lip, 0, k * (f.h / 2 - fw - 0.006), depth - 0.006), m);
    lip.add(cbox(0.012, f.h - fw * 2, 0.012, look.lip, k * (f.w / 2 - fw - 0.006), 0, depth - 0.006), m);
  }
  wood.add(cbox(f.w - 0.02, f.h - 0.02, 0.012, '#2a211b', 0, 0, 0.006), m);
  wood.add(cbox(f.w - fw * 2, f.h - fw * 2, 0.006, look.mat, 0, 0, depth - 0.016), m);
}

function slotOf(f: GalleryFrame): Omit<Slot, 'uv'> {
  const fw = LOOK[f.level].fw;
  const iw0 = f.w - fw * 2, ih0 = f.h - fw * 2;
  const mat = Math.min(0.085, 0.11 * Math.min(iw0, ih0));
  return { f, iw: iw0 - mat * 2, ih: ih0 - mat * 2, artZ: GALLERY.depth - 0.0115 };
}

/** 글자가 칸 폭을 넘지 않게 글씨 크기를 줄인다 */
function fitFont(g: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number): number {
  let s = size;
  g.font = `${weight} ${s}px ${LABEL_FONT}`;
  while (s > 8 && g.measureText(text).width > max) g.font = `${weight} ${(s -= 1)}px ${LABEL_FONT}`;
  return s;
}

/**
 * 빈 액자 판 묶음: 액자마다 한 칸(그 액자의 그림 자리 비율), 은은한 「곧 전시해요」와 자리 번호.
 * paint(lang)은 같은 칸 배치로 글만 다른 말로 다시 그린다(화면 말을 바꿀 때)
 */
function placeholderAtlas(slots: Slot[], tile: number, lang: Lang): { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; paint: (lang: Lang) => void } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(slots.length)));
  const rows = Math.max(1, Math.ceil(slots.length / cols));
  const W = cols * tile, H = rows * tile;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const paint = (lang: Lang) => {
    g?.clearRect(0, 0, W, H);
    const soon = SOON[lang];
    slots.forEach((s, i) => {
      const look = LOOK[s.f.level];
      const a = s.iw / s.ih;
      // 칸 둘레를 조금 남긴다(작은 밉맵에서 옆 칸 색이 번지지 않게)
      const inner = tile - 8;
      const cw = a >= 1 ? inner : inner * a, ch = a >= 1 ? inner / a : inner;
      const x0 = (i % cols) * tile + (tile - cw) / 2, y0 = Math.floor(i / cols) * tile + (tile - ch) / 2;
      s.uv = [x0 / W, 1 - (y0 + ch) / H, (x0 + cw) / W, 1 - y0 / H];
      if (!g) return;
      g.fillStyle = look.board;
      g.fillRect(x0 - 3, y0 - 3, cw + 6, ch + 6);
      g.strokeStyle = `rgba(${look.ink},0.16)`;
      g.lineWidth = Math.max(1, tile / 160);
      const pad = Math.min(cw, ch) * 0.09;
      g.strokeRect(x0 + pad, y0 + pad, cw - pad * 2, ch - pad * 2);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const big = fitFont(g, soon, 600, Math.round(Math.min(cw * 0.15, ch * 0.13)), cw * 0.72);
      g.fillStyle = `rgba(${look.ink},0.6)`;
      g.fillText(soon, x0 + cw / 2, y0 + ch / 2 - big * 0.32);
      fitFont(g, s.f.id, 500, Math.round(big * 0.62), cw * 0.6);
      g.fillStyle = `rgba(${look.ink},0.5)`;
      g.fillText(s.f.id, x0 + cw / 2, y0 + ch / 2 + big * 0.72);
    });
  };
  paint(lang);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, tex, paint };
}

/** 그림 자리 판(액자 앞, 그림 자리 크기). uv를 주면 그 칸만 쓴다 */
function artPlane(s: Slot, uv?: [number, number, number, number]): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(s.iw, s.ih);
  if (uv) {
    const a = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) ? uv[2] : uv[0], a.getY(i) ? uv[3] : uv[1]);
  }
  g.translate(0, 0, s.artZ);
  return g.applyMatrix4(place(s.f.x, s.f.y, s.f.z, s.f.yaw));
}

/** 그림 한 장을 받아 그림 자리 비율의 캔버스에 담는다(잘라 내지 않고 다 보이게, 남는 곳은 비워 뒤의 매트가 보이게) */
async function drawArt(url: string, s: Slot, edge: number, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const r = await fetch(url, { signal, credentials: 'omit' });
  if (!r.ok) throw new Error(`http ${r.status}`);
  const blob = await r.blob();
  if (!blob.size || blob.size > MAX_BYTES || !/^image\/(jpeg|png|webp)$/.test(blob.type || 'image/jpeg')) throw new Error('bad image');
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    if (signal.aborted) throw new Error('aborted');
    const a = s.iw / s.ih;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(16, Math.round(a >= 1 ? edge : edge * a));
    canvas.height = Math.max(16, Math.round(a >= 1 ? edge / a : edge));
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2d');
    const k = Math.min(canvas.width / bmp.width, canvas.height / bmp.height);
    const w = bmp.width * k, h = bmp.height * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    return canvas;
  } finally {
    bmp.close();
  }
}

/**
 * 액자들을 짓는다. 틀·매트·그림등은 지금 to.hide(층)에 붙이므로(장면을 굽기 전에 부른다) 벽과 함께 구워지고,
 * 3인칭으로 그 층 벽을 낮출 때 함께 숨는다. 빈 액자 판과 그림은 나중에 바뀌므로 굽지 않는다(userData.live)
 */
export function buildGallery(frames: readonly GalleryFrame[], kit: FurnitureKit, to: GalleryTargets, opt: GalleryOptions): GalleryScene {
  const slots: Slot[] = frames.map((f) => ({ ...slotOf(f), uv: [0, 0, 1, 1] }));
  const byId = new Map(slots.map((s) => [s.f.id, s]));
  const coarse = opt.coarse;
  // ───────── 틀·매트·그림등(층마다 한 묶음)
  for (const lv of [1, 2] as const) {
    const mine = slots.filter((s) => s.f.level === lv);
    if (!mine.length) continue;
    const wood = new Batch(), metal = new Batch();
    const washes: THREE.BufferGeometry[] = [];
    for (const s of mine) {
      frameParts(s, wood, metal);
      const f = s.f;
      // 그림등: 액자 위 끝 조금 위 벽 면(배치가 액자 위에 천장·벽 꼭대기까지 여유를 남겨 둔다)
      const back = -0.006;
      const light = {
        level: lv, x: f.x + Math.sin(f.yaw) * back, y: f.y + f.h / 2 + DECOR_SIZE.lightAbove, z: f.z + Math.cos(f.yaw) * back,
        w: Math.min(0.62, Math.max(0.28, f.w * 0.55)), reach: DECOR_SIZE.lightReach, yaw: f.yaw, finish: lv === 2 ? 'silver' : 'brass',
      } as const;
      const { metal: mg, glow } = pictureLightGeometry(light);
      mg.forEach((g) => metal.add(g));
      glow.forEach((g) => wood.add(g));
      washes.push(washPlane(f, light));
    }
    const group = to.hide(lv);
    const woodMesh = wood.mesh(vertexMat(kit));
    if (woodMesh) { woodMesh.castShadow = true; woodMesh.receiveShadow = true; group.add(woodMesh); }
    const metalMesh = metal.mesh(metalMat(kit));
    if (metalMesh) { metalMesh.receiveShadow = true; group.add(metalMesh); }
    const wash = mergeGeometries(washes, false);
    washes.forEach((g) => g.dispose());
    if (wash) {
      const m = new THREE.Mesh(wash, washMaterial(kit));
      m.renderOrder = 2;
      group.add(m);
    }
  }

  // ───────── 빈 액자 판(전시 목록이 오면 그린다)
  let atlas: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; paint: (lang: Lang) => void } | null = null;
  /** 판에 그린 말(바뀌면 relabel이 다시 그린다) */
  let atlasLang: Lang | null = null;
  let boardMat: THREE.MeshStandardMaterial | null = null;
  const boards = new Map<Level, THREE.Mesh>();
  const ensureAtlas = () => {
    if (atlas) return;
    atlasLang = walkLang();
    atlas = placeholderAtlas(slots, coarse ? 192 : 256, atlasLang);
    boardMat = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.92, emissive: '#ffffff', emissiveMap: atlas.tex, emissiveIntensity: 0.1 });
  };
  const dropBoards = () => {
    for (const m of boards.values()) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    boards.clear();
  };

  // ───────── 그림(가까울 때만)
  let items: ReadonlyMap<string, GalleryArt> | null = null;
  const loaded = new Map<string, Loaded>();
  const loading = new Map<string, { key: string; url: string; ac: AbortController }>();
  const failed = new Map<string, ArtFail>();
  let staleAt = -Infinity;
  let tickAt = -Infinity;
  let disposed = false;
  const edge = coarse ? EDGE.coarse : EDGE.fine;
  const keep = coarse ? KEEP.coarse : KEEP.fine;
  /** 3D에 쓸 그림: 주소(휴대폰은 작은 그림이 있으면 그것, 아니면 큰 그림을 줄여서)와 열쇠(없으면 주소) */
  const artFor = (id: string): { key: string; url: string } | null => {
    const it = items?.get(id);
    const url = it ? (coarse ? it.thumb ?? it.image : it.image ?? it.thumb) ?? null : null;
    return it && url ? { key: it.key ?? url, url } : null;
  };
  const unload = (id: string) => {
    const l = loaded.get(id);
    if (!l) return;
    loaded.delete(id);
    l.mesh.removeFromParent();
    l.mesh.geometry.dispose();
    (l.mesh.material as THREE.Material).dispose();
    l.tex.dispose();
    const c = l.tex.image as HTMLCanvasElement | undefined;
    if (c) { c.width = 0; c.height = 0; }
  };
  const cancel = (id: string) => {
    loading.get(id)?.ac.abort();
    loading.delete(id);
  };
  const start = (s: Slot, art: { key: string; url: string }) => {
    const { key, url } = art;
    const ac = new AbortController();
    loading.set(s.f.id, { key, url, ac });
    drawArt(url, s, edge, ac.signal).then((canvas) => {
      if (disposed || ac.signal.aborted || loading.get(s.f.id)?.ac !== ac) { canvas.width = canvas.height = 0; return; }
      loading.delete(s.f.id);
      failed.delete(s.f.id);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      // 그림등 빛 판(더하기 섞기)은 벽과 매트만 밝히고 그림 위에는 얹지 않는다: 얹으면 어두운 색이 안개 낀 듯 바랜다.
      // 그래서 그림을 빛 판 뒤에 그리고(투명 목록, 그리는 순서 3), 그림등을 받은 만큼은 스스로 조금 밝힌다
      const mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.65, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.18, transparent: true, opacity: 1, depthWrite: true,
      });
      const mesh = new THREE.Mesh(artPlane(s), mat);
      mesh.renderOrder = 3;
      mesh.userData.live = true;
      mesh.receiveShadow = true;
      to.hide(s.f.level).add(mesh);
      loaded.set(s.f.id, { key, url, mesh, tex });
      opt.onChange();
    }, () => {
      if (loading.get(s.f.id)?.ac !== ac) return;
      loading.delete(s.f.id);
      if (ac.signal.aborted || disposed) return;
      // 서명 주소가 끝났을 수 있다: 이 그림의 첫 실패면 목록을 다시 받아 달라고 한다(너무 자주는 말고). 두 번째 실패면 그만둔다
      const now = performance.now();
      const r = noteFail(failed.get(s.f.id), key, url, now, staleAt);
      failed.set(s.f.id, r.fail);
      if (r.stale) { staleAt = now; opt.onStale?.(); }
    });
  };

  const setItems = (next: ReadonlyMap<string, GalleryArt> | null) => {
    items = next;
    // 그림이 바뀌었거나(열쇠가 다름) 빠진 것만 내린다. 같은 그림이면 주소만 바꿔 적는다(서명 주소는 받을 때마다 바뀐다)
    for (const [id, l] of [...loaded]) {
      const now = artFor(id);
      if (!keepArt(l, now)) unload(id);
      else l.url = now!.url;
    }
    for (const [id, l] of [...loading]) if (!keepArt(l, artFor(id))) cancel(id);
    for (const [id, f] of [...failed]) if (!failAfter(f, artFor(id))) failed.delete(id);
    dropBoards();
    if (items) {
      // 그림이 없는 액자에만 「곧 전시해요」 판(층마다 한 덩어리)
      const empty = slots.filter((s) => !items!.has(s.f.id));
      if (empty.length) {
        ensureAtlas();
        for (const lv of [1, 2] as const) {
          const parts = empty.filter((s) => s.f.level === lv).map((s) => artPlane(s, s.uv));
          if (!parts.length) continue;
          const merged = mergeGeometries(parts, false);
          parts.forEach((g) => g.dispose());
          if (!merged) continue;
          const mesh = new THREE.Mesh(merged, boardMat!);
          mesh.userData.live = true;
          mesh.receiveShadow = true;
          to.hide(lv).add(mesh);
          boards.set(lv, mesh);
        }
      }
    }
    tickAt = -Infinity;
    opt.onChange();
  };

  const update = (level: Level, x: number, z: number, now: number) => {
    if (disposed || !items || now - tickAt < TICK_MS) return;
    tickAt = now;
    const want = slots
      .filter((s) => s.f.level === level && artFor(s.f.id))
      .map((s) => ({ s, d: Math.hypot(s.f.x - x, s.f.z - z) }))
      .filter((q) => q.d <= LOAD_NEAR)
      .sort((p, q) => p.d - q.d)
      .slice(0, keep);
    const wanted = new Set(want.map((q) => q.s.f.id));
    for (const id of [...loaded.keys()]) {
      if (wanted.has(id)) continue;
      const s = byId.get(id)!;
      if (s.f.level !== level || Math.hypot(s.f.x - x, s.f.z - z) > UNLOAD_FAR || loaded.size > keep) { unload(id); opt.onChange(); }
    }
    for (const id of [...loading.keys()]) if (!wanted.has(id)) cancel(id);
    for (const { s } of want) {
      if (loading.size >= PARALLEL) break;
      const id = s.f.id;
      const art = artFor(id);
      if (!art || loaded.has(id) || loading.has(id)) continue;
      // 같은 그림을 두 번 못 받았으면 그만, 같은 주소로 실패했으면 잠시 뒤에(새 주소가 오면 바로)
      if (!mayLoad(failed.get(id), art.key, art.url, now)) continue;
      start(s, art);
    }
  };

  // 액자 앞 살피기 자리(제목은 전시 목록에서). 같은 액자면 같은 id라 화면의 「크게 보기」가 깜빡이지 않는다
  const near = (level: Level, x: number, z: number, facing?: { x: number; z: number }, o?: NearOptions): Hotspot | null => {
    const f = nearFrame(frames, level, x, z, facing, o);
    if (!f) return null;
    const title = items?.get(f.id)?.title || (items ? walkTr(SOON.ko, SOON.en) : walkTr('액자', 'Frame'));
    return { id: `frame:${f.id}`, kind: 'frame', frame: f.id, level: f.level, x: f.x, z: f.z, r: 0, title, line: '' };
  };

  const relabel = () => {
    const lang = walkLang();
    if (!atlas || disposed || lang === atlasLang) return;
    atlasLang = lang;
    atlas.paint(lang);
    atlas.tex.needsUpdate = true;
    opt.onChange();
  };

  return {
    setItems,
    update,
    near,
    relabel,
    stats: () => ({ frames: slots.length, placeholders: [...boards.values()].length, loaded: loaded.size, loading: loading.size, failed: failed.size }),
    dispose() {
      disposed = true;
      for (const id of [...loading.keys()]) cancel(id);
      for (const id of [...loaded.keys()]) unload(id);
      dropBoards();
      boardMat?.dispose();
      if (atlas) {
        atlas.tex.dispose();
        atlas.canvas.width = atlas.canvas.height = 0;
      }
    },
  };
}
