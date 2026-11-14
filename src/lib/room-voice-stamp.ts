// 방 의견함 장부(content/room-voice-stamps.json)를 셈하는 곳. 방마다 지문(항목, 방 장면 전체, 벽·바닥 마감, 창밖 색)을 내고,
// 지문이 달라진 방에는 그때의 앱 버전·시각과 새로 생긴 것·없어진 것을 한 줄 더 적는다.
// 시험(tests/unit/room-voice.test.ts)이 장부가 지금 방과 맞는지 보고, 고치는 일은 npm run room-stamps가 한다.
// 걷기 엔진의 three를 불러오므로 화면 코드에서는 쓰지 않는다(화면은 장부 JSON만 읽는다).
import { createHash } from 'node:crypto';
import { buildRoomWorld } from '@/content/room-worlds';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { ROOM_SHELLS, ROOM_VISTA_THEMES } from '@/walk/room-windows';
import { VOICE_ROOMS, voiceItems } from '@/lib/room-voice';

export type StampEntry = {
  version: string;
  /** ISO 시각(UTC) */
  at: string;
  hash: string;
  items: string[];
  added: string[];
  removed: Array<{ id: string; ko: string }>;
  /** 이 방의 첫 기록(의견함에 처음 올라온 때) */
  first?: true;
};

/** 방마다 기록(최근 것이 앞)과 지금까지 본 항목의 이름(없어진 항목을 이름으로 보이려고) */
export type StampRoom = { names: Record<string, string>; history: StampEntry[] };
export type StampLedger = { rooms: Record<string, StampRoom> };

/** 방마다 남기는 기록 수 */
export const STAMP_KEEP = 8;

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export type RoomPrint = { hash: string; items: string[]; labels: Record<string, string> };

export function roomPrint(slug: string): RoomPrint {
  const items = voiceItems(slug);
  const room = ROOM_BY_SLUG.get(slug);
  const payload = {
    items,
    world: buildRoomWorld(slug),
    shell: ROOM_SHELLS[slug] ?? null,
    vista: ROOM_VISTA_THEMES[slug] ?? null,
    room: room ? { name: room.name, line: room.line, door: room.door, game: room.game ?? null } : null,
  };
  return {
    hash: createHash('sha256').update(stable(payload)).digest('hex').slice(0, 16),
    items: items.map((i) => i.id),
    labels: Object.fromEntries(items.map((i) => [i.id, i.ko])),
  };
}

export function computePrints(): Record<string, RoomPrint> {
  return Object.fromEntries(VOICE_ROOMS.map((s) => [s, roomPrint(s)]));
}

/** 장부와 지금 방이 다른 방 */
export function staleRooms(ledger: StampLedger, prints = computePrints()): string[] {
  return Object.entries(prints)
    .filter(([slug, p]) => ledger.rooms[slug]?.history[0]?.hash !== p.hash)
    .map(([slug]) => slug);
}

/** 바뀐 방마다 맨 앞에 새 기록을 더한 장부(그대로인 방은 손대지 않는다). 순수 함수 */
export function stampLedger(
  ledger: StampLedger,
  prints: Record<string, RoomPrint>,
  version: string,
  at: string,
): { ledger: StampLedger; changed: string[] } {
  const rooms: Record<string, StampRoom> = { ...ledger.rooms };
  const changed: string[] = [];
  for (const [slug, p] of Object.entries(prints)) {
    const old = rooms[slug] ?? { names: {}, history: [] };
    const prev = old.history[0];
    if (prev?.hash === p.hash) continue;
    const before = new Set(prev?.items ?? []);
    const nowSet = new Set(p.items);
    const names = { ...old.names, ...p.labels };
    const entry: StampEntry = {
      version,
      at,
      hash: p.hash,
      items: p.items,
      added: prev ? p.items.filter((id) => !before.has(id)) : [],
      removed: prev ? prev.items.filter((id) => !nowSet.has(id)).map((id) => ({ id, ko: names[id] ?? id })) : [],
      ...(prev ? {} : { first: true as const }),
    };
    rooms[slug] = { names, history: [entry, ...old.history].slice(0, STAMP_KEEP) };
    changed.push(slug);
  }
  return { ledger: { rooms }, changed };
}
