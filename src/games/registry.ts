// 방 놀이 목록. 놀이를 더하면 여기에 한 줄, src/games/<id>/index.ts(x) 하나.
// 공개 빌드에 들어가므로 실명·장소명을 쓰지 않는다(가족 방 이름은 손님에게만 서버가 따로 준다).
import type { GameMeta } from './types';

export const GAMES: Record<string, GameMeta> = {
  jam: {
    id: 'jam',
    title: '박공 아래 잼',
    room: 'gable',
    blurb: '네 박자를 듣고 그대로 받아 쳐요. 세 판을 넘기면 두 마디를 오늘의 곡에 이어 붙여요.',
    seconds: 120,
    load: () => import('./jam'),
  },
  shelf: {
    id: 'shelf',
    title: '좋아하는 것 선반',
    room: 'toybox',
    blurb: '선반에 좋아하는 것들을 골라 올려 나만의 선반을 꾸며요.',
    seconds: 60,
    load: () => import('./shelf'),
  },
  target: {
    id: 'target',
    title: '종이공 과녁',
    room: 'target',
    blurb: '종이공을 던져 떠오르는 과녁을 맞혀요. 60초 동안 몇 개나 맞힐까요?',
    seconds: 60,
    load: () => import('./target'),
  },
  brain: {
    id: 'brain',
    title: '생각 지도 퀴즈',
    room: 'mind',
    blurb: '낱말을 알맞은 지식 서랍에 넣고, 생각이 자라는 순서를 맞혀요.',
    seconds: 120,
    load: () => import('./brain'),
  },
  sentences: {
    id: 'sentences',
    title: '문장 걸어 두기',
    room: 'study',
    blurb: '요즘 만난 좋은 문장 하나를 출처와 함께 옮겨 적어 벽에 걸어요. 걸린 문장도 한 장씩 읽어요.',
    seconds: 90,
    load: () => import('./sentences'),
  },
};

export function gamesInRoom(room: string): GameMeta[] {
  return Object.values(GAMES).filter((g) => g.room === room);
}
