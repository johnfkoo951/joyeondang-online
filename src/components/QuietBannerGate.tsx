import { QuietBanner } from '@/components/QuietBanner';
import { canUse } from '@/lib/access';
import { getViewer } from '@/lib/viewer';

// 조용 모드 띠의 서버 쪽: 지금 보는 사람이 명단 손님이면 박수 단추를 연다. 쿠키를 읽으므로 <Suspense> 안에서 쓴다.
export async function QuietBannerGate() {
  const viewer = await getViewer();
  return <QuietBanner canClap={canUse(viewer.role, 'stamps')} />;
}
