'use client';
import { useEffect, useRef, useState } from 'react';
import { connectNet, type Net, type NetChat, type NetStatus } from '@/walk/net';
import type { RemotePlayer } from '@/walk/types';

/**
 * 집이 가득 차면 손님은 같은 집의 다음 공간(~2, ~3)으로 넘어간다(함께 걷기 서버 약속). 모두를 보려면 공간마다 관전 연결 하나.
 * net.ts의 spaceShards('house:real')와 같은 목록이다. 빈 공간을 관전해도 서버는 공간을 깨우지 않는다
 */
export const HOUSE_SHARDS = ['house:real', 'house:real~2', 'house:real~3'] as const;

export type ObserveSummary = 'connecting' | 'live' | 'partial' | 'retrying' | 'denied' | 'full' | 'off';
export type HeardLine = { key: string; name: string; text: string; at: number; space: string };

/** 공간마다의 상태를 한 마디로: 처음 공간이 이어지면 실시간(나머지는 대개 비어 있다) */
export function summarize(states: Readonly<Record<string, NetStatus | undefined>>): ObserveSummary {
  const all = HOUSE_SHARDS.map((s) => states[s]);
  if (all.every((s) => s === 'denied')) return 'denied';
  if (all.every((s) => s === 'live')) return 'live';
  if (all[0] === 'live') return 'partial';
  if (all.some((s) => s === 'full')) return 'full';
  if (all.some((s) => s === 'retrying')) return 'retrying';
  if (all.every((s) => s === 'off' || s === undefined)) return 'off';
  return 'connecting';
}

/**
 * 관전 연결(가족·관리자 출입증 ?observe=1). 사람들은 매번 받은 그대로 onPlayers로(공간마다 받은 목록을 합쳐서),
 * 같은 공간 말풍선은 onHeard로. 화면 상태는 공간별 상태만 갖는다(자리가 바뀔 때마다 React를 다시 그리지 않게)
 */
export function useObservers(opt: { enabled: boolean; onPlayers: (all: RemotePlayer[]) => void; onHeard: (l: HeardLine) => void }) {
  const [states, setStates] = useState<Record<string, NetStatus>>({});
  const live = useRef(opt);
  useEffect(() => {
    live.current = opt;
  });
  const { enabled } = opt;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const lists = new Map<string, RemotePlayer[]>();
    let queued = false;
    // 세 공간 소식이 한꺼번에 와도 한 번만 합친다
    const flush = () => {
      queued = false;
      if (!alive) return;
      const seen = new Set<string>();
      const all: RemotePlayer[] = [];
      for (const space of HOUSE_SHARDS) {
        for (const p of lists.get(space) ?? []) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          all.push(p);
        }
      }
      live.current.onPlayers(all);
    };
    const nets: Net[] = HOUSE_SHARDS.map((space) => {
      // 관전 선택지(observe)는 함께 걷기 연결의 약속이다. 넘기는 값을 따로 묶어 두어 연결 쪽 타입이 늦게 들어와도 그대로 맞는다
      const options = {
        space,
        observe: true,
        onPlayers: (ps: RemotePlayer[]) => {
          lists.set(space, ps);
          if (!queued) {
            queued = true;
            queueMicrotask(flush);
          }
        },
        onStatus: (st: NetStatus) => {
          if (alive) setStates((m) => (m[space] === st ? m : { ...m, [space]: st }));
        },
        onChat: (m: NetChat) => {
          if (!alive || m.self) return;
          live.current.onHeard({ key: `${space}:${m.id}:${m.at}`, name: m.name || '손님', text: m.text, at: m.at, space });
        },
      };
      return connectNet(options);
    });
    return () => {
      alive = false;
      nets.forEach((n) => n.close());
    };
  }, [enabled]);
  return { states, summary: summarize(states) };
}
