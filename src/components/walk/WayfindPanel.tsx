'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { destinations, findPath, type Destination, type NavPoint } from '@/walk/nav';
import type { HouseWorld } from '@/walk/types';
import { withRo } from './memory';
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

const KIND: Partial<Record<Destination['kind'], string>> = {
  room: '방', door: '문', portal: '들어가는 문', exit: '나가는 문', game: '놀이', sign: '표지', lantern: '석등', stage: '무대',
};
/** 경로 찾기에 한 번에 쓰는 시간(ms). 넘으면 다음 틈에 이어서 */
const SLICE_MS = 12;

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

/** 손님이면 가족 방 문 이름 앞에 주인 이름을 붙인다 */
export function placeTitle(d: Pick<Destination, 'kind' | 'slug' | 'title'>, family: Map<string, FamilyTag>): { owner: string | null; title: string } {
  const tag = d.kind === 'portal' && d.slug ? family.get(d.slug) : undefined;
  return { owner: tag?.owner ?? null, title: d.title };
}

// 길 찾기 패널: 갈 수 있는 곳을 층별로. 걸어갈 길은 틈틈이 찾아 두고, 길이 없으면 「바로 가기」만 둔다.
export function WayfindPanel({ world, from, family, onWalk, onJump, onClose, canEnter, onEnter, onPortals }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  /** 숨은 포털의 slug(걸어갈 문이 없으니 「바로 들어가기」만) */
  const hidden = useMemo(() => new Set((world.portals ?? []).filter((p) => p.hidden).map((p) => p.slug)), [world]);
  const isHidden = (d: Destination) => d.kind === 'portal' && Boolean(d.slug && hidden.has(d.slug));
  const list = useMemo(() => {
    try {
      // 숨은 포털은 들어갈 수 있을 때만 둔다
      return uniq(destinations(world)).filter((d) => !(d.kind === 'portal' && d.slug && hidden.has(d.slug) && !(canEnter?.(d.slug) && onEnter)));
    } catch {
      return [];
    }
  }, [world, hidden, canEnter, onEnter]);
  const [paths, setPaths] = useState<Record<string, NavPoint[] | null>>({});

  useEffect(() => {
    if (!from || list.length === 0) return;
    let i = 0;
    let t = 0;
    const acc: Record<string, NavPoint[] | null> = {};
    const tick = () => {
      const end = performance.now() + SLICE_MS;
      while (i < list.length && performance.now() < end) {
        const d = list[i++];
        let p: NavPoint[] | null = null;
        if (d.kind === 'portal' && d.slug && hidden.has(d.slug)) { acc[d.id] = null; continue; }
        try { p = findPath(world, from, { x: d.x, z: d.z, level: d.level }); } catch { p = null; }
        acc[d.id] = p && p.length > 0 ? p : null;
      }
      setPaths({ ...acc });
      if (i < list.length) t = window.setTimeout(tick, 0);
    };
    t = window.setTimeout(tick, 0);
    return () => window.clearTimeout(t);
  }, [world, from, list, hidden]);

  const room = world.kind === 'room';
  const groups = ([1, 2] as const)
    .map((lv) => ({ lv, items: list.filter((d) => d.level === lv) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="walk-panel walk-way" role="dialog" aria-modal="true" aria-labelledby="walk-way-title" onKeyDown={trapTab}>
      <h2 ref={head} id="walk-way-title" tabIndex={-1}>길 찾기</h2>
      <p className="small walk-panel-meta">「걸어가기」는 그곳까지 걸어서 데려다줘요. 움직이면 멈춰요. 「바로 가기」는 그 앞으로 바로 옮겨요.</p>
      {list.length === 0 ? <p className="small">갈 곳을 찾지 못했어요.</p> : null}
      {groups.map((g) => (
        <section key={g.lv} className="walk-way-group" aria-label={room ? '이 방' : `${g.lv}층`}>
          {!room && groups.length > 1 ? <h3><span className="walk-floor" data-level={g.lv}>{g.lv}층</span></h3> : null}
          <ul className="walk-way-list">
            {g.items.map((d) => {
              const { owner, title } = placeTitle(d, family);
              const name = owner ? `${owner} ${title}` : title;
              const p = paths[d.id];
              return (
                <li key={d.id}>
                  <span className="walk-way-name">
                    {owner ? <span className="walk-way-owner">{owner}</span> : null}
                    <span>{title}</span>
                    {KIND[d.kind] ? <span className="walk-way-kind">{KIND[d.kind]}</span> : null}
                  </span>
                  <span className="walk-way-btns">
                    {isHidden(d) && d.slug && onEnter ? (
                      <button type="button" className="btn btn-small btn-roof" onClick={() => onEnter(d.slug as string)} aria-label={`${withRo(name)} 바로 들어가기`}>바로 들어가기</button>
                    ) : null}
                    {p === undefined && from && !isHidden(d) ? <span className="walk-way-wait" aria-hidden="true">길 찾는 중</span> : null}
                    {p ? (
                      <button type="button" className="btn btn-small btn-roof" onClick={() => onWalk(d, p)} aria-label={`${withRo(name)} 걸어가기`}>걸어가기</button>
                    ) : null}
                    {isHidden(d) ? null : (
                      <button type="button" className="btn btn-small" onClick={() => onJump(d)} aria-label={`${withRo(name)} 바로 가기`}>바로 가기</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="btn-row">
        {onPortals ? <button type="button" className="btn btn-small btn-pine" onClick={onPortals}>포털 바로 가기</button> : null}
        <button type="button" className="btn btn-small" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

/** 자동 걷기 중 띠: 「○○로 가는 중 · 멈추기」 */
export function WayBanner({ title, onStop }: { title: string; onStop: () => void }) {
  return (
    <div className="walk-way-banner">
      <span role="status">{withRo(title)} 가는 중</span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onStop}>멈추기</button>
    </div>
  );
}
