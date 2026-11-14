// 방 안 상호작용 오브제 시선(Gaze) 감지 및 3D 하이라이트 비콘.
// 순수 계산 함수(pickGazedHotspot)는 three.js 없이 단위 시험에서 그대로 검증한다.
import * as THREE from 'three';
import type { Hotspot, Level } from './types';

/** 방 안에서 시선으로 상호작용 물체를 잡을 수 있는 최대 거리(m)와 최소 코사인 각도(약 28도 원뿔) */
export const GAZE_MAX_REACH = 6.2;
export const GAZE_MIN_COS = 0.88;

export type GazeInput = {
  level: Level;
  bodyX: number;
  bodyZ: number;
  camX: number;
  camY: number;
  camZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
};

/**
 * 발밑 반경(h.r) 안에 있으면 강한 가까움(weak=false),
 * 반경 밖이어도 카메라 시선이 오브제 중심을 향하면 시선 하이라이트(weak=true, gazed=true)로 잡는다.
 */
export function pickGazedHotspot(
  g: GazeInput,
  hotspots: readonly Hotspot[],
  inRoom: boolean,
  nearSpot: Hotspot | null,
): Hotspot | null {
  if (nearSpot) {
    return { ...nearSpot, gazed: true };
  }
  if (!inRoom) return null;

  const dLen = Math.hypot(g.dirX, g.dirY, g.dirZ);
  if (dLen < 1e-5) return null;
  const ux = g.dirX / dLen, uy = g.dirY / dLen, uz = g.dirZ / dLen;

  let best: Hotspot | null = null;
  let bestScore = -Infinity;

  for (const h of hotspots) {
    if (h.level !== g.level) continue;
    if (h.kind !== 'exhibit' && h.kind !== 'game' && h.kind !== 'board' && h.kind !== 'exit') continue;

    const bodyDist = Math.hypot(h.x - g.bodyX, h.z - g.bodyZ);
    if (bodyDist > GAZE_MAX_REACH) continue;

    const aimY = h.aimY ?? (h.kind === 'exit' ? 1.25 : 1.15);
    const vx = h.x - g.camX;
    const vy = aimY - g.camY;
    const vz = h.z - g.camZ;
    const dist = Math.hypot(vx, vy, vz);
    if (dist < 0.15) continue;

    const cos = (vx * ux + vy * uy + vz * uz) / dist;
    // 가까울수록 각도 허용폭을 조금 넓힌다
    const minCos = dist < 2.4 ? 0.80 : GAZE_MIN_COS;
    if (cos < minCos) continue;

    const score = cos - dist * 0.025;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }

  return best ? { ...best, weak: true, gazed: true } : null;
}

const COLOR_BY_KIND: Record<string, string> = {
  game: '#9b72e8',
  exhibit: '#45b89a',
  board: '#f2b84b',
  exit: '#e08460',
};

export type HotspotBeacons = {
  group: THREE.Group;
  setActive(id: string | null): boolean;
  dispose(): void;
};

/**
 * 방 안의 모든 상호작용 자리(놀이, 전시, 리더보드, 출구)에 바닥 링과 공중 마커를 세우고,
 * 시선이 닿은 자리는 밝기와 크기를 키워 즉시 알아볼 수 있게 한다.
 */
export function createHotspotBeacons(hotspots: readonly Hotspot[], isRoom: boolean): HotspotBeacons {
  const group = new THREE.Group();
  group.name = 'hotspot-beacons';
  if (!isRoom) {
    return {
      group,
      setActive: () => false,
      dispose: () => {},
    };
  }

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const items = new Map<string, { ring: THREE.Mesh; gem: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; gemMat: THREE.MeshStandardMaterial }>();

  const ringGeo = new THREE.RingGeometry(0.28, 0.36, 28);
  ringGeo.rotateX(-Math.PI / 2);
  geos.push(ringGeo);

  const gemGeo = new THREE.OctahedronGeometry(0.048, 0);
  geos.push(gemGeo);

  for (const h of hotspots) {
    if (h.kind !== 'exhibit' && h.kind !== 'game' && h.kind !== 'board' && h.kind !== 'exit') continue;
    const hex = COLOR_BY_KIND[h.kind] ?? '#e0a958';
    const ringMat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const gemMat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.2,
    });
    mats.push(ringMat, gemMat);

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(h.x, 0.018, h.z);
    ring.userData.live = true;

    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.set(h.x, 0.22, h.z);
    gem.userData.live = true;

    group.add(ring, gem);
    items.set(h.id, { ring, gem, ringMat, gemMat });
  }

  let currentId: string | null = null;

  return {
    group,
    setActive(id: string | null): boolean {
      if (id === currentId) return false;
      currentId = id;
      for (const [hid, entry] of items) {
        const on = hid === id;
        entry.ringMat.opacity = on ? 0.92 : 0.32;
        entry.ring.scale.setScalar(on ? 1.38 : 1.0);
        entry.gemMat.emissiveIntensity = on ? 1.85 : 0.45;
        entry.gem.scale.setScalar(on ? 1.38 : 0.85);
      }
      return true;
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      items.clear();
    },
  };
}
