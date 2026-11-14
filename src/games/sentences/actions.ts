'use server';
// 문장 걸어 두기의 서버 액션. 방 화면의 submitNote(src/app/actions.ts)와 같은 틀이다.
// 입력 검사·작성자·공개 범위의 최종 판단은 DB(records_guard_insert, RLS)가 한 번 더 한다.
// 한 사람이 넣는 장수 한도는 DB에 0014_guards.sql이 올라간 뒤부터 걸린다(그 전에는 한도가 없다).
import { canUse } from '@/lib/access';
import { makeCode } from '@/lib/code';
import { supabaseReady } from '@/lib/env';
import { recordLimitMessage } from '@/lib/record-errors';
import { createClient } from '@/lib/supabase/server';
import { checkBody, contactWarnings } from '@/lib/text';
import { getViewer } from '@/lib/viewer';
import { checkSentence, formatBody, pickVisibility, wallFromRows, type Sentence } from './logic';

const ROOM = 'study';

export type WallResult = { ok: boolean; rows: Sentence[] };

/** 읽기 벽: 지금 보는 사람에게 보이는 문장 종이만(room_records가 역할로 거른다) */
export async function loadWall(): Promise<WallResult> {
  if (!supabaseReady()) return { ok: false, rows: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('room_records', { p_room: ROOM, p_limit: 60 });
    if (error) return { ok: false, rows: [] };
    return { ok: true, rows: wallFromRows(data) };
  } catch {
    return { ok: false, rows: [] };
  }
}

export type HangInput = { text: string; source: string; visibility: string; consent: boolean };
export type HangState = {
  ok: boolean;
  message: string;
  field?: 'text' | 'source' | 'visibility' | 'role';
  receipt?: string;
  warnings?: string[];
};

/** 옮겨 적기: 손님 이상만. records에 study 방, format 'sentence'로 넣는다 */
export async function hangSentence(input: HangInput): Promise<HangState> {
  if (!supabaseReady()) return { ok: false, message: '문장 걸기는 곧 열려요.' };
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'write')) {
    return { ok: false, field: 'role', message: '손님 로그인 뒤 걸 수 있어요.' };
  }
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof HangInput, unknown>>;
  const check = checkSentence(raw.text, raw.source);
  if (!check.ok) return { ok: false, field: check.field, message: check.reason };
  const scope = pickVisibility(raw.visibility, raw.consent);
  if (!scope.ok) return { ok: false, field: 'visibility', message: scope.reason };
  const body = checkBody(formatBody(check.text, check.source));
  if (!body.ok) return { ok: false, field: 'text', message: body.reason };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('records')
    .insert({
      room_slug: ROOM,
      body: body.body,
      format: 'sentence',
      requested_visibility: scope.visibility,
      consent_public: scope.consent,
    })
    .select('id')
    .single();
  if (error || !data) {
    const m = error?.message ?? '';
    const message = recordLimitMessage(m) ?? (/room_closed/.test(m)
      ? '이 방은 지금 쉬는 중이에요.'
      : /not_on_roster/.test(m)
        ? '손님 로그인 뒤 걸 수 있어요.'
        : '걸지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    return { ok: false, message };
  }
  const receipt = makeCode(3, 4);
  await supabase.rpc('attach_receipt', { p_id: data.id, p_code: receipt });
  return {
    ok: true,
    message: '종이를 집게에 물렸어요. 가족이 읽은 뒤에 벽에 걸려요.',
    receipt,
    warnings: contactWarnings(check.text + ' ' + check.source),
  };
}
