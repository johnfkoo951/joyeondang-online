/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { LangLink } from '@/components/LangAttrs';
import { T } from '@/components/i18n/T';
import { greetNameEn, type FrontWho } from '@/lib/front';
import { nameLang } from '@/lib/name-lang';
import s from './home.module.css';

/** 두 말을 나란히 둔 한 줄(영어 쪽은 이름처럼 옮기지 않는 글을 품을 수 있어 ReactNode) */
type Line = { ko: string; en: ReactNode };

// 첫 화면 2막: 테두리 상자 없이 왼쪽에는 오일파스텔 집 콜라주 포스터, 오른쪽에는 점선으로 나뉜 초대 안내와 알약 단추를 놓는다.
// 화면 말은 한국어·영어를 함께 싣고 CSS가 고른 말만 보인다(<T>). 손님 이름은 옮기지 않는다(한글이면 lang="ko")
export function FrontDoor({ who, inApp }: { who: FrontWho | null; inApp?: ReactNode }) {
  if (!who) {
    return (
      <PosterSpread eyebrow="JOYEONDANG ONLINE" title={[{ ko: '우리의 집에', en: 'Come visit' }, { ko: '놀러 오세요', en: 'our home' }]} lead={null}>
        <div className={s.posterBtns}>
          <WalkButton label={{ ko: '집 안 걷기', en: 'Walk the house' }} />
          <Link className={`btn ${s.outlinePill}`} href="/map"><T ko="도장 투어 맵" en="Stamp tour map" /></Link>
          <Link className={`btn ${s.outlinePill}`} href="/gallery"><T ko="화보 구경하기" en="See the lookbook" /></Link>
        </div>
      </PosterSpread>
    );
  }
  if (who.kind === 'guest') {
    const nameEn = greetNameEn(who.name);
    return (
      <PosterSpread
        eyebrow="WELCOME HOME"
        title={[
          { ko: `${who.name} 님,`, en: 'Welcome,' },
          { ko: '어서 오세요', en: <span lang={nameLang(nameEn)}>{nameEn}</span> },
        ]}
        lead={[
          { ko: '실제 크기로 지은 집을 함께 걸어요.', en: "Let's walk the life-size house together." },
          { ko: '방 가까이 가면 쪽지를 남기고 열세 곳 도장을 모아요.', en: 'Near a room, leave a note and collect stamps from 13 spots.' },
        ]}
      >
        <div className={s.posterBtns}>
          <WalkButton label={{ ko: '집 안 걷기', en: 'Walk the house' }} />
          <Link className={`btn ${s.outlinePill}`} href="/map"><T ko="도장 투어 맵" en="Stamp tour map" /></Link>
          <Link className={`btn ${s.outlinePill}`} href="/notebook"><T ko="내 수첩 열기" en="Open my notebook" /></Link>
        </div>
        <SignedInBar name={{ ko: who.name, en: <span lang={nameLang(nameEn)}>{nameEn}</span> }} />
      </PosterSpread>
    );
  }
  if (who.kind === 'visitor' && who.pending) {
    return (
      <PosterSpread
        eyebrow="CHECKING ROSTER"
        title={[{ ko: '가족이 명단을', en: 'The family is checking' }, { ko: '확인하고 있어요', en: 'the guest list' }]}
        lead={[
          { ko: '확인되면 이 화면에서 바로 집 안을 함께 걸을 수 있어요.', en: 'Once you are confirmed, you can walk the house together right from here.' },
          { ko: '그동안 그림으로 지은 집과 작은 놀이를 둘러보세요.', en: 'Meanwhile, look around the drawn house and the mini games.' },
        ]}
      >
        <div className={s.posterBtns}>
          <WalkButton label={{ ko: '구경하는 집 걷기', en: 'Walk as a visitor' }} />
          <Link className={`btn ${s.outlinePill}`} href="/notebook"><T ko="내 수첩 확인" en="Check my notebook" /></Link>
          <Link className={`btn ${s.outlinePill}`} href="/games"><T ko="작은 놀이" en="Mini games" /></Link>
        </div>
        <SignedInBar name={{ ko: '방문자', en: 'Visitor' }} />
      </PosterSpread>
    );
  }
  if (who.kind === 'visitor') {
    return (
      <PosterSpread
        eyebrow="INVITATION CODE"
        title={[{ ko: '명단에서 아직', en: "We couldn't find you" }, { ko: '찾지 못했어요', en: 'on the guest list yet' }]}
        lead={[
          { ko: '구글 계정으로 들어오셨어요.', en: 'You came in with your Google account.' },
          { ko: '초대 코드가 있으면 수첩에서 넣어 주세요.', en: 'If you have an invite code, enter it in your notebook.' },
          { ko: '코드가 없으면 가족에게 확인을 부탁할 수 있어요.', en: 'No code? You can ask the family to check.' },
        ]}
      >
        <div className={s.posterBtns}>
          <Link className={`btn btn-roof ${s.cta}`} href="/notebook"><T ko="수첩에서 들어오기" en="Come in from my notebook" /></Link>
          <Link className={`btn ${s.outlinePill}`} href="/walk"><T ko="구경하는 집 걷기" en="Walk as a visitor" /></Link>
        </div>
        <SignedInBar name={{ ko: '방문자', en: 'Visitor' }} />
      </PosterSpread>
    );
  }
  return (
    <PosterSpread
      eyebrow="JOYEONDANG ONLINE"
      title={[{ ko: '우리의 집에', en: 'Come visit' }, { ko: '놀러 오세요', en: 'our home' }]}
      lead={[
        { ko: '가족이 손님을 맞으려고 그림으로 지은 집이에요.', en: 'Our family drew this house to welcome guests.' },
        { ko: '휴대폰으로 누구나 집\u00a0안을 걸어 볼\u00a0수 있어요.', en: 'Anyone can walk through it on a phone.' },
      ]}
    >
      <div className={s.posterBtns}>
        <WalkButton label={{ ko: '집 안 걷기', en: 'Walk the house' }} />
        <Link className={`btn ${s.outlinePill}`} href="/map"><T ko="도장 투어 맵" en="Stamp tour map" /></Link>
        <Link className={`btn ${s.outlinePill}`} href="/gallery"><T ko="화보 구경하기" en="See the lookbook" /></Link>
      </div>
      {inApp ?? <Invite />}
    </PosterSpread>
  );
}

