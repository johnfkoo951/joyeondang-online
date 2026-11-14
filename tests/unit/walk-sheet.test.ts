// 걷기 위 페이지 시트: 어떤 주소가 시트로 뜨는지, 시트 안의 링크를 어떻게 따르는지, 열림 세기, 가로채는 폴더와 맞는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { roomSlugOf, sheetKind, sheetLink, sheetTitle } from '../../src/components/walk/sheet-routes.ts';
import { holdSheet, isSheetOpen, subscribeSheet } from '../../src/components/walk/sheet-state.ts';

const HERE = 'https://example.test/room/pine';

test('시트 주소: 방, 수첩, 갤러리, 사진 캐릭터, 전시(목록과 한 칸)만', () => {
  assert.equal(sheetKind('/room/pine'), 'room');
  assert.equal(sheetKind('/room/pine/'), 'room');
  assert.equal(sheetKind('/notebook'), 'notebook');
  assert.equal(sheetKind('/gallery'), 'gallery');
  assert.equal(sheetKind('/avatar'), 'avatar');
  assert.equal(sheetKind('/games'), 'games');
  assert.equal(sheetKind('/guestbook'), 'guestbook');
  assert.equal(sheetKind('/exhibit'), 'exhibit');
  assert.equal(sheetKind('/exhibit/messages'), 'exhibit');
  // 걷기를 떠나야 하는 곳은 시트가 아니다(그림 지도는 3D 없이 보는 길, 로그인은 전체 화면)
  for (const p of ['/', '/walk', '/map', '/login', '/admin', '/privacy', '/join', '/room', '/room/a/b', '/q/pine/x']) {
    assert.equal(sheetKind(p), null, p);
  }
});

test('시트 머리 이름: 방은 방 이름(모르면 「방」), 나머지는 쪽 이름', () => {
  const names: Record<string, string> = { pine: '앞마당 소나무' };
  const name = (s: string) => names[s];
  assert.equal(sheetTitle('/room/pine', name), '앞마당 소나무');
  assert.equal(sheetTitle('/room/nowhere', name), '방');
  assert.equal(sheetTitle('/notebook', name), '내 수첩');
  assert.equal(sheetTitle('/games', name), '작은 놀이');
  assert.equal(sheetTitle('/guestbook', name), '방명록');
  assert.equal(sheetTitle('/exhibit/x', name), '전시');
  assert.equal(sheetTitle('/walk', name), '');
  assert.equal(roomSlugOf('/room/%ED%95%9C'), '한');
  assert.equal(roomSlugOf('/room/%E0%A4'), null, '깨진 주소는 null');
});

test('시트 안 링크: 걷기는 닫기, 다른 시트 주소는 시트 안에서 바꿔 달기', () => {
  assert.deepEqual(sheetLink('/walk', HERE), { kind: 'close' });
  assert.deepEqual(sheetLink('https://example.test/walk/', HERE), { kind: 'close' });
  assert.deepEqual(sheetLink('/exhibit/messages', HERE), { kind: 'sheet', to: '/exhibit/messages' });
  assert.deepEqual(sheetLink('/avatar?from=walk#top', HERE), { kind: 'sheet', to: '/avatar?from=walk#top' });
  assert.deepEqual(sheetLink('../notebook', 'https://example.test/room/pine'), { kind: 'sheet', to: '/notebook' });
});

test('시트 안 링크: 걷기를 떠나는 곳, 다른 사이트, 같은 쪽의 #자리는 손대지 않는다', () => {
  for (const href of ['/map', '/login?next=/room/pine', '/', 'https://elsewhere.test/room/pine', '#q', '/room/pine#q', 'mailto:a@b.c']) {
    assert.deepEqual(sheetLink(href, HERE), { kind: 'none' }, href);
  }
  assert.deepEqual(sheetLink('::', 'not a url'), { kind: 'none' });
});

test('시트 열림: 붙은 수로 센다(시트 안 이동에서 하나가 떨어지고 하나가 붙어도 열린 채), 두 번 떼도 한 번', () => {
  let told = 0;
  const off = subscribeSheet(() => { told += 1; });
  assert.equal(isSheetOpen(), false);
  const a = holdSheet();
  const b = holdSheet();
  a();
  assert.equal(isSheetOpen(), true);
  a();
  assert.equal(isSheetOpen(), true, '같은 시트를 두 번 떼도 다른 시트는 남는다');
  b();
  assert.equal(isSheetOpen(), false);
  assert.equal(told, 4);
  off();
  holdSheet()();
  assert.equal(told, 4, '구독을 끊으면 더 알리지 않는다');
});

test('가로채는 폴더: 시트 주소마다 @sheet/(..) 페이지가 있다(없으면 그 주소는 전체 페이지로 걷기를 떠난다)', () => {
  const root = new URL('../../src/app/walk/@sheet/', import.meta.url);
  for (const dir of ['(..)room/[slug]', '(..)notebook', '(..)gallery', '(..)avatar', '(..)games', '(..)guestbook', '(..)exhibit', '(..)exhibit/[slug]']) {
    assert.ok(existsSync(new URL(`${encodeURI(dir)}/page.tsx`, root)), dir);
  }
  // 시트가 없는 때와 걷기로 돌아올 때 비우는 자리
  assert.ok(existsSync(new URL('default.tsx', root)));
  assert.ok(existsSync(new URL('page.tsx', root)));
});
