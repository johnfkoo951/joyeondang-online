// 걷기 사진 지우기 동작(src/app/admin/shots-actions.ts의 forgetShots)을 그 파일 그대로 돌려 본다.
// 집주인 확인(getViewer), 비밀 키(shotsAdminReady, shotsKeyWorks), DB 연결(createClient), 저장소 정리(cleanShotsStorage),
// 다시 그리기(refresh), 응답 뒤 이어 하기(after)를 가짜로 바꿔 끼운다. 집주인이 아니거나 비밀 키가 없거나 듣지 않으면 DB 함수를
// 아예 부르지 않는지(표 줄이 지워지지 않는지), 부르면 무엇을 어떤 순서로 하고 어떤 말을 돌려주는지 본다.
// 판정 자체(집주인만, 누구의 사진인지)는 DB가 한 번 더 한다(tests/sql/rls.test.mjs의 0022 묶음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import type { CleanResult } from '../../src/lib/shots-admin-rules.ts';

type Rpc = { data?: unknown; error?: { code?: string; message?: string } | null };
type Fake = {
  log: string[];
  afters: (() => unknown)[];
  getViewer: () => Promise<{ role: string }>;
  shotsAdminReady: () => boolean;
  shotsKeyWorks: () => Promise<boolean>;
  createClient: () => Promise<{ rpc: (fn: string, args: unknown) => Promise<Rpc> }>;
  cleanShotsStorage: (ms: number) => Promise<CleanResult>;
  refresh: () => void;
  after: (cb: () => unknown) => void;
};
const g = globalThis as unknown as { __shotsAction?: Fake };

// 동작 파일이 가져오는 것 가운데 서버·요청에 기대는 것은 가짜로, 나머지(@/lib/shots-admin-rules, @/lib/event-code)는 그대로
const SRC = new URL('../../src/', import.meta.url);
const relay = (names: string[]) => names.map((n) => `export const ${n} = (...a) => globalThis.__shotsAction.${n}(...a);`).join('\n');
const STUBS: Record<string, string> = {
  'next/cache': relay(['refresh']),
  'next/server': relay(['after']),
  '@/lib/viewer': relay(['getViewer']),
  '@/lib/supabase/server': relay(['createClient']),
  '@/lib/shots-admin': relay(['shotsAdminReady', 'shotsKeyWorks', 'cleanShotsStorage']),
};
type Resolved = { url: string; shortCircuit?: boolean };
type Next = (spec: string, ctx: unknown) => Resolved;
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => Resolved }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec in STUBS) return { url: `data:text/javascript,${encodeURIComponent(STUBS[spec])}`, shortCircuit: true };
    if (!spec.startsWith('@/')) return next(spec, ctx);
    const url = new URL(spec.slice(2), SRC).href;
    return next(/\.[cm]?[jt]sx?$/.test(url) ? url : `${url}.ts`, ctx);
  },
});

const { forgetShots } = await import('../../src/app/admin/shots-actions.ts');
const R = await import('../../src/lib/shots-admin-rules.ts');

const ID = '00000000-0000-4000-8000-000000000311';
const EV = '11111111-1111-4111-8111-111111111111';

/** 가짜를 끼운다. 부른 일은 log에 차례대로 남는다 */
function fake(o: { role?: string; ready?: boolean; keyOk?: boolean; rpc?: Rpc; clean?: CleanResult } = {}): Fake {
  const log: string[] = [];
  const f: Fake = {
    log,
    afters: [],
    getViewer: async () => {
      log.push('viewer');
      return { role: o.role ?? 'admin' };
    },
    shotsAdminReady: () => {
      log.push('ready');
      return o.ready ?? true;
    },
    shotsKeyWorks: async () => {
      log.push('key');
      return o.keyOk ?? true;
    },
    createClient: async () => {
      log.push('client');
      return {
        rpc: async (fn, args) => {
          log.push(`rpc:${fn}:${JSON.stringify(args)}`);
          return { data: o.rpc?.data ?? 3, error: o.rpc?.error ?? null };
        },
      };
    },
    cleanShotsStorage: async (ms) => {
      log.push(`clean:${ms}`);
      return o.clean ?? { removed: 3, left: false, failed: false };
    },
    refresh: () => {
      log.push('refresh');
    },
    after: (cb) => {
      log.push('after');
      f.afters.push(cb);
    },
  };
  g.__shotsAction = f;
  return f;
}
const form = (o: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(o)) d.set(k, v);
  return d;
};

test('고를 것이 틀리면 아무것도 묻지 않는다(집주인 확인도, DB도)', async () => {
  for (const o of [{}, { kind: 'user' }, { kind: 'user', id: 'x' }, { kind: 'event', id: `${EV}x` }, { kind: 'all', id: ID }, { kind: 'clean ' }]) {
    const f = fake();
    assert.deepEqual(await forgetShots(null, form(o)), { ok: false, message: '다시 골라 주세요.' }, JSON.stringify(o));
    assert.deepEqual(f.log, [], JSON.stringify(o));
  }
});

