// 쪽지 사진을 받지 못했을 때 손님에게 보이는 말. 서버(lib/notes-media)는 한국어를 돌려주고,
// 화면이 영어일 때는 보이는 자리에서 NOTE_PHOTO_WORDS_EN으로 옮긴다(서버 전용 모듈이 아니어서 화면도 가져온다).

/** 사진을 다시 고르게 하는 까닭(lib/notes-media의 checkNotePhoto 까닭) */
export const NOTE_PHOTO_REASON = {
  empty: '사진이 비어 있어요. 다시 골라 주세요.',
  not_jpeg: '사진을 다시 골라 주세요. 화면이 사진을 다시 그리지 못한 것 같아요.',
  too_big: '사진이 너무 커요. 다른 사진을 골라 주세요.',
  too_large: '사진 크기가 맞지 않아요. 다시 골라 주세요.',
  bad_shape: '사진 파일을 읽지 못했어요. 다른 사진을 골라 주세요.',
  metadata: '사진 속 위치·기기 정보를 지우지 못해서 받지 않았어요. 다른 사진을 골라 주세요.',
} as const;

/** 올리기에 실패했을 때 */
export const NOTE_PHOTO_FAIL = '사진을 올리지 못했어요. 글만 먼저 걸거나 잠시 뒤 다시 해 주세요.';

/** 한 시간에 붙일 수 있는 장수를 넘었을 때 */
export function notePhotoHourly(n: number): string {
  return `사진은 한 시간에 ${n}장까지 붙일 수 있어요. 조금 뒤에 다시 해 주세요.`;
}

/** 한 시간 상한(lib/notes-media가 쓴다) */
export const HOURLY_PHOTOS = 20;

/** 위 말들의 영어(열쇠는 한국어 그대로) */
export const NOTE_PHOTO_WORDS_EN: Readonly<Record<string, string>> = {
  [NOTE_PHOTO_REASON.empty]: 'The photo is empty. Please choose it again.',
  [NOTE_PHOTO_REASON.not_jpeg]: 'Please choose the photo again. The page couldn’t redraw it.',
  [NOTE_PHOTO_REASON.too_big]: 'The photo is too big. Please choose another one.',
  [NOTE_PHOTO_REASON.too_large]: 'The photo size doesn’t fit. Please choose it again.',
  [NOTE_PHOTO_REASON.bad_shape]: 'We couldn’t read the photo file. Please choose another one.',
  [NOTE_PHOTO_REASON.metadata]: 'We couldn’t remove the location and device details in the photo, so we didn’t take it. Please choose another one.',
  [NOTE_PHOTO_FAIL]: 'We couldn’t upload the photo. Post just the text first, or try again in a moment.',
  [notePhotoHourly(HOURLY_PHOTOS)]: `You can attach up to ${HOURLY_PHOTOS} photos an hour. Please try again a little later.`,
};
