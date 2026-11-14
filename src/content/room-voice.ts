// 방 의견함(/voice)의 글. 가족이 방마다 지금 놓인 것에 「좋아요·바꿀래요·빼 주세요」와 한마디를 남긴다.
// 항목은 손으로 적지 않고 방 장면 데이터(room-worlds.ts)에서 뽑는다(lib/room-voice.ts). 여기에는 그 데이터에 없는 말만 둔다:
// 가구 종류의 이름, 벽·바닥과 창밖 풍경의 한 줄, 질문. 방 장면에 새 가구 종류가 생기면 KIND_LABEL에 더한다(시험이 빠진 것을 찾는다).
// 공개 묶음에 들어가므로 실명·장소·치수는 쓰지 않는다. 방 주인 이름은 서버 환경 변수(FAMILY_ROOMS_JSON)에서만 온다.

export type VoiceGroupId = 'base' | 'game' | 'spot' | 'thing' | 'view';

/**
 * 가구 종류(FurnitureKind)의 이름. group: 벽·바닥·빛(base)인지 놓인 물건(thing)인지.
 * joins: 이 가구가 곧 그 자리(놀이 'game:<id>', 순위표 'board', 전시 자리 id)의 물건이면 그 항목에 합친다
 * (그 방에 그 자리가 없으면 따로 선다).
 */
