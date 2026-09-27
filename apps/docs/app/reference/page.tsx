import type { Metadata } from 'next';
import api from './api.json';
import { Doc } from './Doc';
import { highlight } from '../highlight';
import type { ApiItem, ApiKind, ApiPackage } from '../../scripts/generate-api';

export const metadata: Metadata = { title: 'API reference' };

const GROUPS: [ApiKind, string][] = [
  ['component', 'Components'],
  ['hook', 'Hooks'],
  ['function', 'Functions'],
  ['class', 'Classes'],
  ['constant', 'Constants'],
  ['type', 'Types'],
];

const packages = api as ApiPackage[];
const slug = (pkg: string) => pkg.replace('@image-ultra/', '');
const anchor = (pkg: string, name: string) => `${slug(pkg)}-${name}`;

/** d.ts files indent with 4 spaces; show 2 like the rest of the docs. */
const tidy = (code: string) => code.replace(/^((?: {4})+)/gm, (s) => ' '.repeat(s.length / 2));

export default function ReferencePage() {
  return (
    <>
      <h1>API reference</h1>
      <p>
        Generated from the published TypeScript declarations, so it always matches the package. Most
        apps only need <code>@image-ultra/react</code>; it re-exports the parts of{' '}
        <code>@image-ultra/core</code> you&apos;re likely to use.
      </p>
      {packages.map((pkg) => (
        <section key={pkg.name} aria-labelledby={slug(pkg.name)}>
          <h2 id={slug(pkg.name)}>
            <code>{pkg.name}</code>
          </h2>
          <nav className="api-index" aria-label={`${pkg.name} exports`}>
            {GROUPS.map(([kind, title]) => {
              const items = pkg.items.filter((i) => i.kind === kind);
              if (items.length === 0) return null;
              return (
                <div key={kind}>
                  <p className="api-index__title">{title}</p>
                  {items.map((item) => (
                    <a
                      key={item.name}
                      href={`#${anchor(item.fromCore ? '@image-ultra/core' : pkg.name, item.name)}`}
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
              );
            })}
          </nav>
          {GROUPS.map(([kind, title]) => {
            const items = pkg.items.filter((i) => i.kind === kind && !i.fromCore);
            if (items.length === 0) return null;
            return (
              <div key={kind}>
                <h3 className="api-group">{title}</h3>
                {items.map((item) => (
                  <Entry key={item.name} pkg={pkg.name} item={item} />
                ))}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

async function Entry({ pkg, item }: { pkg: string; item: ApiItem }) {
  const html = await highlight(tidy(item.declaration));
  return (
    <article className="api-item" id={anchor(pkg, item.name)}>
      <h4>
        <a href={`#${anchor(pkg, item.name)}`}>
          <code>{item.name}</code>
        </a>
      </h4>
      {item.doc && <Doc text={item.doc} />}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
