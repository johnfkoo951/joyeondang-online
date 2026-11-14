'use client';
import { useEffect, useState } from 'react';
import { petSpecFrom, type PetSpec } from '@/walk/pet-spec';

/**
 * 집 안팎을 오가는 반려동물(/api/pet, 한 번). 서버 시각으로 이 기기 시계와의 차이를 재어 함께 준다(모든 화면이 같은 자리를 보게).
 * 설정이 없거나 받지 못하면 null: 반려동물 없이 걷는다
 */
export function usePet(): PetSpec | null {
  const [pet, setPet] = useState<PetSpec | null>(null);
  useEffect(() => {
    let alive = true;
    const sent = Date.now();
    fetch('/api/pet', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (!alive || !j || typeof j !== 'object') return;
        const o = j as { pet?: unknown; now?: unknown };
        // 응답이 오가는 동안의 가운데를 서버 시각과 견준다
        const clock = typeof o.now === 'number' && Number.isFinite(o.now) ? o.now - (sent + Date.now()) / 2 : 0;
        setPet(petSpecFrom(o.pet, clock));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return pet;
}
