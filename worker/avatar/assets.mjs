// 원본 에셋 남기기: 그림과 3D를 만들 때 생기는 중간 산출물(지금까지는 버리던 것)을 일꾼 폴더 밖 보관 폴더에 캐릭터 id마다 모은다.
// 나중에 누구 캐릭터였는지, 어떤 모델로 얼마나 걸려 무엇을 만들었는지 알 수 있게 JSON 기록을 함께 둔다(모으는 도구가 읽는다).
//   켜기: 일꾼 환경 변수 AVATAR_ASSET_ARCHIVE_DIR(절대 경로, 이 저장소 밖). 없으면 끈다(아무것도 쓰지 않는다)
//   <보관 폴더>/<캐릭터 id>/
//     drawing.png, draw.json                       그림 단계: 올린 캐릭터 그림(같은 바이트)과 그 기록
//     meshy-raw.glb, meshy-task.json, tidy.json    (meshy) 받은 그대로의 GLB(면 줄이기 전), 작업 기록, 다듬기 전후 수치
//     trellis-stats.json                           (trellis) 3D 서비스가 X-Avatar3D-Stats에 실은 수치
//     model.glb                                    올린 휴대폰용 GLB(같은 바이트)
//   모든 JSON은 schema·character_id·user_id를 싣는다(누구 캐릭터였는지). 칸은 README의 「원본 에셋 남기기」
// 원칙:
//   - 원본 사진은 남기지 않는다(사진 원본은 운영 저장소에만). 캐릭터 그림과 3D 모형, 그 기록만
//   - 키와 서명된 주소는 남기지 않는다: 기록은 정해 둔 칸만, 모양을 보고 골라 쓴다(받은 답을 통째로 쓰지 않는다)
//   - 쓰기 실패가 일을 막지 않는다: 여기 함수는 던지지 않고 경고 한 줄만 남긴다. 디스크가 느리면 WRITE_WAIT_MS만 기다리고
//     넘어간다(쓰기는 뒤에서 마저 한다)
//   - 지운 캐릭터는 따라 지운다: 3D를 만드는 사이 지워졌으면 바로(gone), 그 뒤에 지운 것은 한가할 때(prune, 일꾼이 한 시간에 한 번)
//   - 폴더 700, 파일 600. 임시 파일에 쓴 뒤 바꿔 끼운다(모으는 도구가 반쪽 파일을 읽지 않게)
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUuid } from '../../src/lib/avatar/rules.ts';

export const ASSET_ARCHIVE_ENV = 'AVATAR_ASSET_ARCHIVE_DIR';
/** 이 저장소의 맨 위. 보관 폴더는 이 밖이어야 한다(사람의 그림이 git 작업 폴더에 섞이지 않게) */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** 기록 모양의 이름. 칸의 뜻을 바꾸면 뒤의 숫자를 올린다(모으는 도구가 본다) */
export const ASSET_SCHEMA = 'joyeondang-avatar-assets@1';
export const ASSET_FILES = Object.freeze({
  drawing: 'drawing.png',
  draw: 'draw.json',
  meshyRaw: 'meshy-raw.glb',
  meshyTask: 'meshy-task.json',
  tidy: 'tidy.json',
  trellisStats: 'trellis-stats.json',
  model: 'model.glb',
});
/** 쓰기 하나를 기다리는 끝(넘으면 기다리지 않고 넘어간다. 그림·3D 만들기를 붙잡지 않게) */
export const WRITE_WAIT_MS = 20_000;
/** meshy-task.json에 남기는 시도 수(넘으면 오래된 것부터 뺀다) */
export const ATTEMPTS_KEPT = 20;
/** 지우지 않은 그림의 상태(이 밖이거나 줄이 없으면 정리 때 그 폴더를 지운다) */
const LIVE = new Set(['pending', 'queued', 'drawing', 'ready']);
const PRUNE_BATCH = 100;
const TASK_ID = /^[A-Za-z0-9_-]{1,100}$/;
const MODEL_NAME = /^[A-Za-z0-9._:-]{1,64}$/;
const STATUS = /^[A-Z_]{1,32}$/;
const REASON = /^[a-z_]{1,32}$/;

