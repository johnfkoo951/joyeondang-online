// 캐릭터 관리 콘솔(0024)의 사이트 쪽과 3D 판 번호: 판 붙은 모형 주소와 캐시 머리, 판 없이 물으면 지금 판으로 보내기,
// 관리자 라우트가 집주인을 먼저 확인하는 차례, 목록 요청·답 읽기, 단추와 확인 글, 조작의 답, 버릴 목록 비우기, 안내 한 줄.
// DB 쪽 판정(집주인만, 동의 근거, 주인의 셈, 판 번호, 버릴 목록)은 tests/sql/rls.test.mjs의 0024 묶음이 본다.
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

const V = await import('../../src/lib/avatar/model-version.ts');
const A = await import('../../src/lib/avatar/admin-rules.ts');
type Row = import('../../src/lib/avatar/admin-rules.ts').CharacterRow;

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const SQL = readFileSync(new URL('../../supabase/migrations/0024_admin_characters.sql', import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ID = id(7);
const UID = id(1);
function inOrder(text: string, steps: string[]): void {
  const at = steps.map((s) => text.indexOf(s));
  assert.deepEqual(at.map((i) => i >= 0), steps.map(() => true), `빠진 단계: ${steps.filter((_, k) => at[k] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `순서가 다르다: ${steps.join(' → ')}`);
}
const fn = (text: string, name: string) => {
  const from = text.indexOf(`export async function ${name}`);
  const next = text.indexOf('\nexport ', from + 1);
  return text.slice(from, next < 0 ? undefined : next);
};

// ───────────────────────────── 판 번호
test('판 읽기: 1 이상의 정수 글자만(0, 앞의 0, 부호, 소수, 지수, 아주 큰 수는 판이 아니다). DB의 판은 숫자·글자·bigint', () => {
  assert.deepEqual(['1', '12', '999999999999999'].map(V.readVer), [1, 12, 999999999999999]);
  for (const bad of ['0', '01', '-1', '+1', '1.5', '1e3', '', ' 1', '1 ', 'x', '9999999999999999', null, undefined]) {
    assert.equal(V.readVer(bad as string | null | undefined), null, String(bad));
  }
  assert.deepEqual([V.toVer(3), V.toVer('4'), V.toVer(BigInt(5)), V.toVer(0), V.toVer(1.5), V.toVer(null), V.toVer('01')], [3, 4, 5, null, null, null, null]);
});

test('지금 보일 모형 읽기: 경로는 그 그림의 모형 자리와 꼭 같아야 한다(다른 그림, 그림 파일, 원본 자리는 받지 않는다)', () => {
  const path = `${UID}/models/${ID}.v1.glb`;
  assert.deepEqual(V.readShown({ path, ver: 3, prev: true }, ID), { path, ver: 3, prev: true });
  assert.deepEqual(V.readShown({ path, ver: '2' }, ID), { path, ver: 2, prev: false });
  for (const raw of [
    { path: `${UID}/models/${id(8)}.v1.glb`, ver: 3 },
    { path: `${UID}/chars/${ID}.png`, ver: 3 },
    { path: `${UID}/originals/${ID}.jpg`, ver: 3 },
    { path: `../${UID}/models/${ID}.v1.glb`, ver: 3 },
    { path, ver: 0 },
    { path },
    null, [], 'x',
  ]) assert.equal(V.readShown(raw, ID), null, JSON.stringify(raw));
  assert.equal(V.readShown({ path, ver: 1 }, 'not-a-uuid'), null);
});

test('판 붙은 모형 주소와 지금 판으로 보내는 답: 같은 사이트 경로만, 302, 남기지 않음', () => {
  assert.equal(V.modelHref(ID), `/api/avatar/${ID}/model`);
  assert.equal(V.modelHref(ID, 3), `/api/avatar/${ID}/model?v=3`);
  const r = V.toVersion(V.modelHref(ID, 3));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/api/avatar/${ID}/model?v=3`);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  for (const bad of ['https://example.com/x', '//example.com/x', 'x']) assert.throws(() => V.toVersion(bad));
  // 판이 붙은 답도 한 시간(판 없던 때와 같은 수명): 지운 3D가 본 사람들의 기기에 오래 남지 않게. immutable이 아니다
  assert.deepEqual(V.modelHeaders(10, V.CACHE_VERSIONED), {
    'Content-Type': 'model/gltf-binary', 'Content-Length': '10', 'Cache-Control': 'private, max-age=3600',
    'X-Robots-Tag': 'noindex', 'Content-Disposition': 'inline',
  });
  assert.doesNotMatch(V.CACHE_VERSIONED, /immutable/);
  assert.equal(V.CACHE_PLAIN, 'private, max-age=3600', '판이 없는 옛 DB는 지금처럼 한 시간');
  // 관리자용 읽기는 더 짧다: 그림 1분, 3D는 남기지 않는다(모든 사람의 그림이 집주인 휴대폰에 오래 남지 않게)
  assert.deepEqual([A.ADMIN_IMAGE_CACHE, A.ADMIN_MODEL_CACHE], ['private, max-age=60', 'private, no-store']);
  const server = src('lib/avatar/admin-server.ts');
  assert.match(server, /modelHeaders\(bytes\.length, ADMIN_MODEL_CACHE\)/);
  assert.match(server, /'Cache-Control': ADMIN_IMAGE_CACHE/);
  assert.doesNotMatch(server, /CACHE_VERSIONED/);
});

/** 보는 사람의 세션 흉내: 판 함수, 기다리면 생기는지, 저장소 내려받기 */
function fakeClient(o: { shown?: { data?: unknown; error?: unknown }; state?: unknown; file?: Uint8Array | null } = {}) {
  const calls: string[] = [];
  return {
    calls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      if (name === 'avatar_model_shown') return { data: o.shown?.data ?? null, error: o.shown?.error ?? null };
      return { data: o.state ?? 'pending', error: null };
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          calls.push(`download:${bucket}:${path}`);
          const bytes = o.file;
          return bytes ? { data: new Blob([bytes as Uint8Array<ArrayBuffer>]), error: null } : { data: null, error: { message: 'missing' } };
        },
      }),
    },
  };
}
const req = (q = '') => new Request(`https://site.test/api/avatar/${ID}/model${q}`);

