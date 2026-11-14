// AI 사진 캐릭터의 규칙(순수 함수). 서버·브라우저·node --test 어디서나 돈다.
// 다른 파일을 런타임에 가져오지 않는다(node --test가 확장자 없는 경로를 못 읽음).
// 하루 장수·시도 수는 DB가 명단의 역할마다 정해 avatar_quota()로 준다(supabase/migrations/0020_avatar_role_caps.sql의
// avatar_limits). 사이트는 그 값을 그대로 쓰고, 그 값이 없는 옛 DB(0020 전)에서만 아래 예전 숫자를 쓴다.
// 이력·보관(★)·3D 요청의 한도도 같은 표에서 온다(0021_avatar_history_keep_3d.sql). 사이트에 숫자를 따로 두지 않는다.
// 화면 말(한국어 ↔ 영어): 서버와 DB는 늘 한국어 글을 준다(MESSAGES). 화면이 영어일 때는 MESSAGES_EN의 같은 자리, 또는
// 받은 한국어 글을 messageEn으로 바꿔 보인다. 글을 만드는 함수는 lang을 받는다(기본 한국어: 한국어 글은 그대로).
import type { Lang } from '@/lib/i18n';

/** 옛 DB(0020 전)에서 한 사람이 KST 하루에 만들 수 있는 그림 수(거절된 사진·실패는 세지 않음). 0003의 avatar_quota와 같다 */
export const PER_USER_DAILY = 3;
/** 옛 DB(0020 전)에서 거절·실패까지 포함한 하루 시도 수. 사진 살피기 비용을 지킨다 */
export const ATTEMPTS_DAILY = 8;
/**
 * 작업대 칸 수의 기본(그리는 중 포함): 손님의 칸 수이자, 역할마다 칸 수를 주기 전의 DB(0019·0020)의 칸 수. DB 0019·0020과 같아야 한다.
 * 0021부터는 DB가 역할마다 정해 avatar_quota()의 slots로 준다(손님 3, 가족·관리자 9. 0021의 avatar_limits의 bench_max).
 * 사이트는 그 값을 그대로 쓴다(benchSize). 새 그림은 늘 작업대에 들어가고, 다 차면 DB가 한 칸을 비워 준다(비운 그림은 이력에 남는다).
 * 0021 전의 DB에서는 보관 중이 셋이면 새로 만들지 못한다(slots_full)
 */
export const SLOTS = 3;
/** 가장 넓은 작업대(관리자·가족). DB의 칸 번호 범위(0021의 avatars_slot_range, 1~9)와 avatar_bench_max의 끝과 같아야 한다 */
export const SLOTS_MAX = 9;
/** 이력을 한 번에 읽어 보이는 수(최근부터). 더 있으면 알린다(관리자는 이력 한도가 없다) */
export const HISTORY_SHOWN = 60;
/** 모두 합친 하루 상한 기본값(환경 변수 AVATAR_DAILY_CAP_TOTAL) */
export const DEFAULT_TOTAL_CAP = 150;
/** 서버가 받는 사진 크기. 배포 플랫폼이 요청 본문을 4.5MB에서 끊으므로 그보다 작아야 이 안내가 손님에게 닿는다 */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof ACCEPTED_TYPES)[number];
/** 브라우저에서 줄이는 크기(긴 변)와 JPEG 품질 */
export const RESIZE_LONG_EDGE = 1024;
export const RESIZE_QUALITY = 0.85;
/** 그림 크기: 세로로 긴 전신 */
export const OUTPUT_SIZE = '1024x1536';

