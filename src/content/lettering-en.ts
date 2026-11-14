// 글씨 전시의 영어: 작품마다 한 줄 소개와 읽는 방향. 작품 이름(title)은 옮기지 않는다(화면이 lang="ko"로 둔다).
// lettering.ts는 그림을 다시 준비할 때 통째로 다시 쓰이므로 영어는 이 파일에 따로 둔다. 영어마다 옮긴 때의 한국어(ko)를 함께 적어 두고,
// 한국어 소개가 바뀌면 영어를 쓰지 않는다(화면은 한국어 그대로 lang="ko", tests/unit/lettering.test.ts가 알린다).
import type { LetteringWork } from './lettering';

/** 작품 소개의 영어(작품 slug별). ko는 옮긴 때의 한국어 소개 */
export const LETTERING_DESC_EN: Readonly<Record<string, { ko: string; en: string }>> = {
  'ink-gold': { ko: '먹색 바탕에 금빛 획을 얹은 전통형 현판.', en: 'A traditional plaque with gold strokes on an ink-black board.' },
  'wood-calligraphy': { ko: '나무색 바탕에 검은 획. 작은 造 표식은 당호 장식이에요.', en: 'Black strokes on a wood-toned board. The small 造 mark decorates the house name.' },
  porcelain: { ko: '밝은 판과 정제된 한자, 넓은 여백.', en: 'A pale board, refined Chinese characters and wide margins.' },
  'green-korean': { ko: '초록 바탕에 멀리서도 읽기 쉬운 한글 이름.', en: 'The Korean name on green, easy to read from afar.' },
  'crayon-plaque': { ko: '분홍·초록·파랑 손글씨와 크레용 집의 만남.', en: 'Pink, green and blue handwriting meets a crayon house.' },
  'hanji-easel': { ko: '한지색 바탕과 세로 서체. 작은 造 표식은 당호 장식이에요.', en: 'A hanji-colored board with vertical lettering. The small 造 mark decorates the house name.' },
  'gallery-easel': { ko: '큰 한글과 비대칭 여백으로 맞이하는 안내판.', en: 'A welcome sign with large Korean letters and uneven margins.' },
  'storybook-easel': { ko: '손글씨와 크레용 집을 크게 펼친 환영판.', en: 'A welcome board spread wide with handwriting and a crayon house.' },
  'color-hanja-easel': { ko: '세 가지 색의 한자와 작은 집 그림.', en: 'Chinese characters in three colors and a small drawing of the house.' },
  'ink-desk': { ko: '전통 현판의 색과 획을 작은 안내판으로.', en: 'The colors and strokes of the traditional plaque on a small sign.' },
  'gallery-desk': { ko: '무채색 판 위에 이름과 안내를 나란히.', en: 'The name and a short guide side by side on a neutral-toned board.' },
  'crayon-desk': { ko: '손글씨와 집 그림이 함께 인사하는 탁상 안내판.', en: 'A desk sign where handwriting and a house drawing say hello together.' },
  'hanji-kaishu-horizontal': { ko: '두껍고 힘 있는 먹 획, 한지 위에 남은 붓의 결.', en: 'Thick, strong ink strokes and the grain of the brush left on hanji.' },
  'hanji-running-horizontal': { ko: '이어지는 획과 마른 붓의 흔적, 글자 사이로 흐르는 여백.', en: 'Linked strokes, traces of a dry brush and space flowing between the characters.' },
  'hanji-vertical': { ko: '造, 連, 堂을 한 줄로 내려 쓴 세로 작품.', en: 'A vertical piece with 造, 連 and 堂 written down in one line.' },
  'hanji-korean': { ko: '익숙한 한글 세 글자를 부드러운 먹빛으로.', en: 'The three familiar Korean letters in soft ink.' },
};

/** 읽는 방향의 영어(lettering.ts의 direction 글 그대로가 열쇠) */
export const LETTERING_DIRECTION_EN: Readonly<Record<string, string>> = {
  '오른쪽부터 조연당': 'Joyeondang, read from the right',
  '왼쪽부터 조연당': 'Joyeondang, read from the left',
  '위에서 아래로 조연당': 'Joyeondang, read from top to bottom',
};

/** 작품 소개의 영어. 모르는 작품이거나 한국어 소개가 옮긴 때와 다르면 null(화면은 한국어 그대로) */
export function letteringDescEn(work: Pick<LetteringWork, 'slug' | 'description'>): string | null {
  const row = LETTERING_DESC_EN[work.slug];
  return row && row.ko === work.description ? row.en : null;
}

/** 읽는 방향의 영어. 모르는 글이면 null */
export function letteringDirectionEn(direction: string): string | null {
  return LETTERING_DIRECTION_EN[direction] ?? null;
}
