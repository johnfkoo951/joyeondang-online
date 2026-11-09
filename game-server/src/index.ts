// 조연당 함께 걷기 서버의 입구. 할 일은 문지기뿐이다:
// Origin·공간 이름·출입증을 확인하고, 통과하면 그 공간의 Durable Object(Space)에 WebSocket을 넘긴다.
// 나쁜 요청은 DO를 깨우지 않고 여기서 돌려보낸다(무료 요금제 요청 수 아끼기).
import { PLAYER_HEADER } from './protocol';
import { verifyToken } from './token';
import type { Space } from './space';

export { Space } from './space';

export type Env = {
  SPACE: DurableObjectNamespace<Space>;
  /** 사이트와 같은 서명 키. `wrangler secret put GAME_TOKEN_SECRET`, 로컬은 .dev.vars */
  GAME_TOKEN_SECRET?: string;
  /** 쉼표 목록. 예: https://example.com,http://localhost:3331 */
  ALLOWED_ORIGINS?: string;
};

const SPACE_RE = /^(house:real|room:[a-z0-9-]{2,32})$/;

function reply(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
}

function originAllowed(origin: string | null, list: string | undefined): boolean {
  if (!origin || !list) return false;
  return list.split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return reply(200, 'ok');
    if (url.pathname !== '/connect') return reply(404, 'not found');
    if (req.method !== 'GET') return reply(405, 'method not allowed');
    if ((req.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') return reply(426, 'websocket only');
    if (!originAllowed(req.headers.get('Origin'), env.ALLOWED_ORIGINS)) return reply(403, 'origin not allowed');

    const space = url.searchParams.get('space') ?? '';
    if (!SPACE_RE.test(space)) return reply(400, 'bad space');
    const secret = env.GAME_TOKEN_SECRET ?? '';
    if (secret.length < 16) return reply(503, 'not configured');

    const check = await verifyToken(url.searchParams.get('token') ?? '', secret);
    if (!check.ok) return reply(401, check.reason === 'expired' ? 'token expired' : 'bad token');

    const headers = new Headers(req.headers);
    headers.delete(PLAYER_HEADER);
    headers.set(PLAYER_HEADER, encodeURIComponent(JSON.stringify(check.payload)));
    const stub = env.SPACE.get(env.SPACE.idFromName(space));
    return stub.fetch(new Request(req.url, { method: 'GET', headers }));
  },
} satisfies ExportedHandler<Env>;
