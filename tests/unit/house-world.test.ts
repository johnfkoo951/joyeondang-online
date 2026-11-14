// 실제 집 데이터 관문: 손님만, 환경 변수에서만, 모양이 맞을 때만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { buildWorld } from '../../src/content/world.ts';
import { canUse } from '../../src/lib/access.ts';
import { isHouseWorld } from '../../src/lib/house-world-check.ts';
import { localPreview } from '../../src/lib/preview.ts';

test('실제 집은 명단 손님부터, 구경꾼과 확인 중인 분은 못 받는다', () => {
  assert.equal(canUse('public', 'realHouse'), false);
  assert.equal(canUse('visitor', 'realHouse'), false);
  assert.equal(canUse('guest', 'realHouse'), true);
  assert.equal(canUse('family', 'realHouse'), true);
});

test('세계 데이터 검사: 다시 그린 집은 실제 집으로 통과하지 못한다', () => {
  const redrawn = buildWorld({});
  assert.equal(isHouseWorld(redrawn), false);
  const real = { ...JSON.parse(JSON.stringify(redrawn)), kind: 'real' };
  assert.equal(isHouseWorld(real), true);
  assert.equal(isHouseWorld({ ...real, physics: { boxes: [] } }), false);
  // 환경 변수 형식(gzip → base64)이 되돌려지는지
  const raw = gzipSync(Buffer.from(JSON.stringify(real))).toString('base64');
  assert.ok(raw.length < JSON.stringify(real).length);
});

test('로컬 미리보기 스위치: 이 컴퓨터 주소에만 묶인 서버에서만 켜지고, 호스팅 환경에서는 절대 켜지지 않는다', () => {
  const here = { JY_LOCAL_PREVIEW: '1', __NEXT_PRIVATE_ORIGIN: 'http://127.0.0.1:3100' };
  assert.equal(localPreview(here), true);
  // 모든 IPv6 주소에 묶어 띄운 서버(-H ::)도 Next가 이 값을 [::1]로 적는다. ::1에만 묶은 것과 가릴 수 없어 받지 않는다
  assert.equal(localPreview({ ...here, __NEXT_PRIVATE_ORIGIN: 'http://[::1]:3100' }), false);
  assert.equal(localPreview({ ...here, __NEXT_PRIVATE_ORIGIN: 'http://[::]:3100' }), false);
  assert.equal(localPreview({ ...here, __NEXT_PRIVATE_ORIGIN: 'http://127.0.0.1.example.com:3100' }), false);
  // 모든 주소에 열어 띄운 서버(next start 기본값은 이 값이 localhost로 적힌다)와, 묶인 주소를 알 수 없을 때는 꺼진다
  assert.equal(localPreview({ ...here, __NEXT_PRIVATE_ORIGIN: 'http://localhost:3000' }), false);
  assert.equal(localPreview({ ...here, __NEXT_PRIVATE_ORIGIN: 'http://192.168.0.10:3000' }), false);
  assert.equal(localPreview({ ...here, __NEXT_PRIVATE_ORIGIN: 'not a url' }), false);
  assert.equal(localPreview({ JY_LOCAL_PREVIEW: '1' }), false);
  // 호스팅 환경에서는 묶인 주소와 상관없이 꺼진다
  assert.equal(localPreview({ ...here, VERCEL: '1' }), false);
  for (const k of ['VERCEL_ENV', 'VERCEL_URL', 'CF_PAGES', 'NETLIFY', 'AWS_LAMBDA_FUNCTION_NAME']) {
    assert.equal(localPreview({ ...here, [k]: 'x' }), false, k);
  }
  assert.equal(localPreview({}), false);
  assert.equal(localPreview({ ...here, JY_LOCAL_PREVIEW: 'true' }), false);
  assert.equal(localPreview({ ...here, NODE_ENV: 'test' }), false);
});

test('미리보기는 요청 주소(Host)도 이 컴퓨터일 때만: 다른 이름으로 온 요청(DNS 재바인딩)은 막는다', async () => {
  const { loopbackHost } = await import('../../src/lib/preview.ts');
  for (const h of ['127.0.0.1:3100', 'localhost:3000', '[::1]:3100', '127.0.0.1']) assert.equal(loopbackHost(h), true, h);
  for (const h of ['evil.example:3100', '127.0.0.1.evil.example:3100', 'localhost.evil:3000', '', null, undefined]) assert.equal(loopbackHost(h), false, String(h));
  // 요청을 받는 자리는 모두 previewForRequest()를 쓴다(그냥 localPreview()는 요청이 없는 곳에만)
  const { readFileSync } = await import('node:fs');
  for (const f of ['app/api/house/route.ts', 'app/api/family-rooms/route.ts', 'app/api/who/route.ts', 'app/api/game-token/route.ts', 'app/api/gallery/route.ts', 'app/api/pet/route.ts', 'app/walk/page.tsx', 'app/admin/control/page.tsx', 'lib/house-shell-gate.ts']) {
    const src = readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
    assert.ok(src.includes('previewForRequest()'), `${f}: previewForRequest`);
    assert.ok(!/\blocalPreview\(/.test(src), `${f}: 맨 localPreview()`);
  }
});
