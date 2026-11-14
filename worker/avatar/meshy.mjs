// 3D 모형 제공자 'meshy': 고른 캐릭터 그림 한 장을 바깥 3D 서비스(Meshy, 미국)의 Image to 3D API로 보내 GLB를 받는다.
// 모형 일꾼(models.mjs의 processModel)이 trellis 서비스 어댑터와 같은 모양으로 부른다:
//   ready() → boolean, toGlb(png, {key, badFails, onJob}) → {glb, stats, raw, job}, forget(key)
//   (raw: 받은 그대로의 GLB, job: 원본 에셋 기록에 적을 작업 기록. 둘 다 원본 에셋 남기기(assets.mjs)가 쓴다)
// 받은 GLB는 이 맥에서 걷기 엔진의 약속에 맞춘다(glb.mjs의 tidy). 사진 원본은 보내지 않는다(캐릭터 그림만).
// 사람이 「3D 만들기」로 요청한 그림만 보낸다(requestedOnly): 잡은 줄에 요청한 때(0021의 잡기가 싣는 requested_at)가
// 없으면 processModel이 보내지 않고 3D 모형을 멈춘다. 0021 전의 잡기는 걷기에 입은 캐릭터를 저절로 주기 때문이다.
// 그것도 Meshy로 보낸다고 알리고 받은 요청만(consent 'meshy'): 잡은 줄의 via가 다르면 보내지 않고 reconsent로 돌려준다.
// 돈이 드는 서비스라 안전장치를 둔다:
//   - 결과가 이상해 다시 만드는 것은 한 번까지(maxBad 2). Meshy가 FAILED로 끝낸 작업의 크레딧은 Meshy가 돌려준다.
//     묻는 작업이 없어진 것(404)도 결과 탓으로 센다: 요청 하나에 새 작업은 두 건까지
//   - 만든 작업의 id를 장부(이 맥의 작은 JSON 파일)에 적는다. 기다리다 시간이 넘거나 일꾼이 멈춘 뒤 같은 그림을 다시 잡으면
//     새로 만들지 않고 그 작업을 이어 본다. 결과가 이상하다고 판정된 뒤(DB의 bad_fails가 늘었다)와, 같은 id에 다시 그린
//     그림이 들어왔을 때(보낸 PNG의 지문이 다르다)만 새로 만든다
//   - 하루(KST) 만들기 요청 상한(dailyMax, 기본 120). 넘으면 ready()가 false라 줄을 잡지 않는다. 셈은 이 프로세스의 장부에
//     있고, 아래 키 잠금으로 키 하나에 프로세스 하나라 키마다의 셈이 된다(DB의 하루 3D 요청 상한 100보다 작게 두지 않는다)
//   - 키가 안 되거나(401·403) 크레딧이 없으면(402, 잔액이 한 건 값보다 적음) 한 시간씩 쉬며 경고를 남긴다
//   - 키 하나에 클라이언트 하나(keyLock): 이 사용자의 고정 자리(DEFAULT_LOCK_DIR)에 키의 해시로 이름 지은 잠금 파일을 쥔다.
//     장부 파일을 어디에 두든 같은 키를 쓰는 둘째 프로세스(일꾼, --once, 한 건 시험)는 만들지 않는다: 같은 키로 둘이 돌면
//     이어 볼 작업이 다른 장부에 있어 같은 요청에 돈을 두 번 쓰고, 끊긴 만들기가 남의 작업을 제 것으로 삼아 지우고,
//     하루 상한도 프로세스 수만큼 늘어난다. 장부 파일에도 같은 잠금(<장부>.lock)을 둔다. 잠금에는 pid와 그 프로세스가
//     시작한 때를 적어, 다시 켠 뒤 같은 pid를 다른 프로세스가 쓰면 죽은 잠금으로 보고 넘겨받는다
// 보낸 그림과 만든 모형은 Meshy에 오래 두지 않는다: 끝난 작업(다 받음·그만둠·지운 그림, 새 작업으로 바꾼 옛 작업)은
// DELETE /openapi/v1/image-to-3d/<id>로 지운다(작업과 모형·자료를 영구히 지운다). 도는 중(409)이거나 닿지 않으면
// 장부의 「지울 작업」에 남겨 다음 차례에 다시 지운다. Meshy는 지우지 못한 결과도 요금제에 따라 3일이나 14일 뒤 지운다.
// 키는 받기만 하고 기록·오류·장부 어디에도 남기지 않는다. 결과 파일을 받을 때는 키를 싣지 않는다(다른 주소).
// API의 이름과 값(2026-11 docs.meshy.ai에서 확인)과 출처는 README의 「Meshy」에 적었다.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, uptime } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MESHY_API_URL = 'https://api.meshy.ai';
/** 만드는 모델과 DB에 적을 이름(model_maker) */
export const MESHY_AI_MODEL = 'meshy-7.1';
export const MESHY_MAKER = 'meshy-7.1';
/**
 * 임대: 만들기 요청 + 기다리기(최대 10분) + 받기 + 다듬기 + 올리기에 넉넉하게.
 * trellis(10분)보다 길다. 임대가 끝나 가면 processModel이 물러나고, 다시 잡으면 장부의 작업을 이어 본다
 */
export const MESHY_LEASE_SECONDS = 1200;
/** 결과가 이상하면 다시 만드는 것은 한 번까지(두 번째 이상한 결과에서 그만둔다) */
export const MESHY_MAX_BAD = 2;
/** 작업 상태를 묻는 간격과, 한 번 잡았을 때 기다리는 끝 */
export const MESHY_POLL_MS = 5_000;
export const MESHY_POLL_MAX_MS = 600_000;
/**
 * 하루(KST) 만들기 요청 상한(이 키, 이 프로세스). DB가 받는 모두 합친 하루 3D 요청 100(0021의 model_day_max, 관리자 밖)보다
 * 넉넉하게: 이 셈은 결과 탓으로 다시 만든 작업과 관리자의 요청까지 센다. 작으면 DB가 받은 요청이 다음 날까지 기다린다.
 * 한 건 35~40크레딧이라 하루 최대 약 4,800크레딧. 키의 월 크레딧 한도(Meshy 대시보드)와 함께 둔다(README)
 */
