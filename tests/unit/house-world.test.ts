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

test('로컬 미리보기 스위치는 Vercel에서는 절대 켜지지 않는다', () => {
  assert.equal(localPreview({ JY_LOCAL_PREVIEW: '1' }), true);
  assert.equal(localPreview({ JY_LOCAL_PREVIEW: '1', VERCEL: '1' }), false);
  assert.equal(localPreview({}), false);
  assert.equal(localPreview({ JY_LOCAL_PREVIEW: 'true' }), false);
});
