import { randomUUID } from 'node:crypto';
import { connection } from 'next/server';
import { dollCss } from '@/content/dolls';
import { canSee, canUse } from '@/lib/access';
import { GAME_TOKEN_TTL, gameName, gameSubject, signGameToken, type GameRole } from '@/lib/game-token';
import { loadMyLook } from '@/lib/look-server';
import { previewForRequest } from '@/lib/preview-request';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 함께 걷기 출입증. 명단에 있는 손님부터만 준다. 그 밖에는(서버 주소·서명 키가 없을 때도) 있는지조차 알리지 않게 404.
// ?observe=1이면 관전 출입증(역할 'observer'): 가족·관리자만. 게임 서버가 사람 수에 세지 않고 남에게 보이지 않게 하며 받기만 하게 한다
// (컨트롤 룸처럼 사람들을 지켜보는 화면이 쓴다). 그 밖의 사람에게는 손님이어도 404.
// 이 맥의 로컬 미리보기(JY_LOCAL_PREVIEW)에서는 /api/house와 같은 규칙으로 손님처럼 본다(창마다 다른 사람). 관전 출입증도 같다.
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === 'string' && sub ? sub : null;
}

export async function GET(request: Request) {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳히지 않게)
  await connection();
  const url = process.env.GAME_SERVER_URL ?? '';
  const secret = process.env.GAME_TOKEN_SECRET ?? '';
  if (!/^(wss?|https?):\/\//.test(url) || secret.length < 16) return new Response('Not found', HIDDEN);

  const observe = new URL(request.url).searchParams.get('observe') === '1';
  const viewer = await getViewer();
  let role: GameRole;
  let uid: string | null;
  if (observe ? canSee(viewer.role, 'family') : canUse(viewer.role, 'realHouse')) {
    role = observe ? 'observer' : (viewer.role as GameRole);
    uid = await userId();
  } else if (await previewForRequest()) {
    role = observe ? 'observer' : 'guest';
    uid = `preview:${randomUUID()}`;
  } else {
    return new Response('Not found', HIDDEN);
  }
  if (!uid) return new Response('Not found', HIDDEN);

  const exp = Math.floor(Date.now() / 1000) + GAME_TOKEN_TTL;
  // 겉모습은 프로필에서 읽어 고친 값(다른 사람 화면에 그 모습으로 보인다). 미리보기 손님은 기본 인형.
  // 관전자는 남에게 보이지 않으므로 겉모습을 싣지 않는다
  const look = observe ? undefined : await loadMyLook(viewer);
  const token = signGameToken(
    { sub: gameSubject(uid, secret), name: gameName(viewer.name), color: dollCss(viewer.dollColor), role, exp, ...(look ? { look } : {}) },
    secret,
  );
  return Response.json(
    { token, url: url.replace(/\/+$/, ''), exp },
    { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } },
  );
}
