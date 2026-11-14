// 그리기 일꾼(Mac Studio, launchd가 늘 띄워 둔다). 줄에서 하나씩 가져가 그리고, 1분마다 살아 있음을 남긴다.
// 한 장 그리기(손님이 기다린다)가 먼저다. 그릴 것이 없을 때 방향 그림(이미 그린 캐릭터의 다섯 방향 묶음)을 한 건 만든다.
// 3D 모형은 따로 돈다: 한 장 그리기와 다른 자원(그래픽 카드 PC 또는 바깥 3D 서비스)만 쓰므로 한 장 그리기를 늦추지 않는다
// (서비스가 꺼져 있거나 쉬는 중이면 잡지 않고 기다린다).
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/worker.mjs [--once]
// 환경 변수(값은 출력하지 않는다):
//   SUPABASE_URL, SUPABASE_SECRET_KEY_FILE   운영 DB(비밀 키 한 줄 또는 SUPABASE_SECRET_KEY=… 줄)
//   PROXY_BASE_URL                           기본 http://127.0.0.1:8317/v1 (Studio는 http://127.0.0.1:28317/v1)
//   PROXY_API_KEY_FILE, PROXY_API_KEY_NAME   프록시 키 파일과 줄 이름(기본 OPENAI_API_KEY)
//   AVATAR_WORKER_ID                         기본 호스트 이름. AVATAR_VISION_MODEL, AVATAR_IMAGE_MODEL로 모델을 바꿀 수 있다
//   AVATAR_VIEWS                             0이면 방향 그림을 그리지 않는다(한 장 그리기만)
//   AVATAR_MODELS                            0이면 3D 모형을 만들지 않는다
//   AVATAR_MODEL_PROVIDER                    3D 모형 제공자: trellis(기본, 그래픽 카드 PC) | meshy(바깥 3D 서비스, 돈이 든다)
//   AVATAR_MODEL_URL                         (trellis) 3D 서비스 주소. 기본 http://127.0.0.1:17860(그래픽 카드 PC로 가는 SSH 터널)
//   AVATAR_MODEL_MAKER                       (trellis) DB에 적을 3D 서비스 이름(기본 trellis-image-large. meshy는 meshy-7.1)
//   MESHY_API_KEY_FILE                       (meshy) 키 파일(MESHY_API_KEY=… 줄 또는 값 한 줄). 없거나 값이 비면 3D 모형만 꺼진다
//   MESHY_GEOMETRY, MESHY_TARGET_POLYCOUNT   (meshy) 형상 해상도 standard|ultra|2k|4k(기본 ultra = 2k), 다시 짤 면 수(기본 9000)
//   MESHY_DAILY_MAX, MESHY_YAW               (meshy) 하루(KST) 만들기 요청 상한(이 프로세스, 곧 이 키. 기본 120), 정면을 맞추는 y축 회전(도, 기본 0)
//   MESHY_IMAGE_ENHANCEMENT, MESHY_STATE_FILE (meshy) 1이면 Meshy가 그림을 먼저 다듬는다(기본 끔), 장부 파일(기본 worker/avatar/state/meshy.json)
//   AVATAR_ASSET_ARCHIVE_DIR                 원본 에셋 보관 폴더(절대 경로, 이 저장소 밖). 없으면 남기지 않는다(assets.mjs, README)
// 3D 모형 제공자는 provider.mjs가 고른다(준비가 안 되면 3D 모형만 끈다. 일꾼은 죽지 않는다). 같은 Meshy 키로는 meshy 일꾼
// 하나만 돈다(키 잠금: 둘째부터는 3D만 꺼진다). 여러 일꾼을 띄우면 하나만 meshy로, 나머지는 AVATAR_MODELS=0으로 둔다
import { hostname } from 'node:os';
import { openAssetArchive } from './assets.mjs';
import { processOne } from './core.mjs';
import { createImage } from './image.mjs';
import { DEFAULT_MODEL_MAKER, createModelsTurn, modelProviderOf, processModel } from './models.mjs';
import { createModelProvider } from './provider.mjs';
import { DEFAULT_BASE_URL, createProxy, readSecretFile } from './proxy.mjs';
import * as supabase from './supabase.mjs';
import { createViewsTurn, processViews } from './views.mjs';

