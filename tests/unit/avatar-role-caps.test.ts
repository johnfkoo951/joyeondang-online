// 사진 캐릭터 하루 한도를 역할마다(0020): 사이트의 판정(decideQuota)과 장수 읽기(readQuota)가 DB가 준 한도를 그대로 쓰는지,
// 그 값이 없는 옛 DB에서는 예전 숫자로 돌아가는지, 화면 글이 고정된 하루 장수를 말하지 않는지, 0020과 사이트의 숫자가 맞는지.
// DB 쪽 판정(손님 10장, 가족 20장, 관리자 제한 없음, 직접 부르기)은 tests/sql/rls.test.mjs의 0020 묶음이 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATTEMPTS_DAILY,
  DEFAULT_TOTAL_CAP,
  MESSAGES,
  PER_USER_DAILY,
  SLOTS,
  arrangeSlots,
  dailyLimits,
  dailyLine,
  dailyPart,
  decideQuota,
  readQuota,
} from '../../src/lib/avatar/rules.ts';

const SQL = readFileSync(new URL('../../supabase/migrations/0020_avatar_role_caps.sql', import.meta.url), 'utf8');
const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

/** 0020을 올린 DB가 역할마다 주는 장수 응답(avatar_quota) */
const guest = (o: Record<string, unknown> = {}) => ({
  used: 0, attempts: 0, total: 0, kept: 0, slots: 3, cap: 10, attempt_cap: 22, total_exempt: false, ...o,
});
const family = (o: Record<string, unknown> = {}) => guest({ cap: 20, attempt_cap: 42, ...o });
const admin = (o: Record<string, unknown> = {}) => guest({ cap: null, attempt_cap: null, total_exempt: true, ...o });
const decide = (raw: unknown, totalCap = 150) => decideQuota(readQuota(raw), totalCap);
const reasonOf = (d: ReturnType<typeof decideQuota>) => (d.ok ? 'ok' : d.reason);

test('손님: 하루 10장(10장째까지 되고 그다음은 user_limit), 시도 22번', () => {
  assert.deepEqual(decide(guest()), { ok: true, left: 10 });
  assert.deepEqual(decide(guest({ used: 9, attempts: 9 })), { ok: true, left: 1 });
  assert.deepEqual(decide(guest({ used: 10, attempts: 10 })), {
    ok: false, reason: 'user_limit', message: '오늘 만들 수 있는 10장을 다 만들었어요. 내일 다시 해 주세요.',
  });
  assert.deepEqual(decide(guest({ used: 2, attempts: 21 })), { ok: true, left: 8 });
  assert.equal(reasonOf(decide(guest({ used: 2, attempts: 22 }))), 'attempt_limit');
});

test('가족: 하루 20장, 시도 42번', () => {
  assert.deepEqual(decide(family({ used: 19, attempts: 30 })), { ok: true, left: 1 });
  const day = decide(family({ used: 20, attempts: 20 }));
  assert.equal(!day.ok && day.message, '오늘 만들 수 있는 20장을 다 만들었어요. 내일 다시 해 주세요.');
  assert.equal(reasonOf(decide(family({ used: 3, attempts: 41 }))), 'ok');
  assert.equal(reasonOf(decide(family({ used: 3, attempts: 42 }))), 'attempt_limit');
});

test('관리자: 장수·시도 수에 제한이 없고 모두의 상한도 보지 않는다(남은 장수는 null). 칸 셋은 그대로', () => {
  assert.deepEqual(decide(admin({ used: 25, attempts: 60, total: 999 })), { ok: true, left: null });
  assert.deepEqual(decide(admin({ used: 1000, attempts: 5000, total: 150 }), 0), { ok: true, left: null });
  assert.deepEqual(decide(admin({ used: 30, kept: SLOTS })), { ok: false, reason: 'slots_full', message: MESSAGES.slotsFull, left: null },
    '칸 셋은 누구나 같다(칸이 다 차도 하루 장수는 여전히 제한 없음)');
});

test('칸만 다 찼으면 오늘 남은 장수를 함께 싣는다(칸을 비우면 바로 만든다)', () => {
  assert.deepEqual(decide(guest({ used: 3, attempts: 3, kept: SLOTS })), { ok: false, reason: 'slots_full', message: MESSAGES.slotsFull, left: 7 });
  assert.deepEqual(decide(family({ used: 19, attempts: 19, kept: SLOTS })), { ok: false, reason: 'slots_full', message: MESSAGES.slotsFull, left: 1 });
  // 다른 까닭이면 싣지 않는다(오늘은 칸을 비워도 소용없다)
  for (const raw of [guest({ used: 10, kept: SLOTS }), guest({ attempts: 22, kept: SLOTS }), guest({ total: 150, kept: SLOTS })]) {
    assert.equal('left' in decide(raw), false, JSON.stringify(raw));
  }
});

