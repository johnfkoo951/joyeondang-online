import * as THREE from 'three';
import type { HouseWorld, Level } from './types';
import type { FurnitureKit } from './furnish';

/** Applied finish only: keep the house massing, openings and navigation exactly as supplied. */
export function dressGalleryFacade(world: HouseWorld, kit: FurnitureKit, hide: (lv: Level) => THREE.Group) {
  const stone = kit.paint('#ded9cd', 0.88);
  const reveal = kit.paint('#625a4d', 0.85);
  for (const wall of world.walls) {
    if (wall.style !== 'ext' || wall.height < 2) continue;
    const lv: Level = wall.box.level === 2 ? 2 : 1;
    const b = wall.box;
    const width = b.x2 - b.x1, depth = b.z2 - b.z1;
    const along = wall.axis === 'x' ? width : depth;
    if (along < 0.4) continue;
    const top = wall.baseY + wall.height;
    // A fine limestone coping and recessed shadow joint make long plaster elevations legible.
    for (const [height, y, pad, mat] of [
      [0.075, top - 0.038, 0.035, stone],
      [0.018, top - 0.095, 0.016, reveal],
    ] as const) {
      const geometry = new THREE.BoxGeometry(width + pad * 2, height, depth + pad * 2);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set((b.x1 + b.x2) / 2, y, (b.z1 + b.z2) / 2);
      mesh.receiveShadow = true;
      hide(lv).add(mesh);
    }
  }
}
