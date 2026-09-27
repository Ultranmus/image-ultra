import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dragOnStage, openEditor, stagePoint } from './support/editor';

/** WCAG 2.2 A + AA (axe tags). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** axe problems inside the editor (popovers render in its portal), as short readable lines. */
async function problems(page: Page, state: string): Promise<string[]> {
  // Let enter transitions finish, so colours are measured at rest.
  await page.waitForTimeout(250);
  const result = await new AxeBuilder({ page }).include('.iu-root').withTags(TAGS).analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => `${state} · ${v.id} · ${n.target.join(' ')} · ${n.failureSummary ?? ''}`),
  );
}

async function tool(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}

async function closePopover(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

/** Every tool, mode, selection and popover the editor can show. */
async function walk(page: Page): Promise<string[]> {
  const found: string[] = [];
  const check = async (state: string) => found.push(...(await problems(page, state)));

  await tool(page, 'Adjust');
  await check('Adjust');
  await tool(page, 'Finetune');
  await check('Finetune · Adjust');
  await page.getByRole('radio', { name: 'Curves' }).click();
  await check('Finetune · Curves');
  await page.getByRole('radio', { name: 'Levels' }).click();
  await check('Finetune · Levels');
  await tool(page, 'Filter');
  await check('Filter');
  await tool(page, 'Frame');
  await check('Frame');
  await tool(page, 'Fill');
  await check('Fill');
  await tool(page, 'Resize');
  await check('Resize · Size');
  await page.getByRole('radio', { name: 'Canvas' }).click();
  await check('Resize · Canvas');
  await tool(page, 'Watermark');
  await page.getByRole('radio', { name: 'Text' }).click();
  await check('Watermark · Text');
  await page.getByRole('radio', { name: 'Logo' }).click();
  await check('Watermark · Logo');
  await page.getByRole('radio', { name: 'None' }).click();
  await tool(page, 'Sticker');
  await check('Sticker · Stickers');
  await page.getByRole('radio', { name: 'Emoji' }).click();
  await check('Sticker · Emoji');

  await tool(page, 'Redact');
  await page.evaluate(() => scrollTo(0, 0));
  await dragOnStage(page, [0.3, 0.45], [0.45, 0.55]);
  await check('Redact · area selected');
  await page.getByRole('radio', { name: 'Solid' }).click();
  await check('Redact · Solid');

  await tool(page, 'Annotate');
  await page
    .getByRole('radio', { name: /Rectangle/ })
    .evaluate((el) => (el as HTMLElement).click());
  await page.evaluate(() => scrollTo(0, 0));
  await dragOnStage(page, [0.55, 0.45], [0.7, 0.55]);
  await check('Annotate · shape selected');
  await page.getByRole('button', { name: 'Colour' }).first().click();
  await check('Annotate · colour picker');
  await closePopover(page);

  // Right-click the shape: its menu.
  const p = await stagePoint(page, 0.62, 0.5);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await check('Annotate · shape menu');
  await closePopover(page);

  await page.getByRole('button', { name: 'Layers' }).click();
  await check('Layers panel');
  await page.getByRole('button', { name: 'Layers' }).click();

  await page.getByRole('button', { name: 'History' }).click();
  await check('History');
  await closePopover(page);

  const shortcuts = page.getByRole('button', { name: 'Keyboard shortcuts' });
  if (await shortcuts.isVisible()) {
    await shortcuts.click();
    await check('Shortcuts');
    await closePopover(page);
  }
  return found;
}

for (const theme of ['dark', 'light'] as const) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    test(`no accessibility problems · ${theme} · ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await openEditor(page);
      if (theme === 'light') {
        const settings = page.getByRole('button', { name: 'Settings' });
        if (await settings.isVisible()) await settings.click();
        await page.getByRole('combobox', { name: 'Theme' }).selectOption('light');
        if (await settings.isVisible()) await settings.click();
      }
      expect(await walk(page)).toEqual([]);
    });
  }
}

test('no accessibility problems · right-to-left · 1280px', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  await page.getByRole('combobox', { name: 'Direction' }).selectOption('rtl');
  await expect(page.locator('.iu-root')).toHaveAttribute('dir', 'rtl');
  expect(await walk(page)).toEqual([]);
});
