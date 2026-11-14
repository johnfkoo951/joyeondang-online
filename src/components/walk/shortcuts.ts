// 걷기 화면의 단축키 표 한곳. 키 처리(controls.ts), 메뉴·단추 이름 옆 표시(「지도 M」), 도움말이 이 표를 함께 읽는다.
// 키를 바꾸려면 여기만 고친다(시험 tests/unit/walk-shortcuts.test.ts가 키가 겹치지 않는지 본다).
// 이름은 한국어(label)와 영어(en)를 함께 둔다(화면 말을 바꾸면 영어 이름. 키 글자는 그대로).

export type ShortcutId =
  | 'menu' | 'help' | 'map' | 'way' | 'portal' | 'shot' | 'talk' | 'view' | 'act' | 'jump' | 'run' | 'sit'
  | 'character' | 'chat' | 'people' | 'fullscreen';

export type Shortcut = {
  /** 화면에 보이는 키 이름(「M」, 「Esc」). 키 글자는 두 말 모두 같다 */
  key: string;
  /** 메뉴·도움말에 쓰는 이름 */
  label: string;
  /** 화면이 영어일 때의 이름 */
  en: string;
};

export const SHORTCUTS: Readonly<Record<ShortcutId, Shortcut>> = {
  menu: { key: 'Esc', label: '메뉴', en: 'Menu' },
  help: { key: '?', label: '조작법', en: 'Controls' },
  map: { key: 'M', label: '지도', en: 'Map' },
  way: { key: 'G', label: '길 찾기', en: 'Find the way' },
  portal: { key: 'P', label: '방 바로 가기', en: 'Go to a room' },
  shot: { key: 'F2', label: '사진 찍기', en: 'Take a photo' },
  talk: { key: 'Enter', label: '말하기', en: 'Say' },
  view: { key: 'V', label: '시점 바꾸기', en: 'Change view' },
  act: { key: 'E', label: '살피기', en: 'Look closer' },
  jump: { key: 'Space', label: '점프', en: 'Jump' },
  run: { key: 'Shift', label: '달리기', en: 'Run' },
  // 혼자 눌렀다 떼면 앉고, 다시 누르거나 걸으면 일어선다(다른 키와 함께 누른 Ctrl은 그 키의 단축키)
  sit: { key: 'Ctrl', label: '앉기', en: 'Sit' },
  character: { key: 'B', label: '캐릭터', en: 'Character' },
  chat: { key: 'C', label: '대화', en: 'Chat' },
  people: { key: 'U', label: '접속자', en: 'People here' },
  // 전체 화면이 안 되는 브라우저(아이폰 사파리 등)에서는 키도 아무 일을 하지 않는다(useFullscreen)
  fullscreen: { key: 'F', label: '전체 화면', en: 'Full screen' },
};

/** 지금 말의 단축키 이름 */
export function shortcutLabel(id: ShortcutId, lang: 'ko' | 'en'): string {
  return lang === 'en' ? SHORTCUTS[id].en : SHORTCUTS[id].label;
}

/** 글자 키(한 글자 영문)인 단축키: 한글 자판에서도 자판 자리(KeyB 등)로 읽는다 */
export function letterOf(id: ShortcutId): string | null {
  const k = SHORTCUTS[id].key;
  return /^[A-Z]$/.test(k) ? k.toLowerCase() : null;
}
