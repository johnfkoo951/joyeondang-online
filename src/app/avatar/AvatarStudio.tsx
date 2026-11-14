'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Say } from '@/components/avatar/Say';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { formatElapsed, pollDelay, startMaking } from '@/components/walk/making';
import { emitWalk, WALK_EVENT } from '@/components/walk/walk-events';
import {
  CONSENT_GUARDIAN, CONSENT_GUARDIAN_EN, CONSENT_TERMS, CONSENT_TERMS_EN, CONSENT_VIEWS_FIELD, GUARDIAN_FIELD, SUBJECT_FIELD, SUBJECT_LABEL,
  SUBJECT_LABEL_EN, SUBJECT_QUESTION, SUBJECT_QUESTION_EN, consentPoints, type ModelProvider, type PhotoSubject,
} from '@/lib/avatar/consent';
import { MAX_PHOTO_BYTES } from '@/lib/avatar/rules';
import { shrinkPhoto } from '@/lib/avatar/shrink';
import { manageAvatar } from './actions';
import styles from './avatar.module.css';

// 사진 고르기 → 브라우저에서 줄이기(긴 변 1024, JPEG) → 보내기(줄 서기, 202) → 3초마다 상태 묻기 → 그림.
// 글자 입력칸이 없어서 Enter 제출이 없다. 단추와 체크 상자만 쓰므로 키보드로 모두 닿는다.
// 화면 말: 글은 두 말을 함께 싣고(T, 서버가 그린 첫 화면에서도 깜박이지 않게), 안내·오류 글은 한국어로 두었다가 보일 때 옮긴다(Say).

type Phase = 'pick' | 'working' | 'done';

const STAGES: { from: number; text: string; en: string }[] = [
  { from: 0, text: '사진을 살펴보는 중이에요', en: 'Looking at your photo' },
  { from: 6, text: '옷 색깔과 머리 모양을 고르는 중이에요', en: 'Picking clothing colors and hairstyle' },
  { from: 18, text: '캐릭터를 그리는 중이에요', en: 'Drawing your character' },
  { from: 45, text: '거의 다 됐어요. 조금만 기다려 주세요', en: 'Almost done. Just a moment' },
];

/**
 * left: 오늘 더 만들 수 있는 장수(하루 장수에 제한이 없는 역할이면 null), blocked: 지금 새로 못 만드는 까닭,
 * provider: 3D 모형을 만드는 곳, optOut: 바깥 3D 서비스에 학습 제외를 요청해 두었는가(둘 다 동의 글에 쓴다. 서버가 환경 변수로 정해 넘긴다)
 */
