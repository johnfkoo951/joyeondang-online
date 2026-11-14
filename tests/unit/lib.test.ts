// node --test 로 바로 돈다(Node 22 타입 제거). 외부 의존성 없는 순수 함수만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREA_SCOPE, canSee, canUse, type Role, type Scope } from '../../src/lib/access.ts';
import { CODE_ALPHABET, HANGUL_KEYBOARD_NOTE, makeCode, normalizeCode, shortCodeNote } from '../../src/lib/code.ts';
import { detectInApp, escapeLabel, escapeUrl } from '../../src/lib/inapp.ts';
import { MODAL_SELECTOR, heldKeys, isModalOpen, letterOf, shouldHandleShortcut } from '../../src/lib/keys.ts';
import { checkBody, contactWarnings, countChars } from '../../src/lib/text.ts';

const ROLES: Role[] = ['public', 'visitor', 'guest', 'family', 'admin'];
const SCOPES: Scope[] = ['public', 'guests', 'family'];

test('보기 사다리는 DB의 scope_visible()과 같다', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.match(sql, /when 'guests' then public\.role_rank\(p_role\) >= 1/);
  assert.match(sql, /when 'family' then public\.role_rank\(p_role\) >= 2/);
  assert.match(sql, /when 'admin' then 3 when 'family' then 2 when 'guest' then 1 else 0/);
  const expect: Record<Scope, Role[]> = {
    public: ROLES,
    guests: ['guest', 'family', 'admin'],
    family: ['family', 'admin'],
  };
  for (const s of SCOPES) for (const r of ROLES) assert.equal(canSee(r, s), expect[s].includes(r), `${r} → ${s}`);
});

test('쓰기·도장·놀이는 로그인만으로는 열리지 않는다', () => {
  for (const area of ['write', 'stamps', 'games', 'guestRecords'] as const) {
    assert.notEqual(AREA_SCOPE[area], 'public', `${area}는 public이면 안 된다`);
    assert.equal(canUse('visitor', area), false);
    assert.equal(canUse('guest', area), true);
  }
});

test('초대 코드: 헷갈리는 글자 없음, 4자씩 3묶음, 정규화', () => {
  for (let i = 0; i < 200; i++) {
    const c = makeCode(3, 4);
    assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.ok([...c.replaceAll('-', '')].every((ch) => CODE_ALPHABET.includes(ch)));
    assert.doesNotMatch(c, /[01OIL U]/);
  }
  assert.equal(normalizeCode(' abcd-efgh jk '), 'ABCDEFGHJK');
});

test('코드 칸: 한글 자판으로 친 값이면 자판을 알려 주고, 그냥 짧으면 원래 안내', () => {
  const note = '다시 확인해 주세요.';
  // 한글 자판인 채로 친 코드: 낱자모로 남든 글자로 묶이든 영문·숫자는 거의 남지 않는다
  assert.equal(shortCodeNote('ㅁㅠㅊㅇ-ㄷㄹㅎ2-ㅗㅓㅏㅡ', 8, note), HANGUL_KEYBOARD_NOTE);
  assert.equal(shortCodeNote('뮻ㅇ-ㄷㄹㅎ2', 8, note), HANGUL_KEYBOARD_NOTE);
  assert.equal(shortCodeNote('뮻ㅇ'.normalize('NFD'), 10, note), HANGUL_KEYBOARD_NOTE);
  // 한글이 없으면 원래 안내, 비어 있어도 마찬가지
  assert.equal(shortCodeNote('ABCD', 8, note), note);
  assert.equal(shortCodeNote('', 8, note), note);
  // 길이가 되면 안내 없이 다음으로(한글이 섞여 있어도 영문·숫자가 충분하면 그대로 확인한다)
  assert.equal(shortCodeNote('abcd-efgh-jkmn', 8, note), null);
  assert.equal(shortCodeNote('ABCD-EFGH-JKMN 입니다', 10, note), null);
});

