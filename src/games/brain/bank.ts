// 생각 지도 퀴즈 문제은행. 근거는 공개된 CMDS 아홉 분류 설명(100~900과 그 아래 칸)뿐이다.
// 카드마다 정답 서랍 번호(drawer, 1~9)와 실제 하위 칸 번호(code)를 적는다. code의 백의 자리 = drawer.
// 사람 이름·고객사명·장소명은 쓰지 않는다. 화면 글에 엠대시를 쓰지 않는다(시험이 검사).

export type DrawerNo = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Drawer = {
  no: DrawerNo;
  /** 100, 200 … 900 */
  code: number;
  /** 서랍 이름(짧게) */
  name: string;
  /** 공개 문서의 영어 이름 */
  en: string;
  /** 서랍 앞에 붙는 한 줄(무엇이 드는지) */
  hint: string;
  /** 서랍 안내에 쓰는 조금 긴 설명 */
  about: string;
};

export type Card = {
  id: string;
  /** 낱말 카드·하위 서랍 이름 */
  label: string;
  drawer: DrawerNo;
  /** 공개 문서의 하위 칸 번호(예: 240) */
  code: number;
  /** 짧은 풀이 */
  why: string;
};

export type StageId = 'connect' | 'merge' | 'develop' | 'share';
export type Stage = { id: StageId; name: string; en: string; about: string };
export type Example = { id: string; stage: StageId; text: string };

export type KidsDrawerId = 'read' | 'screen' | 'make';
export type KidsDrawer = { id: KidsDrawerId; drawer: DrawerNo; name: string };
export type Picture = 'book' | 'books' | 'laptop' | 'phone' | 'paint' | 'music';
export type KidsCard = { id: Picture; name: string; to: KidsDrawerId; why: string };

export type Bank = {
  drawers: Drawer[];
  cards: Card[];
  stages: Stage[];
  examples: Example[];
  kidsDrawers: KidsDrawer[];
  kidsCards: KidsCard[];
};

export const DRAWERS: Drawer[] = [
  { no: 1, code: 100, name: '주제', en: 'Themes', hint: '관심사·주제·변수·용어',
    about: '궁금한 것이 처음 들어오는 서랍이에요. 관심사, 탐구할 주제, 연구 변수, 낯선 용어를 모아요.' },
  { no: 2, code: 200, name: '문헌', en: 'Literature', hint: '개념·이론·문헌·책',
    about: '밖에서 읽은 지식을 내 이해로 엮는 서랍이에요. 개념, 프레임워크, 모형, 이론, 고전, 문헌 리뷰, 책 노트, 나만의 통찰.' },
  { no: 3, code: 300, name: '데이터', en: 'Data', hint: '데이터·설문·DB',
    about: '재고 모은 자료를 다루는 서랍이에요. 척도, 설문지, 패널 데이터, 데이터 관리, 데이터베이스.' },
  { no: 4, code: 400, name: '방법론', en: 'Methodologies', hint: '연구 방법·통계·코드·프롬프트',
    about: '자료를 분석하고 일을 해내는 방법의 서랍이에요. 연구 설계, 양적·질적 연구, 통계, 머신러닝, 코드, 프롬프트, 스크립트.' },
  { no: 5, code: 500, name: '도구', en: 'Products', hint: '옵시디언·ChatGPT·Claude 같은 도구',
    about: '쓰는 도구를 익히는 서랍이에요. 옵시디언, 노션, ChatGPT, Claude, Gemini, 그림 AI, 자동화 도구.' },
  { no: 6, code: 600, name: '전문 분야', en: 'Specialties', hint: '지식관리·세컨드 브레인·생성형 AI',
    about: '오래 깊게 파는 분야의 서랍이에요. 지식관리, 세컨드 브레인, 제텔카스텐, 생산성, 생성형 AI, 개발, 교육.' },
  { no: 7, code: 700, name: '창작', en: 'Creatives', hint: '유튜브·SNS·음악·디자인',
    about: '지식을 표현으로 바꾸는 서랍이에요. 유튜브, SNS, 음악, 재즈, 이미지, 디지털 아트와 디자인.' },
  { no: 8, code: 800, name: '산출물', en: 'Outputs', hint: '논문·글·책·강의·컨설팅',
    about: '남에게 내놓는 결과물의 서랍이에요. 논문, 글, 책 원고, 웹페이지, 연구, 학회 발표, 컨설팅, 강의, 커리큘럼.' },
  { no: 9, code: 900, name: '부문', en: 'Divisions', hint: '일하는 부문',
    about: '이 모든 일을 나눠 맡아 꾸리는 일의 부문이에요. 연구, 글쓰기, 가르치기, 창작, 분석, 협력, 개발, 행사, 컨설팅 부문.' },
];

