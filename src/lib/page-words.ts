// 손님 화면(도장 투어 지도, 방, 방명록, 갤러리, 전시, 수첩)의 화면 말 한·영. 한국어는 예전 글자 그대로 두고 영어를 나란히 둔다.
// 다른 표에서 오는 이름(문패 상태, 공개 범위, 역할, 전시 칸 제목, 인형 색)은 그 표가 쓰는 영어와 같은 낱말을 쓴다.
// 사람이 쓴 글(쪽지, 원고, 이름)과 집 안내 문장은 옮기지 않는다: 화면이 lang="ko"를 붙여 그대로 둔다.
// 다른 모듈을 값으로 가져오는 것은 이 시험(tests/unit/i18n-pages.test.ts)이 바로 부를 수 있는 작은 표들뿐이다.
import type { Door } from '@/content/rooms';
import type { Role, Scope } from '@/lib/access';
import type { Lang } from '@/lib/i18n';
import { NOTE_PHOTO_WORDS_EN } from '@/lib/note-photo-words';
import { RECORD_WORDS_EN } from '@/lib/record-errors';

// 걷기 사진 안내 한 줄의 영어(정본은 lib/shots-pick: 갤러리 화면이 한국어 줄과 함께 쓴다)
export { SHOTS_PRIVACY_LINE_EN } from '@/lib/shots-pick';

/** 한국어와 영어 한 쌍 */
export type Pair = { readonly ko: string; readonly en: string };

/** 쌍에서 지금 말 */
export const pick = (lang: Lang, p: Pair): string => (lang === 'en' && p.en ? p.en : p.ko);

/** 문패 상태의 영어(content/rooms의 DOOR_LABEL과 같은 열쇠) */
export const DOOR_EN: Readonly<Record<Door, string>> = {
  open: 'Open',
  resting: 'On a break',
  family: 'Family only',
  closed: 'Always closed',
};

/** 공개 범위의 영어(lib/access의 SCOPE_LABEL과 같은 열쇠) */
export const SCOPE_EN: Readonly<Record<Scope | 'self', string>> = {
  self: 'Only me',
  family: 'Family only',
  guests: 'Invited guests',
  public: 'Anyone online',
};

/** 역할 이름의 영어(lib/access의 ROLE_LABEL과 같은 열쇠) */
export const ROLE_EN: Readonly<Record<Role, string>> = {
  public: 'Visitor',
  visitor: 'Pending guest',
  guest: 'Invited guest',
  family: 'Family',
  admin: 'Host',
};

/** 전시 칸 제목과 현장 자리의 영어(content/exhibit-sections의 slug). 칸의 원고는 옮기지 않는다 */
export const SECTION_EN: Readonly<Record<string, { title: string; onsite: string }>> = {
  welcome: { title: 'Welcome to this house', onsite: 'the first sign at the entrance' },
  house: { title: 'Joyeondang, a home that builds and connects', onsite: 'the house story corner' },
  five: { title: 'The five people who live here', onsite: 'the exhibit cards for each person' },
  works: { title: 'Their work and the things they love', onsite: 'writing, pictures, music, and things' },
  together: { title: 'The day we begin together', onsite: 'the wedding and the shared session' },
  messages: { title: 'Messages you left', onsite: 'the message corner' },
  again: { title: 'Joyeondang, again', onsite: 'the record after the event' },
};

/** 인형 색 이름의 영어(content/dolls의 DOLL_COLORS id) */
export const DOLL_COLOR_EN: Readonly<Record<string, string>> = {
  spring: 'Spring pink',
  summer: 'Summer green',
  autumn: 'Autumn orange',
  winter: 'Winter blue-gray',
  cream: 'Cream',
  ink: 'Charcoal',
};

/** 수첩의 대표 인형 배지 이름(doll-1부터 차례대로) */
export const DOLL_PRESETS: readonly Pair[] = [
  { ko: '단정한 산책', en: 'Neat stroll' },
  { ko: '동그란 단발', en: 'Round bob' },
  { ko: '살랑 긴 머리', en: 'Breezy long hair' },
  { ko: '포근한 곱슬', en: 'Cozy curls' },
  { ko: '산뜻 올림머리', en: 'Fresh updo' },
  { ko: '모자 쓴 손님', en: 'Guest in a hat' },
];

