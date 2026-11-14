// 사진 캐릭터 3D 모형(GLB)의 확인(src/lib/avatar/model.ts): 일꾼이 3D 서비스가 준 파일을 올리기 전에 보는 것.
// 3D 서비스의 보통 결과와 같은 모양(meshopt + 정수로 줄여 담은 꼭짓점, 마디의 크기·자리로 키 1.0)을 시험 안에서 짓는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glbOf, serviceJson as good, type Json } from './helpers/glb-fixture.ts';

const { MAX_MODEL_BYTES, MAX_MODEL_TRIS, MODEL_TYPE, checkGlb, isGlb } = await import('../../src/lib/avatar/model.ts');

const edit = (fn: (j: Json & { nodes: Json[]; accessors: Json[]; meshes: Json[] }) => void): Uint8Array => {
  const j = good() as Json & { nodes: Json[]; accessors: Json[]; meshes: Json[] };
  fn(j);
  return glbOf(j, new Uint8Array(64));
};

test('3D 서비스의 보통 결과는 통과하고, 삼각형·키·발·바닥 가운데를 알려 준다', () => {
  const r = checkGlb(glbOf(good(), new Uint8Array(1000)));
  assert.deepEqual(r, { ok: true, bytes: 20 + Math.ceil(JSON.stringify(good()).length / 4) * 4 + 8 + 1000, tris: 9118, height: 1, foot: 0,
    center: [0, 0], images: 1 });
  assert.equal(MODEL_TYPE, 'model/gltf-binary');
  assert.equal(MAX_MODEL_TRIS, 10000);
  assert.equal(MAX_MODEL_BYTES, 1572864);
});

test('GLB 머리: 「glTF」, 판 2, 머리에 적힌 길이가 실제 길이와 같아야 한다', () => {
  const ok = glbOf(good());
  assert.equal(isGlb(ok), true);
  const wrongMagic = ok.slice(); wrongMagic[0] = 0x47;
  const v1 = ok.slice(); new DataView(v1.buffer).setUint32(4, 1, true);
  const cut = ok.slice(0, ok.length - 4); // 잘린 파일(머리의 길이와 다르다)
  const longer = new Uint8Array(ok.length + 4); longer.set(ok);
  for (const bad of [wrongMagic, v1, cut, longer, new Uint8Array(0), new Uint8Array(19), Uint8Array.from([0x89, 0x50, 0x4e, 0x47])]) {
    assert.equal(isGlb(bad), false);
    assert.deepEqual(checkGlb(bad), { ok: false, reason: 'not_glb' });
  }
});

test('크기는 1.5MB까지', () => {
  const big = glbOf(good(), new Uint8Array(MAX_MODEL_BYTES));
  assert.equal(isGlb(big), true);
  assert.equal(checkGlb(big).ok, false);
  assert.equal((checkGlb(big) as { reason: string }).reason, 'too_big');
  const fits = glbOf(good(), new Uint8Array(MAX_MODEL_BYTES - 4096));
  assert.equal(checkGlb(fits).ok, true);
});

test('JSON 조각이 없거나 깨졌으면 bad_json', () => {
  const notJson = glbOf(good());
  new DataView(notJson.buffer).setUint32(16, 0x004e4942, true); // 첫 조각이 BIN
  const broken = glbOf(good());
  broken[20] = 0x7d; // 첫 글자 { 를 } 로
  const overflow = glbOf(good());
  new DataView(overflow.buffer).setUint32(12, overflow.length, true); // 조각 길이가 파일을 넘는다
  const array = glbOf([] as unknown as Json);
  for (const bad of [notJson, broken, overflow, array]) assert.equal((checkGlb(bad) as { reason: string }).reason, 'bad_json');
});

test('걷기 엔진이 풀 수 없는 필수 확장(Draco 등)이 있으면 올리지 않는다. 쓰기만 하는 확장은 괜찮다', () => {
  const draco = edit((j) => { j.extensionsRequired = ['KHR_draco_mesh_compression', 'KHR_mesh_quantization']; });
  assert.deepEqual(checkGlb(draco), { ok: false, reason: 'extension', detail: 'KHR_draco_mesh_compression' });
  const used = edit((j) => { j.extensionsUsed = ['KHR_materials_emissive_strength']; j.extensionsRequired = []; });
  assert.equal(checkGlb(used).ok, true);
  const odd = edit((j) => { j.extensionsRequired = [7]; });
  assert.equal((checkGlb(odd) as { reason: string }).reason, 'extension');
});

test('삼각형은 장면에 놓인 대로 센다: 1만까지, 두 번 놓인 몸은 두 번, 띠·부채꼴도 세고 점·선은 세지 않는다', () => {
  assert.deepEqual(checkGlb(edit((j) => { j.accessors[0].count = 30003; })), { ok: false, reason: 'too_many_tris', detail: '10001' });
  assert.equal((checkGlb(edit((j) => { j.accessors[0].count = 30000; })) as { tris: number }).tris, 10000);
  // 같은 몸을 두 마디에 놓으면 두 번 그려진다
  const twice = edit((j) => {
    j.accessors[0].count = 3000;
    (j.scenes as Json[])[0].nodes = [0, 1];
    j.nodes.push({ mesh: 0, translation: [0, 0.5, 0], scale: [0.5, 0.5, 0.5] });
  });
  assert.equal((checkGlb(twice) as { tris: number }).tris, 2000);
  // 색인 없이 꼭짓점만(삼각형 = 꼭짓점 / 3), 띠(꼭짓점 - 2), 선(0)
  const plain = edit((j) => { delete (j.meshes[0].primitives as Json[])[0].indices; });
  assert.equal((checkGlb(plain) as { tris: number }).tris, 2158);
  const strip = edit((j) => { (j.meshes[0].primitives as Json[])[0].mode = 5; j.accessors[0].count = 102; });
  assert.equal((checkGlb(strip) as { tris: number }).tris, 100);
  const lines = edit((j) => { (j.meshes[0].primitives as Json[])[0].mode = 1; });
  assert.deepEqual(checkGlb(lines), { ok: false, reason: 'no_mesh' });
});

