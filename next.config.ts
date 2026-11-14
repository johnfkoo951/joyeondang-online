import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // 쪽지 사진: 기기가 다시 그린 보기 1.5MB + 작은 그림 200KB 이하(서버가 한 번 더 잰다) + 폼 여유
      bodySizeLimit: '3mb',
    },
  },
  turbopack: {
    rules: {
      // 전역 CSS만 Tailwind로 거친다. 놀이의 CSS 모듈(*.module.css)까지 '*.css'로 바꾸면 클래스 이름이 사라진다
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
        condition: { not: { path: /\.module\.css$/ } },
      },
    },
  },
  async rewrites() {
    const upstream = process.env.SHUTTLE_UPSTREAM_ORIGIN;
    if (!upstream) return [];
    const url = new URL(upstream);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('SHUTTLE_UPSTREAM_ORIGIN must be an HTTPS origin');
    return { beforeFiles: [
      { source: '/shuttle', destination: `${url.origin}/shuttle` },
      { source: '/shuttle/:path*', destination: `${url.origin}/shuttle/:path*` },
    ], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // 위치·카메라·마이크를 쓰지 않는다(기획서 10절 11)
          { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=(), payment=()' },
        ],
      },
      {
        source: '/api/sword-continent/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/shuttle/:path*',
        headers: [
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=()' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
