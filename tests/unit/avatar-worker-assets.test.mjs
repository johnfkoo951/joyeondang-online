// 원본 에셋 남기기(worker/avatar/assets.mjs): 보관 폴더 고르기(이 저장소 밖 절대 경로만), 그림 단계(drawing.png·draw.json),
// 3D 단계(meshy: 받은 그대로의 GLB·작업 기록·다듬기 전후, trellis: 서비스 수치)와 올린 GLB, 실패한 시도의 기록,
// 지운 캐릭터 따라 지우기, 쓰기 실패가 그림·3D 만들기를 막지 않는지, 원본 사진·키·서명된 주소가 남지 않는지.
// 진짜 임시 폴더에 쓴다(끝나면 지운다).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ASSET_FILES, ASSET_SCHEMA, ATTEMPTS_KEPT, REPO_ROOT, archiveDirOf, createAssetArchive, openAssetArchive,
} from '../../worker/avatar/assets.mjs';
import { processOne } from '../../worker/avatar/core.mjs';
import { createMeshyService, meshyOptions, meshySettings } from '../../worker/avatar/meshy.mjs';
import { DEFAULT_MODEL_MAKER, processModel } from '../../worker/avatar/models.mjs';
import { visionSummary } from '../../worker/avatar/proxy.mjs';
import { wrapSupabase } from '../../worker/avatar/supabase.mjs';
import { serviceGlb } from './helpers/glb-fixture.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'jy-assets-'));
after(() => rmSync(ROOT, { recursive: true, force: true }));
let made = 0;
/** 새 보관 폴더 자리(만들지 않은 채로) */
const spot = () => join(ROOT, `archive-${++made}`);
/** 새 보관 폴더(만든 채로) */
const folderNow = () => {
  const d = spot();
  mkdirSync(d, { mode: 0o700 });
  return d;
};

const UID = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const ORIG = `${UID}/originals/${ID}.jpg`;
const CHAR = `${UID}/chars/${ID}.png`;
const GLB_PATH = `${UID}/models/${ID}.v1.glb`;
const KEY = 'msy_TEST0secret0key0for0assets0only';
/** 원본 사진(JPEG 머리 + 알아볼 표시). 보관 폴더 어디에도 이 바이트가 있으면 안 된다 */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0x4f, 0x52, 0x49, 0x47, 0x49, 0x4e, 0x41, 0x4c]);
const CHAR_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0, 0, 0, 6, 0, 8, 6, 0, 0, 0]);
const NOON = Date.UTC(2026, 10, 12, 3, 0, 0);

/** 그리기 모델이 준 그림(머리만): 크기와 투명 여부를 pngInfo가 읽는다 */
function drawnPng(w, h) {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  b[24] = 8;
  b[25] = 6;
  return b;
}
const mode = (p) => statSync(p).mode & 0o777;
const list = (d) => readdirSync(d).sort();
const read = (d, name) => JSON.parse(readFileSync(join(d, name), 'utf8'));
const bytesOf = (d, name) => new Uint8Array(readFileSync(join(d, name)));
/** 폴더의 모든 파일 내용을 글로(키·주소·원본 경로가 새지 않았는지 볼 때) */
const allText = (d) => list(d).map((f) => readFileSync(join(d, f)).toString('latin1')).join('\n');
const contains = (hay, needle) => Buffer.from(hay).indexOf(Buffer.from(needle)) >= 0;

