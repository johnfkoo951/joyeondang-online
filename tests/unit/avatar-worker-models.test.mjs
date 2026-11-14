// 3D 모형 일꾼(worker/avatar/models.mjs): 한 바퀴(잡기 → 받기 → 3D 서비스 → 확인 → 올리기 → 정리)와 실패 갈래,
// 언제 할지 정하는 차례(서비스가 꺼져 있으면 잡지 않고 2분마다 다시 보며 기다린다), 3D 서비스 어댑터(가짜 fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL_MAKER, DEFAULT_MODEL_URL, MODEL_PROVIDERS, MODELS_DOWN_REST_MS, MODELS_GAP_MS, MODELS_HEALTH_TTL_MS,
  MODELS_LEASE_SECONDS, MODELS_REST_MAX_MS, createModelService, createModelsTurn, modelProviderOf, processModel, readStats,
  wasRequested,
} from '../../worker/avatar/models.mjs';
import { MAX_MODEL_BYTES } from '../../src/lib/avatar/model.ts';
import { readModelProvider } from '../../src/lib/avatar/consent.ts';
import { glbOf, serviceGlb, serviceJson } from './helpers/glb-fixture.ts';

const UID = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const CHAR = `${UID}/chars/${ID}.png`;
/** 사람이 3D를 요청한 때(0021의 잡기가 잡은 줄에 함께 싣는 값, jsonb의 timestamptz 모양) */
const REQUESTED = '2026-11-12T03:00:00.123456+00:00';
const GLB_PATH = `${UID}/models/${ID}.v1.glb`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0, 0, 0, 6, 0, 8, 6, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

/**
 * 가짜 DB·저장소·3D 서비스를 한 벌로. calls에 일어난 일을 차례로 적는다.
 * made: 3D 서비스가 줄 것(함수면 부를 때마다 그 답, 오류를 던지면 그대로 던진다)
 */
function rig({ attempts = 1, badFails = 0, job, made, settleOk = true, failUpload, clock } = {}) {
  const calls = [];
  const files = new Map([[CHAR, PNG]]);
  const seeds = [];
  const settledBy = [];
  let slept = 0;
  const db = {
    async modelClaim(worker, lease) {
      calls.push(['claim', worker, lease]);
      return job === undefined
        ? { id: ID, user_id: UID, image_path: CHAR, attempts, bad_fails: badFails, requested_at: REQUESTED, via: 'meshy' }
        : job;
    },
    async modelRelease(id, worker, delay, bad) { calls.push(['release', delay, ...(bad ? ['bad'] : [])]); return true; },
    async modelSettle(id, status, { maker = null, reason = null, worker = null } = {}) {
      calls.push(['settle', status, status === 'ready' ? maker : reason]);
      settledBy.push(worker);
      return settleOk;
    },
  };
  const store = {
    async download(p) {
      calls.push(['download', p]);
      if (!files.has(p)) throw Object.assign(new Error('no such file'), { code: 'storage_error' });
      return files.get(p);
    },
    async upload(p, bytes, type) {
      calls.push(['upload', p, type]);
      if (failUpload?.(p)) throw Object.assign(new Error('upload: offline'), { code: 'storage_error' });
      files.set(p, bytes);
    },
    async remove(ps) { calls.push(['remove', ...ps]); for (const p of ps) files.delete(p); },
  };
  const service = {
    async ready() { return true; },
    async toGlb(png, { seed }) {
      seeds.push(seed);
      if (clock) clock.t += clock.step;
      const answer = typeof made === 'function' ? await made(seeds.length) : made ?? { glb: serviceGlb(), stats: { total_s: 18 } };
      return answer;
    },
  };
  const r = {
    db, store, service, worker: 'w1', calls, files, seeds, settledBy,
    sleep: async () => { slept += 1; },
    get slept() { return slept; },
  };
  if (clock) r.now = () => clock.t;
  return r;
}
const boom = (props) => async () => { throw Object.assign(new Error(props.code ?? 'x'), props); };

test('모형: 그림을 3D 서비스로 보내 확인한 GLB를 올리고 ready. seed는 몇 번째로 잡았는지, 할 일이 없으면 idle', async () => {
  const r = rig();
  assert.deepEqual(await processModel(r), { outcome: 'ready', id: ID });
  assert.deepEqual(r.calls, [
    ['claim', 'w1', MODELS_LEASE_SECONDS], ['download', CHAR], ['upload', GLB_PATH, 'model/gltf-binary'],
    ['settle', 'ready', DEFAULT_MODEL_MAKER],
  ]);
  assert.deepEqual([r.seeds, r.settledBy], [[1], ['w1']]);
  assert.equal(r.files.get(GLB_PATH)?.length, serviceGlb().length);
  const third = rig({ attempts: 3, badFails: 2 });
  assert.equal((await processModel({ ...third, maker: 'other-maker' })).outcome, 'ready');
  assert.deepEqual([third.seeds, third.calls.at(-1)], [[3], ['settle', 'ready', 'other-maker']]);
  const idle = rig({ job: null });
  assert.deepEqual(await processModel(idle), { outcome: 'idle' });
  assert.deepEqual(idle.calls, [['claim', 'w1', MODELS_LEASE_SECONDS]]);
});

