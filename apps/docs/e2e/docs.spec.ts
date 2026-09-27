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

test('the live editor previews at tablet / phone width and opens full screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const demo = page.locator('.home .demo');
  const frame = demo.locator('.demo__frame');
  await expect(demo.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout: 30_000 });

  await demo.getByRole('button', { name: 'Phone' }).click();
  await expect(demo.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await frame.boundingBox())!.width).toBe(390);
  await demo.getByRole('button', { name: 'Tablet' }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBe(820);

  await demo.getByRole('button', { name: 'Full screen' }).click();
  await expect.poll(async () => (await demo.boundingBox())!.height).toBe(800);
  await expect.poll(async () => (await frame.boundingBox())!.width).toBe(1280);
  await demo.getByRole('button', { name: 'Close full screen' }).click();
  await expect(demo.getByRole('button', { name: 'Full screen' })).toBeVisible();
  await expect.poll(async () => (await demo.boundingBox())!.height).toBeLessThan(800);
  // Back to the size picked before.
  await expect(demo.getByRole('button', { name: 'Tablet' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Phones get no preview sizes, only full screen.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(demo.getByRole('button', { name: 'Phone' })).toBeHidden();
  await expect(demo.getByRole('button', { name: 'Full screen' })).toBeVisible();
});

test('without the Fullscreen API (iPhone Safari) full screen is an overlay; Esc closes it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // @ts-expect-error — removing it on purpose, like iPhone Safari
    delete Element.prototype.requestFullscreen;
  });
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/');
  const demo = page.locator('.home .demo');
  await expect(demo.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout: 30_000 });
  await demo.getByRole('button', { name: 'Full screen' }).click();
  expect(await demo.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 760 });
  // The page behind doesn't scroll.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
    'hidden',
  );
  await page.keyboard.press('Escape');
  await expect(demo.getByRole('button', { name: 'Full screen' })).toBeVisible();
  expect((await demo.boundingBox())!.height).toBeLessThan(760);
});
