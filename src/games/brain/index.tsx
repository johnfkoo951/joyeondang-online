// 생각 지도 퀴즈 카트리지: 덮개 화면의 빈 칸(container)에 React로 그리고, 정리 함수에서 내린다.
import { createRoot } from 'react-dom/client';
import type { MountGame } from '../types';
import { BrainGame } from './BrainGame';

const mount: MountGame = (container, ctx) => {
  const root = createRoot(container);
  root.render(<BrainGame ctx={ctx} />);
  return () => root.unmount();
};

export default mount;
