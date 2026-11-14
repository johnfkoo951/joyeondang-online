'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { T } from '@/components/i18n/T';

// 화면을 그리다 예외가 나면 기본 영어 화면 대신 이 안내를 보인다(머리줄과 바닥글은 그대로 남는다).
// 화면 말은 한국어·영어를 함께 싣고 CSS가 고른 말만 보인다(<T>)
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error('[page] 화면을 그리다 난 오류', error);
  }, [error]);
  return (
    <div className="wrap stack">
      <h1><T ko="화면을 그리다 문제가 생겼어요" en="Something went wrong on this page" /></h1>
      <p className="lead">
        <T
          ko="잠깐 어긋났을 수 있어요. 다시 시도해 보시고, 계속되면 집 지도에서 다시 들어와 주세요."
          en="It may be a brief hiccup. Please try again, and if it keeps happening, come back in from the house map."
        />
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn-pine" onClick={() => retry()}><T ko="다시 시도" en="Try again" /></button>
        <Link className="btn" href="/map"><T ko="집 지도로" en="To the house map" /></Link>
      </div>
    </div>
  );
}
