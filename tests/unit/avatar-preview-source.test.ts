// 이 컴퓨터 미리보기용 그림 원천(src/lib/avatar/preview-source.ts): 스위치가 꺼져 있으면 파일 시스템을 건드리지 않고,
// 켜져 있어도 미리보기 폴더 바로 아래의 정해진 이름만 읽는다.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const { previewResponse, readPreviewAvatar } = await import('../../src/lib/avatar/preview-source.ts');

const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const ID = id(1);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const webp = (tail: number) => Uint8Array.from([...Buffer.from('RIFF'), 4, 0, 0, 0, ...Buffer.from('WEBP'), tail]);
/** GLB 머리만 있는 작은 파일(「glTF」, 판 2, 길이 20) */
const GLB = Uint8Array.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0x4a, 0x53, 0x4f, 0x4e]);

// 미리보기 폴더와, 그 밖에 있는 그림(읽히면 안 되는 것)
const dir = mkdtempSync(join(tmpdir(), 'avatar-preview-'));
const outside = mkdtempSync(join(tmpdir(), 'avatar-outside-'));
after(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});
writeFileSync(join(dir, `${ID}.png`), PNG);
writeFileSync(join(dir, `${ID}.v1l.webp`), webp(7));
writeFileSync(join(dir, `${ID}.v1s.webp`), webp(8));
writeFileSync(join(dir, `${ID}.glb`), GLB);
writeFileSync(join(outside, `${id(2)}.png`), PNG);
symlinkSync(join(outside, `${id(2)}.png`), join(dir, `${id(3)}.png`)); // 폴더 밖을 가리키는 바로가기
mkdirSync(join(dir, `${id(4)}.png`)); // 이름만 그림인 폴더
writeFileSync(join(dir, `${id(5)}.png`), 'not a picture'); // 그림이 아닌 파일
writeFileSync(join(dir, `${id(6)}.png`), webp(9)); // 이름과 다른 형식
writeFileSync(join(dir, `${id(6)}.v1l.webp`), PNG);
writeFileSync(join(dir, `${id(6)}.glb`), PNG); // GLB 이름의 그림
writeFileSync(join(dir, `${id(7)}.glb`), GLB.subarray(0, 16)); // 머리의 길이와 다른(잘린) GLB

const ON = { JY_LOCAL_PREVIEW: '1', __NEXT_PRIVATE_ORIGIN: 'http://127.0.0.1:3100', AVATAR_PREVIEW_DIR: dir };

/** 무엇을 건드렸는지 적는 가짜 파일 시스템(읽으면 그림을 준다) */
function spyDisk(size = PNG.length) {
  const touched: string[] = [];
  return {
    touched,
    lstat: async (file: string) => { touched.push(`lstat ${file}`); return { isFile: () => true, size }; },
    readFile: async (file: string) => { touched.push(`read ${file}`); return PNG; },
  };
}

test('켜져 있으면 미리보기 폴더의 그림 한 장과 묶음 두 크기, 3D 모형을 준다', async () => {
  const char = await readPreviewAvatar(ID, 'char', ON);
  assert.deepEqual([char?.type, [...(char?.bytes ?? [])]], ['image/png', [...PNG]]);
  const large = await readPreviewAvatar(ID, 'l', ON);
  assert.deepEqual([large?.type, large?.bytes.at(-1)], ['image/webp', 7]);
  const small = await readPreviewAvatar(ID, 's', ON);
  assert.deepEqual([small?.type, small?.bytes.at(-1)], ['image/webp', 8]);
  const model = await readPreviewAvatar(ID, 'model', ON);
  assert.deepEqual([model?.type, [...(model?.bytes ?? [])]], ['model/gltf-binary', [...GLB]]);
  // 폴더 이름 끝에 /가 붙어 있어도 같다
  assert.equal((await readPreviewAvatar(ID, 's', { ...ON, AVATAR_PREVIEW_DIR: `${dir}//` }))?.bytes.at(-1), 8);
  // 읽는 자리는 그 폴더 바로 아래의 정해진 이름 하나
  const disk = spyDisk();
  await readPreviewAvatar(ID, 'char', ON, disk);
  assert.deepEqual(disk.touched, [`lstat ${dir}/${ID}.png`, `read ${dir}/${ID}.png`]);
  const glbDisk = spyDisk();
  await readPreviewAvatar(ID, 'model', ON, glbDisk);
  assert.deepEqual(glbDisk.touched, [`lstat ${dir}/${ID}.glb`, `read ${dir}/${ID}.glb`]);
});