export const MESSAGES = {
  empty: '사진을 골라 주세요.',
  tooBig: '사진이 너무 커요. 4MB 이하로 올려 주세요.',
  badType: 'JPG, PNG, WEBP 사진만 올릴 수 있어요.',
  consent: '누구 사진인지 고르고 안내에 동의해 주세요.',
  /** 아이를 골랐는데 보호자 동의에 체크하지 않았을 때 */
  guardian: '아이 사진은 보호자 동의에 체크해야 올릴 수 있어요.',
  /** 보호자 동의를 DB에 적지 못했을 때(0025 전의 DB 등) */
  guardianFailed: '아이 사진의 보호자 동의를 적지 못했어요. 잠시 뒤 다시 해 주세요.',
  /** 하루 장수를 다 만들었을 때. n: 이 사람의 하루 장수(역할마다 다르다. 모르거나 0이면 숫자 없이) */
  userLimit: (n?: number | null) =>
    typeof n === 'number' && Number.isFinite(n) && n > 0
      ? `오늘 만들 수 있는 ${n}장을 다 만들었어요. 내일 다시 해 주세요.`
      : '오늘 만들 수 있는 만큼 다 만들었어요. 내일 다시 해 주세요.',
  attemptLimit: '오늘은 사진을 여러 번 올리셨어요. 내일 다시 해 주세요.',
  totalLimit: '오늘은 캐릭터 만들기가 다 찼어요. 내일 다시 해 주세요.',
  /** 0021 전의 DB에서만 나온다(그 뒤에는 작업대가 한 칸을 비워 준다) */
  slotsFull: '캐릭터는 세 개까지 보관해요. 칸 하나를 비우면 새로 만들 수 있어요.',
  /** 이력이 다 찼을 때(0021). n: 이 사람의 이력 한도(모르거나 0이면 숫자 없이) */
  historyFull: (n?: number | null) =>
    `이력이 다 찼어요${countIn(n)}. 이력에서 지울 그림을 골라 지우면 새로 만들 수 있어요.`,
  /** ★ 보관이 다 찼을 때. n: 보관 한도 */
  keepFull: (n?: number | null) =>
    `★ 보관은 ${typeof n === 'number' && n > 0 ? `${n}개까지` : '한도까지'}예요. 다른 그림의 ★을 빼면 보관할 수 있어요.`,
  /** 3D 요청을 다 썼을 때. n: 3D 한도(한 사람 한 번이 보통) */
  modelFull: (n?: number | null) =>
    typeof n === 'number' && n > 1
      ? `3D는 한 사람 ${n}번까지 만들 수 있어요. 다 썼어요.`
      : '3D는 한 사람 한 번만 만들 수 있어요. 이미 만들었거나 만드는 중이에요.',
  /** 다시 해도 같은 실패로 굳은 그림(그 그림 탓, 또는 지금 3D를 만드는 곳이 받지 않은 그림) */
  modelBlocked: '이 그림으로는 3D를 만들 수 없었어요. 다른 그림으로 해 주세요.',
  /** 돈이 든 3D 시도를 다 썼을 때. n: 시도 한도(손님·가족 2: 한 번, 못 만들면 한 번 더) */
  modelTriesFull: (n?: number | null) =>
    typeof n === 'number' && n > 0 ? `3D는 한 사람 ${n}번까지 해 볼 수 있어요. 다 해 봤어요.` : '3D를 더 해 볼 수 없어요.',
  /** 모두 합친 하루 3D 요청이 다 찼을 때 */
  modelDayFull: '오늘은 3D 만들기가 다 찼어요. 내일 다시 해 주세요.',
  /** 확인 카드: 한 사람 몫의 3D를 이미 썼을 때(다 만들었다) */
  modelUsed: '이미 3D를 만들었어요.',
  /** 확인 카드: 한 사람 몫의 3D를 지금 다른 그림으로 기다리거나 만드는 중일 때 */
  modelBusy: '3D를 만드는 중이에요. 3D는 한 사람 한 번이에요.',
  /** 3D 서비스가 만들다 못 만들었을 때(그 그림 탓이 아닌 까닭) */
  modelFailed: '3D 서비스에서 3D를 만들지 못했어요.',
  /** 3D 만드는 곳이 바뀌어 보내지 않고 돌려준 요청(reconsent) */
  modelReconsent: '3D 만드는 곳이 바뀌어 보내지 않았어요. 캐릭터 창에서 다시 눌러 주세요.',
  /** 확인 카드: 새 그림을 3D로 만들려는데 ★ 보관함이 다 찼다(3D는 ★ 그림으로만). n: 보관 한도 */
  pickKeepFull: (n?: number | null) =>
    `★ 보관함이 다 찼어요${countIn(n)}. 3D는 ★ 그림으로만 만들어요. 보관함에서 ★ 하나를 빼면 이 그림으로 만들 수 있어요.`,
  notKept: '★로 보관한 그림만 3D로 만들 수 있어요.',
  picNotReady: '다 그린 그림만 보관하거나 3D로 만들 수 있어요.',
  benchFull: '작업대 칸이 다 찼어요. 바꿀 칸을 골라 주세요.',
  /** 화면이 보인 칸 번호가 지금 역할의 작업대 칸 수 밖일 때(그사이 역할이 바뀌었다. DB의 bad_slot). 화면은 바로 다시 읽는다 */
  benchChanged: '작업대 칸 수가 바뀌었어요. 칸을 다시 골라 주세요.',
  picGone: '그림을 찾지 못했어요. 이미 지웠을 수도 있어요.',
  featureSoon: '이 기능은 아직 준비 중이에요.',
  tryLater: '지금은 하지 못했어요. 잠시 뒤 다시 해 주세요.',
  modelOff: '3D 만들기를 잠시 쉬고 있어요. 나중에 다시 해 주세요.',
  noPerson: '사진에서 사람을 찾지 못했어요. 얼굴과 옷이 잘 보이는 내 사진으로 다시 해 주세요.',
  manyPeople: '사진에 여러 사람이 보여요. 나 혼자 나온 사진으로 다시 해 주세요.',
  child: '아이로 보이는 사진이에요. 아이 사진이면 「아이예요」를 고르고 보호자 동의에 체크해 주세요. 내 사진이면 얼굴이 크고 밝게 나온 다른 사진으로 해 보세요.',
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

type Said = {
  readonly [K in keyof typeof MESSAGES]: (typeof MESSAGES)[K] extends (...a: infer A) => string ? (...a: A) => string : string;
};
/** 숫자 하나에 맞춘 영어 낱말(1 picture, 2 pictures) */
const many = (n: number, one: string, more: string) => (n === 1 ? one : more);

/** MESSAGES의 영어(같은 열쇠, 같은 인자). 화면이 영어일 때 쓴다 */
export const MESSAGES_EN: Said = {
  empty: 'Please choose a photo.',
  tooBig: 'That photo is too big. Please use one that is 4MB or smaller.',
  badType: 'Only JPG, PNG or WEBP photos can be used.',
  consent: 'Please choose whose photo it is and agree to the notice.',
  guardian: "For a child's photo, please tick the guardian consent first.",
  guardianFailed: "We couldn't record the guardian consent for the child's photo. Please try again in a moment.",
  userLimit: (n?: number | null) =>
    typeof n === 'number' && Number.isFinite(n) && n > 0
      ? `You've reached today's limit of ${n} ${many(n, 'picture', 'pictures')}. Please try again tomorrow.`
      : "You've reached today's limit. Please try again tomorrow.",
  attemptLimit: "You've uploaded photos many times today. Please try again tomorrow.",
  totalLimit: 'Character making is full for today. Please try again tomorrow.',
  slotsFull: 'You can keep up to three characters. Empty a slot to make a new one.',
  historyFull: (n?: number | null) =>
    `Your history is full${countInEn(n)}. Delete a picture from your history to make a new one.`,
  keepFull: (n?: number | null) =>
    typeof n === 'number' && n > 0
      ? `★ favorites hold up to ${n}. Remove the ★ from another picture to add this one.`
      : "★ favorites are full. Remove the ★ from another picture to add this one.",
  modelFull: (n?: number | null) =>
    typeof n === 'number' && n > 1
      ? `Each person can make up to ${n} 3D models. You've used them all.`
      : 'Each person can make 3D only once. Yours is already made or being made.',
  modelBlocked: "We couldn't make 3D from this picture. Please try another picture.",
  modelTriesFull: (n?: number | null) =>
    typeof n === 'number' && n > 0
      ? `Each person can try 3D up to ${n} ${many(n, 'time', 'times')}. You've used all your tries.`
      : 'No more 3D tries left.',
  modelDayFull: '3D making is full for today. Please try again tomorrow.',
  modelUsed: "You've already made your 3D.",
  modelBusy: "Your 3D is being made. It's one 3D per person.",
  modelFailed: "The 3D service couldn't make the 3D model.",
  modelReconsent: "Where 3D is made has changed, so it wasn't sent. Please press it again in the character panel.",
  pickKeepFull: (n?: number | null) =>
    `Your ★ favorites are full${countInEn(n)}. 3D is made only from ★ pictures. Remove one ★ to make 3D from this picture.`,
  notKept: 'Only ★ favorite pictures can be made into 3D.',
  picNotReady: 'Only finished pictures can be kept or made into 3D.',
  benchFull: 'The workbench is full. Please choose a slot to swap.',
  benchChanged: 'The number of workbench slots changed. Please choose a slot again.',
  picGone: "We couldn't find that picture. It may already be deleted.",
  featureSoon: "This isn't ready yet.",
  tryLater: "That didn't work just now. Please try again in a moment.",
  modelOff: '3D making is paused for now. Please try again later.',
  noPerson: "We couldn't find a person in the photo. Please try a photo of you with your face and clothes clearly visible.",
  manyPeople: 'There are several people in the photo. Please try a photo of just you.',
  child: "This looks like a child. If it's a child's photo, choose “A child” and tick the guardian consent. If it's you, try another photo with your face large and bright.",
  unclear: "We couldn't make out the photo. Please try a bright, clear photo of just you.",
  blocked: "We couldn't make a picture from this photo. Please try another photo.",
  checkFailed: "We couldn't check the photo just now. Please try again in a moment.",
  drawFailed: "We couldn't draw the picture. This try doesn't count toward today's limit. Please try again in a moment.",
  notReady: "Character making isn't ready yet.",
  notGuest: 'Only guests on the guest list can make characters.',
  queued: 'Waiting for your turn to be drawn.',
  drawing: 'Drawing your character.',
  workerResting: "The drawing helper is taking a break, so it's a little slow. You can close this screen; when it's done, it will appear in “My character”.",
};

/** 고른 말의 안내 묶음(MESSAGES 또는 MESSAGES_EN) */
export function messagesIn(lang: Lang = 'ko'): Said {
  return lang === 'en' ? MESSAGES_EN : MESSAGES;
}

/**
 * 받은 한국어 안내(서버·DB가 준 MESSAGES의 글, 3D 셈 안내)의 영어. 숫자가 든 글은 그 글의 숫자로 다시 만들어 맞춰 본다
 * (글을 바꿔도 이 표가 어긋나지 않는다). 모르는 글이면 빈 글
 */
export function messageEn(text: string): string {
  if (typeof text !== 'string' || !text) return '';
  const nums: (number | null)[] = [null, ...new Set((text.match(/\d+/g) ?? []).map(Number))];
  for (const key of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
    const ko = MESSAGES[key];
    if (typeof ko === 'string') {
      if (ko === text) return MESSAGES_EN[key] as string;
      continue;
    }
    const en = MESSAGES_EN[key] as (n?: number | null) => string;
    for (const n of nums) if (ko(n) === text) return en(n);
  }
  for (const kind of FAIL_NOTES) for (const n of nums) if (failNote(kind, n) === text) return failNote(kind, n, 'en');
  return '';
}

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

/** 걷기용 방향 그림 묶음의 크기: l(큰 것), s(작은 것, 손가락으로 쓰는 기기) */
export const VIEW_SIZES = ['l', 's'] as const;
export type ViewSize = (typeof VIEW_SIZES)[number];
/** 방향 그림 묶음(다섯 방향을 한 줄에 담은 그림)의 저장소 경로. DB의 avatar_views_path()와 같은 모양이어야 한다 */
export function viewsPath(uid: string, id: string, size: ViewSize): string {
  return `${uid}/views/${id}.v1${size}.webp`;
}
/** 걷기용 3D 모형(GLB 한 파일)의 저장소 경로. DB의 avatar_model_path()와 같은 모양이어야 한다(0016_avatar_models.sql) */
export function modelPath(uid: string, id: string): string {
  return `${uid}/models/${id}.v1.glb`;
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

/**
 * kept: 지금 보관 중인 캐릭터 수(0019·0020의 DB만 준다. 셋이면 slots_full). 없으면 칸은 보지 않는다(DB가 마지막에 한 번 더 막는다).
 * cap·attemptCap: 이 사람의 역할의 하루 장수·시도 수(0020부터 온다). null은 제한 없음, 없으면 옛 숫자(PER_USER_DAILY·ATTEMPTS_DAILY).
 * totalExempt: 모두의 하루 상한을 보지 않는다(0020의 관리자).
 * history·keeps·models와 그 한도(0021부터 온다): 지우지 않은 그림 수(이력), ★ 보관 수, 센 3D 요청 수. 한도 null은 제한 없음.
 * modelTries·modelDay와 그 한도(0021): 돈이 든 3D 시도의 누적(진행 중 요청 포함), 오늘 모두의 3D 요청 수
 * (modelDayCap null = 이 사람의 역할은 모두의 상한 밖).
 * slots(0021): 이 사람의 역할의 작업대 칸 수(1~SLOTS_MAX). 없으면 SLOTS(benchSize).
 * history가 있으면 0021의 DB다: 그때는 kept를 보지 않는다(작업대가 다 차도 DB가 한 칸을 비워 준다).
 */
export type QuotaState = {
  used: number;
  attempts: number;
  total: number;
  slots?: number;
  kept?: number;
  cap?: number | null;
  attemptCap?: number | null;
  totalExempt?: boolean;
  history?: number;
  historyCap?: number | null;
  keeps?: number;
  keepCap?: number | null;
  models?: number;
  modelCap?: number | null;
  modelTries?: number;
  modelTriesCap?: number | null;
  modelDay?: number;
  modelDayCap?: number | null;
};
/**
 * left: 오늘 더 만들 수 있는 장수(내 하루 장수로만 센다). 제한 없는 역할이면 null.
 * 이력(history_full)이나 칸(slots_full, 0021 전)이 다 찬 것만으로는 오늘 장수가 줄지 않으므로 그때도 left를 싣는다
 * (지우거나 비우면 바로 만든다).
 */
export type QuotaDecision =
  | { ok: true; left: number | null }
  | { ok: false; reason: 'slots_full' | 'history_full'; message: string; left: number | null }
  | { ok: false; reason: 'user_limit' | 'attempt_limit' | 'total_limit'; message: string };

/** 이 사람의 하루 한도(null = 제한 없음). DB가 주지 않은 칸(옛 DB)은 예전 숫자로, 모양이 이상한 값은 0(모르면 막는다) */
export function dailyLimits(q: QuotaState): { cap: number | null; attemptCap: number | null; totalExempt: boolean } {
  return {
    cap: q.cap === undefined ? PER_USER_DAILY : toLimit(q.cap),
    attemptCap: q.attemptCap === undefined ? ATTEMPTS_DAILY : toLimit(q.attemptCap),
    totalExempt: q.totalExempt === true,
  };
}

/**
 * 확인 순서는 DB의 avatar_begin과 같다: 내 장수 → 내 시도 → 모두의 상한 → 이력(0021, 0021 전의 DB는 칸).
 * 하루 규칙을 먼저 본다: 오늘 더 만들 수 없는 사람에게 이력에서 지우거나 칸을 비우라고 하지 않는다.
 * 제한 없는 역할은 그 확인을 건너뛰고, 모두의 상한 밖인 역할(totalExempt)은 상한을 보지 않는다.
 * 작업대 칸 수는 판정에 들지 않는다(0021은 다 차도 DB가 한 칸을 비워 준다. 0021 전의 DB는 누구나 칸 셋).
 */
export function decideQuota(q: QuotaState, totalCap: number): QuotaDecision {
  const used = toCount(q.used);
  const attempts = toCount(q.attempts);
  const total = toCount(q.total);
  const { cap, attemptCap, totalExempt } = dailyLimits(q);
  if (cap !== null && used >= cap) return { ok: false, reason: 'user_limit', message: MESSAGES.userLimit(cap) };
  if (attemptCap !== null && attempts >= attemptCap) return { ok: false, reason: 'attempt_limit', message: MESSAGES.attemptLimit };
  if (!totalExempt && total >= Math.max(0, totalCap)) return { ok: false, reason: 'total_limit', message: MESSAGES.totalLimit };
  const left = cap === null ? null : cap - used;
  if (q.history !== undefined) {
    const historyCap = q.historyCap === undefined ? 0 : q.historyCap;
    if (historyCap !== null && toCount(q.history) >= historyCap) {
      return { ok: false, reason: 'history_full', message: MESSAGES.historyFull(historyCap), left };
    }
    return { ok: true, left };
  }
  if (q.kept !== undefined && toCount(q.kept) >= SLOTS) return { ok: false, reason: 'slots_full', message: MESSAGES.slotsFull, left };
  return { ok: true, left };
}

/**
 * 「내 캐릭터」 화면의 장수 줄. 내 하루 장수만 말한다: 지금 만들 수 있거나, 막힌 까닭이 내 장수·이력·칸이면
 * 「오늘 N장 중 M장 남았어요」(제한 없는 역할은 「하루 장수 제한 없이」). 모두의 상한이나 시도 수로 막혔으면 null(줄을 숨긴다):
 * 하나도 안 만든 사람에게 「0장 남았어요」라고 하지 않고, 까닭은 만들기 카드가 알린다.
 */
export function dailyLine(q: QuotaState, d: QuotaDecision, lang: Lang = 'ko'): string | null {
  if (!d.ok && d.reason !== 'slots_full' && d.reason !== 'history_full' && d.reason !== 'user_limit') return null;
  const { cap } = dailyLimits(q);
  const left = cap === null ? 0 : Math.max(0, cap - toCount(q.used));
  if (lang === 'en') return cap === null ? 'You can make pictures with no daily limit.' : `Today: ${left} of ${cap} ${many(cap, 'picture', 'pictures')} left.`;
  if (cap === null) return '하루 장수 제한 없이 만들 수 있어요.';
  return `오늘 ${cap}장 중 ${Math.max(0, cap - toCount(q.used))}장 남았어요.`;
}

/**
 * 머리줄의 오늘 장수 조각(「오늘 N장 더」, 제한이 없으면 「하루 장수 제한 없음」). quota는 decideQuota의 결과
 * (/api/avatar/slots의 quota). 이력이나 칸이 다 차서 막혔을 때도 오늘 장수는 그대로라 「지우면 오늘 N장 더」로 보인다.
 * 그 밖의 까닭(내 장수·시도·모두의 상한)으로 막혔으면 null: 까닭은 안내 줄이 따로 알린다.
 */
export function dailyPart(quota: { ok: boolean; reason?: string; left?: number | null } | null | undefined, lang: Lang = 'ko'): string | null {
  if (!quota || (!quota.ok && quota.reason !== 'slots_full' && quota.reason !== 'history_full')) return null;
  const en = lang === 'en';
  if (quota.left === null) return en ? 'No daily limit' : '하루 장수 제한 없음';
  if (typeof quota.left !== 'number') return null;
  if (en) {
    if (quota.ok) return `${quota.left} more today`;
    return quota.reason === 'history_full' ? `Delete from history for ${quota.left} more today` : `Empty a slot for ${quota.left} more today`;
  }
  if (quota.ok) return `오늘 ${quota.left}장 더`;
  return quota.reason === 'history_full' ? `이력에서 지우면 오늘 ${quota.left}장 더` : `칸을 비우면 오늘 ${quota.left}장 더`;
}

/** 수와 한도(cap null = 제한 없음) */
export type Counted = { n: number; cap: number | null };
/**
 * 이력·★ 보관·3D 요청의 수와 한도(0021). tries: 돈이 든 3D 시도(진행 중 요청 포함), day: 오늘 모두의 3D 요청
 * (cap null = 이 사람은 모두의 상한 밖). tries·day가 없는 답(옛 화면이 받은 답)은 그 둘을 보지 않는다(DB가 한 번 더 막는다)
 */
export type CharacterCounts = { history: Counted; keeps: Counted; models: Counted; tries?: Counted; day?: Counted };

/** 장수 응답에서 이력·보관·3D의 수와 한도. 0021 전의 DB면 null(화면은 이력·★·3D를 숨긴다) */
export function countsOf(q: QuotaState): CharacterCounts | null {
  if (q.history === undefined) return null;
  const of = (n: number | undefined, cap: number | null | undefined): Counted => ({
    n: toCount(n ?? 0),
    cap: cap === undefined ? 0 : cap,
  });
  return {
    history: of(q.history, q.historyCap),
    keeps: of(q.keeps, q.keepCap),
    models: of(q.models, q.modelCap),
    tries: of(q.modelTries, q.modelTriesCap),
    day: of(q.modelDay, q.modelDayCap),
  };
}

/**
 * 3D를 더 요청할 수 있는가. left: 남은 수(null = 제한 없음), why: 0이면 그 까닭.
 * off 쉬는 중(사이트의 AVATAR_MODELS=0), used 한 사람 몫을 다 씀(만들었거나 만드는 중), tried 돈이 든 시도를 다 씀
 * (못 만들어 다시 해 보기까지), today 오늘 모두의 3D 요청이 다 참. 0021 전의 DB면 {left: 0, why: null}
 */
export type ModelRoom = { left: number | null; why: 'off' | 'used' | 'tried' | 'today' | null };

/** on: 사이트가 3D 요청을 받는가. 남은 수는 요청 몫과 시도 몫 가운데 작은 것(둘 다 제한이 없으면 null) */
export function modelRoom(c: CharacterCounts | null, on = true): ModelRoom {
  if (!c) return { left: 0, why: null };
  if (!on) return { left: 0, why: 'off' };
  const room = (x?: Counted) => (!x || x.cap === null ? null : Math.max(0, x.cap - x.n));
  const models = room(c.models);
  const tries = room(c.tries);
  if (models === 0) return { left: 0, why: 'used' };
  if (tries === 0) return { left: 0, why: 'tried' };
  if (c.day && c.day.cap !== null && c.day.n >= c.day.cap) return { left: 0, why: 'today' };
  return { left: models === null ? tries : tries === null ? models : Math.min(models, tries), why: null };
}

/** 3D를 더 요청할 수 있는 수(null = 제한 없음). 0021 전의 DB, 쉬는 중, 다 씀, 오늘 상한이면 0 */
export function modelsLeft(c: CharacterCounts | null, on = true): number | null {
  return modelRoom(c, on).left;
}

/** 머리줄의 3D 조각: 「3D 1번 남음」, 「3D 쉬는 중」, 「3D 다 씀(한 사람 한 번)」, 「오늘 3D는 다 찼어요」, 「3D 제한 없음」 */
export function modelPart(c: CharacterCounts, on = true, lang: Lang = 'ko'): string {
  const room = modelRoom(c, on);
  if (lang === 'en') {
    switch (room.why) {
      case 'off':
        return '3D paused';
      case 'used':
        return c.models.cap === 1 ? '3D used (one per person)' : `3D used (${c.models.cap} per person)`;
      case 'tried':
        return '3D used (retries too)';
      case 'today':
        return '3D is full today';
      default:
        return room.left === null ? '3D: no limit' : `3D: ${room.left} left`;
    }
  }
  switch (room.why) {
    case 'off':
      return '3D 쉬는 중';
    case 'used':
      return c.models.cap === 1 ? '3D 다 씀(한 사람 한 번)' : `3D 다 씀(한 사람 ${c.models.cap}번)`;
    case 'tried':
      return '3D 다 씀(다시 해 보기까지)';
    case 'today':
      return '오늘 3D는 다 찼어요';
    default:
      return room.left === null ? '3D 제한 없음' : `3D ${room.left}번 남음`;
  }
}

/**
 * 머리줄의 이력·★·3D 조각: 「이력 4/10」「★ 1/3」「3D 1번 남음」. 제한이 없으면 그렇다고. 0021 전이면 빈 목록.
 * ★은 늘 별과 함께 쓴다(원본 사진 「보관」과 헷갈리지 않게). on: 사이트가 3D 요청을 받는가
 */
export function countParts(c: CharacterCounts | null, on = true, lang: Lang = 'ko'): string[] {
  if (!c) return [];
  if (lang === 'en') {
    return [
      c.history.cap === null ? `History ${c.history.n} (no limit)` : `History ${c.history.n}/${c.history.cap}`,
      c.keeps.cap === null ? `★ ${c.keeps.n} (no limit)` : `★ ${c.keeps.n}/${c.keeps.cap}`,
      modelPart(c, on, 'en'),
    ];
  }
  return [
    c.history.cap === null ? `이력 ${c.history.n}개(제한 없음)` : `이력 ${c.history.n}/${c.history.cap}`,
    c.keeps.cap === null ? `★ ${c.keeps.n}개(제한 없음)` : `★ ${c.keeps.n}/${c.keeps.cap}`,
    modelPart(c, on),
  ];
}

/** 머리줄 한 줄: 오늘 장수 조각과 이력·★·3D 조각을 「 · 」로 잇는다 */
export function headLine(quota: Parameters<typeof dailyPart>[0], counts: CharacterCounts | null, on = true, lang: Lang = 'ko'): string {
  return [dailyPart(quota, lang), ...countParts(counts, on, lang)].filter((s): s is string => Boolean(s)).join(' · ');
}

export function readQuota(raw: unknown): QuotaState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const q: QuotaState = { used: toCount(o.used), attempts: toCount(o.attempts), total: toCount(o.total) };
  // 0019를 올리기 전의 DB는 kept를 주지 않는다: 그때는 칸을 묻지 않는다(만들기는 그대로). 0021의 DB도 주지 않는다
  if (o.kept !== undefined && o.kept !== null) q.kept = toCount(o.kept);
  // 0020을 올리기 전의 DB는 역할 한도를 주지 않는다: 그때는 싣지 않아 예전 숫자로 본다. null(제한 없음)은 그대로 싣는다
  if (o.cap !== undefined) q.cap = toLimit(o.cap);
  if (o.attempt_cap !== undefined) q.attemptCap = toLimit(o.attempt_cap);
  if (o.total_exempt !== undefined) q.totalExempt = o.total_exempt === true;
  // 0021: 작업대 칸 수(역할마다)와 이력·보관·3D. 수가 오면 한도도 함께 싣는다(한도 칸이 빠졌으면 0: 모르면 막는다).
  // 칸 수만은 빠지거나 이상하면 SLOTS다(칸 수는 돈·비용 한도가 아니라 화면의 칸이다. DB의 avatar_bench_max와 같은 읽기)
  if (o.history !== undefined && o.history !== null) {
    q.slots = toBench(o.slots);
    q.history = toCount(o.history);
    q.historyCap = o.history_cap === undefined ? 0 : toLimit(o.history_cap);
    q.keeps = toCount(o.keeps ?? 0);
    q.keepCap = o.keep_cap === undefined ? 0 : toLimit(o.keep_cap);
    q.models = toCount(o.models ?? 0);
    q.modelCap = o.model_cap === undefined ? 0 : toLimit(o.model_cap);
    q.modelTries = toCount(o.model_tries ?? 0);
    q.modelTriesCap = o.model_tries_cap === undefined ? 0 : toLimit(o.model_tries_cap);
    q.modelDay = toCount(o.model_day ?? 0);
    q.modelDayCap = o.model_day_cap === undefined ? 0 : toLimit(o.model_day_cap);
  }
  return q;
}

/** 작업대 칸 수 값: 1~SLOTS_MAX로 묶는다. 숫자가 아니면(빠짐·null 포함) SLOTS. DB의 avatar_bench_max와 같다 */
function toBench(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(SLOTS_MAX, Math.max(1, Math.floor(n))) : SLOTS;
}

/**
 * 이 사람의 작업대 칸 수(손님 3, 가족·관리자 9). 0021의 DB가 세션의 역할로 정해 장수 응답(slots)에 싣는다.
 * 그 전의 DB나 값이 없으면 SLOTS. 화면은 이 수만큼 칸을 그린다(DB가 칸 번호를 1~이 수로만 준다)
 */
export function benchSize(q: Pick<QuotaState, 'slots'> | null | undefined): number {
  return q && q.slots !== undefined ? toBench(q.slots) : SLOTS;
}

/** 1부터 n까지(바꿀 칸 단추처럼 칸 번호를 늘어놓을 때) */
export function slotNumbers(n: number): number[] {
  return Array.from({ length: toBench(n) }, (_, i) => i + 1);
}

/** 한도 값: null은 제한 없음. 숫자가 아니거나 음수면 0으로 본다(모르면 막는다) */
function toLimit(v: unknown): number | null {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
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

/** 안내 글의 「(10개)」. 모르거나 0이면 빈 글 */
function countIn(n?: number | null): string {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? `(${Math.floor(n)}개)` : '';
}
/** countIn의 영어 「 (10)」 */
function countInEn(n?: number | null): string {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? ` (${Math.floor(n)})` : '';
}

// ───────── 캐릭터 칸

/** 칸을 차지하는 상태(DB 0019의 보관 중과 같다) */
export const KEPT_STATUSES = ['pending', 'queued', 'drawing', 'ready'] as const;
/** 칸 하나: 다 그린 캐릭터(ready) 또는 그리는 중(queued: 차례를 기다림, drawing: 그리는 중) */
export type SlotItem = { id: string; status: 'ready' | 'queued' | 'drawing'; since: string };
export type SlotLayout = { cells: (SlotItem | null)[]; extra: SlotItem[] };

/**
 * 내 보관 중 줄을 칸 세 개로 놓는다. 칸 번호(slot, 0019)가 있으면 그 칸에, 없으면(0019 전, 넷 이상 모아 둔 사람의 넷째부터)
 * 빈 칸을 만든 차례대로 채우고, 그래도 남으면 extra(칸 뒤에 덧붙여 보인다). 보관 중이 아닌 줄과 모양이 이상한 줄은 뺀다.
 */
export function arrangeSlots(rows: unknown): SlotLayout {
  const list = (Array.isArray(rows) ? rows : [])
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}))
    .filter((r) => isUuid(r.id) && (KEPT_STATUSES as readonly unknown[]).includes(r.status))
    .map((r) => {
      const at = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
      const slot = typeof r.slot === 'number' && Number.isInteger(r.slot) && r.slot >= 1 && r.slot <= SLOTS ? r.slot : null;
      const item: SlotItem = {
        id: r.id as string,
        status: r.status === 'ready' ? 'ready' : r.status === 'drawing' ? 'drawing' : 'queued',
        since: Number.isFinite(at) ? new Date(at).toISOString() : new Date(0).toISOString(),
      };
      return { item, slot, at: Number.isFinite(at) ? at : 0 };
    })
    .sort((a, b) => a.at - b.at || a.item.id.localeCompare(b.item.id));
  const cells: (SlotItem | null)[] = Array.from({ length: SLOTS }, () => null);
  const rest: SlotItem[] = [];
  for (const r of list) {
    if (r.slot !== null && cells[r.slot - 1] === null) cells[r.slot - 1] = r.item;
    else rest.push(r.item);
  }
  const extra: SlotItem[] = [];
  for (const item of rest) {
    const free = cells.indexOf(null);
    if (free >= 0) cells[free] = item;
    else extra.push(item);
  }
  return { cells, extra };
}

