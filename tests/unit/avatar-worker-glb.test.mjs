// 바깥 3D 서비스의 GLB 다듬기(worker/avatar/glb.mjs): 작은 시험 모형을 지어 걷기 엔진의 약속(checkGlb)에 맞게 나오는지 본다.
// 조각 합치기, 마디 변환 굽기와 바로 세우기(키 1.0, 발이 원점, 바닥 가운데가 원점), 정면 돌리기, 삼각형 줄이기,
// 텍스처 1024 이하 JPEG, meshopt 압축, 쓰지 않는 꼭짓점 값 버리기, 다듬을 수 없는 모형의 까닭.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { checkGlb, MAX_MODEL_TRIS } from '../../src/lib/avatar/model.ts';
import { GLB_TARGET_BYTES, TEXTURE_MAX, createGlbTools, standMatrix } from '../../worker/avatar/glb.mjs';
import { createMeshyService } from '../../worker/avatar/meshy.mjs';
import { processModel } from '../../worker/avatar/models.mjs';

const tools = await createGlbTools();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

/** 한 색이 아닌 시험 텍스처(PNG, 알파 있음) */
async function texturePng(size) {
  const raw = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[i] = (x * 255) / size; raw[i + 1] = (y * 255) / size; raw[i + 2] = ((x ^ y) & 255); raw[i + 3] = 255;
    }
  }
  return new Uint8Array(await sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer());
}

/** 타원체 하나(위도 rings × 경도 segs 칸, 삼각형 2·rings·segs). 쓰지 않는 색 값(COLOR_0)도 싣는다 */
function ellipsoid(doc, buffer, { rings, segs, radius, center, material }) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings, phi = v * Math.PI;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs, th = u * 2 * Math.PI;
      const n = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
      pos.push(center[0] + n[0] * radius[0], center[1] + n[1] * radius[1], center[2] + n[2] * radius[2]);
      nor.push(...n);
      uv.push(u, v);
      col.push(1, 1, 1, 1);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s, b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(nor)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
    .setAttribute('COLOR_0', acc('VEC4', new Float32Array(col)))
    .setIndices(acc('SCALAR', new Uint32Array(idx)))
    .setMaterial(material);
  return doc.createMesh().addPrimitive(prim);
}

/**
 * 바깥 3D 서비스의 결과를 흉내 낸 모형: 몸과 머리(두 마디, 같은 재질), 머리는 앞(+Z)으로 조금 나왔다.
 * 부모 마디가 크기 3배, 엉뚱한 자리로 옮겨 놓았다(굽고 바로 세우는지 보려고). 삼각형은 상한을 넘는다
 */
async function sample({ texSize = 2048, rings = 60, segs = 80, secondMaterial = false, noTexture = false } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const tex = noTexture ? null : doc.createTexture('base').setImage(await texturePng(texSize)).setMimeType('image/png');
  const mat = doc.createMaterial('skin').setBaseColorTexture(tex).setMetallicFactor(0.5).setAlphaMode('BLEND');
  const other = secondMaterial ? doc.createMaterial('cloth').setBaseColorTexture(tex) : mat;
  const body = ellipsoid(doc, buffer, { rings, segs, radius: [0.3, 0.5, 0.25], center: [0, 0.5, 0], material: mat });
  const head = ellipsoid(doc, buffer, { rings: 20, segs: 24, radius: [0.25, 0.25, 0.25], center: [0, 1.2, 0.15], material: other });
  const root = doc.createNode('root').setScale([3, 3, 3]).setTranslation([5, 2, -1])
    .addChild(doc.createNode('body').setMesh(body))
    .addChild(doc.createNode('head').setMesh(head));
  doc.createScene('scene').addChild(root);
  doc.createAnimation('idle'); // 쓰지 않는 것
  return io.writeBinary(doc);
}

/** 다듬은 GLB를 다시 읽어 잰다 */
async function readBack(glb) {
  const doc = await io.readBinary(glb);
  const root = doc.getRoot();
  const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
  const { min, max } = getBounds(root.getDefaultScene());
  const top = (() => {
    // 가장 높은 꼭짓점의 z(머리가 앞으로 나온 쪽): 마디의 압축 변환을 거쳐 실제 자리로
    const node = root.listNodes().find((n) => n.getMesh());
    const m = node.getWorldMatrix();
    const p = prims[0].getAttribute('POSITION');
    let best = null;
    const v = [];
    for (let i = 0; i < p.getCount(); i++) {
      p.getElement(i, v);
      const w = [0, 1, 2].map((k) => m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]);
      if (!best || w[1] > best[1]) best = w;
    }
    return best;
  })();
  const image = root.listTextures()[0];
  return {
    prims, min, max, top, semantics: prims[0].listSemantics().sort(), textures: root.listTextures().length,
    mime: image?.getMimeType(), meta: image ? await sharp(image.getImage()).metadata() : null,
    animations: root.listAnimations().length, material: prims[0].getMaterial(),
  };
}

