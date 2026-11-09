// AI 사진 캐릭터의 규칙(순수 함수). 서버·브라우저·node --test 어디서나 돈다.
// 다른 파일을 런타임에 가져오지 않는다(node --test가 확장자 없는 경로를 못 읽음).
// 하루 장수·시도 수는 DB(supabase/migrations/0003_avatars.sql의 avatar_quota)와 같아야 한다.

/** 한 사람이 KST 하루에 만들 수 있는 그림 수(거절된 사진·실패는 세지 않음) */
export const PER_USER_DAILY = 3;
/** 거절·실패까지 포함한 하루 시도 수. 사진 살피기 비용을 지킨다 */
export const ATTEMPTS_DAILY = 8;
/** 모두 합친 하루 상한 기본값(환경 변수 AVATAR_DAILY_CAP_TOTAL) */
export const DEFAULT_TOTAL_CAP = 150;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof ACCEPTED_TYPES)[number];
/** 브라우저에서 줄이는 크기(긴 변)와 JPEG 품질 */
export const RESIZE_LONG_EDGE = 1024;
export const RESIZE_QUALITY = 0.85;
/** 그림 크기: 세로로 긴 전신 */
export const OUTPUT_SIZE = '1024x1536';

export const MESSAGES = {
  empty: '사진을 골라 주세요.',
  tooBig: '사진이 너무 커요. 6MB 이하로 올려 주세요.',
  badType: 'JPG, PNG, WEBP 사진만 올릴 수 있어요.',
  consent: '두 가지 안내에 모두 동의해 주세요.',
  userLimit: '오늘 만들 수 있는 3장을 다 만들었어요. 내일 다시 해 주세요.',
  attemptLimit: '오늘은 사진을 여러 번 올리셨어요. 내일 다시 해 주세요.',
  totalLimit: '오늘은 캐릭터 만들기가 다 찼어요. 내일 다시 해 주세요.',
  noPerson: '사진에서 사람을 찾지 못했어요. 얼굴과 옷이 잘 보이는 내 사진으로 다시 해 주세요.',
  manyPeople: '사진에 여러 사람이 보여요. 나 혼자 나온 사진으로 다시 해 주세요.',
  child: '아이로 보일 수 있는 사진은 그림을 만들지 않아요. 만 14세 이상인 나 자신의 사진으로 해 주세요.',
  unclear: '사진을 잘 알아보지 못했어요. 밝고 또렷하게 나 혼자 나온 사진으로 다시 해 주세요.',
  blocked: '이 사진으로는 그림을 만들 수 없었어요. 다른 사진으로 해 주세요.',
  checkFailed: '지금은 사진을 살펴보지 못했어요. 잠시 뒤 다시 해 주세요.',
  drawFailed: '그림을 그리지 못했어요. 이번 시도는 오늘 장수에 세지 않아요. 잠시 뒤 다시 해 주세요.',
  notReady: '캐릭터 만들기가 아직 준비 중이에요.',
  notGuest: '명단에 계신 분만 캐릭터를 만들 수 있어요.',
  queued: '그릴 차례를 기다리는 중이에요.',
  drawing: '캐릭터를 그리는 중이에요.',
  workerResting: '그림 일꾼이 쉬는 중이라 조금 늦어요. 이 화면을 닫아도 다 그리면 「내 캐릭터」에 생겨요.',
} as const;

// ───────── 사진 확인

/** 앞 몇 바이트로 실제 형식을 본다(브라우저가 보낸 type은 믿지 않는다) */
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

export type PhotoCheck =
  | { ok: true; type: PhotoType }
  | { ok: false; reason: 'empty' | 'too_big' | 'bad_type'; message: string };

export function checkPhoto(input: { size: number; declaredType: string; head: Uint8Array }): PhotoCheck {
  if (!input.size || input.size <= 0) return { ok: false, reason: 'empty', message: MESSAGES.empty };
  if (input.size > MAX_PHOTO_BYTES) return { ok: false, reason: 'too_big', message: MESSAGES.tooBig };
  const declared = String(input.declaredType || '').toLowerCase();
  if (declared && !(ACCEPTED_TYPES as readonly string[]).includes(declared)) {
    return { ok: false, reason: 'bad_type', message: MESSAGES.badType };
  }
  const sniffed = sniffImageType(input.head);
  if (!sniffed) return { ok: false, reason: 'bad_type', message: MESSAGES.badType };
  return { ok: true, type: sniffed };
}

