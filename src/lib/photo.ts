// 쪽지 사진 확인(기획서 6.5 사진 정화, 10절 7 「사진은 두 번 지운다」). 서버와 화면이 같은 숫자를 쓴다.
// 기기가 사진을 다시 그려 보기용(긴 변 1280)과 작은 그림(긴 변 320) 두 장의 JPEG로 보내면,
// 서버는 메타데이터 조각을 한 번 더 지운 뒤(src/lib/avatar/rules.ts stripPhotoMetadata) 이 파일로 다시 확인한다.
// 외부 의존성 없는 순수 함수만 둔다(node --test 로 바로 돈다).

export const PHOTO_VIEW_EDGE = 1280;
export const PHOTO_THUMB_EDGE = 320;
export const PHOTO_VIEW_QUALITY = 0.82;
export const PHOTO_THUMB_QUALITY = 0.75;
export const PHOTO_VIEW_MAX_BYTES = 1536 * 1024;
export const PHOTO_THUMB_MAX_BYTES = 200 * 1024;
/** 기기에서 고르는 원본 사진의 상한(이보다 크면 휴대폰이 다시 그리다 멈출 수 있다) */
export const PHOTO_PICK_MAX_BYTES = 30 * 1024 * 1024;

export type PhotoKind = 'view' | 'thumb';
const EDGE: Record<PhotoKind, number> = { view: PHOTO_VIEW_EDGE, thumb: PHOTO_THUMB_EDGE };
const MAX_BYTES: Record<PhotoKind, number> = { view: PHOTO_VIEW_MAX_BYTES, thumb: PHOTO_THUMB_MAX_BYTES };

/** 긴 변이 edge를 넘지 않게 줄인 크기(키우지는 않는다) */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// JPEG 조각 표식
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** 위치·기기·촬영 정보가 사는 조각: APP1(Exif, XMP), APP12, APP13(IPTC·Photoshop), COM(주석) */
const META = new Set([0xe1, 0xec, 0xed, 0xfe]);

type Walk = {
  /** 처음부터 끝(EOI)까지 조각을 따라 걸었는가 */
  complete: boolean;
  width: number;
  height: number;
  /** 메타데이터 조각이 있었는가 */
  metadata: boolean;
  /** 끝 표식(EOI) 뒤에 남은 바이트 수 */
  trailing: number;
};

// 조각을 처음부터 끝까지 따라간다. 화면 데이터(SOS 뒤)는 다음 표식까지 건너뛰고, 점진 JPEG의 다음 조각도 따라간다.
function walkJpeg(b: Uint8Array): Walk {
  const out: Walk = { complete: false, width: 0, height: 0, metadata: false, trailing: 0 };
  if (!isJpeg(b)) return out;
  const n = b.length;
  let i = 2;
  while (i + 1 < n) {
    if (b[i] !== 0xff) return out;
    const m = b[i + 1];
    if (m === 0xff) {
      i += 1; // 채움 바이트
      continue;
    }
    if (m === 0xd9) {
      out.complete = true;
      out.trailing = n - (i + 2);
      return out;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 3 >= n) return out;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > n) return out;
    if (META.has(m)) out.metadata = true;
    if (SOF.has(m) && len >= 7) {
      out.height = (b[i + 5] << 8) | b[i + 6];
      out.width = (b[i + 7] << 8) | b[i + 8];
    }
    i += 2 + len;
    if (m === 0xda) {
      // 화면 데이터: FF 00(채움)과 FF D0~D7(다시 시작)은 데이터의 일부, 그 밖의 FF xx가 다음 표식
      while (i + 1 < n) {
        if (b[i] === 0xff) {
          const next = b[i + 1];
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        i += 1;
      }
    }
  }
  return out;
}

/** JPEG 그림 크기(SOF 조각에서). 모양이 이상하거나 크기가 없으면 null */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const w = walkJpeg(bytes);
  if (!w.complete || !w.width || !w.height) return null;
  return { width: w.width, height: w.height };
}

/**
 * 메타데이터가 남아 있는가. 확인하지 못하는 파일(JPEG가 아님, 조각을 끝까지 못 따라감, 끝 표식 뒤에 덧붙은 바이트)도
 * 「남아 있다」로 본다(닫힌 쪽으로 실패).
 */
export function hasPhotoMetadata(bytes: Uint8Array): boolean {
  const w = walkJpeg(bytes);
  return !w.complete || w.metadata || w.trailing > 0;
}

export type NotePhotoCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: 'empty' | 'not_jpeg' | 'too_big' | 'too_large' | 'metadata' | 'bad_shape' };

/** 서버에 도착한(그리고 메타데이터를 한 번 지운) 사진 한 장 확인 */
export function checkNotePhoto(bytes: Uint8Array, kind: PhotoKind): NotePhotoCheck {
  if (!bytes.length) return { ok: false, reason: 'empty' };
  if (!isJpeg(bytes)) return { ok: false, reason: 'not_jpeg' };
  if (bytes.length > MAX_BYTES[kind]) return { ok: false, reason: 'too_big' };
  const size = jpegSize(bytes);
  if (!size) return { ok: false, reason: 'bad_shape' };
  if (Math.max(size.width, size.height) > EDGE[kind]) return { ok: false, reason: 'too_large' };
  if (hasPhotoMetadata(bytes)) return { ok: false, reason: 'metadata' };
  return { ok: true, ...size };
}

/** 저장소 이름: 무작위 32자리 16진. DB media.path 제약과 같은 모양 */
export const MEDIA_BASE = /^[0-9a-f]{32}$/;
export function isMediaBase(value: unknown): value is string {
  return typeof value === 'string' && MEDIA_BASE.test(value);
}
export function mediaFiles(base: string): { view: string; thumb: string } {
  return { view: `${base}.jpg`, thumb: `${base}-t.jpg` };
}
