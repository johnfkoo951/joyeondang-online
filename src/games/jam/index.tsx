// 박공 아래 잼 카트리지 입구(규약 ../types.ts). 덮개 화면의 빈 칸에 React 뿌리를 하나 세우고, 정리 때 걷는다.
import { createRoot } from 'react-dom/client';
import type { MountGame } from '../types';
import { JamGame } from './JamGame';

const mount: MountGame = (container, ctx) => {
  const root = createRoot(container);
  root.render(<JamGame ctx={ctx} />);
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    // 덮개 쪽 React가 커밋하는 중에 불릴 수 있어 다른 뿌리를 동기로 걷지 않는다(소리 정리는 unmount 때 함께)
    queueMicrotask(() => root.unmount());
  };
};

export default mount;
