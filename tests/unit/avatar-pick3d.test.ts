// 2D를 다 그린 뒤의 확인 카드와 2D·3D 진행(사이트 쪽): 남은 3D 수와 실패하면 한 번 더 해 볼 수 있는지(실제 셈대로),
// 3D를 더 맡길 수 없을 때의 한 줄, 확인 카드의 3D 요청(★가 없으면 3D가 남았는지 본 뒤 ★로 보관하고 요청, 막히면 ★를 뗀다),
// 3D 상태 묻기(까닭과 한도 돌려줌 안내), 화면이 그 길을 쓰는지. DB 쪽 판정(한도, 잠금, 동시 요청)은 tests/sql/rls.test.mjs의 0021 묶음이 본다.
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
const C = await import('../../src/lib/avatar/consent.ts');
const { MESSAGES } = R;
type Counts = import('../../src/lib/avatar/rules.ts').CharacterCounts;

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const ID = '00000000-0000-4000-8000-000000000001';

/** 0021을 올린 DB가 역할마다 주는 장수 응답(avatar_quota) */
const guest = (o: Record<string, unknown> = {}) => ({
  used: 1, attempts: 1, total: 3, slots: 3, cap: 10, attempt_cap: 22, total_exempt: false,
  history: 1, history_cap: 10, keeps: 0, keep_cap: 3, models: 0, model_cap: 1,
  model_tries: 0, model_tries_cap: 2, model_day: 7, model_day_cap: 100, ...o,
});
const family = (o: Record<string, unknown> = {}) => guest({ slots: 9, cap: 20, attempt_cap: 42, history_cap: 20, keep_cap: 5, ...o });
const admin = (o: Record<string, unknown> = {}) =>
  guest({
    slots: 9, cap: null, attempt_cap: null, total_exempt: true, history_cap: null, keep_cap: null, model_cap: null, model_tries_cap: null,
    model_day_cap: null, ...o,
  });
const counts = (raw: Record<string, unknown>): Counts => R.countsOf(R.readQuota(raw))!;

// ───────────────────────────── 남은 3D 수와 다시 해 볼 수 있는지
test('확인 카드의 3D 한 줄: 남은 3D 수와 실패하면 한 번 더 해 볼 수 있는지를 실제 셈대로(손님·가족 1번, 시도 2번)', () => {
  const line = (raw: Record<string, unknown>, on = true) => {
    const ch = R.modelChance(counts(raw), on);
    return ch ? R.modelChanceLine(ch) : null;
  };
  assert.equal(line(guest()), '3D 1번 남음 · 못 만들면 한 번 더 해 볼 수 있어요');
  assert.equal(line(family()), '3D 1번 남음 · 못 만들면 한 번 더 해 볼 수 있어요');
  // 돈이 든 시도 하나가 실패로 끝났다: 3D 몫은 돌아왔고(models 0) 시도는 하나 남았다 → 이번이 마지막
  assert.equal(line(guest({ model_tries: 1 })), '3D 1번 남음 · 이번이 마지막이에요(못 만들면 다시 못 해요)');
  // 관리자는 제한 없음
  assert.equal(line(admin({ models: 4, model_tries: 9 })), '3D 제한 없음');
  // 시도 몫이 셋 이상이면 수를 말한다
  assert.equal(line(guest({ model_cap: 3, model_tries_cap: 4 })), '3D 3번 남음 · 못 만들면 3번 더 해 볼 수 있어요');
  // 시도 수가 없는 옛 답: 남은 수만
  assert.equal(R.modelChanceLine({ left: 1, again: undefined }), '3D 1번 남음');
  // 맡길 수 없으면 null(카드는 단추 대신 까닭)
  assert.equal(line(guest({ models: 1 })), null, '다 씀(만들었거나 만드는 중)');
  assert.equal(line(guest({ model_tries: 2 })), null, '다 해 봄');
  assert.equal(line(guest({ model_day: 100 })), null, '오늘 모두의 상한');
  assert.equal(line(guest(), false), null, '쉬는 중');
  assert.equal(R.modelChance(null), null, '0021 전');
});

