'use client';
import { useActionState, useEffect, useState } from 'react';
import { createEventCode, readEventCount, revokeEventCode, type EventCodeState, type EventCount } from '@/app/admin/event-actions';
import { CopyLink } from '@/components/CopyLink';
import { EventQr, EventQrStage, askFullscreen } from '@/components/EventQr';
import {
  EVENT_HOURS, EVENT_HOURS_DEFAULT, EVENT_PEOPLE_DEFAULT, EVENT_PEOPLE_MAX, EVENT_STATE_LABEL, formatKst,
} from '@/lib/event-code';
import styles from './event-codes.module.css';

/** 만들기 칸과 방금 만든 코드(QR, 주소, 발표 화면에 크게). 코드 원문은 이 화면에만 있다 */
export function EventCodeMaker() {
  const [state, action, pending] = useActionState<EventCodeState | null, FormData>(createEventCode, null);
  const [stage, setStage] = useState(false);
  const made = state?.ok ? state : null;
  return (
    <div className="stack">
      <form action={action} className={styles.form}>
        <label className={styles.field}>
          <span>이름표</span>
          <input type="text" name="label" maxLength={40} placeholder="예: 11월 12일 발표" aria-describedby="event-label-hint" />
        </label>
        <label className={styles.field}>
          <span>받는 시간</span>
          <select name="hours" defaultValue={String(EVENT_HOURS_DEFAULT)}>
            {EVENT_HOURS.map((h) => <option key={h} value={h}>지금부터 {h}시간</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>최대 인원</span>
          <input type="number" name="people" min={1} max={EVENT_PEOPLE_MAX} step={1} defaultValue={EVENT_PEOPLE_DEFAULT} inputMode="numeric" />
        </label>
        <button className="btn btn-small btn-pine" disabled={pending}>{pending ? '만드는 중' : '코드 만들기'}</button>
      </form>
      <p id="event-label-hint" className="small muted" style={{ margin: 0 }}>이름표는 들어오는 화면에 「○○ 초대장이에요」로 보여요. 비우면 오늘 날짜로 적어요.</p>
      {state && !state.ok ? <p className="warn" role="alert">{state.message}</p> : null}
      {made ? (
        <div className={styles.made} role="status">
          <EventQr text={made.link} label={`${made.label} 초대 QR`} className={styles.madeQr} />
          <div className="stack" style={{ gap: 8, minWidth: 0 }}>
            <p style={{ margin: 0 }}>
              <strong>{made.label}</strong> · {formatKst(made.until)}까지 · 최대 {made.people}명
            </p>
            <p className={styles.code}>{made.code}</p>
            <p className="qr-url" style={{ margin: 0 }}>{made.link}</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-roof"
                onClick={() => {
                  askFullscreen();
                  setStage(true);
                }}
              >
                발표 화면에 크게 띄우기
              </button>
              <CopyLink href={made.link} />
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              코드는 이 화면에만 한 번 보여요(DB에는 알아볼 수 없게 바꾼 값만 남아요). 화면을 닫았다면 새로 만들고, 옛 코드는 아래에서 거두면 돼요.
            </p>
          </div>
        </div>
      ) : null}
      {made && stage ? (
        <EventQrStage
          link={made.link}
          code={made.code}
          label={made.label}
          extra={<LiveCount id={made.id} />}
          onClose={() => setStage(false)}
        />
      ) : null}
    </div>
  );
}

/** 발표 화면에 띄운 동안 들어온 수(10초마다 다시 읽는다. 화면이 숨겨져 있으면 쉰다) */
function LiveCount({ id }: { id: string }) {
  const [count, setCount] = useState<EventCount>(null);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      if (document.hidden) return;
      try {
        const next = await readEventCount(id);
        if (alive && next) setCount(next);
      } catch {
        // 연결이 잠깐 끊겨도 다음 차례에 다시 읽는다
      }
    };
    void read();
    const timer = window.setInterval(read, 10_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [id]);
  if (!count) return null;
  return (
    <p className={styles.live} aria-live="polite">
      들어온 분 {count.used}명 / 최대 {count.max}명{count.state !== 'open' ? ` · ${EVENT_STATE_LABEL[count.state]}` : ''}
    </p>
  );
}

/** 목록 한 줄의 거두기 단추들. 되돌릴 수 없으니 둘 다 한 번 더 묻는다(발표 중에 잘못 누르면 새 손님을 못 받는다) */
export function EventRevoke({ id, label, active, revoked }: { id: string; label: string; active: number; revoked: boolean }) {
  return (
    <div className="btn-row">
      {!revoked ? (
        <form
          action={revokeEventCode}
          className="inline-form"
          onSubmit={(e) => {
            if (!window.confirm(`「${label}」 코드를 거둘까요? 새로 들어오는 분을 더 받지 않아요(이미 들어온 분은 그대로). 되돌릴 수 없어요.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-small">코드 거두기</button>
        </form>
      ) : null}
      {active > 0 ? (
        <form
          action={revokeEventCode}
          className="inline-form"
          onSubmit={(e) => {
            if (!window.confirm(`「${label}」 코드로 들어온 ${active}명을 명단에서 뺄까요? 다음 화면부터 구경하는 분으로 돌아가요.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="people" value="1" />
          <button className="btn btn-small">들어온 {active}명도 명단에서 빼기</button>
        </form>
      ) : null}
    </div>
  );
}
