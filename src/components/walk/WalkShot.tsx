'use client';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { SHOT_MISS, SHOT_TEXT, pick } from './hud-text';
import type { ShotNote } from './useShot';

type Props = { note: ShotNote; onGallery: () => void; onSave: () => void; onClose: () => void };

// 사진을 찍은 뒤 뜨는 알림. 갤러리에 담았거나 가득 찼으면 갤러리로 가는 단추를 붙인다.
// 앱 안 브라우저처럼 내려받기가 안 되는 곳에서는 찍은 사진을 띄워 길게 눌러 저장하게 한다(hold).
// 알림 글은 hud-text.ts의 한국어·영어(내려받기와 길게 누르기는 저장됐는지 화면이 알 수 없어 한 일만 말한다).
export function ShotToast({ note, onGallery, onSave, onClose }: Props) {
  const lang = useLang();
  const tr = useTr();
  const link = note.kind === 'saved' || note.kind === 'full';
  const stay = note.kind === 'tap' || note.kind === 'hold';
  const text = pick(SHOT_TEXT[note.kind], lang);
  return (
    <div className="walk-shot-toast" role="status" data-kind={note.kind}>
      <span>{note.miss && note.kind !== 'error' ? `${pick(SHOT_MISS, lang)}. ${text}` : text}</span>
      {note.kind === 'hold' && note.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 방금 찍은 사진(data: 주소)을 그대로 띄운다
        <img className="walk-shot-img" src={note.url} alt={tr('방금 찍은 사진', 'The photo you just took')} />
      ) : null}
      {link ? (
        <button type="button" className="btn btn-small" onClick={onGallery}>
          <T ko="내 갤러리" en="My gallery" />
        </button>
      ) : null}
      {stay ? (
        <span className="walk-shot-row">
          {note.kind === 'tap' ? (
            <button type="button" className="btn btn-small btn-roof" onClick={onSave}><T ko="사진 저장" en="Save photo" /></button>
          ) : null}
          <button type="button" className="btn btn-small" onClick={onClose}><T ko="닫기" en="Close" /></button>
        </span>
      ) : null}
    </div>
  );
}

/** 찰칵: 화면이 한 번 하얗게 번쩍인다(key가 바뀔 때마다 다시). 줄인 움직임이면 부르지 않는다 */
export function ShotFlash({ n }: { n: number }) {
  return n > 0 ? <div key={n} className="walk-shot-flash" aria-hidden="true" /> : null;
}
