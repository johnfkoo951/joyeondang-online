// 3D 모형 제공자 meshy(worker/avatar/meshy.mjs): 가짜 fetch로 Meshy API의 답을 차례로 꾸며 본다.
// 만들기 요청의 본문, 5초마다 묻기, 결과 받기(키를 싣지 않음), 실패 갈래, 크레딧·키 문제로 쉬기, 하루 상한(KST),
// 장부로 이어 보기(돈을 두 번 쓰지 않기), 끝난 작업을 Meshy에서 지우기(도는 중이면 나중에 다시),
// 키 잠금(키 하나에 클라이언트 하나: 장부를 따로 두어도 둘째 프로세스는 만들지 않는다)과 장부 잠금(pid와 시작한 때),
// 키가 기록·오류·장부·다른 주소 어디에도 새지 않는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LOCK_DIR, MESHY_AI_MODEL, MESHY_DAILY_MAX, MESHY_FRESH_TASK_MS, MESHY_LEASE_SECONDS, MESHY_MAKER, MESHY_MAX_BAD, MESHY_PAUSE_MS,
  MESHY_POLL_MAX_MS, MESHY_POLL_MS, createMeshyService, etimeSeconds, fileLedger, keyLock, keyLockPath, kstDay, memoryLedger, meshyBody,
  meshyOptions, processStartedAt,
} from '../../worker/avatar/meshy.mjs';
import { serviceGlb } from './helpers/glb-fixture.ts';

const KEY = 'msy_TEST0secret0key0for0tests0only';
const ID = '22222222-2222-4222-8222-222222222222';
const ASSET = 'https://assets.meshy.ai/u/t/model.glb?Expires=1700000000&Signature=abc';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3]);
/** 장부에 적히는 보낸 그림의 지문 */
const sumOf = (png) => createHash('sha256').update(png).digest('hex');
const SUM = sumOf(PNG);
/** 2026-11-12 12:00 KST */
const NOON = Date.UTC(2026, 10, 12, 3, 0, 0);

const json = (body, status = 200, headers = {}) => () => Response.json(body, { status, headers });
const task = (status, extra = {}) => json({ id: 'task-1', type: 'image-to-3d', status, progress: status === 'SUCCEEDED' ? 100 : 40, ...extra });
const done = (extra = {}) => task('SUCCEEDED', { model_urls: { glb: ASSET }, consumed_credits: 35, ...extra });
const glbAnswer = () => () => new Response(serviceGlb(), { headers: { 'content-type': 'model/gltf-binary' } });
const balance = (n) => json({ balance: n, monthly_credits: n, permanent_credits: 0 });

/** 키 잠금을 쥔 것처럼(일꾼과 한 건 시험은 늘 키 잠금을 쥔다. 진짜 잠금 파일은 아래 잠금 시험에서) */
const HELD = { lock() {}, unlock() {} };

/**
 * 가짜 Meshy 한 벌. 답은 이름마다 차례로(배열) 또는 늘 같은 것(함수). Error는 던진다.
 * calls에 주소·방법·Authorization·본문을, logs에 기록을, sleeps에 쉰 시간을 적는다(쉬면 시계가 그만큼 간다).
 * lock: 키 잠금(기본 쥔 것. null이면 잠금 없이)
 */
function meshyRig({ answers = {}, ledger = memoryLedger(), lock = HELD, clock = { t: NOON }, tidy, ...opts } = {}) {
  const calls = [];
  const logs = [];
  const sleeps = [];
  const tidied = [];
  const take = (name) => {
    const q = answers[name];
    const a = typeof q === 'function' ? q : q?.shift();
    if (!a) throw new Error(`no scripted answer for ${name}`);
    const v = a instanceof Error ? a : a();
    if (v instanceof Error) throw v;
    return v;
  };
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    calls.push({ host: u.host, path: `${u.pathname}${u.search}`, method, auth: init.headers?.Authorization ?? null, body: init.body ?? null });
    if (u.host !== 'api.meshy.ai') return take('asset');
    if (u.pathname === '/openapi/v1/balance') return take('balance');
    if (method === 'DELETE') return take('delete');
    if (method === 'POST') return take('create');
    if (u.pathname === '/openapi/v1/image-to-3d') return take('list');
    return take('poll');
  };
  const service = createMeshyService({
    apiKey: KEY, fetch, ledger, lock,
    tidy: tidy ?? (async (raw, o) => {
      tidied.push([raw.length, o]);
      return { glb: serviceGlb(), stats: { tris: 9118, bytes: 300 } };
    }),
    log: (level, msg, extra) => logs.push([level, msg, extra]),
    now: () => clock.t, sleep: async (ms) => { sleeps.push(ms); clock.t += ms; },
    ...opts,
  });
  return { service, calls, logs, sleeps, tidied, clock, ledger };
}
const why = (p) => p.then(() => null, (e) => ({
  code: e.code, bad: e.bad === true, permanent: e.permanent === true, down: e.down === true, message: e.message,
}));
const posts = (r) => r.calls.filter((c) => c.method === 'POST').length;
const deletes = (r) => r.calls.filter((c) => c.method === 'DELETE').map((c) => c.path);
const deleted = () => () => new Response(null, { status: 200 });

