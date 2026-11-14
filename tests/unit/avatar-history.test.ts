// 사진 캐릭터 이력·작업대·보관(★)·3D 요청(0021)의 사이트 쪽: 장수 응답 읽기와 판정(history_full), 머리줄 글,
// 이력 줄 읽기와 작업대 놓기, 걷기 화면이 칸 답을 읽는 모양, ★·작업대·3D 요청 라우트의 답(상태 코드와 글), 안내 글.
// DB 쪽 판정(한도, 작업대 돌리기, 남의 줄, 일꾼의 잡기)은 tests/sql/rls.test.mjs의 0021 묶음이 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 가져온다: 시험에서는 .ts를 붙여 찾게 한다
const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const R = await import('../../src/lib/avatar/rules.ts');
const M = await import('../../src/lib/avatar/manage.ts');
const { MESSAGES, SLOTS, SLOTS_MAX } = R;
type CharItem = import('../../src/lib/avatar/rules.ts').CharItem;

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const SQL = readFileSync(new URL('../../supabase/migrations/0021_avatar_history_keep_3d.sql', import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (min: number) => new Date(Date.UTC(2026, 10, 12, 3, min)).toISOString();

/** 0021을 올린 DB가 역할마다 주는 장수 응답(avatar_quota) */
const guest = (o: Record<string, unknown> = {}) => ({
  used: 0, attempts: 0, total: 0, slots: 3, cap: 10, attempt_cap: 22, total_exempt: false,
  history: 0, history_cap: 10, keeps: 0, keep_cap: 3, models: 0, model_cap: 1,
  model_tries: 0, model_tries_cap: 2, model_day: 0, model_day_cap: 100, ...o,
});
const family = (o: Record<string, unknown> = {}) => guest({ slots: 9, cap: 20, attempt_cap: 42, history_cap: 20, keep_cap: 5, ...o });
const admin = (o: Record<string, unknown> = {}) =>
  guest({
    slots: 9, cap: null, attempt_cap: null, total_exempt: true, history_cap: null, keep_cap: null, model_cap: null, model_tries_cap: null,
    model_day_cap: null, ...o,
  });
const decide = (raw: unknown, totalCap = 150) => R.decideQuota(R.readQuota(raw), totalCap);

// ───────────────────────────── 장수 응답과 판정
test('장수 읽기(0021): 이력·보관·3D의 수와 한도를 싣고, null(제한 없음)은 그대로, 한도 칸이 빠지면 0(모르면 막는다)', () => {
  assert.deepEqual(R.readQuota(guest({ history: 4, keeps: 1, models: 1, model_tries: 1, model_day: 7 })), {
    used: 0, attempts: 0, total: 0, cap: 10, attemptCap: 22, totalExempt: false, slots: 3,
    history: 4, historyCap: 10, keeps: 1, keepCap: 3, models: 1, modelCap: 1,
    modelTries: 1, modelTriesCap: 2, modelDay: 7, modelDayCap: 100,
  });
  const a = R.readQuota(admin());
  assert.deepEqual([a.historyCap, a.keepCap, a.modelCap, a.modelTriesCap, a.modelDayCap], [null, null, null, null, null]);
  const missing = R.readQuota({ used: 0, attempts: 0, total: 0, history: 2 });
  assert.deepEqual([missing.historyCap, missing.keepCap, missing.modelCap, missing.modelTriesCap, missing.modelDayCap], [0, 0, 0, 0, 0]);
  // 0021 전의 응답(kept만)이면 이력 칸을 싣지 않는다
  assert.equal('history' in R.readQuota({ used: 0, attempts: 0, total: 0, kept: 2 }), false);
});

test('작업대 칸 수(0021): DB가 역할마다 준 slots(손님 3, 가족·관리자 9)를 그대로 쓰고, 빠지거나 이상하면 3, 1~9 밖이면 가까운 끝', () => {
  const size = (raw: Record<string, unknown>) => R.benchSize(R.readQuota(raw));
  assert.deepEqual([size(guest()), size(family()), size(admin())], [3, 9, 9]);
  assert.equal(size(guest({ slots: undefined })), 3, '빠지면 3(칸 수는 돈 한도가 아니라 화면의 칸이다)');
  const cases: [unknown, number][] = [[null, 3], ['x', 3], [{}, 3], [Number.POSITIVE_INFINITY, 3], [0, 1], [-4, 1], [12, 9], [9.8, 9], ['6', 6]];
  for (const [v, want] of cases) assert.equal(size(guest({ slots: v })), want, String(v));
  // 0021 전의 응답(이력 수가 없음)은 칸 수를 싣지 않는다: 누구나 예전 칸 셋
  assert.equal(R.benchSize(R.readQuota({ used: 0, attempts: 0, total: 0, kept: 1, slots: 3 })), SLOTS);
  assert.equal(R.benchSize(null), SLOTS);
  assert.deepEqual(R.slotNumbers(9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(R.slotNumbers(3), [1, 2, 3]);
  assert.deepEqual([SLOTS, SLOTS_MAX], [3, 9]);
});

test('이력 한도: 손님 10·가족 20이 차면 history_full(오늘 남은 장수를 함께 싣는다), 관리자는 제한 없음. slots_full은 0021에서 나오지 않는다', () => {
  assert.deepEqual(decide(guest({ history: 9, used: 2 })), { ok: true, left: 8 });
  assert.deepEqual(decide(guest({ history: 10, used: 2 })), { ok: false, reason: 'history_full', message: MESSAGES.historyFull(10), left: 8 });
  assert.equal(MESSAGES.historyFull(10), '이력이 다 찼어요(10개). 이력에서 지울 그림을 골라 지우면 새로 만들 수 있어요.');
  assert.deepEqual(decide(family({ history: 19 })), { ok: true, left: 20 });
  assert.equal((decide(family({ history: 20 })) as { reason?: string }).reason, 'history_full');
  assert.deepEqual(decide(admin({ history: 500, used: 80 })), { ok: true, left: null });
  // 작업대가 다 찼다는 옛 판정(kept ≥ 3)은 0021의 응답에서 보지 않는다: 작업대는 DB가 한 칸을 비워 준다
  assert.deepEqual(decide(guest({ history: 3, kept: 3 })), { ok: true, left: 10 });
  // 한도 칸이 빠진 응답은 0(모르면 막는다)
  assert.equal((decide({ used: 0, attempts: 0, total: 0, history: 0 }) as { reason?: string }).reason, 'history_full');
});

test('확인 순서는 DB의 avatar_begin과 같다: 내 장수 → 내 시도 → 모두의 상한 → 이력(오늘 못 만드는 사람에게 지우라고 하지 않는다)', () => {
  const all = { used: 10, attempts: 22, total: 150, history: 10 };
  const reasonOf = (d: ReturnType<typeof R.decideQuota>) => (d.ok ? 'ok' : d.reason);
  assert.equal(reasonOf(decide(guest(all))), 'user_limit');
  assert.equal(reasonOf(decide(guest({ ...all, used: 1 }))), 'attempt_limit');
  assert.equal(reasonOf(decide(guest({ ...all, used: 1, attempts: 1 }))), 'total_limit');
  assert.equal(reasonOf(decide(guest({ ...all, used: 1, attempts: 1, total: 0 }))), 'history_full');
  assert.match(SQL, /'total_limit'\);\n  end if;\n  if \(v_q ->> 'history_cap'\) is not null and \(v_q ->> 'history'\)::int >= \(v_q ->> 'history_cap'\)::int then/);
});

test('머리줄: 「오늘 N장 더 · 이력 x/y · ★ x/y · 3D n번 남음」, 제한이 없거나 쉬거나 다 썼으면 그렇다고, 0021 전이면 오늘 장수만', () => {
  const line = (raw: Record<string, unknown>, totalCap = 150, on = true) => R.headLine(decide(raw, totalCap), R.countsOf(R.readQuota(raw)), on);
  assert.equal(line(guest({ used: 3, history: 4, keeps: 1 })), '오늘 7장 더 · 이력 4/10 · ★ 1/3 · 3D 1번 남음');
  assert.equal(line(guest({ used: 3, history: 10, keeps: 3, models: 1 })), '이력에서 지우면 오늘 7장 더 · 이력 10/10 · ★ 3/3 · 3D 다 씀(한 사람 한 번)');
  assert.equal(line(family({ history: 2, keeps: 5, models: 1 })), '오늘 20장 더 · 이력 2/20 · ★ 5/5 · 3D 다 씀(한 사람 한 번)');
  assert.equal(line(admin({ used: 40, history: 41, keeps: 9, models: 4, model_tries: 9, model_day: 400 })),
    '하루 장수 제한 없음 · 이력 41개(제한 없음) · ★ 9개(제한 없음) · 3D 제한 없음');
  // 하루 규칙으로 막혔으면 오늘 장수 조각을 빼고 수만
  assert.equal(line(guest({ used: 10, history: 10 })), '이력 10/10 · ★ 0/3 · 3D 1번 남음');
  // 실패해서 한 번 더 해 볼 수 있음(시도 1/2), 다시 해 보기까지 다 씀(시도 2/2), 오늘 모두의 상한, 쉬는 중
  assert.equal(line(guest({ model_tries: 1 })), '오늘 10장 더 · 이력 0/10 · ★ 0/3 · 3D 1번 남음');
  assert.equal(line(guest({ model_tries: 2 })), '오늘 10장 더 · 이력 0/10 · ★ 0/3 · 3D 다 씀(다시 해 보기까지)');
  assert.equal(line(guest({ model_day: 100 })), '오늘 10장 더 · 이력 0/10 · ★ 0/3 · 오늘 3D는 다 찼어요');
  assert.equal(line(guest(), 150, false), '오늘 10장 더 · 이력 0/10 · ★ 0/3 · 3D 쉬는 중');
  assert.equal(line(admin(), 150, false).endsWith('3D 쉬는 중'), true, '쉬는 중은 관리자에게도');
  // 0021 전의 응답
  assert.equal(R.headLine(decide({ used: 1, attempts: 1, total: 0, kept: 1, cap: 10, attempt_cap: 22 }), null), '오늘 9장 더');
  assert.deepEqual(R.countParts(null), []);
  assert.equal(R.modelsLeft(null), 0);
});

test('3D 남은 수(modelRoom): 요청 몫과 돈이 든 시도 몫 가운데 작은 것, 오늘 모두의 상한이 차면 0. 까닭을 함께', () => {
  const room = (raw: Record<string, unknown>, on = true) => R.modelRoom(R.countsOf(R.readQuota(raw)), on);
  assert.deepEqual(room(guest()), { left: 1, why: null });
  assert.deepEqual(room(guest({ models: 1 })), { left: 0, why: 'used' });
  assert.deepEqual(room(guest({ model_tries: 1 })), { left: 1, why: null }, '실패 뒤 한 번 더');
  assert.deepEqual(room(guest({ model_tries: 2 })), { left: 0, why: 'tried' });
  assert.deepEqual(room(guest({ model_day: 100 })), { left: 0, why: 'today' });
  assert.deepEqual(room(guest(), false), { left: 0, why: 'off' });
  assert.deepEqual(room(admin({ models: 9, model_tries: 30, model_day: 999 })), { left: null, why: null }, '관리자는 셋 다 보지 않는다');
  assert.deepEqual(room(guest({ model_cap: 3, model_tries_cap: 2, model_tries: 1 })), { left: 1, why: null }, '작은 쪽');
  assert.deepEqual(R.modelRoom(null), { left: 0, why: null }, '0021 전');
  // 옛 답(시도·하루 수 없음)은 그 둘을 보지 않는다(DB가 막는다)
  assert.deepEqual(R.modelRoom({ history: { n: 0, cap: 10 }, keeps: { n: 0, cap: 3 }, models: { n: 0, cap: 1 } }), { left: 1, why: null });
});

test('「내 캐릭터」 화면의 장수 줄: 이력이 다 찼어도 오늘 남은 장수를 말한다(지우면 바로 만든다)', () => {
  const raw = guest({ used: 4, history: 10 });
  assert.equal(R.dailyLine(R.readQuota(raw), decide(raw)), '오늘 10장 중 6장 남았어요.');
  assert.equal(R.dailyPart(decide(raw)), '이력에서 지우면 오늘 6장 더');
});

// ───────────────────────────── 이력 줄과 작업대
test('이력 줄 읽기: 지우지 않은 그림만 최근부터, ★는 다 그린 그림만, 3D 상태를 줄의 모형 칸과 요청으로 정한다', () => {
  const items = R.readCharacters([
    { id: id(1), status: 'ready', slot: 2, created_at: at(1), kept_at: at(5), model_requested_at: at(6), model_status: null },
    { id: id(2), status: 'ready', slot: null, created_at: at(2), kept_at: null, model_requested_at: null, model_status: 'ready' },
    { id: id(3), status: 'drawing', slot: 1, created_at: at(3), kept_at: at(3), model_requested_at: null, model_status: null },
    { id: id(4), status: 'deleted', slot: 3, created_at: at(4) },
    { id: 'nope', status: 'ready', created_at: at(5) },
    { id: id(6), status: 'ready', slot: 7, created_at: at(6), kept_at: at(7), model_requested_at: at(8), model_status: 'failed' },
    { id: id(7), status: 'ready', created_at: at(7), model_requested_at: null, model_status: 'failed' },
    { id: id(8), status: 'ready', created_at: at(8), kept_at: at(9), model_requested_at: at(9), model_status: 'drawing' },
  ]);
  assert.deepEqual(items.map((c) => [c.blocked, c.reconsent]), items.map(() => [false, false]));
  assert.deepEqual(items.map((c) => [c.id, c.status, c.slot, c.kept, c.model]), [
    [id(8), 'ready', null, true, 'making'],
    [id(7), 'ready', null, false, 'none'],      // 요청하지 않은 실패(0016에서 저절로)는 none: 요청할 수 있다
    [id(6), 'ready', null, true, 'failed'],     // 칸 번호가 이상하면 작업대 밖
    [id(3), 'drawing', 1, false, 'none'],       // 그리는 중에는 ★·3D가 없다
    [id(2), 'ready', null, false, 'ready'],
    [id(1), 'ready', 2, true, 'waiting'],
  ]);
  assert.equal(items[0].since, at(8));
  assert.deepEqual(R.readCharacters(null), []);
  assert.equal(R.modelStateOf({ model_status: 'ready', model_requested_at: null }), 'ready', '0016에서 만든 3D도 그대로 쓴다');
  // 실패의 까닭: 다시 해도 같은 실패(지금 3D를 만드는 곳 기준)와 만드는 곳이 바뀌어 돌려준 요청
  const failed = (reason: string) => ({ id: id(20), status: 'ready', created_at: at(1), kept_at: at(2), model_requested_at: at(3), model_status: 'failed', model_reason: reason });
  const pick = (reason: string, via: 'meshy' | 'trellis') => {
    const [c] = R.readCharacters([failed(reason)], via);
    return [c.model, c.blocked, c.reconsent];
  };
  assert.deepEqual(pick('meshy_input', 'meshy'), ['failed', true, false]);
  assert.deepEqual(pick('meshy_input', 'trellis'), ['failed', false, false], '우리 컴퓨터는 받을 수 있다');
  assert.deepEqual(pick('bad_char', 'trellis'), ['failed', true, false], '그 그림 탓은 어디로든');
  assert.deepEqual(pick('glb_parts', 'meshy'), ['failed', false, false]);
  assert.deepEqual(pick('reconsent', 'meshy'), ['failed', false, true]);
  assert.equal(R.readCharacters([failed('meshy_input')])[0].blocked, true, '기본은 meshy');
});

test('다시 해도 같은 실패의 목록은 DB의 avatar_model_blocked와 같다', () => {
  const fn = SQL.slice(SQL.indexOf('create or replace function public.avatar_model_blocked'));
  const list = (re: RegExp) => [...(re.exec(fn)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(list(/select coalesce\(p_reason in \(([^)]*)\)/), [...R.MODEL_BLOCKED.any]);
  assert.deepEqual(list(/p_via = 'meshy' and p_reason in \(([^)]*)\)/), [...R.MODEL_BLOCKED.meshy]);
  assert.deepEqual(list(/p_via = 'trellis' and p_reason in \(([^)]*)\)/), [...R.MODEL_BLOCKED.trellis]);
  assert.equal(R.modelBlocked('blocked', 'meshy'), true);
  assert.equal(R.modelBlocked('blocked', 'trellis'), false);
  assert.equal(R.modelBlocked(null, 'meshy'), false);
});

test('작업대: 칸 번호대로 칸 수만큼(손님 3, 가족·관리자 9), 칸 번호가 없거나 칸 수 밖인 그림은 이력에만(빈 칸을 채우지 않는다)', () => {
  const items = R.readCharacters([
    { id: id(1), status: 'ready', slot: 3, created_at: at(1) },
    { id: id(2), status: 'ready', slot: null, created_at: at(2) },
    { id: id(3), status: 'queued', slot: 1, created_at: at(3) },
  ]);
  assert.deepEqual(R.benchCells(items).map((c) => c?.id ?? null), [id(3), null, id(1)]);
  assert.equal(R.benchCells([]).length, SLOTS);
  // 9칸(가족·관리자): 4~9번도 그 칸에, 9를 넘는 번호는 이력에
  const nine = R.readCharacters([
    { id: id(1), status: 'ready', slot: 9, created_at: at(1) },
    { id: id(2), status: 'ready', slot: 4, created_at: at(2) },
    { id: id(3), status: 'ready', slot: 10, created_at: at(3) },
  ], 'meshy', 9);
  assert.deepEqual(R.benchCells(nine, 9).map((c) => c?.id ?? null), [null, null, null, id(2), null, null, null, null, id(1)]);
  assert.equal(nine.find((c) => c.id === id(3))?.slot, null);
  assert.equal(R.benchCells([], 9).length, 9);
  // 역할이 줄어(가족 → 손님) 남은 4~9번 칸의 그림은 손님의 작업대(셋)에서 이력으로 읽는다
  const shrunk = R.readCharacters([
    { id: id(1), status: 'ready', slot: 9, created_at: at(1) },
    { id: id(2), status: 'ready', slot: 2, created_at: at(2) },
  ], 'meshy', 3);
  assert.deepEqual(shrunk.map((c) => [c.id, c.slot]), [[id(2), 2], [id(1), null]]);
  assert.deepEqual(R.benchCells(shrunk, 3).map((c) => c?.id ?? null), [null, id(2), null]);
  // 칸 수 밖의 번호를 단 그림을 그대로 넘겨도 놓지 않는다
  assert.deepEqual(R.benchCells(nine, 3).map((c) => c?.id ?? null), [null, null, null]);
});

test('3D를 요청할 수 있는 그림: 다 그렸고 ★로 보관했고 3D가 없거나 다시 해 볼 수 있는 실패이고, 3D가 남았을 때(제한 없음 포함)', () => {
  const base: CharItem = { id: id(1), status: 'ready', since: at(1), slot: null, kept: true, model: 'none', blocked: false, reconsent: false };
  assert.equal(R.canRequestModel(base, 1), true);
  assert.equal(R.canRequestModel(base, null), true, '관리자는 제한 없음');
  assert.equal(R.canRequestModel(base, 0), false, '다 썼다');
  assert.equal(R.canRequestModel({ ...base, kept: false }, 1), false, '보관(★)한 그림만');
  assert.equal(R.canRequestModel({ ...base, status: 'drawing' }, 1), false);
  assert.equal(R.canRequestModel({ ...base, model: 'failed' }, 1), true, '실패한 그림은 다시 요청한다(한도에서 빠졌다)');
  assert.equal(R.canRequestModel({ ...base, model: 'failed', blocked: true }, 1), false, '다시 해도 같은 실패는 다시 보내지 않는다');
  assert.equal(R.canRequestModel({ ...base, model: 'failed', reconsent: true }, 1), true, '만드는 곳이 바뀐 요청은 다시 묻는다');
  for (const model of ['waiting', 'making', 'ready'] as const) assert.equal(R.canRequestModel({ ...base, model }, 1), false, model);
  assert.deepEqual(['none', 'waiting', 'making', 'ready', 'failed'].map((s) => R.modelBadge(s as CharItem['model'])),
    ['', '3D 차례 기다리는 중', '3D 만드는 중', '3D', '3D를 만들지 못했어요']);
  // 실패 배지는 까닭과 다시 해 볼 수 있는지로
  const failed = { ...base, model: 'failed' as const };
  assert.equal(R.itemBadge(failed, 1), '3D를 못 만들었어요. 다시 해 볼 수 있어요');
  assert.equal(R.itemBadge(failed, 0), '3D를 만들지 못했어요');
  assert.equal(R.itemBadge({ ...failed, blocked: true }, 1), '이 그림은 3D로 만들 수 없어요');
  assert.equal(R.itemBadge({ ...failed, reconsent: true }, 1), '3D 만드는 곳이 바뀌었어요. 다시 눌러 주세요');
});

test('그림 지우기 확인: 3D 한도가 있으면 다 만든 3D와 만드는 중인 3D는 한 번뿐인 3D를 잃는다고, 기다리는 요청은 함께 없어진다고', () => {
  assert.equal(R.deleteWarning('ready', 1), '3D 모형도 함께 지워지고, 3D는 다시 만들 수 없어요(한 사람 한 번).');
  assert.equal(R.deleteWarning('making', 1), '3D를 만드는 중이에요. 지우면 3D도 없어지고, 다시 만들 수 없어요(한 사람 한 번).');
  assert.equal(R.deleteWarning('waiting', 1), '3D 차례를 기다리는 그림이에요. 지우면 3D 요청도 함께 없어져요.');
  assert.match(R.deleteWarning('ready', 2) ?? '', /한 사람 2번/);
  for (const m of ['none', 'failed'] as const) assert.equal(R.deleteWarning(m, 1), null);
  assert.equal(R.deleteWarning('ready', null), null, '제한이 없으면(관리자) 붙이지 않는다');
  // 두 화면이 같은 한 줄을 쓴다
  assert.match(src('app/avatar/AvatarCard.tsx'), /deleteWarning\(card\.model, /);
  assert.match(src('components/walk/CharacterPanel.tsx'), /deleteWarning\(item\.model, actions\.modelCap\)/);
});

// ───────────────────────────── 걷기 화면이 읽는 칸 답(/api/avatar/slots)
test('칸 답 읽기(0021): 작업대·이력·수·3D 모드. 남은 장수 null(제한 없음)은 0으로 바꾸지 않는다', () => {
  const item = (n: number, o: Record<string, unknown> = {}) => ({ id: id(n), status: 'ready', since: at(n), slot: null, kept: false, model: 'none', ...o });
  const reply = R.readSlotsReply({
    enabled: true, max: 3,
    cells: [item(1, { slot: 1, kept: true, model: 'ready' }), null, item(3, { slot: 3, status: 'drawing' })],
    extra: [],
    history: [item(4), item(3, { slot: 3, status: 'drawing' }), item(1, { slot: 1, kept: true, model: 'ready' }), { id: 'bad' }],
    more: true,
    counts: {
      history: { n: 3, cap: 10 }, keeps: { n: 1, cap: 3 }, models: { n: 0, cap: 1 }, tries: { n: 1, cap: 2 }, day: { n: 9, cap: 100 },
    },
    quota: { ok: true, left: null },
    provider: 'trellis',
    models_on: true,
    training_optout: true,
  });
  assert.ok(reply);
  assert.deepEqual(reply.cells.map((c) => c && [c.id, c.slot, c.kept, c.model]), [[id(1), 1, true, 'ready'], null, [id(3), 3, false, 'none']]);
  assert.deepEqual(reply.history?.map((c) => c.id), [id(4), id(3), id(1)], '모양이 이상한 줄은 뺀다');
  assert.equal(reply.more, true);
  assert.deepEqual(reply.counts, {
    history: { n: 3, cap: 10 }, keeps: { n: 1, cap: 3 }, models: { n: 0, cap: 1 }, tries: { n: 1, cap: 2 }, day: { n: 9, cap: 100 },
  });
  assert.deepEqual(reply.quota, { ok: true, left: null });
  assert.equal(reply.provider, 'trellis');
  assert.equal(reply.modelsOn, true);
  assert.equal(reply.trainingOptOut, true);
  // 실패 까닭 표시는 실패한 그림에만
  const marks = R.readSlotsReply({
    cells: [], quota: { ok: true, left: 1 },
    history: [item(1, { model: 'failed', blocked: true }), item(2, { model: 'failed', reconsent: true }), item(3, { model: 'ready', blocked: true })],
  });
  assert.deepEqual(marks?.history?.map((c) => [c.blocked, c.reconsent]), [[true, false], [false, true], [false, false]]);
  // 9칸 답(가족·관리자): 칸 아홉, 4~9번도 그 칸에
  const wide = R.readSlotsReply({
    max: 9, cells: [item(1, { slot: 1 }), null, null, null, null, null, null, null, item(9, { slot: 9 })],
    quota: { ok: true, left: 20 }, history: [item(9, { slot: 9 }), item(5, { slot: 5 })],
  });
  assert.deepEqual(wide?.cells.map((c) => c?.slot ?? null), [1, null, null, null, null, null, null, null, 9]);
  assert.deepEqual(wide?.history?.map((c) => c.slot), [9, 5]);
  // 손님 답(max 3): 칸 수 밖의 번호는 이력의 그림에 싣지 않는다(역할이 줄어 남은 칸)
  const narrow = R.readSlotsReply({ max: 3, cells: [item(1, { slot: 1 }), null, null], quota: { ok: true, left: 1 }, history: [item(7, { slot: 7 })] });
  assert.deepEqual([narrow?.cells.length, narrow?.history?.[0].slot], [3, null]);
  // max가 이상하면 1~9로 묶고, 없는 옛 답은 3
  assert.equal(R.readSlotsReply({ max: 40, cells: [], quota: { ok: true } })?.cells.length, 9);
  assert.equal(R.readSlotsReply({ max: 'x', cells: [], quota: { ok: true } })?.cells.length, 3);
});

test('칸 답 읽기: 0021 전의 답(이력·수가 없음)은 칸 셋만, 모드는 meshy, 이상한 답은 null', () => {
  const old = R.readSlotsReply({
    cells: [{ id: id(1), status: 'ready', since: at(1) }, null, null],
    extra: [{ id: id(5), status: 'ready', since: at(5) }],
    quota: { ok: false, reason: 'slots_full', message: '꽉', left: 2 },
  });
  assert.ok(old);
  assert.deepEqual(old.cells[0], { id: id(1), status: 'ready', since: at(1), slot: 1, kept: false, model: 'none', blocked: false, reconsent: false },
    '칸 자리를 칸 번호로');
  assert.deepEqual([old.history, old.counts, old.more, old.provider, old.modelsOn, old.trainingOptOut], [null, null, false, 'meshy', true, false]);
  assert.deepEqual(old.quota, { ok: false, reason: 'slots_full', message: '꽉', left: 2 });
  assert.equal(R.readSlotsReply(null), null);
  assert.equal(R.readSlotsReply({ cells: 'x', quota: {} }), null);
  // 수의 모양이 이상하면 수를 싣지 않는다(화면은 0021 전처럼)
  const odd = R.readSlotsReply({ cells: [], quota: { ok: true, left: 1 }, history: [], counts: { history: { n: -1, cap: 10 } } });
  assert.equal(odd?.counts, null);
  assert.equal(R.readSlotsReply({ cells: [], quota: { ok: true }, models_on: false })?.modelsOn, false);
});

// ───────────────────────────── ★·작업대·3D 요청의 답(라우트와 서버 액션이 함께 쓴다)
type Call = { fn: string; args: Record<string, unknown> };
/** 가짜 연결: 부른 함수와 인자를 모으고 정해 둔 답을 준다 */
function client(reply: { data?: unknown; error?: unknown } | (() => never)) {
  const calls: Call[] = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (typeof reply === 'function') return reply();
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  };
}
const ID = id(42);

test('★ 보관: DB 함수 avatar_keep에 그림과 켜고 끄기를 넘기고, 200 {ok, kept}. 보관이 다 찼으면 409와 한도를 넣은 글', async () => {
  const on = client({ data: { ok: true, kept: true } });
  assert.deepEqual(await M.keepCharacter(on, ID, true), { status: 200, body: { ok: true, kept: true } });
  assert.deepEqual(on.calls, [{ fn: 'avatar_keep', args: { p_id: ID, p_on: true } }]);
  const off = client({ data: { ok: true, kept: false } });
  assert.deepEqual(await M.keepCharacter(off, ID, false), { status: 200, body: { ok: true, kept: false } });
  const full = await M.keepCharacter(client({ data: { ok: false, reason: 'keep_full', cap: 3 } }), ID, true);
  assert.deepEqual(full, { status: 409, body: { ok: false, reason: 'keep_full', message: '★ 보관은 3개까지예요. 다른 그림의 ★을 빼면 보관할 수 있어요.' } });
  assert.deepEqual((await M.keepCharacter(client({ data: { ok: false, reason: 'not_ready' } }), ID, true)).body,
    { ok: false, reason: 'not_ready', message: MESSAGES.picNotReady });
});

test('작업대로: avatar_to_bench에 칸(없으면 null)을 넘기고 200 {ok, slot, moved}. 빈 칸이 없으면 409 bench_full', async () => {
  const c = client({ data: { ok: true, slot: 2, moved: id(9) } });
  assert.deepEqual(await M.benchCharacter(c, ID, 2), { status: 200, body: { ok: true, slot: 2, moved: id(9) } });
  assert.deepEqual(c.calls, [{ fn: 'avatar_to_bench', args: { p_id: ID, p_slot: 2 } }]);
  const free = client({ data: { ok: true, slot: 1, moved: null } });
  assert.deepEqual(await M.benchCharacter(free, ID, null), { status: 200, body: { ok: true, slot: 1, moved: null } });
  assert.deepEqual(free.calls[0].args, { p_id: ID, p_slot: null });
  assert.deepEqual(await M.benchCharacter(client({ data: { ok: false, reason: 'bench_full' } }), ID, null),
    { status: 409, body: { ok: false, reason: 'bench_full', message: MESSAGES.benchFull } });
  assert.deepEqual((await M.benchCharacter(client({ data: { ok: true, slot: 'x', moved: 'not-a-uuid' } }), ID, null)).body,
    { ok: true, slot: null, moved: null }, '모양이 이상한 값은 싣지 않는다');
  // 9칸의 끝 번호도 넘긴다
  const nine = client({ data: { ok: true, slot: 9, moved: null } });
  assert.deepEqual(await M.benchCharacter(nine, ID, 9), { status: 200, body: { ok: true, slot: 9, moved: null } });
  assert.deepEqual(nine.calls[0].args, { p_id: ID, p_slot: 9 });
  // 화면의 칸 수가 낡았을 때(그사이 역할이 바뀌어 칸 번호가 칸 수 밖): DB의 bad_slot은 409와 다시 열라는 글
  assert.deepEqual(await M.benchCharacter(client({ error: { code: '22023', message: 'bad_slot' } }), ID, 5),
    { status: 409, body: { ok: false, reason: 'bad_slot', message: MESSAGES.benchChanged } });
  assert.equal((await M.benchCharacter(client({ error: { code: '22023', message: 'bad_on' } }), ID, 5)).status, 503, '다른 오류는 그대로');
});

test('3D 요청: 확인 글이 알린 곳(via)을 함께 넘기고, 새로 줄에 서면 202, 이미 있거나 만드는 중이면 200. 막힌 까닭은 409와 그 글', async () => {
  const c = client({ data: { ok: true, already: false } });
  assert.deepEqual(await M.requestModel(c, ID, 'meshy'), { status: 202, body: { ok: true, already: false } });
  assert.deepEqual(c.calls, [{ fn: 'avatar_model_request', args: { p_id: ID, p_via: 'meshy' } }]);
  const t = client({ data: { ok: true, already: false } });
  await M.requestModel(t, ID, 'trellis');
  assert.deepEqual(t.calls[0].args, { p_id: ID, p_via: 'trellis' });
  assert.deepEqual(await M.requestModel(client({ data: { ok: true, already: true } }), ID, 'meshy'), { status: 200, body: { ok: true, already: true } });
  const cases: [Record<string, unknown>, string, number][] = [
    [{ ok: false, reason: 'not_kept' }, MESSAGES.notKept, 409],
    [{ ok: false, reason: 'not_ready' }, MESSAGES.picNotReady, 409],
    [{ ok: false, reason: 'model_full', cap: 1 }, '3D는 한 사람 한 번만 만들 수 있어요. 이미 만들었거나 만드는 중이에요.', 409],
    [{ ok: false, reason: 'model_full', cap: 2 }, '3D는 한 사람 2번까지 만들 수 있어요. 다 썼어요.', 409],
    [{ ok: false, reason: 'model_blocked' }, MESSAGES.modelBlocked, 409],
    [{ ok: false, reason: 'model_tries_full', cap: 2 }, '3D는 한 사람 2번까지 해 볼 수 있어요. 다 해 봤어요.', 409],
    [{ ok: false, reason: 'model_day_full' }, MESSAGES.modelDayFull, 409],
    [{ ok: false, reason: 'not_found' }, MESSAGES.picGone, 404],
    [{ ok: false, reason: 'not_guest' }, MESSAGES.notGuest, 403],
    [{ ok: false, reason: 'Weird Reason!' }, MESSAGES.tryLater, 503],
  ];
  for (const [data, message, status] of cases) {
    const r = await M.requestModel(client({ data }), ID, 'meshy');
    assert.equal(r.status, status, JSON.stringify(data));
    assert.equal((r.body as { message?: string }).message, message, JSON.stringify(data));
  }
});

test('DB 함수가 없으면(0021 전) 503 「준비 중」, 오류·이상한 답·연결 끊김은 503 「잠시 뒤」', async () => {
  for (const code of ['PGRST202', '42883']) {
    assert.deepEqual(await M.keepCharacter(client({ error: { code } }), ID, true),
      { status: 503, body: { ok: false, reason: 'unavailable', message: MESSAGES.featureSoon } });
  }
  const broken = { status: 503, body: { ok: false, reason: 'error', message: MESSAGES.tryLater } };
  assert.deepEqual(await M.requestModel(client({ error: { code: '57014', message: 'timeout' } }), ID, 'meshy'), broken);
  assert.deepEqual(await M.requestModel(client({ data: [1, 2] }), ID, 'meshy'), broken);
  assert.deepEqual(await M.requestModel(client({ data: 'true' }), ID, 'meshy'), broken);
  assert.deepEqual(await M.benchCharacter(client(() => { throw new Error('offline'); }), ID, null), broken);
});

test('요청 읽기: 보관은 {on: true|false}만, 칸은 1~9나 빈 값만(내 칸 수까지인지는 DB가 본다), 다른 사이트의 요청은 막는다', () => {
  assert.equal(M.readOn({ on: true }), true);
  assert.equal(M.readOn({ on: false }), false);
  for (const bad of [undefined, null, {}, { on: 'true' }, { on: 1 }, [true]]) assert.equal(M.readOn(bad), null, JSON.stringify(bad));
  assert.equal(M.readSlot(undefined), null);
  assert.equal(M.readSlot({}), null);
  assert.equal(M.readSlot({ slot: null }), null);
  for (const n of [1, 2, 3, 4, 9]) assert.equal(M.readSlot({ slot: n }), n);
  for (const bad of [{ slot: 0 }, { slot: 10 }, { slot: 1.5 }, { slot: '2' }, 'x', [1]]) assert.equal(M.readSlot(bad), undefined, JSON.stringify(bad));
  assert.match(src('app/avatar/actions.ts'), /slot >= 1 && slot <= SLOTS_MAX/, '서버 액션도 1~9');
  const req = (origin: string | null, host = 'example.test') =>
    new Request('https://example.test/api/avatar/x/keep', { method: 'POST', headers: { host, ...(origin ? { origin } : {}) } });
  assert.equal(M.sameOrigin(req('https://example.test')), true);
  assert.equal(M.sameOrigin(req(null)), true);
  assert.equal(M.sameOrigin(req('https://elsewhere.test')), false);
  assert.equal(M.sameOrigin(req('not a url')), false);
});

test('라우트: 같은 확인(다른 사이트·로그인·명단)을 지난 뒤 본문을 읽고 DB 함수로. 비밀 키를 쓰지 않는다', () => {
  const keep = src('app/api/avatar/[id]/keep/route.ts');
  const bench = src('app/api/avatar/[id]/bench/route.ts');
  const order = (text: string, steps: string[]) => {
    const pos = steps.map((s) => text.indexOf(s));
    assert.ok(pos.every((p) => p >= 0), `빠진 단계: ${steps.filter((_, k) => pos[k] < 0).join(', ')}`);
    assert.deepEqual([...pos].sort((a, b) => a - b), pos, steps.join(' → '));
  };
  order(keep, ['await connection()', 'guestSession(request, id)', 'gate instanceof Response', 'jsonBody(request)', 'readOn(', 'badRequest()', 'keepCharacter(gate.supabase, id, on)']);
  order(bench, ['await connection()', 'guestSession(request, id)', 'gate instanceof Response', 'jsonBody(request)', 'readSlot(', 'badRequest()', 'benchCharacter(gate.supabase, id, slot)']);
  for (const t of [keep, bench, src('lib/avatar/route-gate.ts'), src('lib/avatar/manage.ts')]) assert.doesNotMatch(t, /createAvatarAdmin|SECRET_KEY/);
  const gate = src('lib/avatar/route-gate.ts');
  order(gate, ['!isUuid(id) || !sameOrigin(request)', 'refuse(404', 'getViewer()', 'viewer.unsure', 'refuse(503', '!viewer.signedIn', 'refuse(401',
    "canSee(viewer.role, 'guests')", 'refuse(403', 'createClient()']);
  // 서버 액션(「내 캐릭터」 화면)도 같은 길로
  const actions = src('app/avatar/actions.ts');
  for (const fn of ['keepCharacter(supabase, id', 'benchCharacter(supabase, id, slot)', 'requestModel(supabase, id, modelProvider())']) {
    assert.ok(actions.includes(fn), fn);
  }
  assert.match(actions, /if \(!modelsOn\(\)\) return \{ ok: false, message: MESSAGES\.modelOff \}/);
  // 3D 요청 라우트도 확인 글이 알린 곳(서버의 modelProvider())을 넘긴다(확인 카드의 {keep: true}는 avatar-pick3d 시험)
  assert.match(src('app/api/avatar/[id]/model/route.ts'), /requestModel\(gate\.supabase, id, modelProvider\(\), \{ keep \}\)/);
});

test('칸 답(/api/avatar/slots): 작업대는 칸 번호가 있는 줄을 따로 읽고, 이력은 최근부터, 수와 3D 모드를 함께 준다', () => {
  const route = src('app/api/avatar/slots/route.ts');
  assert.match(route, /\.select\(CHAR_COLUMNS\)\.in\('status', kept\)\.order\('created_at', \{ ascending: false \}\)\.limit\(HISTORY_SHOWN \+ 1\)/);
  assert.match(route, /\.not\('slot', 'is', null\)\.limit\(SLOTS_MAX \* 2\)/, '작업대 줄은 가장 넓은 작업대(9칸)의 두 배까지');
  // 작업대 칸 수는 DB가 세션의 역할로 준 값(0021 전의 DB는 셋)
  assert.match(route, /const size = counts \? benchSize\(read\) : SLOTS;/);
  assert.match(route, /enabled: true, max: size,/);
  assert.match(route, /cells: benchCells\(readCharacters\(benchRes\.data, provider, size\), size\)/);
  assert.match(route, /const history = readCharacters\(histRes\.data, provider, size\);/, '다시 해도 같은 실패는 지금 3D를 만드는 곳으로 가린다');
  assert.match(route, /history: history\.slice\(0, HISTORY_SHOWN\)/);
  assert.match(route, /provider, models_on: modelsOn\(\), training_optout: meshyTrainingOptOut\(\)/);
  assert.match(route, /history: null, more: false, counts: null/, '0021 전의 DB는 예전 칸 셋');
  assert.equal(R.CHAR_COLUMNS, 'id, status, slot, created_at, kept_at, model_requested_at, model_status, model_reason');
});

test('걷기 화면의 캐릭터 창: ★·작업대로·3D는 각자의 주소로, 3D는 확인(무엇을 어디로)을 지난 뒤에만 보낸다', () => {
  const panel = src('components/walk/CharacterPanel.tsx');
  assert.match(panel, /`\/api\/avatar\/\$\{encodeURIComponent\(item\.id\)\}\/keep`, \{ on \}/);
  assert.match(panel, /`\/api\/avatar\/\$\{encodeURIComponent\(item\.id\)\}\/bench`/);
  assert.match(panel, /`\/api\/avatar\/\$\{encodeURIComponent\(item\.id\)\}\/model`/);
  // 3D 단추는 확인을 열고(askModel), 보내기는 확인의 「예」에서만(sendModel)
  assert.match(panel, /onModel: askModel/);
  assert.match(panel, /onYes=\{sendModel\}/);
  assert.match(panel, /\{modelConfirm\(provider, cap, optOut\)\}/);
  assert.match(panel, /if \(e\.nativeEvent\.isComposing \|\| e\.keyCode === 229\) return;\n    if \(e\.key === 'Escape'\) \{\n      e\.preventDefault\(\);\n      e\.stopPropagation\(\);\n      onNo\(\);/,
    'Esc는 3D 확인만 닫는다(한글 조합 중에는 무시)');
  assert.match(panel, /bench_full/, '빈 칸이 없으면 바꿀 칸을 고르게 한다');
  // 작업대 칸 수는 칸 답(cells의 길이)대로: 바꿀 칸 단추도 그만큼, 칸이 많으면 세 칸씩 한 줄(9칸이면 3×3)
  assert.match(panel, /const size = layout \? layout\.cells\.length : SLOTS;/);
  assert.match(panel, /slotNumbers\(size\)\.map/);
  assert.match(panel, /size > SLOTS \? `\$\{css\.slots\} \$\{css\.slotsMany\}` : css\.slots/);
  assert.doesNotMatch(panel, /\[1, 2, 3\]\.map/, '바꿀 칸을 셋으로 박아 두지 않는다');
  const panelCss = src('components/walk/CharacterPanel.module.css');
  assert.match(panelCss, /\.slots \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/, '휴대폰에서도 세 칸씩(9칸이면 3×3)');
  // 바꿀 칸은 누른 그림 바로 아래에(작업대 위가 아니라), ★은 되면 안내 없이(스크롤하지 않는다)
  assert.match(panel, /setSwapFor\(\{ id: item\.id, place: where \}\)/);
  assert.match(panel, /\{swapping \? \(\n\s+<SwapRow /);
  assert.doesNotMatch(panel, /scrollIntoView\(\{ block: 'nearest' \}\);\n  \}, \[note\]\)/, '안내가 바뀔 때마다 스크롤하지 않는다');
  assert.match(panel, /if \(r\.data\?\.ok !== true\) setItemNote\(\{ id: item\.id, place, text: replyNote\(r\) \}\);/);
  // 3D 만들기 단추는 ★ 보관함에만
  assert.match(panel, /features && place === 'keep' && canRequestModel\(item, left\)/);
  // 차례: 작업대 → 사진으로 만들기 폼 → ★ 보관함 → 이력
  const order = ['aria-label="작업대"', '<form className={css.form}', 'aria-label="★ 보관함"', 'aria-label="이력"'].map((t) => panel.indexOf(t));
  assert.ok(order.every((p) => p >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, '만들기 폼은 작업대 바로 아래(이력 위)');
  // 「내 캐릭터」 화면도 같은 판정과 확인 글(3D는 ★ 보관함 카드에서만)
  const page = src('app/avatar/page.tsx');
  assert.match(page, /modelAsk: place === 'keep' && canRequestModel\(item, modelLeft\) \? modelConfirm\(provider, modelCap, optOut\) : null/);
  assert.match(src('app/avatar/AvatarCard.tsx'), /onClick=\{confirmFirst\(card\.modelAsk\)\}/);
  // 이력은 작은 카드로, 보관함(★)은 작업대와 이력 사이에
  const pOrder = ['aria-labelledby="bench"', 'aria-labelledby="keeps"', 'aria-labelledby="history"'].map((t) => page.indexOf(t));
  assert.deepEqual([...pOrder].sort((a, b) => a - b), pOrder);
  assert.ok(pOrder.every((p) => p >= 0));
  assert.match(page, /<MiniCard key=\{item\.id\} card=\{card\} \/>/);
  // 「내 캐릭터」의 작업대도 칸 수대로. 칸이 셋보다 많으면 작은 카드로 늘 세 칸씩(휴대폰에서 3×3)
  assert.match(page, /const size = benchSize\(quota\);/);
  assert.match(page, /benchCells\(readCharacters\(benchRes\.data, provider, size\), size\)/);
  assert.match(page, /const benchMany = bench\.length > SLOTS;/);
  assert.match(page, /benchMany \? <MiniCard card=\{card\} \/> : <AvatarCard card=\{card\} \/>/);
  assert.match(page, /benchMany \? styles\.slotsMany : styles\.slots/);
  const css = src('app/avatar/avatar.module.css');
  const many = /\.slotsMany \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(many, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css.slice(css.indexOf('@media (max-width: 760px)')), /\.slotsMany/, '좁은 화면에서도 두 칸으로 접지 않는다');
  const card = src('app/avatar/AvatarCard.tsx');
  assert.match(card, /slotNumbers\(card\.benchSize \?\? SLOTS\)\.map/);
  assert.doesNotMatch(card, /\[1, 2, 3\]\.map/);
});

test('바꿀 칸: 펼치면 줄이 다 보이게 스크롤한 뒤 첫 단추에 초점(이력 아래쪽에서 펼쳐도 화면 밖에 열리지 않게), 단추마다 그 칸의 그림을 작게', () => {
  const panel = src('components/walk/CharacterPanel.tsx');
  const row = panel.slice(panel.indexOf('function SwapRow('), panel.indexOf('function SwapThumb('));
  assert.match(row, /row\.current\?\.scrollIntoView\(\{ block: 'nearest' \}\);\n    first\.current\?\.focus\(\);/);
  assert.doesNotMatch(row, /preventScroll/, '초점을 옮기며 스크롤을 막지 않는다');
  assert.match(row, /<SwapThumb item=\{bench\[n - 1\] \?\? null\} \/>/);
  assert.match(panel, /function SwapThumb\(\{ item \}: \{ item: CharItem \| null \}\) \{\n  if \(!item \|\| item\.status !== 'ready'\) return <span className=\{css\.swapThumb\} data-empty aria-hidden="true" \/>;/);
  assert.equal(panel.match(/size=\{size\} bench=\{layout\.cells\}/g)?.length, 2, '★ 보관함과 이력 모두 작업대 칸의 그림을 넘긴다');
  // 「내 캐릭터」의 작은 카드도 같다
  const card = src('app/avatar/AvatarCard.tsx');
  assert.match(card, /if \(!swap\) return;\n    swapBox\.current\?\.scrollIntoView\(\{ block: 'nearest' \}\);\n    firstSwap\.current\?\.focus\(\);/);
  assert.match(card, /<div ref=\{swapBox\} className=\{styles\.miniSwap\}/);
  assert.match(card, /ref=\{i === 0 \? firstSwap : undefined\}/);
  assert.match(card, /const thumb = card\.benchThumbs\?\.\[n - 1\] \?\? null;/);
  const page = src('app/avatar/page.tsx');
  assert.match(page, /const benchThumbs = bench\.map\(\(c\) => \(c && c\.status === 'ready' \? c\.id : null\)\);/);
  assert.match(page, /benchSize: size,\n      benchThumbs,/);
  // 작은 그림은 누르는 자리를 줄이지 않는다(9칸 단추는 44px 넘게)
  const css = src('components/walk/CharacterPanel.module.css');
  assert.match(/\.swapNum \{([^}]*)\}/.exec(css)?.[1] ?? '', /min-width: 44px; min-height: 44px;/);
});

test('★ 단추의 이름은 늘 「★ 보관」이고 눌림으로 상태를 알린다(이름이 상태와 반대로 들리지 않게)', () => {
  const panel = src('components/walk/CharacterPanel.tsx');
  assert.match(panel, /aria-pressed=\{item\.kept\}[\s\S]{0,160}aria-label="★ 보관" title="★ 보관"/);
  const card = src('app/avatar/AvatarCard.tsx');
  assert.match(card, /aria-pressed=\{card\.kept\} aria-label="★ 보관"/);
  assert.match(card, /aria-pressed=\{card\.kept\}>★ 보관<\/button>/);
  assert.doesNotMatch(card + panel, /보관\(★\)에서 빼기|★ 보관 빼기/);
});

test('안내 글: 긴 줄표가 없고 짧다', () => {
  const texts = [
    MESSAGES.historyFull(10), MESSAGES.historyFull(null), MESSAGES.keepFull(3), MESSAGES.keepFull(null), MESSAGES.modelFull(1), MESSAGES.modelFull(2),
    MESSAGES.notKept, MESSAGES.picNotReady, MESSAGES.benchFull, MESSAGES.benchChanged, MESSAGES.picGone, MESSAGES.featureSoon,
    MESSAGES.tryLater, MESSAGES.modelOff,
    MESSAGES.modelBlocked, MESSAGES.modelTriesFull(2), MESSAGES.modelTriesFull(null), MESSAGES.modelDayFull,
    ...(['ready', 'making', 'waiting'] as const).map((m) => R.deleteWarning(m, 1) ?? ''),
  ];
  for (const t of texts) {
    assert.equal(/[—–]/.test(t), false, t);
    assert.ok(t.length <= 70, `${t.length}자: ${t}`);
  }
  assert.equal(MESSAGES.historyFull(null), '이력이 다 찼어요. 이력에서 지울 그림을 골라 지우면 새로 만들 수 있어요.');
  assert.equal(MESSAGES.keepFull(null), '★ 보관은 한도까지예요. 다른 그림의 ★을 빼면 보관할 수 있어요.');
});

test('0021의 숫자: 작업대 손님 3·가족 9·관리자 9, 손님 이력 10·보관 3·3D 1·시도 2, 가족 20·5·1·2, 관리자 null, 모두의 하루 3D 100', () => {
  assert.match(SQL, /'guest', jsonb_build_object\('per_day', 10, 'attempts', 22, 'total_exempt', false, 'bench_max', 3,\s+'history_max', 10, 'keep_max', 3, 'model_max', 1, 'model_tries_max', 2\)/);
  assert.match(SQL, /'family', jsonb_build_object\('per_day', 20, 'attempts', 42, 'total_exempt', false, 'bench_max', 9,\s+'history_max', 20, 'keep_max', 5, 'model_max', 1, 'model_tries_max', 2\)/);
  assert.match(SQL, /'admin', jsonb_build_object\('per_day', null, 'attempts', null, 'total_exempt', true, 'bench_max', 9,\s+'history_max', null, 'keep_max', null, 'model_max', null, 'model_tries_max', null\),\s+'model_day_max', 100\s+\)/);
  // 손님의 칸 수는 사이트의 SLOTS, 가장 넓은 칸 수는 SLOTS_MAX(칸 번호 범위 검사와 avatar_bench_max의 끝, 빠졌을 때의 3)
  assert.match(SQL, new RegExp(`'guest', jsonb_build_object\\([^)]*'bench_max', ${SLOTS},`));
  assert.match(SQL, new RegExp(`add constraint avatars_slot_range check \\(slot is null or slot between 1 and ${SLOTS_MAX}\\)`));
  assert.match(SQL, new RegExp(`least\\(greatest\\(floor\\(s\\.v::text::numeric\\), 1\\), ${SLOTS_MAX}\\)::int else ${SLOTS} end`));
  // 칸 수는 세션의 역할로만(장수 응답의 slots), 만들기·꺼내기·칸 트리거가 그 수만 쓴다
  assert.match(SQL, /'slots', public\.avatar_bench_max\(lim\.k\),/);
  assert.match(SQL, /v_max := \(v_q ->> 'slots'\)::int;/);
  assert.match(SQL, /v_max := public\.avatar_bench_max\(public\.my_role\(\)\);\n  if p_slot is not null and \(p_slot < 1 or p_slot > v_max\) then raise exception 'bad_slot'/);
  assert.equal((SQL.match(/generate_series\(1, v_max\)/g) ?? []).length, 3, '만들기·꺼내기·칸 트리거');
  assert.doesNotMatch(SQL, /generate_series\(1, 3\)/, '칸 셋을 박아 두지 않는다');
  assert.match(SQL, /if v_slot is null then\n    -- 작업대\(1~칸 수\)가 다 찼다: 한 칸을 비우고 그 번호를 새 줄에 준다\n    select a\.id, a\.slot into v_freed, v_slot from public\.avatars a\n     where a\.user_id = auth\.uid\(\) and a\.slot between 1 and v_max/,
    '작업대가 다 차면 1~칸 수 안에서 한 칸을 비운다(들어온 때는 둔다)');
  assert.doesNotMatch(SQL, /'reason', 'slots_full'/, '0021의 시작은 slots_full을 주지 않는다');
  assert.match(SQL, /order by \(a\.kept_at is not null\s+or exists \(select 1 from public\.profiles p[\s\S]*?\),\s+a\.status <> 'ready', coalesce\(a\.slot_at, a\.created_at\), a\.created_at, a\.id/,
    '★도 입은 것도 아닌 다 그린 줄 먼저, 그다음 그리는 중, 같은 무리 안에서는 작업대에 가장 오래 있던 차례');
});
