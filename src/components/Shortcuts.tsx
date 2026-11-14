'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PALETTE_OPEN_EVENT } from '@/components/NavLinks';
import { HELP_ROWS, PALETTE_BASE, PALETTE_GAMES_GROUP, PALETTE_SPOTS_GROUP, type PaletteWords } from '@/components/site-words';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { isSheetOpen, subscribeSheet } from '@/components/walk/sheet-state';
import { GAMES } from '@/games/registry';
import { tr } from '@/lib/i18n';
import { isModalOpen, letterOf, shouldHandleShortcut } from '@/lib/keys';
import { placeEn } from '@/lib/place-names';
import { STAMP_SPOTS } from '@/lib/stamp-rally';
import { getEffectiveTheme, setSiteTheme } from '@/lib/theme';

const LETTER_MAP: Record<string, string> = {
  h: '/',
  m: '/map',
  g: '/walk',
  p: '/games',
  b: '/guestbook',
  l: '/gallery',
  c: '/avatar',
  e: '/exhibit',
  n: '/notebook',
};

const NUM_ROUTES = ['/', '/map', '/walk', '/games', '/guestbook', '/gallery', '/avatar', '/exhibit', '/notebook'];
const SINGLE_KEY_PREF = 'jy.shortcuts.single';

// 팔레트 줄(한국어·영어). 첫 화면들의 말은 site-words.ts에 있다. 작은 놀이는 놀이 목록(games/registry)의 이름·설명과
// 영어 이름·설명(titleEn, blurbEn: 놀이 목록 화면·놀이 덮개와 같은 말)을 쓴다. 도장 투어 자리는 그 데이터의 이름과 소개를 쓰고,
// 영어 이름은 장소 이름 표(lib/place-names)로(모르면 한국어 그대로), 영어 소개는 지점마다 둔 en.charm으로 옮긴다
type PaletteEntry = PaletteWords;

const GAME_ENTRIES: PaletteEntry[] = Object.values(GAMES).map((g) => ({
  id: `game-${g.id}`,
  group: PALETTE_GAMES_GROUP[0],
  groupEn: PALETTE_GAMES_GROUP[1],
  title: g.title,
  titleEn: g.titleEn,
  sub: g.blurb,
  subEn: g.blurbEn,
  href: `/games/${g.id}`,
}));

const SPOT_ENTRIES: PaletteEntry[] = STAMP_SPOTS.map((s) => ({
  id: `spot-${s.slug}`,
  group: PALETTE_SPOTS_GROUP[0],
  groupEn: PALETTE_SPOTS_GROUP[1],
  title: `${s.order}. ${s.name}`,
  titleEn: `${s.order}. ${placeEn(s.name)}`,
  sub: s.charm,
  subEn: s.en.charm,
  href: `/room/${s.slug}`,
}));

const ALL_ENTRIES: PaletteEntry[] = [...PALETTE_BASE, ...GAME_ENTRIES, ...SPOT_ENTRIES];

/** 지금 말로 보이는 글. 영어가 한국어 그대로(옮긴 말이 없음)면 ko: true(lang="ko"로 둔다) */
function shown(lang: 'ko' | 'en', ko: string, en: string): { text: string; ko: boolean } {
  if (lang === 'ko') return { text: ko, ko: false };
  const text = tr(lang, ko, en);
  return { text, ko: text === ko && /[가-힣]/.test(ko) };
}

