import type { ReactNode } from 'react';
import { T } from '@/components/i18n/T';
import { PhotoThumb } from '@/components/PhotoThumb';
import { SCOPE_LABEL } from '@/lib/access';
import { RECORD_STATUS, SCOPE_EN, dayLabel, hangulLang } from '@/lib/page-words';

export type RecordRow = {
  id: string;
  author_name: string;
  format: string;
  body: string;
  visibility: 'self' | 'family' | 'guests' | 'public';
  status: 'submitted' | 'approved' | 'hidden' | 'rejected' | 'sealed';
  created_at: string;
  mine: boolean;
  /** 사진이 붙은 기록(파일 이름은 오지 않는다) */
  has_photo?: boolean;
  /** 서버가 만든 10분짜리 서명 주소(볼 수 있는 줄에만) */
  photo?: { thumb: string; view: string };
};

// 서버 상태 낱말을 손님 말로(기획서 6.2). 한·영은 lib/page-words의 RECORD_STATUS.
// 쪽지 글과 이름은 쓴 사람의 말 그대로 둔다(한글이 있으면 lang="ko")
export function RecordList({ rows, empty }: { rows: RecordRow[]; empty: ReactNode }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="records">
      {rows.map((r) => (
        <article key={r.id} className="record" data-status={r.status}>
          {r.photo ? <PhotoThumb thumb={r.photo.thumb} view={r.photo.view} label={`${r.author_name} 님이 붙인 사진`} /> : null}
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }} lang={hangulLang(r.body)}>{r.body}</p>
          <div className="meta">
            <span lang={hangulLang(r.author_name)}>{r.author_name}</span>
            <span><T ko={dayLabel('ko', r.created_at)} en={dayLabel('en', r.created_at)} /></span>
            {r.mine || r.status !== 'approved' ? <span className="badge"><T ko={RECORD_STATUS[r.status].ko} en={RECORD_STATUS[r.status].en} /></span> : null}
            {r.mine ? <span className="badge"><T ko={SCOPE_LABEL[r.visibility]} en={SCOPE_EN[r.visibility]} /></span> : null}
            {r.has_photo && !r.photo ? <span className="badge"><T ko="사진 한 장" en="One photo" /></span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
