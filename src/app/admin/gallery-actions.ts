'use server';
import { refresh } from 'next/cache';
import { galleryStoreReady, readManifest, removeGalleryFiles, storeGalleryPhoto, writeManifest, type ManifestRead } from '@/lib/gallery';
import { GALLERY_TEXT, cleanText, editManifest, isFrameId, type ManifestEntry } from '@/lib/gallery-manifest';
import { galleryFrames } from '@/lib/house-staged';
import { prepareNotePhoto } from '@/lib/notes-media';
import { getViewer } from '@/lib/viewer';

// 부엌 사진 갤러리 채우기(승인함). 집주인만. 사진은 기기가 다시 그린 JPEG 두 장(보기 1280, 작은 그림 320)만 받고
// 쪽지 사진과 같은 확인(위치·기기 정보 지우기, 크기)을 거친다. 목록은 읽고 → 한 줄 고치고 → 통째로 쓴다.
// 읽지 못했거나 파일이 깨졌으면 쓰지 않는다(새 줄 하나만 든 목록으로 덮어써 손으로 넣은 전시가 사라지지 않게).
// 다시 쓸 때 이해하지 못한 줄과 칸은 그대로 둔다(editManifest).

export type GalleryFormState = { ok: boolean; message: string } | null;

async function adminOnly(): Promise<boolean> {
  const viewer = await getViewer();
  return viewer.role === 'admin';
}

/** 지금 걸린(갤러리를 끈 동안에는 켜면 걸릴) 액자 id인가 */
const hungFrame = (id: string) => isFrameId(id) && galleryFrames(process.env, { evenIfOff: true }).some((f) => f.id === id);
const filesOf = (e: Pick<ManifestEntry, 'image' | 'thumb'>) => (e.thumb ? [e.image, e.thumb] : [e.image]);

/** 목록을 못 읽었을 때 알릴 말 */
function unreadable(read: Extract<ManifestRead, { ok: false }>): string {
  return read.why === 'broken'
    ? '전시 목록 파일(manifest.json)이 깨져 있어 저장하지 않았어요. 파일을 고치거나 지운 뒤 다시 해 주세요.'
    : '전시 목록을 읽지 못했어요. 잠시 뒤 다시 해 주세요.';
}

export async function saveGalleryItem(_prev: GalleryFormState, formData: FormData): Promise<GalleryFormState> {
  if (!(await adminOnly())) return { ok: false, message: '집주인만 걸 수 있어요.' };
  if (!galleryStoreReady()) return { ok: false, message: '저장소 비밀 키가 없어 지금은 걸 수 없어요.' };
  const id = String(formData.get('frame') ?? '');
  if (!hungFrame(id)) return { ok: false, message: '액자를 다시 골라 주세요.' };
  const title = cleanText(formData.get('title'), GALLERY_TEXT.title);
  const desc = cleanText(formData.get('desc'), GALLERY_TEXT.desc);
  const view = formData.get('photo_view');
  const thumb = formData.get('photo_thumb');
  const withPhoto = view instanceof Blob && thumb instanceof Blob && view.size > 0;
  const read = await readManifest();
  if (!read.ok) return { ok: false, message: unreadable(read) };
  const old = read.doc.entries.get(id);
  if (!withPhoto && !old) return { ok: false, message: '처음 거는 액자에는 사진을 골라 주세요.' };
  let files = old ? { image: old.image, thumb: old.thumb } : null;
  if (withPhoto) {
    const prepared = await prepareNotePhoto(view, thumb);
    if (!prepared.ok) return { ok: false, message: prepared.message };
    const stored = await storeGalleryPhoto(prepared.photo.view, prepared.photo.thumb);
    if (!stored) return { ok: false, message: '사진을 올리지 못했어요. 잠시 뒤 다시 해 주세요.' };
    files = stored;
  }
  if (!files) return { ok: false, message: '처음 거는 액자에는 사진을 골라 주세요.' };
  const entry: ManifestEntry = { image: files.image, ...(files.thumb ? { thumb: files.thumb } : {}), title: title || GALLERY_TEXT.untitled, desc };
  if (!(await writeManifest(editManifest(read.doc, id, entry)))) {
    if (withPhoto) await removeGalleryFiles(filesOf(files));
    return { ok: false, message: '전시 목록을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.' };
  }
  // 사진을 바꿨으면 예전 사진을 지운다(승인함이 올린 것만)
  if (withPhoto && old) await removeGalleryFiles(filesOf(old));
  refresh();
  return { ok: true, message: `${id} 액자에 걸었어요. 걷기 화면을 새로 열면 보여요.` };
}

/** 한 액자를 비운다(목록에서 빼고, 승인함이 올린 사진이면 지운다). 그 액자는 다시 「곧 전시해요」 */
export async function clearGalleryItem(formData: FormData): Promise<void> {
  if (!(await adminOnly()) || !galleryStoreReady()) return;
  const id = String(formData.get('frame') ?? '');
  if (!isFrameId(id)) return;
  const read = await readManifest();
  if (!read.ok) return;
  const old = read.doc.entries.get(id);
  if (!old) return;
  if (await writeManifest(editManifest(read.doc, id, null))) await removeGalleryFiles(filesOf(old));
  refresh();
}
