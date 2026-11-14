// 쪽지 사진 확인: 시험 안에서 만든 작은 JPEG(가짜 Exif GPS 조각 포함)로 크기 읽기, 메타데이터 찾기,
// 서버의 「지우고 다시 확인」 순서를 본다. 그림을 실제로 풀지는 않고 조각 구조만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_THUMB_EDGE, PHOTO_VIEW_EDGE, PHOTO_VIEW_MAX_BYTES, checkNotePhoto, fitWithin, hasPhotoMetadata,
  isMediaBase, jpegSize, mediaFiles,
} from '../../src/lib/photo.ts';
import { stripPhotoMetadata } from '../../src/lib/avatar/rules.ts';

const seg = (marker: number, payload: number[]) => {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
};
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// 가짜 Exif: TIFF 머리 + IFD0에 GPS 칸(0x8825) 하나 + GPS IFD에 위도 표시 칸
function fakeExifGps(): number[] {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // MM, 42, IFD0 at 8
    0x00, 0x01, // 칸 하나
    0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, // GPSInfo → 26
    0x00, 0x00, 0x00, 0x00, // 다음 IFD 없음
    0x00, 0x01, // GPS IFD: 칸 하나
    0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x4e, 0x00, 0x00, 0x00, // GPSLatitudeRef 'N'
    0x00, 0x00, 0x00, 0x00,
  ];
  return [...ascii('Exif'), 0, 0, ...tiff, ...ascii('GPS 12.3 N 45.6 E')];
}

type Opt = { w?: number; h?: number; exif?: boolean; xmp?: boolean; comment?: boolean; iptc?: boolean; trailing?: number[] };
function buildJpeg(o: Opt = {}): Uint8Array {
  const w = o.w ?? 640;
  const h = o.h ?? 480;
  const bytes = [
    0xff, 0xd8,
    ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(o.exif ? seg(0xe1, fakeExifGps()) : []),
    ...(o.xmp ? seg(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x:xmpmeta/>')]) : []),
    ...(o.iptc ? seg(0xed, [...ascii('Photoshop 3.0'), 0, 1, 2, 3]) : []),
    ...(o.comment ? seg(0xfe, ascii('taken at home')) : []),
    ...seg(0xdb, [0, ...new Array(64).fill(1)]),
    ...seg(0xc0, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...seg(0xc4, [0, ...new Array(16).fill(0)]),
    ...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    // 화면 데이터: 채움(FF 00)과 다시 시작(FF D0)이 섞여 있다
    0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a,
    0xff, 0xd9,
    ...(o.trailing ?? []),
  ];
  return Uint8Array.from(bytes);
}

test('크기 읽기: SOF 조각에서 너비·높이', () => {
  assert.deepEqual(jpegSize(buildJpeg({ w: 1280, h: 853 })), { width: 1280, height: 853 });
  assert.deepEqual(jpegSize(buildJpeg({ w: 240, h: 320, exif: true })), { width: 240, height: 320 });
  assert.equal(jpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), null, 'JPEG가 아니면 null');
  const cut = buildJpeg().subarray(0, 40);
  assert.equal(jpegSize(cut), null, '중간에 잘린 파일');
});

test('메타데이터 찾기: Exif GPS·XMP·IPTC·주석·끝 뒤 덧붙임은 남은 것으로 본다', () => {
  assert.equal(hasPhotoMetadata(buildJpeg()), false, '기기가 다시 그린 JPEG(JFIF만)');
  assert.equal(hasPhotoMetadata(buildJpeg({ exif: true })), true);
  assert.equal(hasPhotoMetadata(buildJpeg({ xmp: true })), true);
  assert.equal(hasPhotoMetadata(buildJpeg({ iptc: true })), true);
  assert.equal(hasPhotoMetadata(buildJpeg({ comment: true })), true);
  assert.equal(hasPhotoMetadata(buildJpeg({ trailing: [0xff, 0xe1, 0x00, 0x08, ...ascii('Exif'), 0, 0] })), true, '끝 표식 뒤에 숨긴 조각');
  assert.equal(hasPhotoMetadata(buildJpeg().subarray(0, 60)), true, '끝까지 못 따라가면 닫힌 쪽으로');
  assert.equal(hasPhotoMetadata(new Uint8Array()), true);
});

test('서버 순서: 지우고 다시 확인하면 GPS가 남지 않는다', () => {
  const raw = buildJpeg({ w: 1280, h: 960, exif: true, xmp: true, comment: true });
  assert.equal(hasPhotoMetadata(raw), true);
  const text = new TextDecoder('latin1').decode(raw);
  assert.ok(text.includes('GPS 12.3'));
  const clean = stripPhotoMetadata(raw, 'image/jpeg');
  assert.equal(hasPhotoMetadata(clean), false);
  assert.equal(new TextDecoder('latin1').decode(clean).includes('GPS'), false, '위치 글자가 남지 않는다');
  assert.deepEqual(jpegSize(clean), { width: 1280, height: 960 }, '그림 크기는 그대로');
  assert.deepEqual(checkNotePhoto(clean, 'view'), { ok: true, width: 1280, height: 960 });
  // 지우는 함수는 끝 뒤 덧붙임을 건드리지 않으므로 확인이 막는다
  const sneaky = stripPhotoMetadata(buildJpeg({ trailing: [...ascii('GPS 12.3 N')] }), 'image/jpeg');
  assert.equal(checkNotePhoto(sneaky, 'view').ok, false);
});

test('사진 한 장 확인: 형식·용량·긴 변·메타데이터', () => {
  assert.deepEqual(checkNotePhoto(new Uint8Array(), 'view'), { ok: false, reason: 'empty' });
  assert.deepEqual(checkNotePhoto(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), 'view'), { ok: false, reason: 'not_jpeg' });
  assert.deepEqual(checkNotePhoto(buildJpeg({ w: PHOTO_VIEW_EDGE + 1, h: 100 }), 'view'), { ok: false, reason: 'too_large' });
  assert.deepEqual(checkNotePhoto(buildJpeg({ w: 400, h: 300 }), 'thumb'), { ok: false, reason: 'too_large' });
  assert.deepEqual(checkNotePhoto(buildJpeg({ w: PHOTO_THUMB_EDGE, h: 240 }), 'thumb'), { ok: true, width: PHOTO_THUMB_EDGE, height: 240 });
  assert.deepEqual(checkNotePhoto(buildJpeg({ exif: true }), 'view'), { ok: false, reason: 'metadata' });
  const big = new Uint8Array(PHOTO_VIEW_MAX_BYTES + 1);
  big.set(buildJpeg().subarray(0, 4));
  assert.deepEqual(checkNotePhoto(big, 'view'), { ok: false, reason: 'too_big' });
});

test('줄이기 크기와 저장 이름', () => {
  assert.deepEqual(fitWithin(4032, 3024, 1280), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(3024, 4032, 320), { width: 240, height: 320 });
  assert.deepEqual(fitWithin(800, 600, 1280), { width: 800, height: 600 }, '키우지 않는다');
  assert.deepEqual(fitWithin(0, 10, 320), { width: 0, height: 0 });
  assert.equal(isMediaBase('0123456789abcdef0123456789abcdef'), true);
  assert.equal(isMediaBase('../0123456789abcdef0123456789abc'), false);
  assert.equal(isMediaBase('0123456789ABCDEF0123456789ABCDEF'), false);
  assert.deepEqual(mediaFiles('0123456789abcdef0123456789abcdef'), {
    view: '0123456789abcdef0123456789abcdef.jpg', thumb: '0123456789abcdef0123456789abcdef-t.jpg',
  });
});
