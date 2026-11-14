import { sniffImageType } from '@/lib/avatar/rules';
import { GALLERY_TEXT, MANIFEST_FILE, artKey, isGalleryPath, parseManifest, type GalleryItem } from '@/lib/gallery-manifest';
import { localPreview } from '@/lib/preview';

// 이 컴퓨터 미리보기에서만 쓰는 갤러리 전시 목록 원천. 로그인 없이(저장소 없이) 걷기 화면의 갤러리가 어떻게 보이는지
// 확인하려는 것이다. 미리보기 스위치(src/lib/preview.ts의 두 겹 잠금)가 켜져 있고 환경 변수 GALLERY_PREVIEW_DIR이 있을 때만,
// 그 폴더의 manifest.json(버킷의 목록과 같은 모양)과 그 안의 그림 경로를 읽어 그림을 data 주소로 담아 준다.
// 운영에서는 스위치가 켜지지 않으므로 늘 null이고, 그때는 파일 시스템을 건드리지도 않는다.

/** 그림 한 장의 상한(버킷 상한과 같다) */
const MAX_BYTES = 5 * 1024 * 1024;
/** 미리보기로 담는 그림 수(응답이 너무 커지지 않게) */
const MAX_ITEMS = 40;

/** 파일 시스템에서 쓰는 만큼만(시험에서 「건드리지 않았다」를 볼 수 있게) */
export type GalleryDisk = {
  lstat: (file: string) => Promise<{ isFile: () => boolean; size: number }>;
  readFile: (file: string) => Promise<Uint8Array>;
};

// 파일 읽기 모듈은 스위치가 켜졌을 때에만, 묶는 도구가 따라오지 않게 불러온다(사진 캐릭터 미리보기와 같은 까닭)
async function nodeDisk(): Promise<GalleryDisk> {
  const fs = await import(/* webpackIgnore: true */ 'node:fs/promises');
  return { lstat: (file) => fs.lstat(file), readFile: (file) => fs.readFile(file) };
}

async function readSmall(disk: GalleryDisk, file: string, max: number): Promise<Uint8Array | null> {
  try {
    const st = await disk.lstat(file);
    // 진짜 파일만(바로가기는 폴더 밖을 가리킬 수 있다), 너무 큰 것은 읽지 않는다
    if (!st.isFile() || st.size > max) return null;
    return new Uint8Array(await disk.readFile(file));
  } catch {
    return null;
  }
}

/**
 * 미리보기 폴더의 전시 목록(지금 걸린 액자 id만). 스위치가 꺼졌거나 폴더·목록이 없거나 목록이 깨졌으면 null(부른 쪽은 평소 길로
 * 간다: 명단 손님에게만 저장소의 목록을 준다). 그림을 못 읽은 줄은 뺀다. 그림 열쇠는 파일 내용을 다진 값(바꾸면 바뀐다)
 */
export async function previewGalleryItems(
  ids: ReadonlySet<string>,
  env: Record<string, string | undefined> = process.env,
  disk?: GalleryDisk,
): Promise<GalleryItem[] | null> {
  if (!localPreview(env)) return null;
  const dir = (env.GALLERY_PREVIEW_DIR ?? '').replace(/\/+$/, '');
  if (!dir) return null;
  const d = disk ?? (await nodeDisk());
  const raw = await readSmall(d, `${dir}/${MANIFEST_FILE}`, GALLERY_TEXT.bytes);
  if (!raw) return null;
  const entries = parseManifest(new TextDecoder().decode(raw));
  if (!entries) return null;
  const out: GalleryItem[] = [];
  for (const [id, e] of entries) {
    if (!ids.has(id) || out.length >= MAX_ITEMS) continue;
    const urls: Array<string | null> = [];
    const files: Uint8Array[] = [];
    for (const path of [e.image, e.thumb]) {
      if (!path || !isGalleryPath(path)) { urls.push(null); continue; }
      const bytes = await readSmall(d, `${dir}/${path}`, MAX_BYTES);
      // 이름이 아니라 앞머리 바이트로 형식을 확인한다(다른 것을 그림이라며 내보내지 않게)
      const type = bytes ? sniffImageType(bytes) : null;
      urls.push(bytes && type ? `data:${type};base64,${Buffer.from(bytes).toString('base64')}` : null);
      if (bytes && type) files.push(bytes);
    }
    const [image, thumb] = urls;
    if (!image) continue;
    out.push({ id, key: await artKey(...files), title: e.title, desc: e.desc, image, ...(thumb ? { thumb } : {}) });
  }
  return out;
}
