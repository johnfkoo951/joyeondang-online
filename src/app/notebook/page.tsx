import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { saveProfile, withdrawMine } from '@/app/actions';
import { ClaimForm, ReceiptForm, RequestForm } from '@/components/JoinForms';
import { ROOMS, ROOM_BY_SLUG } from '@/content/rooms';
import { ROLE_LABEL, SCOPE_LABEL, canUse } from '@/lib/access';
import { DOLL_COLORS } from '@/content/dolls';
import { FLASH_COOKIE } from '@/lib/cookie-names';
import { createClient } from '@/lib/supabase/server';
import { getViewer, type Viewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '내 수첩' };

export default function NotebookPage() {
  return (
    <div className="wrap stack">
      <h1>내 수첩</h1>
      <Suspense fallback={<p className="muted">수첩을 펼치는 중이에요</p>}>
        <NotebookBody />
      </Suspense>
      <section className="stack" aria-labelledby="receipt">
        <h2 id="receipt">철회 번호로 거두기</h2>
        <p className="small muted">종이를 남길 때 받은 번호가 있으면 로그인하지 않아도 거둘 수 있어요.</p>
        <ReceiptForm />
      </section>
    </div>
  );
}

const FLASH_WORD: Record<string, string> = {
  guest: '확인됐어요. 어서 오세요.',
  family: '가족으로 들어왔어요.',
  admin: '집주인으로 들어왔어요.',
  visitor: '구글 계정으로 들어왔어요. 아직 명단에서 찾지 못해서 확인이 필요해요.',
  invite_invalid: '초대 코드를 쓸 수 없었어요. 기간이 지났거나 잘못 적었을 수 있어요.',
  invite_taken: '이 초대 코드는 이미 다른 계정과 이어져 있어요.',
  invite_already: '이 계정은 이미 다른 이름으로 들어와 있어요.',
};

async function NotebookBody() {
  const viewer = await getViewer();
  const flash = (await cookies()).get(FLASH_COOKIE)?.value;
  const flashLine = flash && FLASH_WORD[flash] ? <p className="card" role="status">{FLASH_WORD[flash]}</p> : null;

  if (!viewer.ready) {
    return <p className="note-box">수첩은 곧 열려요. 그동안 <Link href="/map">집을 둘러보세요</Link>.</p>;
  }
  if (!viewer.signedIn) {
    return (
      <div className="stack">
        <p className="lead">수첩에는 다녀간 방의 도장과 내가 남긴 종이가 모여요. 초대 명단에 계신 분만 쓸 수 있어요.</p>
        <Link className="btn btn-roof" href="/login?next=/notebook">들어가기</Link>
      </div>
    );
  }
  if (!canUse(viewer.role, 'stamps')) {
    return (
      <div className="stack">
        {flashLine}
        <p className="lead">구글 계정으로 들어오셨어요. 명단에서 아직 찾지 못해서 한 번만 확인할게요.</p>
        {viewer.pendingRequest ? (
          <p className="card">가족에게 확인을 부탁해 두었어요. 확인되면 이 화면에서 바로 이어져요.</p>
        ) : (
          <>
            <h2>초대 코드가 있으면</h2>
            <ClaimForm />
            <h2>코드가 없으면</h2>
            <RequestForm />
          </>
        )}
        <SignOut />
      </div>
    );
  }
  return (
    <div className="stack">
      {flashLine}
      <p className="lead">
        {viewer.name ?? '손님'} 님 · {ROLE_LABEL[viewer.role]}
        {viewer.role === 'admin' ? (
          <>
            {' '}· <Link href="/admin">승인함</Link>
          </>
        ) : null}
      </p>
      <QuickStart admin={viewer.role === 'admin'} />
      <NameTag viewer={viewer} />
      <Stamps />
      <MyRecords />
      <SignOut />
    </div>
  );
}

// 들어오자마자 할 수 있는 것: 실제 집 걷기, 첫 쪽지, 도장, (집주인) 승인함
function QuickStart({ admin }: { admin: boolean }) {
  return (
    <section className="card stack" aria-labelledby="quick">
      <h2 id="quick" style={{ marginTop: 0 }}>바로 하기</h2>
      <div className="btn-row">
        <Link className="btn btn-roof" href="/walk">집 안 걷기</Link>
        <Link className="btn btn-pine" href="/room/pine">소나무에 첫 쪽지 남기기</Link>
        <Link className="btn" href="/map">도장 받으러 집 지도</Link>
        <Link className="btn" href="/gallery">내 갤러리</Link>
        <Link className="btn" href="/avatar">내 캐릭터 만들기</Link>
        {admin ? <Link className="btn" href="/admin">승인함</Link> : null}
      </div>
      <p className="small muted">집 안 걷기는 실제 집 크기 그대로예요. 방이나 물건 가까이 가면 「살피기」가 떠요.</p>
    </section>
  );
}