export const KIND_LABEL: Readonly<Record<string, { ko: string; en: string; group: 'base' | 'thing'; joins?: string }>> = {
  // 재즈가 흐르는 방
  slopedCeiling: { ko: '박공 경사 천장', en: 'Sloped gable ceiling', group: 'base' },
  ledRibbonWall: { ko: '빛의 리본 벽', en: 'Ribbon-of-light wall', group: 'base' },
  recordShelf: { ko: '레코드 선반', en: 'Record shelf', group: 'thing', joins: 'exhibit-gable-vinyl' },
  piano: { ko: '업라이트 피아노', en: 'Upright piano', group: 'thing' },
  bench: { ko: '벤치', en: 'Bench', group: 'thing' },
  doubleBass: { ko: '콘트라베이스', en: 'Double bass', group: 'thing' },
  musicStand: { ko: '보면대', en: 'Music stand', group: 'thing' },
  roundRug: { ko: '둥근 러그', en: 'Round rug', group: 'thing' },
  grooveStation: { ko: '재즈 패드 콘솔', en: 'Jazz pad console', group: 'thing', joins: 'game:groove' },
  earTrainerDesk: { ko: '로즈 건반 책상', en: 'Rhodes keyboard desk', group: 'thing', joins: 'game:pitch' },
  sofa: { ko: '소파', en: 'Sofa', group: 'thing' },
  coffeeTable: { ko: '커피 테이블', en: 'Coffee table', group: 'thing' },
  recordCabinet: { ko: '레코드 캐비닛', en: 'Record cabinet', group: 'thing' },
  leaderboardStand: { ko: '순위표 받침', en: 'Leaderboard stand', group: 'thing', joins: 'board' },
  armchair: { ko: '안락의자', en: 'Armchair', group: 'thing' },
  floorLamp: { ko: '스탠드 조명', en: 'Floor lamp', group: 'thing' },
  plant: { ko: '화분', en: 'Potted plant', group: 'thing' },
  pendant: { ko: '펜던트 조명', en: 'Pendant light', group: 'base' },
  // 좋아하는 것 방
  stripeWall: { ko: '줄무늬 벽', en: 'Striped wall', group: 'base' },
  playMat: { ko: '놀이 매트', en: 'Play mat', group: 'base' },
  toyShelf: { ko: '장난감 선반', en: 'Toy shelf', group: 'thing' },
  treasureTable: { ko: '보물 테이블', en: 'Treasure table', group: 'thing', joins: 'exhibit-toybox-treasure' },
  playTent: { ko: '놀이 텐트', en: 'Play tent', group: 'thing' },
  swordArcade: { ko: '황금 대검 오락기', en: 'Golden-sword arcade', group: 'thing', joins: 'game:sword' },
  blockTower: { ko: '블록 탑', en: 'Block tower', group: 'thing' },
  toyChest: { ko: '장난감 상자', en: 'Toy chest', group: 'thing' },
  kidDesk: { ko: '그림 그리는 책상', en: 'Drawing desk', group: 'thing' },
  bunting: { ko: '깃발 장식', en: 'Bunting', group: 'thing' },
  globeLantern: { ko: '동그란 등', en: 'Globe lantern', group: 'base' },
  // 종이공 과녁 방
  targets: { ko: '과녁 벽', en: 'Target wall', group: 'thing', joins: 'game:target' },
  paperBasket: { ko: '종이공 바구니', en: 'Paper-ball basket', group: 'thing' },
  trophyDesk: { ko: '도전자 책상', en: 'Challenger desk', group: 'thing', joins: 'exhibit-target-summit' },
  // 생각 지도 방
  constellationMobile: { ko: '별자리 모빌', en: 'Constellation mobile', group: 'thing' },
  rug: { ko: '러그', en: 'Rug', group: 'thing' },
  jisanDesk: { ko: '에세이 책상', en: 'Essay desk', group: 'thing', joins: 'exhibit-mind-jisan' },
  chair: { ko: '의자', en: 'Chair', group: 'thing' },
  pkmGallery: { ko: '일러스트 액자 벽', en: 'Illustration frames', group: 'thing', joins: 'exhibit-mind-illustrations' },
  lectureWall: { ko: '강의 자산 보드', en: 'Lecture board', group: 'thing', joins: 'exhibit-mind-lectures' },
  drawers9: { ko: '아홉 칸 서랍장', en: 'Nine-drawer cabinet', group: 'thing' },
  corkBoard: { ko: '코르크 보드', en: 'Cork board', group: 'thing' },
  bookWall: { ko: '책 벽', en: 'Book wall', group: 'thing' },
  // 글과 빛이 드는 곳
  lightPattern: { ko: '바닥의 빛 무늬', en: 'Light pattern on the floor', group: 'base' },
  lightShaft: { ko: '비스듬한 빛줄기', en: 'Slanting shaft of light', group: 'base' },
  windowSeat: { ko: '창가 좌석', en: 'Window seat', group: 'thing' },
  sheerCurtain: { ko: '얇은 커튼', en: 'Sheer curtain', group: 'thing' },
  sentenceLine: { ko: '문장 줄', en: 'Sentence line', group: 'thing', joins: 'game:sentences' },
  inkWritingDesk: { ko: '벼루와 붓이 놓인 서안', en: 'Ink and brush desk', group: 'thing', joins: 'game:calligraphy' },
  celadonShelf: { ko: '청자 비색 선반', en: 'Celadon shelf', group: 'thing', joins: 'exhibit-study-walnut' },
  poetryShelf: { ko: '시집 책장', en: 'Poetry bookcase', group: 'thing', joins: 'game:poetry' },
  // 손님방
  bed: { ko: '침대', en: 'Bed', group: 'thing' },
  sideTable: { ko: '협탁', en: 'Side table', group: 'thing' },
  wardrobe: { ko: '옷장', en: 'Wardrobe', group: 'thing' },
  guestDesk: { ko: '방명록 책상', en: 'Guestbook desk', group: 'thing', joins: 'exhibit-guest-welcome' },
  wallFrames: { ko: '벽 액자', en: 'Wall frames', group: 'thing' },
  // 작업 차고
  garageBayLines: { ko: '주차 라인', en: 'Parking bay lines', group: 'base' },
  garageTrackLight: { ko: '트랙 조명', en: 'Track lights', group: 'base' },
  grenadier: { ko: '그레나디어', en: 'Grenadier', group: 'thing', joins: 'exhibit-garage-grenadier' },
  mccFieldCart: { ko: '필드 카트', en: 'Field cart', group: 'thing' },
  cla45: { ko: 'AMG 쿠페', en: 'AMG coupe', group: 'thing', joins: 'exhibit-garage-cla45' },
  opsCommandRig: { ko: '장비 벤치', en: 'Gear bench', group: 'thing', joins: 'exhibit-garage-harness' },
  stool: { ko: '스툴', en: 'Stool', group: 'thing' },
  pegboard: { ko: '타공판', en: 'Pegboard', group: 'thing' },
  toolCabinet: { ko: '공구 캐비닛', en: 'Tool cabinet', group: 'thing' },
  blueprintWall: { ko: '도면 벽', en: 'Blueprint wall', group: 'thing' },
  boxShelf: { ko: '상자 선반', en: 'Box shelf', group: 'thing' },
  tiguanPlanWall: { ko: '구매 계획 도면 벽', en: 'Purchase plan wall', group: 'thing', joins: 'exhibit-garage-tiguan' },
  diecastDisplay: { ko: '다이캐스트 전시대', en: 'Die-cast display', group: 'thing', joins: 'exhibit-garage-tiguan' },
  bicycle: { ko: '자전거', en: 'Bicycle', group: 'thing' },
};

type Pair = { ko: string; en: string };

