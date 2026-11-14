import type { MetadataRoute } from 'next';

// 홈 화면에 추가했을 때의 앱 설정. 열면 바로 집 걷기로 들어가고, 주소창 없이 화면을 채운다
// (안드로이드는 상태 줄까지 덮는 전체 화면을 먼저 쓰고, 안 되면 standalone. 아이폰은 standalone만 쓴다).
// 아이콘은 파비콘(빨간 바탕에 「堂」)과 같은 그림을 크기별로 둔다: public/icons, 아이폰은 app/apple-icon.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '조연당 造連堂',
    short_name: '조연당',
    description: '짓고 잇는 집, 조연당에 놀러 오세요. Come visit Joyeondang.',
    lang: 'ko',
    start_url: '/walk?app=1',
    scope: '/',
    display: 'standalone',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    // 머리줄 색(layout viewport themeColor)과 맞춘다
    background_color: '#f4f0e6',
    theme_color: '#f4f0e6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
