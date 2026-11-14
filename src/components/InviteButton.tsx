'use client';
import { useActionState } from 'react';
import { createInvite, type InviteState } from '@/app/admin/actions';
import { CopyLink } from '@/components/CopyLink';
import { T } from '@/components/i18n/T';

// 관리 화면의 초대 링크 만들기. 화면 말은 두 말을 함께 싣는다. 관리 액션이 돌려주는 말은 한국어 그대로(lang="ko")
export function InviteButton({ rosterId }: { rosterId: string }) {
  const [state, action, pending] = useActionState<InviteState | null, FormData>(createInvite, null);
  if (state?.ok && state.link) {
    return (
      <div className="stack">
        <code className="small" style={{ wordBreak: 'break-all' }}>{state.link}</code>
        <span className="small muted">
          <T
            ko="이 화면을 닫으면 다시 볼 수 없어요. 카톡으로 이 사람에게만 보내 주세요."
            en="You can't see this again once you close the page. Send it only to this person, by KakaoTalk."
          />
        </span>
        <CopyLink href={state.link} />
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="roster_id" value={rosterId} />
      <button className="btn btn-small" disabled={pending}>{pending ? <T ko="만드는 중" en="Making" /> : <T ko="초대 링크 만들기" en="Make an invite link" />}</button>
      {state && !state.ok ? <span className="warn small" lang="ko"> {state.message}</span> : null}
    </form>
  );
}
