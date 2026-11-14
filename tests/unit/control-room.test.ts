// 컨트롤 룸 화면 배치와 녹화 시험: 칸이 벽 안에 겹치지 않고 가장 크게 놓이는지, 녹화가 1초 조각을 모아
// 멈출 때와 나눌 때 파일로 내보내는지(파일 이름·크기·빈 파일 없음), 브라우저마다 고르는 영상 형식.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { CELL_ASPECT, fovForAspect, fullRect, gridRects, rectAt } from '../../src/components/control/layout.ts';
import {
  REC_MIMES, REC_SLICE_MS, formatBytes, formatElapsed, pickMime, recBitrate, recFileName, startRecording, type RecStatus,
} from '../../src/components/control/recorder.ts';

test('배치: 칸은 벽 안에, 겹치지 않고, 16:9, 정수 px', () => {
  for (const [n, w, h] of [[1, 800, 600], [2, 1920, 1000], [10, 1920, 1000], [16, 1600, 900], [16, 390, 700], [7, 1280, 720]]) {
    const rs = gridRects(n, w, h);
    assert.equal(rs.length, n);
    for (const r of rs) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h, `${n} ${w}x${h} ${JSON.stringify(r)}`);
      assert.ok(Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.w) && Number.isInteger(r.h));
      assert.ok(Math.abs(r.w / r.h - CELL_ASPECT) < 0.02);
    }
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `겹침 ${i} ${j}`);
      }
    }
  }
  // 넓은 벽의 16칸은 4×4가 아니라 더 큰 칸이 되는 배치(줄이 적은 쪽)
  const wide = gridRects(16, 2400, 900);
  assert.ok(wide[0].w >= gridRects(16, 1600, 900)[0].w);
  assert.deepEqual(gridRects(0, 100, 100), []);
  assert.deepEqual(gridRects(3, 0, 100), []);
});

test('배치: 크게 보기와 누른 자리의 칸, 좁은 칸의 시야각', () => {
  assert.deepEqual(fullRect(1000.7, 500.2), { x: 0, y: 0, w: 1000, h: 500 });
  const rs = gridRects(4, 1000, 600);
  assert.equal(rectAt(rs, rs[2].x + 1, rs[2].y + 1), 2);
  assert.equal(rectAt(rs, -5, -5), -1);
  assert.equal(fovForAspect(60, 2.4), 60);
  assert.ok(fovForAspect(60, 1) > 60 && fovForAspect(60, 0.5) <= 100);
});

test('녹화: 형식은 앞에 있는 것부터, 하나도 안 되면 null', () => {
  assert.equal(pickMime(() => true), REC_MIMES[0]);
  assert.equal(pickMime((t) => t === 'video/webm'), 'video/webm');
  assert.equal(pickMime(() => false), null);
  assert.equal(pickMime(() => { throw new Error('x'); }), null);
});

test('녹화: 파일 이름은 기기 시각으로 조연당-컨트롤룸-YYYYMMDD-HHMM.webm', () => {
  assert.equal(recFileName(new Date(2026, 10, 12, 9, 5, 59)), '조연당-컨트롤룸-20261112-0905.webm');
  assert.equal(recFileName(new Date(2026, 0, 1, 23, 59)), '조연당-컨트롤룸-20260101-2359.webm');
});

test('녹화: 크기·걸린 시간·비트레이트 글', () => {
  assert.equal(formatBytes(0), '0 KB');
  assert.equal(formatBytes(1536), '2 KB');
  assert.equal(formatBytes(12.34 * 1024 * 1024), '12.3 MB');
  assert.equal(formatBytes(3 * 1024 ** 3), '3.00 GB');
  assert.equal(formatElapsed(65_000), '1:05');
  assert.equal(formatElapsed(3_723_000), '1:02:03');
  assert.equal(recBitrate(1920, 1080), 2488320);
  assert.equal(recBitrate(100, 100), 1e6);
  assert.equal(recBitrate(8000, 8000), 6e6);
});

// 가짜 MediaRecorder: start 때 조각 길이를 적고, push로 조각을 내보내고, stop하면 남은 조각 하나와 stop을 알린다
class FakeRec {
  static all: FakeRec[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  slice = 0;
  opts: MediaRecorderOptions;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(opts: MediaRecorderOptions) {
    this.opts = opts;
    FakeRec.all.push(this);
  }
  start(slice?: number) { this.state = 'recording'; this.slice = slice ?? 0; }
  push(bytes: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) }); }
  stop() {
    this.state = 'inactive';
    this.push(10);
    this.onstop?.(new Event('stop'));
  }
}

