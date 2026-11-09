import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { isUuid } from '@/lib/avatar/rules';
import { AVATAR_BUCKET } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 캐릭터 그림 한 장. 명단 손님에게만, ready인 그림만 준다. 그 밖에는 있는지조차 알리지 않게 404.
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return new Response('Not found', HIDDEN);
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return new Response('Not found', HIDDEN);
  // 경로 확인과 파일 읽기 모두 보는 사람의 세션으로(DB 함수와 저장소 정책이 한 번씩 더 막는다)
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc('avatar_char_path', { p_id: id });
  if (error || typeof path !== 'string' || !path) return new Response('Not found', HIDDEN);
  const { data: file, error: readError } = await supabase.storage.from(AVATAR_BUCKET).download(path);
  if (readError || !file) return new Response('Not found', HIDDEN);
  return new Response(file.stream(), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Content-Disposition': 'inline',
    },
  });
}

// 내 캐릭터 지우기(걷기 화면). 그림만 지우고 원본은 「내 캐릭터」 화면에서 따로 지운다.
// 아직 그리는 중이면 작업을 거두고 원본도 지운다. 파일을 먼저 지우고(실패하면 DB는 그대로), 그다음 DB에 적는다.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id) || !sameOrigin(request)) return new Response('Not found', HIDDEN);
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return new Response('Not found', HIDDEN);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('avatars')
    .select('status, original_path, image_path')
    .eq('id', id)
    .maybeSingle();
  const r = row as { status: string; original_path: string | null; image_path: string | null } | null;
  if (!r || r.status === 'deleted') return new Response('Not found', HIDDEN);
  const inFlight = r.status === 'pending' || r.status === 'queued' || r.status === 'drawing';
  const paths = [r.image_path, inFlight ? r.original_path : null].filter((p): p is string => typeof p === 'string');
  if (paths.length) {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
    if (error) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const { data: done, error } = await supabase.rpc('avatar_forget', { p_id: id, p_part: 'character' });
  if (error || done !== true) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// 다른 사이트에서 몰래 보내는 요청을 막는다(쿠키가 붙어 와도)
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
