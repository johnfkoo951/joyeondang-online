// 누가 무엇을 보는가. DB 쪽 사다리는 supabase/migrations/0001_init.sql 의 scope_visible()과 같다.
// 하나를 바꾸면 다른 하나와 tests/unit/access.test.ts 도 같이 바꾼다.

/** 지금 화면을 보는 사람 */
export type Role =
  | 'public' // 로그인하지 않음
  | 'visitor' // 구글로 로그인했지만 명단에서 아직 찾지 못함
  | 'guest' // 명단에 있는 초대 손님
  | 'family' // 가족
  | 'admin'; // 집주인 부부

/** 기록·전시 원고가 열리는 범위 */
export type Scope = 'public' | 'guests' | 'family';

const RANK: Record<Role, number> = { public: 0, visitor: 0, guest: 1, family: 2, admin: 3 };
const NEED: Record<Scope, number> = { public: 0, guests: 1, family: 2 };

export function canSee(role: Role, scope: Scope): boolean {
  return RANK[role] >= NEED[scope];
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && value in RANK;
}

/**
 * 영역별로 어디까지 열지. "일반 사람들도 보는 건 어느 정도까지" 결정이 여기에 산다.
 * 'public' = 로그인 없이 누구나, 'guests' = 명단에 있는 사람, 'family' = 가족.
 * 기록 한 장, 전시 원고 한 편은 이 표와 별개로 각자의 공개 범위를 한 번 더 따른다.
 */
export const AREA_SCOPE = {
  front: 'public', // 첫 화면 그림과 당호
  map: 'public', // 단면 지도와 열린 방 카드
  walk: 'public', // 다시 그린 집 안을 3D로 걷기(실제 도면 아님)
  roomScene: 'public', // 방 장면 그림과 한 줄 소개
  publicRecords: 'public', // 쓴 사람이 인터넷 공개에 동의하고 가족이 승인한 기록
  exhibitIndex: 'public', // 전시 일곱 칸의 제목(본문은 원고마다 범위가 따로 있음)
  lantern: 'public', // 석등 불빛 같은 모두의 진행도(숫자만)
  guestRecords: 'guests', // 초대 손님 범위로 승인된 기록
  write: 'guests', // 쪽지 남기기
  stamps: 'guests', // 도장과 수첩
  games: 'guests', // 방 놀이
  realHouse: 'guests', // 실제 축척의 집 안 걷기(2026-11-08 결정). 데이터는 저장소에 없고 서버가 명단 손님에게만 내려준다
} as const satisfies Record<string, Scope>;

export type Area = keyof typeof AREA_SCOPE;

export function canUse(role: Role, area: Area): boolean {
  return canSee(role, AREA_SCOPE[area]);
}

export const ROLE_LABEL: Record<Role, string> = {
  public: '구경하는 분',
  visitor: '확인 중인 분',
  guest: '초대 손님',
  family: '가족',
  admin: '집주인',
};

export const SCOPE_LABEL: Record<Scope | 'self', string> = {
  self: '나만',
  family: '가족만',
  guests: '초대 손님까지',
  public: '인터넷 누구나',
};
