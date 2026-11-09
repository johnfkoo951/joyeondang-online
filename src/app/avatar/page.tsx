import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { canSee } from '@/lib/access';
import { MESSAGES, PER_USER_DAILY, decideQuota, readQuota } from '@/lib/avatar/rules';
import { avatarConfig, avatarReady } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';
import { AvatarCard, DeleteAllOriginals, type CardInfo } from './AvatarCard';
import { AvatarStudio } from './AvatarStudio';
import styles from './avatar.module.css';

export const metadata: Metadata = { title: '내 캐릭터 만들기', robots: { index: false, follow: false } };

export default function AvatarPage() {
  return (
    <div className="wrap stack">
      <h1>내 캐릭터 만들기</h1>
      <Suspense fallback={<p className="muted">캐릭터 방을 여는 중이에요</p>}>
        <AvatarBody />
      </Suspense>
    </div>
  );
}

type Row = {
  id: string;
  status: string;
  original_path: string | null;
  image_path: string | null;
  created_at: string;
};

const MADE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function AvatarBody() {
  const viewer = await getViewer();
  if (!viewer.ready) {
    return <p className="note-box">캐릭터 만들기는 곧 열려요. 그동안 <Link href="/map">집을 둘러보세요</Link>.</p>;
  }
  if (!viewer.signedIn) {
    return (
      <div className="stack">
        <p className="lead">내 사진으로 조연당을 함께 걷는 꼬마 캐릭터를 만들어요. 초대 명단에 계신 분만 쓸 수 있어요.</p>
        <Link className="btn btn-roof" href="/login?next=/avatar">들어가기</Link>
      </div>
    );
  }
  if (!canSee(viewer.role, 'guests')) {
    return (
      <div className="stack">
        <p className="lead">{MESSAGES.notGuest}</p>
        <Link className="btn" href="/notebook">수첩에서 들어오는 길 확인하기</Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: rows }, { data: quotaRaw, error: quotaError }, { data: claims }] = await Promise.all([
    supabase
      .from('avatars')
      .select('id, status, original_path, image_path, created_at')
      .in('status', ['ready', 'deleted'])
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.rpc('avatar_quota'),
    supabase.auth.getClaims(),
  ]);
  const uid = claims?.claims?.sub;
  const { data: profile } = uid
    ? await supabase.from('profiles').select('avatar_id').eq('user_id', uid).maybeSingle()
    : { data: null };
  const activeId = (profile as { avatar_id?: string | null } | null)?.avatar_id ?? null;
  const cards: CardInfo[] = ((rows ?? []) as Row[])
    .filter((r) => r.image_path || r.original_path)
    .map((r) => ({
      id: r.id,
      hasImage: r.status === 'ready' && Boolean(r.image_path),
      hasOriginal: Boolean(r.original_path),
      active: r.id === activeId,
      made: MADE.format(new Date(r.created_at)),
    }));
  const originals = cards.filter((c) => c.hasOriginal).length;
  const decision = decideQuota(readQuota(quotaRaw), avatarConfig().totalCap);
  const left = decision.ok ? decision.left : 0;

  return (
    <div className="stack">
      <p className="lead">
        내 사진에서 옷 색깔과 머리 모양, 안경 같은 것만 골라 귀여운 꼬마 캐릭터로 그려요. 누구나 같은 귀여운 비율로
        그려지고, 다 그리면 집 안을 걸을 때 종이 인형 대신 이 캐릭터가 나와요.
      </p>

      {!avatarReady() || quotaError ? (
        <p className="note-box">{MESSAGES.notReady}</p>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            오늘 {PER_USER_DAILY}장 중 {left}장 남았어요.
          </p>
          {/* 장수가 다 차도 같은 자리에 둔다(방금 만든 그림이 새로고침 뒤에도 보이게) */}
          <AvatarStudio left={left} blocked={decision.ok ? null : decision.message} />
        </>
      )}

      <section className="stack" aria-labelledby="mine">
        <h2 id="mine">내 캐릭터</h2>
        {!cards.length ? <p className="muted">아직 만든 캐릭터가 없어요.</p> : null}
        <div className={styles.grid}>
          {cards.map((c) => (
            <AvatarCard key={c.id} card={c} />
          ))}
        </div>
        {originals > 1 ? <DeleteAllOriginals /> : null}
        <p className="small muted">
          원본 사진은 내가 지울 때까지 보관되고 나만 볼 수 있어요. 그림은 조연당 온라인에 들어온 초대 손님에게만 보여요.
          그림을 지워도 오늘 만든 장수는 그대로예요.
        </p>
      </section>
    </div>
  );
}
