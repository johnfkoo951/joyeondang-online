// AI 사진 캐릭터의 순수 규칙. node --test 로 바로 돈다(외부 호출 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORBIDDEN_PROMPT_WORDS,
  POSITIVE_PORTRAYAL_RULES,
  SHEET_VIEWS_INSTRUCTIONS,
  SHEET_VIEWS_SCHEMA,
  TAKE_FROM_PHOTO,
  TURNAROUND_VIEWS,
  VISION_SCHEMA,
  buildAvatarPrompt,
  buildTurnaroundPrompt,
} from '../../src/lib/avatar/prompt.ts';
import {
  ATTEMPTS_DAILY,
  DEFAULT_TOTAL_CAP,
  MAX_PHOTO_BYTES,
  MESSAGES,
  PER_USER_DAILY,
  charPath,
  checkPhoto,
  decideQuota,
  isUuid,
  kstDay,
  kstDayStart,
  originalPath,
  parseVisionCheck,
  readQuota,
  readTotalCap,
  sniffImageType,
  stripPhotoMetadata,
} from '../../src/lib/avatar/rules.ts';

const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const WEBP_HEAD = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const GIF_HEAD = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);

// ───────── 언제나 긍정적으로 그린다(사용자 지시, 가장 먼저)

test('프롬프트: 모두가 같은 귀여운 꼬마 비율을 받는다', () => {
  const p = buildAvatarPrompt();
  assert.match(p, /same standard cute chibi proportions/);
  assert.match(p, /big round head/);
  assert.match(p, /small soft body/);
  assert.match(p, /Do not copy the body shape, build or proportions from the photo/);
  assert.match(p, /kindest, most flattering and charming way/);
});

test('프롬프트: 사진에서는 옷, 머리, 장신구, 피부색만 가져오고 피부색은 바꾸지 않는다', () => {
  const p = buildAvatarPrompt();
  assert.match(p, /Take only these things/);
  assert.match(p, /clothing colors, patterns and style/);
  assert.match(p, /hairstyle and hair color/);
  assert.match(p, /glasses, hats and accessories/);
  assert.match(p, /never make it lighter or darker/);
  assert.equal(TAKE_FROM_PHOTO.length, 4, '가져오는 것을 늘릴 때는 사용자 지시를 다시 확인한다');
});

test('프롬프트: 부정적으로 보일 수 있는 것은 그리지 않는다', () => {
  const p = buildAvatarPrompt();
  for (const re of [
    /friendly smile/,
    /rosy, healthy complexion/,
    /Never show wrinkles, blemishes, spots, scars/,
    /Never show teeth gaps/,
    /bald head is drawn smooth, neat and dignified, never as a joke/,
    /Hair always looks neat/,
    /Never exaggerate, mock or caricature/,
    /Do not try to reproduce the real face in detail/,
  ]) {
    assert.match(p, re);
  }
  assert.ok(POSITIVE_PORTRAYAL_RULES.length >= 10);
});

test('프롬프트: 실물 그대로·몸무게 쪽 말은 한 마디도 없다', () => {
  const lower = buildAvatarPrompt().toLowerCase();
  for (const w of FORBIDDEN_PROMPT_WORDS) assert.equal(lower.includes(w), false, w);
  for (const w of ['realistic', 'accurate body', 'weight', 'fat', 'skinny', 'obese', 'chubby', 'old age', 'elderly', 'ugly']) {
    assert.equal(new RegExp(`\\b${w}\\b`).test(lower), false, w);
  }
});

test('프롬프트: 투명 배경, 글자 없음, 전신 정면 3/4', () => {
  const p = buildAvatarPrompt();
  assert.match(p, /Transparent background: no background, no floor, no ground shadow, no glow or halo/);
  assert.match(p, /No text, no letters, no numbers, no logos, no watermark/);
  assert.match(p, /full body from head to shoes, front three-quarter view/);
  assert.match(p, /one single character/);
});

