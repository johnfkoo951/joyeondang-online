// 3D 모형을 만드는 중인 일(src/components/walk/making-3d.ts): 진행 막대·단계 글, 서버 답 옮기기, 그리고 묻기 한 바퀴
// (요청함 → 차례 → 만드는 중 → 다 됨, 다 된 순간 한 번만 알림, 2D와 같은 간격, 새로 고쳐도 이어 읽기, 지웠으면 내려놓기).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 가져온다: 시험에서는 .ts를 붙여 찾게 한다
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const g = globalThis as Record<string, unknown>;
const store = new Map<string, string>();
g.window = { addEventListener: () => {}, removeEventListener: () => {} };
g.document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const M = await import('../../src/components/walk/making-3d.ts');
const D = await import('../../src/components/walk/making.ts');
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = 'jy.walk.model.pending.v1';
const flush = async () => {
  for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r));
};
const base = { id: ID, at: 0, makingAt: null, later: null, message: null, note: null, doneAt: null, seen: false };

test('3D 단계 이름: 요청함 → 차례 → 만드는 중 → 다 됐어요, 안내는 보통 1~2분', () => {
  assert.deepEqual([...M.MODEL_STEPS], ['요청함', '차례', '만드는 중', '다 됐어요']);
  assert.equal(M.MODEL_USUAL, '보통 1~2분');
});

test('3D 진행 막대: 기다리는 동안은 낮게, 만드는 동안 오르되 다 되기 전에는 95를 넘지 않는다', () => {
  const t0 = 1_000_000;
  assert.equal(M.modelPercent({ phase: 'waiting', at: t0, makingAt: null }, t0), 6);
  assert.ok(M.modelPercent({ phase: 'waiting', at: t0, makingAt: null }, t0 + 3_600_000) <= 18);
  const a = M.modelPercent({ phase: 'making', at: t0, makingAt: t0 }, t0);
  const b = M.modelPercent({ phase: 'making', at: t0, makingAt: t0 }, t0 + 60_000);
  assert.ok(a >= 20 && b > a);
  assert.equal(M.modelPercent({ phase: 'making', at: t0, makingAt: t0 }, t0 + 3_600_000), 95);
  assert.equal(M.modelPercent({ phase: 'ready', at: t0, makingAt: t0 }, t0), 100);
  assert.equal(M.modelPercent({ phase: 'failed', at: t0, makingAt: t0 }, t0), 0);
});

test('3D 단계 글: 차례, 3D 서비스가 쉬면 다시 만드는 때, 만드는 중(보통 1~2분, 3분 넘으면 조금 더), 다 됨, 못 만든 까닭', () => {
  assert.equal(M.modelStage({ ...base, phase: 'waiting' }, 0), '3D 만들 차례를 기다리는 중이에요');
  const later = Date.parse('2026-11-12T03:30:00Z');
  assert.equal(M.modelStage({ ...base, phase: 'waiting', later }, later - 60_000), '3D 서비스가 잠시 쉬어서 12시 30분쯤 다시 만들어요');
  assert.equal(M.kstClock(Date.parse('2026-11-12T15:05:00Z')), '0시 05분', '한국 시간(+9)으로 자정을 넘긴다');
  assert.equal(M.modelStage({ ...base, phase: 'waiting', later, at: later - 60_000 }, later + 1), '3D 만들 차례를 기다리는 중이에요', '지난 때는 말하지 않는다');
  assert.equal(M.modelStage({ ...base, phase: 'making', makingAt: 0 }, 30_000), '3D 모형을 만드는 중이에요 · 보통 1~2분');
  assert.equal(M.modelStage({ ...base, phase: 'making', makingAt: 0 }, 200_000), '조금 더 걸리고 있어요. 다 되면 알려 드려요');
  assert.equal(M.modelStage({ ...base, phase: 'ready' }, 0), '3D가 다 됐어요');
  assert.equal(M.modelStage({ ...base, phase: 'failed', message: '이 그림으로는 3D를 만들 수 없었어요.' }, 0), '이 그림으로는 3D를 만들 수 없었어요.');
});

