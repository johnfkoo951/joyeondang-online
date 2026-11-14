import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { gameName } from '@/lib/game-token';
import { dbFriendLookup, loadPet, petFriendNames, petPayload, previewFriendLookup } from '@/lib/pet';
import { previewForRequest } from '@/lib/preview-request';
import { getViewer } from '@/lib/viewer';

// 집 안팎을 오가는 반려동물(걷기 화면). 모형 주소는 누구에게나(구경하는 집에도 걷는다), 이름과 친구는 명단 손님 이상에게만
// (가족 방 이름표와 같은 범위: 이름은 가족 이름처럼 다룬다). 설정(PET_JSON)이 없으면 { pet: null }: 화면은 조용히 반려동물 없이 걷는다.
// 친구는 로그인 사용자 id로 적혀 있고, 화면에는 그 사람이 지금 걷기 화면에서 보이는 이름으로만 보낸다(id는 나가지 않는다).
// 서버 시각(now)을 함께 준다: 화면이 기기 시계와의 차이를 재어 모든 화면이 같은 칸(같은 자리)을 본다.
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function GET() {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳혀 두지 않게, 시각도 매번 새로)
  await connection();
  const viewer = await getViewer();
  const preview = await previewForRequest();
  const named = canUse(viewer.role, 'realHouse') || preview;
  const cfg = loadPet();
  // 친구 이름은 명단 손님 이상에게만 읽는다. 이 맥의 미리보기는 DB 대신 가짜 이름 표를 쓸 수 있다
  const lookup = (preview && previewFriendLookup()) || dbFriendLookup;
  const friends = named && cfg ? await petFriendNames(cfg, lookup) : [];
  // 보는 사람 자신의 걷기 이름: 출입증(app/api/game-token)과 같은 gameName(viewer.name)
  return Response.json(petPayload(cfg, named, Date.now(), friends, gameName(viewer.name)), { headers: HEADERS });
}
