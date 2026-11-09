'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { earnStamp } from '@/app/actions';
import { DOOR_LABEL, ROOM_BY_SLUG, acceptsNotes, type Door } from '@/content/rooms';
import type { Hotspot } from '@/content/world';
import { GAMES } from '@/games/registry';
import { aboutSeconds } from './memory';
import { trapTab, useDialogFocus } from './useDialogFocus';
import type { FamilyTag } from './useFamilyRooms';

type Props = {
  spot: Hotspot;
  doors: Record<string, Door>;
  lantern: { lit: number; today: number } | null;
  canStamp: boolean;
  /** 손님에게만 오는 가족 방 이름표(slug → 이름표) */
  family?: Map<string, FamilyTag>;
  /** 이 방 장면이 있으면 「들어가기」를 보인다 */
  canEnter?: (slug: string) => boolean;
  onEnter?: (slug: string) => void;
  onLeave?: () => void;
  onPlay?: (game: string) => void;
  onClose: () => void;
  /** 휴대폰이면 키 안내를 숨긴다 */
  coarse?: boolean;
};

// 살피기 패널: 방 이야기, 문패, 들어가기·나가기, 놀이 시작, 쪽지 남기러 가기, 도장.
export function HotspotPanel({ spot, doors, lantern, canStamp, family, canEnter, onEnter, onLeave, onPlay, onClose, coarse = false }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head, spot.id);
  const room = spot.slug ? ROOM_BY_SLUG.get(spot.slug) : undefined;
  const door: Door | undefined = room ? doors[room.slug] ?? room.door : spot.kind === 'door' ? 'closed' : undefined;
  const isOpen = door === 'open';
  const portal = spot.kind === 'portal';
  const enter = portal && room && isOpen && canEnter?.(room.slug) && onEnter;
  const game = spot.kind === 'game' && spot.game ? GAMES[spot.game] : undefined;
  const tag = portal && spot.slug ? family?.get(spot.slug) : undefined;
  const title = tag ? `${tag.owner} ${spot.title}` : spot.title;
  return (
    <div
      className="walk-panel"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => {
        trapTab(e);
        // 놀이 자리: Enter로 바로 시작(단추·링크 위의 Enter는 그 단추 몫, 한글 조합 중이면 무시)
        if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229 || !game || !onPlay) return;
        if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
        e.preventDefault();
        onPlay(game.id);
      }}
    >
      <h2 ref={head} tabIndex={-1}>
        {tag ? <span className="walk-way-owner">{tag.owner}</span> : null}
        {spot.title}
      </h2>
      {tag && (tag.line || tag.title) ? <p className="small walk-panel-meta">{tag.line ?? tag.title}</p> : null}
      {game ? (
        <>
          {game.title !== spot.title ? <p className="walk-game-title">{game.title}</p> : null}
          <p>{game.blurb}</p>
          <p className="small walk-panel-meta">{aboutSeconds(game.seconds)}</p>
        </>
      ) : (
        <p>{spot.line}</p>
      )}
      {door && !isOpen ? (
        <p className="small walk-panel-meta">문패: {DOOR_LABEL[door]}{room?.opens ? ` · ${room.opens}` : ''}</p>
      ) : null}
      {spot.kind === 'lantern' ? (
        <p className="small">{lantern ? `지금까지 ${lantern.lit}장의 종이가 불을 밝혔어요.` : '석등은 곧 켜져요.'}</p>
      ) : null}
      {spot.kind === 'stage' ? <p className="small walk-panel-meta">다섯 사람 카드는 소개 글과 그림이 정해지면 걸려요.</p> : null}
      <div className="btn-row">
        {enter ? (
          <button type="button" className="btn btn-roof btn-small" onClick={() => onEnter(room.slug)}>들어가기</button>
        ) : null}
        {spot.kind === 'exit' && onLeave ? (
          <button type="button" className="btn btn-roof btn-small" onClick={onLeave}>나가기</button>
        ) : null}
        {game && onPlay ? (
          <button type="button" className="btn btn-roof btn-small" onClick={() => onPlay(game.id)} aria-keyshortcuts="Enter">놀이 시작{coarse ? null : <> <kbd>Enter</kbd></>}</button>
        ) : null}
        {room && isOpen && !portal && spot.kind !== 'exit' && spot.kind !== 'game' ? (
          <Link className="btn btn-roof btn-small" href={`/room/${room.slug}`}>
            {acceptsNotes(room, door) ? '쪽지 남기러 가기' : '방 보기'}
          </Link>
        ) : null}
        {portal && room && isOpen && acceptsNotes(room, door) ? (
          <Link className="btn btn-small" href={`/room/${room.slug}`}>쪽지 남기러 가기</Link>
        ) : null}
        {room && isOpen && canStamp && !portal && spot.kind !== 'exit' && spot.kind !== 'game' ? (
          <form action={earnStamp}>
            <input type="hidden" name="room" value={room.slug} />
            <button className="btn btn-small btn-pine">도장 찍기</button>
          </form>
        ) : null}
        <button type="button" className="btn btn-small" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
