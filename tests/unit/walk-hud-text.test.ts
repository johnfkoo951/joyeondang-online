// 걷기 화면 위 글(HUD)의 한국어·영어: 모든 표의 칸에 영어가 있고(비지 않고 한글이 없다), 한국어는 예전 글자 그대로인지 본다.
// 단축키 표·도움말·첫 안내·조작 안내·메뉴·사진 알림·문패·놀이 이름·대화 까닭·앱 안 브라우저 이름, 시간과 수 세기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// 걷기 부품들은 앱과 같은 꼴(확장자 없는 './shortcuts')로 서로 가져온다. 이 시험 프로세스에서만 .ts를 풀어 준다.
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const { SHORTCUTS, shortcutLabel } = await import('../../src/components/walk/shortcuts.ts');
const { HELP_ORDER, deskHelpRows } = await import('../../src/components/walk/help-rows.ts');
const P = await import('../../src/components/walk/prefs.ts');
const H = await import('../../src/components/walk/hud-text.ts');
const C = await import('../../src/components/walk/controls.ts');
const M = await import('../../src/components/walk/memory.ts');
const S = await import('../../src/components/walk/sheet-routes.ts');
const { GAMES } = await import('../../src/games/registry.ts');
const { DOOR_LABEL, DOOR_LABEL_EN } = await import('../../src/content/rooms.ts');
const { CHAT_REASON_TEXT } = await import('../../src/lib/social.ts');
const { INAPP_NAME, INAPP_NAME_EN, escapeLabel } = await import('../../src/lib/inapp.ts');

const HANGUL = /[가-힣]/;
/** 영어 칸: 비지 않고, 한글이 없고, 앞뒤 공백이 없고, 긴 줄표를 쓰지 않는다 */
function english(s: unknown, where: string) {
  assert.equal(typeof s, 'string', `${where}: 글이 아니다`);
  const t = s as string;
  assert.ok(t.trim().length > 0, `${where}: 비었다`);
  assert.doesNotMatch(t, HANGUL, `${where}: 한글이 남았다 (${t})`);
  assert.doesNotMatch(t, /—/, `${where}: 긴 줄표(—)를 쓰지 않는다`);
  assert.equal(t, t.trim(), `${where}: 앞뒤 공백`);
}
/** [한국어, 영어] 한 쌍: 한국어도 비지 않는다 */
function pair(p: readonly [string, string], where: string) {
  assert.ok(p[0].trim().length > 0, `${where}: 한국어가 비었다`);
  english(p[1], where);
}

test('단축키 표: 모든 항목에 영어 이름, 키 글자는 그대로', () => {
  for (const [id, s] of Object.entries(SHORTCUTS)) {
    english(s.en, `SHORTCUTS.${id}.en`);
    assert.equal(shortcutLabel(id as keyof typeof SHORTCUTS, 'en'), s.en);
    assert.equal(shortcutLabel(id as keyof typeof SHORTCUTS, 'ko'), s.label);
  }
  // 낱말 몇 개는 사전(용어 표)대로
  assert.equal(SHORTCUTS.map.en, 'Map');
  assert.equal(SHORTCUTS.way.en, 'Find the way');
  assert.equal(SHORTCUTS.portal.en, 'Go to a room');
  assert.equal(SHORTCUTS.act.en, 'Look closer');
  assert.equal(SHORTCUTS.fullscreen.en, 'Full screen');
});

test('도움말(데스크탑): 영어 줄은 한국어 줄과 같은 차례·같은 키 글자, 모든 칸이 영어', () => {
  const ko = deskHelpRows();
  const en = deskHelpRows('en');
  assert.equal(en.length, ko.length);
  assert.equal(en.length, HELP_ORDER.length + 3);
  en.forEach((r, i) => {
    assert.equal(r.id, ko[i].id, `${i}번째 줄의 항목`);
    assert.equal(r.together, ko[i].together);
    english(r.key, `help[${i}].key`);
    english(r.label, `help[${i}].label`);
    english(r.text, `help[${i}].text`);
    // 표의 줄은 키 글자가 두 말 모두 같다(낱말인 「마우스」만 Mouse로)
    if (r.id) assert.equal(r.key, ko[i].key);
  });
  assert.deepEqual(en.slice(0, 3).map((r) => r.key), ['Mouse', '← → ↑ ↓', 'W A S D']);
  assert.equal(en.find((r) => r.id === 'fullscreen')?.key, 'F');
  assert.match(en.find((r) => r.id === 'talk')?.text ?? '', /Hide chat/);
  // 한국어 줄은 예전 글자 그대로(한 줄 대표로)
  assert.equal(ko[2].text, 'W와 S는 앞뒤, A와 D는 옆걸음.');
});