test('내 캐릭터 화면의 장수 줄: 내 하루 장수만 말하고, 모두의 상한·시도 수로 막혔으면 숨긴다', () => {
  const line = (raw: Record<string, unknown>, totalCap = 150) => dailyLine(readQuota(raw), decide(raw, totalCap));
  assert.equal(line(guest({ used: 2 })), '오늘 10장 중 8장 남았어요.');
  assert.equal(line(family({ used: 5, kept: SLOTS })), '오늘 20장 중 15장 남았어요.', '칸만 다 찼으면 남은 장수 그대로');
  assert.equal(line(guest({ used: 10 })), '오늘 10장 중 0장 남았어요.', '내 장수를 다 썼으면 0장');
  // 하나도 안 만든 사람에게 「0장 남았어요」라고 하지 않는다(까닭은 만들기 카드가 알린다)
  assert.equal(line(guest({ total: 150 })), null, '모두의 상한');
  assert.equal(line(guest(), 0), null, '모두의 상한 0');
  assert.equal(line(guest({ used: 1, attempts: 22 })), null, '시도 수');
  // 제한 없는 역할: 「오늘은」이 아니라 「하루 장수」(칸이 다 차도 같은 말, 칸 안내는 따로 뜬다)
  assert.equal(line(admin({ used: 40 })), '하루 장수 제한 없이 만들 수 있어요.');
  assert.equal(line(admin({ used: 40, kept: SLOTS })), '하루 장수 제한 없이 만들 수 있어요.');
  // 옛 DB(0020 전)는 예전 숫자
  assert.equal(line({ used: 1, attempts: 1, total: 0, kept: 0 }), `오늘 ${PER_USER_DAILY}장 중 ${PER_USER_DAILY - 1}장 남았어요.`);
});

test('걷기 화면 작업대 머리줄의 오늘 장수: 남은 장수, 칸(0021 전)이 다 찼으면 비우면 몇 장 더, 제한이 없으면 그렇다고', () => {
  // /api/avatar/slots의 quota는 decideQuota 그대로다. 이력이 다 찼을 때는 tests/unit/avatar-history.test.ts가 본다
  const part = (raw: Record<string, unknown>, totalCap = 150) => dailyPart(decide(raw, totalCap));
  assert.equal(part(guest({ used: 3 })), '오늘 7장 더');
  assert.equal(part(guest({ used: 3, kept: SLOTS })), '칸을 비우면 오늘 7장 더');
  assert.equal(part(admin({ used: 50 })), '하루 장수 제한 없음');
  assert.equal(part(admin({ used: 50, kept: SLOTS })), '하루 장수 제한 없음');
  for (const raw of [guest({ used: 10, kept: SLOTS }), guest({ attempts: 22 }), guest({ total: 150 })]) assert.equal(part(raw), null, JSON.stringify(raw));
  assert.equal(dailyPart(null), null);
  assert.equal(dailyPart({ ok: false, reason: 'slots_full', message: 'x' }), null, '옛 응답(left 없음)이면 붙이지 않는다');
});

test('손님·가족은 모두의 상한이 차면 total_limit(관리자만 빠진다)', () => {
  for (const raw of [guest({ total: 150 }), family({ total: 150 })]) assert.equal(reasonOf(decide(raw)), 'total_limit');
  assert.equal(reasonOf(decide(guest(), 0)), 'total_limit', '상한 0이면 손님도 못 만든다');
  assert.equal(reasonOf(decide(admin(), 0)), 'ok');
});

test('확인 순서는 DB의 avatar_begin과 같다: 내 장수 → 내 시도 → 모두의 상한 → 칸', () => {
  const all = { used: 10, attempts: 22, total: 150, kept: SLOTS };
  assert.equal(reasonOf(decide(guest(all))), 'user_limit');
  assert.equal(reasonOf(decide(guest({ ...all, used: 1 }))), 'attempt_limit');
  assert.equal(reasonOf(decide(guest({ ...all, used: 1, attempts: 1 }))), 'total_limit');
  assert.equal(reasonOf(decide(guest({ ...all, used: 1, attempts: 1, total: 0 }))), 'slots_full');
});

test('장수 읽기: 역할 한도는 DB가 줄 때만 싣고, null(제한 없음)은 그대로 싣는다', () => {
  assert.deepEqual(readQuota(guest({ used: 1, attempts: 2, total: 3, kept: 1 })),
    { used: 1, attempts: 2, total: 3, kept: 1, cap: 10, attemptCap: 22, totalExempt: false });
  assert.deepEqual(readQuota(admin()),
    { used: 0, attempts: 0, total: 0, kept: 0, cap: null, attemptCap: null, totalExempt: true });
  assert.deepEqual(dailyLimits(readQuota(family())), { cap: 20, attemptCap: 42, totalExempt: false });
});