test('프롬프트: 한쪽에서만 비추는 빛을 쓰지 않는다(방향 그림을 이어 쓸 때 밝기가 튀지 않게)', () => {
  assert.match(buildAvatarPrompt(), /Even, flat lighting from the front; no strong light from one side\./);
});

// ───────── 걷기용 방향 그림(캐릭터 그림 한 장 → 다섯 방향 한 줄)

test('방향 그림 프롬프트: 같은 캐릭터를 그대로 다시 그린다', () => {
  const p = buildTurnaroundPrompt();
  assert.match(p, /Draw the exact same character again/);
  for (const re of [/the same face/, /the same hairstyle and hair color/, /the same outfit with the same colors and details/,
    /the same accessories/, /the same chibi proportions/, /the same soft storybook paper-doll illustration style/]) {
    assert.match(p, re);
  }
  assert.match(p, /nothing is added or removed between views/);
});

test('방향 그림 프롬프트: 언제나 긍정적으로(한 장 그림과 같은 뜻을 옆·뒤 모습에도)', () => {
  const p = buildTurnaroundPrompt();
  for (const re of [/skin tone exactly as in the reference image in every view; never make it lighter or darker/,
    /kindest, most flattering and charming way/, /Never exaggerate, mock or caricature any feature/,
    /no wrinkles, blemishes, spots or scars/, /bald head stays smooth, neat and dignified from every side, never as a joke/,
    /Hair and clothes stay neat and tidy/]) {
    assert.match(p, re);
  }
});

test('방향 그림 프롬프트: 한 줄에 다섯, 같은 크기와 키, 발은 같은 선, 서로 닿지 않게', () => {
  const p = buildTurnaroundPrompt();
  assert.match(p, /five full-body views of this one character/);
  assert.match(p, /placed in one horizontal row, evenly spaced/);
  assert.match(p, /all drawn at exactly the same size and height/);
  assert.match(p, /with the feet on the same baseline/);
  assert.match(p, /Leave clear empty space between the figures so that they never touch or overlap/);
});

test('방향 그림 프롬프트: 왼쪽부터 앞, 앞 비스듬, 옆, 뒤 비스듬, 뒤이고 비스듬·옆은 그림 왼쪽을 본다', () => {
  const p = buildTurnaroundPrompt();
  assert.equal(TURNAROUND_VIEWS.length, 5, '칸 수는 걷기 엔진과의 약속이다');
  const at = ['1. Front view', '2. Three-quarter front view', '3. Side view', '4. Three-quarter back view', '5. Back view'].map((t) => p.indexOf(t));
  assert.ok(at.every((n) => n > 0), '다섯 방향이 모두 있다');
  assert.deepEqual([...at].sort((a, b) => a - b), at, '적힌 순서가 왼쪽부터의 순서다');
  assert.ok(p.indexOf('From left to right:') < at[0]);
  const nose = 'nose points toward the left edge of the picture';
  assert.deepEqual(TURNAROUND_VIEWS.map((t) => t.includes(nose)), [false, true, true, true, false]);
  assert.equal(/right edge/.test(p), false, '오른쪽을 보라는 말은 없다');
  assert.match(TURNAROUND_VIEWS[4], /only the back of the head and the back of the outfit, and no face/);
});

test('방향 그림 프롬프트: 고른 빛, 투명 바탕, 글자·숫자·화살표 없음, 금지어 없음', () => {
  const p = buildTurnaroundPrompt();
  assert.match(p, /Even, flat lighting from the front\. No cast shadows\./);
  assert.match(p, /Transparent background: no background, no floor, no ground shadow, no glow or halo, no scenery, no frame, no dividing lines\./);
  assert.match(p, /No text, no labels, no letters, no numbers, no arrows, no logos, no watermark\./);
  const lower = p.toLowerCase();
  for (const w of FORBIDDEN_PROMPT_WORDS) assert.equal(lower.includes(w), false, w);
  for (const w of ['realistic', 'accurate body', 'weight', 'fat', 'skinny', 'obese', 'chubby', 'old age', 'elderly', 'ugly']) {
    assert.equal(new RegExp(`\\b${w}\\b`).test(lower), false, w);
  }
  assert.equal(/photo/.test(lower), false, '사진이 아니라 이미 그린 캐릭터 그림을 참고한다');
});