// ───────── 보관 폴더 고르기
test('보관 폴더: 비었으면 끄고(알리지 않는다), 상대 경로·이 저장소 안·저장소로 가는 링크·쓸 수 없는 자리는 경고 뒤 끈다. 폴더는 700', async () => {
  assert.deepEqual(archiveDirOf(undefined), { dir: null, why: 'unset' });
  assert.deepEqual(archiveDirOf('   '), { dir: null, why: 'unset' });
  assert.deepEqual(archiveDirOf('assets/here'), { dir: null, why: 'not_absolute' });
  assert.deepEqual(archiveDirOf(REPO_ROOT), { dir: null, why: 'inside_repo' });
  assert.deepEqual(archiveDirOf(join(REPO_ROOT, 'worker', 'avatar', 'state', 'assets')), { dir: null, why: 'inside_repo' });
  const dir = spot();
  assert.deepEqual(archiveDirOf(dir), { dir, why: null });
  const logs = [];
  const log = (level, msg) => logs.push([level, msg]);
  assert.equal(await openAssetArchive({ env: {}, log }), null);
  assert.deepEqual(logs, [], '꺼 둔 것은 알리지 않는다');
  assert.equal(await openAssetArchive({ env: { AVATAR_ASSET_ARCHIVE_DIR: 'rel/dir' }, log }), null);
  const link = join(ROOT, 'to-repo');
  symlinkSync(join(REPO_ROOT, 'worker'), link);
  assert.equal(await openAssetArchive({ env: { AVATAR_ASSET_ARCHIVE_DIR: link }, log }), null, '링크를 따라가 저장소 안이면 끈다');
  const file = join(ROOT, 'plain-file');
  writeFileSync(file, 'x');
  assert.equal(await openAssetArchive({ env: { AVATAR_ASSET_ARCHIVE_DIR: join(file, 'sub') }, log }), null);
  assert.deepEqual(logs.map((l) => l[1]), [
    'asset archive off: not_absolute', 'asset archive off: inside_repo', 'asset archive off: folder not usable',
  ]);
  assert.ok(logs.every((l) => l[0] === 'warn'));
  const a = await openAssetArchive({ env: { AVATAR_ASSET_ARCHIVE_DIR: dir }, log });
  assert.ok(a && typeof a.drawing === 'function');
  assert.equal(mode(dir), 0o700, '없던 폴더를 700으로 만든다');
});

// ───────── 그림 단계
function drawRig({ settleOk = true, verdict, keepAssets, draw } = {}) {
  const files = new Map([[ORIG, JPEG]]);
  let job = { id: ID, user_id: UID, original_path: ORIG, attempts: 1, give_up: false };
  const logs = [];
  let t = NOON;
  return {
    files, logs, keepAssets,
    db: {
      claim: async () => { const j = job; job = null; return j; },
      release: async () => true,
      settle: async () => settleOk,
    },
    store: {
      download: async (p) => files.get(p),
      upload: async (p, b) => { files.set(p, b); },
      remove: async (ps) => { for (const p of ps) files.delete(p); },
    },
    proxy: {
      visionModel: 'gpt-6-luna',
      check: async () => verdict ?? { ok: true, summary: { person_count: 1, photo_of_person: true, likely_under14: false, uncertain: false } },
      draw: draw ?? (async () => ({
        png: drawnPng(1024, 1536), model: 'gpt-image-2.6-flare',
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, input_tokens_details: { image_tokens: 5 } },
      })),
    },
    worker: 'w1',
    log: (level, msg, extra) => logs.push([level, msg, extra]),
    // 부를 때마다 0.5초씩 간다
    now: () => (t += 500),
  };
}

test('그림 단계: ready로 적은 뒤 올린 그림(같은 바이트)과 기록(모델, 걸린 시간, 판독 요약)을 남긴다. 원본 사진은 남기지 않는다. 파일 600', async () => {
  const dir = folderNow();
  const a = createAssetArchive({ dir, worker: 'w1', version: 'avatar-worker-test', now: () => NOON });
  const r = drawRig({ keepAssets: (x) => a.drawing(x) });
  assert.equal((await processOne(r)).outcome, 'ready');
  const at = join(dir, ID);
  assert.deepEqual(list(at), [ASSET_FILES.draw, ASSET_FILES.drawing]);
  assert.deepEqual(bytesOf(at, ASSET_FILES.drawing), r.files.get(CHAR), '올린 캐릭터 그림과 같은 바이트');
  const drawing = bytesOf(at, ASSET_FILES.drawing);
  assert.deepEqual(read(at, ASSET_FILES.draw), {
    schema: ASSET_SCHEMA, character_id: ID, user_id: UID, stage: 'drawing', written_at: new Date(NOON).toISOString(),
    worker: 'w1', worker_version: 'avatar-worker-test', attempt: 1, vision_model: 'gpt-6-luna', image_model: 'gpt-image-2.6-flare',
    check: { ok: true, person_count: 1, photo_of_person: true, likely_under14: false, uncertain: false },
    seconds: { download: 0.5, check: 0.5, draw: 0.5, upload: 0.5, total: 2.5 },
    image: { width: 1024, height: 1536, fitted_from: null },
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    file: { name: ASSET_FILES.drawing, bytes: drawing.length, sha256: (await import('node:crypto')).createHash('sha256').update(drawing).digest('hex') },
  });
  // 원본 사진: 파일도, 바이트도, 경로도 없다
  for (const f of list(at)) assert.equal(contains(readFileSync(join(at, f)), JPEG), false, f);
  assert.equal(allText(at).includes('originals'), false);
  assert.equal(mode(at), 0o700);
  for (const f of list(at)) assert.equal(mode(join(at, f)), 0o600, f);
  assert.deepEqual(list(dir), [ID], '임시 파일이 남지 않는다');
});

