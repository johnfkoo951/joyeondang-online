import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { DecorPlan } from './decor';

const MODELS: Record<string, { files: string[]; height: number; yaw?: number }> = {
  grenadier: { files: ['ineos-grenadier-v1'], height: 2.08, yaw: Math.PI / 2 },
  cla45: { files: ['mercedes-cla45-v1'], height: 1.44, yaw: Math.PI / 2 },
  sofa: { files: ['cloud-sofa-v2'], height: 0.94 },
  armchair: { files: ['sling-armchair-v2', 'cognac-reading-chair-v1'], height: 0.98 },
  coffeeTable: { files: ['pebble-table-v2', 'oval-low-table-v2'], height: 0.48 },
  bookshelf: { files: ['gallery-bookcase-v2'], height: 1.8 },
  floorLamp: { files: ['arc-floor-lamp-v2'], height: 1.8 },
  plant: { files: ['ceramic-plant-v2'], height: 1.35 },
  lowTable: { files: ['oval-low-table-v2', 'pebble-table-v2'], height: 0.34 },
  lacquerChest: { files: ['charcoal-credenza-v2'], height: 0.8 },
  recordCabinet: { files: ['charcoal-credenza-v2'], height: 0.78 },
};

export function environmentModel(kind: string, variant = 0) {
  const entry = Object.hasOwn(MODELS, kind) ? MODELS[kind] : undefined;
  if (!entry) return null;
  const i = Math.abs(Math.trunc(Number.isFinite(variant) ? variant : 0)) % entry.files.length;
  return { url: `/environment/${entry.files[i]}.glb`, height: entry.height, yaw: entry.yaw ?? 0 };
}
export type EnvironmentModelLoader = (url: string, signal: AbortSignal) => Promise<THREE.Object3D>;
const URN = '/environment/terracotta-garden-urn-v1.glb';

export function selectUrnBeds(beds: DecorPlan['beds']) {
  // Existing garden strips are shallow; fit the prop inside them, never expand the strip.
  return beds.filter((b) => b.x2 - b.x1 > 0.5 && b.z2 - b.z1 > 0.5).slice(0, 2);
}

/** Uniform scale, centered footprint and bottom on the floor; no changes to collision geometry. */
export function fitDecoration(root: THREE.Object3D, w: number, h: number, d: number) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z, w, h, d].every((n) => Number.isFinite(n) && n > 0)) return false;
  const scale = Math.min(w / size.x, h / size.y, d / size.z);
  const center = bounds.getCenter(new THREE.Vector3());
  root.scale.multiplyScalar(scale);
  root.position.add(new THREE.Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale));
  root.updateMatrixWorld(true);
  return true;
}

function release(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(m);
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  const images = new Set<{ close?: () => void }>();
  textures.forEach((t) => { if (t.image) images.add(t.image); t.dispose(); });
  images.forEach((i) => i.close?.());
}

/** Scene-owned model cache. Each selected kind is upgraded at every eligible placement. */
export function prepareEnvironmentModels(
  levels: Record<1 | 2, THREE.Group>, ground: THREE.Group, plan: DecorPlan,
  onChange: () => void, decode?: EnvironmentModelLoader,
) {
  let alive = true;
  const controller = new AbortController();
  const owned: THREE.Object3D[] = [], attached: THREE.Object3D[] = [];
  const cache = new Map<string, Promise<THREE.Object3D | null>>();
  const registered = new WeakSet<THREE.Object3D>();
  const counts = new Map<string, number>();
  const stats = { requests: 0, installed: 0, failed: 0 };
  const loader = new GLTFLoader();
  const read: EnvironmentModelLoader = decode ?? (async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Decorative model unavailable');
    return (await loader.parseAsync(await response.arrayBuffer(), '')).scene;
  });
  const load = (url: string) => {
    let pending = cache.get(url);
    if (!pending) {
      stats.requests++;
      pending = Promise.resolve().then(() => read(url, controller.signal)).then((source) => {
        if (!alive) { release(source); return null; }
        owned.push(source);
        source.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) { mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.live = true; }
        });
        return source;
      }).catch(() => { stats.failed++; return null; });
      cache.set(url, pending);
    }
    return pending;
  };
  const addTarget = (target: THREE.Object3D) => {
    if (!alive || registered.has(target)) return;
    registered.add(target);
    const kind = String(target.userData.kind ?? '');
    const ordinal = counts.get(kind) ?? 0; counts.set(kind, ordinal + 1);
    const chosen = environmentModel(kind, ordinal);
    const size = target.userData.assetBounds as { w: number; d: number } | undefined;
    if (!chosen || !size) return;
    target.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.live = true; });
    void load(chosen.url).then((source) => {
      if (!alive || !source) return;
      const model = source.clone(true);
      if (chosen.yaw) model.rotation.y = chosen.yaw;
      if (!fitDecoration(model, size.w, chosen.height, size.d)) { stats.failed++; return; }
      // Direct point lights and keepWithModel attachments (e.g. roof Starlink dish) remain attached.
      const old = [...target.children].filter((o) => !(o as THREE.Light).isLight && !o.userData.keepWithModel);
      const geometries = new Set<THREE.BufferGeometry>();
      old.forEach((o) => { o.removeFromParent(); o.traverse((v) => { const m = v as THREE.Mesh; if (m.isMesh) geometries.add(m.geometry); }); });
      geometries.forEach((g) => g.dispose());
      target.add(model); attached.push(model);
      target.userData.environmentAsset = chosen.url;
      stats.installed++; onChange();
    });
  };
  for (const level of [1, 2] as const) for (const child of levels[level].children) addTarget(child);
  const beds = selectUrnBeds(plan.beds);
  if (beds.length) void load(URN).then((source) => {
    if (!alive || !source) return;
    for (const b of beds) {
      const model = source.clone(true);
      if (!fitDecoration(model, 0.48, 0.36, 0.48)) continue;
      const holder = new THREE.Group();
      holder.name = 'environment-garden-urn';
      holder.position.set((b.x1 + b.x2) / 2, 0.1, (b.z1 + b.z2) / 2);
      holder.add(model); ground.add(holder); attached.push(holder);
    }
    onChange();
  });
  return {
    addTarget,
    stats: () => ({ ...stats }),
    dispose() {
      if (!alive) return;
      alive = false; controller.abort();
      attached.forEach((o) => o.removeFromParent());
      owned.forEach((o) => release(o));
      owned.length = attached.length = 0; cache.clear();
    },
  };
}