test('옛 DB(0020 전)의 응답이면 예전 숫자(하루 3장, 시도 8번, 모두의 상한)로 돌아간다', () => {
  const old = { used: 0, attempts: 0, total: 0, kept: 0, per_user: 3, attempts_max: 8, slots: 3 };
  assert.deepEqual(readQuota(old), { used: 0, attempts: 0, total: 0, kept: 0 }, '없는 칸은 싣지 않는다');
  assert.deepEqual(dailyLimits(readQuota(old)), { cap: PER_USER_DAILY, attemptCap: ATTEMPTS_DAILY, totalExempt: false });
  assert.deepEqual(decide(old), { ok: true, left: PER_USER_DAILY });
  const day = decide({ ...old, used: PER_USER_DAILY });
  assert.equal(!day.ok && day.message, '오늘 만들 수 있는 3장을 다 만들었어요. 내일 다시 해 주세요.');
  assert.equal(reasonOf(decide({ ...old, used: 1, attempts: ATTEMPTS_DAILY })), 'attempt_limit');
  assert.equal(reasonOf(decide({ ...old, total: 150 })), 'total_limit');
  // 0019 전(kept도 없음)도 그대로
  assert.deepEqual(decide({ used: 0, attempts: 0, total: 0 }), { ok: true, left: PER_USER_DAILY });
});

