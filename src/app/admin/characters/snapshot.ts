import * as THREE from 'three';
import { SNAP_H, SNAP_TEXTURE, SNAP_W } from '@/lib/avatar/admin-gallery';
import { fetchModel, freeModel, type ModelData } from '@/walk/avatar';
import { STAGE_FOV, START_YAW, frameModel, lightStage, stageMaterial } from './stage';

// 3D 모형 보기의 정지 사진을 찍는 곳(브라우저 전용, 처음 찍을 때 따로 불러온다: 2D 그림 보기만 쓰면 three.js를 받지 않는다).
// 화면에 붙이지 않은 캔버스 하나와 three.js 그리개 하나를 모든 카드가 함께 쓴다. 차례는 SnapQueue가 정한다(한 번에 한 장).
// 모형은 「3D 보기」와 같은 길(fetchModel → parseModel: meshopt 풀기, 발바닥 원점, 키 맞춤)로 읽고, 같은 빛과 처음 각도로 찍는다(stage.ts).
// 한 장을 찍으면 그 모형의 기하·그림·재질을 바로 놓는다. 그리개는 줄이 한동안 비거나 움직이는 3D 보기가 열리면 놓는다(release).
// 그림 문맥(WebGL)을 만들 수 없는 기기면 다시 해 보지 않고 모두 null이다(카드가 2D 그림과 「3D」 표시로 대신한다).

type Booth = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; holder: THREE.Group };
let booth: Booth | null = null;
let noGl = false;

/** 모형 하나를 받는 데 기다리는 상한(ms). 느린 망에서 한 장이 줄 전체를 붙잡지 않게 */
const FETCH_MS = 30_000;

function open(): Booth | null {
  if (booth || noGl) return booth;
  const canvas = document.createElement('canvas');
  let renderer: THREE.WebGLRenderer;
  try {
    // 찍은 판을 toBlob이 그대로 읽게(preserveDrawingBuffer). 바탕은 투명(카드의 바탕이 비친다).
    // 문맥은 먼저 직접 얻어 본다: 없으면 three.js가 오류를 찍기 전에 조용히 2D로 대신한다
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
    if (!context) throw new Error('no webgl2');
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    noGl = true;
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(SNAP_W, SNAP_H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  lightStage(scene);
  const cam = new THREE.PerspectiveCamera(STAGE_FOV, SNAP_W / SNAP_H, 0.05, 20);
  const holder = new THREE.Group();
  holder.rotation.y = START_YAW;
  scene.add(holder);
  const made: Booth = { renderer, scene, cam, holder };
  // 기기가 그림 문맥을 거둬 가면 이 그리개는 버린다(다음 사진 때 새로 만든다)
  canvas.addEventListener('webglcontextlost', () => {
    if (booth === made) booth = null;
  });
  booth = made;
  return made;
}

/** 그리개를 놓는다(그림 문맥까지). 쥔 것이 없으면 아무것도 하지 않는다 */
export function release(): void {
  const b = booth;
  if (!b) return;
  booth = null;
  b.renderer.dispose();
  b.renderer.forceContextLoss();
}

/** 상한 안에 모형을 받는다. 넘으면 null(늦게 온 모형은 받는 대로 놓는다) */
function fetchWithin(src: string): Promise<ModelData | null | 'none'> {
  const got = fetchModel(src, SNAP_TEXTURE);
  let timer = 0;
  const late = new Promise<null>((ok) => {
    timer = window.setTimeout(() => {
      void got.then((d) => (d && d !== 'none' ? freeModel(d) : undefined), () => undefined);
      ok(null);
    }, FETCH_MS);
  });
  return Promise.race([got, late]).finally(() => window.clearTimeout(timer));
}

const blobOf = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((ok) => {
  try {
    canvas.toBlob(ok, 'image/webp', 0.9);
  } catch {
    ok(null);
  }
});

/** 한 장 찍는다(SnapQueue의 shoot). 못 받거나, 못 풀거나, 못 그리면 null */
export async function shoot(src: string, gate: () => Promise<void>): Promise<string | null> {
  if (noGl) return null;
  const data = await fetchWithin(src);
  if (!data || data === 'none') return null;
  const mat = stageMaterial(data.texture);
  const mesh = new THREE.Mesh(data.geometry, mat);
  try {
    await gate();
    const b = open();
    if (!b) return null;
    b.holder.add(mesh);
    frameModel(b.cam, data.geometry.boundingBox);
    b.renderer.render(b.scene, b.cam);
    const blob = await blobOf(b.renderer.domElement);
    return blob && blob.size > 0 ? URL.createObjectURL(blob) : null;
  } finally {
    // 찍은 모형은 바로 놓는다(그리개의 GPU 버퍼·그림도 dispose를 따라 풀린다)
    mesh.removeFromParent();
    mat.dispose();
    freeModel(data);
  }
}
