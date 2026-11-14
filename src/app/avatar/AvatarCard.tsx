'use client';
import { useActionState, useEffect, useRef, useState, type MouseEvent } from 'react';
import { enAttrs } from '@/components/avatar/en-attrs';
import { Say } from '@/components/avatar/Say';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { dropCachedAvatar } from '@/lib/avatar/forget-cache';
import { SLOTS, deleteWarning, slotNumbers, type ModelState } from '@/lib/avatar/rules';
import { tr, type Lang } from '@/lib/i18n';
import { manageAvatar, type ManageState } from './actions';
import { clearMaking } from '@/components/walk/making';
import { emitWalk, WALK_EVENT } from '@/components/walk/walk-events';
import styles from './avatar.module.css';

// 내 캐릭터 한 장: 걷기에 쓰기 / ★ 보관 / 작업대로 꺼내기 / 3D 만들기 / 그림 지우기 / 원본 사진 지우기. 지우기와 3D는 한 번 더 묻는다.
// 작업대 칸(0019·0021, 손님 3칸, 가족·관리자 9칸) 가운데 빈 칸과 그리는 중인 칸도 여기 있다. ★·작업대·3D는 0021의 DB에서만
// 보인다(kept가 있을 때). 작업대는 큰 카드(AvatarCard, 칸이 셋보다 많으면 작은 카드), 보관함(★)과 이력은 작은 카드
// (MiniCard: 그림 + 단추 한 줄. 휴대폰에서도 짧게)로 놓는다.
// 화면 말: 보이는 글은 두 말을 함께 싣는다(T: 서버가 그린 첫 화면에서도 깜박이지 않게). 속성(aria-label, title, alt)과
// 확인 창 글은 지금 말로 고른다(inLang). 서버 액션의 답은 한국어 그대로 받아 보일 때 옮긴다(Say).

export type CardInfo = {
  id: string;
  hasImage: boolean;
  hasOriginal: boolean;
  /** 걷기 화면이 지금 그리는 캐릭터(profiles.look) */
  active: boolean;
  made: string;
  /** 만든 때의 영어(「Nov 12, 3:05 PM」). 없으면 made */
  madeEn?: string;
  /** 작업대 칸 번호(1~칸 수). 작업대 밖(이력에만 있음)이면 없음 */
  slot?: number;
  /** ★ 보관(0021). 없으면 이력·★·3D가 없는 옛 DB라 그 단추를 보이지 않는다 */
  kept?: boolean;
  /** 3D 상태(0021) */
  model?: ModelState;
  /** 3D 배지 글(그림의 실패 까닭과 다시 해 볼 수 있는지까지 서버가 정한다. 빈 글이면 숨긴다) */
  badge3d?: string;
  /** badge3d의 영어 */
  badge3dEn?: string;
  /** 이 사람의 3D 한도(null = 제한 없음). 3D가 있거나 만드는 중인 그림을 지울 때 한 번뿐인 3D를 잃는다고 알린다 */
  modelCap?: number | null;
  /** 이력 카드: 작업대에 없으면 「작업대로」를 보인다 */
  history?: boolean;
  /** 작업대에 빈 칸이 있는가(없으면 「작업대로」가 그림 바로 아래에 바꿀 칸을 펼친다) */
  benchFree?: boolean;
  /** 이 사람의 작업대 칸 수(손님 3, 가족·관리자 9). 바꿀 칸 단추를 이만큼 놓는다. 없으면 3 */
  benchSize?: number;
  /** 작업대 칸마다 지금 있는 다 그린 그림 id(칸 번호 차례, 비었거나 그리는 중이면 null). 바꿀 칸 단추에 작게 보인다 */
  benchThumbs?: (string | null)[];
  /** 지금 이 그림으로 3D를 요청할 수 있으면 누르기 전에 묻는 글(무엇을 어디로 보내는지). 아니면 없음 */
  modelAsk?: string | null;
  /** modelAsk의 영어 */
  modelAskEn?: string | null;
  /** 여러 방향 그림 줄을 보이는가(작업대 카드만: 이력의 그림마다 없는 묶음을 묻지 않게) */
  turns?: boolean;
};

