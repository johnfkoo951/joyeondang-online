'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clapOnce } from '@/app/site-actions';
import { ClapIcon, LoafCat } from '@/components/QuietArt';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { setClaps, useSiteState } from '@/components/useSiteState';

// 조용 모드 띠(기획서 7.1 공통 세션 20분). 모든 화면 맨 위, 3D 걷기 화면보다도 위에 얇게 뜬다.
// 띠 높이를 --quiet-h로 알려 머리줄과 걷기 화면의 위쪽 단추들이 그만큼 내려가게 한다(아래 조작은 가리지 않는다).
// 명단 손님에게는 박수 단추 하나. 누르면 2초 쉬었다가 다시 누를 수 있다(서버도 2초에 한 번만 센다).

const TICK_MS = 5_000;
const clockSubscribe = (cb: () => void) => {
  const t = setInterval(cb, TICK_MS);
  return () => clearInterval(t);
};
const clockNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

export function QuietBanner({ canClap }: { canClap: boolean }) {
  const t = useTr();
  const site = useSiteState();
  const now = useSyncExternalStore(clockSubscribe, clockNow, () => 0);
  const ref = useRef<HTMLDivElement>(null);
  const leftMs = site.until ? Date.parse(site.until) - now : 0;
  const on = site.quiet && now > 0 && leftMs > 0;
  const minutes = Math.max(1, Math.ceil(leftMs / 60_000));

  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const root = document.documentElement;
    root.dataset.quiet = '1';
    const measure = () => root.style.setProperty('--quiet-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      delete root.dataset.quiet;
      root.style.removeProperty('--quiet-h');
    };
  }, [on]);

  if (!on) return null;
  return (
    <div ref={ref} className="quiet-banner" role="region" aria-label={t('조용 모드', 'Quiet time')}>
      <LoafCat className="quiet-cat" />
      <div className="quiet-text">
        <p className="quiet-line" role="status">
          <T ko="지금은 거실에 모여 있어요. 놀이는 잠시 쉬어요." en="Everyone is gathering in the living room. Games take a short break." />
        </p>
        <p className="quiet-left">
          <T ko={`${minutes}분쯤 뒤에 다시 놀아요`} en={`Back to play in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`} />
        </p>
      </div>
      {canClap ? <ClapButton total={site.claps} /> : null}
    </div>
  );
}

function ClapButton({ total }: { total: number }) {
  const t = useTr();
  const [resting, setResting] = useState(false);
  const [beat, setBeat] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const press = async () => {
    if (resting) return;
    setResting(true);
    setBeat((n) => n + 1);
    timer.current = setTimeout(() => setResting(false), 2000);
    try {
      const n = await clapOnce();
      if (typeof n === 'number') setClaps(n);
    } catch {
      // 연결이 끊겨도 단추는 2초 뒤 다시 살아난다
    }
  };
  return (
    <button
      type="button" className="quiet-clap" onClick={press} disabled={resting}
      aria-label={t(`박수 보내기. 지금까지 ${total}번`, `Send a clap. ${total} so far`)}
    >
      <span key={beat} className="quiet-clap-icon" data-beat={beat > 0 ? 'on' : undefined}>
        <ClapIcon />
      </span>
      <T ko={<span>박수</span>} en={<span>Clap</span>} />
      <span className="quiet-clap-n" aria-hidden="true">{total}</span>
    </button>
  );
}
