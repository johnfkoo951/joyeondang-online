// 작은 놀이 화면(GamesHub)의 놀이 차례·갈래·한 줄 소개(한국어·영어). 화면 부품(.tsx)에 두면 시험이 읽지 못하므로 여기에 모은다
// (tests/unit/i18n-games.test.ts가 모든 칸에 영어가 있는지 본다). 한국어는 예전 글자 그대로다. 이 파일은 아무것도 가져오지 않는다.
// 놀이 이름·설명·「글이 한국어예요」 한 줄은 놀이 목록(src/games/registry.ts)에 있다(방 화면·놀이 첫 화면도 같은 말을 쓴다).

export type Category = 'all' | 'story' | 'action' | 'craft';

/** 놀이 차례(화면에 보이는 순서)와 갈래, 카드 아래 한 줄 */
export const GAME_CATALOG: readonly { id: string; category: Exclude<Category, 'all'>; how: string; howEn: string }[] = [
  { id: 'poetry', category: 'story', how: '시 구절을 읽고 네 개의 낙관 중 시인을 골라요. 여섯 문장 뒤에 오늘의 문장을 만나요.', howEn: 'Read a verse and choose its poet from four seals. After six questions, receive a sentence for today.' },
  { id: 'calligraphy', category: 'craft', how: '서안 위 체본을 따라 恒常心을 쓰고 나만의 낙관을 찍어요.', howEn: 'Trace 恒常心 on the writing desk and finish with your own seal.' },
  { id: 'watercolor', category: 'craft', how: '거실 창가의 이젤에서 물감을 겹쳐 그리고 내 그림을 내려받아요.', howEn: 'Layer watercolor washes on the living-room easel and download your painting.' },
  {
    id: 'sword',
    category: 'action',
    how: 'GitHub 레포와 실시간 연동되는 3D 보스 레이드 RPG! 50마리를 잡으면 황금 피리가 생기고, 피리를 불면 왕드래곤이 내려와요. 방 코드 7794로 2인 협동도 즐겨 보세요.',
    howEn: 'Live-synced 3D boss raid RPG from GitHub! Defeat 50 monsters for the golden flute, then blow it to call down the King Dragon. Enter room code 7794 on two devices for live 2P co-op.',
  },
  {
    id: 'groove',
    category: 'action',
    how: '리듬게임천국 스타일로 트리오 박수·비밥 브라스 콜·5/4 변박·리믹스 포켓을 맞혀 보세요!',
    howEn: 'Rhythm Heaven style: hit the swing pocket on trio claps, bebop brass calls, 5/4 time and the remix!',
  },
  {
    id: 'pitch',
    category: 'action',
    how: '로즈 건반으로 상대음감 음정 찾기, Maj9·7alt 텐션 보이싱 구별, 3음 비밥 릭 받아적기에 도전해요.',
    howEn: 'On a Rhodes keyboard, find intervals by ear, tell Maj9 from 7alt voicings and copy three-note bebop licks.',
  },
  {
    id: 'jam',
    category: 'action',
    how: '네 박자 리듬을 듣고 건반이나 화면을 눌러 그루브를 이어 가요.',
    howEn: 'Hear a four-beat rhythm, then tap a key or the screen to keep the groove going.',
  },
  {
    id: 'target',
    category: 'action',
    how: '종이공을 던져 줄무늬 벽 과녁을 맞히는 유쾌한 60초 한 판!',
    howEn: 'A cheerful 60-second round of throwing paper balls at targets on the striped wall!',
  },
  {
    id: 'brain',
    category: 'story',
    how: '낱말을 알맞은 생각 서랍에 넣고 지식이 자라는 순서를 맞혀요.',
    howEn: 'Put words in the right thinking drawers and order the steps of growing knowledge.',
  },
  {
    id: 'who',
    category: 'story',
    how: '무대 위 말풍선의 주인이 다섯 가족 중 누구일지 맞혀 보세요.',
    howEn: 'Guess which of the five family members said the line in the bubble on stage.',
  },
  {
    id: 'shelf',
    category: 'craft',
    how: '아끼는 장난감과 소품을 골라 나만의 선반 세 칸을 채워요.',
    howEn: 'Pick your favorite toys and things to fill three spots on your own shelf.',
  },
  {
    id: 'sentences',
    category: 'craft',
    how: '빛 무늬 퍼즐을 풀거나 좋아하는 문장과 출처를 줄에 걸어 두어요.',
    howEn: 'Solve the light-pattern puzzle, or hang a favorite sentence and its source on the line.',
  },
];

/** 갈래 고르기 단추 */
export const FILTERS: readonly { id: Category; ko: string; en: string }[] = [
  { id: 'all', ko: '전체 12종', en: 'All 12 games' },
  { id: 'story', ko: '문장·생각 퀴즈', en: 'Words & quizzes' },
  { id: 'action', ko: '리듬·과녁 놀이', en: 'Rhythm & targets' },
  { id: 'craft', ko: '선반·문장 꾸미기', en: 'Shelf & sentences' },
];

/** 영어 화면의 쪽 제목(서버 metadata는 한국어 「작은 놀이 · 조연당」) */
export const GAMES_TITLE_EN = 'Mini games · Joyeondang';
