// 그리기 일꾼 한 바퀴(가짜 DB·저장소·프록시)와 상태 응답 모양
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processOne, pngInfo } from '../../worker/avatar/core.mjs';
import { jobView, MESSAGES } from '../../src/lib/avatar/rules.ts';

const UID = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const ORIG = `${UID}/originals/${ID}.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
function png(w, h, colorType) {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  b[24] = 8;
  b[25] = colorType;
  return b;
}

function rig({ attempts = 1, giveUp = false, verdict = { ok: true }, draw, settleOk = true } = {}) {
  const calls = [];
  const files = new Map([[ORIG, JPEG]]);
  let job = { id: ID, user_id: UID, original_path: ORIG, attempts, give_up: giveUp };
  return {
    calls,
    files,
    db: {
      claim: async () => { const j = job; job = null; return j; },
      release: async (id, w, delay) => { calls.push(['release', delay]); return true; },
      settle: async (id, status, o) => { calls.push(['settle', status, o.reason ?? o.imagePath ?? null]); return settleOk; },
    },
    store: {
      download: async (p) => files.get(p),
      upload: async (p, b) => { files.set(p, b); },
      remove: async (ps) => { for (const p of ps) files.delete(p); calls.push(['remove', ...ps]); },
    },
    proxy: {
      check: async () => verdict,
      draw: draw ?? (async () => ({ png: png(1024, 1536, 6), model: 'gpt-image-2.6-flare' })),
    },
    worker: 'w1',
  };
}

test('잘 그리면 그림을 올리고 ready, 원본은 남긴다', async () => {
  const r = rig();
  assert.equal((await processOne(r)).outcome, 'ready');
  assert.deepEqual(r.calls, [['settle', 'ready', `${UID}/chars/${ID}.png`]]);
  assert.ok(r.files.has(ORIG));
  assert.equal((await processOne(r)).outcome, 'idle');
});

test('아이로 보이면 원본을 지우고 rejected, 그리지 않는다', async () => {
  let drew = false;
  const r = rig({ verdict: { ok: false, reason: 'child' }, draw: async () => { drew = true; } });
  assert.equal((await processOne(r)).outcome, 'rejected');
  assert.deepEqual(r.calls, [['remove', ORIG], ['settle', 'rejected', 'child']]);
  assert.equal(drew, false);
});

test('잠깐의 실패는 두 번 다시, 세 번째는 원본을 지우고 failed', async () => {
  const boom = async () => { throw Object.assign(new Error('busy'), { status: 503 }); };
  for (const [n, delay] of [[1, 60], [2, 120]]) {
    const r = rig({ attempts: n, draw: boom });
    assert.equal((await processOne(r)).outcome, 'retry');
    assert.deepEqual(r.calls, [['release', delay]]);
  }
  const last = rig({ attempts: 3, draw: boom });
  assert.equal((await processOne(last)).outcome, 'failed');
  assert.deepEqual(last.calls, [['remove', ORIG], ['settle', 'failed', 'http_error']]);
});

test('내용 검사에 막히면 rejected, 투명·크기가 다르면 다시, 그사이 지웠으면 그림도 거둔다', async () => {
  const blocked = rig({ draw: async () => { throw Object.assign(new Error('x'), { blocked: true }); } });
  assert.deepEqual((await processOne(blocked)).reason, 'blocked');
  const opaque = rig({ draw: async () => ({ png: png(1024, 1536, 2), model: 'm' }) });
  assert.deepEqual([(await processOne(opaque)).reason, opaque.calls[0][0]], ['bad_output', 'release']);
  const gone = rig({ settleOk: false });
  assert.equal((await processOne(gone)).outcome, 'gone');
  assert.equal(gone.files.has(`${UID}/chars/${ID}.png`), false);
  const stuck = rig({ attempts: 3, giveUp: true });
  assert.deepEqual((await processOne(stuck)).reason, 'timeout');
  assert.deepEqual(pngInfo(png(10, 20, 6)), { width: 10, height: 20, alpha: true });
});

test('상태 응답: 화면 약속 모양, 일꾼이 조용하면 쉬는 중 안내, 지운 것은 null', () => {
  const now = Date.parse('2026-11-09T10:00:00Z');
  const fresh = '2026-11-09T09:59:00Z';
  assert.deepEqual(jobView({ status: 'queued', worker_seen_at: fresh }, ID, now, 600_000), { status: 'queued', message: MESSAGES.queued });
  assert.deepEqual(jobView({ status: 'drawing', worker_seen_at: null }, ID, now, 600_000), { status: 'drawing', message: MESSAGES.workerResting });
  assert.deepEqual(jobView({ status: 'ready' }, ID, now, 600_000), { status: 'ready', url: `/api/avatar/${ID}` });
  assert.deepEqual(jobView({ status: 'rejected', reason: 'child' }, ID, now, 600_000), { status: 'rejected', message: MESSAGES.child });
  assert.equal(jobView({ status: 'failed' }, ID, now, 600_000).status, 'failed');
  assert.equal(jobView({ status: 'deleted' }, ID, now, 600_000), null);
  assert.equal(jobView(null, ID, now, 600_000), null);
});
