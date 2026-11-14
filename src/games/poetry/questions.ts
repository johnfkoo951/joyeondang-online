// 문장의 주인을 찾아라: 받은 문항 그대로(구절은 현대어에 가깝게 다듬은 판). 구절이 빈 문항은 직접 채울 자리라 출제에서 뺀다.
export type Question = { id: string; passage: string; poet: string; title: string; year: number; hint: string };

export const QUESTIONS: Question[] = [
  // 한용운 (시집 『님의 침묵』, 1926)
  { id: "han-1", passage: "님은 갔습니다. 아아, 사랑하는 나의 님은 갔습니다.", poet: "한용운", title: "님의 침묵", year: 1926, hint: "이 시인은 충청남도 홍성에서 태어났어요." },
  { id: "han-2", passage: "나는 나룻배\n당신은 행인", poet: "한용운", title: "나룻배와 행인", year: 1926, hint: "이 시인은 설악산 백담사에서 머리를 깎은 스님이었어요." },
  { id: "han-3", passage: "바람도 없는 공중에 수직의 파문을 내이며\n고요히 떨어지는 오동잎은 누구의 발자취입니까.", poet: "한용운", title: "알 수 없어요", year: 1926, hint: "이 시인은 3·1운동 때 민족대표 33인 중 한 명이었어요." },
  { id: "han-4", passage: "남들은 자유를 사랑한다지만, 나는 복종을 좋아하여요.", poet: "한용운", title: "복종", year: 1926, hint: "이 시인의 법명은 '만해(萬海)'예요." },
  { id: "han-5", passage: "'님'만 님이 아니라 기룬 것은 다 님이다.", poet: "한용운", title: "군말", year: 1926, hint: "이 시인은 끝내 조선총독부를 등지고 북향집 '심우장'을 지었어요." },
  // 정지용
  { id: "jung-1", passage: "얼룩백이 황소가\n해설피 금빛 게으른 울음을 우는 곳,", poet: "정지용", title: "향수", year: 1927, hint: "이 시인은 충청북도 옥천에서 태어났어요." },
  { id: "jung-2", passage: "그곳이 차마 꿈엔들 잊힐 리야.", poet: "정지용", title: "향수", year: 1927, hint: "이 시인의 고향 시는 훗날 노래로 만들어져 널리 불렸어요." },
  { id: "jung-3", passage: "나는 나라도 집도 없단다\n대리석 테이블에 닿는 내 뺨이 슬프구나!", poet: "정지용", title: "카페 프란스", year: 1926, hint: "이 시인은 일본 교토의 도시샤대학에서 영문학을 공부했어요." },
  { id: "jung-4", passage: "압천 십리 벌에\n해는 저물어…… 저물어……", poet: "정지용", title: "압천", year: 1927, hint: "이 시의 '압천'은 교토를 흐르는 강, 가모가와예요." },
  { id: "jung-5", passage: "말아, 다락 같은 말아,\n너는 점잔도 하다마는\n너는 왜 그리 슬퍼 뵈니?", poet: "정지용", title: "말", year: 1927, hint: "이 시인은 '한국 현대시의 아버지'로 불리며 윤동주에게도 영향을 줬어요." },
  // 김소월
  { id: "kim-1", passage: "나 보기가 역겨워\n가실 때에는\n말없이 고이 보내 드리우리다", poet: "김소월", title: "진달래꽃", year: 1922, hint: "이 시인은 평안북도 구성에서 태어났어요." },
  { id: "kim-2", passage: "산에는 꽃 피네\n꽃이 피네\n갈 봄 여름 없이\n꽃이 피네", poet: "김소월", title: "산유화", year: 1925, hint: "이 시인은 오산학교에서 스승 김억에게 시를 배웠어요." },
  { id: "kim-3", passage: "엄마야 누나야 강변 살자", poet: "김소월", title: "엄마야 누나야", year: 1922, hint: "이 시인은 서른두 살에 세상을 떠났고, 생전에 낸 시집은 단 한 권이에요." },
  { id: "kim-4", passage: "산산이 부서진 이름이여!\n허공 중에 헤어진 이름이여!", poet: "김소월", title: "초혼", year: 1925, hint: "이 시인의 본명은 김정식이에요." },
  { id: "kim-5", passage: "먼 훗날 당신이 찾으시면\n그때에 내 말이 \"잊었노라\"", poet: "김소월", title: "먼 후일", year: 1920, hint: "이 시인의 유일한 시집 제목은 그의 가장 유명한 꽃 이름과 같아요." },
  // 이상화
  { id: "lee-1", passage: "지금은 남의 땅—빼앗긴 들에도 봄은 오는가?", poet: "이상화", title: "빼앗긴 들에도 봄은 오는가", year: 1926, hint: "이 시인은 대구에서 태어났어요." },
  { id: "lee-2", passage: "가르마 같은 논길을 따라 꿈속을 가듯 걸어만 간다.", poet: "이상화", title: "빼앗긴 들에도 봄은 오는가", year: 1926, hint: "이 시인의 생가와 고택은 지금도 대구 계산동에 남아 있어요." },
  { id: "lee-3", passage: "그러나 지금은—들을 빼앗겨 봄조차 빼앗기겠네.", poet: "이상화", title: "빼앗긴 들에도 봄은 오는가", year: 1926, hint: "이 시는 잡지 『개벽』에 실린 뒤 그 잡지가 폐간되는 계기 중 하나가 됐어요." },
  { id: "lee-4", passage: "마돈나 지금은 밤도 모든 목거지에 다니노라 피곤하여 돌아가려는도다.", poet: "이상화", title: "나의 침실로", year: 1923, hint: "이 시인은 낭만주의 동인지 『백조』의 동인이었어요." },
  { id: "lee-5", passage: "마돈나 오려무나, 네 집에서 눈으로 유린된 그 밤의 나의 침실로—", poet: "이상화", title: "나의 침실로", year: 1923, hint: "이 시인은 퇴폐적 낭만에서 저항시로 넘어간 시인으로 꼽혀요." },
  // 직접 채워 넣을 자리: 윤동주 / 백석 (구절 비워 둠)
  { id: "yoon-1", passage: "", poet: "윤동주", title: "서시", year: 1941, hint: "이 시인은 북간도 명동촌에서 태어났어요." },
  { id: "yoon-2", passage: "", poet: "윤동주", title: "별 헤는 밤", year: 1941, hint: "이 시인은 해방을 반년 앞두고 후쿠오카 형무소에서 세상을 떠났어요." },
  { id: "yoon-3", passage: "", poet: "윤동주", title: "자화상", year: 1939, hint: "이 시인의 유고 시집 『하늘과 바람과 별과 시』는 1948년에 나왔어요." },
  { id: "baek-1", passage: "", poet: "백석", title: "나와 나타샤와 흰 당나귀", year: 1938, hint: "이 시인은 평안북도 정주에서 태어났어요." },
  { id: "baek-2", passage: "", poet: "백석", title: "남신의주 유동 박시봉방", year: 1948, hint: "이 시인의 본명은 백기행이에요." },
  { id: "baek-3", passage: "", poet: "백석", title: "여승", year: 1936, hint: "이 시인의 첫 시집 『사슴』은 단 100부만 찍었어요." },
];

