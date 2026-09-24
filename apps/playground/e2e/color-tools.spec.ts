import { expect, test, type Page } from '@playwright/test';
import { editState, historySteps, openEditor, type TestHook } from './support/editor';

async function openTool(page: Page, name: 'Finetune' | 'Filter') {
  await openEditor(page);
  await page.getByRole('tab', { name }).click();
}

test.describe('Finetune tool', () => {
  test('pick an adjustment chip and set it with the dial', async ({ page }) => {
    await openTool(page, 'Finetune');
    await page.getByRole('radio', { name: 'Contrast' }).click();
    const dial = page.getByRole('slider', { name: 'Contrast' });
    await dial.focus();
    await page.keyboard.press('Shift+ArrowRight'); // +50 (tick 5 × 10)
    await expect(dial).toHaveAttribute('aria-valuenow', '50');
    expect((await editState(page)).finetune.contrast).toBeCloseTo(0.5, 5);
  });

  test('Auto-enhance applies levels + colour fixes as one undo step', async ({ page }) => {
    await openTool(page, 'Finetune');
    await page.getByRole('button', { name: 'Auto' }).click();
    await expect.poll(() => historySteps(page)).toBe(1);
    const state = await editState(page);
    const changed =
      state.levels.black !== 0 ||
      state.levels.white !== 1 ||
      state.levels.mid !== 0 ||
      state.finetune.vibrance !== 0;
    expect(changed).toBe(true);
    await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
    expect((await editState(page)).finetune.vibrance).toBe(0);
  });

  test('clicking the curve adds a point; Delete removes it', async ({ page }) => {
    await openTool(page, 'Finetune');
    await page.getByRole('radio', { name: 'Curves' }).click();
    const graph = page.locator('.iu-curves__graph');
    const box = (await graph.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    let rgb = (await editState(page)).curves.rgb;
    expect(rgb).toHaveLength(3);
    expect(rgb[1]![1]).toBeGreaterThan(0.6);
    await page.getByRole('slider', { name: 'Curve point 2' }).focus();
    await page.keyboard.press('Delete');
    rgb = (await editState(page)).curves.rgb;
    expect(rgb).toHaveLength(2);
  });

  test('levels handles are keyboard accessible', async ({ page }) => {
    await openTool(page, 'Finetune');
    await page.getByRole('radio', { name: 'Levels' }).click();
    await page.getByRole('slider', { name: 'Black point' }).focus();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await editState(page)).levels.black).toBeCloseTo(10 / 255, 4);
  });
});

test.describe('Filter tool', () => {
  test('a filter applies with adjustable intensity and exports', async ({ page }) => {
    await openTool(page, 'Filter');
    await page.getByRole('radio', { name: 'Noir' }).click();
    await expect(page.getByRole('radio', { name: 'Noir' })).toHaveAttribute('aria-checked', 'true');
    const dial = page.getByRole('slider', { name: 'Intensity' });
    await dial.focus();
    await page.keyboard.press('Shift+ArrowLeft');
    const state = await editState(page);
    expect(state.filter?.id).toBe('noir');
    expect(state.filter?.intensity).toBeCloseTo(0.5, 5);

    await page.getByRole('radio', { name: 'Original' }).click();
    expect((await editState(page)).filter).toBeNull();
  });

  test('a saved look shows up, re-applies, survives a reload, and can be removed', async ({
    page,
  }) => {
    await openTool(page, 'Finetune');
    await page.evaluate(() => localStorage.removeItem('image-ultra:looks'));
    await page.getByRole('radio', { name: 'Saturation' }).click();
    await page.getByRole('slider', { name: 'Saturation' }).focus();
    await page.keyboard.press('Shift+ArrowLeft');
    await page.getByRole('button', { name: 'Save look' }).click();
    await page.getByLabel('Look name').fill('Muted');
    await page.keyboard.press('Enter');

    // Confirmation with a shortcut to where looks live.
    await expect(page.getByRole('status').filter({ hasText: 'Saved “Muted”' })).toBeVisible();
    await page.getByRole('button', { name: 'View in Filters' }).click();
    await expect(page.getByRole('tab', { name: 'Filter' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const look = page.getByRole('radio', { name: 'Muted' });
    await expect(look).toHaveAttribute('aria-checked', 'true'); // current state matches the look
    // Own looks come right after "Original", before the presets.
    const names = await page.locator('.iu-presets--thumbs .iu-chip__label').allInnerTexts();
    expect(names.slice(0, 3)).toEqual(['Original', 'Muted', 'Vivid']);

    // Reset colour, then re-apply the look.
    await page.evaluate(() => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      editor.update('clear', (s) => {
        s.finetune.saturation = 0;
      });
    });
    await expect(look).toHaveAttribute('aria-checked', 'false');
    await look.click();
    expect((await editState(page)).finetune.saturation).toBeCloseTo(-0.5, 5);

    // Persisted in localStorage.
    await page.reload();
    await page.getByRole('tab', { name: 'Filter' }).click();
    await expect(page.getByRole('radio', { name: 'Muted' })).toBeVisible();

    // Delete removes it.
    await page.getByRole('radio', { name: 'Muted' }).focus();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('radio', { name: 'Muted' })).toHaveCount(0);
  });
});
