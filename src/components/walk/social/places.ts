import { ROOM_BY_SLUG } from '@/content/rooms';
import { placeName } from '@/lib/place-names';

/**
 * 걷는 공간 → 사람이 읽는 이름: 실제 집은 「집 안」, 방 장면은 그 방 이름.
 * 영어 화면이면 「In the house」, 방 이름은 장소 이름 표(place-names)로 옮긴다(표에 없는 이름은 한국어 그대로)
 */
export function placeLabel(space: string | null | undefined, lang: 'ko' | 'en' = 'ko'): string {
  const en = lang === 'en';
  if (space === 'house:real') return en ? 'In the house' : '집 안';
  if (space?.startsWith('room:')) {
    const name = ROOM_BY_SLUG.get(space.slice(5))?.name;
    return name ? placeName(lang, name) : en ? 'Room' : '방';
  }
  return '';
}

/**
 * 시각(이 기기 시계): 오늘이면 「오후 3:04」, 아니면 「11월 11일 오후 3:04」.
 * 영어 화면이면 「3:04 PM」, 「Nov 11, 3:04 PM」
 */
export function timeLabel(ms: number, now = Date.now(), lang: 'ko' | 'en' = 'ko'): string {
  const d = new Date(ms);
  const en = lang === 'en';
  const t = d.toLocaleTimeString(en ? 'en-US' : 'ko-KR', { hour: 'numeric', minute: '2-digit' });
  if (new Date(now).toDateString() === d.toDateString()) return t;
  return en ? `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${t}` : `${d.getMonth() + 1}월 ${d.getDate()}일 ${t}`;
}