function PosterSpread({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: [Line, Line];
  lead: Line[] | null;
  children: ReactNode;
}) {
  return (
    <section className={s.door} aria-labelledby="front-door">
      <img src="/web/collage/edge-tl-v2.webp" alt="" aria-hidden="true" className={`${s.posterEdge} ${s.posterEdgeTl}`} />
      <img src="/web/collage/edge-tr-v2.webp" alt="" aria-hidden="true" className={`${s.posterEdge} ${s.posterEdgeTr}`} />
      <span className={`${s.edgeStrip} ${s.posterLeftStrip}`} aria-hidden="true" />
      <span className={`${s.edgeStrip} ${s.posterRightRibbon}`} aria-hidden="true" />
      <div className={s.doorInner}>
      {/* 왼쪽: 오일파스텔 컷아웃 집 콜라주와 필기체·파스텔 당호 조형. 링크 이름(aria-label)은 화면 말을 따른다(LangLink) */}
      <div className={s.posterArt}>
        <LangLink href="/walk" className={s.houseCollageLink} label={['조연당 3D 집 안으로 들어가기', 'Enter the Joyeondang house in 3D']}>
          <span className={s.handArrowNote} aria-hidden="true"><T ko="← 문 열고 들어가기" en="← Come on in" /></span>
          <img
            src="/web/collage/collage-house-poster-v2.webp"
            alt=""
            className={s.houseCollageImg}
          />
        </LangLink>
        <div className={s.posterSignature} aria-hidden="true">
          <div className={s.scriptRow}>
            <span className={s.scriptWord}>Joyeondang</span>
            <span className={s.scriptMeta}>
              walk &amp; explore<br />
              play · write · connect
            </span>
          </div>
          <div className={s.pastelHangul}>
            <span className={s.cPink}>조</span>
            <span className={s.cGreen}>연</span>
            <span className={s.cSky}>당</span>
          </div>
        </div>
      </div>

      {/* 오른쪽: 상자 없는 점선 인덱스 표와 미니멀 알약 단추 */}
      <div className={s.posterBody}>
        <div className={s.doorText}>
          <p className={s.eyebrow}>{eyebrow}</p>
          <h2 id="front-door" className={s.greet}>
            <T ko={title[0].ko} en={title[0].en} /><br /><T ko={title[1].ko} en={title[1].en} />
          </h2>
          {lead ? (
            <p className={s.lead}>
              {lead.map((t, i) => (
                <Fragment key={t.ko}>
                  {i ? ' ' : null}
                  <span className={s.sentence}><T ko={t.ko} en={t.en} /></span>
                </Fragment>
              ))}
            </p>
          ) : (
            <p className={`${s.lead} ${s.leadPending}`} aria-hidden="true" />
          )}
        </div>

        <dl className={s.dashedList}>
          <div className={s.dashedRow}>
            <dt className={s.dashedKey}><T ko="산책" en="Walk" /></dt>
            <dd className={s.dashedVal}>
              <T
                ko={<>3D로 마당과 1·2층을 거닐고<br />열세 곳 전각 도장을 그림 지도에 찍어요</>}
                en={<>Stroll the yard, 1F and 2F in 3D<br />and stamp 13 carved seals on the picture map</>}
              />
            </dd>
          </div>
          <div className={s.dashedRow}>
            <dt className={s.dashedKey}><T ko="놀이" en="Play" /></dt>
            <dd className={s.dashedVal}>
              <T
                ko={<>박공 아래 리듬 잼부터 과녁 맞히기,<br />생각 서랍과 문장 걸기까지 12가지 작은 놀이</>}
                en={<>From the rhythm jam under the gable to target toss,<br />mind drawers and hanging sentences: 12 mini games</>}
              />
            </dd>
          </div>
          <div className={s.dashedRow}>
            <dt className={s.dashedKey}><T ko="함께" en="Share" /></dt>
            <dd className={s.dashedVal}>
              {/* 영어 이름표는 한국어(세 글자)보다 길어 칸을 넓힌다(영어 쪽에만) */}
              <ul className={s.timeLikeList}>
                <li><T ko={<><b>방명록</b>거실 인사와 소나무 소원 쪽지</>} en={<><b style={EN_TAG}>Guestbook</b>Living room greetings and pine tree wishes</>} /></li>
                <li><T ko={<><b>캐릭터</b>나만의 3D 인형 옷장과 AI 아바타</>} en={<><b style={EN_TAG}>Character</b>Your own 3D doll wardrobe and AI avatar</>} /></li>
                <li><T ko={<><b>전시실</b>집과 다섯 사람의 일곱 칸 이야기</>} en={<><b style={EN_TAG}>Exhibit</b>Seven parts on the house and five people</>} /></li>
              </ul>
            </dd>
          </div>
        </dl>

        {children}
        </div>
      </div>
    </section>
  );
}

