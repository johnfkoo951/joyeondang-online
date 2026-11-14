import { NextResponse } from 'next/server';
import { createHandoff } from '@/lib/app-handoff';
import { handoffAdmin, handoffSecret, supabaseHandoffStore } from '@/lib/app-handoff-server';
import { NO_STORE, sameOrigin } from '@/lib/chat-server';
import { supabaseReady } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

// 앱 로그인 코드 받기: 사파리(로그인한 쪽)에서 부른다. 코드는 이 응답에만 실리고 서버에는 해시만 남는다.
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'forbidden');
  const admin = handoffAdmin();
  const secret = handoffSecret();
  if (!supabaseReady() || !admin || !secret) return fail(503, 'not_ready');

  // getClaims(서명만 확인)가 아니라 getUser(인증 서버에 묻기)로 본다: 로그아웃으로 지운 세션의 토큰이 아직 만료 전이어도
  // 여기서 새 코드를 받아 새 세션으로 바꾸지 못하게(코드는 새 세션을 만드는 길이라 더 엄격하게 본다)
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (error || typeof uid !== 'string' || !uid) return fail(401, 'signed_out');

  try {
    const r = await createHandoff(supabaseHandoffStore(admin), uid, secret);
    if (!r.ok) return fail(429, 'busy');
    return NextResponse.json({ code: r.code, expiresAt: r.expiresAt }, { headers: NO_STORE });
  } catch {
    return fail(500, 'error');
  }
}