const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

test('다듬기: 조각을 하나로, 굽고 바로 세우고(키 1, 발 0, 바닥 가운데 0), 줄이고, 1024 JPEG, meshopt — checkGlb를 지난다', async () => {
  const raw = await sample();
  const { glb, stats } = await tools.tidy(raw);
  const check = checkGlb(glb);
  assert.equal(check.ok, true, JSON.stringify(check));
  assert.ok(check.tris <= MAX_MODEL_TRIS && check.tris > 4000, `tris ${check.tris}`);
  assert.equal(check.images, 1);
  assert.ok(glb.length <= GLB_TARGET_BYTES, `${glb.length} bytes`);
  assert.deepEqual([check.height, check.foot, check.center], [1, 0, [0, 0]]);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true))));
  assert.deepEqual([...json.extensionsRequired].sort(), ['EXT_meshopt_compression', 'KHR_mesh_quantization']);

  const back = await readBack(glb);
  assert.equal(back.prims.length, 1, '걷기 엔진은 첫 조각만 쓴다');
  assert.deepEqual(back.semantics, ['NORMAL', 'POSITION', 'TEXCOORD_0'], '쓰지 않는 색 값은 버린다');
  assert.ok(near(back.max[1] - back.min[1], 1) && near(back.min[1], 0), JSON.stringify(back));
  assert.ok(near((back.min[0] + back.max[0]) / 2, 0) && near((back.min[2] + back.max[2]) / 2, 0));
  assert.ok(back.top[2] > 0.02, `머리(가장 높은 곳)는 앞(+Z)으로 나와 있다 ${back.top}`);
  assert.deepEqual([back.textures, back.mime, back.meta.width, back.meta.height], [1, 'image/jpeg', TEXTURE_MAX, TEXTURE_MAX]);
  assert.equal(back.animations, 0);
  assert.deepEqual([back.material.getAlphaMode(), back.material.getMetallicFactor()], ['OPAQUE', 0]);

  assert.equal(stats.simplified, true);
  assert.ok(stats.raw_tris > MAX_MODEL_TRIS, `raw ${stats.raw_tris}`);
  assert.equal(stats.tris, check.tris);
  assert.deepEqual([stats.tex_w, stats.tex_h, stats.jpeg_q, stats.bytes, stats.raw_bytes], [1024, 1024, 85, glb.length, raw.length]);
});

test('다듬기: yaw만큼 y축으로 돌린다(정면이 뒤를 보면 180). 작은 모형은 줄이지 않고 작은 텍스처는 키우지 않는다', async () => {
  const small = await sample({ texSize: 256, rings: 24, segs: 32 });
  const turned = await tools.tidy(small, { yaw: 180 });
  assert.equal(checkGlb(turned.glb).ok, true);
  const back = await readBack(turned.glb);
  assert.ok(back.top[2] < -0.02, `돌린 뒤 머리는 -Z 쪽 ${back.top}`);
  assert.deepEqual([back.meta.width, back.meta.height], [256, 256]);
  assert.equal(turned.stats.simplified, false);
  assert.equal(turned.stats.tris, turned.stats.raw_tris);
});

test('다듬기: 다듬을 수 없는 모형은 까닭을 붙여 던진다(GLB가 아님, 재질이 여럿, 텍스처 없음)', async () => {
  const why = (bytes) => tools.tidy(bytes).then(() => null, (e) => e.code);
  assert.equal(await why(new Uint8Array([1, 2, 3, 4])), 'glb_unreadable');
  assert.equal(await why(await sample({ texSize: 64, rings: 8, segs: 8, secondMaterial: true })), 'glb_parts');
  assert.equal(await why(await sample({ rings: 8, segs: 8, noTexture: true })), 'glb_no_texture');
});

