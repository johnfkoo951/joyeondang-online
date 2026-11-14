// 방 놀이 목록. 놀이를 더하면 여기에 한 줄, src/games/<id>/index.ts(x) 하나.
// 공개 빌드에 들어가므로 실명·장소명을 쓰지 않는다(가족 방 이름은 손님에게만 서버가 따로 준다).
// 영어 이름·설명(titleEn, blurbEn)은 걷기 화면 표(components/walk/hud-text.ts의 GAME_EN)와 같은 말을 쓴다(tests/unit/i18n-games.test.ts가 견준다).
// 글이 한국어인 놀이(낱말·문장)는 koreanNoteEn에 영어 화면에서만 보일 한 줄을 둔다(놀이 카드와 첫 화면).
import type { GameMeta } from './types';

export type GameEntry = GameMeta & {
  /** 영어 이름 */
  titleEn: string;
  /** 영어 한 줄 설명 */
  blurbEn: string;
  /** 놀이 글이 한국어일 때 영어 화면에 덧붙이는 한 줄(무엇은 글 없이 할 수 있는지) */
  koreanNoteEn?: string;
};

export const GAMES: Record<string, GameEntry> = {
  poetry: {
    id: 'poetry',
    title: '문장의 주인을 찾아라',
    titleEn: 'Find the poet',
    room: 'study',
    blurb: '시 구절을 읽고 네 개의 낙관 중 시인을 골라요. 여섯 문장 뒤에 오늘의 문장을 만나요.',
    blurbEn: 'Read a verse and choose its poet from four seals. After six questions, receive a sentence for today.',
    seconds: 120,
    load: () => import('./poetry'),
  },
  calligraphy: {
    id: 'calligraphy',
    title: '글씨의 주인을 찾아라',
    titleEn: 'Trace a constant heart',
    room: 'study',
    blurb: '서안 위 체본을 따라 恒常心을 쓰고 나만의 낙관을 찍어요.',
    blurbEn: 'Trace 恒常心 on the writing desk and finish with your own seal.',
    seconds: 180,
    load: () => import('./calligraphy'),
  },
  watercolor: {
    id: 'watercolor',
    title: '창가에서 수채 그림그리기',
    titleEn: 'Watercolors by the window',
    room: 'living',
    blurb: '거실 창가의 이젤에서 물감을 겹쳐 그리고 내 그림을 내려받아요.',
    blurbEn: 'Layer watercolor washes on the living-room easel and download your painting.',
    seconds: 180,
    load: () => import('./watercolor'),
  },
  jam: {
    id: 'jam',
    title: '박공 아래 잼',
    titleEn: 'Jam under the gable',
    room: 'gable',
    blurb: '네 박자를 듣고 그대로 받아 쳐요. 세 판을 넘기면 두 마디를 오늘의 곡에 이어 붙여요.',
    blurbEn: 'Listen to four beats and play them back. Clear three rounds to add two bars to today’s song.',
    seconds: 120,
    load: () => import('./jam'),
  },
  groove: {
    id: 'groove',
    title: '리듬 천국 재즈 스튜디오',
    titleEn: 'Jazz rhythm studio',
    room: 'gable',
    blurb: '트리오 박수·비밥 브라스 콜·5/4 변박 클라베·올스타 리믹스까지, 스윙 포켓을 귀로 짚어 내는 리듬 게임이에요.',
    blurbEn: 'A rhythm game where you find the swing pocket by ear: trio claps, bebop brass calls, 5/4 clave and an all-star remix.',
    seconds: 120,
    load: () => import('./groove'),
  },
  pitch: {
    id: 'pitch',
    title: '재즈 이어 트레이닝 · 음정과 화성',
    titleEn: 'Jazz ear training · Intervals & harmony',
    room: 'gable',
    blurb: '상대음감 음정 찾기부터 Maj9·7alt 텐션 보이싱 구별, 3음 비밥 릭 받아적기까지 건반으로 도전해요.',
    blurbEn: 'Take on the keyboard: find intervals by relative pitch, tell Maj9 from 7alt tension voicings, and write down three-note bebop licks.',
    seconds: 120,
    load: () => import('./pitch'),
  },
  sword: {
    id: 'sword',
    title: '소드 콘티넌트',
    titleEn: 'The Sword Continent',
    room: 'toybox',
    blurb: '5대 왕국 26스테이지를 돌파하며 사탕으로 레벨업하고, 몬스터 50마리를 잡아 얻은 황금 피리로 왕드래곤 대군주를 불러내 싸우는 3D 액션 RPG예요. 11대 스킨과 2인 협동도 있어요.',
    blurbEn: 'Battle across five kingdoms and 26 stages, level up with candies, earn the golden flute after 50 monsters and summon the King Dragon Overlord in 3D. 11 hero skins and 2P co-op included.',
    koreanNoteEn: 'In-game HUD and shop labels are in Korean, while movement, dash, jump and boss raid combat play by icons and controls.',
    seconds: 180,
    load: () => import('./sword'),
  },
  shelf: {
    id: 'shelf',
    title: '좋아하는 것 선반',
    titleEn: 'Favorite things shelf',
    room: 'toybox',
    blurb: '선반에 좋아하는 것들을 골라 올려 나만의 선반을 꾸며요.',
    blurbEn: 'Pick your favorite things and put them on the shelf to make it your own.',
    seconds: 60,
    load: () => import('./shelf'),
  },
  target: {
    id: 'target',
    title: '종이공 과녁',
    titleEn: 'Paper ball target',
    room: 'target',
    blurb: '종이공을 던져 떠오르는 과녁을 맞혀요. 60초 동안 몇 개나 맞힐까요?',
    blurbEn: 'Throw paper balls at the targets that pop up. How many can you hit in 60 seconds?',
    seconds: 60,
    load: () => import('./target'),
  },
  brain: {
    id: 'brain',
    title: '생각 지도 퀴즈',
    titleEn: 'Mind map quiz',
    room: 'mind',
    blurb: '낱말을 알맞은 지식 서랍에 넣고, 생각이 자라는 순서를 맞혀요.',
    blurbEn: 'Put each word in the right knowledge drawer, then put the steps of a growing thought in order.',
    koreanNoteEn: 'The quiz cards are in Korean. The picture drawer game needs no reading.',
    seconds: 120,
    load: () => import('./brain'),
  },
  sentences: {
    id: 'sentences',
    title: '문장 걸어 두기',
    titleEn: 'Hang a sentence',
    room: 'study',
    blurb: '요즘 만난 좋은 문장 하나를 출처와 함께 옮겨 적어 벽에 걸어요. 걸린 문장도 한 장씩 읽어요.',
    blurbEn: 'Copy out a good sentence you came across lately, with its source, and hang it on the wall. Read the hung sentences one at a time, too.',
    koreanNoteEn: 'The sentences on the wall are in Korean. The puzzle has picture hints, and you can write in any language.',
    seconds: 90,
    load: () => import('./sentences'),
  },
  who: {
    id: 'who',
    title: '누구의 문장일까',
    titleEn: 'Whose sentence is it?',
    room: 'living',
    blurb: '무대 위로 올라온 문장을 보고, 이 집에 사는 사람 중 누가 한 말인지 인형을 골라 맞혀요.',
    blurbEn: 'Read the sentence that comes up on the stage and pick the doll of the person in this house who said it.',
    koreanNoteEn: 'The sentences are in Korean. Turn on Picture match to play by pictures.',
    seconds: 90,
    load: () => import('./who'),
  },
};

export function gamesInRoom(room: string): GameEntry[] {
  return Object.values(GAMES).filter((g) => g.room === room);
}

/** 지금 말의 놀이 이름 */
export function gameTitle(meta: Pick<GameEntry, 'title' | 'titleEn'>, lang: 'ko' | 'en'): string {
  return lang === 'en' && meta.titleEn ? meta.titleEn : meta.title;
}

/** 지금 말의 놀이 설명 */
export function gameBlurb(meta: Pick<GameEntry, 'blurb' | 'blurbEn'>, lang: 'ko' | 'en'): string {
  return lang === 'en' && meta.blurbEn ? meta.blurbEn : meta.blurb;
}
