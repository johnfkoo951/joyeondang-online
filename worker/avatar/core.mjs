// 그리기 일꾼의 한 바퀴: 잡기 → 원본 받기 → 사진 살피기 → 그리기 → 올리기 → 정리.
// DB·저장소·프록시는 바깥에서 넘긴다(운영은 supabase.mjs + proxy.mjs, 시험과 dry run은 가짜).
//   db:    claim(worker, leaseSec) → job|null, release(id, worker, delaySec), settle(id, status, {imagePath, model, reason}) → boolean,
//   store: download(path) → Uint8Array, upload(path, bytes, type), remove(paths[])
//   proxy: check(bytes, mime, userId) → {ok}|{ok:false, reason}, draw(bytes, mime, userId) → {png, model}
//   image: (없어도 된다) decode(bytes) → {data, w, h}, resize(img, w, h), encodePng(img). 크기가 다른 그림을 판에 맞출 때 쓴다
//   keepAssets: (없어도 된다) 원본 에셋 남기기(assets.mjs의 drawing). 다 그려 ready로 적은 뒤에 올린 그림과 그 기록을 넘긴다
//            {id, uid, png, attempt, visionModel, imageModel, check, seconds, image, usage}. 원본 사진은 넘기지 않는다.
//            실패해도(던져도) 그리기는 그대로다
import { charPath, isUuid, sniffImageType } from '../../src/lib/avatar/rules.ts';
import { paste } from '../../src/lib/avatar/sheet.ts';

export const MAX_ATTEMPTS = 3; // 처음 한 번 + 재시도 두 번
export const LEASE_SECONDS = 600;
const W = 1024;
const H = 1536;

/** PNG 머리에서 크기와 투명(알파) 여부를 읽는다 */
export function pngInfo(png) {
  const ok = png.length > 26 && png[0] === 0x89 && png[1] === 0x50 && png[12] === 0x49 && png[15] === 0x52;
  if (!ok) return null;
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const colorType = png[25];
  return { width: v.getUint32(16), height: v.getUint32(20), alpha: colorType === 4 || colorType === 6 };
}

/**
 * 그림 모델은 가끔 1024×1536이 아닌 세로 그림을 돌려준다(비율이 조금 다르다). 화면들은 이 크기를 약속으로 쓰므로
 * 투명한 1024×1536 판에 비율을 지켜 맞춘다. 좌우는 가운데, 아래는 판 바닥에 붙인다(발 아래 여백이 그대로라야 서 있는 높이가 같다).
 */
export async function fitPortrait(image, png) {
  const src = await image.decode(png);
  const s = Math.min(W / src.w, H / src.h);
  const w = Math.max(1, Math.round(src.w * s)), h = Math.max(1, Math.round(src.h * s));
  const piece = w === src.w && h === src.h ? src : await image.resize(src, w, h);
  const canvas = { data: new Uint8Array(W * H * 4), w: W, h: H };
  paste(canvas, piece, Math.round((W - w) / 2), H - h);
  return image.encodePng(canvas);
}

/** 다시 해 봐도 소용없는 오류(내용 검사에 막힘은 따로 rejected) */
const permanent = (err) => err?.status === 400 || err?.status === 401 || err?.status === 403 || err?.status === 404;
/** DB의 reason 모양(^[a-z_]{1,32}$)에 맞춘 실패 까닭 */
export function reasonOf(err) {
  const code = String(err?.code ?? '').toLowerCase();
  if (/^[a-z_]{1,32}$/.test(code)) return code;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout';
  return typeof err?.status === 'number' ? 'http_error' : 'error';
}
const backoff = (attempt) => Math.min(60 * 2 ** (attempt - 1), 600);

/** 걸린 시간(초, 소수 한 자리) */
const secs = (ms) => Math.round(ms / 100) / 10;