test('3D를 맡길 수 없으면 단추 대신 한 줄: 이미 만들었다(만드는 중이면 그렇다고), 다 해 봤다, 오늘 다 찼다, 쉬는 중', () => {
  assert.equal(R.modelNoneLine(counts(guest({ models: 1 }))), '이미 3D를 만들었어요.');
  assert.equal(R.modelNoneLine(counts(guest({ models: 1 })), true, true), '3D를 만드는 중이에요. 3D는 한 사람 한 번이에요.');
  assert.equal(R.modelNoneLine(counts(guest({ model_tries: 2 }))), '3D는 한 사람 2번까지 해 볼 수 있어요. 다 해 봤어요.');
  assert.equal(R.modelNoneLine(counts(guest({ model_day: 200 }))), MESSAGES.modelDayFull);
  assert.equal(R.modelNoneLine(counts(guest()), false), MESSAGES.modelOff);
  assert.equal(R.modelNoneLine(counts(guest())), null, '맡길 수 있으면 null');
  assert.equal(R.modelNoneLine(null), null, '0021 전에는 3D를 말하지 않는다');
  assert.equal(R.modelNoneLine(counts(admin({ models: 30 }))), null, '관리자는 막히지 않는다');
});

// ───────────────────────────── 3D 상태 묻기
const row = (o: Record<string, unknown> = {}) => ({
  id: ID, status: 'ready', model_requested_at: '2026-11-12T03:00:00.000Z', model_status: null, model_reason: null,
  model_job_at: null, model_not_before: null, ...o,
});
const NOW = Date.parse('2026-11-12T03:01:00.000Z');

test('3D 상태(GET /api/avatar/status?id=…&kind=model): 요청함·차례, 쉬었다 다시 만드는 때, 만드는 중, 다 됨, 요청 없음, 지운 그림', () => {
  const view = (o: Record<string, unknown>) => R.modelJobView(row(o), 'meshy', null, NOW);
  assert.deepEqual(view({}), { status: 'waiting', since: '2026-11-12T03:00:00.000Z' });
  assert.deepEqual(view({ model_not_before: '2026-11-12T03:05:00.000Z' }),
    { status: 'waiting', since: '2026-11-12T03:00:00.000Z', later: '2026-11-12T03:05:00.000Z' });
  assert.deepEqual(view({ model_not_before: '2026-11-12T02:00:00.000Z' }), { status: 'waiting', since: '2026-11-12T03:00:00.000Z' }, '지난 때는 싣지 않는다');
  assert.deepEqual(view({ model_status: 'drawing' }), { status: 'making', since: '2026-11-12T03:00:00.000Z' });
  assert.deepEqual(view({ model_status: 'ready' }), { status: 'ready', since: '2026-11-12T03:00:00.000Z' });
  assert.deepEqual(view({ model_requested_at: null }), { status: 'none' }, '요청하지 않은 그림');
  assert.deepEqual(view({ model_requested_at: null, model_status: 'failed', model_reason: 'timeout' }), { status: 'none' },
    '요청 없이 실패한 옛 줄(0016)은 요청할 수 있는 그림');
  assert.deepEqual(view({ status: 'drawing', model_requested_at: null }), { status: 'none' }, '2D를 그리는 중');
  assert.equal(view({ status: 'deleted' }), null, '지운 그림은 404');
  assert.equal(R.modelJobView(null, 'meshy', null, NOW), null);
  assert.equal(R.modelJobView({ ...row(), id: 'x' }, 'meshy', null, NOW), null);
  assert.equal(R.modelJobView([row()], 'meshy', null, NOW), null);
  assert.equal(R.MODEL_JOB_COLUMNS, 'id, status, model_requested_at, model_status, model_reason, model_job_at, model_not_before');
});

