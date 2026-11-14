'use server';
import { refresh } from 'next/cache';
import { canSee } from '@/lib/access';
import { forgetAvatar, type ForgetPart, type ForgetRow } from '@/lib/avatar/forget';
import { benchCharacter, keepCharacter, requestModel } from '@/lib/avatar/manage';
import { MESSAGES, SLOTS_MAX, isUuid } from '@/lib/avatar/rules';
import { AVATAR_BUCKET, modelProvider, modelsOn } from '@/lib/avatar/server';
import { fallbackLook, keepStoredTitle } from '@/lib/look-server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';
import { cleanLook, photoId, type CharacterLook } from '@/walk/look';

// 내 캐릭터 고르기·지우기·★ 보관·작업대로 꺼내기·3D 요청. 매번 명단 손님인지 다시 확인하고, 보는 사람의 세션으로만 한다
// (DB 함수와 저장소 정책이 내 것만 건드리게 한 번 더 막는다).
// 고르기는 걷기 화면이 그리는 겉모습(profiles.look)을 바꾼다: 걷기와 함께 걷기는 look만 본다.
// 예전 칸(profiles.avatar_id, avatar_choose)도 같이 맞춰 둔다. 남의 그림·지운 그림은 DB 트리거가 막는다.
// ★·작업대·3D는 걷기 화면의 라우트(/api/avatar/<id>/keep·bench·model)와 같은 길(src/lib/avatar/manage.ts)로 한다.

/** look: 이 일로 걷기 겉모습이 바뀌었으면 그 겉모습(걷기 위에 연 시트가 살아 있는 걷기 화면에 알린다) */
export type ManageState = { ok: boolean; message: string; look?: CharacterLook };

type Op = 'choose' | 'unchoose' | 'delete-character' | 'delete-original' | 'delete-both' | 'delete-all-originals'
  | 'keep' | 'unkeep' | 'bench' | 'model';
const OPS = new Set<Op>(['choose', 'unchoose', 'delete-character', 'delete-original', 'delete-both', 'delete-all-originals',
  'keep', 'unkeep', 'bench', 'model']);

type Client = Awaited<ReturnType<typeof createClient>>;
async function myUid(supabase: Client): Promise<string | null> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  return typeof uid === 'string' && uid ? uid : null;
}
/** 내 프로필의 걷기 겉모습을 바꾼다(걷기에서 단 칭호는 그대로 둔다). 로그인이 풀렸거나 DB가 거절하면 false */
async function wearLook(supabase: Client, look: CharacterLook): Promise<boolean> {
  const uid = await myUid(supabase);
  if (!uid) return false;
  const kept = await keepStoredTitle(supabase, uid, {}, look);
  const { error } = await supabase.from('profiles').upsert({ user_id: uid, look: kept, updated_at: new Date().toISOString() });
  return !error;
}
/** 지금 걷기에 쓰는 사진 캐릭터 id(인형이면 null) */
async function wornPhoto(supabase: Client): Promise<string | null> {
  const uid = await myUid(supabase);
  if (!uid) return null;
  const { data } = await supabase.from('profiles').select('look').eq('user_id', uid).maybeSingle();
  const look = (data as { look?: unknown } | null)?.look;
  return look && typeof look === 'object' ? photoId(cleanLook(look)) : null;
}

