import type { MetadataRoute } from 'next';
import { LAUNCHED } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  if (!LAUNCHED) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/notebook', '/voice', '/join', '/auth/', '/q/'] } };
}