const inside = (root, p) => {
  const r = relative(resolve(root), resolve(p));
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

/**
 * 환경 변수 값 → {dir, why}. dir이 null이면 끈다: why는 unset(비었음), not_absolute(상대 경로), inside_repo(이 저장소 안).
 * 폴더가 있는지는 여기서 보지 않는다(openAssetArchive가 만들고 실제 자리를 다시 본다)
 */
export function archiveDirOf(value, { repoRoot = REPO_ROOT } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return { dir: null, why: 'unset' };
  if (!isAbsolute(raw)) return { dir: null, why: 'not_absolute' };
  const dir = resolve(raw);
  if (inside(repoRoot, dir)) return { dir: null, why: 'inside_repo' };
  return { dir, why: null };
}

/**
 * 일꾼이 시작할 때 한 번: 보관 폴더를 만들고(700) 실제 자리(심볼릭 링크를 따라간 곳)가 이 저장소 밖인지 다시 본다.
 * 끄거나 쓸 수 없으면 null(경고 한 줄. 일꾼은 그대로 돈다)
 */
export async function openAssetArchive({ env = process.env, worker = null, version = null, log = () => {}, now = Date.now, repoRoot = REPO_ROOT } = {}) {
  const { dir, why } = archiveDirOf(env[ASSET_ARCHIVE_ENV], { repoRoot });
  if (!dir) {
    if (why !== 'unset') log('warn', `asset archive off: ${why}`, {});
    return null;
  }
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const real = await realpath(dir);
    if (inside(await realpath(repoRoot), real)) {
      log('warn', 'asset archive off: inside_repo', {});
      return null;
    }
    return createAssetArchive({ dir: real, worker, version, log, now });
  } catch (err) {
    log('warn', 'asset archive off: folder not usable', { code: err?.code ?? null });
    return null;
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const word = (v, re) => (typeof v === 'string' && re.test(v) ? v : null);
const bool = (v) => (typeof v === 'boolean' ? v : null);

/** 사진 살피기 판독의 요약(사람 수, 사람 사진인가, 아이로 보이는가, 애매한가). 사진은 담지 않는다 */
function checkOf(v) {
  const c = v && typeof v === 'object' ? v : {};
  return {
    ok: c.ok === true,
    person_count: int(c.person_count),
    photo_of_person: bool(c.photo_of_person),
    likely_under14: bool(c.likely_under14),
    uncertain: bool(c.uncertain),
  };
}

/** 숫자만 있는 작은 묶음(걸린 초, 토큰 수 등). 이름이 짧은 칸만. flags면 참·거짓 값도 남긴다 */
function numbersOf(v, flags = false) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (/^[a-z_]{1,32}$/.test(k) && (num(x) !== null || (flags && typeof x === 'boolean'))) out[k] = x;
  }
  return Object.keys(out).length ? out : null;
}

/** 보낸 Meshy 설정(meshy.mjs의 meshySettings + yaw). 정해 둔 이름만, 짧은 값만 */
function settingsOf(v) {
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const k of ['ai_model', 'geometry_resolution', 'texture_resolution', 'topology']) {
    if (typeof v[k] === 'string' && MODEL_NAME.test(v[k])) out[k] = v[k];
  }
  for (const k of ['should_texture', 'enable_pbr', 'should_remesh', 'image_enhancement']) if (typeof v[k] === 'boolean') out[k] = v[k];
  for (const k of ['target_polycount', 'yaw']) if (num(v[k]) !== null) out[k] = v[k];
  if (Array.isArray(v.target_formats)) out.target_formats = v.target_formats.filter((f) => typeof f === 'string' && /^[a-z0-9]{1,8}$/.test(f));
  return out;
}

/**
 * 보관 폴더 하나(dir은 실제 자리). 여기 함수는 던지지 않는다: 쓰지 못하면 경고 한 줄과 false.
 *   drawing({id, uid, png, attempt, visionModel, imageModel, check, seconds, image, usage})   그림 단계(ready로 적은 뒤)
 *   modelRaw({id, uid, raw, stats, provider})   받은 그대로의 GLB(그 서비스 쪽 사본을 지우기 전에. models.mjs의 keepRaw)
 *   modelEnd({id, uid, provider, maker, outcome, reason, attempt, glb, stats, job, check})   3D 한 차례가 끝날 때(keepAssets)
 *   prune({db})   지운 캐릭터의 폴더를 지운다(일꾼이 한가할 때 한 시간에 한 번). 돌려주는 값은 지운 폴더 수
 *   flush()       뒤에서 마저 하는 쓰기를 기다린다(시험, 끝낼 때)
 */
