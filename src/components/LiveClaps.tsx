'use client';
import { useSiteState } from '@/components/useSiteState';

// 승인함의 박수 수: 처음엔 서버가 그린 수, 그 뒤로는 15초마다 새로 받은 수
export function LiveClaps({ initial }: { initial: number }) {
  const site = useSiteState();
  return <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{site.known ? site.claps : initial}</strong>;
}
