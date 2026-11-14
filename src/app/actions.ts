'use server';
import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROOM_BY_SLUG, acceptsNotes } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { makeCode, normalizeCode, shortCodeNote } from '@/lib/code';
import { supabaseReady } from '@/lib/env';
import { claimAnyCode, claimNote } from '@/lib/event-code';
import { discardNotePhoto, drainNoteTrash, notesMediaReady, prepareNotePhoto, storeNotePhoto } from '@/lib/notes-media';
import { requestOrigin, safeNext } from '@/lib/origin';
import { recordLimitMessage, recordRoomMessage } from '@/lib/record-errors';
import { createClient } from '@/lib/supabase/server';
import { checkBody, contactWarnings } from '@/lib/text';
import { getViewer } from '@/lib/viewer';
import { INVITE_COOKIE } from '@/lib/cookie-names';

// ───────── 들어가기 (구글)
// 앱 안 브라우저 판정은 화면에서 먼저 한다. 여기서는 PKCE 검증값을 쿠키에 두고 구글로 보낸다.
export async function signInWithGoogle(formData: FormData) {
  if (!supabaseReady()) redirect('/login?error=not_ready');
  const next = safeNext(formData.get('next'));
  const code = formData.get('invite');
  if (typeof code === 'string' && normalizeCode(code).length >= 8) {
    (await cookies()).set(INVITE_COOKIE, normalizeCode(code), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 15,
    });
  }
  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data.url) redirect('/login?error=oauth');
  redirect(data.url);
}

// ───────── 쪽지 남기기
export type NoteState = { ok: boolean; message: string; receipt?: string; warnings?: string[] };

export async function submitNote(_prev: NoteState | null, formData: FormData): Promise<NoteState> {
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'write')) {
    return { ok: false, message: '명단에 계신 분만 쪽지를 남길 수 있어요. 수첩에서 들어오는 길을 확인해 주세요.' };
  }
  const slug = String(formData.get('room') ?? '');
  const room = ROOM_BY_SLUG.get(slug);
  if (!room || !acceptsNotes(room)) return { ok: false, message: '이 방에는 아직 쪽지를 남길 수 없어요.' };
  // 사진(선택): 기기가 다시 그린 두 장. 원본 파일은 오지 않는다.
  const view = formData.get('photo_view');
  const thumb = formData.get('photo_thumb');
  const withPhoto = isBlob(view) && isBlob(thumb) && view.size > 0;
  if (withPhoto && !room.photo) return { ok: false, message: '이 방에는 사진을 붙일 수 없어요.' };
  const rawBody = formData.get('body');
  const check = checkBody(withPhoto && (typeof rawBody !== 'string' || !rawBody.trim()) ? '사진 한 장' : rawBody);
  if (!check.ok) return { ok: false, message: check.reason };
  const raw = String(formData.get('visibility') ?? 'guests');
  const visibility = raw === 'family' || raw === 'public' ? raw : 'guests';
  const consentPublic = visibility === 'public' && formData.get('consent_public') === 'on';
  if (visibility === 'public' && !consentPublic) {
    return { ok: false, message: '인터넷에 걸려면 동의 칸을 눌러 주세요. 아니면 범위를 바꿔 주세요.' };
  }

  const supabase = await createClient();
  // 사진은 확인(메타데이터를 한 번 더 지우고 남은 것이 없는지) → 비공개 버킷에 올리기 → 기록 순서.
  let media: string | null = null;
  if (withPhoto) {
    // 한도에 찬 사람의 사진은 올리지 않는다(올렸다 지우는 헛일이 한도 없이 되풀이되지 않게)
    const full = await recordRoomMessage(supabase);
    if (full) return { ok: false, message: full };
    const prepared = await prepareNotePhoto(view, thumb);
    if (!prepared.ok) return { ok: false, message: prepared.message };
    if (!notesMediaReady()) return { ok: false, message: '사진은 아직 받을 수 없어요. 사진을 빼고 글만 먼저 걸어 주세요.' };
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (typeof uid !== 'string') return { ok: false, message: '로그인이 풀린 것 같아요. 다시 들어와 주세요.' };
    const stored = await storeNotePhoto(uid, prepared.photo);
    if (!stored.ok) return { ok: false, message: stored.message };
    media = stored.base;
  }
  const { data, error } = await supabase
    .from('records')
    .insert({
      room_slug: slug,
      body: check.body,
      format: media ? 'photo' : 'note',
      requested_visibility: visibility,
      consent_public: consentPublic,
      media_path: media,
      marks_person: media ? formData.get('marks_person') === 'on' : false,
      marks_minor: media ? formData.get('marks_minor') === 'on' : false,
    })
    .select('id')
    .single();
  if (error || !data) {
    if (media) await discardNotePhoto(media);
    const text = error?.message ?? '';
    const msg = recordLimitMessage(text) ?? (/room_closed|foreign key/.test(text)
      ? '이 방은 지금 쉬는 중이에요.'
      : /room_no_photos|media_not_yours/.test(text)
        ? '사진을 붙이지 못했어요. 사진을 빼고 보내거나 잠시 뒤 다시 해 주세요.'
        : '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    return { ok: false, message: msg };
  }
  const receipt = makeCode(3, 4);
  await supabase.rpc('attach_receipt', { p_id: data.id, p_code: receipt });
  refresh();
  return {
    ok: true,
    message: media
      ? '종이와 사진을 봉투에 담았어요. 가족이 먼저 읽고, 사진은 지금은 가족에게만 보여요.'
      : '종이를 봉투에 담았어요. 가족이 읽은 뒤에 걸려요.',
    receipt,
    warnings: contactWarnings(check.body),
  };
}

