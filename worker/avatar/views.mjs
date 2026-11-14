// 방향 그림 일꾼의 한 바퀴: 잡기 → 캐릭터 그림 받기 → 다섯 방향 시트 그리기 → 사람별로 자르기 → 보는 쪽 가리기 → 묶음 두 크기 → 올리기 → 정리.
// 걷기 화면에서 사진 캐릭터가 보는 쪽과 카메라 자리에 맞는 그림을 고를 수 있게, 다 그린 캐릭터 그림 한 장으로 다섯 방향을 한 번 더 그린다.
// DB·저장소·프록시·그림 어댑터는 바깥에서 넘긴다(운영은 supabase.mjs + proxy.mjs + image.mjs, 시험과 dry run은 가짜).
//   db:    viewsClaim(worker, leaseSec) → {id, user_id, image_path, attempts, sheet_fails}|null,
//          viewsRelease(id, worker, delaySec, sheet) (sheet가 참이면 시트 탓 실패로 따로 센다),
//          viewsSettle(id, status, {mode, model, reason, worker}) → boolean
//   store: download(path) → Uint8Array, upload(path, bytes, type), remove(paths[])
//   proxy: turnaround(png, userId) → {png, model}, sheetViews(png, userId) → [{view, nose}]|null
//   image: decode(bytes) → {data, w, h}, resize(img, w, h), encodeWebp(img) → Uint8Array
import { VIEW_SIZES, charPath, isUuid, sniffImageType, viewsPath } from '../../src/lib/avatar/rules.ts';
import {
  VIEW_CELLS, VIEW_COUNT, checkSheet, composeAtlas, cutFigure, findFigures, layoutAtlas, planSheet,
} from '../../src/lib/avatar/sheet.ts';
import { pngInfo, reasonOf } from './core.mjs';

/**
 * 시트가 이상해서(사람이 다섯이 아님 등) 실패한 것은 세 번이면 그만둔다. 이 횟수는 DB가 따로 센다(sheet_fails):
 * 프록시가 멈춘 사이 돌려놓인 횟수와 섞어 세면, 프록시가 돌아온 뒤 첫 시트 실패 한 번에 failed로 굳는다.
 */
export const VIEWS_MAX_ATTEMPTS = 3;
/**
 * 프록시·저장소가 안 되는 실패는 이 캐릭터 탓이 아니다. 세 번에 그만두면 프록시가 십 분쯤 멈춘 사이에 줄 앞쪽의
 * 캐릭터들이 영영 failed로 남는다. 한 시간씩 쉬며 잡은 횟수 여덟 번까지 기다려 본다
 * (DB가 임대가 끝난 줄을 굳히는 횟수와 같다: 0015_avatar_views.sql의 avatar_views_claim).
 */
export const VIEWS_MAX_OUTAGE_ATTEMPTS = 8;
/** 시트를 두 번 그리고 비전 모델에 두 번 묻는 가장 느린 경우에도 임대가 먼저 끝나지 않게 넉넉히 잡는다 */
export const VIEWS_LEASE_SECONDS = 1200;
const OUTAGE_DELAY = 3600;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** 저장소가 잠깐 안 될 때 30초 걸려 그린 시트를 버리지 않게, 올리기는 조금 쉬었다 한 번 더 해 본다(같은 자리에 덮어쓰므로 두 번 해도 같다) */
const twice = async (fn, sleep) => {
  try {
    return await fn();
  } catch {
    await sleep(2000);
    return fn();
  }
};
const sheetError = (code, message) => Object.assign(new Error(message ?? code), { code, sheet: true });

/**
 * 시트의 그림마다 방향을 비전 모델에 묻는다. 답이 없을 때 까닭을 나눈다:
 * answered가 참이면 비전 모델이 답했지만 쓸 수 없었다(거절, 내용 검사, 모양이 다른 답). 같은 시트로 다시 물어도 같으므로 시트 탓으로 센다.
 * 거짓이면 닿지 못했다(네트워크, 시간 초과, 5xx). 한 번 더 물어도 안 되면 프록시 쪽 사정으로 나중에 다시 한다.
 */