export const MESHY_DAILY_MAX = 120;
/** 키·크레딧 문제로 쉬는 시간 */
export const MESHY_PAUSE_MS = 3_600_000;
/** 한 건 값(크레딧): meshy-7.1 텍스처 2K 30 + Ultra 5, 다시 짜기(remesh) 5를 넉넉히. 잔액이 이보다 적으면 잡지 않는다 */
export const MESHY_JOB_CREDITS = 40;
/** 다시 짤 면(삼각형) 수의 목표. 걷기 엔진의 상한(1만) 아래로 바로 오게. 넘으면 이 맥에서 줄인다 */
export const MESHY_TARGET_POLYCOUNT = 9_000;
export const MESHY_GEOMETRY = 'ultra';
/** 형상 해상도 이름 → API 값. Ultra는 2k(2048³)와 4k(4096³) 둘 다 +5크레딧이다. 휴대폰용으로 다시 짜므로 2k */
const GEOMETRY = { standard: 'standard', ultra: '2k', '2k': '2k', '4k': '4k' };
/** 잔액을 확인한 뒤 이만큼은 다시 묻지 않는다 */
const BALANCE_TTL_MS = 300_000;
/** 장부의 작업을 이어 볼 수 있는 동안. Meshy는 결과를 길어야 3일(Studio 요금제는 14일) 둔다 */
const TASK_KEEP_MS = 60 * 3_600_000;
/** 막 만든 작업은 묻기에 잠깐 404가 올 수 있다(아직 보이지 않음). 이 동안의 404는 다시 묻는다 */
export const MESHY_FRESH_TASK_MS = 120_000;
/** 지울 작업을 한 차례에 이만큼까지 지운다(초당 20번 제한 안에서 넉넉히) */
const DELETE_BATCH = 5;
/** 이만큼 지나도 지우지 못한 작업은 장부에서 뺀다(Meshy가 보관 기한(길어야 14일)에 이미 지웠다) */
const TRASH_KEEP_MS = 15 * 24 * 3_600_000;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const CREATE_TIMEOUT_MS = 120_000;
const GET_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const TASK_ID = /^[A-Za-z0-9_-]{1,100}$/;
/** 장부에 적는 보낸 그림의 지문(sha256 16진수) */
const PNG_SUM = /^[0-9a-f]{64}$/;
const KST_MS = 9 * 3_600_000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const failure = (code, message, extra = {}) => Object.assign(new Error(message ?? code), { code, ...extra });
const intIn = (v, lo, hi, fallback) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
};

/** 한국 시간의 날짜(YYYY-MM-DD). 하루 상한을 세는 단위 */
export const kstDay = (ms) => new Date(ms + KST_MS).toISOString().slice(0, 10);

/**
 * 환경 변수 값을 API 값으로. 이상한 값은 기본으로 돌린다.
 *   geometry: standard | ultra(=2k) | 2k | 4k, targetPolycount: 100~300000(API 범위),
 *   imageEnhancement: 끔이 기본(고른 그림의 모습을 그대로. 켜면 Meshy가 그림을 먼저 다듬는다)
 */
export function meshyOptions({ geometry = MESHY_GEOMETRY, targetPolycount = MESHY_TARGET_POLYCOUNT, imageEnhancement = false } = {}) {
  const key = String(geometry ?? '').trim().toLowerCase();
  return {
    geometry_resolution: GEOMETRY[key] ?? GEOMETRY[MESHY_GEOMETRY],
    target_polycount: intIn(targetPolycount, 100, 300_000, MESHY_TARGET_POLYCOUNT),
    image_enhancement: imageEnhancement === true || imageEnhancement === '1' || imageEnhancement === 'true',
  };
}

/** 만들기 요청의 설정(본문에서 그림을 뺀 것). 원본 에셋 기록(meshy-task.json)도 보낸 그대로 이것을 적는다 */
export function meshySettings(options = meshyOptions()) {
  return {
    ai_model: MESHY_AI_MODEL,
    geometry_resolution: options.geometry_resolution,
    should_texture: true,
    texture_resolution: '2k',
    enable_pbr: false,
    should_remesh: true,
    topology: 'triangle',
    target_polycount: options.target_polycount,
    image_enhancement: options.image_enhancement,
    target_formats: ['glb'],
  };
}

/** 만들기 요청 본문. 그림은 data URI로 싣는다(바깥에 열린 주소를 만들지 않는다) */
export function meshyBody(png, options = meshyOptions()) {
  return {
    image_url: `data:image/png;base64,${Buffer.from(png.buffer, png.byteOffset, png.byteLength).toString('base64')}`,
    ...meshySettings(options),
  };
}

/** 작업의 때(Meshy가 주는 밀리초): 만든 때, 시작한 때, 끝난 때. 기록용으로 숫자만 고른다(주소가 든 칸은 보지 않는다) */
function taskTimes(task) {
  const pick = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  if (!task || typeof task !== 'object') return null;
  return { created_at: pick(task.created_at), started_at: pick(task.started_at), finished_at: pick(task.finished_at) };
}

// ───────── 장부: {day, created, tasks: {그림 id: {task, at, bad, png}}, trash: {작업 id: {at, tries}}} (png = 보낸 그림의 sha256)
//   tasks  그림마다 만든(이어 볼) 작업, trash  Meshy에서 지울 작업(지울 때까지 남는다)
/** 장부 파일의 기본 자리(이 폴더의 state/, git에 들어가지 않는다) */
export const DEFAULT_LEDGER_FILE = fileURLToPath(new URL('./state/meshy.json', import.meta.url));

