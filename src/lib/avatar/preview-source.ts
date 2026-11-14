import { MODEL_TYPE, isGlb } from '@/lib/avatar/model';
import { isUuid, sniffImageType, type ViewSize } from '@/lib/avatar/rules';
import { localPreview } from '@/lib/preview';

// 이 컴퓨터 미리보기에서만 쓰는 그림 원천. 로그인 없이 걷기 화면에서 사진 캐릭터(그림 한 장, 방향 그림 묶음, 3D 모형)가
// 어떻게 보이는지 확인하려는 것이다. 미리보기 스위치(src/lib/preview.ts의 두 겹 잠금)가 켜져 있고
// 환경 변수 AVATAR_PREVIEW_DIR이 있을 때만 그 폴더의 <id>.png, <id>.v1l.webp, <id>.v1s.webp, <id>.glb를 읽는다.
// 운영에서는 스위치가 켜지지 않으므로 늘 null이고, 그때는 파일 시스템을 건드리지도 않는다.

/** 'char'는 캐릭터 그림 한 장, 'l'·'s'는 방향 그림 묶음의 큰 것·작은 것, 'model'은 3D 모형(GLB) */
export type PreviewKind = 'char' | ViewSize | 'model';
export type PreviewFile = { bytes: Uint8Array<ArrayBuffer>; type: 'image/png' | 'image/webp' | typeof MODEL_TYPE };

/** 한 파일의 상한. 저장소 버킷의 상한(8MB)과 같다 */
const MAX_BYTES = 8 * 1024 * 1024;
/** 읽을 수 있는 파일 이름은 이 모양뿐이다: 폴더를 벗어나는 글자(/, \, ..)가 들어갈 자리가 없다 */
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|v1[ls]\.webp|glb)$/;

/** 파일 시스템에서 쓰는 만큼만(시험에서 「건드리지 않았다」를 볼 수 있게) */
export type PreviewDisk = {
  lstat: (file: string) => Promise<{ isFile: () => boolean; size: number }>;
  readFile: (file: string) => Promise<Uint8Array>;
};

// 파일 읽기 모듈은 스위치가 켜졌을 때에만, 그것도 묶는 도구가 따라오지 않게 불러온다(webpackIgnore는 Turbopack도 따른다).
// 묶는 도구가 이 파일을 「어느 폴더든 읽는 코드」로 보면 배포 묶음에 프로젝트 파일을 넣으려 든다
// (읽을 폴더는 환경 변수라 미리 알 수 없다). 같은 까닭으로 경로도 path 모듈 없이 글자로 잇는다.
async function nodeDisk(): Promise<PreviewDisk> {
  const fs = await import(/* webpackIgnore: true */ 'node:fs/promises');
  return { lstat: (file) => fs.lstat(file), readFile: (file) => fs.readFile(file) };
}

function fileName(id: string, kind: PreviewKind): string | null {
  if (!isUuid(id)) return null;
  const name = kind === 'char' ? `${id}.png` : kind === 'l' || kind === 's' ? `${id}.v1${kind}.webp` : kind === 'model' ? `${id}.glb` : '';
  return FILE_NAME.test(name) ? name : null;
}

/**
 * 미리보기 폴더에서 그림 하나를 읽는다. 스위치가 꺼졌거나, 폴더가 없거나, 그런 파일이 없으면 null
 * (부른 쪽은 평소 길로 간다: 로그인한 명단 손님에게만 저장소의 그림을 준다).
 */
export async function readPreviewAvatar(
  id: string,
  kind: PreviewKind,
  env: Record<string, string | undefined> = process.env,
  disk?: PreviewDisk,
): Promise<PreviewFile | null> {
  if (!localPreview(env)) return null;
  const dir = (env.AVATAR_PREVIEW_DIR ?? '').replace(/\/+$/, '');
  if (!dir) return null;
  const name = fileName(id, kind);
  if (!name) return null;
  const file = `${dir}/${name}`;
  try {
    const { lstat, readFile } = disk ?? (await nodeDisk());
    const stat = await lstat(file);
    // 진짜 파일만 읽는다(바로가기는 폴더 밖을 가리킬 수 있다). 너무 큰 것도 읽지 않는다
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    const bytes = new Uint8Array(await readFile(file));
    // 이름이 아니라 앞머리 바이트로 형식을 확인한다(다른 것을 그림이나 모형이라며 내보내지 않게)
    if (kind === 'model') return isGlb(bytes) ? { bytes, type: MODEL_TYPE } : null;
    const type = kind === 'char' ? 'image/png' : 'image/webp';
    if (sniffImageType(bytes) !== type) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

/** 미리보기 그림·모형의 답. 폴더의 파일을 바꿔 가며 보므로 브라우저에 남기지 않는다 */
export function previewResponse(file: PreviewFile): Response {
  return new Response(file.bytes, {
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(file.bytes.length),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'Content-Disposition': 'inline',
    },
  });
}
