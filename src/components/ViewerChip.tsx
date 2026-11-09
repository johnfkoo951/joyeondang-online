import Link from 'next/link';
import { ROLE_LABEL } from '@/lib/access';
import { getViewer } from '@/lib/viewer';

export async function ViewerChip() {
  const v = await getViewer();
  if (!v.signedIn) {
    return (
      <Link className="chip" href="/login">
        들어가기
      </Link>
    );
  }
  return (
    <>
      {v.role === 'admin' ? (
        <Link className="chip" href="/admin" title="쪽지 승인, 명단, 초대 코드">
          승인함
        </Link>
      ) : null}
      <Link className="chip" href="/notebook" title={ROLE_LABEL[v.role]}>
        {v.name ?? ROLE_LABEL[v.role]}
      </Link>
    </>
  );
}
