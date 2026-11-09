import 'server-only';
import { cache } from 'react';
import { isRole, type Role } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type Viewer = {
  /** Supabase 연결값이 아직 없으면 false. 이때 모두 구경꾼으로 본다. */
  ready: boolean;
  role: Role;
  signedIn: boolean;
  /** 화면에 보일 이름: 이름표 별명 → 명단 이름 */
  name: string | null;
  pendingRequest: boolean;
  doll: string | null;
  dollColor: string | null;
};

const NOBODY: Viewer = {
  ready: false,
  role: 'public',
  signedIn: false,
  name: null,
  pendingRequest: false,
  doll: null,
  dollColor: null,
};

/**
 * 지금 요청한 사람. 쿠키를 읽으므로 반드시 <Suspense> 안의 컴포넌트에서 부른다.
 * 역할은 클라이언트가 아니라 DB의 whoami()가 명단을 보고 정한다.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (!supabaseReady()) return NOBODY;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { ...NOBODY, ready: true };
  const { data: me, error } = await supabase.rpc('whoami');
  if (error || !me) return { ...NOBODY, ready: true, signedIn: true, role: 'visitor' };
  const info = me as Record<string, unknown>;
  return {
    ready: true,
    signedIn: true,
    role: isRole(info.role) ? info.role : 'visitor',
    name: typeof info.name === 'string' ? info.name : null,
    pendingRequest: info.pending_request === true,
    doll: typeof info.doll === 'string' ? info.doll : null,
    dollColor: typeof info.doll_color === 'string' ? info.doll_color : null,
  };
});