test('모형 답(0024): 판 함수가 없으면 옛 길(null), 판 없이·옛 판으로 물으면 지금 판으로 302, 맞는 판이면 오래 캐시, 없으면 404 머리', async () => {
  const path = `${UID}/models/${ID}.v1.glb`;
  // 옛 DB: 판 함수가 없다 → 부르는 쪽이 판 없이 한 시간짜리 옛 길로
  assert.equal(await V.versionedModel(fakeClient({ shown: { error: { code: 'PGRST202' } } }), req(), ID, 'avatars'), null);
  // 그 밖의 오류: 본문 없는 404, 머리 없음(걷기 엔진이 나중에 다시 묻는다)
  const err = await V.versionedModel(fakeClient({ shown: { error: { code: 'XX000' } } }), req(), ID, 'avatars');
  assert.deepEqual([err?.status, err?.headers.get('x-avatar-asset')], [404, null]);
  // 보일 모형이 없다: 기다리면 생기는지 묻는다
  const none = fakeClient({ shown: { data: null }, state: 'pending' });
  const missing = await V.versionedModel(none, req(), ID, 'avatars');
  assert.deepEqual([missing?.status, missing?.headers.get('x-avatar-asset')], [404, 'pending']);
  assert.ok(none.calls.some((c) => c.startsWith('avatar_asset_state')));
  // 판 없이(걷기 엔진), 옛 판으로, 엉뚱한 판으로 물으면 지금 판으로 보낸다. 파일은 받지 않는다
  for (const q of ['', '?v=2', '?v=abc', '?v=4']) {
    const c = fakeClient({ shown: { data: { path, ver: 3, prev: false } }, file: new Uint8Array([1, 2, 3]) });
    const r = await V.versionedModel(c, req(q), ID, 'avatars');
    assert.deepEqual([r?.status, r?.headers.get('location'), r?.headers.get('cache-control')],
      [302, `/api/avatar/${ID}/model?v=3`, 'private, no-store'], q);
    assert.ok(!c.calls.some((x) => x.startsWith('download')), q);
  }
  // 맞는 판: 보는 사람의 세션으로 내려받아 오래 캐시(다시 만드는 동안의 이전 모형도 같다)
  const c = fakeClient({ shown: { data: { path, ver: 3, prev: true } }, file: new Uint8Array([7, 8, 9, 10]) });
  const ok = await V.versionedModel(c, req('?v=3'), ID, 'avatars');
  assert.equal(ok?.status, 200);
  assert.equal(ok?.headers.get('cache-control'), 'private, max-age=3600');
  assert.equal(ok?.headers.get('content-type'), 'model/gltf-binary');
  assert.deepEqual([...new Uint8Array(await ok!.arrayBuffer())], [7, 8, 9, 10]);
  assert.ok(c.calls.includes(`download:avatars:${path}`));
  // 파일을 못 받으면 머리 없는 404
  const gone = await V.versionedModel(fakeClient({ shown: { data: { path, ver: 3 } }, file: null }), req('?v=3'), ID, 'avatars');
  assert.deepEqual([gone?.status, gone?.headers.get('x-avatar-asset')], [404, null]);
});

test('걷기 모형 라우트: 명단 손님 확인 → 판 붙은 길(0024) → 없으면 옛 길. 비밀 키는 쓰지 않는다', () => {
  const route = src('app/api/avatar/[id]/model/route.ts');
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  inOrder(get, ["canSee(viewer.role, 'guests')", 'createClient()', 'versionedModel(supabase, request, id, AVATAR_BUCKET)',
    'if (versioned) return versioned', "rpc('avatar_model_path', { p_id: id })", "'Cache-Control': 'private, max-age=3600'"]);
  assert.doesNotMatch(route, /createAvatarAdmin|SECRET_KEY/);
  // 판 함수(0024)는 명단 손님만, 다 된 모형이나 다시 만드는 동안의 이전 모형만 준다
  assert.match(SQL, /where public\.is_guest\(\) and a\.id = p_id and a\.status = 'ready' and a\.image_path is not null\s+and \(a\.model_status = 'ready' or a\.model_prev\)/);
});

// ───────────────────────────── 관리자 라우트
test('관리자 라우트: 모두 집주인 확인(adminSession)이 먼저고, 고치는 요청은 같은 사이트에서만. 비밀 키 읽기는 DB가 준 경로로만', () => {
  const list = src('app/api/admin/characters/route.ts');
  inOrder(fn(list, 'GET'), ['await connection()', 'adminSession()', 'if (gate instanceof Response) return gate', "rpc('admin_characters'"]);
  const log = src('app/api/admin/characters/log/route.ts');
  inOrder(fn(log, 'GET'), ['adminSession()', 'if (gate instanceof Response) return gate', "rpc('admin_avatar_log'"]);
  const act = src('app/api/admin/characters/[id]/route.ts');
  inOrder(fn(act, 'POST'), ['isUuid(id)', 'adminSession(request)', 'if (gate instanceof Response) return gate', 'readOp(',
    'modelsOn()', 'adminStoreReady()', 'gate.supabase.rpc(OP_FN[op.op], args)', 'drainAvatarTrash()']);
  assert.match(act, /p_via: modelProvider\(\)/, '보낼 곳은 사이트가 고른다(동의 글과 같은 곳)');
  for (const kind of ['image', 'model']) {
    const r = src(`app/api/admin/characters/[id]/${kind}/route.ts`);
    inOrder(fn(r, 'GET'), ['isUuid(id)', 'adminSession()', 'if (gate instanceof Response) return gate', 'serveAdminFile(']);
    assert.deepEqual([...r.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]), ['GET']);
  }
  const server = src('lib/avatar/admin-server.ts');
  inOrder(fn(server, 'adminSession'), ['sameOrigin(request)', 'getViewer()', 'viewer.unsure', "viewer.role !== 'admin') return adminHidden()"]);
  inOrder(fn(server, 'serveAdminFile'), ['adminStoreReady()', "rpc('admin_character_file'", 'readFileRef(data, id, kind)',
    'readVer(sp.get(VER_PARAM)) !== ref.ver', 'createAvatarAdmin()', '.download(ref.path)']);
  // 원본 사진은 내보내지 않는다: 관리자 읽기의 경로는 그림·모형 모양만 받는다
  assert.doesNotMatch(server, /originals/);
  assert.equal(A.readFileRef({ path: `${UID}/originals/${ID}.jpg`, ver: 1 }, ID, 'char'), null);
  // 비밀 키를 쓰는 곳은 관리자 서버 파일 하나(라우트는 그 함수를 부른다)
  for (const r of [list, log, act]) assert.doesNotMatch(r, /createAvatarAdmin|SECRET_KEY/);
});

test('관리자용 그림·모형 경로: DB가 준 경로가 그 캐릭터의 그림·모형 자리와 같을 때만, 주소에는 판(작은 그림은 s=s)', () => {
  assert.deepEqual(A.readFileRef({ path: `${UID}/chars/${ID}.png`, ver: '1731400000000' }, ID, 'char'), { path: `${UID}/chars/${ID}.png`, ver: 1731400000000 });
  assert.deepEqual(A.readFileRef({ path: `${UID}/models/${ID}.v1.glb`, ver: 4 }, ID, 'model'), { path: `${UID}/models/${ID}.v1.glb`, ver: 4 });
  for (const [raw, kind] of [
    [{ path: `${UID}/models/${ID}.v1.glb`, ver: 4 }, 'char'],
    [{ path: `${UID}/chars/${ID}.png`, ver: 4 }, 'model'],
    [{ path: `${UID}/chars/${id(9)}.png`, ver: 4 }, 'char'],
    [{ path: `${UID}/views/${ID}.v1l.webp`, ver: 4 }, 'char'],
    [{ path: `${UID}/chars/${ID}.png` }, 'char'],
  ] as const) assert.equal(A.readFileRef(raw, ID, kind), null, JSON.stringify(raw));
  assert.equal(A.adminFileHref(ID, 'char', 5, true), `/api/admin/characters/${ID}/image?v=5&s=s`);
  assert.equal(A.adminFileHref(ID, 'char', 5), `/api/admin/characters/${ID}/image?v=5`);
  assert.equal(A.adminFileHref(ID, 'model', 2, true), `/api/admin/characters/${ID}/model?v=2`);
});

