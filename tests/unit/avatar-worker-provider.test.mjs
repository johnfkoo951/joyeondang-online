// 3D 모형 제공자 고르기(worker/avatar/provider.mjs): 준비가 안 되면 3D 모형만 끄고 던지지 않는다.
// 여기서 던지면 일꾼 전체(한 장 그리기·방향 그림)가 시작하자마자 죽고 launchd가 계속 다시 띄운다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keyLock, keyLockPath, processStartedAt } from '../../worker/avatar/meshy.mjs';
import { DEFAULT_MODEL_URL } from '../../worker/avatar/models.mjs';
import { createModelProvider } from '../../worker/avatar/provider.mjs';

test('3D 모형 제공자: trellis(기본), 끔·모형 함수 없음·모르는 이름은 null. meshy는 키 파일이 없거나 값이 비면 경고 뒤 null', async () => {
  const db = { modelClaim: async () => null };
  const logs = [];
  const log = (level, msg) => logs.push([level, msg]);
  assert.equal((await createModelProvider({ env: {}, db, log })).baseUrl, DEFAULT_MODEL_URL);
  assert.equal((await createModelProvider({ env: { AVATAR_MODEL_URL: 'http://127.0.0.1:7860' }, db, log })).baseUrl, 'http://127.0.0.1:7860');
  assert.equal(await createModelProvider({ env: { AVATAR_MODELS: '0' }, db, log }), null);
  assert.equal(await createModelProvider({ env: {}, db: {}, log }), null, '0016 전의 DB 어댑터');
  assert.equal(await createModelProvider({ env: { AVATAR_MODEL_PROVIDER: 'tripo' }, db, log }), null);
  assert.ok(logs.some((l) => l[1] === 'unknown AVATAR_MODEL_PROVIDER: models off'));

  const dir = mkdtempSync(join(tmpdir(), 'meshy-provider-'));
  try {
    const meshy = (extra = {}) => ({ AVATAR_MODEL_PROVIDER: 'meshy', MESHY_STATE_FILE: join(dir, 'state', 'meshy.json'), ...extra });
    // 키 잠금은 임시 폴더에(운영은 이 사용자의 고정 자리)
    const locks = join(dir, 'locks');
    const lockOf = (key) => keyLock(key, locks);
    assert.equal(await createModelProvider({ env: meshy(), db, log }), null, '키 파일 경로가 없다');
    assert.equal(await createModelProvider({ env: meshy({ MESHY_API_KEY_FILE: join(dir, 'missing.env') }), db, log }), null, '키 파일이 없다');
    assert.equal(logs.filter((l) => l[1] === 'meshy key unavailable: models off').length, 2);
    // 값이 빈 키 파일(MESHY_API_KEY=): 예전에는 createMeshyService가 던져 일꾼 전체가 죽었다
    const empty = join(dir, 'empty.env');
    writeFileSync(empty, 'MESHY_API_KEY=\n');
    const tools = async () => ({ tidy: async () => ({ glb: new Uint8Array(0), stats: null }) });
    assert.equal(await createModelProvider({ env: meshy({ MESHY_API_KEY_FILE: empty }), db, log, glbTools: tools, lockOf }), null);
    assert.ok(logs.some((l) => l[1] === 'meshy key empty: models off'));
    // 다듬기 라이브러리가 없음
    const good = join(dir, 'good.env');
    writeFileSync(good, 'MESHY_API_KEY=msy_TEST0provider0key\n');
    const noTools = async () => { throw new Error('no gltf-transform'); };
    assert.equal(await createModelProvider({ env: meshy({ MESHY_API_KEY_FILE: good }), db, log, glbTools: noTools, lockOf }), null);
    assert.ok(logs.some((l) => l[1] === 'glb tools unavailable: models off'));
    // 같은 키를 살아 있는 다른 프로세스가 쓰고 있음(같은 키로 도는 두 번째 일꾼, --once 실행, 한 건 시험): 장부 파일을 따로 두어도 3D 모형만 끈다
    const other = { pid: process.ppid, started: processStartedAt(process.ppid) };
    mkdirSync(locks, { recursive: true });
    writeFileSync(keyLockPath('msy_TEST0provider0key', locks), `${JSON.stringify(other)}\n`);
    assert.equal(await createModelProvider({
      env: meshy({ MESHY_API_KEY_FILE: good, MESHY_STATE_FILE: join(dir, 'state-2', 'meshy.json') }), db, log, glbTools: tools, lockOf,
    }), null);
    assert.ok(logs.some((l) => l[1] === 'meshy key in use by another process: models off'));
    rmSync(keyLockPath('msy_TEST0provider0key', locks));
    // 장부를 살아 있는 다른 프로세스가 쥐고 있음: 3D 모형만 끈다(키 잠금은 놓는다)
    mkdirSync(join(dir, 'state'), { recursive: true });
    writeFileSync(join(dir, 'state', 'meshy.json.lock'), `${JSON.stringify(other)}\n`);
    assert.equal(await createModelProvider({ env: meshy({ MESHY_API_KEY_FILE: good }), db, log, glbTools: tools, lockOf }), null);
    assert.ok(logs.some((l) => l[1] === 'meshy ledger in use by another process: models off'));
    assert.equal(existsSync(keyLockPath('msy_TEST0provider0key', locks)), false, '장부를 못 쥐면 키 잠금도 놓는다');
    // 다 갖추면 meshy 서비스(사람이 요청한 줄만, Meshy로 요청한 줄만, 하루 상한 기본 120, 키 잠금을 쥠)
    rmSync(join(dir, 'state', 'meshy.json.lock'));
    const service = await createModelProvider({ env: meshy({ MESHY_API_KEY_FILE: good }), db, log, glbTools: tools, lockOf });
    assert.deepEqual([service.name, service.requestedOnly, service.consent, service.options.daily_max, service.options.key_lock],
      ['meshy', true, 'meshy', 120, true]);
    assert.ok(existsSync(keyLockPath('msy_TEST0provider0key', locks)), '키 잠금을 쥔다');
    assert.equal(JSON.stringify(logs).includes('msy_TEST0provider0key'), false, '키는 기록에 남지 않는다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