async function askViews({ proxy, png, uid, log, tag, sleep }) {
  for (let i = 0; i < 2; i++) {
    try {
      const seen = await proxy.sheetViews(png, uid);
      if (!seen) log('warn', 'views vision unusable', tag);
      return { seen, answered: true };
    } catch (err) {
      log('warn', 'views vision failed', { ...tag, name: err?.name, code: err?.code, status: err?.status });
      if (err?.blocked) return { seen: null, answered: true };
      if (i === 0) await sleep(3000);
    }
  }
  return { seen: null, answered: false };
}

/**
 * 시트를 그려 다섯 그림으로 나눈다. 순서는 sheet.ts의 planSheet가 본다: 비전 모델이 다른 순서로 봤으면 그 순서로 바로잡아 쓰고,
 * 순서를 믿을 수 없는 시트는 버리고 한 번만 다시 그린다. 확인할 길이 없을 때(비전 답이 없고 살갗 색으로도 못 볼 때)는
 * 시트 탓이 아니므로 나중에 다시 하게 넘긴다.
 * 사람이 다섯이 아닌 시트는 여기서 다시 그리지 않고 실패로 넘긴다(조금 뒤 다시 잡는다. 그리기 수를 아낀다).
 */
async function drawViews({ proxy, image, char, uid, log, tag, sleep }) {
  for (let round = 1; round <= 2; round++) {
    const drawn = await proxy.turnaround(char, uid);
    if (!pngInfo(drawn.png)?.alpha) throw sheetError('bad_output', 'sheet has no alpha');
    const sheet = await image.decode(drawn.png).catch(() => { throw sheetError('bad_output', 'sheet is not readable'); });
    const found = findFigures(sheet, VIEW_COUNT);
    const check = checkSheet(found, sheet);
    if (!check.ok) throw sheetError(check.reason, `sheet ${sheet.w}x${sheet.h} rows ${JSON.stringify(found.rows)} spare ${found.spare}`);
    const cuts = found.figs.map((f) => cutFigure(sheet, found.label, f));
    const { seen, answered } = await askViews({ proxy, png: drawn.png, uid, log, tag, sleep });
    const plan = planSheet(cuts, seen);
    const facts = {
      sheet: `${sheet.w}x${sheet.h}`,
      sides: plan.facing.sides.map((s) => s ?? '?').join(','),
      shares: plan.facing.shares.map((v) => +v.toFixed(3)),
      seen: seen ? seen.map((v) => `${v.view}/${v.nose}`).join(' ') : null,
    };
    if (plan.act === 'use') {
      return { views: plan.views, mode: plan.mode, model: drawn.model, facts: { ...facts, flip: plan.flip.map(Number).join(''), order: plan.order.join('') } };
    }
    // 순서를 확인할 수 없는 시트(비전 답이 없고 살갗 색으로도 못 봄). 비전 모델이 닿지 않았으면 프록시 쪽 사정으로 치고
    // 나중에 다시 한다(시트 실패로 세지 않는다). 답했지만 쓸 수 없었으면 같은 시트로는 끝내 확인할 수 없으니 시트 탓으로 센다
    if (plan.act === 'wait') {
      if (answered) throw sheetError('vision_unusable', 'the vision model answered but the answer cannot be used');
      throw Object.assign(new Error('sheet order cannot be checked without the vision answer'), { code: 'vision_down' });
    }
    log('warn', 'views sheet out of order', { ...tag, round, ...facts });
  }
  throw sheetError('sheet_order');
}

/** 다섯 그림을 한 줄 묶음(WebP)으로. 크기 조절만 그림 어댑터가 하고 자리·색 번짐·알파 띠는 sheet.ts가 정한다 */
async function buildAtlas(image, views, [cellW, cellH]) {
  const { slots, shrink } = layoutAtlas(views, cellW, cellH);
  const pieces = [];
  for (let i = 0; i < views.length; i++) pieces.push(await image.resize(views[i], slots[i].w, slots[i].h));
  return { bytes: await image.encodeWebp(composeAtlas(pieces, slots, cellW, cellH)), shrink };
}

