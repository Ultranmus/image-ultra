import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// The editor's stylesheet, once for the whole app.
import '@image-ultra/react/styles.css';
import './app.css';

export const metadata: Metadata = { title: 'image-ultra · Next.js example' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
