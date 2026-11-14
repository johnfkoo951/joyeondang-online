// 통합 전시 일곱 칸(Family Day 10번 웹 7단을 조연당 온라인 안으로 옮긴 것).
// 칸의 제목과 순서만 여기 둔다. 본문은 볼트의 원고 노트에서 tools/sync-exhibit.mjs가 가져온다.

export type ExhibitSection = {
  slug: string;
  order: number;
  title: string;
  /** 화면이 영어일 때의 제목(칸 본문 원고는 옮기지 않는다) */
  titleEn: string;
  /** 현장에서는 어디에 놓이는지 */
  onsite: string;
  /** onsite의 영어 */
  onsiteEn: string;
  /** 조연당 온라인에서 이어지는 방 */
  room?: string;
};

export const EXHIBIT_SECTIONS: ExhibitSection[] = [
  { slug: 'welcome', order: 1, title: '이 집으로 초대합니다', titleEn: 'Welcome to this house', onsite: '현관 첫 안내', onsiteEn: 'the first sign at the entrance', room: 'porch' },
  { slug: 'house', order: 2, title: '조연당, 짓고 잇는 집', titleEn: 'Joyeondang, a home that builds and connects', onsite: '집 이야기 구역', onsiteEn: 'the house story corner', room: 'living' },
  { slug: 'five', order: 3, title: '이 집에 사는 다섯 사람', titleEn: 'The five people who live here', onsite: '사람별 전시 카드', onsiteEn: 'the exhibit cards for each person', room: 'living' },
  { slug: 'works', order: 4, title: '다섯 사람의 작업과 취향', titleEn: 'Their work and the things they love', onsite: '글, 그림, 음악, 물건', onsiteEn: 'writing, pictures, music, and things', room: 'atelier' },
  { slug: 'together', order: 5, title: '함께 시작하는 날', titleEn: 'The day we begin together', onsite: '결혼식과 공통 세션', onsiteEn: 'the wedding and the shared session', room: 'porch' },
  { slug: 'messages', order: 6, title: '남겨 주신 마음', titleEn: 'Messages you left', onsite: '메시지 공간', onsiteEn: 'the message corner', room: 'pine' },
  { slug: 'again', order: 7, title: '다시 만나는 조연당', titleEn: 'Joyeondang, again', onsite: '행사 뒤 기록', onsiteEn: 'the record after the event', room: 'gable' },
];

export const SECTION_BY_SLUG = new Map(EXHIBIT_SECTIONS.map((s) => [s.slug, s]));
