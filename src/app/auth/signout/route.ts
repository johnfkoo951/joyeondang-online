import { NextResponse, type NextRequest } from 'next/server';
import { handoffAdmin } from '@/lib/app-handoff-server';
import { supabaseReady } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (supabaseReady()) {
    const supabase = await createClient();
    // 로그아웃하면 이 사람의 앱 로그인 코드(0027)도 지운다: 로그아웃 전에 받아 둔 코드로 새 세션을 만들지 못하게
    const { data } = await supabase.auth.getClaims();
    const uid = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
    await supabase.auth.signOut();
    const admin = uid ? handoffAdmin() : null;
    if (admin && uid) {
      await admin.from('app_handoff').delete().eq('user_id', uid).then(
        () => undefined,
        () => undefined,
      );
    }
  }
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
