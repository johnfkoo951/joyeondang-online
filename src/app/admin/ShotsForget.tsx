'use client';
import { useActionState, type ReactNode } from 'react';
import { forgetShots, type ShotsForgetState } from '@/app/admin/shots-actions';
import { ROLE_LABEL } from '@/lib/access';
import {
  forgetEventAsk, forgetPersonAsk, peopleNote, pendingText, personName, type EventShots, type ShotCount, type ShotTotals,
} from '@/lib/shots-admin-rules';
import styles from './shots-admin.module.css';

/** note: 지울 수 없는 까닭(비밀 키가 없음, 그 키로 저장소에 닿지 않음). 비어 있으면 지울 수 있다 */
type Props = { people: ShotCount[]; events: EventShots[]; totals: ShotTotals; note: string };

/**
 * 걷기 사진 지우기 칸의 목록과 단추. 되돌릴 수 없으니 지우기는 누를 때마다 한 번 더 묻는다.
 * 결과 말은 이 목록에 둔다: 지운 줄은 다시 그릴 때 사라지므로 단추 옆에 두면 결과가 같이 사라진다.
 * 한 번에 하나만 한다(하는 동안 단추를 모두 끈다). 합계와 행사마다 수는 DB가 센 것이다(사람 줄은 잘려 올 수 있다).
 */
export function ShotsForgetList({ people, events, totals, note }: Props) {
  const [state, action, pending] = useActionState<ShotsForgetState, FormData>(forgetShots, null);
  const ready = note === '';
  const off = pending || !ready;
  const total = Math.max(totals.people, people.length);
  const shots = Math.max(totals.shots, people.reduce((n, p) => n + p.shots, 0));
  const left = pendingText(totals, ready);
  const more = peopleNote(people.length, total);
  return (
    <div className="stack">
      {note ? <p className="note-box">{note}</p> : null}
      <p role="status" className={state && !state.ok ? 'warn' : 'small'} style={{ margin: 0 }}>
        {pending ? '지우는 중이에요.' : (state?.message ?? '')}
      </p>
      {left ? (
        <div className={styles.pending}>
          <p className="small" style={{ margin: 0 }}>{left}</p>
          <form action={action} className="inline-form">
            <input type="hidden" name="kind" value="clean" />
            <button className="btn btn-small" disabled={off}>지금 마저 지우기</button>
          </form>
        </div>
      ) : null}
      {total === 0 ? (
        <p className="muted" style={{ margin: 0 }}>지금 남아 있는 걷기 사진이 없어요.</p>
      ) : (
        <>
          <h3 className={styles.head}>행사마다</h3>
          {events.length ? (
            <ul className={styles.list}>
              {events.map((e) => (
                <li key={e.id} className={`record ${styles.row}`}>
                  <p className={styles.rowHead}>
                    <strong>{e.label}</strong>
                    <span className="small muted">손님 {e.people}명, 사진 {e.shots}장</span>
                  </p>
                  <ForgetForm kind="event" id={e.id} ask={forgetEventAsk(e)} action={action} off={off}>
                    이 행사로 들어온 손님 사진 모두 지우기
                  </ForgetForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>행사 초대 코드로 들어온 손님의 사진은 없어요.</p>
          )}
          <h3 className={styles.head}>
            사람마다 <span className="small muted">{total}명, 사진 {shots}장</span>
          </h3>
          {more ? <p className="small muted" style={{ margin: 0 }}>{more}</p> : null}
          <table className="plain">
            <thead>
              <tr><th>이름</th><th>행사</th><th>사진</th><th /></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.user}>
                  <td>
                    {personName(p)} <span className="badge">{p.role ? ROLE_LABEL[p.role] : '명단 밖'}</span>
                    {p.removed ? <span className="muted small"> (뺌)</span> : null}
                  </td>
                  <td>{p.eventLabel ?? ''}</td>
                  <td>{p.shots}장</td>
                  <td>
                    <ForgetForm kind="user" id={p.user} ask={forgetPersonAsk(p)} action={action} off={off}>
                      사진 모두 지우기
                    </ForgetForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ForgetForm({ kind, id, ask, action, off, children }: {
  kind: 'user' | 'event';
  id: string;
  ask: string;
  action: (formData: FormData) => void;
  off: boolean;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className="inline-form"
      onSubmit={(e) => {
        if (!window.confirm(ask)) e.preventDefault();
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-small" disabled={off}>{children}</button>
    </form>
  );
}
