'use client';
import { useSyncExternalStore } from 'react';
import { getMaking, getServerMaking, subscribeMaking, type Making } from './making';
import { getModelMaking, getServerModelMaking, subscribeModelMaking, type ModelMaking } from './making-3d';

// 그리는 중인 사진 캐릭터(making.ts)와 만드는 중인 3D(making-3d.ts)를 화면에서 읽는 고리와 1초 시계.

export function useMaking(): Making | null {
  return useSyncExternalStore(subscribeMaking, getMaking, getServerMaking);
}

export function useModelMaking(): ModelMaking | null {
  return useSyncExternalStore(subscribeModelMaking, getModelMaking, getServerModelMaking);
}

const SEC = 1000;
const clockSubscribe = (cb: () => void) => {
  const t = setInterval(cb, SEC);
  return () => clearInterval(t);
};
/** 1초 단위로 자른 지금 시각(같은 초 안에서는 같은 값이라 React가 같은 그림으로 본다) */
const clockNow = () => Math.floor(Date.now() / SEC) * SEC;
const clockOff = () => 0;
const noSubscribe = () => () => {};

/** 걸린 시간을 세는 동안만 1초마다 다시 그린다. 세지 않을 때는 0(시계도 돌리지 않는다) */
export function useSecondClock(active: boolean): number {
  return useSyncExternalStore(active ? clockSubscribe : noSubscribe, active ? clockNow : clockOff, clockOff);
}
