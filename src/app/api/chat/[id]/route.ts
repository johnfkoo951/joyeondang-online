import { connection } from 'next/server';
import { isUuid } from '@/lib/avatar/rules';
import { HIDDEN, sameOrigin } from '@/lib/chat-server';
import { createClient } from '@/lib/supabase/server';

// 대화 한 줄 지우기. 내 글은 언제든(명단에서 빠진 뒤에도), 관리자는 누구의 글이든. 판정은 DB(chat_delete)가 한다.
// 지우면 줄째 지우고(본문을 남기지 않는다), 열린 대화창들에는 DB 트리거가 'gone'을 보낸다. 지웠으면 204, 아니면 404.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id) || !sameOrigin(request)) return new Response('Not found', HIDDEN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('chat_delete', { p_id: id });
  if (error) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (data !== true) return new Response('Not found', HIDDEN);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
