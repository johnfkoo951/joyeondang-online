// 방 의견함 장부(npm run room-stamps가 적는다)를 화면과 저장 동작이 읽는 곳. 셈하는 코드는 room-voice-stamp.ts
import ledgerJson from '@/content/room-voice-stamps.json';

export type StampView = {
  version: string;
  at: string;
  hash: string;
  items: string[];
  added: string[];
  removed: Array<{ id: string; ko: string }>;
  first?: true;
};
export type StampRoomView = { names: Record<string, string>; history: StampView[] };

const LEDGER = ledgerJson as { rooms: Record<string, StampRoomView> };

export function roomStamps(slug: string): StampRoomView | null {
  return LEDGER.rooms[slug] ?? null;
}

/** 이 방의 지금 지문과 항목(장부 맨 앞). 장부에 없으면 null */
export function latestStamp(slug: string): StampView | null {
  return LEDGER.rooms[slug]?.history[0] ?? null;
}