export function createAssetArchive({ dir, worker = null, version = null, log = () => {}, now = Date.now, waitMs = WRITE_WAIT_MS }) {
  const iso = (ms) => new Date(ms).toISOString();
  const folder = (id) => join(dir, id);
  const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const head = (id, uid) => ({ schema: ASSET_SCHEMA, character_id: id, user_id: uid });
  const fileOf = (name, bytes) => ({ name, bytes: bytes.length, sha256: sha256(bytes) });
  const pending = new Set();
  /** 이번 3D 차례에서 받은 그대로의 GLB(modelEnd가 그 시도의 기록에 싣는다) */
  const rawSeen = new Map();

  async function put(id, name, data) {
    const at = folder(id);
    await mkdir(at, { recursive: true, mode: 0o700 });
    const path = join(at, name);
    const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await writeFile(tmp, data, { mode: 0o600 });
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  /**
   * 일 하나를 하고 참·거짓을 돌려준다(던지지 않는다). waitMs를 넘으면 기다리지 않고 false(일은 뒤에서 마저 하고 flush가 기다린다)
   */
  async function bounded(what, id, fn) {
    const work = fn().then(() => true, (err) => {
      log('warn', `asset archive: ${what} not written`, { id, code: err?.code ?? null });
      return false;
    });
    pending.add(work);
    work.finally(() => pending.delete(work));
    let timer;
    const late = new Promise((r) => {
      timer = setTimeout(() => r('late'), waitMs);
      timer.unref?.();
    });
    const r = await Promise.race([work, late]);
    clearTimeout(timer);
    if (r === 'late') {
      log('warn', `asset archive: ${what} slow, not waiting`, { id });
      return false;
    }
    return r;
  }

  /** meshy-task.json에 이번 시도를 더한다(있던 기록은 그대로, ATTEMPTS_KEPT를 넘으면 오래된 것부터 뺀다) */
  async function addMeshyAttempt(id, uid, x) {
    const path = join(folder(id), ASSET_FILES.meshyTask);
    let attempts = [];
    try {
      const old = JSON.parse(await readFile(path, 'utf8'));
      if (old?.character_id === id && Array.isArray(old.attempts)) attempts = old.attempts;
    } catch {
      attempts = [];
    }
    const job = x.job && typeof x.job === 'object' ? x.job : {};
    const times = job.times && typeof job.times === 'object' ? job.times : {};
    const at = (v) => (num(v) !== null && v > 0 ? iso(v) : null);
    const raw = rawSeen.get(id) ?? null;
    rawSeen.delete(id);
    attempts.push({
      at: iso(now()),
      worker,
      worker_version: version,
      attempt: int(x.attempt),
      outcome: word(x.outcome, REASON),
      reason: word(x.reason, REASON),
      task: word(job.task, TASK_ID),
      resumed: job.resumed === true,
      polls: int(job.polls),
      credits: num(job.credits),
      seconds: num(job.seconds),
      meshy_times: { created_at: at(times.created_at), started_at: at(times.started_at), finished_at: at(times.finished_at) },
      statuses: (Array.isArray(job.statuses) ? job.statuses : []).slice(0, 20).map((s) => ({
        at: num(s?.at) !== null ? iso(s.at) : null, status: word(s?.status, STATUS), progress: num(s?.progress),
      })),
      raw,
    });
    const settings = settingsOf(job.settings);
    await put(id, ASSET_FILES.meshyTask, json({
      ...head(id, uid),
      provider: 'meshy',
      ai_model: settings?.ai_model ?? word(x.maker, MODEL_NAME),
      settings,
      updated_at: iso(now()),
      attempts: attempts.slice(-ATTEMPTS_KEPT),
    }));
  }

  /** 올린 GLB의 확인 결과(model.ts의 checkGlb)에서 기록할 수치 */
  const checkGlbOf = (c) => (c && typeof c === 'object'
    ? { bytes: int(c.bytes), triangles: int(c.tris), height: num(c.height), images: int(c.images) }
    : null);

  return {
    dir,

    async drawing({ id, uid, png, attempt = null, visionModel = null, imageModel = null, check = null, seconds = null, image = null, usage = null }) {
      if (!isUuid(id) || !isUuid(uid) || !(png instanceof Uint8Array)) return false;
      return bounded('drawing', id, async () => {
        await put(id, ASSET_FILES.drawing, png);
        const img = image && typeof image === 'object' ? image : {};
        await put(id, ASSET_FILES.draw, json({
          ...head(id, uid),
          stage: 'drawing',
          written_at: iso(now()),
          worker,
          worker_version: version,
          attempt: int(attempt),
          vision_model: word(visionModel, MODEL_NAME),
          image_model: word(imageModel, MODEL_NAME),
          check: checkOf(check),
          seconds: numbersOf(seconds),
          image: {
            width: int(img.width), height: int(img.height),
            fitted_from: typeof img.fittedFrom === 'string' && /^\d{1,5}x\d{1,5}$/.test(img.fittedFrom) ? img.fittedFrom : null,
          },
          usage: numbersOf(usage),
          file: fileOf(ASSET_FILES.drawing, png),
        }));
      });
    },

    async modelRaw({ id, uid, raw, stats = null, provider = 'meshy' }) {
      if (!isUuid(id) || !isUuid(uid) || !(raw instanceof Uint8Array)) return false;
      const name = provider === 'meshy' ? ASSET_FILES.meshyRaw : `${String(provider).replace(/[^a-z0-9]/g, '').slice(0, 16) || 'service'}-raw.glb`;
      return bounded('raw model', id, async () => {
        await put(id, name, raw);
        rawSeen.set(id, { name, task: word(stats?.task, TASK_ID), ...fileOf(name, raw) });
      });
    },

    async modelEnd({ id, uid, provider = 'trellis', maker = null, outcome, reason = null, attempt = null, glb = null, stats = null, job = null, check = null }) {
      if (!isUuid(id)) return false;
      if (outcome === 'gone') {
        // 만드는 사이 본인이 그림을 지웠다: 이 캐릭터의 보관 폴더도 지운다(방금 쓴 원본까지)
        rawSeen.delete(id);
        return bounded('removal', id, () => rm(folder(id), { recursive: true, force: true }));
      }
      if (!isUuid(uid)) return false;
      return bounded('model', id, async () => {
        if (provider === 'meshy') await addMeshyAttempt(id, uid, { outcome, reason, attempt, job, maker });
        if (outcome !== 'ready' || !(glb instanceof Uint8Array)) return;
        await put(id, ASSET_FILES.model, glb);
        const s = stats && typeof stats === 'object' ? stats : {};
        const model = fileOf(ASSET_FILES.model, glb);
        if (provider === 'meshy') {
          await put(id, ASSET_FILES.tidy, json({
            ...head(id, uid),
            written_at: iso(now()),
            task: word(s.task, TASK_ID),
            yaw: num(job?.settings?.yaw),
            before: {
              bytes: int(s.raw_bytes), triangles: int(s.raw_tris),
              texture: { width: int(s.raw_tex_w), height: int(s.raw_tex_h), type: word(s.raw_tex_type, /^[a-z0-9]{1,16}$/) },
            },
            after: {
              bytes: int(s.bytes), triangles: int(s.tris),
              texture: { width: int(s.tex_w), height: int(s.tex_h), type: 'jpeg', jpeg_quality: int(s.jpeg_q) },
            },
            simplified: bool(s.simplified),
            check: checkGlbOf(check),
            file: model,
          }));
        } else {
          await put(id, ASSET_FILES.trellisStats, json({
            ...head(id, uid),
            written_at: iso(now()),
            worker,
            worker_version: version,
            maker: word(maker, MODEL_NAME),
            attempt: int(attempt),
            service: numbersOf(s, true),
            check: checkGlbOf(check),
            file: model,
          }));
        }
      });
    },

    async prune({ db }) {
      if (typeof db?.characterStates !== 'function') return 0;
      let removed = 0;
      await bounded('prune', null, async () => {
        const names = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && isUuid(e.name)).map((e) => e.name);
        const gone = [];
        let seen = 0;
        for (let k = 0; k < names.length; k += PRUNE_BATCH) {
          const batch = names.slice(k, k + PRUNE_BATCH);
          const states = await db.characterStates(batch);
          if (!(states instanceof Map)) throw Object.assign(new Error('bad states'), { code: 'db_error' });
          seen += batch.filter((n) => states.has(n)).length;
          for (const n of batch) if (!LIVE.has(states.get(n))) gone.push(n);
        }
        // 폴더가 여럿인데 한 줄도 읽히지 않으면 다른 DB를 읽었을 수 있다: 아무것도 지우지 않는다
        if (names.length >= 3 && seen === 0) {
          log('warn', 'asset archive prune skipped: no characters matched', { folders: names.length });
          return;
        }
        for (const n of gone) {
          rawSeen.delete(n);
          await rm(folder(n), { recursive: true, force: true });
          removed += 1;
        }
      });
      return removed;
    },

    flush: () => Promise.all([...pending]).then(() => undefined),
  };
}
