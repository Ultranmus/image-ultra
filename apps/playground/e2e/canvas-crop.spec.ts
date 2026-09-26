import { expect, test, type Page } from '@playwright/test';
import type { ImageShape, RectShape } from '@image-ultra/react';
import {
  dragOnStage,
  editState,
  exportAlpha,
  exportPixel,
  historySteps,
  openEditor,
  stagePoint,
  type TestHook,
} from './support/editor';

async function openCanvas(page: Page) {
  await page.getByRole('tab', { name: 'Resize' }).click();
  await page.getByRole('radio', { name: 'Canvas' }).click();
}

const update = (page: Page, recipe: string) =>
  page.evaluate((code) => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    editor.update('test', new Function('s', code) as (s: unknown) => void);
  }, recipe);

test.describe('Extend canvas', () => {
  test('1:1 adds transparent bands; the Fill shows there; the photo stays whole', async ({
    page,
  }) => {
    await openEditor(page);
    const before = await exportAlpha(page);
    await openCanvas(page);
    await page.getByRole('radio', { name: /^1:1/ }).click();
    const square = await exportAlpha(page);
    expect(square.width).toBe(square.height);
    expect(square.width).toBe(Math.max(before.width, before.height));
    expect(square.corners).toEqual([0, 0, 0, 0]); // the added bands
    expect(square.center).toBe(255); // the photo
    expect(await historySteps(page)).toBe(1);

    await update(page, "s.background = { kind: 'color', color: '#00ff00' };");
    const [r, g, b, a] = await exportPixel(page, 0.5, 0.02);
    expect([r, g, b, a]).toEqual([0, 255, 0, 255]);
  });

  test('padding, photo position, and shapes on the added space are exported', async ({ page }) => {
    await openEditor(page);
    await openCanvas(page);
    await page.getByRole('radio', { name: /^1:1/ }).click();
    await page.getByRole('button', { name: 'Photo position' }).click();
    await page.getByRole('radio', { name: 'Top', exact: true }).click();
    await page.keyboard.press('Escape');
    // Photo at the top: the top row is photo, the bottom row is added space.
    expect((await exportPixel(page, 0.5, 0.02))[3]).toBe(255);
    expect((await exportPixel(page, 0.5, 0.98))[3]).toBe(0);

    // A shape drawn on the added space shows up in the export.
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    const band = await page.locator('.iu-stage').boundingBox();
    expect(band).not.toBeNull();
    await dragOnStage(page, [0.45, 0.85], [0.55, 0.9]);
    const [rect] = (await editState(page)).annotations as RectShape[];
    expect(rect).toBeDefined();
    await update(page, "s.annotations[0].fill = '#ff0000';");
    const out = await exportAlpha(page);
    const pixel = await page.evaluate(
      async ({ x, y }) => {
        const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
        const result = await editor.exportImage({ mimeType: 'image/png' });
        const bitmap = await createImageBitmap(result.blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },
      {
        // The rectangle's centre in output px: oriented y shifts by the canvas offset (0 at top).
        x: Math.round(rect!.x + rect!.width / 2),
        y: Math.round(rect!.y + rect!.height / 2),
      },
    );
    expect(out.width).toBe(out.height);
    expect(pixel.slice(0, 3)).toEqual([255, 0, 0]);

    // Padding grows the canvas on every side.
    await page.getByRole('tab', { name: 'Resize' }).click();
    await update(page, 's.canvas = { aspect: null, padding: 0.1, anchor: { x: 0.5, y: 0.5 } };');
    const padded = await exportAlpha(page);
    expect(padded.corners).toEqual([0, 0, 0, 0]);
    expect(padded.center).toBe(255);
  });
});

test.describe('Extend canvas on a cropped photo', () => {
  test('the added space stays empty — it never shows the cropped-away photo', async ({ page }) => {
    await openEditor(page);
    // A crop inside the photo, with photo above and below it.
    await update(page, 's.geometry.crop = { x: 1200, y: 400, width: 1200, height: 800 };');
    await openCanvas(page);
    await page.getByRole('radio', { name: /^1:1/ }).click();
    const out = await exportAlpha(page);
    expect(out.width).toBe(1200);
    expect(out.height).toBe(1200);
    expect(out.corners).toEqual([0, 0, 0, 0]);
    expect(out.center).toBe(255);
    // Centred: 200 px of empty space above and below the 800 px crop.
    expect((await exportPixel(page, 0.5, 190 / 1200))[3]).toBe(0);
    expect((await exportPixel(page, 0.5, 210 / 1200))[3]).toBe(255);
    expect((await exportPixel(page, 0.5, 1010 / 1200))[3]).toBe(0);
  });
});

test.describe('Crop view zoom', () => {
  test('the wheel zooms the crop around the pointer as one undo step', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Adjust' }).click();
    const p = await stagePoint(page, 0.5, 0.5);
    await page.mouse.move(p.x, p.y);
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
    await page.waitForTimeout(600); // the wheel gesture ends after a pause
    const crop = (await editState(page)).geometry.crop;
    expect(crop).not.toBeNull();
    const size = await page.evaluate(() => {
      const s = (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState();
      return { w: s.image!.width, h: s.image!.height };
    });
    expect(crop!.width).toBeLessThan(size.w * 0.8);
    expect(crop!.width / crop!.height).toBeCloseTo(size.w / size.h, 2);
    expect(await historySteps(page)).toBe(1);

    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 200);
    await page.waitForTimeout(600);
    const out = (await editState(page)).geometry.crop!;
    expect(out.width).toBeLessThanOrEqual(size.w + 0.5);
    expect(out.x).toBeGreaterThanOrEqual(-0.5);
  });
});

