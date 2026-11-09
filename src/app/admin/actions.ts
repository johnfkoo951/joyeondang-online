'use server';
import { refresh } from 'next/cache';
import { makeCode } from '@/lib/code';
import { SITE_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 모든 관리자 동작은 DB 함수가 한 번 더 is_admin()을 확인한다. 여기 검사는 빠른 거절용.
async function adminClient() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') throw new Error('admin_only');
  return createClient();
}

const UUID = /^[0-9a-f-]{36}$/;

export async function moderate(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '');
  const visibility = String(formData.get('visibility') ?? '') || null;
  if (!UUID.test(id) || !['approve', 'hide', 'reject'].includes(action)) return;
  const supabase = await adminClient();
  await supabase.rpc('moderate_record', { p_id: id, p_action: action, p_visibility: visibility });
  refresh();
}

export async function resolveRequest(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '');
  const rosterId = String(formData.get('roster_id') ?? '');
  const newName = String(formData.get('new_name') ?? '').trim();
  const slot = String(formData.get('slot') ?? '') || null;
  if (!UUID.test(id) || !['approve', 'reject'].includes(action)) return;
  const supabase = await adminClient();
  await supabase.rpc('admin_resolve_request', {
    p_request_id: id,
    p_action: action,
    p_roster_id: UUID.test(rosterId) ? rosterId : null,
    p_new_name: newName || null,
    p_role: 'guest',
    p_slot: slot,
  });
  refresh();
}

export async function addRoster(formData: FormData) {
  const name = String(formData.get('display_name') ?? '').normalize('NFC').trim().slice(0, 40);
  const role = String(formData.get('role') ?? 'guest');
  const slot = String(formData.get('slot') ?? '') || null;
  const email = String(formData.get('email') ?? '').trim().toLowerCase() || null;
  if (!name) return;
  const supabase = await adminClient();
  await supabase.from('roster').insert({
    display_name: name,
    role: role === 'family' ? 'family' : 'guest',
    slot: slot && ['11', '15', '16', '17', 'online', 'family'].includes(slot) ? slot : null,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  });
  refresh();
}

export async function revokeRoster(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  const supabase = await adminClient();
  await supabase.from('roster').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  refresh();
}

// 아직 계정과 이어지지 않은 명단 줄에 구글 이메일을 넣는다. 그 사람이 그 구글 계정으로 로그인하면 바로 이어진다.
export async function setRosterEmail(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!UUID.test(id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const supabase = await adminClient();
  await supabase.from('roster').update({ email }).eq('id', id).is('claimed_by', null);
  refresh();
}

export type InviteState = { ok: boolean; link?: string; message?: string };

// 코드 원문은 여기서 한 번 만들어 화면에만 보여 주고, DB에는 해시만 남는다.
export async function createInvite(_prev: InviteState | null, formData: FormData): Promise<InviteState> {
  const rosterId = String(formData.get('roster_id') ?? '');
  if (!UUID.test(rosterId)) return { ok: false, message: '명단 줄을 다시 골라 주세요.' };
  const supabase = await adminClient();
  const code = makeCode(3, 4);
  const { error } = await supabase.rpc('admin_create_invite', { p_roster_id: rosterId, p_code: code, p_days: 60 });
  if (error) return { ok: false, message: '만들지 못했어요.' };
  return { ok: true, link: `${SITE_URL}/join?c=${code}` };
}

export async function setDoor(formData: FormData) {
  const slug = String(formData.get('slug') ?? '');
  const door = String(formData.get('door_state') ?? '');
  const accepts = formData.get('accepts_records') === 'on';
  if (!/^[a-z0-9-]{2,32}$/.test(slug) || !['open', 'resting', 'family', 'closed'].includes(door)) return;
  const supabase = await adminClient();
  await supabase.from('rooms').update({ door_state: door, accepts_records: accepts, updated_at: new Date().toISOString() }).eq('slug', slug);
  refresh();
}