test('3D를 못 만들면 까닭과 한도 돌려줌 안내: 돈이 들기 전이면 세지 않았다고, 들었으면 3D 몫을 돌려주고 남은 시도를 실제 셈대로', () => {
  const fail = (o: Record<string, unknown>, c: Counts | null, via: 'meshy' | 'trellis' = 'meshy') =>
    R.modelJobView(row({ model_status: 'failed', ...o }), via, c, NOW);
  // 3D 서비스가 작업을 만들기 전에 멈춤(키·잔액·쉬는 중 등): 시도로도 세지 않는다
  assert.deepEqual(fail({ model_reason: 'service_down' }, counts(guest())), {
    status: 'failed', since: '2026-11-12T03:00:00.000Z', message: MESSAGES.modelFailed,
    note: '만들기 전에 멈춰서 이번 요청은 세지 않았어요. 3D 몫을 돌려드렸어요.',
  });
  // 돈이 든 첫 시도가 실패: 3D 몫은 돌아오고 시도는 하나 남았다
  const paid = { model_reason: 'meshy_failed', model_job_at: '2026-11-12T03:00:20.000Z' };
  assert.equal(fail(paid, counts(guest({ model_tries: 1 })))?.note, '3D 몫을 돌려드렸어요. 한 번 더 해 볼 수 있어요.');
  // 둘째 시도도 실패: 더 해 볼 수 없다
  assert.equal(fail(paid, counts(guest({ model_tries: 2 })))?.note, '3D는 한 사람 2번까지 해 볼 수 있어요. 다 해 봤어요.');
  // 관리자(제한 없음)와 셈을 읽지 못했을 때
  assert.equal(fail(paid, counts(admin({ model_tries: 5 })))?.note, '3D 몫을 돌려드렸어요. 다시 해 볼 수 있어요.');
  assert.equal(fail(paid, null)?.note, '3D 몫을 돌려드렸어요.');
  // 까닭: 그 그림 탓(어디로 보내든), 지금 만드는 곳이 받지 않은 그림, 만드는 곳이 바뀜, 그 밖
  assert.equal(fail({ model_reason: 'bad_char' }, null)?.message, MESSAGES.modelBlocked);
  assert.equal(fail({ model_reason: 'meshy_input' }, null)?.message, MESSAGES.modelBlocked);
  assert.equal(fail({ model_reason: 'meshy_input' }, null, 'trellis')?.message, MESSAGES.modelFailed, '다른 곳의 거절은 막힌 것이 아니다');
  assert.equal(fail({ model_reason: 'reconsent' }, null)?.message, MESSAGES.modelReconsent);
  assert.equal(fail({ model_reason: 'attempts' }, null)?.message, MESSAGES.modelFailed);
});

// ───────────────────────────── 확인 카드의 3D 요청(★가 없으면 달고 요청)
type Call = { fn: string; args: Record<string, unknown> };
/** 부른 차례대로 답을 돌려주는 가짜 연결(보는 사람의 세션) */
function script(answers: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const calls: Call[] = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      const next = answers[fn]?.shift() ?? { data: null };
      return Promise.resolve({ data: next.data ?? null, error: next.error ?? null });
    },
  };
}
const notKept = { data: { ok: false, reason: 'not_kept' } };
const queued = { data: { ok: true, already: false } };

test('확인 카드의 3D: ★가 있으면 요청 한 번, 없으면 3D가 남았는지 본 뒤 ★로 보관하고 다시 요청한다(같은 곳 via)', async () => {
  const kept = script({ avatar_model_request: [queued] });
  assert.deepEqual(await M.requestModel(kept, ID, 'meshy', { keep: true }), { status: 202, body: { ok: true, already: false } });
  assert.deepEqual(kept.calls.map((c) => c.fn), ['avatar_model_request']);
  const c = script({ avatar_model_request: [notKept, queued], avatar_quota: [{ data: guest() }], avatar_keep: [{ data: { ok: true, kept: true } }] });
  assert.deepEqual(await M.requestModel(c, ID, 'meshy', { keep: true }), { status: 202, body: { ok: true, already: false } });
  assert.deepEqual(c.calls, [
    { fn: 'avatar_model_request', args: { p_id: ID, p_via: 'meshy' } },
    { fn: 'avatar_quota', args: {} },
    { fn: 'avatar_keep', args: { p_id: ID, p_on: true } },
    { fn: 'avatar_model_request', args: { p_id: ID, p_via: 'meshy' } },
  ]);
  // 셈을 읽지 못해도 그대로 간다(다시 요청할 때 DB가 판정한다)
  const blind = script({ avatar_model_request: [notKept, queued], avatar_quota: [{ error: { code: '57014' } }], avatar_keep: [{ data: { ok: true, kept: true } }] });
  assert.equal((await M.requestModel(blind, ID, 'trellis', { keep: true })).status, 202);
  assert.deepEqual(blind.calls[3].args, { p_id: ID, p_via: 'trellis' });
});

