import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { NAV } from '../app/nav';

const PAGES = ['/', ...NAV.flatMap((section) => section.pages.map((page) => page.href))];

for (const path of PAGES) {
  test(`${path} loads, has a heading, no errors, no accessibility problems`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Pages with a live editor: wait until it's ready.
    const done = page.getByRole('button', { name: 'Done' });
    if ((await done.count()) > 0) {
      await expect(done.first()).toBeEnabled({ timeout: 30_000 });
      // Let fade-ins finish: axe measures colours as they are at that moment.
      await page.waitForTimeout(500);
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const problems = results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the reference lists every export and its links resolve', async ({ page }) => {
  await page.goto('/reference');
  await expect(page.locator('#react-ImageEditorProps')).toContainText('onSave');
  await expect(page.locator('#core-renderImage')).toContainText('Promise<ExportResult>');
  // Every index link points at an entry on the page.
  const targets = await page
    .locator('.api-index a')
    .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).hash.slice(1)));
  expect(targets.length).toBeGreaterThan(150);
  for (const id of targets) expect(await page.locator(`[id="${id}"]`).count(), id).toBe(1);
});

test('the theme playground restyles the editor and writes the code', async ({ page }) => {
  await page.goto('/theming');
  await expect(page.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout: 30_000 });
  await page.getByText('Light', { exact: true }).click();
  await page.getByRole('button', { name: 'Accent #0e7490' }).click();
  const accent = () =>
    page.evaluate(() =>
      getComputedStyle(document.querySelector('.iu-root')!).getPropertyValue('--iu-accent').trim(),
    );
  await expect.poll(accent).toBe('#0e7490');
  await expect(page.getByTestId('theme-code')).toContainText("accent: '#0e7490'");
  await expect(page.getByTestId('theme-code')).toContainText('theme="light"');
  await page.getByText('CSS', { exact: true }).click();
  await expect(page.getByTestId('theme-code')).toContainText('--iu-accent: #0e7490;');
});
