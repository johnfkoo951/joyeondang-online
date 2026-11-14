'use client';
import { useEffect, useRef, useState } from 'react';
import { SNAP_H, SNAP_W, makeSnapQueue, snapKey, type SnapQueue } from '@/lib/avatar/admin-gallery';
import css from './characters.module.css';

// 3D 모형 보기 카드의 그림: 모형의 정지 사진. 카드가 화면 가까이 오면(IntersectionObserver) 사진 줄에 서고, 멀어지면 아직 찍지 않은
// 차례를 물린다(빨리 지나간 카드의 모형은 받지 않는다). 찍기는 모든 카드가 함께 쓰는 그리개 하나가 한 장씩 한다(snapshot.ts).
// 사진은 캐릭터와 모형 판(id:판)마다 한 번 찍어 두고(object URL), 다시 만들어 판이 바뀌면 새로 찍는다.
// 찍기 전에는 2D 그림을 흐리게, 못 찍으면(그림 문맥이 없는 기기, 받기·풀기 실패) 2D 그림에 「3D」 표시를 붙여 대신한다.

let queue: SnapQueue | null = null;
let booth: typeof import('./snapshot') | null = null;

/** 모든 카드가 함께 쓰는 3D 사진 줄(처음 부를 때 만든다. 브라우저에서만 부른다). three.js와 찍는 코드는 처음 찍을 때 불러온다 */
export function snapQueue(): SnapQueue {
  queue ??= makeSnapQueue({
    shoot: async (src, gate) => (booth ??= await import('./snapshot')).shoot(src, gate),
    release: () => booth?.release(),
    drop: (url) => URL.revokeObjectURL(url),
    now: () => Date.now(),
    later: (fn, ms) => window.setTimeout(fn, ms),
    cancel: (handle) => window.clearTimeout(handle as number),
  });
  return queue;
}

type Props = {
  id: string;
  ver: number;
  /** 모형 주소. 없으면(서버 비밀 키가 없다) 찍지 않는다 */
  src: string | null;
  /** 대신 보일 2D 그림. 없으면 글(empty) */
  still: string | null;
  empty: string;
};

export function ModelSnap({ id, ver, src, still, empty }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  const key = snapKey({ id, modelVer: ver });
  const [shot, setShot] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !src) return;
    let alive = true;
    /** 줄에 서 있는 동안의 물리기 */
    let stop: (() => void) | null = null;
    /** 사진을 받았다(다시 청하지 않는다). 못 찍었으면 다시 화면에 들어올 때 줄이 정한 때가 지났으면 다시 해 본다 */
    let have = false;
    const take = () => {
      if (!alive || stop || have) return;
      let answered = false;
      const cancel = snapQueue().want(key, src, (url) => {
        answered = true;
        stop = null;
        have = url !== null;
        if (alive) setShot({ key, url });
      });
      if (!answered) stop = cancel;
    };
    const leave = () => {
      stop?.();
      stop = null;
    };
    if (typeof IntersectionObserver !== 'function') {
      queueMicrotask(take);
      return () => {
        alive = false;
        leave();
      };
    }
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) take();
      else leave();
    }, { rootMargin: '200px 0px' });
    seen.observe(el);
    return () => {
      alive = false;
      seen.disconnect();
      leave();
    };
  }, [key, src]);

  // undefined: 아직, null: 못 찍음
  const url = shot?.key === key ? shot.url : undefined;
  const state = url ? 'ok' : url === null || !src ? 'fail' : 'wait';
  return (
    <span ref={box} className={css.snap} data-state={state}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={css.picImg} src={url} alt="" width={SNAP_W} height={SNAP_H} decoding="async" />
      ) : still ? (
        // 관리자용 작은 그림(원본 사진이 아니다)
        // eslint-disable-next-line @next/next/no-img-element
        <img className={css.picImg} src={still} alt="" width={SNAP_W} height={SNAP_H} loading="lazy" decoding="async" />
      ) : (
        <span className={css.picEmpty}>{empty}</span>
      )}
      {state === 'wait' ? <span className={css.snapNote}>3D 불러오는 중</span> : null}
      {state === 'fail' ? <span className={css.snapMark}>3D</span> : null}
    </span>
  );
}
