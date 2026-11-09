// 놀이방 한쪽: 줄무늬 벽지 벽, 마루와 매트, 창, 오리 선반, 깡통 책상, 종이공 바구니, 깃발 줄.
// 움직이지 않는 것만 여기서 만든다. 만든 기하·재질·텍스처는 bin에 넣어 놀이를 닫을 때 모두 놓는다.
import * as THREE from 'three';
import { planks, plaster, rug, sky } from '@/walk/textures';
import { EYE, ROOM, SHELF, TABLE } from './logic';
import type { Palette } from './palette';
import { merge } from './props';

export type Bin = Set<{ dispose(): void }>;

function keep<T extends { dispose(): void }>(bin: Bin, x: T): T {
  bin.add(x);
  return x;
}

/** 밝은 세로 줄무늬 벽지(두 색 + 가는 선) */
function stripes(p: Palette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = p.wallA;
  g.fillRect(0, 0, 128, 16);
  g.fillStyle = p.wallB;
  g.fillRect(64, 0, 64, 16);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(30, 0, 4, 16);
  g.fillRect(94, 0, 4, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 1);
  return t;
}

export function buildRoom(p: Palette, bin: Bin, lite: boolean): THREE.Group {
  const room = new THREE.Group();
  const lambert = (o: THREE.MeshLambertMaterialParameters) => keep(bin, new THREE.MeshLambertMaterial(o));
  const W = ROOM.halfW * 2 + 0.2;
  const near = EYE.z + 0.4;
  const depth = near - ROOM.wallZ;
  const midZ = (near + ROOM.wallZ) / 2;
  const plane = (w: number, h: number, mat: THREE.Material) => new THREE.Mesh(keep(bin, new THREE.PlaneGeometry(w, h)), mat);

  const floorTex = keep(bin, planks(p.floor, 7));
  floorTex.repeat.set(3, 3);
  const floor = plane(W, depth, lambert({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  room.add(floor);

  const wall = plane(W, ROOM.ceil, lambert({ map: keep(bin, stripes(p)) }));
  wall.position.set(0, ROOM.ceil / 2, ROOM.wallZ);
  room.add(wall);

  const sideTex = keep(bin, plaster(p.side, 21, 0.035));
  sideTex.repeat.set(3, 1.5);
  // 옆벽은 빛을 비스듬히 받아 어두워지니 같은 무늬로 조금 스스로 밝힌다
  const sideMat = lambert({ map: sideTex, emissive: '#ffffff', emissiveMap: sideTex, emissiveIntensity: p.dark ? 0.08 : 0.32 });
  for (const s of [-1, 1]) {
    const w = plane(depth, ROOM.ceil, sideMat);
    w.rotation.y = -s * Math.PI / 2;
    w.position.set(s * (W / 2), ROOM.ceil / 2, midZ);
    room.add(w);
  }
  // 천장은 아래를 봐서 빛을 덜 받는다: 조명과 상관없는 밝은 색으로
  const ceil = plane(W, depth, keep(bin, new THREE.MeshBasicMaterial({ color: p.dark ? '#6f675d' : '#ece4d6' })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.ceil, midZ);
  room.add(ceil);

  // 창: 왼쪽 벽, 하늘빛 판과 나무 창살
  const win = plane(1.3, 1.0, keep(bin, new THREE.MeshBasicMaterial({ map: keep(bin, sky(p.dark ? '#3a4f78' : '#8fc3ea', p.dark ? '#c9a27a' : '#f4ead8')) })));
  win.rotation.y = Math.PI / 2;
  win.position.set(-W / 2 + 0.055, 1.5, -2.1);
  room.add(win);

  // 매트, 바구니, 바닥 띠는 꼭짓점 색 한 덩어리로
  const mat = plane(2.2, 1.3, lambert({ map: keep(bin, rug('#ead3b0', p.season)) }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.004, -1.2);
  room.add(mat);

  const sx = -1.18;
  const shelfW = 1.36;
  const parts = [
    // 오리 선반과 받침
    { geo: new THREE.BoxGeometry(shelfW, 0.04, 0.3), color: p.oak, at: [sx, SHELF.y - 0.02, SHELF.z] as [number, number, number] },
    { geo: new THREE.BoxGeometry(0.04, 0.16, 0.24), color: p.oak, at: [sx - shelfW / 2 + 0.12, SHELF.y - 0.12, SHELF.z - 0.02] as [number, number, number] },
    { geo: new THREE.BoxGeometry(0.04, 0.16, 0.24), color: p.oak, at: [sx + shelfW / 2 - 0.12, SHELF.y - 0.12, SHELF.z - 0.02] as [number, number, number] },
    // 깡통 책상
    { geo: new THREE.BoxGeometry(0.72, 0.04, 0.46), color: p.oak, at: [TABLE.x, TABLE.y - 0.02, TABLE.z] as [number, number, number] },
    // 걸레받이
    { geo: new THREE.BoxGeometry(W, 0.1, 0.03), color: '#e9dcc4', at: [0, 0.05, ROOM.wallZ + 0.015] as [number, number, number] },
    // 창틀(창 판 뒤에서 테두리만 보인다)
    { geo: new THREE.BoxGeometry(0.06, 1.12, 1.42), color: '#efe6d6', at: [-W / 2 + 0.02, 1.5, -2.1] as [number, number, number] },
  ];
  for (const [dx, dz] of [[-0.31, -0.18], [0.31, -0.18], [-0.31, 0.18], [0.31, 0.18]]) {
    parts.push({ geo: new THREE.BoxGeometry(0.04, TABLE.y - 0.04, 0.04), color: p.oak, at: [TABLE.x + dx, (TABLE.y - 0.04) / 2, TABLE.z + dz] });
  }
  const solid = new THREE.Mesh(keep(bin, merge(parts)), lambert({ vertexColors: true }));
  room.add(solid);
  // 창살은 하늘 판 앞에
  const bars = merge([
    { geo: new THREE.BoxGeometry(0.03, 1.0, 0.04), color: '#efe6d6', at: [-W / 2 + 0.075, 1.5, -2.1] },
    { geo: new THREE.BoxGeometry(0.03, 0.04, 1.3), color: '#efe6d6', at: [-W / 2 + 0.075, 1.5, -2.1] },
  ]);
  room.add(new THREE.Mesh(keep(bin, bars), lambert({ vertexColors: true })));
  room.add(bunting(p, bin, lite));
  room.add(basket(p, bin));

  // 천장 등
  const lamp = new THREE.Mesh(keep(bin, new THREE.CircleGeometry(0.28, 24)), keep(bin, new THREE.MeshBasicMaterial({ color: p.dark ? '#ffe2a8' : '#fff7e6' })));
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, ROOM.ceil - 0.01, -1.6);
  room.add(lamp);
  return room;
}

/** 벽 위 깃발 줄: 세모 깃발을 색 돌려 가며 */
function bunting(p: Palette, bin: Bin, lite: boolean): THREE.Mesh {
  const colors = [p.roof, p.lamp, p.focus, p.pine, p.season];
  const n = lite ? 12 : 18;
  const parts: Parameters<typeof merge>[0] = [];
  const x0 = -ROOM.halfW + 0.2;
  const span = (ROOM.halfW - 0.2) * 2;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const x = x0 + span * f;
    const sag = Math.sin(f * Math.PI) * 0.18;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.11, 0, 0, 0.11, 0, 0, 0, -0.2, 0], 3));
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    parts.push({ geo: tri, color: colors[i % colors.length], at: [x, 2.42 - sag, ROOM.wallZ + 0.03] });
  }
  return new THREE.Mesh(keep(bin, merge(parts)), keep(bin, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}

/** 종이공 바구니(왼쪽 앞 바닥) */
function basket(p: Palette, bin: Bin): THREE.Mesh {
  const parts: Parameters<typeof merge>[0] = [
    { geo: new THREE.CylinderGeometry(0.24, 0.19, 0.3, 18, 1, true), color: p.oak, at: [-1.95, 0.15, -2.4] },
    { geo: new THREE.CircleGeometry(0.19, 18), color: '#7d5a37', at: [-1.95, 0.01, -2.4], rot: [-Math.PI / 2, 0, 0] },
    { geo: new THREE.TorusGeometry(0.24, 0.018, 6, 24), color: '#7d5a37', at: [-1.95, 0.3, -2.4], rot: [Math.PI / 2, 0, 0] },
  ];
  for (const [dx, dy, dz] of [[-0.07, 0.31, 0.03], [0.07, 0.32, -0.04], [0.0, 0.34, 0.07], [0.09, 0.3, 0.08]]) {
    parts.push({ geo: new THREE.IcosahedronGeometry(0.075, 0), color: p.ballPaper, at: [-1.95 + dx, dy, -2.4 + dz] });
  }
  const g = merge(parts);
  return new THREE.Mesh(keep(bin, g), keep(bin, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}