/** 방의 벽·바닥 한 줄(walk/room-windows.ts ROOM_SHELLS를 말로 옮긴 것). 마감을 바꾸면 이 줄도 고친다 */
export const ROOM_LOOK: Readonly<Record<string, Pair>> = {
  mind: { ko: '딥그린 갤러리 벽과 은빛 몰딩, 아래는 먹빛 옻칠', en: 'Deep-green gallery walls, silver molding, an ink-lacquer base' },
  garage: { ko: '노출 적벽돌 벽과 다크 에폭시 바닥', en: 'Exposed red-brick walls and a dark epoxy floor' },
  gable: { ko: '미드나잇 인디고 벽, 월넛 하단, 앰버 무대 조명', en: 'Midnight-indigo walls, a walnut base, amber stage light' },
  study: { ko: '한지 회벽과 청자 비색 하단·창틀', en: 'Paper-plaster walls with celadon trim and window frame' },
  target: { ko: '맑은 하늘빛 벽과 네이비·메이플 트림', en: 'Clear sky-blue walls with navy and maple trim' },
  toybox: { ko: '도화지 크림 벽과 코랄·골드 트림', en: 'Drawing-paper cream walls with coral and gold trim' },
  guest: { ko: '차분한 리넨 베이지 벽과 원목 몰딩', en: 'Calm linen-beige walls with wood molding' },
};

/** 창밖 풍경 한 줄(walk/room-windows.ts의 방마다 다른 바깥). 풍경을 바꾸면 이 줄도 고친다 */
export const ROOM_VIEW: Readonly<Record<string, Pair>> = {
  mind: { ko: '밤에서 새벽으로 이어지는 지식 별자리와 수묵 능선', en: 'Constellations of ideas from night to dawn over ink-wash ridges' },
  garage: { ko: '새벽 알파인 능선 도로와 위성 행렬', en: 'A dawn alpine ridge road and a line of satellites' },
  gable: { ko: '초승달 밤바다 항구와 세 가닥 빛의 리본', en: 'A crescent-moon harbor at night and three ribbons of light' },
  study: { ko: '청자 빛 안개 언덕과 오후 햇살, 종이 편지 새', en: 'Celadon misty hills, afternoon sun, paper letter birds' },
  target: { ko: '큰 바위산 봉우리와 초록 언덕 트랙, 열기구', en: 'A great rock peak, a green hill track, hot-air balloons' },
  toybox: { ko: '노을 바닷가 조개섬과 색색 조약돌 언덕, 종이배', en: 'A sunset shell island, pebble hills, paper boats' },
  guest: { ko: '달빛 소나무 정원과 돌등 불빛', en: 'A moonlit pine garden lit by stone lanterns' },
};

/** 아이 말투로 묻는 방 */
export const KID_ROOMS: ReadonlySet<string> = new Set(['toybox', 'target']);

/** 방 장면은 없지만 의견을 받는 방(무엇으로 채울지 묻는다) */
export const VOICE_EXTRA_ROOMS: readonly string[] = ['spare'];

export type Mark = 'keep' | 'change' | 'remove';
export const MARKS: readonly Mark[] = ['keep', 'change', 'remove'];

export const MARK_LABEL: Readonly<Record<'adult' | 'kid', Record<Mark, Pair>>> = {
  adult: {
    keep: { ko: '좋아요', en: 'Keep' },
    change: { ko: '바꿀래요', en: 'Change' },
    remove: { ko: '빼 주세요', en: 'Remove' },
  },
  kid: {
    keep: { ko: '좋아', en: 'Keep' },
    change: { ko: '바꿀래', en: 'Change' },
    remove: { ko: '없애 줘', en: 'Remove' },
  },
};

export const GROUP_LABEL: Readonly<Record<'adult' | 'kid', Record<VoiceGroupId, Pair>>> = {
  adult: {
    base: { ko: '벽·바닥·빛', en: 'Walls, floor and light' },
    game: { ko: '놀이', en: 'Games' },
    spot: { ko: '전시와 순위표', en: 'Displays and leaderboards' },
    thing: { ko: '놓여 있는 것', en: 'Things in the room' },
    view: { ko: '창밖 풍경', en: 'View from the window' },
  },
  kid: {
    base: { ko: '벽이랑 바닥', en: 'Walls and floor' },
    game: { ko: '놀이', en: 'Games' },
    spot: { ko: '보물이랑 순위표', en: 'Treasures and leaderboards' },
    thing: { ko: '방에 있는 것', en: 'Things in the room' },
    view: { ko: '창밖', en: 'Outside the window' },
  },
};