/** 영어 화면이면 속성과 확인 창에 쓰는 글(만든 때, 3D 배지, 3D 확인)을 영어로 바꾼 카드. 보이는 글은 원래 카드로 두 말을 싣는다 */
function inLang(card: CardInfo, lang: Lang): CardInfo {
  if (lang !== 'en') return card;
  return {
    ...card,
    made: card.madeEn || card.made,
    badge3d: card.badge3dEn ?? card.badge3d,
    modelAsk: card.modelAsk ? card.modelAskEn || card.modelAsk : card.modelAsk,
  };
}

/** 걷기 겉모습이 바뀌었으면 걷기 위에 이 화면을 연 걷기 화면에 알린다(살아 있으면 바로 갈아입는다) */
function tellWalk(r: ManageState | null | undefined) {
  if (r?.ok && r.look) emitWalk(WALK_EVENT.lookChanged, { look: r.look });
}

function confirmFirst(text: string) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(text)) e.preventDefault();
  };
}

/** 그림 지우기 확인 글. 3D가 있거나 만드는 중이고 3D 한도가 있으면 한 번뿐인 3D를 잃는다고 먼저 알린다 */
function deleteAsk(card: CardInfo, lang: Lang): string {
  const warn = card.model ? deleteWarning(card.model, card.modelCap === undefined ? null : card.modelCap, lang) : null;
  return `${warn ? `${warn} ` : ''}${tr(lang, '이 그림을 지울까요? 되돌릴 수 없어요.', "Delete this picture? This can't be undone.")}`;
}
/** 원본 사진 지우기 확인 글 */
const deleteOriginalAsk = (lang: Lang) =>
  tr(lang, '이 그림을 만들 때 올린 원본 사진을 지울까요? 되돌릴 수 없어요.', "Delete the original photo you uploaded for this picture? This can't be undone.");

/** 카드 하나의 서버 액션. 그림 지우기가 끝났다는 답을 받은 뒤에 이 기기의 브라우저 캐시에 남은 그림도 버린다 */
function useCardAction() {
  // (지우는 도중에 화면을 떠나도 지워지기 전에 다시 받아 캐시에 되살리는 일이 없다)
  return useActionState<ManageState | null, FormData>(async (prev, fd) => {
    const r = await manageAvatar(prev, fd);
    const id = fd.get('id');
    if (r?.ok && fd.get('op') === 'delete-character' && typeof id === 'string') void dropCachedAvatar(id);
    tellWalk(r);
    return r;
  }, null);
}

/**
 * ★ 보관 단추. 이름은 늘 「★ 보관」(영어 「★ Favorite」)이고 눌림(aria-pressed)으로 보관했는지 알린다.
 * 큰 단추는 두 말 단추를 함께 싣고 CSS가 고른 말의 것만 보인다(data-ko·data-en, T와 같은 방법: 첫 화면에서 깜박이지 않게)
 */
function KeepForm({ card, pending, action, mini, lang }: {
  card: CardInfo; pending: boolean; action: (fd: FormData) => void; mini?: boolean; lang: Lang;
}) {
  return (
    <form action={action} className={mini ? styles.miniStarForm : undefined}>
      <input type="hidden" name="op" value={card.kept ? 'unkeep' : 'keep'} />
      <input type="hidden" name="id" value={card.id} />
      {mini ? (
        <button
          className={styles.miniStar} disabled={pending} aria-pressed={card.kept} aria-label="★ 보관" title="★ 보관"
          {...enAttrs(lang, { 'aria-label': '★ Favorite', title: '★ Favorite' })}
        >
          <span aria-hidden="true">{card.kept ? '★' : '☆'}</span>
        </button>
      ) : (
        <>
          <button data-ko="" className={`btn btn-small ${styles.keepBtn}`} disabled={pending} aria-pressed={card.kept}>★ 보관</button>
          <button data-en="" lang="en" className={`btn btn-small ${styles.keepBtn}`} disabled={pending} aria-pressed={card.kept}>★ Favorite</button>
        </>
      )}
    </form>
  );
}

