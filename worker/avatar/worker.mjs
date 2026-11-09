// 그리기 일꾼(Mac Studio, launchd가 늘 띄워 둔다). 줄에서 하나씩 가져가 그리고, 1분마다 살아 있음을 남긴다.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/worker.mjs [--once]
// 환경 변수(값은 출력하지 않는다):
//   SUPABASE_URL, SUPABASE_SECRET_KEY_FILE   운영 DB(비밀 키 한 줄 또는 SUPABASE_SECRET_KEY=… 줄)
//   PROXY_BASE_URL                           기본 http://127.0.0.1:8317/v1 (Studio는 http://127.0.0.1:28317/v1)
//   PROXY_API_KEY_FILE, PROXY_API_KEY_NAME   프록시 키 파일과 줄 이름(기본 OPENAI_API_KEY)
//   AVATAR_WORKER_ID                         기본 호스트 이름. AVATAR_VISION_MODEL, AVATAR_IMAGE_MODEL로 모델을 바꿀 수 있다
import { hostname } from 'node:os';
import { processOne } from './core.mjs';
import { DEFAULT_BASE_URL, createProxy, readSecretFile } from './proxy.mjs';
import { createSupabase } from './supabase.mjs';

const VERSION = 'avatar-worker-1';
const IDLE_MS = 5_000;
const BEAT_MS = 60_000;
const once = process.argv.includes('--once');
const env = process.env;
const need = (name) => {
  if (!env[name]) throw new Error(`${name} is not set`);
  return env[name];
};

const worker = (env.AVATAR_WORKER_ID || hostname().split('.')[0] || 'worker').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40);
const { db, store } = createSupabase({
  url: need('SUPABASE_URL'),
  secretKey: readSecretFile(need('SUPABASE_SECRET_KEY_FILE'), 'SUPABASE_SECRET_KEY'),
});
const proxy = createProxy({
  baseUrl: env.PROXY_BASE_URL || DEFAULT_BASE_URL,
  apiKey: readSecretFile(need('PROXY_API_KEY_FILE'), env.PROXY_API_KEY_NAME || 'OPENAI_API_KEY'),
  visionModel: env.AVATAR_VISION_MODEL,
  imageModel: env.AVATAR_IMAGE_MODEL,
});
const log = (level, msg, extra) =>
  console[level === 'warn' ? 'warn' : 'log'](new Date().toISOString(), level, msg, extra ? JSON.stringify(extra) : '');

let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stopping = true; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

log('info', 'start', { worker, version: VERSION, vision: proxy.visionModel, image: proxy.imageModel, once });
let lastBeat = 0;
let failures = 0;
while (!stopping) {
  try {
    if (Date.now() - lastBeat > BEAT_MS) {
      await db.beat(worker, VERSION);
      lastBeat = Date.now();
    }
    const r = await processOne({ db, store, proxy, worker, log });
    failures = 0;
    if (r.outcome !== 'idle') lastBeat = Date.now(); // claim이 살아 있음도 남긴다
    if (once) break;
    if (r.outcome === 'idle') await sleep(IDLE_MS);
  } catch (err) {
    // DB·네트워크가 잠깐 끊김: 점점 길게 쉬었다가 다시. 잡은 작업은 임대가 끝나면 줄로 돌아간다
    failures += 1;
    log('warn', 'loop error', { name: err?.name, code: err?.code, message: String(err?.message ?? '').slice(0, 200) });
    if (once) process.exitCode = 1;
    if (once) break;
    await sleep(Math.min(5_000 * 2 ** Math.min(failures, 6), 300_000));
  }
}
log('info', 'stop', { worker });
