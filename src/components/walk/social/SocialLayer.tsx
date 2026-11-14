'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { SAY_MAX, clip, type ChatMessage } from '@/lib/social';
import type { CharacterLook } from '@/walk/look';
import { findPath, navReady, prepareNav, relaxNav, type Destination, type NavPoint } from '@/walk/nav';
import type { NetStatus } from '@/walk/net';
import type { WalkController } from '@/walk/scene';
import type { HouseWorld, RemotePlayer } from '@/walk/types';
import type { ChatLine } from '../useNet';
import { WALK_EVENT, onWalk } from '../walk-events';
import { ChatPanel } from './ChatPanel';
import { personDest, reachOf, spotNear, type GoWhy, type Reach } from './go-to-person';
import { MentionCards } from './MentionCards';
import type { Person } from './mention';
import { PeoplePanel } from './PeoplePanel';
import { useChatFeed } from './useChatFeed';
import { useMentions } from './useMentions';
import { useOnline, type OnlinePerson } from './useOnline';
import { useSocialMe } from './useSocialMe';
import { useTrail } from './useTrail';

type Props = {
  /** 명단 손님 이상(함께 걷기를 쓰는 사람). 아니면 아무것도 하지 않는다 */
  enabled: boolean;
  /** 3D 첫 그림이 나왔다(그 뒤에 대화·접속자를 잇는다) */
  ready: boolean;
  /** 함께 걷기 공간('house:real' | 'room:<slug>' | null) */
  space: string | null;
  /** 지금 구역 이름(접속자 목록의 내 줄) */
  place: string;
  /** 내 이름표(나를 아직 못 받았을 때) */
  name: string;
  /** 지금 내 캐릭터 겉모습(바꾸면 접속자 목록에도) */
  look: CharacterLook;
  ctrl: RefObject<WalkController | null>;
  /** 함께 걷기(useNet): 말풍선 띄우기, 같은 공간 사람(latest는 자리까지 최신), 말 기록 */
  net: { status: NetStatus; players: RemotePlayer[]; lines: ChatLine[]; say: (text: string) => boolean; latest: () => RemotePlayer[] };
  coarse: boolean;
  /** 걷기 화면의 패널·놀이가 열려 있음 */
  covered: boolean;
  /** 지금 걷는 세계(접속자 옆 빈자리 고르기, 걸어갈 길). 없으면 「걸어가기」·「바로 가기」를 두지 않는다 */
  world: HouseWorld | null;
  /** 길 찾기와 같은 옮기기(어둡게 했다가 그 자리로)와 걷기(움직이면 멈춘다) */
  onJumpTo: (d: Destination) => void;
  onWalkTo: (d: Destination, path: NavPoint[]) => void;
};

/** 접속자 목록을 닫은 뒤에도 이만큼은 목록을 계속 받는다(열고 닫을 때마다 채널을 다시 열지 않게) */
const LINGER_MS = 60_000;
/** 첫 그림 뒤 대화·접속자를 잇기까지 흩뜨리는 시간(청중이 한꺼번에 들어올 때 Realtime 초당 한도를 넘지 않게) */
const JITTER_MS = 4_000;
const CARDS_MAX = 3;
/** 접속자 목록을 아직 못 받았을 때(렌더마다 새 빈 목록이면 짝짓기를 렌더마다 다시 한다) */
const NO_PEOPLE: OnlinePerson[] = [];