export function AvatarCard({ card: info }: { card: CardInfo }) {
  const lang = useLang();
  const card = inLang(info, lang);
  const [state, action, pending] = useCardAction();
  // 여러 방향 그림(걷기 화면에서 캐릭터가 보는 쪽에 따라 고르는 그림)은 캐릭터 그림보다 조금 늦게 생긴다. 아직 없으면(404) 줄을 접는다
  const [turns, setTurns] = useState(true);
  const features = card.kept !== undefined;
  const badge = features ? info.badge3d ?? '' : '';
  const badgeEn = features ? info.badge3dEn || badge : '';
  return (
    <article className={styles.card} data-active={card.active || undefined} aria-busy={pending}>
      {card.hasImage ? (
        <div className={styles.paper}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.thumb} src={`/api/avatar/${card.id}`} loading="lazy"
            alt={tr(lang, `${info.made}에 만든 내 캐릭터`, `My character made ${card.made}`)}
          />
        </div>
      ) : (
        <div className={`${styles.paper} ${styles.gone}`}>
          <span className="small muted"><T ko="그림은 지웠어요" en="Picture deleted" /></span>
        </div>
      )}
      {card.hasImage && card.turns !== false && turns ? (
        <figure className={styles.turns}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.turnsImg}
            src={`/api/avatar/${card.id}/views?s=s`}
            alt={tr(lang, '이 캐릭터의 앞, 옆, 뒤 그림', 'Front, side and back views of this character')}
            loading="lazy"
            onError={() => setTurns(false)}
            // 화면이 살아나기(하이드레이션) 전에 404로 끝났으면 onError를 놓친다: 붙는 순간 한 번 더 본다
            ref={(el) => {
              if (el && el.complete && el.naturalWidth === 0) setTurns(false);
            }}
          />
          <figcaption className="small muted">
            <T ko="집 안을 걸을 때 보는 쪽에 맞는 그림이 보여요" en="When you walk the house, the view for the direction you face is shown" />
          </figcaption>
        </figure>
      ) : null}
      <div className={styles.cardMeta}>
        {card.slot ? (
          <span className={styles.slotNo}>
            <T ko={card.history ? `작업대 ${card.slot}번` : `${card.slot}번 칸`} en={card.history ? `Workbench\u00a0${card.slot}` : `Slot\u00a0${card.slot}`} />
          </span>
        ) : null}
        <span className="small muted"><T ko={info.made} en={info.madeEn || info.made} /></span>
        {card.active ? <span className="badge"><T ko="걷기에 쓰는 중" en="Wearing now" /></span> : null}
        {badge ? <span className="badge" data-state={card.model}><T ko={badge} en={badgeEn} /></span> : null}
        {card.hasOriginal ? <span className="badge"><T ko="원본 사진 있음" en="Original photo kept" /></span> : null}
      </div>
      <div className={styles.cardActions}>
        {card.hasImage && !card.active ? (
          <form action={action}>
            <input type="hidden" name="op" value="choose" />
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-small btn-pine" disabled={pending}><T ko="이 캐릭터로 걷기" en="Walk as this character" /></button>
          </form>
        ) : null}
        {card.hasImage && card.active ? (
          <form action={action}>
            <input type="hidden" name="op" value="unchoose" />
            <button className="btn btn-small" disabled={pending}><T ko="종이 인형으로 걷기" en="Walk as the paper doll" /></button>
          </form>
        ) : null}
        {features && card.hasImage ? <KeepForm card={card} pending={pending} action={action} lang={lang} /> : null}
        {features && card.modelAsk ? (
          <form action={action}>
            <input type="hidden" name="op" value="model" />
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-small btn-roof" disabled={pending} onClick={confirmFirst(card.modelAsk)}><T ko="3D 만들기" en="Make 3D" /></button>
          </form>
        ) : null}
        {card.hasImage ? (
          <form action={action}>
            <input type="hidden" name="op" value="delete-character" />
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-small" disabled={pending} onClick={confirmFirst(deleteAsk(card, lang))}><T ko="그림 지우기" en="Delete picture" /></button>
          </form>
        ) : null}
        {card.hasOriginal ? (
          <form action={action}>
            <input type="hidden" name="op" value="delete-original" />
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-small" disabled={pending} onClick={confirmFirst(deleteOriginalAsk(lang))}>
              <T ko="원본 사진 지우기" en="Delete original photo" />
            </button>
          </form>
        ) : null}
      </div>
      {state ? (
        <p className={`small ${state.ok ? '' : 'warn'}`} role="status" style={{ margin: 0 }}>
          <Say text={state.message} />
        </p>
      ) : null}
    </article>
  );
}

