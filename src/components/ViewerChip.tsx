import Link from 'next/link';
import { AccountPopover } from '@/components/AccountPopover';
import { LangLink } from '@/components/LangAttrs';
import { T } from '@/components/i18n/T';
import { ROLE_LABEL, ROLE_LABEL_EN, type Role } from '@/lib/access';
import { getViewer } from '@/lib/viewer';

export async function ViewerChip() {
  const v = await getViewer();
  if (!v.signedIn) return <LoginChip />;
  return <AccountMenu v={v} />;
}

/** 로그인 전 머리줄의 로그인 칩 */
export function LoginChip() {
  return (
    <LangLink className="chip chip-login" href="/login" title={['구글 계정 또는 초대 코드로 로그인', 'Sign in with Google or an invite code']}>
      <span className="login-dot" aria-hidden="true" />
      <T ko={<span>로그인</span>} en={<span>Sign in</span>} />
    </LangLink>
  );
}

/** 로그인한 사람의 계정 캡슐과 드롭다운(이름이 없으면 역할 이름) */
export function AccountMenu({ v }: { v: { name: string | null; role: Role } }) {
  return (
    <AccountPopover
      name={v.name}
      roleLabel={ROLE_LABEL[v.role]}
      roleLabelEn={ROLE_LABEL_EN[v.role]}
      isAdmin={v.role === 'admin'}
    >
      <div className="acct-group">
        <Link className="acct-item" href="/notebook"><T ko="내 수첩 · 도장 인장첩" en="My notebook and stamp book" /></Link>
        <Link className="acct-item" href="/avatar"><T ko="내 캐릭터 꾸미기" en="Dress up my character" /></Link>
        <Link className="acct-item" href="/gallery"><T ko="내 갤러리 · 사진첩" en="My gallery and album" /></Link>
      </div>

      {v.role === 'admin' ? (
        <div className="acct-group acct-admin-group">
          <span className="acct-group-label"><T ko="집주인 관리실" en="Host admin" /></span>
          <Link className="acct-item" href="/admin"><T ko="관리실 운영 허브" en="Admin hub" /></Link>
          <Link className="acct-item" href="/admin/members"><T ko="멤버 · 초대 관리" en="Members and invitations" /></Link>
          <Link className="acct-item" href="/admin/records"><T ko="글 · 방명록 관리" en="Posts and guestbook" /></Link>
          <Link className="acct-item" href="/admin/rooms"><T ko="공간 · 조용 모드 · QR" en="Rooms, quiet time and QR" /></Link>
          <Link className="acct-item" href="/admin/control"><T ko="3D 컨트롤 룸" en="3D control room" /></Link>
        </div>
      ) : null}
      {/* 캐릭터 관리 칩: 말마다 따로 두고 CSS가 하나만 보인다(title도 말을 따른다. 한국어 칩에는 lang="ko") */}
      {v.role === 'admin' ? (
        <Link className="chip" href="/admin/characters" data-ko="" lang="ko" title="사진 캐릭터의 그림과 3D를 지우거나 다시 만들기">
          캐릭터 관리
        </Link>
      ) : null}
      {v.role === 'admin' ? (
        <Link className="chip" href="/admin/characters" data-en="" lang="en" title="Delete or remake the pictures and 3D of photo characters">
          Manage characters
        </Link>
      ) : null}

      <div className="acct-foot">
        <form action="/auth/signout" method="post" className="acct-signout-form">
          <button type="submit" className="acct-logout-btn">
            <T ko="로그아웃" en="Sign out" />
          </button>
        </form>
      </div>
    </AccountPopover>
  );
}
