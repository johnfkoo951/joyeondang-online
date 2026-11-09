'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { connectNet, type Net, type NetStatus } from '@/walk/net';
import type { WalkController } from '@/walk/scene';
import type { CharacterLook } from '@/walk/look';
import type { RemotePlayer } from '@/walk/types';

export type ChatLine = { key: string; name: string; text: string; at: number; me?: boolean };

const SEND_MS = 100;
const LOG_MAX = 5;

/**
 * 함께 걷기. enabled(손님 이상)이고 /api/game-token이 200일 때만 잇는다. 아니면 status는 'off' 그대로라 화면에 아무것도 안 뜬다.
 * space가 바뀌면(집 ↔ 방) 같은 연결로 join, 컨트롤러 상태는 10Hz로 보낸다(실제로 보내는 빈도는 net이 줄인다).
 */
export function useNet(opt: { enabled: boolean; space: string | null; ctrl: RefObject<WalkController | null>; myName: string }) {
  const { enabled, space, ctrl, myName } = opt;
  const [status, setStatus] = useState<NetStatus>('off');
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const net = useRef<Net | null>(null);
  const spaceRef = useRef(space);
  const playersRef = useRef<RemotePlayer[]>([]);
  const nameRef = useRef(myName);
  const ready = enabled && space !== null;

  useEffect(() => {
    nameRef.current = myName;
  });

  const push = useCallback((l: ChatLine) => setLines((ls) => [...ls, l].slice(-LOG_MAX)), []);

  useEffect(() => {
    if (!ready) return;
    // 끊을 때는 그때의 컨트롤러(장면을 다시 지었으면 새 것)에서 사람들을 지운다
    const walk = ctrl;
    let alive = true;
    let denied = false;
    let n: Net | null = null;
    fetch('/api/game-token', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => {
        if (!alive || !r.ok || !spaceRef.current) return;
        n = connectNet({
          space: spaceRef.current,
          onPlayers: (ps) => {
            if (!alive) return;
            playersRef.current = ps;
            setPlayers(ps);
            ctrl.current?.setOthers(ps);
          },
          // 다른 사람 말만 기록에 더한다(내 말은 보낼 때 바로 적었다. 서버를 돌아온 내 말은 건너뛴다)
          onChat: (m) => {
            if (!alive || m.self) return;
            push({ key: `${m.id}:${m.at}`, name: m.name || '손님', text: m.text, at: m.at });
          },
          onStatus: (s) => {
            if (!alive) return;
            if (s === 'denied') {
              // 들어올 수 없는 사람: 조용히 끈다
              denied = true;
              n?.close();
              net.current = null;
              setStatus('off');
              return;
            }
            setStatus(s);
          },
        });
        if (denied) n.close();
        else net.current = n;
      })
      .catch(() => {});
    return () => {
      alive = false;
      n?.close();
      net.current = null;
      playersRef.current = [];
      walk.current?.setOthers([]);
      setStatus('off');
      setPlayers([]);
    };
  }, [ready, ctrl, push]);

  // 공간이 바뀌면 같은 연결로 옮긴다. 앞 공간 사람은 바로 지운다.
  useEffect(() => {
    if (spaceRef.current === space) return;
    spaceRef.current = space;
    playersRef.current = [];
    queueMicrotask(() => setPlayers([]));
    ctrl.current?.setOthers([]);
    if (space) net.current?.join(space);
  }, [space, ctrl]);

  const live = status === 'live';
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => {
      const c = ctrl.current;
      if (!c || !net.current) return;
      const s = c.getState();
      net.current.sendState({ x: s.x, z: s.z, y: s.y, level: s.level, yaw: s.yaw, moving: s.moving });
    }, SEND_MS);
    return () => window.clearInterval(t);
  }, [live, ctrl]);

  /** 새 컨트롤러(장면을 다시 지었을 때)에 지금 사람들을 다시 넘긴다 */
  const attach = useCallback((c: WalkController) => c.setOthers(playersRef.current), []);

  /** 말하기. 보냈으면 내 머리 위에도 띄우고 기록에 남긴다 */
  const say = useCallback((text: string): boolean => {
    const t = text.normalize('NFC').trim().slice(0, 80);
    if (!t || !net.current) return false;
    if (!net.current.say(t)) return false;
    ctrl.current?.say(t);
    const at = Date.now();
    push({ key: `me:${at}`, name: nameRef.current, text: t, at, me: true });
    return true;
  }, [ctrl, push]);

  /** 내 겉모습이 바뀌면 같은 공간 사람들에게 알린다(서버가 10초에 한 번까지 받는다). 다시 이을 때는 출입증에 실린 저장값을 쓴다 */
  const setLook = useCallback((look: CharacterLook) => {
    net.current?.setLook(look);
  }, []);

  return { status, players, lines, say, attach, setLook };
}
