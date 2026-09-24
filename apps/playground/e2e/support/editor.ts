import { expect, type Page } from '@playwright/test';
import type { EditState, ExportOptions, ImageEditorHandle, renderImage } from '@image-ultra/react';

/** Types for the playground's `window.__iu` test hook. */
export interface TestHook {
  editor: { current: ImageEditorHandle | null };
  renderImage: typeof renderImage;
}

export async function openEditor(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Done' })).toBeEnabled();
  await page.waitForFunction(() => {
    const hook = (window as unknown as { __iu?: TestHook }).__iu;
    return hook?.editor.current?.store.getState().status === 'ready';
  });
}

export function editState(page: Page): Promise<EditState> {
  return page.evaluate(() =>
    (window as unknown as { __iu: TestHook }).__iu.editor.current!.getState(),
  );
}

export function historySteps(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState().history.past
        .length,
  );
}

/** Exports through the public API and returns size plus alpha at a few sample points. */
export function exportAlpha(page: Page, options: ExportOptions = { mimeType: 'image/png' }) {
  return page.evaluate(async (opts) => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    const result = await editor.exportImage(opts);
    const bitmap = await createImageBitmap(result.blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const alpha = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3];
    const w = bitmap.width - 1;
    const h = bitmap.height - 1;
    return {
      width: bitmap.width,
      height: bitmap.height,
      corners: [alpha(0, 0), alpha(w, 0), alpha(w, h), alpha(0, h)],
      center: alpha(Math.floor(w / 2), Math.floor(h / 2)),
    };
  }, options);
}

/** Exports a PNG and returns the RGBA of the pixel at fractional position `fx`,`fy`. */
export function exportPixel(page: Page, fx: number, fy: number) {
  return page.evaluate(
    async ({ fx, fy }) => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      const result = await editor.exportImage({ mimeType: 'image/png' });
      const bitmap = await createImageBitmap(result.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return Array.from(
        ctx.getImageData(Math.floor(bitmap.width * fx), Math.floor(bitmap.height * fy), 1, 1).data,
      );
    },
    { fx, fy },
  );
}

/** Stage-relative mouse helpers: positions are fractions of the stage box. */
export async function stagePoint(page: Page, fx: number, fy: number) {
  const box = (await page.locator('.iu-stage').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

export async function dragOnStage(
  page: Page,
  from: [number, number],
  to: [number, number],
  steps = 6,
) {
  const a = await stagePoint(page, ...from);
  const b = await stagePoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}
