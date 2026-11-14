// 운영 DB·저장소 연결(Supabase 비밀 키). 일꾼만 쓴다. 키는 받기만 하고 출력하지 않는다.
import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'avatars';

export function createSupabase({ url, secretKey }) {
  if (!url || !secretKey) throw new Error('SUPABASE_URL and secret key are required');
  return wrapSupabase(createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}

/**
 * 연결 하나를 일꾼이 쓰는 모양({db, store})으로 감싼다. 운영은 createSupabase가 진짜 연결을 넣고,
 * 시험은 가짜 연결을 넣어 DB 함수에 넘기는 이름과 인자를 본다(인자 이름이 마이그레이션과 다르면 함수를 찾지 못한다).
 */
/** 부른 이름·인자 이름의 DB 함수가 없다(PostgREST PGRST202, Postgres 42883 undefined_function) */
const missingFunction = (error) => error?.code === 'PGRST202' || error?.code === '42883';

export function wrapSupabase(sb) {
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: 'db_error', missing: missingFunction(error) });
    return data;
  };
  const bucket = () => sb.storage.from(BUCKET);
  return {
    db: {
      // 한 장 그림(0003_avatars.sql)
      claim: (worker, leaseSec) => rpc('avatar_claim', { p_worker: worker, p_lease_seconds: leaseSec }),
      release: (id, worker, delaySec) => rpc('avatar_release', { p_id: id, p_worker: worker, p_delay_seconds: delaySec }),
      settle: async (id, status, { imagePath = null, model = null, reason = null } = {}) =>
        (await rpc('avatar_settle', {
          p_id: id, p_status: status, p_original_path: null, p_image_path: imagePath, p_model: model, p_reason: reason,
        })) === true,
      beat: (worker, version) => rpc('avatar_worker_beat', { p_worker: worker, p_version: version }),

      // 방향 그림 묶음(0015_avatar_views.sql). 그 마이그레이션을 올리기 전에는 함수가 없어 db_error로 던진다
      /** 묶음을 그릴 그림 하나: {id, user_id, image_path, attempts, sheet_fails} 또는 null(할 일 없음). 지금 걷기에 쓰는 캐릭터만 온다 */
      viewsClaim: async (worker, leaseSec) =>
        (await rpc('avatar_views_claim', { p_worker: worker, p_lease_seconds: leaseSec })) ?? null,
      /** 조금 뒤 다시 잡히게 돌려놓는다. 내가 잡은 줄이 아니면 false. sheet가 참이면 시트 탓 실패로 따로 센다 */
      viewsRelease: async (id, worker, delaySec, sheet = false) =>
        (await rpc('avatar_views_release', { p_id: id, p_worker: worker, p_delay_seconds: delaySec, p_sheet: sheet === true })) === true,
      /**
       * ready | failed로 적는다. false면 그사이 본인이 그림을 지운 것: 부른 쪽이 방금 올린 묶음 파일을 거둔다.
       * worker(잡은 일꾼)를 주면 failed는 지금 그 줄을 잡고 있는 일꾼의 것만 적힌다(임대가 넘어간 뒤의 옛 일꾼은 false)
       */
      viewsSettle: async (id, status, { mode = null, model = null, reason = null, worker = null } = {}) =>
        (await rpc('avatar_views_settle', {
          p_id: id, p_status: status, p_mode: mode, p_model: model, p_reason: reason, p_worker: worker,
        })) === true,
      /** 그림이 지워졌는데 저장소에 남은 묶음 파일의 이름들(없어야 정상) */
      viewsStrays: async (limit = 100) => {
        const names = await rpc('avatar_views_strays', { p_limit: limit });
        return Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
      },

      // 3D 모형(0016_avatar_models.sql, 잡는 조건은 0021). 그 마이그레이션을 올리기 전에는 함수가 없어 db_error로 던진다
      /**
       * 모형을 만들 그림 하나: {id, user_id, image_path, attempts, bad_fails, requested_at, via} 또는 null(할 일 없음).
       * 0021부터는 사람이 「3D 만들기」로 요청한 그림 가운데 이 일꾼의 제공자(via: meshy | trellis)로 요청한 것만 요청한 차례로
       * 온다(requested_at = 요청한 때, via = 요청할 때 그 사람에게 알린 곳). 0021은 제공자를 넘기지 않는 부름에 아무것도 주지 않는다.
       * 그 함수가 없는 DB(0021 전)에서는 제공자 없이 0016의 잡기를 부른다: 지금 걷기에 쓰는 캐릭터를 저절로 주고
       * requested_at·via가 없다(바깥 3D 서비스는 그런 줄을 보내지 않고 3D 모형을 멈춘다. models.mjs의 processModel)
       */
      modelClaim: async (worker, leaseSec, via) => {
        const old = { p_worker: worker, p_lease_seconds: leaseSec };
        if (typeof via !== 'string') return (await rpc('avatar_model_claim', old)) ?? null;
        try {
          return (await rpc('avatar_model_claim', { ...old, p_via: via })) ?? null;
        } catch (err) {
          if (err?.missing !== true) throw err;
          return (await rpc('avatar_model_claim', old)) ?? null;
        }
      },
      /**
       * 바깥 3D 서비스가 이 그림의 작업을 만들었다(값이 들었다, 0021). DB가 그 요청을 그 사람의 돈이 든 시도로 한 번 센다
       * (같은 요청에서 다시 알려도 한 번). 그 줄이 없으면 false
       */
      modelJob: async (id) => (await rpc('avatar_model_job', { p_id: id })) === true,
      /** 조금 뒤 다시 잡히게 돌려놓는다. 내가 잡은 줄이 아니면 false. bad가 참이면 결과가 이상한 실패로 따로 센다 */
      modelRelease: async (id, worker, delaySec, bad = false) =>
        (await rpc('avatar_model_release', { p_id: id, p_worker: worker, p_delay_seconds: delaySec, p_bad: bad === true })) === true,
      /**
       * ready | failed로 적는다. false면 그사이 본인이 그림을 지운 것: 부른 쪽이 방금 올린 모형 파일을 거둔다.
       * worker(잡은 일꾼)를 주면 failed는 지금 그 줄을 잡고 있는 일꾼의 것만 적힌다(임대가 넘어간 뒤의 옛 일꾼은 false)
       */
      modelSettle: async (id, status, { maker = null, reason = null, worker = null } = {}) =>
        (await rpc('avatar_model_settle', {
          p_id: id, p_status: status, p_maker: maker, p_reason: reason, p_worker: worker,
        })) === true,
      /** 그림이 지워졌는데 저장소에 남은 모형 파일의 이름들(없어야 정상) */
      modelStrays: async (limit = 100) => {
        const names = await rpc('avatar_model_strays', { p_limit: limit });
        return Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
      },

      /**
       * 그림 줄의 상태(원본 에셋 보관 폴더 정리용, assets.mjs의 prune): Map(id → status). 없는 줄은 빠진다.
       * 비밀 키라 모든 사람의 줄을 읽는다. 읽기만 하고, id와 status 두 칸만
       */
      characterStates: async (ids) => {
        const list = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string').slice(0, 200);
        if (!list.length) return new Map();
        const { data, error } = await sb.from('avatars').select('id, status').in('id', list);
        if (error) throw Object.assign(new Error(`avatars: ${error.message}`), { code: 'db_error' });
        return new Map((Array.isArray(data) ? data : []).filter((r) => typeof r?.id === 'string').map((r) => [r.id, r.status]));
      },
    },
    store: {
      async download(path) {
        const { data, error } = await bucket().download(path);
        if (error || !data) throw Object.assign(new Error(`download: ${error?.message ?? 'empty'}`), { code: 'storage_error' });
        return new Uint8Array(await data.arrayBuffer());
      },
      async upload(path, bytes, contentType) {
        const { error } = await bucket().upload(path, bytes, { contentType, upsert: true });
        if (error) throw Object.assign(new Error(`upload: ${error.message}`), { code: 'storage_error' });
      },
      async remove(paths) {
        const { error } = await bucket().remove(paths);
        if (error) throw Object.assign(new Error(`remove: ${error.message}`), { code: 'storage_error' });
      },
    },
  };
}