// ───────── 이력·작업대·보관(★)·3D(0021)

/**
 * 그림 하나의 3D 상태. none: 없음(요청할 수 있으면 「3D 만들기」), waiting: 요청해서 차례를 기다림,
 * making: 만드는 중, ready: 다 만듦, failed: 요청했는데 못 만듦(한도에서 빠졌으니 다시 요청할 수 있다)
 */
export type ModelState = 'none' | 'waiting' | 'making' | 'ready' | 'failed';
/**
 * 이력의 그림 하나: 칸 번호(slot, 작업대가 아니면 null), ★ 보관(kept), 3D 상태(model).
 * 3D가 실패(failed)했을 때만 참일 수 있는 것: blocked 다시 해도 같은 실패(이 그림으로는 다시 요청하지 않는다),
 * reconsent 3D 만드는 곳이 바뀌어 보내지 않고 돌려준 요청(새 확인 글로 다시 묻는다)
 */
export type CharItem = SlotItem & { slot: number | null; kept: boolean; model: ModelState; blocked: boolean; reconsent: boolean };
/** 이력·작업대를 읽을 때 고르는 칸(0021). 화면은 내 줄만 읽는다(RLS) */
export const CHAR_COLUMNS = 'id, status, slot, created_at, kept_at, model_requested_at, model_status, model_reason';