test('조작 안내(처음 8초): 모든 칸에 영어, 낱말 키는 영어 이름, 전체 화면 F 칸이 있다', () => {
  for (const h of [...P.HINT, P.HINT_LOCKED, P.HINT_TALK, ...P.HINT_TOGETHER]) {
    english(h.en, `HINT ${h.key}`);
    assert.ok(h.ko.trim(), `HINT ${h.key} 한국어`);
    if (HANGUL.test(h.key)) english(h.keyEn, `HINT ${h.key} keyEn`);
  }
  const fs = P.HINT.find((h) => h.tag === 'fullscreen');
  assert.ok(fs, '전체 화면 칸');
  assert.equal(fs.key, SHORTCUTS.fullscreen.key);
  assert.equal(P.HINT.filter((h) => h.tag === 'click').length, 1, '마우스 잠금 때 바뀌는 칸은 하나');
  // 예전 칸(한국어)은 그대로
  assert.deepEqual(P.HINT.slice(0, 4).map((h) => [h.key, h.ko]), [['마우스', '둘러보기'], ['클릭', '끝없이 둘러보기'], ['방향키', '돌기·위아래 보기'], ['W A S D', '걷기']]);
});

test('첫 방문 카드: 영어도 같은 수의 마디, 휴대폰 안내는 앉기 단추를 알린다', () => {
  for (const [name, t] of [['desk', P.ONBOARD_DESK], ['touch', P.ONBOARD_TOUCH]] as const) {
    english(t.en, `ONBOARD_${name}`);
    assert.equal(t.en.split(' · ').length, t.ko.split(' · ').length, `${name} 마디 수`);
  }
  assert.match(P.ONBOARD_TOUCH.ko, /앉아요/);
  assert.match(P.ONBOARD_TOUCH.en, /\bsit\b/);
  assert.match(P.ONBOARD_DESK.en, /\bSpace jump\b/);
});

test('휴대폰 도움말·도움말 끝 줄: 모든 줄에 영어, 앉기 단추 줄이 있다', () => {
  H.TOUCH_HELP.forEach((p, i) => pair(p, `TOUCH_HELP[${i}]`));
  pair(H.TOUCH_TOGETHER, 'TOUCH_TOGETHER');
  pair(H.TOUCH_FULLSCREEN, 'TOUCH_FULLSCREEN');
  pair(H.TOUCH_NO_FULLSCREEN, 'TOUCH_NO_FULLSCREEN');
  assert.ok(H.TOUCH_HELP.some((p) => /앉은 사람 단추/.test(p[0]) && /sitting person button/.test(p[1])), '앉기 단추 줄');
  for (const room of [false, true]) {
    for (const real of [false, true]) {
      for (const gallery of [false, true]) {
        for (const coarse of [false, true]) {
          const o = { room, real, gallery, coarse };
          english(H.helpFoot(o, 'en'), `helpFoot ${JSON.stringify(o)}`);
          assert.match(H.helpFoot(o, 'ko'), HANGUL);
        }
      }
    }
  }
});

test('메뉴·사진 알림: 모든 칸에 영어', () => {
  for (const [k, p] of Object.entries(H.MENU_TEXT)) pair(p, `MENU_TEXT.${k}`);
  for (const [k, p] of Object.entries(H.SHOT_TEXT)) pair(p, `SHOT_TEXT.${k}`);
  pair(H.SHOT_MISS, 'SHOT_MISS');
  // 예전 사진 알림 글(한국어)은 그대로
  assert.equal(H.SHOT_TEXT.saved[0], '내 갤러리에 담았어요');
  assert.equal(H.pick(H.SHOT_TEXT.saved, 'en'), 'Saved to My gallery');
});