function isBlob(v: FormDataEntryValue | null): v is File {
  return v !== null && typeof v !== 'string' && typeof v.arrayBuffer === 'function';
}

// ───────── 도장
/**
 * 도장 찍기 결과. ok: 요청이 잘 끝났는가, fresh: 이번에 새로 찍혔는가(이미 찍은 방이거나 도장을 받지 않는 방이면 false),
 * retry: 못 끝냈다면 다시 해 볼 만한가(연결·서버 문제). 도장을 받을 수 없는 사람이면 ok·retry 모두 false.
 * reason: 화면이 까닭을 말할 수 있게(new 새로 찍음, have 이미 있음, closed 방이 쉬는 중, denied 받을 수 없는 사람, error 서버 문제)
 */
export type StampResult = { ok: boolean; fresh: boolean; retry: boolean; reason?: 'new' | 'have' | 'closed' | 'denied' | 'error' };

export async function earnStamp(formData: FormData): Promise<StampResult> {
  const slug = String(formData.get('room') ?? '');
  if (!ROOM_BY_SLUG.has(slug)) return { ok: false, fresh: false, retry: false, reason: 'closed' };
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'stamps')) return { ok: false, fresh: false, retry: false, reason: 'denied' };
  const supabase = await createClient();
  // rpc는 실패해도 던지지 않는다: error를 봐야 실패를 안다
  const { data, error } = await supabase.rpc('earn_room_stamp', { p_room: slug });
  if (error) return { ok: false, fresh: false, retry: true, reason: 'error' };
  refresh();
  if (data === true) return { ok: true, fresh: true, retry: false, reason: 'new' };
  // 새로 찍히지 않았다: 이미 있는 도장인지(내 도장 줄만 읽힌다), 아니면 방이 쉬는 중이라 못 찍었는지
  const { data: have } = await supabase.from('stamps').select('item').eq('item', `room:${slug}`).maybeSingle();
  return { ok: true, fresh: false, retry: false, reason: have ? 'have' : 'closed' };
}

/** 폼에서 바로 쓰는 도장 찍기(돌려주는 값 없음) */
export async function earnStampForm(formData: FormData): Promise<void> {
  await earnStamp(formData);
}

// ───────── 수첩: 이름표와 종이 인형
const DOLLS = new Set(['doll-1', 'doll-2', 'doll-3', 'doll-4', 'doll-5', 'doll-6']);
const COLORS = new Set(['spring', 'summer', 'autumn', 'winter', 'cream', 'ink']);

export async function saveProfile(formData: FormData) {
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'stamps')) return;
  const nickname = String(formData.get('nickname') ?? '').normalize('NFC').trim().slice(0, 20) || null;
  const doll = String(formData.get('doll') ?? '');
  const color = String(formData.get('doll_color') ?? '');
  const photo = formData.get('photo_ok');
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return;
  await supabase.from('profiles').upsert({
    user_id: uid,
    nickname,
    doll: DOLLS.has(doll) ? doll : null,
    doll_color: COLORS.has(color) ? color : null,
    photo_ok: photo === 'yes' ? true : photo === 'no' ? false : null,
    updated_at: new Date().toISOString(),
  });
  refresh();
}

// ───────── 명단에서 못 찾았을 때
export type JoinState = { ok: boolean; message: string };

// 사람별 초대 링크를 먼저 보고, 아니면 행사 초대 코드(0018)로 받는다
export async function claimCode(_prev: JoinState | null, formData: FormData): Promise<JoinState> {
  const raw = String(formData.get('code') ?? '');
  const short = shortCodeNote(raw, 8, '초대 코드를 다시 확인해 주세요.');
  if (short) return { ok: false, message: short };
  const code = normalizeCode(raw);
  const supabase = await createClient();
  const outcome = await claimAnyCode((fn, args) => supabase.rpc(fn, args), code);
  if (outcome !== 'error') refresh();
  return claimNote(outcome);
}

export async function requestEntry(_prev: JoinState | null, formData: FormData): Promise<JoinState> {
  const name = String(formData.get('name') ?? '').normalize('NFC').trim().slice(0, 40);
  const message = String(formData.get('message') ?? '').normalize('NFC').trim().slice(0, 200);
  if (!name) return { ok: false, message: '청첩장에 적힌 이름이나 가족이 알아볼 이름을 적어 주세요.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_entry', { p_name: name, p_message: message || null });
  if (error) return { ok: false, message: '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  refresh();
  if (data === 'already_in') return { ok: true, message: '이미 명단에 계세요.' };
  return { ok: true, message: '가족에게 전했어요. 확인되면 여기서 바로 들어갈 수 있어요.' };
}

// ───────── 거두기
export async function withdrawMine(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const supabase = await createClient();
  await supabase.rpc('withdraw_record', { p_id: id });
  await drainNoteTrash(); // 붙어 있던 사진 파일도 저장소에서 지운다
  refresh();
}

export async function withdrawByReceipt(_prev: JoinState | null, formData: FormData): Promise<JoinState> {
  const raw = String(formData.get('receipt') ?? '');
  const short = shortCodeNote(raw, 10, '철회 번호 12자리를 확인해 주세요.');
  if (short) return { ok: false, message: short };
  const code = normalizeCode(raw);
  if (!supabaseReady()) return { ok: false, message: '아직 준비 중이에요.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('withdraw_by_receipt', { p_code: code });
  if (error) return { ok: false, message: '처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  if (data) await drainNoteTrash();
  return data
    ? { ok: true, message: '거뒀어요. 그 기록은 더 이상 남아 있지 않아요.' }
    : { ok: false, message: '그 번호의 기록을 찾지 못했어요. 이미 거뒀을 수도 있어요.' };
}
