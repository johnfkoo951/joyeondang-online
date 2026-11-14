import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { forgetAvatar, type ForgetRow } from '@/lib/avatar/forget';
import { versionedPic } from '@/lib/avatar/pic-version';
import { previewResponse, readPreviewAvatar } from '@/lib/avatar/preview-source';
import { isUuid } from '@/lib/avatar/rules';
import { AVATAR_BUCKET } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 캐릭터 그림 한 장. 명단 손님에게만, ready인 그림만 준다(0024부터는 관리자가 다시 그리는 동안의 옛 그림도). 그 밖에는 있는지조차
// 알리지 않게 404. 0024부터는 그린 차례(판)를 ETag로 싣고 1분 캐시한다: 다시 그린 그림이 다른 화면에 한 시간씩 옛 그림으로
// 남지 않게(src/lib/avatar/pic-version.ts). 판 함수가 없는 옛 DB면 아래 옛 길(판 없이 한 시간).
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return new Response('Not found', HIDDEN);
  // 이 컴퓨터 미리보기에서만: 미리보기 폴더에 둔 그림을 로그인 없이 준다(운영에서는 늘 건너뛴다)
  const local = await readPreviewAvatar(id, 'char');
  if (local) return previewResponse(local);
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return new Response('Not found', HIDDEN);
  // 경로 확인과 파일 읽기 모두 보는 사람의 세션으로(DB 함수와 저장소 정책이 한 번씩 더 막는다)
  const supabase = await createClient();
  const versioned = await versionedPic(supabase, request, id, AVATAR_BUCKET, 'char');
  if (versioned) return versioned;
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

// 내 캐릭터 지우기(걷기 화면). 그림과 그 그림으로 그린 방향 그림 묶음을 지우고, 원본은 「내 캐릭터」 화면에서 따로 지운다.
// 아직 그리는 중이면 작업을 거두고 원본도 지운다. 무엇을 어떤 순서로 지우는지는 forgetAvatar가 정한다
// (파일 먼저, 그다음 DB, 묶음은 한 번 더).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id) || !sameOrigin(request)) return new Response('Not found', HIDDEN);
  // 404는 「이미 지워졌다」로 읽히므로(화면이 지웠다고 알린다) 로그인 끊김·권한 없음·읽기 실패는 따로 답한다
  const viewer = await getViewer();
  if (viewer.unsure) return new Response(null, { status: 503, headers: NO_STORE });
  if (!viewer.signedIn) return new Response(null, { status: 401, headers: NO_STORE });
  if (!canSee(viewer.role, 'guests')) return new Response(null, { status: 403, headers: NO_STORE });
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('avatars')
    .select('id, user_id, status, original_path, image_path')
    .eq('id', id)
    .maybeSingle();
  if (error) return new Response(null, { status: 503, headers: NO_STORE });
  const r = row as ForgetRow | null;
  if (!r || r.status === 'deleted') return new Response('Not found', HIDDEN);
  const result = await forgetAvatar(supabase, AVATAR_BUCKET, r, 'character');
  if (result !== 'done') return new Response(null, { status: 503, headers: NO_STORE });
  return new Response(null, { status: 204, headers: NO_STORE });
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
