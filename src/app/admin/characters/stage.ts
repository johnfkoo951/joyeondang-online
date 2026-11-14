import * as THREE from 'three';
import { frameFor } from '@/lib/avatar/admin-gallery';

// 캐릭터 관리 콘솔의 3D 무대: 빛, 처음 각도, 사진기 자리, 재질. 「3D 보기」(ModelPreview)와 3D 모형 보기의 정지 사진(snapshot)이
// 함께 쓴다. 그래서 갤러리의 사진이 「3D 보기」를 막 열었을 때의 모습과 같다.

/** 세로 시야(도) */
export const STAGE_FOV = 30;
/** 처음 각도(rad): 정면에서 조금 돌려 두께가 보이게 */
export const START_YAW = -0.4;

/** 하늘빛과 비스듬한 햇빛 */
export function lightStage(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight('#fff7ea', '#b9a58c', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5);
  sun.position.set(1.5, 3, 2.5);
  scene.add(sun);
}

/** 모형 그림을 입힌 재질(쓰고 나면 dispose) */
export function stageMaterial(map: THREE.Texture | null): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
}

/** 모형의 상자를 모를 때 쓰는 보통 키의 상자 */
const PLAIN = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 1.2, 0.3));

/** 모형 상자에 맞춰 사진기를 놓는다(frameFor: 키 전체가 보이고, 돌려도 옆이 잘리지 않게) */
export function frameModel(cam: THREE.PerspectiveCamera, box: THREE.Box3 | null | undefined): void {
  const f = frameFor(box ?? PLAIN, cam.fov, cam.aspect);
  cam.position.set(0, f.eyeY, f.dist);
  cam.lookAt(0, f.lookY, 0);
}
