'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ROOM_SCENES } from '@/content/room-worlds';
import { ROOM_BY_SLUG, type Door } from '@/content/rooms';
import type { Hotspot } from '@/content/world';
import { GAMES } from '@/games/registry';
import type { Role } from '@/lib/access';
import type { CharacterLook } from '@/walk/look';
import type { Destination, NavPoint } from '@/walk/nav';
import type { Season, View, WalkController, WalkState } from '@/walk/scene';
import { CharacterPanel } from './walk/CharacterPanel';
import { ChatButton, ChatInput, ChatLog } from './walk/ChatBar';
import { actLabel, interactFor, portalItems } from './walk/controls';
import { GameOverlay } from './walk/GameOverlay';
import { HelpPanel } from './walk/HelpPanel';
import { HotspotPanel } from './walk/HotspotPanel';
import { MapCanvas, useMapTheme } from './walk/MapCanvas';
import { MapDialog } from './walk/MapDialog';
import { PeopleChip } from './walk/PeopleChip';
import { PortalPanel } from './walk/PortalPanel';
import * as P from './walk/prefs';
import { TouchPad } from './walk/TouchPad';
import { useBarHeight } from './walk/useBarHeight';
import { useCharacter } from './walk/useCharacter';
import { useFade } from './walk/useFade';
import { useFamilyRooms } from './walk/useFamilyRooms';
import { useNet } from './walk/useNet';
import { saveHousePos, usePositionSave } from './walk/usePositionSave';
import { useShot } from './walk/useShot';
import { useSpace } from './walk/useSpace';
import { useWalkKeys } from './walk/useWalkKeys';
import { OnboardCard, WalkHint } from './walk/WalkGuide';
import { WalkLoading } from './walk/WalkLoading';
import { WalkMenu, type MenuAction } from './walk/WalkMenu';
import { ShotFlash, ShotToast } from './walk/WalkShot';
import { WalkTools } from './walk/WalkTools';
import { WayBanner, WayfindPanel, placeTitle } from './walk/WayfindPanel';

type Props = {
  doors: Record<string, Door>;
  /** 내 이름표(3인칭 인형 위, 함께 걷기 이름 목록) */
  name: string;
  /** 놀이에 넘기는 이름(로그인 전이면 '손님') */
  nickname: string;
  role: Role;
  dollColor: string;
  lantern: { lit: number; today: number } | null;
  canStamp: boolean;
  /** 명단 손님이면 서버에서 실제 축척의 집을 받아 걷는다 */
  realHouse: boolean;
  /** 손님 이상: 함께 걷기와 가족 방 이름표를 받아 본다(서버가 한 번 더 확인한다) */
  together: boolean;
  /** 내 캐릭터 겉모습(서버가 프로필에서 읽음, 없으면 인형 색으로 만든 기본 인형) */
  look: CharacterLook;
  /** 로그인했는지: 사진은 내 갤러리로, 아니면 기기에 내려받기. 사진 캐릭터도 로그인해야 */
  signedIn: boolean;
};

type Onboard = 'off' | 'on' | 'leaving';
/** 길 찾기 패널: 닫힘(false) 또는 연 순간의 내 자리 */
type Way = false | NavPoint | null;

// WebGL이 되는지 한 번만 물어보고, 물어보려고 만든 문맥은 바로 놓는다(방을 드나들 때마다 문맥이 쌓이지 않게)
let webglOk: boolean | null = null;
function hasWebGL(): boolean {
  if (webglOk !== null) return webglOk;
  const probe = document.createElement('canvas');
  const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGLRenderingContext | null;
  // 된다는 답만 기억한다(탭이 많아 잠깐 못 만든 경우 다음에 다시 물어보게)
  const ok = Boolean(gl);
  if (ok) webglOk = true;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return ok;
}

/** 3D를 못 연 까닭: WebGL 없음, 새 배포와 어긋난 코드 조각, 그리다 난 오류 */
type FailKind = 'webgl' | 'load' | 'draw' | 'lost';
const CHUNK_RE = /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i;
const RELOADED_KEY = 'jy.walk.reloaded';

