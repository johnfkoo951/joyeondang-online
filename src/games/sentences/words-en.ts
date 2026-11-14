// 문장 걸어 두기 화면에 보이는 안내 말의 영어. 서버 액션(actions.ts)과 검사 함수(logic.ts)는 한국어를 그대로 돌려주고(손대지 않는다),
// 화면이 영어일 때 보이는 자리에서 이 표로 옮긴다. 열쇠는 한국어 말 그대로다. 모르는 말은 옮기지 않는다(화면은 한국어 그대로 lang="ko").
// 글 검사(lib/text.ts)와 기록 한도(lib/record-errors.ts)가 낸 말도 이 화면에 보이므로 같은 영어로 함께 둔다(그 파일들의 영어 표와 같은 말).
// tests/unit/i18n-games.test.ts가 actions.ts·logic.ts의 한국어 말을 모두 찾아 이 표와 견준다.
import { SENTENCE_MAX, SOURCE_MAX } from './logic';

export const SENTENCE_WORDS_EN: Readonly<Record<string, string>> = {
  // 서버 액션(actions.ts)
  '문장 걸기는 곧 열려요.': 'Hanging sentences opens soon.',
  '손님 로그인 뒤 걸 수 있어요.': 'Sign in as a guest to hang a sentence.',
  '이 방은 지금 쉬는 중이에요.': 'This room is resting right now.',
  '걸지 못했어요. 잠시 뒤 다시 눌러 주세요.': 'Couldn’t hang it. Please try again in a moment.',
  '종이를 집게에 물렸어요. 가족이 읽은 뒤에 벽에 걸려요.': 'Your paper is clipped on. It goes up on the wall after the family reads it.',
  // 검사(logic.ts)
  '문장을 적어 주세요.': 'Please write a sentence.',
  [`문장은 ${SENTENCE_MAX}자 안으로 줄여 주세요.`]: `Please keep the sentence within ${SENTENCE_MAX} characters.`,
  '쓸 수 없는 글자가 섞여 있어요.': "It has characters that can't be used.",
  '출처(책 이름이나 글쓴이)를 적어 주세요.': 'Please write the source (a book title or an author).',
  [`출처는 ${SOURCE_MAX}자 안으로 적어 주세요.`]: `Please keep the source within ${SOURCE_MAX} characters.`,
  '인터넷에 걸려면 동의 칸을 눌러 주세요. 아니면 범위를 바꿔 주세요.': 'To show it to anyone online, tick the consent box. Or choose a different scope.',
  // 글 검사(lib/text.ts의 checkBody, contactWarnings)
  '글이 비어 있어요.': 'The note is empty.',
  '500자 안으로 줄여 주세요.': 'Please keep it within 500 characters.',
  '전화번호처럼 보이는 숫자가 있어요.': 'There are numbers that look like a phone number.',
  '이메일 주소가 있어요.': 'There is an email address.',
  '주소처럼 보이는 글이 있어요.': 'Part of it looks like a street address.',
  '링크가 있어요. 링크는 가족이 확인한 뒤에 보여요.': 'There is a link. Links show after the family checks them.',
  // 기록 한도(lib/record-errors.ts)
  '오늘은 많이 남겨 주셨어요. 내일 다시 걸어 주세요.': 'You’ve left a lot today. Please come back tomorrow.',
  '잠깐 사이에 많이 남겨 주셨어요. 조금 쉬었다가 다시 걸어 주세요.': 'You’ve left quite a few just now. Take a short break and try again.',
};

/** 한국어 안내 말의 영어. 모르면 null */
export function sentenceWordEn(ko: string | null | undefined): string | null {
  if (typeof ko !== 'string') return null;
  return SENTENCE_WORDS_EN[ko.trim()] ?? null;
}
