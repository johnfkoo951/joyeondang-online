import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap stack">
      <h1>이 문은 없어요</h1>
      <p className="lead">주소가 바뀌었거나 아직 열지 않은 곳이에요.</p>
      <Link className="btn" href="/map">집 지도로</Link>
    </div>
  );
}
