// 시험용 GLB 짓기: JSON 조각(과 BIN 조각)으로 GLB 한 파일을 만든다. 3D 서비스의 보통 결과와 같은 모양도 준다.
// 모형 확인(tests/unit/avatar-glb-check.test.ts)과 모형 일꾼(tests/unit/avatar-worker-models.test.mjs)이 함께 쓴다.

export type Json = Record<string, unknown>;

/** 조각은 4바이트 단위로 채운다(JSON은 빈칸, BIN은 0) */
export function glbOf(json: Json, bin = new Uint8Array(0)): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jlen = Math.ceil(text.length / 4) * 4;
  const blen = Math.ceil(bin.length / 4) * 4;
  const total = 20 + jlen + (bin.length ? 8 + blen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set([0x67, 0x6c, 0x54, 0x46]);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jlen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + jlen);
  if (bin.length) {
    dv.setUint32(20 + jlen, blen, true);
    dv.setUint32(24 + jlen, 0x004e4942, true);
    out.set(bin, 28 + jlen);
  }
  return out;
}

/** 3D 서비스의 보통 결과와 같은 모양: 9118 삼각형, 꼭짓점은 short로 줄여 담고 마디가 크기 0.5·자리 0.5로 키 1.0을 만든다 */
export const serviceJson = (): Json => ({
  asset: { version: '2.0', generator: 'test' },
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'body', mesh: 0, translation: [0, 0.5, 0], scale: [0.5, 0.5, 0.5] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 1, TEXCOORD_0: 2 }, indices: 0, mode: 4, material: 0 }] }],
  accessors: [
    { type: 'SCALAR', componentType: 5123, count: 27354 },
    { type: 'VEC3', componentType: 5122, count: 6474, normalized: true, min: [-14161, -32767, -16774], max: [14161, 32767, 16774] },
    { type: 'VEC2', componentType: 5123, count: 6474, normalized: true },
  ],
  images: [{ mimeType: 'image/jpeg', bufferView: 0 }],
  materials: [{ pbrMetallicRoughness: { metallicFactor: 0, baseColorTexture: { index: 0 } } }],
});

/** 3D 서비스의 보통 결과 한 파일(BIN 조각은 비어 있는 채로 bin바이트) */
export const serviceGlb = (bin = 64): Uint8Array => glbOf(serviceJson(), new Uint8Array(bin));
