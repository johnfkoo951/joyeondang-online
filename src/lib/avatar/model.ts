// 사진 캐릭터 3D 모형(GLB 한 파일)의 약속과 확인(순수 함수). 사이트·일꾼·node --test 어디서나 돈다.
// 다른 파일을 런타임에 가져오지 않는다(node --test가 확장자 없는 경로를 못 읽음).
// 걷기 엔진과의 약속: +Y 위, +Z 정면, 발이 원점, 키 1.0, 삼각형 1만 이하, 텍스처 한 장(JPEG), meshopt 압축.
// 일꾼(worker/avatar/models.mjs)은 3D 서비스가 준 파일을 이 확인에 통과한 것만 올린다.

export const MODEL_TYPE = 'model/gltf-binary';
/** 일꾼이 올리는 모형의 상한. 3D 서비스의 보통 결과는 0.2~0.25MB */
export const MAX_MODEL_BYTES = 1.5 * 1024 * 1024;
/** 삼각형 상한: 휴대폰에서 여러 사람이 함께 서도 그리기 부담이 크지 않게 */
export const MAX_MODEL_TRIS = 10_000;
/**
 * 꼭 풀어야 읽을 수 있는 확장(extensionsRequired) 가운데 걷기 엔진이 읽을 수 있는 것.
 * 그 밖의 것(예: Draco 압축, 별도 텍스처 압축)이 있으면 엔진이 모형을 읽지 못하므로 올리지 않는다
 */
export const MODEL_EXTENSIONS: readonly string[] = [
  'EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_transform', 'KHR_materials_unlit',
];
/** 모양 확인의 너그러움: 키 1.0 ± 이만큼은 받는다 */
const HEIGHT_RANGE = [0.8, 1.25] as const;
/** 발(맨 아래)이 원점에서 이만큼 안쪽, 바닥 가운데가 원점에서 이만큼 안쪽 */
const FOOT_SLACK = 0.1;
const CENTER_SLACK = 0.25;

export type GlbFacts = {
  bytes: number;
  tris: number;
  /** 장면 전체의 높이(맨 아래 y에서 맨 위 y까지) */
  height: number;
  /** 맨 아래 y와 바닥 가운데(x, z) */
  foot: number;
  center: [number, number];
  images: number;
};
export type GlbCheck =
  | ({ ok: true } & GlbFacts)
  | { ok: false; reason: 'not_glb' | 'too_big' | 'bad_json' | 'no_mesh' | 'too_many_tris' | 'extension' | 'shape'; detail?: string };

const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const JSON_CHUNK = 0x4e4f534a;

/** GLB 머리(「glTF」, 판 2, 머리에 적힌 길이가 실제 길이와 같음)만 본다. 미리보기 원천처럼 형식만 확인할 때 쓴다 */
export function isGlb(bytes: Uint8Array): boolean {
  return bytes.length >= 20 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46 &&
    u32(bytes, 4) === 2 && u32(bytes, 8) === bytes.length;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

/** GLB 앞의 JSON 조각을 읽는다. 모양이 이상하면 null */
function readJson(bytes: Uint8Array): Json | null {
  const len = u32(bytes, 12);
  if (u32(bytes, 16) !== JSON_CHUNK || len === 0 || 20 + len > bytes.length) return null;
  try {
    return obj(JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))));
  } catch {
    return null;
  }
}

// ───────── 4×4 행렬(열 우선, glTF와 같은 순서)
type M4 = number[];
const IDENTITY: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M4, b: M4): M4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}
const nums = (v: unknown, n: number, fallback: number[]): number[] => {
  const a = list(v);
  return a.length === n && a.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (a as number[]) : fallback;
};
/** 마디의 자리·돌림·크기(또는 matrix)를 행렬로 */
function local(node: Json): M4 {
  const m = list(node.matrix);
  if (m.length === 16 && m.every((x) => typeof x === 'number' && Number.isFinite(x))) return m as number[];
  const [tx, ty, tz] = nums(node.translation, 3, [0, 0, 0]);
  const [x, y, z, w] = nums(node.rotation, 4, [0, 0, 0, 1]);
  const [sx, sy, sz] = nums(node.scale, 3, [1, 1, 1]);
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + w * z) * sx, 2 * (x * z - w * y) * sx, 0,
    2 * (x * y - w * z) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + w * x) * sy, 0,
    2 * (x * z + w * y) * sz, 2 * (y * z - w * x) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m: M4, p: number[]) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

/** 정수로 줄여 담은(정규화된) 값을 실제 값으로. 줄여 담지 않았으면 그대로 */
function dequantize(v: number, componentType: unknown, normalized: unknown): number {
  if (normalized !== true) return v;
  switch (componentType) {
    case 5120: return Math.max(v / 127, -1);
    case 5121: return v / 255;
    case 5122: return Math.max(v / 32767, -1);
    case 5123: return v / 65535;
    default: return v;
  }
}

