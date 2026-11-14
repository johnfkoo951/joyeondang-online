// 부엌 사진 갤러리 전시 목록(src/lib/gallery-manifest.ts) 검사: 파일이 깨졌으면 「깨짐」(null, 그 위에는 쓰지 않는다), 틀린 줄은 빼고,
// 버킷 밖을 가리키는 경로·액자 id가 아닌 열쇠·글자 수를 넘는 글은 받지 않는다. 다시 쓸 때는 모르는 줄·칸을 지키고,
// 화면이 받는 값도 같은 틀로 거른다(그림 열쇠 포함).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

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

const { GALLERY_TEXT, artKey, cleanText, editManifest, emptyManifest, isFrameId, isGalleryPath, parseGalleryItems, parseManifest, readManifestDoc, serializeManifest } = await import('../../src/lib/gallery-manifest.ts');

test('깨진 목록은 null(빈 목록이 아니다): JSON이 아니거나, 맨 위가 객체가 아니거나, items가 표·배열이 아니거나 빠졌거나, 너무 크다', () => {
  // 손으로 고치다 쉼표 하나를 빠뜨린 파일, 빈 파일, items를 잘못 적은 파일
  const comma = '{ "items": { "1-a-1": { "image": "images/a.jpg", "title": "하나" } "1-a-2": { "image": "images/b.jpg" } } }';
  for (const raw of [undefined, null, '', '{', comma, 'null', '[]', '{"items": 3}', '{"items": "x"}', '{"item": {}}', 42, {}, { items: null }, [{ items: {} }]]) {
    assert.equal(parseManifest(raw), null, JSON.stringify(raw));
    assert.equal(readManifestDoc(raw), null, JSON.stringify(raw));
  }
  // 너무 큰 파일은 풀지 않는다(깨진 것으로)
  assert.equal(parseManifest(`{"items": {"1-a-1": {"image": "a.jpg", "title": "${'가'.repeat(GALLERY_TEXT.bytes)}"}}}`), null);
  // 비어 있는 목록은 깨진 것이 아니다(액자는 모두 「곧 전시해요」)
  for (const raw of ['{"items": {}}', '{"items": []}', { items: {} }, '\uFEFF{"items": {}}']) assert.equal(parseManifest(raw)?.size, 0, JSON.stringify(raw));
  assert.deepEqual(emptyManifest().entries.size, 0);
});

test('잘못된 줄은 뺀다: 액자 id가 아닌 열쇠, 그림 경로가 없거나 버킷 밖, 그림이 아닌 파일', () => {
  const m = parseManifest({
    items: {
      '1-a-1': { image: 'images/one.jpg', title: '하나', desc: '첫 그림' },
      '1-a-2': { image: '../secret.jpg', title: '밖' },
      '1-a-3': { image: '/abs.jpg' },
      '1-a-4': { image: 'images/../x.png' },
      '1-a-5': { image: 'notes.txt' },
      '1-a-6': { title: '그림 없음' },
      '1-a-7': { image: 'manifest.json' },
      '1-a-8': { image: 'images\\win.jpg' },
      'kitchen-1': { image: 'images/k.jpg' },
      '3-a-1': { image: 'images/z.jpg' },
      '1-e-1': { image: 'images/e.jpg' },
      '2-b-10': { image: 'images/ten.webp', thumb: 'images/ten-t.webp', title: '열' },
      '1.2-c-1': { image: '그림/한글 이름.PNG', thumb: '../nope.jpg' },
    },
  })!;
  assert.deepEqual([...m.keys()], ['1-a-1', '2-b-10', '1.2-c-1']);
  assert.deepEqual(m.get('1-a-1'), { image: 'images/one.jpg', title: '하나', desc: '첫 그림' });
  assert.equal(m.get('2-b-10')!.thumb, 'images/ten-t.webp');
  // 틀린 작은 그림 경로는 버리고 줄은 남긴다. 제목이 없으면 「무제」
  assert.deepEqual(m.get('1.2-c-1'), { image: '그림/한글 이름.PNG', title: GALLERY_TEXT.untitled, desc: '' });
});

test('배열 모양도 받고, 같은 id는 처음 것만, 글은 다듬고 상한까지만', () => {
  const m = parseManifest(JSON.stringify({
    items: [
      { id: '2-d-1', image: 'images/a.jpg', title: '  가\u0007나  ', description: `줄\r\n\n\n\n바꿈${'다'.repeat(800)}` },
      { id: '2-d-1', image: 'images/b.jpg', title: '나중 것' },
      { image: 'images/no-id.jpg' },
      null,
    ],
  }))!;
  assert.deepEqual([...m.keys()], ['2-d-1']);
  const e = m.get('2-d-1')!;
  assert.equal(e.image, 'images/a.jpg');
  assert.equal(e.title, '가 나');
  assert.ok(e.desc.startsWith('줄\n\n바꿈'));
  assert.ok(e.desc.length <= GALLERY_TEXT.desc);
  assert.equal(cleanText(42, 10), '');
  assert.equal(cleanText('x'.repeat(100), GALLERY_TEXT.title).length, GALLERY_TEXT.title);
});

