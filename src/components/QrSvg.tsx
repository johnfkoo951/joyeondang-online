import 'server-only';
import qrcode from 'qrcode-generator';

// 인쇄할 QR 그림(서버에서 그린다). 담는 글은 사이트 주소 + 방 slug + 정규화한 코드뿐이고,
// SVG에는 칸 좌표(숫자)만 들어간다. 라이브러리의 문자열 SVG를 그대로 붙이지 않는다.
const QUIET = 4; // 둘레 여백(칸 수, QR 규격 권장)

export function QrSvg({ text, label }: { text: string; label: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    }
  }
  const size = n + QUIET * 2;
  return (
    <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