export function AvatarStudio({ left, blocked, provider, optOut }: {
  left: number | null; blocked: string | null; provider: ModelProvider; optOut: boolean;
}) {
  const router = useRouter();
  const tr = useTr();
  const [subject, setSubject] = useState<PhotoSubject | null>(null);
  const [guardianOk, setGuardianOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  /** 걷기에 바로 쓰도록 바꿔 끼웠는가(못 바꿨으면 아래 칸에서 고르라고 안내한다) */
  const [worn, setWorn] = useState(false);
  /** 이 화면이 닫히면(걷기 위 시트를 닫으면) 그리는 중 묻기를 멈춘다. 그 뒤는 걷기 화면의 칩이 이어 본다 */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // 누구 사진인지 골랐고(아이면 보호자 동의까지), 안내에 동의했다
  const consented = subject !== null && termsOk && (subject === 'self' || guardianOk);

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
    if (subject) body.append(SUBJECT_FIELD, subject);
    if (subject === 'child') body.append(GUARDIAN_FIELD, 'on');
    body.append('consent_terms', 'on');
    // 이 화면이 보여 준 동의 글(consentMain)에 여러 방향 그림 안내가 들어 있다
    body.append(CONSENT_VIEWS_FIELD, '1');
    try {
      const res = await fetch('/api/avatar', { method: 'POST', body, signal: AbortSignal.timeout(60_000) });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; message?: string } | null;
      if (res.status === 202 && json?.id) {
        setPhoto(null);
        // 걷기 위에 연 시트라면 걷기 화면의 「그리는 중」 칩과 다 되면 바꿔 끼우기가 이어 받는다(시트를 닫아도)
        startMaking(json.id);
        // 새 칸에 「그리는 중」이 바로 보이게
        router.refresh();
        const done = await waitForDrawing(json.id, setNote, () => alive.current);
        if (done.status === 'gone') {
          // 화면이 닫혔거나(걷기 칩이 이어 본다) 그사이 거뒀다(고르기로 돌아간다)
          if (alive.current) {
            setNote(null);
            setPhase('pick');
            router.refresh();
          }
          return;
        }
        let wore = false;
        if (done.status === 'ready') {
          // 다 그린 캐릭터를 걷기에 바로 쓴다(걷기 화면에서 만들 때와 같다). 못 바꿔도 아래 칸에서 고를 수 있다
          const fd = new FormData();
          fd.set('op', 'choose');
          fd.set('id', json.id);
          const r = await manageAvatar(null, fd).catch(() => null);
          wore = Boolean(r?.ok);
          if (r?.ok && r.look) emitWalk(WALK_EVENT.lookChanged, { look: r.look });
        }
        if (!alive.current) return;
        router.refresh();
        if (done.status === 'ready') {
          setWorn(wore);
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
          <T ko="내 캐릭터가 나왔어요" en="Your character is ready" />
        </h2>
        <div className={styles.paper}>
          {/* 비공개 그림이라 이미지 최적화 서버를 거치지 않고 세션으로 바로 받는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.result} src={`/api/avatar/${resultId}`} alt={tr('새로 만든 내 캐릭터 그림', 'My new character picture')} />
        </div>
        <p className="small muted">
          {worn ? (
            <T
              ko="걷기에 바로 쓰도록 바꿔 입었어요. 아래 「작업대」와 「이력」에서 다른 캐릭터로 바꾸거나, ★로 보관하거나, 지울 수 있어요."
              en="You're now wearing it for walking. In “Workbench” and “History” below, you can switch to another character, add it to ★ favorites, or delete it."
            />
          ) : (
            <T ko="아래 「작업대」에서 이 캐릭터를 골라 걷기에 쓸 수 있어요." en="Choose this character in “Workbench” below to walk with it." />
          )}
        </p>
        <div className="btn-row">
          <Link className="btn btn-roof" href="/walk"><T ko="이 캐릭터로 집 안 걷기" en="Walk the house as this character" /></Link>
          {(left === null || left > 0) && !blocked ? (
            <button type="button" className="btn" onClick={again}>
              <T ko="하나 더 만들기" en="Make another" />
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (blocked && phase !== 'working') {
    return (
      <p className="card" role="status">
        <Say text={blocked} />
      </p>
    );
  }

  const working = phase === 'working';
  const step = [...STAGES].reverse().find((s) => elapsed >= s.from) ?? STAGES[0];
  // 서버가 준 기다림 안내(일꾼이 쉬는 중 등)가 있으면 그것, 없으면 걸린 시간의 단계
  const stage = note ? <Say text={note} /> : <T ko={step.text} en={step.en} />;
  const percent = Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / 45))));

  return (
    <section className="card stack" aria-labelledby="make" aria-busy={working}>
      <h2 id="make" style={{ marginTop: 0 }}><T ko="사진으로 캐릭터 만들기" en="Make a character from a photo" /></h2>

      <div className={styles.consent}>
        {/* 동의 글: 짧은 다섯 줄(집주인의 보관·관리도 한 줄로). 자세한 글은 개인정보 화면에. 영어는 같은 뜻을 옮긴 다섯 줄 */}
        <T
          ko={<ul className={styles.consentList}>{consentPoints(provider, optOut).map((p) => <li key={p.head}><b>{p.head}</b> {p.text}</li>)}</ul>}
          en={<ul className={styles.consentList}>{consentPoints(provider, optOut, 'en').map((p) => <li key={p.head}><b>{p.head}</b> {p.text}</li>)}</ul>}
        />
        <Link className={styles.consentMore} href="/privacy"><T ko="자세히 보기" en="Read more" /></Link>
        <fieldset className={styles.subject} disabled={working}>
          <legend><T ko={SUBJECT_QUESTION} en={SUBJECT_QUESTION_EN} /></legend>
          {(['self', 'child'] as const).map((s) => (
            <label key={s} className="choice">
              <input type="radio" name="photo-subject" value={s} checked={subject === s} onChange={() => setSubject(s)} />
              <span><T ko={SUBJECT_LABEL[s]} en={SUBJECT_LABEL_EN[s]} /></span>
            </label>
          ))}
          {subject === 'child' ? (
            <label className={`choice ${styles.guardian}`}>
              <input type="checkbox" checked={guardianOk} onChange={(e) => setGuardianOk(e.target.checked)} />
              <span><T ko={CONSENT_GUARDIAN} en={CONSENT_GUARDIAN_EN} /></span>
            </label>
          ) : null}
        </fieldset>
        <label className="choice">
          <input type="checkbox" checked={termsOk} disabled={working} onChange={(e) => setTermsOk(e.target.checked)} />
          <span><T ko={CONSENT_TERMS} en={CONSENT_TERMS_EN} /></span>
        </label>
        {/* 하루에 몇 장까지인지는 역할마다 달라 이 카드 위 줄(오늘 남은 장수)에서 알린다 */}
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
          {photo ? <T ko="다른 사진 고르기" en="Choose another photo" /> : <T ko="사진 고르기" en="Choose a photo" />}
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
          <T ko="지금 찍기" en="Take a photo" />
        </label>
      </div>
      {!consented ? (
        <p className="small muted" style={{ margin: 0 }}>
          <T ko="위 두 칸에 동의하면 사진을 고를 수 있어요." en="Once you agree to the two boxes above, you can choose a photo." />
        </p>
      ) : null}
      {preparing ? <p className="small muted" role="status"><T ko="사진을 준비하는 중이에요" en="Preparing your photo" /></p> : null}

      {photo ? (
        <div className={styles.previewRow}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.preview} src={photo.url} alt={tr('고른 사진 미리보기', 'Preview of the chosen photo')} />
          <p className="small muted" style={{ margin: 0 }}>
            <T
              ko="얼굴과 옷이 잘 보이는, 나 혼자 나온 사진이면 좋아요. 옷 색깔과 머리 모양, 안경 같은 것만 그림에 옮겨요."
              en="A photo of just you, with your face and clothes clearly visible, works best. Only things like clothing colors, hairstyle and glasses go into the picture."
            />
          </p>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          <T ko="전신이 아니어도 괜찮아요. 밝은 곳에서 찍은 사진이 잘 나와요." en="It doesn't need to be full-body. Photos taken in bright light turn out well." />
        </p>
      )}

      {working ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <p style={{ margin: 0, fontWeight: 800 }}>
            <T ko="보냈어요 · 그리는 중" en="Sent · Drawing" /> <span className="muted small" aria-hidden="true">{formatElapsed(elapsed * 1000)}</span>
          </p>
          <div className={styles.bar} aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
          <p style={{ margin: 0 }}>{stage}</p>
          <p className="small muted" style={{ margin: 0 }}>
            <T
              ko="보통 1~2분쯤 걸려요. 화면을 닫아도 다 그리면 「내 캐릭터」에 생겨요."
              en="It usually takes 1 to 2 minutes. Even if you close this screen, it will appear in “My character” when it's done."
            />
          </p>
        </div>
      ) : null}

      {error ? <p className="warn" role="alert"><Say text={error} /></p> : null}

      <div className="btn-row">
        <button type="button" className="btn btn-roof" disabled={!photo || !consented || working} onClick={make}>
          {working ? <T ko="그리는 중" en="Drawing" /> : <T ko="캐릭터 그리기" en="Draw my character" />}
        </button>
      </div>
    </section>
  );
}

