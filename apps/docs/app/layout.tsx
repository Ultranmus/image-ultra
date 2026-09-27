import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import '@image-ultra/react/styles.css';
import './docs.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://imageultra.ashvattech.com'),
  title: { default: 'image-ultra — typed image editor for React', template: '%s · image-ultra' },
  description:
    'A free (MIT), fully typed image editor component for React and Next.js: crop, adjust, filter, annotate, redact and export.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="logo">
            image-ultra
          </Link>
          <nav aria-label="Site">
            <Link href="/docs/getting-started">Docs</Link>
            <Link href="/reference">API</Link>
            <Link href="/theming">Theming</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
