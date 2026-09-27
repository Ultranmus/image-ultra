import { expect, test, type Page } from '@playwright/test';
import { openEditor, type TestHook } from './support/editor';

/** Every effect that reads neighbouring pixels or output positions (Phase 7.7d). */
const EDITS = {
  version: 1,
  geometry: {
    rotation: 90,
    flipX: true,
    straighten: 7,
    crop: { x: 100, y: 200, width: 1100, height: 900 },
  },
  finetune: {
    exposure: 0.2,
    contrast: 0.2,
    sharpen: 0.8,
    clarity: 0.5,
    blur: 0.3,
    vignette: 0.5,
    grain: 0.6,
  },
  assets: {},
};

/** Renders `state` in one pass and in 256px tiles; returns the difference. */
function compareTiled(page: Page, renderer: 'webgl2' | 'canvas2d') {
  return page.evaluate(
    async ({ state, renderer }) => {
      const { editor, renderImage } = (window as unknown as { __iu: TestHook }).__iu;
      const image = editor.current!.store.getState().image!;
      const options = { mimeType: 'image/png' as const, renderer };
      const whole = await renderImage(image, state, options);
      const tiled = await renderImage(image, state, { ...options, tileSize: 256 });
      const pixels = async (blob: Blob) => {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const a = await pixels(whole.blob);
      const b = await pixels(tiled.blob);
      let sum = 0;
      let max = 0;
      // Visible colour (premultiplied): at near-zero alpha, stored RGB is noise.
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
        renderer: [whole.renderer, tiled.renderer],
        size: [whole.width, whole.height, tiled.width, tiled.height],
        meanDiff: sum / a.length,
        maxDiff: max,
      };
    },
    { state: EDITS, renderer },
  );
}

for (const renderer of ['webgl2', 'canvas2d'] as const) {
  test(`tiled export matches the one-pass export (${renderer}): no seams`, async ({ page }) => {
    await openEditor(page);
    const stats = await compareTiled(page, renderer);
    expect(stats.renderer).toEqual([renderer, renderer]);
    expect(stats.size.slice(0, 2)).toEqual(stats.size.slice(2));
    // Only float rounding may differ — never a visible seam.
    expect(stats.meanDiff).toBeLessThan(0.05);
    expect(stats.maxDiff).toBeLessThanOrEqual(4);
  });
}

test('a photo wider than the GPU limit exports at full size, full detail', async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  const result = await page.evaluate(async () => {
    const { renderImage } = (window as unknown as { __iu: TestHook }).__iu;
    const gl = document.createElement('canvas').getContext('webgl2')!;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const width = limit + 3616; // 20000 on a 16384 GPU
    const height = 600;
    // Grey, with 1px black / white stripes in the last 400 columns: a downscaled copy would
    // blur them to grey.
    const photo = new OffscreenCanvas(width, height);
    const ctx = photo.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);
    for (let x = width - 400; x < width; x += 2) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, 0, 1, height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 1, 0, 1, height);
    }
    const blob = await photo.convertToBlob({ type: 'image/png' });
    const out = await renderImage(blob, undefined, { mimeType: 'image/png', renderer: 'webgl2' });
    const bitmap = await createImageBitmap(out.blob);
    const check = new OffscreenCanvas(bitmap.width, bitmap.height);
    const cctx = check.getContext('2d')!;
    cctx.drawImage(bitmap, 0, 0);
    const row = cctx.getImageData(width - 10, 300, 10, 1).data;
    return {
      limit,
      width: out.width,
      height: out.height,
      downscaled: out.downscaled,
      renderer: out.renderer,
      stripes: Array.from({ length: 10 }, (_, i) => row[i * 4]!),
    };
  });
  expect(result.width).toBeGreaterThan(result.limit);
  expect([result.width, result.height]).toEqual([result.limit + 3616, 600]);
  expect(result.downscaled).toBe(false);
  expect(result.renderer).toBe('webgl2');
  expect(result.stripes).toEqual([0, 255, 0, 255, 0, 255, 0, 255, 0, 255]);
});
