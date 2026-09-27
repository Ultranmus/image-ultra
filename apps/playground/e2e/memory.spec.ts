import { expect, test, type Page } from '@playwright/test';
import { openEditor, type TestHook } from './support/editor';
import { readMemory, trackMemory } from './support/memory';

// `gc()` lets the counters see what the garbage collector frees (Phase 7.7c).
test.use({ launchOptions: { args: ['--js-flags=--expose-gc'] } });

/** One photo's worth of work: load, sticker, Filter thumbnails, compare, export. */
async function session(page: Page, n: number) {
  await page.evaluate(async (n) => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    const store = editor.store;
    const frame = () => new Promise(requestAnimationFrame);
    // A 3MP photo and a small sticker, both different every time.
    const photo = new OffscreenCanvas(2000 + n * 10, 1500);
    const pctx = photo.getContext('2d')!;
    pctx.fillStyle = `hsl(${n * 36}, 60%, 50%)`;
    pctx.fillRect(0, 0, photo.width, photo.height);
    await store.getState().load(await photo.convertToBlob({ type: 'image/jpeg' }));
    const sticker = document.createElement('canvas');
    sticker.width = sticker.height = 300;
    const sctx = sticker.getContext('2d')!;
    sctx.fillStyle = `hsl(${n * 36 + 180}, 80%, 50%)`;
    sctx.fillRect(0, 0, 300, 300);
    sctx.fillText(String(n), 10, 10);
    editor.update('Sticker', (s) => {
      s.assets['a'] = {
        kind: 'raster',
        src: sticker.toDataURL('image/png'),
        width: 300,
        height: 300,
        mimeType: 'image/png',
      };
      s.annotations.push({
        id: 's',
        type: 'image',
        assetId: 'a',
        x: 100,
        y: 100,
        width: 300,
        height: 300,
        rotation: 0,
        opacity: 1,
      });
    });
    for (let i = 0; i < 10; i++) await frame();
    store.getState().setActiveTool('filter');
    for (let i = 0; i < 20; i++) await frame();
    store.getState().setCompare(0.5);
    for (let i = 0; i < 5; i++) await frame();
    store.getState().setCompare(null);
    store.getState().setActiveTool('adjust');
    await editor.exportImage({ mimeType: 'image/jpeg' });
    for (let i = 0; i < 5; i++) await frame();
  }, n);
}

test('memory stays flat over 10 photos (images and GPU textures are freed)', async ({ page }) => {
  await trackMemory(page);
  await openEditor(page);
  await session(page, 0);
  const first = await readMemory(page);
  for (let n = 1; n < 10; n++) await session(page, n);
  const last = await readMemory(page);
  console.log('memory after 1 photo:', first, '· after 10:', last);
  // Nothing may pile up per photo: allow noise well below one photo (3MP, 12MB texture).
  expect(last.bitmaps).toBeLessThanOrEqual(first.bitmaps + 1);
  expect(last.bitmapMP).toBeLessThanOrEqual(first.bitmapMP + 0.5);
  expect(last.textures).toBeLessThanOrEqual(first.textures + 1);
  expect(last.textureMB).toBeLessThanOrEqual(first.textureMB + 2);
  // Compare is closed and there's no Fill or redaction: those layers hold no pixels.
  const layers = await page.evaluate(() =>
    ['.iu-stage__before', '.iu-stage__redactions', '.iu-stage__background'].map(
      (selector) => document.querySelector<HTMLCanvasElement>(selector)!.width,
    ),
  );
  expect(layers).toEqual([1, 1, 1]);

  // Closing the editor (the playground remounts it with no photo) frees everything.
  await page
    .locator('label', { hasText: /^Image/ })
    .locator('select')
    .selectOption('empty');
  await expect(page.locator('.iu-stage__canvas:not([data-hidden])')).toHaveCount(0);
  const closed = await readMemory(page);
  console.log('after closing:', closed);
  expect(closed.bitmapMP).toBeLessThan(0.2);
  // At most the new, empty editor's 2 KB colour table.
  expect(closed.textures).toBeLessThanOrEqual(1);
  expect(closed.textureMB).toBe(0);
});
