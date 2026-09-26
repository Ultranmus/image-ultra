import { expect, test, type Page } from '@playwright/test';
import { editState, historySteps, openEditor, type TestHook } from './support/editor';

// Sample image is 2400 × 1600 (short side 1600).

/** Exported pixels (RGBA) at output coordinates. */
function exportPixels(
  page: Page,
  mimeType: 'image/png' | 'image/jpeg',
  points: [number, number][],
) {
  return page.evaluate(
    async ({ mimeType, points }) => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      const result = await editor.exportImage({ mimeType });
      const bitmap = await createImageBitmap(result.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return {
        size: [bitmap.width, bitmap.height],
        pixels: points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data)),
      };
    },
    { mimeType, points },
  );
}

const near = (a: number[], b: number[], tolerance = 6) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= tolerance);

test.describe('Frame tool', () => {
  test('a Border frame covers the edges without changing the size; None removes it', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Frame' }).click();
    await page.getByRole('radio', { name: 'Border' }).click();
    const state = await editState(page);
    expect(state.frame).toMatchObject({ style: 'border', size: 0.04, color: '#ffffff' });
    expect(await historySteps(page)).toBe(1);

    // 4% of 1600 = 64px band: white near the edge, the photo well inside.
    const { size, pixels } = await exportPixels(page, 'image/png', [
      [10, 10],
      [2390, 800],
      [1200, 800],
    ]);
    expect(size).toEqual([2400, 1600]);
    expect(near(pixels[0]!, [255, 255, 255, 255])).toBe(true);
    expect(near(pixels[1]!, [255, 255, 255, 255])).toBe(true);
    expect(near(pixels[2]!, [255, 255, 255, 255])).toBe(false);

    await page.getByRole('radio', { name: 'None' }).click();
    expect((await editState(page)).frame).toBeNull();
  });

  test('size and colour change the frame; switching style keeps them', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Frame' }).click();
    await page.getByRole('radio', { name: 'Polaroid' }).click();
    const slider = page.getByRole('slider', { name: 'Size' });
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    expect((await editState(page)).frame?.size).toBeCloseTo(0.06);

    await page.getByRole('button', { name: 'Frame colour' }).click();
    await page
      .getByRole('radio', { name: /#000000|Black/i })
      .first()
      .click();
    await page.keyboard.press('Escape');
    expect((await editState(page)).frame?.color).toBe('#000000');

    await page.getByRole('radio', { name: 'Line', exact: true }).click();
    expect((await editState(page)).frame).toMatchObject({
      style: 'line',
      size: 0.06,
      color: '#000000',
    });

    // Polaroid's thicker bottom: 3.5 × 6% of 1600 = 336px.
    await page.getByRole('radio', { name: 'Polaroid' }).click();
    const { pixels } = await exportPixels(page, 'image/png', [[1200, 1600 - 250]]);
    expect(near(pixels[0]!, [0, 0, 0, 255])).toBe(true);
  });

  test('Bevel shades its sides; Inset, Plus and Lumber lines stop or cross at the corners', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Frame' }).click();
    const setFrame = (style: string) =>
      page.evaluate((style) => {
        (window as unknown as { __iu: TestHook }).__iu.editor.current!.update('Frame', (s) => {
          s.frame = { style: style as never, size: 0.05, color: '#808080' };
        });
      }, style);

    // Bevel on grey: the top band is lighter than the bottom band.
    await setFrame('bevel');
    const bevel = await exportPixels(page, 'image/png', [
      [1200, 20],
      [1200, 1580],
    ]);
    expect(bevel.pixels[0]![0]!).toBeGreaterThan(bevel.pixels[1]![0]! + 40);

    // Lines sit 1.5 × 80px = 120px in. Near the top-left corner, on the top line's extension:
    // Lumber reaches the edge, Plus crosses a little past the corner, Inset stops short of it.
    const topLineAt = async (style: string, x: number) => {
      await setFrame(style);
      return (await exportPixels(page, 'image/png', [[x, 120]])).pixels[0]!;
    };
    const grey = [128, 128, 128, 255];
    expect(near(await topLineAt('lumber', 4), grey)).toBe(true);
    expect(near(await topLineAt('plus', 80), grey)).toBe(true);
    expect(near(await topLineAt('plus', 4), grey)).toBe(false);
    expect(near(await topLineAt('inset', 150), grey)).toBe(false);
    expect(near(await topLineAt('inset', 400), grey)).toBe(true);
  });
});

