// 통합 전시 일곱 칸(Family Day 10번 웹 7단을 조연당 온라인 안으로 옮긴 것).
// 칸의 제목과 순서만 여기 둔다. 본문은 볼트의 원고 노트에서 tools/sync-exhibit.mjs가 가져온다.

export type ExhibitSection = {
  slug: string;
  order: number;
  title: string;
  /** 현장에서는 어디에 놓이는지 */
  onsite: string;
  /** 조연당 온라인에서 이어지는 방 */
  room?: string;
};

export const EXHIBIT_SECTIONS: ExhibitSection[] = [
  { slug: 'welcome', order: 1, title: '이 집으로 초대합니다', onsite: '현관 첫 안내', room: 'porch' },
  { slug: 'house', order: 2, title: '조연당, 짓고 잇는 집', onsite: '집 이야기 구역', room: 'living' },
  { slug: 'five', order: 3, title: '이 집에 사는 다섯 사람', onsite: '사람별 전시 카드', room: 'living' },
  { slug: 'works', order: 4, title: '다섯 사람의 작업과 취향', onsite: '글, 그림, 음악, 물건', room: 'atelier' },
  { slug: 'together', order: 5, title: '함께 시작하는 날', onsite: '결혼식과 공통 세션', room: 'porch' },
  { slug: 'messages', order: 6, title: '남겨 주신 마음', onsite: '메시지 공간', room: 'pine' },
  { slug: 'again', order: 7, title: '다시 만나는 조연당', onsite: '행사 뒤 기록', room: 'gable' },
];

export const SECTION_BY_SLUG = new Map(EXHIBIT_SECTIONS.map((s) => [s.slug, s]));
