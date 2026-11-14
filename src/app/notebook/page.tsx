import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { saveProfile, withdrawMine } from '@/app/actions';
import { DocTitle } from '@/components/DocTitle';
import { T } from '@/components/i18n/T';
import { ClaimForm, ReceiptForm, RequestForm } from '@/components/JoinForms';
import { PhotoThumb } from '@/components/PhotoThumb';
import { CarvedSeal } from '@/components/stamp-map/CarvedSeal';
import { DOLL_COLORS, dollCss } from '@/content/dolls';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { ROLE_LABEL, SCOPE_LABEL, canUse } from '@/lib/access';
import { FLASH_COOKIE } from '@/lib/cookie-names';
import { FLASH_WORD, FLASH_WORD_EN } from '@/lib/event-code';
import { attachPhotos } from '@/lib/notes-media';
import { DOLL_COLOR_EN, DOLL_PRESETS, MINE_STATUS, ROLE_EN, SCOPE_EN, hangulLang } from '@/lib/page-words';
import { placeName } from '@/lib/place-names';
import { STAMP_SPOTS } from '@/lib/stamp-rally';
import { createClient } from '@/lib/supabase/server';
import { getViewer, type Viewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '내 수첩' };

// 화면 말은 한·영(<T>). 쓴 글과 이름은 옮기지 않는다(한글이 있으면 lang="ko").
export default function NotebookPage() {
  return (
    <div className="wrap stack">
      <DocTitle en="My notebook" />
      <h1><T ko="내 수첩" en="My notebook" /></h1>
      <Suspense fallback={<p className="muted"><T ko="수첩을 펼치는 중이에요" en="Opening your notebook" /></p>}>
        <NotebookBody />
      </Suspense>
      <section className="card stack" aria-labelledby="receipt">
        <h2 id="receipt" style={{ marginTop: 0 }}><T ko="철회 번호로 거두기" en="Take a note down with its removal code" /></h2>
        <p className="small muted" style={{ margin: 0 }}>
          <T
            ko="쪽지를 남길 때 받은 번호가 있으면 로그인하지 않아도 언제든 거둘 수 있어요."
            en="With the code you got when you left a note, you can take it down any time, even without signing in."
          />
        </p>
        <ReceiptForm />
      </section>
    </div>
  );
}

