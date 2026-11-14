import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QrNotReady, QrSignInCard, QrStampCard } from '@/components/QrStampCards';
import { T } from '@/components/i18n/T';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { normalizeCode } from '@/lib/code';
import { QR_CODE, QR_STAMP_WORDS, qrPath, type QrStampOutcome } from '@/lib/qr';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 현장 QR 도장(기획서 7.2). QR은 입장권이 아니라 도장 표식이다. 들어온 명단 손님이 정해 둔 때에 찍으면
// 그 방의 현장 도장이 수첩에 찍힌다. 위치는 묻지 않고, 판정은 DB(earn_qr_stamp)가 한다.
// 카드(한국어·영어)는 components/QrStampCards.tsx, 결과 말은 lib/qr.ts의 QR_STAMP_WORDS
export const metadata: Metadata = { title: '현장 도장', robots: { index: false, follow: false } };

type Props = { params: Promise<{ room: string; code: string }> };

// Cache Components: 경로 하나는 미리 그려 껍데기를 만든다(진짜 코드는 모두 요청 때 그린다).
// 견본 코드는 일부러 형식에 맞지 않게 둔다(무엇에도 도장이 되지 않는다).
export function generateStaticParams() {
  return [{ room: 'porch', code: 'sample' }];
}

export default function QrStampPage({ params }: Props) {
  return (
    <div className="wrap stack">
      <Suspense fallback={<p className="muted"><T ko="도장을 확인하는 중이에요" en="Checking the stamp" /></p>}>
        <QrStamp params={params} />
      </Suspense>
    </div>
  );
}

async function QrStamp({ params }: Props) {
  const { room: slug, code: raw } = await params;
  const room = ROOM_BY_SLUG.get(slug);
  const code = normalizeCode(safeDecode(raw)).slice(0, 32);
  if (!room || !QR_CODE.test(code)) return <QrStampCard outcome="invalid" />;

  const viewer = await getViewer();
  if (!viewer.ready) return <QrNotReady room={room} />;
  if (!viewer.signedIn) return <QrSignInCard room={room} back={qrPath(room.slug, code)} />;
  if (!canUse(viewer.role, 'stamps')) return <QrStampCard outcome="not_guest" room={room} />;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('earn_qr_stamp', { p_room: room.slug, p_code: code });
  const r = (data && typeof data === 'object' ? data : {}) as { ok?: unknown; reason?: unknown; first?: unknown };
  let outcome: QrStampOutcome = 'error';
  if (!error && r.ok === true) outcome = r.first === true ? 'new' : 'have';
  else if (!error && typeof r.reason === 'string' && r.reason in QR_STAMP_WORDS) outcome = r.reason as QrStampOutcome;
  return <QrStampCard outcome={outcome} room={room} />;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return '';
  }
}
