// 첫 화면(src/lib/front.ts, src/components/home/, src/app/page.tsx): 상태별 들머리, 열린 방 수, 석등 불빛,
// 현판 한자 차례(오른쪽부터)와 화면 읽기, 현판 글자 대비.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOUSE_NAME, HOUSE_PLAQUE } from '../../src/content/house-name.ts';
import { frontWho, greetName, howFirst, lanternGlow, lanternWords, openRooms } from '../../src/lib/front.ts';

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');

test('들머리: 로그인 전, 명단 밖(확인 부탁 전·후), 명단 손님', () => {
  assert.deepEqual(frontWho({ signedIn: false, guest: false, name: null, pending: false }), { kind: 'public' });
  // 로그인하지 않았으면 다른 값이 섞여 와도 로그인 전으로 본다
  assert.deepEqual(frontWho({ signedIn: false, guest: true, name: '하늘', pending: true }), { kind: 'public' });
  assert.deepEqual(frontWho({ signedIn: true, guest: false, name: '하늘', pending: false }), { kind: 'visitor', pending: false });
  assert.deepEqual(frontWho({ signedIn: true, guest: false, name: null, pending: true }), { kind: 'visitor', pending: true });
  assert.deepEqual(frontWho({ signedIn: true, guest: true, name: ' 하늘 ', pending: false }), { kind: 'guest', name: '하늘' });
  assert.deepEqual(frontWho({ signedIn: true, guest: true, name: null, pending: false }), { kind: 'guest', name: '손님' });
});

test('인사 이름: 빈칸을 정리하고 20자까지, 없으면 손님', () => {
  assert.equal(greetName(null), '손님');
  assert.equal(greetName('   '), '손님');
  assert.equal(greetName('김  하늘'), '김 하늘');
  assert.equal(greetName('가'.repeat(30)), '가'.repeat(20));
  // 두 칸짜리 글자(이모지)도 글자 단위로 자른다
  assert.equal(Array.from(greetName('🌙'.repeat(25))).length, 20);
});

test('열린 방 수: DB 문패가 기본값보다 먼저', () => {
  const rooms = [{ slug: 'a', door: 'open' }, { slug: 'b', door: 'closed' }, { slug: 'c', door: 'open' }];
  assert.equal(openRooms(rooms, {}), 2);
  assert.equal(openRooms(rooms, { a: 'resting', b: 'open' }), 2);
  assert.equal(openRooms(rooms, { a: 'family', c: 'closed' }), 0);
});

test('석등 불빛: 0.45~1, 종이가 많을수록 밝고, 이상한 값은 0장으로', () => {
  for (const v of [0, null, undefined, Number.NaN, -5]) assert.equal(lanternGlow(v), 0.45, String(v));
  assert.equal(lanternGlow(100_000), 1);
  let prev = 0;
  for (const n of [0, 1, 3, 10, 30, 99]) {
    const g = lanternGlow(n);
    assert.ok(g > prev && g <= 1, `${n}장 → ${g}`);
    prev = g;
  }
});

test('석등 한 줄: 못 읽음, 0장, 오늘 없음, 오늘 있음(오늘 수는 따로), 모두 오늘이면 같은 숫자를 두 번 쓰지 않는다', () => {
  assert.deepEqual(lanternWords(null), { line: '석등은 곧 켜져요', today: null });
  assert.deepEqual(lanternWords({ lit: 0, today: 0 }), { line: '석등이 첫 쪽지를 기다려요', today: null });
  assert.deepEqual(lanternWords({ lit: 12, today: 0 }), { line: '쪽지 12장이 석등을 밝혔어요', today: null });
  assert.deepEqual(lanternWords({ lit: 12, today: 3 }), { line: '쪽지 12장이 석등을 밝혔어요', today: '오늘 3장' });
  assert.deepEqual(lanternWords({ lit: 1, today: 1 }), { line: '오늘 쪽지 1장이 석등을 밝혔어요', today: null });
  // 오늘 수는 승인 전·거둔 것까지 세어 전체보다 클 수 있다: 그때도 「오늘」을 문장에
  assert.deepEqual(lanternWords({ lit: 2, today: 5 }), { line: '오늘 쪽지 2장이 석등을 밝혔어요', today: null });
});

