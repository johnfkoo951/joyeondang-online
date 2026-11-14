import 'server-only';
import { headers } from 'next/headers';
import { localPreview, loopbackHost } from '@/lib/preview';

/**
 * 요청을 받는 자리(라우트·화면)에서 쓰는 미리보기 스위치. localPreview()(서버를 127.0.0.1에만 묶었나)에 더해
 * 요청 주소(Host)도 이 컴퓨터여야 켠다: 미리보기를 띄워 둔 채 다른 사이트를 열었을 때 DNS 재바인딩으로 손님 전용 데이터
 * (실제 집, 가족 방 이름표, 반려동물 이름, 게임 출입증)를 읽어 가지 못하게. 운영(미리보기 꺼짐)에서는 Host를 읽지도 않는다
 */
export async function previewForRequest(): Promise<boolean> {
  if (!localPreview()) return false;
  return loopbackHost((await headers()).get('host'));
}
