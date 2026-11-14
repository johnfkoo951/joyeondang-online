import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurfaceAssets, insetAtlasUV, type SurfaceLoader } from '../../src/walk/generated-surfaces.ts';
import { fitDecoration, selectUrnBeds } from '../../src/walk/environment-models.ts';

const tick = () => new Promise((r) => setImmediate(r));
function surface() {
  const draws: unknown[][] = [];
  const canvas = { width: 512, height: 512, getContext: () => ({ drawImage: (...args: unknown[]) => draws.push(args) }) };
  return { texture: new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement), draws };
}

test('one image decode is shared across surfaces, with redraw after every successful paint', async () => {
  let calls = 0, redraws = 0, closes = 0;
  const load: SurfaceLoader = async () => { calls++; return { image: {} as CanvasImageSource, close: () => { closes++; } }; };
  const assets = createSurfaceAssets(() => { redraws++; }, load);
  const a = surface(), b = surface();
  assets.paint(a.texture, '/image.webp');
  assets.paint(b.texture, '/image.webp', { x: 256, y: 0, w: 256, h: 256 });
  await tick();
  assert.equal(calls, 1);
  assert.equal(redraws, 2);
  assert.equal(a.draws.length, 1);
  assert.deepEqual(b.draws[0].slice(1), [256, 0, 256, 256]);
  assets.dispose(); assets.dispose();
  assert.equal(closes, 1);
});

test('image failure preserves fallback and never loops or redraws', async () => {
  let attempts = 0, redraws = 0;
  const assets = createSurfaceAssets(() => { redraws++; }, async () => { attempts++; throw new Error('404'); });
  const s = surface();
  assets.paint(s.texture, '/missing.webp');
  await tick();
  assets.paint(s.texture, '/missing.webp');
  await tick();
  assert.equal(attempts, 1);
  assert.equal(redraws, 0);
  assert.equal(s.draws.length, 0);
  assert.equal(assets.stats().failed, 1);
  assets.dispose();
});

test('late image after disposal is closed, never painted and never invalidates a dead scene', async () => {
  let complete!: (v: { image: CanvasImageSource; close: () => void }) => void;
  let signal!: AbortSignal, closes = 0, redraws = 0;
  const assets = createSurfaceAssets(() => { redraws++; }, (_url, s) => { signal = s; return new Promise((resolve) => { complete = resolve; }); });
  const s = surface(); assets.paint(s.texture, '/slow.webp');
  await tick(); assets.dispose();
  assert.ok(signal.aborted);
  complete({ image: {} as CanvasImageSource, close: () => { closes++; } });
  await tick();
  assert.equal(closes, 1); assert.equal(redraws, 0); assert.equal(s.draws.length, 0);
});

test('atlas coordinates stay within cell boundaries and retain monotonic crop', () => {
  for (let cell = 0; cell < 4; cell++) {
    const lo = insetAtlasUV(0, cell, 4), hi = insetAtlasUV(1, cell, 4);
    assert.ok(lo > cell / 4 && hi < (cell + 1) / 4);
    assert.ok(lo < insetAtlasUV(0.5, cell, 4) && insetAtlasUV(0.5, cell, 4) < hi);
  }
});

test('model fit is uniform and fits inside a bounded existing furniture footprint', () => {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 2));
  mesh.position.set(1, 4, -3); group.add(mesh);
  assert.ok(fitDecoration(group, 1, 0.98, 1));
  const b = new THREE.Box3().setFromObject(group), size = b.getSize(new THREE.Vector3());
  const center = b.getCenter(new THREE.Vector3());
  assert.ok(size.x <= 1 && size.y <= 0.980001 && size.z <= 1);
  assert.ok(Math.abs(b.min.y) < 1e-6 && Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6);
  assert.equal(group.scale.x, group.scale.y); assert.equal(group.scale.y, group.scale.z);
  mesh.geometry.dispose();
});

test('garden urns fit the shallow standard flowerbed and are capped at two', () => {
  const narrow = { x1: 0, x2: 1, z1: 0, z2: 0.4 };
  const bed = { x1: 0, x2: 2, z1: 0, z2: 0.55 };
  assert.deepEqual(selectUrnBeds([narrow, bed, bed, bed]), [bed, bed]);
});

test('empty or invalid model bounds are not installed', () => {
  assert.equal(fitDecoration(new THREE.Group(), 1, 1, 1), false);
});

const { environmentModel, prepareEnvironmentModels } = await import('../../src/walk/environment-models.ts');
const emptyPlan = { beds: [] } as unknown as Parameters<typeof prepareEnvironmentModels>[2];
const model = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())); return g; };
function target(kind = 'sofa') {
  const g = model(); g.userData.kind = kind; g.userData.assetBounds = { w: 2, d: 1 }; return g;
}

test('pilot catalogue has stable silhouette variants and rejects unsupported kinds', () => {
  assert.notEqual(environmentModel('armchair', 0)?.url, environmentModel('armchair', 1)?.url);
  assert.equal(environmentModel('armchair', 0)?.url, environmentModel('armchair', 2)?.url);
  assert.equal(environmentModel('__proto__'), null);
  assert.equal(environmentModel('stairs'), null);
});

test('all eligible placements share one load; original lights and shared materials survive replacement', async () => {
  const levels = { 1: new THREE.Group(), 2: new THREE.Group() };
  const a = target(), b = target(); levels[1].add(a, b);
  const light = new THREE.PointLight(); a.add(light);
  const oldMaterial = (a.children[0] as THREE.Mesh).material as THREE.Material;
  let materialDisposals = 0, loads = 0, changes = 0;
  oldMaterial.addEventListener('dispose', () => materialDisposals++);
  const manager = prepareEnvironmentModels(levels, new THREE.Group(), emptyPlan, () => changes++, async () => { loads++; return model(); });
  await tick(); await tick();
  assert.equal(loads, 1); assert.equal(changes, 2); assert.equal(manager.stats().installed, 2);
  assert.equal(light.parent, a); assert.equal(materialDisposals, 0);
  assert.equal(a.userData.environmentAsset, b.userData.environmentAsset);
  manager.addTarget(a); await tick(); assert.equal(manager.stats().installed, 2);
  manager.dispose(); manager.dispose();
  assert.equal(a.children.length, 1); assert.equal(a.children[0], light);
});

test('failed shared model leaves every procedural fallback in place without retries', async () => {
  const levels = { 1: new THREE.Group(), 2: new THREE.Group() }; const a = target(), b = target(); levels[1].add(a, b);
  const original = a.children[0]; let loads = 0;
  const manager = prepareEnvironmentModels(levels, new THREE.Group(), emptyPlan, () => assert.fail('must not redraw'), async () => { loads++; throw new Error('offline'); });
  await tick(); await tick();
  assert.equal(a.children[0], original); assert.equal(loads, 1); assert.equal(manager.stats().installed, 0);
  manager.dispose();
});

test('late GLB result is released rather than attached after scene disposal', async () => {
  const levels = { 1: new THREE.Group(), 2: new THREE.Group() }; const a = target(); levels[1].add(a);
  let done!: (g: THREE.Object3D) => void, signal!: AbortSignal, disposed = 0;
  const manager = prepareEnvironmentModels(levels, new THREE.Group(), emptyPlan, () => assert.fail('dead scene redraw'), async (_url, s) => { signal = s; return new Promise((r) => { done = r; }); });
  await tick(); manager.dispose(); const late = model(); (late.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => disposed++);
  done(late); await tick(); assert.equal(disposed, 1); assert.ok(signal.aborted); assert.equal(a.children.length, 1);
});