test('늦어지면(차례를 5분 넘게 기다림, 3D 서비스가 쉬어 다시 만드는 때, 만들기 3분 넘김) 「늦어지고 있어요」로 바꾸고 「보통 1~2분」을 말하지 않는다', () => {
  const t0 = Date.parse('2026-11-12T03:00:00Z');
  const waiting = { ...base, phase: 'waiting' as const, at: t0 };
  assert.equal(M.MODEL_SLOW_WAIT_MS, 5 * 60 * 1000);
  // 막 요청함: 차례를 기다린다. 차례가 오면 보통 1~2분
  assert.equal(M.modelSlow(waiting, t0 + 60_000), false);
  assert.deepEqual(M.modelChipText(waiting, t0 + 60_000), { label: '3D 차례 기다리는 중', tail: '' });
  assert.equal(M.modelNote(waiting, t0 + 60_000), '차례가 오면 보통 1~2분 걸려요. 창을 닫고 걸어도 돼요. 다 되면 알려 드려요.');
  // 5분 넘게 기다림(3D 서비스가 쉬거나 일꾼의 하루 상한, 앞선 3D가 많다. 화면은 까닭을 모른다)
  const slow = t0 + M.MODEL_SLOW_WAIT_MS;
  assert.equal(M.modelSlow(waiting, slow), true);
  assert.equal(M.modelStage(waiting, slow), '3D 차례가 늦어지고 있어요');
  assert.deepEqual(M.modelChipText(waiting, slow), { label: '3D 차례 늦어지는 중', tail: '' });
  assert.equal(M.modelNote(waiting, slow), '3D 서비스가 쉬는 중이거나 앞선 3D가 많을 수 있어요. 차례는 그대로예요. 창을 닫고 걸어도 돼요. 다 되면 알려 드려요.');
  // 3D 서비스가 쉬어 다시 만드는 때가 있으면 그때를 말하고(늦어지는 것으로 본다), 「보통 1~2분」은 빼다
  const later = { ...waiting, later: t0 + 3_600_000 };
  assert.equal(M.modelSlow(later, t0 + 1_000), true);
  assert.equal(M.modelStage(later, t0 + 1_000), '3D 서비스가 잠시 쉬어서 13시 00분쯤 다시 만들어요');
  assert.equal(M.modelNote(later, t0 + 1_000)?.includes('보통 1~2분'), false);
  // 만드는 중: 3분까지는 보통 1~2분, 그 뒤로는 빼다
  const making = { ...base, phase: 'making' as const, at: t0, makingAt: t0 };
  assert.deepEqual(M.modelChipText(making, t0 + 30_000), { label: '3D 만드는 중', tail: ' · 보통 1~2분' });
  assert.equal(M.modelNote(making, t0 + 30_000), '보통 1~2분 걸려요. 창을 닫고 걸어도 돼요. 다 되면 알려 드려요.');
  assert.deepEqual(M.modelChipText(making, t0 + M.MODEL_SLOW_MAKE_MS), { label: '3D 만드는 중', tail: '' });
  assert.equal(M.modelNote(making, t0 + M.MODEL_SLOW_MAKE_MS), '창을 닫고 걸어도 돼요. 다 되면 알려 드려요.');
  // 끝나면 안내가 없다
  assert.equal(M.modelNote({ ...base, phase: 'ready' }, t0), null);
  assert.equal(M.modelNote({ ...base, phase: 'failed' }, t0), null);
  for (const t of [M.modelNote(waiting, slow), M.modelStage(waiting, slow), M.modelChipText(waiting, slow).label]) {
    assert.equal(/[—–]/.test(t ?? ''), false, String(t));
  }
});

test('서버 답 옮기기: 요청한 때는 서버 값으로, 만들기 시작은 처음 본 때, 못 만들면 까닭과 셈 안내, none이면 내려놓는다', () => {
  const m = { ...base, at: 5_000, phase: 'waiting' as const };
  const w = M.nextModelMaking(m, { status: 'waiting', since: new Date(1_000).toISOString(), later: new Date(90_000).toISOString() }, 9_000)!;
  assert.deepEqual([w.at, w.phase, w.later], [1_000, 'waiting', 90_000]);
  assert.equal(M.nextModelMaking(m, { status: 'waiting', later: new Date(1_000).toISOString() }, 9_000)!.later, null, '지난 때는 싣지 않는다');
  const k = M.nextModelMaking(w, { status: 'making' }, 10_000)!;
  assert.deepEqual([k.phase, k.makingAt, k.later], ['making', 10_000, null]);
  assert.equal(M.nextModelMaking(k, { status: 'making' }, 20_000)!.makingAt, 10_000, '처음 본 때를 그대로 둔다');
  const r = M.nextModelMaking(k, { status: 'ready' }, 30_000)!;
  assert.deepEqual([r.phase, r.doneAt, r.seen], ['ready', 30_000, false]);
  const f = M.nextModelMaking(k, { status: 'failed', message: '3D 서비스에서 3D를 만들지 못했어요.', note: '3D 몫을 돌려드렸어요. 한 번 더 해 볼 수 있어요.' }, 30_000)!;
  assert.deepEqual([f.phase, f.message, f.note], ['failed', '3D 서비스에서 3D를 만들지 못했어요.', '3D 몫을 돌려드렸어요. 한 번 더 해 볼 수 있어요.']);
  assert.equal(M.nextModelMaking(k, { status: 'failed' }, 30_000)!.message, '3D를 만들지 못했어요.');
  assert.equal(M.nextModelMaking(k, { status: 'none' }), null, '요청이 없다: 더 보지 않는다');
  assert.equal(M.nextModelMaking(k, { status: 'weird' }), k, '모르는 답은 그대로');
  assert.equal(M.nextModelMaking(k, { status: 'making', since: '2999-01-01T00:00:00Z' }, 40_000)!.at, 40_000, '앞날의 때는 지금으로');
});

