'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from './nav';

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="sidebar" aria-label="Docs">
      {NAV.map((section) => (
        <div key={section.title}>
          <p className="sidebar__title">{section.title}</p>
          <ul>
            {section.pages.map((page) => (
              <li key={page.href}>
                <Link href={page.href} aria-current={path === page.href ? 'page' : undefined}>
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
