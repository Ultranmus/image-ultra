/**
 * Serves the static export (`out/`) on port 3300 — for `pnpm start` and the e2e tests.
 * TypeScript, run directly by Node 24.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'out');
const port = Number(process.env['PORT'] ?? 3300);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function resolve(url: string): string | null {
  const path = normalize(decodeURIComponent(url.split('?')[0] ?? '/')).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [path, `${path}.html`, join(path, 'index.html')]) {
    const file = join(root, candidate);
    if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

createServer((req, res) => {
  const file = resolve(req.url ?? '/') ?? join(root, '404.html');
  res.writeHead(file.endsWith('404.html') && !req.url?.includes('404') ? 404 : 200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`docs on http://localhost:${port}`));
