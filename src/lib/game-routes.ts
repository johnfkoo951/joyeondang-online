// 외부에서 3D 걷기 없이 바로 여는 단독 미니게임·재즈 스튜디오 주소 규약(/games/<slug>, /play/<slug>).
// 순수 데이터·판정만 두어 proxy(known-path.ts)와 단위 시험에서 그대로 가져다 쓴다.

export const CANONICAL_GAME_IDS = [
  'poetry',
  'calligraphy',
  'watercolor',
  'sword',
  'groove',
  'pitch',
  'jam',
  'target',
  'brain',
  'shelf',
  'sentences',
  'who',
] as const;

export type CanonicalGameId = (typeof CANONICAL_GAME_IDS)[number];

export const JAZZ_GAME_IDS: readonly CanonicalGameId[] = ['groove', 'pitch', 'jam'];

const ALIAS_TO_CANONICAL: Readonly<Record<string, CanonicalGameId>> = {
  poetry: 'poetry',
  calligraphy: 'calligraphy',
  watercolor: 'watercolor',
  sword: 'sword',
  'sword-continent': 'sword',
  rpg: 'sword',
  groove: 'groove',
  rhythm: 'groove',
  'rhythm-heaven': 'groove',
  pitch: 'pitch',
  ear: 'pitch',
  'ear-training': 'pitch',
  jam: 'jam',
  target: 'target',
  brain: 'brain',
  shelf: 'shelf',
  sentences: 'sentences',
  who: 'who',
};

export type ResolvedGameSlug =
  | { kind: 'game'; id: CanonicalGameId; redirect: boolean }
  | { kind: 'jazz' }
  | null;

export function resolveGameSlug(raw: string): ResolvedGameSlug {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s === 'jazz' || s === 'jazz-studio') {
    return { kind: 'jazz' };
  }
  const hit = Object.hasOwn(ALIAS_TO_CANONICAL, s) ? ALIAS_TO_CANONICAL[s] : undefined;
  if (!hit) return null;
  return { kind: 'game', id: hit, redirect: s !== hit };
}

export function standaloneGameHref(id: string): string {
  return `/games/${encodeURIComponent(id)}`;
}

export function shortPlayHref(id: string): string {
  return `/play/${encodeURIComponent(id)}`;
}

export const STANDALONE_GAME_META: Readonly<Record<CanonicalGameId, { title: string; blurb: string }>> = {
  poetry: { title: '문장의 주인을 찾아라', blurb: '시 구절을 읽고 네 개의 낙관 중 시인을 골라요. 여섯 문장 뒤에 오늘의 문장을 만나요.' },
  calligraphy: { title: '글씨의 주인을 찾아라', blurb: '서안 위 체본을 따라 恒常心을 쓰고 나만의 낙관을 찍어요.' },
  watercolor: { title: '창가에서 수채 그림그리기', blurb: '거실 창가의 이젤에서 물감을 겹쳐 그리고 내 그림을 내려받아요.' },
  sword: {
    title: '소드 콘티넌트',
    blurb: '4대 왕국 18스테이지를 돌파하며 사탕으로 레벨업하고 10대 스킨과 보스 레이드, 2인 협동을 즐기는 3D 액션 RPG예요.',
  },
  groove: {
    title: '리듬 천국 재즈 스튜디오',
    blurb: '트리오 박수·비밥 브라스 콜·5/4 변박 클라베·올스타 리믹스까지, 스윙 포켓을 귀로 짚어 내는 리듬 게임이에요.',
  },
  pitch: {
    title: '재즈 이어 트레이닝 · 음정과 화성',
    blurb: '상대음감 음정 찾기부터 Maj9·7alt 텐션 보이싱 구별, 3음 비밥 릭 받아적기까지 건반으로 도전해요.',
  },
  jam: {
    title: '박공 아래 잼',
    blurb: '네 박자를 듣고 그대로 받아 쳐요. 세 판을 넘기면 두 마디를 오늘의 곡에 이어 붙여요.',
  },
  target: {
    title: '종이공 과녁',
    blurb: '종이공을 던져 떠오르는 과녁을 맞혀요. 60초 동안 몇 개나 맞힐까요?',
  },
  brain: {
    title: '생각 지도 퀴즈',
    blurb: '낱말을 알맞은 지식 서랍에 넣고, 생각이 자라는 순서를 맞혀요.',
  },
  shelf: {
    title: '좋아하는 것 선반',
    blurb: '선반에 좋아하는 것들을 골라 올려 나만의 선반을 꾸며요.',
  },
  sentences: {
    title: '문장 걸어 두기',
    blurb: '요즘 만난 좋은 문장 하나를 출처와 함께 옮겨 적어 벽에 걸어요. 걸린 문장도 한 장씩 읽어요.',
  },
  who: {
    title: '누구의 문장일까',
    blurb: '무대 위로 올라온 문장을 보고, 이 집에 사는 사람 중 누가 한 말인지 인형을 골라 맞혀요.',
  },
};
