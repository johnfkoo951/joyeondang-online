'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { getRoomExhibit } from '@/content/room-exhibits';
import s from './exhibit-modal.module.css';

// 방 전시 아카이브 창. 카드 글(머리말, 제목, 배지, 설명, 꼬리표, 원문 단추 이름)은 가족이 쓴 전시라 옮기지 않고 lang="ko",
// 창의 화면 말(닫기, 검색, 넘기기, 셈)만 한·영. 영어 화면에서는 창 이름을 제목 글에서 가져온다(aria-labelledby: 한국어로 읽게)

export function ExhibitModal({
  exhibitId,
  onClose,
}: {
  exhibitId: string;
  onClose: () => void;
}) {
  const exhibit = getRoomExhibit(exhibitId);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const en = useLang() === 'en';
  const titleId = useId();

  const filtered = useMemo(() => {
    if (!exhibit) return [];
    const q = query.normalize('NFC').trim().toLowerCase();
    if (!q) return exhibit.cards;
    return exhibit.cards.filter((c) => {
      const hay = [c.badge, c.title, c.subtitle, c.body, ...(c.tags ?? [])].join(' ').normalize('NFC').toLowerCase();
      return hay.includes(q);
    });
  }, [exhibit, query]);

  const safeIdx = filtered.length ? Math.min(selectedIdx, filtered.length - 1) : 0;
  const activeCard = filtered[safeIdx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      const inInput = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      if (e.key === '/' && !inInput && exhibit?.searchable) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (inInput) return;
      if (e.key === 'ArrowRight' && filtered.length > 1) {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowLeft' && filtered.length > 1) {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + filtered.length) % filtered.length);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [exhibit, filtered.length, onClose]);

  if (!exhibit) return null;

  return (
    <div
      className={s.backdrop} role="dialog" aria-modal="true" onClick={onClose}
      aria-label={en ? undefined : exhibit.title} aria-labelledby={en ? titleId : undefined}
    >
      <div className={s.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={s.headRow}>
          <div lang="ko">
            <p className={s.kicker}>{exhibit.kicker}</p>
            <h2 className={s.title} id={titleId}>{exhibit.title}</h2>
            <p className={s.lead}>{exhibit.lead}</p>
          </div>
          <button type="button" className="btn btn-small" onClick={onClose}>
            <T ko="닫기 (Esc)" en={<><span style={{ whiteSpace: 'nowrap' }}>Close</span> (Esc)</>} />
          </button>
        </div>

        {exhibit.searchable ? (
          <input
            ref={searchRef}
            type="search"
            className={s.searchBar}
            value={query}
            placeholder={en ? 'Search titles, ideas, and tags as you type (press / to jump here)' : '제목·개념·태그 실시간 검색 (/ 키로 바로 입력)'}
            aria-label={en ? 'Search the exhibit cards' : '전시 카드 검색'}
            onChange={(e) => {
              // 한글 IME 조합 중에도 실시간 필터 반영
              setQuery(e.currentTarget.value);
              setSelectedIdx(0);
            }}
            onCompositionEnd={(e) => {
              setQuery(e.currentTarget.value);
              setSelectedIdx(0);
            }}
          />
        ) : null}

        {filtered.length > 1 ? (
          <div className={s.cardTabs} role="tablist" aria-label={en ? 'Exhibit items' : '전시 항목 목록'}>
            {filtered.map((card, idx) => (
              <button
                key={card.id}
                type="button"
                role="tab"
                aria-selected={idx === safeIdx}
                className={s.cardTab}
                data-active={idx === safeIdx ? 'true' : undefined}
                onClick={() => setSelectedIdx(idx)}
              >
                {idx + 1}. <span lang="ko">{card.badge}</span>
              </button>
            ))}
          </div>
        ) : null}

        {activeCard ? (
          <article className={s.featureGrid} data-has-img={Boolean(activeCard.image) ? 'true' : undefined}>
            {activeCard.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- 정적 방 전시 일러스트
              <img src={activeCard.image} alt={activeCard.title} lang="ko" className={s.artImg} />
            ) : null}
            <div>
              <span className={s.badge} lang="ko">{activeCard.badge}</span>
              <h3 className={s.cardTitle} lang="ko">{activeCard.title}</h3>
              <p className={s.cardSub} lang="ko">{activeCard.subtitle}</p>
              <p className={s.cardBody} lang="ko">{activeCard.body}</p>
              {activeCard.tags?.length ? (
                <div className={s.tagRow} lang="ko">
                  {activeCard.tags.map((t) => (
                    <span key={t} className={s.tag}>#{t}</span>
                  ))}
                </div>
              ) : null}
              {activeCard.href ? (
                <div style={{ marginTop: 14 }}>
                  <a
                    href={activeCard.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-roof btn-small"
                  >
                    {activeCard.hrefLabel ? <span lang="ko">{activeCard.hrefLabel}</span> : <T ko="원문 열기 ↗" en="Open the original ↗" />}
                  </a>
                </div>
              ) : null}
            </div>
          </article>
        ) : (
          <p style={{ margin: 0, padding: 18, textAlign: 'center', opacity: 0.75 }}>
            <T ko="검색어와 일치하는 카드가 없어요. 다른 키워드를 입력해 보세요." en="No cards match your search. Try another word." />
          </p>
        )}

        <div className={s.footRow}>
          <span style={{ fontSize: 12.5, opacity: 0.72 }}>
            {filtered.length > 0 ? (
              <T
                ko={`${safeIdx + 1} / ${filtered.length} 카드 (← · → 방향키로 넘기기)`}
                en={`${safeIdx + 1} / ${filtered.length} ${filtered.length === 1 ? 'card' : 'cards'} (flip with ← · →)`}
              />
            ) : (
              <T ko="0 카드" en="0 cards" />
            )}
          </span>
          {filtered.length > 1 ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setSelectedIdx((i) => (i - 1 + filtered.length) % filtered.length)}
              >
                <T ko="← 이전" en="← Prev" />
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setSelectedIdx((i) => (i + 1) % filtered.length)}
              >
                <T ko="다음 →" en="Next →" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