test('문패·놀이 이름·대화 까닭·앱 이름: 열쇠가 원래 표와 같고 영어가 다 있다', () => {
  assert.deepEqual(Object.keys(H.DOOR_EN).sort(), Object.keys(DOOR_LABEL).sort());
  for (const [k, v] of Object.entries(H.DOOR_EN)) english(v, `DOOR_EN.${k}`);
  // 문패의 영어는 어느 화면에서나 같은 말(집 데이터 표 DOOR_LABEL_EN): 쉬는 중 = On a break
  assert.deepEqual(H.DOOR_EN, DOOR_LABEL_EN);
  assert.equal(H.DOOR_EN.resting, 'On a break');
  for (const id of Object.keys(GAMES)) {
    english(H.GAME_EN[id]?.title, `GAME_EN.${id}.title`);
    english(H.GAME_EN[id]?.blurb, `GAME_EN.${id}.blurb`);
  }
  // 놀이 이름은 장소 이름 표(문패)와 같은 말
  assert.equal(H.GAME_EN.jam.title, 'Jam under the gable');
  const n = { body: 300, mentions: 5, minute: 20 };
  for (const reason of Object.keys(CHAT_REASON_TEXT)) english(H.chatReasonEn(reason as keyof typeof CHAT_REASON_TEXT, n), `chatReasonEn(${reason})`);
  assert.match(H.chatReasonEn('too_long', n), /300/);
  // 앱 안 브라우저 안내(WalkInApp)는 lib/inapp의 영어 이름표를 쓴다(첫 화면·머리줄 안내와 같은 말)
  assert.deepEqual(Object.keys(INAPP_NAME_EN).sort(), Object.keys(INAPP_NAME).sort());
  for (const [k, v] of Object.entries(INAPP_NAME_EN)) english(v, `INAPP_NAME_EN.${k}`);
  // 액자 앞 빈 이름(엔진의 「곧 전시해요」·「액자」)
  for (const [k, v] of Object.entries(H.FRAME_EN)) {
    assert.match(k, HANGUL);
    english(v, `FRAME_EN.${k}`);
  }
  // 바깥 브라우저로 여는 단추: 카카오톡, 안드로이드, 아이폰의 세 글이 모두 영어로(한국어는 예전 그대로)
  const uas = ['Mozilla/5.0 (Linux; Android 14) KAKAOTALK', 'Mozilla/5.0 (Linux; Android 14; wv) Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Line/14'];
  for (const ua of uas) {
    const kind = ua.includes('KAKAOTALK') ? 'kakao' : 'webview';
    english(escapeLabel(kind, ua, 'en'), `escapeLabel(${ua}, en)`);
    assert.match(escapeLabel(kind, ua), HANGUL);
  }
});

test('살피기·길 찾기 딱지와 사진 파일 이름: 영어를 주면 영어, 주지 않으면 예전 한국어', () => {
  const kinds = [{ kind: 'enter', slug: 'study' }, { kind: 'leave' }, { kind: 'frame', id: '1-a-2' }, { kind: 'panel' }, null] as const;
  for (const i of kinds) english(C.actLabel(i, 'en'), `actLabel(${JSON.stringify(i)})`);
  assert.equal(C.actLabel({ kind: 'enter', slug: 'study' }, 'en'), 'Enter');
  assert.equal(C.actLabel(null), '살피기');
  assert.equal(C.wayKind({ kind: 'portal', title: '재즈가 흐르는 방' }, 'en'), 'way in');
  assert.equal(C.wayKind({ kind: 'portal', title: '재즈가 흐르는 방' }), '들어가는 문');
  // 이름에 이미 그 말이 있으면(한국어 이름으로 본다) 영어여도 붙이지 않는다
  assert.equal(C.wayKind({ kind: 'exit', title: '나가는 문' }, 'en'), null);
  for (const v of Object.values(C.WAY_KIND_EN)) english(v, 'WAY_KIND_EN');
  const d = new Date(2026, 10, 9, 7, 5);
  assert.equal(C.shotFileName(d, undefined, 'en'), 'Joyeondang-20261109-0705.jpg');
  assert.equal(C.shotFileName(d, 2, 'en'), 'Joyeondang-20261109-0705-2.jpg');
  assert.equal(C.shotFileName(d), '조연당-20261109-0705.jpg');
});

test('걸린 시간·대략 시간: 영어는 sec·min, 한국어는 예전 그대로', () => {
  assert.equal(M.formatMs(42_000, 'en'), '42 sec');
  assert.equal(M.formatMs(65_000, 'en'), '1 min 5 sec');
  assert.equal(M.formatMs(120_000, 'en'), '2 min');
  assert.equal(M.formatMs(65_000), '1분 5초');
  assert.equal(M.aboutSeconds(60, 'en'), 'About 1 min');
  assert.equal(M.aboutSeconds(30, 'en'), 'About 30 sec');
  assert.equal(M.aboutSeconds(4, 'en'), 'About 10 sec');
  assert.equal(M.aboutSeconds(120), '2분 안팎');
});

test('시트 머리 이름: 모든 시트에 영어, 방은 부르는 쪽이 준 이름(없으면 Room)', () => {
  for (const [k, p] of Object.entries(S.SHEET_TITLES)) pair(p, `SHEET_TITLES.${k}`);
  assert.equal(S.sheetTitle('/gallery', () => undefined, 'en'), 'My gallery');
  assert.equal(S.sheetTitle('/room/pine', () => 'Front yard pine', 'en'), 'Front yard pine');
  assert.equal(S.sheetTitle('/room/nowhere', () => undefined, 'en'), 'Room');
  assert.equal(S.sheetTitle('/gallery', () => undefined), '내 갤러리');
  assert.equal(S.sheetTitle('/walk', () => undefined, 'en'), '');
});

test('영어 수 세기: 한 명·여러 명, 새 말 한 개·여러 개', () => {
  assert.equal(H.peopleEn(1), '1 person');
  assert.equal(H.peopleEn(3), '3 people');
  assert.equal(H.newMessagesEn(1), '1 new message');
  assert.equal(H.newMessagesEn(4), '4 new messages');
});
