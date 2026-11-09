'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { shouldHandleShortcut } from '@/lib/keys';

const MAP: Record<string, string> = { m: '/map', g: '/walk', e: '/exhibit', n: '/notebook', h: '/' };

// 키보드: M 지도, G 집 안 걷기, E 전시, N 수첩, H 첫 화면, ? 도움말, Esc 닫기.
// 한글 조합 중이거나 입력칸에 있을 때는 아무것도 하지 않는다.
export function Shortcuts() {
  const router = useRouter();
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  // 걷기 화면은 E·M 같은 글자를 놀이 조작에 쓰므로 사이트 단축키를 끈다
  const off = path.startsWith('/walk');
  useEffect(() => {
    if (off) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!shouldHandleShortcut(e)) return;
      if (e.key === '?') {
        e.preventDefault();
        dialog.current?.showModal();
        return;
      }
      const to = MAP[e.key.toLowerCase()];
      if (to) {
        e.preventDefault();
        router.push(to);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, off]);
  return (
    <dialog ref={dialog} className="help-dialog" aria-label="단축키">
      <h2 style={{ marginTop: 0 }}>단축키</h2>
      <ul className="stack" style={{ paddingLeft: 18 }}>
        <li><kbd>M</kbd> 집 지도</li>
        <li><kbd>G</kbd> 집 안 걷기</li>
        <li><kbd>E</kbd> 전시</li>
        <li><kbd>N</kbd> 내 수첩</li>
        <li><kbd>H</kbd> 첫 화면</li>
        <li><kbd>Esc</kbd> 닫기</li>
      </ul>
      <form method="dialog">
        <button className="btn btn-small">닫기</button>
      </form>
    </dialog>
  );
}