test('확인 카드의 3D: 3D가 남지 않았으면 ★를 달지 않고 그 까닭, 보관함이 차 있으면 keep_full, 다시 요청이 막히면 단 ★를 뗀다', async () => {
  const cases: [Record<string, unknown>, string, string][] = [
    [guest({ models: 1 }), 'model_full', '3D는 한 사람 한 번만 만들 수 있어요. 이미 만들었거나 만드는 중이에요.'],
    [guest({ model_tries: 2 }), 'model_tries_full', '3D는 한 사람 2번까지 해 볼 수 있어요. 다 해 봤어요.'],
    [guest({ model_day: 100 }), 'model_day_full', MESSAGES.modelDayFull],
  ];
  for (const [q, reason, message] of cases) {
    const c = script({ avatar_model_request: [notKept], avatar_quota: [{ data: q }] });
    assert.deepEqual(await M.requestModel(c, ID, 'meshy', { keep: true }), { status: 409, body: { ok: false, reason, message } }, reason);
    assert.deepEqual(c.calls.map((x) => x.fn), ['avatar_model_request', 'avatar_quota'], `${reason}: ★를 달지 않는다`);
  }
  const full = script({ avatar_model_request: [notKept], avatar_quota: [{ data: guest({ keeps: 3 }) }], avatar_keep: [{ data: { ok: false, reason: 'keep_full', cap: 3 } }] });
  assert.deepEqual(await M.requestModel(full, ID, 'meshy', { keep: true }),
    { status: 409, body: { ok: false, reason: 'keep_full', message: MESSAGES.keepFull(3) } });
  assert.deepEqual(full.calls.map((x) => x.fn), ['avatar_model_request', 'avatar_quota', 'avatar_keep']);
  // ★를 단 사이에 다른 요청이 먼저 들어가 한도가 찼다(동시 요청): DB가 막고, 방금 단 ★는 다시 뗀다
  const race = script({
    avatar_model_request: [notKept, { data: { ok: false, reason: 'model_full', cap: 1 } }],
    avatar_quota: [{ data: guest() }],
    avatar_keep: [{ data: { ok: true, kept: true } }, { data: { ok: true, kept: false } }],
  });
  assert.deepEqual((await M.requestModel(race, ID, 'meshy', { keep: true })).body,
    { ok: false, reason: 'model_full', message: MESSAGES.modelFull(1) });
  assert.deepEqual(race.calls.map((x) => `${x.fn}:${JSON.stringify(x.args.p_on ?? null)}`),
    ['avatar_model_request:null', 'avatar_quota:null', 'avatar_keep:true', 'avatar_model_request:null', 'avatar_keep:false']);
  // ★ 보관함의 「3D 만들기」(keep 없음)는 예전 그대로: ★가 없으면 not_kept
  const plain = script({ avatar_model_request: [notKept] });
  assert.deepEqual(await M.requestModel(plain, ID, 'meshy'), { status: 409, body: { ok: false, reason: 'not_kept', message: MESSAGES.notKept } });
  assert.equal(plain.calls.length, 1);
  // 다른 까닭(이미 있음·막힌 그림·없는 그림)은 ★를 건드리지 않는다
  for (const data of [{ ok: true, already: true }, { ok: false, reason: 'model_blocked' }, { ok: false, reason: 'not_found' }]) {
    const c = script({ avatar_model_request: [{ data }] });
    await M.requestModel(c, ID, 'meshy', { keep: true });
    assert.deepEqual(c.calls.map((x) => x.fn), ['avatar_model_request'], JSON.stringify(data));
  }
});

test('3D 요청 본문: 비었거나 {}면 ★ 보관함의 요청, {keep: true}면 확인 카드. 그 밖의 모양은 잘못된 요청', () => {
  for (const v of [undefined, null, {}, { keep: false }]) assert.equal(M.readKeep(v), false, JSON.stringify(v));
  assert.equal(M.readKeep({ keep: true }), true);
  for (const bad of [{ keep: 'true' }, { keep: 1 }, [true], 'keep', 3]) assert.equal(M.readKeep(bad), undefined, JSON.stringify(bad));
});

