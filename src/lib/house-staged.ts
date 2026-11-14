import 'server-only';
import { loadRealHouse } from '@/lib/house-world';
import { galleryOn } from '@/walk/gallery';
import { stageHouse, themeOf } from '@/walk/staging';
import type { GalleryFrame, HouseWorld } from '@/walk/types';

// 걷기용으로 손질한 실제 집(src/walk/staging.ts). 손님 확인은 부르는 쪽(라우트·관리 화면)이 먼저 한다.
// 꾸밈은 WALK_THEME(기본 결혼식), 부엌 사진 갤러리 액자는 KITCHEN_GALLERY(1일 때만 건다, 기본은 걸지 않는다).
// 같은 데이터·같은 설정이면 손질 결과도 같으므로 서버 프로세스마다 한 번만 풀고 손질한다. 갤러리를 건 것과 걸지 않은 것은
// 따로 둔다(갤러리를 끈 동안에도 승인함은 켜면 걸릴 액자를 미리 채운다).

type Staged = { raw: string; theme: string; gallery: boolean; out: HouseWorld | null };
let cache: Staged[] = [];

/** 손질한 집. gallery를 주지 않으면 KITCHEN_GALLERY를 따른다 */
export function stagedHouse(env: Record<string, string | undefined> = process.env, opts: { gallery?: boolean } = {}): HouseWorld | null {
  const raw = env.HOUSE_WORLD_GZ ?? '';
  const theme = themeOf(env.WALK_THEME);
  const gallery = opts.gallery ?? galleryOn(env.KITCHEN_GALLERY);
  const hit = cache.find((c) => c.raw === raw && c.theme === theme && c.gallery === gallery);
  if (hit) return hit.out;
  const src = loadRealHouse(raw || undefined);
  const out = src ? stageHouse(src, theme, { gallery }) : null;
  // 같은 데이터·꾸밈의 다른 갤러리 설정 하나만 곁에 둔다(데이터가 바뀌면 옛것은 버린다)
  cache = [...cache.filter((c) => c.raw === raw && c.theme === theme && c.gallery !== gallery), { raw, theme, gallery, out }];
  return out;
}

/**
 * 지금 걸린 갤러리 액자(끄거나 집 데이터가 없으면 빈 목록). evenIfOff면 꺼져 있어도 켜면 걸릴 액자를 준다(승인함이 손님에게
 * 보이기 전에 미리 채운다: 액자 자리는 같은 집 데이터면 켜고 끄는 것과 상관없이 같다)
 */
export function galleryFrames(env: Record<string, string | undefined> = process.env, opts: { evenIfOff?: boolean } = {}): GalleryFrame[] {
  if (!galleryOn(env.KITCHEN_GALLERY) && !opts.evenIfOff) return [];
  return stagedHouse(env, { gallery: true })?.gallery ?? [];
}
