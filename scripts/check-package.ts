/**
 * `pnpm check:package` (Phase 8a): what npm users get must work. Run after `pnpm build`.
 *
 * 1. publint — package.json fields and files are right for publishing.
 * 2. "Are the types wrong" — every entry point resolves, with types, in every TS setup.
 * 3. Size budget — gzip sizes may not grow past the limits below without a decision.
 * 4. SSR import — both packages import in plain Node (no `window`, no `document`).
 * 5. No `any` in the published types.
 *
 * TypeScript, run directly by Node 24 (type stripping).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = join(import.meta.dirname, '..');
const KB = 1024;

interface PackageCheck {
  name: string;
  dir: string;
  /** Gzip budget per file group, in bytes. */
  budgets: { label: string; files: (file: string) => boolean; max: number }[];
  /** Entry points that aren't JavaScript (types don't apply). */
  skipTypes?: string[];
}

const PACKAGES: PackageCheck[] = [
  {
    name: '@image-ultra/core',
    dir: 'packages/core',
    // Both entries share chunks; the budget is the whole ESM build.
    budgets: [{ label: 'JS (ESM)', files: (f) => f.endsWith('.js'), max: 55 * KB }],
  },
  {
    name: '@image-ultra/react',
    dir: 'packages/react',
    budgets: [
      { label: 'JS (ESM)', files: (f) => f.endsWith('.js'), max: 95 * KB },
      { label: 'CSS', files: (f) => f.endsWith('.css'), max: 12 * KB },
    ],
    skipTypes: ['./styles.css'],
  },
];

const failures: string[] = [];
const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function step(label: string, check: () => void) {
  try {
    check();
    console.log(`✓ ${label}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const output = (error as { stdout?: string }).stdout ?? '';
    failures.push(`${label}\n${output || detail}`);
    console.log(`✗ ${label}`);
  }
}

for (const pkg of PACKAGES) {
  const dir = join(root, pkg.dir);
  const dist = join(dir, 'dist');

  step(`${pkg.name}: publint`, () => {
    const out = run('pnpm', ['exec', 'publint', '--strict', '.'], dir);
    if (/Errors?:|Warnings?:/.test(out)) throw Object.assign(new Error('publint'), { stdout: out });
  });

  step(`${pkg.name}: types resolve everywhere (attw)`, () => {
    const exclude = pkg.skipTypes?.length ? ['--exclude-entrypoints', ...pkg.skipTypes] : [];
    run('pnpm', ['exec', 'attw', '--pack', '.', '--format', 'ascii', ...exclude], dir);
  });

  for (const budget of pkg.budgets) {
    const files = readdirSync(dist).filter(budget.files);
    const size = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(dist, f))).length, 0);
    const label = `${pkg.name}: ${budget.label} ${(size / KB).toFixed(1)} KB gzip (budget ${budget.max / KB} KB)`;
    step(label, () => {
      if (size > budget.max)
        throw new Error(`over budget by ${((size - budget.max) / KB).toFixed(1)} KB`);
    });
  }

  step(`${pkg.name}: no \`any\` in the published types`, () => {
    const hits: string[] = [];
    for (const file of readdirSync(dist).filter((f) => /\.d\.c?ts$/.test(f))) {
      readFileSync(join(dist, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '');
          if (/^\s*(\*|\/\*\*)/.test(code)) return; // doc comments
          if (/\bany\b/.test(code)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    if (hits.length) throw Object.assign(new Error('any'), { stdout: hits.join('\n') });
  });
}

// Plain Node, no DOM: importing must not touch `window` / `document` (hard rule).
step('SSR: both packages import in plain Node (ESM + CJS)', () => {
  const script = `
    if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('DOM present');
    const core = await import('${join(root, 'packages/core/dist/index.js')}');
    await import('${join(root, 'packages/core/dist/internal.js')}');
    const react = await import('${join(root, 'packages/react/dist/index.js')}');
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    require('${join(root, 'packages/core/dist/index.cjs')}');
    require('${join(root, 'packages/react/dist/index.cjs')}');
    // Pure functions work on the server.
    const state = core.parseEditState(JSON.parse(JSON.stringify(core.createEditState())));
    if (state.version !== core.EDIT_STATE_VERSION) throw new Error('parseEditState');
    if (typeof react.ImageEditor !== 'object' && typeof react.ImageEditor !== 'function') throw new Error('ImageEditor');
  `;
  run(process.execPath, ['--input-type=module', '-e', script], join(root, 'packages/react'));
});

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log('\nAll package checks passed.');
