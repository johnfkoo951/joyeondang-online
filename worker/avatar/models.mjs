// 3D 모형 일꾼의 한 바퀴: 잡기 → 캐릭터 그림 받기 → 3D 서비스로 보내 GLB 받기 → 확인 → 올리기 → 정리.
// 걷기 화면에서 사진 캐릭터를 판 대신 3D 모형으로 세울 수 있게, 다 그린 캐릭터 그림 한 장으로 GLB 한 파일을 만든다.
// 3D 서비스(제공자)는 둘 가운데 하나다(일꾼 환경 변수 AVATAR_MODEL_PROVIDER, 기본 trellis):
//   trellis  우리 컴퓨터(그래픽 카드가 있는 PC)의 3D 서비스. 이 맥에서는 SSH 터널로만 닿는다(바깥으로 보내지 않는다). 아래 createModelService
//   meshy    바깥 3D 서비스(Meshy, 미국)의 API. 돈이 든다. meshy.mjs의 createMeshyService, 받은 GLB는 glb.mjs가 다듬는다
// DB·저장소·3D 서비스 어댑터는 바깥에서 넘긴다(운영은 supabase.mjs + 제공자 어댑터, 시험과 dry run은 가짜).
//   db:      modelClaim(worker, leaseSec, via) → {id, user_id, image_path, attempts, bad_fails, requested_at, via}|null
//            (어떤 줄을 줄지는 DB가 정한다. 0021부터는 사람이 「3D 만들기」로 요청한 그림 가운데 이 일꾼의 제공자 via로
//            요청한 것만, requested_at은 요청한 때, via는 요청할 때 그 사람에게 알린 곳 meshy | trellis),
//            modelRelease(id, worker, delaySec, bad) (bad가 참이면 결과가 이상한 실패로 따로 센다),
//            modelSettle(id, status, {maker, reason, worker}) → boolean,
//            (있으면) modelJob(id) 바깥 3D 서비스가 작업을 만들었다(값이 들었다. DB가 그 요청을 그 사람의 시도로 한 번 센다)
//   store:   download(path) → Uint8Array, upload(path, bytes, type), remove(paths[])
//   service: ready() → boolean, toGlb(png, {seed, key, badFails, onJob}) → {glb: Uint8Array, stats: object|null, raw?: Uint8Array, job?: object}
//            (onJob: 값이 드는 작업을 만들었거나 이어 볼 때 부른다. raw: 바깥 서비스가 준 그대로의 GLB,
//            job: 바깥 서비스의 작업 기록(원본 에셋 기록용, 키·서명된 주소 없음). 작업을 만든 뒤 던지는 오류에도 job이 붙는다)
//            (있으면) name 제공자 이름(meshy. 없으면 trellis로 본다),
//            (있으면) maker 만든 서비스 이름, leaseSec 임대, maxBad 결과 탓 실패 상한, forget(key) 끝난 그림 정리,
//            requestedOnly 참이면 요청한 때가 없는 줄을 보내지 않는다(바깥 3D 서비스. 아래 processModel),
//            consent(문자열)면 via가 그 값인 줄만 보낸다(그곳으로 보낸다고 알리고 받은 요청만)
import { MAX_MODEL_BYTES, MODEL_TYPE, checkGlb } from '../../src/lib/avatar/model.ts';
import { charPath, isUuid, modelPath, sniffImageType } from '../../src/lib/avatar/rules.ts';
import { reasonOf } from './core.mjs';

