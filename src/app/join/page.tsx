import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { signInWithGoogle } from '@/app/actions';
import { ClaimForm } from '@/components/JoinForms';
import { InAppBanner } from '@/components/InAppBanner';
import { T } from '@/components/i18n/T';
import { canUse } from '@/lib/access';
import { normalizeCode } from '@/lib/code';
import { FLASH_COOKIE } from '@/lib/cookie-names';
import { SITE_URL, supabaseReady } from '@/lib/env';
import { FLASH_WORD, FLASH_WORD_EN, asEventPeek, type EventPeek } from '@/lib/event-code';
import { detectInApp } from '@/lib/inapp';
import { nameLang } from '@/lib/name-lang';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '초대장 열기' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// 카톡으로 받은 초대 링크(/join?c=XXXX-XXXX-XXXX)와 행사 화면의 QR이 닿는 곳.
// 코드는 주소에 실려 있어서 Safari·Chrome으로 옮겨 열어도 그대로 따라간다.
// 사람별 초대 링크가 먼저고, 아니면 행사 초대 코드(0018)로 받는다(판정은 DB, 순서는 src/lib/event-code.ts).
/** 행사 코드로 들어올 때 이름 안내(로그인 전·후 모두 같은 말) */
const EVENT_NAME_NOTE = '구글 계정 이름을 이름표로 써요. 들어온 뒤 수첩에서 바꿀 수 있고, 바꾸면 그 뒤에 쓰는 글부터 새 이름으로 보여요.';
const EVENT_NAME_NOTE_EN = 'Your Google account name becomes your name tag. You can change it in your notebook after you come in, and anything you write after that shows the new name.';

/** 행사 이름표(행사를 연 분이 지은 글이라 옮기지 않는다) */
function EventName({ label }: { label: string }) {
  return <span lang={nameLang(label)}>{label}</span>;
}

