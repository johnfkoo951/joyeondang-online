import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';

/** 지금 요청한 사람의 세션으로 DB를 부른다. 요청마다 새로 만든다(Fluid 인스턴스 공유 대비). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서 불리면 쿠키를 못 쓴다. proxy.ts가 세션을 갱신하므로 괜찮다.
        }
      },
    },
  });
}

/** 로그인과 무관한 공개 데이터(석등 숫자, 문패)를 읽는다. 쿠키를 읽지 않으므로 캐시할 수 있다. */
export function createAnonClient() {
  return createPlainClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
