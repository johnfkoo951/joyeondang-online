import Link from 'next/link';
import { T } from '@/components/i18n/T';
import { StampSeal } from '@/components/stamp/Stamp';
import { placeEn } from '@/lib/place-names';
import { QR_STAMP_WORDS, qrStampTitle, type QrStampOutcome } from '@/lib/qr';

// 현장 도장 화면(/q/방/코드)의 카드들. 판정은 화면(app/q/[room]/[code]/page.tsx)이 하고 여기서는 그리기만 한다.
// 화면 말은 한국어·영어를 함께 싣는다(<T>). 결과 말은 lib/qr.ts의 QR_STAMP_WORDS, 방 이름의 영어는 장소 이름 표(lib/place-names).
// 도장 그림(StampSeal)은 그림이라(aria-hidden) 한국어 그대로 둔다.

type RoomLike = { slug: string; name: string };

/** 방 이름(한국어·영어). 영어 이름을 모르면 한국어 그대로 lang="ko" */
export function RoomName({ name }: { name: string }) {
  const en = placeEn(name);
  return <T ko={name} en={en === name ? <span lang="ko">{name}</span> : en} />;
}

/** 현장 도장이 아직 열리지 않았을 때(로그인 서버 준비 전) */
export function QrNotReady({ room }: { room: RoomLike }) {
  return (
    <p className="note-box">
      <T
        ko={<>현장 도장은 곧 열려요. 그동안 <Link href={`/room/${room.slug}`}>{room.name}</Link> 화면을 둘러보세요.</>}
        en={<>On-site stamps open soon. Meanwhile, look around the <Link href={`/room/${room.slug}`}><RoomName name={room.name} /></Link> page.</>}
      />
    </p>
  );
}

/** 로그인 전: 들어가서 도장 받기. back은 로그인 뒤 돌아올 이 표식의 주소 */
export function QrSignInCard({ room, back }: { room: RoomLike; back: string }) {
  return (
    <section className="card qr-stamp-card" aria-labelledby="qr-title">
      <StampSeal name={room.name} state="off" caption="현장 도장" />
      <h1 id="qr-title">
        <T ko={`${room.name} 현장 도장`} en={<>On-site stamp: <RoomName name={room.name} /></>} />
      </h1>
      <p>
        <T
          ko="QR은 입장권이 아니라 도장 표식이에요. 초대 명단에 계신 분이 들어오면 이 방 도장이 수첩에 찍혀요."
          en="This QR is not a ticket but a stamp mark. When someone on the guest list comes in, this room's stamp lands in their notebook."
        />
      </p>
      <div className="btn-row">
        <Link className="btn btn-roof" href={`/login?next=${encodeURIComponent(back)}`}><T ko="들어가서 도장 받기" en="Sign in and get the stamp" /></Link>
        <Link className="btn" href={`/room/${room.slug}`}><T ko="구경만 할게요" en="Just looking" /></Link>
      </div>
      <p className="small muted">
        <T ko="위치는 묻지 않아요. 표식이 어느 방 것인지만 봐요." en="We don't ask for your location. We only check which room the mark belongs to." />
      </p>
    </section>
  );
}

/** 찍은 결과(또는 못 찍은 까닭) */
export function QrStampCard({ outcome, room }: { outcome: QrStampOutcome; room?: RoomLike }) {
  const w = QR_STAMP_WORDS[outcome];
  const ok = outcome === 'new' || outcome === 'have';
  const title = qrStampTitle(outcome, room ? { ko: room.name, en: placeEn(room.name) } : null);
  // 새로 찍혔으면 걷기 화면의 도장과 같은 반응: 도장이 위에서 내려와 찍히고(줄인 움직임이면 그대로 나타남),
  // 「○○ 도장을 찍었어요」, 휴대폰은 짧게 떤다(손을 대기 전이라 브라우저가 막으면 그냥 지나간다)
  return (
    <section className="card qr-stamp-card" aria-labelledby="qr-title" role="status">
      <StampSeal
        name={room?.name ?? '조연당'} state={outcome === 'new' ? 'new' : ok ? 'have' : 'off'} caption="현장 도장"
        press={outcome === 'new'} vibrate={outcome === 'new'}
      />
      <h1 id="qr-title"><T ko={title.ko} en={title.en} /></h1>
      <p><T ko={w.line} en={w.lineEn} /></p>
      <div className="btn-row">
        {room ? (
          <Link className="btn btn-pine" href={`/room/${room.slug}`}>
            <T ko={`${room.name} 둘러보기`} en={<>Look around <RoomName name={room.name} /></>} />
          </Link>
        ) : null}
        <Link className={room ? 'btn' : 'btn btn-pine'} href="/notebook"><T ko="수첩 보기" en="See my notebook" /></Link>
        {!room ? <Link className="btn" href="/map"><T ko="집 지도" en="House map" /></Link> : null}
      </div>
    </section>
  );
}
