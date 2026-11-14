import { connection } from 'next/server';
import { isUuid } from '@/lib/avatar/rules';
import { canUse } from '@/lib/access';
import { HIDDEN, NO_STORE, chatSecret, cursorTime, ensureSubject, readBody, sameOrigin, wireFromRow } from '@/lib/chat-server';
import { gameSubject } from '@/lib/game-token';
import { CHAT_REASON_TEXT, chatReason, readChatInput, readChatMessage, type ChatReason } from '@/lib/social';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 걷기 화면 대화(전체 이력). 명단 손님 이상만. 권한·빠르기·멘션 받는 사람은 DB 함수(chat_list, chat_post)가 판정한다.
//   GET  ?limit=50                         가장 새 글부터
//        ?before=<at>&bid=<id>&limit=50   그보다 앞의 글(위로 올려 옛 글 보기). at·id는 앞서 받은 글의 것 그대로
//        ?after=<at>&aid=<id>&limit=100   그보다 뒤의 글을 오래된 것부터(대화창이 놓친 새 글 채우기)
//        → { messages: [...](늘 새것부터), more }
//   POST { body, mentions: sub[], space, via? } → 201 { ok, message } | 4xx { ok: false, reason, message }

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: NO_STORE });
const fail = (status: number, reason: ChatReason) => reply(status, { ok: false, reason, message: CHAT_REASON_TEXT[reason] });

export async function GET(request: Request) {
  await connection();
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse')) return new Response('Not found', HIDDEN);
  const q = new URL(request.url).searchParams;
  const before = cursorTime(q.get('before'));
  const after = cursorTime(q.get('after'));
  const bid = q.get('bid');
  const aid = q.get('aid');
  const limit = Math.min(100, Math.max(1, Number.parseInt(q.get('limit') ?? '50', 10) || 50));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_list', {
    p_before: after ? null : before,
    p_before_id: !after && before && isUuid(bid) ? bid : null,
    p_after: after,
    p_after_id: after && isUuid(aid) ? aid : null,
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) return reply(503, { messages: [], more: false, reason: 'not_ready' });
  const rows = (data as Record<string, unknown>[]).map(wireFromRow).filter((m) => m !== null);
  rows.sort((a, b) => b.ms - a.ms || (a.id < b.id ? 1 : -1));
  return reply(200, { messages: rows, more: data.length >= limit });
}

export async function POST(request: Request) {
  await connection();
  if (!sameOrigin(request)) return fail(403, 'not_guest');
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse')) return new Response('Not found', HIDDEN);
  const raw = await readBody(request, 8 * 1024);
  const read = readChatInput(raw);
  if (!read.ok) return fail(400, read.reason);
  const { body, mentions, space, via } = read.input;

  const supabase = await createClient();
  const send = () => supabase.rpc('chat_post', { p_body: body, p_mentions: mentions, p_space: space, p_via: via });
  let { data, error } = await send();
  // 이 사람의 sub를 아직 적지 않았으면(대화창을 열기 전에 Enter로 말한 경우 등) 적고 한 번 더
  if (!error && (data as { reason?: unknown } | null)?.reason === 'no_subject') {
    const secret = chatSecret();
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (secret && typeof uid === 'string' && (await ensureSubject(uid, gameSubject(uid, secret), true))) ({ data, error } = await send());
  }
  if (error) return fail(503, 'not_ready');
  const out = (data ?? {}) as { ok?: unknown; reason?: unknown; message?: unknown };
  if (out.ok !== true) {
    const reason = chatReason(out.reason);
    return fail(reason === 'too_fast' || reason === 'too_many' ? 429 : reason === 'not_guest' ? 404 : reason === 'no_subject' ? 503 : 400, reason);
  }
  const message = readChatMessage(out.message);
  if (!message) return fail(503, 'error');
  return reply(201, { ok: true, message: { ...message, mine: true } });
}