export async function manageAvatar(_prev: ManageState | null, formData: FormData): Promise<ManageState> {
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return { ok: false, message: '명단에 계신 분만 쓸 수 있어요.' };
  const op = String(formData.get('op') ?? '') as Op;
  if (!OPS.has(op)) return { ok: false, message: '다시 눌러 주세요.' };
  const supabase = await createClient();

  if (op === 'unchoose') {
    const [{ data }, worn] = await Promise.all([
      supabase.rpc('avatar_choose', { p_id: null }),
      wearLook(supabase, fallbackLook(viewer)),
    ]);
    refresh();
    return data && worn
      ? { ok: true, message: '종이 인형으로 돌아갔어요.', look: fallbackLook(viewer) }
      : { ok: false, message: '바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  }

  if (op === 'delete-all-originals') {
    const { data: rows } = await supabase.from('avatars').select('id, original_path').not('original_path', 'is', null);
    const list = (rows ?? []) as { id: string; original_path: string | null }[];
    const paths = list.map((r) => r.original_path).filter((p): p is string => typeof p === 'string');
    if (paths.length) {
      const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
      if (error) return { ok: false, message: '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
    }
    for (const r of list) await supabase.rpc('avatar_forget', { p_id: r.id, p_part: 'original' });
    refresh();
    return { ok: true, message: paths.length ? '원본 사진을 모두 지웠어요.' : '남아 있는 원본 사진이 없어요.' };
  }

  const id = formData.get('id');
  if (!isUuid(id)) return { ok: false, message: '다시 눌러 주세요.' };

  if (op === 'choose') {
    // 먼저 예전 칸으로 내 그림(ready)인지 확인하고, 그다음 걷기 겉모습을 바꾼다
    const { data } = await supabase.rpc('avatar_choose', { p_id: id });
    const look: CharacterLook = { kind: 'photo', url: `/api/avatar/${id}` };
    const worn = data === true && (await wearLook(supabase, look));
    refresh();
    return worn ? { ok: true, message: '이 캐릭터로 집 안을 걸어요.', look } : { ok: false, message: '고르지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  }

  if (op === 'keep' || op === 'unkeep') {
    const { body } = await keepCharacter(supabase, id, op === 'keep');
    refresh();
    if (!body.ok) return { ok: false, message: body.message };
    return { ok: true, message: op === 'keep' ? '★ 보관함에 놓았어요.' : '★ 보관함에서 뺐어요.' };
  }

  if (op === 'bench') {
    // 칸을 고르지 않았으면 빈 칸에(빈 칸이 없으면 바꿀 칸을 고르라고 알린다). 이 사람의 칸 수(손님 3)까지인지는 DB가 본다
    const raw = formData.get('slot');
    const slot = raw === null || raw === '' ? null : Number(raw);
    if (slot !== null && !(Number.isInteger(slot) && slot >= 1 && slot <= SLOTS_MAX)) return { ok: false, message: '다시 눌러 주세요.' };
    const { body } = await benchCharacter(supabase, id, slot);
    refresh();
    if (!body.ok) return { ok: false, message: body.message };
    return { ok: true, message: 'slot' in body && body.slot ? `작업대 ${body.slot}번 칸에 놓았어요.` : '작업대에 놓았어요.' };
  }

  if (op === 'model') {
    // 무엇을 어디로 보내는지는 누르기 전에 화면이 묻는다(src/lib/avatar/consent.ts의 modelConfirm). 그 글이 알린 곳을 요청에 적는다
    if (!modelsOn()) return { ok: false, message: MESSAGES.modelOff };
    const { body } = await requestModel(supabase, id, modelProvider());
    refresh();
    if (!body.ok) return { ok: false, message: body.message };
    return {
      ok: true,
      message: 'already' in body && body.already
        ? '이미 3D가 있거나 만드는 중이에요.'
        : '3D 만들기를 맡겼어요. 몇 분 걸려요. 다 되면 이 그림에 「3D」가 붙고, 이 캐릭터로 걸으면 3D로 보여요.',
    };
  }

  // 지우기: 파일을 먼저 지우고(실패하면 DB는 그대로), 그다음 DB에 적는다. 그림을 지울 때는 그 그림으로 그린
  // 방향 그림 묶음도 함께 지운다. 무엇을 어떤 순서로 지우는지는 forgetAvatar가 정한다(걷기 화면의 지우기와 같다)
  const part: ForgetPart = op === 'delete-original' ? 'original' : op === 'delete-character' ? 'character' : 'both';
  const { data: row } = await supabase
    .from('avatars')
    .select('id, user_id, status, original_path, image_path')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { ok: false, message: '찾지 못했어요. 이미 지웠을 수도 있어요.' };
  const forgetRow = row as ForgetRow;
  const inFlight = forgetRow.status === 'pending' || forgetRow.status === 'queued' || forgetRow.status === 'drawing';
  const result = await forgetAvatar(supabase, AVATAR_BUCKET, forgetRow, part);
  if (result === 'files_failed') return { ok: false, message: '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  // 걷기에 쓰던 그림을 지웠으면 걷기 겉모습도 종이 인형으로 돌린다(지운 그림 주소가 남지 않게)
  let changed: CharacterLook | undefined;
  if (result === 'done' && part !== 'original' && (await wornPhoto(supabase)) === forgetRow.id) {
    changed = fallbackLook(viewer);
    await wearLook(supabase, changed);
  }
  refresh();
  if (result !== 'done') return { ok: false, message: '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  return {
    ok: true,
    ...(changed ? { look: changed } : {}),
    message: inFlight
      ? '그리기를 그만두었어요.'
      : part === 'original' ? '원본 사진을 지웠어요.' : part === 'character' ? '그림을 지웠어요.' : '그림과 원본 사진을 지웠어요.',
  };
}