/** 3D를 만드는 곳(사이트 환경 변수 AVATAR_MODEL_PROVIDER. consent.ts의 ModelProvider와 같다) */
export type ModelVia = 'meshy' | 'trellis';
/**
 * 다시 해도 같은 실패의 까닭. DB의 avatar_model_blocked(0021)와 같다(시험이 두 목록을 맞춰 본다).
 * any: 그 그림 탓(어디로 보내든), meshy·trellis: 그곳이 받지 않은 그림(다른 곳은 받을 수 있다)
 */
export const MODEL_BLOCKED = {
  any: ['bad_char', 'bad_job'],
  meshy: ['blocked', 'meshy_input', 'meshy_rejected'],
  trellis: ['bad_input'],
} as const;
/** 이 까닭으로 실패한 그림을 via(지금 3D를 만드는 곳)로 다시 요청하면 막히는가 */
export function modelBlocked(reason: unknown, via: ModelVia): boolean {
  if (typeof reason !== 'string') return false;
  return (MODEL_BLOCKED.any as readonly string[]).includes(reason) || (MODEL_BLOCKED[via] as readonly string[]).includes(reason);
}

/** 줄의 모형 칸과 요청으로 3D 상태를 정한다. 요청하지 않은 그림의 실패(0016에서 저절로 만들다 실패)는 none: 요청할 수 있다 */
export function modelStateOf(r: { model_status?: unknown; model_requested_at?: unknown }): ModelState {
  const requested = typeof r.model_requested_at === 'string' && r.model_requested_at !== '';
  switch (r.model_status) {
    case 'ready':
      return 'ready';
    case 'drawing':
      return 'making';
    case 'failed':
      return requested ? 'failed' : 'none';
    default:
      return requested ? 'waiting' : 'none';
  }
}

