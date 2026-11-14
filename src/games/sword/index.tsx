import { createRoot } from 'react-dom/client';
import type { MountGame } from '../types';
import { SwordGame } from './SwordGame';

const mount: MountGame = (container, ctx) => {
  const root = createRoot(container);
  root.render(<SwordGame ctx={ctx} />);
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    queueMicrotask(() => root.unmount());
  };
};

export default mount;
