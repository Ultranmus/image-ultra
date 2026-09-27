import { expect, test, type Page } from '@playwright/test';
import { dragOnStage, openEditor } from './support/editor';

async function rtl(page: Page) {
  const settings = page.getByRole('button', { name: 'Settings' });
  if (await settings.isVisible()) await settings.click();
  await page.getByRole('combobox', { name: 'Direction' }).selectOption('rtl');
  if (await settings.isVisible()) await settings.click();
  await expect(page.locator('.iu-root')).toHaveAttribute('dir', 'rtl');
}

const box = async (page: Page, selector: string) =>
  (await page.locator(selector).first().boundingBox())!;

test.describe('Right-to-left', () => {
  test('the layout mirrors: rail on the right, Close on the right, Done on the left', async ({
    page,
  }) => {
    await openEditor(page);
    await rtl(page);
    const rail = await box(page, '.iu-rail');
    const stage = await box(page, '.iu-stage');
    expect(rail.x).toBeGreaterThan(stage.x + stage.width - 1);
    const cancel = await box(page, '.iu-topbar button[aria-label="Cancel"]');
    const done = await box(page, '.iu-topbar .iu-button[data-variant="primary"]');
    expect(cancel.x).toBeGreaterThan(done.x);
    // Undo sits to the right of Redo (the start of the row), and its arrow is mirrored.
    const undo = await box(page, '.iu-topbar__undo');
    const redo = await box(page, '.iu-topbar__redo');
    expect(undo.x).toBeGreaterThan(redo.x);
    expect(
      await page.locator('.iu-topbar__undo svg').evaluate((el) => getComputedStyle(el).transform),
    ).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  });

  test('the Layers panel opens on the left', async ({ page }) => {
    await openEditor(page);
    await rtl(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.4], [0.4, 0.5]);
    await page.locator('.iu-topbar').getByRole('button', { name: 'Layers' }).click();
    const panel = await box(page, '.iu-layers');
    const stage = await box(page, '.iu-stage');
    expect(panel.x - stage.x).toBeLessThan(stage.x + stage.width - (panel.x + panel.width));
  });

  test('← / → follow the row direction; sliders stay left-to-right', async ({ page }) => {
    await openEditor(page);
    await rtl(page);
    await page.getByRole('tab', { name: 'Finetune' }).click();
    const chips = page.getByRole('radiogroup', { name: 'Adjustments' });
    await chips.getByRole('radio', { name: 'Brightness' }).focus();
    await page.keyboard.press('ArrowLeft'); // the next chip sits to the left
    await expect(chips.getByRole('radio', { name: 'Contrast' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(chips.getByRole('radio', { name: 'Brightness' })).toBeFocused();

    const slider = page.getByRole('slider', { name: 'Brightness' });
    await slider.focus();
    await page.keyboard.press('ArrowRight'); // more, as in every language
    await expect(slider).toHaveAttribute('aria-valuenow', '5');
    // The ruler's scale isn't mirrored: its marker sits in the middle, values grow to the right.
    const viewport = await box(page, '.iu-ruler__viewport');
    const marker = await box(page, '.iu-ruler__marker');
    expect(Math.abs(marker.x + marker.width / 2 - (viewport.x + viewport.width / 2))).toBeLessThan(
      2,
    );
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the bottom tool rail: ← goes to the next tool', async ({ page }) => {
      await openEditor(page);
      await rtl(page);
      await page.getByRole('tab', { name: 'Adjust' }).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByRole('tab', { name: 'Finetune' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // The first tool is at the right end.
      const first = await box(page, '.iu-rail [role="tab"]');
      const rail = await box(page, '.iu-rail');
      expect(first.x).toBeGreaterThan(rail.x + rail.width / 2);
    });
  });
});