/**
 * 이력 줄을 읽는다: 지우지 않은 그림만, 최근부터. 모양이 이상한 줄은 뺀다.
 * via: 지금 3D를 만드는 곳(다시 해도 같은 실패인지 가린다. DB의 3D 요청도 같은 곳으로 본다)
 * size: 이 사람의 작업대 칸 수(benchSize). 칸 번호가 그 밖이면(역할이 줄어 남은 칸) 작업대가 아니라 이력에 있는 것으로 읽는다
 */
export function readCharacters(rows: unknown, via: ModelVia = 'meshy', size: number = SLOTS): CharItem[] {
  const max = toBench(size);
  return (Array.isArray(rows) ? rows : [])
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}))
    .filter((r) => isUuid(r.id) && (KEPT_STATUSES as readonly unknown[]).includes(r.status))
    .map((r) => {
      const at = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
      const slot = typeof r.slot === 'number' && Number.isInteger(r.slot) && r.slot >= 1 && r.slot <= max ? r.slot : null;
      const status: SlotItem['status'] = r.status === 'ready' ? 'ready' : r.status === 'drawing' ? 'drawing' : 'queued';
      const model = status === 'ready' ? modelStateOf(r) : 'none';
      const item: CharItem = {
        id: r.id as string,
        status,
        since: Number.isFinite(at) ? new Date(at).toISOString() : new Date(0).toISOString(),
        slot,
        kept: status === 'ready' && typeof r.kept_at === 'string' && r.kept_at !== '',
        model,
        blocked: model === 'failed' && modelBlocked(r.model_reason, via),
        reconsent: model === 'failed' && r.model_reason === 'reconsent',
      };
      return { item, at: Number.isFinite(at) ? at : 0 };
    })
    .sort((a, b) => b.at - a.at || b.item.id.localeCompare(a.item.id))
    .map((r) => r.item);
}

