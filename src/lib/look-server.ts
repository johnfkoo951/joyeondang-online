import 'server-only';
import { isUuid } from '@/lib/avatar/rules';
import { createClient } from '@/lib/supabase/server';
import type { Viewer } from '@/lib/viewer';
import { ownedLook } from '@/lib/look-own';
import { cleanLook, cleanTitle, dollFromColor, withTitle, type CharacterLook } from '@/walk/look';

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

/**
 * 이 그림이 내가 만든, 지금 쓸 수 있는 캐릭터인가. avatars는 내 줄만 읽힌다(0003 avatars_own_select)는 데 기댄다.
 * 물어보지 못했으면(잠깐의 오류) 아니라고 본다.
 */
export async function ownsAvatar(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  try {
    const { data, error } = await supabase.from('avatars').select('id').eq('id', id).eq('status', 'ready').maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

/** 받은 겉모습에 칭호 칸이 아예 없으면(칭호를 모르는 화면: 웹 인형 꾸미기, 캐릭터 고르기) 저장된 칭호를 그대로 둔다.
 *  칸이 있으면(빈 글이어도) 그것을 따른다: 걷기의 칭호 칸이 지운 것이다. 저장된 것을 못 읽으면 칭호 없이 */
export async function keepStoredTitle(
  supabase: Awaited<ReturnType<typeof createClient>>, uid: string, raw: unknown, look: CharacterLook,
): Promise<CharacterLook> {
  if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'title')) return look;
  try {
    const { data, error } = await supabase.from('profiles').select('look').eq('user_id', uid).maybeSingle();
    const old = error ? '' : cleanTitle(((data as { look?: { title?: unknown } | null } | null)?.look ?? null)?.title);
    return old ? withTitle(look, old) : look;
  } catch {
    return look;
  }
}

/** profiles.look → cleanLook. 로그인 전·열이 아직 없을 때·값이 없을 때는 fallbackLook.
 *  사진 캐릭터는 내 그림일 때만 돌려준다(출입증에 남의 그림이 실리지 않게). 아니면 fallbackLook */
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
    const look = cleanLook(raw, base.kind === 'doll' ? base.doll : undefined);
    return await ownedLook(look, (id) => ownsAvatar(supabase, id), base);
  } catch {
    return base;
  }
}
