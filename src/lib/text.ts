// 쪽지 글 검사. 서버와 화면이 같은 규칙을 쓴다.

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

/** 막지는 않고 알려만 준다(기획서 6.5: 연락처나 주소처럼 보이면 경고) */
export function contactWarnings(text: string): string[] {
  const warnings: string[] = [];
  if (/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/.test(text)) warnings.push('전화번호처럼 보이는 숫자가 있어요.');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) warnings.push('이메일 주소가 있어요.');
  // 도로명(평화로 12, 한빛로12길 3), 지번, 동·호수(101동 202호)
  if (/[가-힣0-9]+(로|길)\s?\d+(-\d+)?|\d+\s?번지|\d+\s?동\s?\d+\s?호/.test(text)) warnings.push('주소처럼 보이는 글이 있어요.');
  if (/https?:\/\//i.test(text)) warnings.push('링크가 있어요. 링크는 가족이 확인한 뒤에 보여요.');
  return warnings;
}

/** 글자 수(한글 조합 중에도 그대로 센다) */
export function countChars(text: string): number {
  return [...text.normalize('NFC')].length;
}
