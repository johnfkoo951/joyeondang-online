import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
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
    ];
  },
};

export default nextConfig;