test('꺼져 있으면 읽지 않는다: 스위치가 없거나, 127.0.0.1에만 묶이지 않았거나, 호스팅 환경이거나, 폴더를 안 줬을 때', async () => {
  const warn = console.warn;
  console.warn = () => {}; // 미리보기 스위치가 「꺼진 채예요」를 한 번 알린다
  try {
    const off: Array<Record<string, string | undefined>> = [
      {},
      { AVATAR_PREVIEW_DIR: dir },
      { ...ON, JY_LOCAL_PREVIEW: '0' },
      { ...ON, JY_LOCAL_PREVIEW: 'true' },
      { ...ON, __NEXT_PRIVATE_ORIGIN: undefined },
      { ...ON, __NEXT_PRIVATE_ORIGIN: 'http://localhost:3100' },
      { ...ON, __NEXT_PRIVATE_ORIGIN: 'http://0.0.0.0:3100' },
      { ...ON, __NEXT_PRIVATE_ORIGIN: 'http://[::1]:3100' },
      { ...ON, VERCEL: '1' },
      { ...ON, NODE_ENV: 'test' },
      { ...ON, AVATAR_PREVIEW_DIR: undefined },
      { ...ON, AVATAR_PREVIEW_DIR: '' },
      { ...ON, AVATAR_PREVIEW_DIR: '/' },
    ];
    for (const env of off) {
      const disk = spyDisk();
      for (const kind of ['char', 'l', 's', 'model'] as const) assert.equal(await readPreviewAvatar(ID, kind, env, disk), null, JSON.stringify(env));
      assert.deepEqual(disk.touched, [], JSON.stringify(env));
      // 진짜 파일 시스템으로도 같다(그 폴더에 그림이 있어도 주지 않는다)
      assert.equal(await readPreviewAvatar(ID, 'char', env), null, JSON.stringify(env));
    }
  } finally {
    console.warn = warn;
  }
});

test('경로 벗어나기 거절: id는 uuid 모양만, 종류는 char·l·s·model만 받는다', async () => {
  const rel = `../${outside.split('/').pop()}/${id(2)}`;
  const badIds = [rel, `${ID}/../${id(2)}`, `../${ID}`, `${ID}/`, `/${ID}`, '..', '.', '', `${ID}.png`, 'ABCDEF12-1111-4111-8111-111111111111',
    `${ID}%2f..`, ` ${ID}`, `${ID}\0`, `${ID}\n`, join(outside, id(2)), 'status'];
  for (const bad of badIds) {
    const disk = spyDisk();
    assert.equal(await readPreviewAvatar(bad, 'char', ON, disk), null, JSON.stringify(bad));
    assert.deepEqual(disk.touched, [], JSON.stringify(bad));
    assert.equal(await readPreviewAvatar(bad, 'char', ON), null, JSON.stringify(bad));
  }
  for (const kind of ['x', '', 'L', 'S', '../s', 'l/..', 'char.png', 'views', 'glb', 'Model', 'model/..']) {
    const disk = spyDisk();
    assert.equal(await readPreviewAvatar(ID, kind as 'l', ON, disk), null, kind);
    assert.deepEqual(disk.touched, [], kind);
  }
});

test('폴더 밖을 가리키는 바로가기, 폴더, 그림이 아닌 파일, 이름과 형식이 다른 파일, 너무 큰 파일은 주지 않는다', async () => {
  assert.equal(await readPreviewAvatar(id(3), 'char', ON), null, '바로가기');
  assert.equal(await readPreviewAvatar(id(4), 'char', ON), null, '폴더');
  assert.equal(await readPreviewAvatar(id(5), 'char', ON), null, '그림이 아닌 파일');
  assert.equal(await readPreviewAvatar(id(6), 'char', ON), null, 'png 이름의 webp');
  assert.equal(await readPreviewAvatar(id(6), 'l', ON), null, 'webp 이름의 png');
  assert.equal(await readPreviewAvatar(id(6), 'model', ON), null, 'glb 이름의 png');
  assert.equal(await readPreviewAvatar(id(7), 'model', ON), null, '잘린 GLB');
  const big = spyDisk(8 * 1024 * 1024 + 1);
  assert.equal(await readPreviewAvatar(ID, 'char', ON, big), null);
  assert.deepEqual(big.touched, [`lstat ${dir}/${ID}.png`], '크기만 보고 읽지 않는다');
});

test('없는 파일과 읽다 난 오류는 null이다(부른 쪽이 평소 길로 간다)', async () => {
  assert.equal(await readPreviewAvatar(id(9), 'char', ON), null);
  assert.equal(await readPreviewAvatar(id(9), 'l', ON), null);
  assert.equal(await readPreviewAvatar(id(9), 'model', ON), null);
  assert.equal(await readPreviewAvatar(ID, 'char', { ...ON, AVATAR_PREVIEW_DIR: join(dir, 'no-such-folder') }), null);
  const broken = { lstat: async () => { throw new Error('EACCES'); }, readFile: async () => PNG };
  assert.equal(await readPreviewAvatar(ID, 'char', ON, broken), null);
});

test('미리보기 그림의 답: 형식과 길이를 알리고 브라우저에 남기지 않는다', async () => {
  const res = previewResponse({ bytes: webp(5), type: 'image/webp' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.headers.get('content-type'), res.headers.get('content-length'), res.headers.get('cache-control'),
    res.headers.get('x-robots-tag')], ['image/webp', '13', 'no-store', 'noindex']);
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [...webp(5)]);
  const glb = previewResponse({ bytes: GLB.slice(), type: 'model/gltf-binary' });
  assert.deepEqual([glb.headers.get('content-type'), glb.headers.get('content-length')], ['model/gltf-binary', '20']);
});