export async function processViews({ db, store, proxy, worker, image, log = () => {}, sleep = wait, now = Date.now }) {
  const job = await db.viewsClaim(worker, VIEWS_LEASE_SECONDS);
  if (!job) return { outcome: 'idle' };
  const { id, user_id: uid, image_path: source, attempts } = job;
  /** 지금까지 시트 탓으로 돌려놓은 횟수(옛 DB 어댑터라 값이 없으면 0) */
  const sheetFails = Number.isInteger(job.sheet_fails) && job.sheet_fails > 0 ? job.sheet_fails : 0;
  const tag = { id, attempt: attempts };
  // 임대가 끝나 가면(컴퓨터가 잠들었다 깬 경우 등) 다른 일꾼이 이 줄을 다시 잡았을 수 있다. 그때는 올리지도 정리하지도 않고 물러난다:
  // 뒤늦게 올린 뒤 정리가 안 됐다고 파일을 거두면, 다른 일꾼이 다 만들어 ready로 적은 묶음을 지우게 된다
  const started = now();
  const late = () => now() - started > (VIEWS_LEASE_SECONDS - 60) * 1000;
  const leave = () => {
    log('warn', 'views lease ran out', tag);
    return { outcome: 'late', id, trouble: true };
  };
  /** 실패로 정리했을 때 그 줄이 아직 내 것이었는가(아니면 다른 일꾼이 그 자리를 맡았다) */
  let failedMine = false;
  const fail = async (reason, trouble = false) => {
    failedMine = (await db.viewsSettle(id, 'failed', { reason, worker })) === true;
    log('info', `views failed ${reason}`, tag);
    return { outcome: 'failed', reason, id, trouble };
  };
  if (!isUuid(id) || !isUuid(uid) || source !== charPath(uid, id)) return fail('bad_job');
  const uploaded = [];
  let settling = false;
  try {
    const char = await store.download(source);
    if (sniffImageType(char) !== 'image/png') return fail('bad_char');
    const made = await drawViews({ proxy, image, char, uid, log, tag, sleep });
    if (late()) return leave();
    const shrink = {};
    for (const size of VIEW_SIZES) {
      const atlas = await buildAtlas(image, made.views, VIEW_CELLS[size]);
      const path = viewsPath(uid, id, size);
      uploaded.push(path); // 올리다 실패해도 거둘 수 있게 먼저 적는다
      await twice(() => store.upload(path, atlas.bytes, 'image/webp'), sleep);
      shrink[size] = +atlas.shrink.toFixed(3);
    }
    settling = true;
    // 다 그려 올린 뒤에 적기만 한 번 실패했다고 시트를 처음부터 다시 그리지 않게, 적기도 조금 쉬었다 한 번 더 해 본다.
    // 첫 번째가 사실은 적혔더라도 두 번째는 「이미 ready인 줄의 늦은 ready」라 true가 온다(같은 값을 다시 적을 뿐이다)
    const settled = await twice(() => db.viewsSettle(id, 'ready', { mode: made.mode, model: made.model, worker }), sleep);
    if (!settled) {
      // 그사이 본인이 캐릭터를 지웠다: 올린 묶음도 거둔다(파생 그림이 남지 않게)
      await store.remove(uploaded).catch(() => log('warn', 'remove views failed', tag));
      log('info', 'views gone (deleted while drawing)', tag);
      return { outcome: 'gone', id };
    }
    log('info', 'views ready', { ...tag, mode: made.mode, model: made.model, ...made.facts, shrink });
    return { outcome: 'ready', id, mode: made.mode };
  } catch (err) {
    if (late()) return leave();
    // 올린 파일은 줄을 정리(실패로 적기·돌려놓기)한 뒤, 그 줄이 아직 내 것이었을 때만 거둔다. 임대가 넘어가 다른 일꾼이
    // 같은 자리에 올려 ready로 적었으면 그 파일이 지금 쓰이는 묶음이다.
    // 정리(ready로 적기)를 부르다 난 오류면 적혔는지 알 수 없다. 적혔는데 파일을 거두면 ready인데 파일이 없게 되므로 그대로 둔다
    // (안 적혔다면 다음에 다시 그릴 때 같은 자리에 덮어쓴다)
    const drop = async (mine) => {
      if (mine && uploaded.length && !settling) await store.remove(uploaded).catch(() => log('warn', 'remove views failed', tag));
    };
    const stop = async (reason, trouble) => {
      const out = await fail(reason, trouble);
      await drop(failedMine);
      return out;
    };
    if (err?.blocked) return stop('blocked', false);
    const reason = reasonOf(err);
    let released = false;
    if (err?.sheet) {
      // 시트 탓: 이번이 시트 실패로 세 번째면 그만둔다. 아니면 2분, 4분 뒤 다시(시트 실패 수만으로 센다)
      if (sheetFails + 1 >= VIEWS_MAX_ATTEMPTS) return stop(reason, true);
      released = (await db.viewsRelease(id, worker, 120 * 2 ** sheetFails, true)) === true;
    } else {
      // 프록시·저장소 탓: 처음 두 번은 2분, 4분, 그 뒤로는 한 시간씩 쉬며 여덟 번까지
      if (attempts >= VIEWS_MAX_OUTAGE_ATTEMPTS) return stop(reason, true);
      const outages = Math.max(1, attempts - sheetFails);
      released = (await db.viewsRelease(id, worker, outages < VIEWS_MAX_ATTEMPTS ? 120 * 2 ** (outages - 1) : OUTAGE_DELAY, false)) === true;
    }
    await drop(released);
    log('warn', `views retry later (${reason})`, { ...tag, detail: String(err?.message ?? '').slice(0, 160) });
    return { outcome: 'retry', reason, id, trouble: true };
  }
}

