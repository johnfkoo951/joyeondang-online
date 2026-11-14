import { connection } from 'next/server';
import { canSee } from '@/lib/access';
import { hiddenAsset, missingAsset, noFunction } from '@/lib/avatar/assets';
import { versionedPic } from '@/lib/avatar/pic-version';
import { previewResponse, readPreviewAvatar } from '@/lib/avatar/preview-source';
import { isUuid, type ViewSize } from '@/lib/avatar/rules';
import { AVATAR_BUCKET } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 캐릭터의 방향 그림 묶음(다섯 방향을 한 줄에 담은 WebP 한 장). 걷기 엔진이 캐릭터가 보는 쪽에 맞는 칸을 골라 쓴다.
//   GET /api/avatar/<id>/views?s=l|s   l: 큰 것(기본), s: 작은 것(손가락으로 쓰는 기기)
// 접근 규칙은 그림 한 장(/api/avatar/<id>)과 같다: 명단 손님에게만, 그림도 묶음도 ready일 때만.
// 그 밖에는(아직 안 그렸을 때도) 본문 없는 404. 걷기 엔진은 404면 그림 한 장으로 걷는다.
// 404에는 머리 X-Avatar-Asset으로 기다리면 생기는지(pending) 만들 계획이 없는지(none)를 붙인다(src/lib/avatar/assets.ts):
// 손님 수십 명이 같은 없는 묶음을 몇 번씩 다시 묻지 않게. 명단 밖과 없는 그림은 같은 none(있는지조차 알리지 않는다).
// 0024부터는 그 그림의 판(그린 차례)을 ETag로 싣고 1분 캐시한다: 그림을 다시 그리면 묶음도 새로 그려진다
// (src/lib/avatar/pic-version.ts). 판 함수가 없는 옛 DB면 아래 옛 길(판 없이 한 시간).

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return hiddenAsset('none');
  // s가 없거나 다른 값이면 큰 것
  const size: ViewSize = new URL(request.url).searchParams.get('s') === 's' ? 's' : 'l';
  // 이 컴퓨터 미리보기에서만: 미리보기 폴더에 둔 묶음을 로그인 없이 준다(운영에서는 늘 건너뛴다)
  const local = await readPreviewAvatar(id, size);
  if (local) return previewResponse(local);
  const viewer = await getViewer();
  // 명단 밖으로 확인됐을 때만 none. 역할을 확인하지 못했으면(몰릴 때 잠깐) 머리 없이: 걷기 엔진이 나중에 다시 묻는다
  if (!canSee(viewer.role, 'guests')) return hiddenAsset(viewer.unsure ? null : 'none');
  // 경로 확인과 파일 읽기 모두 보는 사람의 세션으로(DB 함수와 저장소 정책이 한 번씩 더 막는다).
  // 0015를 올리기 전에는 함수가 없어 오류가 온다: 묶음을 그리는 기능이 아직 없으므로 none
  const supabase = await createClient();
  const versioned = await versionedPic(supabase, request, id, AVATAR_BUCKET, 'views', size);
  if (versioned) return versioned;
  const { data: path, error } = await supabase.rpc('avatar_views_path', { p_id: id, p_size: size });
  if (error) return hiddenAsset(noFunction(error) ? 'none' : null);
  if (typeof path !== 'string' || !path) return missingAsset(supabase, id, 'views');
  const { data: file, error: readError } = await supabase.storage.from(AVATAR_BUCKET).download(path);
  if (readError || !file) return hiddenAsset(null);
  return new Response(file.stream(), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=3600',
      'X-Robots-Tag': 'noindex',
      'Content-Disposition': 'inline',
    },
  });
}
