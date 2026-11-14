// 집 안내 문장의 영어(살피기 자리 한 줄, 방 안내·질문·여는 때, 층 안내). 집 데이터의 문장은 한국어로 오므로 화면이 영어일 때
// 이 표로 옮긴다. 이름은 place-names.ts가 맡고, 여기는 문장만. 통째로 맞는 문장만 옮기고 모르는 문장은 한국어 그대로 둔다
// (가족이 새로 쓴 안내일 수 있다: 그 자리는 lang="ko"로 남긴다). 문장을 새로 쓰면 여기에 함께 더한다(시험이 빠진 문장을 찾는다).

const EXACT: Readonly<Record<string, string>> = {
  '시 구절을 읽고 네 개의 낙관 중 시인을 골라요. 여섯 문장 뒤에 오늘의 문장을 만나요.': 'Read a verse and choose its poet from four seals. After six questions, receive a sentence for today.',
  '서안 위 체본을 따라 恒常心을 쓰고 나만의 낙관을 찍어요.': 'Trace 恒常心 on the writing desk and finish with your own seal.',
  '거실 창가의 이젤에서 물감을 겹쳐 그리고 내 그림을 내려받아요.': 'Layer watercolor washes on the living-room easel and download your painting.',
  '한지 벽에 창 하나로 빛줄기가 비스듬히 들고, 시집과 벼루 놓인 서안이 놀이의 입구가 되는 방이에요.': 'Light slants through a single window onto paper walls; a poetry book and an ink desk open the games here.',
  // 다시 그린 집의 살피기 자리
  '세 개의 아치 가운데 하나로 들어와요.': 'Come in through one of the three arches.',
  '쪽지를 걸어 두는 나무예요.': 'A tree for hanging notes.',
  '남겨 주신 종이만큼 불이 밝아져요.': 'It glows brighter with every note you leave.',
  '신발을 벗고 이름표를 달아요.': 'Take off your shoes and put on a name tag.',
  '이 집에 사는 다섯 사람을 소개하는 작은 무대예요.': 'A little stage that introduces the five people who live here.',
  '창틀에 그림엽서를 그리는 방.': 'A room for drawing postcards on the window frame.',
  '바닥에 드는 빛 무늬 아래 좋은 문장을 걸어 두는 방이에요.': 'A room for hanging good sentences under patterns of light on the floor.',
  '함께 차리는 식탁.': 'A table we set together.',
  '정돈된 침대와 방명록 책상이 있는 조용한 방이에요.': 'A quiet room with a tidy bed and a guestbook desk.',
  '계단을 오르면 박공 아래 거실이에요.': 'Up the stairs is the living room under the gable.',
  '경사진 천장 아래 레코드와 피아노가 있는 재즈 방이에요.': 'A jazz room with records and a piano under a sloped ceiling.',
  '밝은 놀이 매트와 낮은 선반, 작은 텐트가 있는 아이 취향의 방이에요.': 'A room for kids, with a bright play mat, low shelves, and a little tent.',
  '종이공을 던져 과녁을 맞히는 놀이방이에요.': 'A playroom where you throw paper balls at targets.',
  '벽 가득 책과 실로 이은 카드가 있는 서재예요.': 'A study with walls of books and cards linked by string.',
  '작업대와 공구 벽, 상자 선반과 자전거가 가지런한 차고예요.': 'A tidy garage with a workbench, a tool wall, box shelves, and a bicycle.',
  '이 방은 문을 닫아 두었어요.': 'This room is closed for now.',
  '계절이 바뀌면 열어요.': 'Opens when the season changes.',
  '행사 뒤에 열어요.': 'Opens after the event.',
  // 방 장면: 나가는 문과 방 놀이
  '나가면 들어온 문 앞으로 돌아가요.': 'Leaving takes you back to the door you came in through.',
  '네 박자를 듣고 그대로 받아 쳐요. 세 판을 넘기면 두 마디를 오늘의 곡에 이어 붙여요.':
    "Listen to four beats and play them back. Pass three rounds to add two bars to today's song.",
  '선반에 좋아하는 것들을 골라 올려 나만의 선반을 꾸며요.': 'Pick your favorite things and arrange a shelf of your own.',
  '종이공을 던져 떠오르는 과녁을 맞혀요. 60초 동안 몇 개나 맞힐까요?':
    'Throw paper balls at the targets that pop up. How many can you hit in 60 seconds?',
  '낱말을 알맞은 지식 서랍에 넣고, 생각이 자라는 순서를 맞혀요.':
    'Put each word in the right knowledge drawer, then order the steps of a growing idea.',
  '요즘 만난 좋은 문장 하나를 출처와 함께 옮겨 적어 벽에 걸어요. 걸린 문장도 한 장씩 읽어요.':
    'Copy a good sentence you found lately, with its source, and hang it on the wall. Read the others one by one.',
  // 걷기용 손질(포토존·방명록·결혼식 무대)
  '여기서 찍은 사진을 올려 주세요. 가족이 먼저 보고, 그 사진으로 내 캐릭터도 꾸밀 수 있어요.':
    'Share a photo you take here. The family sees it first, and you can use it to make your character.',
  '이 집에 사는 다섯 사람에게 건네고 싶은 한마디를 남겨 주세요.': 'Leave a few words for the five people who live here.',
  '두 사람이 서는 무대예요. 올라서서 사진을 찍고(F2), 이 집 사람들의 문장도 맞혀 보세요.':
    'The stage where the couple will stand. Step up, take a photo (F2), and guess whose sentences these are.',
  // 방 안내(rooms.ts): 한 줄, 쪽지 질문, 여는 때, 층 안내
  '오늘 이 집에 무엇을 가지고 오셨나요?': 'What did you bring to this house today?',
  '쪽지를 걸어 두는 나무예요. 걸린 종이를 한 장씩 넘겨 읽을 수 있어요.': 'A tree for hanging notes. You can flip through them one by one.',
  '다음에 이 집에서 우리와 무엇을 함께하고 싶나요?': 'What would you like to do with us here next time?',
  '여기서 사진 한 장 찍어 남겨 주세요. 올린 사진은 먼저 가족에게만 보여요.': 'Take a photo here and leave it with us. Only the family sees it at first.',
  '오늘 이 집에서 찍은 사진 한 장': 'A photo you took here today',
  '남겨 주신 기록만큼 불이 밝아져요.': 'It glows brighter with everything you leave here.',
  '이 다섯 사람에게 건네고 싶은 한마디': 'A few words for these five people',
  '행사 뒤에 열어요': 'Opens after the event',
  '큰 창으로 드는 빛 무늬 아래, 요즘 만난 좋은 문장을 줄에 걸어 두는 방이에요.':
    'Under patterns of light from the big window, hang good sentences you found lately on a string.',
  '창틀에 그림엽서를 그려요.': 'Draw postcards on the window frame.',
  '경사진 천장 아래 레코드가 돌고, 피아노와 콘트라베이스가 함께 칠 사람을 기다려요.':
    'Records spin under the sloped ceiling, and a piano and a double bass wait for someone to play along.',
  '밝은 놀이 매트와 낮은 선반, 장난감 상자와 작은 텐트가 있는 아이 취향의 방이에요.':
    'A room for kids, with a bright play mat, low shelves, a toy chest, and a little tent.',
  '줄무늬 벽에 걸린 과녁을 향해 종이공을 던지며 노는 방이에요.': 'A playroom for throwing paper balls at targets on a striped wall.',
  '벽 가득 책과 실로 이은 카드, 아홉 칸 서랍이 있는 서재예요.': 'A study with walls of books, cards linked by string, and a nine-drawer chest.',
  '정돈된 침대와 개어 둔 담요, 작은 책상 위 방명록이 기다리는 조용한 방이에요.':
    'A quiet room with a tidy bed, a folded blanket, and a guestbook waiting on a small desk.',
  '작업대와 공구 벽, 상자 선반과 자전거가 가지런한 만드는 사람의 차고예요.':
    "A maker's garage with a workbench, a tool wall, box shelves, and a bicycle, all in order.",
  '무엇으로 채울지 아직 고르는 중인 방이에요.': "We're still deciding what this room will hold.",
  '채울 것이 정해지면 열어요': 'Opens once we decide what goes here',
  '봉인한 편지가 첫 결혼기념일에 열려요.': 'Sealed letters open on the first wedding anniversary.',
  '2027년 11월 28일에 열려요': 'Opens on November 28, 2027',
  '계절마다 한 구역씩 열려요': 'One area opens each season',
  // 집 데이터 변환기가 쓰는 일반 안내(어느 집에나 맞는 문장)
  '아치 기둥 사이로 들어와요.': 'Come in between the arched columns.',
  '함께 차리는 식탁이 있는 곳이에요.': 'Where we set the table together.',
  '경사진 천장 아래에서 두 마디 리듬을 이어 붙이는 방이에요.': 'A room under a sloped ceiling where you add two-bar rhythms to a song.',
  '문을 열고 들어가 볼 수 있어요.': 'Open the door and step inside.',
  // 일곱 방 세계관(v0.5.0)의 전시물·리더보드·방 안내
  "트리오 박수·비밥 브라스 콜·5/4 변박 클라베·올스타 리믹스까지, 스윙 포켓을 귀로 짚어 내는 리듬 게임이에요.": "A rhythm game where you find the swing pocket by ear: trio claps, bebop brass calls, 5/4 clave and an all-star remix.",
  "상대음감 음정 찾기부터 Maj9·7alt 텐션 보이싱 구별, 3음 비밥 릭 받아적기까지 건반으로 도전해요.": "Take on the keyboard: find intervals by relative pitch, tell Maj9 from 7alt tension voicings, and write down three-note bebop licks.",
  "2주간 변박을 반복해 익힌 사연과 공연 무대 빛의 리본 연출 노트를 펼쳐 봅니다.": "Open the story of two weeks spent drilling odd meters, and the notes behind the stage's ribbons of light.",
  "박공 아래 잼 · 리듬 천국 · 이어 트레이닝 세 놀이의 실시간 최고 순위표예요.": "Live top scores for three games: Jam under the gable, Jazz rhythm studio and Jazz ear training.",
  "지나치지 않고 모아 온 조개껍데기와 색색의 산길 조약돌, 엉뚱한 상상 스케치북이에요.": "Seashells picked up along the way, colorful pebbles from mountain paths, and a sketchbook of wild ideas.",
  "4대 왕국 18스테이지를 돌파하며 사탕으로 레벨업하고 10대 스킨과 보스 레이드, 2인 협동을 즐기는 3D 액션 RPG예요.": "Battle across four kingdoms and 18 stages, level up with candies, unlock 10 hero skins and team up for 2P boss raids in 3D.",
  "소드 콘티넌트와 선반 꾸미기 놀이의 실시간 최고 기록을 함께 확인해요.": "See the live top records for The Sword Continent and the shelf game together.",
  "선반 꾸미기 놀이 기록을 함께 확인해요.": "See the shelf game records together.",
  "수학 퍼즐과 스포츠 공, 스스로 정리하는 첫 볼트 기록장이 놓인 책상이에요.": "A desk with math puzzles, sports balls and a first vault notebook its owner keeps all on their own.",
  "60초 동안 누가 가장 높은 점수를 맞혔는지 순위를 겨뤄 보세요!": "Who scored the most points in 60 seconds? Compete for the top spot!",
  "에이전트 하네스 7층, 루만의 소통이론, Schema는 Harness다, 나만의 확률값 등 지산 블로그 핵심 글을 읽어요.": "Read key posts from the Jisan blog: the seven layers of an agent harness, Luhmann's communication theory, Schema is harness, your own probability and more.",
  "부트캠프·임원 AX·LLM Wiki·연구자 세컨드 브레인 강의에서 뽑아낸 핵심 명제들을 검색해 볼 수 있어요.": "Search the key ideas drawn from the bootcamp, executive AX, LLM Wiki and researcher second-brain lectures.",
  "CMDS 프로세스, 제텔카스텐 연결망, 멀티볼트 생태계를 그린 오리지널 일러스트 액자 컬렉션이에요.": "A collection of original framed illustrations of the CMDS process, Zettelkasten link networks and the multi-vault ecosystem.",
  "생각 지도 퀴즈 최고 기록과 내 순위를 확인해요.": "Check the Mind map quiz top scores and your rank.",
  "오늘 만난 좋은 문장과 고려청자·단청 문양 노트, 작은 호두 오브제를 살펴봅니다.": "Look over a good sentence found today, notes on Goryeo celadon and dancheong patterns, and a small walnut ornament.",
  "빛 무늬 문장 놀이 최고 기록을 확인해요.": "Check the top scores of the light-pattern sentence game.",
  "조연당을 찾아 주신 손님을 위한 환영 인사와 계절 차 안내 카드가 놓여 있어요.": "A welcome note and a seasonal tea card for guests visiting Joyeondang.",
  "루프랙 위 스타링크 위성 안테나와 카고 오피스를 탑재한 1호 이동식 작전 본부(이작본)를 점검해요.": "Inspect mobile command post No. 1, with a Starlink dish on the roof rack and a cargo office inside.",
  "실버 스트라이프와 옐로우 에어로 립 포인트가 살아 있는 4MATIC+ 퍼포먼스 쿠페와 듀얼 도면을 살펴봐요.": "See the 4MATIC+ performance coupe with silver stripes and yellow aero-lip accents, plus its two drawings.",
  "주 관제 노트북·스튜디오 워커·GPU 노드·스타링크·인산철 파워뱅크를 설계하고 세팅하는 엔지니어링 벤치예요.": "An engineering bench for designing and setting up the main control laptop, studio worker, GPU node, Starlink and LiFePO4 power bank.",
  "아버님께 \"왜 X3를 사냐!\" 혼나고 급선회한 폭스바겐 티구안 확정 도면과 1:18 다이캐스트 전시대예요.": "After a scolding (\"Why buy an X3?!\"), the plan swerved to a Volkswagen Tiguan: the final drawings and a 1:18 die-cast display.",
  "경사진 천장 아래 스윙 잼·리듬 천국 스튜디오·재즈 이어 트레이닝 세 가지 음악 놀이와 리더보드가 펼쳐져요.": "Under the sloped ceiling: three music games (Jam under the gable, Jazz rhythm studio, Jazz ear training) and a leaderboard.",
  "지식관리 일러스트 갤러리와 지산 에세이 책상, 메인 볼트 강의 자산 보드가 이어진 지식의 우주예요.": "A universe of knowledge: the knowledge management illustration gallery, the Jisan essay desk and the main vault lecture board.",
  "스타링크를 얹은 그레나디어와 AMG 쿠페, 티구안 구매 계획 도면과 AI 하네스 장비 본부가 자리한 개러지예요.": "A garage with the Starlink-topped Grenadier, the AMG coupe, the Tiguan purchase plan drawings and the AI harness gear HQ.",
};

/** 안내 문장의 영어. 모르면 null(부르는 쪽이 한국어 그대로 두고 lang="ko"를 붙인다) */
export function lineEn(text: string): string | null {
  const s = String(text ?? '').trim();
  return (s && EXACT[s]) || null;
}

/** 지금 언어의 안내 문장. 영어인데 모르는 문장이면 받은 문장 그대로 */
export function houseLine(lang: 'ko' | 'en', text: string): string {
  return lang === 'en' ? lineEn(text) ?? text : text;
}

/** 시험용: 표에 있는 문장들 */
export const HOUSE_LINE_KEYS: readonly string[] = Object.keys(EXACT);