/**
 * 작업대 칸: 칸 번호(1~size)대로 놓는다. size는 이 사람의 작업대 칸 수(benchSize: 손님 3, 가족·관리자 9).
 * 칸 번호가 없거나 size 밖인 그림은 이력에만 있다(0021). 같은 번호가 둘이면 앞의 것
 */
export function benchCells(items: CharItem[], size: number = SLOTS): (CharItem | null)[] {
  const max = toBench(size);
  const cells: (CharItem | null)[] = Array.from({ length: max }, () => null);
  for (const item of items) {
    if (item.slot !== null && item.slot >= 1 && item.slot <= max && cells[item.slot - 1] === null) cells[item.slot - 1] = item;
  }
  return cells;
}

/**
 * 이 그림으로 지금 3D를 요청할 수 있는가: 다 그렸고, ★ 보관했고, 3D가 없거나 다시 해 볼 수 있는 실패이고, 3D가 남았다
 * (left는 modelsLeft: 쉬는 중·다 씀·오늘 상한이면 0)
 */
export function canRequestModel(item: CharItem, left: number | null): boolean {
  return item.status === 'ready' && item.kept && !item.blocked && (item.model === 'none' || item.model === 'failed')
    && (left === null || left > 0);
}

/**
 * 그림 지우기 확인에 붙이는 3D 한 줄. cap: 이 사람의 3D 한도(null = 제한 없음이면 붙이지 않는다).
 * 다 만든 3D와 만드는 중인 3D는 그림을 지우면 함께 없어지고 셈에는 남는다(0021의 지우기 트리거): 한 번뿐인 3D를 잃는다.
 * 차례를 기다리는 요청은 함께 없어진다(돈이 들기 전이면 셈에서도 돌려준다)
 */
export function deleteWarning(model: ModelState, cap: number | null, lang: Lang = 'ko'): string | null {
  if (cap === null) return null;
  if (lang === 'en') {
    const per = cap === 1 ? 'one per person' : `${cap} per person`;
    if (model === 'ready') return `The 3D model will be deleted too, and you can't make 3D again (${per}).`;
    if (model === 'making') return `3D is being made. Deleting removes the 3D too, and you can't make it again (${per}).`;
    if (model === 'waiting') return 'This picture is waiting for its 3D turn. Deleting it also cancels the 3D request.';
    return null;
  }
  const once = cap === 1 ? '한 사람 한 번' : `한 사람 ${cap}번`;
  if (model === 'ready') return `3D 모형도 함께 지워지고, 3D는 다시 만들 수 없어요(${once}).`;
  if (model === 'making') return `3D를 만드는 중이에요. 지우면 3D도 없어지고, 다시 만들 수 없어요(${once}).`;
  if (model === 'waiting') return '3D 차례를 기다리는 그림이에요. 지우면 3D 요청도 함께 없어져요.';
  return null;
}

/** /api/avatar/slots의 quota(decideQuota 그대로) */
export type SlotsQuota =
  | { ok: true; left: number | null }
  | { ok: false; reason: string; message: string; left?: number | null };
/**
 * /api/avatar/slots의 답을 화면이 읽은 모양. history·counts가 null이면 0021 전의 DB(이력·★·3D를 숨긴다).
 * cells의 길이가 이 사람의 작업대 칸 수다(답의 max. 손님 3, 가족·관리자 9)
 */
export type SlotsReply = {
  cells: (CharItem | null)[];
  extra: CharItem[];
  history: CharItem[] | null;
  more: boolean;
  counts: CharacterCounts | null;
  quota: SlotsQuota;
  provider: ModelVia;
  modelsOn: boolean;
  /** Meshy에 학습 제외를 요청해 두었는가(서버의 MESHY_TRAINING_OPTOUT. 동의 글과 3D 확인 글이 따른다) */
  trainingOptOut: boolean;
};

const MODEL_STATES: readonly ModelState[] = ['none', 'waiting', 'making', 'ready', 'failed'];

/** 답의 그림 하나(서버가 readCharacters로 고른 것. 0021 전의 답에는 slot·kept·model이 없다). size: 작업대 칸 수 */
function replyItem(v: unknown, slot: number | null, size: number): CharItem | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (!isUuid(s.id) || (s.status !== 'ready' && s.status !== 'queued' && s.status !== 'drawing')) return null;
  const at = typeof s.slot === 'number' && Number.isInteger(s.slot) && s.slot >= 1 && s.slot <= size ? s.slot : slot;
  const model = (MODEL_STATES as readonly unknown[]).includes(s.model) ? (s.model as ModelState) : 'none';
  return {
    id: s.id,
    status: s.status,
    since: typeof s.since === 'string' ? s.since : '',
    slot: at,
    kept: s.kept === true && s.status === 'ready',
    model,
    blocked: s.blocked === true && model === 'failed',
    reconsent: s.reconsent === true && model === 'failed',
  };
}

