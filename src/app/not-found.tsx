import Link from 'next/link';
import { T } from '@/components/i18n/T';

export default function NotFound() {
  return (
    <div className="wrap stack">
      <h1><T ko="이 문은 없어요" en="There is no such door" /></h1>
      <p className="lead">
        <T ko="주소가 바뀌었거나 아직 열지 않은 곳이에요." en="The address may have changed, or this place isn't open yet." />
      </p>
      <Link className="btn" href="/map"><T ko="집 지도로" en="To the house map" /></Link>
    </div>
  );
}