test('요청 본문: meshy-7.1, Ultra(2k) 형상, 텍스처 2K·PBR 끔, 삼각형으로 다시 짜기 9000, 그림 다듬기 끔, GLB만. 그림은 data URI', () => {
  const body = meshyBody(PNG);
  assert.deepEqual({ ...body, image_url: undefined }, {
    image_url: undefined, ai_model: 'meshy-7.1', geometry_resolution: '2k', should_texture: true, texture_resolution: '2k',
    enable_pbr: false, should_remesh: true, topology: 'triangle', target_polycount: 9000, image_enhancement: false, target_formats: ['glb'],
  });
  assert.equal(body.image_url, `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
  assert.equal(MESHY_AI_MODEL, 'meshy-7.1');
  // 환경 변수 값 → API 값(이상하면 기본)
  assert.deepEqual(meshyOptions({ geometry: 'standard', targetPolycount: '15000', imageEnhancement: '1' }),
    { geometry_resolution: 'standard', target_polycount: 15000, image_enhancement: true });
  assert.equal(meshyOptions({ geometry: '4K' }).geometry_resolution, '4k');
  for (const g of ['', 'ultra', 'huge', undefined]) assert.equal(meshyOptions({ geometry: g }).geometry_resolution, '2k', String(g));
  for (const n of ['99', '300001', '1.5', 'x', -1]) assert.equal(meshyOptions({ targetPolycount: n }).target_polycount, 9000, String(n));
  assert.equal(meshyOptions({ imageEnhancement: '0' }).image_enhancement, false);
});

test('한 건: 잔액 확인 → 만들기 → 5초마다(Retry-After가 길면 그만큼) 묻기 → 키 없이 받기 → 다듬기. 장부에 적고 forget으로 빼며 Meshy에서 지운다', async () => {
  const r = meshyRig({
    answers: {
      balance: [balance(500)], create: [json({ result: 'task-1' }, 202)],
      poll: [task('PENDING', { preceding_tasks: 2 }), json({ id: 'task-1', status: 'IN_PROGRESS' }, 200, { 'retry-after': '8' }), done()],
      asset: [glbAnswer()], delete: [deleted()],
    },
  });
  assert.equal(await r.service.ready(), true);
  const made = await r.service.toGlb(PNG, { key: ID, badFails: 0 });
  assert.equal(made.glb.length, serviceGlb().length);
  assert.deepEqual(made.stats, { tris: 9118, bytes: 300, task: 'task-1', resumed: false, polls: 3, total_s: 13, credits: 35 });
  assert.deepEqual(r.calls.map((c) => [c.method, c.host, c.path]), [
    ['GET', 'api.meshy.ai', '/openapi/v1/balance'],
    ['POST', 'api.meshy.ai', '/openapi/v1/image-to-3d'],
    ['GET', 'api.meshy.ai', '/openapi/v1/image-to-3d/task-1'],
    ['GET', 'api.meshy.ai', '/openapi/v1/image-to-3d/task-1'],
    ['GET', 'api.meshy.ai', '/openapi/v1/image-to-3d/task-1'],
    ['GET', 'assets.meshy.ai', '/u/t/model.glb?Expires=1700000000&Signature=abc'],
  ]);
  assert.ok(r.calls.slice(0, 5).every((c) => c.auth === `Bearer ${KEY}`), 'API에는 키를 싣는다');
  assert.equal(r.calls[5].auth, null, '결과 파일 주소에는 키를 싣지 않는다');
  assert.deepEqual(JSON.parse(r.calls[1].body), meshyBody(PNG));
  assert.deepEqual(r.sleeps, [MESHY_POLL_MS, 8_000]);
  assert.deepEqual(r.tidied, [[serviceGlb().length, { yaw: 0 }]]);
  assert.deepEqual(r.ledger.read(), { day: '2026-11-12', created: 1, tasks: { [ID]: { task: 'task-1', at: NOON, bad: 0, png: SUM } }, trash: {} });
  await r.service.forget(ID);
  assert.deepEqual(r.ledger.read(), { day: '2026-11-12', created: 1, tasks: {}, trash: {} }, '하루 셈은 남는다');
  assert.deepEqual(r.calls.at(-1), {
    host: 'api.meshy.ai', path: '/openapi/v1/image-to-3d/task-1', method: 'DELETE', auth: `Bearer ${KEY}`, body: null,
  }, '다 받은 작업(보낸 그림과 만든 모형)을 Meshy에서 지운다');
  assert.ok(r.logs.some((l) => l[1] === 'meshy task created' && l[2].task === 'task-1' && l[2].today === 1));
  assert.ok(r.logs.some((l) => l[1] === 'meshy tasks deleted' && l[2].n === 1));
  // 일꾼이 쓰는 값들. 바깥으로 보내는 서비스라 사람이 요청한 줄만(processModel이 requested_at을 본다),
  // 그것도 Meshy로 보낸다고 알리고 받은 줄만 받는다(via)
  assert.deepEqual([r.service.maker, r.service.leaseSec, r.service.maxBad, r.service.requestedOnly, r.service.consent],
    [MESHY_MAKER, MESHY_LEASE_SECONDS, MESHY_MAX_BAD, true, 'meshy']);
  assert.deepEqual([MESHY_LEASE_SECONDS, MESHY_MAX_BAD, MESHY_POLL_MS, MESHY_POLL_MAX_MS, MESHY_DAILY_MAX], [1200, 2, 5000, 600_000, 120],
    '하루 상한 기본은 DB의 하루 3D 요청 상한(100)보다 넉넉하게(다시 만든 작업과 관리자 요청까지 센다)');
  assert.equal(r.service.options.ai_model, 'meshy-7.1');
  assert.equal(r.service.options.key_lock, true, '시작 줄에 키 잠금을 쥐었는지 남긴다');
});

test('실패 갈래: Meshy의 생성 실패·취소·결과 없음·주소 끝남·다듬지 못함은 bad(한 번만 다시), 받지 않는 입력은 permanent', async () => {
  const cases = [
    [{ poll: [task('FAILED', { task_error: { type: 'server_error', message: 'An internal error occurred.' } })] }, 'meshy_failed', 'bad'],
    [{ poll: [task('FAILED', { task_error: { type: 'timeout', message: 'slow' } })] }, 'meshy_failed', 'bad'],
    [{ poll: [task('FAILED', { task_error: { type: 'invalid_input', code: 'image_too_complex', message: 'too complex' } })] }, 'meshy_input', 'permanent'],
    [{ poll: [task('CANCELED')] }, 'meshy_canceled', 'bad'],
    [{ poll: [task('SUCCEEDED', { model_urls: {} })] }, 'meshy_no_glb', 'bad'],
    [{ poll: [task('SUCCEEDED', { model_urls: { glb: 'http://assets.meshy.ai/x.glb' } })] }, 'meshy_no_glb', 'bad'],
    [{ poll: [done()], asset: [json({ message: 'expired' }, 403)] }, 'meshy_expired', 'bad'],
    [{ poll: [done()], asset: [() => new Response('x', { headers: { 'content-length': String(200 * 1024 * 1024) } })] }, 'too_big', 'bad'],
  ];
  for (const [answers, code, kind] of cases) {
    const r = meshyRig({ answers: { create: [json({ result: 'task-1' }, 202)], ...answers } });
    const e = await why(r.service.toGlb(PNG, { key: ID }));
    assert.deepEqual([e.code, e.bad, e.permanent, e.down], [code, kind === 'bad', kind === 'permanent', false], code);
    assert.deepEqual(r.ledger.read().tasks, {}, `${code}: 끝난 작업은 장부에서 뺀다`);
    assert.deepEqual(Object.keys(r.ledger.read().trash), ['task-1'], `${code}: Meshy에서 지울 작업으로 옮긴다`);
  }
  // 받은 GLB를 다듬지 못함: 다듬기의 까닭 그대로, bad
  const parts = meshyRig({
    answers: { create: [json({ result: 'task-1' }, 202)], poll: [done()], asset: [glbAnswer()] },
    tidy: async () => { throw Object.assign(new Error('2 nodes, 2 parts'), { code: 'glb_parts' }); },
  });
  assert.deepEqual(await why(parts.service.toGlb(PNG, { key: ID })), {
    code: 'glb_parts', bad: true, permanent: false, down: false, message: 'tidy: 2 nodes, 2 parts',
  });
  // 만들기 요청을 받지 않음(400·422)은 다시 해도 같다. 바쁨(429)은 잠깐, 서비스 쪽(5xx·끊김)은 down
  const create = [
    [json({ message: 'Invalid image' }, 400), 'meshy_rejected', { permanent: true }],
    [json({ message: 'cannot process' }, 422), 'meshy_rejected', { permanent: true }],
    [json({ message: 'NoMorePendingTasks: wait' }, 429), 'meshy_busy', {}],
    [json({ message: 'oops' }, 500), 'service_down', { down: true }],
    [json({ message: 'unavailable' }, 503), 'service_down', { down: true }],
  ];
  for (const [answer, code, flags] of create) {
    const r = meshyRig({ answers: { create: [answer] } });
    const e = await why(r.service.toGlb(PNG, { key: ID }));
    assert.deepEqual([e.code, e.permanent, e.down, e.bad], [code, flags.permanent === true, flags.down === true, false], code);
    assert.deepEqual(r.ledger.read().tasks, {}, '만들지 못했으면 장부에 작업이 없다');
    assert.equal(r.ledger.read().created, 1, '보낸 요청은 하루 셈에 든다(넉넉히 센다)');
  }
});

test('크레딧·키 문제: 402·401·403(허용 IP 등)과 모자란 잔액은 한 시간 쉬며 경고. 쉬는 동안 ready()는 묻지도 않는다. 내용 검사(403)는 그 그림만', async () => {
  const r = meshyRig({ answers: { create: [json({ message: 'Insufficient credits' }, 402)], balance: [balance(800)] } });
  const e = await why(r.service.toGlb(PNG, { key: ID }));
  assert.deepEqual([e.code, e.down, e.bad, e.permanent], ['meshy_credits', true, false, false]);
  assert.deepEqual(r.logs.filter((l) => l[0] === 'warn').map((l) => [l[1], l[2].minutes]), [['meshy paused: no credits (402)', 60]]);
  const asked = r.calls.length;
  assert.equal(await r.service.ready(), false);
  r.clock.t += MESHY_PAUSE_MS - 1;
  assert.equal(await r.service.ready(), false);
  assert.equal(r.calls.length, asked, '쉬는 동안은 Meshy에 묻지 않는다');
  assert.deepEqual(await why(r.service.toGlb(PNG, { key: ID })), {
    code: 'meshy_paused', bad: false, permanent: false, down: true, message: 'meshy paused',
  });
  assert.equal(posts(r), 1, '쉬는 동안은 만들지 않는다');
  // 한 시간 뒤: 잔액부터 다시 보고, 채워졌으면 잇는다
  r.clock.t += 1;
  assert.equal(await r.service.ready(), true);
  assert.deepEqual(r.calls.at(-1).path, '/openapi/v1/balance');

  const low = meshyRig({ answers: { balance: [balance(39), balance(1000)] } });
  assert.equal(await low.service.ready(), false);
  assert.deepEqual(low.logs.at(-1), ['warn', 'meshy paused: credits low', { minutes: 60, balance: 39, need: 40 }]);
  low.clock.t += MESHY_PAUSE_MS;
  assert.equal(await low.service.ready(), true, '한 시간 뒤 다시 보고, 채워졌으면 잇는다');
  assert.equal(await low.service.ready(), true);
  assert.equal(low.calls.length, 2, '잔액은 5분 동안 다시 묻지 않는다');

  for (const [status, message, log] of [
    [401, 'Invalid API key', 'meshy paused: api key rejected (401)'],
    [403, 'ip_not_authorized', 'meshy paused: forbidden (403)'],
  ]) {
    const k = meshyRig({ answers: { balance: [json({ message }, status)] } });
    assert.equal(await k.service.ready(), false);
    assert.equal(k.logs.at(-1)[1], log);
    assert.equal(await k.service.ready(), false);
    assert.equal(k.calls.length, 1);
  }
  // 닿지 않음·5xx는 쉬지 않는다(일꾼이 1~2분 뒤 다시 본다)
  const flaky = meshyRig({ answers: { balance: [new TypeError('fetch failed'), json({}, 503), json({ balance: 'x' }), balance(100)] } });
  assert.deepEqual([await flaky.service.ready(), await flaky.service.ready(), await flaky.service.ready(), await flaky.service.ready()],
    [false, false, false, true]);
  assert.equal(flaky.logs.filter((l) => l[0] === 'warn').length, 0);
  // 만들다 403 내용 검사: 그 그림만 그만둔다(쉬지 않는다)
  const flagged = meshyRig({ answers: { create: [json({ message: 'Input flagged by content moderation' }, 403)] } });
  const f = await why(flagged.service.toGlb(PNG, { key: ID }));
  assert.deepEqual([f.code, f.permanent, f.down], ['blocked', true, false]);
  assert.equal(flagged.logs.some((l) => l[1].startsWith('meshy paused')), false);
});

test('하루 상한(KST): 다 쓰면 ready()가 false라 잡지 않고 하루에 한 번 경고. 만들기도 막는다. 자정(KST)이 지나면 다시', async () => {
  const ledger = memoryLedger();
  const clock = { t: Date.UTC(2026, 10, 12, 14, 0, 0) }; // 23:00 KST
  const ok = () => ({ create: [json({ result: 'task-a' }, 202), json({ result: 'task-b' }, 202)], poll: () => done()(), asset: () => glbAnswer()() });
  const r = meshyRig({ ledger, clock, dailyMax: 2, answers: { balance: () => balance(1000)(), ...ok() } });
  assert.equal(await r.service.ready(), true);
  await r.service.toGlb(PNG, { key: ID });
  await r.service.toGlb(PNG, { key: '33333333-3333-4333-8333-333333333333' });
  assert.equal(await r.service.ready(), false, '오늘 두 건을 다 썼다');
  assert.equal(await r.service.ready(), false);
  assert.deepEqual(r.logs.filter((l) => l[1].startsWith('meshy daily cap')).length, 1, '경고는 하루 한 번');
  const e = await why(r.service.toGlb(PNG, { key: '44444444-4444-4444-8444-444444444444' }));
  assert.deepEqual([e.code, e.down], ['daily_cap', true]);
  assert.equal(posts(r), 2, '상한을 넘는 만들기 요청은 보내지 않는다');
  // 일꾼을 다시 띄워도(같은 장부) 오늘 셈은 그대로
  const again = meshyRig({ ledger, clock, dailyMax: '2', answers: { balance: () => balance(1000)() } });
  assert.equal(await again.service.ready(), false);
  // KST 자정이 지나면 새 하루
  clock.t = Date.UTC(2026, 10, 12, 15, 0, 1); // 00:00:01 KST
  assert.equal(kstDay(clock.t), '2026-11-13');
  assert.equal(await again.service.ready(), true);
  // 0이면 새로 만들지 않는다
  const none = meshyRig({ dailyMax: 0, answers: {} });
  assert.equal(await none.service.ready(), false);
  assert.equal(none.calls.length, 0);
});

test('이어 보기: 기다리다 10분이 넘으면 timeout(작업은 장부에), 다시 잡으면 새로 만들지 않고 그 작업을 본다. 이상하다고 판정된 뒤에는 새로', async () => {
  const ledger = memoryLedger();
  const clock = { t: NOON };
  const slow = meshyRig({ ledger, clock, answers: { create: [json({ result: 'task-1' }, 202)], poll: () => task('IN_PROGRESS')() } });
  const e = await why(slow.service.toGlb(PNG, { key: ID }));
  assert.deepEqual([e.code, e.bad, e.down, e.permanent], ['timeout', false, false, false]);
  assert.equal(slow.sleeps.reduce((a, b) => a + b, 0), MESHY_POLL_MAX_MS);
  assert.equal(slow.calls.filter((c) => c.path === '/openapi/v1/image-to-3d/task-1').length, 121);
  assert.equal(ledger.read().tasks[ID].task, 'task-1');

  // 다시 잡음(결과 탓 실패는 그대로 0): 만들지 않고 이어 본다
  const resume = meshyRig({ ledger, clock, answers: { poll: [done()], asset: [glbAnswer()] } });
  const made = await resume.service.toGlb(PNG, { key: ID, badFails: 0 });
  assert.deepEqual([made.stats.task, made.stats.resumed, posts(resume)], ['task-1', true, 0]);
  assert.ok(resume.logs.some((l) => l[1] === 'meshy task resumed'));
  assert.equal(ledger.read().created, 1, '돈을 두 번 쓰지 않는다');

  // 결과가 이상하다고 판정됨(bad_fails 0 → 1): 그 작업은 지울 작업으로 옮기고 새로 만든다
  const redo = meshyRig({ ledger, clock, answers: { create: [json({ result: 'task-2' }, 202)], poll: [done({ id: 'task-2' })], asset: [glbAnswer()] } });
  const again = await redo.service.toGlb(PNG, { key: ID, badFails: 1 });
  assert.deepEqual([again.stats.task, again.stats.resumed, posts(redo)], ['task-2', false, 1]);
  assert.deepEqual(ledger.read().tasks[ID], { task: 'task-2', at: clock.t, bad: 1, png: SUM });
  assert.deepEqual(Object.keys(ledger.read().trash), ['task-1'], '쓰지 않을 옛 작업(결과가 이상했다)은 Meshy에서 지운다');

  // 결과 받기가 끊김: 작업은 장부에 남아 다음에 받기만 다시(만들지 않는다)
  const cut = meshyRig({ ledger, clock, answers: { poll: [done({ id: 'task-2' })], asset: [new TypeError('fetch failed')] } });
  const c = await why(cut.service.toGlb(PNG, { key: ID, badFails: 1 }));
  assert.deepEqual([c.code, c.bad, c.down], ['download_failed', false, false]);
  assert.equal(ledger.read().tasks[ID].task, 'task-2');

  // 작업이 없어짐(404, 만든 지 2분이 넘음): 장부에서 빼고 결과 탓으로 센다(요청 하나에 새 작업은 maxBad까지)
  clock.t += MESHY_FRESH_TASK_MS;
  const gone = meshyRig({ ledger, clock, answers: { poll: [json({ message: 'Task not found' }, 404)] } });
  const g = await why(gone.service.toGlb(PNG, { key: ID, badFails: 1 }));
  assert.deepEqual([g.code, g.bad, g.down, g.permanent], ['meshy_task_gone', true, false, false]);
  assert.equal(ledger.read().tasks[ID], undefined);
  assert.equal(ledger.read().trash['task-2'], undefined, '없어진 작업은 지울 것도 없다');

  // 막 만든 작업의 404는 아직 보이지 않는 것: 장부를 두고 다시 묻는다(새로 만들지 않는다)
  const young = meshyRig({
    answers: { create: [json({ result: 'task-y' }, 202)], poll: [json({ message: 'Task not found' }, 404), done({ id: 'task-y' })], asset: [glbAnswer()] },
  });
  const y = await young.service.toGlb(PNG, { key: ID });
  assert.deepEqual([y.stats.task, y.stats.polls, posts(young)], ['task-y', 2, 1]);

  // 묻다가 끊기거나 바쁘거나 서비스가 잠깐 안 되면 끝까지 다시 묻는다
  const bumpy = meshyRig({
    answers: {
      create: [json({ result: 'task-1' }, 202)], asset: [glbAnswer()],
      poll: [new TypeError('fetch failed'), json({ message: 'Rate limit exceeded' }, 429, { 'retry-after': '3' }), json({}, 502), done()],
    },
  });
  assert.equal((await bumpy.service.toGlb(PNG, { key: ID })).stats.polls, 4);
  assert.deepEqual(bumpy.sleeps, [5000, 5000, 5000], 'Retry-After가 5초보다 짧으면 5초');

  // 아주 오래된 장부의 작업(Meshy는 길어야 3일 둔다)은 이어 보지 않는다
  const old = meshyRig({
    ledger: memoryLedger({ day: '2026-11-09', created: 3, tasks: { [ID]: { task: 'task-old', at: NOON - 61 * 3_600_000, bad: 0, png: SUM } } }),
    answers: { create: [json({ result: 'task-new' }, 202)], poll: [done({ id: 'task-new' })], asset: [glbAnswer()] },
  });
  assert.equal((await old.service.toGlb(PNG, { key: ID })).stats.task, 'task-new');
  assert.deepEqual(old.ledger.read().created, 1, '지난날의 셈은 오늘 셈이 아니다');
});

test('이어 보기: 같은 그림 id에 다시 그린 그림(보낸 PNG의 지문이 다르다)과 지문이 없는 옛 장부 줄은 잇지 않고 새로 만든다. 옛 작업은 지울 작업으로', async () => {
  const REDRAWN = new Uint8Array([...PNG, 9]);
  for (const [kept, png, what] of [
    [{ task: 'task-1', at: NOON, bad: 0, png: SUM }, REDRAWN, '다시 그린 그림'],
    [{ task: 'task-1', at: NOON, bad: 0 }, PNG, '지문 없는 옛 줄'],
  ]) {
    const ledger = memoryLedger({ day: '2026-11-12', created: 1, tasks: { [ID]: kept }, trash: {} });
    const r = meshyRig({ ledger, answers: { create: [json({ result: 'task-2' }, 202)], poll: [done({ id: 'task-2' })], asset: [glbAnswer()] } });
    const made = await r.service.toGlb(png, { key: ID });
    assert.deepEqual([made.stats.task, made.stats.resumed, posts(r)], ['task-2', false, 1], what);
    assert.deepEqual(ledger.read().tasks[ID], { task: 'task-2', at: NOON, bad: 0, png: sumOf(png) }, what);
    assert.deepEqual(Object.keys(ledger.read().trash), ['task-1'], `${what}: 옛 그림의 작업은 Meshy에서 지운다`);
    assert.equal(ledger.read().created, 2, `${what}: 새 작업은 하루 셈에 든다`);
  }
});

test('만들기 요청이 답 없이 끊기면 먼저 찾아본다: 그 뒤에 생긴 작업이 있으면 그것을 쓰고, 없으면 다시 만들지 않고 돌려놓는다', async () => {
  const lost = meshyRig({
    answers: {
      create: [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })],
      list: [json([{ id: 'task-new', created_at: NOON + 2_000 }, { id: 'task-old', created_at: NOON - 600_000 }])],
      poll: [done({ id: 'task-new' })], asset: [glbAnswer()],
    },
  });
  const made = await lost.service.toGlb(PNG, { key: ID });
  assert.equal(made.stats.task, 'task-new');
  assert.equal(posts(lost), 1);
  assert.ok(lost.logs.some((l) => l[0] === 'warn' && l[1].startsWith('meshy create got no answer')));
  assert.equal(lost.calls.find((c) => c.path.startsWith('/openapi/v1/image-to-3d?')).path,
    '/openapi/v1/image-to-3d?page_size=5&sort_by=-created_at');
  // 요청 뒤에 생긴 작업이 둘 이상이면 고르지 않는다(같은 키로 도는 다른 클라이언트의 작업일 수 있다: 남의 3D가 이 그림에 붙지 않게)
  const two = meshyRig({
    answers: {
      create: [Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
      list: [json([{ id: 'task-a', created_at: NOON + 1_000 }, { id: 'task-b', created_at: NOON + 3_000 }])],
    },
  });
  assert.equal((await why(two.service.toGlb(PNG, { key: ID }))).code, 'timeout');
  assert.ok(two.logs.some((l) => l[1].startsWith('meshy create got no answer: several new tasks')));
  assert.equal(two.calls.filter((c) => c.path.startsWith('/openapi/v1/image-to-3d/task-')).length, 0, '어느 작업도 묻지 않는다');
  // 장부에 있는(다른 그림의) 작업은 고르지 않는다. 찾지 못하면 timeout(돌려놓기)이나 service_down
  const ledger = memoryLedger({ day: '2026-11-12', created: 1, tasks: { other: { task: 'task-x', at: NOON, bad: 0 } } });
  const none = meshyRig({
    ledger,
    answers: {
      create: [Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
      list: [json([{ id: 'task-x', created_at: NOON + 1_000 }, { id: 'task-old', created_at: NOON - 600_000 }])],
    },
  });
  assert.deepEqual((await why(none.service.toGlb(PNG, { key: ID }))).code, 'timeout');
  const down = meshyRig({ answers: { create: [new TypeError('fetch failed')], list: [new TypeError('fetch failed')] } });
  const d = await why(down.service.toGlb(PNG, { key: ID }));
  assert.deepEqual([d.code, d.down], ['service_down', true]);
  // 키 잠금 없이(같은 키를 다른 프로세스가 쓸 수 있다)는 찾지 않는다: 장부에 없는 새 작업 하나가 다른 일꾼의 것일 수 있다.
  // 그것을 제 그림의 것으로 삼으면 남의 3D를 이 사람 캐릭터로 올리고, 끝나면 그 작업을 지워 원래 일꾼이 404 뒤 다시 돈을 쓴다
  const shared = meshyRig({
    lock: null,
    answers: {
      create: [Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
      list: [json([{ id: 'task-of-another-worker', created_at: NOON + 1_000 }])],
    },
  });
  assert.equal((await why(shared.service.toGlb(PNG, { key: ID }))).code, 'timeout');
  assert.equal(shared.calls.some((c) => c.path.startsWith('/openapi/v1/image-to-3d?')), false, '목록을 묻지도 않는다');
  assert.equal(shared.calls.some((c) => c.path.includes('task-of-another-worker')), false, '남의 작업을 묻거나 지우지 않는다');
  assert.deepEqual(shared.ledger.read().tasks, {}, '남의 작업을 장부에 적지 않는다');
  assert.ok(shared.logs.some((l) => l[1] === 'meshy create got no answer: not looking for the task (no key lock)'));
  assert.equal(shared.service.options.key_lock, false);
});

test('키 누출 없음: 기록·오류·장부 어디에도 키가 없고, Meshy가 키를 되돌려 보내도 지운다. 키는 API 주소에만 싣는다', async () => {
  const runs = [
    meshyRig({ answers: { balance: [balance(500)], create: [json({ result: 'task-1' }, 202)], poll: [done()], asset: [glbAnswer()] } }),
    meshyRig({ answers: { create: [json({ message: `bad key ${KEY}` }, 401)] } }),
    meshyRig({ answers: { create: [json({ message: `Invalid image for ${KEY}` }, 400)] } }),
    meshyRig({ answers: { create: [json({ result: 'task-1' }, 202)], poll: [task('FAILED', { task_error: { type: 'server_error', message: `boom ${KEY}` } })] } }),
    meshyRig({ answers: { create: [Object.assign(new TypeError('fetch failed'), { cause: { code: KEY } })], list: [json([])] } }),
  ];
  const errors = [];
  for (const r of runs) {
    await r.service.ready().catch(() => {});
    errors.push(await why(r.service.toGlb(PNG, { key: ID })));
  }
  const seen = JSON.stringify({ errors, logs: runs.map((r) => r.logs), ledgers: runs.map((r) => r.ledger.read()), options: runs[0].service.options });
  assert.equal(seen.includes(KEY), false, seen.slice(0, 400));
  assert.ok(seen.includes('***'), 'Meshy가 돌려보낸 키는 ***로');
  for (const r of runs) {
    for (const c of r.calls) {
      if (c.host === 'api.meshy.ai') assert.equal(c.auth, `Bearer ${KEY}`);
      else assert.equal(c.auth, null, c.host);
      if (c.body) assert.equal(c.body.includes(KEY), false, '본문에도 키가 없다');
    }
  }
  assert.ok(runs[0].calls.some((c) => c.host === 'assets.meshy.ai'));
  assert.throws(() => createMeshyService({ apiKey: '', tidy: async () => ({}) }), /api key missing/);
  assert.throws(() => createMeshyService({ apiKey: KEY }), /glb tools missing/);
});

test('값이 든 작업 알리기(onJob): 작업 id를 받은 바로 뒤와 이어 볼 때 부르고, 만들기 전에 끝나면 부르지 않는다. 알림이 던져도 만들기는 잇는다', async () => {
  // 만들었다: 묻기 전에 알린다(받은 그대로의 GLB(raw)도 돌려준다)
  const order = [];
  const r = meshyRig({
    answers: { create: [json({ result: 'task-1' }, 202)], poll: [done()], asset: [glbAnswer()] },
  });
  const realFetchCalls = r.calls;
  const made = await r.service.toGlb(PNG, { key: ID, onJob: async () => { order.push(['job', realFetchCalls.length]); } });
  assert.deepEqual(order, [['job', 1]], '만들기 요청 하나 뒤, 묻기 전');
  assert.ok(made.raw instanceof Uint8Array);
  assert.equal(made.raw.length, serviceGlb().length, 'raw는 다듬기 전 Meshy가 준 그대로');
  // 이어 본다(작업은 이미 값이 들었다): 다시 알린다(앞의 알림이 끊겼을 수 있다. DB는 같은 요청을 한 번만 센다)
  const ledger = memoryLedger({ day: '2026-11-12', created: 1, tasks: { [ID]: { task: 'task-1', at: NOON, bad: 0, png: SUM } } });
  const resumed = [];
  const again = meshyRig({ ledger, answers: { poll: [done()], asset: [glbAnswer()] } });
  await again.service.toGlb(PNG, { key: ID, onJob: async () => { resumed.push('job'); } });
  assert.deepEqual([resumed, posts(again)], [['job'], 0]);
  // 만들기 전에 끝남(받지 않는 입력, 크레딧 없음, 하루 상한, 닿지 않음): 알리지 않는다(돈이 들지 않았다)
  for (const [name, answer] of [
    ['rejected', json({ message: 'Invalid image' }, 400)],
    ['credits', json({ message: 'Insufficient credits' }, 402)],
    ['down', new TypeError('fetch failed')],
  ]) {
    const told = [];
    const x = meshyRig({ answers: { create: [answer], list: [json([])] } });
    await why(x.service.toGlb(PNG, { key: ID, onJob: async () => { told.push(name); } }));
    assert.deepEqual(told, [], name);
  }
  const capped = meshyRig({ dailyMax: 0, answers: {} });
  const told = [];
  assert.equal((await why(capped.service.toGlb(PNG, { key: ID, onJob: async () => { told.push('x'); } }))).code, 'daily_cap');
  assert.deepEqual(told, []);
  // 알림이 던져도(DB가 잠깐 안 됨) 만들기는 잇는다
  const loud = meshyRig({ answers: { create: [json({ result: 'task-9' }, 202)], poll: [done({ id: 'task-9' })], asset: [glbAnswer()] } });
  const ok = await loud.service.toGlb(PNG, { key: ID, onJob: async () => { throw new Error('db down'); } });
  assert.equal(ok.stats.task, 'task-9');
  assert.ok(loud.logs.some((l) => l[0] === 'warn' && l[1] === 'meshy job not reported'));
});

test('지우기: 도는 중(409)이면 남겨 두고 다음 차례(ready, 1분에 한 번)에 다시 지운다. 이미 없으면(404) 지운 것으로. 닿지 않으면 그 차례는 멈춘다', async () => {
  const clock = { t: NOON };
  const ledger = memoryLedger({ day: '2026-11-12', created: 2, tasks: {}, trash: { 'task-a': { at: NOON - 2000, tries: 0 }, 'task-b': { at: NOON - 1000, tries: 0 } } });
  const r = meshyRig({
    ledger, clock,
    answers: {
      delete: [json({ message: 'Task is IN_PROGRESS and cannot be deleted.' }, 409), json({ message: 'Task not found' }, 404), deleted()],
      balance: () => balance(500)(),
    },
  });
  assert.equal(await r.service.ready(), true);
  assert.deepEqual(deletes(r), ['/openapi/v1/image-to-3d/task-a', '/openapi/v1/image-to-3d/task-b'], '오래된 것부터');
  assert.deepEqual(ledger.read().trash, { 'task-a': { at: NOON - 2000, tries: 1 } }, '404는 이미 없는 것: 장부에서 뺀다');
  assert.ok(r.logs.some((l) => l[1] === 'meshy task not deleted yet: will retry' && l[2].status.includes(409)));
  assert.ok(r.calls.filter((c) => c.method === 'DELETE').every((c) => c.auth === `Bearer ${KEY}` && c.body === null));
  assert.equal(await r.service.ready(), true);
  assert.equal(deletes(r).length, 2, '1분 안에는 다시 지우지 않는다');
  clock.t += 60_000;
  assert.equal(await r.service.ready(), true);
  assert.deepEqual([deletes(r).at(-1), ledger.read().trash], ['/openapi/v1/image-to-3d/task-a', {}], '다음 차례에 지웠다');
  // 지울 것이 없으면 묻지 않는다
  await r.service.forget('33333333-3333-4333-8333-333333333333');
  assert.equal(deletes(r).length, 3);

  // 닿지 않으면 그 차례는 거기서 멈추고(나머지도 다음에), 장부의 지울 작업은 그대로
  const down = meshyRig({
    ledger: memoryLedger({ day: '', created: 0, tasks: {}, trash: { 'task-c': { at: NOON - 2, tries: 0 }, 'task-d': { at: NOON - 1, tries: 0 } } }),
    answers: { delete: [new TypeError('fetch failed')] },
  });
  assert.equal(await down.service.sweep(), 0);
  assert.equal(deletes(down).length, 1);
  assert.deepEqual(down.ledger.read().trash, { 'task-c': { at: NOON - 2, tries: 0 }, 'task-d': { at: NOON - 1, tries: 0 } });

  // 키·크레딧 문제로 쉬는 중에는 묻지 않는다
  const paused = meshyRig({
    ledger: memoryLedger({ day: '', created: 0, tasks: {}, trash: { 'task-e': { at: NOON, tries: 0 } } }),
    answers: { create: [json({ message: 'Insufficient credits' }, 402)] },
  });
  await why(paused.service.toGlb(PNG, { key: ID }));
  assert.equal(await paused.service.sweep(), 0);
  assert.deepEqual(deletes(paused), []);

  // 15일 넘게 지우지 못한 작업은 장부에서 뺀다(Meshy가 보관 기한에 이미 지웠다)
  const stale = meshyRig({
    ledger: memoryLedger({ day: '', created: 0, tasks: {}, trash: { 'task-old': { at: NOON - 16 * 24 * 3_600_000, tries: 40 } } }),
    answers: { delete: [json({ message: 'busy' }, 503)] },
  });
  await stale.service.sweep();
  assert.deepEqual(stale.ledger.read().trash, {});
  assert.ok(stale.logs.some((l) => l[1] === 'meshy task not deleted in time: left to Meshy retention'));
});

test('끝난 작업은 모두 지울 작업으로: 그만둠·결과 탓으로 바꾼 옛 작업·지운 그림(forget), 60시간 넘게 잇지 않은 작업. 없어진 작업(404)은 빼기만', async () => {
  // forget: processModel이 끝난 그림(ready·failed·지워짐)마다 부른다. 지금 지우지 못하면(409) 남겨 둔다
  const clock = { t: NOON };
  const ledger = memoryLedger({ day: '2026-11-12', created: 1, tasks: { [ID]: { task: 'task-1', at: NOON, bad: 0 } } });
  const r = meshyRig({ ledger, clock, answers: { delete: [json({ message: 'Task is IN_PROGRESS' }, 409)] } });
  await r.service.forget(ID);
  assert.deepEqual(ledger.read(), { day: '2026-11-12', created: 1, tasks: {}, trash: { 'task-1': { at: NOON, tries: 1 } } });
  // 60시간 넘게 잇지 않은 작업(그사이 그림을 지워 다시 잡히지 않음 등)은 다음에 장부를 쓸 때 지울 작업으로 옮긴다
  const old = memoryLedger({ day: '2026-11-09', created: 1, tasks: { [ID]: { task: 'task-9', at: NOON - 61 * 3_600_000, bad: 0 } } });
  const later = meshyRig({ ledger: old, clock: { t: NOON }, answers: { create: [json({ result: 'task-10' }, 202)], poll: [done({ id: 'task-10' })], asset: [glbAnswer()] } });
  await later.service.toGlb(PNG, { key: '44444444-4444-4444-8444-444444444444' });
  assert.deepEqual(Object.keys(old.read().trash), ['task-9']);
  assert.equal(old.read().tasks[ID], undefined);
});

test('장부 잠금: 장부 하나에 프로세스 하나. pid와 시작한 때를 적고, 살아 있는 다른 프로세스가 쥐면 만들지 않는다. 죽었거나 같은 pid를 다른 프로세스가 쓰면 넘겨받는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meshy-lock-'));
  try {
    const path = join(dir, 'state', 'meshy.json');
    const lock = `${path}.lock`;
    const holder = () => JSON.parse(readFileSync(lock, 'utf8'));
    const a = fileLedger(path);
    a.lock();
    assert.equal(holder().pid, process.pid);
    assert.ok(Math.abs(holder().started - (Date.now() - process.uptime() * 1000)) < 2_000, '이 프로세스가 시작한 때를 함께 적는다');
    assert.equal(statSync(lock).mode & 0o777, 0o600);
    a.lock();
    fileLedger(path).lock(); // 같은 프로세스가 다시 쥐어도 된다
    a.unlock();
    assert.equal(existsSync(lock), false, '놓으면 지운다');
    // 살아 있는 다른 프로세스(이 시험을 띄운 부모)가 쥐고 있다: 같은 장부로 두 번째 일꾼이나 --once 실행
    const parent = { pid: process.ppid, started: processStartedAt(process.ppid) };
    assert.ok(Number.isFinite(parent.started), 'ps로 다른 프로세스가 시작한 때를 읽는다');
    writeFileSync(lock, `${JSON.stringify(parent)}\n`);
    assert.throws(() => fileLedger(path).lock(), (e) => e.code === 'ledger_locked');
    assert.throws(() => createMeshyService({ apiKey: KEY, tidy: async () => ({}), ledger: fileLedger(path) }), (e) => e.code === 'ledger_locked');
    assert.deepEqual(holder(), parent, '남의 잠금은 건드리지 않는다');
    // 옛 잠금(pid 한 줄)은 pid만 본다
    writeFileSync(lock, `${process.ppid}\n`);
    assert.throws(() => fileLedger(path).lock(), (e) => e.code === 'ledger_locked');
    // 죽은 프로세스(멈춘 일꾼)의 잠금은 넘겨받는다
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    writeFileSync(lock, `${JSON.stringify({ pid: dead, started: Date.now() - 5_000 })}\n`);
    const b = fileLedger(path);
    assert.equal(createMeshyService({ apiKey: KEY, tidy: async () => ({}), ledger: b }).name, 'meshy');
    assert.equal(holder().pid, process.pid);
    b.unlock();
    // 다시 켠 뒤 같은 pid를 다른 프로세스가 쓴다(예전에는 pid만 보아 3D가 조용히 꺼졌다): 살아 있는 pid라도 그 프로세스가 아니면 넘겨받는다
    //   잠금을 쓴 때가 이번에 켜기 전
    writeFileSync(lock, `${JSON.stringify({ pid: process.ppid, started: Date.parse('2026-01-01T00:00:00Z') })}\n`);
    const c = fileLedger(path, { bootAt: () => Date.parse('2026-11-01T00:00:00Z') });
    c.lock();
    assert.equal(holder().pid, process.pid);
    c.unlock();
    //   지금 그 pid의 프로세스가 시작한 때가 적힌 때와 다르다(같은 부팅 안에서 pid를 다시 쓴다)
    const written = Date.now() - 1_000;
    writeFileSync(lock, `${JSON.stringify({ pid: process.ppid, started: written })}\n`);
    assert.throws(() => fileLedger(path, { startOf: () => written + 90_000 }).lock(), (e) => e.code === 'ledger_locked', '조금(10분 안) 다르면 같은 프로세스');
    assert.throws(() => fileLedger(path, { startOf: () => null }).lock(), (e) => e.code === 'ledger_locked', '시작한 때를 못 읽으면 쥔 것으로(돈은 안전한 쪽)');
    const d = fileLedger(path, { startOf: () => written - 3_600_000 });
    d.lock();
    assert.equal(holder().pid, process.pid);
    d.unlock();
    // 다시 켠 뒤 일꾼 여럿이 함께 떠서 같은 죽은 잠금을 본다: 넘겨받기는 한 번에 한 프로세스만, 그것도 죽었다고 본 내용 그대로일 때만 지운다.
    //   죽었다고 보는 사이 다른 프로세스가 새로 쥐었다(아래 startOf가 그 순간을 흉내 낸다): 그 잠금은 지우지 않고 쥔 것으로 본다
    const real = processStartedAt(process.ppid);
    const fresh = `${JSON.stringify({ pid: process.ppid, started: real })}\n`;
    writeFileSync(lock, `${JSON.stringify({ pid: process.ppid, started: real - 3_600_000 })}\n`);
    let raced = false;
    const racer = fileLedger(path, {
      bootAt: () => 0, // 켠 때로는 가리지 않고 시작한 때로만 본다(이 컴퓨터를 언제 켰든 같게)
      startOf: () => {
        if (!raced) {
          raced = true;
          writeFileSync(lock, fresh); // 다른 프로세스가 죽은 잠금을 지우고 새로 쥐었다
        }
        return real;
      },
    });
    assert.throws(() => racer.lock(), (e) => e.code === 'ledger_locked' && e.pid === process.ppid);
    assert.equal(readFileSync(lock, 'utf8'), fresh, '먼저 새로 쥔 프로세스의 잠금을 지우지 않는다');
    assert.equal(existsSync(`${lock}.takeover`), false, '넘겨받기 표시는 끝나면 지운다');
    //   다른 프로세스가 넘겨받는 중(표시가 막 생겼다)이면 기다렸다가 다시 본다: 끝내 끝나지 않으면 쥐지 않는다(3D만 꺼진다)
    writeFileSync(lock, `${JSON.stringify({ pid: dead, started: Date.now() - 5_000 })}\n`);
    writeFileSync(`${lock}.takeover`, `${process.ppid}\n`);
    assert.throws(() => fileLedger(path).lock(), (e) => e.code === 'ledger_locked' && /not taken/.test(e.message));
    //   넘겨받다 멈춘 프로세스의 표시(30초 넘게 남음)는 치우고 넘겨받는다
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${lock}.takeover`, old, old);
    const e = fileLedger(path);
    e.lock();
    assert.equal(holder().pid, process.pid);
    assert.equal(existsSync(`${lock}.takeover`), false);
    e.unlock();
    // 메모리 장부(시험)는 잠그지 않는다
    assert.equal(createMeshyService({ apiKey: KEY, tidy: async () => ({}) }).name, 'meshy');
    // ps의 지난 시간 읽기
    assert.deepEqual(['05:12', '1:02:03', '2-01:02:03', ' 00:07\n', 'x', ''].map(etimeSeconds), [312, 3723, 176523, 7, null, null]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('키 잠금: 이름은 키의 해시(키는 어디에도 쓰지 않는다), 자리는 장부와 상관없는 고정 자리. 다른 키는 따로', () => {
  assert.equal(DEFAULT_LOCK_DIR, join(homedir(), '.joyeondang', 'meshy-locks'));
  const p = keyLockPath(KEY, '/locks');
  assert.match(p, /^\/locks\/meshy-[0-9a-f]{24}\.lock$/);
  assert.equal(p.includes(KEY), false);
  assert.equal(keyLockPath(` ${KEY}\n`, '/locks'), p, '앞뒤 빈칸은 같은 키');
  assert.notEqual(keyLockPath(`${KEY}x`, '/locks'), p);
  const dir = mkdtempSync(join(tmpdir(), 'meshy-key-'));
  try {
    const k = keyLock(KEY, dir);
    assert.equal(k.path, keyLockPath(KEY, dir));
    writeFileSync(k.path, `${JSON.stringify({ pid: process.ppid, started: processStartedAt(process.ppid) })}\n`);
    assert.throws(() => k.lock(), (e) => e.code === 'key_locked' && !String(e.message).includes(KEY));
    // 키 잠금을 쥐지 못하면 장부는 건드리지 않는다
    const ledger = fileLedger(join(dir, 'state', 'meshy.json'));
    assert.throws(() => createMeshyService({ apiKey: KEY, tidy: async () => ({}), ledger, lock: keyLock(KEY, dir) }), (e) => e.code === 'key_locked');
    assert.equal(existsSync(join(dir, 'state', 'meshy.json.lock')), false);
    // 다른 키는 따로 돈다
    const other = keyLock(`${KEY}2`, dir);
    other.lock();
    other.unlock();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('같은 키에 클라이언트 하나: 장부를 일꾼마다 따로 두어도 둘째 프로세스는 Meshy 서비스를 만들지 못한다(돈을 두 번 쓰거나 남의 작업을 잇지 않게, 하루 상한도 키마다 하나)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meshy-two-'));
  try {
    const locks = join(dir, 'locks');
    // 첫 일꾼(이 프로세스): 장부 A, 하루 상한 2
    const first = createMeshyService({
      apiKey: KEY, tidy: async () => ({}), ledger: fileLedger(join(dir, 'a', 'meshy.json')), lock: keyLock(KEY, locks), dailyMax: 2,
    });
    assert.equal(first.options.key_lock, true);
    // 둘째 일꾼(다른 프로세스): 장부 B(MESHY_STATE_FILE을 일꾼마다 따로), 같은 키
    const meshy = fileURLToPath(new URL('../../worker/avatar/meshy.mjs', import.meta.url));
    const child = (key, ledgerDir) => spawnSync(process.execPath, ['--input-type=module', '-e', `
      const { createMeshyService, fileLedger, keyLock } = await import(${JSON.stringify(meshy)});
      try {
        const s = createMeshyService({ apiKey: process.env.K, tidy: async () => ({}), ledger: fileLedger(process.env.L), lock: keyLock(process.env.K, process.env.D) });
        console.log('made', s.options.daily_max);
      } catch (e) {
        console.log('refused', e.code);
      }
    `], { encoding: 'utf8', env: { ...process.env, K: key, L: join(dir, ledgerDir, 'meshy.json'), D: locks } });
    const second = child(KEY, 'b');
    assert.equal(second.stdout.trim(), 'refused key_locked', second.stderr);
    assert.equal(existsSync(join(dir, 'b', 'meshy.json.lock')), false, '장부 B는 잠그지도 않는다');
    // 다른 키(다른 계정)의 일꾼은 돈다
    assert.equal(child(`${KEY}-other`, 'c').stdout.trim(), 'made 120');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('장부 파일: 임시 파일에 쓰고 바꿔 끼운다(권한 600). 읽지 못하거나 모양이 이상하면 빈 장부로 읽는다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meshy-ledger-'));
  try {
    const path = join(dir, 'state', 'meshy.json');
    const ledger = fileLedger(path);
    assert.equal(ledger.read(), null);
    ledger.write({ day: '2026-11-12', created: 2, tasks: { [ID]: { task: 'task-1', at: NOON, bad: 0 } } });
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { day: '2026-11-12', created: 2, tasks: { [ID]: { task: 'task-1', at: NOON, bad: 0 } } });
    assert.equal(statSync(path).mode & 0o777, 0o600);
    // 이상한 장부: 쓸 수 있는 것만 남긴다(작업 id 모양, 숫자)
    const r = meshyRig({
      ledger: memoryLedger({ day: 3, created: -1, tasks: { a: { task: '../x', at: 1 }, b: { task: 'ok-1', at: 'x' }, [ID]: { task: 'task-9', at: NOON, bad: 'x', png: SUM } } }),
      answers: { poll: [done({ id: 'task-9' })], asset: [glbAnswer()] },
    });
    assert.equal((await r.service.toGlb(PNG, { key: ID })).stats.task, 'task-9');
    // 장부에 적지 못하면 만들지 않는다
    const broken = meshyRig({ ledger: { read: () => null, write: () => { throw Object.assign(new Error('nope'), { code: 'EACCES' }); } }, answers: {} });
    assert.deepEqual((await why(broken.service.toGlb(PNG, { key: ID }))).code, 'ledger_error');
    assert.equal(broken.calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