function replyCounted(v: unknown): Counted | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (typeof c.n !== 'number' || !Number.isFinite(c.n) || c.n < 0) return null;
  if (c.cap !== null && (typeof c.cap !== 'number' || !Number.isFinite(c.cap) || c.cap < 0)) return null;
  return { n: Math.floor(c.n), cap: c.cap === null ? null : Math.floor(c.cap as number) };
}

/** 걷기 화면이 /api/avatar/slots의 답을 읽는다. 모양이 이상하면 null(화면은 「못 읽음」으로 둔다) */
export function readSlotsReply(raw: unknown): SlotsReply | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.cells) || !o.quota || typeof o.quota !== 'object') return null;
  const q = o.quota as Record<string, unknown>;
  // left: null(제한 없음)은 0으로 바꾸지 않는다
  const left = typeof q.left === 'number' ? q.left : q.left === null ? null : undefined;
  const message = typeof q.message === 'string' ? q.message : '지금은 새로 만들 수 없어요.';
  const c = o.counts && typeof o.counts === 'object' ? (o.counts as Record<string, unknown>) : null;
  const history = c ? replyCounted(c.history) : null;
  const keeps = c ? replyCounted(c.keeps) : null;
  const models = c ? replyCounted(c.models) : null;
  // 시도·하루 수는 0021의 새 답에만 있다. 없으면 싣지 않는다(그 둘은 보지 않고, DB가 한 번 더 막는다)
  const tries = c ? replyCounted(c.tries) : null;
  const day = c ? replyCounted(c.day) : null;
  // 작업대 칸 수: 답의 max(손님 3, 가족·관리자 9). 없는 옛 답은 SLOTS
  const size = o.max === undefined ? SLOTS : toBench(o.max);
  return {
    cells: Array.from({ length: size }, (_, i) => replyItem((o.cells as unknown[])[i], i + 1, size)),
    extra: Array.isArray(o.extra) ? o.extra.map((v) => replyItem(v, null, size)).filter((s): s is CharItem => s !== null) : [],
    history: Array.isArray(o.history) ? o.history.map((v) => replyItem(v, null, size)).filter((s): s is CharItem => s !== null) : null,
    more: o.more === true,
    counts: history && keeps && models ? { history, keeps, models, ...(tries ? { tries } : {}), ...(day ? { day } : {}) } : null,
    quota: q.ok === true
      ? { ok: true, left: left === undefined ? 0 : left }
      : { ok: false, reason: String(q.reason ?? ''), message, ...(left === undefined ? {} : { left }) },
    provider: o.provider === 'trellis' ? 'trellis' : 'meshy',
    modelsOn: o.models_on !== false,
    trainingOptOut: o.training_optout === true,
  };
}

/**
 * 3D 상태를 짧게(배지). none은 빈 글. 실패는 까닭에 따라: blocked 이 그림으로는 다시 못 함, reconsent 만드는 곳이 바뀌어
 * 다시 물음, retry 다시 해 볼 수 있음(한 번 더 해 보기 몫이 남았다)
 */
export function modelBadge(state: ModelState, o: { blocked?: boolean; reconsent?: boolean; retry?: boolean } = {}, lang: Lang = 'ko'): string {
  if (lang === 'en') {
    switch (state) {
      case 'waiting':
        return 'Waiting for 3D';
      case 'making':
        return 'Making 3D';
      case 'ready':
        return '3D';
      case 'failed':
        if (o.blocked) return "Can't make 3D from this";
        if (o.reconsent) return '3D maker changed. Press again';
        return o.retry ? '3D failed. You can try again' : "Couldn't make 3D";
      default:
        return '';
    }
  }
  switch (state) {
    case 'waiting':
      return '3D 차례 기다리는 중';
    case 'making':
      return '3D 만드는 중';
    case 'ready':
      return '3D';
    case 'failed':
      if (o.blocked) return '이 그림은 3D로 만들 수 없어요';
      if (o.reconsent) return '3D 만드는 곳이 바뀌었어요. 다시 눌러 주세요';
      return o.retry ? '3D를 못 만들었어요. 다시 해 볼 수 있어요' : '3D를 만들지 못했어요';
    default:
      return '';
  }
}

/** 그림 하나의 3D 배지(위 modelBadge를 그 그림의 까닭과 지금 다시 요청할 수 있는지로) */
export function itemBadge(item: CharItem, left: number | null, lang: Lang = 'ko'): string {
  return modelBadge(item.model, { blocked: item.blocked, reconsent: item.reconsent, retry: canRequestModel(item, left) }, lang);
}

// ───────── 2D를 다 그린 뒤의 확인 카드와 3D 진행(실제 셈대로)

/**
 * 지금 3D를 하나 맡기면: left 남은 3D 수(modelRoom. null = 제한 없음), again 이번 3D를 바깥 서비스가 만들다 못 만들어
 * 돈이 든 시도로 세더라도 그 뒤에 더 해 볼 수 있는 수(null = 제한 없음, undefined = 모름: 시도 수가 없는 옛 답).
 * 실패한 요청은 3D 몫(model_max)에서 빠지므로 다시 해 보기를 막는 것은 돈이 든 시도(model_tries_max)뿐이다.
 * 맡길 수 없으면(남은 3D 0: 다 씀·다 해 봄·오늘 상한·쉬는 중·0021 전) null
 */
export type ModelChance = { left: number | null; again: number | null | undefined };
export function modelChance(c: CharacterCounts | null, on = true): ModelChance | null {
  const room = modelRoom(c, on);
  if (!c || room.left === 0) return null;
  const tries = c.tries;
  return { left: room.left, again: !tries ? undefined : tries.cap === null ? null : Math.max(0, tries.cap - tries.n - 1) };
}

/** 확인 카드와 3D 확인의 한 줄: 「3D 1번 남음 · 못 만들면 한 번 더 해 볼 수 있어요」, 제한이 없으면 「3D 제한 없음」 */
export function modelChanceLine(ch: ModelChance, lang: Lang = 'ko'): string {
  if (lang === 'en') {
    if (ch.left === null) return '3D: no limit';
    const headEn = `3D: ${ch.left} left`;
    if (ch.again === undefined) return headEn;
    if (ch.again === null) return `${headEn} · If it fails, you can try again`;
    if (ch.again === 0) return `${headEn} · This is your last try (no retry if it fails)`;
    return `${headEn} · If it fails, you can try ${ch.again === 1 ? 'once' : `${ch.again} times`} more`;
  }
  // 남은 수가 제한 없음이면 요청 몫도 시도 몫도 제한이 없다(modelRoom은 둘 가운데 작은 것)
  if (ch.left === null) return '3D 제한 없음';
  const head = `3D ${ch.left}번 남음`;
  if (ch.again === undefined) return head;
  if (ch.again === null) return `${head} · 못 만들면 다시 해 볼 수 있어요`;
  if (ch.again === 0) return `${head} · 이번이 마지막이에요(못 만들면 다시 못 해요)`;
  return `${head} · 못 만들면 ${ch.again === 1 ? '한 번' : `${ch.again}번`} 더 해 볼 수 있어요`;
}

/**
 * 확인 카드에서 3D를 맡길 수 없을 때 단추 대신 보이는 한 줄. busy: 한 사람 몫의 3D를 지금 다른 그림으로 기다리거나
 * 만드는 중이다(이미 만들었다고 하지 않는다). 0021 전의 DB(이력·3D가 없음)면 null(3D를 말하지 않는다)
 */
