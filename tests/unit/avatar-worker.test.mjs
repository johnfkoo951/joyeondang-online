// 그리기 일꾼 한 바퀴(가짜 DB·저장소·프록시)와 상태 응답 모양, 방향 그림 한 바퀴(가짜 그림 어댑터)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processOne, pngInfo } from '../../worker/avatar/core.mjs';
import { createProxy, safetyId } from '../../worker/avatar/proxy.mjs';
import { VIEWS_GAP_MS, VIEWS_LEASE_SECONDS, VIEWS_REST_MAX_MS, createViewsTurn, processViews } from '../../worker/avatar/views.mjs';
import { buildTurnaroundPrompt, SHEET_VIEWS_SCHEMA } from '../../src/lib/avatar/prompt.ts';
import { jobView, MESSAGES } from '../../src/lib/avatar/rules.ts';
import { VIEW_ORDER, facingSides, paste } from '../../src/lib/avatar/sheet.ts';
import { DRESS, blank, bounds, rect, resizeNearest, sheet } from './helpers/sheet-fixture.ts';

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

function rig({ attempts = 1, giveUp = false, verdict = { ok: true }, draw, settleOk = true, image = null } = {}) {
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
    image,
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

test('나이는 일꾼이 묻지 않는다: 사진 살피기에 아이 판정 옵션을 넘기지 않고, DB에 보호자 동의를 묻지 않는다', async () => {
  const seen = [];
  const r = rig();
  r.db.childOk = async () => { throw new Error('묻지 않아야 한다'); };
  r.proxy.check = async (...args) => { seen.push(args.length); return { ok: true }; };
  assert.equal((await processOne(r)).outcome, 'ready');
  assert.deepEqual(seen, [3], '사진, 형식, 사람 셋만 넘긴다');
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

// ───────── 한 장 그림의 크기 맞추기와 방향 그림(가짜 그림 어댑터)

/** 「WebP」「PNG」 대신 크기 넉 바이트 + 화소를 그대로 담는다(시험에서 다시 꺼내 볼 수 있게) */
const pack = (img) => {
  const out = new Uint8Array(4 + img.data.length);
  new DataView(out.buffer).setUint16(0, img.w);
  new DataView(out.buffer).setUint16(2, img.h);
  out.set(img.data, 4);
  return out;
};
const unpack = (bytes) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint16(0), h: v.getUint16(2), data: bytes.subarray(4) };
};
/**
 * 가짜 그림 어댑터. decode는 가짜 PNG의 마지막 바이트가 가리키는 시트를 돌려주고(시트가 없으면 머리에 적힌 크기의 불투명한 판),
 * resize는 가까운 화소 고르기, encode는 pack.
 */
function fakeImage(sheets = []) {
  return {
    decode: async (bytes) => {
      const hit = sheets[bytes[bytes.length - 1]];
      if (hit) return hit;
      const { width, height } = pngInfo(bytes);
      const img = blank(width, height);
      rect(img, 0, 0, width - 1, height - 1, DRESS);
      return img;
    },
    resize: async (img, w, h) => resizeNearest(img, w, h),
    encodeWebp: async (img) => pack(img),
    encodePng: async (img) => pack(img),
  };
}

test('한 장 그림: 크기가 달라도 세로로 긴 투명 그림이면 1024×1536 판의 가운데 아래에 맞춰 올린다', async () => {
  const fitted = async (w, h) => {
    const r = rig({ draw: async () => ({ png: png(w, h, 6), model: 'm' }), image: fakeImage() });
    assert.equal((await processOne(r)).outcome, 'ready');
    const out = unpack(r.files.get(`${UID}/chars/${ID}.png`));
    assert.deepEqual([out.w, out.h], [1024, 1536]);
    return bounds(out);
  };
  assert.deepEqual(await fitted(1064, 1478), { x0: 0, x1: 1023, y0: 114, y1: 1535, n: 1024 * 1422 }, '폭에 맞추고 위를 비운다');
  assert.deepEqual(await fitted(400, 1200), { x0: 256, x1: 767, y0: 0, y1: 1535, n: 512 * 1536 }, '작은 그림은 키에 맞춰 늘리고 좌우 가운데');
  // 크기가 맞으면 손대지 않는다
  const same = rig({ image: fakeImage() });
  await processOne(same);
  assert.deepEqual(same.files.get(`${UID}/chars/${ID}.png`), png(1024, 1536, 6));
});

test('한 장 그림: 가로로 길거나 투명하지 않거나 그림 어댑터가 없으면 예전처럼 다시 그린다', async () => {
  for (const [w, h, type, image] of [[1536, 1024, 6, fakeImage()], [1024, 1024, 6, fakeImage()], [1064, 1478, 2, fakeImage()], [1064, 1478, 6, null]]) {
    const r = rig({ draw: async () => ({ png: png(w, h, type), model: 'm' }), image });
    assert.deepEqual([(await processOne(r)).reason, r.calls], ['bad_output', [['release', 60]]], `${w}x${h} ${type}`);
    assert.equal(r.files.has(`${UID}/chars/${ID}.png`), false);
  }
  const broken = { ...fakeImage(), decode: async () => { throw new Error('truncated'); } };
  const r = rig({ draw: async () => ({ png: png(1064, 1478, 6), model: 'm' }), image: broken });
  assert.equal((await processOne(r)).reason, 'bad_output', '읽을 수 없는 그림');
});

const CHAR = `${UID}/chars/${ID}.png`;
const VL = `${UID}/views/${ID}.v1l.webp`;
const VS = `${UID}/views/${ID}.v1s.webp`;
/** 비전 모델의 답: 순서가 맞고 비스듬·옆의 코는 nose 쪽 */
const seenAs = (nose = 'left') => VIEW_ORDER.map((view, i) => ({ view, nose: i >= 1 && i <= 3 ? nose : 'none' }));

/** 방향 그림 한 바퀴의 가짜 틀. sheets[k]는 k번째로 그린 시트, seen[k]는 그 시트에 대한 비전 모델의 답 */
function viewsRig({ attempts = 1, sheetFails = 0, sheets = [sheet()], seen = [seenAs()], settleOk = true, job, charType = 6, sheetType = 6, turnaround, sheetViews, failUpload } = {}) {
  const calls = [];
  const files = new Map([[CHAR, png(1024, 1536, charType)]]);
  let next = job ?? { id: ID, user_id: UID, image_path: CHAR, attempts, sheet_fails: sheetFails };
  const r = {
    calls, files, drawn: 0, asked: 0, slept: 0, lease: null, worker: 'w1', settledBy: [],
    db: {
      viewsClaim: async (w, lease) => { r.lease = lease; const j = next; next = null; return j; },
      viewsRelease: async (id, w, delay, sheet) => { calls.push(sheet ? ['release', delay, 'sheet'] : ['release', delay]); return true; },
      viewsSettle: async (id, status, o) => {
        r.settledBy.push(o.worker);
        calls.push(['settle', status, status === 'ready' ? `${o.mode}/${o.model}` : o.reason]);
        return settleOk;
      },
    },
    store: {
      download: async (p) => { calls.push(['download', p]); return files.get(p); },
      upload: async (p, b, type) => {
        if (failUpload?.(p)) throw Object.assign(new Error('storage down'), { code: 'storage_error' });
        files.set(p, b);
        calls.push(['upload', p, type]);
      },
      remove: async (ps) => { for (const p of ps) files.delete(p); calls.push(['remove', ...ps]); },
    },
    proxy: {
      turnaround: turnaround ?? (async (bytes, uid) => {
        assert.deepEqual([bytes, uid], [files.get(CHAR), UID], '캐릭터 그림과 그 주인을 넘긴다');
        const out = png(1536, 1024, sheetType);
        out[39] = Math.min(r.drawn++, sheets.length - 1);
        return { png: out, model: 'img-1' };
      }),
      sheetViews: sheetViews ?? (async () => seen[Math.min(r.asked++, seen.length - 1)]),
    },
    image: fakeImage(sheets),
    sleep: async () => { r.slept++; },
  };
  return r;
}
/** 올린 묶음(큰 것)을 칸 다섯으로 나눈다 */
const cellsOf = (r) => {
  const atlas = unpack(r.files.get(VL));
  return [0, 1, 2, 3, 4].map((i) => { const c = blank(384, 576); paste(c, atlas, -i * 384, 0); return c; });
};

test('방향 그림: 시트를 그려 두 크기 묶음을 올리고 ready, 할 일이 없으면 idle', async () => {
  const r = viewsRig();
  assert.deepEqual(await processViews(r), { outcome: 'ready', id: ID, mode: 'full' });
  assert.deepEqual(r.calls, [['download', CHAR], ['upload', VL, 'image/webp'], ['upload', VS, 'image/webp'], ['settle', 'ready', 'full/img-1']]);
  const l = unpack(r.files.get(VL)), s = unpack(r.files.get(VS));
  assert.deepEqual([l.w, l.h, s.w, s.h], [1920, 576, 1280, 384], '한 줄에 다섯 칸(2:3)');
  assert.deepEqual(facingSides(cellsOf(r)).sides, ['left', 'left', 'left']);
  assert.deepEqual([r.drawn, r.asked, r.lease], [1, 1, VIEWS_LEASE_SECONDS]);
  assert.deepEqual(r.settledBy, ['w1'], '정리할 때 잡은 일꾼의 이름을 함께 넘긴다');
  assert.ok(r.files.has(CHAR), '캐릭터 그림은 그대로 둔다');
  assert.deepEqual(await processViews(r), { outcome: 'idle' });
});

test('방향 그림: 오른쪽을 보는 시트는 뒤집어 올린다. 살갗 색 판정과 비전 답이 다르면 앞·뒤 그림만 쓴다', async () => {
  const right = viewsRig({ sheets: [sheet({ turn: 'right' })], seen: [seenAs('right')] });
  assert.equal((await processViews(right)).mode, 'full');
  assert.deepEqual(facingSides(cellsOf(right)).sides, ['left', 'left', 'left'], '묶음의 비스듬·옆은 모두 왼쪽을 본다');

  const clash = viewsRig({ seen: [seenAs('right')] }); // 그림은 왼쪽을 보는데 비전 모델은 오른쪽이라고 한다
  assert.deepEqual(await processViews(clash), { outcome: 'ready', id: ID, mode: 'frontback' });
  assert.deepEqual(clash.calls.at(-1), ['settle', 'ready', 'frontback/img-1']);
  const c = cellsOf(clash);
  assert.deepEqual([c[1].data, c[2].data, c[3].data], [c[0].data, c[0].data, c[4].data], '앞 그림 셋, 뒤 그림 둘');

  // 보는 쪽을 알 수 없는 그림이라도 비전 모델이 말해 주면 그쪽으로, 아무도 모르면 앞·뒤만
  assert.equal((await processViews(viewsRig({ sheets: [sheet({ skew: 0 })], seen: [seenAs('right')] }))).mode, 'full');
  assert.equal((await processViews(viewsRig({ sheets: [sheet({ skew: 0 })], seen: [seenAs('none')] }))).mode, 'frontback');
});

test('방향 그림: 머리를 민 캐릭터는 살갗 색 판정을 쓰지 않고 비전 답을 따른다(앞 비스듬을 잘못 뒤집지 않는다)', async () => {
  /** 머리(칸의 위 46%)에서 안경(어두운 화소)이 머리 가운데의 어느 쪽에 있는가: 왼쪽이면 음수 */
  const glasses = (cell) => {
    let dx = 0, dn = 0, ax = 0, an = 0;
    for (let y = 0; y < cell.h * 0.46; y++) for (let x = 0; x < cell.w; x++) {
      const k = (y * cell.w + x) * 4;
      if (cell.data[k + 3] < 128) continue;
      ax += x; an++;
      if (cell.data[k] < 120) { dx += x; dn++; }
    }
    return dn ? Math.sign(Math.round(dx / dn - ax / an)) : 0;
  };
  const r = viewsRig({ sheets: [sheet({ bald: true })] });
  assert.deepEqual(await processViews(r), { outcome: 'ready', id: ID, mode: 'full' });
  assert.deepEqual(cellsOf(r).map(glasses), [0, -1, -1, 0, 0], '앞 비스듬과 옆의 안경이 모두 왼쪽에 있다');
  const right = viewsRig({ sheets: [sheet({ bald: true, turn: 'right' })], seen: [seenAs('right')] });
  assert.equal((await processViews(right)).mode, 'full');
  assert.deepEqual(cellsOf(right).map(glasses), [0, -1, -1, 0, 0], '오른쪽을 보는 시트는 비전 답대로 뒤집는다');
  // 비전 모델이 답했지만 쓸 수 없는 답(거절·내용 검사·모양이 다름)이면 같은 시트로는 끝내 확인할 수 없다:
  // 묶음을 만들지 않고 시트 탓으로 세어 조금 뒤 다시 그린다
  const blind = viewsRig({ sheets: [sheet({ bald: true })], seen: [null] });
  assert.deepEqual(await processViews(blind), { outcome: 'retry', reason: 'vision_unusable', id: ID, trouble: true });
  assert.deepEqual([blind.drawn, blind.calls], [1, [['download', CHAR], ['release', 120, 'sheet']]], '그 자리에서 다시 그리지 않고, 올린 것도 없다');
  // 세 번째 시트 실패면 그만둔다(같은 답이 되풀이되는데 그리기를 여덟 번 쓰지 않게)
  const third = viewsRig({ attempts: 3, sheetFails: 2, sheets: [sheet({ bald: true })], seen: [null] });
  assert.deepEqual(await processViews(third), { outcome: 'failed', reason: 'vision_unusable', id: ID, trouble: true });
  // 비전 모델에 닿지 못하면(두 번 다 503) 확인할 길이 없을 뿐이다: 프록시 쪽 사정으로 나중에 다시 한다(시트 실패로 세지 않는다)
  const busy = async () => { throw Object.assign(new Error('busy'), { status: 503 }); };
  const down = viewsRig({ sheets: [sheet({ bald: true })], sheetViews: busy });
  assert.deepEqual(await processViews(down), { outcome: 'retry', reason: 'vision_down', id: ID, trouble: true });
  assert.deepEqual(down.calls, [['download', CHAR], ['release', 120]]);
  const later = viewsRig({ attempts: 3, sheets: [sheet({ bald: true })], sheetViews: busy });
  assert.equal((await processViews(later)).outcome, 'retry', '프록시 쪽 사정은 세 번째에도 굳히지 않는다');
});

test('방향 그림: 비전 모델이 답하지 못하면 한 번 더 묻고, 그래도 안 되면 살갗 색 판정만으로 간다', async () => {
  const down = viewsRig({ sheetViews: async () => { down.asked++; throw Object.assign(new Error('busy'), { status: 503 }); } });
  assert.deepEqual(await processViews(down), { outcome: 'ready', id: ID, mode: 'full' });
  assert.deepEqual([down.asked, down.slept, down.drawn], [2, 1, 1]);
  const once = viewsRig({ sheetViews: async () => { if (once.asked++ === 0) throw new Error('reset'); return seenAs(); } });
  assert.equal((await processViews(once)).mode, 'full');
  assert.equal(once.asked, 2);
  const odd = viewsRig({ seen: [null] }); // 거절했거나 답의 모양이 달랐다: 다시 묻지 않는다
  assert.equal((await processViews(odd)).mode, 'full');
  assert.deepEqual([odd.asked, odd.slept], [1, 0]);
  const blind = viewsRig({ sheets: [sheet({ skew: 0 })], seen: [null] });
  assert.equal((await processViews(blind)).mode, 'frontback');
});

test('방향 그림: 비전 모델이 다섯 방향을 다른 순서로 봤으면 그 순서로 바로잡아 쓴다(다시 그리지 않는다)', async () => {
  const mixed = sheet({ order: ['side', 'fq', 'front', 'bq', 'back'] });
  const said = [VIEW_ORDER[2], VIEW_ORDER[1], VIEW_ORDER[0], VIEW_ORDER[3], VIEW_ORDER[4]].map((view) => ({ view, nose: view === 'front' || view === 'back' ? 'none' : 'left' }));
  const fixed = viewsRig({ sheets: [mixed], seen: [said] });
  assert.deepEqual(await processViews(fixed), { outcome: 'ready', id: ID, mode: 'full' });
  assert.deepEqual([fixed.drawn, fixed.asked], [1, 1]);
  const got = facingSides(cellsOf(fixed));
  assert.deepEqual(got.sides, ['left', 'left', 'left']);
  assert.ok(got.shares.every((v, i) => i === 0 || got.shares[i - 1] > v), '칸은 앞 → 뒤 순서: 살갗 몫이 차례로 준다');
  // 거꾸로 그린 시트도 같다
  const reversed = viewsRig({ sheets: [sheet({ order: ['back', 'bq', 'side', 'fq', 'front'] })], seen: [[...seenAs()].reverse()] });
  assert.deepEqual(await processViews(reversed), { outcome: 'ready', id: ID, mode: 'full' });
  const back = facingSides(cellsOf(reversed));
  assert.ok(back.shares[0] > back.shares[2] && back.shares[4] === 0, '0번 칸이 앞모습, 4번 칸이 뒷모습');
});

test('방향 그림: 순서를 믿을 수 없는 시트는 버리고 한 번만 다시 그린다', async () => {
  const said = [VIEW_ORDER[2], VIEW_ORDER[1], VIEW_ORDER[0], VIEW_ORDER[3], VIEW_ORDER[4]].map((view) => ({ view, nose: 'left' }));
  // 그려진 순서는 살갗 몫으로 보아 맞는데 비전 모델은 다른 순서라고 한다: 둘이 어긋나면 어느 쪽도 믿지 않는다
  const again = viewsRig({ sheets: [sheet(), sheet()], seen: [said, seenAs()] });
  assert.deepEqual(await processViews(again), { outcome: 'ready', id: ID, mode: 'full' });
  assert.deepEqual([again.drawn, again.asked], [2, 2]);
  assert.deepEqual(facingSides(cellsOf(again)).sides, ['left', 'left', 'left'], '두 번째 시트로 만든다');

  const twice = viewsRig({ sheets: [sheet()], seen: [said] });
  assert.deepEqual(await processViews(twice), { outcome: 'retry', reason: 'sheet_order', id: ID, trouble: true });
  assert.deepEqual([twice.drawn, twice.calls], [2, [['download', CHAR], ['release', 120, 'sheet']]], '이 한 바퀴에서는 두 장까지만 그린다');

  // 비전 답이 뒤죽박죽(같은 방향을 둘 봤다)이고 살갗 몫으로도 순서가 안 맞을 때: 양 끝을 앞·뒤로 봤으면 앞·뒤 그림만으로 만든다(다시 그리지 않는다)
  const dup = [VIEW_ORDER[0], VIEW_ORDER[2], VIEW_ORDER[2], VIEW_ORDER[3], VIEW_ORDER[4]].map((view) => ({ view, nose: 'left' }));
  const messy = viewsRig({ sheets: [sheet({ order: ['front', 'side', 'fq', 'bq', 'back'] }), sheet()], seen: [dup, seenAs()] });
  assert.deepEqual(await processViews(messy), { outcome: 'ready', id: ID, mode: 'frontback' });
  assert.equal(messy.drawn, 1);
  // 양 끝도 앞·뒤가 아니라고 보면 다시 그린다
  const ends = [VIEW_ORDER[1], VIEW_ORDER[1], VIEW_ORDER[2], VIEW_ORDER[3], VIEW_ORDER[4]].map((view) => ({ view, nose: 'left' }));
  const worse = viewsRig({ sheets: [sheet({ order: ['front', 'side', 'fq', 'bq', 'back'] }), sheet()], seen: [ends, seenAs()] });
  assert.deepEqual(await processViews(worse), { outcome: 'ready', id: ID, mode: 'full' });
  assert.equal(worse.drawn, 2);
  // 뒤죽박죽인 답이라도 그려진 순서가 살갗 몫으로 맞으면 살갗 색 판정만으로 쓴다
  const byCode = viewsRig({ seen: [dup] });
  assert.deepEqual(await processViews(byCode), { outcome: 'ready', id: ID, mode: 'full' });
  assert.equal(byCode.drawn, 1);
});

test('방향 그림: 사람이 다섯이 아닌 시트는 2분·4분 뒤 다시, 세 번째 시트 실패는 failed. 그 자리에서 다시 그리지 않는다', async () => {
  const four = [sheet({ order: ['front', 'fq', 'side', 'back'] })];
  for (const [fails, delay] of [[0, 120], [1, 240]]) {
    const r = viewsRig({ attempts: fails + 1, sheetFails: fails, sheets: four });
    assert.deepEqual(await processViews(r), { outcome: 'retry', reason: 'sheet_count', id: ID, trouble: true });
    assert.deepEqual([r.drawn, r.asked, r.calls], [1, 0, [['download', CHAR], ['release', delay, 'sheet']]], '시트 탓이라고 알리며 돌려놓는다');
  }
  const last = viewsRig({ attempts: 3, sheetFails: 2, sheets: four });
  assert.deepEqual(await processViews(last), { outcome: 'failed', reason: 'sheet_count', id: ID, trouble: true });
  assert.deepEqual(last.calls, [['download', CHAR], ['settle', 'failed', 'sheet_count']]);
  assert.deepEqual(last.settledBy, ['w1'], '그만둘 때도 잡은 일꾼의 이름을 넘긴다(임대가 넘어간 뒤의 그만두기를 DB가 거른다)');
  for (const [opts, reason] of [
    [{ sheets: [sheet({ order: ['front', 'fq', 'side', 'bq', 'back', 'back'] })] }, 'sheet_count'],
    [{ sheets: [sheet({ heights: [120, 120, 90, 120, 120] })] }, 'sheet_heights'],
    [{ sheetType: 2 }, 'bad_output'],
  ]) {
    assert.equal((await processViews(viewsRig(opts))).reason, reason);
  }
});

test('방향 그림: 시트 실패와 프록시 쪽 실패는 따로 센다. 프록시가 멈춘 사이 쓴 횟수가 시트의 세 번을 깎지 않는다', async () => {
  const four = [sheet({ order: ['front', 'fq', 'side', 'back'] })];
  // 프록시가 멈춰 세 번 돌려놓인 뒤(잡은 횟수 4) 처음 받은 시트가 이상하다: 첫 시트 실패이므로 2분 뒤 다시 그린다
  const after = viewsRig({ attempts: 4, sheetFails: 0, sheets: four });
  assert.deepEqual(await processViews(after), { outcome: 'retry', reason: 'sheet_count', id: ID, trouble: true });
  assert.deepEqual(after.calls, [['download', CHAR], ['release', 120, 'sheet']]);
  // 시트 실패가 두 번 있었던 줄이 프록시 탓으로 실패하면: 프록시 쪽 첫 실패이므로 2분(시트 탓으로 세지 않는다)
  const boom = async () => { throw Object.assign(new Error('busy'), { status: 503 }); };
  const mixed = viewsRig({ attempts: 3, sheetFails: 2, turnaround: boom });
  assert.deepEqual(await processViews(mixed), { outcome: 'retry', reason: 'http_error', id: ID, trouble: true });
  assert.deepEqual(mixed.calls, [['download', CHAR], ['release', 120]]);
  // 옛 DB 어댑터가 시트 실패 수를 주지 않아도(없으면 0) 돈다
  const old = viewsRig({ job: { id: ID, user_id: UID, image_path: CHAR, attempts: 1 }, sheets: four });
  assert.deepEqual((await processViews(old)).outcome, 'retry');
});

test('방향 그림: 프록시·저장소가 안 될 때는 2분·4분, 그 뒤로는 한 시간씩 쉬며 여덟 번까지 기다린다', async () => {
  const boom = async () => { throw Object.assign(new Error('busy'), { status: 503 }); };
  for (const [n, delay] of [[1, 120], [2, 240], [3, 3600], [7, 3600]]) {
    const r = viewsRig({ attempts: n, turnaround: boom });
    assert.deepEqual(await processViews(r), { outcome: 'retry', reason: 'http_error', id: ID, trouble: true });
    assert.deepEqual(r.calls, [['download', CHAR], ['release', delay]], `${n}번째`);
  }
  const last = viewsRig({ attempts: 8, turnaround: boom });
  assert.deepEqual(await processViews(last), { outcome: 'failed', reason: 'http_error', id: ID, trouble: true });
  // 올리기는 한 번 더 해 본다. 그래도 안 되면 먼저 올린 것을 거두고 다시
  let tries = 0;
  const blip = viewsRig({ failUpload: (p) => p === VS && tries++ === 0 });
  assert.equal((await processViews(blip)).outcome, 'ready');
  assert.deepEqual([blip.slept, blip.drawn, blip.files.has(VS)], [1, 1, true], '그린 시트를 버리지 않는다');
  const half = viewsRig({ failUpload: (p) => p === VS });
  assert.deepEqual(await processViews(half), { outcome: 'retry', reason: 'storage_error', id: ID, trouble: true });
  assert.deepEqual(half.calls.slice(-2), [['release', 120], ['remove', VL, VS]], '줄을 돌려놓은 뒤에 거둔다');
  assert.equal(half.files.has(VL), false);
  // 임대가 넘어가 다른 일꾼이 그 자리를 맡았으면(돌려놓기가 false) 올린 파일을 거두지 않는다: 그 일꾼이 같은 자리에 올려 ready로 적은 묶음일 수 있다
  const taken = viewsRig({ failUpload: (p) => p === VS });
  taken.db.viewsRelease = async (id, w, delay) => { taken.calls.push(['release', delay]); return false; };
  assert.equal((await processViews(taken)).outcome, 'retry');
  assert.deepEqual([taken.files.has(VL), taken.calls.some((c) => c[0] === 'remove')], [true, false]);
  // ready로 적다가 난 오류: 적혔는지 알 수 없으니 올린 파일은 두고 돌려놓기만 한다
  const lost = viewsRig();
  lost.db.viewsSettle = async () => { throw Object.assign(new Error('socket hang up'), { code: 'db_error' }); };
  assert.deepEqual(await processViews(lost), { outcome: 'retry', reason: 'db_error', id: ID, trouble: true });
  assert.deepEqual(lost.calls.slice(-1), [['release', 120]]);
  assert.deepEqual([lost.files.has(VL), lost.files.has(VS), lost.calls.some((c) => c[0] === 'remove')], [true, true, false]);
});

test('방향 그림: 내용 검사에 막히면 바로 failed, 그사이 지웠으면 올린 묶음을 거둔다, 이상한 작업은 그리지 않는다', async () => {
  const blocked = viewsRig({ turnaround: async () => { throw Object.assign(new Error('x'), { blocked: true, status: 400 }); } });
  assert.deepEqual(await processViews(blocked), { outcome: 'failed', reason: 'blocked', id: ID, trouble: false });
  assert.deepEqual(blocked.calls, [['download', CHAR], ['settle', 'failed', 'blocked']]);

  const gone = viewsRig({ settleOk: false });
  assert.deepEqual(await processViews(gone), { outcome: 'gone', id: ID });
  assert.deepEqual(gone.calls.slice(-2), [['settle', 'ready', 'full/img-1'], ['remove', VL, VS]]);
  assert.deepEqual([...gone.files.keys()], [CHAR]);

  for (const job of [
    { id: ID, user_id: UID, image_path: `${UID}/chars/33333333-3333-4333-8333-333333333333.png`, attempts: 1 },
    { id: ID, user_id: UID, image_path: `${UID}/originals/${ID}.png`, attempts: 1 },
    { id: 'x', user_id: UID, image_path: CHAR, attempts: 1 },
    { id: ID, user_id: UID, image_path: null, attempts: 1 },
  ]) {
    const r = viewsRig({ job });
    assert.deepEqual(await processViews(r), { outcome: 'failed', reason: 'bad_job', id: job.id, trouble: false });
    assert.deepEqual([r.drawn, r.calls], [0, [['settle', 'failed', 'bad_job']]]);
  }
  const notPng = viewsRig();
  notPng.files.set(CHAR, JPEG);
  assert.equal((await processViews(notPng)).reason, 'bad_char');
  assert.equal(notPng.drawn, 0);
});

test('방향 그림: 임대가 끝나 가면(잠들었다 깬 컴퓨터) 올리지도 정리하지도 않고 물러난다', async () => {
  // 그리는 사이에 시계가 임대 시간만큼 흘렀다: 다른 일꾼이 이 줄을 다시 잡았을 수 있다
  for (const boom of [false, true]) {
    let t = 5_000;
    const r = viewsRig({ sheetViews: async () => { t += VIEWS_LEASE_SECONDS * 1000; if (boom) throw new Error('reset'); return seenAs(); } });
    assert.deepEqual(await processViews({ ...r, now: () => t }), { outcome: 'late', id: ID, trouble: true });
    assert.deepEqual(r.calls, [['download', CHAR]], '올리기·정리·되돌리기를 하나도 하지 않는다');
    assert.deepEqual([...r.files.keys()], [CHAR]);
  }
  let t = 0;
  const slow = viewsRig({ turnaround: async () => { t += VIEWS_LEASE_SECONDS * 1000; throw Object.assign(new Error('busy'), { status: 503 }); } });
  assert.equal((await processViews({ ...slow, now: () => t })).outcome, 'late');
  assert.deepEqual(slow.calls, [['download', CHAR]]);
  // 임대 안에서 끝나면 그대로 올린다
  t = 0;
  const fine = viewsRig({ sheetViews: async () => { t += (VIEWS_LEASE_SECONDS - 120) * 1000; return seenAs(); } });
  assert.equal((await processViews({ ...fine, now: () => t })).outcome, 'ready');
});

test('방향 그림 차례: 한 건 만들면 조금 쉬고, 잇달아 실패하면 1분에서 두 배씩 길게 쉰다', async () => {
  let t = 1_000_000, ran = 0;
  const next = [];
  const logs = [];
  const turn = createViewsTurn({
    run: async () => { ran++; const r = next.shift(); if (r instanceof Error) throw r; return r; },
    now: () => t,
    log: (level, msg, extra) => logs.push([msg, extra.minutes ?? extra.message]),
  });
  /** 결과 r이 나오는 차례를 한 번 돌리고, 그 뒤 ms 동안은 쉬는지(다시 돌리지 않는지) 본다 */
  const step = async (r, restMs) => {
    next.push(r);
    const before = ran;
    assert.equal(await turn(), r instanceof Error || r.outcome !== 'idle', '일을 했으면 true');
    assert.equal(ran, before + 1, '쉬는 시간이 끝났으면 돌린다');
    if (restMs) {
      t += restMs - 1;
      assert.equal(await turn(), false);
      assert.equal(ran, before + 1, `${restMs}ms가 차기 전에는 돌리지 않는다`);
      t += 1;
    }
  };
  await step({ outcome: 'idle' }, 0);
  await step({ outcome: 'ready' }, VIEWS_GAP_MS);
  for (const minutes of [1, 2, 4, 8, 16, 32, 60, 60]) await step({ outcome: 'retry', trouble: true }, Math.min(minutes * 60_000, VIEWS_REST_MAX_MS));
  await step({ outcome: 'ready' }, VIEWS_GAP_MS); // 한 번 되면 다시 1분부터
  await step({ outcome: 'failed', reason: 'http_error', trouble: true }, 60_000);
  await step(Object.assign(new Error('avatar_views_claim: function not found'), { code: 'db_error' }), 120_000); // 던진 오류도 받아서 쉰다
  // 그 캐릭터만의 실패(내용 검사에 막힘, 그사이 지움)는 쉬지 않고 다음으로
  await step({ outcome: 'failed', reason: 'blocked', trouble: false }, 0);
  await step({ outcome: 'gone' }, 0);
  await step({ outcome: 'idle' }, 0);
  assert.deepEqual(logs.filter(([m]) => m === 'views error'), [['views error', 'avatar_views_claim: function not found']]);
  assert.deepEqual(logs.filter(([m]) => m === 'views resting').map(([, min]) => min), [1, 2, 4, 8, 16, 32, 60, 60, 1, 2]);
});

// ───────── 프록시에 보내는 모양(가짜 fetch)과 진짜 그림 어댑터

test('프록시: 방향 그림은 가로 시트 크기·투명 바탕으로 청하고, 시트 살피기는 흰 바탕 JPEG와 스키마로 묻는다', async (t) => {
  const sent = [];
  let answer = { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ figures: seenAs() }) }] }] };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent.push({ url: String(url), init });
    if (String(url).endsWith('/images/edits')) return Response.json({ data: [{ b64_json: Buffer.from(png(2172, 724, 6)).toString('base64') }] });
    return Response.json(answer);
  });
  const shown = [];
  const proxy = createProxy({
    baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'k',
    image: { previewJpeg: async (bytes) => { shown.push(bytes); return JPEG; } },
  });
  const char = png(1024, 1536, 6);
  const drawn = await proxy.turnaround(char, UID);
  assert.deepEqual([drawn.model, pngInfo(drawn.png).width], ['gpt-image-2.6-flare', 2172], '돌아온 크기는 무엇이든 받는다');
  const form = sent[0].init.body;
  assert.equal(sent[0].url, 'http://127.0.0.1:9/v1/images/edits');
  assert.deepEqual(
    ['model', 'size', 'quality', 'background', 'output_format', 'n', 'complexity'].map((k) => form.get(k)),
    ['gpt-image-2.6-flare', '1536x1024', 'medium', 'transparent', 'png', '1', null],
  );
  assert.equal(form.get('prompt'), buildTurnaroundPrompt());
  assert.deepEqual(new Uint8Array(await form.get('image').arrayBuffer()), char, '참고 그림은 캐릭터 그림 그대로');
  assert.equal(form.get('image').type, 'image/png');
  assert.equal(form.get('safety_identifier'), safetyId(UID));
  assert.equal([...form.values()].some((v) => typeof v === 'string' && v.includes(UID)), false, '계정 id를 그대로 보내지 않는다');

  assert.deepEqual(await proxy.sheetViews(drawn.png, UID), seenAs());
  assert.equal(sent[1].url, 'http://127.0.0.1:9/v1/responses');
  const body = JSON.parse(sent[1].init.body);
  assert.deepEqual([body.model, body.store, body.safety_identifier], ['gpt-6-luna', false, safetyId(UID)]);
  assert.deepEqual(body.text.format, { type: 'json_schema', name: 'sheet_views', strict: true, schema: JSON.parse(JSON.stringify(SHEET_VIEWS_SCHEMA)) });
  assert.equal(body.input[0].content[1].image_url, `data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`);
  assert.deepEqual(shown, [drawn.png], '시트는 작은 JPEG로 바꿔 보낸다');

  // 거절하거나 모양이 다른 답은 null(답이 없는 것으로 친다)
  answer = { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] };
  assert.equal(await proxy.sheetViews(drawn.png), null);
  answer = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"figures":[{"view":"front"}]}' }] }] };
  assert.equal(await proxy.sheetViews(drawn.png), null);
  assert.equal(JSON.parse(sent.at(-1).init.body).safety_identifier, undefined);
  await assert.rejects(createProxy({ apiKey: 'k' }).sheetViews(drawn.png), /image tools missing/);
});

