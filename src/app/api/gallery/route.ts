import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { galleryItems } from '@/lib/gallery';
import { previewGalleryItems } from '@/lib/gallery-preview';
import { galleryFrames } from '@/lib/house-staged';
import { previewForRequest } from '@/lib/preview-request';
import { getViewer } from '@/lib/viewer';
import { galleryOn } from '@/walk/gallery';

// 부엌 사진 갤러리의 전시 목록(액자 id → 제목·설명·그림 서명 주소). 명단에 있는 손님(로그인)에게만 준다.
// 그 밖에는 있는지조차 알리지 않게 404(/api/house와 같은 틀). 역할을 확인하지 못했으면(인증 서버가 잠깐 답하지 않음) 503:
// 화면이 잠시 뒤 다시 묻는다(「전시 없음」으로 굳히지 않게). 갤러리를 켜지 않았으면(KITCHEN_GALLERY가 1이 아니면) 걸린 액자가 없어 404.
// 줄마다 그림 열쇠(key)를 함께 준다: 서명 주소는 받을 때마다 바뀌지만 그림이 같으면 열쇠는 같아, 화면이 이미 받은 그림을 다시 받지 않는다.
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };
const UNSURE = { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5', 'X-Robots-Tag': 'noindex' } };
const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function GET() {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳혀 두지 않게)
  await connection();
  const viewer = await getViewer();
  const preview = await previewForRequest();
  if (!canUse(viewer.role, 'gallery') && !preview) return new Response(null, viewer.unsure ? UNSURE : HIDDEN);
  if (!galleryOn(process.env.KITCHEN_GALLERY)) return new Response(null, HIDDEN);
  // 지금 걸린 액자 id만(목록에 남은 옛 id·틀린 id는 내보내지 않는다)
  const ids = new Set(galleryFrames().map((f) => f.id));
  if (!ids.size) return new Response(null, HIDDEN);
  // 이 컴퓨터 미리보기(GALLERY_PREVIEW_DIR)가 있으면 그것, 아니면 비공개 버킷의 목록에 서명 주소를 붙여서
  const items = (preview ? await previewGalleryItems(ids) : null) ?? (await galleryItems(ids));
  return Response.json({ items }, { headers: PRIVATE });
}
