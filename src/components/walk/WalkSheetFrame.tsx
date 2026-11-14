'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { isEditingTarget } from '@/lib/keys';
import { placeName } from '@/lib/place-names';
import { ariaKey } from './controls';
import { IconClose } from './icons';
import { KeyHint } from './KeyHint';
import { sheetLink, sheetTitle } from './sheet-routes';
import { isSheetOpen, subscribeSheet } from './sheet-state';
import { trapTab } from './useDialogFocus';

/** 닫기(뒤로 가기)가 먹지 않을 때 걷기 주소로 바로 가기까지 기다리는 시간 */
const CLOSE_FALLBACK_MS = 1500;

const hasText = (el: HTMLElement) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value.trim() !== '' : (el.textContent ?? '').trim() !== '';

/**
 * 걷기 화면 위에 페이지를 띄우는 시트 틀(걷기 layout의 @sheet 자리를 감싼다).
 * 걷기 화면에서 방 쪽지·수첩·갤러리 같은 페이지로 가면 Next가 그 주소를 가로채 이 틀 안에 그린다:
 * 3D 장면과 함께 걷기 연결은 뒤에 그대로 있고(그리기는 쉰다), 닫기 단추·Esc·뒤로 가기로 바로 걷기로 돌아간다.
 * 주소를 바로 열면(새로 고침, 공유 링크) 가로채지 않고 지금처럼 전체 페이지다.
 * 열림은 시트 페이지가 붙인 SheetMark가 알린다(틀은 늘 붙어 있어 시트 안에서 다른 페이지로 가도 깜빡이지 않는다).
 */
export function WalkSheetFrame({ children }: { children: ReactNode }) {
  const open = useSyncExternalStore(subscribeSheet, isSheetOpen, () => false);
  const router = useRouter();
  const pathname = usePathname();
  const card = useRef<HTMLDivElement>(null);
  const closing = useRef<number | null>(null);
  const lang = useLang();
  const tr = useTr();
  // 머리 이름은 화면 말을 따른다(방 이름은 장소 이름 표로 옮기고, 표에 없으면 한국어 그대로)
  const title = open ? sheetTitle(pathname, (slug) => {
    const name = ROOM_BY_SLUG.get(slug)?.name;
    return name ? placeName(lang, name) : undefined;
  }, lang) : '';

  // 닫기는 뒤로 가기 한 번: 시트를 연 이동이 기록 하나를 쌓았고, 시트 안의 이동은 기록을 쌓지 않는다(아래 링크 처리).
  // 그래도 닫히지 않으면(기록이 없는 드문 경우) 걷기 주소로 간다(@sheet/page가 비어 있어 시트가 내려간다)
  const close = useCallback(() => {
    if (closing.current !== null) return;
    router.back();
    closing.current = window.setTimeout(() => {
      closing.current = null;
      if (isSheetOpen()) router.push('/walk');
    }, CLOSE_FALLBACK_MS);
  }, [router]);
  useEffect(() => {
    if (open || closing.current === null) return;
    window.clearTimeout(closing.current);
    closing.current = null;
  }, [open]);

  // 열리면 시트로 초점을 옮기고, 닫히면 열기 전 자리로 돌려준다(걷기 화면이 inert를 푼 다음 틀에)
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    card.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (now && now !== document.body && now.isConnected) return;
        if (back && back.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
      });
    };
  }, [open]);

  // 시트 안에서 다른 페이지로 바꿔 달면 누른 링크가 (라우터가 숨긴 앞 페이지와 함께) 사라진다: 초점을 시트로 되돌린다.
  // 위의 열림 처리 뒤에 둔다(그쪽이 열기 전 초점을 먼저 기억한다)
  useEffect(() => {
    if (!open) return;
    const c = card.current;
    const a = document.activeElement;
    if (c && (!(a instanceof HTMLElement) || !c.contains(a) || a.getClientRects().length === 0)) c.focus({ preventScroll: true });
  }, [open, pathname]);

  // Esc: 시트를 닫는다. 시트 안에서 따로 연 창(사진 크게 보기, 놀이 덮개)이 있으면 그쪽 몫이고,
  // 쓰던 글이 있는 입력칸에서는 먼저 칸에서만 나온다(실수로 쓰던 쪽지를 잃지 않게). 한글 조합 중이면 무시
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
      const c = card.current;
      // (라우터가 숨겨 둔 앞 시트 페이지 안의 것은 치지 않는다: 그려진 것만)
      const inner = c ? [...c.querySelectorAll<HTMLElement>('[aria-modal="true"], .play-root')].some((el) => el.getClientRects().length > 0) : false;
      if (document.querySelector('dialog[open]') || inner) return;
      const t = e.target;
      if (t instanceof HTMLElement && c?.contains(t) && isEditingTarget(t) && hasText(t)) {
        e.preventDefault();
        t.blur();
        c.focus({ preventScroll: true });
        return;
      }
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // 시트 안의 링크: 걷기로 가는 것은 닫기, 다른 시트 주소는 기록을 쌓지 않고 바꿔 단다, 그 밖은 보통 이동
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href]');
    if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const go = sheetLink(a.href, window.location.href);
    if (go.kind === 'none') return;
    e.preventDefault();
    if (go.kind === 'close') close();
    else router.replace(go.to);
  };

  return (
    <div className="walk-sheet" hidden={!open}>
      {/* 바깥(어두운 곳)을 누르면 닫힌다. 화면 낭독기에는 닫기 단추가 그 몫을 한다 */}
      <div className="walk-sheet-backdrop" aria-hidden="true" onClick={close} />
      {/* 틀은 늘 붙어 있다(시트 페이지가 이 안에 붙어야 열린다): 닫힌 동안에는 대화상자로 치지 않는다 */}
      <div
        ref={card}
        className="walk-sheet-card"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? title || tr('페이지', 'Page') : undefined}
        tabIndex={-1}
        onKeyDown={trapTab}
        onClickCapture={onClickCapture}
      >
        <div className="walk-sheet-head">
          <p className="walk-sheet-title" lang={lang === 'en' && /[가-힣]/.test(title) ? 'ko' : undefined}>{title}</p>
          <button type="button" className="walk-sheet-close" onClick={close} aria-label={tr('닫고 걷기로 돌아가기', 'Close and go back to walking')} aria-keyshortcuts={ariaKey('menu')}>
            <IconClose size={18} />
            <span><T ko="걷기로" en="Back to walk" /></span>
            <KeyHint id="menu" />
          </button>
        </div>
        <div className="walk-sheet-body">{children}</div>
      </div>
    </div>
  );
}