test('모형: 결과가 이상하면(형식·크기·삼각형·모양, 생성 실패) 2분·4분 뒤 다른 seed로, 세 번째는 failed', async () => {
  const lying = serviceJson();
  lying.nodes = [{ mesh: 0, scale: [0.5, 0.25, 0.5], translation: [0, 0.25, 0] }];
  const bads = [
    [{ glb: new Uint8Array([1, 2, 3]), stats: null }, 'bad_output'],
    [{ glb: glbOf(lying), stats: null }, 'bad_output'],
    [{ glb: glbOf({ ...serviceJson(), extensionsRequired: ['KHR_draco_mesh_compression'] }), stats: null }, 'bad_output'],
    [boom({ code: 'service_failed', status: 500, bad: true }), 'service_failed'],
  ];
  for (const [made, reason] of bads) {
    for (const [fails, delay] of [[0, 120], [1, 240]]) {
      const r = rig({ attempts: fails + 1, badFails: fails, made });
      assert.deepEqual(await processModel(r), { outcome: 'retry', reason, id: ID, trouble: true, down: false });
      assert.deepEqual(r.calls.slice(1), [['download', CHAR], ['release', delay, 'bad']], `${reason} ${fails}`);
      assert.equal(r.files.has(GLB_PATH), false, '올리지 않는다');
    }
    const last = rig({ attempts: 3, badFails: 2, made });
    assert.deepEqual(await processModel(last), { outcome: 'failed', reason, id: ID, trouble: true });
    assert.deepEqual(last.calls.slice(1), [['download', CHAR], ['settle', 'failed', reason]]);
    assert.deepEqual(last.settledBy, ['w1'], '그만둘 때도 잡은 일꾼의 이름을 넘긴다(임대가 넘어간 뒤의 그만두기를 DB가 거른다)');
  }
});

test('모형: 서비스가 받지 않는 입력(400·422)은 다시 해도 같으니 바로 failed', async () => {
  const r = rig({ made: boom({ code: 'bad_input', status: 422, permanent: true }) });
  assert.deepEqual(await processModel(r), { outcome: 'failed', reason: 'bad_input', id: ID, trouble: true });
  assert.deepEqual(r.calls.slice(1), [['download', CHAR], ['settle', 'failed', 'bad_input']]);
});

test('모형: 서비스·저장소가 안 될 때는 2분·4분, 그 뒤로는 한 시간씩 쉬며 여덟 번까지. 결과 탓 실패와 따로 센다', async () => {
  const down = boom({ code: 'service_down', down: true });
  for (const [n, delay] of [[1, 120], [2, 240], [3, 3600], [7, 3600]]) {
    const r = rig({ attempts: n, made: down });
    assert.deepEqual(await processModel(r), { outcome: 'retry', reason: 'service_down', id: ID, trouble: true, down: true });
    assert.deepEqual(r.calls.slice(1), [['download', CHAR], ['release', delay]], `${n}번째`);
  }
  const last = rig({ attempts: 8, made: down });
  assert.deepEqual(await processModel(last), { outcome: 'failed', reason: 'service_down', id: ID, trouble: true });
  // 시간 넘김은 서비스 쪽 사정으로 치되, 서비스가 꺼졌다고 하지는 않는다
  const slow = rig({ made: boom({ code: 'timeout' }) });
  assert.deepEqual(await processModel(slow), { outcome: 'retry', reason: 'timeout', id: ID, trouble: true, down: false });
  // 결과 탓 실패가 두 번 있었던 줄이 서비스 탓으로 실패하면 서비스 쪽 첫 실패(2분), 결과 탓으로 세지 않는다
  const mixed = rig({ attempts: 3, badFails: 2, made: down });
  assert.deepEqual((await processModel(mixed)).outcome, 'retry');
  assert.deepEqual(mixed.calls.at(-1), ['release', 120]);
  // 서비스가 꺼진 사이 여러 번 돌려놓인 뒤(잡은 횟수 4) 처음 받은 결과가 이상하면: 결과 탓 첫 실패라 2분 뒤 다시
  const after = rig({ attempts: 4, made: { glb: new Uint8Array(8), stats: null } });
  assert.deepEqual(await processModel(after), { outcome: 'retry', reason: 'bad_output', id: ID, trouble: true, down: false });
  assert.deepEqual(after.calls.at(-1), ['release', 120, 'bad']);
  // 그림을 받지 못함(저장소)
  const noChar = rig();
  noChar.files.delete(CHAR);
  assert.deepEqual((await processModel(noChar)).reason, 'storage_error');
  assert.deepEqual(noChar.seeds, [], '서비스에 보내지 않는다');
});