/** 3D 서비스에 닿는 주소. Mac Studio는 SSH 터널(이 맥의 17860 → 그래픽 카드 PC의 7860)로 닿는다 */
export const DEFAULT_MODEL_URL = 'http://127.0.0.1:17860';
/** 만든 서비스의 이름(DB의 model_maker). 3D 서비스를 바꾸면 AVATAR_MODEL_MAKER로 바꿔 적는다 */
export const DEFAULT_MODEL_MAKER = 'trellis-image-large';
/** 한 건에 보통 20~30초(터널 포함), 서비스가 깬 직후 첫 건은 40초 남짓. 서비스는 한 번에 한 건이라 앞 건을 기다릴 수도 있다 */
export const MODEL_TIMEOUT_MS = 240_000;
const HEALTH_TIMEOUT_MS = 10_000;
/** 임대: 받기 + 3D 서비스(시간 넘김까지) + 올리기에 넉넉하게 */
export const MODELS_LEASE_SECONDS = 600;
/**
 * 결과가 이상한 것(GLB가 아님, 너무 큼, 삼각형이 많음, 모양이 틀림, 서비스의 생성 실패)은 세 번이면 그만둔다.
 * 다시 만들 때마다 seed를 바꾼다(같은 seed면 같은 모양이 나온다). 이 횟수는 DB가 따로 센다(bad_fails)
 */
export const MODELS_MAX_BAD = 3;
/**
 * 서비스·저장소가 안 되는 실패는 이 캐릭터 탓이 아니다. 잡은 횟수 여덟 번까지 기다려 본다
 * (DB가 임대가 끝난 줄을 굳히는 횟수와 같다: 0016_avatar_models.sql의 avatar_model_claim, 0021도 그대로).
 * 서비스가 꺼져 있는 동안에는 애초에 잡지 않으므로(아래 createModelsTurn) 이 횟수도 쓰지 않는다
 */
export const MODELS_MAX_OUTAGE_ATTEMPTS = 8;
const OUTAGE_DELAY = 3600;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** 저장소가 잠깐 안 될 때 다 만든 모형을 버리지 않게 한 번 더 해 본다(같은 자리에 덮어쓰므로 두 번 해도 같다) */
const twice = async (fn, sleep) => {
  try {
    return await fn();
  } catch {
    await sleep(2000);
    return fn();
  }
};
const failure = (code, message, extra = {}) => Object.assign(new Error(message ?? code), { code, ...extra });

/** 3D 모형 제공자. 처음 것이 기본(지금 운영 그대로) */
export const MODEL_PROVIDERS = ['trellis', 'meshy'];
/** 환경 변수 값 → 제공자 이름. 비었으면 기본, 모르는 이름이면 null(부르는 쪽이 3D 모형만 끈다) */
export function modelProviderOf(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return MODEL_PROVIDERS[0];
  return MODEL_PROVIDERS.includes(v) ? v : null;
}

/** 3D 서비스가 머리 X-Avatar3D-Stats에 싣는 측정값에서 기록에 남길 것만(모양이 이상하면 null) */
export function readStats(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 20_000) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const pick = {};
    for (const k of ['total_s', 'generate_s', 'bake_s', 'tris', 'bytes', 'seed', 'front_applied', 'front_iou', 'yaw_fix']) {
      const v = s[k];
      if (typeof v === 'number' || typeof v === 'boolean') pick[k] = v;
    }
    return pick;
  } catch {
    return null;
  }
}

/**
 * trellis 3D 서비스 어댑터(POST /to3d, GET /health). 실패는 까닭을 붙여 던진다:
 *   down       닿지 않음·끊김·502/503/504(서비스가 꺼졌거나 터널이 끊김). 이 캐릭터 탓이 아니다
 *   timeout    시간을 넘김(서비스가 바빴을 수 있다). 이 캐릭터 탓으로 치지 않는다
 *   bad        생성 실패(500)나 너무 큰 답. 다른 seed로 다시 해 볼 만하다
 *   permanent  입력을 받지 않음(400·413·415·422). 다시 해도 같다
 */