test('그림 단계: 거절된 사진, 그리는 사이 지운 그림은 남기지 않는다. 남기기가 실패해도(던져도) 그리기는 ready', async () => {
  const dir = folderNow();
  const a = createAssetArchive({ dir });
  const rejected = drawRig({ verdict: { ok: false, reason: 'child', summary: { person_count: 1 } }, keepAssets: (x) => a.drawing(x) });
  assert.equal((await processOne(rejected)).outcome, 'rejected');
  const gone = drawRig({ settleOk: false, keepAssets: (x) => a.drawing(x) });
  assert.equal((await processOne(gone)).outcome, 'gone');
  assert.deepEqual(list(dir), [], '보관 폴더에 아무것도 없다');
  const boom = drawRig({ keepAssets: async () => { throw new Error('disk full'); } });
  assert.equal((await processOne(boom)).outcome, 'ready');
  assert.ok(boom.logs.some((l) => l[0] === 'warn' && l[1] === 'drawing assets not kept'));
  // 쓸 수 없는 보관 폴더(그 자리에 파일): 경고 한 줄, 그리기는 ready
  const blocked = join(ROOT, 'blocked-file');
  writeFileSync(blocked, 'x');
  const logs = [];
  const b = createAssetArchive({ dir: blocked, log: (level, msg) => logs.push([level, msg]) });
  assert.equal((await processOne(drawRig({ keepAssets: (x) => b.drawing(x) }))).outcome, 'ready');
  assert.deepEqual(logs, [['warn', 'asset archive: drawing not written']]);
  // 크기를 맞춘 그림이면 처음 크기를 적는다
  const fitDir = folderNow();
  const c = createAssetArchive({ dir: fitDir });
  const image = {
    decode: async () => ({ data: new Uint8Array(1064 * 1478 * 4), w: 1064, h: 1478 }),
    resize: async (img, w, h) => ({ data: new Uint8Array(w * h * 4), w, h }),
    encodePng: async () => drawnPng(1024, 1536),
  };
  const fitted = drawRig({ keepAssets: (x) => c.drawing(x), draw: async () => ({ png: drawnPng(1064, 1478), model: 'm' }) });
  assert.equal((await processOne({ ...fitted, image })).outcome, 'ready');
  assert.deepEqual(read(join(fitDir, ID), ASSET_FILES.draw).image, { width: 1024, height: 1536, fitted_from: '1064x1478' });
  assert.equal(read(join(fitDir, ID), ASSET_FILES.draw).usage, null);
});

