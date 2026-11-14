// 바깥 3D 서비스(Meshy)가 준 GLB를 걷기 엔진의 약속에 맞추는 후처리(gltf-transform·meshoptimizer·sharp를 감싼 얇은 층).
// 약속은 src/lib/avatar/model.ts(checkGlb)와 걷기 엔진이 정한다: +Y 위, +Z 정면, 발이 원점, 키 1.0, 바닥 가운데가 원점,
// 그림 조각 하나(걷기 엔진은 첫 조각만 쓴다), 삼각형 1만 이하, 텍스처 한 장(1024 이하 JPEG), meshopt 압축.
// trellis 서비스는 그래픽 카드 PC가 같은 일을 해서 돌려주므로 이 파일을 쓰지 않는다.
//   tidy(bytes, {yaw}) → {glb, stats}
//     1. 걷기 엔진이 쓰지 않는 것 버리기: 움직임·뼈대·카메라, 위치·법선·uv 밖의 꼭짓점 값, 기본색 밖의 텍스처
//     2. 장면을 펴고 같은 재질의 조각을 하나로 합친다. 하나로 모이지 않으면(재질이 여럿) 던진다
//     3. 바로 세우기: 마디 변환을 꼭짓점에 굽고, y축으로 yaw만큼 돌린 뒤 키 1.0, 발(맨 아래)이 y 0, 바닥 가운데가 원점
//     4. 삼각형이 많으면 줄이기(meshoptimizer). 오차 한도를 조금씩 넓혀 상한 안으로
//     5. 텍스처를 1024 이하 JPEG로(품질 85에서 시작해 1MB를 넘으면 낮춘다) → meshopt 압축
// 실패는 까닭(code)을 붙여 던진다. 라이브러리는 meshy를 쓸 때만 필요해서 createGlbTools가 처음에 한 번 불러온다
// (없으면 던지고, 부르는 쪽이 3D 모형만 끈다).
import { MAX_MODEL_TRIS, MODEL_EXTENSIONS } from '../../src/lib/avatar/model.ts';

/** 텍스처 한 변의 상한(그 PC의 3D 서비스와 같다) */
export const TEXTURE_MAX = 1024;
/** 이 크기를 넘으면 JPEG 품질을 낮춰 다시 쓴다(올리는 상한 1.5MB보다 넉넉히 아래) */
export const GLB_TARGET_BYTES = 1_000_000;
const JPEG_QUALITIES = [85, 75, 65, 55];
/** 줄일 때 목표는 상한의 97%. 오차 한도(모형 크기의 몫)는 1%에서 시작하고, 그래도 많으면 넓힌다(마지막은 한도 없이) */
const SIMPLIFY_GOAL = 0.97;
const SIMPLIFY_ERRORS = [0.01, 0.03, 1];
/** 걷기 엔진이 읽는 꼭짓점 값 */
const KEEP_ATTRIBUTES = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0']);
const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

const failure = (code, message) => Object.assign(new Error(message ?? code), { code });