test('묻기 한 바퀴: 2D와 같은 간격으로 3D 상태만 묻고, 다 된 순간 한 번 알리고, 끝나면 묻지 않는다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const answers = [{ status: 'waiting' }, { status: 'making' }, { status: 'ready' }];
    const asked: string[] = [];
    g.fetch = async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(answers.shift() ?? { status: 'ready' }), { status: 200 });
    };
    M.startModelMaking(ID);
    // 보는 쪽이 없으면 묻지 않는다
    mock.timers.tick(10_000);
    await flush();
    assert.equal(asked.length, 0);
    const ready: string[] = [];
    const offReady = M.onModelReady((id) => ready.push(id));
    const off = M.subscribeModelMaking(() => {});
    for (let k = 0; k < 3; k++) {
      // 2D와 같은 간격(처음 2분은 4초)
      mock.timers.tick(D.pollDelay(0));
      await flush();
    }
    assert.equal(asked.length, 3);
    assert.match(asked[0], new RegExp(`/api/avatar/status\\?id=${ID}&kind=model$`));
    assert.equal(M.getModelMaking()?.phase, 'ready');
    assert.deepEqual(ready, [ID], '다 된 순간 한 번(걷기 화면이 엔진에게 그 모형을 바로 다시 묻게 한다)');
    mock.timers.tick(60_000);
    await flush();
    assert.equal(asked.length, 3, '끝났으면 더 묻지 않는다');
    // 새로 고쳐도(저장한 값을 다시 읽어도) 이어 본다
    const saved = JSON.parse(store.get(KEY) ?? '{}') as { id: string; phase: string };
    assert.deepEqual([saved.id, saved.phase], [ID, 'ready']);
    M.seeModelMaking();
    assert.equal(M.getModelMaking()?.seen, true);
    M.clearModelMaking('00000000-0000-4000-8000-000000000000');
    assert.equal(M.getModelMaking()?.id, ID, '다른 id로는 지우지 않는다');
    M.clearModelMaking(ID);
    assert.equal(M.getModelMaking(), null);
    assert.equal(store.has(KEY), false);
    off();
    offReady();
  } finally {
    mock.timers.reset();
  }
});

test('같은 그림을 다시 요청해도 처음부터 세지 않고, 만드는 중에는 다른 그림을 이어 보지 않는다', async () => {
  M.startModelMaking(ID);
  const first = M.getModelMaking();
  M.startModelMaking(ID);
  assert.equal(M.getModelMaking(), first, '같은 그림이면 그대로');
  M.adoptModelMaking('11111111-1111-4111-8111-111111111111');
  assert.equal(M.getModelMaking()?.id, ID, '만드는 중이면 다른 것을 이어 보지 않는다');
  M.clearModelMaking();
  M.adoptModelMaking('11111111-1111-4111-8111-111111111111');
  assert.equal(M.getModelMaking()?.id, '11111111-1111-4111-8111-111111111111');
  M.clearModelMaking();
  M.startModelMaking('not an id');
  assert.equal(M.getModelMaking(), null);
});

test('지웠으면(404가 연달아 세 번) 조용히 내려놓고, 요청이 없어졌다(none)고 하면 바로 내려놓는다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let asked = 0;
    g.fetch = async () => { asked++; return new Response('{"status":"not_found"}', { status: 404 }); };
    M.startModelMaking(ID);
    const off = M.subscribeModelMaking(() => {});
    mock.timers.tick(4_000);
    await flush();
    assert.equal(M.getModelMaking()?.id, ID, '404 한 번으로는 버리지 않는다');
    for (let i = 0; i < 2; i++) {
      mock.timers.tick(4_000);
      await flush();
    }
    assert.equal(asked, 3);
    assert.equal(M.getModelMaking(), null, '연달아 세 번이면 내려놓는다');
    g.fetch = async () => new Response('{"status":"none"}', { status: 200 });
    M.startModelMaking(ID);
    mock.timers.tick(4_000);
    await flush();
    assert.equal(M.getModelMaking(), null);
    off();
  } finally {
    mock.timers.reset();
  }
});

test('못 만들었으면 까닭과 셈 안내를 남기고 더 묻지 않는다(알림은 닫을 때까지)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let asked = 0;
    g.fetch = async () => {
      asked++;
      return new Response(JSON.stringify({ status: 'failed', message: '3D 서비스에서 3D를 만들지 못했어요.', note: '3D 몫을 돌려드렸어요. 한 번 더 해 볼 수 있어요.' }), { status: 200 });
    };
    const ready: string[] = [];
    const offReady = M.onModelReady((id) => ready.push(id));
    M.startModelMaking(ID);
    const off = M.subscribeModelMaking(() => {});
    mock.timers.tick(4_000);
    await flush();
    const m = M.getModelMaking();
    assert.deepEqual([m?.phase, m?.note, m?.seen], ['failed', '3D 몫을 돌려드렸어요. 한 번 더 해 볼 수 있어요.', false]);
    assert.deepEqual(ready, [], '못 만들었으면 엔진을 부르지 않는다');
    mock.timers.tick(60_000);
    await flush();
    assert.equal(asked, 1);
    off();
    offReady();
    M.clearModelMaking();
  } finally {
    mock.timers.reset();
  }
});