// ───────── 3D 단계(meshy)
const CREATED = Date.UTC(2026, 10, 12, 2, 59, 0);
/** 가짜 Meshy: 작업 id마다 묻기 답(차례로, 마지막은 되풀이)과 받을 GLB. calls에 차례로 적는다(DELETE 때 보관 폴더에 원본이 있었는지도) */
function fakeMeshy(tasks, { rawPath } = {}) {
  const order = Object.keys(tasks);
  let created = 0;
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    calls.push(`${method} ${u.host}${u.pathname}${method === 'DELETE' && rawPath ? ` raw:${existsSync(rawPath())}` : ''}`);
    if (u.host === 'assets.meshy.ai') return new Response(tasks[u.pathname.split('/')[1]].raw);
    if (method === 'POST') return Response.json({ result: order[created++] }, { status: 202 });
    if (method === 'DELETE') return new Response(null, { status: 200 });
    const q = tasks[decodeURIComponent(u.pathname.split('/').pop())].polls;
    return Response.json(q.length > 1 ? q.shift() : q[0]);
  };
  return { fetch, calls };
}
const polls = (task, raw) => ({
  raw,
  polls: [
    { id: task, status: 'PENDING', progress: 0 },
    { id: task, status: 'IN_PROGRESS', progress: 40 },
    {
      id: task, status: 'SUCCEEDED', progress: 100, consumed_credits: 35, created_at: CREATED, started_at: CREATED + 20_000, finished_at: CREATED + 80_000,
      expires_at: CREATED + 3 * 86_400_000,
      model_urls: { glb: `https://assets.meshy.ai/${task}/model.glb?Expires=1700000000&Signature=abc` },
      thumbnail_url: `https://assets.meshy.ai/${task}/preview.png?Signature=def`,
      texture_urls: [{ base_color: `https://assets.meshy.ai/${task}/base.png?Signature=ghi` }],
    },
  ],
});
const TIDY_STATS = {
  raw_bytes: 0, raw_tris: 9000, raw_tex_w: 2048, raw_tex_h: 2048, raw_tex_type: 'png', tris: 9000, simplified: false,
  tex_w: 1024, tex_h: 1024, jpeg_q: 85, bytes: serviceGlb().length,
};

function modelRig({ service, attempts = 1, badFails = 0, settleOk = true, keepRaw, keepAssets }) {
  const files = new Map([[CHAR, CHAR_PNG], [ORIG, JPEG]]);
  const calls = [];
  const logs = [];
  return {
    files, calls, logs, service, keepRaw, keepAssets, worker: 'w1',
    db: {
      async modelClaim() {
        return { id: ID, user_id: UID, image_path: CHAR, attempts, bad_fails: badFails, requested_at: '2026-11-12T02:58:00+00:00', via: 'meshy' };
      },
      async modelJob() { return true; },
      async modelRelease(id, worker, delay, bad) { calls.push(['release', delay, bad]); return true; },
      async modelSettle(id, status) { calls.push(['settle', status]); return settleOk; },
    },
    store: {
      async download(p) { return files.get(p); },
      async upload(p, bytes) { files.set(p, bytes); },
      async remove(ps) { for (const p of ps) files.delete(p); },
    },
    sleep: async () => {},
    log: (level, msg, extra) => logs.push([level, msg, extra]),
  };
}
const hooks = (a) => ({ keepRaw: (x) => a.modelRaw(x), keepAssets: (x) => a.modelEnd(x) });