// ───────────────────────────── 라우트와 화면
test('3D 요청 라우트: 같은 확인을 지난 뒤 본문을 읽고(모양이 틀리면 400) 확인 글이 알린 곳과 함께 넘긴다. 비밀 키를 쓰지 않는다', () => {
  const route = src('app/api/avatar/[id]/model/route.ts');
  const steps = ['guestSession(request, id)', 'gate instanceof Response', 'if (!modelsOn())', 'jsonBody(request)', 'readKeep(body.value)', 'badRequest()',
    'requestModel(gate.supabase, id, modelProvider(), { keep })'];
  const pos = steps.map((s) => route.indexOf(s));
  assert.ok(pos.every((p) => p >= 0), `빠진 단계: ${steps.filter((_, k) => pos[k] < 0).join(', ')}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
  assert.doesNotMatch(route + src('lib/avatar/manage.ts'), /createAvatarAdmin|SECRET_KEY/);
});

test('3D 상태 라우트: 명단 손님만, 보는 사람의 세션으로 내 줄만 읽고(RLS), 못 만들었을 때만 지금의 수를 함께 읽는다', () => {
  const route = src('app/api/avatar/status/route.ts');
  assert.match(route, /if \(viewer\.unsure\) return broken\(\);\n  if \(!canSee\(viewer\.role, 'guests'\)\) return hidden\(\);/);
  assert.match(route, /params\.get\('kind'\) === 'model'/);
  assert.match(route, /supabase\.from\('avatars'\)\.select\(MODEL_JOB_COLUMNS\)\.eq\('id', id\)\.maybeSingle\(\)/);
  assert.match(route, /const quota = failed \? await supabase\.rpc\('avatar_quota'\) : null;/);
  assert.match(route, /modelJobView\(row, modelProvider\(\), counts, Date\.now\(\)\)/);
  assert.match(route, /view \? Response\.json\(view, \{ headers: HEADERS \}\) : hidden\(\)/, '지운 그림·남의 그림은 404');
  assert.doesNotMatch(route, /createAvatarAdmin|SECRET_KEY/);
  // 2D 묻기는 그대로
  assert.match(route, /supabase\.rpc\('avatar_job_status', \{ p_id: id \}\)/);
});

test('확인 카드: 새 그림을 크게, 3D 확인 글은 consent.ts 그대로, 남은 3D 줄, ★가 없으면 달고 요청({keep: true}), 두 갈래 단추', () => {
  const card = src('components/walk/PickCard.tsx');
  assert.match(card, /className=\{css\.pickImg\} src=\{`\/api\/avatar\/\$\{id\}`\}/);
  assert.match(card, /\{modelConfirm\(reply\?\.provider \?\? 'meshy', counts\?\.models\.cap \?\? null, reply\?\.trainingOptOut === true\)\}/);
  assert.match(card, /modelConfirmYes\(reply\?\.provider \?\? 'meshy'\)/);
  assert.doesNotMatch(card, /Meshy|미국|학습/, '3D 확인 문구와 학습 알림을 새로 쓰지 않는다(consent.ts의 것)');
  assert.match(card, /modelChanceLine\(chance\)/);
  assert.match(card, />이걸로 3D 만들기</);
  assert.match(card, />다른 그림 더 만들고 나중에 고르기</);
  assert.match(card, /body: JSON\.stringify\(\{ keep: true \}\)/);
  assert.match(card, /`\/api\/avatar\/\$\{encodeURIComponent\(id\)\}\/model`/);
  assert.match(card, /startModelMaking\(id\);\n      onSent\(\);/, '줄에 서면 3D 진행을 이어 보고 카드를 닫는다');
  assert.match(card, /data\?\.reason === 'keep_full'/);
  assert.match(card, /MESSAGES\.pickKeepFull\(keepCap\)/);
  // 3D를 맡길 수 없으면 단추 대신 까닭(이미 3D를 만들었어요 등)
  assert.match(card, /modelNoneLine\(counts, on, busy3d\)/);
  // 보내는 동안 단추를 잠근다(여러 번 누르기). Esc는 확인만 닫고 한글 조합 중에는 무시한다
  assert.match(card, /disabled=\{step === 'sending'\}/);
  assert.match(card, /if \(e\.nativeEvent\.isComposing \|\| e\.keyCode === 229\) return;/);
  assert.equal(C.modelConfirmYes('meshy'), '보내기');
});

test('걷기 화면: 다 그리면 칩 자리에 확인 카드, 3D는 따로 칩과 알림, 3D가 다 되면 엔진이 그 모형을 바로 다시 묻는다', () => {
  const chip = src('components/walk/MakingChip.tsx');
  assert.match(chip, /<PickCard\n      key=\{m\.id\} id=\{m\.id\} where="walk"/);
  assert.match(chip, /<ModelChip m=\{m3\} now=\{now\} onOpen=\{onOpen\} \/>/);
  assert.match(chip, /queued \? '캐릭터 차례 기다리는 중' : '캐릭터 그리는 중'/);
  assert.match(chip, /` · 앞에 \$\{ahead\}명`/);
  assert.match(chip, /const \{ label, tail \} = modelChipText\(m, at\);/, '3D 칩의 단계 이름은 making-3d.ts 한곳(오래 기다리면 늦어지는 중)');
  assert.match(src('components/walk/making-3d.ts'), /label: slow \? '3D 차례 늦어지는 중' : '3D 차례 기다리는 중'/);
  assert.match(chip, /\['보냄', ahead !== null && ahead > 0 \? `차례 · 앞에 \$\{ahead\}명` : '차례', '그리는 중', '다 됐어요'\]/);
  assert.match(chip, /<Steps names=\{MODEL_STEPS\}/);
  const walk = src('components/WalkClient.tsx');
  assert.match(walk, /useEffect\(\(\) => onModelReady\(\(id\) => ctrl\.current\?\.refreshModel\(`\/api\/avatar\/\$\{id\}`\)\), \[\]\);/);
  assert.match(src('walk/scene.ts'), /refreshModel\(photoUrl\) \{\n      if \(typeof photoUrl !== 'string' \|\| !\/\^\\\/api\\\/avatar\\\/\[0-9a-f-\]\{36\}\$\/\.test\(photoUrl\)\) return;\n      modelNow\(photoUrl\);/);
  // 3D 묻기는 2D와 같은 간격(making.ts의 pollDelay)
  assert.match(src('components/walk/making-3d.ts'), /import \{ pollDelay \} from '\.\/making';/);
});

test('걷기 화면의 칩 자리: 위 단추 줄 아래에서 화면 아래(손가락 기기는 스틱 자리 위)까지로 막고 넘치면 그 안에서 스크롤, 확인 단추는 아래에 붙는다', () => {
  const css = src('components/walk/Making.module.css');
  const dock = /\.dock \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(dock, /max-height: max\(140px, calc\(100% - var\(--dock-top\) - var\(--dock-room\) \+ 4px\)\);/);
  assert.match(dock, /overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;/);
  assert.match(dock, /pointer-events: none;/, '빈 곳으로는 그대로 둘러본다');
  assert.match(css, /:global\(\.walk-root\[data-coarse\]\) \.dock \{ --dock-room: calc\(var\(--walk-bottom\) \+ 134px\); \}/,
    '손가락 기기는 스틱(높이 120px, 바닥에서 6px)과 틈 8px 위에서 끝난다');
  // 그 수는 스틱의 자리와 맞아야 한다
  assert.match(src('app/globals.css'), /\.walk-stick \{\n  position: absolute; bottom: calc\(var\(--walk-bottom\) \+ 6px\); z-index: 2; width: 120px; height: 120px;/);
  // 「보내기」「그만두기」(와 고르기 단추)는 자리 아래에 붙어 긴 확인 글을 읽는 동안에도 보인다
  assert.match(css, /\.pick\[data-where="walk"\] \.pickBtns \{\n  position: sticky; bottom: 0; z-index: 1;/);
  // 낮은 화면(휴대폰 가로): 그림을 작게, 단추를 나란히, 고르지 않아도 된다는 한 줄은 빼고, 3D 확인은 캐릭터 창에서 묻는다
  assert.match(css, /@media \(max-height: 500px\) \{\n  \.pick\[data-where="walk"\] \{ grid-template-columns: 64px minmax\(0, 1fr\);/);
  assert.match(css, /\.pick\[data-where="walk"\] \.pickLead \{ display: none; \}/);
  const card = src('components/walk/PickCard.tsx');
  assert.match(card, /export const LOW_SCREEN = '\(max-height: 500px\)';/);
  assert.match(card, /if \(where === 'walk' && onOpenPanel && lowScreen\(\)\) \{\n      askModelInPanel\(id\);\n      onOpenPanel\(\);\n      return;/);
  assert.match(card, /const \[handoff, setHandoff\] = useState\(\(\) => where === 'panel' && takePanelAsk\(id\)\);/);
  assert.match(card, /if \(handoff && info !== null\) \{\n    setHandoff\(false\);\n    if \(chance && step === 'pick'\) \{/,
    '창의 카드는 칸 답(제공자)을 읽은 뒤에 한 번 확인을 묻는다');
  assert.match(card, /className=\{`\$\{css\.pickLine\} \$\{css\.pickLead\}`\}/);
  // 확인 카드가 떠 있는 동안 3D의 끝(다 됨·못 만듦) 카드는 칩 하나로 접는다(누르면 창에서 본다)
  const chip = src('components/walk/MakingChip.tsx');
  assert.match(chip, /const picking = m !== null && !running\(m\) && !m\.seen && m\.phase === 'ready';/);
  assert.match(chip, /\) : m3\.seen \? null : picking \? \(\n    <DoneChip m=\{m3\} onOpen=\{onOpen\} \/>\n  \)/);
  assert.match(chip, /<span className=\{css\.chipTime\}>캐릭터 창에서 보기<\/span>/);
});

test('캐릭터 창: 다 그렸으면 확인 카드(고를 때까지), 3D 진행 상자, ★ 보관함에서 맡긴 3D도 진행을 이어 본다', () => {
  const panel = src('components/walk/CharacterPanel.tsx');
  assert.match(panel, /const pick = making && making\.phase === 'ready' && !making\.seen \? making : null;/);
  assert.match(panel, /<PickCard\n          key=\{pick\.id\} id=\{pick\.id\} info=\{slots\} where="panel"/);
  assert.match(panel, /\{show3d \? <ModelProgress m=\{show3d\} \/> : null\}/);
  assert.match(panel, /if \(r\.data\?\.ok === true && r\.data\.already !== true\) startModelMaking\(item\.id\);/);
  assert.match(panel, /if \(run3d\) adoptModelMaking\(run3d\.id\);/);
  assert.match(panel, /clearModelMaking\(item\.id\);/, '그림을 지우면 3D 진행도 내려놓는다');
  assert.match(panel, /chance=\{modelChance\(counts, modelsOnNow\)\}/, '★ 보관함의 3D 확인에도 같은 남은 3D 줄');
  // 진행 상자는 못 그렸을 때만 알림을 본 것으로(다 그린 것은 확인 카드에서 고를 때까지 둔다)
  assert.match(src('components/walk/MakingChip.tsx'), /useEffect\(\(\) => \{\n    if \(m\.phase === 'failed'\) seeMaking\(\);\n  \}, \[m\.phase\]\);/);
});

test('새 안내 글: 긴 줄표가 없고 짧다', () => {
  const texts = [
    MESSAGES.modelUsed, MESSAGES.modelBusy, MESSAGES.modelFailed, MESSAGES.modelReconsent, MESSAGES.pickKeepFull(3), MESSAGES.pickKeepFull(null),
    R.modelChanceLine({ left: 1, again: 1 }), R.modelChanceLine({ left: 1, again: 0 }), R.modelChanceLine({ left: null, again: null }),
    R.modelFailText('service_down', 'meshy', null, null).note,
    R.modelFailText('meshy_failed', 'meshy', '2026-11-12T03:00:00Z', counts(guest({ model_tries: 1 }))).note,
  ];
  for (const t of texts) {
    assert.equal(/[—–]/.test(t), false, t);
    assert.ok(t.length <= 70, `${t.length}자: ${t}`);
  }
  assert.equal(MESSAGES.pickKeepFull(3), '★ 보관함이 다 찼어요(3개). 3D는 ★ 그림으로만 만들어요. 보관함에서 ★ 하나를 빼면 이 그림으로 만들 수 있어요.');
  for (const f of ['components/walk/PickCard.tsx', 'components/walk/MakingChip.tsx', 'components/walk/making-3d.ts']) {
    assert.doesNotMatch(src(f), /[—–]/, f);
  }
});
