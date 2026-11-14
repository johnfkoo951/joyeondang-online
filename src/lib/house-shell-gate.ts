import 'server-only';
import type { Role } from '@/lib/access';
import { shellAllowed, shellUsers } from '@/lib/house-shell';
import { previewForRequest } from '@/lib/preview-request';
import { createClient } from '@/lib/supabase/server';

/**
 * 지금 요청한 사람이 실측 1층 시험 지도를 열 수 있나(lib/house-shell.ts의 shellAllowed).
 * 관리자가 아니거나 목록이 비었으면 로그인 id를 묻지도 않는다. 쿠키를 읽으므로 라우트나 Suspense 안에서만 부른다
 */
export async function canOpenShell(role: Role): Promise<boolean> {
  const preview = await previewForRequest();
  if (preview) return true;
  const users = shellUsers();
  if (role !== 'admin' || users.size === 0) return false;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return shellAllowed({ role, sub: typeof sub === 'string' ? sub : null, preview, users });
}