test('시트 살피기 스키마: 그림마다 방향과 코가 가리키는 쪽, 둘 다 필수', () => {
  const item = SHEET_VIEWS_SCHEMA.properties.figures.items;
  assert.deepEqual([...item.required].sort(), ['nose', 'view']);
  assert.deepEqual([...item.properties.nose.enum], ['left', 'right', 'none']);
  assert.equal(item.additionalProperties, false);
  assert.equal(SHEET_VIEWS_SCHEMA.additionalProperties, false);
  for (const v of item.properties.view.enum) assert.ok(SHEET_VIEWS_INSTRUCTIONS.includes(`"${v}"`), v);
  assert.match(SHEET_VIEWS_INSTRUCTIONS, /reading order/);
});

test('비전 확인 스키마는 네 칸 모두 필수', () => {
  assert.deepEqual([...VISION_SCHEMA.required].sort(), ['isPhotoOfPerson', 'likelyUnder14', 'personCount', 'uncertain']);
  assert.equal(VISION_SCHEMA.additionalProperties, false);
});

// ───────── 사진 확인

test('형식은 앞 바이트로 판정한다', () => {
  assert.equal(sniffImageType(JPEG_HEAD), 'image/jpeg');
  assert.equal(sniffImageType(PNG_HEAD), 'image/png');
  assert.equal(sniffImageType(WEBP_HEAD), 'image/webp');
  assert.equal(sniffImageType(GIF_HEAD), null);
  assert.equal(sniffImageType(new Uint8Array([])), null);
});

test('사진 크기·형식 확인', () => {
  assert.deepEqual(checkPhoto({ size: 1000, declaredType: 'image/jpeg', head: JPEG_HEAD }), { ok: true, type: 'image/jpeg' });
  assert.deepEqual(checkPhoto({ size: 1000, declaredType: '', head: PNG_HEAD }), { ok: true, type: 'image/png' });
  assert.equal(checkPhoto({ size: MAX_PHOTO_BYTES, declaredType: 'image/webp', head: WEBP_HEAD }).ok, true, '한도에 딱 맞으면 통과');
  const big = checkPhoto({ size: MAX_PHOTO_BYTES + 1, declaredType: 'image/jpeg', head: JPEG_HEAD });
  assert.equal(big.ok, false);
  assert.equal(!big.ok && big.reason, 'too_big');
  const empty = checkPhoto({ size: 0, declaredType: 'image/jpeg', head: JPEG_HEAD });
  assert.equal(!empty.ok && empty.reason, 'empty');
  const gif = checkPhoto({ size: 1000, declaredType: 'image/gif', head: GIF_HEAD });
  assert.equal(!gif.ok && gif.reason, 'bad_type');
  const heic = checkPhoto({ size: 1000, declaredType: 'image/heic', head: JPEG_HEAD });
  assert.equal(!heic.ok && heic.reason, 'bad_type', '보낸 type이 받지 않는 형식이면 거절');
  const lying = checkPhoto({ size: 1000, declaredType: 'image/jpeg', head: GIF_HEAD });
  assert.equal(!lying.ok && lying.reason, 'bad_type', 'type만 jpeg라고 해도 내용이 아니면 거절');
});

test('저장 경로 모양은 DB 제약과 같다', () => {
  const uid = '00000000-0000-4000-8000-000000000001';
  const id = '11111111-2222-4333-8444-555555555555';
  assert.equal(originalPath(uid, id, 'image/jpeg'), `${uid}/originals/${id}.jpg`);
  assert.equal(originalPath(uid, id, 'image/png'), `${uid}/originals/${id}.png`);
  assert.equal(charPath(uid, id), `${uid}/chars/${id}.png`);
  const sql = readFileSync(new URL('../../supabase/migrations/0003_avatars.sql', import.meta.url), 'utf8');
  assert.match(sql, /user_id::text \|\| '\/originals\/' \|\| id::text \|\| '\.jpg'/);
  assert.match(sql, /user_id::text \|\| '\/chars\/' \|\| id::text \|\| '\.png'/);
  assert.equal(isUuid(id), true);
  assert.equal(isUuid('../etc/passwd'), false);
  assert.equal(isUuid(`${id}/x`), false);
});