test('목록 파일로 쓰고 다시 읽으면 같다(액자 id 차례)', () => {
  const m = parseManifest({ items: { '2-a-1': { image: 'images/b.jpg', title: '둘' }, '1-b-2': { image: 'images/a.jpg', thumb: 'images/a-t.jpg', title: '하나', desc: '설명' } } })!;
  const text = serializeManifest(m);
  assert.ok(text.indexOf('"1-b-2"') < text.indexOf('"2-a-1"'));
  assert.deepEqual(parseManifest(text), m);
});

test('경로·id 모양', () => {
  for (const ok of ['a.jpg', 'images/x.JPEG', 'images/sub/y.webp', '그림.png']) assert.equal(isGalleryPath(ok), true, ok);
  for (const bad of ['', '/a.jpg', 'a//b.jpg', './a.jpg', 'a/../b.jpg', 'a.gif', 'a.jpg/', 'a\u0000.jpg', 'x'.repeat(201) + '.jpg', 42]) {
    assert.equal(isGalleryPath(bad), false, String(bad));
  }
  for (const ok of ['1-a-1', '2-d-12', '1.2-b-3']) assert.equal(isFrameId(ok), true, ok);
  for (const bad of ['1-a-0', '3-a-1', '1-e-1', 'a1', '1-a', '1.1-a-1', '1-a-100', ' 1-a-1', '1-a1', '1-b2']) assert.equal(isFrameId(bad), false, bad);
});

test('화면이 받는 목록: https 서명 주소·같은 사이트 주소·미리보기 그림 data 주소만, 틀린 줄은 뺀다', () => {
  const items = parseGalleryItems({
    items: [
      { id: '1-a-1', title: '하나', desc: '설명', image: 'https://example.supabase.co/storage/v1/object/sign/gallery/images/a.jpg?token=t', thumb: 'https://example.supabase.co/t.jpg' },
      { id: '1-a-2', title: '둘', image: 'http://insecure.example/a.jpg' },
      { id: '1-a-3', title: '셋', image: 'javascript:alert(1)' },
      { id: '1-a-4', title: '넷', image: 'data:text/html;base64,PGI+' },
      { id: '1-a-5', title: '', image: 'data:image/png;base64,iVBORw0KGgo=' },
      { id: '1-a-6', image: '/local/a.jpg', thumb: '//evil.example/x.jpg' },
      { id: 'bad', image: 'https://example.com/a.jpg' },
    ],
  });
  assert.deepEqual([...items.keys()], ['1-a-1', '1-a-5', '1-a-6']);
  assert.equal(items.get('1-a-1')!.thumb, 'https://example.supabase.co/t.jpg');
  assert.equal(items.get('1-a-5')!.title, GALLERY_TEXT.untitled);
  assert.equal(items.get('1-a-6')!.thumb, undefined);
  for (const raw of [null, {}, { items: {} }, '[]']) assert.equal(parseGalleryItems(raw).size, 0);
});

test('다시 쓰기: 한 줄만 고치고, 이해하지 못한 줄과 칸(메모, 120줄 밖, 틀린 줄)은 그대로 둔다', () => {
  const raw = {
    note: '손으로 적은 메모(맨 위 칸)',
    items: {
      '1-a-1': { image: 'images/one.jpg', title: '하나', description: '설명을 description으로', memo: '찍은 날 메모' },
      'kitchen-1': { image: 'images/k.jpg', title: '틀린 번호' },
      '1-a-2': { image: '../secret.jpg', title: '틀린 경로' },
      '1-a-3': { image: 'images/three.jpg', title: '셋', desc: '' },
    },
  };
  const doc = readManifestDoc(JSON.stringify(raw))!;
  assert.deepEqual([...doc.entries.keys()], ['1-a-1', '1-a-3']);
  assert.equal(doc.skipped, 2);
  // 1-a-3 글을 고친다: 다른 줄은 한 글자도 바뀌지 않는다
  const out = JSON.parse(editManifest(doc, '1-a-3', { image: 'images/three.jpg', title: '셋 고침', desc: '새 설명' }));
  assert.equal(out.note, raw.note);
  assert.deepEqual(out.items['1-a-1'], raw.items['1-a-1']);
  assert.deepEqual(out.items['kitchen-1'], raw.items['kitchen-1']);
  assert.deepEqual(out.items['1-a-2'], raw.items['1-a-2']);
  assert.deepEqual(out.items['1-a-3'], { image: 'images/three.jpg', title: '셋 고침', desc: '새 설명' });
  // 고친 줄의 모르는 칸은 남기고, description은 desc로 옮긴다(작은 그림이 없어지면 칸도 지운다)
  const one = JSON.parse(editManifest(doc, '1-a-1', { image: 'images/one-new.jpg', title: '하나', desc: '새 설명' })).items['1-a-1'];
  assert.deepEqual(one, { memo: '찍은 날 메모', image: 'images/one-new.jpg', title: '하나', desc: '새 설명' });
  // 새 줄은 읽은 줄 뒤, 읽지 못한 줄 앞(읽는 범위 안)
  const added = JSON.parse(editManifest(doc, '2-b-1', { image: 'images/n.jpg', thumb: 'images/n-t.jpg', title: '새', desc: '' }));
  assert.deepEqual(Object.keys(added.items), ['1-a-1', '1-a-3', '2-b-1', 'kitchen-1', '1-a-2']);
  assert.deepEqual(readManifestDoc(JSON.stringify(added))!.entries.get('2-b-1'), { image: 'images/n.jpg', thumb: 'images/n-t.jpg', title: '새', desc: '' });
  // 지우기: 그 줄만
  const cleared = JSON.parse(editManifest(doc, '1-a-1', null));
  assert.deepEqual(Object.keys(cleared.items), ['1-a-3', 'kitchen-1', '1-a-2']);
  assert.equal(cleared.note, raw.note);
});

