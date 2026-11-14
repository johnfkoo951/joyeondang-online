'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { T } from '@/components/i18n/T';
import { HouseLine } from '@/components/i18n/HouseLine';
import { useLang } from '@/components/i18n/useLang';
import { markVisited } from '@/lib/stamp-rally';
import { placeName } from '@/lib/place-names';
import { StampFeedback, StampPressButton, useStamp } from '@/components/stamp/Stamp';
import { DOOR_LABEL, ROOM_BY_SLUG, acceptsNotes, type Door } from '@/content/rooms';
import type { Hotspot } from '@/content/world';
import { GAMES } from '@/games/registry';
import { DOOR_EN, GAME_EN } from './hud-text';
import { aboutSeconds } from './memory';
import { PlaceText } from './PlaceText';
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
// 화면 말은 한국어·영어를 따른다. 집 데이터의 글(방 이야기 한 줄, 여는 때, 가족 방 이름표)과 사람 이름은 한국어 그대로 lang="ko",
// 장소 이름은 장소 이름 표(lib/place-names)로, 놀이 이름·설명은 hud-text.ts의 영어로 옮긴다.
export function HotspotPanel({ spot, doors, lantern, canStamp, family, canEnter, onEnter, onLeave, onPlay, onClose, coarse = false }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head, spot.id);
  const lang = useLang();
  const en = lang === 'en';
  useEffect(() => {
    if (spot.slug) { try { markVisited(localStorage, spot.slug); } catch { /* 무시 */ } }
  }, [spot.slug]);
  const room = spot.slug ? ROOM_BY_SLUG.get(spot.slug) : undefined;
  const door: Door | undefined = room ? doors[room.slug] ?? room.door : spot.kind === 'door' ? 'closed' : undefined;
  const isOpen = door === 'open';
  const portal = spot.kind === 'portal';
  const enter = portal && room && isOpen && canEnter?.(room.slug) && onEnter;
  // 놀이 자리(game)와, 놀이가 걸린 무대(stage + game)는 놀이 설명과 「놀이 시작」을 보인다
  const game = (spot.kind === 'game' || spot.kind === 'stage') && spot.game ? GAMES[spot.game] : undefined;
  const gameEn = game && en ? GAME_EN[game.id] : undefined;
  const playSpot = spot.kind === 'game' || Boolean(game);
  const tag = portal && spot.slug ? family?.get(spot.slug) : undefined;
  const spotTitle = placeName(lang, spot.title);
  const title = tag ? (en ? `${tag.owner}’s ${spotTitle}` : `${tag.owner} ${spot.title}`) : spotTitle;
  const stampable = Boolean(room && isOpen && canStamp && !portal && spot.kind !== 'exit' && !playSpot);
  // 도장: 누르면 찍히는 그림과 「○○ 도장을 찍었어요」, 단추는 「찍음」(다른 자리를 살피면 처음부터)
  const stamp = useStamp(stampable && room ? room.slug : null);
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
        {tag ? <span className="walk-way-owner" lang="ko">{tag.owner}</span> : null}
        <PlaceText name={spot.title} />
      </h2>
      {tag && (tag.line || tag.title) ? <p className="small walk-panel-meta" lang="ko">{tag.line ?? tag.title}</p> : null}
      {game ? (
        <>
          {spot.kind === 'stage' ? <p><HouseLine text={spot.line} /></p> : null}
          {game.title !== spot.title ? <p className="walk-game-title">{gameEn ? gameEn.title : game.title}</p> : null}
          <p>{gameEn ? gameEn.blurb : game.blurb}</p>
          <p className="small walk-panel-meta">{aboutSeconds(game.seconds, lang)}</p>
        </>
      ) : (
        <p><HouseLine text={spot.line} /></p>
      )}
      {door && !isOpen ? (
        <p className="small walk-panel-meta">
          <T ko="문패: " en="Door sign: " />{en ? DOOR_EN[door] : DOOR_LABEL[door]}
          {room?.opens ? <> · <HouseLine text={room.opens} /></> : null}
        </p>
      ) : null}
      {spot.kind === 'lantern' ? (
        <p className="small">
          {lantern
            ? en
              ? `So far ${lantern.lit} ${lantern.lit === 1 ? 'sheet of paper has' : 'sheets of paper have'} lit the lantern.`
              : `지금까지 ${lantern.lit}장의 종이가 불을 밝혔어요.`
            : <T ko="석등은 곧 켜져요." en="The stone lantern will light up soon." />}
        </p>
      ) : null}
      {spot.kind === 'stage' && !game ? (
        <p className="small walk-panel-meta">
          <T ko="다섯 사람 카드는 소개 글과 그림이 정해지면 걸려요." en="Cards for the five people of this house go up once their introductions and pictures are ready." />
        </p>
      ) : null}
      {stampable && room ? <StampFeedback state={stamp.state} name={placeName(lang, room.name)} /> : null}
      <div className="btn-row">
        {enter ? (
          <button type="button" className="btn btn-roof btn-small" onClick={() => onEnter(room.slug)}><T ko="들어가기" en="Enter" /></button>
        ) : null}
        {spot.kind === 'exit' && onLeave ? (
          <button type="button" className="btn btn-roof btn-small" onClick={onLeave}><T ko="나가기" en="Leave" /></button>
        ) : null}
        {game && onPlay ? (
          <button type="button" className="btn btn-roof btn-small" onClick={() => onPlay(game.id)} aria-keyshortcuts="Enter">
            <IconPlay />
            <T ko="놀이 시작" en="Start game" />{coarse ? null : <> <kbd>Enter</kbd></>}
          </button>
        ) : null}
        {room && isOpen && !portal && spot.kind !== 'exit' && spot.kind !== 'game' ? (
          <Link className={game ? 'btn btn-small' : 'btn btn-roof btn-small'} href={`/room/${room.slug}`}>
            {room.photo && acceptsNotes(room, door)
              ? <T ko="사진 올리기" en="Add a photo" />
              : acceptsNotes(room, door) ? <T ko="쪽지 남기러 가기" en="Leave a note" /> : <T ko="방 보기" en="See the room" />}
          </Link>
        ) : null}
        {room?.slug === 'photozone' && isOpen ? (
          // 포토존에서 찍은 사진으로 내 캐릭터도 꾸민다(사진 캐릭터 화면으로)
          <Link className="btn btn-small" href="/avatar"><T ko="내 사진으로 캐릭터 꾸미기" en="Make a character from my photo" /></Link>
        ) : null}
        {portal && room && isOpen && acceptsNotes(room, door) ? (
          <Link className="btn btn-small" href={`/room/${room.slug}`}><T ko="쪽지 남기러 가기" en="Leave a note" /></Link>
        ) : null}
        {stampable ? <StampPressButton state={stamp.state} onPress={() => void stamp.press()} /> : null}
        <button type="button" className="btn btn-small" onClick={onClose}><T ko="닫기" en="Close" /></button>
      </div>
    </div>
  );
}

/** 놀이 시작(▶): 글자색을 따른다 */
function IconPlay() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M7 4.5v15l12.5-7.5z" />
    </svg>
  );
}
