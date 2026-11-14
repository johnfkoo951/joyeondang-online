'use client';
import { useActionState, useState } from 'react';
import { saveGalleryItem, type GalleryFormState } from '@/app/admin/gallery-actions';
import { PhotoPicker, type PickedPhoto } from '@/components/PhotoPicker';
import { GALLERY_TEXT } from '@/lib/gallery-manifest';

/** 고를 수 있는 액자 한 칸(지금 걸린 것이면 제목·설명을 미리 채운다) */
export type GallerySlot = { id: string; label: string; shape: string; title?: string; desc?: string };

// 승인함의 작은 입력 칸: 액자 번호를 고르고 사진·제목·설명을 넣어 건다. 이미 걸린 액자면 사진 없이 글만 고칠 수 있다.
// 사진은 이 기기에서 다시 그린 두 장(위치·기기 정보 없음)만 보낸다(PhotoPicker).
export function GalleryForm({ slots }: { slots: GallerySlot[] }) {
  const [state, action, pending] = useActionState<GalleryFormState, FormData>(saveGalleryItem, null);
  const firstEmpty = slots.find((s) => !s.title) ?? slots[0];
  const [frame, setFrame] = useState(firstEmpty?.id ?? '');
  const slot = slots.find((s) => s.id === frame);
  const [title, setTitle] = useState(slot?.title ?? '');
  const [desc, setDesc] = useState(slot?.desc ?? '');
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const choose = (id: string) => {
    const s = slots.find((x) => x.id === id);
    setFrame(id);
    setTitle(s?.title ?? '');
    setDesc(s?.desc ?? '');
  };
  const send = (fd: FormData) => {
    if (picked) {
      fd.set('photo_view', picked.view, 'view.jpg');
      fd.set('photo_thumb', picked.thumb, 'thumb.jpg');
    }
    action(fd);
  };
  const ready = Boolean(slot) && (Boolean(picked) || Boolean(slot?.title));
  return (
    <form
      action={send}
      className="stack"
      // 한글을 조합하는 중의 Enter는 글자 확정이다: 폼을 보내지 않는다(걸기는 단추로)
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
      }}
    >
      <div className="field">
        <label htmlFor="gallery-frame">액자</label>
        <select id="gallery-frame" name="frame" value={frame} onChange={(e) => choose(e.target.value)}>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>{s.label} · {s.shape}{s.title ? ` · ${s.title}` : ' · 비어 있음'}</option>
          ))}
        </select>
      </div>
      <PhotoPicker value={picked} onChange={setPicked} disabled={pending} />
      <div className="field">
        <label htmlFor="gallery-title">제목</label>
        <input id="gallery-title" name="title" type="text" value={title} maxLength={GALLERY_TEXT.title} onChange={(e) => setTitle(e.target.value)} placeholder="비워 두면 「무제」" />
      </div>
      <div className="field">
        <label htmlFor="gallery-desc">설명</label>
        <textarea id="gallery-desc" name="desc" value={desc} maxLength={GALLERY_TEXT.desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="크게 볼 때 그림 아래에 나와요(비워 두어도 돼요)" />
      </div>
      <div className="btn-row">
        <button className="btn btn-small btn-pine" disabled={pending || !ready}>{slot?.title ? (picked ? '사진 바꿔 걸기' : '글 고치기') : '걸기'}</button>
        {state ? <p className={`small ${state.ok ? '' : 'warn'}`} role="status" style={{ margin: 0 }}>{state.message}</p> : null}
      </div>
    </form>
  );
}
