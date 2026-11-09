'use client';
import { useActionState } from 'react';
import { createInvite, type InviteState } from '@/app/admin/actions';
import { CopyLink } from '@/components/CopyLink';

export function InviteButton({ rosterId }: { rosterId: string }) {
  const [state, action, pending] = useActionState<InviteState | null, FormData>(createInvite, null);
  if (state?.ok && state.link) {
    return (
      <div className="stack">
        <code className="small" style={{ wordBreak: 'break-all' }}>{state.link}</code>
        <span className="small muted">이 화면을 닫으면 다시 볼 수 없어요. 카톡으로 이 사람에게만 보내 주세요.</span>
        <CopyLink href={state.link} />
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="roster_id" value={rosterId} />
      <button className="btn btn-small" disabled={pending}>{pending ? '만드는 중' : '초대 링크 만들기'}</button>
      {state && !state.ok ? <span className="warn small"> {state.message}</span> : null}
    </form>
  );
}
