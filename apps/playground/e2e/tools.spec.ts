import { expect, test } from '@playwright/test';
import { editState, exportAlpha, historySteps, openEditor } from './support/editor';

// Sample image is 2400 × 1600.

test.describe('Adjust tool', () => {
  test('dragging a corner handle resizes the crop as one undo step, then the view re-centres', async ({
    page,
  }) => {
    await openEditor(page);
    const box = page.locator('.iu-crop__box');
    const before = (await box.boundingBox())!;
    const handle = page.locator('.iu-crop__hit[data-handle="se"]');
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++)
      await page.mouse.move(h.x + h.width / 2 - i * 20, h.y + h.height / 2 - i * 15);
    await page.mouse.up();

    const state = await editState(page);
    expect(state.geometry.crop!.width).toBeLessThan(2400);
    expect(state.geometry.crop!.x).toBeCloseTo(0, 0); // anchored at the opposite corner
    expect(await historySteps(page)).toBe(1);

    // After release the smaller crop is animated back to fill the stage, centred.
    await page.waitForTimeout(500);
    const after = (await box.boundingBox())!;
    const centreBefore = before.x + before.width / 2;
    expect(Math.abs(after.x + after.width / 2 - centreBefore)).toBeLessThan(2);
  });

  test('dragging inside the crop moves the image and stops at the edges', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('radio', { name: '1:1' }).click();
    const start = (await editState(page)).geometry.crop!;
    const stage = (await page.locator('.iu-stage').boundingBox())!;
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2 + 2000, stage.y + stage.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    const moved = (await editState(page)).geometry.crop!;
    // Image dragged right → crop moves left, until it hits the left edge.
    expect(moved.x).toBeCloseTo(0, 0);
    expect(moved.y).toBeCloseTo(start.y, 0);
  });

  test('aspect chips crop to the ratio and Done exports it', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('radio', { name: '1:1' }).click();
    await expect(page.getByRole('radio', { name: '1:1' })).toHaveAttribute('aria-checked', 'true');
    const result = await exportAlpha(page);
    expect([result.width, result.height]).toEqual([1600, 1600]);
  });

  test('straightening auto-crops so no transparent corners are exported', async ({ page }) => {
    await openEditor(page);
    const dial = page.getByRole('slider', { name: 'Straighten' });
    await dial.focus();
    await page.keyboard.press('Shift+ArrowRight'); // +10°
    await expect(dial).toHaveAttribute('aria-valuenow', '10');
    const result = await exportAlpha(page);
    expect(result.corners).toEqual([255, 255, 255, 255]);
    expect(result.width).toBeLessThan(2400);
    expect(result.width / result.height).toBeCloseTo(1.5, 2);
  });

  test('perspective tilt also keeps the crop filled', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('radio', { name: 'Vertical' }).click();
    const dial = page.getByRole('slider', { name: 'Vertical' });
    await dial.focus();
    await page.keyboard.press('Shift+ArrowLeft');
    expect((await editState(page)).geometry.perspective.y).toBeCloseTo(-10 / 30, 5);
    const result = await exportAlpha(page);
    expect(result.corners).toEqual([255, 255, 255, 255]);
  });

  test('circle crop exports a round image with transparent corners', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('radio', { name: 'Circle' }).click();
    const result = await exportAlpha(page);
    expect(result.width).toBe(result.height);
    expect(result.corners).toEqual([0, 0, 0, 0]);
    expect(result.center).toBe(255);
  });

  test('rotate + flip + reset', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Rotate left' }).click();
    await page.getByRole('button', { name: 'Flip vertical' }).click();
    let g = (await editState(page)).geometry;
    expect([g.rotation, g.flipY]).toEqual([270, true]);
    await page.getByRole('button', { name: 'Reset', exact: true }).last().click();
    g = (await editState(page)).geometry;
    expect([g.rotation, g.flipY, g.crop]).toEqual([0, false, null]);
  });
});

test.describe('Resize tool', () => {
  test('typing a width keeps the aspect ratio', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Resize' }).click();
    const width = page.getByLabel('Width');
    await width.fill('800');
    await width.press('Enter');
    await expect(page.getByLabel('Height')).toHaveValue('533');
    const result = await exportAlpha(page);
    expect([result.width, result.height]).toEqual([800, 533]);
  });

  test('a social preset crops and resizes in one step', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Resize' }).click();
    await page.getByRole('radio', { name: 'Instagram 4:5' }).click();
    expect(await historySteps(page)).toBe(1);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('export-result')).toContainText('1080×1350');
  });

  test('upscaling shows a warning', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Resize' }).click();
    const width = page.getByLabel('Width');
    await width.fill('4800');
    await width.press('Enter');
    await expect(page.locator('.iu-resize__meta')).toHaveAttribute('data-warning', '');
  });
});
