// 그리기 일꾼의 한 바퀴: 잡기 → 원본 받기 → 사진 살피기 → 그리기 → 올리기 → 정리.
// DB·저장소·프록시는 바깥에서 넘긴다(운영은 supabase.mjs + proxy.mjs, 시험과 dry run은 가짜).
//   db:    claim(worker, leaseSec) → job|null, release(id, worker, delaySec), settle(id, status, {imagePath, model, reason}) → boolean
//   store: download(path) → Uint8Array, upload(path, bytes, type), remove(paths[])
//   proxy: check(bytes, mime, userId) → {ok}|{ok:false, reason}, draw(bytes, mime, userId) → {png, model}
import { charPath, isUuid, sniffImageType } from '../../src/lib/avatar/rules.ts';

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

/** 다시 해 봐도 소용없는 오류(내용 검사에 막힘은 따로 rejected) */
const permanent = (err) => err?.status === 400 || err?.status === 401 || err?.status === 403 || err?.status === 404;
/** DB의 reason 모양(^[a-z_]{1,32}$)에 맞춘 실패 까닭 */
function reasonOf(err) {
  const code = String(err?.code ?? '').toLowerCase();
  if (/^[a-z_]{1,32}$/.test(code)) return code;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout';
  return typeof err?.status === 'number' ? 'http_error' : 'error';
}
const backoff = (attempt) => Math.min(60 * 2 ** (attempt - 1), 600);

export async function processOne({ db, store, proxy, worker, log = () => {} }) {
  const job = await db.claim(worker, LEASE_SECONDS);
  if (!job) return { outcome: 'idle' };
  const { id, user_id: uid, original_path: original, attempts, give_up: giveUp } = job;
  const tag = { id, attempt: attempts };
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
    const mime = sniffImageType(bytes);
    if (!mime) return drop('failed', 'bad_original');
    const verdict = await proxy.check(bytes, mime, uid);
    if (!verdict.ok) return drop('rejected', verdict.reason);
    const drawn = await proxy.draw(bytes, mime, uid);
    const info = pngInfo(drawn.png);
    if (!info || info.width !== W || info.height !== H || !info.alpha) {
      throw Object.assign(new Error(`unexpected image ${JSON.stringify(info)}`), { code: 'bad_output' });
    }
    const cPath = charPath(uid, id);
    await store.upload(cPath, drawn.png, 'image/png');
    const settled = await db.settle(id, 'ready', { imagePath: cPath, model: drawn.model });
    if (!settled) {
      // 그사이 본인이 지웠다: 올린 그림도 거둔다
      await store.remove([cPath]).catch(() => log('warn', 'remove char failed', tag));
      log('info', 'gone (deleted while drawing)', tag);
      return { outcome: 'gone', id };
    }
    log('info', 'ready', { ...tag, model: drawn.model });
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
