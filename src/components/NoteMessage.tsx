import { T } from '@/components/i18n/T';
import { messageEn } from '@/lib/messages-en';
import { noteMessageEn } from '@/lib/page-words';

// 쪽지 보내기·사진·도장 쪽에서 돌아온 한국어 안내를 화면 말로 보인다. 아는 말은 영어로(lib/page-words의 noteMessageEn,
// 그다음 서버 액션의 말 표 lib/messages-en), 모르는 말은 영어 화면에서도 한국어 그대로 두고 lang="ko"를 붙인다.
// 서버와 화면 어느 쪽에서도 쓴다(<T>와 같다)
export function NoteMessage({ text }: { text: string }) {
  const en = noteMessageEn(text) ?? messageEn(text);
  return <T ko={text} en={en ?? <span lang="ko">{text}</span>} />;
}

/** 경고 여러 줄(한 문단으로 잇는다). 아는 말만 옮기고 나머지는 한국어 그대로 */
export function NoteWarnings({ list }: { list: readonly string[] }) {
  const ko = list.join(' ');
  const en = list.map((w) => noteMessageEn(w) ?? messageEn(w));
  return <T ko={ko} en={en.every(Boolean) ? en.join(' ') : <span lang="ko">{ko}</span>} />;
}
