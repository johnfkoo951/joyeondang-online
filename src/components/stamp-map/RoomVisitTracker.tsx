'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { earnStamp } from '@/app/actions';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { buzz } from '@/components/stamp/stamp-rules';
import { markStamped } from '@/components/walk/memory';
import { ordinalEn } from '@/lib/page-words';
import { SPOT_BY_SLUG, markVisited, readLocalStamped, spotName } from '@/lib/stamp-rally';
import { CarvedSeal } from './CarvedSeal';
import css from './stamp-rally.module.css';

type Props = {
  slug: string;
  /** 방 이름(한국어). 영어 화면에서는 장소 이름 표로 옮긴다 */
  name: string;
  canStamp: boolean;
  initialStamped?: boolean;
};

/** 방 페이지에 들어오면 다녀온 기록을 남기고, 전각 인장을 바로 찍어 도장 투어 맵에 반영한다 */
export function RoomVisitTracker({ slug, name, canStamp, initialStamped = false }: Props) {
  const spot = SPOT_BY_SLUG.get(slug);
  const [serverHave, setServerHave] = useState(initialStamped);
  // 이 기기의 체험 도장은 그린 뒤에 읽는다(아래 효과): 서버 그림과 첫 그림이 같아야 하이드레이션이 어긋나지 않는다
  const [localHave, setLocalHave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justPressed, setJustPressed] = useState(false);
  // 알림은 두 말을 함께 둔다(떠 있는 동안 말을 바꿔도 따라간다)
  const [msg, setMsg] = useState<{ ko: string; en: string } | null>(null);
  const lang = useLang();
  const nameEn = spotName('en', { name });

  useEffect(() => {
    try {
      markVisited(localStorage, slug);
    } catch {
      // 사생활 보호 창 등에서도 화면은 그대로 동작
    }
    queueMicrotask(() => {
      try {
        setLocalHave(readLocalStamped(localStorage).has(slug));
      } catch {
        // 저장소를 못 읽으면 찍지 않은 것으로 둔다
      }
    });
  }, [slug]);

  if (!spot) return null;

  const stamped = serverHave || localHave;
  const sealState = serverHave ? 'stamped' : localHave ? 'trial' : 'ready';

  const handlePress = async () => {
    if (busy || stamped) return;
    if (!canStamp) {
      try {
        markStamped(localStorage, slug);
      } catch {
        // 무시
      }
      buzz();
      setLocalHave(true);
      setJustPressed(true);
      setMsg({ ko: `${name} 체험 도장을 찍었어요! 도장 투어 맵에도 바로 찍혀 있어요.`, en: `You got a trial stamp for ${nameEn}! It’s on the stamp tour map too.` });
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set('room', slug);
    const res = await earnStamp(fd).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      try {
        markStamped(localStorage, slug);
      } catch {
        // 무시
      }
      buzz();
      setServerHave(true);
      setJustPressed(true);
      setMsg(
        res.fresh
          ? { ko: `${name} 정식 도장을 찍었어요!`, en: `You got the official ${nameEn} stamp!` }
          : { ko: `${name} 도장은 이미 수첩과 맵에 찍혀 있어요.`, en: `The ${nameEn} stamp is already in your notebook and on the map.` },
      );
      return;
    }
    setMsg({ ko: '연결이 잠시 고르지 않아요. 다시 한 번 눌러 주세요.', en: 'The connection is a little shaky. Please press it once more.' });
  };

  return (
    <section className={css.roomStampCard} aria-label={lang === 'en' ? `${nameEn} stamp` : `${name} 도장`}>
      <CarvedSeal
        label={spot.shortName}
        labelEn={spot.en.short}
        shape={spot.sealShape}
        motif={spot.motif}
        state={sealState}
        size={88}
        rot={spot.rot}
        press={justPressed}
      />
      <div className={css.roomStampBody}>
        <p className={css.roomStampKicker}>
          <T ko={`도장 투어 ${spot.order}번 지점 · 다녀옴 확인`} en={`Stamp tour, ${ordinalEn(spot.order)} spot · visit checked`} />
        </p>
        <h3 className={css.roomStampTitle}>
          {stamped
            ? <T ko={`${name} 도장이 찍혀 있어요`} en={`You have the ${nameEn} stamp`} />
            : <T ko={`${name}에 오셨군요! 도장을 찍어 남겨 보세요`} en={`Welcome to the ${nameEn}! Leave your stamp here`} />}
        </h3>
        <p className={css.roomStampDesc}>
          {msg
            ? <T ko={msg.ko} en={msg.en} />
            : stamped
              ? <T ko="도장 투어 일러스트 맵에서 열세 곳의 인장이 모이는 모습을 한눈에 볼 수 있어요." en="See all 13 seals come together at a glance on the stamp tour map." />
              : canStamp
                ? <T ko="버튼을 누르면 전각 인장이 수첩과 도장 투어 맵에 함께 찍혀요." en="Press the button and a carved seal lands in your notebook and on the stamp tour map." />
                : <T ko="로그인 전에도 이 기기에 체험 도장을 찍어 도장 투어 맵을 채워 볼 수 있어요." en="Even before signing in, you can put trial stamps on this device and fill the stamp tour map." />}
        </p>
        <div className="btn-row">
          <button
            type="button"
            className={stamped ? `btn btn-small ${css.stampedDoneBtn}` : 'btn btn-roof btn-small'}
            onClick={() => void handlePress()}
            aria-disabled={stamped || busy || undefined}
          >
            {busy
              ? <T ko="찍는 중…" en="Stamping…" />
              : stamped
                ? <T ko="✓ 도장 찍음" en="✓ Stamped" />
                : canStamp
                  ? <T ko="이 방 도장 쾅 찍기" en="Stamp this room" />
                  : <T ko="체험 도장 찍기" en="Get a trial stamp" />}
          </button>
          <Link className="btn btn-small" href={`/map?spot=${encodeURIComponent(slug)}`}>
            <T ko="도장 투어 맵에서 보기" en="See it on the stamp tour map" />
          </Link>
        </div>
      </div>
    </section>
  );
}