test('다시 쓰기: 120줄 밖의 줄도 남기고, 고친 줄은 읽는 범위 안으로 온다. 배열 모양은 배열로, 지울 때는 같은 번호의 뒤 줄도', () => {
  // 앞 130줄이 틀린 줄(읽지 못함), 그 뒤에 진짜 줄 하나: 예전에는 저장할 때마다 120줄 밖이 사라졌다
  const items: Record<string, unknown> = {};
  for (let i = 0; i < 130; i++) items[`old-${i}`] = { image: `images/old-${i}.jpg` };
  items['2-c-1'] = { image: 'images/late.jpg', title: '늦게 적은 줄' };
  const doc = readManifestDoc({ items })!;
  assert.equal(doc.entries.size, 0, '120줄 밖은 읽지 않는다');
  const text = editManifest(doc, '1-a-1', { image: 'images/a.jpg', title: '하나', desc: '' });
  const back = readManifestDoc(text)!;
  assert.deepEqual([...back.entries.keys()], ['1-a-1'], '고친 줄은 읽힌다');
  assert.equal(Object.keys(JSON.parse(text).items).length, 132, '120줄 밖의 줄도 남는다');
  assert.deepEqual(JSON.parse(text).items['2-c-1'], items['2-c-1']);
  // 배열 모양: 그대로 배열, id를 맨 앞에, 같은 번호의 뒤 줄은 지울 때 함께
  const list = readManifestDoc({ items: [
    { id: '1-a-1', image: 'images/a.jpg', title: '하나', extra: 1 },
    { note: 'id 없는 메모 줄' },
    { id: '1-a-1', image: 'images/dup.jpg', title: '겹친 줄' },
  ] })!;
  assert.equal(list.skipped, 2);
  const edited = JSON.parse(editManifest(list, '1-a-1', { image: 'images/b.jpg', title: '하나', desc: '' }));
  assert.ok(Array.isArray(edited.items));
  assert.deepEqual(edited.items[0], { id: '1-a-1', image: 'images/b.jpg', title: '하나', extra: 1, desc: '' });
  assert.deepEqual(edited.items.slice(1), [{ note: 'id 없는 메모 줄' }, { id: '1-a-1', image: 'images/dup.jpg', title: '겹친 줄' }]);
  assert.deepEqual(JSON.parse(editManifest(list, '1-a-1', null)).items, [{ note: 'id 없는 메모 줄' }], '내리면 겹친 줄이 대신 걸리지 않는다');
  // 목록이 아직 없을 때(처음 걸기)
  assert.deepEqual(JSON.parse(editManifest(emptyManifest(), '1-a-1', { image: 'images/a.jpg', title: '하나', desc: '' })), {
    items: { '1-a-1': { image: 'images/a.jpg', title: '하나', desc: '' } },
  });
});

test('그림 열쇠: 같은 경로면 같고 그림이 바뀌면 달라진다(서명 주소와 상관없이). 화면은 열쇠가 없거나 틀리면 주소를 쓴다', async () => {
  const a = await artKey('images/a.jpg', 'images/a-t.jpg');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(await artKey('images/a.jpg', 'images/a-t.jpg'), a);
  assert.notEqual(await artKey('images/b.jpg', 'images/a-t.jpg'), a);
  assert.notEqual(await artKey('images/a.jpg', undefined), a);
  // 조각 경계가 섞이지 않는다
  assert.notEqual(await artKey('ab', 'c'), await artKey('a', 'bc'));
  assert.notEqual(await artKey(Uint8Array.from([1, 2])), await artKey(Uint8Array.from([1, 3])));
  const url = 'https://example.supabase.co/storage/v1/object/sign/gallery/images/a.jpg?token=t';
  const items = parseGalleryItems({ items: [
    { id: '1-a-1', key: a, title: '하나', image: url },
    { id: '1-a-2', key: 'NOT-A-KEY', title: '둘', image: `${url}2` },
    { id: '1-a-3', title: '셋', image: `${url}3` },
  ] });
  assert.equal(items.get('1-a-1')!.key, a);
  assert.equal(items.get('1-a-2')!.key, `${url}2`);
  assert.equal(items.get('1-a-3')!.key, `${url}3`);
});