test('모형: 올리기는 한 번 더 해 보고, 그래도 안 되면 거두고 돌려놓는다. ready로 적다 난 오류면 파일은 둔다', async () => {
  let tries = 0;
  const blip = rig({ failUpload: () => tries++ === 0 });
  assert.equal((await processModel(blip)).outcome, 'ready');
  assert.deepEqual([blip.slept, blip.seeds.length, blip.files.has(GLB_PATH)], [1, 1, true], '만든 모형을 버리지 않는다');
  const broken = rig({ failUpload: () => true });
  assert.deepEqual(await processModel(broken), { outcome: 'retry', reason: 'storage_error', id: ID, trouble: true, down: false });
  assert.deepEqual(broken.calls.slice(-2), [['remove', GLB_PATH], ['release', 120]]);
  const lost = rig();
  lost.db.modelSettle = async () => { throw Object.assign(new Error('socket hang up'), { code: 'db_error' }); };
  assert.deepEqual((await processModel(lost)).reason, 'db_error');
  assert.deepEqual([lost.files.has(GLB_PATH), lost.calls.some((c) => c[0] === 'remove'), lost.calls.at(-1)], [true, false, ['release', 120]]);
});

test('모형: 그사이 본인이 그림을 지웠으면(정리가 false) 올린 모형을 거두고 gone. 이상한 작업·그림은 서비스에 보내지 않는다', async () => {
  const gone = rig({ settleOk: false });
  assert.deepEqual(await processModel(gone), { outcome: 'gone', id: ID });
  assert.deepEqual(gone.calls.slice(-2), [['settle', 'ready', DEFAULT_MODEL_MAKER], ['remove', GLB_PATH]]);
  assert.deepEqual([...gone.files.keys()], [CHAR]);
  for (const job of [
    { id: ID, user_id: UID, image_path: `${UID}/chars/33333333-3333-4333-8333-333333333333.png`, attempts: 1 },
    { id: ID, user_id: UID, image_path: `${UID}/originals/${ID}.png`, attempts: 1 },
    { id: 'x', user_id: UID, image_path: CHAR, attempts: 1 },
    { id: ID, user_id: '../x', image_path: CHAR, attempts: 1 },
  ]) {
    const r = rig({ job });
    assert.deepEqual(await processModel(r), { outcome: 'failed', reason: 'bad_job', id: job.id, trouble: false });
    assert.deepEqual([r.seeds, r.calls.slice(1)], [[], [['settle', 'failed', 'bad_job']]]);
  }
  const notPng = rig();
  notPng.files.set(CHAR, JPEG);
  assert.deepEqual([(await processModel(notPng)).reason, notPng.seeds], ['bad_char', []]);
  // 옛 DB 어댑터가 결과 탓 횟수를 주지 않아도(없으면 0) 돈다
  const old = rig({ job: { id: ID, user_id: UID, image_path: CHAR, attempts: 1 }, made: { glb: new Uint8Array(8), stats: null } });
  assert.deepEqual((await processModel(old)).outcome, 'retry');
  assert.deepEqual(old.calls.at(-1), ['release', 120, 'bad']);
});

test('모형: 임대가 끝나 가면(잠들었다 깬 컴퓨터) 올리지도 정리하지도 않고 물러난다', async () => {
  const clock = { t: 1_000_000, step: (MODELS_LEASE_SECONDS - 30) * 1000 };
  const r = rig({ clock });
  assert.deepEqual(await processModel(r), { outcome: 'late', id: ID, trouble: true });
  assert.deepEqual(r.calls.slice(1), [['download', CHAR]], '올리기·정리·돌려놓기 모두 하지 않는다');
  // 실패해도 마찬가지: 돌려놓지 않는다(다른 일꾼이 다시 잡았을 수 있다)
  const failing = rig({ clock: { t: 0, step: MODELS_LEASE_SECONDS * 1000 }, made: boom({ code: 'service_down', down: true }) });
  assert.equal((await processModel(failing)).outcome, 'late');
  assert.equal(failing.calls.some((c) => c[0] === 'release' || c[0] === 'settle'), false);
});

// ───────── 제공자가 정하는 값(meshy: 임대 20분, 결과 탓 실패는 한 번만 다시, 끝난 그림 알리기)
/** rig의 3D 서비스를 meshy 모양으로: 임대·상한·이름·forget·요청한 줄만·Meshy로 요청한 줄만, toGlb에 넘어온 값도 적는다 */
function asMeshy(r) {
  const forgot = [];
  const asked = [];
  const toGlb = r.service.toGlb;
  Object.assign(r.service, {
    maker: 'meshy-7.1', leaseSec: 1200, maxBad: 2, requestedOnly: true, consent: 'meshy',
    async forget(id) { forgot.push(id); },
    async toGlb(png, opts) { asked.push(opts); return toGlb(png, opts); },
  });
  return Object.assign(r, { forgot, asked });
}

