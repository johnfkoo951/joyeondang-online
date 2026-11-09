// 운영 DB·저장소 연결(Supabase 비밀 키). 일꾼만 쓴다. 키는 받기만 하고 출력하지 않는다.
import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'avatars';

export function createSupabase({ url, secretKey }) {
  if (!url || !secretKey) throw new Error('SUPABASE_URL and secret key are required');
  const sb = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: 'db_error' });
    return data;
  };
  const bucket = () => sb.storage.from(BUCKET);
  return {
    db: {
      claim: (worker, leaseSec) => rpc('avatar_claim', { p_worker: worker, p_lease_seconds: leaseSec }),
      release: (id, worker, delaySec) => rpc('avatar_release', { p_id: id, p_worker: worker, p_delay_seconds: delaySec }),
      settle: async (id, status, { imagePath = null, model = null, reason = null } = {}) =>
        (await rpc('avatar_settle', {
          p_id: id, p_status: status, p_original_path: null, p_image_path: imagePath, p_model: model, p_reason: reason,
        })) === true,
      beat: (worker, version) => rpc('avatar_worker_beat', { p_worker: worker, p_version: version }),
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