test('집주인이 아니면 비밀 키도 DB도 부르지 않는다(표 줄이 지워지지 않는다)', async () => {
  for (const role of ['guest', 'family', 'visitor', 'public']) {
    for (const o of [{ kind: 'user', id: ID }, { kind: 'event', id: EV }, { kind: 'clean' }]) {
      const f = fake({ role });
      assert.deepEqual(await forgetShots(null, form(o)), { ok: false, message: '집주인만 지울 수 있어요.' });
      assert.deepEqual(f.log, ['viewer'], `${role} ${o.kind}`);
    }
  }
});

test('비밀 키가 없거나 그 키로 저장소에 닿지 않으면 DB 함수를 부르지 않는다(파일만 남기지 않게)', async () => {
  for (const o of [{ kind: 'user', id: ID }, { kind: 'event', id: EV }, { kind: 'clean' }]) {
    const none = fake({ ready: false });
    assert.deepEqual(await forgetShots(null, form(o)), { ok: false, message: R.SHOTS_NOT_READY });
    assert.deepEqual(none.log, ['viewer', 'ready'], o.kind);
    const broken = fake({ keyOk: false });
    assert.deepEqual(await forgetShots(null, form(o)), { ok: false, message: R.SHOTS_KEY_BROKEN });
    assert.deepEqual(broken.log, ['viewer', 'ready', 'key'], o.kind);
  }
});

test('사람마다: 집주인 세션으로 DB 함수를 부른 뒤 저장소를 정리하고 다시 그린다', async () => {
  const f = fake({ rpc: { data: 3 } });
  assert.deepEqual(await forgetShots(null, form({ kind: 'user', id: ID })), { ok: true, message: '사진 3장을 지웠어요.' });
  assert.deepEqual(f.log, ['viewer', 'ready', 'key', 'client', `rpc:admin_shots_forget_user:{"p_user":"${ID}"}`,
    `clean:${R.CLEAN_NOW_MS}`, 'refresh']);
  assert.deepEqual(f.afters, [], '다 지웠으면 이어 할 것이 없다');
});

test('행사마다: 시간이 모자라 남으면 응답을 보낸 뒤(after) 이어서 정리한다', async () => {
  const f = fake({ rpc: { data: { found: true, people: 2, shots: 5 } }, clean: { removed: 1, left: true, failed: false } });
  const r = await forgetShots(null, form({ kind: 'event', id: EV }));
  assert.deepEqual(r, { ok: true, message: '손님 2명의 사진 5장을 지웠어요. 저장소의 파일은 이어서 지우고 있어요. 남은 수는 이 칸에 보여요.' });
  assert.deepEqual(f.log, ['viewer', 'ready', 'key', 'client', `rpc:admin_shots_forget_event:{"p_event":"${EV}"}`,
    `clean:${R.CLEAN_NOW_MS}`, 'after', 'refresh']);
  assert.equal(f.afters.length, 1);
  await f.afters[0]();
  assert.equal(f.log.at(-1), `clean:${R.CLEAN_AFTER_MS}`, '응답 뒤에는 더 길게');
  // 없는 행사 코드
  fake({ rpc: { data: { found: false, people: 0, shots: 0 } } });
  assert.deepEqual(await forgetShots(null, form({ kind: 'event', id: EV })), { ok: false, message: '그 행사 초대 코드를 찾지 못했어요.' });
});

test('저장소에 닿지 않아 멈췄으면 이어 하지 않고 말로 알린다(다음 차례에: 화면을 열 때, 다시 누를 때)', async () => {
  const f = fake({ rpc: { data: 2 }, clean: { removed: 0, left: true, failed: true } });
  const r = await forgetShots(null, form({ kind: 'user', id: ID }));
  assert.equal(r?.ok, true, '표 줄은 지워졌다');
  assert.match(r?.message ?? '', /저장소에 닿지 않아 파일을 다 지우지 못했어요/);
  assert.deepEqual(f.afters, []);
});

test('DB 함수가 오류를 내면 저장소를 건드리지 않고 오류마다 다른 말을 돌려준다', async () => {
  const cases: [Rpc['error'], string][] = [
    [{ code: 'PGRST202' }, '아직 쓸 수 없어요. DB에 0022 마이그레이션이 들어가면 열려요.'],
    [{ code: '42501', message: 'admin_only' }, '집주인만 지울 수 있어요.'],
    [{ code: '57014' }, '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.'],
  ];
  for (const [error, message] of cases) {
    const f = fake({ rpc: { error } });
    assert.deepEqual(await forgetShots(null, form({ kind: 'user', id: ID })), { ok: false, message });
    assert.equal(f.log.some((l) => l.startsWith('clean') || l === 'refresh'), false, JSON.stringify(error));
  }
});

test('「지금 마저 지우기」(clean): 지우기 함수 없이 저장소 정리만 한다', async () => {
  const f = fake({ clean: { removed: 4, left: false, failed: false } });
  assert.deepEqual(await forgetShots(null, form({ kind: 'clean' })), { ok: true, message: '저장소에서 파일 4개를 지웠어요.' });
  assert.deepEqual(f.log, ['viewer', 'ready', 'key', `clean:${R.CLEAN_NOW_MS}`, 'refresh']);
  const stuck = fake({ clean: { removed: 0, left: true, failed: true } });
  assert.deepEqual(await forgetShots(null, form({ kind: 'clean' })),
    { ok: false, message: '저장소에 닿지 않아 다 지우지 못했어요. 잠시 뒤 다시 눌러 주세요.' });
  assert.equal(stuck.log.includes('client'), false);
});
