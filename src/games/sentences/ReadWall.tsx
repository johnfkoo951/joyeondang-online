'use client';
// 읽기 벽: 창살 빛 아래 줄에 걸린 종이를 한 장씩 넘긴다(← → 키, 단추, 밀기).
import { useEffect, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { ArrowIcon } from './icons';
import type { Sentence } from './logic';
import type { Sound } from './sound';
import { isTypingTarget } from './keys';
import s from './sentences.module.css';

type Props = {
  sentences: Sentence[];
  loading: boolean;
  samplesOnly: boolean;
  play: Sound['play'];
  onSeen: (count: number) => void;
};

export function ReadWall({ sentences, loading, samplesOnly, play, onSeen }: Props) {
  const [idx, setIdx] = useState(0);
  const seen = useRef(new Set<number>([0]));
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const n = sentences.length;
  const at = n ? Math.min(idx, n - 1) : 0;
  const cur = sentences[at];
  const en = useLang() === 'en';
  const tr = useTr();

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const go = (d: number) => {
    if (n < 2) return;
    const next = (at + d + n) % n;
    setIdx(next);
    seen.current.add(next);
    onSeen(seen.current.size);
    play('flip');
  };

  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.repeat || isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goRef.current(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goRef.current(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className={s.read} aria-labelledby="sent-read-h">
      <h2 id="sent-read-h" ref={heading} tabIndex={-1} className={s.title}>
        {tr('읽기 벽', 'Reading wall')}
      </h2>
      {loading ? (
        <p className={s.lead} role="status">{tr('벽에 걸린 종이를 살펴보는 중이에요', 'Looking at the papers on the wall')}</p>
      ) : samplesOnly ? (
        <p className={s.lead}>{tr('아직 걸린 종이가 없어서, 예시 문장 몇 장을 먼저 걸어 두었어요.', 'No papers are up yet, so a few example sentences are hung for now.')}</p>
      ) : (
        <p className={s.lead}>
          {tr(`걸린 문장 ${n}장. 옆으로 밀거나 화살표로 넘겨요.`, `${n} ${n === 1 ? 'sentence' : 'sentences'} on the wall. Swipe or use the arrows to flip.`)}
        </p>
      )}

      <div className={s.line} aria-hidden="true" />
      {cur ? (
        <article
          key={cur.id}
          className={s.paper}
          aria-live="polite"
          aria-roledescription={tr('문장 종이', 'sentence paper')}
          aria-label={tr(`${at + 1}번째 종이`, `Paper ${at + 1}`)}
          onPointerDown={(e) => {
            swipe.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const st = swipe.current;
            swipe.current = null;
            if (!st) return;
            const dx = e.clientX - st.x;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - st.y)) go(dx < 0 ? 1 : -1);
          }}
        >
          <span className={s.pin} data-side="l" aria-hidden="true" />
          <span className={s.pin} data-side="r" aria-hidden="true" />
          {/* 문장·출처·옮겨 적은 분은 사람이 쓴 글이라 옮기지 않는다 */}
          <p className={s.paperText} lang="ko">
            {cur.text}
          </p>
          <p className={s.paperSource}>
            {en ? (
              cur.source ? (
                <>
                  Source: <span lang="ko">{cur.source}</span>
                </>
              ) : (
                'No source given'
              )
            ) : cur.source ? (
              `출처: ${cur.source}`
            ) : (
              '출처를 적지 않은 종이'
            )}
          </p>
          <p className={s.paperMeta}>
            {cur.sample ? <span className={s.badge}>{tr('예시 문장', 'Example')}</span> : null}
            {cur.by && !cur.sample ? (
              en ? (
                <span>
                  Copied by <span lang="ko">{cur.by}</span>
                </span>
              ) : (
                <span>옮겨 적은 분 {cur.by}</span>
              )
            ) : null}
            {cur.pending ? (
              <span className={s.badge}>{cur.mine ? tr('가족이 읽는 중', 'The family is reading it') : tr('아직 검토 전', 'Not reviewed yet')}</span>
            ) : null}
          </p>
        </article>
      ) : null}

      <div className={s.flip}>
        <button type="button" className={s.round} onClick={() => go(-1)} disabled={n < 2} aria-label={tr('앞 종이', 'Previous paper')} aria-keyshortcuts="ArrowLeft">
          <ArrowIcon dir="left" />
        </button>
        <span className={s.count} aria-live="polite">
          {n ? `${at + 1} / ${n}` : '0 / 0'}
        </span>
        <button type="button" className={s.round} onClick={() => go(1)} disabled={n < 2} aria-label={tr('다음 종이', 'Next paper')} aria-keyshortcuts="ArrowRight">
          <ArrowIcon dir="right" />
        </button>
      </div>
    </section>
  );
}
