import { expect, test, type Page } from '@playwright/test';
import { openEditor, type TestHook } from './support/editor';

const rotation = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __iu: TestHook }).__iu.editor.current!.getState().geometry.rotation,
  );

const ALL_EDITS = {
  version: 1,
  geometry: {
    rotation: 90,
    flipX: true,
    flipY: false,
    straighten: 7,
    crop: { x: 300, y: 600, width: 700, height: 900 },
  },
  finetune: {
    brightness: 0.1,
    contrast: 0.2,
    saturation: -0.3,
    exposure: 0.15,
    temperature: 0.4,
    tint: -0.2,
    gamma: 0.1,
    vignette: 0.5,
  },
  assets: {},
};

/** Renders `state` with both renderers and returns size + per-channel difference stats. */
async function compareRenderers(page: Page, state: unknown, maxWidth?: number) {
  return page.evaluate(
    async ({ state, maxWidth }) => {
      const { editor, renderImage } = (window as unknown as { __iu: TestHook }).__iu;
      const image = editor.current!.store.getState().image!;
      const options = maxWidth
        ? { mimeType: 'image/png' as const, maxWidth }
        : { mimeType: 'image/png' as const };
      const gpu = await renderImage(image, state, { ...options, renderer: 'webgl2' });
      const cpu = await renderImage(image, state, { ...options, renderer: 'canvas2d' });
      const pixels = async (blob: Blob) => {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const a = await pixels(gpu.blob);
      const b = await pixels(cpu.blob);
      let sum = 0;
      let max = 0;
      // Compare premultiplied colour (what is visible): at near-zero alpha, stored RGB is noise.
      for (let i = 0; i < a.length; i += 4) {
        for (let c = 0; c < 4; c++) {
          const va = c === 3 ? a[i + 3]! : (a[i + c]! * a[i + 3]!) / 255;
          const vb = c === 3 ? b[i + 3]! : (b[i + c]! * b[i + 3]!) / 255;
          const d = Math.abs(va - vb);
          sum += d;
          if (d > max) max = d;
        }
      }
      return {
        renderers: [gpu.renderer, cpu.renderer],
        size: [gpu.width, gpu.height, cpu.width, cpu.height],
        meanDiff: sum / a.length,
        maxDiff: max,
      };
    },
    { state, maxWidth },
  );
}

test('WebGL2 and Canvas2D renderers match pixel-for-pixel at full size', async ({ page }) => {
  await openEditor(page);
  const stats = await compareRenderers(page, ALL_EDITS);
  expect(stats.renderers).toEqual(['webgl2', 'canvas2d']);
  expect(stats.size).toEqual([700, 900, 700, 900]);
  // Geometry + colour math are identical; only float → 8-bit rounding may differ.
  expect(stats.maxDiff).toBeLessThanOrEqual(2);
});

test('perspective renders the same on GPU and on the Canvas2D mesh fallback', async ({ page }) => {
  await openEditor(page);
  const stats = await compareRenderers(page, {
    ...ALL_EDITS,
    geometry: { ...ALL_EDITS.geometry, straighten: 0, perspective: { x: 0.2, y: -0.3 } },
  });
  // The fallback approximates perspective with small triangles, so allow a little difference.
  expect(stats.meanDiff).toBeLessThan(3);
});

test('every colour stage matches pixel-for-pixel: filter, 16 adjustments, levels, curves, grain', async ({
  page,
}) => {
  await openEditor(page);
  const stats = await compareRenderers(page, {
    ...ALL_EDITS,
    finetune: {
      ...ALL_EDITS.finetune,
      vibrance: 0.4,
      highlights: -0.3,
      shadows: 0.35,
      hue: 0.15,
      grain: 0.5,
    },
    levels: { black: 0.05, white: 0.92, mid: 0.2 },
    curves: {
      rgb: [
        [0, 0],
        [0.3, 0.22],
        [0.7, 0.8],
        [1, 1],
      ],
      blue: [
        [0, 0.05],
        [1, 0.95],
      ],
    },
    filter: {
      id: 'test',
      name: 'Test',
      intensity: 0.7,
      matrix: [1.1, 0.05, -0.05, 0.02, 0, 0.95, 0.05, 0, -0.05, 0.05, 1.05, -0.01],
      curves: {
        rgb: [
          [0, 0.08],
          [0.5, 0.5],
          [1, 0.95],
        ],
      },
    },
    geometry: { ...ALL_EDITS.geometry, cropShape: 'ellipse' },
  });
  expect(stats.maxDiff).toBeLessThanOrEqual(3);
});

test('detail effects (clarity, sharpen, blur) look the same on GPU and CPU', async ({ page }) => {
  await openEditor(page);
  for (const detail of [{ clarity: 0.6, sharpen: 0.5 }, { blur: 0.4 }]) {
    const stats = await compareRenderers(page, {
      ...ALL_EDITS,
      finetune: { ...ALL_EDITS.finetune, ...detail },
    });
    // Different blur kernels (GPU Gaussian vs CPU box ×3) — close, not identical.
    expect(stats.meanDiff).toBeLessThan(3);
  }
});

test('downscaled exports stay visually equal across renderers', async ({ page }) => {
  await openEditor(page);
  const stats = await compareRenderers(page, ALL_EDITS, 350);
  expect(stats.size).toEqual([350, 450, 350, 450]);
  // GPU mipmaps and the browser's canvas resampler use different filters when shrinking.
  expect(stats.meanDiff).toBeLessThan(3);
});

test('undo / redo with buttons and keyboard shortcuts', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Rotate left' }).click();
  expect(await rotation(page)).toBe(270);

  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  expect(await rotation(page)).toBe(0);

  // Keyboard shortcuts work while focus is inside the editor.
  await page.getByRole('tab', { name: 'Adjust' }).focus();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await rotation(page)).toBe(270);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await rotation(page)).toBe(0);
});

test('a dial drag is a single undo step', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('tab', { name: 'Finetune' }).click();
  const dial = page.getByRole('slider', { name: 'Brightness' });
  const box = (await dial.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Dragging the scale left moves higher values under the marker.
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(box.x + box.width / 2 - i * 6, box.y + box.height / 2);
  await page.mouse.up();

  const history = await page.evaluate(() => {
    const s = (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState();
    return { steps: s.history.past.length, brightness: s.edit.finetune.brightness };
  });
  expect(history.steps).toBe(1);
  expect(history.brightness).toBeGreaterThan(0);
});

test('Done exports the edited image with the right size', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Rotate left' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toContainText('edited.jpg');
  await expect(result).toContainText('1600×2400');
});

test('saved state re-opens the image with the same edits', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Flip horizontal' }).click();
  await page.getByRole('radio', { name: '16:9' }).click();
  const before = await page.getByTestId('state-json').innerText();
  await page.getByRole('button', { name: 'Keep state' }).click();
  await page.getByRole('button', { name: 'Reopen clean' }).click();
  await expect(page.getByTestId('state-json')).not.toHaveText(before);
  await page.getByRole('button', { name: 'Reopen with it' }).click();
  await expect(page.getByTestId('state-json')).toHaveText(before);
});