test('앱 안 브라우저 판정과 바깥으로 여는 주소', () => {
  const kakaoIOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.9.0';
  const kakaoAndroid = 'Mozilla/5.0 (Linux; Android 15; SM-S928N Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 KAKAOTALK/25.9.0';
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const chromeAndroid = 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  const naver = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.0)';
  assert.equal(detectInApp(kakaoIOS), 'kakao');
  assert.equal(detectInApp(kakaoAndroid), 'kakao');
  assert.equal(detectInApp(naver), 'naver');
  assert.equal(detectInApp(safari), null);
  assert.equal(detectInApp(chromeAndroid), null);
  const href = 'https://joyeondang.cmdspace.work/join?c=ABCD-EFGH-JKMN';
  assert.equal(escapeUrl('kakao', href, kakaoIOS), `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`);
  const intent = escapeUrl('webview', href, kakaoAndroid.replace(' KAKAOTALK/25.9.0', ''));
  assert.ok(intent?.startsWith('intent://joyeondang.cmdspace.work/join?c=ABCD-EFGH-JKMN#Intent;scheme=https;package=com.android.chrome;'));
  assert.equal(escapeUrl('naver', href, naver), null, 'iOS 네이버 앱은 안내 문구로만');
  // 카카오톡 주소는 기본 브라우저로 열린다: 단추에 Safari·Chrome이라고 못 박지 않는다
  assert.equal(escapeLabel('kakao', kakaoIOS), '바깥 브라우저로 열기');
  assert.equal(escapeLabel('kakao', kakaoAndroid), '바깥 브라우저로 열기');
  assert.equal(escapeLabel('webview', kakaoAndroid.replace(' KAKAOTALK/25.9.0', '')), 'Chrome에서 열기', '안드로이드 intent는 크롬을 연다');
});

test('쪽지 글 검사', () => {
  assert.deepEqual(checkBody('  안녕하세요  '), { ok: true, body: '안녕하세요' });
  assert.equal(checkBody('').ok, false);
  assert.equal(checkBody('가'.repeat(501)).ok, false);
  assert.equal(checkBody('가'.repeat(500)).ok, true);
  assert.equal(checkBody('a\u0007b').ok, false);
  assert.equal(countChars('한글'), 2);
  assert.equal(countChars('ㅎㅏㄴ'.normalize('NFC')), 3);
  assert.equal(contactWarnings('연락 주세요 010-1234-5678').length, 1);
  assert.equal(contactWarnings('평화로 12 놀러 와요').length, 1);
  assert.equal(contactWarnings('다음엔 같이 재즈 들어요').length, 0);
});

test('단축키는 한글 조합 중·입력칸에서 멈춘다', () => {
  const div = { tagName: 'DIV', closest: () => null, getAttribute: () => null };
  const input = { tagName: 'TEXTAREA', closest: () => ({}) };
  assert.equal(shouldHandleShortcut({ target: div, key: 'm' } as never), true);
  assert.equal(shouldHandleShortcut({ target: div, isComposing: true } as never), false);
  assert.equal(shouldHandleShortcut({ target: div, keyCode: 229 } as never), false);
  assert.equal(shouldHandleShortcut({ target: input } as never), false);
  assert.equal(shouldHandleShortcut(null), false);
});

