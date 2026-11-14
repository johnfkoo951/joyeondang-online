// 녹화 파일(webm)에 길이를 적는다. 브라우저의 MediaRecorder는 실시간으로 쓰므로 머리의 정보 칸(Segment > Info)에
// 길이(Duration)를 넣지 않는다: 그대로면 많은 재생기가 길이를 모르고 뒤로 건너뛰지 못한다(긴 녹화를 되돌려 보기 어렵다).
// 머리만 읽어 정보 칸 끝에 길이를 더하고 그 칸의 크기를 고친다. 나머지(영상 묶음)는 그대로 이어 붙인다.
// 모양이 예상과 다르면(자리 표가 있거나, 묶음 크기를 아는 Segment, 이미 길이가 있음) 손대지 않고 그대로 돌려준다.

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const SEEK_HEAD = 0x114d9b74;
const INFO = 0x1549a966;
const CLUSTER = 0x1f43b675;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
/** 머리에서 읽어 볼 만큼(정보 칸은 처음 몇백 바이트 안에 있다) */
const HEAD_BYTES = 256 * 1024;

type Vint = { value: number; len: number; unknown: boolean };

/** EBML 가변 길이 정수. id는 표식 비트를 그대로(keep), 크기는 표식을 뗀 값. 모든 값 비트가 1이면 크기를 모름 */
function readVint(b: Uint8Array, at: number, keep: boolean): Vint | null {
  if (at >= b.length) return null;
  const first = b[at];
  let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || at + len > b.length) return null;
  let value = keep ? first : first & (mask - 1);
  let ones = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[at + i];
    if (b[at + i] !== 0xff) ones = false;
  }
  return { value, len, unknown: !keep && ones };
}

/** 크기 값을 len 바이트 가변 길이로. 넣을 수 없으면 null(모든 비트 1은 「모름」 자리라 피한다) */
function writeSize(value: number, len: number): Uint8Array | null {
  if (len < 1 || len > 8 || value >= 2 ** (7 * len) - 1) return null;
  const out = new Uint8Array(len);
  let v = value;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (len - 1);
  return out;
}

/**
 * 머리 바이트에 길이(ms)를 넣은 새 머리와, 원래 머리에서 그만큼까지 썼는지(consumed). 손댈 수 없으면 null.
 * 원래 파일 = 머리[0, consumed) + 나머지 이므로, 새 파일 = bytes + 원래[consumed, 끝)
 */
export function addDuration(head: Uint8Array, durationMs: number): { bytes: Uint8Array; consumed: number } | null {
  if (!(durationMs > 0)) return null;
  const idE = readVint(head, 0, true);
  if (!idE || idE.value !== EBML) return null;
  const szE = readVint(head, idE.len, false);
  if (!szE || szE.unknown) return null;
  const segAt = idE.len + szE.len + szE.value;
  const idS = readVint(head, segAt, true);
  if (!idS || idS.value !== SEGMENT) return null;
  const szS = readVint(head, segAt + idS.len, false);
  // 크기를 아는 Segment는 그 크기도 고쳐야 한다: 실시간 녹화는 늘 「모름」으로 쓰므로 그 밖은 손대지 않는다
  if (!szS || !szS.unknown) return null;
  let q = segAt + idS.len + szS.len;
  while (q < head.length) {
    const id = readVint(head, q, true);
    const sz = id && readVint(head, q + id.len, false);
    if (!id || !sz || sz.unknown) return null;
    const dataAt = q + id.len + sz.len;
    // 자리 표(SeekHead)가 있으면 뒤 칸들의 자리가 어긋난다. 정보 칸보다 영상이 먼저 나오면 모양이 다르다
    if (id.value === SEEK_HEAD || id.value === CLUSTER) return null;
    if (id.value !== INFO) {
      q = dataAt + sz.value;
      continue;
    }
    const end = dataAt + sz.value;
    if (end > head.length) return null;
    let scale = 1_000_000;
    for (let r = dataAt; r < end;) {
      const cid = readVint(head, r, true);
      const csz = cid && readVint(head, r + cid.len, false);
      if (!cid || !csz || csz.unknown) return null;
      const cd = r + cid.len + csz.len;
      if (cid.value === DURATION) return null;
      if (cid.value === TIMECODE_SCALE && csz.value > 0 && csz.value <= 8) {
        let v = 0;
        for (let i = 0; i < csz.value; i++) v = v * 256 + head[cd + i];
        if (v > 0) scale = v;
      }
      r = cd + csz.value;
    }
    // 길이 칸: id 0x4489, 크기 8, 64비트 실수(시간 단위 = TimecodeScale ns)
    const dur = new Uint8Array(11);
    dur[0] = 0x44;
    dur[1] = 0x89;
    dur[2] = 0x88;
    new DataView(dur.buffer).setFloat64(3, (durationMs * 1e6) / scale);
    const size = writeSize(sz.value + dur.length, sz.len) ?? writeSize(sz.value + dur.length, 8);
    if (!size) return null;
    const before = head.subarray(0, q + id.len), body = head.subarray(dataAt, end);
    const bytes = new Uint8Array(before.length + size.length + body.length + dur.length);
    bytes.set(before, 0);
    bytes.set(size, before.length);
    bytes.set(body, before.length + size.length);
    bytes.set(dur, before.length + size.length + body.length);
    return { bytes, consumed: end };
  }
  return null;
}

/** 녹화 파일에 길이를 적은 새 파일. 못 하면 받은 그대로 */
export async function withDuration(blob: Blob, durationMs: number): Promise<Blob> {
  try {
    const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, HEAD_BYTES)).arrayBuffer());
    const p = addDuration(head, durationMs);
    return p ? new Blob([p.bytes as BlobPart, blob.slice(p.consumed)], { type: blob.type }) : blob;
  } catch {
    return blob;
  }
}
