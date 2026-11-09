// 카드를 칸에 놓는 상태(2판 순서·예시, 3판 짝 잇기가 같이 쓴다). 칸 하나에 카드 하나.
// 카드를 누르면 골라 들고, 칸을 누르면 거기 놓는다(칸에 있던 카드는 다시 바구니로). 들고 있지 않을 때 찬 칸을 누르면 비운다.
import { useState } from 'react';

export type Placement = {
  /** 카드 id → 칸 key */
  at: Readonly<Record<string, string>>;
  /** 지금 들고 있는 카드 */
  sel: string | null;
  /** 칸에 든 카드 id */
  inSlot: (slot: string) => string | undefined;
  put: (item: string, slot: string) => void;
  tapItem: (item: string) => void;
  /** 칸을 눌렀을 때: 놓았으면 'put', 비웠으면 'out', 아무 일 없으면 null */
  tapSlot: (slot: string) => 'put' | 'out' | null;
  clear: () => void;
};

export function usePlacement(): Placement {
  const [at, setAt] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string | null>(null);

  const inSlot = (slot: string) => Object.keys(at).find((k) => at[k] === slot);

  const put = (item: string, slot: string) => {
    setAt((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) if (k !== item && v !== slot) next[k] = v;
      next[item] = slot;
      return next;
    });
    setSel(null);
  };

  const tapItem = (item: string) => setSel((cur) => (cur === item ? null : item));

  const tapSlot = (slot: string): 'put' | 'out' | null => {
    if (sel) {
      put(sel, slot);
      return 'put';
    }
    const occ = inSlot(slot);
    if (!occ) return null;
    setAt((prev) => {
      const next = { ...prev };
      delete next[occ];
      return next;
    });
    return 'out';
  };

  const clear = () => {
    setAt({});
    setSel(null);
  };

  return { at, sel, inSlot, put, tapItem, tapSlot, clear };
}
