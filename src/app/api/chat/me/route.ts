import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { HIDDEN, NO_STORE, chatSecret, ensureSubject } from '@/lib/chat-server';
import { gameName, gameSubject } from '@/lib/game-token';
import { loadMyLook } from '@/lib/look-server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 걷기 화면 대화·접속자·멘션에서 「나」: { sub, name, look, canChat, admin }.
// sub는 함께 걷기 서버와 같은 사람 구분값(gameSubject). 명단 손님부터만 준다. 그 밖에는(서명 키가 없을 때도) 404.
// canChat은 sub를 DB에 적었을 때만 true(비밀 키가 없거나 0017을 아직 올리지 않았으면 false: 화면은 대화를 「준비 중」으로 둔다).
export async function GET() {
  await connection();
  const secret = chatSecret();
  if (!secret) return new Response('Not found', HIDDEN);
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse')) return new Response('Not found', HIDDEN);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (typeof uid !== 'string' || !uid) return new Response('Not found', HIDDEN);

  const sub = gameSubject(uid, secret);
  const [canChat, look] = await Promise.all([ensureSubject(uid, sub), loadMyLook(viewer)]);
  return Response.json(
    { sub, name: gameName(viewer.name), look, canChat, admin: viewer.role === 'admin' },
    { headers: NO_STORE },
  );
}
