// 움직이지 않는 도형을 재질마다 하나로 합친다. 집 한 채는 작은 상자 천몇백 개(몰딩·징두리판·문틀·책·난간 살…)로 지어지는데,
// 따로 그리면 프레임마다 그리기 호출이 그만큼 나가서 휴대폰 CPU가 먼저 지친다. 한 번 지은 뒤 바뀌지 않는 것은
// 같은 묶음·같은 재질끼리 한 덩어리로 구워 둔다. 첫 그리기 전에 부르므로 원래 도형은 GPU에 올라간 적이 없다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type BakeOptions = {
  /** 이 물체와 그 아래는 건드리지 않는다(따로 굽는 묶음, 프레임마다 바뀌는 물체) */
  stop?: ReadonlySet<THREE.Object3D>;
  /** true를 돌려주면 그 Mesh는 그대로 둔다 */
  skip?: (m: THREE.Mesh) => boolean;
};

export type BakeResult = { before: number; after: number; baked: THREE.Mesh[] };

type Part = { geo: THREE.BufferGeometry; material: THREE.Material; mesh: THREE.Mesh };

const ATTRS = ['position', 'normal', 'uv', 'color'] as const;

/** 합칠 수 없는 Mesh: 인스턴스·뼈대·묶음 Mesh, 변형 목표가 있는 도형 */
function plain(m: THREE.Mesh): boolean {
  const any = m as unknown as { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
  if (any.isInstancedMesh || any.isSkinnedMesh || any.isBatchedMesh) return false;
  const g = m.geometry;
  if (!g || !g.attributes.position || Object.keys(g.morphAttributes).length) return false;
  // 끼워 넣은 버퍼(interleaved)는 다루지 않는다
  return ATTRS.every((k) => !g.attributes[k] || !(g.attributes[k] as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute);
}

/** 불투명하고 평범한 재질만 합친다(투명 재질은 물체마다 깊이 순서를 따로 매겨야 한다) */
function bakeable(mat: THREE.Material): boolean {
  return !mat.transparent && mat.visible !== false && !mat.userData.noBake;
}

/** 도형의 [start, start+count) 색인 구간만 떼어 낸 새 도형(쓰는 꼭짓점만 옮긴다) */
function slice(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const index = g.index;
  const total = index ? index.count : pos.count;
  const s = Math.max(0, start), e = Math.min(total, start + count);
  const remap = new Map<number, number>();
  const order: number[] = [];
  const idx: number[] = [];
  for (let i = s; i < e; i++) {
    const v = index ? index.getX(i) : i;
    let n = remap.get(v);
    if (n === undefined) { n = order.length; remap.set(v, n); order.push(v); }
    idx.push(n);
  }
  const out = new THREE.BufferGeometry();
  for (const k of ATTRS) {
    const a = g.attributes[k] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = new Float32Array(order.length * a.itemSize);
    for (let i = 0; i < order.length; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(order[i], c);
    out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.setIndex(idx);
  return out;
}

/** 합치기 좋게 고른 사본: 필요한 속성만, 늘 색인 있음, 속성은 모두 Float32 */
function normalized(g: THREE.BufferGeometry, wantColor: boolean): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const out = new THREE.BufferGeometry();
  for (const k of ATTRS) {
    const a = g.attributes[k] as THREE.BufferAttribute | undefined;
    if (!a || (k === 'color' && !wantColor)) continue;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (g.index) out.setIndex(Array.from(g.index.array as ArrayLike<number>));
  else out.setIndex(Array.from({ length: pos.count }, (_, i) => i));
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

/** 삼각형 감는 방향을 뒤집는다(거울 변환으로 뒤집힌 면을 바로잡는다) */
function flip(g: THREE.BufferGeometry) {
  const idx = g.index;
  if (!idx) return;
  for (let i = 0; i + 2 < idx.count; i += 3) {
    const a = idx.getX(i), c = idx.getX(i + 2);
    idx.setX(i, c);
    idx.setX(i + 2, a);
  }
}

/**
 * root 아래의 정적인 Mesh를 (재질, 그림자 여부, 그리는 순서)마다 하나로 합쳐 root에 붙인다.
 * 합쳐진 Mesh의 자리·회전·크기는 도형에 구워 넣는다. 투명 재질, 숨긴 물체, stop·skip에 걸린 것은 그대로 둔다.
 * root는 자기 변환이 없는 묶음이어야 한다(층 묶음처럼). 첫 그리기 전에 한 번 부른다.
 */
export function bakeStatic(root: THREE.Object3D, opt: BakeOptions = {}): BakeResult {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map<string, { parts: Part[]; material: THREE.Material; cast: boolean; receive: boolean; order: number; layers: number }>();
  const taken: THREE.Mesh[] = [];
  let before = 0;

  const visit = (o: THREE.Object3D) => {
    if (!o.visible || (o !== root && opt.stop?.has(o))) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      before++;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const ok = plain(m) && mats.every(bakeable) && !m.userData.live && !opt.skip?.(m) && m.children.length === 0
        && !m.customDepthMaterial && !m.customDistanceMaterial && m.onBeforeRender === THREE.Object3D.prototype.onBeforeRender;
      if (ok) {
        rel.multiplyMatrices(inv, m.matrixWorld);
        const mirrored = rel.determinant() < 0;
        const g = m.geometry;
        const groups = Array.isArray(m.material) && g.groups.length
          ? g.groups.map((gr) => ({ start: gr.start, count: gr.count, material: mats[gr.materialIndex ?? 0] ?? mats[0] }))
          : [{ start: 0, count: Infinity, material: mats[0] }];
        for (const gr of groups) {
          const wantColor = Boolean((gr.material as THREE.MeshStandardMaterial).vertexColors);
          const src = gr.count === Infinity ? g : slice(g, gr.start, gr.count);
          const geo = normalized(src, wantColor);
          geo.applyMatrix4(rel);
          if (mirrored) flip(geo);
          const key = `${gr.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.layers.mask}`;
          let b = buckets.get(key);
          if (!b) { b = { parts: [], material: gr.material, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, layers: m.layers.mask }; buckets.set(key, b); }
          b.parts.push({ geo, material: gr.material, mesh: m });
        }
        taken.push(m);
        return;
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const c of [...root.children]) visit(c);

  const baked: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    // 한 덩어리 안에서는 속성 구성이 같아야 한다: 하나라도 uv·color가 있으면 없는 쪽에 0·흰색을 채운다
    const hasUv = b.parts.some((p) => p.geo.attributes.uv);
    const hasColor = b.parts.some((p) => p.geo.attributes.color);
    for (const p of b.parts) {
      const n = (p.geo.attributes.position as THREE.BufferAttribute).count;
      if (hasUv && !p.geo.attributes.uv) p.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      if (hasColor && !p.geo.attributes.color) p.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const col = p.geo.attributes.color as THREE.BufferAttribute | undefined;
      if (col && col.itemSize !== 3) {
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = col.getX(i); arr[i * 3 + 1] = col.getY(i); arr[i * 3 + 2] = col.getZ(i); }
        p.geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
    }
    const merged = b.parts.length === 1 ? b.parts[0].geo : mergeGeometries(b.parts.map((p) => p.geo), false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.order;
    mesh.layers.mask = b.layers;
    mesh.matrixAutoUpdate = false;
    mesh.userData.baked = b.parts.length;
    root.add(mesh);
    baked.push(mesh);
    if (b.parts.length > 1) for (const p of b.parts) p.geo.dispose();
  }
  // 원래 Mesh를 떼어 내고, 비어 버린 묶음도 거둔다(프레임마다 행렬을 고칠 물체 수가 준다)
  for (const m of taken) {
    let parent = m.parent;
    m.removeFromParent();
    while (parent && parent !== root && parent.children.length === 0 && (parent as THREE.Group).isGroup && !opt.stop?.has(parent)) {
      const up: THREE.Object3D | null = parent.parent;
      parent.removeFromParent();
      parent = up;
    }
  }
  root.updateMatrixWorld(true);
  return { before, after: before - taken.length + baked.length, baked };
}
