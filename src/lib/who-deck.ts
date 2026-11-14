import 'server-only';
import { parseDeckJson, type Deck } from '../games/who/logic';

// 「누구의 문장일까」 카드 묶음: 이 집에 사는 사람들의 이름·그림·색·소개와 그 사람이 한 문장.
// 실명과 실제 문장이 들어가므로 저장소·공개 묶음에는 없고, 서버 환경 변수 WHO_DECK_JSON에만 있다.
// 모양 검사는 놀이와 같은 cleanDeck(src/games/who/logic.ts): 틀린 사람·문장은 빼고, 사람 2~8명·문장 하나 이상이 아니면 null.
// 손님 확인은 부르는 쪽(app/api/who)이 먼저 한다.

export type { Deck };

export function loadWhoDeck(raw: string | undefined = process.env.WHO_DECK_JSON): Deck | null {
  return parseDeckJson(raw);
}