/** 시작 줄에 남는 판. 0021의 잡기에 제공자(p_via)를 넘기는 첫 판이 6이다(내보낼 때 plist마다 이 값을 본다) */
// 7: 사진 살피기 전에 보호자 동의·집주인 그림인지 묻는다(0025 avatar_child_ok)
const VERSION = 'avatar-worker-8';
const IDLE_MS = 5_000;
const BEAT_MS = 60_000;
/** 지운 캐릭터의 남은 방향 그림 파일을 치우는 간격. 거의 생기지 않는 파일이라 한 시간에 한 번이면 넉넉하다 */
const SWEEP_MS = 3_600_000;
/** 한 장 그리기를 한 뒤 이만큼은 방향 그림을 시작하지 않는다(연달아 올리는 사진이 방향 그림 한 바퀴를 기다리지 않게) */
const VIEWS_AFTER_DRAW_MS = 30_000;
/** 모형 줄이 비었을 때 다시 묻는 간격(사이트에서 3D 만들기를 요청하면 이만큼 안에 잡힌다) */
const MODELS_IDLE_MS = 15_000;
const once = process.argv.includes('--once');
const env = process.env;
const need = (name) => {
  if (!env[name]) throw new Error(`${name} is not set`);
  return env[name];
};

const worker = (env.AVATAR_WORKER_ID || hostname().split('.')[0] || 'worker').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40);
const { db, store } = supabase.createSupabase({
  url: need('SUPABASE_URL'),
  secretKey: readSecretFile(need('SUPABASE_SECRET_KEY_FILE'), 'SUPABASE_SECRET_KEY'),
});
const log = (level, msg, extra) =>
  console[level === 'warn' ? 'warn' : 'log'](new Date().toISOString(), level, msg, extra ? JSON.stringify(extra) : '');
const brief = (err) => ({ name: err?.name, code: err?.code, message: String(err?.message ?? '').slice(0, 200) });
// 그림 어댑터(sharp)가 없어도 한 장 그리기는 돌아야 한다: 방향 그림과 크기 맞추기만 쉰다
const image = await createImage().catch((err) => {
  log('warn', 'image tools unavailable: views off', brief(err));
  return null;
});
const proxy = createProxy({
  baseUrl: env.PROXY_BASE_URL || DEFAULT_BASE_URL,
  apiKey: readSecretFile(need('PROXY_API_KEY_FILE'), env.PROXY_API_KEY_NAME || 'OPENAI_API_KEY'),
  visionModel: env.AVATAR_VISION_MODEL,
  imageModel: env.AVATAR_IMAGE_MODEL,
  image,
});
const viewsOn = env.AVATAR_VIEWS !== '0' && image !== null && typeof db.viewsClaim === 'function';
const modelProvider = modelProviderOf(env.AVATAR_MODEL_PROVIDER);
/** 3D 모형 제공자 어댑터. 꺼 두었거나 준비가 안 되면 null: 3D 모형만 쉬고, 한 장 그리기·방향 그림은 그대로 돈다 */
const modelService = await createModelProvider({ env, db, log });
const modelsOn = modelService !== null;
const modelMaker = modelService?.maker ?? (env.AVATAR_MODEL_MAKER || DEFAULT_MODEL_MAKER);
/** 원본 에셋 보관 폴더. 꺼 두었거나 쓸 수 없으면 null: 남기지 않을 뿐 그림·3D는 그대로 돈다 */
const archive = await openAssetArchive({ env, worker, version: VERSION, log });

let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stopping = true; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 끝내라는 신호를 받으면 바로 깨는 쉬기(모형 일꾼이 쉬는 동안 launchd가 기다리지 않게) */
const nap = async (ms) => {
  const end = Date.now() + ms;
  while (!stopping && Date.now() < end) await sleep(Math.min(1_000, end - Date.now()));
};

// 방향 그림 한 건(할 때가 아니면 아무것도 하지 않는다). 여기서 난 오류는 한 장 그리기를 늦추지 않는다
const viewsTurn = viewsOn
  ? createViewsTurn({ run: () => processViews({ db, store, proxy, worker, log, image }), log })
  : async () => false;

// 3D 모형 한 건(할 때가 아니면 아무것도 하지 않는다). 한 장 그리기와 따로 도는 고리에서 부른다
const modelsTurn = modelsOn
  ? createModelsTurn({
    run: () => processModel({
      db, store, service: modelService, worker, maker: modelMaker, log,
      keepRaw: archive ? (x) => archive.modelRaw(x) : null, keepAssets: archive ? (x) => archive.modelEnd(x) : null,
    }),
    ready: () => modelService.ready(),
    log,
  })
  : async () => false;
