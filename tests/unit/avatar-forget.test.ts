// 캐릭터 지우기의 순서와 지울 파일(src/lib/avatar/forget.ts)을 가짜 연결로 본다.
// 가장 중요한 것: 그림을 지우면 그 그림에서 나온 파생 파일(방향 그림 묶음 두 파일과 3D 모형)도 저장소에서 함께 지워진다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';

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

const { derivedFiles, forgetAvatar, forgetFiles } = await import('../../src/lib/avatar/forget.ts');
type Part = 'original' | 'character' | 'both';

const UID = '00000000-0000-4000-8000-0000000000a1';
const ID = '0b9d2c1e-5a4f-4e3b-9c7d-1f2a3b4c5d6e';
const ORIGINAL = `${UID}/originals/${ID}.jpg`;
const CHAR = `${UID}/chars/${ID}.png`;
const MODEL = `${UID}/models/${ID}.v1.glb`;
/** 그림에서 나온 파생 파일: 방향 그림 묶음 두 크기와 3D 모형 */
const VIEWS = [`${UID}/views/${ID}.v1l.webp`, `${UID}/views/${ID}.v1s.webp`, MODEL];
const ready = { id: ID, user_id: UID, status: 'ready', original_path: ORIGINAL, image_path: CHAR };

test('파생 파일: 방향 그림 묶음 두 크기와 3D 모형(사이트·일꾼·DB의 경로 모양과 같다)', () => {
  assert.deepEqual(derivedFiles(ready), VIEWS);
  assert.deepEqual(derivedFiles({ id: ID, user_id: '../x' }), []);
});

test('그림 지우기: 그림 한 장과 파생 파일(묶음 두 파일, 3D 모형)을 함께 지운다. 원본은 둔다', () => {
  assert.deepEqual(forgetFiles(ready, 'character'), { before: [CHAR, ...VIEWS], after: VIEWS });
  // 원본을 먼저 지운 그림도 같다
  assert.deepEqual(forgetFiles({ ...ready, original_path: null }, 'character'), { before: [CHAR, ...VIEWS], after: VIEWS });
});

test('원본만 지우기: 그림과 묶음·모형은 건드리지 않는다', () => {
  assert.deepEqual(forgetFiles(ready, 'original'), { before: [ORIGINAL], after: [] });
  assert.deepEqual(forgetFiles({ ...ready, original_path: null }, 'original'), { before: [], after: [] });
});

test('그림과 원본 함께 지우기: 원본, 그림, 묶음, 모형 모두', () => {
  assert.deepEqual(forgetFiles(ready, 'both'), { before: [ORIGINAL, CHAR, ...VIEWS], after: VIEWS });
});

test('아직 그리는 중이면 무엇을 지우든 원본도 지운다(DB가 작업째 거두며 원본 경로를 비운다)', () => {
  for (const status of ['pending', 'queued', 'drawing']) {
    const row = { ...ready, status, image_path: null };
    assert.deepEqual(forgetFiles(row, 'character'), { before: [ORIGINAL, ...VIEWS], after: VIEWS }, status);
    assert.deepEqual(forgetFiles(row, 'original'), { before: [ORIGINAL], after: [] }, status);
    assert.deepEqual(forgetFiles(row, 'both'), { before: [ORIGINAL, ...VIEWS], after: VIEWS }, status);
  }
});

test('그림이 이미 없는 줄에서도 묶음·모형 경로는 지운다(전에 남은 것이 있었다면 치워진다)', () => {
  const gone = { ...ready, status: 'deleted', image_path: null };
  assert.deepEqual(forgetFiles(gone, 'character'), { before: VIEWS, after: VIEWS });
  assert.deepEqual(forgetFiles(gone, 'both'), { before: [ORIGINAL, ...VIEWS], after: VIEWS });
});

test('줄의 id 모양이 이상하면 묶음·모형 경로를 지어내지 않는다', () => {
  for (const odd of [{ user_id: '../x' }, { id: `${ID}/..` }, { user_id: '' }, { id: 'status' }]) {
    assert.deepEqual(forgetFiles({ ...ready, ...odd }, 'character'), { before: [CHAR], after: [] }, JSON.stringify(odd));
  }
});

type Call = ['remove', string, string[]] | ['rpc', string, unknown];
/** 저장소 지우기와 DB 함수 호출을 순서대로 적는 가짜 연결. removes는 지우기마다의 답(없으면 성공) */
function fake(opts: { removes?: Array<{ error: unknown } | Error>; rpc?: { data: unknown; error: unknown } } = {}) {
  const calls: Call[] = [];
  const removes = [...(opts.removes ?? [])];
  return {
    calls,
    rpc: async (fn: string, args: unknown) => {
      calls.push(['rpc', fn, args]);
      return opts.rpc ?? { data: true, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.push(['remove', bucket, paths]);
          const answer = removes.shift() ?? { error: null };
          if (answer instanceof Error) throw answer;
          return answer;
        },
      }),
    },
  };
}