test('모양이 이상한 한도는 0으로 본다(모르면 막는다). 제한 없음은 null일 때만, 상한 밖은 true일 때만', () => {
  for (const bad of ['x', -1, {}, true, '', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(reasonOf(decide(guest({ cap: bad }))), 'user_limit', `cap ${String(bad)}`);
    assert.equal(reasonOf(decide(guest({ attempt_cap: bad }))), 'attempt_limit', `attempt_cap ${String(bad)}`);
  }
  // 0장이면 숫자 없이 안내한다(「0장을 다 만들었어요」라고 하지 않는다)
  const zero = decide(guest({ cap: 0 }));
  assert.equal(!zero.ok && zero.message, '오늘 만들 수 있는 만큼 다 만들었어요. 내일 다시 해 주세요.');
  assert.deepEqual(decide(guest({ cap: '12', used: 2 })), { ok: true, left: 10 }, '숫자 글자는 숫자로');
  assert.deepEqual(decide(guest({ cap: 12.7 })), { ok: true, left: 12 });
  for (const notTrue of ['true', 1, null]) {
    assert.equal(reasonOf(decide(admin({ total_exempt: notTrue, total: 150 }))), 'total_limit', String(notTrue));
  }
});

test('하루 장수 글: 숫자를 받아 「오늘 만들 수 있는 N장」, 숫자를 모르면 숫자 없이', () => {
  assert.equal(MESSAGES.userLimit(10), '오늘 만들 수 있는 10장을 다 만들었어요. 내일 다시 해 주세요.');
  assert.equal(MESSAGES.userLimit(PER_USER_DAILY), '오늘 만들 수 있는 3장을 다 만들었어요. 내일 다시 해 주세요.');
  assert.equal(MESSAGES.userLimit(null), '오늘 만들 수 있는 만큼 다 만들었어요. 내일 다시 해 주세요.');
  assert.equal(MESSAGES.userLimit(), MESSAGES.userLimit(null));
});

test('화면 글은 하루 장수를 고정해 말하지 않고, 제한 없는 역할에는 「하루 장수 제한 없이」를 보인다', () => {
  for (const file of ['app/avatar/AvatarStudio.tsx', 'app/avatar/page.tsx', 'components/walk/CharacterPanel.tsx', 'lib/avatar/consent.ts']) {
    assert.doesNotMatch(src(file), /하루 \d+장|\d+장까지/, file);
    assert.doesNotMatch(src(file), /오늘은 제한 없이/, `${file}: 「오늘은」은 오늘만 풀린 것처럼 읽힌다`);
  }
  const page = src('app/avatar/page.tsx');
  assert.doesNotMatch(page, /PER_USER_DAILY/, '내 캐릭터 화면은 DB가 준 하루 장수를 쓴다');
  assert.match(page, /dailyLine\(quota, decision\)/, '장수 줄은 dailyLine 한곳에서 만든다');
  assert.match(page, /unlimited \? null : ' 그림을 지워도 오늘 만든 장수는 그대로예요\.'/, '제한 없는 역할에는 뜻이 없는 말이라 숨긴다');
  const panel = src('components/walk/CharacterPanel.tsx');
  assert.match(panel, /headLine\(quota, counts, modelsOnNow\)/, '작업대 머리줄은 headLine 한곳에서 만든다(오늘 장수는 dailyPart)');
  assert.match(src('lib/avatar/rules.ts'), /q\.left === null \? null/, '칸 응답의 left: null(제한 없음)을 0으로 바꾸지 않는다');
  assert.match(panel, /emph=\{historyFull \|\| \(!features && full && blocked\?\.reason === 'slots_full'\)\}/,
    '「지우기」 강조는 이력(0021)이나 칸(그 전) 때문에 막혔을 때만(오늘 장수를 다 썼으면 지워도 소용없다)');
  assert.match(src('app/avatar/AvatarStudio.tsx'), /left === null \|\| left > 0/, '제한이 없으면 「하나 더 만들기」를 둔다');
  assert.match(src('app/api/avatar/route.ts'), /MESSAGES\.userLimit\(dailyLimits\(read\)\.cap\)/, 'DB가 늦게 막아도 내 하루 장수로 안내한다');
});

test('내 캐릭터 화면의 칸 셋은 보관 중 줄만으로 놓는다: 지운 줄이 많아도 칸에 든 캐릭터가 밀려나지 않는다', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const at = (min: number) => new Date(Date.UTC(2026, 10, 11, 0, min)).toISOString();
  // 1번 칸에 끼운 캐릭터 하나, 그보다 새로운 지운 줄 40개(2·3번 칸에서 만들고 비우기를 되풀이한 날)
  const kept = { id: id(1), status: 'ready', slot: 1, created_at: at(0), original_path: 'o', image_path: 'c' };
  const deleted = Array.from({ length: 40 }, (_, k) => ({ id: id(100 + k), status: 'deleted', slot: 2 + (k % 2), created_at: at(1 + k), original_path: null, image_path: null }));
  const newest40 = [kept, ...deleted].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  assert.deepEqual(arrangeSlots(newest40).cells, [null, null, null], '예전처럼 섞어 최근 40줄로 자르면 1번 칸이 빈 칸으로 보였다');
  assert.equal(arrangeSlots([kept]).cells[0]?.id, id(1), '보관 중 줄만 읽으면 1번 칸이 보인다');
  assert.equal(arrangeSlots([kept, ...deleted]).cells[0]?.id, id(1));
  // 화면은 보관 중 줄과 원본이 남은 지운 줄을 따로 읽는다(걷기 화면의 /api/avatar/slots도 보관 중 줄만 읽는다)
  const page = src('app/avatar/page.tsx');
  assert.match(page, /\.in\('status', \[\.\.\.KEPT_STATUSES\]\)/, '칸은 보관 중 줄만');
  assert.doesNotMatch(page, /\[\.\.\.KEPT_STATUSES, 'deleted'\]/, '보관 중과 지운 줄을 한 창에 섞지 않는다');
  assert.match(page, /\.eq\('status', 'deleted'\)\s*\.not\('original_path', 'is', null\)/, '지운 줄은 원본이 남은 것만');
  assert.match(page, /원본 사진이 더 있어요/, '보이는 것보다 원본이 많으면 알린다(모두 지우기는 전부 지운다)');
  assert.match(src('app/api/avatar/slots/route.ts'), /\.in\('status', kept\)/);
});

test('0020의 숫자: 손님 10장·22번, 가족 20장·42번(시도 = 장수 × 2 + 2), 관리자는 null. 칸 셋과 기본 상한은 사이트와 같다', () => {
  assert.match(SQL, /'guest', jsonb_build_object\('per_day', 10, 'attempts', 22, 'total_exempt', false\)/);
  assert.match(SQL, /'family', jsonb_build_object\('per_day', 20, 'attempts', 42, 'total_exempt', false\)/);
  assert.match(SQL, /'admin', jsonb_build_object\('per_day', null, 'attempts', null, 'total_exempt', true\)/);
  for (const [n, tries] of [[10, 22], [20, 42], [PER_USER_DAILY, ATTEMPTS_DAILY]]) assert.equal(tries, n * 2 + 2);
  assert.match(SQL, new RegExp(`'slots', ${SLOTS}`));
  assert.match(SQL, new RegExp(`\\(v_q ->> 'kept'\\)::int >= ${SLOTS}`));
  assert.match(SQL, new RegExp(`p_total_cap int default ${DEFAULT_TOTAL_CAP}`));
  assert.match(SQL, new RegExp(`coalesce\\(p_total_cap, ${DEFAULT_TOTAL_CAP}\\)`));
  assert.match(SQL, /status in \('pending', 'queued', 'drawing', 'ready', 'deleted'\)/, '거절·실패는 장수에 세지 않는다(0003 그대로)');
});