// ───────────────────────────── 목록 요청과 답
test('목록 요청 읽기: 모르는 거르기는 전부, 역할·만든 서비스·검색어·내 것만·한 장 크기·다음 장은 모양이 맞을 때만', () => {
  const q = A.readAdminQuery(new URLSearchParams('filter=model_problem&role=family&maker=meshy-7.1&q=%20%20김%20%20하나%20&mine=1&limit=10'));
  assert.deepEqual(q, { filter: 'model_problem', role: 'family', maker: 'meshy-7.1', q: '김 하나', mine: true, limit: 10, before: null, beforeId: null });
  const bad = A.readAdminQuery(new URLSearchParams(`filter=drop&role=boss&maker=a%20b&limit=1000&before=2026-11-12T00:00:00Z&before_id=x`));
  assert.deepEqual(bad, { filter: 'all', role: null, maker: null, q: null, mine: false, limit: A.PAGE_SIZE, before: null, beforeId: null });
  const page = A.readAdminQuery(new URLSearchParams(`before=2026-11-12T00:00:00Z&before_id=${ID}`));
  assert.deepEqual([page.before, page.beforeId], ['2026-11-12T00:00:00.000Z', ID]);
  assert.equal(A.readAdminQuery(new URLSearchParams(`q=${'가'.repeat(60)}`)).q?.length, A.QUERY_MAX);
  // 화면이 부르는 주소와 되읽기가 같다
  const href = A.listHref({ filter: 'pic_problem', role: 'guest', q: '한글 이름', mine: true, before: '2026-11-12T00:00:00.000Z', beforeId: ID });
  const back = A.readAdminQuery(new URL(href, 'https://site.test').searchParams);
  assert.deepEqual([back.filter, back.role, back.q, back.mine, back.before, back.beforeId], ['pic_problem', 'guest', '한글 이름', true, '2026-11-12T00:00:00.000Z', ID]);
  assert.equal(A.listHref({}), '/api/admin/characters');
});

const raw = (o: Record<string, unknown> = {}) => ({
  id: ID, owner_id: UID, owner_name: '손님하나', nickname: '별명', owner_role: 'guest', owner_removed: false, event_label: '행사',
  created_at: '2026-11-12T01:00:00Z', status: 'ready', reason: null, slot: 2, kept: true, worn: false, has_original: true,
  pic_ver: '1731373200000', model_state: 'ready', model_maker: 'meshy-7.1', model_reason: null, model_attempts: 1, model_tries: 1,
  model_via: 'meshy', model_ver: 3, model_prev: false, model_by_admin: false, model_asked_at: '2026-11-12T01:05:00Z', model_claimed_at: null,
  views_status: 'ready', redrawing: false, ...o,
});
const row = (o: Record<string, unknown> = {}): Row => A.readCharacterRows([raw(o)])[0];

test('라우트 → 화면 모양: 라우트가 보내는 줄(characterWire·logWire)을 화면이 같은 함수로 다시 읽어도 그대로다(수는 보이는데 목록이 비던 일)', () => {
  const rows = A.readCharacterRows([raw(), raw({ id: '33333333-3333-4333-8333-333333333333', status: 'rejected', reason: 'child', model_state: 'none', kept: false })]);
  assert.equal(rows.length, 2);
  assert.deepEqual(A.readCharacterRows(rows.map(A.characterWire)), rows);
  assert.equal(A.readCharacterRows(rows as unknown[]).length, 0, '화면 모양을 그대로 보내면 화면이 모두 버린다(고치기 전의 라우트)');
  const logs = A.readLogRows([{ at: '2026-11-12T01:00:00Z', actor_name: '집주인', avatar_id: ID, owner_name: '손님하나', owner_nickname: '별명', action: 'remake_model', consent: 'told_by_owner', detail: { via: 'meshy' } }]);
  assert.equal(logs.length, 1);
  assert.deepEqual(A.readLogRows(logs.map(A.logWire)), logs);
  // 두 라우트가 실제로 바꿔 보낸다
  assert.match(src('app/api/admin/characters/route.ts'), /items: items\.map\(characterWire\)/);
  assert.match(src('app/api/admin/characters/log/route.ts'), /readLogRows\(data\)\.map\(logWire\)/);
});

test('목록 답 읽기: 모양이 이상한 줄은 빼고, 모르는 칸(원본 경로 같은 것)은 옮기지 않는다', () => {
  const r = row({ original_path: `${UID}/originals/${ID}.jpg` });
  assert.deepEqual([r.id, r.ownerName, r.nickname, r.role, r.eventLabel, r.status, r.slot, r.kept, r.hasOriginal, r.picVer, r.model, r.modelVer, r.via],
    [ID, '손님하나', '별명', 'guest', '행사', 'ready', 2, true, true, 1731373200000, 'ready', 3, 'meshy']);
  assert.doesNotMatch(JSON.stringify(r), /originals/);
  assert.equal(A.readCharacterRows([raw({ id: 'x' }), raw({ status: 'deleted' }), raw({ created_at: 'nope' }), null, 3]).length, 0);
  assert.deepEqual(A.readCharacterRows('x'), []);
  const odd = row({ owner_role: 'boss', model_state: 'weird', model_via: 'tripo', model_maker: 'a b', reason: 'Bad-Reason' });
  assert.deepEqual([odd.role, odd.model, odd.via, odd.maker, odd.reason], ['visitor', 'none', null, null, null]);
  assert.equal(A.ownerLine(row()), '손님하나 (별명)');
  assert.equal(A.ownerLine(row({ nickname: '손님하나' })), '손님하나');
  assert.equal(A.ownerLine(row({ owner_name: null, nickname: null })), '이름 없음');
  const c = A.readCounts({ all: 5, model_problem: 1, model_making: '2', model_ready: 1, model_none: 1, pic_problem: 1,
    roles: { guest: 4, admin: 1, boss: 9 }, makers: { 'meshy-7.1': 2, 'bad name': 1 } });
  assert.deepEqual([c?.all, c?.model_making, c?.roles, c?.makers], [5, 2, { admin: 1, guest: 4 }, { 'meshy-7.1': 2 }]);
  assert.equal(A.readCounts(null), null);
});

