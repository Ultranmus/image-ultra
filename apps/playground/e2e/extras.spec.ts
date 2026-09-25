import { expect, test, type Page } from '@playwright/test';
import { editState, historySteps, openEditor, type TestHook } from './support/editor';

const compare = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState().compare,
  );

async function makeEdits(page: Page) {
  await page.evaluate(() => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    editor.update('Saturation', (s) => {
      s.finetune.saturation = -1;
    });
    editor.update('Contrast', (s) => {
      s.finetune.contrast = 0.5;
    });
    editor.update('Rotate', (s) => {
      s.geometry.rotation = 90;
    });
  });
}

test.describe('Compare, history, shortcuts', () => {
  test('Compare: click toggles split view, the divider drags, the edit is untouched', async ({
    page,
  }) => {
    await openEditor(page);
    await makeEdits(page);
    const before = await editState(page);
    const button = page.getByRole('button', { name: /^Compare/ });

    await button.click();
    expect(await compare(page)).toBe(0.5);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.iu-stage__before')).not.toHaveAttribute('data-hidden');
    await expect(page.getByText('Before', { exact: true })).toBeVisible();
    await expect(page.getByText('After', { exact: true })).toBeVisible();

    const stage = (await page.locator('.iu-stage').boundingBox())!;
    const handle = (await page.locator('.iu-compare__handle').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width * 0.25, handle.y, { steps: 4 });
    await page.mouse.up();
    expect(await compare(page)).toBeCloseTo(0.25, 1);

    // Keyboard on the divider.
    await page.getByRole('slider', { name: 'Before / after divider' }).press('ArrowRight');
    expect(await compare(page)).toBeCloseTo(0.27, 2);

    expect(await editState(page)).toEqual(before); // compare never touches the edit
    await button.click();
    expect(await compare(page)).toBeNull();
    await expect(page.locator('.iu-stage__before')).toHaveAttribute('data-hidden', '');
  });

  test('holding \\ or the Compare button shows the whole original, then returns', async ({
    page,
  }) => {
    await openEditor(page);
    await makeEdits(page);
    await page.getByRole('tab', { name: 'Finetune' }).click();
    await page.getByRole('tab', { name: 'Finetune' }).focus();
    await page.keyboard.down('\\');
    expect(await compare(page)).toBe(1);
    await expect(page.locator('.iu-compare__divider')).toHaveCount(0);
    await page.keyboard.up('\\');
    expect(await compare(page)).toBeNull();

    const button = (await page.getByRole('button', { name: /^Compare/ }).boundingBox())!;
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await expect.poll(() => compare(page)).toBe(1);
    await page.mouse.up();
    expect(await compare(page)).toBeNull(); // a hold doesn't leave split view on
  });

  test('History: lists every step and jumps back and forward', async ({ page }) => {
    await openEditor(page);
    await makeEdits(page);
    await page.getByRole('button', { name: 'History' }).click();
    const rows = page.locator('.iu-history__row');
    await expect(rows).toHaveText(['Original', 'Saturation', 'Contrast', 'Rotate']);
    await expect(rows.nth(3)).toHaveAttribute('aria-current', 'step');

    await rows.nth(1).click();
    let state = await editState(page);
    expect(state.finetune.saturation).toBe(-1);
    expect(state.finetune.contrast).toBe(0);
    expect(await historySteps(page)).toBe(1);
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'step');
    await expect(rows.nth(3)).toHaveAttribute('data-future', '');

    await rows.nth(3).click();
    state = await editState(page);
    expect(state.geometry.rotation).toBe(90);
    await rows.nth(0).click();
    expect((await editState(page)).finetune.saturation).toBe(0);
  });

  test('? opens the keyboard shortcuts', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Adjust' }).focus();
    await page.keyboard.press('?');
    const panel = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Show the original (hold)')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('phone-sized editor: zoom % and History stay, shortcuts hide, nothing overflows', async ({
    page,
  }) => {
    await openEditor(page);
    for (const width of [390, 320]) {
      await page.evaluate((w) => {
        const frame = document.querySelector<HTMLElement>('.pg-frame')!;
        frame.style.transition = 'none'; // measure the final size, not the animation
        frame.style.width = `${w}px`;
      }, width);
      await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
      await expect(page.locator('.iu-zoom__value')).toBeVisible();
      await expect(page.getByRole('button', { name: /^Compare/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
      const overflow = await page.evaluate(() => {
        const bar = document.querySelector('.iu-topbar')!;
        return bar.scrollWidth - bar.clientWidth;
      });
      expect(overflow).toBe(0);
      // Neighbouring buttons never touch (their hover / active backgrounds need a gap).
      const compareBox = (await page.getByRole('button', { name: /^Compare/ }).boundingBox())!;
      const zoomBox = (await page.locator('.iu-zoom__value').boundingBox())!;
      expect(zoomBox.x - (compareBox.x + compareBox.width)).toBeGreaterThanOrEqual(2);
    }
  });
});
