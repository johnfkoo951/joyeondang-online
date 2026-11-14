import type { Furniture, HouseWorld, Hotspot } from './types';

// 거실 창가 이젤(수채 그림그리기 입구). 다시 그린 집과 걷기용으로 손질한 실제 집 모두에 같은 규칙으로 놓는다.
// 집마다 좌표를 적지 않는다: 거실 무대 자리가 있는 구역의 창을 찾아, 창 앞 가까운 빈자리부터 고른다.
const EASEL_W = 0.76;
const EASEL_D = 0.6;
/** 이젤 가운데와 벽·가구 사이 최소 여유(이젤은 부딪히지 않지만 겹쳐 보이면 안 된다) */
const CLEAR = 0.4;
/** 창에서 방 안쪽으로 떨어진 거리 후보(가까운 것부터) */
const DEPTHS = [0.9, 1.2, 1.6, 2.2];
/** 창 가운데에서 벽을 따라 비켜서는 거리 후보 */
const SLIDES = [0, -0.3, 0.3, -0.6, 0.6];

export function addLivingEasel(world: HouseWorld): HouseWorld {
  if (world.kind === 'room' || world.hotspots.some((h) => h.id === 'game-watercolor')) return world;
  const stage = world.hotspots.find((h) => h.slug === 'living');
  if (!stage) return world;
  const zone = world.zones.find((z) => z.level === stage.level && stage.x >= z.x1 && stage.x <= z.x2 && stage.z >= z.z1 && stage.z <= z.z2);
  if (!zone) return world;
  const cx = (zone.x1 + zone.x2) / 2, cz = (zone.z1 + zone.z2) / 2;
  const blocked = (x: number, z: number, pad: number) =>
    world.physics.boxes.some((b) => (b.level === stage.level || b.level === 0) && x > b.x1 - pad && x < b.x2 + pad && z > b.z1 - pad && z < b.z2 + pad);
  const inZone = (x: number, z: number) => x > zone.x1 && x < zone.x2 && z > zone.z1 && z < zone.z2;
  for (const w of world.windows.filter((w) => w.level === stage.level)) {
    const mid = (w.from + w.to) / 2;
    const wx = w.axis === 'x' ? mid : w.at, wz = w.axis === 'x' ? w.at : mid;
    if (wx < zone.x1 - 0.5 || wx > zone.x2 + 0.5 || wz < zone.z1 - 0.5 || wz > zone.z2 + 0.5) continue;
    // 창에서 방 안쪽을 향하는 방향(벽에 수직)
    const nx = w.axis === 'z' ? Math.sign(cx - wx) || 1 : 0;
    const nz = w.axis === 'x' ? Math.sign(cz - wz) || 1 : 0;
    const half = (w.to - w.from) / 2;
    for (const depth of DEPTHS) for (const slide of SLIDES) {
      if (Math.abs(slide) > half) continue;
      const x = wx + nx * depth + (w.axis === 'x' ? slide : 0);
      const z = wz + nz * depth + (w.axis === 'z' ? slide : 0);
      // 이젤 앞(그림을 그리는 사람이 서는 곳)
      const sx = x + nx * 0.75, sz = z + nz * 0.75;
      if (!inZone(x, z) || !inZone(sx, sz)) continue;
      if (blocked(x, z, CLEAR) || blocked(sx, sz, 0.25)) continue;
      if (Math.hypot(x - world.spawn.x, z - world.spawn.z) < 2) continue;
      if (world.hotspots.some((h) => h.level === stage.level && Math.hypot(h.x - sx, h.z - sz) < 1.2)) continue;
      const easel: Furniture = {
        kind: 'watercolorEasel', level: stage.level,
        x1: x - EASEL_W / 2, x2: x + EASEL_W / 2, z1: z - EASEL_D / 2, z2: z + EASEL_D / 2,
        collide: false, rot: Math.atan2(nx, nz),
      };
      const spot: Hotspot = {
        id: 'game-watercolor', level: stage.level, x: sx, z: sz, r: 1.05, aimY: 1.3,
        title: '이젤', line: '거실 창가의 이젤에서 물감을 겹쳐 그리고 내 그림을 내려받아요.', kind: 'game', game: 'watercolor',
      };
      return { ...world, furniture: [...world.furniture, easel], hotspots: [...world.hotspots, spot] };
    }
  }
  return world;
}
