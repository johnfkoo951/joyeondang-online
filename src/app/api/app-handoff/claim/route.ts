import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { claimHandoff, makeAttemptGate } from '@/lib/app-handoff';
import { clientIp, handoffAdmin, handoffSecret, supabaseHandoffStore } from '@/lib/app-handoff-server';
import { NO_STORE, readBody, sameOrigin } from '@/lib/chat-server';
import { supabaseReady } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

// 앱 로그인 코드 넣기: 홈 화면 앱(로그인 안 된 쪽)에서 부른다. 코드가 맞으면 그 사람의 세션을 이 앱의 쿠키에 만든다.
// 세션 만들기: 비밀 키로 그 사람의 일회용 로그인 토큰(메일은 보내지 않는다)을 만들고, 이 요청의 세션 클라이언트로 바로 확인한다.
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });
const gate = makeAttemptGate(10, 10 * 60_000);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'forbidden');
  if (!gate(clientIp(request))) return fail(429, 'busy');
  const admin = handoffAdmin();
  const secret = handoffSecret();
  if (!supabaseReady() || !admin || !secret) return fail(503, 'not_ready');

  const body = await readBody(request, 1024);
  const raw = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;

  const store = supabaseHandoffStore(admin);
  let claimed: Awaited<ReturnType<typeof claimHandoff>>;
  try {
    claimed = await claimHandoff(store, raw, secret);
  } catch {
    return fail(500, 'error');
  }
  if (!claimed) return fail(400, 'bad_code');
  // 코드는 먼저 쓴 것으로 표시했다. 아래에서 세션을 만들지 못하면(잠깐의 장애) 같은 코드로 다시 해 볼 수 있게 되돌린다
  const giveBack = async (res: Response) => {
    await store.release(claimed.codeHash, claimed.usedIso).catch(() => undefined);
    return res;
  };

  const { data: found, error: findError } = await admin.auth.admin.getUserById(claimed.userId);
  if (findError) return giveBack(fail(502, 'error'));
  const email = found?.user?.email;
  if (!email) return fail(400, 'no_email');

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return giveBack(fail(502, 'error'));
  // 확인할 때의 종류는 인증 서버가 알려 준 대로 쓴다(이메일을 아직 확인하지 않은 계정이면 magiclink가 아니라 signup으로 온다)
  const verifyType = (link.properties.verification_type || 'magiclink') as EmailOtpType;

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: verifyType, token_hash: tokenHash });
  if (verifyError) return giveBack(verifyError.status === 429 ? fail(429, 'busy') : fail(502, 'error'));

  // 구글 로그인 뒤와 같이 명단과 맞춰 본다(이미 맞춘 사람이면 그대로)
  await supabase.rpc('sync_my_roster').then(
    () => undefined,
    () => undefined,
  );
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
