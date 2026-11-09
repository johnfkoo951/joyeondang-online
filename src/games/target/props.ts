// 과녁과 종이공 모양. 원시 도형을 꼭짓점 색으로 한 덩어리로 묶어 그리는 횟수를 줄인다(휴대폰 60fps).
import * as THREE from 'three';
import { BALL_R, CAN } from './logic';
import type { Palette } from './palette';

type Part = { geo: THREE.BufferGeometry; color: THREE.ColorRepresentation; at?: [number, number, number]; scale?: [number, number, number]; rot?: [number, number, number] };

/** 여러 도형을 꼭짓점 색 하나의 기하로(면은 평평하게 보이게 법선을 다시 잰다) */
export function merge(parts: Part[], flat = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    q.setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...(p.at ?? [0, 0, 0])), q, new THREE.Vector3(...(p.scale ?? [1, 1, 1])));
    g.applyMatrix4(m);
    if (flat) g.computeVertexNormals();
    c.set(p.color);
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
    p.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** 과녁판 앞면: 가운데 빨강, 둘째 파랑, 바깥 종이(점수 고리와 같은 비율 0.34·0.67) */
export function boardTexture(p: Palette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const ring = (f: number, fill: string) => {
    g.beginPath();
    g.arc(128, 128, 126 * f, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(42,38,34,0.55)';
    g.stroke();
  };
  ring(1, p.paper);
  ring(0.67, p.focus);
  ring(0.5, '#e9f1f4');
  ring(0.34, p.roof);
  ring(0.12, p.lamp);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 오리 인형: 바닥 가운데가 원점, 앞(+z)을 본다. 높이 약 0.3m */
export function duckGeometry(p: Palette): THREE.BufferGeometry {
  return merge([
    { geo: new THREE.SphereGeometry(0.11, 14, 10), color: p.duck, at: [0, 0.1, 0], scale: [1.2, 0.85, 1.1] },
    { geo: new THREE.ConeGeometry(0.05, 0.1, 8), color: p.duck, at: [0, 0.14, -0.12], rot: [-1.1, 0, 0] },
    { geo: new THREE.SphereGeometry(0.078, 14, 10), color: p.duck, at: [0, 0.235, 0.035] },
    { geo: new THREE.SphereGeometry(0.04, 10, 6), color: p.beak, at: [0, 0.22, 0.11], scale: [1.2, 0.45, 1.3] },
    { geo: new THREE.SphereGeometry(0.012, 6, 4), color: p.ink, at: [0.035, 0.258, 0.095] },
    { geo: new THREE.SphereGeometry(0.012, 6, 4), color: p.ink, at: [-0.035, 0.258, 0.095] },
    { geo: new THREE.SphereGeometry(0.05, 10, 6), color: '#e8b52f', at: [0.11, 0.11, -0.01], scale: [0.4, 0.7, 1.2] },
    { geo: new THREE.SphereGeometry(0.05, 10, 6), color: '#e8b52f', at: [-0.11, 0.11, -0.01], scale: [0.4, 0.7, 1.2] },
  ]);
}

/** 깡통: 가운데가 원점. 몸통 색과 종이 띠, 은빛 테 */
export function canGeometry(body: string, p: Palette): THREE.BufferGeometry {
  const { r, h } = CAN;
  return merge([
    { geo: new THREE.CylinderGeometry(r, r, h * 0.92, 16, 1), color: body },
    { geo: new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.34, 16, 1, true), color: p.paper },
    { geo: new THREE.CylinderGeometry(r * 0.96, r * 0.96, h * 0.04, 16), color: '#c9c6bf', at: [0, h * 0.48, 0] },
    { geo: new THREE.CylinderGeometry(r * 0.96, r * 0.96, h * 0.04, 16), color: '#c9c6bf', at: [0, -h * 0.48, 0] },
  ]);
}

/** 종이 풍선: 반지름 1의 각진 공을 쪽마다 다른 색으로(배율로 크기를 맞춘다) */
export function balloonGeometry(colors: string[]): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.computeVertexNormals();
  const P = g.getAttribute('position');
  const col: number[] = [];
  const c = new THREE.Color();
  for (let f = 0; f < P.count; f += 3) {
    const x = P.getX(f) + P.getX(f + 1) + P.getX(f + 2);
    const z = P.getZ(f) + P.getZ(f + 1) + P.getZ(f + 2);
    const y = (P.getY(f) + P.getY(f + 1) + P.getY(f + 2)) / 3;
    const sector = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
    c.set(Math.abs(y) > 0.82 ? '#fbf6ec' : colors[sector % colors.length]);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** 구겨진 종이공: 꼭짓점을 조금씩 흔들어 각지게 */
export function ballGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(BALL_R, 1);
  const P = g.getAttribute('position');
  const key = (i: number) => `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
  const bump = new Map<string, number>();
  let s = 17;
  for (let i = 0; i < P.count; i++) {
    const k = key(i);
    if (!bump.has(k)) {
      s = (s * 16807) % 2147483647;
      bump.set(k, 0.82 + (s / 2147483647) * 0.3);
    }
    const f = bump.get(k)!;
    P.setXYZ(i, P.getX(i) * f, P.getY(i) * f, P.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}
