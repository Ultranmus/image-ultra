import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BenchResult, PhotoSize } from '../app/bench/bench';

interface BenchHook {
  run(sizes: PhotoSize[]): Promise<BenchResult[]>;
  toMarkdown(results: BenchResult[]): string;
}

/** `BENCH_SIZES=24MP pnpm bench` runs only some sizes. */
const SIZES = (process.env['BENCH_SIZES']?.split(',') ?? ['12MP', '24MP', '48MP']) as PhotoSize[];

test('benchmark', async ({ page }, info) => {
  await page.goto('/bench');
  await page.waitForFunction(() => (window as { __bench?: unknown }).__bench);
  const markdown = await page.evaluate(async (sizes) => {
    const bench = (window as unknown as { __bench: BenchHook }).__bench;
    return bench.toMarkdown(await bench.run(sizes));
  }, SIZES);
  expect(markdown).toContain('First paint');
  mkdirSync('test-results/bench', { recursive: true });
  writeFileSync(`test-results/bench/${info.project.name}.md`, `${markdown}\n`);
  console.log(`\n── ${info.project.name} ──\n${markdown}\n`);
});