/**
 * 키마다의 잠금 파일을 두는 고정 자리: 이 맥에서 이 사용자의 모든 프로세스가 같은 곳을 본다(장부 자리·저장소 폴더와 상관없이).
 * 일꾼(launchd)과 손으로 띄운 --once·한 건 시험이 같은 키를 쓰면 여기서 만난다
 */
export const DEFAULT_LOCK_DIR = join(homedir(), '.joyeondang', 'meshy-locks');
/**
 * 잠금을 쥔 프로세스가 시작한 때를 견줄 때의 너그러움(ps는 초 단위로 주고, 시계를 맞추면 조금 움직인다).
 * 넉넉히 둔다: 살아 있는 일꾼의 잠금을 죽은 것으로 잘못 보면 같은 키로 둘이 돈다. pid를 다시 쓰는 것은 그보다 한참 뒤다
 */
const START_SLACK_MS = 600_000;

/** 그 pid의 프로세스가 살아 있는가(권한이 없어 신호를 못 보내도 살아 있는 것) */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
};

/** 이 프로세스가 시작한 때(ms) */
const myStart = () => Math.round(Date.now() - process.uptime() * 1000);
/** 이 컴퓨터를 켠 때(ms) */
const bootedAt = () => Date.now() - uptime() * 1000;

/** ps의 지난 시간([[일-]시:]분:초) → 초. 모양이 다르면 null */
export function etimeSeconds(text) {
  const m = /^\s*(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const [, d = '0', h = '0', min, s] = m;
  return ((Number(d) * 24 + Number(h)) * 60 + Number(min)) * 60 + Number(s);
}

/** 그 pid의 프로세스가 시작한 때(ms). ps로 지난 시간을 읽는다. 읽지 못하면 null */
export function processStartedAt(pid) {
  try {
    const r = spawnSync('ps', ['-o', 'etime=', '-p', String(pid)], { encoding: 'utf8', timeout: 3_000 });
    if (r.status !== 0) return null;
    const sec = etimeSeconds(r.stdout);
    return sec === null ? null : Date.now() - sec * 1000;
  } catch {
    return null;
  }
}

/** 죽은 잠금을 넘겨받는 중이라는 표시가 이보다 오래되면 그 표시를 남긴 프로세스가 도중에 멈춘 것이다 */
const TAKEOVER_STALE_MS = 30_000;
/** 잠깐 기다린다(동기. 잠금은 시작할 때 한 번만 쥔다) */
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * 프로세스 하나만 쥐는 잠금 파일({"pid", "started"}: 쥔 프로세스와 그 프로세스가 시작한 때).
 * lock(): 다른 살아 있는 프로세스가 쥐고 있으면 code를 붙여 던진다. 쥔 프로세스가 죽었으면(멈춘 일꾼, launchd가 다시 띄움)
 * 넘겨받는다. pid가 살아 있어도 그 프로세스가 아니면 죽은 잠금이다: 잠금을 쓴 때가 이번에 켜기 전이거나, 지금 그 pid의
 * 프로세스가 시작한 때가 적힌 때와 다르면(다시 켠 뒤 같은 pid를 다른 프로세스가 쓴다). 시작한 때를 읽지 못하면 쥔 것으로
 * 본다(돈은 안전한 쪽: 3D만 꺼진다). 옛 잠금(pid 한 줄)은 pid만 본다. 끝날 때(exit) 지운다.
 * 죽은 잠금을 지우는 것은 한 번에 한 프로세스만(<잠금>.takeover), 그것도 죽었다고 본 그 내용 그대로일 때만 지운다:
 * 다시 켠 뒤 일꾼 여럿이 함께 떠서 같은 죽은 잠금을 보더라도, 먼저 새로 쥔 프로세스의 잠금을 다른 프로세스가 지우고
 * 둘이 함께 쥐는 일이 없게. 시험은 bootAt(켠 때)과 startOf(pid → 시작한 때)를 넣는다
 */
export function fileLock(path, { code = 'ledger_locked', what = 'meshy lock', bootAt = bootedAt, startOf = processStartedAt } = {}) {
  let held = false;
  const takeover = `${path}.takeover`;
  const mine = () => `${JSON.stringify({ pid: process.pid, started: myStart() })}\n`;
  const parse = (text) => {
    try {
      const o = JSON.parse(text);
      if (o && typeof o === 'object' && !Array.isArray(o)) return { pid: Number(o.pid), started: Number(o.started) };
    } catch {
      // 옛 잠금: pid 한 줄
    }
    return { pid: Number.parseInt(text, 10), started: NaN };
  };
  /** 적힌 프로세스가 지금도 그 잠금을 쥐고 있는가 */
  const live = ({ pid, started }) => {
    if (!Number.isInteger(pid) || pid <= 0 || !alive(pid)) return false;
    if (!Number.isFinite(started)) return true;
    if (started < bootAt() - START_SLACK_MS) return false;
    const real = startOf(pid);
    return !(Number.isFinite(real) && Math.abs(real - started) > START_SLACK_MS);
  };
  const take = () => {
    held = true;
    process.once('exit', release);
  };
  function release() {
    if (!held) return;
    held = false;
    try {
      if (parse(readFileSync(path, 'utf8')).pid === process.pid) unlinkSync(path);
    } catch {
      // 이미 없다
    }
  }
  return {
    path,
    lock() {
      if (held) return;
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      for (let tries = 0; tries < 40; tries++) {
        try {
          writeFileSync(path, mine(), { flag: 'wx', mode: 0o600 });
          take();
          return;
        } catch (err) {
          if (err?.code !== 'EEXIST') throw err;
        }
        let text;
        try {
          text = readFileSync(path, 'utf8');
        } catch {
          continue; // 그사이 풀렸다: 다시 쥐어 본다
        }
        const h = parse(text);
        if (h.pid === process.pid) {
          // 이 프로세스(또는 켜기 전에 같은 pid를 쓴 프로세스)의 잠금: 지금의 시작한 때로 다시 적는다
          writeFileSync(path, mine(), { mode: 0o600 });
          take();
          return;
        }
        if (live(h)) throw Object.assign(new Error(`${what} in use by pid ${h.pid}`), { code, pid: h.pid });
        // 죽은 잠금: 넘겨받기는 한 번에 한 프로세스만
        try {
          writeFileSync(takeover, `${process.pid}\n`, { flag: 'wx', mode: 0o600 });
        } catch (err) {
          if (err?.code !== 'EEXIST') throw err;
          try {
            if (Date.now() - statSync(takeover).mtimeMs > TAKEOVER_STALE_MS) unlinkSync(takeover); // 넘겨받다 멈춘 프로세스의 표시
          } catch {
            // 그사이 끝났다
          }
          sleepSync(25);
          continue;
        }
        try {
          let now = null;
          try {
            now = readFileSync(path, 'utf8');
          } catch {
            now = null;
          }
          // 죽었다고 본 그 잠금일 때만 지운다(그사이 다른 프로세스가 새로 쥐었으면 그대로 두고 다시 본다)
          if (now === text) unlinkSync(path);
        } finally {
          try {
            unlinkSync(takeover);
          } catch {
            // 이미 없다
          }
        }
      }
      throw Object.assign(new Error(`${what} not taken`), { code });
    },
    unlock: release,
  };
}

/** 그 키의 잠금 파일(이름은 키의 해시. 키 자체는 어디에도 쓰지 않는다) */
export function keyLockPath(apiKey, dir = DEFAULT_LOCK_DIR) {
  const hash = createHash('sha256').update(`joyeondang-meshy-key:${String(apiKey ?? '').trim()}`).digest('hex').slice(0, 24);
  return join(dir, `meshy-${hash}.lock`);
}

/**
 * 키 하나에 클라이언트 하나(위 머리말). 일꾼과 한 건 시험이 Meshy 서비스를 만들 때 넘긴다(createMeshyService의 lock).
 * 쥐지 못하면 key_locked를 던진다. 시험은 dir로 임시 폴더를 준다
 */
export function keyLock(apiKey, dir = DEFAULT_LOCK_DIR, opts = {}) {
  return fileLock(keyLockPath(apiKey, dir), { code: 'key_locked', what: 'meshy key', ...opts });
}

/**
 * 파일 장부. 쓰기는 임시 파일에 쓴 뒤 바꿔 끼운다(쓰다 멈춰도 반쪽 파일이 남지 않게).
 * lock(): 이 장부를 쓰는 프로세스는 하나만(<장부>.lock, 위 fileLock). 다른 살아 있는 프로세스가 쥐고 있으면 ledger_locked를 던진다
 */
export function fileLedger(path = DEFAULT_LEDGER_FILE, opts = {}) {
  const lock = fileLock(`${path}.lock`, { code: 'ledger_locked', what: 'meshy ledger', ...opts });
  return {
    read() {
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        return null;
      }
    },
    write(state) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      renameSync(tmp, path);
    },
    lock: () => lock.lock(),
    unlock: () => lock.unlock(),
  };
}