test('위치·기기 정보 지우기: JPEG의 Exif, PNG의 글 조각', () => {
  // SOI, APP0(JFIF), APP1(Exif + 가짜 GPS), COM, SOS... EOI
  const app0 = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46];
  const exifBody = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 0x47, 0x50, 0x53]);
  const app1 = [0xff, 0xe1, 0x00, exifBody.length + 2, ...exifBody];
  const com = [0xff, 0xfe, 0x00, 0x05, 0x68, 0x69, 0x21];
  const scan = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9];
  const jpeg = new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...com, ...scan]);
  const clean = stripPhotoMetadata(jpeg, 'image/jpeg');
  assert.deepEqual([...clean], [0xff, 0xd8, ...app0, ...scan]);

  const chunk = (kind: string, data: number[]) => {
    const len = [0, 0, 0, data.length];
    return [...len, ...[...kind].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const text = chunk('tEXt', [...'GPS'].map((c) => c.charCodeAt(0)));
  const exif = chunk('eXIf', [1, 2, 3]);
  const idat = chunk('IDAT', [9, 9]);
  const iend = chunk('IEND', []);
  const png = new Uint8Array([...sig, ...ihdr, ...text, ...exif, ...idat, ...iend]);
  assert.deepEqual([...stripPhotoMetadata(png, 'image/png')], [...sig, ...ihdr, ...idat, ...iend]);
});

test('위치·기기 정보 지우기: WEBP의 EXIF 조각과 VP8X 표시', () => {
  const le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  const ch = (kind: string, data: number[]) => [...[...kind].map((c) => c.charCodeAt(0)), ...le(data.length), ...data, ...(data.length % 2 ? [0] : [])];
  const vp8x = ch('VP8X', [0x08 | 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const img = ch('VP8L', [1, 2, 3, 4]);
  const exif = ch('EXIF', [7, 7, 7]);
  const body = [...vp8x, ...img, ...exif];
  const webp = new Uint8Array([...[...'RIFF'].map((c) => c.charCodeAt(0)), ...le(4 + body.length), ...[...'WEBP'].map((c) => c.charCodeAt(0)), ...body]);
  const out = stripPhotoMetadata(webp, 'image/webp');
  assert.equal(sniffImageType(out), 'image/webp');
  const text = String.fromCharCode(...out);
  assert.equal(text.includes('EXIF'), false);
  assert.equal(out[20] & 0x08, 0, 'VP8X의 EXIF 표시를 끈다');
  assert.equal(out[20] & 0x10, 0x10, '다른 표시(알파)는 둔다');
  const riffSize = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
  assert.equal(riffSize, out.length - 8);
});

test('모양이 이상한 파일은 손대지 않고 그대로 둔다', () => {
  const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]);
  assert.deepEqual(stripPhotoMetadata(broken, 'image/jpeg'), broken);
});

// ───────── 하루 장수와 모두의 상한

// 역할 한도(cap)가 없는 옛 DB(0020 전)의 응답: 예전 숫자(하루 3장, 시도 8번)로 막는다. 역할마다의 한도는 avatar-role-caps.test.ts
test('옛 DB: 하루 3장, 시도 8번, 모두의 상한 순서로 막는다', () => {
  assert.deepEqual(decideQuota({ used: 0, attempts: 0, total: 0 }, 150), { ok: true, left: 3 });
  assert.deepEqual(decideQuota({ used: 2, attempts: 5, total: 149 }, 150), { ok: true, left: 1 });
  const user = decideQuota({ used: PER_USER_DAILY, attempts: 3, total: 999 }, 150);
  assert.equal(!user.ok && user.reason, 'user_limit');
  assert.equal(!user.ok && user.message, '오늘 만들 수 있는 3장을 다 만들었어요. 내일 다시 해 주세요.', '예전 글과 같다');
  const tries = decideQuota({ used: 1, attempts: ATTEMPTS_DAILY, total: 0 }, 150);
  assert.equal(!tries.ok && tries.reason, 'attempt_limit');
  const all = decideQuota({ used: 0, attempts: 0, total: 150 }, 150);
  assert.equal(!all.ok && all.reason, 'total_limit');
  assert.equal(!all.ok && all.message, '오늘은 캐릭터 만들기가 다 찼어요. 내일 다시 해 주세요.');
  const zero = decideQuota({ used: 0, attempts: 0, total: 0 }, 0);
  assert.equal(zero.ok, false, '상한 0이면 아무도 못 만든다');
});