async function NotebookBody() {
  const viewer = await getViewer();
  const flash = (await cookies()).get(FLASH_COOKIE)?.value;
  // 돌아온 결과 한 줄(초대 코드 쪽 말): 영어 화면에서는 같은 열쇠의 영어(FLASH_WORD_EN), 영어가 없는 열쇠면 한국어 그대로 lang="ko"
  const flashLine = flash && FLASH_WORD[flash] ? (
    <p className="card" role="status">
      <T ko={FLASH_WORD[flash]} en={FLASH_WORD_EN[flash] ?? <span lang="ko">{FLASH_WORD[flash]}</span>} />
    </p>
  ) : null;

  if (!viewer.ready) {
    return (
      <p className="note-box">
        <T
          ko={<>수첩은 곧 열려요. 그동안 <Link href="/map">도장 투어 맵</Link>을 둘러보세요.</>}
          en={<>Your notebook opens soon. Meanwhile, have a look at the <Link href="/map">stamp tour map</Link>.</>}
        />
      </p>
    );
  }
  if (!viewer.signedIn) {
    return (
      <div className="card stack">
        <p className="lead" style={{ marginBottom: 0 }}>
          <T
            ko="수첩에는 다녀간 방의 정식 인장과 내가 남긴 방명록·쪽지가 모여요. 로그인 전에도 도장 투어 맵과 기본 3D 인형 꾸미기는 바로 체험해 보실 수 있어요!"
            en="Your notebook gathers the official seals from the rooms you visit and the guestbook entries and notes you leave. Even before signing in, you can try the stamp tour map and basic 3D doll dress-up right away!"
          />
        </p>
        <div className="btn-row">
          <Link className="btn btn-roof" href="/login?next=/notebook"><T ko="구글 계정으로 들어가기" en="Sign in with Google" /></Link>
          <Link className="btn" href="/map"><T ko="체험 도장 투어 해 보기" en="Try the stamp tour" /></Link>
          <Link className="btn" href="/avatar"><T ko="3D 인형 꾸미기" en="Dress up a 3D doll" /></Link>
        </div>
      </div>
    );
  }
  if (!canUse(viewer.role, 'stamps')) {
    return (
      <div className="stack">
        {flashLine}
        <p className="lead">
          <T
            ko="구글 계정으로 들어오셨어요. 명단에서 아직 찾지 못해서 한 번만 확인할게요."
            en="You’re signed in with Google. We haven’t found you on the guest list yet, so let’s check once."
          />
        </p>
        {viewer.pendingRequest ? (
          <p className="card">
            <T ko="가족에게 확인을 부탁해 두었어요. 확인되면 이 화면에서 바로 이어져요." en="We’ve asked the family to check. Once they confirm, you’ll go on right from here." />
          </p>
        ) : (
          <div className="card stack">
            <h2 style={{ marginTop: 0 }}><T ko="초대 코드가 있으면" en="If you have an invite code" /></h2>
            <p className="small muted" style={{ margin: 0 }}>
              <T
                ko="행사 초대 코드로 들어오면 구글 계정 이름을 이름표로 써요. 들어온 뒤 이름표에서 언제든 바꿀 수 있어요."
                en="If you come in with an event invite code, your Google account name goes on your name tag. You can change it on your name tag any time."
              />
            </p>
            <ClaimForm />
            <h2><T ko="코드가 없으면" en="If you don’t have a code" /></h2>
            <RequestForm />
          </div>
        )}
        <SignOut />
      </div>
    );
  }
  return (
    <div className="stack">
      {flashLine}
      <p className="lead" style={{ marginBottom: 4 }}>
        <strong lang={hangulLang(viewer.name)}>{viewer.name ?? <T ko="손님" en="Guest" />}</strong>
        <T ko=" 님 · " en=" · " />
        <T ko={ROLE_LABEL[viewer.role]} en={ROLE_EN[viewer.role]} />
        {viewer.role === 'admin' ? (
          <>
            {' '}· <Link href="/admin"><T ko="승인함" en="Approvals" /></Link>
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

function QuickStart({ admin }: { admin: boolean }) {
  return (
    <section className="card stack" aria-labelledby="quick">
      <h2 id="quick" style={{ marginTop: 0 }}><T ko="바로 가기" en="Quick links" /></h2>
      <div className="btn-row">
        <Link className="btn btn-roof" href="/walk"><T ko="3D 집 안 걷기" en="Walk the house in 3D" /></Link>
        <Link className="btn btn-pine" href="/map"><T ko="일러스트 도장 투어 맵" en="Stamp tour map" /></Link>
        <Link className="btn" href="/games"><T ko="작은 놀이 12종" en="12 mini games" /></Link>
        <Link className="btn" href="/guestbook"><T ko="방명록·문장 쓰기" en="Guestbook and sentences" /></Link>
        <Link className="btn" href="/avatar"><T ko="내 캐릭터 꾸미기" en="Dress up my character" /></Link>
        <Link className="btn" href="/gallery"><T ko="갤러리" en="Gallery" /></Link>
        {admin ? <Link className="btn" href="/admin"><T ko="승인함" en="Approvals" /></Link> : null}
      </div>
    </section>
  );
}

// 대표 인형 배지 이름은 lib/page-words의 DOLL_PRESETS(doll-1부터 차례대로, 한·영)
function NameTag({ viewer }: { viewer: Viewer }) {
  const tone = dollCss(viewer.dollColor);
  return (
    <section className="card stack" aria-labelledby="tag">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 id="tag" style={{ margin: 0 }}><T ko="이름표와 캐릭터 설정" en="Name tag and character" /></h2>
        <Link className="btn btn-small btn-pine" href="/avatar"><T ko="3D 인형·AI 사진 캐릭터 꾸미기 →" en="Dress up a 3D doll or AI photo character →" /></Link>
      </div>
      <form action={saveProfile} className="stack">
        <div className="field">
          <label htmlFor="nickname"><T ko="이름표에 쓸 이름" en="Name for your name tag" /></label>
          <input id="nickname" name="nickname" type="text" maxLength={20} defaultValue={viewer.name ?? ''} />
        </div>
        <fieldset>
          <legend><T ko="현장 사진 노출 선호" en="Photos at the event" /></legend>
          <label className="choice"><input type="radio" name="photo_ok" value="yes" /> <span><T ko="사진에 나와도 괜찮아요" en="I’m happy to be in photos" /></span></label>
          <label className="choice"><input type="radio" name="photo_ok" value="no" /> <span><T ko="사진에 나오고 싶지 않아요" en="I’d rather not be in photos" /></span></label>
        </fieldset>
        <fieldset>
          <legend><T ko="수첩 대표 인형 배지" en="Notebook doll badge" /></legend>
          <div className="dolls">
            {DOLL_PRESETS.map((label, i) => {
              const d = `doll-${i + 1}`;
              return (
                <label key={d} className="doll-pick">
                  <input type="radio" name="doll" value={d} defaultChecked={(viewer.doll ?? 'doll-1') === d} />
                  <span className="doll-badge-art" style={{ ['--swatch' as string]: tone }} aria-hidden="true">
                    <svg viewBox="0 0 64 80" width="48" height="60">
                      <circle cx="32" cy="24" r="13" fill="var(--paper)" stroke="currentColor" strokeWidth="2.5" />
                      <circle cx="27.5" cy="23" r="1.8" fill="currentColor" />
                      <circle cx="36.5" cy="23" r="1.8" fill="currentColor" />
                      <path d="M28 28.5c2.2 2 5.8 2 8 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M18 66c1-16 8-24 14-24s13 8 14 24Z" fill="var(--swatch)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="small"><T ko={label.ko} en={label.en} /></span>
                </label>
              );
            })}
          </div>
          <div className="swatches" style={{ marginTop: 12 }}>
            {DOLL_COLORS.map((c) => (
              <label key={c.id} className="swatch" style={{ ['--swatch' as string]: c.css }}>
                <input type="radio" name="doll_color" value={c.id} defaultChecked={viewer.dollColor === c.id} />
                <span aria-hidden="true" />
                <T ko={c.label} en={DOLL_COLOR_EN[c.id] ?? c.label} />
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <button className="btn btn-pine"><T ko="이름표 저장" en="Save name tag" /></button>
        </div>
      </form>
    </section>
  );
}

async function Stamps() {
  const supabase = await createClient();
  const { data } = await supabase.from('stamps').select('item, earned_at');
  const have = new Set((data ?? []).map((s) => String(s.item)));
  const stampedCount = STAMP_SPOTS.filter((s) => have.has(`room:${s.slug}`) || have.has(`qr:${s.slug}`)).length;

  return (
    <section className="card stack" aria-labelledby="stamps">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 id="stamps" style={{ margin: 0 }}>
          <T ko={`내 도장 인장첩 (${stampedCount} / ${STAMP_SPOTS.length})`} en={`My stamp book (${stampedCount} / ${STAMP_SPOTS.length})`} />
        </h2>
        <Link className="btn btn-roof btn-small" href="/map"><T ko="일러스트 도장 투어 맵 열기 →" en="Open the stamp tour map →" /></Link>
      </div>
      <div className="notebook-seals">
        {STAMP_SPOTS.map((spot) => {
          const got = have.has(`room:${spot.slug}`) || have.has(`qr:${spot.slug}`);
          return (
            <Link key={spot.slug} href={`/map?spot=${spot.slug}`} className="notebook-seal-item">
              <CarvedSeal
                label={spot.shortName}
                labelEn={spot.en.short}
                shape={spot.sealShape}
                motif={spot.motif}
                state={got ? 'stamped' : 'empty'}
                size={64}
                rot={spot.rot}
              />
              <span className="small" style={{ fontWeight: got ? 800 : 500 }}><T ko={spot.shortName} en={spot.en.short} /></span>
              {have.has(`qr:${spot.slug}`) ? <span className="stamp-mark"><T ko="현장 QR" en="On-site QR" /></span> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type MyRecord = {
  id: string; room_slug: string; body: string; requested_visibility: keyof typeof SCOPE_LABEL;
  visibility: keyof typeof SCOPE_LABEL; status: string; created_at: string; has_photo?: boolean;
};
// 상태 낱말은 lib/page-words의 MINE_STATUS(모르는 상태는 받은 값 그대로)

async function MyRecords() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_records');
  const rows = await attachPhotos((data ?? []) as MyRecord[]);
  return (
    <section className="stack" aria-labelledby="mine">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 id="mine" style={{ margin: 0 }}><T ko={`내가 남긴 글 (${rows.length})`} en={`What I wrote (${rows.length})`} /></h2>
        <Link className="btn btn-small" href="/guestbook"><T ko="새 방명록·문장 쓰기 →" en="Write a new note or sentence →" /></Link>
      </div>
      {!rows.length ? (
        <p className="note-box">
          <T
            ko={<>아직 남긴 글이 없어요. <Link href="/guestbook">방명록 스튜디오</Link>에서 첫 인사를 걸어 볼까요?</>}
            en={<>You haven’t written anything yet. How about hanging a first hello in the <Link href="/guestbook">guestbook studio</Link>?</>}
          />
        </p>
      ) : null}
      <div className="records">
        {rows.map((r) => (
          <article key={r.id} className="record" data-status={r.status}>
            {r.photo ? <PhotoThumb thumb={r.photo.thumb} view={r.photo.view} label="내가 붙인 사진" /> : null}
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }} lang={hangulLang(r.body)}>{r.body}</p>
            <div className="meta">
              <span><RoomName slug={r.room_slug} /></span>
              {r.has_photo ? <span className="badge"><T ko="사진은 가족에게만" en="Photo for family only" /></span> : null}
              <span className="badge">{MINE_STATUS[r.status] ? <T ko={MINE_STATUS[r.status].ko} en={MINE_STATUS[r.status].en} /> : r.status}</span>
              <span className="badge"><T ko={SCOPE_LABEL[r.visibility]} en={SCOPE_EN[r.visibility]} /></span>
              <form action={withdrawMine} className="inline-form">
                <input type="hidden" name="id" value={r.id} />
                <button className="btn btn-small"><T ko="거두기" en="Take down" /></button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** 기록이 걸린 방 이름(지금 말). 모르는 방은 받은 slug 그대로 */
function RoomName({ slug }: { slug: string }) {
  const name = ROOM_BY_SLUG.get(slug)?.name;
  return name ? <T ko={name} en={placeName('en', name)} /> : <>{slug}</>;
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="btn btn-small"><T ko="로그아웃" en="Sign out" /></button>
    </form>
  );
}
