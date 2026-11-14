import { clearGalleryItem } from '@/app/admin/gallery-actions';
import { GalleryForm, type GallerySlot } from '@/app/admin/GalleryForm';
import { galleryStoreReady, readManifest, signGallery } from '@/lib/gallery';
import { galleryFrames } from '@/lib/house-staged';
import { frameLabel, frameOrder, galleryOn } from '@/walk/gallery';
import type { GalleryFrame } from '@/walk/types';

const SHAPE: Record<GalleryFrame['size'], string> = { p: '세로', m: '가로', l: '큰 가로' };

// 승인함의 부엌 사진 갤러리 칸(집주인만 보는 화면, 부르는 쪽이 먼저 확인한다).
// 액자 번호는 걷기 화면의 빈 액자 판에 적힌 번호와 같다. 지금 걸린 것을 작은 그림과 함께 보이고, 하나씩 비울 수 있다.
// 갤러리를 끈 동안에도(KITCHEN_GALLERY가 1이 아니면) 켜면 걸릴 액자를 미리 채울 수 있다(손님 화면에는 아직 액자가 없다).
export async function GalleryPanel() {
  const on = galleryOn(process.env.KITCHEN_GALLERY);
  const frames = [...galleryFrames(process.env, { evenIfOff: true })].sort(frameOrder);
  const ready = galleryStoreReady();
  const read = ready && frames.length ? await readManifest() : null;
  const items = read?.ok ? read.doc.entries : null;
  const signed = items ? await signGallery(items, new Set(frames.map((f) => f.id))) : [];
  const thumbs = new Map(signed.map((s) => [s.id, s.thumb ?? s.image]));
  const hung = frames.filter((f) => items?.has(f.id));
  const slots: GallerySlot[] = frames.map((f) => {
    const e = items?.get(f.id);
    return { id: f.id, label: frameLabel(f), shape: SHAPE[f.size], ...(e ? { title: e.title, desc: e.desc } : {}) };
  });

  return (
    <section className="card stack" aria-labelledby="gallery">
      <h2 id="gallery" style={{ marginTop: 0 }}>
        부엌 사진 갤러리 {frames.length ? <span className="badge">액자 {frames.length} · 걸림 {hung.length}</span> : null}
      </h2>
      <p className="small muted">
        걷기 화면의 빈 액자 판에 적힌 번호(예: 1-a-2)를 골라 사진과 제목, 설명을 넣으면 그 액자에 걸려요. 사진은 이 기기에서 줄이고
        위치 정보를 지운 뒤 올라가요. 손님 화면은 다시 열 때 바뀌어요.
      </p>
      {!on && frames.length ? (
        <p className="note-box">
          갤러리가 꺼져 있어 손님 화면에는 아직 액자가 없어요. 여기서 미리 채워 두고, 다 되면 서버 환경 변수 KITCHEN_GALLERY=1로 켜요.
          켜면 부엌의 장식 그림과 화분 대신 액자가 걸리고, 채우지 않은 액자는 「곧 전시해요」로 보여요.
        </p>
      ) : null}
      {!frames.length ? (
        <p className="note-box">실제 집 데이터가 없어 액자를 걸 자리를 찾지 못했어요.</p>
      ) : !ready ? (
        <p className="note-box">저장소 비밀 키(SUPABASE_SECRET_KEY)가 없어 지금은 걸 수 없어요.{on ? ' 액자는 모두 「곧 전시해요」로 보여요.' : ''}</p>
      ) : read && !read.ok && read.why === 'broken' ? (
        <p className="note-box">
          전시 목록 파일(manifest.json)이 깨져 있어 읽지 못했어요. 저장소에서 파일을 고치거나 지운 뒤 다시 열어 주세요. 그동안 여기서는
          걸지 않고(깨진 목록을 덮어쓰지 않게), 손님 화면의 액자는 모두 「곧 전시해요」로 보여요.
        </p>
      ) : !items ? (
        <p className="note-box">전시 목록을 읽지 못했어요. DB에 갤러리 버킷(0023 마이그레이션)이 들어갔는지 확인한 뒤 다시 열어 주세요.</p>
      ) : (
        <>
          {read?.ok && read.doc.skipped ? (
            <p className="small warn">
              목록 파일에 읽지 못한 줄이 {read.doc.skipped}개 있어요(번호나 그림 경로가 틀렸거나 같은 번호가 겹친 줄). 손님에게는 나가지 않고,
              여기서 저장해도 지우지 않고 그대로 둬요.
            </p>
          ) : null}
          <GalleryForm slots={slots} />
          {hung.length ? (
            <ul className="admin-gallery">
              {hung.map((f) => {
                const e = items.get(f.id)!;
                const thumb = thumbs.get(f.id);
                return (
                  <li key={f.id} className="record admin-gallery-item">
                    {thumb ? (
                      // 저장소의 서명 주소(다른 사이트의 그림)라 next/image를 거치지 않는다
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" width={64} height={64} loading="lazy" />
                    ) : <span className="badge">그림 없음</span>}
                    <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                      <p style={{ margin: 0 }}><strong>{e.title}</strong> <span className="small muted">{frameLabel(f)}</span></p>
                      {e.desc ? <p className="small muted admin-gallery-desc" style={{ margin: 0 }}>{e.desc}</p> : null}
                    </div>
                    <form action={clearGalleryItem} className="inline-form">
                      <input type="hidden" name="frame" value={f.id} />
                      <button className="btn btn-small">내리기</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">아직 걸린 그림이 없어요.{on ? ' 모든 액자가 「곧 전시해요」로 보여요.' : ''}</p>
          )}
        </>
      )}
    </section>
  );
}
