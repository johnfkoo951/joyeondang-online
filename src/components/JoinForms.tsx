'use client';
import { useActionState } from 'react';
import { claimCode, requestEntry, withdrawByReceipt, type JoinState } from '@/app/actions';

export function ClaimForm({ initialCode = '' }: { initialCode?: string }) {
  const [state, action, pending] = useActionState<JoinState | null, FormData>(claimCode, null);
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="code">초대 코드</label>
        <input id="code" name="code" type="text" defaultValue={initialCode} autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX" />
      </div>
      {state ? <p className={state.ok ? '' : 'warn'} role="status">{state.message}</p> : null}
      <button className="btn btn-roof" disabled={pending}>{pending ? '확인하는 중' : '초대장 잇기'}</button>
    </form>
  );
}

export function RequestForm() {
  const [state, action, pending] = useActionState<JoinState | null, FormData>(requestEntry, null);
  if (state?.ok) return <p className="card" role="status">{state.message}</p>;
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="name">가족이 알아볼 이름</label>
        <input id="name" name="name" type="text" maxLength={40} required placeholder="청첩장을 받은 이름" />
      </div>
      <div className="field">
        <label htmlFor="message">한 줄 (선택)</label>
        <input id="message" name="message" type="text" maxLength={200} placeholder="예: 집주인 대학 친구예요" />
      </div>
      {state && !state.ok ? <p className="warn" role="alert">{state.message}</p> : null}
      <button className="btn" disabled={pending}>{pending ? '보내는 중' : '가족에게 확인 부탁하기'}</button>
    </form>
  );
}

export function ReceiptForm() {
  const [state, action, pending] = useActionState<JoinState | null, FormData>(withdrawByReceipt, null);
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="receipt">철회 번호</label>
        <input id="receipt" name="receipt" type="text" autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX" />
      </div>
      {state ? <p className={state.ok ? '' : 'warn'} role="status">{state.message}</p> : null}
      <button className="btn" disabled={pending}>{pending ? '거두는 중' : '이 번호의 종이 거두기'}</button>
    </form>
  );
}
