// 방 의견함의 항목 목록. 손으로 적은 목록이 아니라 지금 지어진 방 장면(room-worlds.ts)에서 그때그때 뽑는다:
// 방을 고쳐 배포하면 의견함도 그 모습을 그대로 보여 준다. 방이 언제 어느 버전에서 바뀌었는지는
// content/room-voice-stamps.json 장부가 적는다(npm run room-stamps, 시험이 장부가 밀렸는지 본다).
import { buildRoomWorld, ROOM_SCENES } from '@/content/room-worlds';
import { ROOM_BY_SLUG } from '@/content/rooms';
import {
  KIND_LABEL, KID_ROOMS, MARKS, ROOM_LOOK, ROOM_VIEW, VOICE_EXTRA_ROOMS, type Mark, type VoiceGroupId,
} from '@/content/room-voice';

export type VoicePart = { ko: string; en: string; count: number };

export type VoiceItem = {
  /** 저장 열쇠. 'base:look' | 'base:windows' | 'base:<가구>' | 'game:<놀이>' | 'spot:<자리>' | 'item:<가구>' | 'view' */
  id: string;
  group: VoiceGroupId;
  ko: string;
  /** null이면 방 데이터의 한국어 이름이라 화면이 영어일 때 place-names가 옮긴다 */
  en: string | null;
  detailKo?: string;
  /** null이면 방 데이터의 한국어 문장이라 house-lines가 옮긴다 */
  detailEn?: string | null;
  count?: number;
  /** 이 항목에 합친 실제 물건(예: 놀이 「소드 콘티넌트」에 황금 대검 오락기) */
  parts?: VoicePart[];
};

export type VoiceRoom = {
  slug: string;
  nameKo: string;
  lineKo: string;
  kid: boolean;
  hasScene: boolean;
  items: VoiceItem[];
};

/** 저장 열쇠 모양(DB room_voice_map_ok와 같다) */
export const VOICE_KEY = /^[a-z0-9][a-z0-9:_-]{0,79}$/;

/** 의견을 받는 방: 방 장면이 있는 방 모두 + 아직 비어 있는 방. 방 장면이 늘면 여기도 저절로 는다 */
export const VOICE_ROOMS: readonly string[] = [...new Set([...ROOM_SCENES, ...VOICE_EXTRA_ROOMS])].filter((s) =>
  ROOM_BY_SLUG.has(s),
);

const GROUP_ORDER: readonly VoiceGroupId[] = ['base', 'game', 'spot', 'thing', 'view'];

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** 방 장면에서 뽑은 항목(벽·바닥·빛 → 놀이 → 전시와 순위표 → 놓여 있는 것 → 창밖 풍경). 장면이 없는 방은 [] */
export function voiceItems(slug: string): VoiceItem[] {
  const world = buildRoomWorld(slug);
  if (!world) return [];
  const items: VoiceItem[] = [];
  const look = ROOM_LOOK[slug];
  if (look) items.push({ id: 'base:look', group: 'base', ko: look.ko, en: look.en });
  const windows = world.windows.length;
  if (windows > 0) {
    items.push({ id: 'base:windows', group: 'base', ko: `창 ${windows}개`, en: windows === 1 ? 'One window' : `${windows} windows` });
  }

  let board: VoiceItem | null = null;
  for (const h of world.hotspots) {
    if (h.kind === 'game' && h.game) {
      items.push({ id: `game:${h.game}`, group: 'game', ko: h.title, en: null, detailKo: h.line, detailEn: null });
    } else if (h.kind === 'exhibit' || h.kind === 'board') {
      const item: VoiceItem = { id: `spot:${h.id}`, group: 'spot', ko: h.title, en: null, detailKo: h.line, detailEn: null };
      if (h.kind === 'board' && !board) board = item;
      items.push(item);
    }
  }

  // 가구는 종류마다 하나로 묶고(같은 종류가 여럿이면 개수), 놀이·전시 자리의 물건이면 그 항목에 합친다
  const counts = new Map<string, number>();
  for (const f of world.furniture) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  for (const [kind, count] of counts) {
    const label = KIND_LABEL[kind] ?? { ko: kind, en: kind, group: 'thing' as const };
    const target = label.joins
      ? label.joins === 'board'
        ? board
        : items.find((it) => it.id === (label.joins!.startsWith('game:') ? label.joins : `spot:${label.joins}`)) ?? null
      : null;
    if (target) {
      (target.parts ??= []).push({ ko: label.ko, en: label.en, count });
      continue;
    }
    items.push({
      id: `${label.group === 'base' ? 'base' : 'item'}:${kebab(kind)}`,
      group: label.group,
      ko: label.ko,
      en: label.en,
      ...(count > 1 ? { count } : {}),
    });
  }

  const view = ROOM_VIEW[slug];
  if (view) items.push({ id: 'view', group: 'view', ko: view.ko, en: view.en });
  return items.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

export function voiceRoom(slug: string): VoiceRoom | null {
  const room = ROOM_BY_SLUG.get(slug);
  if (!room || !VOICE_ROOMS.includes(slug)) return null;
  const items = voiceItems(slug);
  return { slug, nameKo: room.name, lineKo: room.line, kid: KID_ROOMS.has(slug), hasScene: items.length > 0, items };
}

export function allVoiceRooms(): VoiceRoom[] {
  return VOICE_ROOMS.map((s) => voiceRoom(s)).filter((r): r is VoiceRoom => r !== null);
}

// ───────── 저장 전 손질(서버 동작이 DB에 넘기기 전에 한 번 거른다. DB도 같은 모양을 다시 본다)

export type VoiceDraft = {
  marks: Record<string, Mark>;
  notes: Record<string, string>;
  answers: Record<string, string>;
  status: 'draft' | 'done';
};

// 줄바꿈과 탭만 남기고 보이지 않는 제어 문자를 지운다
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function textMap(raw: unknown, maxKeys: number, maxLen: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= maxKeys) break;
    if (!VOICE_KEY.test(k) || typeof v !== 'string') continue;
    const t = v.replace(CONTROL, '').slice(0, maxLen);
    if (!t.trim()) continue;
    out[k] = t;
    n += 1;
  }
  return out;
}

/** 화면이 보낸 의견을 DB가 받는 모양으로 거른다(모르는 값·빈 글은 버린다) */
export function cleanVoiceDraft(raw: unknown): VoiceDraft {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const marks: Record<string, Mark> = {};
  if (o.marks && typeof o.marks === 'object' && !Array.isArray(o.marks)) {
    let n = 0;
    for (const [k, v] of Object.entries(o.marks as Record<string, unknown>)) {
      if (n >= 300) break;
      if (VOICE_KEY.test(k) && typeof v === 'string' && (MARKS as readonly string[]).includes(v)) {
        marks[k] = v as Mark;
        n += 1;
      }
    }
  }
  return {
    marks,
    notes: textMap(o.notes, 300, 600),
    answers: textMap(o.answers, 30, 2000),
    status: o.status === 'done' ? 'done' : 'draft',
  };
}

/** 이 의견을 쓴 뒤 생긴 것과 없어진 것(쓴 때 본 항목과 지금 항목을 견준다) */
export function voiceChanges(seen: readonly string[], now: readonly string[]): { added: string[]; removed: string[] } {
  if (seen.length === 0) return { added: [], removed: [] };
  const s = new Set(seen);
  const n = new Set(now);
  return { added: now.filter((id) => !s.has(id)), removed: seen.filter((id) => !n.has(id)) };
}
