import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { CONSENT_VIEWS_FIELD, GUARDIAN_FIELD, SUBJECT_FIELD, readSubject } from '@/lib/avatar/consent';
import {
  MAX_PHOTO_BYTES,
  MESSAGES,
  checkPhoto,
  dailyLimits,
  decideQuota,
  isUuid,
  originalPath,
  readQuota,
  stripPhotoMetadata,
} from '@/lib/avatar/rules';
import {
  AVATAR_BUCKET,
  avatarConfig,
  avatarReady,
  createAvatarAdmin,
} from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 사진 한 장 → 그리기 줄에 세우고 202 {id}. 화면은 /api/avatar/status?id= 를 몇 초마다 묻는다.
export const maxDuration = 30;

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: HEADERS });

// user_limit·history_full은 이 사람의 한도(역할마다 다르다)를 넣어 아래에서 만든다.
// slots_full은 0021 전의 DB만 준다(그 뒤에는 작업대가 다 차도 DB가 한 칸을 비워 준다)
const BEGIN_MESSAGE: Record<string, string> = {
  attempt_limit: MESSAGES.attemptLimit,
  total_limit: MESSAGES.totalLimit,
  slots_full: MESSAGES.slotsFull,
  consent: MESSAGES.consent,
  not_guest: MESSAGES.notGuest,
};

export async function POST(request: Request) {
  await connection();
  if (!sameOrigin(request)) return reply(403, { ok: false, message: MESSAGES.notGuest });

  // 1. 누구인가: 명단 손님만(클라이언트가 보낸 것은 믿지 않는다)
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return reply(404, { ok: false, message: MESSAGES.notGuest });
  if (!avatarReady()) return reply(503, { ok: false, message: MESSAGES.notReady });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!isUuid(uid)) return reply(404, { ok: false, message: MESSAGES.notGuest });

  // 2. 동의와 사진
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_PHOTO_BYTES + 64 * 1024) return reply(413, { ok: false, message: MESSAGES.tooBig });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { ok: false, message: MESSAGES.empty });
  }
  // 누구 사진인가: 나(만 14세 이상) 또는 아이(만 14세 미만, 보호자 동의). 옛 화면은 subject 없이 consent_self(나)를 보낸다
  const subject = readSubject(form.get(SUBJECT_FIELD)) ?? (agreed(form.get('consent_self')) ? 'self' : null);
  if (!subject || !agreed(form.get('consent_terms'))) {
    return reply(400, { ok: false, message: MESSAGES.consent });
  }
  if (subject === 'child' && !agreed(form.get(GUARDIAN_FIELD))) {
    return reply(400, { ok: false, message: MESSAGES.guardian });
  }
  const photo = form.get('photo');
  if (!photo || typeof photo === 'string') return reply(400, { ok: false, message: MESSAGES.empty });
  if (photo.size > MAX_PHOTO_BYTES) return reply(413, { ok: false, message: MESSAGES.tooBig });
  const raw = new Uint8Array(await photo.arrayBuffer());
  const check = checkPhoto({ size: raw.length, declaredType: photo.type, head: raw.subarray(0, 16) });
  if (!check.ok) return reply(400, { ok: false, message: check.message });
  const bytes = stripPhotoMetadata(raw, check.type);
  const { totalCap } = avatarConfig();

  // 3. 오늘 장수(원본을 올리기 전에 미리). 한도는 DB가 이 세션의 역할로 정해 준다(옛 DB면 예전 숫자)
  const { data: quotaRaw, error: quotaError } = await supabase.rpc('avatar_quota');
  if (quotaError) return reply(503, { ok: false, message: MESSAGES.notReady });
  const read = readQuota(quotaRaw);
  const quota = decideQuota(read, totalCap);
  if (!quota.ok) return reply(429, { ok: false, reason: quota.reason, message: quota.message });

  // 4. 시작: DB가 장수를 한 번 더 세며 줄을 만든다(동시에 여러 번 눌러도 넘지 않게)
  const { data: begun, error: beginError } = await supabase.rpc('avatar_begin', {
    p_consented: true,
    p_total_cap: totalCap,
  });
  const started = (begun ?? {}) as { ok?: unknown; id?: unknown; reason?: unknown; slot?: unknown };
  if (beginError || started.ok !== true || !isUuid(started.id)) {
    const reason = typeof started.reason === 'string' ? started.reason : 'error';
    const message = reason === 'user_limit'
      ? MESSAGES.userLimit(dailyLimits(read).cap)
      : reason === 'history_full' ? MESSAGES.historyFull(read.historyCap) : BEGIN_MESSAGE[reason] ?? MESSAGES.drawFailed;
    return reply(beginError ? 503 : 429, { ok: false, reason, message });
  }
  const id = started.id;
  // 새 캐릭터가 들어간 작업대 칸(0019부터). 화면이 그 칸에 「그리는 중」을 바로 보인다.
  // 0021부터는 작업대가 다 차 있었으면 DB가 가장 오래 있던 칸을 비워 이 그림에 준다(비운 그림은 이력에 남는다)
  const slot = typeof started.slot === 'number' ? started.slot : null;

  // 여러 방향 그림까지 동의했는가: 올린 화면이 그 안내를 보여 줬을 때만 적는다(옛 화면을 열어 둔 채 올린 사진은 적지 않는다).
  // 0015를 올리기 전에는 함수가 없어 오류가 난다. 그때도 그림 만들기는 그대로 한다(방향 그림만 그리지 않는다)
  if (agreed(form.get(CONSENT_VIEWS_FIELD))) {
    const { error: agreeError } = await supabase.rpc('avatar_views_agree', { p_id: id });
    if (agreeError) console.warn('avatar: views consent not recorded', id);
  }

  // 아이 사진: 보호자 동의 때를 그 그림 줄에 적는다(0025). 적지 못하면 올리지 않는다(일꾼이 아이로 보고 막을 사진을 받지 않게)
  const admin = createAvatarAdmin();
  if (subject === 'child') {
    const { data: guarded, error: guardError } = await supabase.rpc('avatar_guardian_agree', { p_id: id });
    if (guardError || guarded !== true) {
      console.warn('avatar: guardian consent not recorded', id);
      await admin.rpc('avatar_settle', { p_id: id, p_status: 'failed', p_reason: 'guardian' });
      return reply(503, { ok: false, message: MESSAGES.guardianFailed });
    }
  }

  // 5. 원본을 비공개 버킷에 두고 줄에 세운다. 그리기(사진 살피기 포함)는 Mac Studio의 일꾼이 한다
  const oPath = originalPath(uid, id, check.type);
  const bucket = admin.storage.from(AVATAR_BUCKET);
  const up = await bucket.upload(oPath, bytes, { contentType: check.type, upsert: false });
  let queued = false;
  if (!up.error) {
    const { data, error } = await admin.rpc('avatar_enqueue', { p_id: id, p_original_path: oPath });
    queued = !error && data === true;
  }
  if (!queued) {
    console.warn('avatar: enqueue failed', id, up.error?.message ?? 'enqueue');
    if (!up.error) await bucket.remove([oPath]);
    await admin.rpc('avatar_settle', { p_id: id, p_status: 'failed', p_reason: 'enqueue' });
    return reply(503, { ok: false, message: MESSAGES.drawFailed });
  }
  return reply(202, { ok: true, id, slot });
}

// 다른 사이트에서 몰래 보내는 요청을 막는다(쿠키가 붙어 와도)
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

// 체크 상자 값: 폼은 'on', 걷기 화면은 '1'
function agreed(v: FormDataEntryValue | null): boolean {
  return v === 'on' || v === '1';
}
