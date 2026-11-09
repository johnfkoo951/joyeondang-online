import type { HouseWorld } from '@/walk/types';

/** 서버가 내려줄 실제 집 데이터가 걷기 엔진이 기대하는 모양인지 (테스트에서도 쓰려고 server-only 밖에 둔다) */
export function isHouseWorld(w: unknown): w is HouseWorld {
  if (!w || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  const arrays = ['floors', 'walls', 'headers', 'doors', 'ceilings', 'windows', 'furniture', 'props', 'zones', 'hotspots'];
  const physics = o.physics as Record<string, unknown> | undefined;
  return o.kind === 'real' && typeof o.floor2 === 'number' && arrays.every((k) => Array.isArray(o[k]))
    && !!physics && Array.isArray(physics.boxes) && Array.isArray(physics.ramps) && typeof physics.floor2 === 'number'
    && !!o.spawn && !!o.house;
}
