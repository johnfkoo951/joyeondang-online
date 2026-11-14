import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../../next.config.ts';

test('sub-application rewrite stays below its own prefix', async () => {
  const saved = process.env.SHUTTLE_UPSTREAM_ORIGIN;
  try {
    delete process.env.SHUTTLE_UPSTREAM_ORIGIN;
    assert.deepEqual(await config.rewrites!(), []);
    process.env.SHUTTLE_UPSTREAM_ORIGIN = 'https://shuttle.example.com';
    const routes = await config.rewrites!();
    assert.equal(Array.isArray(routes), false);
    if (Array.isArray(routes)) throw new Error('Expected phased rewrites');
    assert.deepEqual(routes.beforeFiles, [
      { source: '/shuttle', destination: 'https://shuttle.example.com/shuttle' },
      { source: '/shuttle/:path*', destination: 'https://shuttle.example.com/shuttle/:path*' },
    ]);
    for (const invalid of ['http://example.com', 'https://example.com/path', 'https://user:password@example.com']) {
      process.env.SHUTTLE_UPSTREAM_ORIGIN = invalid;
      await assert.rejects(async () => config.rewrites!());
    }
  } finally {
    if (saved === undefined) delete process.env.SHUTTLE_UPSTREAM_ORIGIN;
    else process.env.SHUTTLE_UPSTREAM_ORIGIN = saved;
  }
});
test('geolocation exception is restricted to the sub-application', async () => {
  const rules = await config.headers!();
  const global = rules.find((r) => r.source === '/:path*')!;
  const shuttle = rules.find((r) => r.source === '/shuttle/:path*')!;
  assert.ok(global.headers.some((h) => h.key === 'Permissions-Policy' && h.value.includes('geolocation=()')));
  assert.ok(shuttle.headers.some((h) => h.key === 'Permissions-Policy' && h.value.includes('geolocation=(self)')));
  assert.ok(shuttle.headers.some((h) => h.key === 'Cache-Control' && h.value.includes('no-store')));
});