test('제공자의 값: 임대(meshy 20분)로 잡고, 만든 이름을 적고, 그림 id와 결과 탓 횟수를 넘기고, 끝난 그림은 forget으로 알린다', async () => {
  const r = asMeshy(rig());
  assert.deepEqual(await processModel(r), { outcome: 'ready', id: ID });
  assert.deepEqual(r.calls.at(0), ['claim', 'w1', 1200]);
  assert.deepEqual(r.calls.at(-1), ['settle', 'ready', 'meshy-7.1']);
  assert.deepEqual([r.asked.map((o) => ({ seed: o.seed, key: o.key, badFails: o.badFails })), r.forgot], [[{ seed: 1, key: ID, badFails: 0 }], [ID]]);
  assert.equal(typeof r.asked[0].onJob, 'function', '값이 든 작업을 알릴 길도 넘긴다');
  // 결과 탓 실패는 한 번만 다시(두 번째에서 failed). 끝난 그림만 forget
  const bad = boom({ code: 'meshy_failed', bad: true });
  const first = asMeshy(rig({ attempts: 1, badFails: 0, made: bad }));
  assert.deepEqual(await processModel(first), { outcome: 'retry', reason: 'meshy_failed', id: ID, trouble: true, down: false });
  assert.deepEqual([first.calls.at(-1), first.forgot], [['release', 120, 'bad'], []]);
  const second = asMeshy(rig({ attempts: 2, badFails: 1, made: bad }));
  assert.deepEqual(await processModel(second), { outcome: 'failed', reason: 'meshy_failed', id: ID, trouble: true });
  assert.deepEqual([second.calls.at(-1), second.forgot, second.asked[0].badFails], [['settle', 'failed', 'meshy_failed'], [ID], 1]);
  // 지워진 그림(정리가 false)도 forget, 서비스 쪽 사정으로 돌려놓을 때는 하지 않는다(다음에 이어 본다)
  const gone = asMeshy(rig({ settleOk: false }));
  assert.equal((await processModel(gone)).outcome, 'gone');
  assert.deepEqual(gone.forgot, [ID]);
  const waiting = asMeshy(rig({ made: boom({ code: 'timeout' }) }));
  assert.equal((await processModel(waiting)).outcome, 'retry');
  assert.deepEqual(waiting.forgot, []);
  // forget이 던져도 정리는 끝난다
  const noisy = asMeshy(rig());
  noisy.service.forget = async () => { throw new Error('disk'); };
  assert.equal((await processModel(noisy)).outcome, 'ready');
  // 10분이 걸려도 meshy 임대(20분) 안이라 물러나지 않는다. trellis(10분)였으면 물러난다
  const slowMeshy = asMeshy(rig({ clock: { t: 0, step: 600_000 } }));
  assert.equal((await processModel(slowMeshy)).outcome, 'ready');
  const slowTrellis = rig({ clock: { t: 0, step: 600_000 } });
  assert.equal((await processModel(slowTrellis)).outcome, 'late');
  // 이상한 값은 쓰지 않는다(trellis 값으로)
  const odd = rig();
  Object.assign(odd.service, { leaseSec: 30, maxBad: 0 });
  await processModel(odd);
  assert.deepEqual(odd.calls[0], ['claim', 'w1', MODELS_LEASE_SECONDS]);
});

test('제공자 이름: 비었으면 trellis(지금 운영 그대로), trellis·meshy는 대소문자·빈칸 무시, 모르는 이름은 null', () => {
  assert.deepEqual(MODEL_PROVIDERS, ['trellis', 'meshy']);
  assert.deepEqual([undefined, '', '  ', 'trellis', ' MESHY ', 'Meshy', 'tripo', 'meshy7'].map(modelProviderOf),
    ['trellis', 'trellis', 'trellis', 'trellis', 'meshy', 'meshy', null, null]);
});

test('사이트와 일꾼이 같은 AVATAR_MODEL_PROVIDER 값을 읽으면 사이트가 덜 알리지 않는다: 일꾼이 바깥(meshy)으로 보내는 값이면 사이트도 바깥이라고 알린다', () => {
  const values = [undefined, '', '  ', 'meshy', 'MESHY', ' Meshy ', 'trellis', ' TRELLIS ', 'Trellis', 'tripo', 'meshy7', 'trellis2'];
  const pairs = values.map((v) => [modelProviderOf(v), readModelProvider(v)]);
  for (const [i, [worker, site]] of pairs.entries()) {
    if (worker === 'meshy') assert.equal(site, 'meshy', `일꾼이 Meshy로 보내는 값(${values[i]})이면 사이트도 Meshy라고 알린다`);
    if (site === 'trellis') assert.equal(worker, 'trellis', `사이트가 우리 컴퓨터라고 알리는 값(${values[i]})이면 일꾼도 trellis`);
  }
  // 둘이 다른 것은 비었거나 모르는 값뿐이고, 그때 사이트는 더 알리는 쪽(meshy)이다(일꾼은 trellis로 돌거나 3D만 끈다)
  assert.deepEqual(pairs, [
    ['trellis', 'meshy'], ['trellis', 'meshy'], ['trellis', 'meshy'],
    ['meshy', 'meshy'], ['meshy', 'meshy'], ['meshy', 'meshy'],
    ['trellis', 'trellis'], ['trellis', 'trellis'], ['trellis', 'trellis'],
    [null, 'meshy'], [null, 'meshy'], [null, 'meshy'],
  ]);
});