test('장수를 모르면 막는다', () => {
  const q = readQuota({ used: 'x', attempts: null, total: undefined });
  assert.equal(decideQuota(q, 150).ok, false);
  assert.equal(decideQuota(readQuota(null), 150).ok, false);
  assert.deepEqual(readQuota({ used: 1, attempts: '2', total: 3 }), { used: 1, attempts: 2, total: 3 });
});

test('모두의 하루 상한 환경 변수', () => {
  assert.equal(readTotalCap(undefined), DEFAULT_TOTAL_CAP);
  assert.equal(DEFAULT_TOTAL_CAP, 150);
  assert.equal(readTotalCap(''), 150);
  assert.equal(readTotalCap('40'), 40);
  assert.equal(readTotalCap(' 0 '), 0);
  assert.equal(readTotalCap('-3'), 150);
  assert.equal(readTotalCap('many'), 150);
  assert.equal(readTotalCap('12.7'), 12);
});

test('옛 DB의 장수 숫자는 0003의 avatar_quota·avatar_begin과 같다', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0003_avatars.sql', import.meta.url), 'utf8');
  assert.match(sql, new RegExp(`'per_user', ${PER_USER_DAILY}`));
  assert.match(sql, new RegExp(`'attempts_max', ${ATTEMPTS_DAILY}`));
  assert.match(sql, new RegExp(`\\(v_q ->> 'used'\\)::int >= ${PER_USER_DAILY}`));
  assert.match(sql, new RegExp(`\\(v_q ->> 'attempts'\\)::int >= ${ATTEMPTS_DAILY}`));
  assert.match(sql, new RegExp(`p_total_cap int default ${DEFAULT_TOTAL_CAP}`));
  assert.match(sql, /status in \('pending', 'queued', 'drawing', 'ready', 'deleted'\)/, '거절·실패는 장수에 세지 않는다');
});

// ───────── 사진 살피기 결과

test('비전 확인: 어른 한 명이면 통과', () => {
  assert.deepEqual(parseVisionCheck('{"isPhotoOfPerson":true,"personCount":1,"likelyUnder14":false,"uncertain":false}'), { ok: true });
  assert.deepEqual(parseVisionCheck({ isPhotoOfPerson: true, personCount: 1, likelyUnder14: false, uncertain: false }), { ok: true });
});

test('비전 확인: 나이는 사진으로 판정하지 않는다(올린 사람이 고른 나 또는 아이와 보호자 동의를 믿는다). 사람 수·사람 사진·애매함은 그대로 본다', () => {
  assert.deepEqual(parseVisionCheck({ isPhotoOfPerson: true, personCount: 1, likelyUnder14: true, uncertain: false }), { ok: true });
  const many = parseVisionCheck({ isPhotoOfPerson: true, personCount: 2, likelyUnder14: true, uncertain: false });
  assert.equal(!many.ok && many.reason, 'many_people');
  const none = parseVisionCheck({ isPhotoOfPerson: false, personCount: 0, likelyUnder14: true, uncertain: false });
  assert.equal(!none.ok && none.reason, 'no_person');
  const unsure = parseVisionCheck({ isPhotoOfPerson: true, personCount: 1, likelyUnder14: true, uncertain: true });
  assert.equal(!unsure.ok && unsure.reason, 'unclear');
  // 답의 모양은 그대로 본다: likelyUnder14가 빠지거나 불이 아니면 애매함
  const shape = parseVisionCheck({ isPhotoOfPerson: true, personCount: 1, uncertain: false });
  assert.equal(!shape.ok && shape.reason, 'unclear');
  // 'child'는 그 전에 거절된 줄을 읽을 때만 남는다(새로 내지 않는다)
  for (const likelyUnder14 of [true, false]) {
    const v = parseVisionCheck({ isPhotoOfPerson: true, personCount: 1, likelyUnder14, uncertain: false });
    assert.notEqual(!v.ok && v.reason, 'child');
  }
});

