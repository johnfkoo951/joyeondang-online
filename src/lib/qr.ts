// 현장 QR 도장 표식(기획서 7.2). QR은 입장권이 아니라 도장 표식이다: 방 slug와 짧은 코드만 담고,
// 이미 들어온 명단 손님이 정해 둔 시간 창 안에 찍을 때만 도장이 된다. 위치는 묻지 않는다.
// 외부 의존성 없는 순수 함수만 둔다(node --test 로 바로 돈다).

/** 행사 날 기본값. 서버 환경 변수 QR_EVENT_DAY(YYYY-MM-DD, 한국 시간)로 바꾼다 */
export const QR_EVENT_DAY_DEFAULT = '2026-11-28';
const DAY_MS = 24 * 60 * 60 * 1000;

/** DB qr_marks.code 제약과 같은 모양(정규화한 뒤) */
export const QR_CODE = /^[A-Z0-9]{8,24}$/;

export function qrEventDay(raw: string | undefined | null): string {
  const v = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return QR_EVENT_DAY_DEFAULT;
  const t = Date.parse(`${v}T00:00:00+09:00`);
  if (Number.isNaN(t) || new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10) !== v) return QR_EVENT_DAY_DEFAULT;
  return v;
}

export type QrWindow = { from: Date; until: Date };

/** 행사 날 하루(한국 시간 00:00 ~ 다음 날 00:00) */
export function eventWindow(day: string): QrWindow {
  const from = new Date(`${qrEventDay(day)}T00:00:00+09:00`);
  return { from, until: new Date(from.getTime() + DAY_MS) };
}

/** 시험용: 지금부터 24시간 */
export function testWindow(now: Date): QrWindow {
  return { from: new Date(now.getTime()), until: new Date(now.getTime() + DAY_MS) };
}

export function qrPath(room: string, code: string): string {
  return `/q/${encodeURIComponent(room)}/${encodeURIComponent(code)}`;
}

export function qrUrl(site: string, room: string, code: string): string {
  return `${site.replace(/\/+$/, '')}${qrPath(room, code)}`;
}

export type QrState = 'live' | 'soon' | 'past' | 'revoked';
export const QR_STATE_LABEL: Record<QrState, string> = {
  live: '지금 쓸 수 있음',
  soon: '아직 때가 아님',
  past: '지난 표식',
  revoked: '거둠',
};

export function qrState(mark: { valid_from: string; valid_until: string; revoked_at: string | null }, now: Date): QrState {
  if (mark.revoked_at) return 'revoked';
  const t = now.getTime();
  if (t < Date.parse(mark.valid_from)) return 'soon';
  if (t >= Date.parse(mark.valid_until)) return 'past';
  return 'live';
}

/** 현장 도장 화면(/q/방/코드)의 결과. new·have는 찍힘, 나머지는 못 찍은 까닭(DB earn_qr_stamp의 reason과 같은 이름) */
export type QrStampOutcome = 'new' | 'have' | 'not_now' | 'invalid' | 'closed' | 'not_guest' | 'error';

/** 결과마다 제목과 한 줄(한국어·영어). new의 제목에는 화면이 방 이름을 넣는다(qrStampTitle) */
export const QR_STAMP_WORDS: Readonly<Record<QrStampOutcome, { title: string; line: string; titleEn: string; lineEn: string }>> = {
  new: { title: '도장을 찍었어요', line: '현장 도장이 수첩에 찍혔어요.', titleEn: 'You got the stamp', lineEn: 'The on-site stamp is now in your notebook.' },
  have: {
    title: '이미 받은 도장이에요', line: '수첩에 그대로 있어요. 다른 방의 표식도 찾아보세요.',
    titleEn: 'You already have this stamp', lineEn: "It's still in your notebook. Look for the marks in other rooms too.",
  },
  not_now: {
    title: '이 표식은 행사 날에만 쓸 수 있어요', line: '정해진 날에 다시 찍어 주세요. 방 구경은 지금도 할 수 있어요.',
    titleEn: 'This mark works only on the event day', lineEn: 'Please scan it again on that day. You can look around the room now.',
  },
  invalid: {
    title: '알아볼 수 없는 표식이에요', line: '카드의 QR을 다시 찍어 주세요. 이미 거둔 표식일 수도 있어요.',
    titleEn: "We can't read this mark", lineEn: 'Please scan the QR on the card again. The mark may have been taken down.',
  },
  closed: { title: '이 방은 지금 쉬는 중이에요', line: '문패가 다시 열리면 찍어 주세요.', titleEn: 'This room is on a break right now', lineEn: 'Please scan it when the door sign opens again.' },
  not_guest: {
    title: '명단에서 아직 찾지 못했어요', line: '이 표식은 들어온 분의 도장이에요. 수첩에서 초대 코드를 넣거나 가족에게 확인을 부탁해 주세요.',
    titleEn: "We couldn't find you on the guest list yet",
    lineEn: 'This mark gives a stamp to guests who have come in. Enter an invite code in your notebook, or ask the family to check.',
  },
  error: { title: '지금은 도장을 찍지 못했어요', line: '잠시 뒤 같은 QR을 다시 찍어 주세요.', titleEn: "We couldn't stamp it just now", lineEn: 'Please scan the same QR again in a moment.' },
};

/**
 * 결과 제목: 새로 찍혔고 방을 알면 방 이름을 넣는다(「현관 도장을 찍었어요」, You got the Entrance stamp).
 * room.en은 방 이름의 영어. 영어 이름을 모르면(한국어 그대로) 영어 제목에는 방 이름을 넣지 않는다
 */
export function qrStampTitle(outcome: QrStampOutcome, room: { ko: string; en: string } | null): { ko: string; en: string } {
  const w = QR_STAMP_WORDS[outcome];
  if (outcome === 'new' && room) {
    return { ko: `${room.ko} ${w.title}`, en: room.en && room.en !== room.ko ? `You got the ${room.en} stamp` : w.titleEn };
  }
  return { ko: w.title, en: w.titleEn };
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** 시간 창을 한국 시간으로(예: 11. 28. 00:00 ~ 11. 29. 00:00) */
export function formatWindow(fromIso: string, untilIso: string): string {
  return `${KST.format(new Date(fromIso))} ~ ${KST.format(new Date(untilIso))}`;
}