test('3D(meshy): 받은 그대로의 GLB를 Meshy에서 지우기 전에 쓰고, 작업 기록·다듬기 전후·올린 GLB를 남긴다. 키·서명된 주소는 없다', async () => {
  const dir = folderNow();
  const at = join(dir, ID);
  const a = createAssetArchive({ dir, worker: 'w1', version: 'avatar-worker-test', now: () => NOON });
  const RAW = new Uint8Array(4096).fill(7);
  const m = fakeMeshy({ 'task-1': polls('task-1', RAW) }, { rawPath: () => join(at, ASSET_FILES.meshyRaw) });
  let clock = NOON;
  const service = createMeshyService({
    apiKey: KEY, fetch: m.fetch, now: () => clock, sleep: async (ms) => { clock += ms; },
    tidy: async (raw) => ({ glb: serviceGlb(), stats: { ...TIDY_STATS, raw_bytes: raw.length } }),
  });
  const r = modelRig({ service, ...hooks(a) });
  assert.deepEqual(await processModel(r), { outcome: 'ready', id: ID });
  assert.deepEqual(list(at), [ASSET_FILES.meshyRaw, ASSET_FILES.meshyTask, ASSET_FILES.model, ASSET_FILES.tidy]);
  assert.deepEqual(bytesOf(at, ASSET_FILES.meshyRaw), RAW, 'Meshy가 준 그대로(면 줄이기 전)');
  assert.deepEqual(bytesOf(at, ASSET_FILES.model), r.files.get(GLB_PATH), '올린 휴대폰용 GLB와 같은 바이트');
  assert.ok(m.calls.includes('DELETE api.meshy.ai/openapi/v1/image-to-3d/task-1 raw:true'), 'Meshy에서 지울 때 원본은 이미 보관 폴더에 있다');
  const task = read(at, ASSET_FILES.meshyTask);
  assert.deepEqual([task.schema, task.character_id, task.user_id, task.provider, task.ai_model], [ASSET_SCHEMA, ID, UID, 'meshy', 'meshy-7.1']);
  assert.deepEqual(task.settings, { ...meshySettings(meshyOptions()), yaw: 0 }, '보낸 설정 그대로');
  assert.equal(task.attempts.length, 1);
  const [one] = task.attempts;
  assert.deepEqual(
    [one.outcome, one.reason, one.task, one.resumed, one.polls, one.credits, one.attempt, one.worker, one.worker_version],
    ['ready', null, 'task-1', false, 3, 35, 1, 'w1', 'avatar-worker-test'],
  );
  assert.equal(typeof one.seconds, 'number');
  assert.deepEqual(one.meshy_times, {
    created_at: new Date(CREATED).toISOString(), started_at: new Date(CREATED + 20_000).toISOString(),
    finished_at: new Date(CREATED + 80_000).toISOString(),
  });
  assert.deepEqual(one.statuses.map((s) => [s.status, s.progress]), [['PENDING', 0], ['IN_PROGRESS', 40], ['SUCCEEDED', 100]]);
  assert.ok(one.statuses.every((s) => typeof s.at === 'string'));
  assert.deepEqual([one.raw.name, one.raw.task, one.raw.bytes], [ASSET_FILES.meshyRaw, 'task-1', RAW.length]);
  const tidy = read(at, ASSET_FILES.tidy);
  assert.deepEqual({ ...tidy, file: undefined, written_at: undefined }, {
    schema: ASSET_SCHEMA, character_id: ID, user_id: UID, written_at: undefined, task: 'task-1', yaw: 0,
    before: { bytes: RAW.length, triangles: 9000, texture: { width: 2048, height: 2048, type: 'png' } },
    after: { bytes: serviceGlb().length, triangles: 9000, texture: { width: 1024, height: 1024, type: 'jpeg', jpeg_quality: 85 } },
    simplified: false,
    check: { bytes: serviceGlb().length, triangles: 9118, height: 1, images: 1 },
    file: undefined,
  });
  assert.deepEqual([tidy.file.name, tidy.file.bytes], [ASSET_FILES.model, serviceGlb().length]);
  // 키, 서명된 주소, 원본 사진은 어디에도 없다
  const text = allText(at);
  for (const leak of [KEY, 'https://', 'Signature', 'Expires', 'originals']) assert.equal(text.includes(leak), false, leak);
  for (const f of list(at)) assert.equal(contains(readFileSync(join(at, f)), JPEG), false, f);
});

