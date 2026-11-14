// 3D 모형 제공자 고르기(일꾼 본체 worker.mjs가 부른다). 시험할 수 있게 본체 밖에 둔다.
// 어떤 까닭으로든 준비가 안 되면 null을 돌려준다: 3D 모형만 쉬고, 한 장 그리기·방향 그림은 그대로 돈다
// (여기서 던지면 일꾼 전체가 시작하자마자 죽고 launchd가 계속 다시 띄운다).
//   AVATAR_MODELS=0, DB 어댑터에 모형 함수가 없음 → null
//   AVATAR_MODEL_PROVIDER: trellis(기본) | meshy | 그 밖(경고 뒤 null)
//   meshy: 키 파일이 없거나 못 읽거나 값이 비었음, GLB 다듬기 라이브러리가 없음, 같은 키나 장부를 다른 프로세스가 쥐고 있음
//          → 경고 뒤 null. 같은 키로는 meshy 일꾼 하나만 돈다(meshy.mjs의 keyLock: 장부 파일을 일꾼마다 따로 두어도 그렇다)
import { createGlbTools } from './glb.mjs';
import { DEFAULT_LEDGER_FILE, createMeshyService, fileLedger, keyLock } from './meshy.mjs';
import { DEFAULT_MODEL_URL, createModelService, modelProviderOf } from './models.mjs';
import { readSecretFile } from './proxy.mjs';

const brief = (err) => ({ name: err?.name, code: err?.code, message: String(err?.message ?? '').slice(0, 200) });

/**
 * env: 일꾼의 환경 변수, db: DB 어댑터(modelClaim이 있어야 한다), log(level, msg, extra).
 * 시험은 readSecret·glbTools·ledgerOf·lockOf(키 → 키 잠금)·fetch로 가짜를 넣는다
 */
export async function createModelProvider({
  env, db, log = () => {}, readSecret = readSecretFile, glbTools = createGlbTools, ledgerOf = fileLedger, lockOf = keyLock, fetch,
}) {
  if (env.AVATAR_MODELS === '0' || typeof db?.modelClaim !== 'function') return null;
  const provider = modelProviderOf(env.AVATAR_MODEL_PROVIDER);
  if (provider === 'trellis') return createModelService({ baseUrl: env.AVATAR_MODEL_URL || DEFAULT_MODEL_URL, ...(fetch ? { fetch } : {}) });
  if (provider !== 'meshy') {
    log('warn', 'unknown AVATAR_MODEL_PROVIDER: models off', { provider: String(env.AVATAR_MODEL_PROVIDER).slice(0, 20) });
    return null;
  }
  let apiKey = '';
  try {
    if (!env.MESHY_API_KEY_FILE) throw Object.assign(new Error('MESHY_API_KEY_FILE is not set'), { code: 'no_key_file' });
    apiKey = readSecret(env.MESHY_API_KEY_FILE, 'MESHY_API_KEY');
  } catch (err) {
    log('warn', 'meshy key unavailable: models off', { name: err?.name, code: err?.code });
    return null;
  }
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    log('warn', 'meshy key empty: models off', {});
    return null;
  }
  const glb = await Promise.resolve().then(glbTools).catch((err) => {
    log('warn', 'glb tools unavailable: models off', brief(err));
    return null;
  });
  if (!glb) return null;
  try {
    return createMeshyService({
      apiKey, tidy: glb.tidy, ledger: ledgerOf(env.MESHY_STATE_FILE || DEFAULT_LEDGER_FILE), lock: lockOf(apiKey), log,
      dailyMax: env.MESHY_DAILY_MAX, geometry: env.MESHY_GEOMETRY, targetPolycount: env.MESHY_TARGET_POLYCOUNT,
      imageEnhancement: env.MESHY_IMAGE_ENHANCEMENT, yaw: env.MESHY_YAW, ...(fetch ? { fetch } : {}),
    });
  } catch (err) {
    // 같은 키를 다른 프로세스가 쓰고 있음(같은 키로 도는 두 번째 일꾼, --once 실행, 한 건 시험), 장부를 다른 프로세스가
    // 쥐고 있음 등: 3D 모형만 끈다
    const why = err?.code === 'key_locked' ? 'meshy key in use by another process: models off'
      : err?.code === 'ledger_locked' ? 'meshy ledger in use by another process: models off' : 'meshy setup failed: models off';
    log('warn', why, brief(err));
    return null;
  }
}
