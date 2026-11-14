import { photoId, withTitle, type CharacterLook } from '@/walk/look';

// 사진 캐릭터의 주인 확인. 주소 모양(cleanLook)만으로는 누구 그림인지 알 수 없어서,
// 저장할 때와 서버에서 읽을 때 「내 그림인가」를 한 번 더 묻는다. 묻는 방법(DB)은 부르는 쪽이 넘긴다.

/** 사진 겉모습이면 내 그림일 때만 그대로, 아니면 fallback(내가 단 칭호는 그대로 옮긴다). 인형은 그대로(묻지 않는다) */
export async function ownedLook(
  look: CharacterLook, isMine: (id: string) => Promise<boolean>, fallback: CharacterLook,
): Promise<CharacterLook> {
  const id = photoId(look);
  if (id === null) return look;
  const keep = () => (look.title ? withTitle(fallback, look.title) : fallback);
  try {
    return (await isMine(id)) ? look : keep();
  } catch {
    return keep();
  }
}