// ───────────────────────────── 단추·확인·답
test('단추: DB가 거절할 단추는 두지 않는다. 3D 다시 만들기(만드는 중·같은 실패로 굳음이 아니면), 3D 지우기(3D가 있을 때), 그림 다시 그리기(원본이 있고 3D를 기다리거나 만드는 중이 아닐 때), 캐릭터 지우기. 파일을 지우는 셋은 비밀 키가 있을 때만', () => {
  const on = { modelsOn: true, store: true, provider: 'meshy' as const };
  assert.deepEqual(A.opsFor(row(), on), ['remake_model', 'forget_model', 'redraw', 'forget']);
  assert.deepEqual(A.opsFor(row({ has_original: false }), on), ['remake_model', 'forget_model', 'forget']);
  assert.deepEqual(A.opsFor(row({ model_state: 'none' }), on), ['remake_model', 'redraw', 'forget']);
  assert.deepEqual(A.opsFor(row({ model_state: 'none', model_prev: true }), on), ['remake_model', 'forget_model', 'redraw', 'forget']);
  assert.deepEqual(A.opsFor(row({ model_state: 'making' }), on), ['forget_model', 'forget'], '만드는 중이면 다시 만들기도 다시 그리기도 없음');
  assert.deepEqual(A.opsFor(row({ model_state: 'waiting' }), on), ['remake_model', 'forget_model', 'forget'], '3D를 기다리면 다시 그리기 없음(model_busy)');
  assert.deepEqual(A.opsFor(row({ model_state: 'stuck' }), on), ['remake_model', 'forget_model', 'forget'], '멈춘 것은 다시 만든다(다시 그리기는 3D를 지운 뒤)');
  assert.deepEqual(A.opsFor(row(), { ...on, modelsOn: false }), ['forget_model', 'redraw', 'forget']);
  assert.deepEqual(A.opsFor(row(), { ...on, store: false }), ['remake_model'], '비밀 키가 없으면 지우지 않는다');
  assert.deepEqual(A.opsFor(row({ status: 'queued', model_state: 'none' }), on), ['forget']);
  assert.deepEqual(A.opsFor(row({ status: 'queued', model_state: 'none', redrawing: true }), on), ['forget'], '다시 그리는 중에도 지울 수 있다');
  assert.deepEqual(A.opsFor(row({ status: 'rejected', model_state: 'none' }), on), []);
  // 다시 해도 같은 실패로 굳은 그림: 지금 만드는 곳 기준(Meshy가 받지 않은 그림은 우리 컴퓨터로는 된다). DB의 model_blocked와 같은 목록
  for (const reason of ['meshy_rejected', 'meshy_input', 'blocked', 'bad_char', 'bad_job']) {
    const r = row({ model_state: 'failed', model_reason: reason });
    assert.deepEqual(A.opsFor(r, on), ['forget_model', 'redraw', 'forget'], reason);
    assert.match(A.modelNextStep(r, on) ?? '', /그림 다시 그리기로 새 그림을 만들면 3D를 다시 할 수 있어요/, reason);
  }
  assert.deepEqual(A.opsFor(row({ model_state: 'failed', model_reason: 'meshy_rejected' }), { ...on, provider: 'trellis' }),
    ['remake_model', 'forget_model', 'redraw', 'forget']);
  assert.deepEqual(A.opsFor(row({ model_state: 'failed', model_reason: 'bad_input' }), { ...on, provider: 'trellis' }), ['forget_model', 'redraw', 'forget']);
  assert.equal(A.modelNextStep(row({ model_state: 'failed', model_reason: 'glb_parts' }), on), null, '다시 해 볼 만한 실패');
  assert.match(A.modelNextStep(row({ model_state: 'failed', model_reason: 'blocked', has_original: false }), on) ?? '', /다른 그림으로/);
  assert.equal(A.remakeLabel(row({ model_state: 'none' })), '3D 만들기');
  assert.equal(A.remakeLabel(row({ model_state: 'failed' })), '3D 다시 만들기');
  assert.equal(A.hasShownModel(row({ model_state: 'waiting', model_prev: true })), true);
  assert.equal(A.hasShownModel(row({ model_state: 'failed' })), false);
  // 「멈춘 것 같아요」는 다시 만들기가 받는 때와 같다(DB: 만드는 중은 30분, 기다림은 15분). 숫자를 단추 곁 글에 따로 적지 않는다
  assert.equal(A.MODEL_WORD.stuck, '3D가 멈춘 것 같아요');
  assert.match(SQL, /when a\.model_status = 'drawing' then\s+case when a\.model_claimed_at < now\(\) - interval '30 minutes' then 'stuck'/);
  assert.match(SQL, /if v\.model_status = 'drawing' and v\.model_claimed_at > now\(\) - interval '30 minutes' then\s+return jsonb_build_object\('ok', false, 'reason', 'busy'\);/);
});

test('Meshy로 보내는 확인: 주인이 관리자이거나 그 그림에 Meshy 동의가 있으면 묻지 않고, 아니면 「본인에게 들었어요」를 받는다. 우리 컴퓨터는 묻지 않는다', () => {
  assert.equal(A.needsTold(row({ model_via: null }), 'meshy'), true);
  assert.equal(A.needsTold(row({ model_via: 'trellis' }), 'meshy'), true, '우리 컴퓨터 안내만 본 그림');
  assert.equal(A.needsTold(row({ model_via: 'meshy' }), 'meshy'), false);
  assert.equal(A.needsTold(row({ owner_role: 'admin', model_via: null }), 'meshy'), false);
  assert.equal(A.needsTold(row({ owner_role: 'admin', owner_removed: true, model_via: null }), 'meshy'), true, '명단에서 뺀 관리자 줄은 관리자가 아니다');
  assert.equal(A.needsTold(row({ model_via: null }), 'trellis'), false);
  assert.match(A.TOLD_LINE, /본인에게 .*Meshy\(미국\)로 보내도 된다고 들었어요/);
  // DB가 같은 판정을 한 번 더 한다
  assert.match(SQL, /elsif p_told is true then\s+v_basis := 'told_by_owner';\s+else\s+return jsonb_build_object\('ok', false, 'reason', 'consent_needed'\);/);
});

test('확인 글: 무엇을 어디로 보내는지, 이전 3D가 남는지, 주인의 셈(3D 요청 수에는 든다), 다시 그리다 실패·거절되면 무엇이 없어지는지', () => {
  const meshy = A.confirmText('remake_model', row(), 'meshy');
  assert.match(meshy, /Meshy\(미국\)로 보내 3D를 다시 만들어요\. 사진 원본은 보내지 않아요\./);
  assert.match(meshy, /지금 3D는 새 3D가 될 때까지 그대로 보여요/);
  // 주인의 셈(0021의 셈 그대로): 주인이 요청한 그림이면 이미 세고 있고, 아니면 이 3D가 주인의 3D 한 번이 된다
  assert.match(meshy, /이 그림은 이미 주인의 3D 한 번으로 세고 있어요/);
  assert.match(meshy, /주인의 돈이 든 시도에는 세지 않지만, 모두가 함께 쓰는 하루 Meshy 상한에는 들어요/);
  assert.doesNotMatch(meshy, /횟수에는 세지 않아요/, '셈에 들지 않는다고 말하지 않는다(주인의 3D 요청 수에는 든다)');
  for (const o of [{ model_state: 'none', model_asked_at: null }, { model_state: 'failed' }, { model_state: 'ready', model_asked_at: null }]) {
    const t = A.confirmText('remake_model', row(o), 'meshy');
    assert.match(t, /이 3D는 주인의 3D 한 번으로 세요\. 주인이 다른 그림으로 3D를 새로 요청하지 못할 수 있어요\(주인이 이 그림을 지우면 돌아와요\)/, JSON.stringify(o));
  }
  assert.equal(A.countsForOwner(row({ model_state: 'failed' })), false, '실패한 요청은 셈에서 빠져 있다');
  const own = A.confirmText('remake_model', row({ owner_role: 'admin', model_state: 'none', model_asked_at: null }), 'meshy');
  assert.doesNotMatch(own, /주인의 3D 한 번/, '집주인 자신의 캐릭터는 한도가 없다');
  const local = A.confirmText('remake_model', row({ model_state: 'none' }), 'trellis');
  assert.match(local, /우리 컴퓨터에서 3D를 만들어요\(바깥으로 보내지 않아요\)/);
  assert.doesNotMatch(local, /Meshy/);
  const redraw = A.confirmText('redraw', row(), 'meshy');
  assert.match(redraw, /원본 사진을 외부 AI 서비스\(OpenAI\)로 다시 보내/);
  assert.match(redraw, /다 그릴 때까지 걷기에는 지금 그림이 보여요/);
  assert.match(redraw, /그리다 실패하면\(서비스 문제 포함\) 지금 그림으로 돌아오지만 원본 사진은 없어져요/);
  assert.match(redraw, /사진 살피기에서 거절되면 이 캐릭터와 원본 사진이 없어져요/);
  assert.match(A.confirmText('redraw', row({ worn: true }), 'meshy'), /입고 있어서 종이 인형으로 돌아가요/);
  assert.match(A.confirmText('forget', row({ worn: true }), 'meshy'), /종이 인형으로 돌아가요/);
  assert.match(A.confirmText('forget', row(), 'meshy'), /원본 사진은 본인이 지울 때까지 남아요/);
  assert.match(A.confirmText('forget_model', row(), 'meshy'), /되돌릴 수 없어요/);
  assert.deepEqual([A.confirmYes('remake_model', 'meshy'), A.confirmYes('remake_model', 'trellis'), A.confirmYes('redraw', 'meshy'), A.confirmYes('forget', 'meshy')],
    ['보내기', '3D 만들기', '다시 그리기', '지우기']);
  // 엠대시를 쓰지 않는다
  for (const op of A.ADMIN_OPS) assert.doesNotMatch(A.confirmText(op, row(), 'meshy'), /—/);
});

