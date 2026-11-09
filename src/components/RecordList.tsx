import { SCOPE_LABEL } from '@/lib/access';

export type RecordRow = {
  id: string;
  author_name: string;
  format: string;
  body: string;
  visibility: 'self' | 'family' | 'guests' | 'public';
  status: 'submitted' | 'approved' | 'hidden' | 'rejected' | 'sealed';
  created_at: string;
  mine: boolean;
};

// 서버 상태 낱말을 손님 말로(기획서 6.2)
const STATUS_WORD: Record<RecordRow['status'], string> = {
  submitted: '봉투에 담김, 가족이 읽는 중',
  approved: '걸림',
  hidden: '내 수첩에만 있음',
  rejected: '내 수첩에만 있음',
  sealed: '봉인',
};

const fmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

export function RecordList({ rows, empty }: { rows: RecordRow[]; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="records">
      {rows.map((r) => (
        <article key={r.id} className="record" data-status={r.status}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
          <div className="meta">
            <span>{r.author_name}</span>
            <span>{fmt.format(new Date(r.created_at))}</span>
            {r.mine || r.status !== 'approved' ? <span className="badge">{STATUS_WORD[r.status]}</span> : null}
            {r.mine ? <span className="badge">{SCOPE_LABEL[r.visibility]}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
