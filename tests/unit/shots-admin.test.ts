// 걷기 사진 지우기(0022)의 사이트 쪽 약속(src/lib/shots-admin-rules.ts): 장수 줄·행사 합계·남은 정리 읽기, 잘렸을 때의 말,
// 묻는 말과 결과 말, 오류 갈래, 비밀 키로 지워도 되는 경로 모양(DB의 shots_path_ok와 같다), 저장소 정리(버릴 목록 비우기와
// 폴더 훑기)의 순서와 멈추는 법. 판정 자체(집주인만, 누구의 사진인지, 집주인도 경로를 못 읽음)는 tests/sql/rls.test.mjs의 0022
// 묶음이, 지우기 동작(집주인·비밀 키를 확인한 뒤에만 DB를 부르는지)은 tests/unit/shots-admin-action.test.ts가 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import type { CleanOps, Clock, FolderRead, ShotCount } from '../../src/lib/shots-admin-rules.ts';

// 화면 코드는 @/ 로 가져온다: 시험에서는 src/ 아래 .ts로 찾게 한다
const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (!spec.startsWith('@/')) return next(spec, ctx);
    const url = new URL(spec.slice(2), SRC).href;
    return next(/\.[cm]?[jt]sx?$/.test(url) ? url : `${url}.ts`, ctx);
  },
});

const R = await import('../../src/lib/shots-admin-rules.ts');
const { ORPHAN_MIN_AGE_MS } = await import('../../src/lib/shots-orphans.ts');

const SQL = readFileSync(new URL('../../supabase/migrations/0022_shots_admin_delete.sql', import.meta.url), 'utf8');
const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const DASH = /[—–]/;

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EV1 = '11111111-1111-4111-8111-111111111111';
const EV2 = '22222222-2222-4222-8222-222222222222';
const row = (o: Record<string, unknown>) => ({
  user_id: U(1), name: '손님', role: 'guest', removed: false, event_code_id: null, event_label: null, shots: 1, ...o,
});
const done = (o: Partial<{ removed: number; left: boolean; failed: boolean }> = {}) => ({ removed: 0, left: false, failed: false, ...o });

test('장수 줄 읽기: 모양이 틀린 줄과 장수 없는 줄은 빼고, 이름·행사 이름표는 다듬는다', () => {
  const rows = R.asShotCounts([
    row({ user_id: U(1), name: '  첫 손님 ', event_code_id: EV1, event_label: ' 행사 하나 ', shots: 3 }),
    row({ user_id: U(2), name: null, role: null, shots: '2' }),
    row({ user_id: U(3), role: 'family', removed: true, event_code_id: 'not-a-uuid', event_label: '버려짐' }),
    row({ user_id: 'bad', shots: 5 }),
    row({ user_id: U(4), shots: 0 }),
    row({ user_id: U(5), role: 'owner' }),
    null,
    'x',
  ]);
  const want: ShotCount[] = [
    { user: U(1), name: '첫 손님', role: 'guest', removed: false, eventId: EV1, eventLabel: '행사 하나', shots: 3 },
    { user: U(2), name: null, role: null, removed: false, eventId: null, eventLabel: null, shots: 2 },
    { user: U(3), name: '손님', role: 'family', removed: true, eventId: null, eventLabel: null, shots: 1 },
    { user: U(5), name: '손님', role: null, removed: false, eventId: null, eventLabel: null, shots: 1 },
  ];
  assert.deepEqual(rows, want);
  assert.deepEqual(R.asShotCounts(null), []);
  assert.deepEqual(R.asShotCounts({ user_id: U(1) }), []);
});

test('행사 합계 읽기: DB가 센 그대로(사람 줄을 더하지 않는다). 모양이 틀린 줄과 사진이 없는 줄은 뺀다', () => {
  assert.deepEqual(R.asShotEvents([
    { id: EV2, label: ' 행사 둘 ', people: 520, shots: '520' },
    { id: EV1, label: '', people: 2, shots: 4 },
    { id: 'bad', label: 'x', people: 1, shots: 1 },
    { id: U(9), label: 'x', people: 0, shots: 0 },
    null,
  ]), [
    { id: EV2, label: '행사 둘', people: 520, shots: 520 },
    { id: EV1, label: '행사', people: 2, shots: 4 },
  ]);
  assert.deepEqual(R.asShotEvents({ id: EV1 }), []);
  // 화면이 잘린 사람 줄로 행사 합계를 만들지 않는다(예전 groupByEvent는 없다)
  assert.equal('groupByEvent' in R, false);
});