test('조작 요청과 답: op만 받고, DB의 답을 상태 코드와 쉬운 말로', () => {
  assert.deepEqual(A.readOp({ op: 'redraw' }), { op: 'redraw', told: false });
  assert.deepEqual(A.readOp({ op: 'remake_model', told: true }), { op: 'remake_model', told: true });
  for (const bad of [null, [], { op: 'drop' }, { op: 'forget', told: 'yes' }, 'forget']) assert.equal(A.readOp(bad), null, JSON.stringify(bad));
  const made = A.opReply('remake_model', { ok: true, consent: 'told_by_owner', prev: true });
  assert.equal(made.status, 200);
  assert.equal(made.body.consent, 'told_by_owner');
  assert.match(made.body.message, /근거: 본인에게 들었음\(집주인 확인\)/);
  assert.match(made.body.message, /지금 3D는 새 3D가 될 때까지 보여요/);
  assert.match(A.opReply('forget', { ok: true, worn: true }).body.message, /종이 인형으로 돌렸어요/);
  const cases: [unknown, number, string][] = [
    [{ ok: false, reason: 'consent_needed' }, 409, 'consent_needed'],
    [{ ok: false, reason: 'busy' }, 409, 'busy'],
    [{ ok: false, reason: 'model_busy' }, 409, 'model_busy'],
    [{ ok: false, reason: 'worker_down' }, 409, 'worker_down'],
    [{ ok: false, reason: 'not_found' }, 404, 'not_found'],
    [{ ok: false, reason: 'Weird Reason' }, 503, 'error'],
    [null, 503, 'error'],
  ];
  // 다시 그리기를 막은 까닭은 무엇을 기다리면 되는지 알린다
  assert.match(A.failWord('model_busy'), /3D가 끝나거나 3D를 지운 뒤에/);
  assert.match(A.failWord('worker_down'), /그림 일꾼이 5분 넘게 소식이 없어/);
  assert.match(A.failWord('busy'), /30분/);
  assert.match(A.opReply('redraw', { ok: true }).body.message, /그동안 지금 그림이 보이고/);
  for (const [data, status, reason] of cases) {
    const r = A.opReply('remake_model', data);
    assert.deepEqual([r.status, r.body.ok, r.body.reason], [status, false, reason], JSON.stringify(data));
    assert.ok(r.body.message.length > 0);
  }
  assert.deepEqual(Object.values(A.OP_FN), ['admin_avatar_remake_model', 'admin_avatar_forget_model', 'admin_avatar_redraw', 'admin_avatar_forget']);
  for (const f of Object.values(A.OP_FN)) assert.match(SQL, new RegExp(`create or replace function public\\.${f}\\(`));
});

test('쉬운 말: 그림·3D 상태와 실패 까닭, 동의 근거, 기록 한 줄', () => {
  assert.equal(A.reasonWord('child', 'pic'), '아이로 보일 수 있는 사진이라 그리지 않았어요');
  assert.equal(A.reasonWord('mystery', 'pic'), '그리지 못했어요');
  assert.equal(A.reasonWord('glb_parts', 'model'), '3D 결과가 이상해서 버렸어요');
  assert.equal(A.reasonWord('meshy_rejected', 'model'), '3D 서비스가 이 그림을 받지 않았어요');
  assert.equal(A.reasonWord('meshy_paused', 'model'), '3D 서비스 쪽 사정으로 못 만들었어요');
  assert.equal(A.reasonWord('reconsent', 'model'), '3D 만드는 곳이 바뀌어 보내지 않았어요');
  assert.equal(A.reasonWord(null, 'model'), null);
  assert.equal(A.reasonWord('http_error', 'pic'), '그림 서비스가 답하지 않았어요');
  const rows = A.readLogRows([
    { at: '2026-11-12T01:00:00Z', actor_name: '집주인', avatar_id: ID, owner_name: '손님하나', owner_nickname: null, action: 'remake_model', consent: 'told_by_owner', detail: { via: 'meshy' } },
    { at: '2026-11-12T01:01:00Z', actor_name: '집주인', avatar_id: ID, owner_name: '손님하나', action: 'forget', consent: null, detail: { worn: true } },
    { at: 'x', avatar_id: ID, action: 'forget' },
    { at: '2026-11-12T01:01:00Z', avatar_id: ID, action: 'drop' },
    { at: '2026-11-12T01:02:00Z', actor_name: null, avatar_id: ID, owner_name: '손님하나', action: 'redraw_back', consent: null, detail: { reason: 'http_error' } },
    { at: '2026-11-12T01:03:00Z', actor_name: null, avatar_id: ID, owner_name: '손님하나', action: 'redraw_rejected', consent: null, detail: { reason: 'child' } },
    { at: '2026-11-12T01:04:00Z', actor_name: null, avatar_id: ID, owner_name: '손님하나', action: 'redraw_done', consent: null, detail: null },
  ]);
  assert.equal(rows.length, 5);
  assert.equal(A.logLine(rows[0]), '3D 다시 만들기 · 근거: 본인에게 들었음(집주인 확인)');
  assert.equal(A.logLine(rows[1]), '캐릭터 지우기 · 입고 있던 캐릭터(종이 인형으로)');
  // 다시 그리기의 끝은 DB 트리거가 남긴다: 한 사람은 그림 일꾼, 까닭은 쉬운 말로
  assert.equal(A.logLine(rows[2]), '다시 그리지 못해 원래 그림으로 돌림(원본 사진은 없어짐) · 까닭: 그림 서비스가 답하지 않았어요');
  assert.equal(A.logLine(rows[3]), '다시 그리기가 사진 살피기에서 거절됨(캐릭터 없어짐) · 까닭: 아이로 보일 수 있는 사진이라 그리지 않았어요');
  assert.equal(A.logLine(rows[4]), '다시 그린 그림이 다 됨');
  assert.deepEqual(rows.map(A.actorWord), ['집주인', '집주인', '그림 일꾼', '그림 일꾼', '그림 일꾼']);
  assert.equal(A.actorWord({ actor: null, action: 'forget' }), '집주인', '집주인이 한 조작인데 명단 이름이 없으면');
  // 근거와 조작 이름은 DB의 기록 표와 같다
  for (const k of Object.keys(A.CONSENT_WORD)) assert.match(SQL, new RegExp(`'${k}'`));
  const actions = /check \(action in \(([^)]*)\)\)/.exec(SQL)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  assert.deepEqual(actions.sort(), Object.keys(A.ACTION_WORD).sort());
});

