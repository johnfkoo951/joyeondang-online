import * as THREE from 'three';

/** Curved distant scenery only. Foreground terrain, trees and buildings continue to provide parallax. */
export function createSceneryBackdrops(cx: number, cz: number, onChange: () => void, onMountain: () => void) {
  const group = new THREE.Group();
  group.name = 'generated-horizon';
  let alive = true;
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const loader = new THREE.TextureLoader();
  const specs = [
    { url: '/environment/granite-forest-horizon-v1.webp', radius: 800, base: -550, height: 1125, sign: -1 },
    { url: '/environment/quiet-hillside-village-v1.webp', radius: 420, base: -220, height: 350, sign: 1 },
  ];
  for (const spec of specs) {
    const geo = new THREE.PlaneGeometry(1, 1, 64, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = (uv.getX(i) - 0.5) * 2.5;
      p.setXYZ(i, cx + Math.sin(a) * spec.radius, spec.base + uv.getY(i) * spec.height, cz + spec.sign * Math.cos(a) * spec.radius);
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geometries.push(geo);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = spec.sign < 0 ? 'granite-horizon' : 'village-horizon';
    mesh.visible = false;
    group.add(mesh);
    const texture = loader.load(spec.url, (t) => {
      if (!alive) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 2;
      mat.map = t;
      mat.needsUpdate = true;
      mesh.visible = true;
      if (spec.sign < 0) onMountain();
      onChange();
    }, undefined, () => { /* Procedural horizon remains available when offline. */ });
    textures.push(texture);
  }
  return { group, dispose() {
    if (!alive) return;
    alive = false;
    group.removeFromParent();
    textures.forEach((t) => t.dispose());
    materials.forEach((m) => m.dispose());
    geometries.forEach((g) => g.dispose());
  } };
}
