import qrcode from 'qrcode-generator';

// QR 그림을 그릴 칸 좌표(숫자)만 만든다. 서버(QrSvg)와 같은 규칙이고 브라우저에서도 돈다(관리 화면의 행사 초대 QR).
// 라이브러리의 문자열 SVG를 그대로 붙이지 않는다.
const QUIET = 4; // 둘레 여백(칸 수, QR 규격 권장)

export function drawQr(text: string, level: 'L' | 'M' | 'Q' | 'H' = 'M'): { d: string; size: number } {
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    }
  }
  return { d, size: n + QUIET * 2 };
}