test('지우기 순서: 파일 먼저 → DB에 적기 → 묶음·모형 한 번 더(그사이 일꾼이 막 올렸을 수 있다)', async () => {
  const c = fake();
  assert.equal(await forgetAvatar(c, 'avatars', ready, 'character'), 'done');
  assert.deepEqual(c.calls, [
    ['remove', 'avatars', [CHAR, ...VIEWS]],
    ['rpc', 'avatar_forget', { p_id: ID, p_part: 'character' }],
    ['remove', 'avatars', VIEWS],
  ]);
  const both = fake();
  assert.equal(await forgetAvatar(both, 'avatars', ready, 'both'), 'done');
  assert.deepEqual(both.calls, [
    ['remove', 'avatars', [ORIGINAL, CHAR, ...VIEWS]],
    ['rpc', 'avatar_forget', { p_id: ID, p_part: 'both' }],
    ['remove', 'avatars', VIEWS],
  ]);
});

test('원본만 지울 때는 묶음·모형을 다시 지우지 않는다', async () => {
  const c = fake();
  assert.equal(await forgetAvatar(c, 'avatars', ready, 'original'), 'done');
  assert.deepEqual(c.calls, [['remove', 'avatars', [ORIGINAL]], ['rpc', 'avatar_forget', { p_id: ID, p_part: 'original' }]]);
  // 지울 파일이 없으면 저장소를 부르지 않고 DB에만 적는다
  const none = fake();
  assert.equal(await forgetAvatar(none, 'avatars', { ...ready, original_path: null }, 'original'), 'done');
  assert.deepEqual(none.calls, [['rpc', 'avatar_forget', { p_id: ID, p_part: 'original' }]]);
});

test('파일을 못 지우면 DB에 적지 않는다(다시 누르면 된다)', async () => {
  const c = fake({ removes: [{ error: { message: 'storage down' } }] });
  assert.equal(await forgetAvatar(c, 'avatars', ready, 'character'), 'files_failed');
  assert.deepEqual(c.calls, [['remove', 'avatars', [CHAR, ...VIEWS]]]);
});

test('DB가 적지 못했으면(false, 오류, 뜻밖의 답) 끝난 것으로 치지 않는다', async () => {
  for (const rpc of [{ data: false, error: null }, { data: null, error: null }, { data: 'true', error: null },
    { data: true, error: { message: 'x' } }, { data: null, error: { message: 'x' } }]) {
    const c = fake({ rpc });
    assert.equal(await forgetAvatar(c, 'avatars', ready, 'character'), 'record_failed', JSON.stringify(rpc));
    assert.equal(c.calls.length, 2, '묶음을 다시 지우러 가지 않는다');
  }
});

test('마지막 묶음·모형 지우기는 실패해도(오류 답이든 던지든) 지우기는 끝난 것이다', async () => {
  const answered = fake({ removes: [{ error: null }, { error: { message: 'storage down' } }] });
  assert.equal(await forgetAvatar(answered, 'avatars', ready, 'character'), 'done');
  const thrown = fake({ removes: [{ error: null }, new TypeError('offline')] });
  assert.equal(await forgetAvatar(thrown, 'avatars', ready, 'character'), 'done');
  assert.equal(thrown.calls.length, 3);
});

// ───────── 지우는 길을 빠짐없이: 새 길이 생겨도 묶음·모형 지우기를 빠뜨리지 않게
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test('그림을 지우는 길은 모두 forgetAvatar를 거친다: avatar_forget을 직접 부르는 곳은 forget.ts와 「원본만」 한 곳뿐', () => {
  const root = fileURLToPath(SRC).replace(/\/$/, '');
  const direct: Array<{ file: string; call: string }> = [];
  const through: string[] = [];
  for (const file of sources(root)) {
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    for (const m of text.matchAll(/rpc\(\s*'avatar_forget'\s*,\s*\{[^}]*\}/g)) direct.push({ file: rel, call: m[0] });
    if (/\bforgetAvatar\(/.test(text) && rel !== 'lib/avatar/forget.ts') through.push(rel);
  }
  assert.deepEqual(through.sort(), ['app/api/avatar/[id]/route.ts', 'app/avatar/actions.ts'], '지우기 두 길(걷기 화면, 「내 캐릭터」 화면)');
  const outside = direct.filter((d) => d.file !== 'lib/avatar/forget.ts');
  assert.equal(direct.length - outside.length, 1, 'forget.ts 안의 한 번');
  // 그 밖에서 직접 부르는 것은 원본만 지우는 길이어야 한다. 그림을 지우는 새 길은 forgetAvatar를 써야 묶음이 저장소에 남지 않는다
  assert.deepEqual(outside.map((d) => d.file), ['app/avatar/actions.ts']);
  for (const d of outside) assert.match(d.call, /p_part:\s*'original'/, d.call);
});

test('두 지우기 길은 묶음·모형 경로를 만들 수 있게 줄의 주인(user_id)과 상태를 함께 읽는다', () => {
  for (const rel of ['app/api/avatar/[id]/route.ts', 'app/avatar/actions.ts']) {
    const text = readFileSync(new URL(rel, SRC), 'utf8');
    assert.match(text, /\.select\('id, user_id, status, original_path, image_path'\)/, rel);
  }
});

const parts: Part[] = ['original', 'character', 'both'];
test('어느 지우기든 저장소에 넘기는 경로는 그 사람 폴더 안의 것뿐이다', () => {
  for (const part of parts) {
    for (const p of forgetFiles(ready, part).before) assert.ok(p.startsWith(`${UID}/`), p);
  }
});
