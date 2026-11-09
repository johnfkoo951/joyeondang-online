'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/map', label: '집 지도', key: 'M' },
  { href: '/walk', label: '집 안 걷기', key: 'G' },
  { href: '/exhibit', label: '전시', key: 'E' },
  { href: '/notebook', label: '수첩', key: 'N' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="주요 메뉴">
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`) || (l.href === '/map' && path.startsWith('/room/'));
        return (
          <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined} aria-keyshortcuts={l.key}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