// 3D 걷기 화면. three.js는 이 화면을 열 때만 따로 받아 온다(첫 화면을 가볍게).
// 집 세계와 방 장면을 드나들고(useSpace), 길 찾기·놀이 덮개·함께 걷기를 얹는다.
export function WalkClient({ doors, name, nickname, role, dollColor, lantern, canStamp, realHouse, together, look, signedIn }: Props) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const ctrl = useRef<WalkController | null>(null);
  const nearRef = useRef<Hotspot | null>(null);
  const levelRef = useRef<1 | 2>(1);
  const firstBuild = useRef(true);
  const init = useRef({ dollColor, name });
  const { space, world, canEnter, takeArrive, enterRoom, leaveRoom } = useSpace(doors, realHouse);
  const [view, setViewState] = useState<View>('first');
  const [locked, setLocked] = useState(false);
  const [near, setNear] = useState<Hotspot | null>(null);
  const [open, setOpen] = useState<Hotspot | null>(null);
  const [place, setPlace] = useState('앞마당');
  const [level, setLevel] = useState<1 | 2>(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fail, setFail] = useState<{ kind: FailKind; detail: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [way, setWay] = useState<Way>(false);
  const [going, setGoing] = useState<string | null>(null);
  const [game, setGame] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [menu, setMenu] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  /** 포인터 잠금이 풀린 때(그 Esc로 메뉴를 열지 않게) */
  const unlockedAt = useRef(0);
  const character = useCharacter(look, signedIn);
  const lookRef = useRef(character.look);
  /** 엔진이 E·Enter에서 부르는 일(렌더마다 새 판단으로 바꿔 끼운다) */
  const interactRef = useRef<() => void>(() => {});
  const [onboard, setOnboardState] = useState<Onboard>('off');
  const onboardRef = useRef<Onboard>('off');
  const [hintOn, setHintOn] = useState(false);
  const [hintSeq, setHintSeq] = useState(0);
  const coarse = useSyncExternalStore(P.subscribeCoarse, P.isCoarse, () => false);
  const theme = useMapTheme();
  const fade = useFade();
  const family = useFamilyRooms(together);
  useBarHeight(root);

  const inRoom = world?.kind === 'room';
  const roomSlug = inRoom ? (world.room?.slug ?? (space?.kind === 'room' ? space.slug : null)) : null;
  // 함께 걷기 공간: 실제 집이면 'house:real', 방이면 'room:<slug>'. 다시 그린 집(실제 집을 못 받았을 때)은 잇지 않는다.
  const netSpace = world?.kind === 'real' ? 'house:real' : roomSlug ? `room:${roomSlug}` : null;
  const net = useNet({ enabled: together, space: netSpace, ctrl, myName: name });
  const canTalk = net.status === 'live';
  const showPeople = net.status === 'live' || net.status === 'connecting' || net.status === 'retrying';
  const ready = status === 'ready';
  usePositionSave(ctrl, ready && world ? world.kind : null, roomSlug);

  const panel = Boolean(open) || help || mapOpen || way !== false || Boolean(game) || menu || lookOpen || portalOpen;
  const live = useRef({ panel, game, way, mapOpen, canTalk, ready, world, chat, coarse, inRoom, roomSlug });
  useEffect(() => {
    live.current = { panel, game, way, mapOpen, canTalk, ready, world, chat, coarse, inRoom, roomSlug };
    lookRef.current = character.look;
  });

  // 손님에게만 오는 가족 방 이름표를 엔진의 문 이름으로(나중에 받으면 바로 바꿔 단다)
  const doorNames = useMemo(() => Object.fromEntries([...family].map(([slug, t]) => [slug, t.title])), [family]);
  const doorNamesRef = useRef(doorNames);
  useEffect(() => {
    if (doorNamesRef.current === doorNames) return;
    doorNamesRef.current = doorNames;
    ctrl.current?.setDoorNames(doorNames);
  }, [doorNames]);

  // 겉모습이 바뀌면(꾸미기, 사진 캐릭터가 다 그려짐) 내 캐릭터와 함께 걷는 사람들에게 바로
  const { setLook: netSetLook } = net;
  const appliedLook = useRef(character.look);
  useEffect(() => {
    if (appliedLook.current === character.look) return;
    appliedLook.current = character.look;
    ctrl.current?.setCharacter(character.look);
    netSetLook(character.look);
  }, [character.look, netSetLook]);

  const setOnboard = useCallback((v: Onboard) => {
    onboardRef.current = v;
    setOnboardState(v);
  }, []);
  // 첫 방문 카드 접기: 「알겠어요」, 걷기 시작(키·스틱), 화면 누르기·끌기, 시간이 지나면. 한 번 접히면 다시 안 나온다.
  const dismissOnboard = useCallback(() => {
    if (onboardRef.current !== 'on') return;
    P.saveOnboarded();
    const still = P.isStill();
    setOnboard(still ? 'off' : 'leaving');
    if (!still) window.setTimeout(() => { if (onboardRef.current === 'leaving') setOnboard('off'); }, P.ONBOARD_FADE_MS);
    if (!P.isCoarse()) {
      setHintOn(true);
      setHintSeq((n) => n + 1);
    }
  }, [setOnboard]);

  // 지도가 매 그림마다 읽는 걷기 상태
  const read = useCallback((): WalkState | null => {
    const c = ctrl.current;
    return c && typeof c.getState === 'function' ? c.getState() : null;
  }, []);
  const onState = useCallback((s: WalkState) => {
    if (s.level === levelRef.current) return;
    levelRef.current = s.level;
    setLevel(s.level);
  }, []);

  const { attach } = net;
  const { reveal } = fade;
  // 세계가 바뀔 때마다(처음, 방 들어가기·나오기) 걷기 장면을 새로 짓는다
  useEffect(() => {
    if (!world) return;
    let disposed = false;
    let c: WalkController | null = null;
    const webgl = hasWebGL();
    (webgl ? import('@/walk/scene') : Promise.reject(new Error('no-webgl')))
      .then(({ createWalk }) => {
        if (disposed || !host.current) return;
        const season = (document.documentElement.dataset.season ?? 'autumn') as Season;
        const at = takeArrive(world);
        // 시점은 늘 기억해 둔 값(jy.walk.view.v2, 처음이면 3인칭). 자리 기억에 남은 예전 시점은 따르지 않는다
        const startView: View = P.readView();
        setViewState(startView);
        c = createWalk(host.current, {
          world,
          dollColor: init.current.dollColor,
          look: lookRef.current,
          doorNames: doorNamesRef.current,
          name: init.current.name,
          season,
          reducedMotion: P.isStill(),
          coarse: P.isCoarse(),
          view: startView,
          lookSensitivity: P.readSens(),
          label: label.current,
          onView: (v) => {
            setViewState(v);
            // 방 장면도 고른 시점으로 시작하므로(엔진이 강제하지 않는다) 어디서 바꾸든 기억한다
            P.saveView(v);
          },
          onPointerLock: (l) => {
            setLocked(l);
            if (l) dismissOnboard();
            else unlockedAt.current = performance.now();
          },
          uiRects: () => {
            const r = root.current;
            return r ? [...r.querySelectorAll<HTMLElement>(P.HUD_SEL)].map((el) => el.getBoundingClientRect()) : [];
          },
          onNear: (h) => {
            nearRef.current = h;
            setNear(h);
          },
          onLost: () => {
            if (disposed) return;
            setFail({ kind: 'lost', detail: 'webglcontextlost' });
            setStatus('error');
          },
          onPlace: setPlace,
          onInteract: () => interactRef.current(),
        });
        // 저장된 자리·문 앞으로. 막혔거나 허공이면 teleport가 false를 주고 들어오는 자리(spawn)에 그대로 선다
        if (at) c.teleport(at.x, at.z, at.level, at.yaw);
        ctrl.current = c;
        attach(c);
        setStatus('ready');
        try { sessionStorage.removeItem(RELOADED_KEY); } catch { /* 없어도 된다 */ }
        reveal();
        if (!firstBuild.current) return;
        firstBuild.current = false;
        const first = !P.readOnboarded();
        setOnboard(first ? 'on' : 'off');
        if (!first) {
          setHintOn(true);
          setHintSeq((n) => n + 1);
        }
      })
      .catch((err: unknown) => {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error('[walk] 3D 집을 열지 못했어요', err);
        const kind: FailKind = !webgl ? 'webgl' : CHUNK_RE.test(detail) ? 'load' : 'draw';
        // 새 배포 뒤 예전 페이지가 없어진 코드 조각을 부르면 한 번만 저절로 새로 고친다
        if (kind === 'load') {
          let again = false;
          try {
            again = !sessionStorage.getItem(RELOADED_KEY);
            if (again) sessionStorage.setItem(RELOADED_KEY, '1');
          } catch { /* 저장소를 못 쓰면 새로 고침하지 않는다 */ }
          if (again) {
            window.location.reload();
            return;
          }
        }
        if (!disposed) {
          setFail({ kind, detail: detail.slice(0, 160) });
          setStatus('error');
        }
        reveal();
      });
    return () => {
      disposed = true;
      c?.dispose();
      ctrl.current = null;
    };
  }, [world, setOnboard, dismissOnboard, takeArrive, attach, reveal]);

  useEffect(() => {
    ctrl.current?.setPaused(panel);
  }, [panel]);

  // 조작 안내는 처음 8초만 보이고 사라진다(?로 도움말을 다시 연다)
  useEffect(() => {
    if (!hintOn) return;
    const t = window.setTimeout(() => setHintOn(false), P.HINT_MS);
    return () => window.clearTimeout(t);
  }, [hintOn, hintSeq]);

  useEffect(() => {
    if (onboard !== 'on') return;
    const t = window.setTimeout(dismissOnboard, P.ONBOARD_MS);
    return () => window.clearTimeout(t);
  }, [onboard, dismissOnboard]);

  const closePanels = useCallback(() => {
    setOpen(null);
    setHelp(false);
    setMapOpen(false);
    setWay(false);
    setMenu(false);
    setLookOpen(false);
    setPortalOpen(false);
  }, []);
  const openMap = () => {
    closePanels();
    setMapOpen(true);
  };
  const toggleHelp = () => {
    const was = help;
    closePanels();
    setHelp(!was);
  };
  /** 길 찾기 열기: 지금 자리에서 갈 길을 찾는다(패널이 열린 동안 걷기는 멈춘다) */
  const openWay = useCallback(() => {
    closePanels();
    dismissOnboard();
    const s = ctrl.current?.getState();
    setWay(s ? { x: s.x, z: s.z, y: s.y, level: s.level } : null);
  }, [closePanels, dismissOnboard]);
  const stopGoing = () => {
    ctrl.current?.cancelPath();
    setGoing(null);
  };
  const walkTo = (d: Destination, path: NavPoint[]) => {
    setWay(false);
    const c = ctrl.current;
    if (!c) return;
    const { owner, title } = placeTitle(d, family);
    c.setPaused(false);
    setGoing(owner ? `${owner} ${title}` : title);
    c.walkPath(path, { onArrive: () => setGoing(null), onCancel: () => setGoing(null) });
  };
  const jumpTo = (d: Destination) => {
    setWay(false);
    ctrl.current?.cancelPath();
    setGoing(null);
    fade.run(() => { ctrl.current?.teleport(d.x, d.z, d.level, d.yaw); });
  };
  /** 장면을 바꾸기 전에 떠 있던 것들을 거둔다 */
  const resetForSwitch = () => {
    closePanels();
    nearRef.current = null;
    setNear(null);
    setGoing(null);
    setChat(false);
  };
  const goRoom = (slug: string) => {
    setOpen(null);
    ctrl.current?.cancelPath();
    fade.run(() => {
      const w = live.current.world;
      if (w && w.kind !== 'room') saveHousePos(ctrl.current, w.kind);
      resetForSwitch();
      enterRoom(slug);
    }, true);
  };
  const goHouse = () => {
    if (!roomSlug) return;
    const slug = roomSlug;
    setOpen(null);
    ctrl.current?.cancelPath();
    fade.run(async () => {
      resetForSwitch();
      await leaveRoom(slug);
    }, true);
  };
  const play = (id: string) => {
    setOpen(null);
    ctrl.current?.cancelPath();
    setGoing(null);
    setChat(false);
    setGame(id);
  };
  const jump = () => ctrl.current?.jump();

  /** E·휴대폰 가운데 단추: 열린 방 문이면 바로 들어가고, 나가는 문이면 바로 나가고, 그 밖은 살피기 패널 */
  const interact = () => {
    const spot = nearRef.current;
    const i = interactFor(spot, canEnter, live.current.inRoom);
    if (!i) return;
    if (i.kind === 'enter') goRoom(i.slug);
    else if (i.kind === 'leave') goHouse();
    else setOpen(spot);
  };
  useEffect(() => {
    interactRef.current = interact;
  });
  const nearAct = actLabel(interactFor(near, canEnter, inRoom));

  // 포털 바로 가기(P): 걷지 않고 바로 그 방으로. 나오면 그 방 문 앞(숨은 포털이면 그 자리)
  const portals = useMemo(() => portalItems({
    inRoom,
    current: roomSlug,
    rooms: ROOM_SCENES.map((slug) => ({ slug, name: ROOM_BY_SLUG.get(slug)?.name ?? '방' })),
    canEnter,
    owners: family,
  }), [inRoom, roomSlug, canEnter, family]);
  const openPortals = () => {
    closePanels();
    dismissOnboard();
    setPortalOpen(true);
  };
  const pickPortal = (slug: string | null) => {
    setPortalOpen(false);
    if (slug === null) goHouse();
    else goRoom(slug);
  };
  const openLook = () => {
    closePanels();
    dismissOnboard();
    setLookOpen(true);
  };
  const openMenu = () => {
    closePanels();
    setChat(false);
    dismissOnboard();
    setMenu(true);
  };
  const shot = useShot(ctrl, signedIn, () => P.placeName(place));
  /** 같은 탭에서 갤러리로(떠나기 전에 자리를 적어 두어 돌아오면 그 자리) */
  const goGallery = () => {
    const w = live.current.world;
    if (w && w.kind !== 'room') saveHousePos(ctrl.current, w.kind);
    router.push('/gallery');
  };
  const onSens = (v: number) => ctrl.current?.setSensitivity(v);
  const onMenu = (a: MenuAction) => {
    setMenu(false);
    if (a === 'view') ctrl.current?.setView(view === 'first' ? 'third' : 'first');
    else if (a === 'look') openLook();
    else if (a === 'shot') void shot.take();
    else if (a === 'gallery') goGallery();
    else if (a === 'map') openMap();
    else if (a === 'way') openWay();
    else if (a === 'portal') openPortals();
    else if (a === 'help') setHelp(true);
    else if (a === 'leaveRoom') goHouse();
  };

  useWalkKeys(
    () => {
      const L = live.current;
      return { game: Boolean(L.game), ready: L.ready, panel: L.panel, anyOpen: L.panel || L.chat, canTalk: L.canTalk, coarse: L.coarse };
    },
    {
      dismissOnboard,
      closeAll: () => {
        closePanels();
        setChat(false);
      },
      menu: openMenu,
      help: toggleHelp,
      map: () => (mapOpen ? setMapOpen(false) : openMap()),
      way: () => (way !== false ? setWay(false) : openWay()),
      portal: () => (portalOpen ? setPortalOpen(false) : openPortals()),
      look: () => (lookOpen ? setLookOpen(false) : openLook()),
      shot: () => void shot.take(),
      talk: () => setChat(true),
      hasNear: () => Boolean(nearRef.current),
    },
    () => unlockedAt.current,
  );

  const showHint = ready && !coarse && hintOn && !near && !panel && !chat && onboard !== 'on';
  const full = net.status === 'full';
  const gameRoom = game ? (roomSlug ?? GAMES[game]?.room ?? '') : '';

  return (
    <div ref={root} className="walk-root" data-coarse={coarse ? 'true' : undefined} data-view={view} data-space={inRoom ? 'room' : 'house'}>
      <div ref={host} className="walk-canvas" onPointerDown={dismissOnboard} />
      <div ref={label} className="walk-label" aria-hidden="true">{name}</div>

      <div className="walk-top">
        <div className="walk-place-slot">
          {ready ? (
            <div className="walk-place" aria-live="polite">
              {inRoom ? (
                <span className="walk-floor" data-level="room">방</span>
              ) : (
                <span key={`f${level}`} className="walk-floor walk-pop" data-level={level}>{level}층</span>
              )}
              <span key={place} className="walk-place-name walk-pop">{P.placeName(place)}</span>
            </div>
          ) : null}
        </div>
        <WalkTools
          ready={ready}
          coarse={coarse}
          view={view}
          inRoom={inRoom}
          mapOpen={mapOpen}
          wayOpen={way !== false}
          help={help}
          menuOpen={menu}
          people={showPeople ? <PeopleChip status={net.status} players={net.players} me={name} /> : null}
          onView={() => ctrl.current?.setView(view === 'first' ? 'third' : 'first')}
          onMap={() => (mapOpen ? setMapOpen(false) : openMap())}
          onWay={() => (way !== false ? setWay(false) : openWay())}
          onHelp={toggleHelp}
          onMenu={() => (menu ? setMenu(false) : openMenu())}
          onShot={() => void shot.take()}
          onLeaveRoom={goHouse}
        />
      </div>

      {ready && going && !panel ? <WayBanner title={going} onStop={stopGoing} /> : null}

      {ready && world ? (
        <button
          type="button"
          className="walk-mini"
          onClick={openMap}
          aria-label={inRoom ? '방 지도 크게 보기' : '집 지도 크게 보기'}
          title={inRoom ? '방 지도 크게 보기 (M)' : '집 지도 크게 보기 (M)'}
          aria-keyshortcuts="M"
          tabIndex={mapOpen ? -1 : undefined}
        >
          <MapCanvas world={world} read={read} mode="mini" theme={theme} onState={onState} />
        </button>
      ) : null}

      {ready && coarse && canTalk && !panel && !chat ? <ChatButton onClick={() => setChat(true)} /> : null}
      {ready && !panel && (full || net.lines.length > 0) ? (
        <div className="walk-talk">
          {full ? <p className="walk-notice" role="status">지금 사람이 많아 혼자 걸어요</p> : null}
          <ChatLog lines={net.lines} />
        </div>
      ) : null}
      {ready && chat && canTalk && !panel ? <ChatInput coarse={coarse} onSend={net.say} onClose={() => setChat(false)} /> : null}

      {status === 'loading' ? <WalkLoading /> : null}
      {status === 'error' ? (
        <div className="walk-center walk-card">
          <p>
            {fail?.kind === 'webgl'
              ? '이 브라우저에서 3D(WebGL)가 꺼져 있거나 지금 쓸 수 없어요. 열린 3D 탭을 줄이거나 다른 브라우저로 열어 주세요.'
              : fail?.kind === 'lost'
                ? '3D 그리기가 잠시 멈췄어요. 다른 3D 탭을 닫고 다시 시도해 주세요.'
                : fail?.kind === 'load'
                ? '새 버전을 받는 중에 어긋났어요. 새로 고침하면 열려요.'
                : '3D 집을 그리다 문제가 생겼어요. 다시 시도해 주세요.'}
          </p>
          {fail && fail.kind !== 'webgl' && fail.kind !== 'lost' ? <p className="small walk-panel-meta">알려 주실 때: {fail.detail}</p> : null}
          <div className="btn-row">
            <button type="button" className="btn btn-pine" onClick={() => window.location.reload()}>다시 시도</button>
            <Link className="btn btn-roof" href="/map">그림 지도로 둘러보기</Link>
          </div>
        </div>
      ) : null}

      {ready && view === 'first' && !panel ? <span className="walk-reticle" aria-hidden="true" /> : null}

      {ready && near && !panel && !coarse && !chat ? (
        <button type="button" className="walk-near" onClick={interact} aria-keyshortcuts="E Enter">
          <kbd>E</kbd> {nearAct} · {near.title}
        </button>
      ) : null}

      {ready && !coarse ? (
        <WalkHint show={showHint} locked={locked} view={view} talk={canTalk} />
      ) : null}

      {ready && onboard !== 'off' && !panel ? (
        <OnboardCard state={onboard} coarse={coarse} onDismiss={dismissOnboard} />
      ) : null}

      {coarse && ready && !panel ? (
        <TouchPad
          near={near}
          actText={nearAct}
          onMove={(x, y) => {
            ctrl.current?.setStick(x, y);
            if (Math.hypot(x, y) > 0.2) dismissOnboard();
          }}
          onLook={(x, y) => {
            ctrl.current?.setLook?.(x, y);
            if (Math.hypot(x, y) > 0.2) dismissOnboard();
          }}
          onInspect={interact}
          onJump={jump}
        />
      ) : null}

      {open ? (
        <HotspotPanel
          spot={open}
          doors={doors}
          lantern={lantern}
          canStamp={canStamp}
          family={family}
          canEnter={canEnter}
          onEnter={goRoom}
          onLeave={goHouse}
          onPlay={play}
          onClose={() => setOpen(null)}
          coarse={coarse}
        />
      ) : null}

      {help ? <HelpPanel coarse={coarse} real={world?.kind === 'real'} room={inRoom} together={canTalk} onClose={() => setHelp(false)} /> : null}

      {menu ? (
        <WalkMenu coarse={coarse} view={view} inRoom={inRoom} canLook onAction={onMenu} onSens={onSens} />
      ) : null}

      {portalOpen ? <PortalPanel items={portals} inRoom={inRoom} onPick={pickPortal} onClose={() => setPortalOpen(false)} /> : null}

      {lookOpen ? (
        <CharacterPanel
          look={character.look}
          onChange={(l: CharacterLook) => character.setLook(l)}
          onClose={() => setLookOpen(false)}
          photo={{ enabled: signedIn }}
        />
      ) : null}

      {shot.note ? <ShotToast note={shot.note} onGallery={goGallery} /> : null}
      <ShotFlash n={shot.flash} />

      {mapOpen && world ? (
        <MapDialog world={world} read={read} theme={theme} level={level} place={P.placeName(place)} coarse={coarse} onClose={() => setMapOpen(false)} />
      ) : null}

      {way !== false && world ? (
        <WayfindPanel
          world={world}
          from={way}
          family={family}
          onWalk={walkTo}
          onJump={jumpTo}
          onClose={() => setWay(false)}
          canEnter={canEnter}
          onEnter={(slug) => {
            setWay(false);
            goRoom(slug);
          }}
          onPortals={openPortals}
        />
      ) : null}

      {game ? (
        <GameOverlay
          game={game}
          room={gameRoom}
          nickname={nickname}
          role={role}
          coarse={coarse}
          theme={theme}
          canStamp={canStamp}
          onClose={() => setGame(null)}
        />
      ) : null}

      <div className="walk-fade" data-on={fade.dark ? 'true' : undefined} aria-hidden="true" />
    </div>
  );
}
