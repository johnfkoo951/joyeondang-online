'use client';
import type { ShotNote } from './useShot';

const TEXT: Record<ShotNote['kind'], string> = {
  saving: '내 갤러리에 담는 중이에요',
  saved: '내 갤러리에 담았어요',
  downloaded: '사진을 이 기기에 내려받았어요',
  full: '갤러리가 가득 찼어요(60장). 오래된 사진부터 지우고 다시 찍어 주세요',
  failed: '지금은 사진을 찍지 못했어요. 잠시 뒤에 다시 해 주세요',
  error: '갤러리에 올리지 못해 이 기기에 내려받았어요',
};

// 사진을 찍은 뒤 잠깐 뜨는 알림. 갤러리에 담았거나 가득 찼으면 갤러리로 가는 단추를 붙인다.
export function ShotToast({ note, onGallery }: { note: ShotNote; onGallery: () => void }) {
  const link = note.kind === 'saved' || note.kind === 'full';
  return (
    <div className="walk-shot-toast" role="status" data-kind={note.kind}>
      <span>{TEXT[note.kind]}</span>
      {link ? (
        <button type="button" className="btn btn-small" onClick={onGallery}>
          내 갤러리
        </button>
      ) : null}
    </div>
  );
}

/** 찰칵: 화면이 한 번 하얗게 번쩍인다(key가 바뀔 때마다 다시). 줄인 움직임이면 부르지 않는다 */
export function ShotFlash({ n }: { n: number }) {
  return n > 0 ? <div key={n} className="walk-shot-flash" aria-hidden="true" /> : null;
}
