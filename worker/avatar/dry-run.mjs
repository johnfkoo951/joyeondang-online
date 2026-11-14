// 한 장 시험: DB·저장소는 가짜(메모리), 프록시는 진짜. 결과를 로컬 파일로 남긴다.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs <입력 사진> <출력.png>
//     사진 한 장 → 판정과 캐릭터 그림
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs --views <캐릭터.png> <출력 접두어>
//     캐릭터 그림 한 장 → 방향 그림 묶음 <접두어>.v1l.webp, <접두어>.v1s.webp와 모델이 그린 시트 <접두어>.sheet.png
//     (순서가 어긋나 버린 시트가 있었다면 <접두어>.sheet-discarded.png)
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs --model <캐릭터.png> <출력.glb>
//     캐릭터 그림 한 장 → 3D 서비스로 보내 확인까지 마친 3D 모형 한 파일. 프록시 키는 쓰지 않는다.
//     제공자는 AVATAR_MODEL_PROVIDER(기본 trellis: AVATAR_MODEL_URL, 기본 http://127.0.0.1:17860).
//     meshy면 MESHY_API_KEY_FILE의 키로 Meshy에 한 건을 만든다(크레딧이 든다: 한 건 35~40). Meshy가 준 그대로의 GLB도
//     <출력>.meshy.glb로 남긴다(정면이 맞는지 볼 때. 뒤를 보면 MESHY_YAW=180). 일꾼과 같은 키 잠금(meshy.mjs의 keyLock)과
//     같은 장부(MESHY_STATE_FILE, 기본 worker/avatar/state/meshy.json)를 쓴다: 이 컴퓨터에서 같은 키로 일꾼이 돌면 만들지 않고
//     멈추고, 만든 한 건은 그 장부의 하루 셈(MESHY_DAILY_MAX)에 든다. 다른 컴퓨터의 일꾼은 이 잠금이 보지 못하니 그때는
//     다른 키를 쓰거나 그 일꾼을 멈춘다. 끝나면 Meshy의 그 작업을 지운다
// 키는 PROXY_API_KEY_FILE(기본: MBP llm-proxy의 client-keys.local.env의 OPENAI_API_KEY 줄)에서 읽고 출력하지 않는다.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { checkGlb } from '../../src/lib/avatar/model.ts';
import { processOne, pngInfo } from './core.mjs';
import { createGlbTools } from './glb.mjs';
import { createImage } from './image.mjs';
import { DEFAULT_LEDGER_FILE, createMeshyService, fileLedger, keyLock } from './meshy.mjs';
import { DEFAULT_MODEL_URL, createModelService, modelProviderOf, processModel } from './models.mjs';
import { DEFAULT_BASE_URL, createProxy, readSecretFile } from './proxy.mjs';
import { processViews } from './views.mjs';

