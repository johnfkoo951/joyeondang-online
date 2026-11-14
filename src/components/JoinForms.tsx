'use client';
import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { claimCode, requestEntry, withdrawByReceipt, type JoinState } from '@/app/actions';
import { ActionMessage } from '@/components/ActionMessage';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';

// 들어오는 폼들. 서버 액션은 한국어 말을 돌려주고, 화면이 영어면 아는 말은 영어로 보인다(components/ActionMessage).
// 단추·이름표 글은 <T>로 두 말을 함께 싣고, 자리 글(placeholder)은 useTr로 고른다.
export function ClaimForm({ initialCode = '', submitLabel }: { initialCode?: string; submitLabel?: ReactNode }) {
  const [state, action, pending] = useActionState<JoinState | null, FormData>(claimCode, null);
  // 들어왔으면 바로 걷기로(화면이 새로 그려지기 전에도 갈 길이 보이게)
  if (state?.ok) {
    return (
      <div className="stack">
        <p className="card" role="status"><ActionMessage text={state.message} /></p>
        <div className="btn-row">
          <Link className="btn btn-roof" href="/walk"><T ko="집 안 걷기" en="Walk the house" /></Link>
          <Link className="btn" href="/notebook"><T ko="내 수첩" en="My notebook" /></Link>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="code"><T ko="초대 코드" en="Invite code" /></label>
        {/* 휴대폰은 마지막에 쓴 자판(대개 한글)이 올라온다: 영문 칸임을 알리고 자동 고침을 끈다 */}
        <input
          id="code" name="code" type="text" defaultValue={initialCode} autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX"
          lang="en" inputMode="text" spellCheck={false} autoCorrect="off" aria-describedby="code-hint"
        />
        <p id="code-hint" className="small"><T ko="영문과 숫자 12자리예요." en="12 letters and numbers." /></p>
      </div>
      {state ? <p className="warn" role="status"><ActionMessage text={state.message} /></p> : null}
      <button className="btn btn-roof" disabled={pending}>
        {pending ? <T ko="확인하는 중" en="Checking" /> : (submitLabel ?? <T ko="초대장 잇기" en="Link this invitation" />)}
      </button>
    </form>
  );
}

export function RequestForm() {
  const t = useTr();
  const [state, action, pending] = useActionState<JoinState | null, FormData>(requestEntry, null);
  if (state?.ok) return <p className="card" role="status"><ActionMessage text={state.message} /></p>;
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="name"><T ko="가족이 알아볼 이름" en="A name the family will recognize" /></label>
        <input id="name" name="name" type="text" maxLength={40} required placeholder={t('청첩장을 받은 이름', 'The name on your wedding invitation')} />
      </div>
      <div className="field">
        <label htmlFor="message"><T ko="한 줄 (선택)" en="One line (optional)" /></label>
        <input id="message" name="message" type="text" maxLength={200} placeholder={t('예: 집주인 대학 친구예요', "e.g. I'm the host's college friend")} />
      </div>
      {state && !state.ok ? <p className="warn" role="alert"><ActionMessage text={state.message} /></p> : null}
      <button className="btn" disabled={pending}>
        {pending ? <T ko="보내는 중" en="Sending" /> : <T ko="가족에게 확인 부탁하기" en="Ask the family to check" />}
      </button>
    </form>
  );
}

export function ReceiptForm() {
  const [state, action, pending] = useActionState<JoinState | null, FormData>(withdrawByReceipt, null);
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="receipt"><T ko="철회 번호" en="Removal code" /></label>
        <input
          id="receipt" name="receipt" type="text" autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX"
          lang="en" inputMode="text" spellCheck={false} autoCorrect="off" aria-describedby="receipt-hint"
        />
        <p id="receipt-hint" className="small"><T ko="영문과 숫자 12자리예요." en="12 letters and numbers." /></p>
      </div>
      {state ? <p className={state.ok ? '' : 'warn'} role="status"><ActionMessage text={state.message} /></p> : null}
      <button className="btn" disabled={pending}>
        {pending ? <T ko="거두는 중" en="Removing" /> : <T ko="이 번호의 종이 거두기" en="Remove the note with this code" />}
      </button>
    </form>
  );
}

/** 로그인 화면의 초대 코드 칸(선택). 자리 글이 화면 말을 따르게 화면 쪽에서 그린다(app/login/page.tsx) */
export function LoginInviteField() {
  const t = useTr();
  return (
    <div className="field">
      <label htmlFor="invite-code"><T ko="초대 코드 (선택 · 있으시면 미리 적어 주세요)" en="Invite code (optional, enter it now if you have one)" /></label>
      <input
        id="invite-code"
        name="invite"
        type="text"
        autoComplete="off"
        placeholder={t('코드 없이 명단 이메일로만 들어가실 분은 비워 두세요', 'Leave this empty to sign in with your listed email only')}
      />
    </div>
  );
}