function WalkButton({ label }: { label: Line }) {
  return (
    <Link className={`btn btn-roof ${s.cta}`} href="/walk" aria-keyshortcuts="G">
      <span><T ko={label.ko} en={label.en} /></span>
    </Link>
  );
}

function Invite() {
  return (
    <p className={s.invite}>
      <span><T ko="초대장을 받으셨나요?" en="Got an invitation?" /></span>
      <Link className={`btn ${s.inviteBtn}`} href="/login"><T ko="Google 로그인" en="Sign in with Google" /></Link>
    </p>
  );
}

const EN_TAG = { width: '6em' } as const;

function SignedInBar({ name }: { name: Line }) {
  // 한국어는 예전처럼 이름과 말이 따로 놓인다(칸 사이 간격이 그대로). 영어는 한 덩이
  return (
    <div className={s.signedRow}>
      <span className={s.signedLabel}>
        <span className={s.signedDot} aria-hidden="true" />
        <strong data-ko="">{name.ko}</strong>
        <span data-ko=""> 님으로 로그인됨</span>
        <span data-en="" lang="en">Signed in as <strong>{name.en}</strong></span>
      </span>
      <form action="/auth/signout" method="post" className="inline-form">
        <button type="submit" className={`btn ${s.inviteBtn}`}><T ko="로그아웃" en="Sign out" /></button>
      </form>
    </div>
  );
}