const args = process.argv.slice(2);
const views = args[0] === '--views';
const model = args[0] === '--model';
const [input, output] = views || model ? args.slice(1) : args;
if (!input || !output) {
  console.error('usage: dry-run.mjs <photo> <out.png> | dry-run.mjs --views <character.png> <out prefix> | dry-run.mjs --model <character.png> <out.glb>');
  process.exit(2);
}
if (model) {
  // 3D 모형: DB·저장소는 가짜(메모리), 3D 서비스는 진짜. 일꾼 본체와 같은 processModel을 한 바퀴 돈다
  const env = process.env;
  const provider = modelProviderOf(env.AVATAR_MODEL_PROVIDER);
  let service;
  if (provider === 'meshy') {
    if (!env.MESHY_API_KEY_FILE) {
      console.error('MESHY_API_KEY_FILE에 Meshy 키 파일 경로를 넣어 주세요.');
      process.exit(2);
    }
    const tools = await createGlbTools().catch(() => null);
    if (!tools) {
      console.error('GLB 다듬기 라이브러리가 없어요. 저장소 뿌리에서 npm ci를 먼저 해 주세요.');
      process.exit(2);
    }
    const apiKey = readSecretFile(env.MESHY_API_KEY_FILE, 'MESHY_API_KEY');
    try {
      service = createMeshyService({
        apiKey,
        // Meshy가 준 그대로의 GLB도 남긴다(정면·크기를 눈으로 볼 때)
        tidy: async (raw, opts) => {
          writeFileSync(`${output}.meshy.glb`, raw);
          return tools.tidy(raw, opts);
        },
        // 일꾼과 같은 키 잠금과 장부: 같은 키로 일꾼이 돌면 만들지 않고, 만든 한 건은 그 키의 하루 셈에 든다
        lock: keyLock(apiKey), ledger: fileLedger(env.MESHY_STATE_FILE || DEFAULT_LEDGER_FILE),
        log: (level, msg, extra) => console.log(level, msg, JSON.stringify(extra ?? {})),
        dailyMax: env.MESHY_DAILY_MAX, geometry: env.MESHY_GEOMETRY, targetPolycount: env.MESHY_TARGET_POLYCOUNT,
        imageEnhancement: env.MESHY_IMAGE_ENHANCEMENT, yaw: env.MESHY_YAW,
      });
    } catch (err) {
      if (err?.code !== 'key_locked' && err?.code !== 'ledger_locked') throw err;
      console.error('같은 Meshy 키(또는 장부)를 다른 프로세스가 쓰고 있어요(일꾼 등). 일꾼을 멈추거나 다른 키로 해 주세요.');
      process.exit(2);
    }
    console.log('meshy', JSON.stringify(service.options));
  } else if (provider === 'trellis') {
    service = createModelService({ baseUrl: env.AVATAR_MODEL_URL || DEFAULT_MODEL_URL });
  } else {
    console.error('AVATAR_MODEL_PROVIDER는 trellis 또는 meshy예요.');
    process.exit(2);
  }
  if (!(await service.ready())) {
    console.error(provider === 'meshy'
      ? 'Meshy에 닿지 않거나 키·크레딧이 안 되거나 오늘 하루 상한에 닿았어요(위 기록의 meshy paused, meshy daily cap을 보세요).'
      : `3D 서비스에 닿지 않거나 아직 준비 중이에요: ${service.baseUrl}/health (AVATAR_MODEL_URL로 주소를 바꿀 수 있어요)`);
    process.exit(2);
  }
  const uid = randomUUID();
  const id = randomUUID();
  const source = `${uid}/chars/${id}.png`;
  const files = new Map([[source, new Uint8Array(readFileSync(input))]]);
  // 시험에 넣은 그림은 사람이 직접 고른 것이라 그 제공자로 요청한 그림으로 본다
  // (바깥 3D 서비스는 요청한 때가 있고 그곳으로 요청한(via) 줄만 보낸다)
  let job = {
    id, user_id: uid, image_path: source, attempts: 0, bad_fails: 0, requested_at: new Date().toISOString(), via: provider,
  };
  const calls = [];
  const db = {
    async modelClaim() {
      if (!job) return null;
      const j = { ...job, attempts: job.attempts + 1 };
      job = null;
      return j;
    },
    async modelRelease(...a) { calls.push(['modelRelease', ...a]); return true; },
    async modelSettle(...a) { calls.push(['modelSettle', a[1], a[2]]); return true; },
    // 값이 드는 작업을 만들었다는 알림(운영에서는 DB가 그 사람의 시도로 센다). 시험은 적기만 한다
    async modelJob() { calls.push(['modelJob']); return true; },
  };
  const store = {
    async download(p) {
      if (!files.has(p)) throw new Error('no such file');
      return files.get(p);
    },
    async upload(p, bytes, type) { files.set(p, bytes); calls.push(['upload', p.split('/').slice(1).join('/'), bytes.length, type]); },
    async remove(ps) { for (const p of ps) files.delete(p); calls.push(['remove', ps.length]); },
  };
  const t0 = Date.now();
  const result = await processModel({
    db, store, worker: 'dry-run', log: (level, msg, extra) => console.log(level, msg, JSON.stringify(extra ?? {})),
    service: {
      ...service,
      async toGlb(png, opts) {
        const t = Date.now();
        const made = await service.toGlb(png, opts);
        console.log('to3d', provider, Date.now() - t, 'ms', JSON.stringify({ seed: opts?.seed, bytes: made.glb.length, stats: made.stats }));
        return made;
      },
    },
  });
  console.log('result', JSON.stringify(result), 'total', Date.now() - t0, 'ms');
  console.log('calls', JSON.stringify(calls));
  const glb = files.get(`${uid}/models/${id}.v1.glb`);
  if (glb) {
    writeFileSync(output, glb);
    console.log('wrote', output, glb.length, 'bytes', JSON.stringify(checkGlb(glb)));
  }
  process.exit(result.outcome === 'ready' ? 0 : 1);
}
const keyFile = process.env.PROXY_API_KEY_FILE ?? '';
if (!keyFile) throw new Error('PROXY_API_KEY_FILE에 프록시 키 파일 경로를 넣어 주세요.');
// 그림 어댑터(sharp)는 방향 그림에만 꼭 필요하다. 한 장 시험은 없어도 된다(일꾼 본체와 같다: 크기를 맞추지 못하면 다시 그린다)
const image = await createImage().catch(() => null);
if (views && !image) {
  console.error('방향 그림 시험에는 sharp가 필요해요. 저장소 뿌리에서 npm ci를 먼저 해 주세요.');
  process.exit(2);
}
const proxy = createProxy({
  baseUrl: process.env.PROXY_BASE_URL ?? DEFAULT_BASE_URL,
  apiKey: readSecretFile(keyFile, process.env.PROXY_API_KEY_NAME ?? 'OPENAI_API_KEY'),
  visionModel: process.env.AVATAR_VISION_MODEL,
  imageModel: process.env.AVATAR_IMAGE_MODEL,
  image,
});