/** 한 그림 조각(primitive)의 삼각형 수. 그리는 방식이 삼각형이 아니면(점·선) 0 */
function primitiveTris(prim: Json, accessors: unknown[]): number | null {
  const mode = prim.mode ?? 4;
  const attrs = obj(prim.attributes);
  const at = prim.indices !== undefined ? prim.indices : attrs?.POSITION;
  const n = typeof at === 'number' ? count(obj(accessors[at])?.count) : null;
  if (n === null) return null;
  if (mode === 4) return Math.floor(n / 3);
  if (mode === 5 || mode === 6) return Math.max(0, n - 2);
  return 0;
}

/**
 * 3D 서비스가 준 GLB를 확인한다: 머리, 크기, 꼭 풀어야 하는 확장, 삼각형 수(장면에 놓인 대로 센다), 모양(키·발·바닥 가운데).
 * 모양은 장면의 마디를 따라 POSITION의 min/max 여덟 꼭짓점을 옮겨 잰다(줄여 담은 값도 푼다).
 */
export function checkGlb(bytes: Uint8Array): GlbCheck {
  if (!isGlb(bytes)) return { ok: false, reason: 'not_glb' };
  if (bytes.length > MAX_MODEL_BYTES) return { ok: false, reason: 'too_big', detail: String(bytes.length) };
  const json = readJson(bytes);
  if (!json) return { ok: false, reason: 'bad_json' };
  const unknownExt = list(json.extensionsRequired).filter((e) => typeof e !== 'string' || !MODEL_EXTENSIONS.includes(e));
  if (unknownExt.length) return { ok: false, reason: 'extension', detail: unknownExt.map(String).join(',').slice(0, 120) };
  const accessors = list(json.accessors);
  const meshes = list(json.meshes);
  const nodes = list(json.nodes);
  const scenes = list(json.scenes);
  const sceneIndex = typeof json.scene === 'number' ? json.scene : 0;
  const roots = list(obj(scenes[sceneIndex])?.nodes);

  let tris = 0;
  let placed = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let shapeKnown = true;
  const seen = new Set<number>();
  const walk = (index: unknown, parent: M4, depth: number): boolean => {
    if (typeof index !== 'number' || depth > 32 || seen.has(index)) return false;
    seen.add(index);
    const node = obj(nodes[index]);
    if (!node) return false;
    const world = mul(parent, local(node));
    if (typeof node.mesh === 'number') {
      const mesh = obj(meshes[node.mesh]);
      if (!mesh) return false;
      for (const p of list(mesh.primitives)) {
        const prim = obj(p);
        if (!prim) return false;
        const t = primitiveTris(prim, accessors);
        if (t === null) return false;
        tris += t;
        placed++;
        const pos = obj(accessors[obj(prim.attributes)?.POSITION as number]);
        const min = list(pos?.min), max = list(pos?.max);
        if (min.length !== 3 || max.length !== 3 || ![...min, ...max].every((v) => typeof v === 'number' && Number.isFinite(v))) {
          shapeKnown = false;
          continue;
        }
        const a = (min as number[]).map((v) => dequantize(v, pos?.componentType, pos?.normalized));
        const b = (max as number[]).map((v) => dequantize(v, pos?.componentType, pos?.normalized));
        for (let k = 0; k < 8; k++) {
          const w = apply(world, [k & 1 ? b[0] : a[0], k & 2 ? b[1] : a[1], k & 4 ? b[2] : a[2]]);
          for (let d = 0; d < 3; d++) {
            lo[d] = Math.min(lo[d], w[d]);
            hi[d] = Math.max(hi[d], w[d]);
          }
        }
      }
    }
    for (const child of list(node.children)) if (!walk(child, world, depth + 1)) return false;
    return true;
  };
  for (const r of roots) if (!walk(r, IDENTITY, 0)) return { ok: false, reason: 'bad_json', detail: 'scene' };
  if (!placed || !tris) return { ok: false, reason: 'no_mesh' };
  if (tris > MAX_MODEL_TRIS) return { ok: false, reason: 'too_many_tris', detail: String(tris) };
  if (!shapeKnown) return { ok: false, reason: 'shape', detail: 'no bounds' };
  const height = hi[1] - lo[1];
  const center: [number, number] = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2];
  const round = (v: number) => Math.round(v * 1000) / 1000 || 0; // -0도 0으로
  const facts = { bytes: bytes.length, tris, height: round(height), foot: round(lo[1]), center: [round(center[0]), round(center[1])] as [number, number], images: list(json.images).length };
  if (!(height >= HEIGHT_RANGE[0] && height <= HEIGHT_RANGE[1]) || Math.abs(lo[1]) > FOOT_SLACK ||
      Math.abs(center[0]) > CENTER_SLACK || Math.abs(center[1]) > CENTER_SLACK) {
    return { ok: false, reason: 'shape', detail: JSON.stringify({ height: facts.height, foot: facts.foot, center: facts.center }) };
  }
  return { ok: true, ...facts };
}
