'use client';
import { useCallback, useEffect, useState } from 'react';
import { shotFileName } from '@/components/walk/controls';
import { SHOTS_MAX, deleteShot, downloadUrl, listShots, viewUrls, type Shot } from '@/lib/shots';
import { ShotViewer } from './ShotViewer';

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
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

// 내 사진 격자(최신 순). 누르면 크게, 여러 장 골라 한꺼번에 내려받기.
export function GalleryClient() {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [big, setBig] = useState<Shot | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const list = await listShots().catch(() => null);
    if (!list) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setShots(list);
    setUrls(await viewUrls(list.map((s) => s.path)).catch(() => new Map<string, string>()));
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const remove = async (s: Shot) => {
    if (!window.confirm('이 사진을 지울까요? 지우면 되돌릴 수 없어요.')) return;
    if (!(await deleteShot(s).catch(() => false))) {
      setMsg('지우지 못했어요. 잠시 뒤에 다시 해 주세요.');
      return;
    }
    const rest = (shots ?? []).filter((x) => x.id !== s.id);
    const at = (shots ?? []).findIndex((x) => x.id === s.id);
    setBig((b) => (b && b.id === s.id ? rest[Math.min(at, rest.length - 1)] ?? null : b));
    setPicked((p) => { const n = new Set(p); n.delete(s.id); return n; });
    setShots((list) => (list ? list.filter((x) => x.id !== s.id) : list));
    setMsg('사진을 지웠어요.');
  };

  const downloadPicked = async () => {
    const list = (shots ?? []).filter((s) => picked.has(s.id));
    let ok = 0;
    for (const [i, s] of list.entries()) {
      if (await download(s, list.length > 1 ? i + 1 : undefined).catch(() => false)) ok += 1;
      // 브라우저가 한꺼번에 막지 않게 조금씩 띄운다
      await new Promise((r) => setTimeout(r, 450));
    }
    setMsg(ok === list.length ? `${ok}장을 내려받았어요.` : `${list.length}장 가운데 ${ok}장을 내려받았어요.`);
  };

  if (failed) {
    return (
      <p className="note-box">
        사진을 불러오지 못했어요. <button type="button" className="btn btn-small" onClick={() => void load()}>다시 시도</button>
      </p>
    );
  }
  if (!shots) return <p className="muted">사진을 펼치는 중이에요</p>;
  const full = shots.length >= SHOTS_MAX;
  return (
    <div className="stack">
      <div className="gallery-bar">
        <span className="small muted">{shots.length} / {SHOTS_MAX}장</span>
        <button type="button" className="btn btn-small" disabled={picked.size === 0} onClick={() => void downloadPicked()}>
          고른 {picked.size}장 내려받기
        </button>
        {picked.size > 0 ? <button type="button" className="btn btn-small" onClick={() => setPicked(new Set())}>고르기 풀기</button> : null}
        <p className="small" role="status">{msg}</p>
      </div>
      {full ? <p className="note-box">갤러리가 가득 찼어요. 오래된 사진부터 지우면 다시 찍을 수 있어요.</p> : null}
      {shots.length === 0 ? (
        <p className="muted">아직 찍은 사진이 없어요. 집 안을 걷다가 F2(휴대폰은 위 줄의 사진기)로 찍어 보세요.</p>
      ) : (
        <ul className="gallery-grid">
          {shots.map((s) => (
            <li key={s.id} className="gallery-item" data-picked={picked.has(s.id) ? 'true' : undefined}>
              <button type="button" className="gallery-thumb" onClick={() => setBig(s)} aria-label={`크게 보기: ${s.place || '집 안'} ${when(s.created_at)}`}>
                {urls.get(s.path) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(30분)라 이미지 최적화를 거치지 않는다
                  <img src={urls.get(s.path)} alt="" loading="lazy" width={s.w} height={s.h} />
                ) : (
                  <span className="muted small">불러오는 중</span>
                )}
              </button>
              <label className="gallery-meta">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                <span>
                  <span className="gallery-place">{s.place || '집 안'}</span>
                  <span className="small muted">{when(s.created_at)}</span>
                </span>
              </label>
            </li>
          ))}
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
          title={`${big.place || '집 안'} · ${when(big.created_at)}`}
          onDownload={() => void download(big).then((ok) => setMsg(ok ? '내려받았어요.' : '내려받지 못했어요.'))}
          onDelete={() => void remove(big)}
          onClose={() => setBig(null)}
        />
        );
      })() : null}
    </div>
  );
}