async function modelsLoop() {
  // 3D 모형을 멈췄으면(바깥 3D 서비스에 요청하지 않은 줄이 왔다: 0021 전의 DB) 고리를 끝낸다. 다시 띄울 때까지 쉰다
  while (!stopping && !modelsTurn.halted?.()) {
    let worked = false;
    try {
      worked = await modelsTurn();
    } catch (err) {
      log('warn', 'models loop error', brief(err));
    }
    // 한 건을 만든 뒤 잠깐(MODELS_GAP_MS) 쉬는 중이면 그만큼만 자고, 할 일이 없거나 오래 쉬는 중이면 MODELS_IDLE_MS
    const left = modelsTurn.restLeft?.() ?? 0;
    if (!worked) await nap(left > 0 ? Math.min(left, MODELS_IDLE_MS) : MODELS_IDLE_MS);
  }
}

// 일꾼이 묶음·모형을 올린 뒤 거두기 전에 멈추면 지운 캐릭터의 그 파일이 저장소에 남는다. 한가할 때 가끔 치운다.
// 청소 함수는 DB 어댑터(supabase.mjs)에 있다. 없는 판이면 건너뛴다
let lastSweep = 0;
async function sweepTurn() {
  // 방향 그림·모형을 꺼 둔 동안에도 치운다: 끄기 전에 올린 파일이 남아 있을 수 있다(DB에 그 함수가 없으면 오류로 알고 넘어간다)
  if (Date.now() - lastSweep < SWEEP_MS) return;
  lastSweep = Date.now();
  const sweeps = [
    ['views', supabase.sweepViewStrays, db.viewsStrays],
    ['model', supabase.sweepModelStrays, db.modelStrays],
  ];
  for (const [name, sweep, strays] of sweeps) {
    if (typeof sweep !== 'function' || typeof strays !== 'function') continue;
    try {
      const n = await sweep({ db, store });
      if (n) log('info', `${name} strays removed`, { n });
    } catch (err) {
      log('warn', `${name} sweep failed`, brief(err));
    }
  }
  // 원본 에셋 보관 폴더도 지운 캐릭터를 따라 지운다(던지지 않는다)
  if (archive) {
    const n = await archive.prune({ db });
    if (n) log('info', 'asset archive folders removed (deleted characters)', { n });
  }
}

log('info', 'start', {
  worker, version: VERSION, vision: proxy.visionModel, image: proxy.imageModel, views: viewsOn, models: modelsOn,
  modelProvider: modelsOn ? modelProvider : undefined, modelUrl: modelsOn ? modelService.baseUrl : undefined,
  meshy: modelsOn ? modelService.options : undefined, assets: archive !== null, once,
});
// 모형 고리는 한 장 그리기 고리와 함께 돈다(--once면 한 장 그리기 고리 뒤에 모형 한 건만)
const modelsDone = modelsOn && !once ? modelsLoop() : null;
let lastBeat = 0;
let lastDraw = 0;
let failures = 0;
while (!stopping) {
  try {
    if (Date.now() - lastBeat > BEAT_MS) {
      await db.beat(worker, VERSION);
      lastBeat = Date.now();
    }
    const r = await processOne({ db, store, proxy, worker, log, image, keepAssets: archive ? (x) => archive.drawing(x) : null });
    failures = 0;
    if (r.outcome !== 'idle') lastDraw = Date.now();
    // 방향 그림은 한 장 그리기가 한동안 없을 때만 시작한다: 결과를 보고 바로 다른 사진을 올리는 손님이
    // 방향 그림 한 바퀴(30~40초)를 기다리지 않게. 끝내라는 신호를 받은 뒤에는 새로 시작하지 않는다
    const quiet = Date.now() - lastDraw >= VIEWS_AFTER_DRAW_MS;
    const busy = r.outcome !== 'idle' || (quiet && !stopping && (await viewsTurn()));
    if (busy) lastBeat = Date.now(); // claim이 살아 있음도 남긴다
    if (!busy) await sweepTurn();
    if (once) break;
    if (!busy) await sleep(IDLE_MS);
  } catch (err) {
    // DB·네트워크가 잠깐 끊김: 점점 길게 쉬었다가 다시. 잡은 작업은 임대가 끝나면 줄로 돌아간다
    failures += 1;
    log('warn', 'loop error', brief(err));
    if (once) process.exitCode = 1;
    if (once) break;
    await sleep(Math.min(5_000 * 2 ** Math.min(failures, 6), 300_000));
  }
}
if (once && modelsOn) {
  try {
    await modelsTurn();
  } catch (err) {
    log('warn', 'models error', brief(err));
  }
}
await modelsDone;
// 원본 에셋을 뒤에서 마저 쓰는 중이면 끝날 때까지(느린 디스크라도 WRITE_WAIT_MS 남짓)
await archive?.flush();
log('info', 'stop', { worker });
