'use server';
import { canUse } from '@/lib/access';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 조용 모드 동안 멀리서 보내는 박수(기획서 7.1). 명단 손님만, DB가 한 사람 2초에 한 번만 센다.
// 돌려주는 값은 지금까지의 박수 수(세지 않았어도 지금 수), 칠 수 없으면 null.
export async function clapOnce(): Promise<number | null> {
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'stamps')) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('clap');
  if (error || typeof data !== 'number') return null;
  return data;
}
