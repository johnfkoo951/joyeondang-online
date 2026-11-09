// 한 장 시험: DB·저장소는 가짜(메모리), 프록시는 진짜. 사진 한 장 → 판정과 그림을 로컬 파일로.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs <입력 사진> <출력.png>
// 키는 PROXY_API_KEY_FILE(기본: MBP llm-proxy의 client-keys.local.env의 OPENAI_API_KEY 줄)에서 읽고 출력하지 않는다.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { processOne, pngInfo } from './core.mjs';
import { DEFAULT_BASE_URL, createProxy, readSecretFile } from './proxy.mjs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: dry-run.mjs <photo> <out.png>');
  process.exit(2);
}
const keyFile = process.env.PROXY_API_KEY_FILE ?? '';
if (!keyFile) throw new Error('PROXY_API_KEY_FILE에 프록시 키 파일 경로를 넣어 주세요.');
const proxy = createProxy({
  baseUrl: process.env.PROXY_BASE_URL ?? DEFAULT_BASE_URL,
  apiKey: readSecretFile(keyFile, process.env.PROXY_API_KEY_NAME ?? 'OPENAI_API_KEY'),
  visionModel: process.env.AVATAR_VISION_MODEL,
  imageModel: process.env.AVATAR_IMAGE_MODEL,
});

const uid = randomUUID();
const id = randomUUID();
const files = new Map([[`${uid}/originals/${id}.png`, new Uint8Array(readFileSync(input))]]);
let job = { id, user_id: uid, original_path: `${uid}/originals/${id}.png`, attempts: 0, give_up: false };
const calls = [];
const db = {
  async claim() {
    if (!job) return null;
    const j = { ...job, attempts: job.attempts + 1 };
    job = null;
    return j;
  },
  async release(...a) { calls.push(['release', ...a]); },
  async settle(...a) { calls.push(['settle', a[1], a[2]]); return true; },
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

const t0 = Date.now();
const timed = {
  check: async (...a) => { const t = Date.now(); const v = await proxy.check(...a); console.log('vision', proxy.visionModel, Date.now() - t, 'ms', JSON.stringify(v)); return v; },
  draw: async (...a) => { const t = Date.now(); const d = await proxy.draw(...a); console.log('draw', proxy.imageModel, Date.now() - t, 'ms', JSON.stringify(d.usage)); return d; },
};
const result = await processOne({ db, store, proxy: timed, worker: 'dry-run', log });
console.log('result', JSON.stringify(result), 'total', Date.now() - t0, 'ms');
console.log('calls', JSON.stringify(calls));
const png = files.get(`${uid}/chars/${id}.png`);
if (png) {
  writeFileSync(output, png);
  console.log('wrote', output, png.length, 'bytes', JSON.stringify(pngInfo(png)));
}