export type VoiceQuestion = { id: string; ko: string; en: string; hintKo?: string; hintEn?: string; long?: boolean };

export const ADULT_QUESTIONS: readonly VoiceQuestion[] = [
  { id: 'name', ko: '방 이름', en: 'Room name', hintKo: '지금 이름이 좋으면 비워 두세요.', hintEn: 'Leave blank to keep the current name.' },
  { id: 'add', ko: '새로 들이고 싶은 것', en: 'Something new to add', hintKo: '물건, 걸어 둘 사진이나 글, 놀이, 소리 무엇이든 좋아요.', hintEn: 'An object, a photo or text to hang, a game, a sound.', long: true },
  { id: 'mood', ko: '색과 분위기', en: 'Colors and mood', hintKo: '좋아하는 색 두세 가지와 분위기 낱말(아늑한, 조용한, 반짝이는…).', hintEn: 'Two or three colors and a few mood words.' },
  { id: 'view', ko: '창밖 풍경', en: 'View from the window', hintKo: '지금 풍경 그대로 둘지, 다른 풍경이 보였으면 하는지.', hintEn: 'Keep the current view, or see something else?' },
  { id: 'play', ko: '손님이 이 방에서 해 볼 일', en: 'Something guests can do here', hintKo: '놀이, 작은 이벤트, 손님에게 남겨 달라고 할 한 줄 질문.', hintEn: 'A game, a small event, or a question for guests.', long: true },
  { id: 'greet', ko: '문패 아래 환영 인사', en: 'Welcome line under the door sign', hintKo: '손님이 문을 열 때 보는 한마디.', hintEn: 'What guests read as they open the door.' },
  { id: 'note', ko: '그 밖에', en: 'Anything else', hintKo: '싫은 것, 꼭 빼 줬으면 하는 것. 참고 사진은 따로 보내 주세요.', hintEn: 'Anything you dislike. Send reference photos separately.', long: true },
];

export const KID_QUESTIONS: readonly VoiceQuestion[] = [
  { id: 'name', ko: '방 이름을 바꾸고 싶어?', en: 'Want a new room name?', hintKo: '지금 이름이 좋으면 비워 둬.', hintEn: 'Leave blank to keep it.' },
  { id: 'add', ko: '방에 새로 넣고 싶은 거는?', en: 'What would you add?', hintKo: '장난감, 그림, 놀이, 뭐든 좋아.', hintEn: 'Toys, pictures, games, anything.', long: true },
  { id: 'mood', ko: '무슨 색이면 좋겠어?', en: 'What colors do you like?' },
  { id: 'view', ko: '창밖에 뭐가 보였으면 좋겠어?', en: 'What should you see outside?' },
  { id: 'play', ko: '친구가 오면 같이 하고 싶은 놀이는?', en: 'What would you play with friends?', long: true },
  { id: 'greet', ko: '문에 쓰고 싶은 한마디', en: 'A line for your door' },
];

/** 방마다 더 묻는 것(after: 그 질문 바로 뒤에) */
export const EXTRA_QUESTIONS: Readonly<Record<string, { after: string; q: VoiceQuestion }>> = {
  toybox: { after: 'add', q: { id: 'sword', ko: '소드 콘티넌트 다음 판에 넣고 싶은 것', en: 'Ideas for the next Sword Continent', hintKo: '새 왕국, 보스, 스킨, 무기, 뭐든!', hintEn: 'A new kingdom, boss, skin, weapon, anything!', long: true } },
  gable: { after: 'add', q: { id: 'music', ko: '더 넣고 싶은 음악 놀이나 곡', en: 'Music games or songs to add', hintKo: '연습하고 있는 곡, 손님과 같이 해 보고 싶은 합주.', hintEn: 'A piece you are practicing, a jam to try with guests.', long: true } },
  spare: { after: 'name', q: { id: 'fill', ko: '이 방을 무엇으로 채울까요?', en: 'What should fill this room?', hintKo: '누구의 방인지, 어떤 일을 하는 곳인지.', hintEn: 'Whose room it is and what happens here.', long: true } },
};

/** 방의 질문 목록(아이 방이면 아이 말투, 방마다 더 묻는 것을 끼운다) */
export function voiceQuestions(slug: string): VoiceQuestion[] {
  const base = [...(KID_ROOMS.has(slug) ? KID_QUESTIONS : ADULT_QUESTIONS)];
  const extra = EXTRA_QUESTIONS[slug];
  if (!extra) return base;
  const at = base.findIndex((q) => q.id === extra.after);
  base.splice(at < 0 ? base.length : at + 1, 0, extra.q);
  return base;
}