export function Shortcuts() {
  const router = useRouter();
  const path = usePathname();
  const helpRef = useRef<HTMLDialogElement>(null);
  const paletteRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [singleKeys, setSingleKeys] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem(SINGLE_KEY_PREF) !== 'off';
    } catch {
      return true;
    }
  });

  const sheet = useSyncExternalStore(subscribeSheet, isSheetOpen, () => false);
  const off = path.startsWith('/walk') || sheet;

  const openPalette = useCallback(() => {
    setQuery('');
    setCursor(0);
    if (!paletteRef.current?.open) paletteRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const onOpenEvt = () => openPalette();
    window.addEventListener(PALETTE_OPEN_EVENT, onOpenEvt);
    return () => window.removeEventListener(PALETTE_OPEN_EVENT, onOpenEvt);
  }, [openPalette]);

  useEffect(() => {
    if (off) return;
    function onKey(e: KeyboardEvent) {
      if (e.isComposing || e.keyCode === 229) return;

      // Cmd+K / Ctrl+K 빠른 이동 팔레트. 열려 있으면 닫고, 다른 창이 떠 있으면(놀이 덮개 등) 그 위에 열지 않는다
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && letterOf(e) === 'k') {
        if (paletteRef.current?.open) {
          e.preventDefault();
          paletteRef.current.close();
          return;
        }
        if (isModalOpen(document)) return;
        e.preventDefault();
        openPalette();
        return;
      }

      // 아래 단축키는 창이 떠 있는 동안 쉰다. 놀이 덮개는 <dialog>가 아니라 role="dialog" aria-modal="true"인 div라서
      // 함께 본다: 놀이가 숫자 키(생각 지도·누구의 문장·문장 걸기)와 글자 키(건반 E G H L T)를 쓰므로, 놀이 도중에
      // 다른 화면으로 넘어가거나 테마가 바뀌면 안 된다
      if (isModalOpen(document)) return;

      // Ctrl + 1..9 번호 이동 (입력창 밖)
      if (e.ctrlKey && !e.metaKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        if (!shouldHandleShortcut(e)) return;
        const target = NUM_ROUTES[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!shouldHandleShortcut(e)) return;

      if (e.key === '?') {
        e.preventDefault();
        helpRef.current?.showModal();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        openPalette();
        return;
      }

      if (!singleKeys) return;

      if (/^[1-9]$/.test(e.key)) {
        const target = NUM_ROUTES[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }

      if (letterOf(e) === 't') {
        e.preventDefault();
        setSiteTheme(getEffectiveTheme() === 'dark' ? 'light' : 'dark');
        return;
      }
      const to = LETTER_MAP[letterOf(e)];
      if (to) {
        e.preventDefault();
        router.push(to);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, off, openPalette, singleKeys]);

  // 찾기는 지금 보이는 말로 한다(영어 화면에서는 영어 이름, 옮긴 말이 없는 것은 한국어)
  const lang = useLang();
  const filtered = useMemo(() => {
    const q = query.normalize('NFC').trim().toLowerCase();
    if (!q) return ALL_ENTRIES.slice(0, 15);
    return ALL_ENTRIES.filter((it) => {
      const words = lang === 'en' ? `${tr(lang, it.title, it.titleEn)} ${it.subEn} ${it.groupEn}` : `${it.title} ${it.sub} ${it.group}`;
      return words.normalize('NFC').toLowerCase().includes(q);
    });
  }, [query, lang]);

  const safeCursor = filtered.length ? Math.min(cursor, filtered.length - 1) : 0;

  const goEntry = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    paletteRef.current?.close();
    if (entry.href === '#theme:light') {
      setSiteTheme('light');
      return;
    }
    if (entry.href === '#theme:dark') {
      setSiteTheme('dark');
      return;
    }
    router.push(entry.href);
  };

  const toggleSingle = (next: boolean) => {
    setSingleKeys(next);
    try {
      localStorage.setItem(SINGLE_KEY_PREF, next ? 'on' : 'off');
    } catch {
      // 무시
    }
  };

  return (
    <>
      {/* 빠른 이동 명령 팔레트 (/ 또는 ⌘K) */}
      <dialog
        ref={paletteRef}
        className="cmd-palette"
        aria-label={tr(lang, '빠른 이동 검색', 'Quick search')}
        onClick={(e) => {
          if (e.target === paletteRef.current) paletteRef.current.close();
        }}
      >
        <div className="cmd-palette-inner">
          <div className="cmd-palette-head">
            <input
              ref={inputRef}
              type="search"
              className="cmd-palette-input"
              placeholder={tr(lang, '어디로 갈까요? (방 이름, 작은 놀이, 방명록…)', 'Where to? (rooms, mini games, guestbook…)')}
              aria-label={tr(lang, '이동할 메뉴나 방 검색', 'Search pages and rooms')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onCompositionEnd={(e) => {
                setQuery((e.target as HTMLInputElement).value);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => (filtered.length ? (c + 1) % filtered.length : 0));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => (filtered.length ? (c - 1 + filtered.length) % filtered.length : 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  goEntry(filtered[safeCursor]);
                }
              }}
            />
            <button type="button" className="btn btn-small" onClick={() => paletteRef.current?.close()}>
              Esc
            </button>
          </div>

          <ul className="cmd-palette-list" role="listbox" aria-label={tr(lang, '검색 결과', 'Results')}>
            {filtered.length === 0 ? (
              <li className="cmd-palette-empty">
                <T ko="일치하는 공간이나 놀이를 찾지 못했어요." en="No matching room or game." />
              </li>
            ) : (
              filtered.map((item, idx) => {
                const title = shown(lang, item.title, item.titleEn);
                return (
                  <li key={item.id} role="option" aria-selected={idx === safeCursor}>
                    <button
                      type="button"
                      className="cmd-palette-item"
                      data-active={idx === safeCursor || undefined}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => goEntry(item)}
                    >
                      <div>
                        <span className="cmd-palette-group">{tr(lang, item.group, item.groupEn)}</span>
                        <strong className="cmd-palette-title" lang={title.ko ? 'ko' : undefined}>{title.text}</strong>
                        <span className="cmd-palette-sub">{lang === 'en' ? item.subEn : item.sub}</span>
                      </div>
                      {item.hint ? <kbd className="cmd-palette-kbd">{item.hint}</kbd> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </dialog>

      {/* ? 단축키 안내 창 */}
      <dialog
        ref={helpRef}
        className="help-dialog"
        aria-label={tr(lang, '단축키 안내', 'Keyboard shortcuts')}
        onClick={(e) => {
          if (e.target === helpRef.current) helpRef.current.close();
        }}
      >
        <h2 style={{ marginTop: 0 }}><T ko="키보드 단축키" en="Keyboard shortcuts" /></h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          <T
            ko="입력칸 밖에서 바로 화면을 옮겨 다닐 수 있어요. (3D 걷기 안에서는 걷기 조작키가 우선해요)"
            en="Outside a text box, jump straight between pages. (In the 3D walk, the walk controls come first.)"
          />
        </p>
        {/* 키 글자는 두 말이 같다. 「또는」만 옮긴다 */}
        <ul className="shortcut-grid">
          {HELP_ROWS.map((row) => (
            <li key={row.keys.join(' ')}>
              {row.keys.map((k, i) => (
                <Fragment key={k}>
                  {i ? (row.or ? <>{' '}<T ko="또는" en="or" />{' '}</> : ' · ') : null}
                  <kbd>{k}</kbd>
                </Fragment>
              ))}{' '}
              <span><T ko={row.ko} en={row.en} /></span>
            </li>
          ))}
        </ul>
        <label className="choice" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={singleKeys}
            onChange={(e) => toggleSingle(e.target.checked)}
          />
          <span className="small">
            <T ko="한 글자·숫자 단축키(1~9, H·M·G…) 사용하기" en="Use single-key shortcuts (1 to 9, H, M, G…)" />
          </span>
        </label>
        <form method="dialog" style={{ marginTop: 12 }}>
          <button className="btn btn-small"><T ko="닫기" en="Close" /></button>
        </form>
      </dialog>
    </>
  );
}