test('모두의 수와 남은 정리 읽기: 0 이상의 정수만, 미룬 폴더는 남은 폴더를 넘지 않는다', () => {
  assert.deepEqual(R.asShotTotals({ people: 521, shots: '522', files: 3, folders: 2, waiting: 1 }),
    { people: 521, shots: 522, files: 3, folders: 2, waiting: 1 });
  assert.deepEqual(R.asShotTotals({ people: -1, shots: 'x', files: null, folders: 1, waiting: 9 }),
    { people: 0, shots: 0, files: 0, folders: 1, waiting: 1 });
  for (const bad of [null, [], 'x', 3]) {
    assert.deepEqual(R.asShotTotals(bad), { people: 0, shots: 0, files: 0, folders: 0, waiting: 0 }, String(bad));
  }
});

test('사람 줄이 500줄에서 잘리면 알린다(모두 몇 명인지, 행사마다 지우기는 보이지 않는 분까지)', () => {
  assert.equal(R.PEOPLE_SHOWN, 500);
  assert.match(SQL, /order by count\(\*\) desc, r\.display_name nulls last, s\.user_id\s+limit 500;/, 'DB의 사람 줄 수와 같다');
  assert.equal(R.peopleNote(500, 500), '');
  assert.equal(R.peopleNote(3, 3), '');
  assert.equal(R.peopleNote(500, 521),
    '사진이 많은 순으로 500명만 보여요(모두 521명). 몇 분을 지우고 나면 다음 분들이 보여요. 행사마다 지우기는 여기 보이지 않는 분까지 지워요.');
  assert.doesNotMatch(R.peopleNote(500, 501), DASH);
});

test('묻는 말: 누구의 몇 장인지, 되돌릴 수 없다고(엠대시 없이)', () => {
  assert.equal(R.personName({ name: null }), '명단에 없는 분');
  assert.equal(R.personName({ name: '손님하나' }), '손님하나');
  assert.equal(R.forgetPersonAsk({ name: '손님하나', shots: 12 }), '「손님하나」 님의 사진 12장을 모두 지울까요? 되돌릴 수 없어요.');
  assert.equal(R.forgetPersonAsk({ name: null, shots: 3 }), '명단에 없는 분의 사진 3장을 모두 지울까요? 되돌릴 수 없어요.');
  assert.equal(R.forgetEventAsk({ label: '11월 12일 발표', people: 520, shots: 530 }),
    '「11월 12일 발표」 코드로 들어온 손님 520명의 사진 530장을 모두 지울까요? 되돌릴 수 없어요.');
  assert.match(R.forgetEventAsk({ label: '봄 모임', people: 1, shots: 1 }), /「봄 모임」 코드로/, '받침이 있는 이름표도 조사가 맞다');
  for (const t of [R.forgetPersonAsk({ name: 'a', shots: 1 }), R.forgetEventAsk({ label: 'a', people: 1, shots: 1 }),
    R.SHOTS_NOT_READY, R.SHOTS_KEY_BROKEN]) {
    assert.doesNotMatch(t, DASH, t);
  }
});