// ───────── 바깥 3D 서비스는 사람이 요청한 그림만(0021의 잡기가 요청한 때를 싣는다)
test('요청한 줄만: 바깥 3D 서비스(requestedOnly)는 요청한 때가 없는 줄(0021 전의 잡기)을 받지도 보내지도 않고 바로 돌려놓은 뒤 halt', async () => {
  const old = (extra = {}) => ({ id: ID, user_id: UID, image_path: CHAR, attempts: 1, bad_fails: 0, ...extra });
  for (const extra of [{}, { requested_at: null }, { requested_at: '' }, { requested_at: 'nope' }, { requested_at: 1_794_452_400_000 }]) {
    const logs = [];
    const r = asMeshy(rig({ job: old(extra) }));
    const v = await processModel({ ...r, log: (level, msg) => logs.push([level, msg]) });
    assert.deepEqual(v, { outcome: 'unrequested', id: ID, trouble: true, halt: true }, JSON.stringify(extra));
    assert.deepEqual(r.calls, [['claim', 'w1', 1200], ['release', 0]], '그림을 받지 않고, 결과 탓으로 세지 않고 바로 돌려놓는다');
    assert.deepEqual([r.seeds, r.asked, r.forgot], [[], [], []], '서비스에 보내지 않는다');
    assert.ok(logs.some((l) => l[0] === 'warn' && l[1].startsWith('model job was not requested')));
  }
  // 돌려놓기가 던져도 보내지 않고 멈춘다
  const noisy = asMeshy(rig({ job: old() }));
  noisy.db.modelRelease = async () => { throw new Error('db down'); };
  assert.equal((await processModel(noisy)).halt, true);
  assert.deepEqual(noisy.seeds, []);
  // 요청한 때가 있으면 그대로 보낸다
  const ok = asMeshy(rig());
  assert.deepEqual(await processModel(ok), { outcome: 'ready', id: ID });
  assert.deepEqual(ok.asked.map((o) => ({ seed: o.seed, key: o.key, badFails: o.badFails })), [{ seed: 1, key: ID, badFails: 0 }]);
  // 우리 컴퓨터(trellis)는 요청한 때를 보지 않는다(0021 전의 DB에서도 지금처럼 돈다)
  assert.deepEqual(await processModel(rig({ job: old() })), { outcome: 'ready', id: ID });
  // 요청한 때 읽기: jsonb의 timestamptz 문자열만
  assert.deepEqual([REQUESTED, '2026-11-12T12:00:00+09:00', '', 'x', null, 0, undefined].map((v) => wasRequested({ requested_at: v })),
    [true, true, false, false, false, false, false]);
  assert.equal(wasRequested(null), false);
});

test('요청한 곳: 바깥 3D 서비스(consent meshy)는 Meshy로 보낸다고 알리고 받은 줄만 보낸다. 아니면 받지도 보내지도 않고 reconsent로 적는다', async () => {
  const asked = (via) => ({ id: ID, user_id: UID, image_path: CHAR, attempts: 1, bad_fails: 0, requested_at: REQUESTED, via });
  for (const via of ['trellis', null, undefined, '', 'MESHY']) {
    const logs = [];
    const r = asMeshy(rig({ job: asked(via) }));
    const v = await processModel({ ...r, log: (level, msg) => logs.push([level, msg]) });
    assert.deepEqual(v, { outcome: 'failed', reason: 'reconsent', id: ID, trouble: false }, String(via));
    assert.deepEqual(r.calls, [['claim', 'w1', 1200], ['settle', 'failed', 'reconsent']], '그림을 받지 않는다');
    assert.deepEqual([r.seeds, r.asked, r.forgot, r.settledBy], [[], [], [], ['w1']], '서비스에 보내지 않는다');
    assert.ok(logs.some((l) => l[0] === 'warn' && l[1].includes('reconsent')));
  }
  // Meshy로 요청한 줄은 보낸다
  const ok = asMeshy(rig({ job: asked('meshy') }));
  assert.deepEqual(await processModel(ok), { outcome: 'ready', id: ID });
  // 요청한 때가 없는 줄(0021 전의 DB)은 그보다 먼저 멈춘다(실패로 적지 않는다)
  const old = asMeshy(rig({ job: { id: ID, user_id: UID, image_path: CHAR, attempts: 1, bad_fails: 0 } }));
  assert.equal((await processModel(old)).halt, true);
  assert.equal(old.calls.some((c) => c[0] === 'settle'), false);
  // 우리 컴퓨터(trellis, consent 없음)는 잡은 줄을 그대로 만든다(0021의 잡기가 이미 우리 컴퓨터로 요청한 줄만 준다.
  // 제공자를 거르지 않는 옛 잡기에서도 바깥으로는 보내지 않는다)
  for (const via of ['meshy', 'trellis', null]) assert.deepEqual(await processModel(rig({ job: asked(via) })), { outcome: 'ready', id: ID });
});