/** 메모리 장부(시험과 한 장 시험). 일꾼 본체는 파일 장부를 쓴다 */
export function memoryLedger(initial = null) {
  let state = initial === null ? null : structuredClone(initial);
  return { read: () => (state === null ? null : structuredClone(state)), write: (s) => { state = structuredClone(s); } };
}

function tidyState(raw) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const tasks = {};
  for (const [k, v] of Object.entries(s.tasks && typeof s.tasks === 'object' ? s.tasks : {})) {
    if (v && typeof v.task === 'string' && TASK_ID.test(v.task) && Number.isFinite(v.at)) {
      tasks[k] = { task: v.task, at: v.at, bad: Number.isInteger(v.bad) && v.bad >= 0 ? v.bad : 0 };
      if (typeof v.png === 'string' && PNG_SUM.test(v.png)) tasks[k].png = v.png;
    }
  }
  const trash = {};
  for (const [k, v] of Object.entries(s.trash && typeof s.trash === 'object' && !Array.isArray(s.trash) ? s.trash : {})) {
    if (TASK_ID.test(k) && v && Number.isFinite(v.at)) trash[k] = { at: v.at, tries: Number.isInteger(v.tries) && v.tries >= 0 ? v.tries : 0 };
  }
  return {
    day: typeof s.day === 'string' ? s.day : '',
    created: Number.isInteger(s.created) && s.created >= 0 ? s.created : 0,
    tasks,
    trash,
  };
}

/**
 * Meshy 어댑터. 실패는 까닭을 붙여 던진다(processModel이 갈래를 고른다):
 *   permanent  다시 해도 같다(입력을 받지 않음, 내용 검사): 바로 failed
 *   bad        결과를 쓸 수 없음(Meshy의 생성 실패, 받은 GLB를 다듬지 못함, 결과가 지워짐, 작업이 없어짐): 한 번만 다시
 *   down       서비스·키·크레딧 쪽 사정: 줄을 돌려놓고, 다음 차례에 ready()부터 다시 본다
 *   그 밖       잠깐의 사정(바쁨, 기다리다 시간 넘김, 받기 끊김): 줄을 돌려놓는다. 만든 작업은 장부에 남아 다음에 이어 본다
 * lock: 키 잠금(keyLock). 넘기면 만들 때 먼저 쥐고(다른 살아 있는 프로세스가 같은 키를 쓰면 key_locked를 던진다), 파일 장부도
 * 잠근다(ledger.lock, ledger_locked). 키 잠금을 쥔 서비스만 끊긴 만들기의 작업을 목록에서 찾아 잇는다(같은 키를 이 프로세스
 * 하나만 쓸 때만 「요청 뒤에 생긴, 장부에 없는 작업」이 제 것이다). 일꾼과 한 건 시험은 늘 넘긴다
 */