export function modelNoneLine(c: CharacterCounts | null, on = true, busy = false, lang: Lang = 'ko'): string | null {
  const M = messagesIn(lang);
  switch (modelRoom(c, on).why) {
    case 'used':
      return busy ? M.modelBusy : M.modelUsed;
    case 'tried':
      return M.modelTriesFull(c?.tries?.cap ?? null);
    case 'today':
      return M.modelDayFull;
    case 'off':
      return M.modelOff;
    default:
      return null;
  }
}

/**
 * 3D를 못 만들었을 때의 까닭과 셈 안내(한도를 돌려줬는가, 더 해 볼 수 있는가).
 * reason: 줄의 model_reason, via: 지금 3D를 만드는 곳(다시 해도 같은 실패인지 가린다), jobAt: 바깥 서비스가 작업을 만든 때
 * (model_job_at. 있으면 돈이 든 시도로 셌다), counts: 지금 장수 응답의 수(없으면 시도 수를 말하지 않는다).
 * 실패한 요청은 3D 몫에서 빠지고(0021의 model_max), 작업을 만들기 전에 멈춘 요청은 시도로도 세지 않는다
 */
export function modelFailText(
  reason: unknown, via: ModelVia, jobAt: unknown, counts: CharacterCounts | null, lang: Lang = 'ko',
): { message: string; note: string } {
  const M = messagesIn(lang);
  const message = reason === 'reconsent' ? M.modelReconsent : modelBlocked(reason, via) ? M.modelBlocked : M.modelFailed;
  const paid = typeof jobAt === 'string' && jobAt !== '';
  const tries = counts?.tries;
  let note: string;
  if (!paid) note = failNote('unpaid', null, lang);
  else if (!tries) note = failNote('returned', null, lang);
  else if (tries.cap === null) note = failNote('again', null, lang);
  else if (tries.cap - tries.n > 0) note = failNote('more', tries.cap - tries.n, lang);
  else note = M.modelTriesFull(tries.cap);
  return { message, note };
}

/** 3D를 못 만들었을 때의 셈 안내 갈래: 만들기 전에 멈춤, 몫을 돌려줌, 다시 해 볼 수 있음(제한 없음), n번 더 */
const FAIL_NOTES = ['unpaid', 'returned', 'again', 'more'] as const;
type FailNote = (typeof FAIL_NOTES)[number];
/** 셈 안내 한 줄(두 말). n: 더 해 볼 수 있는 수(more만) */
function failNote(kind: FailNote, n: number | null, lang: Lang = 'ko'): string {
  const en = lang === 'en';
  switch (kind) {
    case 'unpaid':
      return en ? "It stopped before making, so this request didn't count. We returned your 3D credit." : '만들기 전에 멈춰서 이번 요청은 세지 않았어요. 3D 몫을 돌려드렸어요.';
    case 'returned':
      return en ? 'We returned your 3D credit.' : '3D 몫을 돌려드렸어요.';
    case 'again':
      return en ? 'We returned your 3D credit. You can try again.' : '3D 몫을 돌려드렸어요. 다시 해 볼 수 있어요.';
    default: {
      const k = typeof n === 'number' && n > 0 ? n : 1;
      return en
        ? `We returned your 3D credit. You can try ${k === 1 ? 'once' : `${k} times`} more.`
        : `3D 몫을 돌려드렸어요. ${k === 1 ? '한 번' : `${k}번`} 더 해 볼 수 있어요.`;
    }
  }
}

/** 3D 요청 하나의 상태를 읽을 때 고르는 칸(내 줄만. RLS) */
export const MODEL_JOB_COLUMNS = 'id, status, model_requested_at, model_status, model_reason, model_job_at, model_not_before';
/**
 * 3D 요청 하나의 상태(GET /api/avatar/status?id=<id>&kind=model, 화면이 몇 초마다 묻는다).
 * none 요청하지 않았거나 요청이 없어졌다, waiting 차례를 기다림(later: 3D 서비스가 쉬어 그때쯤 다시 만든다),
 * making 만드는 중, ready 다 만듦, failed 못 만듦(message 까닭, note 셈 안내). since: 요청한 때
 */
export type ModelJobView = {
  status: 'none' | 'waiting' | 'making' | 'ready' | 'failed';
  since?: string;
  later?: string;
  message?: string;
  note?: string;
};

/** 내 그림 줄(MODEL_JOB_COLUMNS)을 상태로. 없거나 지운 그림, 모양이 이상한 줄은 null(404) */
export function modelJobView(row: unknown, via: ModelVia, counts: CharacterCounts | null, now: number): ModelJobView | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (!isUuid(r.id) || !(KEPT_STATUSES as readonly unknown[]).includes(r.status)) return null;
  const iso = (v: unknown) => {
    const t = typeof v === 'string' ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  };
  const since = iso(r.model_requested_at);
  const at = since ? { since } : {};
  switch (r.status === 'ready' ? modelStateOf(r) : 'none') {
    case 'ready':
      return { status: 'ready', ...at };
    case 'making':
      return { status: 'making', ...at };
    case 'waiting': {
      const later = iso(r.model_not_before);
      return { status: 'waiting', ...at, ...(later && Date.parse(later) > now ? { later } : {}) };
    }
    case 'failed':
      return { status: 'failed', ...at, ...modelFailText(r.model_reason, via, r.model_job_at, counts) };
    default:
      return { status: 'none' };
  }
}

// ───────── 사진 살피기 결과

export type VisionVerdict =
  | { ok: true }
  | { ok: false; reason: 'no_person' | 'many_people' | 'child' | 'unclear'; message: string };

/**
 * 비전 모델의 JSON 답을 판정한다. 모양이 조금이라도 이상하면 거절(모르면 막는다).
 * 통과 조건: 사람 사진이고, 정확히 한 명이고, 애매하지 않다.
 * 나이는 사진으로 판정하지 않는다(2026-11-12 집주인 결정: 올린 사람이 고른 「나예요(만 14세 이상)」, 또는 「아이예요」와
 * 보호자 동의를 믿는다. 어른 사진도 아이로 잘못 보여 막혔다). likelyUnder14는 답의 모양을 확인하는 데만 쓴다.
 * 'child' 까닭은 그 전에 거절된 줄을 읽을 때만 남아 있다
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
/** since: 사진을 보낸 때(ISO, 걸린 시간 표시용), ahead: 내 앞에 선 작업 수(기다리는 동안). 둘 다 DB가 줄 때만 */
export type JobView = { status: JobStatus; url?: string; message?: string; since?: string; ahead?: number };

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
  // 걸린 시간과 앞에 선 수: 값이 있고 모양이 맞을 때만 싣는다(다른 기기에서 보낸 사진도 보낸 때부터 센다)
  const extra: Pick<JobView, 'since' | 'ahead'> = {};
  if (typeof o.created_at === 'string' && Number.isFinite(Date.parse(o.created_at))) extra.since = new Date(Date.parse(o.created_at)).toISOString();
  if (typeof o.ahead === 'number' && Number.isInteger(o.ahead) && o.ahead >= 0) extra.ahead = o.ahead;
  switch (o.status) {
    case 'pending':
    case 'queued':
      return { status: 'queued', message: resting ? MESSAGES.workerResting : MESSAGES.queued, ...extra };
    case 'drawing':
      return { status: 'drawing', message: resting ? MESSAGES.workerResting : MESSAGES.drawing, ...extra };
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