export async function processOne({ db, store, proxy, worker, image = null, log = () => {}, keepAssets = null, now = Date.now }) {
  const job = await db.claim(worker, LEASE_SECONDS);
  if (!job) return { outcome: 'idle' };
  const { id, user_id: uid, original_path: original, attempts, give_up: giveUp } = job;
  const tag = { id, attempt: attempts };
  const t0 = now();
  const drop = async (status, reason) => {
    if (original) await store.remove([original]).catch(() => log('warn', 'remove original failed', tag));
    await db.settle(id, status, { reason });
    log('info', `${status} ${reason}`, tag);
    return { outcome: status, reason, id };
  };
  if (!isUuid(id) || !isUuid(uid) || typeof original !== 'string' || !original.startsWith(`${uid}/originals/${id}.`)) {
    return drop('failed', 'bad_job');
  }
  if (giveUp) return drop('failed', 'timeout');
  try {
    const bytes = await store.download(original);
    const tDownload = now();
    const mime = sniffImageType(bytes);
    if (!mime) return drop('failed', 'bad_original');
    // 보호자 동의가 적힌 그림·집주인의 그림은 아이로 보여도 그린다(0025). 묻지 못하면(옛 DB·가짜 DB) 지금처럼 막는다
    // 나이는 사진으로 판정하지 않는다(올린 사람이 고른 나 또는 아이와 보호자 동의를 믿는다, rules.ts parseVisionCheck)
    const verdict = await proxy.check(bytes, mime, uid);
    const tCheck = now();
    if (!verdict.ok) return drop('rejected', verdict.reason);
    const drawn = await proxy.draw(bytes, mime, uid);
    const tDraw = now();
    const info = pngInfo(drawn.png);
    const bad = () => Object.assign(new Error(`unexpected image ${JSON.stringify(info)}`), { code: 'bad_output' });
    if (!info || !info.alpha) throw bad();
    let png = drawn.png;
    let fittedFrom = null;
    if (info.width !== W || info.height !== H) {
      // 세로로 긴 그림만 판에 맞춰 쓴다. 가로로 길거나 정사각형이면 전신 한 사람이 아니다. 그림 어댑터가 없으면 예전처럼 다시 그린다
      if (!image || info.height <= info.width) throw bad();
      png = await fitPortrait(image, drawn.png).catch(() => { throw bad(); });
      fittedFrom = `${info.width}x${info.height}`;
      log('info', 'fitted', { ...tag, from: fittedFrom });
    }
    const cPath = charPath(uid, id);
    const tUpload = now();
    await store.upload(cPath, png, 'image/png');
    const settled = await db.settle(id, 'ready', { imagePath: cPath, model: drawn.model });
    if (!settled) {
      // 그사이 본인이 지웠다: 올린 그림도 거둔다(원본 에셋도 남기지 않는다)
      await store.remove([cPath]).catch(() => log('warn', 'remove char failed', tag));
      log('info', 'gone (deleted while drawing)', tag);
      return { outcome: 'gone', id };
    }
    log('info', 'ready', { ...tag, model: drawn.model });
    // 원본 에셋 남기기: 올린 그림(같은 바이트)과 기록. 원본 사진은 넘기지 않는다. 실패해도 그리기는 끝났다
    if (typeof keepAssets === 'function') {
      const done = now();
      try {
        await keepAssets({
          id, uid, png, attempt: attempts, visionModel: proxy.visionModel ?? null, imageModel: drawn.model ?? null,
          check: { ok: true, ...(verdict.summary && typeof verdict.summary === 'object' ? verdict.summary : {}) },
          seconds: {
            download: secs(tDownload - t0), check: secs(tCheck - tDownload), draw: secs(tDraw - tCheck), upload: secs(done - tUpload),
            total: secs(done - t0),
          },
          image: { width: W, height: H, fittedFrom },
          usage: drawn.usage ?? null,
        });
      } catch {
        log('warn', 'drawing assets not kept', tag);
      }
    }
    return { outcome: 'ready', id };
  } catch (err) {
    if (err?.blocked) return drop('rejected', 'blocked');
    const reason = reasonOf(err);
    if (attempts >= MAX_ATTEMPTS || permanent(err)) return drop('failed', reason);
    await db.release(id, worker, backoff(attempts));
    log('warn', `retry later (${reason})`, tag);
    return { outcome: 'retry', reason, id };
  }
}
