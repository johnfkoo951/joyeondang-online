// 기록(쪽지·문장) 넣기를 DB가 한도 때문에 거절했을 때 손님에게 보일 한 줄.
// 한도는 supabase/migrations/0014_guards.sql의 records_limit_insert가 건다(too_many: 잠깐 사이, too_many_today: 하루).
// 그 마이그레이션이 올라가기 전에는 이 오류가 오지 않는다(그때는 늘 null).

const TODAY = '오늘은 많이 남겨 주셨어요. 내일 다시 걸어 주세요.';
const SOON = '잠깐 사이에 많이 남겨 주셨어요. 조금 쉬었다가 다시 걸어 주세요.';

/** 한도 오류면 안내 문구, 아니면 null(부르는 쪽이 다른 까닭을 본다) */
export function recordLimitMessage(dbMessage: string | null | undefined): string | null {
  const m = dbMessage ?? '';
  if (/too_many_today/.test(m)) return TODAY;
  if (/too_many/.test(m)) return SOON;
  return null;
}

/** 한도 안내의 영어(열쇠는 위 한국어 그대로). 서버는 한국어를 돌려주고, 화면이 영어일 때 보이는 자리에서 옮긴다 */
export const RECORD_WORDS_EN: Readonly<Record<string, string>> = {
  [TODAY]: 'You’ve left a lot today. Please come back tomorrow.',
  [SOON]: 'You’ve left quite a few just now. Take a short break and try again.',
};

/** rpc 하나만 쓰는 만큼만 받는다(시험에서 가짜를 넣을 수 있게) */
type RoomAsker = { rpc: (fn: 'record_room') => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * 넣기 전에 묻는다: 지금 쪽지를 더 넣을 자리가 있는가. 한도에 찼으면 안내 문구, 아니면 null.
 * 사진 쪽지는 사진을 먼저 올리므로, 한도에 찬 사람이 되풀이해 보내면 올렸다 지우는 일만 끝없이 돈다. 올리기 전에 이것으로 거른다.
 * record_room()은 0014 뒤에만 있다. 없거나 묻지 못하면 null: 그대로 진행하고, 넣을 때 DB가 판단한다.
 */
export async function recordRoomMessage(client: RoomAsker): Promise<string | null> {
  try {
    const { data, error } = await client.rpc('record_room');
    if (error || typeof data !== 'string') return null;
    return recordLimitMessage(data);
  } catch {
    return null;
  }
}
