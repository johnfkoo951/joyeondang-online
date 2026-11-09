import 'server-only';
import { gunzipSync } from 'node:zlib';
import type { HouseWorld } from '@/walk/types';
import { isHouseWorld } from './house-world-check';

// 실제 집 걷기 데이터. 저장소·빌드 결과물에는 없고, 서버 환경 변수 HOUSE_WORLD_GZ(gzip 뒤 base64)에만 있다.
// 가족 작업대의 변환기가 정본 모형에서 만든다. 손님 확인은 부르는 쪽(app/api/house)이 먼저 한다.

/** 환경 변수를 풀어 세계 데이터를 돌려준다. 없거나 깨졌으면 null(다시 그린 집으로 돌아간다). */
export function loadRealHouse(raw = process.env.HOUSE_WORLD_GZ): HouseWorld | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(gunzipSync(Buffer.from(raw, 'base64')).toString('utf8')) as HouseWorld;
    return isHouseWorld(w) ? w : null;
  } catch {
    return null;
  }
}