test('녹화: 1초 조각을 모아 멈출 때 파일 하나, 길면 나눠 여러 파일(빈틈 없이 다음 것을 먼저 연다)', async () => {
  FakeRec.all = [];
  let t = new Date(2026, 10, 12, 14, 0, 0).getTime();
  const timers: Array<{ fn: () => void; at: number }> = [];
  const saved: Array<{ name: string; size: number; ms: number; type: string }> = [];
  const states: RecStatus[] = [];
  const r = startRecording({
    stream: {} as MediaStream,
    mime: 'video/webm;codecs=vp9',
    bitrate: 2e6,
    segmentMs: 60_000,
    now: () => t,
    makeRecorder: (_s, o) => new FakeRec(o),
    setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h as (typeof timers)[number]); if (i >= 0) timers.splice(i, 1); },
    save: (blob, name, ms) => saved.push({ name, size: blob.size, ms, type: blob.type }),
    onChange: (s) => states.push(s),
  });
  assert.equal(FakeRec.all.length, 1);
  assert.equal(FakeRec.all[0].slice, REC_SLICE_MS);
  assert.equal(FakeRec.all[0].opts.mimeType, 'video/webm;codecs=vp9');
  FakeRec.all[0].push(1000);
  FakeRec.all[0].push(500);
  assert.equal(r.status().bytes, 1500);
  // 1분이 지나 나눈다: 다음 녹화를 먼저 열고 앞 것을 닫는다
  t += 60_000;
  timers.shift()!.fn();
  assert.equal(FakeRec.all.length, 2);
  assert.equal(FakeRec.all[1].state, 'recording');
  assert.equal(FakeRec.all[0].state, 'inactive');
  assert.deepEqual(saved.map((s) => [s.name, s.size, s.ms, s.type]), [['조연당-컨트롤룸-20261112-1400.webm', 1510, 60_000, 'video/webm']]);
  // 새 파일의 크기는 0부터, 전체 크기는 이어서
  assert.equal(r.status().bytes, 0);
  FakeRec.all[1].push(200);
  t += 5_000;
  await r.stop();
  assert.equal(saved.length, 2);
  assert.deepEqual([saved[1].name, saved[1].size, saved[1].ms], ['조연당-컨트롤룸-20261112-1401.webm', 210, 5_000]);
  const end = r.status();
  assert.equal(end.on, false);
  assert.equal(end.files, 2);
  assert.equal(end.totalBytes, 1720);
  assert.equal(timers.length, 0);
  // 두 번 멈춰도 그대로
  await r.stop();
  assert.equal(saved.length, 2);
  assert.ok(states.length > 3);
});

test('녹화: 조각이 하나도 없으면 빈 파일을 내보내지 않는다', async () => {
  FakeRec.all = [];
  const saved: string[] = [];
  const r = startRecording({
    stream: {} as MediaStream, mime: 'video/webm', bitrate: 1e6,
    makeRecorder: (_s, o) => {
      const f = new FakeRec(o);
      f.stop = () => { f.state = 'inactive'; f.onstop?.(new Event('stop')); };
      return f;
    },
    setTimer: () => 0, clearTimer: () => {},
    save: (_b, name) => saved.push(name),
    onChange: () => {},
  });
  await r.stop();
  assert.deepEqual(saved, []);
  assert.equal(r.status().files, 0);
});

// 대화 기록 읽기는 방 이름표(@/content/rooms)를 가져온다: 시험에서는 @/와 확장자 없는 가져오기를 찾게 한다
const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});
const { mergeFeed, readFeed, whereOf } = await import('../../src/components/control/useChatFeed.ts');

