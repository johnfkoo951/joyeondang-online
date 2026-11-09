import 'server-only';
import { cacheLife } from 'next/cache';
import type { Door } from '@/content/rooms';
import { supabaseReady } from '@/lib/env';
import { createAnonClient } from '@/lib/supabase/server';

// 로그인과 무관한 숫자와 문패. 쿠키를 읽지 않으므로 몇 분씩 캐시한다.

export async function getLantern(): Promise<{ lit: number; today: number } | null> {
  'use cache';
  cacheLife('minutes');
  if (!supabaseReady()) return null;
  const { data, error } = await createAnonClient().rpc('lantern');
  if (error || !data) return null;
  const d = data as { lit?: number; today?: number };
  return { lit: Number(d.lit ?? 0), today: Number(d.today ?? 0) };
}

export async function getDoorStates(): Promise<Record<string, Door>> {
  'use cache';
  cacheLife('minutes');
  if (!supabaseReady()) return {};
  const { data, error } = await createAnonClient().from('rooms').select('slug, door_state');
  if (error || !data) return {};
  return Object.fromEntries(data.map((r) => [r.slug as string, r.door_state as Door]));
}
