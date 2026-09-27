import type { ReactNode } from 'react';
import { Sidebar } from '../Sidebar';

export default function ReferenceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs">
      <Sidebar />
      <main id="content" className="prose prose--wide">
        {children}
      </main>
    </div>
  );
}
