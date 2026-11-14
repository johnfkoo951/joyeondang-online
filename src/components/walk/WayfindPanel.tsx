'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { placeName } from '@/lib/place-names';
import { destinations, findPath, navReady, prepareNav, relaxNav, type Destination, type NavPoint } from '@/walk/nav';
import type { HouseWorld } from '@/walk/types';
import { ariaKey, wayKind, wayOrder, waySlice } from './controls';
import { IconClose } from './icons';
import { KeyHint } from './KeyHint';
import { withRo } from './memory';
import { PlaceText } from './PlaceText';
import { trapTab, useDialogFocus } from './useDialogFocus';
import type { FamilyTag } from './useFamilyRooms';

type Props = {
  world: HouseWorld;
  /** 패널을 연 순간의 내 자리(걷기는 멈춰 있다) */
  from: NavPoint | null;
  family: Map<string, FamilyTag>;
  onWalk: (d: Destination, path: NavPoint[]) => void;
  onJump: (d: Destination) => void;
  onClose: () => void;
  /** 숨은 포털(문 없이 바로 들어가는 방, 예: 차고): 걷지 않고 바로 그 방으로 */
  canEnter?: (slug: string) => boolean;
  onEnter?: (slug: string) => void;
  /** 포털 바로 가기 목록 열기(휴대폰은 P가 없어 여기서도 연다) */
  onPortals?: () => void;
};

/** 경로 찾기에 한 번에 쓰는 시간(ms). 넘으면 다음 틈에 이어서 */
const SLICE_MS = 12;
type Paths = Record<string, NavPoint[] | null>;
const NO_PATHS: Paths = {};