test('지운 결과: 함수의 답을 읽고, 저장소 정리가 덜 끝났으면 까닭(시간, 저장소에 닿지 않음)과 할 일을 붙인다', () => {
  assert.deepEqual(R.readForget('user', 5), { found: true, people: 1, shots: 5 });
  assert.deepEqual(R.readForget('user', 0), { found: true, people: 0, shots: 0 });
  assert.deepEqual(R.readForget('user', null), { found: true, people: 0, shots: 0 });
  assert.deepEqual(R.readForget('event', { found: true, people: 3, shots: 11 }), { found: true, people: 3, shots: 11 });
  assert.deepEqual(R.readForget('event', { found: false, people: 0, shots: 0 }), { found: false, people: 0, shots: 0 });
  assert.deepEqual(R.readForget('event', 'x'), { found: false, people: 0, shots: 0 });

  const five = R.readForget('user', 5);
  assert.equal(R.forgetDoneText('user', five, done({ removed: 5 })), '사진 5장을 지웠어요.');
  assert.equal(R.forgetDoneText('event', R.readForget('event', { found: true, people: 3, shots: 11 }), done()), '손님 3명의 사진 11장을 지웠어요.');
  assert.equal(R.forgetDoneText('user', five, done({ left: true })),
    '사진 5장을 지웠어요. 저장소의 파일은 이어서 지우고 있어요. 남은 수는 이 칸에 보여요.');
  assert.equal(R.forgetDoneText('user', five, done({ left: true, failed: true })),
    '사진 5장을 지웠어요. 저장소에 닿지 않아 파일을 다 지우지 못했어요. 잠시 뒤 「지금 마저 지우기」를 눌러 주세요.');
  assert.equal(R.forgetDoneText('user', R.readForget('user', 0), done()), '지울 사진이 없었어요. 이미 지워졌을 수 있어요.');
  assert.equal(R.forgetDoneText('event', R.readForget('event', { found: false }), done({ left: true })), '그 행사 초대 코드를 찾지 못했어요.');

  assert.equal(R.cleanDoneText(done({ removed: 7 })), '저장소에서 파일 7개를 지웠어요.');
  assert.equal(R.cleanDoneText(done()), '지금 지울 파일이 없어요.');
  assert.equal(R.cleanDoneText(done({ removed: 7, left: true })), '저장소에서 파일 7개를 지웠어요. 남은 것은 이어서 지우고 있어요.');
  assert.equal(R.cleanDoneText(done({ left: true, failed: true })), '저장소에 닿지 않아 다 지우지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  for (const t of [R.forgetDoneText('user', five, done({ left: true })), R.cleanDoneText(done({ removed: 2, left: true, failed: true }))]) {
    assert.doesNotMatch(t, DASH, t);
  }
});

test('남은 정리: 지울 파일과 살펴볼 사람 수, 미룬 폴더, 지금 지울 수 있을 때만 「이어서 지워요」', () => {
  assert.equal(R.pendingText({ files: 0, folders: 0, waiting: 0 }, true), '');
  assert.equal(R.pendingText({ files: 12, folders: 0, waiting: 0 }, true), '저장소 정리가 남았어요: 지울 파일 12개. 이 화면을 열 때마다 이어서 지워요.');
  assert.equal(R.pendingText({ files: 3, folders: 2, waiting: 1 }, true),
    '저장소 정리가 남았어요: 지울 파일 3개, 남은 파일이 있는지 살펴볼 사람 2명. 그 가운데 1명은 막 올라가던 파일이 있어 10분 뒤에 다시 살펴봐요. 이 화면을 열 때마다 이어서 지워요.');
  assert.equal(R.pendingText({ files: 3, folders: 0, waiting: 0 }, false), '저장소 정리가 남았어요: 지울 파일 3개.', '키가 듣지 않으면 이어서 지운다고 하지 않는다');
  assert.doesNotMatch(R.pendingText({ files: 1, folders: 1, waiting: 1 }, true), DASH);
});

test('오류 갈래: 0022 전(함수 없음), 집주인 아님(42501), 그 밖(끊김·시간 넘김)은 서로 다른 말', async () => {
  const { missingFunction } = await import('../../src/lib/event-code.ts');
  const missing = [{ code: 'PGRST202' }, { code: '42883' }];
  for (const e of missing) assert.equal(missingFunction(e), true, '같은 판정을 쓴다');
  for (const e of missing) {
    assert.match(R.panelTrouble(e), /0022 마이그레이션/);
    assert.match(R.forgetTrouble(e), /0022 마이그레이션/);
  }
  assert.equal(R.panelTrouble({ code: '42501' }), '집주인만 볼 수 있는 칸이에요.');
  assert.equal(R.forgetTrouble({ code: '42501' }), '집주인만 지울 수 있어요.');
  for (const e of [{ code: '57014' }, { code: 'PGRST301' }, {}, null, undefined]) {
    assert.equal(R.panelTrouble(e), '걷기 사진 칸을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.', JSON.stringify(e));
    assert.equal(R.forgetTrouble(e), '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.', JSON.stringify(e));
  }
  const panel = src('app/admin/ShotsPanel.tsx');
  assert.match(panel, /panelTrouble\(error\)/, '칸은 오류마다 다른 말을 보인다');
  assert.doesNotMatch(panel, /DB에 걷기 사진 지우기\(0022 마이그레이션\)가 들어가면/, '마이그레이션 문구를 모든 오류에 쓰지 않는다');
});