test('비전 확인: 사람 없음, 여러 명, 애매함', () => {
  const none = parseVisionCheck({ isPhotoOfPerson: false, personCount: 0, likelyUnder14: false, uncertain: false });
  assert.equal(!none.ok && none.reason, 'no_person');
  const zero = parseVisionCheck({ isPhotoOfPerson: true, personCount: 0, likelyUnder14: false, uncertain: false });
  assert.equal(!zero.ok && zero.reason, 'no_person');
  const many = parseVisionCheck({ isPhotoOfPerson: true, personCount: 3, likelyUnder14: false, uncertain: false });
  assert.equal(!many.ok && many.reason, 'many_people');
  const unsure = parseVisionCheck({ isPhotoOfPerson: true, personCount: 1, likelyUnder14: false, uncertain: true });
  assert.equal(!unsure.ok && unsure.reason, 'unclear');
});

test('비전 확인: 모양이 이상한 답은 모두 거절', () => {
  for (const raw of [
    null,
    undefined,
    '',
    'not json',
    '{"isPhotoOfPerson":true,"personCount":1,"likelyUnder14":false',
    '[]',
    '"ok"',
    '{}',
    { isPhotoOfPerson: 'yes', personCount: 1, likelyUnder14: false, uncertain: false },
    { isPhotoOfPerson: true, personCount: '1', likelyUnder14: false, uncertain: false },
    { isPhotoOfPerson: true, personCount: 1.5, likelyUnder14: false, uncertain: false },
    { isPhotoOfPerson: true, personCount: -1, likelyUnder14: false, uncertain: false },
    { isPhotoOfPerson: true, personCount: 1, uncertain: false },
    { isPhotoOfPerson: true, personCount: 1, likelyUnder14: 'no', uncertain: false },
    { isPhotoOfPerson: true, personCount: 1, likelyUnder14: false, uncertain: 'no' },
  ]) {
    const v = parseVisionCheck(raw);
    assert.equal(v.ok, false, JSON.stringify(raw));
  }
});

// ───────── KST 하루

test('KST 하루 경계는 UTC 15:00', () => {
  assert.equal(kstDay(new Date('2026-11-09T14:59:59.999Z')), '2026-11-09');
  assert.equal(kstDay(new Date('2026-11-09T15:00:00.000Z')), '2026-11-10');
  assert.equal(kstDayStart(new Date('2026-11-09T14:59:59Z')).toISOString(), '2026-11-08T15:00:00.000Z');
  assert.equal(kstDayStart(new Date('2026-11-09T15:00:00Z')).toISOString(), '2026-11-09T15:00:00.000Z');
  assert.equal(kstDay(new Date('2026-12-31T15:30:00Z')), '2027-01-01', '해가 바뀌는 밤');
  const sql = readFileSync(new URL('../../supabase/migrations/0003_avatars.sql', import.meta.url), 'utf8');
  assert.match(sql, /\(now\(\) at time zone 'Asia\/Seoul'\)::date::timestamp at time zone 'Asia\/Seoul'/);
});

test('안내 글에 긴 줄표를 쓰지 않는다', () => {
  // 숫자를 받는 글(하루 장수)은 숫자를 넣은 것과 뺀 것 둘 다 본다
  const texts = Object.values(MESSAGES).flatMap((m) => (typeof m === 'function' ? [m(10), m(null)] : [m]));
  for (const m of texts) assert.equal(/[—–]/.test(m), false, m);
});
