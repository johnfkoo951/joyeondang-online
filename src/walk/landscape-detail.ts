import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Bounds = { x1: number; x2: number; z1: number; z2: number };
type Site = { b: Bounds; cx: number; cz: number; groundAt: (x: number, z: number) => number };
type Point = { x: number; z: number; size: number; angle: number };
export const DETAIL_BUDGET = { full: { shrubs: 360, rocks: 72, flowers: 220, grasses: 300, trees: 72, forest: 1400 }, lite: { shrubs: 180, rocks: 36, flowers: 110, grasses: 150, trees: 36, forest: 700 } } as const;

/** Stable, spatially varied points. Never plant in the supplied floor footprint. */
export function detailPoints(b: Bounds, count: number, seed: number, near: number, far: number): Point[] {
  let state = seed >>> 0;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const cx = (b.x1 + b.x2) / 2, cz = (b.z1 + b.z2) / 2;
  const halfX = (b.x2 - b.x1) / 2, halfZ = (b.z2 - b.z1) / 2;
  return Array.from({ length: count }, (_, i) => {
    // Random angles, but deterministic groups prevent uniform rows and bare quadrants.
    const a = (i * 2.399963 + rand() * 0.6) % (Math.PI * 2);
    const gap = near + (far - near) * Math.pow(rand(), 1.65);
    const dx = Math.sin(a), dz = Math.cos(a);
    const edge = Math.min(halfX / Math.max(0.0001, Math.abs(dx)), halfZ / Math.max(0.0001, Math.abs(dz)));
    return { x: cx + dx * (edge + gap), z: cz + dz * (edge + gap), size: 0.7 + rand() * 0.65, angle: rand() * Math.PI * 2 };
  });
}

function join(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((g) => { if (!g.index) return g; const f = g.toNonIndexed(); g.dispose(); return f; });
  const merged = mergeGeometries(flat, false)!; flat.forEach((g) => g.dispose()); return merged;
}
function branch(a: THREE.Vector3, b: THREE.Vector3, width: number) {
  const g = new THREE.CylinderGeometry(width * 0.65, width, a.distanceTo(b), 5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return g.applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** Additional static depth layers, with one draw per shared shape/material rather than one per plant. */
export function buildLandscapeDetail(site: Site, lite: boolean) {
  const group = new THREE.Group(); group.name = 'landscape-detail';
  const budget = lite ? DETAIL_BUDGET.lite : DETAIL_BUDGET.full;
  const owned = new Set<{ dispose: () => void }>();
  const material = (color: string) => { const m = new THREE.MeshLambertMaterial({ color, fog: true }); owned.add(m); return m; };
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const instances = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, points: Point[], dim: THREE.Vector3, palette?: string[], lift = 0) => {
    owned.add(geometry); const mesh = new THREE.InstancedMesh(geometry, mat, points.length); owned.add(mesh); mesh.name = name;
    points.forEach((p, i) => {
      const y = site.groundAt(p.x, p.z);
      q.setFromAxisAngle(up, p.angle); scale.copy(dim).multiplyScalar(p.size);
      matrix.compose(pos.set(p.x, y + lift * p.size, p.z), q, scale); mesh.setMatrixAt(i, matrix);
      if (palette) mesh.setColorAt(i, c.set(palette[i % palette.length]));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh); return mesh;
  };
  const white = material('#ffffff');
  const shrubGeometry = join([
    new THREE.IcosahedronGeometry(1, 1).scale(0.85, 0.55, 0.72).translate(-0.35, 0.42, 0),
    new THREE.IcosahedronGeometry(1, 1).scale(0.68, 0.7, 0.64).translate(0.4, 0.58, 0.18),
  ]);
  instances('detail-shrubs', shrubGeometry, white, detailPoints(site.b, budget.shrubs, 11, 2.8, 55), new THREE.Vector3(1.1, 1, 1.1), ['#779e70', '#9bb781', '#5b8865', '#a6b88a', '#799780']);
  const rocks = new THREE.IcosahedronGeometry(1, 1); rocks.scale(0.85, 0.42, 0.63); rocks.translate(0, 0.25, 0);
  instances('detail-rocks', rocks, white, detailPoints(site.b, budget.rocks, 23, 4, 64), new THREE.Vector3(2.2, 1.5, 1.8), ['#c5bdab', '#d3c8b3', '#b1b6a7']);
  const flowers = join(Array.from({ length: 5 }, (_, i) => new THREE.IcosahedronGeometry(0.13, 0).translate(Math.sin(i * 2.4) * 0.32, 0.28 + (i % 3) * 0.1, Math.cos(i * 2.4) * 0.32)));
  instances('detail-flower-drift', flowers, white, detailPoints(site.b, budget.flowers, 31, 2.8, 30), new THREE.Vector3(1.4, 1.1, 1.4), ['#eee4cf', '#e6b1a2', '#e5cd8f', '#b9b0c7']);
  const blades = join(Array.from({ length: 5 }, (_, i) => new THREE.ConeGeometry(0.065, 0.85 + (i % 2) * 0.15, 3).rotateZ((i - 2) * 0.18).rotateY(i * 2.4).translate(Math.sin(i * 2.4) * 0.14, 0.4, Math.cos(i * 2.4) * 0.14)));
  instances('detail-grasses', blades, white, detailPoints(site.b, budget.grasses, 41, 2.4, 36), new THREE.Vector3(1.1, 0.9, 1.1), ['#9faf78', '#b8bd8a', '#7b9c73']);
  const trees = detailPoints(site.b, budget.trees, 59, 12, 140);
  const trunks = join([
    branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.16, 3.2, 0), 0.13),
    branch(new THREE.Vector3(0.1, 1.65, 0), new THREE.Vector3(-1.25, 3.25, 0.3), 0.075),
    branch(new THREE.Vector3(0.1, 2.1, 0), new THREE.Vector3(1.2, 3.8, -0.3), 0.065),
  ]);
  const crown = join([
    new THREE.IcosahedronGeometry(1, 2).scale(1.5, 0.82, 1.25).translate(-1, 3.3, 0.3),
    new THREE.IcosahedronGeometry(1, 2).scale(1.4, 0.95, 1.2).translate(0.9, 3.9, -0.25),
    new THREE.IcosahedronGeometry(1, 1).scale(1, 0.7, 1).translate(0, 4.35, 0.35),
  ]);
  instances('detail-tree-trunks', trunks, material('#795e42'), trees, new THREE.Vector3(1.35, 1.35, 1.35));
  instances('detail-tree-crowns', crown, white, trees, new THREE.Vector3(1.35, 1.35, 1.35), ['#668e6d', '#8aa66e', '#a6b67f', '#5c8676']);
  // Larger low-cost canopy clusters make the middle slopes read as woodland, not isolated lollipops.
  const forest = detailPoints(site.b, budget.forest, 67, 90, 1250);
  const hummock = new THREE.IcosahedronGeometry(1, 1); hummock.scale(1, 0.6, 0.85); hummock.translate(0, 0.48, 0);
  instances('detail-woodland-canopy', hummock, white, forest, new THREE.Vector3(9, 7, 8), ['#6d927e', '#739887', '#88a48a', '#92ad94', '#638a78']);
  let disposed = false;
  return { group, dispose() { if (disposed) return; disposed = true; group.removeFromParent(); owned.forEach((o) => o.dispose()); owned.clear(); } };
}
