import { createRoot } from 'react-dom/client';
import type { MountGame } from '../types';
import { PoetryGame } from './PoetryGame';
const mount: MountGame = (container, ctx) => {
  const root = createRoot(container); root.render(<PoetryGame ctx={ctx} />);
  let disposed = false;
  return () => { if (disposed) return; disposed = true; queueMicrotask(() => root.unmount()); };
};
export default mount;
