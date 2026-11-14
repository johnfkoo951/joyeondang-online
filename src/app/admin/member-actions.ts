'use server';
import { refresh } from 'next/cache';
import {
  cleanMemberEmail,
  cleanMemberNote,
  cleanMemberRole,
  cleanMemberSlot,
  parseBulkMembers,
} from '@/lib/member-admin';
import { cleanRosterName } from '@/lib/roster-name';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

async function adminClient() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') throw new Error('admin_only');
  return createClient();
}

const UUID = /^[0-9a-f-]{36}$/;

export type MemberActionResult = { ok: boolean; message: string };

/** 단건 멤버 등록 (이름, 역할, 회차, 이메일, 메모) */
export async function createMemberAction(_prev: MemberActionResult | null, formData: FormData): Promise<MemberActionResult> {
  const name = cleanRosterName(formData.get('display_name'));
  if (!name) return { ok: false, message: '이름을 적어 주세요.' };

  const rawEmail = String(formData.get('email') ?? '').trim();
  const email = rawEmail ? cleanMemberEmail(rawEmail) : null;
  if (rawEmail && !email) return { ok: false, message: '이메일 주소 형식을 확인해 주세요.' };

  const role = cleanMemberRole(formData.get('role'));
  const slot = cleanMemberSlot(formData.get('slot'));
  const note = cleanMemberNote(formData.get('note'));

  const supabase = await adminClient();
  const { error } = await supabase.from('roster').insert({
    display_name: name,
    role,
    slot,
    email,
    note,
  });
  if (error) {
    if (/duplicate|unique|roster_email_key/i.test(error.message)) {
      return { ok: false, message: '이미 명단에 등록된 이메일이에요.' };
    }
    return { ok: false, message: '등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
  }
  refresh();
  return { ok: true, message: `${name} 님을 명단에 등록했어요.` };
}

/** 여러 명 일괄 등록 (줄바꿈 구분 텍스트) */
export async function bulkAddMembersAction(_prev: MemberActionResult | null, formData: FormData): Promise<MemberActionResult> {
  const raw = String(formData.get('bulk_text') ?? '');
  const parsed = parseBulkMembers(raw);
  if (parsed.valid.length === 0) {
    return {
      ok: false,
      message: parsed.invalidLines.length
        ? `${parsed.invalidLines.join(', ')}번째 줄의 이름 또는 이메일 형식을 확인해 주세요.`
        : '등록할 명단을 한 줄에 한 분씩 적어 주세요.',
    };
  }

  const supabase = await adminClient();
  // 이미 등록된 이메일은 건너뛰어 전체 실패를 막는다
  const { data: existing } = await supabase.from('roster').select('email').not('email', 'is', null);
  const existingEmails = new Set(
    (existing ?? [])
      .map((r) => (typeof r.email === 'string' ? r.email.toLowerCase() : ''))
      .filter(Boolean),
  );

  const toInsert = parsed.valid.filter((m) => !m.email || !existingEmails.has(m.email));
  const dupCount = parsed.valid.length - toInsert.length;

  if (toInsert.length === 0) {
    return { ok: false, message: '적어 주신 이메일이 모두 이미 명단에 등록되어 있어요.' };
  }

  const { error } = await supabase.from('roster').insert(toInsert);
  if (error) {
    return { ok: false, message: '일괄 등록 중 오류가 났어요. 이메일 중복 여부를 확인해 주세요.' };
  }
  refresh();
  const extra: string[] = [];
  if (dupCount > 0) extra.push(`중복 이메일 ${dupCount}건 건너뜀`);
  if (parsed.invalidLines.length > 0) extra.push(`형식 오류 ${parsed.invalidLines.length}줄 제외`);
  return {
    ok: true,
    message: `${toInsert.length}명을 한꺼번에 등록했어요.${extra.length ? ` (${extra.join(' · ')})` : ''}`,
  };
}

/** 멤버 상세 수정 (이름, 역할, 회차, 미연결 시 이메일, 관리자 메모) */
export async function updateMemberAction(formData: FormData): Promise<MemberActionResult> {
  const id = String(formData.get('id') ?? '');
  const name = cleanRosterName(formData.get('display_name'));
  if (!UUID.test(id) || !name) return { ok: false, message: '이름을 확인해 주세요.' };

  const role = cleanMemberRole(formData.get('role'));
  const slot = cleanMemberSlot(formData.get('slot'));
  const note = cleanMemberNote(formData.get('note'));
  const rawEmail = String(formData.get('email') ?? '').trim();
  const email = rawEmail ? cleanMemberEmail(rawEmail) : null;
  if (rawEmail && !email) return { ok: false, message: '이메일 형식을 확인해 주세요.' };

  const supabase = await adminClient();
  const { data: cur } = await supabase.from('roster').select('id, role, claimed_by').eq('id', id).maybeSingle();
  if (!cur) return { ok: false, message: '명단에서 찾지 못했어요.' };

  const patch: Record<string, unknown> = {
    display_name: name,
    slot,
    note,
  };
  // 집주인(admin) 계정은 실수로 권한이 내려가지 않게 역할을 고정한다
  if (cur.role !== 'admin') {
    patch.role = role;
  }
  // 아직 구글 계정과 이어지기 전이면 이메일을 바꾸거나 비울 수 있다
  if (!cur.claimed_by) {
    patch.email = email;
  }

  const { error } = await supabase.from('roster').update(patch).eq('id', id);
  if (error) {
    if (/duplicate|unique|roster_email_key/i.test(error.message)) {
      return { ok: false, message: '다른 멤버에게 이미 등록된 이메일이에요.' };
    }
    return { ok: false, message: '저장하지 못했어요.' };
  }
  refresh();
  return { ok: true, message: `${name} 님 정보를 저장했어요.` };
}

/** 명단 제외 또는 복구 */
export async function setMemberRevokedAction(id: string, revoke: boolean): Promise<MemberActionResult> {
  if (!UUID.test(id)) return { ok: false, message: '잘못된 멤버 번호예요.' };
  const supabase = await adminClient();
  const { data: cur } = await supabase.from('roster').select('display_name, role').eq('id', id).maybeSingle();
  if (!cur) return { ok: false, message: '명단에서 찾지 못했어요.' };
  if (cur.role === 'admin' && revoke) {
    return { ok: false, message: '집주인 계정은 명단에서 뺄 수 없어요.' };
  }
  const { error } = await supabase
    .from('roster')
    .update({ revoked_at: revoke ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) return { ok: false, message: '상태를 바꾸지 못했어요.' };
  refresh();
  return {
    ok: true,
    message: revoke ? `${cur.display_name} 님을 명단에서 제외했어요.` : `${cur.display_name} 님을 다시 명단에 복구했어요.`,
  };
}
