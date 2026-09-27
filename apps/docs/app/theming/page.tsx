import type { Metadata } from 'next';
import { ThemePlayground } from './ThemePlayground';

export const metadata: Metadata = { title: 'Theme playground' };

export default function Page() {
  return (
    <main id="content" className="playground">
      <h1>Theme playground</h1>
      <p className="playground__intro">
        Change colours, corners and font; the editor updates live. Copy the result as props or CSS.
        See <a href="/docs/theming">Theming</a> for how it works.
      </p>
      <ThemePlayground />
    </main>
  );
}