test('창이 떠 있으면 사이트 단축키가 쉰다: 열린 <dialog>와 aria-modal 덮개(놀이 덮개) 모두, 보이는 것만', () => {
  // 가짜 문서: 쉼표로 나눈 선택자 가운데 있는 것을 돌려준다. 숨긴 것(앞 화면이 display: none으로 남은 것)은 상자가 없다
  type Box = { getClientRects: () => { length: number } };
  const shown: Box = { getClientRects: () => [{}] };
  const hidden: Box = { getClientRects: () => [] };
  const doc = (els: Record<string, Box[]>) => ({ querySelectorAll: (sel: string) => sel.split(',').flatMap((s) => els[s.trim()] ?? []) });
  assert.equal(isModalOpen(doc({})), false);
  assert.equal(isModalOpen(doc({ 'dialog[open]': [shown] })), true);
  assert.equal(isModalOpen(doc({ '[aria-modal="true"]': [shown] })), true);
  assert.equal(isModalOpen(doc({ '[aria-modal="true"]': [hidden] })), false, '숨긴 앞 화면의 놀이 덮개는 세지 않는다');
  assert.equal(isModalOpen(doc({ '[aria-modal="true"]': [hidden, shown] })), true);
  assert.equal(isModalOpen(null), false);
  assert.match(MODAL_SELECTOR, /dialog\[open\]/);
  // 놀이 덮개(놀이 중·쉬는 카드)는 <dialog>가 아니라 aria-modal 창이다: 위 선택자에 걸린다
  const overlay = readFileSync(new URL('../../src/components/walk/GameOverlay.tsx', import.meta.url), 'utf8');
  const shells = overlay.match(/className="game-overlay"[^>]*>/g) ?? [];
  assert.equal(shells.length, 2);
  for (const s of shells) assert.match(s, /role="dialog" aria-modal="true"/);
  // 사이트 단축키는 한 글자 키(?, /, 숫자, 글자, 테마)를 보기 전에 창을 본다
  const keys = readFileSync(new URL('../../src/components/Shortcuts.tsx', import.meta.url), 'utf8');
  const gate = keys.lastIndexOf('if (isModalOpen(document)) return;');
  assert.ok(gate > 0 && gate < keys.indexOf("e.key === '?'") && gate < keys.indexOf("letterOf(e) === 't'"));
});

test('글자 키: 라틴 글자는 그 글자로, 한글 자판이면 자판 자리로 읽는다', () => {
  // 글자 자리가 다른 라틴 자판(드보락): 글자가 먼저다. W 자리 키는 ','를, 쉼표 자리 키는 'w'를 낸다
  assert.equal(letterOf({ key: 'w', code: 'Comma' }), 'w');
  assert.equal(letterOf({ key: 'e', code: 'KeyD' }), 'e');
  assert.equal(letterOf({ key: 'M', code: 'KeyN' }), 'm');
  // 두벌식에서 W 자리 키는 key가 'ㅈ'으로 온다
  assert.equal(letterOf({ key: 'ㅈ', code: 'KeyW' }), 'w');
  assert.equal(letterOf({ key: 'W', code: 'KeyW' }), 'w');
  assert.equal(letterOf({ key: 'ㅍ', code: 'KeyV' }), 'v');
  // 누를 때와 뗄 때 key가 달라져도(누른 채 자판이 바뀜) 같은 값
  assert.equal(letterOf({ key: 'w', code: 'KeyW' }), letterOf({ key: 'ㅈ', code: 'KeyW' }));
  // 글자 키가 아니면 key 그대로(소문자)
  assert.equal(letterOf({ key: 'ArrowUp', code: 'ArrowUp' }), 'arrowup');
  assert.equal(letterOf({ key: 'Shift', code: 'ShiftLeft' }), 'shift');
  assert.equal(letterOf({ key: ' ', code: 'Space' }), ' ');
  assert.equal(letterOf({ key: 'Enter', code: 'Enter' }), 'enter');
  assert.equal(letterOf({ key: '3', code: 'Digit3' }), '3');
  // code를 주지 않는 가상 자판은 key로
  assert.equal(letterOf({ key: 'M' }), 'm');
  assert.equal(letterOf({}), '');
});

