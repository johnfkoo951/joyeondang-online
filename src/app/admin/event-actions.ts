'use server';
import { refresh } from 'next/cache';
import { makeCode } from '@/lib/code';
import { SITE_URL } from '@/lib/env';
import { asEventRows, eventHours, eventLabel, eventPeople, eventState, joinLink, missingFunction, type EventState } from '@/lib/event-code';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 행사 초대 코드(0018). 모든 동작은 DB 함수가 한 번 더 is_admin()을 확인한다. 여기 검사는 빠른 거절용.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type EventCodeState =
  | { ok: true; id: string; code: string; link: string; label: string; people: number; until: string }
  | { ok: false; message: string };

// 코드 원문은 여기서 한 번 만들어 화면에만 보여 주고, DB에는 해시만 남는다.
export async function createEventCode(_prev: EventCodeState | null, formData: FormData): Promise<EventCodeState> {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') return { ok: false, message: '집주인만 만들 수 있어요.' };
  const now = new Date();
  const label = eventLabel(formData.get('label'), now);
  const hours = eventHours(formData.get('hours'));
  const people = eventPeople(formData.get('people'));
  const supabase = await createClient();
  // 원문이 이미 쓰인 코드와 겹치면(code_taken) 새 코드로 한 번 더
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = makeCode(3, 4);
    const { data, error } = await supabase.rpc('admin_create_event_code', {
      p_code: code, p_label: label, p_hours: hours, p_max: people,
    });
    if (!error && typeof data === 'string') {
      refresh();
      return {
        ok: true, id: data, code, link: joinLink(SITE_URL, code), label, people,
        until: new Date(now.getTime() + hours * 3_600_000).toISOString(),
      };
    }
    if (missingFunction(error)) return { ok: false, message: '아직 만들 수 없어요. DB에 행사 코드 표(0018)가 들어가면 열려요.' };
    if (!/code_taken/.test(error?.message ?? '')) break;
  }
  return { ok: false, message: '만들지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
}

// 거두기: people이 '1'이면 그 코드로 들어온 손님 줄도 명단에서 뺀다(다음 요청부터 구경하는 분으로)
export async function revokeEventCode(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  const viewer = await getViewer();
  if (viewer.role !== 'admin') return;
  const supabase = await createClient();
  await supabase.rpc('admin_revoke_event_code', { p_id: id, p_people: formData.get('people') === '1' });
  refresh();
}

export type EventCount = { used: number; max: number; state: EventState } | null;

/** 발표 화면에 띄운 동안 들어온 수를 다시 읽는다(10초마다) */
export async function readEventCount(id: string): Promise<EventCount> {
  if (!UUID.test(id)) return null;
  const viewer = await getViewer();
  if (viewer.role !== 'admin') return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_event_codes', { p_limit: 200 });
  if (error) return null;
  const row = asEventRows(data).find((r) => r.id === id);
  return row ? { used: row.used, max: row.max_uses, state: eventState(row, new Date()) } : null;
}