/** 방향 그림 한 건을 만든 뒤 다음 건까지 쉬는 시간. 밀린 캐릭터를 한꺼번에 그려 한 장 그리기 몫의 여유를 다 쓰지 않게 */
export const VIEWS_GAP_MS = 30_000;
/** 잇달아 실패할 때 쉬는 시간의 끝(1분에서 두 배씩 늘어난다) */
export const VIEWS_REST_MAX_MS = 3_600_000;

/**
 * 일꾼 본체가 한 장 그리기가 없을 때마다 부르는 「방향 그림 한 건」. 돌려주는 값은 일을 했는가(false면 본체가 잠깐 쉰다).
 * - 한 건을 만들면 VIEWS_GAP_MS 동안 쉰다.
 * - 실패하면(trouble) 1분, 2분, 4분… 길게 쉰다. 프록시가 멈춘 사이에 줄 선 캐릭터들의 시도 수를 차례로 다 써 버리지 않게.
 * - run이 던진 오류는 여기서 받는다(DB에 방향 그림 함수가 아직 없을 때도 한 장 그리기는 그대로 돈다).
 */
export function createViewsTurn({ run, log = () => {}, now = Date.now, gapMs = VIEWS_GAP_MS, restMaxMs = VIEWS_REST_MAX_MS }) {
  let fails = 0;
  let restUntil = 0;
  return async function viewsTurn() {
    if (now() < restUntil) return false;
    let v;
    try {
      v = await run();
    } catch (err) {
      log('warn', 'views error', { name: err?.name, code: err?.code, message: String(err?.message ?? '').slice(0, 200) });
      v = { outcome: 'error', trouble: true };
    }
    if (v.trouble) {
      fails += 1;
      const rest = Math.min(60_000 * 2 ** (fails - 1), restMaxMs);
      restUntil = now() + rest;
      log('warn', 'views resting', { minutes: Math.round(rest / 60_000), fails });
    } else if (v.outcome === 'ready') {
      fails = 0;
      restUntil = now() + gapMs;
    }
    return v.outcome !== 'idle';
  };
}
