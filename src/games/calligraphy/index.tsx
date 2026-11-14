import { createRoot } from 'react-dom/client';
import type { MountGame } from '../types';
import { CalligraphyGame } from './CalligraphyGame';
const mount: MountGame = (container, ctx) => {
  const root = createRoot(container); root.render(<CalligraphyGame ctx={ctx} />);
  let disposed = false;
  return () => { if (disposed) return; disposed = true; queueMicrotask(() => root.unmount()); };
};
export default mount;