/** 생각이 자라는 순서. 배열 순서가 정답 순서다 */
export const STAGES: Stage[] = [
  { id: 'connect', name: '연결', en: 'Connect', about: '새 생각과 낯선 용어를 만나 붙잡아 둬요. 주로 100 주제 서랍.' },
  { id: 'merge', name: '합치기', en: 'Merge', about: '읽은 것들을 내 이해로 엮어 하나로 합쳐요. 주로 200 문헌 서랍.' },
  { id: 'develop', name: '키우기', en: 'Develop', about: '자료와 방법과 도구로 실제로 만들고 깊게 파요. 300부터 600까지의 서랍.' },
  { id: 'share', name: '나누기', en: 'Share', about: '글, 영상, 강의로 남과 나눠요. 700 창작과 800 산출물 서랍.' },
];

export const EXAMPLES: Example[] = [
  { id: 'c1', stage: 'connect', text: '처음 들은 용어를 카드에 적어 둔다' },
  { id: 'c2', stage: 'connect', text: '궁금해진 주제를 관심사 목록에 더한다' },
  { id: 'c3', stage: 'connect', text: '읽다가 마음에 걸린 낱말에 표시해 둔다' },
  { id: 'm1', stage: 'merge', text: '책 세 권의 생각을 노트 하나로 엮는다' },
  { id: 'm2', stage: 'merge', text: '비슷한 개념끼리 잇고 내 말로 다시 쓴다' },
  { id: 'm3', stage: 'merge', text: '여러 글에서 모은 이론에 내 해석을 붙인다' },
  { id: 'd1', stage: 'develop', text: '설문을 만들어 자료를 모은다' },
  { id: 'd2', stage: 'develop', text: '프롬프트를 짜서 도구로 시험해 본다' },
  { id: 'd3', stage: 'develop', text: '분석 코드를 돌려 결과를 확인한다' },
  { id: 's1', stage: 'share', text: '정리한 내용으로 강의를 연다' },
  { id: 's2', stage: 'share', text: '배운 것을 글로 써서 내보낸다' },
  { id: 's3', stage: 'share', text: '알게 된 것을 영상으로 만들어 올린다' },
];

/** 어린아이 판: 그림 카드 여섯 장을 같은 색 서랍 셋에 */
export const KIDS_DRAWERS: KidsDrawer[] = [
  { id: 'read', drawer: 2, name: '책 서랍' },
  { id: 'screen', drawer: 5, name: '화면 서랍' },
  { id: 'make', drawer: 7, name: '만들기 서랍' },
];

export const KIDS_CARDS: KidsCard[] = [
  { id: 'book', name: '그림책', to: 'read', why: '책은 읽는 것이라 200 문헌 서랍에 넣어요.' },
  { id: 'books', name: '책 더미', to: 'read', why: '책이 여러 권이어도 200 문헌 서랍이에요.' },
  { id: 'laptop', name: '컴퓨터', to: 'screen', why: '컴퓨터는 쓰는 도구라 500 도구 서랍에 넣어요.' },
  { id: 'phone', name: '휴대폰', to: 'screen', why: '휴대폰도 도구라 500 도구 서랍이에요.' },
  { id: 'paint', name: '물감과 붓', to: 'make', why: '그림 그리기는 만드는 일이라 700 창작 서랍이에요.' },
  { id: 'music', name: '노래', to: 'make', why: '노래 부르기도 만드는 일이라 700 창작 서랍이에요.' },
];

