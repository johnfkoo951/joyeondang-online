import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import {
  MAX_PHOTO_BYTES,
  MESSAGES,
  checkPhoto,
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

const BEGIN_MESSAGE: Record<string, string> = {
  user_limit: MESSAGES.userLimit,
  attempt_limit: MESSAGES.attemptLimit,
  total_limit: MESSAGES.totalLimit,
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
  if (!agreed(form.get('consent_self')) || !agreed(form.get('consent_terms'))) {
    return reply(400, { ok: false, message: MESSAGES.consent });
  }
  const photo = form.get('photo');
  if (!photo || typeof photo === 'string') return reply(400, { ok: false, message: MESSAGES.empty });
  if (photo.size > MAX_PHOTO_BYTES) return reply(413, { ok: false, message: MESSAGES.tooBig });
  const raw = new Uint8Array(await photo.arrayBuffer());
  const check = checkPhoto({ size: raw.length, declaredType: photo.type, head: raw.subarray(0, 16) });
  if (!check.ok) return reply(400, { ok: false, message: check.message });
  const bytes = stripPhotoMetadata(raw, check.type);
  const { totalCap } = avatarConfig();

  // 3. 오늘 장수(원본을 올리기 전에 미리)
  const { data: quotaRaw, error: quotaError } = await supabase.rpc('avatar_quota');
  if (quotaError) return reply(503, { ok: false, message: MESSAGES.notReady });
  const quota = decideQuota(readQuota(quotaRaw), totalCap);
  if (!quota.ok) return reply(429, { ok: false, reason: quota.reason, message: quota.message });

  // 4. 시작: DB가 장수를 한 번 더 세며 줄을 만든다(동시에 여러 번 눌러도 넘지 않게)
  const { data: begun, error: beginError } = await supabase.rpc('avatar_begin', {
    p_consented: true,
    p_total_cap: totalCap,
  });
  const started = (begun ?? {}) as { ok?: unknown; id?: unknown; reason?: unknown };
  if (beginError || started.ok !== true || !isUuid(started.id)) {
    const reason = typeof started.reason === 'string' ? started.reason : 'error';
    return reply(beginError ? 503 : 429, { ok: false, reason, message: BEGIN_MESSAGE[reason] ?? MESSAGES.drawFailed });
  }
  const id = started.id;

  // 5. 원본을 비공개 버킷에 두고 줄에 세운다. 그리기(사진 살피기 포함)는 Mac Studio의 일꾼이 한다
  const admin = createAvatarAdmin();
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
  return reply(202, { ok: true, id });
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
