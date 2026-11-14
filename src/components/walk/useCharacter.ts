'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveMyLook } from '@/app/look-actions';
import { CONSENT_VIEWS_FIELD, GUARDIAN_FIELD, SUBJECT_FIELD, type PhotoSubject } from '@/lib/avatar/consent';
import { MAX_PHOTO_BYTES, MESSAGES } from '@/lib/avatar/rules';
import { shrinkPhoto } from '@/lib/avatar/shrink';
import { carryTitle, cleanLook, type CharacterLook } from '@/walk/look';
import { onMakingReady, startMaking } from './making';
import { useMaking } from './useMaking';
import { onWalk, WALK_EVENT } from './walk-events';

// 내 캐릭터 겉모습: 이 기기(localStorage)와, 로그인했으면 프로필(saveMyLook)에 둔다.
// 사진 캐릭터는 그림 일꾼이 그린다: 올린 뒤 받은 id는 그리는 중인 일(making.ts)이 이 기기에 두고 묻는다
// (새로 고침해도 이어서). 다 되면 그 캐릭터로 바꿔 끼운다.

const LOOK_KEY = 'jy.walk.look.v1';
/** 다른 곳(꾸미기 패널)에서 사진을 올렸을 때 알리는 창 이벤트(detail: id) */
export const PHOTO_EVENT = 'jy:look-photo';
const SAVE_GAP_MS = 800;

/** 누구 사진인가(나 또는 아이), 아이면 보호자 동의, 안내 동의 */
export type PhotoConsents = { subject: PhotoSubject | null; guardian: boolean; terms: boolean };
/** 올릴 수 있게 다 골랐는가(누구 사진인지, 아이면 보호자 동의, 안내 동의) */
export const consentsReady = (c: PhotoConsents) => Boolean(c.subject) && c.terms && (c.subject !== 'child' || c.guardian);
/** reason: 서버가 준 거절 까닭(예: slots_full이면 칸 하나를 비우라고 안내한다) */
export type PhotoStart = { ok: true; id: string; slot?: number | null } | { ok: false; message: string; reason?: string };
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

/**
 * 사진을 올려 그리기를 맡긴다. 받은 id는 그리는 중인 일로 이 기기에 두고(창과 칩이 보인다) 창 이벤트로도 알린다.
 * 휴대폰 원본은 서버 한도를 넘으므로 보내기 전에 기기에서 줄인다(shrink는 시험에서 바꿔 끼운다).
 */
