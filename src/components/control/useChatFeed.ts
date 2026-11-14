'use client';
import { useEffect, useState } from 'react';
import { ROOM_BY_SLUG } from '@/content/rooms';

/**
 * 컨트롤 룸 오른쪽 대화: 걷기 화면 대화의 저장 기록(/api/chat, 명단 손님 이상)을 묻는다. 처음에 새 글 50개, 그다음 FEED_MS마다
 * 그 뒤의 글만(?after=). 실시간 채널 대신 묻기를 쓴다: 무료 요금제의 실시간 한도는 손님들 몫으로 남긴다.
 * 대화 기록이 아직 없으면(404·503) 'none' — 화면은 관전 연결로 들은 집 안 말풍선을 대신 보인다
 */
export const FEED_MS = 4000;
const FEED_MAX = 200;

export type FeedLine = { id: string; at: string; ms: number; name: string; text: string; where: string | null; mentions: string[] };
export type FeedState = 'loading' | 'live' | 'none';

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** 공간 이름을 사람 말로: 집, 방이면 방 이름 */
export function whereOf(space: unknown): string | null {
  if (typeof space !== 'string') return null;
  if (space === 'house:real' || /^house:real~\d$/.test(space)) return '집';
  const m = /^room:([a-z0-9-]{2,32})(?:~\d)?$/.exec(space);
  return m ? (ROOM_BY_SLUG.get(m[1])?.name ?? '방') : null;
}

/** 대화 기록 한 줄(서버 답의 messages 하나)을 읽는다. 모자라면 null */
export function readFeed(raw: unknown): FeedLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, 64), at = str(o.at, 64), text = str(o.body, 2000);
  const ms = typeof o.ms === 'number' && Number.isFinite(o.ms) ? o.ms : at ? Date.parse(at) : NaN;
  if (!id || !at || !text || !Number.isFinite(ms)) return null;
  const mentions = (Array.isArray(o.mentions) ? o.mentions : [])
    .map((m) => (m && typeof m === 'object' ? str((m as Record<string, unknown>).name, 40) : null))
    .filter((n): n is string => Boolean(n))
    .slice(0, 5);
  return { id, at, ms, name: str(o.name, 40) ?? '손님', text, where: whereOf(o.space), mentions };
}

/** 가진 줄에 새 줄을 합친다(같은 id는 새것으로). 오래된 것부터, 많으면 뒤에서 max개 */
export function mergeFeed(have: readonly FeedLine[], add: readonly FeedLine[], max = FEED_MAX): FeedLine[] {
  const by = new Map(have.map((l) => [l.id, l]));
  for (const l of add) by.set(l.id, l);
  const all = [...by.values()].sort((a, b) => a.ms - b.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return all.length > max ? all.slice(all.length - max) : all;
}

export function useChatFeed(enabled: boolean): { lines: FeedLine[]; state: FeedState } {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [state, setState] = useState<FeedState>('loading');
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let have: FeedLine[] = [];
    let timer: number | undefined;
    const ask = async () => {
      const last = have[have.length - 1];
      // 커밋 차례가 뒤바뀐 글도 잡도록 마지막 글보다 5초 앞부터 겹쳐 묻는다(같은 글은 합친다)
      const q = last ? `after=${encodeURIComponent(new Date(last.ms - 5_000).toISOString())}&limit=100` : 'limit=50';
      try {
        const r = await fetch(`/api/chat?${q}`, { cache: 'no-store', credentials: 'same-origin' });
        if (!alive) return;
        if (r.status === 404 || r.status === 503) {
          // 대화 기록이 아직 열리지 않았다(배포 전, 표 없음). 한참 뒤 한 번 더 물어본다
          setState('none');
          timer = window.setTimeout(ask, FEED_MS * 15);
          return;
        }
        if (r.ok) {
          const j = (await r.json()) as { messages?: unknown; more?: unknown };
          let got = (Array.isArray(j.messages) ? j.messages : []).map(readFeed).filter((l): l is FeedLine => l !== null);
          if (!alive) return;
          if (got.length) {
            have = mergeFeed(have, got);
            setLines(have);
          }
          // 한 쪽이 가득 찼으면(몰릴 때) 같은 차례에 정확한 자리(마지막 글 뒤)부터 두 쪽까지 더 받는다:
          // 겹쳐 묻는 5초 안에 글이 100개를 넘으면 같은 100개만 계속 받아 멈추지 않게
          for (let i = 0; i < 2 && j.more === true && got.length; i++) {
            const tail = have[have.length - 1];
            const r2 = await fetch(`/api/chat?after=${encodeURIComponent(tail.at)}&aid=${encodeURIComponent(tail.id)}&limit=100`, { cache: 'no-store', credentials: 'same-origin' });
            if (!alive || !r2.ok) break;
            const j2 = (await r2.json()) as { messages?: unknown; more?: unknown };
            got = (Array.isArray(j2.messages) ? j2.messages : []).map(readFeed).filter((l): l is FeedLine => l !== null);
            if (got.length) {
              have = mergeFeed(have, got);
              setLines(have);
            }
            j.more = j2.more;
          }
          setState('live');
        }
      } catch {
        // 잠깐 끊김: 다음 차례에 다시
      }
      if (alive) timer = window.setTimeout(ask, FEED_MS);
    };
    void ask();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [enabled]);
  return { lines, state };
}
