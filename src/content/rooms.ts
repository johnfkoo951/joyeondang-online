// 공개 지도에 놓이는 방. 실제 도면이 아니라 놀기 좋게 다시 그린 집이다.
// 규칙(기획서 4절): 치수, 방위, 창 위치, 출입구, 모형 ID, 집 안 자리를 드러내는 이름을 쓰지 않는다.
// 욕실, 위생실, 수납, 침실이 될 방, 지하, 숨은 동선은 여기 넣지 않는다.
// 문패 상태(door)는 기본값이고, 운영 중에는 DB rooms.door_state가 우선한다.

export type Floor = 'attic' | 'second' | 'first' | 'yard';
export type Door = 'open' | 'resting' | 'family' | 'closed';

export type Room = {
  slug: string;
  floor: Floor;
  name: string;
  /** 방에 들어가면 처음 보이는 한 줄 */
  line: string;
  /** 쪽지를 받는 방이면 그 질문 */
  question?: string;
  door: Door;
  /** 아직 닫힌 방이면 언제 여는지(손님에게 보이는 말) */
  opens?: string;
  /** 방 놀이 이름(아직 없으면 비움) */
  game?: string;
  /** 이 방과 이어지는 전시 칸 slug */
  exhibit?: string[];
  /** 쪽지에 사진 한 장을 붙일 수 있는 방(최종 판정은 DB rooms.accepts_photos) */
  photo?: boolean;
};

export const FLOORS: { id: Floor; label: string; note?: string }[] = [
  { id: 'attic', label: '다락' },
  { id: 'second', label: '2층', note: '계절마다 한 구역씩 열려요' },
  { id: 'first', label: '1층' },
  { id: 'yard', label: '마당' },
];

export const ROOMS: Room[] = [
  {
    slug: 'porch',
    floor: 'yard',
    name: '세 아치 포치',
    line: '세 개의 아치 가운데 하나로 들어와요.',
    question: '오늘 이 집에 무엇을 가지고 오셨나요?',
    door: 'open',
    game: '세 아치 입장',
    exhibit: ['welcome', 'together'],
  },
  {
    slug: 'pine',
    floor: 'yard',
    name: '앞마당 소나무',
    line: '쪽지를 걸어 두는 나무예요. 걸린 종이를 한 장씩 넘겨 읽을 수 있어요.',
    question: '다음에 이 집에서 우리와 무엇을 함께하고 싶나요?',
    door: 'open',
    exhibit: ['messages'],
    photo: true,
  },
  {
    slug: 'photozone',
    floor: 'yard',
    name: '포토존',
    line: '여기서 사진 한 장 찍어 남겨 주세요. 올린 사진은 먼저 가족에게만 보여요.',
    question: '오늘 이 집에서 찍은 사진 한 장',
    door: 'open',
    photo: true,
  },
  {
    slug: 'lantern',
    floor: 'yard',
    name: '석등',
    line: '남겨 주신 기록만큼 불이 밝아져요.',
    door: 'open',
  },
  {
    slug: 'entrance',
    floor: 'first',
    name: '현관',
    line: '신발을 벗고 이름표를 달아요.',
    door: 'open',
  },
  {
    slug: 'living',
    floor: 'first',
    name: '1층 거실',
    line: '이 집에 사는 다섯 사람을 소개하는 작은 무대예요.',
    question: '이 다섯 사람에게 건네고 싶은 한마디',
    door: 'open',
    game: '누구의 문장일까',
    exhibit: ['house', 'five'],
  },
  {
    slug: 'kitchen',
    floor: 'first',
    name: '주방과 식탁',
    line: '함께 차리는 식탁.',
    door: 'resting',
    opens: '행사 뒤에 열어요',
  },
  {
    slug: 'study',
    floor: 'first',
    name: '글과 빛이 드는 곳',
    line: '한지 벽에 창 하나로 빛줄기가 비스듬히 들고, 시집과 벼루 놓인 서안이 놀이의 입구가 되는 방이에요.',
    door: 'open',
    game: '문장 걸어 두기',
    exhibit: ['works'],
  },
  {
    slug: 'atelier',
    floor: 'first',
    name: '창이 큰 방',
    line: '창틀에 그림엽서를 그려요.',
    door: 'resting',
    opens: '행사 뒤에 열어요',
    exhibit: ['works'],
  },
  {
    slug: 'gable',
    floor: 'second',
    name: '재즈가 흐르는 방',
    line: '경사진 천장 아래 스윙 잼·리듬 천국 스튜디오·재즈 이어 트레이닝 세 가지 음악 놀이와 리더보드가 펼쳐져요.',
    door: 'open',
    game: '리듬 천국 재즈 스튜디오',
    exhibit: ['again'],
  },
  {
    slug: 'toybox',
    floor: 'second',
    name: '좋아하는 것 방',
    line: '밝은 놀이 매트와 낮은 선반, 장난감 상자와 작은 텐트가 있는 아이 취향의 방이에요.',
    door: 'open',
    game: '좋아하는 것 선반',
  },
  {
    slug: 'target',
    floor: 'second',
    name: '종이공 과녁 방',
    line: '줄무늬 벽에 걸린 과녁을 향해 종이공을 던지며 노는 방이에요.',
    door: 'open',
    game: '종이공 과녁',
  },
  {
    slug: 'mind',
    floor: 'second',
    name: '생각 지도 방',
    line: '지식관리 일러스트 갤러리와 지산 에세이 책상, 메인 볼트 강의 자산 보드가 이어진 지식의 우주예요.',
    door: 'open',
    game: '생각 지도 퀴즈',
  },
  {
    slug: 'guest',
    floor: 'first',
    name: '손님방',
    line: '정돈된 침대와 개어 둔 담요, 작은 책상 위 방명록이 기다리는 조용한 방이에요.',
    door: 'open',
  },
  {
    slug: 'garage',
    floor: 'second',
    name: '작업 차고',
    line: '스타링크를 얹은 그레나디어와 AMG 쿠페, 티구안 구매 계획 도면과 AI 하네스 장비 본부가 자리한 개러지예요.',
    door: 'open',
  },
  {
    slug: 'spare',
    floor: 'second',
    name: '아직 비어 있는 방',
    line: '무엇으로 채울지 아직 고르는 중인 방이에요.',
    door: 'closed',
    opens: '채울 것이 정해지면 열어요',
  },
  {
    slug: 'attic',
    floor: 'attic',
    name: '다락',
    line: '봉인한 편지가 첫 결혼기념일에 열려요.',
    door: 'closed',
    opens: '2027년 11월 28일에 열려요',
  },
];

export const ROOM_BY_SLUG = new Map(ROOMS.map((r) => [r.slug, r]));

export const DOOR_LABEL: Record<Door, string> = {
  open: '열림',
  resting: '쉬는 중',
  family: '가족만',
  closed: '늘 닫힘',
};

/** 문패 상태의 영어(화면이 영어일 때). 방 이름은 lib/place-names, 방 안내 문장은 lib/house-lines가 옮긴다 */
export const DOOR_LABEL_EN: Record<Door, string> = {
  open: 'Open',
  resting: 'On a break',
  family: 'Family only',
  closed: 'Always closed',
};

/** 지금 언어의 문패 상태 */
export function doorLabel(lang: 'ko' | 'en', door: Door): string {
  return lang === 'en' ? DOOR_LABEL_EN[door] : DOOR_LABEL[door];
}

/** 쪽지를 받을 수 있는 방인가(문패가 열림이고 질문이 있는 방) */
export function acceptsNotes(room: Room, door: Door = room.door): boolean {
  return door === 'open' && Boolean(room.question);
}
