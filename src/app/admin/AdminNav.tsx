'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import css from './admin-suite.module.css';

const ADMIN_TABS = [
  { href: '/admin', label: '운영 허브', exact: true },
  { href: '/admin/members', label: '멤버·초대 관리' },
  { href: '/admin/records', label: '글·방명록 관리' },
  { href: '/admin/rooms', label: '공간·QR·행사 운영' },
  { href: '/admin/characters', label: '캐릭터 관리' },
  { href: '/admin/control', label: '3D 컨트롤 룸' },
];

export function AdminNav() {
  const path = usePathname();
  // 3D 컨트롤 룸은 전체 화면 격자 레이아웃을 쓰므로 상단 바를 두지 않는다
  if (path.startsWith('/admin/control')) return null;

  return (
    <div className={css.navWrap}>
      <div className={`wrap-wide ${css.navBar}`}>
        <span className={css.navBrand}>조연당 관리실</span>
        <nav className={css.navTabs} aria-label="관리자 메뉴">
          {ADMIN_TABS.map((tab) => {
            const active = tab.exact ? path === tab.href : path === tab.href || path.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={css.navTab}
                aria-current={active ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