/** 문 하나가 핫스팟과 포털로 두 번 나오면 하나만 둔다(앞에 나온 것) */
function uniq(list: Destination[]): Destination[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const k = d.kind === 'portal' && d.slug ? `portal:${d.slug}` : `id:${d.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 갈 곳 목록(격자가 있으면 바로 나온다). 못 만들면 빈 목록 */
function placesOf(world: HouseWorld): Destination[] {
  try {
    return uniq(destinations(world));
  } catch {
    return [];
  }
}

/**
 * 갈 곳의 이름: 주인 이름(가족 방, 손님에게만)과 장소 이름(한국어 그대로. 보일 때 장소 이름 표로 옮긴다).
 * person이면 접속자 목록에서 고른 사람 옆이고 title은 그 사람 이름이다(옮기지 않는다)
 */
export type WayTarget = { owner: string | null; title: string; person?: boolean };

/** 손님이면 가족 방 문 이름 앞에 주인 이름을 붙인다 */
export function placeTitle(d: Pick<Destination, 'kind' | 'slug' | 'title'>, family: Map<string, FamilyTag>): WayTarget {
  if (d.kind === 'person') return { owner: null, title: d.title, person: true };
  const tag = d.kind === 'portal' && d.slug ? family.get(d.slug) : undefined;
  return { owner: tag?.owner ?? null, title: d.title };
}

/** 한국어 한 줄 이름(「주인 장소」). 한국어 화면의 띠·낭독 이름은 예전과 같은 이 글이다 */
const nameKo = (t: WayTarget) => (t.owner ? `${t.owner} ${t.title}` : t.title);
/** 영어 한 줄 이름(「주인’s Place」, 낭독 이름에 쓴다) */
const nameEn = (t: WayTarget) => (t.owner ? `${t.owner}’s ${placeName('en', t.title)}` : placeName('en', t.title));

/** 띠 안의 영어 이름: 주인 이름(한국어 그대로)과 장소 이름(표로 옮김) */
function WayName({ to }: { to: WayTarget }) {
  return (
    <>
      {to.owner ? <><span lang="ko">{to.owner}</span>’s </> : null}
      <PlaceText name={to.title} />
    </>
  );
}

// 길 찾기 패널: 갈 수 있는 곳을 층별로. 걸어갈 길은 틈틈이 찾아 두고, 길이 없으면 「바로 가기」만 둔다.
export function WayfindPanel({ world, from, family, onWalk, onJump, onClose, canEnter, onEnter, onPortals }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  const lang = useLang();
  const tr = useTr();
  /** 숨은 포털의 slug(걸어갈 문이 없으니 「바로 들어가기」만) */
  const hidden = useMemo(() => new Set((world.portals ?? []).filter((p) => p.hidden).map((p) => p.slug)), [world]);
  const isHidden = (d: Destination) => d.kind === 'portal' && Boolean(d.slug && hidden.has(d.slug));
  // 걸을 수 있는 칸의 격자는 걷는 사이 미리 만들어 둔다(WalkClient). 아직이면 제목부터 그리고, 되는 대로 목록을 채운다:
  // 여기서 한 번에 만들면 휴대폰에서 패널이 0.5초쯤 늦게 뜬다
  const [found, setFound] = useState<{ world: HouseWorld; all: Destination[] } | null>(() => (navReady(world) ? { world, all: placesOf(world) } : null));
  const all = found?.world === world ? found.all : null;
  useEffect(() => {
    if (all) return;
    let off = false;
    void prepareNav(world, { urgent: true }).then(() => {
      if (!off) setFound({ world, all: placesOf(world) });
    });
    return () => {
      off = true;
      relaxNav(world);
    };
  }, [world, all]);
  // 숨은 포털은 들어갈 수 있을 때만 둔다. 부모가 넘기는 함수(canEnter·onEnter)는 렌더마다 새것일 수 있어,
  // 함수가 아니라 「들어갈 수 있는 숨은 포털」이라는 값이 바뀔 때만 목록을 다시 만든다(목록이 바뀌면 길을 다시 찾는다)
  const enterKey = onEnter ? [...hidden].filter((slug) => canEnter?.(slug)).join('\n') : '';
  const list = useMemo(() => {
    const ok = new Set(enterKey ? enterKey.split('\n') : []);
    return wayOrder((all ?? []).filter((d) => !(d.kind === 'portal' && d.slug && hidden.has(d.slug) && !ok.has(d.slug))));
  }, [all, hidden, enterKey]);
  // 찾은 길은 연 순간의 자리(from)에서 본 것이다: 세계나 자리가 바뀌면 버리고, 그대로면 다시 그려져도 쥐고 있는다
  const [pathsAt, setPathsAt] = useState<{ world: HouseWorld; from: NavPoint | null; paths: Paths }>({ world, from, paths: NO_PATHS });
  const paths = pathsAt.world === world && pathsAt.from === from ? pathsAt.paths : NO_PATHS;

  // 길은 틈틈이 한 조각씩 찾는다. 조각이 끝나 표가 바뀌면 이 effect가 다시 돌아 남은 곳을 이어 찾는다
  useEffect(() => {
    if (!from || list.every((d) => paths[d.id] !== undefined)) return;
    const t = window.setTimeout(() => {
      const next = waySlice(list, paths, (d) => {
        if (d.kind === 'portal' && d.slug && hidden.has(d.slug)) return null;
        const p = findPath(world, from, { x: d.x, z: d.z, level: d.level });
        return p && p.length > 0 ? p : null;
      }, SLICE_MS);
      setPathsAt({ world, from, paths: next.paths });
    }, 0);
    return () => window.clearTimeout(t);
  }, [world, from, list, hidden, paths]);

  const room = world.kind === 'room';
  // 내가 선 층의 갈 곳을 먼저 보인다
  const groups = (from?.level === 2 ? ([2, 1] as const) : ([1, 2] as const))
    .map((lv) => ({ lv, items: list.filter((d) => d.level === lv) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="walk-panel walk-panel-long walk-way" role="dialog" aria-modal="true" aria-labelledby="walk-way-title" onKeyDown={trapTab}>
      {/* 목록이 길어 아래 「닫기」까지 한참 내려야 한다: 머리글을 위에 붙여 두고 닫기를 함께 둔다 */}
      <div className="walk-panel-head">
        <h2 ref={head} id="walk-way-title" tabIndex={-1}><T ko="길 찾기" en="Find the way" /></h2>
        <button type="button" className="walk-panel-x" onClick={onClose} aria-label={tr('길 찾기 닫기', 'Close Find the way')} aria-keyshortcuts={`${ariaKey('way')} ${ariaKey('menu')}`}>
          <IconClose />
          <KeyHint id="menu" />
        </button>
      </div>
      <div className="walk-panel-body">
      <p className="small walk-panel-meta">
        <T
          ko="「걸어가기」는 그곳까지 걸어서 데려다줘요. 움직이면 멈춰요. 「바로 가기」는 그 앞으로 바로 옮겨요."
          en="“Walk there” walks you to the spot, and moving stops it. “Go now” takes you right in front of it."
        />
      </p>
      {!all
        ? <p className="small" role="status"><T ko="갈 곳을 찾는 중이에요." en="Looking for places to go." /></p>
        : list.length === 0 ? <p className="small"><T ko="갈 곳을 찾지 못했어요." en="Couldn’t find any places to go." /></p> : null}
      {groups.map((g) => (
        <section key={g.lv} className="walk-way-group" aria-label={room ? tr('이 방', 'This room') : tr(`${g.lv}층`, `${g.lv}F`)}>
          {!room && groups.length > 1 ? <h3><span className="walk-floor" data-level={g.lv}><T ko={`${g.lv}층`} en={`${g.lv}F`} /></span></h3> : null}
          <ul className="walk-way-list">
            {g.items.map((d) => {
              const to = placeTitle(d, family);
              const { owner, title } = to;
              const name = lang === 'en' ? nameEn(to) : nameKo(to);
              const p = paths[d.id];
              const kind = wayKind(d, lang);
              return (
                <li key={d.id}>
                  <span className="walk-way-name">
                    {owner ? <span className="walk-way-owner" lang="ko">{owner}</span> : null}
                    <PlaceText name={title} />
                    {kind ? <span className="walk-way-kind">{kind}</span> : null}
                  </span>
                  <span className="walk-way-btns">
                    {isHidden(d) && d.slug && onEnter ? (
                      <button type="button" className="btn btn-small btn-roof" onClick={() => onEnter(d.slug as string)} aria-label={tr(`${withRo(name)} 바로 들어가기`, `Go into ${name} now`)}>
                        <T ko="바로 들어가기" en="Go in now" />
                      </button>
                    ) : null}
                    {p === undefined && from && !isHidden(d) ? <span className="walk-way-wait" aria-hidden="true"><T ko="길 찾는 중" en="Finding a path" /></span> : null}
                    {p ? (
                      <button type="button" className="btn btn-small btn-roof" onClick={() => onWalk(d, p)} aria-label={tr(`${withRo(name)} 걸어가기`, `Walk to ${name}`)}>
                        <T ko="걸어가기" en="Walk there" />
                      </button>
                    ) : null}
                    {isHidden(d) ? null : (
                      <button type="button" className="btn btn-small" onClick={() => onJump(d)} aria-label={tr(`${withRo(name)} 바로 가기`, `Go now to ${name}`)}>
                        <T ko="바로 가기" en="Go now" />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="btn-row">
        {onPortals ? (
          <button type="button" className="btn btn-small btn-pine" onClick={onPortals} aria-keyshortcuts={ariaKey('portal')}>
            <T ko="포털 바로 가기" en="Portals" /> <KeyHint id="portal" />
          </button>
        ) : null}
        <button type="button" className="btn btn-small" onClick={onClose} aria-keyshortcuts={ariaKey('menu')}><T ko="닫기" en="Close" /> <KeyHint id="menu" /></button>
      </div>
      </div>
    </div>
  );
}

/** 자동 걷기 중 띠: 「○○로 가는 중 · 멈추기」(영어 화면은 「Going to ○○ · Stop」). 사람에게 갈 때는 「○○ 옆으로 가는 중」 */
export function WayBanner({ to, onStop }: { to: WayTarget; onStop: () => void }) {
  return (
    <div className="walk-way-banner">
      <span role="status">
        {to.person
          ? <T ko={`${to.title} 옆으로 가는 중`} en={<>Going to <span lang="ko">{to.title}</span></>} />
          : <T ko={`${withRo(nameKo(to))} 가는 중`} en={<>Going to <WayName to={to} /></>} />}
      </span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onStop}><T ko="멈추기" en="Stop" /></button>
    </div>
  );
}

/** 걸어서 도착했을 때 같은 자리에 잠깐 뜨는 띠: 「○○에 도착했어요」(띠가 말없이 사라지면 도착인지 막힌 것인지 알 수 없다) */
export function WayArrived({ to }: { to: WayTarget }) {
  return (
    <div className="walk-way-banner walk-way-arrived">
      <span role="status">
        {to.person
          ? <T ko={`${to.title} 옆에 도착했어요`} en={<>Arrived next to <span lang="ko">{to.title}</span></>} />
          : <T ko={`${nameKo(to)}에 도착했어요`} en={<>Arrived at <WayName to={to} /></>} />}
      </span>
    </div>
  );
}