test('끝까지: 일꾼의 한 바퀴(processModel)가 가짜 Meshy의 큰 GLB를 다듬어 확인을 지나 올리고 meshy-7.1로 적는다. 작업을 만들면 DB에 알리고, 받은 원본을 넘긴 뒤 Meshy에서 지운다', async () => {
  const UID = '11111111-1111-4111-8111-111111111111';
  const ID = '22222222-2222-4222-8222-222222222222';
  const CHAR = `${UID}/chars/${ID}.png`;
  const raw = await sample();
  const asked = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    asked.push(`${init.method ?? 'GET'} ${u.host}${u.pathname}`);
    if (u.pathname === '/openapi/v1/balance') return Response.json({ balance: 100 });
    if (init.method === 'POST') return Response.json({ result: 'task-1' }, { status: 202 });
    if (u.host === 'api.meshy.ai') {
      return Response.json({ id: 'task-1', status: 'SUCCEEDED', model_urls: { glb: 'https://assets.meshy.ai/t/model.glb' }, consumed_credits: 35 });
    }
    return new Response(raw);
  };
  const service = createMeshyService({ apiKey: 'msy_test', tidy: tools.tidy, fetch, sleep: async () => {} });
  const files = new Map([[CHAR, await texturePng(16)]]);
  const calls = [];
  const db = {
    async modelClaim(worker, lease) {
      calls.push(['claim', lease]);
      return { id: ID, user_id: UID, image_path: CHAR, attempts: 1, bad_fails: 0, requested_at: '2026-11-12T03:00:00+00:00', via: 'meshy' };
    },
    async modelJob(id) { calls.push(['job', id]); return true; },
    async modelRelease(...a) { calls.push(['release', ...a.slice(2)]); return true; },
    async modelSettle(id, status, { maker, reason = null }) { calls.push(['settle', status, maker, reason]); return true; },
  };
  const store = {
    async download(p) { return files.get(p); },
    async upload(p, bytes, type) { files.set(p, bytes); calls.push(['upload', p.slice(UID.length + 1), type]); },
    async remove() {},
  };
  assert.equal(await service.ready(), true);
  const kept = [];
  const keepRaw = async (r) => { kept.push([r.id, r.uid, r.raw.length, asked.some((a) => a.startsWith('DELETE'))]); };
  assert.deepEqual(await processModel({ db, store, service, worker: 'w1', keepRaw }), { outcome: 'ready', id: ID });
  assert.deepEqual(calls, [
    ['claim', 1200], ['job', ID], ['upload', `models/${ID}.v1.glb`, 'model/gltf-binary'], ['settle', 'ready', 'meshy-7.1', null],
  ]);
  assert.deepEqual(kept, [[ID, UID, raw.length, false]], 'Meshy가 준 그대로의 GLB를 Meshy에서 지우기 전에 넘긴다');
  const check = checkGlb(files.get(`${UID}/models/${ID}.v1.glb`));
  assert.equal(check.ok, true, JSON.stringify(check));
  assert.deepEqual([check.height, check.foot, check.center, check.images], [1, 0, [0, 0], 1]);
  assert.deepEqual(asked, [
    'GET api.meshy.ai/openapi/v1/balance', 'POST api.meshy.ai/openapi/v1/image-to-3d', 'GET api.meshy.ai/openapi/v1/image-to-3d/task-1',
    'GET assets.meshy.ai/t/model.glb', 'DELETE api.meshy.ai/openapi/v1/image-to-3d/task-1',
  ]);
  // 요청한 때가 없는 줄(0021 전의 잡기: 걷기에 입은 캐릭터)은 Meshy에 아무것도 보내지 않고 돌려놓은 뒤 멈춘다
  asked.length = 0;
  calls.length = 0;
  db.modelClaim = async (worker, lease) => {
    calls.push(['claim', lease]);
    return { id: ID, user_id: UID, image_path: CHAR, attempts: 1, bad_fails: 0 };
  };
  assert.deepEqual(await processModel({ db, store, service, worker: 'w1' }), { outcome: 'unrequested', id: ID, trouble: true, halt: true });
  assert.deepEqual([calls, asked], [[['claim', 1200], ['release', 0, false]], []]);
});

test('바로 세우는 행렬: 키로 나눠 발을 0, 바닥 가운데를 원점에. 납작하거나 비면 null', () => {
  const m = standMatrix([1, 2, 3], [3, 6, 5]);
  const at = (p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
  assert.deepEqual(at([1, 2, 3]), [-0.25, 0, -0.25]);
  assert.deepEqual(at([3, 6, 5]), [0.25, 1, 0.25]);
  assert.equal(standMatrix([0, 1, 0], [1, 1, 1]), null);
  assert.equal(standMatrix([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]), null);
});