// 묶음 파일 이름의 모양(<uid>/views/<그림 id>.v1l.webp, .v1s.webp). src/lib/avatar/rules.ts의 viewsPath()와 같다
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VIEWS_FILE = new RegExp(`^${UUID}/views/${UUID}\\.v1[ls]\\.webp$`);

/**
 * 지운 그림의 남은 묶음 파일을 저장소에서 치운다(한 번에 limit개까지). 돌려주는 값은 치운 파일 수.
 * 본인이 그림을 지우면 사이트가 묶음 파일도 함께 지우고, 그리는 중이었으면 일꾼이 올린 것을 거둔다.
 * 그런데 일꾼이 올린 뒤 거두기 전에 멈추면 파일이 남는다. 그 파일을 위한 마지막 청소다.
 * DB가 준 이름이라도 묶음 파일 모양이 아니면 지우지 않는다(원본 사진과 캐릭터 그림은 절대 건드리지 않는다).
 */
export async function sweepViewStrays({ db, store }, limit = 100) {
  const names = (await db.viewsStrays(limit)).filter((n) => VIEWS_FILE.test(n));
  if (!names.length) return 0;
  await store.remove(names);
  return names.length;
}

// 모형 파일 이름의 모양(<uid>/models/<그림 id>.v1.glb). src/lib/avatar/rules.ts의 modelPath()와 같다
const MODEL_FILE = new RegExp(`^${UUID}/models/${UUID}\\.v1\\.glb$`);

/**
 * 지운 그림의 남은 모형 파일을 저장소에서 치운다(한 번에 limit개까지). 돌려주는 값은 치운 파일 수.
 * 묶음 청소(sweepViewStrays)와 같은 까닭의 마지막 청소다. DB가 준 이름이라도 모형 파일 모양이 아니면 지우지 않는다.
 */
export async function sweepModelStrays({ db, store }, limit = 100) {
  const names = (await db.modelStrays(limit)).filter((n) => MODEL_FILE.test(n));
  if (!names.length) return 0;
  await store.remove(names);
  return names.length;
}
