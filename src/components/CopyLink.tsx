'use client';
import { useState } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';

export function CopyLink({ href, className = 'btn' }: { href: string; className?: string }) {
  const [done, setDone] = useState(false);
  const t = useTr();
  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setDone(true);
    } catch {
      window.prompt(t('이 주소를 복사해 주세요', 'Please copy this link'), href);
    }
  }
  return (
    <button type="button" className={className} onClick={copy}>
      {done ? <T ko="주소를 복사했어요" en="Link copied" /> : <T ko="주소 복사" en="Copy link" />}
    </button>
  );
}