export function createMeshyService({
  apiKey, tidy, ledger = memoryLedger(), lock = null, fetch: f = globalThis.fetch, log = () => {}, now = Date.now, sleep = wait,
  baseUrl = MESHY_API_URL, dailyMax = MESHY_DAILY_MAX, geometry, targetPolycount, imageEnhancement, yaw = 0,
  pollMs = MESHY_POLL_MS, pollMaxMs = MESHY_POLL_MAX_MS,
}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('meshy api key missing');
  if (typeof tidy !== 'function') throw new Error('glb tools missing');
  const api = String(baseUrl).replace(/\/+$/, '');
  const key = apiKey.trim();
  const auth = { Authorization: `Bearer ${key}` };
  const options = meshyOptions({ geometry, targetPolycount, imageEnhancement });
  const cap = intIn(dailyMax, 0, 100_000, MESHY_DAILY_MAX);
  const turn = Number(yaw);
  const yawDeg = Number.isFinite(turn) && Math.abs(turn) <= 360 ? turn : 0;
  /** 바깥에서 온 글에 키가 섞여 있어도 기록에 남기지 않는다 */
  const scrub = (text) => String(text ?? '').split(key).join('***').slice(0, 160);
  let pausedUntil = 0;
  let okUntil = 0;
  let capNoted = '';
  let lastSweep = -Infinity;
  // 이 키는 이 프로세스만 쓴다(키 잠금), 이 장부도(파일 장부만 잠근다. 메모리 장부는 이 프로세스 안에만 있다)
  const exclusive = typeof lock?.lock === 'function';
  if (exclusive) lock.lock();
  try {
    ledger.lock?.();
  } catch (err) {
    if (exclusive) lock.unlock?.();
    throw err;
  }

  const load = () => tidyState(ledger.read());
  const save = (state) => {
    // 오래된 작업은 이어 보지 않는다(Meshy가 곧 지운다): 지울 작업으로 옮긴다.
    // 아주 오래 지우지 못한 작업은 뺀다(Meshy가 보관 기한에 이미 지웠다)
    for (const [k, v] of Object.entries(state.tasks)) {
      if (now() - v.at <= TASK_KEEP_MS) continue;
      delete state.tasks[k];
      state.trash[v.task] ??= { at: now(), tries: 0 };
    }
    for (const [k, v] of Object.entries(state.trash)) {
      if (now() - v.at <= TRASH_KEEP_MS) continue;
      delete state.trash[k];
      log('warn', 'meshy task not deleted in time: left to Meshy retention', { task: k });
    }
    try {
      ledger.write(state);
    } catch (err) {
      throw failure('ledger_error', `ledger: ${scrub(err?.code ?? err?.message)}`);
    }
  };
  const createdToday = (state) => (state.day === kstDay(now()) ? state.created : 0);
  /**
   * 끝난 작업: 그 그림의 작업이면 장부에서 빼고, del이면 Meshy에서 지울 작업으로 옮긴다(없어진 작업은 옮기지 않는다).
   * 못 적어도 실패의 까닭을 가리지 않는다(다음 판정은 bad_fails가 지킨다)
   */
  const finish = (keyOf, taskId, del = true) => {
    if (!taskId) return;
    const state = load();
    if (keyOf && state.tasks[keyOf]?.task === taskId) delete state.tasks[keyOf];
    if (del) state.trash[taskId] ??= { at: now(), tries: 0 };
    try {
      save(state);
    } catch {
      log('warn', 'meshy ledger write failed');
    }
  };
  const pause = (why, extra = {}) => {
    pausedUntil = now() + MESHY_PAUSE_MS;
    okUntil = 0;
    log('warn', `meshy paused: ${why}`, { minutes: Math.round(MESHY_PAUSE_MS / 60_000), ...extra });
  };
  const capReached = (state) => {
    if (createdToday(state) < cap) return false;
    const day = kstDay(now());
    if (capNoted !== day) {
      capNoted = day;
      log('warn', 'meshy daily cap reached: waiting for the next day (KST)', { max: cap });
    }
    return true;
  };
  const drain = (res) => res.body?.cancel().catch(() => {});
  /** 실패한 답의 글(Meshy는 {message})을 짧게. 키는 지운다 */
  const messageOf = async (res) => {
    try {
      const text = await res.text();
      try {
        return scrub(JSON.parse(text)?.message ?? text);
      } catch {
        return scrub(text);
      }
    } catch {
      return '';
    }
  };
  const ACCOUNT = {
    401: ['meshy_auth', 'api key rejected (401)'],
    402: ['meshy_credits', 'no credits (402)'],
    403: ['meshy_forbidden', 'forbidden (403)'],
  };
  /** 401·402·403이면 쉬기로 하고 까닭을 돌려준다. 그 밖이면 null */
  const accountTrouble = (status, msg) => {
    // 내용 검사에 막힌 것은 그 그림 탓(다시 해도 같다). 그 밖의 403(허용 IP, 요금제, 막힌 키)은 계정 쪽 사정
    if (status === 403 && /moderat|flagged|inappropriate|nsfw/i.test(msg)) {
      return failure('blocked', `meshy 403 ${msg}`, { status, permanent: true });
    }
    const [code, why] = ACCOUNT[status] ?? [];
    if (!code) return null;
    pause(why, { status });
    return failure(code, `meshy ${status} ${msg}`, { status, down: true });
  };

  /**
   * 지울 작업을 Meshy에서 지운다(DELETE, 한 차례에 DELETE_BATCH까지, 오래된 것부터). 지웠거나 이미 없으면(404) 장부에서
   * 뺀다. 도는 중(409)이거나 다른 답이면 남겨 두고 다음 차례에 다시 한다. 닿지 않으면 그 차례는 거기서 멈춘다.
   * 키·크레딧 문제로 쉬는 중이면 묻지 않는다. 던지지 않는다. 돌려주는 값은 지운 수
   */
  async function sweep() {
    if (now() < pausedUntil) return 0;
    lastSweep = now();
    const todo = Object.entries(load().trash).sort((a, b) => a[1].at - b[1].at).slice(0, DELETE_BATCH);
    if (!todo.length) return 0;
    const result = new Map();
    for (const [task] of todo) {
      let res;
      try {
        res = await f(`${api}/openapi/v1/image-to-3d/${encodeURIComponent(task)}`, {
          method: 'DELETE', headers: auth, signal: AbortSignal.timeout(GET_TIMEOUT_MS),
        });
      } catch {
        break; // 닿지 않음: 나머지도 다음 차례에
      }
      await drain(res);
      result.set(task, res.ok || res.status === 404 ? 'gone' : res.status);
    }
    // 그사이 다른 일이 장부를 고쳤을 수 있어 다시 읽고 고친다
    const state = load();
    let deleted = 0;
    const kept = [];
    for (const [task, r] of result) {
      if (!state.trash[task]) continue;
      if (r === 'gone') {
        delete state.trash[task];
        deleted += 1;
      } else {
        state.trash[task].tries += 1;
        if (state.trash[task].tries === 1) kept.push(r);
      }
    }
    try {
      save(state);
    } catch {
      log('warn', 'meshy ledger write failed');
    }
    if (deleted) log('info', 'meshy tasks deleted', { n: deleted });
    if (kept.length) log('warn', 'meshy task not deleted yet: will retry', { status: [...new Set(kept)] });
    return deleted;
  }

  /**
   * 만들기 요청이 답 없이 끊겼을 때: 작업이 만들어졌을 수도 있다(Meshy 문서: 다시 만들기 전에 먼저 찾아보라).
   * 키 잠금을 쥐었을 때만 찾는다: 이 키를 이 프로세스 하나만 쓰므로 요청 뒤에 생긴, 장부에 없는 작업은 이 요청의 것이다.
   * 잠금 없이(같은 키를 다른 프로세스가 쓸 수 있다) 찾으면 남의 작업을 제 그림의 것으로 삼아 남의 3D를 올리고 지울 수 있다.
   * 그런 작업이 정확히 하나일 때만 이 그림의 작업으로 삼는다. 둘 이상이면 고르지 않는다(다른 컴퓨터가 같은 키를 쓰는 등). 없으면 null
   */
  async function orphanSince(since) {
    if (!exclusive) {
      log('warn', 'meshy create got no answer: not looking for the task (no key lock)');
      return null;
    }
    try {
      const res = await f(`${api}/openapi/v1/image-to-3d?page_size=5&sort_by=-created_at`, {
        headers: auth, signal: AbortSignal.timeout(GET_TIMEOUT_MS),
      });
      if (!res.ok) {
        await drain(res);
        return null;
      }
      const list = await res.json();
      const state = load();
      const known = new Set([...Object.values(state.tasks).map((t) => t.task), ...Object.keys(state.trash)]);
      const hits = (Array.isArray(list) ? list : [])
        .filter((t) => typeof t?.id === 'string' && TASK_ID.test(t.id) && !known.has(t.id) && Number(t.created_at) >= since - 10_000);
      if (hits.length > 1) log('warn', 'meshy create got no answer: several new tasks, not guessing', { n: hits.length });
      return hits.length === 1 ? hits[0].id : null;
    } catch {
      return null;
    }
  }

  async function create(png) {
    const since = now();
    let res;
    try {
      res = await f(`${api}/openapi/v1/image-to-3d`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(meshyBody(png, options)),
        signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
      });
    } catch (err) {
      const orphan = await orphanSince(since);
      if (orphan) {
        log('warn', 'meshy create got no answer: using the task it made', { task: orphan });
        return orphan;
      }
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw failure('timeout', 'meshy create timed out');
      throw failure('service_down', `meshy create: ${scrub(err?.cause?.code ?? err?.message ?? 'failed')}`, { down: true });
    }
    if (!res.ok) {
      const status = res.status;
      const msg = await messageOf(res);
      const trouble = accountTrouble(status, msg);
      if (trouble) throw trouble;
      if (status === 400 || status === 422) throw failure('meshy_rejected', `meshy create ${status} ${msg}`, { status, permanent: true });
      if (status === 429) throw failure('meshy_busy', `meshy create 429 ${msg}`, { status });
      if (status >= 500) throw failure('service_down', `meshy create ${status}`, { status, down: true });
      throw failure('meshy_http', `meshy create ${status} ${msg}`, { status });
    }
    let id = null;
    try {
      id = (await res.json())?.result;
    } catch {
      id = null;
    }
    if (typeof id !== 'string' || !TASK_ID.test(id)) throw failure('meshy_bad_answer', 'meshy create: no task id');
    return id;
  }

  /**
   * 작업이 끝날 때까지 묻는다(pollMs마다, 서비스가 Retry-After를 주면 그만큼). 끝이 지나면 timeout(작업은 장부에 남는다).
   * since: 작업을 만든(장부에 적은) 때. 그 뒤 MESHY_FRESH_TASK_MS 안의 404는 아직 보이지 않는 것으로 보고 다시 묻는다.
   * seen: 물은 횟수(polls)와 상태 기록(statuses: 상태가 바뀔 때마다 {at, status, progress})을 여기에 적는다(던져도 남는다)
   */
  async function waitTask(taskId, keyOf, since, seen = { polls: 0, statuses: [] }) {
    const deadline = now() + pollMaxMs;
    let polls = 0;
    let last = 'unknown';
    for (;;) {
      polls += 1;
      seen.polls = polls;
      let res = null;
      try {
        res = await f(`${api}/openapi/v1/image-to-3d/${encodeURIComponent(taskId)}`, {
          headers: auth, signal: AbortSignal.timeout(GET_TIMEOUT_MS),
        });
      } catch {
        res = null; // 잠깐 끊김: 끝까지 다시 묻는다
      }
      let after = 0;
      if (res) {
        after = Number(res.headers.get('retry-after')) || 0;
        if (res.ok) {
          let task = null;
          try {
            task = await res.json();
          } catch {
            task = null;
          }
          const status = typeof task?.status === 'string' ? task.status : 'unknown';
          last = status;
          if (seen.statuses.at(-1)?.status !== status && seen.statuses.length < 20) {
            const progress = Number(task?.progress);
            seen.statuses.push({ at: now(), status: status.slice(0, 32), progress: Number.isFinite(progress) ? progress : null });
          }
          if (status === 'SUCCEEDED') return { task, polls };
          if (status === 'FAILED') {
            finish(keyOf, taskId);
            const type = String(task?.task_error?.type ?? '');
            const msg = scrub(task?.task_error?.message);
            if (type === 'invalid_input') throw failure('meshy_input', `meshy failed: ${msg}`, { permanent: true });
            throw failure('meshy_failed', `meshy ${type || 'failed'}: ${msg}`, { bad: true });
          }
          if (status === 'CANCELED') {
            finish(keyOf, taskId);
            throw failure('meshy_canceled', 'meshy task canceled', { bad: true });
          }
        } else {
          const status = res.status;
          const msg = await messageOf(res);
          const trouble = accountTrouble(status, msg);
          if (trouble) throw trouble;
          if (status === 404 && now() - since >= MESHY_FRESH_TASK_MS) {
            // 작업이 없다(지워졌거나 오래됐다): 장부에서 뺀다. 결과 탓으로 센다(다음에 새로 만드는 작업이 요청마다 maxBad로 묶이게)
            finish(keyOf, taskId, false);
            throw failure('meshy_task_gone', 'meshy task not found', { bad: true });
          }
          // 막 만든 작업의 404, 429·5xx 등: 기다렸다 다시 묻는다
        }
      }
      if (now() >= deadline) throw failure('timeout', `meshy task ${last} after ${polls} polls`);
      await sleep(Math.min(Math.max(pollMs, after * 1000), 60_000));
    }
  }

  /** 결과 GLB 받기. 서명된 주소라 키를 싣지 않는다 */
  async function download(task, keyOf, taskId) {
    const url = task?.model_urls?.glb ?? task?.model_url;
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      finish(keyOf, taskId);
      throw failure('meshy_no_glb', 'meshy answered no glb', { bad: true });
    }
    let res;
    try {
      res = await f(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    } catch (err) {
      throw failure('download_failed', `glb: ${scrub(err?.cause?.code ?? err?.name ?? 'failed')}`);
    }
    if (res.status === 403 || res.status === 404 || res.status === 410) {
      // 주소가 끝났다(보관 기한): 이 작업으로는 다시 받을 수 없다
      await drain(res);
      finish(keyOf, taskId);
      throw failure('meshy_expired', `glb ${res.status}`, { bad: true });
    }
    if (!res.ok) {
      await drain(res);
      throw failure('download_failed', `glb ${res.status}`);
    }
    if (Number(res.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) {
      await drain(res);
      finish(keyOf, taskId);
      throw failure('too_big', 'meshy glb too big', { bad: true });
    }
    let bytes;
    try {
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      throw failure('download_failed', 'glb: body cut');
    }
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      finish(keyOf, taskId);
      throw failure('too_big', 'meshy glb too big', { bad: true });
    }
    return bytes;
  }

  return {
    name: 'meshy',
    maker: MESHY_MAKER,
    leaseSec: MESHY_LEASE_SECONDS,
    maxBad: MESHY_MAX_BAD,
    /** 바깥으로 보내는 서비스: 사람이 요청한 줄만 받는다(processModel이 잡은 줄의 requested_at을 본다) */
    requestedOnly: true,
    /** 그 사람에게 「Meshy(미국)로 보낸다」고 알리고 받은 요청만 보낸다(processModel이 잡은 줄의 via를 본다) */
    consent: 'meshy',
    /** 시작 줄에 남기는 설정. key_lock: 키 잠금을 쥐었는가(일꾼은 늘 참) */
    options: { ...options, ai_model: MESHY_AI_MODEL, daily_max: cap, yaw: yawDeg, key_lock: exclusive },

    /**
     * 일을 받을 수 있는가: 쉬는 중이 아니고, 오늘 상한 아래이고, 잔액이 한 건 값 이상(5분 동안 기억한다).
     * 잔액 묻기는 크레딧을 쓰지 않는다. 닿지 않으면 false(일꾼이 1~2분 뒤 다시 본다).
     * 지울 작업이 남아 있으면 1분에 한 번 먼저 지워 본다(상한에 닿은 날에도)
     */
    async ready() {
      if (now() < pausedUntil) return false;
      const state = load();
      if (Object.keys(state.trash).length && now() - lastSweep >= 60_000) await sweep();
      if (capReached(state)) return false;
      if (now() < okUntil) return true;
      let res;
      try {
        res = await f(`${api}/openapi/v1/balance`, { headers: auth, signal: AbortSignal.timeout(GET_TIMEOUT_MS) });
      } catch {
        return false;
      }
      if (!res.ok) {
        const msg = await messageOf(res);
        accountTrouble(res.status, msg);
        return false;
      }
      let balance = NaN;
      try {
        balance = Number((await res.json())?.balance);
      } catch {
        return false;
      }
      if (!Number.isFinite(balance)) return false;
      if (balance < MESHY_JOB_CREDITS) {
        pause('credits low', { balance, need: MESHY_JOB_CREDITS });
        return false;
      }
      okUntil = now() + BALANCE_TTL_MS;
      return true;
    },

    /**
     * 캐릭터 PNG → 다듬은 GLB. key(그림 id)가 있으면 장부로 이어 보기를 한다.
     * badFails: DB가 센 「결과가 이상해 돌려놓은 횟수」. 장부의 작업을 만들 때보다 늘었으면 그 작업은 지울 작업으로 옮기고 새로 만든다.
     * onJob(): 값이 드는 작업을 만든(작업 id를 받은) 바로 뒤와, 장부의 작업을 이어 볼 때 부른다(일꾼이 DB에 그 사람의 시도로
     * 알린다. 같은 요청은 DB가 한 번만 센다). 던지면 무시한다(만들기를 막지 않는다).
     * 돌려주는 raw는 Meshy가 준 그대로의 GLB(다듬기 전). 끝난 작업을 Meshy에서 지운 뒤에도 원본을 남길 수 있게 넘긴다.
     * job은 원본 에셋 기록(meshy-task.json)에 적을 작업 기록이다: 작업 id, 이어 봤는가, 물은 횟수, 걸린 시간, 크레딧, Meshy의 때,
     * 상태 기록, 보낸 설정. 키와 서명된 주소(model_urls 등)는 싣지 않는다. 작업을 만든 뒤에 실패하면 그 오류의 job으로 붙여 던진다
     */
    async toGlb(png, { key: id = null, badFails = 0, onJob = null } = {}) {
      const tellJob = async () => {
        if (typeof onJob !== 'function') return;
        try {
          await onJob();
        } catch {
          log('warn', 'meshy job not reported');
        }
      };
      const t0 = now();
      const bad = Number.isInteger(badFails) && badFails > 0 ? badFails : 0;
      // 보낸 그림의 지문. 같은 그림 id라도 다시 그린 그림이면(지문이 다르면) 옛 작업을 잇지 않는다(옛 그림의 3D가 붙지 않게).
      // 지문이 없는 옛 장부 줄도 잇지 않는다
      const pngSum = createHash('sha256').update(png).digest('hex');
      let state = load();
      const kept = id ? state.tasks[id] : undefined;
      let taskId = kept && kept.bad === bad && kept.png === pngSum && now() - kept.at <= TASK_KEEP_MS ? kept.task : null;
      const resumed = taskId !== null;
      let since = resumed ? kept.at : 0;
      if (!taskId) {
        if (now() < pausedUntil) throw failure('meshy_paused', 'meshy paused', { down: true });
        if (capReached(state)) throw failure('daily_cap', 'meshy daily cap reached', { down: true });
        // 만들기 전에 센다(만들고 나서 멈춰도 센 것이 남게). 이어 보지 않는 옛 작업은 지울 작업으로. 장부에 적지 못하면 만들지 않는다
        state = { ...state, day: kstDay(now()), created: createdToday(state) + 1 };
        if (kept) {
          delete state.tasks[id];
          state.trash[kept.task] ??= { at: now(), tries: 0 };
        }
        save(state);
        taskId = await create(png);
        since = now();
        state = load();
        if (id) {
          state.tasks[id] = { task: taskId, at: since, bad, png: pngSum };
          save(state);
        }
        log('info', 'meshy task created', { task: taskId, today: state.created, max: cap });
      } else {
        log('info', 'meshy task resumed', { task: taskId });
      }
      // 값이 든 작업이다(이어 보는 작업도 다시 알린다: 앞의 알림이 끊겼을 수 있다)
      await tellJob();
      const seen = { polls: 0, statuses: [] };
      let task = null;
      /** 원본 에셋 기록에 넘길 작업 기록(정해 둔 칸만. 키·서명된 주소는 없다) */
      const jobOf = () => {
        const credits = Number(task?.consumed_credits);
        return {
          task: taskId, resumed, polls: seen.polls, seconds: Math.round((now() - t0) / 100) / 10,
          credits: Number.isFinite(credits) ? credits : null, times: taskTimes(task), statuses: seen.statuses.slice(),
          settings: { ...meshySettings(options), yaw: yawDeg },
        };
      };
      try {
        ({ task } = await waitTask(taskId, id, since, seen));
        const raw = await download(task, id, taskId);
        let made;
        try {
          made = await tidy(raw, { yaw: yawDeg });
        } catch (err) {
          const code = /^[a-z_]{1,32}$/.test(String(err?.code ?? '')) ? err.code : 'glb_failed';
          throw failure(code, `tidy: ${scrub(err?.message)}`, { bad: true });
        }
        const job = jobOf();
        return {
          glb: made.glb,
          raw,
          stats: {
            ...made.stats, task: taskId, resumed, polls: seen.polls, total_s: job.seconds,
            ...(job.credits !== null ? { credits: job.credits } : {}),
          },
          job,
        };
      } catch (err) {
        // 작업을 만든 뒤의 실패: 그 작업의 기록을 붙여 던진다(원본 에셋 기록이 실패한 시도도 남긴다)
        if (err && typeof err === 'object' && !err.job) err.job = jobOf();
        throw err;
      }
    },

    /**
     * 끝난 그림(ready·failed·지워짐)의 작업을 장부에서 빼고 Meshy에서 지운다(보낸 그림과 만든 모형을 Meshy에 남기지 않게).
     * 지금 지우지 못한 것은 남겨 두고 다음 차례(ready)에 다시 지운다. 던지지 않는다
     */
    async forget(id) {
      const task = id ? load().tasks[id]?.task : undefined;
      if (task) finish(id, task);
      await sweep();
    },

    /** 지울 작업을 지금 지운다(위 forget·ready가 부른다. 시험과 손으로 치울 때) */
    sweep,
  };
}
