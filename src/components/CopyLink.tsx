'use client';
import { useState } from 'react';

export function CopyLink({ href }: { href: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setDone(true);
    } catch {
      window.prompt('이 주소를 복사해 주세요', href);
    }
  }
  return (
    <button type="button" className="btn" onClick={copy}>
      {done ? '주소를 복사했어요' : '주소 복사'}
    </button>
  );
}
