import { connection } from 'next/server';
import { resolveSwordUpstream } from '@/lib/sword-continent';

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  const meta = await resolveSwordUpstream(refresh);
  return Response.json({ ok: true, meta }, { headers: HEADERS });
}
