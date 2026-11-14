// 쪽지 글 검사. 서버와 화면이 같은 규칙을 쓴다.
import type { Lang } from '@/lib/i18n';

export const BODY_MAX = 500;
const CONTROL = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type BodyCheck = { ok: true; body: string } | { ok: false; reason: string };

export function checkBody(raw: unknown): BodyCheck {
  if (typeof raw !== 'string') return { ok: false, reason: '글이 비어 있어요.' };
  const body = raw.normalize('NFC').trim();
  if (!body) return { ok: false, reason: '글이 비어 있어요.' };
  if ([...body].length > BODY_MAX) return { ok: false, reason: `${BODY_MAX}자 안으로 줄여 주세요.` };
  if (CONTROL.test(body)) return { ok: false, reason: '쓸 수 없는 글자가 섞여 있어요.' };
  return { ok: true, body };
}

// 경고 말 [한국어, 영어]. 화면이 영어이면 영어를 보인다(같은 뜻)
const WARN = {
  phone: ['전화번호처럼 보이는 숫자가 있어요.', 'There are numbers that look like a phone number.'],
  email: ['이메일 주소가 있어요.', 'There is an email address.'],
  address: ['주소처럼 보이는 글이 있어요.', 'Part of it looks like a street address.'],
  link: ['링크가 있어요. 링크는 가족이 확인한 뒤에 보여요.', 'There is a link. Links show after the family checks them.'],
} as const;

/** 막지는 않고 알려만 준다(기획서 6.5: 연락처나 주소처럼 보이면 경고). lang 'en'이면 같은 경고의 영어 */
export function contactWarnings(text: string, lang: Lang = 'ko'): string[] {
  const i = lang === 'en' ? 1 : 0;
  const warnings: string[] = [];
  if (/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/.test(text)) warnings.push(WARN.phone[i]);
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) warnings.push(WARN.email[i]);
  // 도로명(평화로 12, 한빛로12길 3), 지번, 동·호수(101동 202호)
  if (/[가-힣0-9]+(로|길)\s?\d+(-\d+)?|\d+\s?번지|\d+\s?동\s?\d+\s?호/.test(text)) warnings.push(WARN.address[i]);
  if (/https?:\/\//i.test(text)) warnings.push(WARN.link[i]);
  return warnings;
}

/** 이 파일이 내는 한국어 말 → 영어(검사 까닭과 경고). 서버가 한국어로 돌려준 말을 화면이 옮길 때 쓴다(lib/messages-en) */
export const TEXT_WORDS_EN: Readonly<Record<string, string>> = {
  '글이 비어 있어요.': 'The note is empty.',
  [`${BODY_MAX}자 안으로 줄여 주세요.`]: `Please keep it within ${BODY_MAX} characters.`,
  '쓸 수 없는 글자가 섞여 있어요.': "It has characters that can't be used.",
  ...Object.fromEntries(Object.values(WARN).map(([ko, en]) => [ko, en])),
};

/** 글자 수(한글 조합 중에도 그대로 센다) */
export function countChars(text: string): number {
  return [...text.normalize('NFC')].length;
}
