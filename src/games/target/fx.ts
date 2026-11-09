// 종이 조각: 풍선이 터지거나 과녁에 맞으면 흩날린다. 조각 전부를 InstancedMesh 하나로 그린다(그리기 한 번).
import * as THREE from 'three';
import type { Vec3 } from './logic';

const MAX = 180;

export type Confetti = {
  mesh: THREE.InstancedMesh;
  burst(at: Vec3, colors: string[], n: number, power?: number): void;
  update(dt: number): void;
  clear(): void;
  dispose(): void;
};

export function createConfetti(reducedMotion: boolean): Confetti {
  const geo = new THREE.PlaneGeometry(0.032, 0.046);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const p = new Float32Array(MAX * 3);
  const v = new Float32Array(MAX * 3);
  const r = new Float32Array(MAX * 3);
  const w = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  let next = 0;
  let alive = 0;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX; i++) {
    mesh.setMatrixAt(i, hide);
    mesh.setColorAt(i, c.set('#ffffff'));
  }

  return {
    mesh,
    burst(at, colors, n, power = 1) {
      const count = reducedMotion ? Math.min(6, n) : n;
      for (let k = 0; k < count; k++) {
        const i = next;
        next = (next + 1) % MAX;
        if (life[i] <= 0) alive++;
        const a = Math.random() * Math.PI * 2;
        const up = Math.random();
        const s = (reducedMotion ? 0.5 : 1.2 + Math.random() * 1.6) * power;
        p.set([at.x, at.y, at.z], i * 3);
        v.set([Math.cos(a) * s * (1 - up * 0.5), (0.6 + up * 1.4) * s, Math.sin(a) * s * 0.6 + 0.4 * power], i * 3);
        r.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
        const spin = reducedMotion ? 0 : 8;
        w.set([(Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin], i * 3);
        life[i] = 1.1 + Math.random() * 0.5;
        mesh.setColorAt(i, c.set(colors[k % colors.length]));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      if (alive <= 0) return;
      alive = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          mesh.setMatrixAt(i, hide);
          continue;
        }
        alive++;
        const j = i * 3;
        // 종이는 공기에 걸려 금방 느려지고 하늘하늘 떨어진다
        const drag = Math.exp(-3.2 * dt);
        v[j] *= drag;
        v[j + 2] *= drag;
        v[j + 1] = v[j + 1] * drag - 2.4 * dt;
        p[j] += v[j] * dt;
        p[j + 1] = Math.max(0.01, p[j + 1] + v[j + 1] * dt);
        p[j + 2] += v[j + 2] * dt;
        r[j] += w[j] * dt;
        r[j + 1] += w[j + 1] * dt;
        r[j + 2] += w[j + 2] * dt;
        o.position.set(p[j], p[j + 1], p[j + 2]);
        o.rotation.set(r[j], r[j + 1], r[j + 2]);
        o.scale.setScalar(Math.min(1, life[i] * 2.5));
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() {
      life.fill(0);
      for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, hide);
      mesh.instanceMatrix.needsUpdate = true;
      alive = 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