export async function uploadPhoto(
  file: File, consents: PhotoConsents, shrink: (f: File) => Promise<Blob> = shrinkPhoto,
): Promise<PhotoStart> {
  if (!consents.subject || !consents.terms) return { ok: false, message: MESSAGES.consent };
  if (consents.subject === 'child' && !consents.guardian) return { ok: false, message: MESSAGES.guardian };
  let small: Blob;
  try {
    small = await shrink(file);
  } catch {
    // 브라우저가 못 여는 형식(일부 기기의 HEIC 등)
    return { ok: false, message: '이 사진은 열 수 없어요. 다른 사진으로 해 주세요.' };
  }
  if (small.size > MAX_PHOTO_BYTES) return { ok: false, message: MESSAGES.tooBig };
  const body = new FormData();
  body.append('photo', small, 'photo.jpg');
  body.append(SUBJECT_FIELD, consents.subject);
  if (consents.subject === 'child') body.append(GUARDIAN_FIELD, '1');
  body.append('consent_terms', '1');
  // 패널이 보여 준 동의 글(CONSENT_MAIN)에 여러 방향 그림 안내가 들어 있다
  body.append(CONSENT_VIEWS_FIELD, '1');
  try {
    const res = await fetch('/api/avatar', { method: 'POST', body, credentials: 'same-origin' });
    const data = (await res.json().catch(() => null)) as { id?: unknown; message?: unknown; reason?: unknown; slot?: unknown } | null;
    if (res.status === 202 && typeof data?.id === 'string' && ID.test(data.id)) {
      const slot = typeof data.slot === 'number' ? data.slot : null;
      startMaking(data.id, slot);
      window.dispatchEvent(new CustomEvent(PHOTO_EVENT, { detail: data.id }));
      return { ok: true, id: data.id, slot };
    }
    if (res.status === 404) return { ok: false, message: '아직 준비 중이에요.' };
    // 플랫폼이 본문 크기에서 끊으면 JSON이 아닌 413이 온다
    if (res.status === 413) return { ok: false, message: MESSAGES.tooBig };
    const msg = typeof data?.message === 'string' && data.message ? data.message : '지금은 그림을 맡기지 못했어요. 잠시 뒤 다시 해 주세요.';
    const reason = typeof data?.reason === 'string' && /^[a-z_]{1,32}$/.test(data.reason) ? data.reason : null;
    return reason ? { ok: false, message: msg.slice(0, 120), reason } : { ok: false, message: msg.slice(0, 120) };
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
/**
 * 겉모습 상태. look은 처음 그린 뒤에도 바뀔 수 있다(이 기기 값으로 되살림, 사진 그림이 다 됨):
 * 화면 쪽은 look이 바뀔 때마다 ctrl.setCharacter·net.setLook을 부르면 된다(같은 값이면 둘 다 아무것도 안 한다).
 * pending: 그리는 중인 사진(없으면 null). 진행과 알림은 캐릭터 창과 메인 화면 칩(MakingChip)이 보인다.
 */
export function useCharacter(initial: CharacterLook, signedIn: boolean) {
  const [look, setLookState] = useState<CharacterLook>(() => restore(initial, signedIn));
  /** 지금 겉모습(칭호를 이어 붙이려고 콜백 안에서 읽는다) */
  const now = useRef(look);
  useEffect(() => { now.current = look; }, [look]);
  const making = useMaking();
  const pending = making && (making.phase === 'queued' || making.phase === 'drawing') ? { id: making.id } : null;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 칭호 칸이 아예 없는 겉모습(인형·사진을 고른 것)은 지금 칭호를 이어 단다. 칸이 있으면(빈 글이어도) 그것을 따른다
  const setLook = useCallback((l: CharacterLook) => {
    const c = carryTitle(l, now.current);
    now.current = c;
    setLookState(c);
    write(LOOK_KEY, { v: c, unsynced: signedIn });
    if (!signedIn) return;
    clearTimeout(saveTimer.current);
    // 여러 번 눌러 고르는 동안은 마지막 것만 저장한다. 칭호 칸은 늘 보낸다(지운 칭호를 서버가 되살리지 않게)
    saveTimer.current = setTimeout(() => {
      saveMyLook({ ...c, title: c.title ?? '' })
        .then((r) => { if (r.ok) write(LOOK_KEY, { v: c }); })
        .catch(() => undefined);
    }, SAVE_GAP_MS);
  }, [signedIn]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // 다른 화면(걷기 위에 연 「내 캐릭터」 시트)이 서버의 겉모습을 바꿨다: 바로 갈아입고 이 기기 값도 맞춘다(다시 저장하지 않는다)
  useEffect(() => onWalk(WALK_EVENT.lookChanged, (d) => {
    const raw = (d as { look?: unknown } | null)?.look;
    if (!raw || typeof raw !== 'object') return;
    // 다른 화면은 칭호를 모를 수 있다: 칸이 없으면 지금 칭호를 그대로 둔다(서버도 저장된 칭호를 지킨다)
    const c = carryTitle(raw, now.current);
    now.current = c;
    clearTimeout(saveTimer.current);
    setLookState(c);
    write(LOOK_KEY, { v: c });
  }), []);

  // 그리는 중이던 사진이 다 되면 그 캐릭터로 바꿔 끼운다(창을 닫아 둔 채여도). 못 그렸으면 칩과 창이 까닭을 알린다
  useEffect(() => onMakingReady((id) => {
    if (ID.test(id)) setLook({ kind: 'photo', url: `/api/avatar/${id}` });
  }), [setLook]);

  const startPhoto = useCallback((file: File, consents: PhotoConsents): Promise<PhotoStart> => uploadPhoto(file, consents), []);

  return { look, setLook, pending, startPhoto };
}
