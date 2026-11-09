'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ROOM_SCENES, buildRoomWorld } from '@/content/room-worlds';
import { ROOM_BY_SLUG, type Door } from '@/content/rooms';
import { buildWorld } from '@/content/world';
import type { View } from '@/walk/scene';
import type { HouseWorld, Level } from '@/walk/types';
import { clearRoom, hrefWithRoom, readPos, readRoom, roomFromSearch, startRoom, writeRoom } from './memory';

export type Space = { kind: 'house' } | { kind: 'room'; slug: string };
/** 새로 지은 장면에서 설 자리 */
export type Arrive = { x: number; z: number; level: Level; yaw: number; view?: View };

const roomWorld = (slug: string): HouseWorld | null => {
  try {
    return buildRoomWorld(slug);
  } catch {
    return null;
  }
};

/**
 * 지금 걷는 공간(집 또는 방 장면)과 그 세계.
 * 처음에는 주소의 ?room= → 이 기기에 남은 방 → 집 순서. 방이면 주소에 ?room=<slug>, 집이면 query 없음.
 * 집 세계는 한 번만 받아(손님이면 실제 집) 방을 드나들어도 다시 받지 않는다.
 */
export function useSpace(doors: Record<string, Door>, realHouse: boolean) {
  const doorsRef = useRef(doors);
  const real = useRef(realHouse);
  const house = useRef<Promise<HouseWorld> | null>(null);
  const arrive = useRef<Arrive | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [world, setWorld] = useState<HouseWorld | null>(null);

  useEffect(() => {
    doorsRef.current = doors;
  });

  /** 들어갈 수 있는 방 장면인가(장면이 있고 문패가 열림) */
  const canEnter = useCallback((slug: string) => {
    const door = doorsRef.current[slug] ?? ROOM_BY_SLUG.get(slug)?.door;
    return ROOM_SCENES.includes(slug) && door === 'open';
  }, []);

  const loadHouse = useCallback((): Promise<HouseWorld> => {
    const fallback = () => buildWorld(doorsRef.current);
    house.current ??= real.current
      ? fetch('/api/house', { cache: 'no-store', credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<HouseWorld>) : null))
        .catch(() => null)
        .then((w) => (w && w.kind === 'real' ? w : fallback()))
      : Promise.resolve().then(fallback);
    return house.current;
  }, []);

  useEffect(() => {
    let slug: string | null = null;
    try {
      slug = startRoom(roomFromSearch(window.location.search), readRoom(localStorage), canEnter);
    } catch {
      slug = null;
    }
    queueMicrotask(() => setSpace(slug && roomWorld(slug) ? { kind: 'room', slug } : { kind: 'house' }));
  }, [canEnter]);

  useEffect(() => {
    if (!space) return;
    let cancelled = false;
    if (space.kind === 'room') {
      const w = roomWorld(space.slug);
      queueMicrotask(() => {
        if (cancelled) return;
        if (w) setWorld(w);
        else setSpace({ kind: 'house' });
      });
    } else {
      void loadHouse().then((w) => { if (!cancelled) setWorld(w); });
    }
    return () => { cancelled = true; };
  }, [space, loadHouse]);

  // 주소와 방 기억을 공간에 맞춘다
  useEffect(() => {
    if (!space) return;
    try {
      const slug = space.kind === 'room' ? space.slug : null;
      window.history.replaceState(window.history.state, '', hrefWithRoom(window.location.href, slug));
      if (slug) writeRoom(localStorage, slug);
      else clearRoom(localStorage);
    } catch {
      // 주소를 못 바꿔도 걷기는 계속된다
    }
  }, [space]);

  /** 이번에 지은 장면에서 설 자리를 꺼낸다(한 번만). 없으면 집은 이 기기에 남은 자리, 방은 들어오는 자리(spawn) */
  const takeArrive = useCallback((w: HouseWorld): Arrive | null => {
    const a = arrive.current;
    arrive.current = null;
    if (a || w.kind === 'room') return a;
    let p: ReturnType<typeof readPos> = null;
    try { p = readPos(localStorage, w.kind); } catch { p = null; }
    return p ? { x: p.x, z: p.z, level: p.level, yaw: p.yaw, view: p.view } : null;
  }, []);

  const enterRoom = useCallback((slug: string) => {
    arrive.current = null;
    setSpace({ kind: 'room', slug });
  }, []);

  /** 방에서 나오면 늘 그 방 문 앞(포털)으로. 집에 그 포털이 없으면 남은 자리로 */
  const leaveRoom = useCallback(async (slug: string) => {
    const h = await loadHouse();
    const p = h.portals?.find((x) => x.slug === slug);
    arrive.current = p ? { x: p.x, z: p.z, level: p.level, yaw: p.yaw } : null;
    setSpace({ kind: 'house' });
  }, [loadHouse]);

  return { space, world, canEnter, takeArrive, enterRoom, leaveRoom };
}
