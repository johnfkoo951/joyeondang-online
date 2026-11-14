// 앱 로그인 이어받기(홈 화면 앱 ↔ 사파리): 코드 모양, 해시, 5분·한 번, 사람별 횟수 제한, 주소별 시도 제한, 실제 메모리 저장소로 한 바퀴.
// 홈 화면에 추가 안내: 기기·상태별 안내 방식과 BOOT 글(설치 창을 미리 받아 두기).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import * as nodeModule from 'node:module';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const C = await import('../../src/lib/app-handoff-code.ts');
const H = await import('../../src/lib/app-handoff.ts');
const P = await import('../../src/lib/pwa.ts');

type Row = { code_hash: string; user_id: string; created_at: string; expires_at: string; used_at: string | null };

/** 실제 표(0027)처럼 움직이는 메모리 저장소 */
function memoryStore(clock: () => number) {
  const rows: Row[] = [];
  const store = {
    rows,
    async recentCount(userId: string, sinceIso: string) {
      return rows.filter((r) => r.user_id === userId && r.created_at >= sinceIso).length;
    },
    async insert(row: { code_hash: string; user_id: string; expires_at: string }) {
      if (rows.some((r) => r.code_hash === row.code_hash)) throw new Error('duplicate key');
      rows.push({ ...row, created_at: new Date(clock()).toISOString(), used_at: null });
    },
    async claim(codeHash: string, nowIso: string) {
      const r = rows.find((x) => x.code_hash === codeHash && x.used_at === null && x.expires_at > nowIso);
      if (!r) return null;
      r.used_at = nowIso;
      return r.user_id;
    },
    async release(codeHash: string, usedIso: string) {
      const r = rows.find((x) => x.code_hash === codeHash && x.used_at === usedIso && x.expires_at > new Date(clock()).toISOString());
      if (r) r.used_at = null;
    },
    async purge(beforeIso: string) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].expires_at < beforeIso) rows.splice(i, 1);
    },
  };
  return store;
}

const SECRET = 'test-secret-at-least-16-chars';

test('코드 모양: 헷갈리는 글자(0 O 1 I) 없이 여섯 자, 손님이 친 글을 고쳐 읽는다', () => {
  for (const ch of '0O1I') assert.ok(!C.HANDOFF_ALPHABET.includes(ch), `${ch} 없음`);
  assert.equal(C.HANDOFF_ALPHABET.length, 32);
  assert.equal(new Set(C.HANDOFF_ALPHABET).size, 32);
  for (let i = 0; i < 200; i++) {
    const code = H.newHandoffCode();
    assert.equal(code.length, C.HANDOFF_LEN);
    assert.equal(C.normalizeHandoffCode(code), code);
  }
  assert.equal(C.normalizeHandoffCode('abc def'), 'ABCDEF');
  assert.equal(C.normalizeHandoffCode(' ab-cd-ef '), 'ABCDEF');
  assert.equal(C.normalizeHandoffCode('ABCDE'), null, '짧다');
  assert.equal(C.normalizeHandoffCode('ABCDEFG'), null, '길다');
  assert.equal(C.normalizeHandoffCode('ABCDE0'), null, '0은 없다');
  assert.equal(C.normalizeHandoffCode('ABCDEㄱ'), null, '한글은 없다');
  assert.equal(C.normalizeHandoffCode(123456), null);
  assert.equal(C.normalizeHandoffCode(undefined), null);
  assert.equal(C.formatHandoffCode('ABCDEF'), 'ABC DEF');
});

test('코드 고르기는 글자표 끝까지 고르게 쓴다(주어진 고르개 그대로)', () => {
  let i = 0;
  const seq = [0, 31, 5, 16, 30, 1];
  assert.equal(H.newHandoffCode(() => seq[i++]), `${C.HANDOFF_ALPHABET[0]}${C.HANDOFF_ALPHABET[31]}${C.HANDOFF_ALPHABET[5]}${C.HANDOFF_ALPHABET[16]}${C.HANDOFF_ALPHABET[30]}${C.HANDOFF_ALPHABET[1]}`);
});

