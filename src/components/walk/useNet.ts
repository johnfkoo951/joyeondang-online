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
  /**
   * 지금까지 들은 다른 사람의 말 수(말 숨기기가 감춘 동안 온 말을 센다). 기록은 다섯 줄만 남기므로
   * 한 번에 여러 말이 와도 빠짐없이 세려고 따로 센다
   */
  const [heard, setHeard] = useState(0);
  const net = useRef<Net | null>(null);
  const spaceRef = useRef(space);
  const playersRef = useRef<RemotePlayer[]>([]);
  /** 지금 화면에 알린 사람 목록의 열쇠(id·이름·색). 자리는 넣지 않는다 */
  const rosterKey = useRef('');
  const nameRef = useRef(myName);
  const ready = enabled && space !== null;

  useEffect(() => {
    nameRef.current = myName;
  });

  const push = useCallback((l: ChatLine) => setLines((ls) => [...ls, l].slice(-LOG_MAX)), []);

  // 공간이 바뀌면 같은 연결로 옮긴다. 앞 공간 사람은 바로 지운다.
  // 이 effect는 아래 「잇기」보다 반드시 먼저 있어야 한다: 집 데이터가 와서 공간이 처음 정해지는 바로 그 렌더에서
  // 잇기 effect가 spaceRef를 읽는데, effect는 적힌 순서로 돌기 때문이다(뒤에 있으면 빈 공간을 읽고 영영 잇지 않는다).
  useEffect(() => {
    if (spaceRef.current === space) return;
    spaceRef.current = space;
    playersRef.current = [];
    rosterKey.current = '';
    queueMicrotask(() => setPlayers([]));
    ctrl.current?.setOthers([]);
    if (space) net.current?.join(space);
  }, [space, ctrl]);

  useEffect(() => {
    if (!ready) return;
    // 끊을 때는 그때의 컨트롤러(장면을 다시 지었으면 새 것)에서 사람들을 지운다
    const walk = ctrl;
    let alive = true;
    let denied = false;
    let everLive = false;
    if (!spaceRef.current) return;
    // 출입증은 연결이 스스로 받는다(못 받으면 물러났다가 다시 받고, 쓸 수 없다는 답이면 조용히 끈다).
    // 여기서 미리 한 번 받아 보던 것은 뺐다: 그 한 번이 실패하면 끝까지 혼자 걸었고, 될 때는 출입증을 두 번 받았다.
    const n: Net = connectNet({
      space: spaceRef.current,
      onPlayers: (ps) => {
        if (!alive) return;
        playersRef.current = ps;
        // 누가 있는지(이름·색)가 바뀔 때만 화면을 다시 그린다. 자리만 바뀐 것은 3D로만 넘긴다
        // (자리가 바뀔 때마다 걷기 화면 전체를 초당 열 번씩 다시 그리지 않게)
        const key = ps.map((p) => `${p.id}|${p.name}|${p.color}`).join(',');
        if (key !== rosterKey.current) {
          rosterKey.current = key;
          setPlayers(ps);
        }
        ctrl.current?.setOthers(ps);
      },
      // 다른 사람 말만 기록에 더한다(내 말은 보낼 때 바로 적었다. 서버를 돌아온 내 말은 건너뛴다)
      onChat: (m) => {
        if (!alive || m.self) return;
        push({ key: `${m.id}:${m.at}`, name: m.name || '손님', text: m.text, at: m.at });
        setHeard((n) => n + 1);
      },
      onStatus: (st) => {
        if (!alive) return;
        if (st === 'denied') {
          // 들어올 수 없는 사람(또는 함께 걷기를 쓰지 않는 곳): 조용히 끈다
          denied = true;
          queueMicrotask(() => n.close());
          net.current = null;
          setStatus('off');
          return;
        }
        // 처음 이어지기 전에는 잇는 중 표시를 띄우지 않는다(쓸 수 없는 곳에서 「…」 칩이 깜박이지 않게). 가득 찼다는 알림은
        // 띄우고, 한번 띄웠으면 그 뒤 상태도 그대로 넘긴다(자리가 나서 다시 잇는 동안 「사람이 많아」가 남지 않게)
        if (st === 'live' || st === 'full') everLive = true;
        if (!everLive) return;
        setStatus(st);
      },
    });
    if (!denied) net.current = n;
    return () => {
      alive = false;
      n.close();
      net.current = null;
      playersRef.current = [];
      rosterKey.current = '';
      walk.current?.setOthers([]);
      setStatus('off');
      setPlayers([]);
    };
  }, [ready, ctrl, push]);

  const live = status === 'live';
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => {
      const c = ctrl.current;
      if (!c || !net.current) return;
      const s = c.getState();
      // 남에게는 몸 방향을 보낸다(3인칭 카메라 방향이 아니라)
      net.current.sendState({ x: s.x, z: s.z, y: s.y, level: s.level, yaw: s.bodyYaw, moving: s.moving, jumps: s.jumps, sitting: s.sitting });
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

  return { status, players, lines, heard, say, attach, setLook };
}