/**
 * 보관함(★)과 이력의 작은 카드: 그림을 누르면 이 캐릭터로 걷고, ★은 그림 위, 단추는 그림 아래 한 줄
 * (작업대로, 3D 만들기, 지우기). 작업대가 다 찼으면 「작업대로」가 이 카드 바로 아래에 바꿀 칸을 펼친다.
 * 원본 사진 지우기처럼 드물게 쓰는 일은 접어 둔다. 옛 DB(kept 없음)에는 쓰지 않는다
 */
export function MiniCard({ card: info }: { card: CardInfo }) {
  const lang = useLang();
  const card = inLang(info, lang);
  const [state, action, pending] = useCardAction();
  const [swap, setSwap] = useState(false);
  const swapBox = useRef<HTMLDivElement>(null);
  const firstSwap = useRef<HTMLButtonElement>(null);
  // 바꿀 칸을 펼치면 줄이 다 보이게 스크롤하고 첫 단추로 초점을 옮긴다(이력 아래쪽 카드에서 펼쳐도 화면 밖에 열리지 않게)
  useEffect(() => {
    if (!swap) return;
    swapBox.current?.scrollIntoView({ block: 'nearest' });
    firstSwap.current?.focus();
  }, [swap]);
  const badge = info.badge3d ?? '';
  const badgeEn = info.badge3dEn || badge;
  return (
    <article className={styles.mini} data-active={card.active || undefined} aria-busy={pending}>
      <div className={styles.miniPic}>
        {card.active ? (
          <div
            className={styles.miniWear} role="img"
            aria-label={tr(lang, `${info.made}에 만든 내 캐릭터: 걷기에 쓰는 중`, `My character made ${card.made}: wearing now`)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.miniImg} src={`/api/avatar/${card.id}`} alt="" loading="lazy" />
            <span className={styles.miniOn}><T ko="걷는 중" en="Walking" /></span>
          </div>
        ) : (
          <form action={action} className={styles.miniWearForm}>
            <input type="hidden" name="op" value="choose" />
            <input type="hidden" name="id" value={card.id} />
            <button
              className={styles.miniWear} disabled={pending}
              aria-label={tr(lang, `${info.made}에 만든 캐릭터로 걷기`, `Walk as the character made ${card.made}`)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.miniImg} src={`/api/avatar/${card.id}`} alt="" loading="lazy" />
            </button>
          </form>
        )}
        {/* 작업대 칸 안의 작은 카드(칸이 셋보다 많은 작업대)는 번호만, 보관함·이력에서는 「작업대 N번」 */}
        {card.slot ? (
          <span className={styles.miniSlot}>
            <T ko={card.history ? `작업대 ${card.slot}번` : `${card.slot}번`} en={card.history ? `Workbench\u00a0${card.slot}` : `#${card.slot}`} />
          </span>
        ) : null}
        <KeepForm card={card} pending={pending} action={action} mini lang={lang} />
      </div>
      <p className={styles.miniMeta}>
        <span><T ko={info.made} en={info.madeEn || info.made} /></span>
        {badge ? <span className={styles.miniBadge} data-state={card.model}><T ko={badge} en={badgeEn} /></span> : null}
      </p>
      <div className={styles.miniActs}>
        {/* 지금 걷기에 쓰는 그림이면 종이 인형으로 돌아가는 길(큰 카드와 같다. 9칸 작업대는 작은 카드라서) */}
        {card.active && card.hasImage ? (
          <form action={action}>
            <input type="hidden" name="op" value="unchoose" />
            <button className={styles.miniBtn} disabled={pending}><T ko="종이 인형으로 걷기" en="Walk as the paper doll" /></button>
          </form>
        ) : null}
        {card.history && !card.slot ? (
          card.benchFree ? (
            <form action={action}>
              <input type="hidden" name="op" value="bench" />
              <input type="hidden" name="id" value={card.id} />
              <button className={styles.miniBtn} disabled={pending}><T ko="작업대로" en="To workbench" /></button>
            </form>
          ) : (
            <button type="button" className={styles.miniBtn} aria-expanded={swap} disabled={pending} onClick={() => setSwap((v) => !v)}>
              <T ko="작업대로" en="To workbench" />
            </button>
          )
        ) : null}
        {card.modelAsk ? (
          <form action={action}>
            <input type="hidden" name="op" value="model" />
            <input type="hidden" name="id" value={card.id} />
            <button className={`${styles.miniBtn} ${styles.miniRoof}`} disabled={pending} onClick={confirmFirst(card.modelAsk)}>
              <T ko="3D 만들기" en="Make 3D" />
            </button>
          </form>
        ) : null}
        <form action={action}>
          <input type="hidden" name="op" value="delete-character" />
          <input type="hidden" name="id" value={card.id} />
          <button className={styles.miniBtn} disabled={pending} onClick={confirmFirst(deleteAsk(card, lang))}><T ko="지우기" en="Delete" /></button>
        </form>
      </div>
      {swap && !card.benchFree && !card.slot ? (
        <div ref={swapBox} className={styles.miniSwap} role="group" aria-label="바꿀 작업대 칸" {...enAttrs(lang, { 'aria-label': 'Workbench slot to swap' })}>
          <span className="small">
            <T
              ko="작업대가 다 찼어요. 바꿀 칸을 골라 주세요(바꾼 그림은 이력에 그대로 있어요)."
              en="The workbench is full. Choose a slot to swap (the swapped picture stays in your history)."
            />
          </span>
          {/* 단추마다 그 칸에 지금 있는 그림을 작게(작업대는 위에 있다). 칸이 많으면(9칸) 단추 글은 번호만이고,
              화면 읽기 프로그램에는 「N번 칸과 바꾸기」로 읽힌다 */}
          {slotNumbers(card.benchSize ?? SLOTS).map((n, i, all) => {
            const thumb = card.benchThumbs?.[n - 1] ?? null;
            return (
              <form key={n} action={action}>
                <input type="hidden" name="op" value="bench" />
                <input type="hidden" name="id" value={card.id} />
                <input type="hidden" name="slot" value={n} />
                <button
                  ref={i === 0 ? firstSwap : undefined} className={`${styles.miniBtn} ${styles.miniSwapBtn}`} disabled={pending}
                  aria-label={tr(lang, `${n}번 칸과 바꾸기`, `Swap with slot ${n}`)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb ? <img className={styles.miniSwapThumb} src={`/api/avatar/${thumb}`} alt="" loading="lazy" /> : (
                    <span className={styles.miniSwapThumb} data-empty aria-hidden="true" />
                  )}
                  <span><T ko={all.length > SLOTS ? `${n}번` : `${n}번 칸과 바꾸기`} en={all.length > SLOTS ? `#${n}` : `Swap with slot\u00a0${n}`} /></span>
                </button>
              </form>
            );
          })}
          <button type="button" className={styles.miniBtn} onClick={() => setSwap(false)}><T ko="그만두기" en="Cancel" /></button>
        </div>
      ) : null}
      {card.hasOriginal ? (
        <details className={styles.miniMore}>
          <summary><T ko="원본 사진" en="Original photo" /></summary>
          <form action={action}>
            <input type="hidden" name="op" value="delete-original" />
            <input type="hidden" name="id" value={card.id} />
            <button className={styles.miniBtn} disabled={pending} onClick={confirmFirst(deleteOriginalAsk(lang))}>
              <T ko="원본 사진 지우기" en="Delete original photo" />
            </button>
          </form>
        </details>
      ) : null}
      {state ? (
        <p className={`small ${state.ok ? '' : 'warn'}`} role="status" style={{ margin: 0 }}>
          <Say text={state.message} />
        </p>
      ) : null}
    </article>
  );
}

