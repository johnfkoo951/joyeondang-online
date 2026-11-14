'use client';
import { useState, type KeyboardEvent } from 'react';
import { renameRoster } from '@/app/admin/actions';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { ROSTER_NAME_MAX } from '@/lib/roster-name';

// 관리 화면 명단 표의 이름 바꾸기. 「바꾸기」를 누르면 그 줄에서 바로 고친다.
// 한글을 조합하는 중의 Enter(조합을 끝내는 Enter)로는 보내지 않는다(전역 IME 규칙).
// 단추 글과 이름(aria-label)은 화면 말을 따른다(관리 화면의 다른 글은 한국어 그대로다)
export function RosterRename({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const tr = useTr();
  if (!open) {
    return (
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)} aria-label={tr(`${name} 이름 바꾸기`, `Rename ${name}`)}>
        <T ko="바꾸기" en="Rename" />
      </button>
    );
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (e.key === 'Enter' && composing) e.preventDefault();
    if (e.key === 'Escape' && !composing) setOpen(false);
  };
  return (
    <form action={renameRoster} className="inline-form" onSubmit={() => setOpen(false)}>
      <input type="hidden" name="id" value={id} />
      <input
        name="display_name" defaultValue={name} maxLength={ROSTER_NAME_MAX} required autoFocus
        aria-label={tr('새 이름', 'New name')} onKeyDown={onKeyDown}
      />
      <button className="btn btn-small btn-pine"><T ko="저장" en="Save" /></button>
      <button type="button" className="btn btn-small" onClick={() => setOpen(false)}><T ko="그만두기" en="Cancel" /></button>
    </form>
  );
}
