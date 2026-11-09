'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { MAX_PHOTO_BYTES, RESIZE_LONG_EDGE, RESIZE_QUALITY } from '@/lib/avatar/rules';
import styles from './avatar.module.css';

// 사진 고르기 → 브라우저에서 줄이기(긴 변 1024, JPEG) → 보내기(줄 서기, 202) → 3초마다 상태 묻기 → 그림.
// 글자 입력칸이 없어서 Enter 제출이 없다. 단추와 체크 상자만 쓰므로 키보드로 모두 닿는다.

type Phase = 'pick' | 'working' | 'done';

const STAGES: { from: number; text: string }[] = [
  { from: 0, text: '사진을 살펴보는 중이에요' },
  { from: 6, text: '옷 색깔과 머리 모양을 고르는 중이에요' },
  { from: 18, text: '캐릭터를 그리는 중이에요' },
  { from: 45, text: '거의 다 됐어요. 조금만 기다려 주세요' },
];

export function AvatarStudio({ left, blocked }: { left: number; blocked: string | null }) {
  const router = useRouter();
  const [selfOk, setSelfOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const consented = selfOk && termsOk;

  // 고른 사진 미리보기 주소는 바뀌거나 떠날 때 돌려준다
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  // 그리는 동안 초 세기(떠나도 일꾼이 계속 그리므로 막지 않는다)
  useEffect(() => {
    if (phase !== 'working') return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'done') resultRef.current?.focus();
  }, [phase]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const blob = await shrinkPhoto(file);
      if (blob.size > MAX_PHOTO_BYTES) throw new Error('too big');
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setPhoto(null);
      setError('이 사진은 열 수 없어요. 다른 사진으로 해 주세요.');
    } finally {
      setPreparing(false);
    }
  }

  async function make() {
    if (!photo || !consented || phase === 'working') return;
    setError(null);
    setElapsed(0);
    setPhase('working');
    const body = new FormData();
    body.append('photo', photo.blob, 'photo.jpg');
    body.append('consent_self', 'on');
    body.append('consent_terms', 'on');
    try {
      const res = await fetch('/api/avatar', { method: 'POST', body, signal: AbortSignal.timeout(60_000) });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; message?: string } | null;
      if (res.status === 202 && json?.id) {
        setPhoto(null);
        const done = await waitForDrawing(json.id, setNote);
        router.refresh();
        if (done.status === 'ready') {
          setResultId(json.id);
          setPhase('done');
          return;
        }
        setError(done.message ?? '그림을 만들지 못했어요. 잠시 뒤 다시 해 주세요.');
      } else {
        setError(json?.message ?? '그림을 만들지 못했어요. 잠시 뒤 다시 해 주세요.');
      }
    } catch {
      setError('연결이 끊겼어요. 잠시 뒤 아래 목록을 확인하고, 없으면 다시 해 주세요.');
      router.refresh();
    }
    setNote(null);
    setPhase('pick');
  }

  function again() {
    setResultId(null);
    setError(null);
    setPhase('pick');
  }

  if (phase === 'done' && resultId) {
    return (
      <section className="card stack" aria-labelledby="made">
        <h2 id="made" ref={resultRef} tabIndex={-1} style={{ marginTop: 0 }}>
          내 캐릭터가 나왔어요
        </h2>
        <div className={styles.paper}>
          {/* 비공개 그림이라 이미지 최적화 서버를 거치지 않고 세션으로 바로 받는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.result} src={`/api/avatar/${resultId}`} alt="새로 만든 내 캐릭터 그림" />
        </div>
        <p className="small muted">아래 「내 캐릭터」에서 걷기에 쓸 캐릭터를 고르거나 지울 수 있어요.</p>
        <div className="btn-row">
          <Link className="btn btn-roof" href="/walk">이 캐릭터로 집 안 걷기</Link>
          {left > 0 && !blocked ? (
            <button type="button" className="btn" onClick={again}>
              하나 더 만들기
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (blocked && phase !== 'working') {
    return (
      <p className="card" role="status">
        {blocked}
      </p>
    );
  }

  const working = phase === 'working';
  const stage = note ?? [...STAGES].reverse().find((s) => elapsed >= s.from)?.text ?? STAGES[0].text;
  const percent = Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / 45))));

  return (
    <section className="card stack" aria-labelledby="make" aria-busy={working}>
      <h2 id="make" style={{ marginTop: 0 }}>사진으로 캐릭터 만들기</h2>

      <div className={styles.consent}>
        <p className={styles.consentText}>
          사진은 캐릭터 그림을 만드는 데에만 써요. 그림을 만드는 동안 외부 AI 서비스(OpenAI)로 보내져요. 원본 사진은
          내가 지울 때까지 보관되고, 이 화면에서 언제든 지울 수 있어요. 만든 그림은 조연당 온라인 안에서만 보여요.
        </p>
        <label className="choice">
          <input type="checkbox" checked={selfOk} disabled={working} onChange={(e) => setSelfOk(e.target.checked)} />
          <span>사진 속 사람은 나 자신이고, 만 14세 이상이에요.</span>
        </label>
        <label className="choice">
          <input type="checkbox" checked={termsOk} disabled={working} onChange={(e) => setTermsOk(e.target.checked)} />
          <span>위 내용에 동의해요.</span>
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          아이로 보이는 사진은 그림을 만들지 않아요. 하루 3장까지 만들 수 있어요.
        </p>
      </div>

      <div className={styles.pickRow}>
        <label className={`btn ${styles.pick}`} data-disabled={!consented || working || undefined}>
          <input
            className={styles.fileInput}
            type="file"
            accept="image/*"
            disabled={!consented || working}
            onChange={onFile}
          />
          {photo ? '다른 사진 고르기' : '사진 고르기'}
        </label>
        <label className={`btn ${styles.pick} ${styles.cameraOnly}`} data-disabled={!consented || working || undefined}>
          <input
            className={styles.fileInput}
            type="file"
            accept="image/*"
            capture="user"
            disabled={!consented || working}
            onChange={onFile}
          />
          지금 찍기
        </label>
      </div>
      {!consented ? <p className="small muted" style={{ margin: 0 }}>위 두 칸에 동의하면 사진을 고를 수 있어요.</p> : null}
      {preparing ? <p className="small muted" role="status">사진을 준비하는 중이에요</p> : null}

      {photo ? (
        <div className={styles.previewRow}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.preview} src={photo.url} alt="고른 사진 미리보기" />
          <p className="small muted" style={{ margin: 0 }}>
            얼굴과 옷이 잘 보이는, 나 혼자 나온 사진이면 좋아요. 옷 색깔과 머리 모양, 안경 같은 것만 그림에 옮겨요.
          </p>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          전신이 아니어도 괜찮아요. 밝은 곳에서 찍은 사진이 잘 나와요.
        </p>
      )}

      {working ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <div className={styles.bar} aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
          <p style={{ margin: 0 }}>
            {stage} <span className="muted small">{elapsed}초</span>
          </p>
          <p className="small muted" style={{ margin: 0 }}>보통 1~2분쯤 걸려요. 화면을 닫아도 다 그리면 「내 캐릭터」에 생겨요.</p>
        </div>
      ) : null}

      {error ? <p className="warn" role="alert">{error}</p> : null}

      <div className="btn-row">
        <button type="button" className="btn btn-roof" disabled={!photo || !consented || working} onClick={make}>
          {working ? '그리는 중' : '캐릭터 그리기'}
        </button>
      </div>
    </section>
  );
}

/** 긴 변을 1024px로 줄인 JPEG. 사진 속 위치·기기 정보는 이때 모두 사라진다 */
async function shrinkPhoto(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const img = await loadImage(file);
    source = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
  }
  if (!width || !height) throw new Error('empty image');
  const scale = Math.min(1, RESIZE_LONG_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', RESIZE_QUALITY);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

type JobReply = { status?: string; url?: string; message?: string };

/** 일꾼이 다 그릴 때까지 3초마다 묻는다(최대 30분). 기다리는 안내는 서버가 준 말을 그대로 보여 준다 */
async function waitForDrawing(id: string, onNote: (text: string | null) => void): Promise<JobReply> {
  const until = Date.now() + 30 * 60 * 1000;
  let misses = 0;
  while (Date.now() < until) {
    await new Promise((r) => window.setTimeout(r, 3000));
    try {
      const res = await fetch(`/api/avatar/status?id=${id}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const json = (await res.json().catch(() => null)) as JobReply | null;
      if (!res.ok || !json?.status) {
        if (++misses >= 5) return { status: 'failed', message: '상태를 확인하지 못했어요. 잠시 뒤 아래 목록을 확인해 주세요.' };
        continue;
      }
      misses = 0;
      if (json.status === 'ready' || json.status === 'rejected' || json.status === 'failed') return json;
      onNote(json.message ?? null);
    } catch {
      if (++misses >= 5) return { status: 'failed', message: '연결이 끊겼어요. 잠시 뒤 아래 목록을 확인해 주세요.' };
    }
  }
  return { status: 'failed', message: '아직 그리는 중이에요. 다 그리면 아래 「내 캐릭터」에 생겨요.' };
}