// 걷기 화면의 접속자·대화(저장)·멘션·걸은 길. WalkClient에는 이 한 줄만 붙는다.
// 창은 단축키·메뉴가 보내는 신호(walk-events: openChat, openPeople, closeAll)와 「함께 N」 칩으로 열린다.
export function SocialLayer({ enabled, ready, space, place, name, look, ctrl, net, coarse, covered, world, onJumpTo, onWalkTo }: Props) {
  const [start, setStart] = useState(false);
  const [panel, setPanel] = useState<'chat' | 'people' | null>(null);
  const [prefill, setPrefill] = useState<Person | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [cards, setCards] = useState<ChatMessage[]>([]);
  const [linger, setLinger] = useState(false);
  /** 「걸어가기」·「바로 가기」를 눌렀는데 가지 못한 줄(접속자 sub, 같은 곳 줄은 함께 걷기 id), 그 까닭, 그때의 짝짓기 표 */
  const [miss, setMiss] = useState<{ key: string; why: GoWhy; at: ReadonlyMap<string, Reach> } | null>(null);
  /** 걸어갈 길 격자를 이 화면이 기다려 받은 세계 */
  const [navWorld, setNavWorld] = useState<HouseWorld | null>(null);
  const pickerOpenRef = useRef(false);

  // 첫 그림이 나오고 조금 뒤에 한 번 잇는다(그 뒤로는 그대로)
  useEffect(() => {
    if (!enabled || !ready || start) return;
    const t = window.setTimeout(() => setStart(true), Math.random() * JITTER_MS);
    return () => window.clearTimeout(t);
  }, [enabled, ready, start]);

  const on = enabled && start;
  const me = useSocialMe(on);
  useEffect(() => {
    if (panel) {
      queueMicrotask(() => setLinger(true));
      return;
    }
    const t = window.setTimeout(() => setLinger(false), LINGER_MS);
    return () => window.clearTimeout(t);
  }, [panel]);
  const online = useOnline({ me, space, look, receive: panel !== null || linger, start: on });
  const feed = useChatFeed({ me, open: panel === 'chat' });
  useTrail({ enabled, space, ctrl });

  // 최신 값을 신호 처리기에서 읽는다
  const live = useRef({ panel, covered, people: online.people, net, space, send: feed.send, me });
  useEffect(() => {
    live.current = { panel, covered, people: online.people, net, space, send: feed.send, me };
  });

  const open = useCallback((which: 'chat' | 'people') => {
    // 마우스가 잠겨 있으면 풀어 창을 누를 수 있게
    if (document.pointerLockElement) document.exitPointerLock();
    setPanel(which);
  }, []);
  const close = useCallback(() => {
    setPanel(null);
    setFocusId(null);
    setPrefill(null);
    setMiss(null);
  }, []);

  // 걸어갈 길 격자: 접속자 목록이 열린 동안 아직이면 서둘러 만든다(길 찾기 패널과 같다). 보통은 걷는 사이 이미 만들어 두었다
  useEffect(() => {
    if (panel !== 'people' || !world || navReady(world)) return;
    let off = false;
    void prepareNav(world, { urgent: true }).then(() => {
      if (!off) setNavWorld(world);
    });
    return () => {
      off = true;
      relaxNav(world);
    };
  }, [panel, world]);
  const walkReady = world !== null && (navWorld === world || navReady(world));
  // 접속자 한 줄이 같은 장면의 누구인지(누가 있는지나 겉모습이 바뀔 때만 다시 본다. 자리는 누를 때 최신으로 다시 짝짓는다)
  const rows = online.synced ? online.people : NO_PEOPLE;
  const reach = useMemo(() => reachOf(rows, space, net.players), [rows, space, net.players]);
  // 가지 못한 까닭은 그때의 사람들 기준이다: 누가 들고 나면 거둔다(지난 까닭이 남아 있지 않게)
  const missNow = miss && miss.at === reach ? miss : null;

  useEffect(() => {
    if (!enabled) return;
    const offChat = onWalk(WALK_EVENT.openChat, (detail) => {
      const sub = (detail as { mention?: unknown } | null | undefined)?.mention;
      const p = typeof sub === 'string' ? live.current.people.find((x) => x.sub === sub) : undefined;
      if (p) setPrefill({ sub: p.sub, name: p.name });
      open('chat');
    });
    const offPeople = onWalk(WALK_EVENT.openPeople, () => open('people'));
    const offAll = onWalk(WALK_EVENT.closeAll, close);
    return () => {
      offChat();
      offPeople();
      offAll();
    };
  }, [enabled, open, close]);

  // 걷기 화면이 패널을 열면 내 창은 닫는다(겹쳐 가리지 않게). 이미 패널이 있는데 내 창을 연 것은 그대로 둔다
  const wasCovered = useRef(covered);
  useEffect(() => {
    if (covered && !wasCovered.current) queueMicrotask(close);
    wasCovered.current = covered;
  }, [covered, close]);

  // Esc는 내 창을 닫는다. 내 창만 열려 있으면 삼켜 메뉴가 열리지 않게, 걷기 화면의 패널도 열려 있으면 그것도 같이 닫히게 흘린다.
  // @ 고르기 목록이 열려 있으면 입력칸이 목록부터 닫는다. 한글 조합 중이면 무시
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || pickerOpenRef.current) return;
      if (!live.current.covered) e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [panel, close]);

  // 나를 멘션한 글: 대화창이 닫혀 있으면 카드로(열려 있으면 거기서 밝게 보인다)
  const onMention = useCallback((m: ChatMessage) => {
    if (live.current.panel === 'chat') return;
    setCards((cs) => [m, ...cs.filter((c) => c.id !== m.id)].slice(0, CARDS_MAX));
    try {
      if (window.matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(40);
    } catch {
      // 진동을 못 해도 된다
    }
  }, []);
  useMentions(on ? me : null, onMention);
  const dismiss = useCallback((id: string) => setCards((cs) => cs.filter((c) => c.id !== id)), []);
  const openCard = (m: ChatMessage) => {
    dismiss(m.id);
    feed.put(m);
    setFocusId(m.id);
    open('chat');
  };

  // Enter로 한 말(말풍선)도 대화 기록에 남긴다. 대화창에서 보내며 띄운 말풍선은 이미 남겼으니 건너뛴다
  const seen = useRef<Set<string> | null>(null);
  const skip = useRef<{ text: string; until: number } | null>(null);
  useEffect(() => {
    const lines = net.lines;
    if (!seen.current) {
      seen.current = new Set(lines.map((l) => l.key));
      return;
    }
    for (const l of lines) {
      if (seen.current.has(l.key)) continue;
      seen.current.add(l.key);
      if (!l.me) continue;
      const sk = skip.current;
      if (sk && sk.text === l.text && Date.now() < sk.until) {
        skip.current = null;
        continue;
      }
      const L = live.current;
      if (L.me?.canChat) void L.send(l.text, [], L.space, 'say');
    }
    if (seen.current.size > 200) seen.current = new Set(lines.map((l) => l.key));
  }, [net.lines]);

  // 대화창에서 보낸 글: 저장하고, 함께 걷기가 이어져 있으면 같은 공간 사람들 머리 위에도 띄운다(말풍선은 80자)
  const sendFromWindow = useCallback(async (body: string, mentions: Person[]) => {
    const L = live.current;
    const r = await L.send(body, mentions.map((m) => m.sub), L.space, 'window');
    if (r.ok && L.net.status === 'live') {
      const t = clip(body, SAY_MAX).normalize('NFC').trim().slice(0, SAY_MAX);
      skip.current = { text: t, until: Date.now() + 2000 };
      if (!L.net.say(t)) skip.current = null;
    }
    return r;
  }, []);
  const prefillUsed = useCallback(() => setPrefill(null), []);

  // 접속자 한 줄의 「걸어가기」·「바로 가기」: 누른 순간의 자리로 그 사람 옆 빈자리를 고르고, 길 찾기와 같은 걷기·옮기기로 간다.
  // key는 접속자 줄이면 sub, 접속자 목록을 못 받아 같은 곳 사람만 보일 때는 함께 걷기 id다
  const goTo = (key: string, how: 'walk' | 'jump') => {
    const c = ctrl.current;
    if (!world || !c) return;
    const all = net.latest();
    // 그사이 다시 이어 id가 바뀌었을 수 있어 누른 순간의 목록으로 다시 짝짓는다
    const r = online.synced ? reachOf(online.people, space, all).get(key) : { kind: 'here' as const, id: key };
    const t = r?.kind === 'here' ? all.find((p) => p.id === r.id) : undefined;
    if (!t) {
      setMiss({ key, why: r && r.kind !== 'here' ? r.kind : 'unseen', at: reach });
      return;
    }
    const me = c.getState();
    const s = spotNear(world, t, { x: me.x, z: me.z }, all);
    if (!s) {
      setMiss({ key, why: 'nospot', at: reach });
      return;
    }
    const d = personDest({ id: t.id, name: t.name }, s);
    let path: NavPoint[] | null = null;
    if (how === 'walk') {
      try {
        path = findPath(world, { x: me.x, z: me.z, y: me.y, level: me.level }, { x: s.x, z: s.z, level: s.level });
      } catch {
        path = null;
      }
    }
    close();
    // 걸어갈 길이 없으면 길 찾기에서 걷다 막혔을 때처럼 그 자리로 바로 옮긴다
    if (path && path.length > 0) onWalkTo(d, path);
    else onJumpTo(d);
  };

  if (!enabled) return null;
  return (
    <>
      {panel === 'chat' ? (
        <ChatPanel
          me={me}
          feed={feed}
          people={online.people}
          peopleSynced={online.synced}
          coarse={coarse}
          prefill={prefill}
          onPrefillUsed={prefillUsed}
          focusId={focusId}
          onSend={sendFromWindow}
          onClose={close}
          onPeople={() => open('people')}
          pickerOpenRef={pickerOpenRef}
        />
      ) : null}
      {panel === 'people' ? (
        <PeoplePanel
          me={{ name: me?.name ?? name, look, space, place }}
          people={online.people}
          synced={online.synced}
          nearby={net.players}
          canMention={Boolean(me?.canChat)}
          coarse={coarse}
          go={world ? { reach, walkReady, miss: missNow, onGo: goTo } : null}
          onMention={(p) => {
            setPrefill(p);
            open('chat');
          }}
          onChat={() => open('chat')}
          onClose={close}
        />
      ) : null}
      {cards.length > 0 && panel !== 'chat' && !covered ? <MentionCards cards={cards} onOpen={openCard} onDismiss={dismiss} /> : null}
    </>
  );
}