test('잡기에 제공자를 넘긴다: 바깥 3D 서비스는 consent(meshy), 이름만 있으면 그 이름, 없으면 trellis(0021의 잡기가 그곳으로 요청한 줄만 준다)', async () => {
  const viaOf = async (service) => {
    const r = rig({ job: null });
    const seen = [];
    r.db.modelClaim = async (worker, lease, via) => { seen.push([worker, lease, via]); return null; };
    assert.deepEqual(await processModel({ ...r, service: { ...r.service, ...service } }), { outcome: 'idle' });
    return seen;
  };
  assert.deepEqual(await viaOf({ name: 'meshy', consent: 'meshy', leaseSec: 1200 }), [['w1', 1200, 'meshy']]);
  assert.deepEqual(await viaOf({ name: 'meshy' }), [['w1', 600, 'meshy']]);
  assert.deepEqual(await viaOf({}), [['w1', 600, 'trellis']], '이름 없는 우리 컴퓨터 어댑터(createModelService)');
  assert.deepEqual(await viaOf({ name: 'Bad Name!' }), [['w1', 600, 'trellis']]);
});

test('값이 든 작업 알리기: 서비스가 onJob을 부르면 DB(modelJob)에 그 그림을 알린다(한 번 더 해 보고, 안 되면 경고만 하고 잇는다)', async () => {
  // 서비스가 작업을 만들었다고 알리면 DB에 그 그림 id로
  const r = asMeshy(rig({ made: undefined }));
  const told = [];
  r.db.modelJob = async (id) => { told.push(id); return true; };
  const toGlb = r.service.toGlb;
  r.service.toGlb = async (png, opts) => { await opts.onJob(); return toGlb(png, opts); };
  assert.deepEqual(await processModel(r), { outcome: 'ready', id: ID });
  assert.deepEqual(told, [ID]);
  // DB가 잠깐 안 되면 한 번 더, 그래도 안 되면 경고만 남기고 만들기는 잇는다
  const flaky = asMeshy(rig({}));
  let tries = 0;
  flaky.db.modelJob = async () => { tries += 1; throw new Error('db down'); };
  const ft = flaky.service.toGlb;
  flaky.service.toGlb = async (png, opts) => { await opts.onJob(); return ft(png, opts); };
  const logs = [];
  assert.deepEqual(await processModel({ ...flaky, log: (level, msg) => logs.push([level, msg]) }), { outcome: 'ready', id: ID });
  assert.equal(tries, 2);
  assert.ok(logs.some((l) => l[0] === 'warn' && l[1].startsWith('model job not recorded')));
  // 옛 DB 어댑터(modelJob 없음)면 건너뛴다
  const old = asMeshy(rig({}));
  const ot = old.service.toGlb;
  old.service.toGlb = async (png, opts) => { await opts.onJob(); return ot(png, opts); };
  assert.deepEqual(await processModel(old), { outcome: 'ready', id: ID });
});

test('받은 그대로의 GLB(raw): keepRaw로 그 서비스 쪽 사본을 지우기(forget) 전에 넘긴다. 실패해도 만들기는 그대로', async () => {
  const raw = new Uint8Array([7, 7, 7]);
  const order = [];
  const r = asMeshy(rig({ made: () => ({ glb: serviceGlb(), stats: { task: 'task-1' }, raw }) }));
  const forget = r.service.forget;
  r.service.forget = async (id) => { order.push('forget'); return forget(id); };
  const keepRaw = async (x) => { order.push(['raw', x.id, x.uid, x.raw.length, x.stats.task]); };
  assert.deepEqual(await processModel({ ...r, keepRaw }), { outcome: 'ready', id: ID });
  assert.deepEqual(order, [['raw', ID, UID, 3, 'task-1'], 'forget']);
  // raw가 없는 서비스(우리 컴퓨터)는 부르지 않는다
  const plain = rig({});
  const none = [];
  assert.deepEqual(await processModel({ ...plain, keepRaw: async () => { none.push(1); } }), { outcome: 'ready', id: ID });
  assert.deepEqual(none, []);
  // 넘기다 실패해도 올리고 ready
  const bad = asMeshy(rig({ made: () => ({ glb: serviceGlb(), stats: null, raw }) }));
  const logs = [];
  assert.deepEqual(await processModel({ ...bad, keepRaw: async () => { throw new Error('disk full'); }, log: (l, m) => logs.push(m) }),
    { outcome: 'ready', id: ID });
  assert.ok(logs.includes('model raw not kept'));
});

// ───────── 차례: 서비스가 꺼져 있으면 잡지 않는다
function turnRig({ up = [true], results = [] } = {}) {
  const clock = { t: 0 };
  const logs = [];
  let asked = 0;
  let ran = 0;
  const turn = createModelsTurn({
    ready: async () => {
      const v = up[Math.min(asked, up.length - 1)];
      asked += 1;
      if (v instanceof Error) throw v;
      return v;
    },
    run: async () => {
      const v = results[Math.min(ran, results.length - 1)] ?? { outcome: 'idle' };
      ran += 1;
      if (v instanceof Error) throw v;
      return v;
    },
    log: (level, msg, extra) => logs.push([level, msg, extra]),
    now: () => clock.t,
  });
  return { turn, clock, logs, get asked() { return asked; }, get ran() { return ran; } };
}