type JobReply = { status?: string; url?: string; message?: string; ahead?: number };

/**
 * 일꾼이 다 그릴 때까지 묻는다(최대 30분). 기다리는 안내는 서버가 준 말을 그대로 보여 준다.
 * 묻는 간격은 걷기 화면과 같다(pollDelay): 처음엔 자주, 오래 걸리거나 앞에 선 사람이 많으면 드물게(사람이 많은 날 서버를 아낀다)
 */
async function waitForDrawing(id: string, onNote: (text: string | null) => void, alive: () => boolean): Promise<JobReply> {
  const started = Date.now();
  const until = started + 30 * 60 * 1000;
  let misses = 0;
  let gone = 0;
  let ahead: number | null = null;
  while (Date.now() < until) {
    await new Promise((r) => window.setTimeout(r, gone ? 4_000 : pollDelay(Date.now() - started, ahead)));
    // 화면이 닫혔으면 그만 묻는다(걷기 화면의 칩이 이어 본다)
    if (!alive()) return { status: 'gone' };
    try {
      const res = await fetch(`/api/avatar/status?id=${id}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      // 404가 연달아 오면 그사이 거뒀다(아래 칸의 「그만 그리기」 등): 틀린 까닭을 띄우지 않고 고르기로 돌아간다
      if (res.status === 404) {
        if (++gone >= 3) return { status: 'gone' };
        continue;
      }
      gone = 0;
      const json = (await res.json().catch(() => null)) as JobReply | null;
      if (!res.ok || !json?.status) {
        if (++misses >= 5) return { status: 'failed', message: '상태를 확인하지 못했어요. 잠시 뒤 아래 목록을 확인해 주세요.' };
        continue;
      }
      misses = 0;
      if (json.status === 'ready' || json.status === 'rejected' || json.status === 'failed') return json;
      ahead = json.status === 'queued' && typeof json.ahead === 'number' ? json.ahead : null;
      onNote(json.message ?? null);
    } catch {
      if (++misses >= 5) return { status: 'failed', message: '연결이 끊겼어요. 잠시 뒤 아래 목록을 확인해 주세요.' };
    }
  }
  return { status: 'failed', message: '아직 그리는 중이에요. 다 그리면 아래 「내 캐릭터」에 생겨요.' };
}
