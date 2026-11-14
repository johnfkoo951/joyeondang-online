// 이름이 없는 사람의 이름표. 서버와 화면은 이름이 비면 「손님」이라고 적어 보내고(gameName, viewer.name ?? '손님'),
// 걷기 화면은 내 이름이 없으면 역할 이름(구경하는 분, 초대 손님…)을 내 이름표로 쓴다(walk/page의 viewer.name ?? ROLE_LABEL).
// 이 글들은 사람이 지은 이름이 아니라 화면 말이라, 화면이 영어일 때는 보이는 자리에서만 영어로 바꾼다.
// 보내고 받는 값은 그대로 둔다(함께 걷기·반려동물 친구 판단은 모든 화면이 같은 이름으로 견준다).

/** 이름이 없을 때 쓰는 이름(한국어, 데이터에 실리는 값) */
export const GUEST_NAME_KO = '손님';
/** 화면이 영어일 때 보이는 이름 */
export const GUEST_NAME_EN = 'Guest';

/** 이름 대신 쓰는 화면 말(이름 없는 손님, 역할 이름)의 영어 */
const DEFAULT_NAME_EN: Readonly<Record<string, string>> = {
  [GUEST_NAME_KO]: GUEST_NAME_EN,
  '구경하는 분': 'Visitor',
  '확인 중인 분': 'Pending guest',
  '초대 손님': 'Invited guest',
  가족: 'Family',
  집주인: 'Host',
};

/** 지금 언어로 보이는 이름: 영어 화면에서 이름 대신 쓴 화면 말(손님, 역할 이름)만 영어로, 사람이 지은 이름은 그대로 */
export function shownName(lang: 'ko' | 'en', name: string): string {
  return (lang === 'en' && DEFAULT_NAME_EN[name.trim()]) || name;
}

/** 시험용: 영어로 바꾸는 이름 대신 말들 */
export const DEFAULT_NAME_KEYS: readonly string[] = Object.keys(DEFAULT_NAME_EN);
