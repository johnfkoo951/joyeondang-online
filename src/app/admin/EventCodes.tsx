import { EventCodeMaker, EventRevoke } from '@/app/admin/EventCodeMaker';
import { EVENT_STATE_LABEL, asEventRows, eventState, formatKst } from '@/lib/event-code';
import { createClient } from '@/lib/supabase/server';
import styles from './event-codes.module.css';

// ───────── 행사 초대 코드(0018): 발표 같은 자리의 청중이 코드(QR) 하나로 한꺼번에 들어온다.
// 관리 화면(집주인만) 안에서 그린다. 목록은 DB의 admin_event_codes()가 집주인인지 한 번 더 본다.
export async function EventCodePanel({ now }: { now: Date }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_event_codes', { p_limit: 30 });
  const rows = asEventRows(data);
  return (
    <section className="card stack" aria-labelledby="event-codes">
      <h2 id="event-codes" style={{ marginTop: 0 }}>행사 초대 코드</h2>
      <p className="small muted">
        발표 같은 자리에서 청중이 한꺼번에 들어올 때 써요. 코드 하나를 화면에 QR로 띄우면, 그 QR로 구글 계정에 들어온 분이 명단 손님이 돼요(이름은 구글 계정 이름).
        정한 시간이 지나거나 최대 인원이 차면 새로 받지 않고, 이미 들어온 분은 그대로예요.
      </p>
      {error ? (
        <p className="note-box">아직 쓸 수 없어요. DB에 행사 코드 표(0018 마이그레이션)가 들어가면 열려요.</p>
      ) : (
        <>
          <EventCodeMaker />
          {rows.length ? (
            <ul className={styles.list}>
              {rows.map((r) => {
                const state = eventState(r, now);
                return (
                  <li key={r.id} className={`record ${styles.row}`} data-state={state}>
                    <p className={styles.rowHead}>
                      <strong>{r.label}</strong>
                      <span className="badge">{EVENT_STATE_LABEL[state]}</span>
                    </p>
                    <p className={styles.rowMeta}>
                      들어온 분 {r.used}명 / 최대 {r.max_uses}명
                      {r.active !== r.used ? ` · 지금 손님 ${r.active}명` : ''}
                      {' · '}
                      {r.revoked_at ? `${formatKst(r.revoked_at)}에 거둠` : `${formatKst(r.expires_at)}까지`}
                    </p>
                    <EventRevoke id={r.id} label={r.label} active={r.active} revoked={Boolean(r.revoked_at)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>아직 만든 행사 코드가 없어요.</p>
          )}
        </>
      )}
    </section>
  );
}
