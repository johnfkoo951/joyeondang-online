// 장소 이름의 영어(층 표시·문패·지도·방 이름). 집 데이터의 이름은 한국어로 오므로 화면이 영어일 때 이 표로 옮긴다.
// 통째로 맞는 이름을 먼저 찾고, 「1층 거실」처럼 층이 붙었으면 층(1F)과 나머지를 따로 옮긴다. 모르는 이름은 한국어 그대로 둔다
// (사람이 지은 방 이름일 수 있다). 이름을 새로 지으면 여기에 함께 더한다.

const EXACT: Readonly<Record<string, string>> = {
  '문장의 주인을 찾아라': 'Find the poet',
  '글씨의 주인을 찾아라': 'Trace a constant heart',
  '창가에서 수채 그림그리기': 'Watercolors by the window',
  이젤: 'Easel',
  거실: 'Living room',
  '거실 무대': 'Living room stage',
  계단: 'Stairs',
  '계단 홀': 'Stair hall',
  계단참: 'Stair landing',
  '닫힌 방': 'Closed room',
  발코니: 'Balcony',
  복도: 'Hallway',
  '오른쪽 복도': 'Right hallway',
  '왼쪽 전실': 'Left anteroom',
  '글과 빛이 드는 곳': 'Words and light',
  '빛이 드는 방': 'Sunlit room',
  '창이 큰 방': 'Big window room',
  '작은 방': 'Small room',
  '생각 지도 방': 'Mind map room',
  '생각 지도 퀴즈': 'Mind map quiz',
  '재즈가 흐르는 방': 'Jazz room',
  '종이공 과녁 방': 'Paper ball target room',
  '좋아하는 것 방': 'Favorite things room',
  '좋아하는 것 선반': 'Favorite things shelf',
  '아직 비어 있는 방': 'Room still empty',
  '사계절 창 방': 'Four seasons room',
  '박공 아래 거실': 'Living room under the gable',
  '박공 아래 잼': 'Jam under the gable',
  // 방 놀이 이름(방 장면의 살피기 자리 제목, 방 안내의 놀이 이름)
  '종이공 과녁': 'Paper ball target',
  '문장 걸어 두기': 'Hang a sentence',
  '누구의 문장일까': 'Whose sentence is it?',
  '세 아치 입장': 'Three-arch entrance',
  // 구역 밖(집 이름으로 부를 때)
  조연당: 'Joyeondang',
  손님방: 'Guest room',
  주방: 'Kitchen',
  '주방과 식탁': 'Kitchen and table',
  다락: 'Attic',
  현관: 'Entrance',
  '현관 홀': 'Entrance hall',
  포치: 'Porch',
  '세 아치 포치': 'Three-arch porch',
  '작업 차고': 'Workshop garage',
  마당: 'Yard',
  앞마당: 'Front yard',
  '앞마당 소나무': 'Front yard pine',
  석등: 'Stone lantern',
  포토존: 'Photo spot',
  '결혼식 무대': 'Wedding stage',
  방명록: 'Guestbook',
  '나가는 문': 'Exit',
  '작은 북': 'Little drum',
  별: 'Star',
  '2층으로': 'To 2F',
  // 일곱 방 세계관(v0.5.0)의 전시물·리더보드 이름
  "소드 콘티넌트": "The Sword Continent",
  "리듬 천국 재즈 스튜디오": "Jazz rhythm studio",
  "재즈 이어 트레이닝 · 음정과 화성": "Jazz ear training · Intervals & harmony",
  "재즈 레코드 & 무대 리본 노트": "Jazz records & stage ribbon notes",
  "재즈 스튜디오 리더보드": "Jazz studio leaderboard",
  "바닷가 조개 & 예쁜 돌 보물상자": "Seashell & pretty stone treasure box",
  "좋아하는 것 방 리더보드": "Favorite things room leaderboard",
  "만능 도전자 책상 & 첫 노트": "All-round challenger's desk & first notes",
  "종이공 과녁 리더보드": "Paper ball target leaderboard",
  "지산(紙散) 에세이 & 개념 책상": "Jisan (紙散) essays & concept desk",
  "메인 볼트 강의 자산 아카이브": "Main vault lecture archive",
  "지식관리 일러스트 갤러리": "Knowledge management illustration gallery",
  "생각 지도 퀴즈 리더보드": "Mind map quiz leaderboard",
  "청자 비색 선반 & 호두 오브제": "Celadon shelf & walnut ornament",
  "문장 퍼즐 리더보드": "Sentence puzzle leaderboard",
  "손님맞이 다기 세트 & 안내첩": "Welcome tea set & guest notes",
  "이네오스 그레나디어 · 스타링크 이동식 작전 본부": "INEOS Grenadier · Starlink mobile command post",
  "메르세데스-AMG CLA 45 · 퍼포먼스 쿠페": "Mercedes-AMG CLA 45 · Performance coupe",
  "멀티디바이스 AI 하네스 & 장비 설계 본부": "Multi-device AI harness & gear design HQ",
  "구매 계획 도면(X3 취소 → 티구안 확정!) & 다이캐스트": "Purchase plan drawing (X3 out → Tiguan in!) & die-cast",
};

/** 장소 이름의 영어. 모르면 받은 이름 그대로 */
export function placeEn(name: string): string {
  const s = String(name ?? '').trim();
  if (!s) return s;
  const hit = EXACT[s];
  if (hit) return hit;
  const floor = /^([12])층(?:\s*(.*))?$/.exec(s);
  if (floor) {
    const rest = (floor[2] ?? '').trim();
    if (!rest) return `${floor[1]}F`;
    const en = placeEn(rest);
    // 나머지를 모르면 층만 옮기지 않는다(한국어와 영어가 섞여 보이지 않게)
    return en === rest ? s : `${floor[1]}F ${en}`;
  }
  return s;
}

/** 지금 언어의 장소 이름 */
export function placeName(lang: 'ko' | 'en', name: string): string {
  return lang === 'en' ? placeEn(name) : name;
}

/** 시험용: 표에 있는 이름들 */
export const PLACE_EN_KEYS: readonly string[] = Object.keys(EXACT);