const uid = randomUUID();
const id = randomUUID();
const first = views ? `${uid}/chars/${id}.png` : `${uid}/originals/${id}.png`;
const files = new Map([[first, new Uint8Array(readFileSync(input))]]);
let job = views
  ? { id, user_id: uid, image_path: first, attempts: 0 }
  : { id, user_id: uid, original_path: first, attempts: 0, give_up: false };
const calls = [];
const claim = async () => {
  if (!job) return null;
  const j = { ...job, attempts: job.attempts + 1 };
  job = null;
  return j;
};
const db = {
  claim,
  async release(...a) { calls.push(['release', ...a]); },
  async settle(...a) { calls.push(['settle', a[1], a[2]]); return true; },
  viewsClaim: claim,
  async viewsRelease(...a) { calls.push(['viewsRelease', ...a]); return true; },
  async viewsSettle(...a) { calls.push(['viewsSettle', a[1], a[2]]); return true; },
};
const store = {
  async download(p) {
    if (!files.has(p)) throw new Error('no such file');
    return files.get(p);
  },
  async upload(p, bytes) { files.set(p, bytes); },
  async remove(ps) { for (const p of ps) files.delete(p); calls.push(['remove', ps.length]); },
};
const log = (level, msg, extra) => console.log(level, msg, JSON.stringify(extra ?? {}));
/** 프록시 호출마다 걸린 시간을 찍는다 */
const timed = (name, model, fn, show) => async (...a) => {
  const t = Date.now();
  const r = await fn(...a);
  console.log(name, model, Date.now() - t, 'ms', JSON.stringify(show(r)));
  return r;
};

const t0 = Date.now();
if (views) {
  const sheetFile = `${output}.sheet.png`;
  const draw = timed('turnaround', proxy.imageModel, proxy.turnaround, (d) => ({ ...pngInfo(d.png), bytes: d.png.length, usage: d.usage }));
  let sheets = 0;
  const result = await processViews({
    db, store, worker: 'dry-run', log, image,
    proxy: {
      async turnaround(...a) {
        const d = await draw(...a);
        // 다시 그렸으면 앞의 시트(순서가 어긋나 버린 것)를 따로 남긴다
        if (sheets++ > 0 && existsSync(sheetFile)) renameSync(sheetFile, `${output}.sheet-discarded.png`);
        writeFileSync(sheetFile, d.png);
        return d;
      },
      sheetViews: timed('sheet views', proxy.visionModel, proxy.sheetViews, (v) => v && v.map((f) => `${f.view}/${f.nose}`).join(' ')),
    },
  });
  console.log('result', JSON.stringify(result), 'total', Date.now() - t0, 'ms');
  console.log('calls', JSON.stringify(calls));
  for (const size of ['l', 's']) {
    const webp = files.get(`${uid}/views/${id}.v1${size}.webp`);
    if (!webp) continue;
    writeFileSync(`${output}.v1${size}.webp`, webp);
    const { w, h } = await image.decode(webp);
    console.log('wrote', `${output}.v1${size}.webp`, webp.length, 'bytes', `${w}x${h}`);
  }
} else {
  const result = await processOne({
    db, store, worker: 'dry-run', log, image,
    proxy: {
      check: timed('vision', proxy.visionModel, proxy.check, (v) => v),
      draw: timed('draw', proxy.imageModel, proxy.draw, (d) => d.usage),
    },
  });
  console.log('result', JSON.stringify(result), 'total', Date.now() - t0, 'ms');
  console.log('calls', JSON.stringify(calls));
  const png = files.get(`${uid}/chars/${id}.png`);
  if (png) {
    writeFileSync(output, png);
    console.log('wrote', output, png.length, 'bytes', JSON.stringify(pngInfo(png)));
  }
}
