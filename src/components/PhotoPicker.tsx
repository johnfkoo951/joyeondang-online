'use client';
import { useEffect, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import {
  PHOTO_PICK_MAX_BYTES, PHOTO_THUMB_EDGE, PHOTO_THUMB_MAX_BYTES, PHOTO_THUMB_QUALITY,
  PHOTO_VIEW_EDGE, PHOTO_VIEW_MAX_BYTES, PHOTO_VIEW_QUALITY, fitWithin,
} from '@/lib/photo';

// 쪽지에 붙일 사진 한 장(기획서 6.5 사진 정화). 고른 원본은 기기 밖으로 나가지 않는다:
// 파일 칸에 name이 없어 폼에 실리지 않고, 화면이 다시 그린 JPEG 두 장(보기 1280, 작은 그림 320)만 보낸다.
// 다시 그리면 사진 속 위치·기기·촬영 시각 정보는 따라오지 않는다. 서버가 한 번 더 확인한다.
// 화면 말: 보이는 글은 두 말을 함께 싣고(T), 속성(alt)은 지금 말로 고른다.

export type PickedPhoto = { view: Blob; thumb: Blob; preview: string; width: number; height: number };

type Source = { image: CanvasImageSource; width: number; height: number; close: () => void };

const MSG = {
  tooBig: { ko: '사진 파일이 너무 커요(30MB까지). 다른 사진을 골라 주세요.', en: 'That photo file is too big (30MB max). Please choose another photo.' },
  decode: {
    ko: '이 사진은 이 브라우저에서 열 수 없어요. 아이폰의 HEIC 사진이라면 JPEG로 저장해 다시 고르거나 다른 사진을 골라 주세요. 이 사진은 받지 않았어요.',
    en: "This browser can't open this photo. If it's an iPhone HEIC photo, save it as JPEG and choose it again, or pick another photo. This photo was not uploaded.",
  },
  encode: { ko: '사진을 다시 그리지 못했어요. 다른 사진을 골라 주세요.', en: "We couldn't redraw the photo. Please choose another photo." },
};

export function PhotoPicker({ value, onChange, disabled }: { value: PickedPhoto | null; onChange: (p: PickedPhoto | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof MSG | null>(null);
  const tr = useTr();

  // 미리 보기 주소는 바꾸거나 빼면 놓는다
  useEffect(() => {
    if (!value) return;
    return () => URL.revokeObjectURL(value.preview);
  }, [value]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 원본을 칸에 붙잡아 두지 않는다(같은 사진을 다시 고를 수도 있게)
    if (!file) return;
    setError(null);
    if (file.size > PHOTO_PICK_MAX_BYTES) {
      setError('tooBig');
      return;
    }
    setBusy(true);
    try {
      onChange(await redraw(file));
    } catch (err) {
      setError(err instanceof Error && err.message === 'decode' ? 'decode' : 'encode');
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="photo-pick">
      <legend>
        <T ko="사진 한 장" en="One photo" /> <span className="muted small"><T ko="(붙이지 않아도 돼요)" en="(optional)" /></span>
      </legend>
      {value ? (
        <div className="photo-pick-row">
          {/* eslint-disable-next-line @next/next/no-img-element -- 기기 안의 미리 보기(blob 주소) */}
          <img className="photo-thumb" src={value.preview} alt={tr('붙일 사진 미리 보기', 'Preview of the photo to attach')} width={fitWithin(value.width, value.height, 160).width} height={fitWithin(value.width, value.height, 160).height} />
          <button type="button" className="btn btn-small" onClick={() => onChange(null)} disabled={disabled}><T ko="사진 빼기" en="Remove photo" /></button>
        </div>
      ) : (
        <div className="photo-pick-row">
          <button type="button" className="btn btn-small" onClick={() => input.current?.click()} disabled={busy || disabled} aria-describedby="photo-rule">
            {busy ? <T ko="사진을 다시 그리는 중" en="Redrawing the photo" /> : <T ko="사진 고르기" en="Choose a photo" />}
          </button>
          <input ref={input} type="file" accept="image/*" onChange={pick} hidden />
        </div>
      )}
      {value ? (
        <div className="photo-marks">
          <label className="choice">
            <input type="checkbox" name="marks_person" />
            <span><T ko="사람이 나와요" en="Shows people" /></span>
          </label>
          <label className="choice">
            <input type="checkbox" name="marks_minor" />
            <span><T ko="아이가 나와요" en="Shows a child" /></span>
          </label>
        </div>
      ) : null}
      <p id="photo-rule" className="small muted" style={{ margin: 0 }}>
        <T
          ko={<>
            사진은 지금은 올린 분과 가족에게만 보여요. 보내기 전에 기기에서 다시 그려 위치·기기 정보를 지워요.
            가족이 쓰는 방 안쪽, 문패, 창밖 풍경이 나온 사진은 올리지 말아 주세요.
          </>}
          en={<>
            For now, photos are shown only to the person who posted them and the family. Before sending, your device redraws the photo to
            remove location and device info. Please don&apos;t post photos showing the inside of the family&apos;s rooms, the nameplate, or the
            view outside the windows.
          </>}
        />
      </p>
      {error ? <p className="warn small" role="alert" style={{ margin: 0 }}><T ko={MSG[error].ko} en={MSG[error].en} /></p> : null}
    </fieldset>
  );
}

async function redraw(file: File): Promise<PickedPhoto> {
  const src = await decode(file);
  try {
    if (!src.width || !src.height) throw new Error('decode');
    const view = await encode(src, PHOTO_VIEW_EDGE, [PHOTO_VIEW_QUALITY, 0.72, 0.62], PHOTO_VIEW_MAX_BYTES);
    const thumb = await encode(src, PHOTO_THUMB_EDGE, [PHOTO_THUMB_QUALITY, 0.6], PHOTO_THUMB_MAX_BYTES);
    return { view, thumb, preview: URL.createObjectURL(thumb), width: src.width, height: src.height };
  } finally {
    src.close();
  }
}

// 사진 방향(Exif)은 그리기 전에 반영한다. 못 열면(예: 오래된 브라우저의 HEIC) 'decode'로 알린다.
async function decode(file: File): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // 아래 <img>로 한 번 더
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('decode');
  }
}

async function encode(src: Source, edge: number, qualities: number[], maxBytes: number): Promise<Blob> {
  const size = fitWithin(src.width, src.height, edge);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('encode');
  ctx.fillStyle = '#ffffff'; // 투명한 그림은 흰 종이 위에
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.image, 0, 0, size.width, size.height);
  for (const q of qualities) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
    if (!blob || blob.type !== 'image/jpeg') throw new Error('encode');
    if (blob.size <= maxBytes) return blob;
  }
  throw new Error('encode');
}
