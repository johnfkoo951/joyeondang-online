'use client';
import { useEffect, useState } from 'react';

/** 손님에게만 서버가 주는 가족 방 이름표(공개 묶음에는 없다) */
export type FamilyTag = { owner: string; title: string; line?: string };

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function parseRooms(v: unknown): Map<string, FamilyTag> {
  const out = new Map<string, FamilyTag>();
  const rooms = v && typeof v === 'object' ? (v as { rooms?: unknown }).rooms : null;
  if (!Array.isArray(rooms)) return out;
  for (const r of rooms) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const slug = str(o.slug, 32);
    const owner = str(o.owner, 24);
    const title = str(o.title, 40);
    if (!slug || !owner || !title) continue;
    out.set(slug, { owner, title, line: str(o.line, 140) ?? undefined });
  }
  return out;
}

const EMPTY = new Map<string, FamilyTag>();

/** 손님 이상이면 /api/family-rooms를 한 번 받아 slug → 이름표. 아니거나 실패하면 빈 표 */
export function useFamilyRooms(enabled: boolean): Map<string, FamilyTag> {
  const [rooms, setRooms] = useState<Map<string, FamilyTag>>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch('/api/family-rooms', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => { if (alive && j) setRooms(parseRooms(j)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return rooms;
}
