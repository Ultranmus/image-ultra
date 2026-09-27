import Link from 'next/link';
import { Demo } from './Demo';

const FEATURES = [
  [
    'Every tool you expect',
    'Crop, rotate, straighten, perspective, curves, levels, filters, shapes, text, redaction, stickers, frames, watermarks, resize.',
  ],
  [
    'Non-destructive',
    'Edits are versioned JSON. Save them, reopen them later, or re-render the photo on demand.',
  ],
  [
    'Typed end to end',
    'TypeScript strict, no `any` in the public API. Your editor autocompletes every prop and label.',
  ],
  [
    'Fast with big photos',
    'WebGL2 with a Canvas2D fallback. 60 fps with 48MP photos, on desktop and on iPhone.',
  ],
  [
    'Yours to theme',
    'CSS variables in a cascade layer, dark / light / auto, or a typed `themeOverrides` shortcut.',
  ],
  [
    'Accessible',
    'Keyboard and screen readers, reduced motion, high contrast — tested with axe against WCAG 2.2 AA.',
  ],
] as const;

export default function Home() {
  return (
    <main id="content" className="home">
      <section className="hero">
        <h1>A typed image editor for React</h1>
        <p>
          Free and MIT licensed. Drop it into Next.js, Vite or React Router — every edit is
          non-destructive JSON you can save and reopen.
        </p>
        <div className="hero__actions">
          <Link className="button" href="/docs/getting-started">
            Get started
          </Link>
          <Link className="button button--quiet" href="/theming">
            Theme it
          </Link>
          <code className="install">npm install @image-ultra/react</code>
        </div>
      </section>
      <Demo />
      <ul className="features">
        {FEATURES.map(([title, text]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{text.replace(/`/g, '')}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
