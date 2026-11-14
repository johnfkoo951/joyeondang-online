import 'server-only';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';
import type { HandoffStore } from '@/lib/app-handoff';

// 앱 로그인 이어받기의 Supabase 쪽. 표(app_handoff)는 비밀 키로만 읽고 쓴다(0027: RLS를 켜고 정책을 두지 않았다).

/** 비밀 키 연결. 없으면 null(이어받기를 열지 않는다) */
export function handoffAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 코드 해시의 비밀: 서버에만 있는 Supabase 비밀 키를 쓴다(새 환경 변수를 두지 않는다). 키를 바꾸면 남은 코드(5분)만 무효가 된다 */
export function handoffSecret(): string | null {
  const key = process.env.SUPABASE_SECRET_KEY ?? '';
  return key.length >= 16 ? key : null;
}

export function supabaseHandoffStore(admin: SupabaseClient): HandoffStore {
  return {
    async recentCount(userId, sinceIso) {
      const { count, error } = await admin
        .from('app_handoff')
        .select('code_hash', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', sinceIso);
      if (error) throw error;
      return count ?? 0;
    },
    async insert(row) {
      const { error } = await admin.from('app_handoff').insert(row);
      if (error) throw error;
    },
    async claim(codeHash, nowIso) {
      // 한 번의 UPDATE … RETURNING: 같은 코드를 둘이 함께 넣어도 한 사람만 받는다
      const { data, error } = await admin
        .from('app_handoff')
        .update({ used_at: nowIso })
        .eq('code_hash', codeHash)
        .is('used_at', null)
        .gt('expires_at', nowIso)
        .select('user_id')
        .maybeSingle();
      if (error) throw error;
      const id = (data as { user_id?: unknown } | null)?.user_id;
      return typeof id === 'string' ? id : null;
    },
    async release(codeHash, usedIso) {
      // 방금 이 요청이 쓴 것으로 표시한 줄만(같은 시각), 아직 살아 있을 때만 되돌린다
      const { error } = await admin
        .from('app_handoff')
        .update({ used_at: null })
        .eq('code_hash', codeHash)
        .eq('used_at', usedIso)
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
    },
    async purge(beforeIso) {
      const { error } = await admin.from('app_handoff').delete().lt('expires_at', beforeIso);
      if (error) throw error;
    },
  };
}

/** 요청한 주소(시도 횟수 세기에만 쓴다. 저장하지 않는다) */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}
