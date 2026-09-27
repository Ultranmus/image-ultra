import type { ReactNode } from 'react';
import { Sidebar } from '../Sidebar';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs">
      <Sidebar />
      <main id="content" className="prose">
        {children}
      </main>
    </div>
  );
}
