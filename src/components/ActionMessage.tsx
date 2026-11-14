import { T } from '@/components/i18n/T';
import { messageEn } from '@/lib/messages-en';

// 서버가 돌려준 한국어 안내(서버 액션의 message 등)를 화면 말로 보인다. 아는 말은 영어로(lib/messages-en),
// 모르는 말은 영어 화면에서도 한국어 그대로 두고 lang="ko"를 붙인다. 서버와 화면 어느 쪽에서도 쓴다(<T>와 같다)
export function ActionMessage({ text }: { text: string }) {
  const en = messageEn(text);
  return <T ko={text} en={en ?? <span lang="ko">{text}</span>} />;
}