// ───────────────────────────── 버릴 목록
test('버릴 목록 비우기: 사이트가 만드는 모양만 저장소에서 지우고, 지운 뒤에 목록에서 뺀다. 모양이 틀린 경로는 지우지 않고 목록에서만', async () => {
  const good = [`${UID}/chars/${ID}.png`, `${UID}/views/${ID}.v1l.webp`, `${UID}/views/${ID}.v1s.webp`, `${UID}/models/${ID}.v1.glb`, `${UID}/originals/${ID}.webp`];
  for (const p of good) assert.match(p, A.TRASH_FILE);
  const bad = [`${UID}/chars/${ID}.png/../x`, `../${UID}/chars/${ID}.png`, `${UID}/notes/${ID}.jpg`, `${UID}/models/${ID}.glb`, 'x'];
  for (const p of bad) assert.doesNotMatch(p, A.TRASH_FILE);
  const removed: string[][] = [];
  const done: string[][] = [];
  let lists = 0;
  const r = await A.drainTrash({
    list: async () => (lists++ === 0 ? [...good, ...bad, 3] : []),
    remove: async (ps) => (removed.push(ps), true),
    done: async (ps) => (done.push(ps), true),
  });
  assert.deepEqual(r, { removed: good.length, left: false });
  assert.deepEqual(removed, [good], '모양이 틀린 경로는 저장소에서 지우지 않는다');
  assert.deepEqual(done, [[...good, ...bad]]);
  // 저장소에서 지우지 못하면 목록에서 빼지 않는다(다음에 마저)
  const kept: string[][] = [];
  assert.deepEqual(await A.drainTrash({ list: async () => good, remove: async () => false, done: async (ps) => (kept.push(ps), true) }),
    { removed: 0, left: true });
  assert.deepEqual(kept, []);
  assert.deepEqual(await A.drainTrash({ list: async () => null, remove: async () => true, done: async () => true }), { removed: 0, left: true });
  // 한 번에 100개씩, 꽉 찬 묶음이면 다음 묶음을 본다
  const many = Array.from({ length: 150 }, (_, k) => `${UID}/chars/${id(1000 + k)}.png`);
  let at = 0;
  const big = await A.drainTrash({
    list: async (n) => many.slice(at, at + n),
    remove: async () => true,
    done: async (ps) => ((at += ps.length), true),
  });
  assert.deepEqual(big, { removed: 150, left: false });
  // DB의 모양 검사와 같은 갈래
  for (const part of ['chars/', 'views/', 'v1[ls][.]webp', 'models/', 'v1[.]glb', 'originals/', '[.](jpg|png|webp)']) {
    assert.ok(SQL.includes(part), part);
  }
});

// ───────────────────────────── 안내와 들머리
test('관리 안내는 한곳(admin-care.ts)에서, 실제와 같게: 모든 캐릭터와 시도·까닭을 이름과 함께 보고, 다시 그리기는 원본을 OpenAI로 다시 보내며, 3D를 바깥으로 보내는 것은 본인 동의가 있을 때만', async () => {
  const { ADMIN_CARE_LINE } = await import('../../src/lib/avatar/admin-care.ts');
  assert.match(ADMIN_CARE_LINE, /모든 사진 캐릭터를 명단 이름과 이름표, 지금 입고 있는지와 함께 볼 수 있어요/);
  assert.match(ADMIN_CARE_LINE, /그리는 중이거나 그리지 못한 시도, 거절된 시도와 그 까닭도 보여요/);
  assert.match(ADMIN_CARE_LINE, /캐릭터나 3D를 지우거나 다시 만들어요/);
  assert.match(ADMIN_CARE_LINE, /그림을 다시 그릴 때는 원본 사진이 외부 AI 서비스\(OpenAI\)로 다시 보내져요/);
  assert.match(ADMIN_CARE_LINE, /다시 그리다 거절되면 그 캐릭터와 원본 사진이 지워지고, 그리지 못하면 원래 그림은 남지만 원본 사진은 지워져요/);
  assert.match(ADMIN_CARE_LINE, /3D를 바깥 서비스로 보내는 것은 내가 그 그림으로 바깥 서비스에 3D를 요청했거나, 내가 괜찮다고 했다고 집주인이 확인한 경우에만/);
  assert.match(ADMIN_CARE_LINE, /관리 화면에서는 원본 사진이 보이지 않아요/);
  assert.doesNotMatch(ADMIN_CARE_LINE, /집주인도 보지 않아요/, '집주인 보관함에 원본 사본이 남으므로(동의 글의 보관함 문장) 넓게 약속하지 않는다');
  assert.doesNotMatch(ADMIN_CARE_LINE, /[—–]/);
  assert.doesNotMatch(ADMIN_CARE_LINE, /그림을 지우면/, '동의 글은 「그림을 지우면」을 한 번만 쓴다');
  assert.match(src('app/privacy/page.tsx'), /<li>\{ADMIN_CARE_LINE\}<\/li>/);
  // 사진을 올리는 두 화면: 동의 글을 짧은 다섯 줄로 줄였다(2026-11-12 집주인 「깔끔하게」). 관리 안내 전체는 개인정보 화면에 두고,
  // 동의 글에는 한 줄(집주인의 보관과 관리)만. 그 줄은 동의 체크보다 위에 보인다
  const { consentPoints } = await import('../../src/lib/avatar/consent.ts');
  const owner = consentPoints('meshy').find((p) => p.head === '집주인');
  assert.match(owner?.text ?? '', /관리 화면에서 캐릭터를 지우거나 다시 만들 수 있어요/);
  for (const f of ['app/avatar/AvatarStudio.tsx', 'components/walk/CharacterPanel.tsx']) {
    const text = src(f);
    assert.doesNotMatch(text, /\{ADMIN_CARE_LINE\}/, `${f}: 긴 관리 안내는 개인정보 화면에만`);
    assert.ok(text.indexOf('consentPoints(provider, optOut)') >= 0 && text.indexOf('consentPoints(provider, optOut)') < text.indexOf('{CONSENT_TERMS}'),
      `${f}: 동의 글(관리 한 줄 포함)이 동의 체크보다 위`);
  }
});

