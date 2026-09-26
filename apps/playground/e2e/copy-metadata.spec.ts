import { expect, test, type Page } from '@playwright/test';
import type { ExportOptions, RectShape } from '@image-ultra/react';
import {
  dragOnStage,
  editState,
  historySteps,
  openEditor,
  stagePoint,
  type TestHook,
} from './support/editor';

async function drawRect(page: Page) {
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('radio', { name: /Rectangle/ }).click();
  await dragOnStage(page, [0.3, 0.3], [0.5, 0.5]);
  await page.getByRole('tab', { name: 'Annotate' }).focus();
}

test.describe('Copy / paste', () => {
  test('pointer off the photo: ⌘V pastes next to the original and selects it; ⌘X cuts', async ({
    page,
  }) => {
    await openEditor(page);
    await drawRect(page);
    await page.keyboard.press('ControlOrMeta+c');
    await page.mouse.move(2, 2); // outside the editor
    await page.keyboard.press('ControlOrMeta+v');
    const [original, copy] = (await editState(page)).annotations as RectShape[];
    expect(copy!.id).not.toBe(original!.id);
    expect(copy!.x).toBeGreaterThan(original!.x);
    expect(copy!.width).toBeCloseTo(original!.width);
    expect(await historySteps(page)).toBe(2);

    // The copy is the selection: cut removes it (one more step).
    await page.keyboard.press('ControlOrMeta+x');
    const after = (await editState(page)).annotations;
    expect(after.map((s) => s.id)).toEqual([original!.id]);
    expect(await historySteps(page)).toBe(3);
  });

  test('pointer over the photo: the copy is centred on the pointer', async ({ page }) => {
    await openEditor(page);
    await drawRect(page);
    await page.keyboard.press('ControlOrMeta+c');
    const target = await stagePoint(page, 0.65, 0.6);
    await page.mouse.move(target.x, target.y);
    await page.keyboard.press('ControlOrMeta+v');
    expect((await editState(page)).annotations).toHaveLength(2);
    const box = (await page.locator('.iu-annotate__selection').first().boundingBox())!;
    expect(box.x + box.width / 2).toBeCloseTo(target.x, -1);
    expect(box.y + box.height / 2).toBeCloseTo(target.y, -1);
  });

  test('pasting into another photo; from another tool the editor switches to Annotate', async ({
    page,
  }) => {
    await openEditor(page);
    await drawRect(page);
    await page.keyboard.press('ControlOrMeta+c');

    // A fresh editor (new photo): the clipboard is kept.
    await page
      .getByRole('radiogroup', { name: 'App watermark' })
      .getByRole('radio', {
        name: 'on',
      })
      .click();
    await openEditorReady(page);
    await page.getByRole('tab', { name: 'Filter' }).click();
    await page.getByRole('tab', { name: 'Filter' }).focus();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.getByRole('tab', { name: 'Annotate' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const list = (await editState(page)).annotations;
    expect(list).toHaveLength(1);
    await expect(page.locator('.iu-annotate__selection')).toHaveCount(1);
  });
});

test.describe('Export metadata', () => {
  const exportWith = (page: Page, options: ExportOptions) =>
    page.evaluate(async (opts) => {
      const { renderImage } = (window as unknown as { __iu: TestHook }).__iu;
      const result = await renderImage('/sample.jpg', undefined, opts);
      const head = new Uint8Array(await result.blob.slice(0, 0x20000).arrayBuffer());
      return String.fromCharCode(...head.subarray(0, 4000)).includes('Exif\0\0');
    }, options);

  test('stripped by default; kept with keepMetadata (JPEG)', async ({ page }) => {
    await openEditor(page);
    expect(await exportWith(page, { mimeType: 'image/jpeg' })).toBe(false);
    expect(await exportWith(page, { mimeType: 'image/jpeg', keepMetadata: true })).toBe(true);
    expect(await exportWith(page, { mimeType: 'image/png', keepMetadata: true })).toBe(false);
  });
});

async function openEditorReady(page: Page) {
  await page.waitForFunction(() => {
    const hook = (window as unknown as { __iu?: TestHook }).__iu;
    return hook?.editor.current?.store.getState().status === 'ready';
  });
}
