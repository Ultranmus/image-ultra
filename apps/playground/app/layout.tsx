import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@image-ultra/react/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'image-ultra playground',
  description: 'Development playground for the image-ultra editor.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