test('들머리: 관리 화면 첫 페이지와 머리줄(집주인에게만)에 「캐릭터 관리」. 콘솔 화면은 집주인이 아니면 막는다', () => {
  assert.match(src('app/admin/page.tsx'), /href="\/admin\/characters">캐릭터 관리<\/Link>/);
  const chip = src('components/ViewerChip.tsx');
  assert.match(chip, /\{v\.role === 'admin' \? \(\s*<Link className="chip" href="\/admin\/characters"[^>]*>\s*캐릭터 관리/);
  const page = src('app/admin/characters/page.tsx');
  inOrder(page, ['<Suspense', 'getViewer()', "viewer.role !== 'admin'", '집주인만 들어올 수 있는 곳이에요', '<CharacterConsole']);
  // 확인은 그 자리에서(창 띄우기 없이), 한글 조합 중 Enter·Esc는 무시
  const ui = src('app/admin/characters/CharacterConsole.tsx');
  assert.doesNotMatch(ui, /window\.confirm|confirm\(/);
  assert.match(ui, /onKeyDown=\{\(e: KeyboardEvent<HTMLInputElement>\) => \{\s*if \(e\.nativeEvent\.isComposing \|\| e\.keyCode === 229\) return;/);
  assert.match(ui, /onCompositionEnd=/);
  // 3D 미리보기는 누를 때만 불러오고 한 번에 하나
  assert.match(ui, /const ModelPreview = lazy\(\(\) => import\('\.\/ModelPreview'\)\);/);
  assert.match(ui, /previewOpen=\{preview === r\.id\}/);
});

// ───────────────────────────── 2D 그림의 판(ETag, 0024)
const P = await import('../../src/lib/avatar/pic-version.ts');

test('2D 판 읽기: 경로는 그 그림의 그림 자리(방향 그림은 그 크기의 자리)와 꼭 같아야 한다. ETag와 If-None-Match', () => {
  const char = `${UID}/chars/${ID}.png`;
  assert.deepEqual(P.readPicShown({ path: char, ver: 1731400000000, prev: true }, ID, 'char'), { path: char, ver: 1731400000000 });
  for (const raw of [{ path: `${UID}/chars/${id(9)}.png`, ver: 5 }, { path: `${UID}/originals/${ID}.jpg`, ver: 5 }, { path: char, ver: 0 }, { path: char }, null, 'x']) {
    assert.equal(P.readPicShown(raw, ID, 'char'), null, JSON.stringify(raw));
  }
  const s = `${UID}/views/${ID}.v1s.webp`;
  assert.deepEqual(P.readPicShown({ path: s, ver: '7' }, ID, 'views', 's'), { path: s, ver: 7 });
  assert.equal(P.readPicShown({ path: s, ver: 7 }, ID, 'views', 'l'), null, '다른 크기의 자리');
  assert.equal(P.readPicShown({ path: char, ver: 7 }, ID, 'views', 's'), null);
  assert.deepEqual([P.picTag('char', 5), P.picTag('views', 5)], ['"c5"', '"v5"']);
  assert.equal(P.tagMatches('"c5"', '"c5"'), true);
  assert.equal(P.tagMatches('W/"c5", "c6"', '"c6"'), true);
  assert.equal(P.tagMatches('W/"c5"', '"c5"'), true);
  assert.equal(P.tagMatches('*', '"c5"'), true);
  assert.equal(P.tagMatches('"c4"', '"c5"'), false);
  assert.equal(P.tagMatches(null, '"c5"'), false);
  assert.equal(P.PIC_CACHE, 'private, max-age=60', '1분 뒤에는 서버에 다시 묻는다');
});

/** 보는 사람의 세션 흉내: 2D 판 함수, 기다리면 생기는지, 저장소 내려받기 */
function picClient(o: { shown?: { data?: unknown; error?: unknown }; state?: unknown; file?: Uint8Array | null } = {}) {
  const calls: string[] = [];
  return {
    calls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      if (name === 'avatar_char_shown' || name === 'avatar_views_shown') return { data: o.shown?.data ?? null, error: o.shown?.error ?? null };
      return { data: o.state ?? 'pending', error: null };
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          calls.push(`download:${bucket}:${path}`);
          return o.file ? { data: new Blob([o.file as Uint8Array<ArrayBuffer>]), error: null } : { data: null, error: { message: 'missing' } };
        },
      }),
    },
  };
}
const picReq = (path: string, tag: string | null = null) =>
  new Request(`https://site.test/api/avatar/${ID}${path}`, tag ? { headers: { 'If-None-Match': tag } } : {});

test('2D 그림 답(0024): 판 함수가 없으면 옛 길(null), 판이 같으면 304(내려받지 않음), 다르면 ETag와 1분 캐시, 없으면 404', async () => {
  const char = `${UID}/chars/${ID}.png`;
  // 옛 DB: 부르는 쪽이 판 없이 한 시간짜리 옛 길로
  assert.equal(await P.versionedPic(picClient({ shown: { error: { code: 'PGRST202' } } }), picReq(''), ID, 'avatars', 'char'), null);
  // 그 밖의 오류와 없는 그림: 0003과 같은 404(있는지조차 알리지 않는다)
  for (const c of [picClient({ shown: { error: { code: 'XX000' } } }), picClient({ shown: { data: null } })]) {
    const r = await P.versionedPic(c, picReq(''), ID, 'avatars', 'char');
    assert.deepEqual([r?.status, r?.headers.get('cache-control')], [404, 'no-store']);
  }
  // 처음 받기: ETag와 1분, 보는 사람의 세션으로 내려받는다
  const first = picClient({ shown: { data: { path: char, ver: 1731400000000, prev: false } }, file: new Uint8Array([1, 2, 3]) });
  const ok = await P.versionedPic(first, picReq(''), ID, 'avatars', 'char');
  assert.deepEqual([ok?.status, ok?.headers.get('etag'), ok?.headers.get('cache-control'), ok?.headers.get('content-type')],
    [200, '"c1731400000000"', 'private, max-age=60', 'image/png']);
  assert.deepEqual([...new Uint8Array(await ok!.arrayBuffer())], [1, 2, 3]);
  assert.ok(first.calls.includes(`download:avatars:${char}`));
  // 1분 뒤 다시 물으면: 판이 같으면 304(내려받지 않는다), 다시 그려 판이 바뀌었으면 새 그림
  const same = picClient({ shown: { data: { path: char, ver: 1731400000000 } }, file: new Uint8Array([9]) });
  const r304 = await P.versionedPic(same, picReq('', '"c1731400000000"'), ID, 'avatars', 'char');
  assert.deepEqual([r304?.status, r304?.headers.get('etag'), r304?.headers.get('cache-control')], [304, '"c1731400000000"', 'private, max-age=60']);
  assert.ok(!same.calls.some((x) => x.startsWith('download')));
  const redrawn = picClient({ shown: { data: { path: char, ver: 1731400099999 } }, file: new Uint8Array([4, 5]) });
  const fresh = await P.versionedPic(redrawn, picReq('', '"c1731400000000"'), ID, 'avatars', 'char');
  assert.deepEqual([fresh?.status, fresh?.headers.get('etag')], [200, '"c1731400099999"']);
  // 방향 그림: 크기를 넘기고, 없으면 기다리면 생기는지 머리로(0015처럼)
  const views = picClient({ shown: { data: null }, state: 'pending' });
  const vMissing = await P.versionedPic(views, picReq('/views?s=s'), ID, 'avatars', 'views', 's');
  assert.deepEqual([vMissing?.status, vMissing?.headers.get('x-avatar-asset')], [404, 'pending']);
  assert.ok(views.calls.includes(`avatar_views_shown:${JSON.stringify({ p_id: ID, p_size: 's' })}`));
  const vOk = await P.versionedPic(picClient({ shown: { data: { path: `${UID}/views/${ID}.v1s.webp`, ver: 3 } }, file: new Uint8Array([6]) }),
    picReq('/views?s=s'), ID, 'avatars', 'views', 's');
  assert.deepEqual([vOk?.status, vOk?.headers.get('etag'), vOk?.headers.get('content-type')], [200, '"v3"', 'image/webp']);
});

test('2D 라우트: 명단 손님 확인 → 판 붙은 길(0024) → 없으면 옛 길(판 없이 한 시간). 지우기의 캐시 비우기와 주소가 같다', () => {
  const single = src('app/api/avatar/[id]/route.ts');
  const get = single.slice(single.indexOf('export async function GET'), single.indexOf('export async function DELETE'));
  inOrder(get, ["canSee(viewer.role, 'guests')", 'createClient()', "versionedPic(supabase, request, id, AVATAR_BUCKET, 'char')",
    'if (versioned) return versioned', "rpc('avatar_char_path', { p_id: id })", "'Cache-Control': 'private, max-age=3600'"]);
  const views = src('app/api/avatar/[id]/views/route.ts');
  inOrder(views, ["canSee(viewer.role, 'guests')", 'createClient()', "versionedPic(supabase, request, id, AVATAR_BUCKET, 'views', size)",
    'if (versioned) return versioned', "rpc('avatar_views_path', { p_id: id, p_size: size })", "'Cache-Control': 'private, max-age=3600'"]);
  for (const r of [single, views]) assert.doesNotMatch(r, /createAvatarAdmin|SECRET_KEY/);
  // 주소를 바꾸지 않는다: 지운 그림을 그 기기에서 바로 버리는 길(같은 주소를 캐시를 건너뛰어 다시 받기)이 그대로 닿는다
  const drop = src('lib/avatar/forget-cache.ts');
  assert.match(drop, /`\/api\/avatar\/\$\{id\}`, \.\.\.VIEW_SIZES\.map\(\(s\) => `\/api\/avatar\/\$\{id\}\/views\?s=\$\{s\}`\)/);
  // DB: 다 그린 그림, 다시 그리는 동안의 옛 그림(명단 손님만)
  assert.match(SQL, /create or replace function public\.avatar_char_shown\(p_id uuid\)/);
  assert.match(SQL, /create policy avatars_guest_select_chars_prev on storage\.objects for select to authenticated/);
});

// ───────────────────────────── 휴대폰에서 쓰기
test('3D 보기: 무대 위 세로 밀기는 페이지 스크롤(pan-y), 좌우로 끌 때만 돌린다. 도는 동안만 매 프레임 그리고 멈추거나 화면 밖이면 쉰다', () => {
  const style = src('app/admin/characters/characters.module.css');
  assert.match(style, /\.stage \{[^}]*touch-action: pan-y;/);
  assert.doesNotMatch(style, /touch-action: none/);
  const view = src('app/admin/characters/ModelPreview.tsx');
  // 다음 프레임은 저절로 도는 중(모형이 있고 무대가 보일 때)에만 잇는다
  assert.match(view, /const turning = spin\.current && mesh !== null && visible;/);
  assert.match(view, /if \(turning\) raf = requestAnimationFrame\(draw\);/);
  assert.equal(view.match(/requestAnimationFrame\(draw\)/g)?.length, 2, '그 밖에는 kick(필요할 때 한 번)으로만 그린다');
  assert.match(view, /new IntersectionObserver\(/);
  assert.match(view, /new ResizeObserver\(resize\)/);
  // 끌거나 화살표를 누르거나 돌기를 바꾸면 한 프레임씩 그린다
  for (const [from, to] of [['const onMove =', 'const onUp ='], ['const onKey =', '<div className={css.preview}>']]) {
    assert.ok(view.slice(view.indexOf(from), view.indexOf(to)).includes('kick.current();'), from);
  }
  // 세로로 스크롤하려고 댄 손가락이 돌기를 멈추지 않게: 좌우로 조금 움직인 뒤에야 끌기
  assert.match(view, /if \(Math\.abs\(dx\) < DRAG_START_PX\) return;/);
});

test('초록 단추: 누른 뒤 hover가 남아도(휴대폰) 바탕이 초록 그대로라 글자가 보인다', () => {
  const g = src('app/globals.css');
  assert.match(g, /\.btn:hover \{ background: var\(--paper-3\); \}/);
  assert.match(g, /\.btn-pine:hover \{ filter: brightness\(1\.05\); background: var\(--pine\); \}/);
  assert.ok(g.indexOf('.btn-pine:hover') > g.indexOf('.btn:hover'), '같은 구체성이라 뒤에 와야 이긴다');
});

test('초점: 묻기를 닫거나 조작이 끝나면 그 조작 단추로, 카드가 사라지면 다음 카드나 알림 줄로, 3D 보기를 Esc로 닫으면 「3D 보기」로', () => {
  const ui = src('app/admin/characters/CharacterConsole.tsx');
  // 묻기를 닫으면 연 단추로
  assert.match(ui, /if \(!op && confirming\?\.id === r\.id\) setFocusTo\(\{ id: r\.id, op: confirming\.op \}\);/);
  // 조작이 끝나면 지금은 그 단추로, 다시 읽은 뒤에는 그 카드(없으면 그 자리의 다음 카드, 카드가 없으면 알림 줄)로
  const run = ui.slice(ui.indexOf('const run = async'), ui.indexOf('const chips ='));
  inOrder(run, ['setFocusTo({ id: row.id, op });', 'afterRun.current = { id: row.id, op, index: Math.max(0, index) };', 'refresh();']);
  // 지금 보기(2D 그림 · 3D 모형)에 남은 카드로 판정한다(3D를 지우면 3D 모형 보기에서 사라진다)
  inOrder(ui, ['const seen = viewRows(p.items, viewNow.current);', 'seen.some((x) => x.id === after.id)',
    'setFocusTo({ id: after.id, op: after.op })', 'seen[Math.min(after.index, seen.length - 1)].id', 'statusLine.current?.focus()']);
  inOrder(run, ['viewRows(page?.items ?? [], view).findIndex((x) => x.id === row.id)', 'setFocusTo({ id: row.id, op });']);
  assert.match(ui, /<p ref=\{statusLine\} tabIndex=\{-1\} className=\{css\.status\} role="status"/);
  // 카드: 그 조작 단추(data-op), 없으면 첫 단추, 단추가 없으면 카드
  assert.match(ui, /button\[data-op="\$\{focus\.op\}"\]:not\(\[disabled\]\)/);
  assert.match(ui, /\(byOp \?\? first \?\? card\.current\)\?\.focus\(\);/);
  assert.match(ui, /data-op=\{op\}/);
  // 3D 보기를 Esc로 닫으면 「3D 보기」 단추로(닫히는 무대에 있던 초점이 떨어지지 않게 먼저 옮긴다)
  inOrder(ui, ['previewButton.current?.focus();', 'onPreview(false);']);
});