/** 낱말 카드이자 하위 서랍. 1판(서랍 넣기)과 3판(짝 잇기)이 여기서 서로 겹치지 않게 고른다 */
export const CARDS: Card[] = [
  { id: 'interests', label: '관심사', drawer: 1, code: 101, why: '마음이 끌리는 것은 생각의 첫 씨앗이라 100 주제 서랍에 둬요.' },
  { id: 'topics', label: '탐구할 주제', drawer: 1, code: 102, why: '살펴보고 싶은 주제는 아직 자라기 전이라 100 주제 서랍에 둬요.' },
  { id: 'variables', label: '연구 변수', drawer: 1, code: 103, why: '재어 보고 싶은 개념, 곧 변수도 처음엔 100 주제 서랍에서 시작해요.' },
  { id: 'terms', label: '처음 본 용어', drawer: 1, code: 104, why: '낯선 용어와 그 뜻은 100 주제 서랍의 용어 칸에 모아요.' },
  { id: 'concepts', label: '개념', drawer: 2, code: 201, why: '남이 다듬어 둔 개념을 내 이해로 엮는 곳이 200 문헌 서랍이에요.' },
  { id: 'frameworks', label: '프레임워크', drawer: 2, code: 202, why: '생각을 짜는 틀은 이론 쪽이라 200 문헌 서랍에 둬요.' },
  { id: 'models', label: '분석 모형', drawer: 2, code: 203, why: '현상을 설명하는 모형은 200 문헌 서랍의 모형 칸에 들어가요.' },
  { id: 'theories', label: '이론', drawer: 2, code: 204, why: '이미 세워진 이론은 문헌에서 배우는 것이라 200 문헌 서랍이에요.' },
  { id: 'classics', label: '고전', drawer: 2, code: 205, why: '오래 읽혀 온 바탕 글은 200 문헌 서랍의 고전 칸에 둬요.' },
  { id: 'reviews', label: '문헌 리뷰', drawer: 2, code: 210, why: '여러 글을 읽고 묶어 정리한 리뷰는 200 문헌 서랍이에요.' },
  { id: 'insights', label: '나만의 통찰', drawer: 2, code: 220, why: '읽은 것에서 얻은 내 해석도 문헌 곁, 200 문헌 서랍에 둬요.' },
  { id: 'booknotes', label: '책 노트', drawer: 2, code: 240, why: '책을 읽고 남긴 노트는 200 문헌 서랍의 책 칸에 들어가요.' },
  { id: 'scales', label: '척도 개발', drawer: 3, code: 301, why: '무언가를 재는 잣대를 만들고 검증하는 일은 300 데이터 서랍이에요.' },
  { id: 'surveys', label: '설문지', drawer: 3, code: 302, why: '응답을 모으는 설문지는 자료를 만드는 것이라 300 데이터 서랍이에요.' },
  { id: 'panel', label: '패널 데이터', drawer: 3, code: 303, why: '같은 대상을 오래 따라가며 모은 자료는 300 데이터 서랍이에요.' },
  { id: 'datamgmt', label: '데이터 관리', drawer: 3, code: 310, why: '자료를 정리하고 보관하는 흐름은 300 데이터 서랍에 둬요.' },
  { id: 'database', label: '데이터베이스', drawer: 3, code: 311, why: '자료를 담는 데이터베이스 설계는 300 데이터 서랍이에요.' },
  { id: 'lms', label: '학습 관리 시스템(LMS)', drawer: 3, code: 330, why: '배움의 기록이 쌓이는 학습 관리 시스템은 300 데이터 서랍에 둬요.' },
  { id: 'design', label: '연구 설계', drawer: 4, code: 401, why: '연구를 어떻게 짤지 정하는 원리는 400 방법론 서랍이에요.' },
  { id: 'quant', label: '양적 연구', drawer: 4, code: 402, why: '숫자로 재고 분석하는 연구 방식은 400 방법론 서랍이에요.' },
  { id: 'experiment', label: '실험 연구', drawer: 4, code: 403, why: '조건을 바꿔 보며 효과를 살피는 방식은 400 방법론 서랍이에요.' },
  { id: 'qual', label: '질적 연구', drawer: 4, code: 404, why: '인터뷰와 관찰로 뜻을 읽어 내는 방식도 400 방법론 서랍이에요.' },
  { id: 'mixed', label: '혼합 연구', drawer: 4, code: 405, why: '양적 방법과 질적 방법을 함께 쓰는 설계는 400 방법론 서랍이에요.' },
  { id: 'inference', label: '통계적 추론', drawer: 4, code: 410, why: '표본으로 전체를 짐작하는 통계 방법은 400 방법론 서랍이에요.' },
  { id: 'regression', label: '회귀 분석', drawer: 4, code: 411, why: '변수 사이의 관계를 재는 분석 방법이라 400 방법론 서랍이에요.' },
  { id: 'causal', label: '인과 추론', drawer: 4, code: 412, why: '원인과 결과를 가려내는 분석 방법이라 400 방법론 서랍이에요.' },
  { id: 'ml', label: '머신러닝', drawer: 4, code: 420, why: '자료에서 규칙을 배우게 하는 분석 방법이라 400 방법론 서랍이에요.' },
  { id: 'codes', label: '코드 조각', drawer: 4, code: 491, why: '분석과 자동화에 쓰는 코드는 방법을 실행하는 것이라 400 방법론 서랍이에요.' },
  { id: 'prompts', label: '프롬프트', drawer: 4, code: 492, why: 'AI에게 일을 맡기는 프롬프트는 일하는 방법이라 400 방법론 서랍이에요.' },
  { id: 'scripts', label: '자동화 스크립트', drawer: 4, code: 493, why: '되풀이하는 일을 맡기는 스크립트는 400 방법론 서랍이에요.' },
  { id: 'obsidian', label: '옵시디언', drawer: 5, code: 501, why: '노트를 쓰고 잇는 도구 자체는 500 도구 서랍에서 익혀요.' },
  { id: 'notion', label: '노션', drawer: 5, code: 502, why: '일을 관리하는 도구라 500 도구 서랍이에요.' },
  { id: 'chatgpt', label: 'ChatGPT', drawer: 5, code: 520, why: '대화형 AI 도구 하나하나는 500 도구 서랍에 둬요.' },
  { id: 'claude', label: 'Claude', drawer: 5, code: 521, why: '글쓰기와 분석을 돕는 AI 도구라 500 도구 서랍이에요.' },
  { id: 'gemini', label: 'Gemini', drawer: 5, code: 522, why: '여러 일을 돕는 AI 도구라 500 도구 서랍이에요.' },
  { id: 'midjourney', label: 'Midjourney', drawer: 5, code: 530, why: '그림을 만들어 주는 AI 도구라 500 도구 서랍이에요.' },
  { id: 'n8n', label: 'n8n 자동화', drawer: 5, code: 541, why: '일과 일을 자동으로 잇는 도구라 500 도구 서랍이에요.' },
  { id: 'km', label: '지식관리', drawer: 6, code: 601, why: '지식을 다루는 법을 오래 깊게 파는 분야라 600 전문 분야 서랍이에요.' },
  { id: 'secondbrain', label: '세컨드 브레인', drawer: 6, code: 603, why: '지식을 바깥에 쌓아 두는 체계를 깊이 다루는 분야라 600 전문 분야 서랍이에요.' },
  { id: 'zettel', label: '제텔카스텐', drawer: 6, code: 604, why: '작은 메모를 이어 생각을 키우는 노트법 분야라 600 전문 분야 서랍이에요.' },
  { id: 'productivity', label: '생산성', drawer: 6, code: 610, why: '일을 잘 해내는 체계를 깊이 다루는 분야라 600 전문 분야 서랍이에요.' },
  { id: 'genai', label: '생성형 AI', drawer: 6, code: 620, why: '생성형 AI라는 분야 전체는 600, ChatGPT 같은 도구 하나는 500 서랍이에요.' },
  { id: 'dev', label: '소프트웨어 개발', drawer: 6, code: 630, why: '프로그램을 만드는 일을 깊이 익히는 분야라 600 전문 분야 서랍이에요.' },
  { id: 'education', label: '교육 이론과 실천', drawer: 6, code: 680, why: '가르치고 배우는 일을 깊이 다루는 분야라 600 전문 분야 서랍이에요.' },
  { id: 'youtube', label: '유튜브', drawer: 7, code: 701, why: '영상으로 표현하고 나누는 창작은 700 창작 서랍이에요.' },
  { id: 'sns', label: 'SNS', drawer: 7, code: 710, why: '짧은 글과 그림으로 나누는 창작이라 700 창작 서랍이에요.' },
  { id: 'music', label: '음악', drawer: 7, code: 720, why: '곡을 짓고 연주하는 일은 700 창작 서랍이에요.' },
  { id: 'jazz', label: '재즈', drawer: 7, code: 721, why: '재즈 이론과 연주도 음악 곁, 700 창작 서랍이에요.' },
  { id: 'images', label: '이미지', drawer: 7, code: 730, why: '눈으로 보는 시각 콘텐츠는 700 창작 서랍이에요.' },
  { id: 'art', label: '디지털 아트와 디자인', drawer: 7, code: 731, why: 'AI 그림과 디자인 작업은 700 창작 서랍이에요.' },
  { id: 'phd', label: '박사 논문', drawer: 8, code: 801, why: '마침내 내놓는 연구 결과물이라 800 산출물 서랍이에요.' },
  { id: 'articles', label: '기고 글', drawer: 8, code: 802, why: '밖에 내보낸 글은 800 산출물 서랍이에요.' },
  { id: 'bookms', label: '책 원고', drawer: 8, code: 803, why: '읽은 책 노트는 200, 내가 쓰는 책 원고는 800 산출물 서랍이에요.' },
  { id: 'community', label: '커뮤니티', drawer: 8, code: 804, why: '사람들과 함께 꾸려 내놓는 모임 활동도 800 산출물 서랍이에요.' },
  { id: 'groupstudy', label: '스터디 모임', drawer: 8, code: 805, why: '함께 배우려고 꾸린 모임과 그 자료는 800 산출물 서랍이에요.' },
  { id: 'webpages', label: '웹페이지', drawer: 8, code: 806, why: '사람들에게 보여 주는 웹 결과물은 800 산출물 서랍이에요.' },
  { id: 'research', label: '연구 프로젝트', drawer: 8, code: 820, why: '결과를 내기 위해 꾸린 연구는 800 산출물 서랍이에요.' },
  { id: 'journals', label: '학술지 논문', drawer: 8, code: 821, why: '학술지에 싣는 논문은 800 산출물 서랍이에요.' },
  { id: 'conference', label: '학회 발표', drawer: 8, code: 822, why: '사람들 앞에서 내놓는 연구 발표는 800 산출물 서랍이에요.' },
  { id: 'consulting', label: '컨설팅 보고서', drawer: 8, code: 831, why: '의뢰한 곳에 건네는 컨설팅 결과물은 800 산출물 서랍이에요.' },
  { id: 'lectures', label: '강의', drawer: 8, code: 840, why: '가르치려고 만든 강의와 그 자료는 800 산출물 서랍이에요.' },
  { id: 'curriculum', label: '커리큘럼', drawer: 8, code: 841, why: '과정 전체를 짠 설계도는 800 산출물 서랍이에요.' },
  { id: 'div-km', label: '지식관리·연구 부문', drawer: 9, code: 901, why: '연구와 지식관리를 맡아 꾸리는 일의 부문이라 900 부문 서랍이에요.' },
  { id: 'div-writing', label: '글쓰기·출판 부문', drawer: 9, code: 902, why: '글쓰기와 출판을 맡는 일의 부문이라 900 부문 서랍이에요.' },
  { id: 'div-teaching', label: '가르치기·커리큘럼 부문', drawer: 9, code: 903, why: '가르치는 일을 맡는 부문이라 900, 강의 자료 하나하나는 800 서랍이에요.' },
  { id: 'div-creative', label: '창작·미디어 부문', drawer: 9, code: 904, why: '창작과 미디어 일을 맡는 부문이라 900 부문 서랍이에요.' },
  { id: 'div-analytics', label: '연구 방법·분석 부문', drawer: 9, code: 905, why: '분석 일을 맡는 부문이라 900, 분석 방법 자체는 400 서랍이에요.' },
  { id: 'div-partners', label: '협력·네트워크 부문', drawer: 9, code: 906, why: '함께 일할 곳을 잇는 일의 부문이라 900 부문 서랍이에요.' },
  { id: 'div-product', label: '제품·개발 부문', drawer: 9, code: 907, why: '제품을 만드는 일을 맡는 부문이라 900 부문 서랍이에요.' },
  { id: 'div-events', label: '행사·커뮤니티 부문', drawer: 9, code: 908, why: '행사와 모임을 꾸리는 일의 부문이라 900 부문 서랍이에요.' },
  { id: 'div-consulting', label: '컨설팅·자문 부문', drawer: 9, code: 909, why: '자문 일을 맡는 부문이라 900, 보고서 하나하나는 800 서랍이에요.' },
];

export const BANK: Bank = {
  drawers: DRAWERS,
  cards: CARDS,
  stages: STAGES,
  examples: EXAMPLES,
  kidsDrawers: KIDS_DRAWERS,
  kidsCards: KIDS_CARDS,
};
