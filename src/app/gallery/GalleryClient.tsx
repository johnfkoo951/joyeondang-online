'use client';
import { useCallback, useEffect, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { shotFileName } from '@/components/walk/controls';
import { countEn, hangulLang, shotTime } from '@/lib/page-words';
import { placeName } from '@/lib/place-names';
import { SHOTS_MAX, deleteShot, deleteShots, downloadUrl, listShots, viewUrls, type Shot } from '@/lib/shots';
import {
  allPicked, keepPicked, pickAll, pickKey, pickWords, pickedInOrder, togglePick,
} from '@/lib/shots-pick';
import { ShotViewer } from './ShotViewer';

export const fileOf = (s: Shot, n?: number) => shotFileName(new Date(s.created_at), n);

/** 서명 주소로 내려받기(서버가 그 이름으로 내려보낸다) */
export async function download(s: Shot, n?: number): Promise<boolean> {
  const url = await downloadUrl(s.path, fileOf(s, n));
  if (!url) return false;
  const a = document.createElement('a');
  a.href = url;
  a.download = fileOf(s, n);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

// 내 사진 격자(최신 순). 누르면 크게 본다.
// 「여러 장 고르기」를 누르면 고르기에 들어간다: 사진을 눌러 고르고(모두 고르기도 된다), 고른 것을 한꺼번에 내려받거나 지운다.
// 지우기 전에 한 번 더 묻고, 덜 지웠으면 남은 사진을 고른 채로 두고 알린다. Esc나 「고르기 끝내기」로 나온다.
// 걷기 화면 위의 시트(src/app/walk/@sheet/(..)gallery)도 이 화면을 그대로 쓴다.
// 화면 말은 한·영: 묻는 말·결과 말은 지금 말로 고른다(shots-pick의 pickWords), 찍은 곳은 장소 이름 표로 옮긴다.
export function GalleryClient() {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState<Shot | null>(null);
  const [msg, setMsg] = useState('');
  const lang = useLang();
  const en = lang === 'en';
  const tr = (ko: string, enText: string) => (en ? enText : ko);
  const { pickedDeleteAsk, pickedDeleteResult } = pickWords(lang);
  const when = (iso: string) => shotTime(lang, iso);
  const placeOf = (s: Shot) => (s.place ? placeName(lang, s.place) : tr('집 안', 'In the house'));

  const load = useCallback(async () => {
    const list = await listShots().catch(() => null);
    if (!list) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setShots(list);
    setPicked((p) => keepPicked(p, list));
    setUrls(await viewUrls(list.map((s) => s.path)).catch(() => new Map<string, string>()));
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setPicked(new Set());
  }, []);

  // Esc: 고르는 중이면 고르기만 끝낸다(걷기 시트가 함께 닫히지 않게 먼저 잡는다). 크게 보기 같은 창이 떠 있으면 그쪽 몫.
  // 한글 조합 중이면 무시한다. 무엇을 할지는 shots-pick의 pickKey가 정한다
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      const act = pickKey(e, { busy, dialogOpen: () => Boolean(document.querySelector('dialog[open]')) });
      if (act === 'pass') return;
      e.preventDefault();
      if (act === 'stop') stopSelecting();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selecting, busy, stopSelecting]);

  const toggle = (id: string) => setPicked((p) => togglePick(p, id));

  const remove = async (s: Shot) => {
    if (!window.confirm(tr('이 사진을 지울까요? 지우면 되돌릴 수 없어요.', 'Delete this photo? You can’t undo it.'))) return;
    if (!(await deleteShot(s).catch(() => false))) {
      setMsg(tr('지우지 못했어요. 잠시 뒤에 다시 해 주세요.', 'We couldn’t delete it. Please try again in a moment.'));
      return;
    }
    const rest = (shots ?? []).filter((x) => x.id !== s.id);
    const at = (shots ?? []).findIndex((x) => x.id === s.id);
    setBig((b) => (b && b.id === s.id ? rest[Math.min(at, rest.length - 1)] ?? null : b));
    setPicked((p) => keepPicked(p, rest));
    setShots((list) => (list ? list.filter((x) => x.id !== s.id) : list));
    setMsg(tr('사진을 지웠어요.', 'Photo deleted.'));
  };

  const downloadPicked = async () => {
    const list = pickedInOrder(shots ?? [], picked);
    if (list.length === 0 || busy) return;
    setBusy(true);
    let ok = 0;
    for (const [i, s] of list.entries()) {
      if (await download(s, list.length > 1 ? i + 1 : undefined).catch(() => false)) ok += 1;
      // 브라우저가 한꺼번에 막지 않게 조금씩 띄운다
      await new Promise((r) => setTimeout(r, 450));
    }
    setBusy(false);
    setMsg(
      ok === list.length
        ? tr(`${ok}장을 내려받았어요.`, `Downloaded ${countEn(ok, 'photo')}.`)
        : tr(`${list.length}장 가운데 ${ok}장을 내려받았어요.`, `Downloaded ${ok} of ${countEn(list.length, 'photo')}.`),
    );
  };

  // 고른 것 지우기: 묶음마다 파일 먼저, 그다음 표(deleteShots). 지운 것만 목록에서 빼고, 남은 것은 고른 채로 둔다
  const deletePicked = async () => {
    const list = pickedInOrder(shots ?? [], picked);
    if (list.length === 0 || busy) return;
    if (!window.confirm(pickedDeleteAsk(list.length))) return;
    setBusy(true);
    setMsg(tr('지우는 중이에요.', 'Deleting…'));
    const done = new Set(await deleteShots(list).catch(() => [] as string[]));
    setShots((cur) => (cur ? cur.filter((s) => !done.has(s.id)) : cur));
    setPicked((p) => new Set([...p].filter((id) => !done.has(id))));
    setBusy(false);
    setMsg(pickedDeleteResult(list.length, done.size));
    if (done.size >= list.length) setSelecting(false);
  };

  if (failed) {
    return (
      <p className="note-box">
        <T ko="사진을 불러오지 못했어요." en="We couldn’t load your photos." />{' '}
        <button type="button" className="btn btn-small" onClick={() => void load()}><T ko="다시 시도" en="Try again" /></button>
      </p>
    );
  }
  if (!shots) return <p className="muted"><T ko="사진을 펼치는 중이에요" en="Opening your photos" /></p>;
  const full = shots.length >= SHOTS_MAX;
  const chosen = pickedInOrder(shots, picked).length;
  const every = allPicked(picked, shots);
  return (
    <div className="stack">
      <div className="gallery-bar">
        <span className="small muted"><T ko={`${shots.length} / ${SHOTS_MAX}장`} en={`${shots.length} / ${SHOTS_MAX} photos`} /></span>
        {selecting ? (
          <>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => setPicked(every ? new Set() : pickAll(shots))}>
              {every ? <T ko="모두 풀기" en="Unpick all" /> : <T ko="모두 고르기" en="Pick all" />}
            </button>
            <button type="button" className="btn btn-small" disabled={busy || chosen === 0} onClick={() => void downloadPicked()}>
              <T ko={`고른 ${chosen}장 내려받기`} en={`Download ${chosen} picked`} />
            </button>
            <button type="button" className="btn btn-small" disabled={busy || chosen === 0} onClick={() => void deletePicked()}>
              <T ko={`고른 ${chosen}장 지우기`} en={`Delete ${chosen} picked`} />
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={stopSelecting} aria-keyshortcuts="Escape">
              <T ko="고르기 끝내기" en="Done picking" />
            </button>
          </>
        ) : shots.length > 0 ? (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setSelecting(true);
              setMsg('');
            }}
          >
            <T ko="여러 장 고르기" en="Pick several" />
          </button>
        ) : null}
        <p className="small" role="status">{msg}</p>
      </div>
      {full ? (
        <p className="note-box">
          <T
            ko="갤러리가 가득 찼어요. 오래된 사진부터 지우면 다시 찍을 수 있어요(「여러 장 고르기」로 한꺼번에 지울 수도 있어요)."
            en="Your gallery is full. Delete older photos to take more (with “Pick several” you can delete many at once)."
          />
        </p>
      ) : null}
      {shots.length === 0 ? (
        <p className="muted">
          <T
            ko="아직 찍은 사진이 없어요. 집 안을 걷다가 F2(휴대폰은 위 줄의 사진기)로 찍어 보세요."
            en="No photos yet. Take one with F2 while you walk the house (on a phone, the camera in the top row)."
          />
        </p>
      ) : (
        <ul className="gallery-grid" data-selecting={selecting ? 'true' : undefined}>
          {shots.map((s) => {
            const on = selecting && picked.has(s.id);
            const place = placeOf(s);
            const label = `${place} ${when(s.created_at)}`;
            return (
              <li key={s.id} className="gallery-item" data-picked={on ? 'true' : undefined}>
                <button
                  type="button"
                  className="gallery-thumb"
                  onClick={() => (selecting ? toggle(s.id) : setBig(s))}
                  aria-pressed={selecting ? on : undefined}
                  aria-label={selecting ? tr(`고르기: ${label}`, `Pick: ${label}`) : tr(`크게 보기: ${label}`, `View larger: ${label}`)}
                  disabled={selecting && busy}
                >
                  {urls.get(s.path) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(30분)라 이미지 최적화를 거치지 않는다
                    <img src={urls.get(s.path)} alt="" loading="lazy" width={s.w} height={s.h} />
                  ) : (
                    <span className="muted small"><T ko="불러오는 중" en="Loading" /></span>
                  )}
                  {selecting ? <span className="gallery-check" aria-hidden="true">{on ? '✓' : ''}</span> : null}
                </button>
                <p className="gallery-meta">
                  <span className="gallery-place" lang={hangulLang(place)}>{place}</span>
                  <span className="small muted">{when(s.created_at)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {big ? (() => {
        const i = shots.findIndex((s) => s.id === big.id);
        const prev = i > 0 ? shots[i - 1] : null;
        const next = i >= 0 && i < shots.length - 1 ? shots[i + 1] : null;
        return (
        <ShotViewer
          position={i >= 0 ? `${i + 1} / ${shots.length}` : undefined}
          onPrev={prev ? () => setBig(prev) : null}
          onNext={next ? () => setBig(next) : null}
          shot={big}
          url={urls.get(big.path) ?? null}
          title={`${placeOf(big)} · ${when(big.created_at)}`}
          onDownload={() => void download(big).then((ok) => setMsg(ok ? tr('내려받았어요.', 'Downloaded.') : tr('내려받지 못했어요.', 'We couldn’t download it.')))}
          onDelete={() => void remove(big)}
          onClose={() => setBig(null)}
        />
        );
      })() : null}
    </div>
  );
}