test('그릴 몸이 없으면 no_mesh: 장면이 비었거나, 장면이 없거나, 몸 없는 마디뿐', () => {
  assert.deepEqual(checkGlb(edit((j) => { j.scenes = [{ nodes: [] }]; })), { ok: false, reason: 'no_mesh' });
  assert.deepEqual(checkGlb(edit((j) => { delete j.scenes; })), { ok: false, reason: 'no_mesh' });
  assert.deepEqual(checkGlb(edit((j) => { delete j.nodes[0].mesh; })), { ok: false, reason: 'no_mesh' });
});

test('모양: 키 1.0 언저리, 발이 원점, 바닥 가운데가 원점 가까이. 누운 모형·크기가 다른 모형·비켜선 모형은 올리지 않는다', () => {
  const reason = (b: Uint8Array) => (checkGlb(b) as { reason?: string }).reason;
  assert.equal(reason(edit((j) => { j.nodes[0].scale = [0.5, 0.25, 0.5]; })), 'shape', '키 0.5');
  assert.equal(reason(edit((j) => { j.nodes[0].scale = [50, 50, 50]; j.nodes[0].translation = [0, 50, 0]; })), 'shape', '키 100(단위가 다르다)');
  assert.equal(reason(edit((j) => { j.nodes[0].translation = [0, 0.8, 0]; })), 'shape', '공중에 떠 있다');
  assert.equal(reason(edit((j) => { j.nodes[0].translation = [0.5, 0.5, 0]; })), 'shape', '옆으로 비켜 있다');
  // Z가 위인 채로 온 모형(누움): 높이는 깊이만큼
  const lying = edit((j) => {
    j.accessors[1] = { type: 'VEC3', componentType: 5126, count: 6474, min: [-0.3, -0.2, 0], max: [0.3, 0.2, 1] };
    j.nodes[0] = { mesh: 0 };
  });
  const r = checkGlb(lying) as { ok: boolean; reason: string; detail: string };
  assert.deepEqual([r.ok, r.reason, JSON.parse(r.detail).height], [false, 'shape', 0.4]);
  // 같은 모형을 마디가 X축으로 -90도 돌려 세우면 통과한다(돌림도 따라 잰다)
  const s = Math.SQRT1_2;
  const stood = edit((j) => {
    j.accessors[1] = { type: 'VEC3', componentType: 5126, count: 6474, min: [-0.3, -0.2, 0], max: [0.3, 0.2, 1] };
    j.nodes[0] = { mesh: 0, rotation: [-s, 0, 0, s] };
  });
  const ok = checkGlb(stood) as { ok: boolean; height: number; foot: number; center: number[] };
  assert.deepEqual([ok.ok, ok.height, ok.foot, ok.center], [true, 1, 0, [0, 0]]);
});

test('모양: 부모 마디의 자리·크기도 곱해 재고(matrix도), unsigned byte로 줄여 담은 꼭짓점도 푼다', () => {
  const nested = edit((j) => {
    j.nodes[0] = { children: [1], translation: [0, 0.5, 0] };
    j.nodes.push({ mesh: 0, scale: [0.5, 0.5, 0.5] });
  });
  assert.equal((checkGlb(nested) as { height: number }).height, 1);
  const matrix = edit((j) => { j.nodes[0] = { mesh: 0, matrix: [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0, 0.5, 0, 1] }; });
  assert.deepEqual([(checkGlb(matrix) as { height: number }).height, (checkGlb(matrix) as { foot: number }).foot], [1, 0]);
  const ubyte = edit((j) => {
    j.accessors[1] = { type: 'VEC3', componentType: 5121, count: 6474, normalized: true, min: [0, 0, 0], max: [255, 255, 255] };
    j.nodes[0] = { mesh: 0, translation: [-0.15, 0, -0.1], scale: [0.3, 1, 0.2] };
  });
  const r = checkGlb(ubyte) as { ok: boolean; height: number; center: number[] };
  assert.deepEqual([r.ok, r.height, r.center], [true, 1, [0, 0]]);
});

test('모양을 잴 수 없으면(POSITION의 min/max가 없음) 올리지 않는다. 마디가 돌아 이어지면 bad_json', () => {
  const noBounds = edit((j) => { delete j.accessors[1].min; });
  assert.deepEqual(checkGlb(noBounds), { ok: false, reason: 'shape', detail: 'no bounds' });
  const loop = edit((j) => { j.nodes[0].children = [0]; });
  assert.deepEqual(checkGlb(loop), { ok: false, reason: 'bad_json', detail: 'scene' });
  const missingAccessor = edit((j) => { (j.meshes[0].primitives as Json[])[0].indices = 9; });
  assert.deepEqual(checkGlb(missingAccessor), { ok: false, reason: 'bad_json', detail: 'scene' });
});