test('해시: 같은 코드·같은 비밀이면 같고, 비밀이나 코드가 다르면 다르다. 코드 글자는 해시에 드러나지 않는다', () => {
  const a = H.hashHandoffCode('ABCDEF', SECRET);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, H.hashHandoffCode('ABCDEF', SECRET));
  assert.notEqual(a, H.hashHandoffCode('ABCDEG', SECRET));
  assert.notEqual(a, H.hashHandoffCode('ABCDEF', `${SECRET}x`));
  assert.ok(!a.includes('ABCDEF'));
});

test('한 바퀴: 받은 코드를 넣으면 그 사람, 두 번째는 실패(한 번), 해시만 저장', async () => {
  let now = Date.parse('2026-11-13T01:00:00Z');
  const store = memoryStore(() => now);
  const made = await H.createHandoff(store, 'user-a', SECRET, now, 'K7M2QX');
  assert.ok(made.ok);
  if (!made.ok) return;
  assert.equal(made.code, 'K7M2QX');
  assert.equal(Date.parse(made.expiresAt) - now, C.HANDOFF_TTL_MS);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].code_hash, H.hashHandoffCode('K7M2QX', SECRET));
  assert.ok(!JSON.stringify(store.rows).includes('K7M2QX'), '코드 글자는 저장하지 않는다');

  now += 30_000;
  const got = await H.claimHandoff(store, 'k7m 2qx', SECRET, now);
  assert.equal(got?.userId, 'user-a', '소문자·띄어쓰기도 받는다');
  assert.equal(await H.claimHandoff(store, 'K7M2QX', SECRET, now), null, '두 번째는 안 된다');
  // 세션을 만들지 못해 되돌리면 같은 코드로 다시 된다(끝나기 전까지만)
  await store.release(got!.codeHash, got!.usedIso);
  assert.equal((await H.claimHandoff(store, 'K7M2QX', SECRET, now + 1000))?.userId, 'user-a', '되돌린 코드는 다시 쓸 수 있다');
  assert.equal(await H.claimHandoff(store, 'K7M2QX', SECRET, now + 2000), null, '다시 쓴 뒤에는 또 안 된다');
});

test('5분이 지나면 끝난다. 틀린 코드·틀린 비밀·모양이 틀린 글은 아무도 아니다', async () => {
  let now = Date.parse('2026-11-13T02:00:00Z');
  const store = memoryStore(() => now);
  await H.createHandoff(store, 'user-b', SECRET, now, 'AAAA22');
  await H.createHandoff(store, 'user-b', SECRET, now, 'BBBB33');
  assert.equal(await H.claimHandoff(store, 'AAAA23', SECRET, now), null);
  assert.equal(await H.claimHandoff(store, 'AAAA22', `${SECRET}!`, now), null);
  assert.equal(await H.claimHandoff(store, 'AAAA2', SECRET, now), null);
  assert.equal(await H.claimHandoff(store, { code: 'AAAA22' }, SECRET, now), null);
  now += C.HANDOFF_TTL_MS + 1;
  assert.equal(await H.claimHandoff(store, 'BBBB33', SECRET, now), null, '끝난 코드');
  assert.equal(await H.claimHandoff(store, 'AAAA22', SECRET, now), null, '끝난 코드');
});

test('사람별로 10분에 다섯 번까지. 끝난 코드는 세는 창이 지난 뒤에 지운다(일찍 지워 창이 줄지 않게)', async () => {
  let now = Date.parse('2026-11-13T03:00:00Z');
  const store = memoryStore(() => now);
  for (let i = 0; i < H.HANDOFF_PER_USER; i++) {
    const r = await H.createHandoff(store, 'user-c', SECRET, now);
    assert.ok(r.ok, `${i + 1}번째`);
    now += 60_000;
  }
  // 다섯 번째로부터 1분 뒤(첫 번째로부터 5분 뒤): 첫 코드는 이미 끝났지만 아직 창 안에 있으니 세어야 한다
  const sixth = await H.createHandoff(store, 'user-c', SECRET, now);
  assert.deepEqual(sixth, { ok: false, why: 'busy' });
  assert.ok((await H.createHandoff(store, 'user-d', SECRET, now)).ok, '다른 사람은 따로 센다');
  // 첫 코드로부터 10분이 지나면 다시 받을 수 있다
  now = Date.parse('2026-11-13T03:00:00Z') + H.HANDOFF_WINDOW_MS + 1;
  assert.ok((await H.createHandoff(store, 'user-c', SECRET, now)).ok);
  // 끝난 지 오래된 줄은 다음 발급 때 지워진다
  now += 60 * 60_000;
  await H.createHandoff(store, 'user-e', SECRET, now);
  assert.ok(store.rows.every((r) => r.user_id === 'user-e'), '오래된 줄은 지웠다');
});