// 정답 화면용 시인 한 줄 소개
export const POETS: Record<string, string> = {
  "한용운": "승려이자 독립운동가. 『님의 침묵』으로 '님'에 조국과 진리를 함께 담았어요.",
  "정지용": "섬세한 감각어로 한국 현대시의 문을 연 시인이에요.",
  "김소월": "민요의 가락으로 이별과 그리움을 노래한 국민 시인이에요.",
  "이상화": "관능적 낭만에서 뜨거운 저항으로 나아간 대구의 시인이에요.",
  "윤동주": "부끄러움과 맑은 양심을 노래한 시인이에요.",
  "백석": "평안도 사투리와 토속의 풍경으로 고향을 그린 시인이에요.",
};

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomFor(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** 한 판: 구절이 있는 문항만 섞어 count개, 보기는 정답 + 다른 시인 셋을 섞는다 */
export function makeQuiz(seed: number, count = 6) {
  const random = randomFor(seed);
  return shuffle(QUESTIONS.filter((q) => q.passage.trim()), random)
    .slice(0, count)
    .map((question) => ({
      question,
      choices: shuffle([question.poet, ...shuffle(Object.keys(POETS).filter((p) => p !== question.poet), random).slice(0, 3)], random),
    }));
}

export const COLLECTION_KEY = 'jy.poetry.collection.v1';

/** 이 기기의 문장 수집함(문항 id 목록). 깨졌거나 모르는 id, 구절이 빈 문항은 버린다 */
export function parseCollection(raw: string | null): string[] {
  try {
    const a: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(a)) return [];
    const ok = a.filter((v): v is string => typeof v === 'string' && QUESTIONS.some((q) => q.id === v && q.passage.trim()));
    return [...new Set(ok)].slice(0, 100);
  } catch {
    return [];
  }
}
