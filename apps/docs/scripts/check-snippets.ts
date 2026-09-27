/**
 * Type-checks the code examples in the guides against the real packages (`pnpm check:snippets`).
 * A ```ts / ```tsx block counts as a complete example when it starts with `import` or
 * `'use client'`; shorter fragments (a single JSX line) are left alone.
 * TypeScript, run directly by Node 24.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const docs = join(import.meta.dirname, '..');
const out = join(docs, '.snippets');

function mdxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return mdxFiles(path);
    return name.endsWith('.mdx') ? [path] : [];
  });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
const sources: Record<string, string> = {};
let count = 0;
for (const file of mdxFiles(join(docs, 'app'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/```(tsx?)\n([\s\S]*?)```/g)) {
    const [, lang, code] = match as unknown as [string, string, string];
    if (!/^\s*(import |'use client')/.test(code)) continue;
    const name = `snippet-${++count}.${lang}`;
    // Each example is its own module.
    writeFileSync(join(out, name), `${code}\nexport {};\n`);
    const line = text.slice(0, match.index).split('\n').length + 1;
    sources[name] = `${relative(docs, file)}:${line}`;
  }
}
// Frameworks (Next.js, Vite) declare CSS imports; so do we.
writeFileSync(join(out, 'css.d.ts'), "declare module '*.css';\n");
writeFileSync(
  join(out, 'tsconfig.json'),
  JSON.stringify({
    extends: '../tsconfig.json',
    compilerOptions: { incremental: false, noUnusedLocals: false },
    include: ['./*.ts', './*.tsx'],
  }),
);

try {
  execFileSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', out], { cwd: docs, encoding: 'utf8' });
  console.log(`✓ ${count} code examples type-check`);
} catch (error) {
  const output = String((error as { stdout?: string }).stdout ?? error);
  // Point errors at the guide, not the generated file.
  console.error(
    output.replace(/\.snippets\/(snippet-\d+\.tsx?)/g, (_, n: string) => sources[n] ?? n),
  );
  process.exit(1);
}