test.describe('Fill tool', () => {
  test('options sit under the switch; the custom button opens the full picker; fits a phone', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Fill' }).click();
    await page.getByRole('radio', { name: 'Colour' }).click();
    const kinds = (await page.locator('.iu-fill__kinds').boundingBox())!;
    const strip = page.getByRole('radiogroup', { name: 'Fill colour' });
    const stripBox = (await strip.boundingBox())!;
    expect(stripBox.y).toBeGreaterThanOrEqual(kinds.y + kinds.height); // below, not beside

    await strip.getByRole('button', { name: 'Custom colour' }).click();
    await expect(page.getByRole('slider', { name: 'Hue' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('.pg-frame')!;
      frame.style.transition = 'none';
      frame.style.width = '320px';
    });
    const overflow = await page.evaluate(() => {
      const bar = document.querySelector('.iu-controlbar')!;
      return bar.scrollWidth - bar.clientWidth;
    });
    expect(overflow).toBe(0); // the strip scrolls inside itself instead
    await expect(strip.getByRole('radio', { name: '#000000' })).toBeVisible();
  });

  const roundCrop = (page: Page) =>
    page.evaluate(() => {
      (window as unknown as { __iu: TestHook }).__iu.editor.current!.update('Round', (s) => {
        s.geometry.cropShape = 'ellipse';
      });
    });

  test('a colour fill shows in the transparent corners, also instead of white in JPEG', async ({
    page,
  }) => {
    await openEditor(page);
    await roundCrop(page);
    await page.getByRole('tab', { name: 'Fill' }).click();
    // Without a fill the round crop's corner is transparent in PNG.
    expect((await exportPixels(page, 'image/png', [[5, 5]])).pixels[0]![3]).toBe(0);

    await page.getByRole('radio', { name: 'Colour' }).click();
    // The colours sit inline under the switch; one tap picks one.
    const strip = page.getByRole('radiogroup', { name: 'Fill colour' });
    await strip.getByRole('radio', { name: '#000000' }).click();
    expect((await editState(page)).background).toEqual({ kind: 'color', color: '#000000' });

    const png = await exportPixels(page, 'image/png', [[5, 5]]);
    expect(near(png.pixels[0]!, [0, 0, 0, 255])).toBe(true);
    const jpeg = await exportPixels(page, 'image/jpeg', [[5, 5]]);
    expect(near(jpeg.pixels[0]!, [0, 0, 0, 255], 12)).toBe(true);
  });

  test('blurred photo and image fills cover the corners; None clears', async ({ page }) => {
    await openEditor(page);
    await roundCrop(page);
    await page.getByRole('tab', { name: 'Fill' }).click();

    await page.getByRole('radio', { name: 'Blurred photo' }).click();
    const blur = await exportPixels(page, 'image/png', [[5, 5]]);
    expect(blur.pixels[0]![3]).toBe(255);

    // Image: a small red PNG via the file picker.
    const red = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(40, 40);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 40, 40);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('radio', { name: 'Image' }).click();
    await (
      await chooser
    ).setFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(red) });
    await expect.poll(async () => (await editState(page)).background?.kind).toBe('image');
    const image = await exportPixels(page, 'image/png', [[5, 5]]);
    expect(near(image.pixels[0]!, [255, 0, 0, 255], 10)).toBe(true);

    await page.getByRole('radio', { name: 'None' }).click();
    expect((await editState(page)).background).toBeNull();
  });
});