export function createModelService({ baseUrl = DEFAULT_MODEL_URL, fetch: f = globalThis.fetch, timeoutMs = MODEL_TIMEOUT_MS } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return {
    baseUrl: base,
    /** 모델을 다 불러 일을 받을 수 있는가. 닿지 않거나 아직 불러오는 중이면 false */
    async ready() {
      try {
        const res = await f(`${base}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        if (!res.ok) return false;
        const body = await res.json();
        return body?.loaded === true;
      } catch {
        return false;
      }
    },
    /** 캐릭터 PNG → GLB(meshopt 압축). seed가 같으면 같은 모양이 나온다 */
    async toGlb(png, { seed = 1 } = {}) {
      const s = Number.isInteger(seed) && seed > 0 ? seed : 1;
      let res;
      try {
        res = await f(`${base}/to3d?seed=${s}&compress=meshopt`, {
          method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png, signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw failure('timeout', 'to3d timed out');
        throw failure('service_down', `to3d: ${String(err?.cause?.code ?? err?.message ?? 'failed').slice(0, 80)}`, { down: true });
      }
      const status = res.status;
      const drain = () => res.body?.cancel().catch(() => {});
      if (status === 400 || status === 413 || status === 415 || status === 422) {
        await drain();
        throw failure('bad_input', `to3d ${status}`, { status, permanent: true });
      }
      if (status === 500) {
        await drain();
        throw failure('service_failed', 'to3d 500', { status, bad: true });
      }
      if (!res.ok) {
        await drain();
        throw failure('service_down', `to3d ${status}`, { status, down: true });
      }
      // 약속보다 훨씬 큰 답은 받지 않는다(받아 봐야 올리지 않는다)
      const declared = Number(res.headers.get('content-length'));
      if (declared > MAX_MODEL_BYTES) {
        await drain();
        throw failure('too_big', `to3d answered ${declared} bytes`, { bad: true });
      }
      let glb;
      try {
        glb = new Uint8Array(await res.arrayBuffer());
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw failure('timeout', 'to3d timed out');
        throw failure('service_down', 'to3d: body cut', { down: true });
      }
      return { glb, stats: readStats(res.headers.get('x-avatar3d-stats')) };
    },
  };
}

/** 잡은 줄에 사람이 3D를 요청한 때가 실려 있는가(0021의 잡기만 싣는다. 0016의 잡기는 걷기에 입은 캐릭터를 저절로 준다) */
export function wasRequested(job) {
  return typeof job?.requested_at === 'string' && Number.isFinite(Date.parse(job.requested_at));
}

/**
 * 모형 한 건. 임대와 결과 탓 실패 상한은 제공자가 정할 수 있다(service.leaseSec, service.maxBad. 없으면 trellis 값):
 * meshy는 기다림이 길어 임대가 20분이고, 다시 만들 때마다 돈이 들어 결과 탓 실패는 한 번만 다시 한다.
 * 끝난 그림(ready·failed·지워짐)은 service.forget(id)으로 알린다(meshy가 장부에서 그 작업을 뺀다).
 * 잡기에는 이 일꾼의 제공자(service.consent, 없으면 service.name, 없으면 trellis)를 넘긴다: 0021의 잡기는 그곳으로
 * 요청한 줄만 준다(Meshy로 고른 요청을 우리 컴퓨터가, 우리 컴퓨터로 고른 요청을 Meshy가 잡지 않는다).
 * 바깥 3D 서비스(service.requestedOnly)는 사람이 요청한 그림만 보낸다: 잡은 줄에 요청한 때가 없으면(0021 전의 DB)
 * 그림을 받지도 보내지도 않고 줄을 바로 돌려놓은 뒤 halt를 돌려준다(차례가 3D 모형을 멈춘다. 일꾼을 다시 띄울 때까지).
 * 그것도 그 서비스로 보낸다고 알리고 받은 요청만 보낸다(service.consent): 잡은 줄의 via가 다르면(제공자를 거르지 않는
 * 잡기가 준 줄) 그림을 받지도 보내지도 않고 failed('reconsent')로 적는다. 작업을 만들지 않았으니 DB가 셈과 누적에서
 * 빼 주고, 화면이 새 확인 글로 다시 묻는다. 이 서비스 탓이 아니라 쉬지 않고 다음 줄로 간다.
 * 값이 드는 서비스는 작업을 만들면 toGlb의 onJob을 부른다: 여기서 DB(db.modelJob)에 알려 그 사람의 시도로 센다.
 * 알리지 못해도 만들기는 잇는다(이어 볼 때 다시 알린다). 우리 컴퓨터(trellis)는 값이 들지 않아 부르지 않는다.
 * 원본 에셋 남기기(assets.mjs, 일꾼 환경 변수 AVATAR_ASSET_ARCHIVE_DIR)가 쓰는 두 자리. 둘 다 실패해도 만들기는 그대로다:
 *   keepRaw({id, uid, raw, stats, provider})  바깥 서비스가 준 그대로의 GLB를 그 서비스 쪽 사본을 지우기(forget) 전에 넘긴다
 *   keepAssets({id, uid, provider, maker, attempt, outcome, reason, glb, stats, job, check})  3D 서비스를 부른 한 차례가 끝날 때
 *     (outcome: ready | retry | failed | late | gone. ready면 올린 GLB와 확인 결과, job은 바깥 서비스의 작업 기록).
 *     gone(만드는 사이 본인이 지웠다)이면 그 캐릭터의 보관 폴더를 지운다. 서비스를 부르기 전에 끝난 차례는 넘기지 않는다
 */
export async function processModel({
  db, store, service, worker, maker = service?.maker ?? DEFAULT_MODEL_MAKER, log = () => {}, sleep = wait, now = Date.now,
  keepRaw = null, keepAssets = null,
}) {
  const leaseSec = Number.isInteger(service?.leaseSec) && service.leaseSec >= 120 ? service.leaseSec : MODELS_LEASE_SECONDS;
  const maxBad = Number.isInteger(service?.maxBad) && service.maxBad >= 1 ? service.maxBad : MODELS_MAX_BAD;
  const provider = typeof service?.name === 'string' && /^[a-z0-9]{1,16}$/.test(service.name) ? service.name : 'trellis';
  /** 이 일꾼이 3D를 만드는 곳: 잡기가 그곳으로 요청한 줄만 준다(0021) */
  const via = typeof service?.consent === 'string' ? service.consent : provider;
  const job = await db.modelClaim(worker, leaseSec, via);
  if (!job) return { outcome: 'idle' };
  const { id, user_id: uid, image_path: source, attempts } = job;
  /** 지금까지 결과가 이상해서 돌려놓은 횟수(옛 DB 어댑터라 값이 없으면 0) */
  const badFails = Number.isInteger(job.bad_fails) && job.bad_fails > 0 ? job.bad_fails : 0;
  const tag = { id, attempt: attempts };
  if (service?.requestedOnly === true && !wasRequested(job)) {
    try {
      await db.modelRelease(id, worker, 0, false);
    } catch {
      log('warn', 'model release failed', tag);
    }
    log('warn', 'model job was not requested (DB before 0021?): not sent', tag);
    return { outcome: 'unrequested', id, trouble: true, halt: true };
  }
  if (typeof service?.consent === 'string' && job.via !== service.consent) {
    await db.modelSettle(id, 'failed', { maker, reason: 'reconsent', worker });
    log('warn', 'model job was asked for another 3D service: not sent (reconsent)', {
      ...tag, via: typeof job.via === 'string' ? job.via.slice(0, 16) : null,
    });
    return { outcome: 'failed', reason: 'reconsent', id, trouble: false };
  }
  // 임대가 끝나 가면(컴퓨터가 잠들었다 깬 경우 등) 다른 일꾼이 이 줄을 다시 잡았을 수 있다. 그때는 올리지도 정리하지도 않고 물러난다
  const started = now();
  const late = () => now() - started > (leaseSec - 60) * 1000;
  const leave = () => {
    log('warn', 'model lease ran out', tag);
    return { outcome: 'late', id, trouble: true };
  };
  const forget = async () => {
    try {
      await service.forget?.(id);
    } catch {
      log('warn', 'model forget failed', tag);
    }
  };
  const fail = async (reason, trouble = false) => {
    await db.modelSettle(id, 'failed', { maker, reason, worker });
    await forget();
    log('info', `model failed ${reason}`, tag);
    return { outcome: 'failed', reason, id, trouble };
  };
  // 값이 드는 작업을 만들었다(또는 이어 본다): DB에 알려 그 사람의 시도로 센다(같은 요청은 한 번). 한 번 더 해 보고, 그래도
  // 안 되면 경고만 남기고 만들기는 잇는다(다음에 이어 볼 때 다시 알린다). 옛 DB 어댑터(modelJob 없음)는 건너뛴다
  const onJob = async () => {
    if (typeof db.modelJob !== 'function') return;
    try {
      await twice(() => db.modelJob(id), sleep);
    } catch {
      log('warn', 'model job not recorded (will retry on resume)', tag);
    }
  };
  if (!isUuid(id) || !isUuid(uid) || source !== charPath(uid, id)) return fail('bad_job');
  const path = modelPath(uid, id);
  let uploading = false;
  let settling = false;
  /** 3D 서비스를 불렀는가(그 뒤에 끝난 차례만 원본 에셋 기록에 넘긴다) */
  let called = false;
  /** 서비스가 준 작업 기록(바깥 서비스. 이 차례가 받은 뒤에 실패해도 그 기록을 넘긴다) */
  let madeJob = null;
  /** 원본 에셋 기록(keepAssets)에 이 차례의 끝을 넘긴다. 던지지 않는다 */
  const keep = async (x) => {
    if (typeof keepAssets !== 'function' || !called) return;
    try {
      await keepAssets({ id, uid, provider, maker, attempt: attempts, reason: null, glb: null, stats: null, job: null, check: null, ...x });
    } catch {
      log('warn', 'model assets not kept', tag);
    }
  };
  try {
    const char = await store.download(source);
    if (sniffImageType(char) !== 'image/png') return fail('bad_char');
    const t0 = now();
    // seed는 몇 번째로 잡았는지: 결과가 이상해 다시 만들 때 다른 모양이 나오게(같은 seed면 같은 모양).
    // key와 badFails는 meshy가 쓴다: 같은 그림의 만들던 작업을 이어 볼지, 결과가 이상하다고 판정돼 새로 만들지
    called = true;
    const made = await service.toGlb(char, { seed: Number.isInteger(attempts) && attempts > 0 ? attempts : 1, key: id, badFails, onJob });
    madeJob = made.job ?? null;
    // 바깥 서비스가 준 그대로의 GLB: 그쪽 사본을 지우기(forget) 전에 원본 에셋 남기기로 넘긴다(보관 폴더에 쓴 뒤에 지운다)
    if (typeof keepRaw === 'function' && made.raw instanceof Uint8Array) {
      try {
        await keepRaw({ id, uid, raw: made.raw, stats: made.stats ?? null, provider });
      } catch {
        log('warn', 'model raw not kept', tag);
      }
    }
    const check = checkGlb(made.glb);
    if (!check.ok) throw failure('bad_output', `${check.reason}${check.detail ? ` ${check.detail}` : ''}`, { bad: true });
    if (late()) {
      await keep({ outcome: 'late', job: madeJob });
      return leave();
    }
    uploading = true; // 올리다 실패해도 거둘 수 있게 먼저 표시
    await twice(() => store.upload(path, made.glb, MODEL_TYPE), sleep);
    settling = true;
    // 다 만들어 올린 뒤에 적기만 한 번 실패했다고 처음부터 다시 만들지 않게, 적기도 한 번 더 해 본다.
    // 첫 번째가 사실은 적혔더라도 두 번째는 「이미 ready인 줄의 늦은 ready」라 true가 온다
    const settled = await twice(() => db.modelSettle(id, 'ready', { maker, worker }), sleep);
    await forget();
    if (!settled) {
      // 그사이 본인이 캐릭터를 지웠다: 올린 모형도 거둔다(파생 파일이 남지 않게). 원본 에셋 보관 폴더도 지운다
      await store.remove([path]).catch(() => log('warn', 'remove model failed', tag));
      await keep({ outcome: 'gone' });
      log('info', 'model gone (deleted while making)', tag);
      return { outcome: 'gone', id };
    }
    await keep({ outcome: 'ready', glb: made.glb, stats: made.stats ?? null, job: madeJob, check });
    log('info', 'model ready', {
      ...tag, ms: now() - t0, bytes: check.bytes, tris: check.tris, height: check.height, images: check.images, service: made.stats,
    });
    return { outcome: 'ready', id };
  } catch (err) {
    const reason = reasonOf(err);
    const job = err?.job ?? madeJob;
    if (late()) {
      await keep({ outcome: 'late', reason, job });
      return leave();
    }
    // 정리(ready로 적기)를 부르다 난 오류면 적혔는지 알 수 없다. 적혔는데 파일을 거두면 ready인데 파일이 없게 되므로 그대로 둔다
    if (uploading && !settling) await store.remove([path]).catch(() => log('warn', 'remove model failed', tag));
    if (err?.permanent) {
      await keep({ outcome: 'failed', reason, job });
      return fail(reason, true);
    }
    if (err?.bad) {
      // 결과 탓: maxBad번째(trellis 세 번째, meshy 두 번째)면 그만둔다. 아니면 2분, 4분 뒤 다른 seed로 다시
      if (badFails + 1 >= maxBad) {
        await keep({ outcome: 'failed', reason, job });
        return fail(reason, true);
      }
      await db.modelRelease(id, worker, 120 * 2 ** badFails, true);
    } else {
      // 서비스·저장소 탓: 처음 두 번은 2분, 4분, 그 뒤로는 한 시간씩 쉬며 여덟 번까지
      if (attempts >= MODELS_MAX_OUTAGE_ATTEMPTS) {
        await keep({ outcome: 'failed', reason, job });
        return fail(reason, true);
      }
      const outages = Math.max(1, attempts - badFails);
      await db.modelRelease(id, worker, outages < MODELS_MAX_BAD ? 120 * 2 ** (outages - 1) : OUTAGE_DELAY, false);
    }
    await keep({ outcome: 'retry', reason, job });
    log('warn', `model retry later (${reason})`, { ...tag, detail: String(err?.message ?? '').slice(0, 160) });
    return { outcome: 'retry', reason, id, trouble: true, down: err?.down === true };
  }
}

/** 모형 한 건을 만든 뒤 다음 건까지 쉬는 시간. 3D 서비스는 한가하면 바로 다음 건을 받는다 */
export const MODELS_GAP_MS = 2_000;
/** 잇달아 실패할 때 쉬는 시간의 끝(1분에서 두 배씩 늘어난다) */
export const MODELS_REST_MAX_MS = 3_600_000;
/**
 * 서비스가 꺼져 있을 때 다시 보는 간격 [처음, 끝]: 1분에서 두 배씩 늘리되 끝이 2분이라 1분 뒤, 그 뒤로는 2분마다 본다.
 * 꺼진 동안 /health는 2분에 한 번(한 시간에 서른 번)이고, 돌아온 서비스를 2분 안에 알아챈다
 * (일하다 잇달아 실패해 쉬는 중이면 그 쉼이 먼저다: 위 MODELS_REST_MAX_MS)
 */
export const MODELS_DOWN_REST_MS = [60_000, 120_000];
/** 서비스가 살아 있다고 본 뒤 이만큼은 다시 묻지 않는다(할 일이 없어도 그 PC를 몇 초마다 깨우지 않게) */
export const MODELS_HEALTH_TTL_MS = 60_000;

/**
 * 모형 일꾼이 돌 때마다 부르는 「모형 한 건」. 돌려주는 값은 일을 했는가(false면 부른 쪽이 잠깐 쉰다).
 * - 3D 서비스가 꺼져 있으면(터널이 끊겼거나 그 PC가 꺼짐) 줄을 잡지 않는다: 잡은 횟수를 쓰지 않고, 실패로 굳히지도 않는다.
 *   1분 뒤, 그 뒤로는 2분마다 다시 본다(볼 때마다 /health 한 번). 돌아오면 바로 잇는다.
 * - 한 건을 만들면 MODELS_GAP_MS 쉬고 다음 건으로.
 * - 실패하면(trouble) 1분, 2분, 4분… 쉰다(끝은 한 시간). 일을 하다 서비스가 끊겼으면(down) 다음 차례에 서비스부터 다시 본다.
 * - run이 던진 오류는 여기서 받는다(DB에 모형 함수가 아직 없을 때도 다른 일은 그대로 돈다).
 * - run이 halt를 돌려주면(바깥 3D 서비스에 요청하지 않은 줄이 왔다: 0021 전의 DB) 3D 모형을 멈춘다. 다시 띄울 때까지
 *   서비스도 DB도 묻지 않는다(halted()가 참. 일꾼 본체의 모형 고리가 끝난다). 한 장 그리기·방향 그림은 그대로 돈다
 */
export function createModelsTurn({
  run, ready, log = () => {}, now = Date.now, gapMs = MODELS_GAP_MS, restMaxMs = MODELS_REST_MAX_MS,
  downRestMs = MODELS_DOWN_REST_MS, healthTtlMs = MODELS_HEALTH_TTL_MS,
}) {
  let fails = 0;
  let downs = 0;
  let restUntil = 0;
  let healthyUntil = 0;
  let halted = false;
  async function modelsTurn() {
    if (halted) return false;
    if (now() < restUntil) return false;
    if (now() >= healthyUntil) {
      let up = false;
      try {
        up = (await ready()) === true;
      } catch {
        up = false;
      }
      if (!up) {
        downs += 1;
        const rest = Math.min(downRestMs[0] * 2 ** (downs - 1), downRestMs[1]);
        restUntil = now() + rest;
        // 꺼진 동안 기록이 쌓이지 않게: 처음과, 그 뒤로는 여섯 번째마다만 남긴다(2분마다 보면 12분에 한 줄)
        if (downs === 1 || downs % 6 === 0) log('warn', 'model service down: waiting', { minutes: Math.round(rest / 60_000), downs });
        return false;
      }
      if (downs) log('info', 'model service back', { downs });
      downs = 0;
      healthyUntil = now() + healthTtlMs;
    }
    let v;
    try {
      v = await run();
    } catch (err) {
      log('warn', 'models error', { name: err?.name, code: err?.code, message: String(err?.message ?? '').slice(0, 200) });
      v = { outcome: 'error', trouble: true };
    }
    if (v.halt === true) {
      halted = true;
      log('warn', 'models halted until restart', { outcome: v.outcome });
      return false;
    }
    if (v.down) healthyUntil = 0;
    if (v.trouble) {
      fails += 1;
      const rest = Math.min(60_000 * 2 ** (fails - 1), restMaxMs);
      restUntil = now() + rest;
      log('warn', 'models resting', { minutes: Math.round(rest / 60_000), fails });
    } else if (v.outcome === 'ready') {
      fails = 0;
      restUntil = now() + gapMs;
    }
    return v.outcome !== 'idle';
  }
  /** 쉬는 중이면 남은 시간(ms), 아니면 0. 고리가 한 건 뒤 MODELS_GAP_MS만 쉬게(한가할 때 쉬는 시간까지 기다리지 않게) */
  modelsTurn.restLeft = () => Math.max(0, restUntil - now());
  /** 3D 모형을 멈췄는가(위 halt). 참이면 다시 띄울 때까지 이 차례는 아무것도 하지 않는다 */
  modelsTurn.halted = () => halted;
  return modelsTurn;
}
