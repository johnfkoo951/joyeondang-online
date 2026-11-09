import 'server-only';
import { headers } from 'next/headers';
import { SITE_URL } from '@/lib/env';

/** 지금 요청이 들어온 주소(로컬 개발이면 localhost, 배포면 실제 도메인) */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return SITE_URL;
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** 다른 사이트로 튕겨 나가지 않게, 우리 사이트 안의 경로만 받는다 */
export function safeNext(raw: unknown, fallback = '/notebook'): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  return raw.slice(0, 200);
}
