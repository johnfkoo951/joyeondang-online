import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { localPreview } from '@/lib/preview';
import { fetchSwordGameHtml } from '@/lib/sword-continent';
import { getViewer } from '@/lib/viewer';

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  const viewer = await getViewer();
  const allowFamilyNames = canUse(viewer.role, 'realHouse') || localPreview();

  const { meta, html } = await fetchSwordGameHtml({ forceRefresh: refresh, allowFamilyNames });
  if (!html) {
    const fallbackHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:100vh;display:grid;place-items:center;background:#111522;color:#f5f0e6;font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:#ffd24c;font-weight:700}</style></head><body><div><h2>🗡️ 소드 콘티넌트 서버와 연결하는 중이에요</h2><p>잠시 뒤 새로고침하거나 <a href="${meta.playUrl}" target="_blank" rel="noopener noreferrer">외부 원본 링크에서 바로 열기 ↗</a>를 눌러 주세요.</p></div></body></html>`;
    return new Response(fallbackHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
