import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { isUuid } from '@/lib/avatar/rules';
import { GAME_TOKEN_TTL, gameSubject, signLookProof } from '@/lib/game-token';
import { ownsAvatar } from '@/lib/look-server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 사진 겉모습 증표. 함께 걷는 중에 사진 캐릭터로 바꾸면, 붙어 있는 연결의 출입증에는 옛 겉모습이 실려 있다.
// 걷기 화면이 겉모습을 알리기 전에 여기서 「내 그림이 맞다」는 짧은 서명을 받아 함께 보낸다(게임 서버가 확인).
//   GET /api/game-token/look?id=<그림 id> → { proof, exp }
// 명단 손님의 자기 그림(ready)일 때만 준다. 그 밖에는 /api/game-token처럼 있는지조차 알리지 않게 404.
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

export async function GET(request: Request) {
  await connection();
  const secret = process.env.GAME_TOKEN_SECRET ?? '';
  if (secret.length < 16) return new Response('Not found', HIDDEN);
  const id = new URL(request.url).searchParams.get('id');
  if (!isUuid(id)) return new Response('Not found', HIDDEN);

  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse')) return new Response('Not found', HIDDEN);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (typeof uid !== 'string' || !uid) return new Response('Not found', HIDDEN);
  if (!(await ownsAvatar(supabase, id))) return new Response('Not found', HIDDEN);

  const exp = Math.floor(Date.now() / 1000) + GAME_TOKEN_TTL;
  const proof = signLookProof(gameSubject(uid, secret), `/api/avatar/${id}`, exp, secret);
  return Response.json({ proof, exp }, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
