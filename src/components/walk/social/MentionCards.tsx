'use client';
import { useEffect } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { clip, type ChatMessage } from '@/lib/social';
import { IconClose } from '../icons';
import { AvatarThumb } from './AvatarThumb';
import { placeLabel } from './places';
import s from './social.module.css';

/** 카드 하나가 떠 있는 시간 */
const CARD_MS = 10_000;

type Props = { cards: ChatMessage[]; onOpen: (m: ChatMessage) => void; onDismiss: (id: string) => void };

// 나를 멘션한 글이 오면 걷기 화면 위에 뜨는 카드(보낸 사람 아바타와 글). 누르면 대화창의 그 글로. 10초 뒤 저절로 접힌다.
// 보낸 사람 이름과 글은 한국어 그대로(lang="ko"), 있는 곳 이름은 장소 이름 표로 옮긴다.
export function MentionCards({ cards, onOpen, onDismiss }: Props) {
  const lang = useLang();
  const tr = useTr();
  const first = cards[0]?.id;
  useEffect(() => {
    if (!first) return;
    const t = window.setTimeout(() => onDismiss(first), CARD_MS);
    return () => window.clearTimeout(t);
  }, [first, onDismiss]);
  if (cards.length === 0) return null;
  return (
    <div className={`walk-social ${s.cards}`} role="status" aria-live="polite">
      {cards.map((m) => {
        const where = placeLabel(m.space, lang);
        return (
          <div key={m.id} className={s.card}>
            <button type="button" className={s.cardMain} onClick={() => onOpen(m)}>
              <AvatarThumb look={m.look} name={m.name} size={40} />
              <span className={s.cardText}>
                <span className={s.cardWho}>
                  <b lang="ko">{m.name}</b><T ko="님이 나를 멘션했어요" en=" mentioned you" />
                  {where ? <> · <span lang={lang === 'en' && /[가-힣]/.test(where) ? 'ko' : undefined}>{where}</span></> : ''}
                </span>
                <span className={s.cardBody} lang="ko">{clip(m.body, 90)}</span>
              </span>
            </button>
            <button type="button" className={s.cardX} onClick={() => onDismiss(m.id)} aria-label={tr('멘션 알림 닫기', 'Close mention alert')}>
              <IconClose size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
