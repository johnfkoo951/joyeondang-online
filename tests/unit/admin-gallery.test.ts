// 캐릭터 관리 콘솔의 갤러리(2D 그림 · 3D 모형 보기): 주소의 보기, 보기마다 고르기와 수, 카드의 짧은 상태,
// 3D 사진의 열쇠·사진기 자리, 사진 줄(한 번에 한 장, 캐시, 물리기, 못 찍음, 멈춤, 쉬기), 화면과 찍는 곳의 연결.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 가져온다: 시험에서는 .ts를 붙여 찾게 한다
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

const A = await import('../../src/lib/avatar/admin-rules.ts');
const G = await import('../../src/lib/avatar/admin-gallery.ts');
type Row = import('../../src/lib/avatar/admin-rules.ts').CharacterRow;
type SnapIo = import('../../src/lib/avatar/admin-gallery.ts').SnapIo;

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function inOrder(text: string, steps: string[]): void {
  const at = steps.map((s) => text.indexOf(s));
  assert.deepEqual(at.map((i) => i >= 0), steps.map(() => true), `빠진 단계: ${steps.filter((_, k) => at[k] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `순서가 다르다: ${steps.join(' → ')}`);
}

const raw = (n: number, o: Record<string, unknown> = {}) => ({
  id: id(n), owner_id: id(100 + n), owner_name: `손님${n}`, nickname: null, owner_role: 'guest', owner_removed: false, event_label: null,
  created_at: '2026-11-12T01:00:00Z', status: 'ready', reason: null, slot: 1, kept: false, worn: false, has_original: true,
  pic_ver: '1731373200000', model_state: 'none', model_maker: null, model_reason: null, model_attempts: 0, model_tries: 0,
  model_via: null, model_ver: 1, model_prev: false, model_by_admin: false, model_asked_at: null, model_claimed_at: null,
  views_status: 'ready', redrawing: false, ...o,
});
const rows = (list: Record<string, unknown>[]): Row[] => A.readCharacterRows(list.map((o, k) => raw(k + 1, o)));

// ───────────────────────────── 보기
test('주소의 보기: ?view=3d만 3D, 없거나 모르는 값은 2D. 바꾸면 그 칸만(다른 칸과 #은 그대로), 2D는 칸을 뺀다', () => {
  assert.equal(G.readView('3d'), '3d');
  for (const v of [null, undefined, '', '2d', '3D', 'three', ' 3d']) assert.equal(G.readView(v), '2d', String(v));
  assert.equal(G.hrefWithView('https://site.test/admin/characters', '3d'), '/admin/characters?view=3d');
  assert.equal(G.hrefWithView('https://site.test/admin/characters?s=1&view=3d#top', '2d'), '/admin/characters?s=1#top');
  assert.equal(G.hrefWithView('https://site.test/admin/characters?s=1#top', '3d'), '/admin/characters?s=1&view=3d#top');
  assert.equal(G.readView(new URL(G.hrefWithView('https://site.test/x', '3d'), 'https://site.test').searchParams.get(G.VIEW_PARAM)), '3d');
  assert.deepEqual(G.GALLERY_VIEWS.map((v) => v.label), ['2D 그림', '3D 모형']);
});

test('보기마다 고르기: 2D는 읽은 캐릭터 모두(차례 그대로), 3D는 지금 보이는 3D가 있는 캐릭터만(다 된 것, 다시 만드는 동안의 이전 모형)', () => {
  const list = rows([
    { model_state: 'ready' },
    { model_state: 'making', model_prev: true },
    { model_state: 'waiting', model_prev: true },
    { model_state: 'failed', model_prev: true },
    { model_state: 'failed' },
    { model_state: 'none' },
    { model_state: 'making' },
    { status: 'queued', redrawing: true, model_state: 'none' },
    { status: 'rejected', reason: 'no_person', model_state: 'none' },
    { status: 'pending', model_state: 'none' },
  ]);
  assert.equal(list.length, 10);
  assert.deepEqual(G.viewRows(list, '2d'), list);
  assert.deepEqual(G.viewRows(list, '3d').map((r) => r.id), [id(1), id(2), id(3), id(4)]);
  assert.deepEqual(G.viewCounts(list), { '2d': 10, '3d': 4 });
  assert.deepEqual(G.viewCounts([]), { '2d': 0, '3d': 0 });
  // 3D 보기도 거르기·검색으로 좁힌 목록에서 고른다(따로 노는 두 축)
  assert.deepEqual(G.viewRows(list.filter((r) => r.model === 'failed' || r.model === 'stuck'), '3d').map((r) => r.id), [id(4)]);
  for (const r of list) assert.equal(G.inView(r, '3d'), A.hasShownModel(r), r.id);
  // 단추의 수: 다음 장이 남았으면 「+」
  assert.deepEqual([G.countWord(24, true), G.countWord(5, false), G.countWord(0, true)], ['24+', '5', '0+']);
});

test('자세히의 자리: 펼친 카드가 있는 줄의 마지막 카드 뒤(카드들은 제자리). 마지막 줄이 덜 찼으면 마지막 카드 뒤, 펼친 카드가 없으면 -1', () => {
  // 휴대폰 두 칸, 카드 7장: [0 1] [2 3] [4 5] [6]
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((at) => G.rowEndOf(at, 2, 7)), [1, 1, 3, 3, 5, 5, 6]);
  // 넓은 화면 다섯 칸, 카드 7장: [0..4] [5 6]
  assert.deepEqual([0, 3, 4, 5, 6].map((at) => G.rowEndOf(at, 5, 7)), [4, 4, 4, 6, 6]);
  assert.equal(G.rowEndOf(-1, 2, 7), -1, '펼친 카드가 이 보기에 없다');
  assert.equal(G.rowEndOf(7, 2, 7), -1);
  assert.equal(G.rowEndOf(2, 0, 7), 2, '칸 수를 못 쟀으면 한 칸으로');
  assert.equal(G.rowEndOf(0, 3, 1), 0);
});

test('카드의 짧은 상태: 그림이 아직이거나 문제면 그림 상태, 다 그렸으면 3D 상태. 이전 3D가 보이면 그렇다고. 색은 자세한 상태와 같다', () => {
  const [ready, making, failedPrev, none, redraw, rejected, queued] = rows([
    { model_state: 'ready' },
    { model_state: 'making', model_prev: true },
    { model_state: 'failed', model_prev: true },
    { model_state: 'none' },
    { status: 'drawing', redrawing: true },
    { status: 'rejected', reason: 'no_person' },
    { status: 'queued' },
  ]);
  assert.deepEqual(G.tileState(ready), { text: '3D 있음', tone: 'ok', prev: false });
  assert.deepEqual(G.tileState(making), { text: '3D 만드는 중', tone: 'busy', prev: true });
  assert.deepEqual(G.tileState(failedPrev), { text: '3D 못 만듦', tone: 'warn', prev: true });
  assert.deepEqual(G.tileState(none), { text: '3D 없음', tone: undefined, prev: false });
  assert.deepEqual(G.tileState(redraw), { text: '다시 그리는 중', tone: 'busy', prev: false });
  assert.deepEqual(G.tileState(rejected), { text: '그리지 않음', tone: 'warn', prev: false });
  assert.deepEqual(G.tileState(queued), { text: '그릴 차례 기다림', tone: 'busy', prev: false });
  assert.deepEqual(A.PIC_STATUSES.map(G.picTone), ['busy', 'busy', 'busy', 'ok', 'warn', 'warn']);
  assert.deepEqual(A.MODEL_STATES.map(G.modelTone), [undefined, 'busy', 'busy', 'warn', 'ok', 'warn']);
});

// ───────────────────────────── 3D 사진의 열쇠와 사진기 자리
test('3D 사진의 열쇠: 캐릭터와 모형 판(다시 만들어 판이 바뀌면 새로 찍는다). 크기는 관리자용 작은 그림과 같은 2:3', () => {
  const [r] = rows([{ model_state: 'ready', model_ver: 7 }]);
  assert.equal(G.snapKey(r), `${id(1)}:7`);
  assert.notEqual(G.snapKey(r), G.snapKey({ ...r, modelVer: 8 }));
  assert.equal(G.SNAP_W * 3, G.SNAP_H * 2);
  assert.equal(G.SNAP_W, 360);
});

test('사진기 자리: 날씬한 모형은 키로 정하고(3D 보기의 옛 식 그대로), 팔을 벌린 모형은 어느 쪽으로 돌려도 옆이 잘리지 않게 더 멀리', () => {
  const t = Math.tan((30 * Math.PI) / 360);
  const slim = { min: { x: -0.25, y: 0, z: -0.15 }, max: { x: 0.25, y: 1.24, z: 0.15 } };
  for (const aspect of [2 / 3, 1.05, 3]) {
    const f = G.frameFor(slim, 30, aspect);
    assert.ok(Math.abs(f.dist - (1.24 * 0.6) / t) < 1e-9, `aspect ${aspect}`);
    assert.ok(Math.abs(f.eyeY - (0.62 + 1.24 * 0.06)) < 1e-9);
    assert.equal(f.lookY, 0.62);
  }
  const wide = { min: { x: -0.62, y: 0, z: -0.2 }, max: { x: 0.62, y: 1.24, z: 0.2 } };
  const f = G.frameFor(wide, 30, 2 / 3);
  assert.ok(f.dist > (1.24 * 0.6) / t);
  // 세로축에서 가장 먼 모서리가 사진기 쪽으로 와도 옆 시야(세로 시야 × 폭/높이) 안에 든다
  const reach = Math.hypot(0.62, 0.2);
  assert.ok(reach / (f.dist - reach) <= t * (2 / 3));
});

// ───────────────────────────── 3D 사진 줄
type Shot = { src: string; gate: () => Promise<void>; resolve: (u: string | null) => void; reject: (e: unknown) => void };
/** 사진 줄의 바깥 흉내: 찍기는 시험이 끝을 정하고, 시계와 타이머는 손으로 돌린다 */
function fakeIo() {
  const shots: Shot[] = [];
  const calls: string[] = [];
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const io: SnapIo = {
    shoot: (s, gate) => new Promise<string | null>((resolve, reject) => {
      calls.push(`shoot:${s}`);
      shots.push({ src: s, gate, resolve, reject });
    }),
    release: () => calls.push('release'),
    drop: (url) => calls.push(`drop:${url}`),
    now: () => now,
    later: (fn, ms) => {
      timers.set(++seq, { at: now + ms, fn });
      return seq;
    },
    cancel: (h) => {
      timers.delete(h as number);
    },
  };
  const tick = (ms: number) => {
    now += ms;
    for (const [k, x] of [...timers]) {
      if (x.at > now) continue;
      timers.delete(k);
      x.fn();
    }
  };
  return { io, shots, calls, tick, releases: () => calls.filter((c) => c === 'release').length };
}
const flush = () => new Promise<void>((ok) => setImmediate(ok));

test('사진 줄: 한 번에 한 장, 청한 차례대로(화면에 들어온 카드 차례). 한 장이 끝나야 다음 장을 찍는다', async () => {
  const f = fakeIo();
  const q = G.makeSnapQueue(f.io);
  const got: string[] = [];
  for (const k of ['a', 'b', 'c']) q.want(`${k}:1`, `/${k}`, (u) => got.push(`${k}=${u}`));
  await flush();
  assert.deepEqual(f.shots.map((s) => s.src), ['/a'], '한 번에 하나');
  assert.deepEqual(q.state(), { queued: ['b:1', 'c:1'], running: 'a:1', cached: [], paused: false });
  f.shots[0].resolve('blob:a');
  await flush();
  assert.deepEqual(got, ['a=blob:a']);
  assert.deepEqual(f.shots.map((s) => s.src), ['/a', '/b']);
  f.shots[1].resolve('blob:b');
  await flush();
  f.shots[2].resolve('blob:c');
  await flush();
  assert.deepEqual(got, ['a=blob:a', 'b=blob:b', 'c=blob:c']);
  assert.deepEqual(q.state().cached, ['a:1', 'b:1', 'c:1']);
});

test('사진 줄의 캐시: 같은 열쇠는 한 번만 찍어 기다리는 쪽 모두에게 주고, 찍은 뒤에는 줄 없이 그 자리에서 준다', async () => {
  const f = fakeIo();
  const q = G.makeSnapQueue(f.io);
  const got: (string | null)[] = [];
  q.want('a:1', '/a', (u) => got.push(u));
  q.want('a:1', '/a', (u) => got.push(u));
  await flush();
  assert.equal(f.shots.length, 1);
  q.want('a:1', '/a', (u) => got.push(u));
  assert.equal(q.state().queued.length, 0, '찍는 중인 열쇠에 붙는다');
  f.shots[0].resolve('blob:a');
  await flush();
  assert.deepEqual(got, ['blob:a', 'blob:a', 'blob:a']);
  let now: string | null | undefined;
  const stop = q.want('a:1', '/a', (u) => {
    now = u;
  });
  assert.equal(now, 'blob:a', '캐시에 있으면 그 자리에서');
  stop();
  await flush();
  assert.equal(f.shots.length, 1, '다시 찍지 않는다');
});

test('물리기: 아직 찍지 않은 차례는 기다리는 쪽이 모두 물리면 줄에서 빠지고(화면 밖으로 지나간 카드), 찍는 중이면 끝까지 찍어 캐시에 둔다', async () => {
  const f = fakeIo();
  const q = G.makeSnapQueue(f.io);
  const got: string[] = [];
  const stopA = q.want('a:1', '/a', (u) => got.push(`a=${u}`));
  const stopB = q.want('b:1', '/b', (u) => got.push(`b=${u}`));
  const stopB2 = q.want('b:1', '/b', (u) => got.push(`b2=${u}`));
  q.want('c:1', '/c', (u) => got.push(`c=${u}`));
  await flush();
  stopB();
  assert.deepEqual(q.state().queued, ['b:1', 'c:1'], '다른 카드가 아직 기다린다');
  stopB2();
  assert.deepEqual(q.state().queued, ['c:1']);
  stopA();
  assert.equal(q.state().running, 'a:1', '찍는 중인 한 장은 끝까지');
  f.shots[0].resolve('blob:a');
  await flush();
  assert.deepEqual(got, [], '물린 쪽에는 주지 않는다');
  assert.deepEqual(q.state().cached, ['a:1'], '찍은 사진은 캐시에(다시 화면에 들어오면 바로)');
  assert.deepEqual(f.shots.map((s) => s.src), ['/a', '/c'], 'b는 받지도 찍지도 않는다');
});

test('못 찍음: null을 주거나 던지면 null. SNAP_RETRY_MS 동안은 다시 받지 않고 바로 null, 그 뒤에 다시 청하면 다시 찍어 본다', async () => {
  const f = fakeIo();
  const q = G.makeSnapQueue(f.io, { retryMs: 1000 });
  const got: (string | null)[] = [];
  q.want('a:1', '/a', (u) => got.push(u));
  await flush();
  f.shots[0].reject(new Error('webgl'));
  await flush();
  assert.deepEqual(got, [null]);
  q.want('a:1', '/a', (u) => got.push(u));
  assert.deepEqual(got, [null, null]);
  await flush();
  assert.equal(f.shots.length, 1);
  f.tick(1000);
  q.want('a:1', '/a', (u) => got.push(u));
  await flush();
  assert.equal(f.shots.length, 2);
  f.shots[1].resolve(null);
  await flush();
  assert.deepEqual(got, [null, null, null]);
  // 줄은 멈추지 않는다: 다음 사진
  q.want('b:1', '/b', (u) => got.push(u));
  await flush();
  f.shots[2].resolve('blob:b');
  await flush();
  assert.deepEqual(got, [null, null, null, 'blob:b']);
});

test('캐시 상한과 옛 판: 넘치면 가장 오래 안 쓴 사진부터 놓고(revoke), 같은 캐릭터의 새 판을 찍으면 옛 판 사진을 놓는다', async () => {
  const f = fakeIo();
  const q = G.makeSnapQueue(f.io, { max: 2 });
  const take = async (key: string, url: string) => {
    q.want(key, `/${key}`, () => {});
    await flush();
    f.shots[f.shots.length - 1].resolve(url);
    await flush();
  };
  await take('a:1', 'blob:a');
  await take('b:1', 'blob:b');
  q.want('a:1', '/a', () => {});
  await take('c:1', 'blob:c');
  assert.deepEqual(q.state().cached, ['a:1', 'c:1'], 'a는 방금 썼다');
  assert.ok(f.calls.includes('drop:blob:b'));
  await take('a:2', 'blob:a2');
  assert.ok(f.calls.includes('drop:blob:a'), '옛 판');
  assert.deepEqual(q.state().cached, ['c:1', 'a:2']);
  assert.ok(G.SNAP_CACHE_MAX >= 100, '한 번에 읽는 상한(100)보다 넉넉히');
});

test('멈춤: 움직이는 3D 보기가 열리면 새로 찍지 않고 그림 문맥을 놓는다. 그리는 중이면 그 한 장 뒤에 놓고, 다시 열리면 이어서', async () => {
  const f = fakeIo();
  const q = G.makeSnapQueue(f.io);
  q.want('a:1', '/a', () => {});
  q.want('b:1', '/b', () => {});
  await flush();
  q.pause();
  assert.deepEqual(f.calls, ['shoot:/a', 'release'], '모형을 받는 중(그리기 전)이면 바로 놓는다');
  let through = false;
  void f.shots[0].gate().then(() => {
    through = true;
  });
  await flush();
  assert.equal(through, false, '멈춘 동안은 그림 문맥을 쓰지 못한다');
  q.resume();
  await flush();
  assert.equal(through, true);
  q.pause();
  assert.equal(f.releases(), 1, '그리는 중에는 놓지 않는다');
  f.shots[0].resolve('blob:a');
  await flush();
  assert.equal(f.releases(), 2, '그 한 장이 끝나면 놓는다');
  assert.equal(f.shots.length, 1, '멈춘 동안 다음 장을 시작하지 않는다');
  let cached: string | null | undefined;
  q.want('a:1', '/a', (u) => {
    cached = u;
  });
  assert.equal(cached, 'blob:a', '멈춰도 찍어 둔 사진은 준다');
  q.resume();
  await flush();
  assert.deepEqual(f.shots.map((s) => s.src), ['/a', '/b']);
  assert.equal(q.state().paused, false);
});

test('쉬기: 줄이 비고 SNAP_IDLE_MS가 지나면 그림 문맥을 놓는다. 그 사이 새로 청하면 놓지 않고, 찍는 중에는 놓지 않는다', async () => {
  const f = fakeIo();
  const q = G.makeSnapQueue(f.io, { idleMs: 1000 });
  q.want('a:1', '/a', () => {});
  await flush();
  f.shots[0].resolve('blob:a');
  await flush();
  f.tick(999);
  assert.equal(f.releases(), 0);
  q.want('b:1', '/b', () => {});
  await flush();
  f.tick(5000);
  assert.equal(f.releases(), 0, '찍는 중');
  f.shots[1].resolve('blob:b');
  await flush();
  f.tick(1000);
  assert.equal(f.releases(), 1);
  // 줄에 섰다가 모두 물려 비어도 쉬기로
  q.want('c:1', '/c', () => {});
  await flush();
  const stop = q.want('d:1', '/d', () => {});
  stop();
  f.shots[2].resolve('blob:c');
  await flush();
  f.tick(1000);
  assert.equal(f.releases(), 2);
  assert.ok(G.SNAP_IDLE_MS > 0 && G.SNAP_RETRY_MS > G.SNAP_IDLE_MS);
});

// ───────────────────────────── 화면과 찍는 곳의 연결
test('갤러리 화면: 보기는 주소(?view=3d)에서 읽고 바꾸면 주소를 바꾼다. 카드는 지금 보기의 줄만, 3D 모형 보기의 카드는 정지 사진', () => {
  const ui = src('app/admin/characters/CharacterConsole.tsx');
  assert.match(ui, /useState<GalleryView>\(\(\) => readView\(params\.get\(VIEW_PARAM\)\)\)/);
  assert.match(ui, /window\.history\.replaceState\(window\.history\.state, '', hrefWithView\(window\.location\.href, v\)\)/);
  assert.match(ui, /const visible = viewRows\(items, view\);/);
  assert.match(ui, /\{visible\.map\(\(r, i\) => \(/);
  assert.match(ui, /view === '3d' && shown \? \(\s*<ModelSnap /);
  assert.match(ui, /countWord\(counts\[v\.id\], Boolean\(page\.next\)\)/);
  // 보기를 바꾸면 펼친 카드·3D 보기·묻기를 닫는다
  const pick = ui.slice(ui.indexOf('const pickView ='), ui.indexOf('const toggle ='));
  inOrder(pick, ['setView(v);', 'setOpen(null);', 'setPreview(null);', 'setConfirming(null);', 'replaceState']);
  // 3D 모형 보기에서 카드를 누르면 움직이는 3D 보기도 연다(서버 비밀 키가 있고 보이는 3D가 있을 때)
  assert.match(ui, /const spin = view === '3d' && store && hasShownModel\(row\);/);
  // 그림 문맥은 한 번에 하나: 움직이는 3D 보기를 여는 그 자리에서 사진 찍기를 멈추고, 닫히면 다시
  assert.match(ui, /if \(spin\) snapQueue\(\)\.pause\(\);/);
  assert.match(ui, /if \(on\) snapQueue\(\)\.pause\(\);/);
  assert.match(ui, /if \(preview\) snapQueue\(\)\.pause\(\);\s*else snapQueue\(\)\.resume\(\);/);
  // 콘솔은 three.js를 바로 불러오지 않는다(2D 그림 보기만 쓰면 받지 않는다)
  assert.doesNotMatch(ui, /from 'three'|from '\.\/snapshot'|from '\.\/stage'/);
  // 카드는 제자리, 자세히는 그 줄 끝 다음 자리(CSS order). 문서 차례로는 카드 바로 뒤(키보드·화면 읽기)
  assert.match(ui, /const rowEnd = rowEndOf\(visible\.findIndex\(\(x\) => x\.id === open\), cols, visible\.length\);/);
  assert.match(ui, /place=\{\{ order: 2 \* i, panel: 2 \* rowEnd \+ 1, col: i % cols, cols \}\}/);
  inOrder(ui.slice(ui.indexOf('function CharacterCard')), ['style={{ order: place.order }}', 'aria-expanded={open}', '</li>',
    '{open ? (', 'id={did}', 'style={{ order: place.panel', 'previewOpen ?', 'data-op={op}', '>접기</button>']);
  // 칸 수는 CSS가 정한 것을 잰다: 목록 크기와 창 크기(넓은 화면은 목록 폭이 그대로인 채 칸 수만 바뀐다)
  assert.match(ui, /const measure = \(\) => setCols\(Math\.max\(1, getComputedStyle\(ul\)\.gridTemplateColumns/);
  assert.match(ui, /new ResizeObserver\(measure\)/);
  assert.match(ui, /window\.addEventListener\('resize', measure\);/);
  // 자세히의 Esc는 묻기·3D 보기가 먼저 막은 것은 건너뛰고, 한글 조합 중에는 무시한다. 닫으면 초점은 카드 단추로
  assert.match(ui, /if \(e\.key !== 'Escape' \|\| e\.defaultPrevented \|\| e\.nativeEvent\.isComposing \|\| e\.keyCode === 229\) return;/);
  inOrder(ui.slice(ui.indexOf('const close = () =>')), ['tileButton.current?.focus();', 'onToggle();']);
  // 카드 전체가 펼치기 단추(44px 이상), 작은 단추도 이 화면에서는 44px. 휴대폰 두 줄, 넓으면 다섯 줄
  const style = src('app/admin/characters/characters.module.css');
  assert.match(style, /\.list \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(style, /@media \(min-width: 1100px\) \{\s*\.list \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); \}/);
  assert.match(style, /\.panel \{[^}]*grid-column: 1 \/ -1;/);
  assert.match(style, /\.console :global\(\.btn-small\) \{ min-height: 44px; \}/);
  for (const c of ['view', 'tile', 'chip']) assert.match(style, new RegExp(`\\.${c} \\{[^}]*min-height: 44px;`), c);
});

test('3D 사진: 그리개 하나(모듈에 하나, 처음 찍을 때 만든다)로 3D 보기와 같은 길·같은 무대로 찍고, 찍은 모형은 바로 놓고, 쉬거나 멈추면 그림 문맥까지 놓는다', () => {
  const snap = src('app/admin/characters/snapshot.ts');
  assert.equal(snap.match(/new THREE\.WebGLRenderer\(/g)?.length, 1);
  assert.match(snap, /^let booth: Booth \| null = null;$/m);
  assert.match(snap, /preserveDrawingBuffer: true/);
  assert.match(snap, /import \{ fetchModel, freeModel, type ModelData \} from '@\/walk\/avatar';/);
  const shoot = snap.slice(snap.indexOf('export async function shoot'));
  inOrder(shoot, ['if (noGl) return null;', 'await fetchWithin(src)', 'await gate();', 'open();', 'renderer.render(', 'blobOf(',
    'URL.createObjectURL(blob)', 'finally', 'mesh.removeFromParent();', 'mat.dispose();', 'freeModel(data);']);
  const release = snap.slice(snap.indexOf('export function release'), snap.indexOf('/** 상한 안에'));
  inOrder(release, ['booth = null;', 'b.renderer.dispose();', 'b.renderer.forceContextLoss();']);
  // 그림 문맥을 만들 수 없으면 다시 해 보지 않는다(카드가 2D 그림과 「3D」 표시로 대신한다)
  assert.match(snap, /\} catch \{\s*noGl = true;\s*return null;\s*\}/);
  // 3D 보기와 같은 무대(빛, 처음 각도, 사진기 자리, 재질)
  const preview = src('app/admin/characters/ModelPreview.tsx');
  for (const [name, f] of [['snapshot', snap], ['ModelPreview', preview]] as const) {
    for (const s of ['lightStage(scene)', 'STAGE_FOV', 'START_YAW', 'frameModel(', 'stageMaterial(data.texture)']) assert.ok(f.includes(s), `${name}: ${s}`);
  }
  // 카드: 화면 가까이 올 때만 줄에 서고(멀어지면 물린다), three.js와 찍는 코드는 처음 찍을 때 불러온다
  const card = src('app/admin/characters/ModelSnap.tsx');
  assert.match(card, /new IntersectionObserver\(/);
  assert.match(card, /if \(entries\.some\(\(e\) => e\.isIntersecting\)\) take\(\);\s*else leave\(\);/);
  assert.match(card, /await import\('\.\/snapshot'\)/);
  assert.doesNotMatch(card, /from 'three'|from '\.\/snapshot'/);
  assert.match(card, /drop: \(url\) => URL\.revokeObjectURL\(url\)/);
  // 못 찍으면 2D 그림에 「3D」 표시
  assert.match(card, /\{state === 'fail' \? <span className=\{css\.snapMark\}>3D<\/span> : null\}/);
  // 엠대시를 쓰지 않는다(글자는 코드 값으로 만든다)
  const dash = new RegExp(String.fromCharCode(0x2014));
  for (const f of [snap, card, preview, src('app/admin/characters/CharacterConsole.tsx'), src('lib/avatar/admin-gallery.ts')]) {
    assert.doesNotMatch(f, dash);
  }
});