/** 빈 칸: 위에서 사진으로 만들면 여기에 들어간다. mini면 작은 카드 크기로(칸이 셋보다 많은 작업대) */
export function EmptySlot({ n, canMake, mini }: { n: number; canMake: boolean; mini?: boolean }) {
  if (mini) {
    return (
      <article className={`${styles.mini} ${styles.emptySlot}`}>
        <div className={`${styles.paper} ${styles.gone}`}>
          <span className={styles.slotPlus} aria-hidden="true">+</span>
          {/* 작은 칸이라 짧게(긴 글은 음절 중간에서 꺾인다) */}
          <span className="small muted"><T ko={`${n}번 빈 칸`} en={`Slot\u00a0${n} empty`} /></span>
        </div>
        {canMake ? <a className={`${styles.miniBtn} ${styles.miniLink}`} href="#make"><T ko="새로 만들기" en="Make new" /></a> : null}
      </article>
    );
  }
  return (
    <article className={`${styles.card} ${styles.emptySlot}`}>
      <div className={`${styles.paper} ${styles.gone}`}>
        <span className={styles.slotPlus} aria-hidden="true">+</span>
        <span className="small muted"><T ko={`${n}번 칸이 비어 있어요`} en={`Slot\u00a0${n} is empty`} /></span>
      </div>
      {canMake ? <a className="btn btn-small" href="#make"><T ko="사진으로 새로 만들기" en="Make one from a photo" /></a> : null}
    </article>
  );
}