test('차례: 서비스가 꺼져 있으면 줄을 잡지 않고 1분 뒤, 그 뒤로는 2분마다 다시 본다. 돌아오면 바로 잇는다', async () => {
  const r = turnRig({ up: [false, false, new Error('ECONNREFUSED'), false, false, false, false, true], results: [{ outcome: 'ready', id: ID }] });
  // 10초씩 시계를 옮기며 차례를 부르고, 서비스를 물은 때를 적는다
  const askedAt = [];
  for (let guard = 0; guard < 10_000; guard++) {
    const before = r.asked;
    const worked = await r.turn();
    if (r.asked > before) askedAt.push(r.clock.t);
    if (worked) break;
    assert.equal(r.ran, 0, '꺼져 있는 동안은 잡지 않는다(잡은 횟수를 쓰지 않고 실패로 굳히지도 않는다)');
    r.clock.t += 10_000;
  }
  const gaps = askedAt.slice(1).map((t, i) => (t - askedAt[i]) / 60_000);
  assert.deepEqual(gaps, [1, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(MODELS_DOWN_REST_MS, [60_000, 2 * 60_000]);
  assert.equal(r.ran, 1, '돌아오자 바로 한 건');
  // 꺼진 동안 기록은 처음과 여섯 번째마다만, 돌아오면 한 줄
  assert.deepEqual(r.logs.map((l) => l[1]).filter((m) => m.startsWith('model service')),
    ['model service down: waiting', 'model service down: waiting', 'model service back']);
  // 차례를 10초마다 불러도 꺼진 한 시간 동안 /health는 서른한 번(처음, 1분 뒤, 그 뒤 2분마다), 기록은 처음과 12분마다 여섯 줄. 줄은 잡지 않는다
  const hour = turnRig({ up: [false] });
  for (let t = 0; t <= 60 * 60_000; t += 10_000) {
    hour.clock.t = t;
    assert.equal(await hour.turn(), false);
  }
  assert.deepEqual([hour.asked, hour.ran], [31, 0]);
  assert.equal(hour.logs.filter((l) => l[1] === 'model service down: waiting').length, 6);
});

test('차례: 서비스가 살아 있으면 1분 동안은 다시 묻지 않고, 한 건 만들면 잠깐 쉬고 잇는다. 일하다 끊기면 서비스부터 다시 본다', async () => {
  const r = turnRig({ up: [true], results: [{ outcome: 'ready', id: ID }, { outcome: 'idle' }, { outcome: 'idle' }] });
  assert.equal(await r.turn(), true);
  assert.equal(await r.turn(), false, '쉬는 중');
  assert.equal(r.turn.restLeft(), MODELS_GAP_MS, '고리는 남은 쉬는 시간만 잔다(한가할 때 쉬는 시간이 아니라)');
  r.clock.t += MODELS_GAP_MS;
  assert.equal(r.turn.restLeft(), 0);
  assert.equal(await r.turn(), false, '할 일이 없다');
  r.clock.t += 10_000;
  assert.equal(await r.turn(), false);
  assert.deepEqual([r.asked, r.ran], [1, 3], '서비스는 한 번만 물었다');
  r.clock.t += MODELS_HEALTH_TTL_MS;
  await r.turn();
  assert.equal(r.asked, 2, '1분이 지나면 다시 묻는다');

  const cut = turnRig({ up: [true, false], results: [{ outcome: 'retry', reason: 'service_down', id: ID, trouble: true, down: true }] });
  assert.equal(await cut.turn(), true);
  cut.clock.t += 60_000; // 실패로 1분 쉰 뒤
  assert.equal(await cut.turn(), false);
  assert.deepEqual([cut.asked, cut.ran], [2, 1], '서비스부터 다시 보고, 꺼져 있으니 잡지 않는다');
});

test('차례: 실패가 이어지면 1분에서 두 배씩(끝은 한 시간) 쉬고, 한 건 만들면 처음으로. run이 던져도 받는다', async () => {
  const trouble = { outcome: 'retry', reason: 'bad_output', id: ID, trouble: true };
  const r = turnRig({ results: [trouble, trouble, new Error('db down'), { outcome: 'ready', id: ID }, trouble] });
  const rest = async () => {
    const t = r.clock.t;
    let n = 0;
    while (!(await r.turn())) {
      r.clock.t += 60_000;
      if (++n > 200) throw new Error('never ran');
    }
    return Math.round((r.clock.t - t) / 60_000);
  };
  assert.equal(await r.turn(), true);
  assert.deepEqual([await rest(), await rest(), await rest(), await rest()], [1, 2, 4, 1], '실패 셋 뒤 한 건을 만들면 처음으로');
  assert.ok(r.logs.some((l) => l[1] === 'models error' && l[2].message === 'db down'));
  assert.equal(MODELS_REST_MAX_MS, 3_600_000);
});

test('차례: run이 halt를 돌려주면(요청하지 않은 줄이 바깥 3D 서비스에 왔다) 3D 모형을 멈춘다. 그 뒤로는 서비스도 줄도 묻지 않는다', async () => {
  const r = turnRig({ results: [{ outcome: 'unrequested', id: ID, trouble: true, halt: true }, { outcome: 'ready', id: ID }] });
  assert.equal(r.turn.halted(), false);
  assert.equal(await r.turn(), false);
  assert.equal(r.turn.halted(), true);
  assert.deepEqual(r.logs.filter((l) => l[1] === 'models halted until restart').map((l) => l[2]), [{ outcome: 'unrequested' }]);
  for (let k = 0; k < 5; k++) {
    r.clock.t += MODELS_REST_MAX_MS;
    assert.equal(await r.turn(), false);
  }
  assert.deepEqual([r.asked, r.ran], [1, 1], '쉬기와 달리 시간이 지나도 다시 하지 않는다(일꾼을 다시 띄울 때까지)');
  assert.equal(r.logs.some((l) => l[1] === 'models resting'), false);
});

// ───────── 3D 서비스 어댑터
function fakeFetch(answers) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', type: init.headers?.['Content-Type'], body: init.body, signal: init.signal });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return a;
  };
  return { f, calls };
}

