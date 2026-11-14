'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { ROOM_SCENES } from '@/content/room-worlds';
import { ROOM_BY_SLUG, type Door } from '@/content/rooms';
import type { Hotspot } from '@/content/world';
import { GAMES } from '@/games/registry';
import type { Role } from '@/lib/access';
import { FONT_LINK_ID } from '@/lib/fonts';
import type { CharacterLook } from '@/walk/look';
import { findPath, pauseNav, prepareNav, type Destination, type NavPoint } from '@/walk/nav';
import type { Season, View, WalkController, WalkState } from '@/walk/scene';
import { CharacterPanelLazy as CharacterPanel } from './walk/CharacterPanelLazy';
import { isQuiet, setQuiet, subscribeQuiet, unreadCount } from './walk/chat-quiet';
import { ChatButton, ChatInput, ChatLog, ChatQuietButton } from './walk/ChatBar';
import { actLabel, ariaKey, arriveYaw, blocksTalk, interactFor, portalItems } from './walk/controls';
import { GameBoundary } from './walk/GameBoundary';
import { ExhibitModal } from './walk/ExhibitModal';
import { GalleryViewer } from './walk/GalleryViewer';
import { RoomLeaderboardModal } from './games/LeaderboardPanel';
import { GameOverlay } from './walk/GameOverlay';
import { HelpPanel } from './walk/HelpPanel';
import { HotspotPanel } from './walk/HotspotPanel';
import { KeyHint } from './walk/KeyHint';
import { MapCanvas, useMapTheme } from './walk/MapCanvas';
import { onModelReady } from './walk/making-3d';
import { MakingChip } from './walk/MakingChip';
import { MapDialog } from './walk/MapDialog';
import { MapPick } from './walk/MapPick';
import { PeopleChip } from './walk/PeopleChip';
import { IconChevron } from './walk/icons';
import { PlaceText } from './walk/PlaceText';
import { PortalPanel } from './walk/PortalPanel';
import * as P from './walk/prefs';
import { TouchPad } from './walk/TouchPad';
import { useBarHeight } from './walk/useBarHeight';
import { useCharacter } from './walk/useCharacter';
import { useFade } from './walk/useFade';
import { useFamilyRooms } from './walk/useFamilyRooms';
import { useFullscreen } from './walk/useFullscreen';
import { useGallery } from './walk/useGallery';
import { useNet } from './walk/useNet';
import { usePet } from './walk/usePet';
import { saveHousePos, usePositionSave } from './walk/usePositionSave';
import { isSheetOpen, subscribeSheet } from './walk/sheet-state';
import { SHORTCUTS } from './walk/shortcuts';
import { useShot } from './walk/useShot';
import { useSpace } from './walk/useSpace';
import { useWalkKeys } from './walk/useWalkKeys';
import { useWalkTitle } from './walk/useWalkTitle';
import { WALK_EVENT, emitWalk } from './walk/walk-events';
import { OnboardCard, WalkHint } from './walk/WalkGuide';
import { InAppNote, useInApp } from './walk/WalkInApp';
import { WalkLoading } from './walk/WalkLoading';
import { WalkMenu, type MenuAction } from './walk/WalkMenu';
import { ShotFlash, ShotToast } from './walk/WalkShot';
import { SocialLayer } from './walk/social/SocialLayer';
import { WalkTools } from './walk/WalkTools';
import { WayArrived, WayBanner, WayfindPanel, placeTitle, type WayTarget } from './walk/WayfindPanel';

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
  /** 관리자(또는 이 맥의 미리보기): 지도 고르기로 실측 1층 시험 지도를 걸어 볼 수 있다(서버가 한 번 더 확인한다) */
  shellMap?: boolean;
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
/** 3D 문맥을 잃은 뒤 스스로 돌아오기를 기다리는 시간 */
const LOST_WAIT_MS = 2500;
/** 첫 그림이 나온 뒤 길 찾기 격자를 만들기 시작할 때까지(첫 화면이 자리 잡는 동안 비켜 있는다) */
const NAV_PREP_DELAY_MS = 1500;
/** 걸어서 도착했다는 띠를 보여 두는 시간 */
const ARRIVED_MS = 2500;

/**
 * 3D 안의 글씨(문패·표지판·현판)는 캔버스에 한 번 그려 굳힌다. 글꼴이 오기 전에 그리면 다른 글꼴로 굳으므로,
 * 쓸 글자의 글꼴을 잠깐(ms까지) 기다린다. 3D 코드를 받는 동안 함께 기다리므로 보통은 더 늦어지지 않는다.
 */
function fontsReady(sample: string, ms = 900): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  // 글꼴 CSS는 화면 그리기를 막지 않게 늦게 붙는다(layout.tsx). 아직 오는 중이면 그것부터 기다린다
  const css = new Promise<void>((done) => {
    const link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
    if (!link || link.media !== 'print') return done();
    link.addEventListener('load', () => done(), { once: true });
    link.addEventListener('error', () => done(), { once: true });
  });
  const load = css
    .then(() => new Promise<void>((done) => window.setTimeout(done, 0)))
    .then(() => document.fonts.load('700 32px "Pretendard Variable"', sample))
    .then(() => undefined, () => undefined);
  return Promise.race([load, new Promise<void>((done) => window.setTimeout(done, ms))]);
}

