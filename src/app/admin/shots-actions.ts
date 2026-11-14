'use server';
import { refresh } from 'next/cache';
import { after } from 'next/server';
import { cleanShotsStorage, shotsAdminReady, shotsKeyWorks } from '@/lib/shots-admin';
import {
  CLEAN_AFTER_MS, CLEAN_NOW_MS, SHOTS_KEY_BROKEN, SHOTS_NOT_READY, cleanDoneText, forgetDoneText, forgetTrouble, isUuid,
  readForget, type ForgetKind, type ForgetResult,
} from '@/lib/shots-admin-rules';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 걷기 사진 지우기(0022). 지우는 판정(관리자인지, 누구의 사진인지)은 DB 함수가 한 번 더 한다. 여기 검사는 빠른 거절용.
// 순서: 집주인인지 → 비밀 키가 있고 그 키로 저장소에 닿는지(아니면 표 줄도 지우지 않는다) → DB 함수가 표 줄을 지우며
// 경로를 버릴 목록에, 폴더를 훑을 차례에 올린다 → 서버가 비밀 키로 저장소를 정리한다(누른 자리에서 조금, 남으면 응답을
// 보낸 뒤 after로 이어서). kind 'clean'은 지우기 없이 남은 정리만 한다(「지금 마저 지우기」).

export type ShotsForgetState = { ok: boolean; message: string } | null;

export async function forgetShots(_prev: ShotsForgetState, formData: FormData): Promise<ShotsForgetState> {
  const kind = String(formData.get('kind') ?? '');
  const id = String(formData.get('id') ?? '');
  const forget: ForgetKind | null = kind === 'user' || kind === 'event' ? kind : null;
  if (forget ? !isUuid(id) : kind !== 'clean') return { ok: false, message: '다시 골라 주세요.' };
  const viewer = await getViewer();
  if (viewer.role !== 'admin') return { ok: false, message: '집주인만 지울 수 있어요.' };
  // 파일을 지울 수 없으면 표 줄도 지우지 않는다(파일만 저장소에 남지 않게)
  if (!shotsAdminReady()) return { ok: false, message: SHOTS_NOT_READY };
  if (!(await shotsKeyWorks())) return { ok: false, message: SHOTS_KEY_BROKEN };
  let result: ForgetResult | null = null;
  if (forget) {
    const supabase = await createClient();
    const { data, error } = forget === 'user'
      ? await supabase.rpc('admin_shots_forget_user', { p_user: id })
      : await supabase.rpc('admin_shots_forget_event', { p_event: id });
    if (error) return { ok: false, message: forgetTrouble(error) };
    result = readForget(forget, data);
  }
  const cleaned = await cleanShotsStorage(CLEAN_NOW_MS);
  // 시간이 모자랐으면 응답을 보낸 뒤 이어서 한다. 저장소에 닿지 않아 멈췄으면 말로 알리고 다음 차례에(화면을 열 때, 다시 누를 때)
  if (cleaned.left && !cleaned.failed) after(() => cleanShotsStorage(CLEAN_AFTER_MS));
  refresh();
  if (forget && result) return { ok: result.found, message: forgetDoneText(forget, result, cleaned) };
  return { ok: !cleaned.failed, message: cleanDoneText(cleaned) };
}