test('주소별 시도 제한: 창 안에서 max번까지, 창이 지나면 다시', () => {
  const gate = H.makeAttemptGate(3, 1000);
  assert.equal(gate('ip-1', 0), true);
  assert.equal(gate('ip-1', 10), true);
  assert.equal(gate('ip-1', 20), true);
  assert.equal(gate('ip-1', 30), false);
  assert.equal(gate('ip-2', 30), true, '다른 주소는 따로');
  assert.equal(gate('ip-1', 1015), true, '첫 시도가 창 밖으로 나가면 한 번 더');
  // 기억하는 주소 수에는 상한이 있다: 넘으면 가장 오래 안 온 주소부터 잊는다
  const small = H.makeAttemptGate(1, 60_000, 3, 1000);
  for (const ip of ['a', 'b', 'c', 'd']) assert.equal(small(ip, 0), true, ip);
  assert.equal(small('d', 1), false, '최근 주소는 기억한다');
  assert.equal(small('a', 1), true, '상한을 넘어 잊힌 주소');
});

test('홈 화면 안내 방식: 앱이면 숨김, 앱 안 브라우저는 바깥으로, 설치 창이 있으면 단추, 아이폰·안드로이드는 손 안내', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const KAKAO = `${IPHONE} KAKAOTALK 10.8.0`;
  const DESKTOP_FF = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
  const env = (ua: string, o: Partial<{ standalone: boolean; canPrompt: boolean; touchMac: boolean; justInstalled: boolean }> = {}) =>
    P.installMode({ ua, standalone: false, canPrompt: false, ...o });

  assert.equal(env(IPHONE), 'ios');
  assert.equal(env(IPHONE, { standalone: true }), 'installed');
  assert.equal(env(IPAD_DESKTOP, { touchMac: true }), 'ios', '데스크톱 모드 아이패드');
  assert.equal(env(IPAD_DESKTOP), 'none', '진짜 맥 사파리는 안내하지 않는다');
  assert.equal(env(ANDROID), 'android');
  assert.equal(env(ANDROID, { canPrompt: true }), 'prompt');
  assert.equal(env(ANDROID, { canPrompt: true, justInstalled: true }), 'installed', '방금 설치했다');
  assert.equal(env(KAKAO), 'inapp');
  assert.equal(env(KAKAO, { canPrompt: true }), 'inapp', '앱 안 브라우저가 먼저');
  assert.equal(env(DESKTOP_FF), 'none');
  assert.equal(env(DESKTOP_FF, { canPrompt: true }), 'prompt', '데스크톱 크롬 계열 설치 창');

  assert.equal(P.showInstall('installed'), false);
  assert.equal(P.showInstall('none'), false);
  for (const m of ['prompt', 'ios', 'android', 'inapp'] as const) assert.equal(P.showInstall(m), true, m);
});

test('BOOT 글: 설치 창과 설치 끝 이벤트를 받아 window에 두고 알린다(기본 설치 띠는 막지 않는다)', () => {
  const handlers: Record<string, (e: unknown) => void> = {};
  const fired: string[] = [];
  const win: Record<string, unknown> = {};
  const ctx = {
    window: win,
    addEventListener: (name: string, fn: (e: unknown) => void) => {
      handlers[name] = fn;
    },
    dispatchEvent: (e: { type: string }) => fired.push(e.type),
    Event: class {
      type: string;
      constructor(t: string) {
        this.type = t;
      }
    },
  };
  runInNewContext(P.PWA_BOOT, ctx);
  assert.equal(win.__jyPwaHooked, 1);
  let prevented = false;
  const bip = { preventDefault: () => (prevented = true) };
  handlers.beforeinstallprompt(bip);
  assert.equal(win.__jyBip, bip);
  assert.equal(prevented, false);
  handlers.appinstalled({});
  assert.equal(win.__jyBip, null);
  assert.equal(win.__jyInstalled, 1);
  assert.deepEqual(fired, [P.PWA_EVENT, P.PWA_EVENT]);
});