// 3D 걷기 화면. three.js는 이 화면을 열 때만 따로 받아 온다(첫 화면을 가볍게).
// 집 세계와 방 장면을 드나들고(useSpace), 길 찾기·놀이 덮개·함께 걷기를 얹는다.
export function WalkClient({ doors, name, nickname, role, dollColor, lantern, canStamp, realHouse, together, look, signedIn, shellMap = false }: Props) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const ctrl = useRef<WalkController | null>(null);
  const nearRef = useRef<Hotspot | null>(null);
  const levelRef = useRef<1 | 2>(1);
  const firstBuild = useRef(true);
  const lostTimer = useRef<number | undefined>(undefined);
  const init = useRef({ dollColor, name });
  const { space, world, canEnter, takeArrive, enterRoom, leaveRoom, fellBack, retryHouse, reloadHouse } = useSpace(doors, realHouse, shellMap);
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
  /** 걸어가는 곳과 걸어서 닿은 곳(띠가 지금 말로 보인다) */
  const [going, setGoing] = useState<WayTarget | null>(null);
  const [arrived, setArrived] = useState<WayTarget | null>(null);
  const [game, setGame] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [menu, setMenu] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  /** 크게 보는 갤러리 액자(id) */
  const [frameOpen, setFrameOpen] = useState<string | null>(null);
  const [exhibitOpen, setExhibitOpen] = useState<string | null>(null);
  const [boardRoomOpen, setBoardRoomOpen] = useState<string | null>(null);
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
  // 화면 말(한국어·영어). 서버와 첫 그림은 한국어, 바로 뒤에 고른 말로 다시 그린다(components/i18n/useLang)
  const lang = useLang();
  const tr = useTr();
  useWalkTitle(lang);
  /** 걷기 위에 페이지 시트(방 쪽지·수첩·갤러리 등)가 떠 있음 */
  const sheet = useSyncExternalStore(subscribeSheet, isSheetOpen, () => false);
  const theme = useMapTheme();
  const fade = useFade();
  const family = useFamilyRooms(together);
  // 집 안팎을 오가는 반려동물: 구경하는 분에게도 보이고, 이름은 서버가 손님 이상에게만 싣는다
  const pet = usePet();
  const petRef = useRef(pet);
  // 부엌 사진 갤러리: 액자가 걸린 실제 집이면 전시 목록을 받는다(손님에게만 서버가 준다)
  const galleryFrames = world?.kind === 'real' ? (world.gallery ?? null) : null;
  const gallery = useGallery(together && Boolean(galleryFrames?.length));
  useBarHeight(root);

  const inRoom = world?.kind === 'room';
  const roomSlug = inRoom ? (world.room?.slug ?? (space?.kind === 'room' ? space.slug : null)) : null;
  // 함께 걷기 공간: 실제 집이면 'house:real', 방이면 'room:<slug>'. 다시 그린 집(실제 집을 못 받았을 때)은 잇지 않는다.
  const netSpace = world?.kind === 'real' ? 'house:real' : roomSlug ? `room:${roomSlug}` : null;
  const net = useNet({ enabled: together, space: netSpace, ctrl, myName: name });
  // 전체 화면(문서 전체: 시트·창도 그대로 보인다). 못 쓰는 브라우저면 단추를 두지 않고 F도 아무 일을 하지 않는다
  const fs = useFullscreen();
  // 말 숨기기: 말 기록과 사람들 머리 위 말풍선(내 것도)을 감춘다. 고른 값은 이 기기에 기억한다(chat-quiet.ts)
  const quiet = useSyncExternalStore(subscribeQuiet, isQuiet, () => false);
  /** 숨길 때까지 들은 말 수(그 뒤에 온 말이 단추 위 숫자)와 그때 기록에 있던 줄(다시 보일 때 흐린 채로 나온다) */
  const [quietMark, setQuietMark] = useState<{ heard: number; seen: ReadonlySet<string> }>(() => ({ heard: 0, seen: new Set() }));
  const canTalk = net.status === 'live';
  const showPeople = net.status === 'live' || net.status === 'connecting' || net.status === 'retrying';
  const ready = status === 'ready';
  usePositionSave(ctrl, ready && world ? world.kind : null, roomSlug);

  // 페이지 시트도 패널처럼 걷기를 멈춘다(위의 HUD·안내도 패널이 열린 때처럼 접힌다)
  const panel = Boolean(open) || help || mapOpen || way !== false || Boolean(game) || menu || lookOpen || portalOpen || Boolean(frameOpen) || Boolean(exhibitOpen) || Boolean(boardRoomOpen) || sheet;
  // 놀이 덮개와 페이지 시트는 화면을 덮는다: 그동안 뒤의 3D는 그리지 않는다(배터리, 휴대폰 열)
  const frozen = Boolean(game) || sheet;
  // 장면을 다시 지을 때(방 드나들기, 집 다시 받기) 새 컨트롤러에도 지금의 멈춤·쉬기를 그대로 건다
  const hold = useRef({ paused: false, frozen: false });
  useEffect(() => {
    hold.current = { paused: panel, frozen };
  });
  const live = useRef({ panel, game, sheet, way, mapOpen, canTalk, ready, world, chat, coarse, inRoom, roomSlug });
  useEffect(() => {
    live.current = { panel, game, sheet, way, mapOpen, canTalk, ready, world, chat, coarse, inRoom, roomSlug };
    lookRef.current = character.look;
  });

  // 손님에게만 오는 가족 방 이름표를 엔진의 문 이름으로(나중에 받으면 바로 바꿔 단다)
  const doorNames = useMemo(() => Object.fromEntries([...family].map(([slug, t]) => [slug, t.title])), [family]);
  // 방 주인의 한마디: 문패 아래 카드(서버가 손님에게만 주는 line)
  const doorPhrases = useMemo(() => Object.fromEntries([...family].filter(([, t]) => t.line).map(([slug, t]) => [slug, t.line as string])), [family]);
  const doorPhrasesRef = useRef(doorPhrases);
  const doorNamesRef = useRef(doorNames);
  useEffect(() => {
    if (doorNamesRef.current === doorNames && doorPhrasesRef.current === doorPhrases) return;
    doorNamesRef.current = doorNames;
    doorPhrasesRef.current = doorPhrases;
    ctrl.current?.setDoorNames(doorNames, doorPhrases);
  }, [doorNames, doorPhrases]);
  // 반려동물을 장면이 지어진 뒤에 받으면 바로 들인다(먼저 받았으면 장면을 지을 때 넘긴다)
  useEffect(() => {
    if (petRef.current === pet) return;
    petRef.current = pet;
    // 실측 시험 지도는 가볍게: 반려동물 없이
    ctrl.current?.setPet(live.current.world?.kind === 'shell' ? null : pet);
  }, [pet]);
  // 함께 걷기에 이어져 있는지도 엔진에(반려동물이 나를 같은 집에 있는 사람으로 세는 것은 남의 화면에 내가 보일 때만).
  // 장면을 새로 지을 때도 이 값으로 시작한다
  const netLiveRef = useRef(canTalk);
  useEffect(() => {
    netLiveRef.current = canTalk;
    ctrl.current?.setNetLive(canTalk);
  }, [canTalk]);
  // 말 숨기기도 엔진에(사람들 머리 위 말풍선). 장면을 새로 지을 때도 이 값으로 시작한다
  const quietRef = useRef(quiet);
  useEffect(() => {
    quietRef.current = quiet;
    ctrl.current?.setTalkHidden(quiet);
  }, [quiet]);

  // 갤러리 전시 목록을 엔진에(나중에 받거나 다시 받으면 바로 바꿔 단다). 장면을 새로 지을 때도 이 값으로 시작한다
  const galleryItemsRef = useRef(gallery.items);
  const galleryRefresh = useRef(gallery.refresh);
  useEffect(() => {
    galleryRefresh.current = gallery.refresh;
    if (galleryItemsRef.current === gallery.items) return;
    galleryItemsRef.current = gallery.items;
    ctrl.current?.setGallery(gallery.items);
  }, [gallery.items, gallery.refresh]);

  // 겉모습이 바뀌면(꾸미기, 사진 캐릭터가 다 그려짐) 내 캐릭터와 함께 걷는 사람들에게 바로
  const { setLook: netSetLook } = net;
  const appliedLook = useRef(character.look);
  useEffect(() => {
    if (appliedLook.current === character.look) return;
    appliedLook.current = character.look;
    ctrl.current?.setCharacter(character.look);
    netSetLook(character.look);
  }, [character.look, netSetLook]);
  // 3D가 다 되면(3D 진행이 알린다) 엔진이 그 모형을 바로 다시 묻는다: 다시 묻기 차례(40·90·240초)를 기다리지 않고 3D가 선다
  useEffect(() => onModelReady((id) => ctrl.current?.refreshModel(`/api/avatar/${id}`)), []);
  /** 지금 입은 사진 캐릭터의 그림 id(3D 알림이 「지금 3D로 걷고 있어요」를 고른다) */
  const wearing = character.look.kind === 'photo' ? character.look.url.split('/').pop() ?? null : null;

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
    const letters = ['어서 오세요造連堂조연당짓고잇는집', '곧 전시해요0123456789-abcd', init.current.name, appliedLook.current.title ?? '', ...world.doors.map((d) => d.label ?? ''),
      ...Object.values(doorNamesRef.current), ...Object.values(doorPhrasesRef.current)].join('');
    (webgl ? Promise.all([import('@/walk/scene'), fontsReady(letters)]).then(([m]) => m) : Promise.reject(new Error('no-webgl')))
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
          doorPhrases: doorPhrasesRef.current,
          pet: world.kind === 'shell' ? null : petRef.current,
          gallery: galleryItemsRef.current,
          onGalleryStale: () => galleryRefresh.current(),
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
          // 3D 문맥을 잃어도 금방 돌아오는 일이 많다(휴대폰에서 다른 앱에 다녀올 때): 잠깐 기다렸다가 안 돌아오면 알린다
          onLost: () => {
            if (disposed) return;
            window.clearTimeout(lostTimer.current);
            lostTimer.current = window.setTimeout(() => {
              if (disposed) return;
              setFail({ kind: 'lost', detail: 'webglcontextlost' });
              setStatus('error');
            }, LOST_WAIT_MS);
          },
          onRestored: () => {
            if (disposed) return;
            window.clearTimeout(lostTimer.current);
            setFail((f) => (f?.kind === 'lost' ? null : f));
            setStatus((st) => (st === 'error' ? 'ready' : st));
          },
          onPlace: setPlace,
          onInteract: () => interactRef.current(),
        });
        // 저장된 자리·문 앞으로. 막혔거나 허공이면 teleport가 false를 주고 들어오는 자리(spawn)에 그대로 선다
        if (at) c.teleport(at.x, at.z, at.level, at.yaw);
        ctrl.current = c;
        // 말 숨기기는 사람들을 들이기 전에(들이며 붙는 말풍선부터 감추게)
        c.setTalkHidden(quietRef.current);
        attach(c);
        c.setNetLive(netLiveRef.current);
        c.setPaused(hold.current.paused);
        c.setFrozen(hold.current.frozen);
        try { sessionStorage.removeItem(RELOADED_KEY); } catch { /* 없어도 된다 */ }
        // 첫 그림이 나온 뒤에 불러오는 화면을 걷는다: 셰이더를 준비하는 동안 빈 캔버스 대신 「집을 짓는 중」이 보인다
        const built = c;
        void built.ready.then(() => {
          if (disposed || ctrl.current !== built) return;
          setStatus('ready');
          reveal();
          // 길 찾기 격자는 첫 그림 뒤 걷는 사이 틈틈이 만들어 둔다(패널을 처음 열 때 멈추지 않게)
          void prepareNav(world, { delayMs: NAV_PREP_DELAY_MS });
          if (!firstBuild.current) return;
          firstBuild.current = false;
          const first = !P.readOnboarded();
          setOnboard(first ? 'on' : 'off');
          if (!first) {
            setHintOn(true);
            setHintSeq((n) => n + 1);
          }
        });
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
      window.clearTimeout(lostTimer.current);
      pauseNav(world);
      c?.dispose();
      ctrl.current = null;
      // 걸어가던 중에 장면이 바뀌면(방 드나들기, 집 다시 받기) 「○○로 가는 중」 띠도 내리고,
      // 앞 장면의 자리를 담은 패널(살피기·길 찾기·지도·포털)도 닫는다
      setGoing(null);
      setArrived(null);
      setOpen(null);
      setWay(false);
      setMapOpen(false);
      setPortalOpen(false);
      setFrameOpen(null);
      setExhibitOpen(null);
      setBoardRoomOpen(null);
      // 가까이 있던 살피기 자리도 지운다: 새 장면은 「가까운 곳 없음」에서 시작하므로 그 둘레에 살필 곳이 없으면
      // 알림이 오지 않아, 앞 장면의 「살피기」 단추가 아무것도 없는 곳에 남는다
      nearRef.current = null;
      setNear(null);
    };
  }, [world, setOnboard, dismissOnboard, takeArrive, attach, reveal]);

  useEffect(() => {
    ctrl.current?.setPaused(panel);
  }, [panel]);
  // 놀이 덮개·페이지 시트는 화면을 통째로 가린다: 그동안 뒤의 3D는 그리지 않는다(놀이가 끊기지 않고 휴대폰이 덜 뜨거워진다).
  // 장면과 함께 걷기 연결은 그대로 둔다(시트를 닫으면 그 자리에서 바로 이어 걷는다)
  useEffect(() => {
    if (status === 'ready') ctrl.current?.setFrozen(frozen);
  }, [frozen, status]);

  // 3D 코드(three.js와 장면)는 집 데이터를 기다리지 않고 화면이 뜨자마자 받기 시작한다(느린 통신에서 한 줄로 서지 않게).
  // 실패는 여기서 삼키고, 장면을 지을 때 다시 불러 그쪽에서 알린다
  useEffect(() => {
    if (hasWebGL()) void import('@/walk/scene').catch(() => {});
  }, []);

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
    setFrameOpen(null);
    setExhibitOpen(null);
    setBoardRoomOpen(null);
    // 패널을 여는 길은 모두 여기를 거친다: 말하기 칸도 닫아야 패널을 닫았을 때 다시 튀어나와 초점(자판)을 가져가지 않는다
    setChat(false);
    // 다른 묶음이 가진 창(대화창, 접속자 목록)도 함께 닫는다: 한 번에 창 하나, Esc 한 번에 모두
    emitWalk(WALK_EVENT.closeAll);
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
  // 페이지 시트가 뜨면(살피기 창의 「쪽지 남기러 가기」 등) 걷기의 패널·말하기 칸을 닫아 둔다: 시트를 닫으면 바로 걷기로 돌아온다
  useEffect(() => {
    if (sheet) queueMicrotask(closePanels);
  }, [sheet, closePanels]);
  const stopGoing = () => {
    ctrl.current?.cancelPath();
    setGoing(null);
  };
  const walkTo = (d: Destination, path: NavPoint[], tries = 0) => {
    setWay(false);
    const c = ctrl.current;
    if (!c) return;
    const to = placeTitle(d, family);
    c.setPaused(false);
    setGoing(to);
    setArrived(null);
    c.walkPath(path, {
      // 도착하면 알리고(띠가 말없이 사라지면 막힌 것과 구별이 안 된다) 목적지 쪽을 본다
      onArrive: () => {
        setGoing(null);
        setArrived(to);
      },
      onCancel: () => setGoing(null),
      // 걷다가 막히면 말없이 서지 않는다: 지금 자리에서 길을 한 번 다시 찾고, 그래도 막히면 그 자리로 바로 옮겨 준다
      onStuck: () => {
        const w = live.current.world;
        const at = ctrl.current?.getState();
        let again: NavPoint[] | null = null;
        if (tries < 1 && w && at) {
          try { again = findPath(w, { x: at.x, z: at.z, y: at.y, level: at.level }, { x: d.x, z: d.z, level: d.level }); } catch { again = null; }
        }
        if (again && again.length > 1) walkTo(d, again, tries + 1);
        else jumpTo(d);
      },
    }, arriveYaw(d));
  };
  useEffect(() => {
    if (!arrived) return;
    const t = window.setTimeout(() => setArrived(null), ARRIVED_MS);
    return () => window.clearTimeout(t);
  }, [arrived]);
  // 도착 알림이 떠 있는 사이 패널을 열었으면 거둔다(닫은 뒤에, 또는 다른 곳으로 옮긴 뒤에 뒤늦게 다시 뜨지 않게)
  useEffect(() => {
    if (panel) queueMicrotask(() => setArrived(null));
  }, [panel]);
  const jumpTo = (d: Destination) => {
    setWay(false);
    ctrl.current?.cancelPath();
    setGoing(null);
    setArrived(null);
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
  const sit = () => ctrl.current?.sit();

  /** E·휴대폰 가운데 단추: 열린 방 문이면 바로 들어가고, 나가는 문이면 바로 나가고, 그 밖은 살피기 패널 */
  const interact = () => {
    const spot = nearRef.current;
    const i = interactFor(spot, canEnter, live.current.inRoom);
    if (!i) return;
    if (i.kind === 'enter') goRoom(i.slug);
    else if (i.kind === 'leave') goHouse();
    else if (i.kind === 'frame') {
      setChat(false);
      setFrameOpen(i.id);
    } else if (i.kind === 'exhibit') {
      setChat(false);
      setExhibitOpen(i.id);
    } else if (i.kind === 'board') {
      setChat(false);
      setBoardRoomOpen(i.room);
    } else {
      setChat(false);
      setOpen(spot);
    }
  };
  useEffect(() => {
    interactRef.current = interact;
  });
  const nearAct = actLabel(interactFor(near, canEnter, inRoom), lang);

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
  // 대화창(C)·접속자 목록(U): 창은 대화 묶음이 가지고 이 화면은 신호만 보낸다(walk-events.ts)
  const openChat = () => {
    closePanels();
    dismissOnboard();
    emitWalk(WALK_EVENT.openChat);
  };
  const openPeople = () => {
    closePanels();
    dismissOnboard();
    emitWalk(WALK_EVENT.openPeople);
  };
  const shot = useShot(ctrl, signedIn, () => P.placeName(place));
  // 사진 알림을 접을지: 알림이 뜬 뒤에 패널이 열렸을 때만 접는다. 새 알림이 오면 다시 편다(앞 렌더의 값과 견줘 정한다)
  const [noteFold, setNoteFold] = useState<{ note: typeof shot.note; panel: boolean; fold: boolean }>({ note: null, panel: false, fold: false });
  if (noteFold.note !== shot.note) setNoteFold({ note: shot.note, panel, fold: false });
  else if (noteFold.panel !== panel) setNoteFold({ note: shot.note, panel, fold: panel });
  const inApp = useInApp(!signedIn);
  /** 같은 탭에서 갤러리로(떠나기 전에 자리를 적어 두어 돌아오면 그 자리) */
  const goGallery = () => {
    const w = live.current.world;
    if (w && w.kind !== 'room') saveHousePos(ctrl.current, w.kind);
    router.push('/gallery');
  };
  const onSens = (v: number) => ctrl.current?.setSensitivity(v);
  /** 관리자가 지도를 바꾸면: 지금 자리를 적고 암전 속에서 새 세계를 받는다(다른 암전이 이미 돌고 있으면 암전 없이) */
  const switchMap = () => new Promise<void>((done) => {
    const w = live.current.world;
    if (w && w.kind !== 'room') saveHousePos(ctrl.current, w.kind);
    let ran = false;
    const go = () => { ran = true; return reloadHouse().finally(done); };
    fade.run(go, true);
    window.setTimeout(() => { if (!ran) void go(); }, 600);
  });
  const onMenu = (a: MenuAction) => {
    setMenu(false);
    if (a === 'view') ctrl.current?.setView(view === 'first' ? 'third' : 'first');
    else if (a === 'look') openLook();
    else if (a === 'shot') void shot.take();
    else if (a === 'gallery') goGallery();
    else if (a === 'games') { const w = live.current.world; if (w && w.kind !== 'room') saveHousePos(ctrl.current, w.kind); router.push('/games'); }
    else if (a === 'guestbook') { const w = live.current.world; if (w && w.kind !== 'room') saveHousePos(ctrl.current, w.kind); router.push('/guestbook'); }
    else if (a === 'map') openMap();
    else if (a === 'way') openWay();
    else if (a === 'portal') openPortals();
    else if (a === 'help') setHelp(true);
    else if (a === 'chat') openChat();
    else if (a === 'people') openPeople();
    else if (a === 'leaveRoom') goHouse();
  };

  useWalkKeys(
    () => {
      const L = live.current;
      // 다른 묶음의 창(대화창 등)도 열려 있으면 Esc는 메뉴 대신 모두 닫기(창은 role="dialog"나 data-walk-window로 표시한다)
      const other = Boolean(root.current?.querySelector('[role="dialog"], [data-walk-window]'));
      return {
        game: Boolean(L.game), sheet: L.sheet, ready: L.ready, panel: L.panel, anyOpen: L.panel || L.chat || other,
        canTalk: L.canTalk, coarse: L.coarse,
      };
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
      chat: openChat,
      people: openPeople,
      fullscreen: fs.toggle,
      // 약한 가까움(휴대폰 3인칭에서 대략 보는 액자)은 Enter 말하기를 막지 않는다
      hasNear: () => blocksTalk(nearRef.current),
    },
    () => unlockedAt.current,
  );

  /** 말 숨기기·보이기. 숨길 때의 들은 말 수와 기록의 줄을 적어 둔다(그 뒤에 온 말만 세고, 다시 보일 때 본 줄은 흐린 채로) */
  const toggleQuiet = () => {
    if (!quiet) setQuietMark({ heard: net.heard, seen: new Set(net.lines.map((l) => l.key)) });
    setQuiet(!quiet);
  };
  const unread = unreadCount(quiet, net.heard, quietMark.heard);
  // 말 숨기기 단추는 함께 걷기에 이어져 있고, 감출 말이 있거나 이미 감춰 둔 때만(말이 없는 동안은 자리를 차지하지 않는다)
  const quietBtn = showPeople && (quiet || net.lines.length > 0);
  // 손님인데 실제 집을 못 받아 그림 집으로 걷는 중(집에 있을 때만 알린다)
  const houseMissing = fellBack && !inRoom;
  const showHint = ready && !coarse && hintOn && !near && !panel && !chat && onboard !== 'on';
  const full = net.status === 'full';
  // 앱 안 브라우저 안내는 첫 방문 카드가 접힌 뒤에(같은 자리 둘레라 겹치지 않게)
  const inAppNote = inApp.show && onboard === 'off' ? inApp.kind : null;
  const gameRoom = game ? (roomSlug ?? GAMES[game]?.room ?? '') : '';
  // 놀이에 넘기는 이름: 로그인 전의 「손님」은 영어 화면이면 Guest(놀이 안에서 부르는 이름일 뿐, 어디에도 적지 않는다)
  const gameNick = lang === 'en' && nickname === '손님' ? 'Guest' : nickname;

  return (
    <div
      ref={root}
      className="walk-root"
      data-coarse={coarse ? 'true' : undefined}
      data-view={view}
      data-space={inRoom ? 'room' : 'house'}
      // 페이지 시트가 떠 있는 동안 뒤의 걷기 화면은 누르거나 Tab으로 닿지 않는다(시트가 모달)
      inert={sheet || undefined}
      onClick={(e) => {
        // 마우스·손가락으로 누른 화면 단추는 초점을 쥐고 있지 않게 한다(detail 0은 키보드로 누른 것).
        // 초점이 남으면 그 뒤의 Space(점프)·Enter(살피기)가 그 단추를 다시 누른다
        if (e.detail === 0) return;
        const b = (e.target as HTMLElement).closest<HTMLElement>(P.HUD_BTN_SEL);
        if (b && !b.closest('[role="dialog"]') && document.activeElement === b) b.blur();
      }}
    >
      {/* 화면 낭독기에는 캔버스가 이름 한 줄뿐이라, 3D 없이 보는 길을 먼저 알려 준다(초점 자리는 늘리지 않는다) */}
      <p className="sr-only">
        <T
          ko="3D로 걷는 화면이에요. 메뉴의 「그림 지도로 보기」에서 같은 방과 쪽지를 3D 없이 볼 수 있어요."
          en="This is a 3D walking screen. To see the same rooms and notes without 3D, choose “View the picture map” from the menu."
        />
      </p>
      <div ref={host} className="walk-canvas" onPointerDown={dismissOnboard} />
      <div ref={label} className="walk-label" aria-hidden="true" lang="ko">{name}</div>

      <div className="walk-top">
        <div className="walk-place-slot">
          {ready ? (
            // 지금 자리 카드를 누르면 갈 수 있는 곳 목록(길 찾기)이 열린다: 휴대폰 위 단추 줄에는 길 찾기가 없다
            <button
              type="button"
              className="walk-place"
              onClick={() => (way !== false ? setWay(false) : openWay())}
              aria-haspopup="dialog"
              aria-expanded={way !== false}
              aria-keyshortcuts={ariaKey('way')}
              title={`${tr('갈 곳 고르기', 'Choose where to go')} (${SHORTCUTS.way.key})`}
            >
              <span className="walk-place-now" aria-live="polite">
                {inRoom ? (
                  <span className="walk-floor" data-level="room"><T ko="방" en="Room" /></span>
                ) : (
                  <span key={`f${level}`} className="walk-floor walk-pop" data-level={level}><T ko={`${level}층`} en={`${level}F`} /></span>
                )}
                {/* 구역 이름은 장소 이름 표로 옮긴다(표에 없는 이름은 한국어 그대로 lang="ko") */}
                <PlaceText key={place} className="walk-place-name walk-pop" name={P.placeName(place)} />
              </span>
              <span className="sr-only"><T ko=" · 갈 곳 고르기" en=" · Choose where to go" /></span>
              <span className="walk-place-more"><IconChevron size={15} /></span>
            </button>
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
          people={showPeople ? <PeopleChip status={net.status} players={net.players} me={name} covered={panel || chat} /> : null}
          full={fs.supported ? fs.full : null}
          onFullscreen={fs.toggle}
          onView={() => ctrl.current?.setView(view === 'first' ? 'third' : 'first')}
          onMap={() => (mapOpen ? setMapOpen(false) : openMap())}
          onWay={() => (way !== false ? setWay(false) : openWay())}
          onHelp={toggleHelp}
          onMenu={() => (menu ? setMenu(false) : openMenu())}
          onShot={() => void shot.take()}
          onLeaveRoom={goHouse}
        />
      </div>

      {ready && shellMap && world && !inRoom && !panel ? <MapPick current={world.kind === 'shell' ? 'shell' : 'house'} onSwitch={switchMap} /> : null}
      {ready && going && !panel ? <WayBanner to={going} onStop={stopGoing} /> : null}
      {ready ? <MakingChip hidden={panel || Boolean(game)} onOpen={openLook} wearing={wearing} /> : null}
      {ready && arrived && !going && !panel ? <WayArrived to={arrived} /> : null}

      {/* 시트가 떠 있으면 미니맵은 내려 둔다(가려져 보이지 않는데 혼자 계속 그리지 않게) */}
      {ready && world && !sheet ? (
        <button
          type="button"
          className="walk-mini"
          onClick={openMap}
          aria-label={inRoom ? tr('방 지도 크게 보기', 'Open the room map') : tr('집 지도 크게 보기', 'Open the house map')}
          title={`${inRoom ? tr('방 지도 크게 보기', 'Open the room map') : tr('집 지도 크게 보기', 'Open the house map')} (${SHORTCUTS.map.key})`}
          aria-keyshortcuts={ariaKey('map')}
          tabIndex={mapOpen ? -1 : undefined}
        >
          <MapCanvas world={world} read={read} mode="mini" theme={theme} onState={onState} />
          <KeyHint id="map" />
        </button>
      ) : null}

      {ready && coarse && canTalk && !panel && !chat ? <ChatButton onClick={() => setChat(true)} /> : null}
      {ready && !panel && (full || houseMissing || inAppNote || fs.note || quietBtn || (!quiet && net.lines.length > 0)) ? (
        <div className="walk-talk">
          {inAppNote ? <InAppNote kind={inAppNote} where="talk" onClose={inApp.close} /> : null}
          {houseMissing ? (
            <p className="walk-notice" role="status">
              <T ko="실제 집을 받지 못해 그림 집을 보여 드려요." en="Couldn’t load the real house, so here is the drawn one." />{' '}
              <button type="button" className="walk-notice-btn" onClick={retryHouse}><T ko="다시 받기" en="Try again" /></button>
            </p>
          ) : null}
          {full ? <p className="walk-notice" role="status"><T ko="지금 사람이 많아 혼자 걸어요" en="It’s busy right now, so you’re walking on your own" /></p> : null}
          {fs.note ? <p className="walk-notice" role="status"><T ko="이 브라우저에서는 전체 화면을 열 수 없어요" en="This browser can’t open full screen" /></p> : null}
          {quiet ? null : <ChatLog lines={net.lines} coarse={coarse} seen={quietMark.seen} />}
          {/* 데스크탑은 말 기록 아래(미니맵 바로 위), 휴대폰은 CSS가 말 기록 위(말풍선 단추 바로 아래)로 올린다 */}
          {quietBtn ? <ChatQuietButton hidden={quiet} unread={unread} onToggle={toggleQuiet} /> : null}
        </div>
      ) : null}
      {ready && chat && canTalk && !panel ? <ChatInput coarse={coarse} quiet={quiet} onSend={net.say} onClose={() => setChat(false)} /> : null}
      <SocialLayer enabled={together && world?.kind !== 'shell'} ready={ready} space={netSpace} place={P.placeName(place)} name={name} look={character.look} ctrl={ctrl} net={net} coarse={coarse} covered={panel || Boolean(game)} />

      {status === 'loading' ? <WalkLoading /> : null}
      {status === 'error' ? (
        <div className="walk-center walk-card" role="alert">
          <p>
            {fail?.kind === 'webgl'
              ? <T ko="이 브라우저에서는 지금 3D를 그릴 수 없어요. 다른 앱이나 탭을 닫고 다시 열어 보거나, 그림 지도로 둘러보세요." en="This browser can’t draw 3D right now. Close other apps or tabs and open it again, or browse the picture map instead." />
              : fail?.kind === 'lost'
                ? <T ko="3D 화면이 잠깐 꺼졌어요. 「다시 시도」를 누르면 있던 자리에서 다시 열려요." en="The 3D view went out for a moment. Press “Try again” to reopen it right where you were." />
                : fail?.kind === 'load'
                ? <T ko="새 버전을 받는 중에 어긋났어요. 새로 고침하면 열려요." en="Something got mixed up while loading the new version. Refresh the page to open it." />
                : <T ko="3D 집을 그리다 문제가 생겼어요. 다시 시도해 주세요." en="Something went wrong drawing the 3D house. Please try again." />}
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-pine" onClick={() => window.location.reload()}><T ko="다시 시도" en="Try again" /></button>
            <Link className="btn btn-roof" href="/map"><T ko="그림 지도로 둘러보기" en="Browse the picture map" /></Link>
          </div>
        </div>
      ) : null}

      {ready && view === 'first' && !panel ? <span className="walk-reticle" aria-hidden="true" /> : null}

      {ready && near && !panel && !coarse && !chat ? (
        <button type="button" className="walk-near" onClick={interact} aria-keyshortcuts={`${ariaKey('act')} Enter`}>
          <kbd>{SHORTCUTS.act.key}</kbd> {nearAct} · <PlaceText name={near.title} kind={near.kind} />
        </button>
      ) : null}

      {ready && !coarse ? (
        <WalkHint show={showHint} locked={locked} view={view} talk={canTalk} together={together} fullscreen={fs.supported} />
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
          onSit={sit}
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

      {help ? (
        <HelpPanel
          coarse={coarse}
          real={world?.kind === 'real'}
          room={inRoom}
          together={canTalk}
          gallery={Boolean(galleryFrames?.length)}
          fullscreen={fs.supported}
          onClose={() => setHelp(false)}
        />
      ) : null}

      {menu ? (
        <WalkMenu coarse={coarse} view={view} inRoom={inRoom} canLook together={together} signedIn={signedIn} onAction={onMenu} onSens={onSens} note={inApp.kind ? <InAppNote kind={inApp.kind} where="menu" /> : null} />
      ) : null}

      {portalOpen ? <PortalPanel items={portals} inRoom={inRoom} onPick={pickPortal} onClose={() => setPortalOpen(false)} /> : null}

      {frameOpen && galleryFrames ? (
        <GalleryViewer frames={galleryFrames} items={gallery.items} start={frameOpen} coarse={coarse} onClose={() => setFrameOpen(null)} onBroken={gallery.refresh} />
      ) : null}

      {exhibitOpen ? (
        <ExhibitModal exhibitId={exhibitOpen} onClose={() => setExhibitOpen(null)} />
      ) : null}

      {boardRoomOpen ? (
        <RoomLeaderboardModal
          roomSlug={boardRoomOpen}
          roomTitle={family.get(boardRoomOpen)?.title ?? ROOM_BY_SLUG.get(boardRoomOpen)?.name ?? '방'}
          onClose={() => setBoardRoomOpen(null)}
          onPlayGame={play}
        />
      ) : null}

      {lookOpen ? (
        <CharacterPanel
          look={character.look}
          onChange={(l: CharacterLook) => character.setLook(l)}
          onClose={() => setLookOpen(false)}
          photo={{ enabled: signedIn }}
          name={name}
        />
      ) : null}

      {/* 닫을 때까지 남는 사진 알림(한 번 더 눌러 저장, 길게 눌러 저장)은 그 뒤에 패널을 열면 접어 둔다: 패널의 머리글과 닫기를 가린다.
          패널이 열린 채 찍은 사진의 알림은 그대로 보인다(접으면 찍혔는지 알 길이 없다) */}
      {shot.note && !(panel && noteFold.fold && (shot.note.kind === 'tap' || shot.note.kind === 'hold'))
        ? <ShotToast note={shot.note} onGallery={goGallery} onSave={shot.saveAgain} onClose={shot.clearNote} /> : null}
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
        <GameBoundary onClose={() => setGame(null)}>
          <GameOverlay
            game={game}
            room={gameRoom}
            nickname={gameNick}
            role={role}
            coarse={coarse}
            theme={theme}
            canStamp={canStamp}
            onClose={() => setGame(null)}
          />
        </GameBoundary>
      ) : null}

      <div className="walk-fade" data-on={fade.dark ? 'true' : undefined} aria-hidden="true" />
    </div>
  );
}
