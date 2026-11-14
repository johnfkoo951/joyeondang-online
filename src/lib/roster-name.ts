// 명단 이름 다듬기(관리 화면에서 넣거나 바꿀 때). DB는 앞뒤 공백을 뺀 길이 1~40자만 본다(0001 roster 표의 check).
// 여기서는 보이지 않는 글자와 줄바꿈을 걷고, 공백을 하나로 모으고, NFC로 맞춘다(같은 이름이 둘로 갈리지 않게).

/** 줄바꿈·탭·제어 글자와 폭 없는 글자(이름에 섞여 들어오면 화면에서 보이지 않는 차이가 된다) */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁤﻿]/g;
export const ROSTER_NAME_MAX = 40;

/** 넣을 수 있는 이름이면 다듬은 이름, 아니면 null(비었거나 글자가 아닌 것) */
export function cleanRosterName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = [...raw.normalize('NFC').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim()].slice(0, ROSTER_NAME_MAX).join('').trim();
  return name ? name : null;
}