const realImage = await import('../../worker/avatar/image.mjs').then((m) => m.createImage()).catch(() => null);

test('그림 어댑터(sharp): PNG는 화소 그대로 오가고, 묶음 WebP는 띠의 옅은 알파와 번진 색을 지킨다', { skip: !realImage && 'sharp가 없다' }, async () => {
  const img = blank(96, 64);
  rect(img, 20, 10, 60, 50, DRESS);
  rect(img, 10, 10, 19, 50, DRESS, 12); // 몸 바깥으로 번지게 채운 띠
  const back = await realImage.decode(await realImage.encodePng(img));
  assert.deepEqual([back.w, back.h], [96, 64]);
  assert.deepEqual(back.data, img.data);

  const webp = await realImage.encodeWebp(img);
  assert.deepEqual(String.fromCharCode(...webp.subarray(0, 4), ...webp.subarray(8, 12)), 'RIFFWEBP');
  const seen = await realImage.decode(webp);
  const at = (x, y) => [...seen.data.subarray((y * 96 + x) * 4, (y * 96 + x) * 4 + 4)];
  assert.equal(at(40, 30)[3], 255);
  assert.ok(Math.abs(at(14, 30)[3] - 12) <= 3, `띠의 알파 ${at(14, 30)[3]}`);
  assert.ok(Math.hypot(at(14, 30)[0] - DRESS[0], at(14, 30)[1] - DRESS[1], at(14, 30)[2] - DRESS[2]) < 40, '띠의 색은 몸 색');
  assert.equal(at(80, 30)[3], 0);

  const half = await realImage.resize(img, 48, 32);
  assert.deepEqual([half.w, half.h, half.data.length], [48, 32, 48 * 32 * 4]);
  assert.equal(half.data[(15 * 48 + 20) * 4 + 3], 255);
  // 비전 모델에 보여 줄 그림: 흰 바탕에 올린 JPEG
  const jpeg = await realImage.previewJpeg(await realImage.encodePng(img));
  assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  const flat = await realImage.decode(jpeg);
  assert.equal(flat.w, 1400);
  const corner = [...flat.data.subarray(0, 4)];
  assert.ok(corner[0] > 245 && corner[1] > 245 && corner[2] > 245 && corner[3] === 255, '투명한 곳은 흰색');
});
