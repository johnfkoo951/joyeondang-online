'use client';
import { useActionState, type MouseEvent } from 'react';
import { manageAvatar, type ManageState } from './actions';
import styles from './avatar.module.css';

// 내 캐릭터 한 장: 걷기에 쓰기 / 그림 지우기 / 원본 사진 지우기. 지우기는 한 번 더 묻는다.

export type CardInfo = {
  id: string;
  hasImage: boolean;
  hasOriginal: boolean;
  active: boolean;
  made: string;
};

function confirmFirst(text: string) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(text)) e.preventDefault();
  };
}

export function AvatarCard({ card }: { card: CardInfo }) {
  const [state, action, pending] = useActionState<ManageState | null, FormData>(manageAvatar, null);
  return (
    <article className={styles.card} data-active={card.active || undefined} aria-busy={pending}>
      {card.hasImage ? (
        <div className={styles.paper}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.thumb} src={`/api/avatar/${card.id}`} alt={`${card.made}에 만든 내 캐릭터`} loading="lazy" />
        </div>
      ) : (
        <div className={`${styles.paper} ${styles.gone}`}>
          <span className="small muted">그림은 지웠어요</span>
        </div>
      )}
      <div className={styles.cardMeta}>
        <span className="small muted">{card.made}</span>
        {card.active ? <span className="badge">걷기에 쓰는 중</span> : null}
        {card.hasOriginal ? <span className="badge">원본 사진 보관 중</span> : null}
      </div>
      <div className={styles.cardActions}>
        {card.hasImage && !card.active ? (
          <form action={action}>
            <input type="hidden" name="op" value="choose" />
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-small btn-pine" disabled={pending}>이 캐릭터로 걷기</button>
          </form>
        ) : null}
        {card.hasImage && card.active ? (
          <form action={action}>
            <input type="hidden" name="op" value="unchoose" />
            <button className="btn btn-small" disabled={pending}>종이 인형으로 걷기</button>
          </form>
        ) : null}
        {card.hasImage ? (
          <form action={action}>
            <input type="hidden" name="op" value="delete-character" />
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-small" disabled={pending} onClick={confirmFirst('이 그림을 지울까요? 되돌릴 수 없어요.')}>
              그림 지우기
            </button>
          </form>
        ) : null}
        {card.hasOriginal ? (
          <form action={action}>
            <input type="hidden" name="op" value="delete-original" />
            <input type="hidden" name="id" value={card.id} />
            <button
              className="btn btn-small"
              disabled={pending}
              onClick={confirmFirst('이 그림을 만들 때 올린 원본 사진을 지울까요? 되돌릴 수 없어요.')}
            >
              원본 사진 지우기
            </button>
          </form>
        ) : null}
      </div>
      {state ? (
        <p className={`small ${state.ok ? '' : 'warn'}`} role="status" style={{ margin: 0 }}>
          {state.message}
        </p>
      ) : null}
    </article>
  );
}

export function DeleteAllOriginals() {
  const [state, action, pending] = useActionState<ManageState | null, FormData>(manageAvatar, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="op" value="delete-all-originals" />
      <div className="btn-row">
        <button
          className="btn btn-small"
          disabled={pending}
          onClick={confirmFirst('보관 중인 원본 사진을 모두 지울까요? 만든 그림은 그대로 남아요.')}
        >
          원본 사진 모두 지우기
        </button>
      </div>
      {state ? (
        <p className={`small ${state.ok ? '' : 'warn'}`} role="status" style={{ margin: 0 }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