test('3D(meshy): 실패한 시도도 기록한다(결과 탓으로 다시, 그다음 새 작업으로 ready). 원본 GLB는 받은 시도의 것', async () => {
  const dir = folderNow();
  const at = join(dir, ID);
  const a = createAssetArchive({ dir, now: () => NOON });
  const RAW2 = new Uint8Array(512).fill(2);
  const m = fakeMeshy({ 'task-1': polls('task-1', new Uint8Array(256).fill(1)), 'task-2': polls('task-2', RAW2) });
  let tidies = 0;
  const service = createMeshyService({
    apiKey: KEY, fetch: m.fetch, sleep: async () => {},
    tidy: async (raw) => {
      tidies += 1;
      if (tidies === 1) throw Object.assign(new Error('2 nodes, 2 parts'), { code: 'glb_parts' });
      return { glb: serviceGlb(), stats: { ...TIDY_STATS, raw_bytes: raw.length } };
    },
  });
  const first = modelRig({ service, attempts: 1, badFails: 0, ...hooks(a) });
  assert.equal((await processModel(first)).outcome, 'retry');
  assert.deepEqual(list(at), [ASSET_FILES.meshyTask], '다듬지 못한 시도: 기록만(원본·모형 없음)');
  const t1 = read(at, ASSET_FILES.meshyTask).attempts;
  assert.deepEqual(t1.map((x) => [x.outcome, x.reason, x.task, x.statuses.length, x.raw]), [['retry', 'glb_parts', 'task-1', 3, null]]);
  const second = modelRig({ service, attempts: 2, badFails: 1, ...hooks(a) });
  assert.equal((await processModel(second)).outcome, 'ready');
  const t2 = read(at, ASSET_FILES.meshyTask).attempts;
  assert.deepEqual(t2.map((x) => [x.outcome, x.reason, x.task, x.attempt]), [['retry', 'glb_parts', 'task-1', 1], ['ready', null, 'task-2', 2]]);
  assert.deepEqual(bytesOf(at, ASSET_FILES.meshyRaw), RAW2);
  assert.equal(read(at, ASSET_FILES.tidy).task, 'task-2');
  // 만들기 전에 끝난 시도(Meshy가 받지 않음)는 작업 없이 까닭만
  const dir2 = folderNow();
  const b = createAssetArchive({ dir: dir2 });
  const refuse = createMeshyService({
    apiKey: KEY, sleep: async () => {}, tidy: async () => { throw new Error('unused'); },
    fetch: async () => Response.json({ message: 'Invalid image' }, { status: 400 }),
  });
  assert.equal((await processModel(modelRig({ service: refuse, ...hooks(b) }))).outcome, 'failed');
  const [only] = read(join(dir2, ID), ASSET_FILES.meshyTask).attempts;
  assert.deepEqual([only.outcome, only.reason, only.task, only.statuses], ['failed', 'meshy_rejected', null, []]);
});

test('3D(meshy): 만드는 사이 본인이 그림을 지웠으면(gone) 방금 쓴 원본까지 그 캐릭터의 보관 폴더를 지운다', async () => {
  const dir = folderNow();
  const a = createAssetArchive({ dir });
  const m = fakeMeshy({ 'task-1': polls('task-1', new Uint8Array(64).fill(9)) });
  const service = createMeshyService({
    apiKey: KEY, fetch: m.fetch, sleep: async () => {}, tidy: async (raw) => ({ glb: serviceGlb(), stats: { ...TIDY_STATS, raw_bytes: raw.length } }),
  });
  const r = modelRig({ service, settleOk: false, ...hooks(a) });
  assert.equal((await processModel(r)).outcome, 'gone');
  assert.deepEqual(list(dir), []);
});

test('3D(trellis): 서비스 수치(X-Avatar3D-Stats)와 올린 GLB만. 받은 그대로의 GLB와 Meshy 기록은 없다', async () => {
  const dir = folderNow();
  const at = join(dir, ID);
  const a = createAssetArchive({ dir, worker: 'w1', version: 'v', now: () => NOON });
  const service = {
    async toGlb() { return { glb: serviceGlb(), stats: { total_s: 18.5, tris: 9118, seed: 1, front_applied: true } }; },
  };
  const r = modelRig({ service, ...hooks(a) });
  assert.deepEqual(await processModel(r), { outcome: 'ready', id: ID });
  assert.deepEqual(list(at), [ASSET_FILES.model, ASSET_FILES.trellisStats]);
  const s = read(at, ASSET_FILES.trellisStats);
  assert.deepEqual({ ...s, file: undefined }, {
    schema: ASSET_SCHEMA, character_id: ID, user_id: UID, written_at: new Date(NOON).toISOString(), worker: 'w1', worker_version: 'v',
    maker: DEFAULT_MODEL_MAKER, attempt: 1, service: { total_s: 18.5, tris: 9118, seed: 1, front_applied: true },
    check: { bytes: serviceGlb().length, triangles: 9118, height: 1, images: 1 }, file: undefined,
  });
  assert.deepEqual(bytesOf(at, ASSET_FILES.model), r.files.get(GLB_PATH));
  // 실패한 trellis 시도는 남길 것이 없다(Meshy 작업 기록이 없다)
  const dir2 = folderNow();
  const b = createAssetArchive({ dir: dir2 });
  const down = { async toGlb() { throw Object.assign(new Error('down'), { code: 'service_down', down: true }); } };
  assert.equal((await processModel(modelRig({ service: down, ...hooks(b) }))).outcome, 'retry');
  assert.deepEqual(list(dir2), []);
});