export default function JoinPage({ searchParams }: Props) {
  return (
    <div className="wrap stack">
      <h1><T ko="초대장 열기" en="Open your invitation" /></h1>
      <Suspense fallback={<p className="muted"><T ko="초대장을 펼치는 중이에요" en="Opening your invitation" /></p>}>
        <JoinBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function JoinBody({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = typeof sp.c === 'string' ? sp.c : '';
  const code = normalizeCode(raw).slice(0, 24);
  const ua = (await headers()).get('user-agent') ?? '';
  const kind = detectInApp(ua);
  const viewer = await getViewer();

  if (!code) {
    return (
      <p className="lead">
        <T
          ko={<>초대 링크를 다시 눌러 주세요. 코드만 받으셨다면 <Link href="/notebook">수첩</Link>에서 넣을 수 있어요.</>}
          en={<>Please tap the invite link again. If you only got a code, you can enter it in your <Link href="/notebook">notebook</Link>.</>}
        />
      </p>
    );
  }
  if (!supabaseReady()) {
    return (
      <p className="note-box">
        <T
          ko={<>들어가는 문은 곧 열려요. 그동안 <Link href="/map">집을 둘러보세요</Link>.</>}
          en={<>The door opens soon. Meanwhile, <Link href="/map">look around the house</Link>.</>}
        />
      </p>
    );
  }

  // 행사 초대 코드면 무슨 자리의 초대인지, 끝났거나 다 찼는지를 로그인 전에 알려 준다(로그인하고 나서야 알지 않게)
  const event = await peekEvent(code);
  // 로그인 직후 결과(들어왔는지, 왜 못 들어왔는지). 「명단에서 아직 못 찾음」은 이 화면 자체가 그 답이라 보이지 않는다
  const flash = (await cookies()).get(FLASH_COOKIE)?.value;
  const flashLine = flash && flash !== 'visitor' && FLASH_WORD[flash]
    ? <p className="card" role="status"><T ko={FLASH_WORD[flash]} en={FLASH_WORD_EN[flash] ?? <span lang="ko">{FLASH_WORD[flash]}</span>} /></p>
    : null;

  // 이미 들어와 있으면(방금 들어왔거나 원래 명단에 있던 분) 바로 걷기로
  if (viewer.signedIn && canUse(viewer.role, 'stamps')) {
    return (
      <div className="stack">
        {flashLine}
        <p className="lead">
          <T
            ko={`${viewer.name ?? '손님'} 님으로 들어와 계세요.`}
            en={<>You&apos;re in as <span lang={nameLang(viewer.name)}>{viewer.name ?? 'Guest'}</span>.</>}
          />
        </p>
        {/* 집 안 걷기 단추: 말마다 하나씩 두고 CSS가 고른 말의 단추만 보인다 */}
        <div className="btn-row">
          <Link data-ko="" className="btn btn-roof" href="/walk">집 안 걷기</Link>
          <Link data-en="" lang="en" className="btn btn-roof" href="/walk">Walk the house</Link>
          <Link className="btn" href="/notebook"><T ko="내 수첩" en="My notebook" /></Link>
        </div>
        <p className="small muted">
          <T
            ko="집 안에서 쪽지를 남기고 도장을 모아요. 이름표는 수첩에서 바꿀 수 있어요."
            en="Leave notes and collect stamps inside the house. You can change your name tag in your notebook."
          />
        </p>
      </div>
    );
  }
  if (event && event.state !== 'open') {
    return (
      <div className="stack">
        {flashLine}
        <EventClosed event={event} signedIn={viewer.signedIn} />
      </div>
    );
  }
  if (viewer.signedIn) {
    return (
      <div className="stack">
        {flashLine}
        {event ? (
          <p className="lead">
            <T
              ko={`「${event.label}」 초대장이에요. 지금 구글 계정으로 들어가요.`}
              en={<>This is the invitation for &ldquo;<EventName label={event.label} />&rdquo;. You&apos;ll come in with your Google account now.</>}
            />
          </p>
        ) : (
          <p className="lead">
            <T
              ko="구글 계정으로 들어와 계세요. 이 초대장을 지금 계정에 이을게요."
              en="You're signed in with your Google account. We'll link this invitation to it now."
            />
          </p>
        )}
        <ClaimForm
          initialCode={code}
          submitLabel={event ? <T ko="들어가기" en="Come in" /> : <T ko="초대장 잇기" en="Link this invitation" />}
        />
        {event ? <p className="small muted"><T ko={EVENT_NAME_NOTE} en={EVENT_NAME_NOTE_EN} /></p> : null}
      </div>
    );
  }
  if (kind) {
    return (
      <div className="stack">
        {event ? (
          <p className="lead">
            <T ko={`「${event.label}」 초대장이에요.`} en={<>This is the invitation for &ldquo;<EventName label={event.label} />&rdquo;.</>} />
          </p>
        ) : null}
        <InAppBanner kind={kind} href={`${SITE_URL}/join?c=${encodeURIComponent(code)}`} ua={ua} />
      </div>
    );
  }
  if (event) {
    // 행사 코드로 들어온 분은 구글에서 돌아오면 이 화면으로 와서 「집 안 걷기」를 바로 누른다
    return (
      <form action={signInWithGoogle} className="stack">
        <p className="lead">
          <T
            ko={`「${event.label}」에 오신 분을 위한 초대장이에요. 구글 계정으로 들어오면 바로 집 안을 걸을 수 있어요.`}
            en={<>This invitation is for guests of &ldquo;<EventName label={event.label} />&rdquo;. Come in with your Google account and you can walk the house right away.</>}
          />
        </p>
        <input type="hidden" name="invite" value={code} />
        <input type="hidden" name="next" value={`/join?c=${code}`} />
        <button className="btn btn-roof"><T ko="Google 계정으로 들어가기" en="Come in with Google" /></button>
        <p className="small muted"><T ko={EVENT_NAME_NOTE} en={EVENT_NAME_NOTE_EN} /></p>
      </form>
    );
  }
  return (
    <form action={signInWithGoogle} className="stack">
      <p className="lead">
        <T
          ko="초대해 주셔서 고마워요. 구글 계정으로 들어오면 이 초대장이 그 계정과 이어져요."
          en="Thank you for being invited. When you come in with your Google account, this invitation is linked to that account."
        />
      </p>
      <input type="hidden" name="invite" value={code} />
      <input type="hidden" name="next" value="/notebook" />
      <button className="btn btn-roof"><T ko="Google 계정으로 들어가기" en="Come in with Google" /></button>
      <p className="small muted">
        <T
          ko="초대장 하나는 한 사람의 계정 하나와 이어져요. 가족 여러 분이 오시면 각자 받은 링크로 들어와 주세요."
          en="Each invitation links to one person's account. If several family members are coming, please each use the link you received."
        />
      </p>
    </form>
  );
}

/** 행사 초대 코드의 이름표와 상태. 사람별 초대 링크나 없는 코드면 null(0018을 올리기 전에도 null) */
async function peekEvent(code: string): Promise<EventPeek | null> {
  if (code.length < 8) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('event_code_peek', { p_code: code });
  return error ? null : asEventPeek(data);
}

function EventClosed({ event, signedIn }: { event: EventPeek; signedIn: boolean }) {
  return (
    <div className="stack">
      <p className="lead">
        <T
          ko={`「${event.label}」 초대 코드는 ${event.state === 'full' ? '자리가 다 찼어요' : '받는 시간이 끝났어요'}. 행사를 연 분께 알려 주세요.`}
          en={<>The invite code for &ldquo;<EventName label={event.label} />&rdquo; {event.state === 'full' ? 'is full' : 'has closed'}. Please let the event organizer know.</>}
        />
      </p>
      <div className="btn-row">
        <Link className="btn btn-roof" href="/walk"><T ko="구경하는 집 걷기" en="Walk as a visitor" /></Link>
        {signedIn ? <Link className="btn" href="/notebook"><T ko="가족에게 확인 부탁하기" en="Ask the family to check" /></Link> : null}
      </div>
      <p className="small muted">
        <T
          ko="구경은 로그인 없이 할 수 있어요. 다시 그린 집이라 실제 집과는 달라요."
          en="You can look around without signing in. The house is redrawn, so it differs from the real one."
        />
      </p>
    </div>
  );
}