export function extensionFor(type: PhotoType): 'jpg' | 'png' | 'webp' {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** 저장소 경로. DB의 check 제약과 같은 모양이어야 한다 */
export function originalPath(uid: string, id: string, type: PhotoType): string {
  return `${uid}/originals/${id}.${extensionFor(type)}`;
}
export function charPath(uid: string, id: string): string {
  return `${uid}/chars/${id}.png`;
}

// ───────── 사진 속 위치·기기 정보 지우기
// 브라우저에서 줄일 때 이미 사라지지만, 서버도 한 번 더 지운다(직접 올린 파일 대비).
// JPEG: APP1(Exif, XMP), APP12, APP13(IPTC), COM 조각을 뺀다. 색 정보(APP2 ICC, APP14 Adobe)는 둔다.
// PNG: eXIf, tEXt, iTXt, zTXt, tIME 조각을 뺀다. WEBP: EXIF, XMP 조각을 빼고 VP8X 표시를 고친다.
export function stripPhotoMetadata(bytes: Uint8Array, type: PhotoType): Uint8Array {
  try {
    if (type === 'image/jpeg') return stripJpeg(bytes);
    if (type === 'image/png') return stripPng(bytes);
    return stripWebp(bytes);
  } catch {
    return bytes;
  }
}

function stripJpeg(src: Uint8Array): Uint8Array {
  if (src[0] !== 0xff || src[1] !== 0xd8) return src;
  const parts: Uint8Array[] = [src.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= src.length) {
    if (src[i] !== 0xff) return src; // 모양이 이상하면 손대지 않는다
    const marker = src[i + 1];
    if (marker === 0xd9) {
      parts.push(src.subarray(i));
      return concat(parts);
    }
    if (marker === 0xda) {
      // 화면 데이터 시작: 여기부터 끝까지 그대로
      parts.push(src.subarray(i));
      return concat(parts);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      parts.push(src.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = (src[i + 2] << 8) | src[i + 3];
    if (len < 2 || i + 2 + len > src.length) return src;
    const drop = marker === 0xe1 || marker === 0xec || marker === 0xed || marker === 0xfe;
    if (!drop) parts.push(src.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return src;
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
function stripPng(src: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [src.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= src.length) {
    const len = readU32BE(src, i);
    const kind = ascii(src, i + 4, 4);
    const end = i + 12 + len;
    if (end > src.length) return src;
    if (!PNG_DROP.has(kind)) parts.push(src.subarray(i, end));
    i = end;
    if (kind === 'IEND') return concat(parts);
  }
  return src;
}

function stripWebp(src: Uint8Array): Uint8Array {
  if (src.length < 12) return src;
  const parts: Uint8Array[] = [];
  let i = 12;
  let removed = false;
  while (i + 8 <= src.length) {
    const kind = ascii(src, i, 4);
    const len = readU32LE(src, i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > src.length) return src;
    if (kind === 'EXIF' || kind === 'XMP ') {
      removed = true;
    } else {
      parts.push(src.subarray(i, Math.min(end, src.length)));
    }
    i = end;
  }
  if (!removed) return src;
  const body = concat(parts);
  // VP8X 표시에서 EXIF(0x08)·XMP(0x04) 비트를 끈다
  if (ascii(body, 0, 4) === 'VP8X' && body.length > 8) {
    const copy = new Uint8Array(body);
    copy[8] = copy[8] & ~0x0c;
    return riff(copy);
  }
  return riff(body);
}

function riff(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  const size = 4 + body.length;
  out[4] = size & 0xff;
  out[5] = (size >>> 8) & 0xff;
  out[6] = (size >>> 16) & 0xff;
  out[7] = (size >>> 24) & 0xff;
  out.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  out.set(body, 12);
  return out;
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = '';
  for (let k = 0; k < n && at + k < b.length; k++) s += String.fromCharCode(b[at + k]);
  return s;
}
function readU32BE(b: Uint8Array, at: number): number {
  return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
}
function readU32LE(b: Uint8Array, at: number): number {
  return b[at] + (b[at + 1] << 8) + (b[at + 2] << 16) + ((b[at + 3] << 24) >>> 0);
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ───────── 하루 장수

export type QuotaState = { used: number; attempts: number; total: number };
export type QuotaDecision =
  | { ok: true; left: number }
  | { ok: false; reason: 'user_limit' | 'attempt_limit' | 'total_limit'; message: string };

/** 확인 순서는 DB의 avatar_begin과 같다: 내 장수 → 내 시도 → 모두의 상한 */
export function decideQuota(q: QuotaState, totalCap: number): QuotaDecision {
  const used = toCount(q.used);
  const attempts = toCount(q.attempts);
  const total = toCount(q.total);
  if (used >= PER_USER_DAILY) return { ok: false, reason: 'user_limit', message: MESSAGES.userLimit };
  if (attempts >= ATTEMPTS_DAILY) return { ok: false, reason: 'attempt_limit', message: MESSAGES.attemptLimit };
  if (total >= Math.max(0, totalCap)) return { ok: false, reason: 'total_limit', message: MESSAGES.totalLimit };
  return { ok: true, left: PER_USER_DAILY - used };
}

export function readQuota(raw: unknown): QuotaState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { used: toCount(o.used), attempts: toCount(o.attempts), total: toCount(o.total) };
}

/** 환경 변수 값을 상한 숫자로. 비었거나 이상하면 기본값 */
export function readTotalCap(raw: string | undefined | null): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_TOTAL_CAP;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TOTAL_CAP;
  return Math.min(Math.floor(n), 100000);
}

function toCount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  // 숫자가 아니면 가득 찬 것으로 본다(모르면 막는다)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : Number.MAX_SAFE_INTEGER;
}

// ───────── 사진 살피기 결과

export type VisionVerdict =
  | { ok: true }
  | { ok: false; reason: 'no_person' | 'many_people' | 'child' | 'unclear'; message: string };

/**
 * 비전 모델의 JSON 답을 판정한다. 모양이 조금이라도 이상하면 거절(모르면 막는다).
 * 통과 조건: 사람 사진이고, 정확히 한 명이고, 만 14세 미만으로 보이지 않고, 애매하지 않다.
 */
export function parseVisionCheck(raw: unknown): VisionVerdict {
  const unclear = { ok: false as const, reason: 'unclear' as const, message: MESSAGES.unclear };
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return unclear;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return unclear;
  const o = data as Record<string, unknown>;
  const { personCount, likelyUnder14, isPhotoOfPerson, uncertain } = o;
  if (typeof isPhotoOfPerson !== 'boolean' || typeof likelyUnder14 !== 'boolean') return unclear;
  if (typeof personCount !== 'number' || !Number.isInteger(personCount) || personCount < 0) return unclear;
  if (uncertain !== undefined && typeof uncertain !== 'boolean') return unclear;
  // 아이일 수 있으면 다른 무엇보다 먼저 막는다
  if (likelyUnder14) return { ok: false, reason: 'child', message: MESSAGES.child };
  if (!isPhotoOfPerson || personCount === 0) return { ok: false, reason: 'no_person', message: MESSAGES.noPerson };
  if (personCount > 1) return { ok: false, reason: 'many_people', message: MESSAGES.manyPeople };
  if (uncertain === true) return unclear;
  return { ok: true };
}

// ───────── KST 하루

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 그 순간의 KST 날짜(YYYY-MM-DD). 한국은 일광 절약 시간이 없어 +9 고정 */
export function kstDay(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 그 순간이 속한 KST 하루의 시작(UTC 시각). DB의 avatar_day_start()와 같다 */
export function kstDayStart(at: Date): Date {
  const day = kstDay(at);
  return new Date(Date.parse(`${day}T00:00:00Z`) - KST_OFFSET_MS);
}

// ───────── 그리기 대기열의 상태(화면이 몇 초마다 묻는다)

export type JobStatus = 'queued' | 'drawing' | 'ready' | 'rejected' | 'failed';
export type JobView = { status: JobStatus; url?: string; message?: string };

const REJECT_MESSAGE: Record<string, string> = {
  child: MESSAGES.child,
  no_person: MESSAGES.noPerson,
  many_people: MESSAGES.manyPeople,
  unclear: MESSAGES.unclear,
  blocked: MESSAGES.blocked,
};

/**
 * DB의 avatar_job_status() 결과를 화면에 줄 모양으로 바꾼다. 지운 것·모르는 것은 null(404).
 * 일꾼이 quietMs 넘게 조용하면 기다리는 안내를 「쉬는 중」으로 바꾼다.
 */
export function jobView(raw: unknown, id: string, now: number, quietMs: number): JobView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isUuid(id)) return null;
  const o = raw as Record<string, unknown>;
  const reason = typeof o.reason === 'string' ? o.reason : '';
  const seen = typeof o.worker_seen_at === 'string' ? Date.parse(o.worker_seen_at) : NaN;
  const resting = !(seen > now - quietMs);
  switch (o.status) {
    case 'pending':
    case 'queued':
      return { status: 'queued', message: resting ? MESSAGES.workerResting : MESSAGES.queued };
    case 'drawing':
      return { status: 'drawing', message: resting ? MESSAGES.workerResting : MESSAGES.drawing };
    case 'ready':
      return { status: 'ready', url: `/api/avatar/${id}` };
    case 'rejected':
      return { status: 'rejected', message: REJECT_MESSAGE[reason] ?? MESSAGES.blocked };
    case 'failed':
      return { status: 'failed', message: MESSAGES.drawFailed };
    default:
      return null;
  }
}
