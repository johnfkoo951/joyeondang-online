import { T } from '@/components/i18n/T';
import { sayEn } from '@/lib/avatar/words-en';

// 한국어로 적힌 안내 한 줄(서버가 준 글, 화면이 적은 글, 이 기기에 둔 까닭)을 두 말로 싣는다(서버 화면에서도 쓴다).
// 영어를 모르는 글은 영어 화면에서도 한국어 그대로 보이고, 그 글에는 lang="ko"를 붙인다(읽는 프로그램이 한국어로 읽게).
export function Say({ text }: { text: string }) {
  const en = sayEn(text);
  return <T ko={text} en={en || <span lang="ko">{text}</span>} />;
}