/** y축으로 deg도 돌리는 행렬(열 우선). 90도 단위는 정확한 값으로 */
function yawMatrix(deg) {
  const a = (deg * Math.PI) / 180;
  const clean = (v) => Math.round(v * 1e12) / 1e12 || 0;
  const c = clean(Math.cos(a)), s = clean(Math.sin(a));
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** 키 1.0, 발이 y 0, 바닥 가운데가 원점이 되게 옮기고 키우는 행렬(열 우선). 모양을 잴 수 없으면 null */
export function standMatrix(min, max) {
  const height = max[1] - min[1];
  if (!(height > 1e-6) || !Number.isFinite(height) || ![...min, ...max].every(Number.isFinite)) return null;
  const k = 1 / height;
  const t = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  return [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, t[0] * k, t[1] * k, t[2] * k, 1];
}

export async function createGlbTools() {
  const [core, extensions, fn, mo, { default: sharp }] = await Promise.all([
    import('@gltf-transform/core'), import('@gltf-transform/extensions'), import('@gltf-transform/functions'),
    import('meshoptimizer'), import('sharp'),
  ]);
  const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = mo;
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  // 라이브러리의 안내 글이 일꾼 기록에 섞이지 않게 오류만
  const quiet = new core.Logger(core.Logger.Verbosity.ERROR);
  const io = new core.NodeIO()
    .setLogger(quiet)
    .registerExtensions(extensions.ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const keepExtensions = new Set(MODEL_EXTENSIONS);
  const prune = () => fn.prune({ keepSolidTextures: true });

  /** 조각 하나의 삼각형 수 */
  const trisOf = (prim) => Math.floor((prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3);

  /** 장면에서 그림 조각을 가진 마디들과 그 조각들 */
  function meshParts(scene) {
    const holders = [];
    scene.traverse((n) => { if (n.getMesh()) holders.push(n); });
    return { holders, prims: holders.flatMap((n) => n.getMesh().listPrimitives()) };
  }

  /** 기본색 텍스처를 1024 이하 JPEG로. 알파는 버린다(불투명 재질이라 쓰이지 않는다) */
  const jpegOf = async (src, q) => {
    const buf = await sharp(src)
      .removeAlpha()
      .resize({ width: TEXTURE_MAX, height: TEXTURE_MAX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: q })
      .toBuffer();
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
  };

  return {
    async tidy(bytes, { yaw = 0, maxTris = MAX_MODEL_TRIS, maxBytes = GLB_TARGET_BYTES } = {}) {
      let doc;
      try {
        doc = await io.readBinary(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      } catch (err) {
        throw failure('glb_unreadable', `read: ${String(err?.message ?? 'failed').slice(0, 120)}`);
      }
      doc.setLogger(quiet);
      const root = doc.getRoot();
      const scene = root.getDefaultScene() ?? root.listScenes()[0];
      if (!scene) throw failure('glb_no_mesh', 'no scene');
      // 1. 걷기 엔진이 쓰지 않는 것
      for (const s of root.listScenes()) if (s !== scene) s.dispose();
      root.setDefaultScene(scene);
      for (const a of root.listAnimations()) a.dispose();
      for (const s of root.listSkins()) s.dispose();
      for (const c of root.listCameras()) c.dispose();
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          for (const t of prim.listTargets()) prim.removeTarget(t);
          for (const sem of prim.listSemantics()) if (!KEEP_ATTRIBUTES.has(sem)) prim.setAttribute(sem, null);
        }
      }
      // 2. 펴고 합치기(같은 재질끼리. 줄여 담은 값은 먼저 푼다). 한 색뿐인 텍스처도 재질 값으로 바꾸지 않는다(텍스처 한 장이 약속)
      await doc.transform(prune(), fn.dequantize(), fn.dedup(), fn.flatten(), fn.join({ keepNamed: false }));
      const { holders, prims } = meshParts(scene);
      if (!prims.length) throw failure('glb_no_mesh', 'no mesh');
      if (holders.length !== 1 || prims.length !== 1) throw failure('glb_parts', `${holders.length} nodes, ${prims.length} parts`);
      const node = holders[0];
      let prim = prims[0];
      if (prim.getMode() === TRIANGLE_STRIP || prim.getMode() === TRIANGLE_FAN) fn.convertPrimitiveToTriangles(prim);
      if (prim.getMode() !== TRIANGLES || !prim.getAttribute('POSITION')) throw failure('glb_no_mesh', `mode ${prim.getMode()}`);
      const material = prim.getMaterial();
      const texture = material?.getBaseColorTexture() ?? null;
      const source = texture?.getImage() ?? null;
      if (!material || !texture || !source?.length) throw failure('glb_no_texture', 'no base color texture');
      // 다듬기 전 텍스처의 크기와 형식(원본 에셋 기록의 「다듬기 전」). 읽지 못해도 다듬기는 그대로
      const rawTex = await sharp(source).metadata().catch(() => ({}));
      // 3. 바로 세우기: 마디 변환을 꼭짓점에 굽고, 돌리고, 키·발·바닥 가운데를 맞춘다
      fn.clearNodeParent(node);
      fn.clearNodeTransform(node);
      const mesh = node.getMesh();
      if (yaw) fn.transformMesh(mesh, yawMatrix(yaw));
      const { min, max } = fn.getBounds(scene);
      const stand = standMatrix(min, max);
      if (!stand) throw failure('glb_shape', 'flat or empty');
      fn.transformMesh(mesh, stand);
      // 4. 줄이기
      const rawTris = trisOf(prim);
      let tris = rawTris;
      if (tris > maxTris || !prim.getIndices()) await doc.transform(fn.weld());
      prim = mesh.listPrimitives()[0];
      tris = trisOf(prim);
      let simplified = false;
      for (const error of SIMPLIFY_ERRORS) {
        if (tris <= maxTris) break;
        await doc.transform(fn.simplify({ simplifier: MeshoptSimplifier, ratio: (maxTris * SIMPLIFY_GOAL) / tris, error }));
        prim = mesh.listPrimitives()[0];
        tris = trisOf(prim);
        simplified = true;
      }
      // 재질: 기본색 텍스처 한 장만(나머지 텍스처와 재질 확장은 버린다). 걷기 엔진은 받은 재질을 쓰지 않고 텍스처만 옮겨 쓴다
      material
        .setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicRoughnessTexture(null)
        .setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(1).setAlphaMode('OPAQUE');
      for (const ext of root.listExtensionsUsed()) if (!keepExtensions.has(ext.extensionName)) ext.dispose();
      await doc.transform(prune(), fn.dedup());
      if (root.listTextures().length !== 1) throw failure('glb_no_texture', `${root.listTextures().length} textures`);
      // 5. 텍스처 JPEG와 meshopt 압축(압축은 쓸 때 일어난다). 너무 크면 품질을 낮춰 다시 쓴다
      await doc.transform(fn.meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
      let glb = null;
      let quality = 0;
      let jpeg = null;
      for (const q of JPEG_QUALITIES) {
        jpeg = await jpegOf(source, q);
        texture.setImage(jpeg).setMimeType('image/jpeg');
        glb = await io.writeBinary(doc);
        quality = q;
        if (glb.length <= maxBytes) break;
      }
      const meta = await sharp(jpeg).metadata();
      return {
        glb,
        stats: {
          raw_bytes: bytes.length, raw_tris: rawTris, raw_tex_w: rawTex.width ?? 0, raw_tex_h: rawTex.height ?? 0,
          raw_tex_type: typeof rawTex.format === 'string' ? rawTex.format.slice(0, 16) : null,
          tris, simplified, tex_w: meta.width ?? 0, tex_h: meta.height ?? 0, jpeg_q: quality, bytes: glb.length,
        },
      };
    },
  };
}
