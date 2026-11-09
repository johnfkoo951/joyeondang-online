import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Viewer } from '@/lib/viewer';
import { cleanLook, dollFromColor, type CharacterLook } from '@/walk/look';

// 내 캐릭터 겉모습을 서버에서 읽는다(걷기 화면 첫 그림과 함께 걷기 출입증에 쓴다).
// 저장한 것이 없으면 예전 수첩의 「인형 색」을 꾸미기 윗옷 색 가운데 가까운 것으로 옮긴 기본 인형.

/** 예전 수첩 인형 색(id) → 꾸미기 윗옷 색 */
const FROM_OLD: Record<string, string> = {
  spring: '#d98ca0',
  summer: '#3e6b4f',
  autumn: '#c98a5a',
  winter: '#6b8fb5',
  cream: '#ece4d6',
  ink: '#3a3a3a',
};

export function fallbackLook(viewer: Pick<Viewer, 'dollColor'>): CharacterLook {
  return { kind: 'doll', doll: dollFromColor(FROM_OLD[viewer.dollColor ?? ''] ?? null) };
}

/** profiles.look → cleanLook. 로그인 전·열이 아직 없을 때·값이 없을 때는 fallbackLook */
export async function loadMyLook(viewer: Viewer): Promise<CharacterLook> {
  const base = fallbackLook(viewer);
  if (!viewer.ready || !viewer.signedIn) return base;
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (typeof uid !== 'string' || !uid) return base;
    const { data, error } = await supabase.from('profiles').select('look').eq('user_id', uid).maybeSingle();
    const raw = (data as { look?: unknown } | null)?.look;
    if (error || !raw || typeof raw !== 'object') return base;
    return cleanLook(raw, base.kind === 'doll' ? base.doll : undefined);
  } catch {
    return base;
  }
}
