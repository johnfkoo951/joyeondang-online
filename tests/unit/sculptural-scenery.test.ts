import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWorld } from '../../src/content/world.ts';
import { buildScenery, mountainRelief, terrain } from '../../src/walk/scenery.ts';

test('volumetric relief stays clear of the courtyard and is continuous around the horizon', () => {
  assert.equal(mountainRelief(0, 0), 0); assert.equal(mountainRelief(20, 30), 0);
  assert.ok(mountainRelief(-330, -1350) > 400 && mountainRelief(-330, -1350) < 500);
  for (let i = 0; i <= 360; i++) {
    const a = i * Math.PI / 180, x = Math.sin(a) * 1400, z = Math.cos(a) * 1400;
    const h = mountainRelief(x, z);
    assert.ok(Number.isFinite(h) && h >= 0);
    assert.ok(Math.abs(h - mountainRelief(x + 0.1, z)) < 1);
  }
});

test('scenery is opaque geometry without photographic cards and covers every direction past fog', () => {
  const world = buildWorld({}); const sc = buildScenery(world, 'autumn', true);
  assert.equal(sc.group.getObjectByName('generated-horizon'), undefined);
  const ground = sc.group.getObjectByName('scenery-ground') as THREE.Mesh;
  ground.geometry.computeBoundingBox();
  const { cx, cz } = terrain(world), b = ground.geometry.boundingBox!;
  assert.ok(b.min.x <= cx - 3199 && b.max.x >= cx + 3199 && b.min.z <= cz - 3199 && b.max.z >= cz + 3199);
  sc.group.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      assert.equal(mat.transparent, false);
      if (m.name !== 'scenery-sky') assert.equal((mat as THREE.MeshLambertMaterial).fog, true);
    }
  });
  assert.ok(sc.group.getObjectByName('scenery-gallery-roofs'));
  sc.dispose(); sc.dispose();
});

const { detailPoints, DETAIL_BUDGET, buildLandscapeDetail } = await import('../../src/walk/landscape-detail.ts');

test('detail placement is stable, varied, outside the house footprint and populated on every side', () => {
  const b = { x1: -10, x2: 12, z1: -8, z2: 20 };
  const a = detailPoints(b, 360, 11, 2.8, 55);
  assert.deepEqual(a, detailPoints(b, 360, 11, 2.8, 55));
  const sides = new Set<string>();
  for (const p of a) {
    assert.ok(p.x < b.x1 || p.x > b.x2 || p.z < b.z1 || p.z > b.z2);
    assert.ok(Number.isFinite(p.size) && p.size > 0);
    if (p.x < b.x1) sides.add('left'); if (p.x > b.x2) sides.add('right');
    if (p.z < b.z1) sides.add('back'); if (p.z > b.z2) sides.add('front');
  }
  assert.equal(sides.size, 4); assert.ok(new Set(a.map((p) => p.size)).size > 300);
  for (const k of Object.keys(DETAIL_BUDGET.full) as Array<keyof typeof DETAIL_BUDGET.full>) assert.equal(DETAIL_BUDGET.lite[k], DETAIL_BUDGET.full[k] / 2);
});

test('daylight sky is not darkened by scene tone mapping and extra layers dispose once', () => {
  const world = buildWorld({}), scenery = buildScenery(world, 'autumn', true);
  const sky = scenery.group.getObjectByName('scenery-sky') as THREE.Mesh;
  assert.equal((sky.material as THREE.Material).toneMapped, false);
  assert.ok(scenery.group.getObjectByName('detail-flower-drift'));
  const detail = buildLandscapeDetail(terrain(world), true); let disposed = 0;
  const geometry = (detail.group.getObjectByName('detail-rocks') as THREE.Mesh).geometry;
  geometry.addEventListener('dispose', () => disposed++);
  detail.dispose(); detail.dispose(); assert.equal(disposed, 1); scenery.dispose();
});