test('비밀 키로 지워도 되는 경로: 사이트가 만드는 모양(내 폴더 바로 아래 .jpg)만. 0022의 shots_path_ok와 같은 모양', () => {
  const uid = U(7);
  // src/lib/shots.ts uploadShot이 만드는 이름 그대로
  const made = `${uid}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  assert.equal(R.isShotPath(made), true, made);
  assert.match(src('lib/shots.ts'), /const path = `\$\{uid\}\/\$\{Date\.now\(\)\.toString\(36\)\}-\$\{crypto\.randomUUID\(\)\.slice\(0, 8\)\}\.jpg`;/,
    '올리는 이름 모양이 바뀌면 SHOT_PATH와 0022의 shots_path_ok도 함께 바꾼다');
  for (const bad of [
    `${uid}/../${U(8)}/x.jpg`, // 남의 폴더로 넘어간다
    `${uid}/sub/x.jpg`, // 하위 폴더
    `${uid}/x.png`,
    `${uid}/.jpg`,
    `${uid}/${'a'.repeat(121)}.jpg`,
    'ABCDEF01-2345-4678-89AB-CDEF01234567/x.jpg', // 계정 id는 소문자로만 온다
    `x.jpg`,
    `/${uid}/x.jpg`,
    '',
    null,
    42,
  ]) {
    assert.equal(R.isShotPath(bad), false, String(bad));
  }
  assert.ok(SQL.includes(`/[A-Za-z0-9_-]{1,120}\\.jpg$`), 'DB 쪽 모양');
  assert.ok(R.SHOT_PATH.source.endsWith(`\\/[A-Za-z0-9_-]{1,120}\\.jpg$`), '사이트 쪽 모양');
});

const NOW = Date.parse('2026-11-12T03:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
/** 저장소가 나열한 한 줄(파일). 폴더는 id와 올린 때가 없다 */
const file = (name: string, min: number) => ({ id: `id-${name}`, name, created_at: ago(min) });

test('폴더 나누기: 사이트 모양 파일만, 10분 넘은 것과 막 올라온 것으로. 하위 폴더·다른 모양·올린 때 모름은 건드리지 않는다', () => {
  const uid = U(5);
  assert.equal(R.SWEEP_MIN_AGE_MS, ORPHAN_MIN_AGE_MS, '갤러리의 남은 파일 치우기와 같은 여유');
  assert.match(SQL, /not_before = now\(\) \+ interval '10 minutes'/, 'DB가 미루는 시간도 같다');
  const entries = [
    file('a1-0a1b2c3d.jpg', 30),
    file('a2-0a1b2c3d.jpg', 10),
    file('b1-0a1b2c3d.jpg', 9),
    file('b2-0a1b2c3d.jpg', 0),
    { id: null, name: 'sub', created_at: null }, // 하위 폴더
    { id: null, name: 'c-0a1b2c3d.jpg', created_at: null }, // 이름만 그런 폴더
    file('y.png', 60),
    { id: 'id-d', name: 'd-0a1b2c3d.jpg' }, // 올린 때 모름
    file('e f.jpg', 60), // 사이트가 만들지 않는 이름
    null,
    'x',
  ];
  assert.deepEqual(R.splitFolder(uid, entries, NOW), {
    old: [`${uid}/a1-0a1b2c3d.jpg`, `${uid}/a2-0a1b2c3d.jpg`],
    young: [`${uid}/b1-0a1b2c3d.jpg`, `${uid}/b2-0a1b2c3d.jpg`],
  });
  assert.deepEqual(R.splitFolder('../x', entries, NOW), { old: [], young: [] }, '폴더 이름이 계정 id 모양이 아니면 아무것도 고르지 않는다');
});

test('폴더 읽기: 쪽마다 이어 읽고(이름순), 끝까지 못 읽으면 partial, 읽지 못하면 null', async () => {
  const uid = U(6);
  const many = (n: number) => Array.from({ length: n }, (_, i) => file(`f${String(i).padStart(4, '0')}-0a1b2c3d.jpg`, 60));
  const calls: string[] = [];
  const pageOf = (all: unknown[]) => async (u: string, offset: number, limit: number) => {
    calls.push(`${u === uid ? 'me' : u}:${offset}:${limit}`);
    return all.slice(offset, offset + limit);
  };
  const r = await R.readFolder(pageOf(many(237)), uid, NOW);
  assert.ok(r);
  assert.equal(r.old.length, 237);
  assert.equal(r.partial, false);
  assert.deepEqual(calls, ['me:0:100', 'me:100:100', 'me:200:100']);
  // 꽉 찬 쪽이 정한 수만큼 이어지면 다 읽지 못한 것으로(DB가 그 폴더를 10분 뒤에 다시 훑는다)
  const full = await R.readFolder(pageOf(many(R.FOLDER_PAGE * R.FOLDER_PAGES + 5)), uid, NOW);
  assert.equal(full?.partial, true);
  assert.equal(full?.old.length, R.FOLDER_PAGE * R.FOLDER_PAGES);
  assert.equal(await R.readFolder(async () => null, uid, NOW), null);
  assert.equal(await R.readFolder(async () => {
    throw new Error('network');
  }, uid, NOW), null);
});

type World = {
  ops: CleanOps;
  log: string[];
  trash: string[];
  queue: string[];
  files: Map<string, Record<string, unknown>[]>;
};

/**
 * 가짜 서버 연결과 저장소·DB. trash: 버릴 목록, folders: 훑을 차례의 폴더와 그 안의 파일들, rows: 표에 줄이 있는 경로.
 * swept는 DB(0022 shots_sweep_done)처럼 표 줄 없는 old만 버릴 목록에 올리고, 표 줄 없는 young이 있거나 partial이면 미룬다.
 * fail: 그 연결이 실패로 답한다. throws: 그 연결이 던진다
 */
function world(o: {
  trash?: string[];
  folders?: Record<string, Record<string, unknown>[]>;
  rows?: string[];
  fail?: (keyof CleanOps)[];
  throws?: (keyof CleanOps)[];
} = {}): World {
  const trash = [...(o.trash ?? [])];
  const queue = Object.keys(o.folders ?? {});
  const files = new Map(Object.entries(o.folders ?? {}).map(([k, v]) => [k, [...v]]));
  const rows = new Set(o.rows ?? []);
  const log: string[] = [];
  const bad = (k: keyof CleanOps) => {
    if (o.throws?.includes(k)) throw new Error(k);
    return o.fail?.includes(k) ?? false;
  };
  const ops: CleanOps = {
    list: async (limit) => {
      log.push(`list:${limit}`);
      return bad('list') ? null : trash.slice(0, limit);
    },
    remove: async (paths) => {
      log.push(`remove:${paths.length}`);
      if (bad('remove')) return false;
      for (const [uid, list] of files) files.set(uid, list.filter((f) => !paths.includes(`${uid}/${String(f.name)}`)));
      return true;
    },
    done: async (paths) => {
      log.push(`done:${paths.length}`);
      if (bad('done')) return false;
      for (const p of paths) if (trash.includes(p)) trash.splice(trash.indexOf(p), 1);
      return true;
    },
    folders: async (limit) => {
      log.push(`folders:${limit}`);
      return bad('folders') ? null : queue.slice(0, limit);
    },
    page: async (uid, offset, limit) => {
      log.push(`page:${uid.slice(-2)}:${offset}`);
      return bad('page') ? null : (files.get(uid) ?? []).slice(offset, offset + limit);
    },
    swept: async (uid, read: FolderRead) => {
      log.push(`swept:${uid.slice(-2)}:${read.old.length}/${read.young.length}`);
      if (bad('swept')) return false;
      for (const p of read.old) if (!rows.has(p) && R.isShotPath(p) && p.startsWith(`${uid}/`) && !trash.includes(p)) trash.push(p);
      queue.splice(queue.indexOf(uid), 1); // 미뤄도 이번 차례에서는 빠진다(차례가 아직 아니다)
      return true;
    },
  };
  return { ops, log, trash, queue, files };
}
const forever: Clock = { now: () => NOW, until: Infinity };
const trashOf = (n: number, uid = U(9)) => Array.from({ length: n }, (_, i) => `${uid}/t${i}-0a1b2c3d.jpg`);

test('정리: 버릴 목록 → 폴더 훑기 → 버릴 목록. 알고 있는 파일을 먼저 지우고, 폴더에서 찾은 남은 파일을 이어서 지운다', async () => {
  const a = U(21);
  const b = U(22);
  const w = world({
    trash: trashOf(3, a).map((p) => p.replace('/t', '/m')),
    folders: {
      [a]: [file('m0-0a1b2c3d.jpg', 30), file('o0-0a1b2c3d.jpg', 30), file('n0-0a1b2c3d.jpg', 30), file('y.png', 30)],
      [b]: [file('o1-0a1b2c3d.jpg', 60), file('o2-0a1b2c3d.jpg', 1)],
    },
    rows: [`${a}/n0-0a1b2c3d.jpg`],
  });
  const r = await R.cleanStorage(w.ops, forever);
  assert.deepEqual(r, { removed: 5, left: false, failed: false });
  assert.deepEqual(w.log, [
    `list:${R.TRASH_LIMIT}`, 'remove:3', 'done:3',
    `folders:${R.SWEEP_BATCH}`, 'page:21:0', 'page:22:0', 'swept:21:2/0', 'swept:22:1/1',
    `list:${R.TRASH_LIMIT}`, 'remove:2', 'done:2',
  ]);
  assert.deepEqual(w.files.get(a)?.map((f) => f.name), ['n0-0a1b2c3d.jpg', 'y.png'], '표 줄이 있는 사진과 다른 모양은 남는다');
  assert.deepEqual(w.files.get(b)?.map((f) => f.name), ['o2-0a1b2c3d.jpg'], '막 올라온 파일은 남는다');
  assert.deepEqual(w.trash, []);

  // 할 일이 없으면 묻기만 하고 끝난다
  const idle = world();
  assert.deepEqual(await R.cleanStorage(idle.ops, forever), { removed: 0, left: false, failed: false });
  assert.deepEqual(idle.log, [`list:${R.TRASH_LIMIT}`, `folders:${R.SWEEP_BATCH}`, `list:${R.TRASH_LIMIT}`]);
});

test('정리: 버릴 목록이 한 번에 다 안 읽히면 이어 읽는다. 모양이 틀린 경로는 저장소에 보내지 않고 목록에서만 뺀다', async () => {
  const w = world({ trash: trashOf(R.TRASH_LIMIT + 30) });
  assert.deepEqual(await R.drainTrash(w.ops, forever), { removed: R.TRASH_LIMIT + 30, left: false, failed: false });
  assert.deepEqual(w.log, [`list:${R.TRASH_LIMIT}`, `remove:${R.TRASH_LIMIT}`, `done:${R.TRASH_LIMIT}`, `list:${R.TRASH_LIMIT}`, 'remove:30', 'done:30']);

  const sent: string[] = [];
  const mixed = world({ trash: [...trashOf(1), `${U(9)}/../${U(8)}/x.jpg`, `${U(9)}/a/b.jpg`] });
  const remove = mixed.ops.remove;
  mixed.ops.remove = async (paths) => {
    sent.push(...paths);
    return remove(paths);
  };
  assert.deepEqual(await R.drainTrash(mixed.ops, forever), { removed: 1, left: false, failed: false });
  assert.deepEqual(sent, trashOf(1), '저장소에는 맞는 모양만');
  assert.deepEqual(mixed.log, [`list:${R.TRASH_LIMIT}`, 'remove:1', 'done:3']);
});

test('정리: 저장소나 DB에 닿지 못하면 그 자리에서 멈춘다(failed). 지우지 못한 경로는 목록에서 빼지 않고, 못 훑은 폴더는 차례에 남는다', async () => {
  const removeFails = world({ trash: trashOf(2) });
  removeFails.ops.remove = async () => false;
  assert.deepEqual(await R.cleanStorage(removeFails.ops, forever), { removed: 0, left: true, failed: true });
  assert.equal(removeFails.trash.length, 2, '목록에서 빼지 않는다');
  assert.equal(removeFails.log.some((l) => l.startsWith('folders')), false, '저장소가 안 되면 폴더도 훑지 않는다');

  const broken = (k: keyof CleanOps, how: 'fail' | 'throws') => (how === 'fail' ? { fail: [k] } : { throws: [k] });
  for (const k of ['list', 'done'] as const) {
    for (const how of ['fail', 'throws'] as const) {
      const w = world({ trash: trashOf(2), ...broken(k, how) });
      assert.deepEqual(await R.cleanStorage(w.ops, forever), { removed: 0, left: true, failed: true }, `${k} ${how}`);
    }
  }
  const a = U(31);
  for (const k of ['folders', 'page', 'swept'] as const) {
    for (const how of ['fail', 'throws'] as const) {
      const w = world({ folders: { [a]: [file('o0-0a1b2c3d.jpg', 60)] }, ...broken(k, how) });
      const r = await R.cleanStorage(w.ops, forever);
      assert.deepEqual(r, { removed: 0, left: true, failed: true }, `${k} ${how}`);
      assert.deepEqual(w.queue, [a], `${k} ${how}: 폴더는 차례에 남는다`);
      assert.equal(w.files.get(a)?.length, 1);
    }
  }
});

test('정리: 정한 시간을 다 쓰면 멈추고 남았다고 알린다(failed 아님). 폴더는 한 번에 넷까지 함께 훑는다', async () => {
  let t = 0;
  const ticking: Clock = { now: () => (t += 1), until: 4 };
  const w = world({ trash: trashOf(R.TRASH_LIMIT * 5) });
  const r = await R.cleanStorage(w.ops, ticking);
  assert.equal(r.left, true);
  assert.equal(r.failed, false);
  assert.ok(r.removed > 0 && r.removed < R.TRASH_LIMIT * 5, String(r.removed));

  const folders = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [U(40 + i), [file('o0-0a1b2c3d.jpg', 60)]]));
  const par = world({ folders });
  let open = 0;
  let most = 0;
  const page = par.ops.page;
  par.ops.page = async (...a) => {
    open += 1;
    most = Math.max(most, open);
    await new Promise((res) => setTimeout(res, 2));
    open -= 1;
    return page(...a);
  };
  assert.deepEqual(await R.cleanStorage(par.ops, forever), { removed: 10, left: false, failed: false });
  assert.equal(most, R.SWEEP_PARALLEL);
  assert.deepEqual(par.queue, []);
});

test('관리 화면: 집주인만, 장수와 합계만 받고(경로를 다루지 않는다), 비밀 키 코드는 서버에만, 따로 기다리고 그리는 동안 지우지 않는다', () => {
  const page = src('app/admin/page.tsx');
  assert.match(page, /<Suspense fallback=\{[^\n]*\}>\s*<ShotsPanel \/>\s*<\/Suspense>/, '걷기 사진 칸은 자기 Suspense로 기다린다');
  const panel = src('app/admin/ShotsPanel.tsx');
  const list = src('app/admin/ShotsForget.tsx');
  for (const fn of ['admin_shot_counts', 'admin_shot_events', 'admin_shot_totals']) assert.match(panel, new RegExp(`rpc\\('${fn}'\\)`));
  for (const f of [panel, list]) {
    assert.doesNotMatch(f, /\.path\b|['"]path['"]|place|created_at/, '사진의 경로·장소·때를 다루지 않는다');
  }
  assert.doesNotMatch(panel, /await cleanShotsStorage/, '그리는 동안 저장소를 정리하지 않는다');
  assert.match(panel, /after\(\(\) => cleanShotsStorage\(CLEAN_AFTER_MS\)\)/, '남은 정리는 화면을 보낸 뒤에');
  assert.match(list, /window\.confirm\(ask\)/, '지우기는 누를 때마다 묻는다');
  assert.match(list, /이 행사로 들어온 손님 사진 모두 지우기/);
  assert.match(list, /사진 모두 지우기/);
  assert.match(list, /name="kind" value="clean"/, '「지금 마저 지우기」');
  assert.match(list, /peopleNote\(people\.length, total\)/, '잘린 사람 줄을 알린다');
  // 비밀 키를 쓰는 곳은 서버 전용이다
  const server = src('lib/shots-admin.ts');
  assert.match(server, /^import 'server-only';/);
  assert.match(server, /SUPABASE_SECRET_KEY/);
  assert.match(server, /storage\.getBucket\(SHOTS_BUCKET\)/, '키가 실제로 듣는지 본다');
  assert.match(server, /bucket\.list\(uid,/, '사람 폴더를 비밀 키로 나열한다');
});
