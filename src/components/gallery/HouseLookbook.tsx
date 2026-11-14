/* eslint-disable @next/next/no-img-element */
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { LOOKBOOK, type LookbookItem } from './lookbook';

// 조연당 콜라주 화보. 그림과 소개 말은 lookbook.ts(한·영), 화면 말은 <T>, 속성(이름·대체 글)은 지금 말로 고른다
export function HouseLookbook() {
  const [zoom, setZoom] = useState<LookbookItem | null>(null);
  const en = useLang() === 'en';
  const title = (item: LookbookItem) => (en ? item.en.title : item.title);

  return (
    <section className="stack" aria-labelledby="lookbook-head">
      <div className="lookbook-head">
        <div>
          <p className="art-eyebrow">COLLAGE ARCHIVE</p>
          <h2 id="lookbook-head" className="art-hand-h2"><T ko="조연당 콜라주 화보" en="Joyeondang collage lookbook" /></h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            <T
              ko="오일파스텔과 찢은 색종이로 지은 조연당의 화보집이에요. 그림을 누르면 크게 볼 수 있어요."
              en="A lookbook of Joyeondang made with oil pastels and torn colored paper. Tap a picture to see it larger."
            />
          </p>
        </div>
      </div>

      <div className="lookbook-grid">
        {LOOKBOOK.map((item) => (
          <article key={item.id} className="lookbook-card">
            <button
              type="button"
              className="lookbook-thumb"
              data-contain={item.contain || undefined}
              onClick={() => setZoom(item)}
              aria-label={en ? `View larger: ${item.en.title}` : `${item.title} 크게 보기`}
            >
              <img src={item.src} alt={title(item)} loading="lazy" />
            </button>
            <div className="lookbook-body">
              <h3><T ko={item.title} en={item.en.title} /></h3>
              <p className="small muted"><T ko={item.caption} en={item.en.caption} /></p>
              <Link className="btn btn-small" href={item.href}>
                <T ko={`${item.cta} →`} en={`${item.en.cta} →`} />
              </Link>
            </div>
          </article>
        ))}
      </div>

      {zoom ? (
        <div
          className="lookbook-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title(zoom)}
          onClick={() => setZoom(null)}
        >
          <div className="lookbook-modal-box" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.src} alt={title(zoom)} className="lookbook-modal-img" />
            <div className="lookbook-modal-foot">
              <div>
                <strong><T ko={zoom.title} en={zoom.en.title} /></strong>
                <p className="small muted" style={{ margin: '2px 0 0' }}><T ko={zoom.caption} en={zoom.en.caption} /></p>
              </div>
              <div className="btn-row">
                <Link className="btn btn-roof btn-small" href={zoom.href}><T ko={zoom.cta} en={zoom.en.cta} /></Link>
                <button type="button" className="btn btn-small" onClick={() => setZoom(null)}><T ko="닫기" en="Close" /></button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
