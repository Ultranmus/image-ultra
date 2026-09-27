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
    // Some browsers add their own attributes to <html> before React loads (Chrome on iPhone adds
    // `__gcrremoteframetoken`): harmless, so don't warn about that one element.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
