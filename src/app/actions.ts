'use server';
import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROOM_BY_SLUG, acceptsNotes } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { makeCode, normalizeCode } from '@/lib/code';
import { supabaseReady } from '@/lib/env';
import { requestOrigin, safeNext } from '@/lib/origin';
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
  const check = checkBody(formData.get('body'));
  if (!check.ok) return { ok: false, message: check.reason };
  const raw = String(formData.get('visibility') ?? 'guests');
  const visibility = raw === 'family' || raw === 'public' ? raw : 'guests';
  const consentPublic = visibility === 'public' && formData.get('consent_public') === 'on';
  if (visibility === 'public' && !consentPublic) {
    return { ok: false, message: '인터넷에 걸려면 동의 칸을 눌러 주세요. 아니면 범위를 바꿔 주세요.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('records')
    .insert({ room_slug: slug, body: check.body, format: 'note', requested_visibility: visibility, consent_public: consentPublic })
    .select('id')
    .single();
  if (error || !data) {
    const msg = /room_closed/.test(error?.message ?? '') ? '이 방은 지금 쉬는 중이에요.' : '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.';
    return { ok: false, message: msg };
  }
  const receipt = makeCode(3, 4);
  await supabase.rpc('attach_receipt', { p_id: data.id, p_code: receipt });
  refresh();
  return {
    ok: true,
    message: '종이를 봉투에 담았어요. 가족이 읽은 뒤에 걸려요.',
    receipt,
    warnings: contactWarnings(check.body),
  };
}

// ───────── 도장
export async function earnStamp(formData: FormData) {
  const slug = String(formData.get('room') ?? '');
  if (!ROOM_BY_SLUG.has(slug)) return;
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'stamps')) return;
  const supabase = await createClient();
  await supabase.rpc('earn_room_stamp', { p_room: slug });
  refresh();
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

export async function claimCode(_prev: JoinState | null, formData: FormData): Promise<JoinState> {
  const code = normalizeCode(String(formData.get('code') ?? ''));
  if (code.length < 8) return { ok: false, message: '초대 코드를 다시 확인해 주세요.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('claim_invite', { p_code: code });
  if (error) return { ok: false, message: '확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  refresh();
  return claimMessage(String(data));
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

function claimMessage(result: string): JoinState {
  switch (result) {
    case 'guest':
    case 'family':
    case 'admin':
      return { ok: true, message: '확인됐어요. 어서 오세요.' };
    case 'taken':
      return { ok: false, message: '이 초대 코드는 이미 다른 계정과 이어져 있어요. 가족에게 알려 주세요.' };
    case 'already':
      return { ok: false, message: '이 계정은 이미 다른 이름으로 들어와 있어요.' };
    default:
      return { ok: false, message: '쓸 수 없는 초대 코드예요. 기간이 지났거나 잘못 적었을 수 있어요.' };
  }
}

// ───────── 거두기
export async function withdrawMine(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const supabase = await createClient();
  await supabase.rpc('withdraw_record', { p_id: id });
  refresh();
}

export async function withdrawByReceipt(_prev: JoinState | null, formData: FormData): Promise<JoinState> {
  const code = normalizeCode(String(formData.get('receipt') ?? ''));
  if (code.length < 10) return { ok: false, message: '철회 번호 12자리를 확인해 주세요.' };
  if (!supabaseReady()) return { ok: false, message: '아직 준비 중이에요.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('withdraw_by_receipt', { p_code: code });
  if (error) return { ok: false, message: '처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  return data
    ? { ok: true, message: '거뒀어요. 그 기록은 더 이상 남아 있지 않아요.' }
    : { ok: false, message: '그 번호의 기록을 찾지 못했어요. 이미 거뒀을 수도 있어요.' };
}