test('3D 서비스: /health의 loaded가 참일 때만 준비된 것. 닿지 않거나 이상한 답은 아니다', async () => {
  const { f, calls } = fakeFetch([
    Response.json({ loaded: true, gpu: 'x' }), Response.json({ loaded: false }), new Response('no', { status: 503 }),
    new TypeError('fetch failed'), new Response('not json'),
  ]);
  const s = createModelService({ baseUrl: 'http://127.0.0.1:7860/', fetch: f });
  assert.deepEqual([await s.ready(), await s.ready(), await s.ready(), await s.ready(), await s.ready()], [true, false, false, false, false]);
  assert.equal(calls[0].url, 'http://127.0.0.1:7860/health');
  assert.ok(calls[0].signal instanceof AbortSignal, '시간 제한이 있다');
  assert.equal(createModelService().baseUrl, DEFAULT_MODEL_URL);
  assert.equal(DEFAULT_MODEL_URL, 'http://127.0.0.1:17860');
});

test('3D 서비스: PNG를 그대로 보내 GLB와 측정값을 받는다(seed, meshopt). 실패는 까닭을 붙여 던진다', async () => {
  const glb = serviceGlb();
  const stats = JSON.stringify({ total_s: 18.5, tris: 9118, bytes: glb.length, seed: 2, front_applied: true, gpu_secret: 'x', nested: { a: 1 } });
  const { f, calls } = fakeFetch([
    new Response(glb, { headers: { 'content-type': 'model/gltf-binary', 'x-avatar3d-stats': stats } }),
    new Response('bad', { status: 422 }), new Response('bad', { status: 400 }), new Response('oops', { status: 500 }),
    new Response('gateway', { status: 502 }), new Response('busy', { status: 503 }),
    Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
    Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    new Response(new Uint8Array(16), { headers: { 'content-length': String(MAX_MODEL_BYTES + 1) } }),
  ]);
  const s = createModelService({ baseUrl: 'http://127.0.0.1:7860', fetch: f });
  const ok = await s.toGlb(PNG, { seed: 2 });
  assert.deepEqual([ok.glb.length, ok.stats], [glb.length, { total_s: 18.5, tris: 9118, bytes: glb.length, seed: 2, front_applied: true }]);
  assert.deepEqual([calls[0].url, calls[0].method, calls[0].type, calls[0].body], [
    'http://127.0.0.1:7860/to3d?seed=2&compress=meshopt', 'POST', 'image/png', PNG]);
  const why = async () => s.toGlb(PNG, { seed: 1 }).then(() => null, (e) => ({
    code: e.code, permanent: e.permanent === true, bad: e.bad === true, down: e.down === true,
  }));
  assert.deepEqual(await why(), { code: 'bad_input', permanent: true, bad: false, down: false });
  assert.deepEqual(await why(), { code: 'bad_input', permanent: true, bad: false, down: false });
  assert.deepEqual(await why(), { code: 'service_failed', permanent: false, bad: true, down: false });
  assert.deepEqual(await why(), { code: 'service_down', permanent: false, bad: false, down: true });
  assert.deepEqual(await why(), { code: 'service_down', permanent: false, bad: false, down: true });
  assert.deepEqual(await why(), { code: 'service_down', permanent: false, bad: false, down: true });
  assert.deepEqual(await why(), { code: 'timeout', permanent: false, bad: false, down: false });
  assert.deepEqual(await why(), { code: 'too_big', permanent: false, bad: true, down: false });
  // seed가 이상하면 1
  const one = fakeFetch([new Response(glb)]);
  await createModelService({ fetch: one.f }).toGlb(PNG, { seed: 0 });
  assert.match(one.calls[0].url, /\/to3d\?seed=1&compress=meshopt$/);
});

test('측정값 읽기: 숫자·참거짓만 골라 남기고, 모양이 이상하면 null', () => {
  assert.deepEqual(readStats(JSON.stringify({ total_s: 1, tris: 2, front_applied: false, yaw_fix: 0, path: '/x', seed: '3' })),
    { total_s: 1, tris: 2, front_applied: false, yaw_fix: 0 });
  for (const bad of [null, '', 'not json', '[]', '1', 'x'.repeat(20_001)]) assert.equal(readStats(bad), null, String(bad).slice(0, 20));
});
