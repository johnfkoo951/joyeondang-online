// 부엌 사진 갤러리 전시 목록이 손님 아닌 사람에게 나가지 않는지: 영역 표(누가 받는가), 라우트가 확인하는 차례(라우트는 Next 서버
// 안에서만 돌아 여기서는 글을 읽어 본다), 서버 목록 원천(비밀 키가 없으면 빈 목록), 이 컴퓨터 미리보기 원천(스위치가 꺼져 있으면
// 파일 시스템을 건드리지 않음).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    // 서버 전용 표시는 시험에서 빈 모듈로
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

const { canUse } = await import('../../src/lib/access.ts');
const { previewGalleryItems } = await import('../../src/lib/gallery-preview.ts');

const read = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');
/** GET 함수의 몸통만 */
function getBody(src: string): string {
  const from = src.indexOf('export async function GET');
  const next = src.indexOf('\nexport async function ', from + 1);
  return src.slice(from, next < 0 ? undefined : next);
}
function inOrder(body: string, steps: string[]): void {
  const at = steps.map((s) => body.indexOf(s));
  assert.deepEqual(at.map((i) => i >= 0), steps.map(() => true), `빠진 단계: ${steps.filter((_, k) => at[k] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `순서가 다르다: ${steps.join(' → ')}`);
}

test('전시 목록은 명단 손님부터: 구경꾼과 확인 중인 분은 못 받는다', () => {
  assert.equal(canUse('public', 'gallery'), false);
  assert.equal(canUse('visitor', 'gallery'), false);
  for (const r of ['guest', 'family', 'admin'] as const) assert.equal(canUse(r, 'gallery'), true, r);
});

test('/api/gallery: 손님 확인 → 끄기 → 지금 걸린 액자 id → 미리보기 → 저장소 목록 차례, 손님이 아니면 본문 없는 404', () => {
  const route = read('app/api/gallery/route.ts');
  const body = getBody(route);
  inOrder(body, ['await connection()', 'getViewer()', "canUse(viewer.role, 'gallery')", 'galleryOn(process.env.KITCHEN_GALLERY)',
    'galleryFrames()', 'previewGalleryItems(ids)', 'galleryItems(ids)']);
  // 손님이 아니면 저장소에 닿기 전에 끝난다(확인하지 못했으면 503으로 잠시 뒤 다시)
  assert.match(body, /if \(!canUse\(viewer\.role, 'gallery'\) && !preview\) return new Response\(null, viewer\.unsure \? UNSURE : HIDDEN\);/);
  assert.match(route, /const HIDDEN = \{ status: 404, headers: \{ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' \} \}/);
  assert.match(route, /'Cache-Control': 'private, no-store'/);
  // 비밀 키는 라우트가 직접 읽지 않는다(서버 라이브러리 안에서만)
  assert.doesNotMatch(route, /SECRET_KEY|NEXT_PUBLIC_|createClient/);
  assert.deepEqual([...route.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]), ['GET']);
});

test('/api/house도 손님 확인 뒤에 손질한 집을 준다(액자는 그 안에)', () => {
  inOrder(getBody(read('app/api/house/route.ts')), ['await connection()', 'getViewer()', "canUse(viewer.role, 'realHouse')", 'stagedHouse()']);
});

test('서버 목록 원천: 비밀 키가 없으면 저장소에 닿지 않고 빈 목록, 버킷 안 경로는 내보내지 않는다', async () => {
  const keep = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  delete process.env.SUPABASE_SECRET_KEY;
  try {
    const g = await import('../../src/lib/gallery.ts');
    assert.equal(g.galleryStoreReady(), false);
    assert.deepEqual(await g.readManifest(), { ok: false, why: 'unready' });
    assert.deepEqual(await g.galleryItems(new Set(['1-a-1'])), []);
    assert.deepEqual(await g.signGallery(new Map([['1-a-1', { image: 'images/a.jpg', title: '하나', desc: '' }]]), new Set(['1-a-1'])), []);
    // 승인함이 올린 파일 모양만 지운다(손으로 올린 파일은 건드리지 않는다)
    assert.equal(g.isOwnGalleryFile('images/0123456789abcdef0123456789abcdef.jpg'), true);
    assert.equal(g.isOwnGalleryFile('images/0123456789abcdef0123456789abcdef-t.jpg'), true);
    for (const p of ['images/cat.jpg', 'manifest.json', 'images/0123456789abcdef0123456789abcdef.png', '../images/0123456789abcdef0123456789abcdef.jpg']) {
      assert.equal(g.isOwnGalleryFile(p), false, p);
    }
  } finally {
    if (keep.key !== undefined) process.env.SUPABASE_SECRET_KEY = keep.key;
    if (keep.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = keep.url;
  }
  const lib = read('lib/gallery.ts');
  // 손님에게 주는 줄에는 서명 주소와 그림 열쇠(경로를 다진 값)만 담는다(버킷 안 경로를 담지 않는다)
  assert.match(lib, /out\.push\(\{ id, key, title: e\.title, desc: e\.desc, image, \.\.\.\(thumb \? \{ thumb \} : \{\}\) \}\);/);
  assert.match(lib, /const key = await artKey\(e\.image, e\.thumb\);/);
});

test('깨진 목록에는 쓰지 않는다: 내려받은 목록이 깨졌으면 broken, 못 받았으면 unreachable, 아직 없으면 빈 목록', async () => {
  const g = await import('../../src/lib/gallery.ts');
  const text = (t: string) => ({ data: new Blob([t], { type: 'application/json' }), error: null });
  // 손으로 고치다 쉼표를 빠뜨렸다, items를 빠뜨렸다, 맨 위가 배열이다, 빈 파일이다
  for (const broken of ['{ "items": { "1-a-1": { "image": "images/a.jpg" } "1-a-2": {} } }', '{"note": "items 없음"}', '[]', '']) {
    assert.deepEqual(await g.manifestFrom(text(broken)), { ok: false, why: 'broken' }, broken);
  }
  assert.deepEqual(await g.manifestFrom({ data: new Blob(['x'.repeat(300 * 1024)]), error: null }), { ok: false, why: 'broken' }, '너무 크다');
  assert.deepEqual(await g.manifestFrom({ data: null, error: { message: 'connection reset' } }), { ok: false, why: 'unreachable' });
  const none = await g.manifestFrom({ data: null, error: { statusCode: '404', message: 'Object not found' } });
  assert.ok(none.ok && none.doc.entries.size === 0, '목록 파일이 아직 없으면 빈 목록(처음 걸기)');
  const good = await g.manifestFrom(text(JSON.stringify({ items: { '1-a-1': { image: 'images/a.jpg', title: '하나' }, bad: { image: 'images/b.jpg' } } })));
  assert.ok(good.ok && good.doc.entries.size === 1 && good.doc.skipped === 1);
  // 승인함은 읽은 결과가 ok가 아니면(깨짐 포함) 쓰기 전에 돌아가고, 깨졌다고 알린다. 쓸 때는 읽은 문서를 한 줄만 고쳐 쓴다
  const actions = read('app/admin/gallery-actions.ts');
  for (const fn of ['export async function saveGalleryItem', 'export async function clearGalleryItem']) {
    const from = actions.indexOf(fn);
    const body = actions.slice(from, actions.indexOf('\nexport ', from + 1) < 0 ? undefined : actions.indexOf('\nexport ', from + 1));
    inOrder(body, ["adminOnly()", 'const read = await readManifest();', 'if (!read.ok) return', 'writeManifest(editManifest(read.doc, id, ']);
  }
  assert.match(actions, /read\.why === 'broken'\s*\? '전시 목록 파일\(manifest\.json\)이 깨져 있어 저장하지 않았어요/);
  assert.doesNotMatch(actions, /serializeManifest|new Map\(read/);
});

// ───────── 이 컴퓨터 미리보기 원천
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const dir = mkdtempSync(join(tmpdir(), 'gallery-preview-'));
const outside = mkdtempSync(join(tmpdir(), 'gallery-outside-'));
after(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});
mkdirSync(join(dir, 'images'));
writeFileSync(join(dir, 'images', 'a.jpg'), JPEG);
writeFileSync(join(dir, 'images', 'b.png'), PNG);
writeFileSync(join(dir, 'images', 'fake.jpg'), Buffer.from('<html>not an image</html>'));
writeFileSync(join(outside, 'secret.jpg'), JPEG);
symlinkSync(join(outside, 'secret.jpg'), join(dir, 'images', 'link.jpg'));
writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
  items: {
    '1-a-1': { image: 'images/a.jpg', thumb: 'images/b.png', title: '하나', desc: '설명' },
    '1-a-2': { image: 'images/fake.jpg', title: '가짜' },
    '1-a-3': { image: 'images/link.jpg', title: '바로가기' },
    '1-a-4': { image: '../secret.jpg', title: '밖' },
    '2-b-1': { image: 'images/b.png', title: '걸리지 않은 액자' },
  },
}));
const ON = { JY_LOCAL_PREVIEW: '1', __NEXT_PRIVATE_ORIGIN: 'http://127.0.0.1:3100', GALLERY_PREVIEW_DIR: dir };
const IDS = new Set(['1-a-1', '1-a-2', '1-a-3', '1-a-4']);

test('미리보기 원천: 스위치가 꺼졌거나 호스팅 환경이거나 폴더가 없으면 null이고 파일 시스템을 건드리지 않는다', async () => {
  const untouched = {
    lstat: async () => { throw new Error('건드리면 안 된다'); },
    readFile: async () => { throw new Error('건드리면 안 된다'); },
  };
  for (const env of [{ ...ON, JY_LOCAL_PREVIEW: undefined }, { ...ON, VERCEL: '1' }, { ...ON, __NEXT_PRIVATE_ORIGIN: 'http://localhost:3000' }, { ...ON, GALLERY_PREVIEW_DIR: '' }]) {
    assert.equal(await previewGalleryItems(IDS, env, untouched), null);
  }
});

test('미리보기 원천: 걸린 액자 id만, 진짜 그림 파일만(바로가기·그림 아닌 것·폴더 밖은 뺀다) data 주소로', async () => {
  const items = await previewGalleryItems(IDS, ON);
  assert.ok(items);
  assert.deepEqual(items!.map((i) => i.id), ['1-a-1']);
  assert.equal(items![0].title, '하나');
  assert.equal(items![0].image, `data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`);
  assert.equal(items![0].thumb, `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
  // 그림 열쇠는 파일 내용을 다진 값(파일을 바꾸면 바뀐다)
  const { artKey } = await import('../../src/lib/gallery-manifest.ts');
  assert.equal(items![0].key, await artKey(JPEG, PNG));
  // 목록 파일이 없으면 null(평소 길로)
  assert.equal(await previewGalleryItems(IDS, { ...ON, GALLERY_PREVIEW_DIR: outside }), null);
});