/**
 * 그리는 중인 그림: 다 그리면 이 칸에 생긴다. 그만두면 올린 원본도 지운다(칸을 내준 그림이 있으면 그 칸에 돌아온다).
 * n이 없으면 작업대 밖(이력)에서 그리는 중인 그림이다(작업대가 다 차서 새 그림에 칸을 내준 뒤에도 그리기는 이어진다).
 * mini면 이력의 작은 카드 크기로
 */
export function MakingSlot({ n, id, queued, mini }: { n?: number; id: string; queued: boolean; mini?: boolean }) {
  const lang = useLang();
  const [state, action, pending] = useActionState<ManageState | null, FormData>(async (prev, fd) => {
    const r = await manageAvatar(prev, fd);
    // 그만 그렸으면 걷기 화면의 「그리는 중」 칩도 내려놓는다
    if (r?.ok) clearMaking(id);
    tellWalk(r);
    return r;
  }, null);
  return (
    <article className={mini ? styles.mini : styles.card} aria-busy={pending}>
      <div className={`${styles.paper} ${styles.gone}`}>
        <span className={styles.slotSpin} aria-hidden="true" />
        <span className="small">
          {queued ? <T ko="그릴 차례를 기다리는 중이에요" en="Waiting for a turn to draw" /> : <T ko="캐릭터를 그리는 중이에요" en="Drawing your character" />}
        </span>
      </div>
      <div className={styles.cardMeta}>
        {n ? <span className={styles.slotNo}><T ko={`${n}번 칸`} en={`Slot\u00a0${n}`} /></span> : null}
        <span className="small muted">
          {n ? <T ko="다 그리면 이 칸에 생겨요" en="It will appear in this slot when done" /> : <T ko="다 그리면 이력에 생겨요" en="It will appear in your history when done" />}
        </span>
      </div>
      <form action={action}>
        <input type="hidden" name="op" value="delete-character" />
        <input type="hidden" name="id" value={id} />
        <button
          className={mini ? styles.miniBtn : 'btn btn-small'} disabled={pending}
          onClick={confirmFirst(tr(lang, '그리기를 그만둘까요? 올린 사진도 지워요.', 'Stop drawing? The uploaded photo will be deleted too.'))}
        >
          <T ko="그만 그리기" en="Stop drawing" />
        </button>
      </form>
      {state ? (
        <p className={`small ${state.ok ? '' : 'warn'}`} role="status" style={{ margin: 0 }}>
          <Say text={state.message} />
        </p>
      ) : null}
    </article>
  );
}

export function DeleteAllOriginals() {
  const lang = useLang();
  const [state, action, pending] = useActionState<ManageState | null, FormData>(manageAvatar, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="op" value="delete-all-originals" />
      <div className="btn-row">
        <button
          className="btn btn-small"
          disabled={pending}
          onClick={confirmFirst(tr(lang, '남아 있는 원본 사진을 모두 지울까요? 만든 그림은 그대로 남아요.', 'Delete all remaining original photos? Your pictures will stay.'))}
        >
          <T ko="원본 사진 모두 지우기" en="Delete all original photos" />
        </button>
      </div>
      {state ? (
        <p className={`small ${state.ok ? '' : 'warn'}`} role="status" style={{ margin: 0 }}>
          <Say text={state.message} />
        </p>
      ) : null}
    </form>
  );
}