test('눌린 키 묶음: 뗄 때는 자판 자리로 찾는다(누른 채 자판·보조 키가 바뀌어 글자가 달라져도 남지 않는다)', () => {
  const KEYMAP: Record<string, string> = { w: 'f', arrowup: 'f', s: 'b', shift: 'run' };
  const press = (h: ReturnType<typeof heldKeys>, e: { key: string; code?: string }) => {
    const a = KEYMAP[letterOf(e)];
    if (a) h.down(e, a);
  };
  // 드보락: 'w'는 쉼표 자리. 누른 채 Option을 누르거나 한글 자판으로 바꾸면 뗄 때 다른 글자가 온다
  for (const up of [{ key: '∑', code: 'Comma' }, { key: ',', code: 'Comma' }, { key: 'w', code: 'Comma' }]) {
    const h = heldKeys();
    press(h, { key: 'w', code: 'Comma' });
    assert.equal(h.has('f'), true);
    h.up(up);
    assert.equal(h.has('f'), false, `뗄 때 key=${up.key}`);
    assert.equal(h.size, 0);
  }
  // 한글 자판: 영문으로 누르고 한글로 떼어도, 한글로 누르고 영문으로 떼어도 같다
  const h = heldKeys();
  press(h, { key: 'w', code: 'KeyW' });
  h.up({ key: 'ㅈ', code: 'KeyW' });
  assert.equal(h.size, 0);
  press(h, { key: 'ㅈ', code: 'KeyW' });
  assert.equal(h.has('f'), true);
  h.up({ key: 'w', code: 'KeyW' });
  assert.equal(h.size, 0);
  // 같은 뜻의 키 둘(W와 ↑)을 함께 누르다 하나만 떼면 그 뜻은 남는다
  press(h, { key: 'w', code: 'KeyW' });
  press(h, { key: 'ArrowUp', code: 'ArrowUp' });
  press(h, { key: 'Shift', code: 'ShiftLeft' });
  assert.deepEqual(h.values().sort(), ['f', 'run']);
  h.up({ key: 'w', code: 'KeyW' });
  assert.equal(h.has('f'), true);
  h.up({ key: 'ArrowUp', code: 'ArrowUp' });
  assert.equal(h.has('f'), false);
  assert.equal(h.has('run'), true);
  // 누른 적 없는 키를 떼는 것은 아무 일도 아니다. 같은 키를 거듭 눌러도(자동 반복) 하나다
  h.up({ key: 's', code: 'KeyS' });
  press(h, { key: 'Shift', code: 'ShiftLeft' });
  assert.equal(h.size, 1);
  h.clear();
  assert.equal(h.size, 0);
  assert.equal(h.has('run'), false);
  // 자리 정보가 없는 환경은 읽은 글자로 찾는다(누를 때만 없거나 뗄 때만 없어도)
  press(h, { key: 'w' });
  h.up({ key: 'w' });
  assert.equal(h.size, 0);
  press(h, { key: 'w' });
  h.up({ key: 'w', code: 'KeyW' });
  assert.equal(h.size, 0);
  press(h, { key: 'w', code: 'KeyW' });
  h.up({ key: 'w' });
  assert.equal(h.size, 1, '자리로 적은 키는 자리 없는 떼기로 지워지지 않는다(창이 초점을 잃을 때 모두 지운다)');
  // 양쪽 Shift를 함께 눌렀다 떼면 뗀 신호가 하나만 온다: 뜻으로 모두 놓는 길(drop)이 있다
  h.clear();
  press(h, { key: 'w', code: 'KeyW' });
  press(h, { key: 'Shift', code: 'ShiftLeft' });
  press(h, { key: 'Shift', code: 'ShiftRight' });
  h.up({ key: 'Shift', code: 'ShiftRight' });
  assert.equal(h.has('run'), true, '뗀 신호 하나로는 다른 쪽이 남는다');
  h.drop('run');
  assert.equal(h.has('run'), false);
  assert.deepEqual(h.values(), ['f'], '다른 뜻은 그대로');
  h.drop('없는 뜻');
  assert.equal(h.size, 1);
});
