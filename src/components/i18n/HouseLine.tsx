import { lineEn } from '@/lib/house-lines';
import { T } from './T';

/**
 * 집 데이터의 안내 문장(방 이야기 한 줄, 살피기 자리 한 줄, 여는 때, 쪽지 질문, 층 안내).
 * 영어 표(lib/house-lines)에 있으면 두 말로 싣고, 없으면 한국어 그대로 lang="ko"로 둔다
 */
export function HouseLine({ text }: { text: string }) {
  const en = lineEn(text);
  return en ? <T ko={text} en={en} /> : <span lang="ko">{text}</span>;
}
