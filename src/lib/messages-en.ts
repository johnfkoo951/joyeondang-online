// 서버가 한국어로 돌려주는 안내 말의 영어. 서버 액션(app/actions.ts)과 검사 함수는 한국어를 그대로 돌려주고(손대지 않는다),
// 화면이 영어일 때 보이는 자리에서 이 표로 옮긴다(components/ActionMessage). 열쇠는 한국어 말 그대로다.
// 모르는 말(다른 파일이 낸 말, 새로 생긴 말)은 옮기지 않는다: 화면은 한국어 그대로 lang="ko"로 둔다.
// 액션의 말을 새로 쓰거나 고치면 여기도 함께 고친다(tests/unit/i18n-entry.test.ts가 actions.ts의 말을 모두 찾아 견준다).
import { HANGUL_KEYBOARD_NOTE, HANGUL_KEYBOARD_NOTE_EN } from '@/lib/code';
import { CLAIM_WORDS_EN } from '@/lib/event-code';
import { NOTE_PHOTO_WORDS_EN } from '@/lib/note-photo-words';
import { RECORD_WORDS_EN } from '@/lib/record-errors';
import { TEXT_WORDS_EN } from '@/lib/text';

/** app/actions.ts가 직접 적은 말 */
const ACTION_WORDS_EN: Readonly<Record<string, string>> = {
  // 쪽지 남기기
  '명단에 계신 분만 쪽지를 남길 수 있어요. 수첩에서 들어오는 길을 확인해 주세요.':
    'Only guests on the list can leave notes. See how to come in from your notebook.',
  '이 방에는 아직 쪽지를 남길 수 없어요.': "This room doesn't take notes yet.",
  '이 방에는 사진을 붙일 수 없어요.': "You can't attach a photo in this room.",
  '인터넷에 걸려면 동의 칸을 눌러 주세요. 아니면 범위를 바꿔 주세요.':
    'To show it to anyone online, tick the consent box. Or choose a different scope.',
  '사진은 아직 받을 수 없어요. 사진을 빼고 글만 먼저 걸어 주세요.':
    "We can't take photos yet. Please remove the photo and post just the text for now.",
  '로그인이 풀린 것 같아요. 다시 들어와 주세요.': 'You seem to be signed out. Please sign in again.',
  '이 방은 지금 쉬는 중이에요.': 'This room is on a break right now.',
  '사진을 붙이지 못했어요. 사진을 빼고 보내거나 잠시 뒤 다시 해 주세요.':
    "We couldn't attach the photo. Send it without the photo, or try again in a moment.",
  '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.': "We couldn't send it. Please try again in a moment.",
  '종이와 사진을 봉투에 담았어요. 가족이 먼저 읽고, 사진은 지금은 가족에게만 보여요.':
    'Your note and photo are in the envelope. The family reads them first, and for now the photo is shown only to the family.',
  '종이를 봉투에 담았어요. 가족이 읽은 뒤에 걸려요.': 'Your note is in the envelope. It goes up after the family reads it.',
  // 초대 코드 넣기
  '초대 코드를 다시 확인해 주세요.': 'Please check the invite code again.',
  // 가족에게 확인 부탁하기
  '청첩장에 적힌 이름이나 가족이 알아볼 이름을 적어 주세요.':
    'Please write the name on your wedding invitation, or a name the family will recognize.',
  '이미 명단에 계세요.': "You're already on the guest list.",
  '가족에게 전했어요. 확인되면 여기서 바로 들어갈 수 있어요.': "We've told the family. Once they confirm, you can come in right here.",
  // 철회 번호로 거두기
  '철회 번호 12자리를 확인해 주세요.': 'Please check the 12-character removal code.',
  '아직 준비 중이에요.': "It isn't ready yet.",
  '처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.': "We couldn't do that. Please try again in a moment.",
  '거뒀어요. 그 기록은 더 이상 남아 있지 않아요.': 'Removed. That note no longer exists.',
  '그 번호의 기록을 찾지 못했어요. 이미 거뒀을 수도 있어요.': "We couldn't find a note with that code. It may already be removed.",
};

const EN: Readonly<Record<string, string>> = {
  ...ACTION_WORDS_EN,
  ...CLAIM_WORDS_EN,
  ...TEXT_WORDS_EN,
  // 쪽지 한도(DB가 거절한 까닭)와 쪽지 사진 안내: 서버 액션이 그 파일들의 한국어를 그대로 돌려준다
  ...RECORD_WORDS_EN,
  ...NOTE_PHOTO_WORDS_EN,
  [HANGUL_KEYBOARD_NOTE]: HANGUL_KEYBOARD_NOTE_EN,
};

/** 서버가 돌려준 한국어 말의 영어. 모르면 null */
export function messageEn(ko: string | null | undefined): string | null {
  if (typeof ko !== 'string') return null;
  return EN[ko.trim()] ?? null;
}

/** 시험용: 옮길 수 있는 한국어 말 전부 */
export const MESSAGE_KEYS: readonly string[] = Object.keys(EN);

/** 로그인 화면이 주소의 error 값(oauth, busy…)으로 보이는 말의 영어(한국어 표는 app/login/page.tsx의 ERROR_WORD) */
export const LOGIN_ERROR_EN: Readonly<Record<string, string>> = {
  oauth: "We couldn't get back from Google. Please press it again.",
  exchange: "We couldn't finish signing in. Please press it again in the same browser.",
  no_code: "We couldn't finish signing in. Please press it again.",
  not_ready: 'Sign-in opens soon.',
  busy: 'Too many people came in at once, so it was briefly blocked. Please press it again in about 10 seconds.',
};
