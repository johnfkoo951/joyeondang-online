// node --test 로 바로 돈다(Node 22 타입 제거). 외부 의존성 없는 순수 함수만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREA_SCOPE, canSee, canUse, type Role, type Scope } from '../../src/lib/access.ts';
import { CODE_ALPHABET, makeCode, normalizeCode } from '../../src/lib/code.ts';
import { detectInApp, escapeUrl } from '../../src/lib/inapp.ts';
import { shouldHandleShortcut } from '../../src/lib/keys.ts';
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