type RecordStatus = 'submitted' | 'approved' | 'hidden' | 'rejected' | 'sealed';

/** 걸린 쪽지 목록(방, 전시 칸)의 상태 낱말 */
export const RECORD_STATUS: Readonly<Record<RecordStatus, Pair>> = {
  submitted: { ko: '봉투에 담김, 가족이 읽는 중', en: 'In the envelope, the family is reading it' },
  approved: { ko: '걸림', en: 'Posted' },
  hidden: { ko: '내 수첩에만 있음', en: 'Only in my notebook' },
  rejected: { ko: '내 수첩에만 있음', en: 'Only in my notebook' },
  sealed: { ko: '봉인', en: 'Sealed' },
};

/** 방명록 벽의 상태 낱말 */
export const WALL_STATUS: Readonly<Record<RecordStatus, Pair>> = {
  submitted: { ko: '봉투에 담김 · 가족 확인 중', en: 'In the envelope · family checking' },
  approved: { ko: '걸림', en: 'Posted' },
  hidden: { ko: '내 수첩에만', en: 'Only in my notebook' },
  rejected: { ko: '내 수첩에만', en: 'Only in my notebook' },
  sealed: { ko: '봉인', en: 'Sealed' },
};

/** 수첩 「내가 남긴 글」의 상태 낱말(모르는 상태는 받은 값 그대로) */
export const MINE_STATUS: Readonly<Record<string, Pair>> = {
  submitted: { ko: '봉투에 담김', en: 'In the envelope' },
  approved: { ko: '걸림', en: 'Posted' },
  hidden: { ko: '내 수첩에만', en: 'Only in my notebook' },
  rejected: { ko: '내 수첩에만', en: 'Only in my notebook' },
  sealed: { ko: '봉인', en: 'Sealed' },
};

/** 전시 칸 목록의 칸 상태(열린 칸은 비움) */
export const SECTION_STATE: Readonly<Record<string, Pair>> = {
  empty: { ko: '준비 중', en: 'Coming soon' },
  locked: { ko: '초대 손님께 열려요', en: 'Open to invited guests' },
  open: { ko: '', en: '' },
};

const DAY_KO = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
const DAY_EN = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

/** 쪽지 날짜(한국 시간의 월·일): 11월 12일, November 12 */
export function dayLabel(lang: Lang, iso: string): string {
  return (lang === 'en' ? DAY_EN : DAY_KO).format(new Date(iso));
}

/** 걷기 사진 날짜(이 기기 시간): 2026. 11. 12. 오후 3:04, Nov 12, 2026, 3:04 PM */
export function shotTime(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

/** 사람이 쓴 글(쪽지, 이름)을 둘 때의 lang: 한글이 있으면 'ko'(화면 읽기가 한국어로 읽게), 없으면 정하지 않는다 */
export function hangulLang(text: string | null | undefined): 'ko' | undefined {
  return typeof text === 'string' && HANGUL.test(text) ? 'ko' : undefined;
}

/** 영어 셈: 1 photo, 2 photos */
export function countEn(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 영어 차례 낱말: 1st, 2nd, 3rd, 4th … 11th, 12th, 13th */
export function ordinalEn(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** 이 화면들이 직접 쓰는 서버 쪽 안내(보내기 실패)의 영어 */
const PAGE_WORDS_EN: Readonly<Record<string, string>> = {
  '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.': 'We couldn’t send it. Please try again in a moment.',
};

/**
 * 쪽지·사진 쪽에서 돌아온 한국어 안내의 영어(이 화면들의 표가 아는 말만). 모르면 null: 화면은 한국어 그대로 lang="ko"로 둔다
 */
export function noteMessageEn(ko: string | null | undefined): string | null {
  if (typeof ko !== 'string') return null;
  const s = ko.trim();
  return PAGE_WORDS_EN[s] ?? RECORD_WORDS_EN[s] ?? NOTE_PHOTO_WORDS_EN[s] ?? null;
}

/** 시험용: 영어로 옮기는 안내 말 */
export const NOTE_MESSAGE_KEYS: readonly string[] = [
  ...Object.keys(PAGE_WORDS_EN),
  ...Object.keys(RECORD_WORDS_EN),
  ...Object.keys(NOTE_PHOTO_WORDS_EN),
];
