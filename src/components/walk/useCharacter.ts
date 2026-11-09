'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveMyLook } from '@/app/look-actions';
import { cleanLook, type CharacterLook } from '@/walk/look';

// 내 캐릭터 겉모습: 이 기기(localStorage)와, 로그인했으면 프로필(saveMyLook)에 둔다.
// 사진 캐릭터는 이미지 세션이 그린다: 올린 뒤 받은 id를 이 기기에 두고 20초마다 물어(새로 고침해도 이어서) 다 되면 바꾼다.

const LOOK_KEY = 'jy.walk.look.v1';
const PENDING_KEY = 'jy.walk.look.pending.v1';
/** 다른 곳(꾸미기 패널)에서 사진을 올렸을 때 알리는 창 이벤트 */
export const PHOTO_EVENT = 'jy:look-photo';
const POLL_MS = 20_000;
const SAVE_GAP_MS = 800;

export type PhotoConsents = { self: boolean; terms: boolean };
export type PhotoStart = { ok: true; id: string } | { ok: false; message: string };
type Stored = { v: unknown; unsynced?: boolean };

const read = <T,>(k: string): T | null => {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // 사생활 보호 창 등: 이 기기에 못 둘 뿐 걷기는 그대로
  }
};
const ID = /^[0-9a-f-]{8,40}$/;

/** 사진을 올려 그리기를 맡긴다. 받은 id는 이 기기에 두고 창 이벤트로 알린다(useCharacter가 이어서 묻는다) */
export async function uploadPhoto(file: File, consents: PhotoConsents): Promise<PhotoStart> {
  if (!consents.self || !consents.terms) return { ok: false, message: '두 가지에 모두 동의해 주세요.' };
  const body = new FormData();
  body.append('photo', file);
  body.append('consent_self', '1');
  body.append('consent_terms', '1');
  try {
    const res = await fetch('/api/avatar', { method: 'POST', body, credentials: 'same-origin' });
    const data = (await res.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
    if (res.status === 202 && typeof data?.id === 'string' && ID.test(data.id)) {
      write(PENDING_KEY, data.id);
      window.dispatchEvent(new CustomEvent(PHOTO_EVENT, { detail: data.id }));
      return { ok: true, id: data.id };
    }
    if (res.status === 404) return { ok: false, message: '아직 준비 중이에요.' };
    const msg = typeof data?.message === 'string' && data.message ? data.message : '지금은 그림을 맡기지 못했어요. 잠시 뒤 다시 해 주세요.';
    return { ok: false, message: msg.slice(0, 120) };
  } catch {
    return { ok: false, message: '연결이 잠시 끊겼어요. 다시 해 주세요.' };
  }
}

/** 처음 겉모습: 로그인했으면 프로필 값(단, 이 기기에 저장 못 한 새 값이 있으면 그것), 아니면 이 기기 값 */
function restore(initial: CharacterLook, signedIn: boolean): CharacterLook {
  if (typeof window === 'undefined') return initial;
  const st = read<Stored>(LOOK_KEY);
  if (!st || !st.v || (signedIn && !st.unsynced)) return initial;
  return cleanLook(st.v, initial.kind === 'doll' ? initial.doll : undefined);
}
const restorePending = (): { id: string } | null => {
  if (typeof window === 'undefined') return null;
  const id = read<string>(PENDING_KEY);
  return typeof id === 'string' && ID.test(id) ? { id } : null;
};

/**
 * 겉모습 상태. look은 처음 그린 뒤에도 바뀔 수 있다(이 기기 값으로 되살림, 사진 그림이 다 됨):
 * 화면 쪽은 look이 바뀔 때마다 ctrl.setCharacter·net.setLook을 부르면 된다(같은 값이면 둘 다 아무것도 안 한다).
 */
export function useCharacter(initial: CharacterLook, signedIn: boolean) {
  const [look, setLookState] = useState<CharacterLook>(() => restore(initial, signedIn));
  const [pending, setPending] = useState<{ id: string } | null>(restorePending);
  const [note, setNote] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setLook = useCallback((l: CharacterLook) => {
    const c = cleanLook(l);
    setLookState(c);
    write(LOOK_KEY, { v: c, unsynced: signedIn });
    if (!signedIn) return;
    clearTimeout(saveTimer.current);
    // 여러 번 눌러 고르는 동안은 마지막 것만 저장한다
    saveTimer.current = setTimeout(() => {
      saveMyLook(c)
        .then((r) => { if (r.ok) write(LOOK_KEY, { v: c }); })
        .catch(() => undefined);
    }, SAVE_GAP_MS);
  }, [signedIn]);

  // 다른 곳(패널)에서 올린 사진 id를 받는다
  useEffect(() => {
    const onPhoto = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      if (typeof id === 'string' && ID.test(id)) setPending((p) => (p?.id === id ? p : { id }));
    };
    window.addEventListener(PHOTO_EVENT, onPhoto);
    return () => {
      window.removeEventListener(PHOTO_EVENT, onPhoto);
      clearTimeout(saveTimer.current);
    };
  }, []);

  // 그리는 중인 사진: 처음엔 5초 뒤, 그다음 20초마다 묻는다. 다 되면 사진 캐릭터로, 못 그리면 한 줄 알림
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (msg: string | null) => {
      write(PENDING_KEY, null);
      setPending(null);
      setNote(msg);
    };
    const ask = async () => {
      try {
        const res = await fetch(`/api/avatar/status?id=${encodeURIComponent(pending.id)}`, { credentials: 'same-origin', cache: 'no-store' });
        if (stop) return;
        if (res.status === 404) return done(null);
        const data = (await res.json().catch(() => null)) as { status?: unknown; message?: unknown } | null;
        if (stop) return;
        if (data?.status === 'ready') {
          setLook({ kind: 'photo', url: `/api/avatar/${pending.id}` });
          return done('사진 캐릭터가 다 그려졌어요.');
        }
        if (data?.status === 'failed' || data?.status === 'rejected') {
          return done(typeof data.message === 'string' && data.message ? data.message.slice(0, 120) : '이번 사진으로는 그림을 만들지 못했어요.');
        }
      } catch {
        // 잠깐 끊김: 다음에 다시 묻는다
      }
      if (!stop) timer = setTimeout(ask, POLL_MS);
    };
    timer = setTimeout(ask, 5000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [pending, setLook]);

  const startPhoto = useCallback(async (file: File, consents: PhotoConsents): Promise<PhotoStart> => {
    setNote(null);
    const r = await uploadPhoto(file, consents);
    if (r.ok) setPending((p) => (p?.id === r.id ? p : { id: r.id }));
    return r;
  }, []);

  return { look, setLook, pending, startPhoto, note };
}