test('3D: 보관 폴더에 쓰지 못해도(그 자리에 파일) 경고만 남기고 올리고 ready. 서비스를 부르기 전에 끝난 차례는 넘기지 않는다', async () => {
  const blocked = join(ROOT, 'blocked-model');
  writeFileSync(blocked, 'x');
  const logs = [];
  const a = createAssetArchive({ dir: blocked, log: (level, msg) => logs.push([level, msg]) });
  const m = fakeMeshy({ 'task-1': polls('task-1', new Uint8Array(64).fill(3)) });
  const service = createMeshyService({
    apiKey: KEY, fetch: m.fetch, sleep: async () => {}, tidy: async (raw) => ({ glb: serviceGlb(), stats: { ...TIDY_STATS, raw_bytes: raw.length } }),
  });
  const r = modelRig({ service, ...hooks(a) });
  assert.deepEqual(await processModel(r), { outcome: 'ready', id: ID });
  assert.ok(r.files.has(GLB_PATH));
  assert.deepEqual(logs.map((l) => l[1]), ['asset archive: raw model not written', 'asset archive: model not written']);
  // 그림이 PNG가 아니면(bad_char) 서비스를 부르지 않으니 넘기지 않는다
  const seen = [];
  const bad = modelRig({ service, keepAssets: (x) => { seen.push(x.outcome); } });
  bad.files.set(CHAR, JPEG);
  assert.equal((await processModel(bad)).outcome, 'failed');
  assert.deepEqual(seen, []);
});

test('meshy-task.json의 시도는 ATTEMPTS_KEPT까지(오래된 것부터 뺀다). 다른 캐릭터의 기록은 이어 쓰지 않는다', async () => {
  const dir = folderNow();
  const a = createAssetArchive({ dir });
  for (let k = 0; k < ATTEMPTS_KEPT + 3; k++) {
    assert.equal(await a.modelEnd({ id: ID, uid: UID, provider: 'meshy', outcome: 'retry', reason: 'timeout', attempt: k + 1, job: { task: `task-${k}` } }), true);
  }
  const attempts = read(join(dir, ID), ASSET_FILES.meshyTask).attempts;
  assert.equal(attempts.length, ATTEMPTS_KEPT);
  assert.deepEqual([attempts[0].task, attempts.at(-1).task], ['task-3', `task-${ATTEMPTS_KEPT + 2}`]);
  // 모양이 이상한 값은 싣지 않는다(작업 id, 상태, 까닭)
  await a.modelEnd({
    id: ID, uid: UID, provider: 'meshy', outcome: 'retry', reason: 'Not A Reason!',
    job: { task: 'https://evil/x', statuses: [{ at: 1, status: 'pending?', progress: 'x' }], settings: { ai_model: 'meshy-7.1', image_url: 'data:image/png;base64,AAAA' } },
  });
  const last = read(join(dir, ID), ASSET_FILES.meshyTask);
  assert.deepEqual([last.attempts.at(-1).reason, last.attempts.at(-1).task, last.attempts.at(-1).statuses], [null, null, [{ at: new Date(1).toISOString(), status: null, progress: null }]]);
  assert.deepEqual(last.settings, { ai_model: 'meshy-7.1' }, '보낸 그림(data URI)은 설정에 싣지 않는다');
  // 이상한 id·uid는 쓰지 않는다(폴더 밖으로 나가지 않게)
  assert.equal(await a.modelEnd({ id: '../escape', uid: UID, provider: 'meshy', outcome: 'ready' }), false);
  assert.equal(await a.drawing({ id: ID, uid: 'nope', png: drawnPng(1, 1) }), false);
  assert.deepEqual(list(dir), [ID]);
});