const DOLLS = ['doll-1', 'doll-2', 'doll-3', 'doll-4', 'doll-5', 'doll-6'];
const COLORS = DOLL_COLORS;

function NameTag({ viewer }: { viewer: Viewer }) {
  return (
    <section className="card stack" aria-labelledby="tag">
      <h2 id="tag" style={{ marginTop: 0 }}>이름표와 종이 인형</h2>
      <form action={saveProfile} className="stack">
        <div className="field">
          <label htmlFor="nickname">이름표에 쓸 이름</label>
          <input id="nickname" name="nickname" type="text" maxLength={20} defaultValue={viewer.name ?? ''} />
        </div>
        <fieldset>
          <legend>사진</legend>
          <label className="choice"><input type="radio" name="photo_ok" value="yes" /> <span>사진에 나와도 괜찮아요</span></label>
          <label className="choice"><input type="radio" name="photo_ok" value="no" /> <span>사진에 나오고 싶지 않아요</span></label>
        </fieldset>
        <fieldset>
          <legend>종이 인형 고르기 <span className="small muted">(그림은 준비 중이에요)</span></legend>
          <div className="dolls">
            {DOLLS.map((d, i) => (
              <label key={d} className="doll-pick">
                <input type="radio" name="doll" value={d} defaultChecked={viewer.doll === d} />
                <span className="doll-figure" aria-hidden="true" />
                <span className="small">인형 {i + 1}</span>
              </label>
            ))}
          </div>
          <div className="swatches" style={{ marginTop: 12 }}>
            {COLORS.map((c) => (
              <label key={c.id} className="swatch" style={{ ['--swatch' as string]: c.css }}>
                <input type="radio" name="doll_color" value={c.id} defaultChecked={viewer.dollColor === c.id} />
                <span aria-hidden="true" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-pine">이름표 저장</button>
      </form>
    </section>
  );
}

async function Stamps() {
  const supabase = await createClient();
  const { data } = await supabase.from('stamps').select('item, earned_at');
  const have = new Set((data ?? []).map((s) => String(s.item)));
  const open = ROOMS.filter((r) => r.door === 'open');
  return (
    <section className="stack" aria-labelledby="stamps">
      <h2 id="stamps">도장 카드</h2>
      <div className="rooms">
        {open.map((r) => (
          <Link key={r.slug} href={`/room/${r.slug}`} className="room-card" data-door={have.has(`room:${r.slug}`) ? 'open' : 'resting'}>
            <span className="name">{r.name}</span>
            <span className={have.has(`room:${r.slug}`) ? 'stamp-mark' : 'small muted'}>
              {have.has(`room:${r.slug}`) ? '도장 받음' : '빈칸'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

type MyRecord = {
  id: string; room_slug: string; body: string; requested_visibility: keyof typeof SCOPE_LABEL;
  visibility: keyof typeof SCOPE_LABEL; status: string; created_at: string;
};
const STATUS_WORD: Record<string, string> = {
  submitted: '봉투에 담김', approved: '걸림', hidden: '내 수첩에만', rejected: '내 수첩에만', sealed: '봉인',
};

async function MyRecords() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_records');
  const rows = (data ?? []) as MyRecord[];
  return (
    <section className="stack" aria-labelledby="mine">
      <h2 id="mine">내가 남긴 종이</h2>
      {!rows.length ? <p className="muted">아직 남긴 종이가 없어요. <Link href="/room/pine">앞마당 소나무</Link>부터 가 볼까요?</p> : null}
      <div className="records">
        {rows.map((r) => (
          <article key={r.id} className="record" data-status={r.status}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
            <div className="meta">
              <span>{ROOM_BY_SLUG.get(r.room_slug)?.name ?? r.room_slug}</span>
              <span className="badge">{STATUS_WORD[r.status] ?? r.status}</span>
              <span className="badge">{SCOPE_LABEL[r.visibility]}</span>
              <form action={withdrawMine} className="inline-form">
                <input type="hidden" name="id" value={r.id} />
                <button className="btn btn-small">거두기</button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="btn btn-small">나가기</button>
    </form>
  );
}