test('대화 기록: 한 줄 읽기(모자라면 버림), 공간 이름, 합치기', async () => {
  const ok = readFeed({ id: 'a1', at: '2026-11-12T05:00:00.000Z', ms: 1000, name: '가', body: ' 안녕 ', space: 'house:real~2', mentions: [{ sub: 'x', name: '나' }, { bad: 1 }] });
  assert.deepEqual(ok, { id: 'a1', at: '2026-11-12T05:00:00.000Z', ms: 1000, name: '가', text: '안녕', where: '집', mentions: ['나'] });
  assert.equal(readFeed({ id: 'a2', at: 'x', body: '' }), null);
  assert.equal(readFeed(null), null);
  // ms가 없으면 at으로
  assert.equal(readFeed({ id: 'a3', at: '2026-11-12T05:00:01.000Z', body: '응' })?.ms, Date.parse('2026-11-12T05:00:01.000Z'));
  const { ROOM_BY_SLUG } = await import('../../src/content/rooms.ts');
  assert.equal(whereOf('room:porch'), ROOM_BY_SLUG.get('porch')?.name);
  assert.equal(whereOf('room:zz-none'), '방');
  assert.equal(whereOf('nope'), null);
  const line = (id: string, ms: number) => ({ id, at: String(ms), ms, name: '가', text: id, where: null, mentions: [] });
  const merged = mergeFeed([line('b', 2), line('a', 1)], [line('c', 3), line('b', 2)], 2);
  assert.deepEqual(merged.map((l) => l.id), ['b', 'c']);
});

const { addDuration, withDuration } = await import('../../src/components/control/webm.ts');
/** 실시간 녹화 webm의 머리 모양(시험용으로 지어냄): EBML 머리, 크기를 모르는 Segment, 정보 칸(시간 단위·앱 이름), 트랙, 묶음 */
function liveWebm(): Uint8Array {
  return Uint8Array.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01,
    0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x15, 0x49, 0xa9, 0x66, 0x8b, 0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40, 0x4d, 0x80, 0x81, 0x78,
    0x16, 0x54, 0xae, 0x6b, 0x80,
    0x1f, 0x43, 0xb6, 0x75, 0x81, 0xe7,
  ]);
}

test('녹화 파일 길이: 정보 칸 끝에 길이를 더하고 크기를 고친다, 나머지는 그대로', () => {
  const src = liveWebm();
  const p = addDuration(src, 2500);
  assert.ok(p);
  const out = p.bytes;
  // 정보 칸(15 49 a9 66)의 크기 11 → 22, 그 끝에 44 89 88 + 2500(ms, 시간 단위 1ms)
  const at = 21;
  assert.deepEqual([...out.subarray(at, at + 5)], [0x15, 0x49, 0xa9, 0x66, 0x96]);
  const dur = out.subarray(at + 5 + 11, at + 5 + 22);
  assert.deepEqual([...dur.subarray(0, 3)], [0x44, 0x89, 0x88]);
  assert.equal(new DataView(dur.buffer, dur.byteOffset + 3, 8).getFloat64(0), 2500);
  // 원래 파일의 나머지(트랙·묶음)는 consumed부터 그대로 이어진다
  assert.equal(p.consumed, at + 5 + 11);
  assert.deepEqual([...src.subarray(p.consumed)], [0x16, 0x54, 0xae, 0x6b, 0x80, 0x1f, 0x43, 0xb6, 0x75, 0x81, 0xe7]);
  // 이미 길이가 있으면, webm이 아니면, 길이가 0이면 손대지 않는다
  const again = new Uint8Array([...out, ...src.subarray(p.consumed)]);
  assert.equal(addDuration(again, 1000), null);
  assert.equal(addDuration(Uint8Array.from([1, 2, 3, 4]), 1000), null);
  assert.equal(addDuration(src, 0), null);
  // 크기를 아는 Segment(자리를 함께 고쳐야 함)는 손대지 않는다
  const known = liveWebm();
  known.set([0x01, 0, 0, 0, 0, 0, 0, 0x1a], 13);
  assert.equal(addDuration(known, 1000), null);
});

test('녹화 파일 길이: 파일 하나를 받아 머리만 고친 새 파일, 못 고치면 그대로', async () => {
  const src = liveWebm();
  const blob = new Blob([src as BlobPart], { type: 'video/webm' });
  const out = await withDuration(blob, 1000);
  assert.equal(out.size, blob.size + 11);
  assert.equal(out.type, 'video/webm');
  const bytes = new Uint8Array(await out.arrayBuffer());
  assert.deepEqual([...bytes.subarray(bytes.length - 6)], [0x1f, 0x43, 0xb6, 0x75, 0x81, 0xe7]);
  const odd = new Blob([new Uint8Array([9, 9, 9])]);
  assert.equal(await withDuration(odd, 1000), odd);
});