// ───────── 지운 캐릭터 따라 지우기
test('정리(prune): 지웠거나·거절·실패했거나 줄이 없는 캐릭터의 폴더를 지운다. 살아 있는 것과 캐릭터 id가 아닌 것은 둔다', async () => {
  const dir = folderNow();
  const a = createAssetArchive({ dir });
  const id = (n) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
  for (const n of [1, 2, 3, 4, 5]) {
    mkdirSync(join(dir, id(n)));
    writeFileSync(join(dir, id(n), ASSET_FILES.draw), '{}');
  }
  mkdirSync(join(dir, 'notes'));
  writeFileSync(join(dir, 'readme.txt'), 'x');
  const asked = [];
  const db = {
    async characterStates(ids) {
      asked.push([...ids].sort());
      return new Map([[id(1), 'ready'], [id(2), 'deleted'], [id(3), 'drawing'], [id(4), 'rejected']]);
    },
  };
  assert.equal(await a.prune({ db }), 2 + 1);
  assert.deepEqual(list(dir), [id(1), id(3), 'notes', 'readme.txt'].sort(), '지운 것(2)·거절(4)·줄 없음(5)만');
  assert.deepEqual(asked, [[1, 2, 3, 4, 5].map(id)]);
  // 폴더가 여럿인데 한 줄도 읽히지 않으면(다른 DB를 읽었을 수 있다) 아무것도 지우지 않는다
  for (const n of [6, 7]) mkdirSync(join(dir, id(n)));
  const logs = [];
  const b = createAssetArchive({ dir, log: (level, msg) => logs.push(msg) });
  assert.equal(await b.prune({ db: { characterStates: async () => new Map() } }), 0);
  assert.equal(list(dir).filter((n) => n.startsWith('3333')).length, 4);
  assert.deepEqual(logs, ['asset archive prune skipped: no characters matched']);
  // 읽기가 실패하면 지우지 않는다(경고만), 상태 읽기가 없는 DB 어댑터면 하지 않는다
  assert.equal(await b.prune({ db: { characterStates: async () => { throw new Error('db down'); } } }), 0);
  assert.equal(list(dir).filter((n) => n.startsWith('3333')).length, 4);
  assert.equal(await b.prune({ db: {} }), 0);
});

test('DB 어댑터의 상태 읽기: avatars에서 id·status 두 칸만, 받은 id로만(비밀 키로 읽기만). 오류는 db_error', async () => {
  const seen = [];
  const sb = {
    rpc: async () => ({ data: null, error: null }),
    from(table) {
      return {
        select(cols) {
          return {
            async in(col, ids) {
              seen.push([table, cols, col, ids]);
              return { data: [{ id: ids[0], status: 'ready' }, { id: 7, status: 'x' }], error: null };
            },
          };
        },
      };
    },
  };
  const { db } = wrapSupabase(sb);
  const states = await db.characterStates([ID, 5, UID]);
  assert.deepEqual([...states], [[ID, 'ready']]);
  assert.deepEqual(seen, [['avatars', 'id, status', 'id', [ID, UID]]]);
  assert.deepEqual([...(await db.characterStates([]))], []);
  const broken = wrapSupabase({ from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'nope' } }) }) }) }).db;
  await assert.rejects(broken.characterStates([ID]), (e) => e.code === 'db_error');
});

test('판독 요약: 사람 수·사람 사진·아이로 보임·애매함만(판정은 따로). 모양이 다르면 null', () => {
  assert.deepEqual(visionSummary(JSON.stringify({ isPhotoOfPerson: true, personCount: 1, likelyUnder14: false, uncertain: false, note: 'red coat' })),
    { person_count: 1, photo_of_person: true, likely_under14: false, uncertain: false }, '다른 말(옷차림 등)은 담지 않는다');
  assert.deepEqual(visionSummary(JSON.stringify({ personCount: 2.5, isPhotoOfPerson: 'yes' })), {});
  assert.equal(visionSummary('not json'), null);
  assert.equal(visionSummary('[1,2]'), null);
});