test('첫 화면 말: 손님이 남기는 것은 어디서나 「쪽지」(종이와 섞지 않는다), 로그인 전 설명은 무엇을 하는 곳인지', () => {
  for (const f of ['components/home/FrontArt.tsx', 'components/home/FrontDoor.tsx', 'components/home/HowTo.tsx', 'components/home/MoreLinks.tsx', 'lib/front.ts']) {
    const code = src(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /종이/, f);
  }
  const door = src('components/home/FrontDoor.tsx');
  assert.match(door, /그림으로 지은 집이에요/);
  assert.match(door, /휴대폰으로 누구나 집\\u00a0안을 걸어 볼\\u00a0수 있어요/);
  // 안에서만 통하는 말과 집의 내력은 첫 화면 설명에 쓰지 않는다
  assert.doesNotMatch(door, /다시 그린 집/);
  // 사람을 확인하는 동안의 단추 글과 로그인 전 단추 글이 같다(늦게 그려져도 글이 바뀌지 않게)
  assert.doesNotMatch(door, /집 안 걸어 보기/);
});

test('차례: 처음 온 사람(로그인 전·명단 밖)은 「이렇게 놀아요」를 둘러볼 곳보다 먼저, 명단 손님과 확인 중은 갈 곳을 먼저', () => {
  assert.equal(howFirst('public'), true);
  assert.equal(howFirst('visitor'), true);
  assert.equal(howFirst('guest'), false);
  assert.equal(howFirst(null), false);
  // 석등 한 줄은 이렇게 놀아요로 가는 링크(쪽지와 석등을 거기서 풀어 준다)
  assert.match(src('components/home/FrontArt.tsx'), /<a className=\{s\.note\} href="#front-how">/);
  assert.match(src('components/home/HowTo.tsx'), /<h2 id="front-how"/);
});

test('현판: 한자는 오른쪽부터 읽는 차례(堂連造), 이름은 조연당', () => {
  assert.equal(HOUSE_PLAQUE, '堂連造');
  assert.equal(Array.from(HOUSE_PLAQUE).reverse().join(''), '造連堂');
  assert.equal(HOUSE_NAME, '조연당');
});