test.describe('Paste from other apps', () => {
  /** Sends a `paste` event, like the browser does for ⌘V, with an image (or nothing) on it. */
  const paste = (page: Page, withImage: boolean) =>
    page.locator('.iu-stage').evaluate(async (stage, image) => {
      const data = new DataTransfer();
      if (image) {
        const canvas = new OffscreenCanvas(40, 20);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#0000ff';
        ctx.fillRect(0, 0, 40, 20);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        data.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
      }
      stage.focus();
      stage.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, withImage);

  test('an image on the clipboard becomes a selected image shape in Annotate', async ({ page }) => {
    await openEditor(page);
    await paste(page, true);
    await expect(page.getByRole('tab', { name: 'Annotate' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect.poll(async () => (await editState(page)).annotations.length).toBe(1);
    const state = await editState(page);
    const shape = state.annotations[0] as ImageShape;
    expect(shape.type).toBe('image');
    expect(shape.width / shape.height).toBeCloseTo(2, 1);
    expect(state.assets[shape.assetId]).toBeDefined();
  });

  test('an empty clipboard pastes our own copy', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.4, 0.4]);
    await page.getByRole('tab', { name: 'Annotate' }).focus();
    await page.keyboard.press('ControlOrMeta+c');
    await paste(page, false);
    await expect.poll(async () => (await editState(page)).annotations.length).toBe(2);
  });
});

test.describe('Group menu', () => {
  test('right-click on a selected group opens its menu; actions apply to all', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    for (const [a, b] of [
      [
        [0.3, 0.3],
        [0.4, 0.4],
      ],
      [
        [0.5, 0.5],
        [0.6, 0.65],
      ],
    ] as [number, number][][]) {
      await page.getByRole('radio', { name: /Rectangle/ }).click();
      await dragOnStage(page, a!, b!);
    }
    await page.getByRole('radio', { name: /Select/ }).click();
    await page.keyboard.press('ControlOrMeta+a');
    const p = await stagePoint(page, 0.35, 0.35);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    const menu = page.getByRole('menu', { name: 'Selection' });
    await expect(menu).toBeVisible();
    await expect(menu.getByText('2 selected')).toBeVisible();
    // The group is still selected.
    await expect(page.locator('.iu-annotate__member')).toHaveCount(2);
    // Right-click on the empty space between the members (inside the group box) also opens it.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    const gap = await stagePoint(page, 0.45, 0.47);
    await page.mouse.click(gap.x, gap.y, { button: 'right' });
    await expect(menu).toBeVisible();

    await menu.getByRole('menuitem', { name: 'Align' }).hover();
    await page.getByRole('menuitem', { name: 'Align left' }).click();
    const aligned = (await editState(page)).annotations as RectShape[];
    expect(Math.round(aligned[0]!.x)).toBe(Math.round(aligned[1]!.x));

    // Lock all keeps the group selected, so it can be unlocked again.
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Lock all', exact: true }).click();
    expect((await editState(page)).annotations.every((s) => s.locked)).toBe(true);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(2);
    // Locked shapes don't move.
    const lockedAt = ((await editState(page)).annotations as RectShape[]).map((s) => s.x);
    await dragOnStage(page, [0.35, 0.35], [0.45, 0.45]);
    expect(((await editState(page)).annotations as RectShape[]).map((s) => s.x)).toEqual(lockedAt);
    // Select everything again (locked shapes can join a selection) and unlock.
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+a');
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Lock all', exact: true })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Unlock all' }).click();
    expect((await editState(page)).annotations.every((s) => !s.locked)).toBe(true);

    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Hide all' }).click();
    const hidden = (await editState(page)).annotations;
    expect(hidden.every((s) => s.hidden)).toBe(true);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(0);
  });
});
