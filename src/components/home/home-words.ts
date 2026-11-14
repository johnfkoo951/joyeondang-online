// 첫 화면의 말(한국어와 영어를 나란히). 그림·색·자리는 각 화면 코드(FrontArt, HowTo)에 두고 말만 여기서 꺼내 쓴다.
// 여섯 개의 작은 문(MoreLinks)과 더 둘러볼 곳(CuratedMore)은 제 표에 한국어와 영어를 나란히 둔다.
// 다른 모듈을 가져오지 않아 시험(tests/unit/i18n-entry.test.ts)이 바로 부른다. 한국어는 예전 글 그대로다.
// 손님이 방에 남기는 것은 첫 화면 어디서나 「쪽지」(영어 note)라 부른다.

export type Words = { ko: string; en: string };
export type OrbId = 'games' | 'guestbook' | 'walk' | 'stamp' | 'exhibit' | 'character';

/** 표지의 여섯 구슬: 이름과 한 줄 */
export const ORB_WORDS: Readonly<Record<OrbId, { title: Words; sub: Words }>> = {
  games: { title: { ko: '작은 놀이', en: 'Mini games' }, sub: { ko: '12가지 놀이방', en: '12 play rooms' } },
  guestbook: { title: { ko: '방명록', en: 'Guestbook' }, sub: { ko: '마음과 쪽지 걸기', en: 'Hang up notes and wishes' } },
  walk: { title: { ko: '집 안 걷기', en: 'Walk the house' }, sub: { ko: '3D 집 산책', en: 'A 3D stroll' } },
  stamp: { title: { ko: '도장 투어', en: 'Stamp tour' }, sub: { ko: '열세 곳 인장 맵', en: 'Map of 13 seals' } },
  exhibit: { title: { ko: '온라인 전시', en: 'Online exhibit' }, sub: { ko: '일곱 칸 이야기', en: 'A story in seven parts' } },
  character: { title: { ko: '내 캐릭터', en: 'My character' }, sub: { ko: '인형 옷장과 화보', en: 'Doll wardrobe and lookbook' } },
};

/** 「이렇게 놀아요」 세 걸음 */
export const STEPS: readonly { title: Words; text: Words }[] = [
  {
    title: { ko: '둘러봐요', en: 'Look around' },
    text: {
      ko: '그림 집 산책과 12가지 작은 놀이, 전시와 화보는 누구나 바로 둘러볼\u00a0수 있어요.',
      en: 'Anyone can stroll the drawn house, play the 12 mini games, and see the exhibit and lookbook right away.',
    },
  },
  {
    title: { ko: '모아 봐요', en: 'Collect' },
    text: {
      ko: '방을 다녀오거나 놀이를 마치면 열세 곳 도장 투어 맵에 나만의 전각 인장이 찍혀요.',
      en: 'Visit a room or finish a game, and your own carved seal lands on the 13-spot stamp tour map.',
    },
  },
  {
    title: { ko: '불을 켜요', en: 'Light it up' },
    text: {
      ko: '초대 손님이 남긴 방명록과 쪽지는 가족이 읽은 뒤 방에 걸리고, 쪽지가 늘수록 마당 석등이 밝아져요.',
      en: 'Guestbook messages and notes from invited guests go up in the rooms after the family reads them, and the more notes, the brighter the stone lantern in the yard.',
    },
  },
];