test('화면 읽기: 배너는 장식 이미지, 제목은 선택한 언어의 이름으로 읽힌다', () => {
  const art = src('components/home/FrontArt.tsx');
  assert.match(art, /<h1 className=\{s\.bannerTitle\}>/);
  assert.match(art, /alt=""\s*aria-hidden="true"/);
  assert.match(art, /className="sr-only" data-ko="">\{HOUSE_NAME\} 온라인<\/span>/);
  assert.match(art, /className="sr-only" data-en="" lang="en">Joyeondang Online<\/span>/);
  const layout = src('app/layout.tsx');
  // 머리줄 링크 이름 = 보이는 한글 이름 + 「첫 화면」(한자는 숨김). 좁은 화면에서도 한글 이름을 display: none으로 지우지 않는다
  assert.match(layout, /<span className="hanja" aria-hidden="true">\{HOUSE_PLAQUE\}<\/span>\s*<span className="hangul">\{HOUSE_NAME\}<\/span>\s*<span className="sr-only"> 첫 화면<\/span>/);
  assert.doesNotMatch(src('app/globals.css'), /\.mark \.hangul \{ display: none/);
  // 왼쪽부터 쓴 옛 차례가 화면 글에 남지 않았다. 문서 제목(메타 title)은 그대로 둔다
  for (const f of ['app/page.tsx', 'components/home/FrontArt.tsx']) assert.doesNotMatch(src(f), /造連堂/, f);
  assert.doesNotMatch(layout.replace(/export const metadata[\s\S]*?\n};\n/, ''), /造連堂/);
  assert.match(layout, /title: \{ default: '조연당 造連堂'/);
});

test('첫 화면: 사람마다 다른 부분(쿠키·user-agent)은 Suspense 안, 집 안 걷기가 들머리의 첫 단추', () => {
  const page = src('app/page.tsx');
  assert.match(page, /<Suspense fallback=\{<FrontDoor who=\{null\} \/>\}>\s*<DoorNow \/>/);
  assert.match(page, /<Suspense fallback=\{<FrontRest who=\{null\} open=\{null\} \/>\}>\s*<RestNow \/>/);
  const door = src('components/home/FrontDoor.tsx');
  // 확인 전·로그인 전·명단 손님 모두 집 안 걷기(주홍)가 먼저
  assert.match(door, /function WalkButton[\s\S]*?className=\{`btn btn-roof \$\{s\.cta\}`\} href="\/walk"/);
  // 앱 안 브라우저(카톡)는 경고 상자 대신 초대 줄과 같은 한 줄: 수수한 단추(주홍 「집 안 걷기」만 주 단추), 같은 말 「들어가기」
  assert.match(page, /<InAppInvite kind=\{kind\}/);
  assert.doesNotMatch(page, /InAppBanner/);
  const inapp = src('components/home/InAppInvite.tsx');
  assert.doesNotMatch(inapp, /btn-(roof|pine)|className="banner/);
  assert.match(inapp, /className=\{s\.invite\}>\s*<span>초대장을 받으셨나요\?<\/span>/);
  assert.match(inapp, /<details className=\{s\.inappMore\}>/);
});

test('배너는 원본 3:1 비율로 잘리지 않고 표지 폭 안에 들어간다', () => {
  const mod = src('components/home/home.module.css');
  assert.match(mod, /\.heroTop \{[^}]*width: min\(100%, 840px\)/);
  assert.match(mod, /\.onlineBanner \{[^}]*width: 100%;[^}]*height: auto;[^}]*aspect-ratio: 3 \/ 1;[^}]*object-fit: contain;/);
  const art = src('components/home/FrontArt.tsx');
  assert.match(art, /online-serif-banner\.webp/);
  assert.match(art, /width=\{1920\}\s*height=\{640\}/);
  const webp = readFileSync(new URL('../../public/web/lettering/online-serif-banner.webp', import.meta.url));
  assert.equal(webp.subarray(8, 12).toString(), 'WEBP');
  assert.match(mod, /\.art \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
});

test('머리줄: 휴대폰은 붙지 않고 첫 화면에서는 메뉴 줄을 접는다, 한글 이름은 보인다, 큰 글씨 칩은 글이 그대로', () => {
  const css = src('app/globals.css');
  const phone = css.slice(css.indexOf('@media (max-width: 600px) {'));
  assert.match(phone, /^@media \(max-width: 600px\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?\.site-head \{ position: static; \}/);
  assert.match(phone, /body:has\(\.front-page\) \.site-head \.nav \{ display: none; \}/);
  // 휴대폰에서 한글 이름을 화면에서 감추던 규칙이 없다
  assert.doesNotMatch(css, /\.mark \.hangul \{ position: absolute/);
  // 붙어 다니는 머리줄 밑에 초점이 숨지 않게 잰 높이만큼 스크롤 여백
  assert.match(css, /html \{ scroll-padding-top: calc\(var\(--head-h, 61px\) \+ var\(--quiet-h, 0px\) \+ 12px\); \}/);
  assert.match(src('app/layout.tsx'), /<HeadOffset \/>/);
  const toggle = src('components/TextSize.tsx');
  assert.doesNotMatch(toggle.replace(/\/\/.*$/gm, ''), /보통 글씨/);
  assert.match(toggle, /aria-pressed=\{large\}>\s*큰 글씨\s*<\/button>/);
});

/** WCAG 상대 휘도·대비(tests/unit/contrast.test.ts와 같은 셈) */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
test('배너의 한지·먹색은 다크 모드에서도 반전하지 않는다', () => {
  const mod = src('components/home/home.module.css');
  const rule = mod.match(/\.onlineBanner \{([^}]+)\}/)?.[1] ?? '';
  assert.doesNotMatch(rule, /filter|mix-blend-mode|opacity/);
  assert.ok(contrast('#f4efe4', '#292821') >= 4.5);
});
