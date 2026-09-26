import { expect, test, type Page } from '@playwright/test';
import {
  dragOnStage,
  editState,
  historySteps,
  openEditor,
  stagePoint,
  type TestHook,
} from './support/editor';

// Sample image is 2400 × 1600.

/**
 * Mean brightness (0…255) of a region of the exported PNG. `withoutWatermark` renders the current
 * edit minus its watermark through the plain `renderImage` API (a baseline that no lock applies to).
 */
function brightness(
  page: Page,
  region: [number, number, number, number],
  withoutWatermark = false,
) {
  return page.evaluate(
    async ({ region: [x, y, w, h], withoutWatermark }) => {
      const { editor, renderImage } = (window as unknown as { __iu: TestHook }).__iu;
      const handle = editor.current!;
      const result = withoutWatermark
        ? await renderImage(
            handle.store.getState().image!,
            {
              ...handle.getState(),
              watermark: null,
            },
            { mimeType: 'image/png' },
          )
        : await handle.exportImage({ mimeType: 'image/png' });
      const bitmap = await createImageBitmap(result.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(x, y, w, h).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      return sum / (w * h);
    },
    { region, withoutWatermark },
  );
}

/** A small solid PNG as a file-chooser payload. */
async function pngFile(page: Page, color: string) {
  const bytes = await page.evaluate(async (fill) => {
    const canvas = new OffscreenCanvas(60, 30);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 60, 30);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, color);
  return { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

// Bottom-right corner, where the default watermark sits, and the middle of the photo.
const CORNER: [number, number, number, number] = [1600, 1400, 760, 160];
const MIDDLE: [number, number, number, number] = [700, 500, 1000, 600];

test.describe('Watermark tool', () => {
  test('text watermark in a corner, moved by the position grid, tiled across', async ({ page }) => {
    await openEditor(page);
    const before = await brightness(page, CORNER);
    await page.getByRole('tab', { name: 'Watermark' }).click();
    await page.getByRole('radio', { name: 'Text', exact: true }).click();
    expect((await editState(page)).watermark).toMatchObject({
      kind: 'text',
      position: 'bottom-right',
    });
    expect(await brightness(page, CORNER)).toBeGreaterThan(before + 3);

    // Typing is one undo step.
    const steps = await historySteps(page);
    const field = page.getByRole('textbox', { name: 'Watermark text' });
    expect((await field.boundingBox())!.width).toBeGreaterThan(120); // styled, not collapsed
    await field.fill('ACME Studio');
    await field.blur();
    expect((await editState(page)).watermark?.text).toBe('ACME Studio');
    expect(await historySteps(page)).toBe(steps + 1); // typing = one step

    // Font: the same menu as Annotate text.
    await page.getByRole('button', { name: 'Font' }).click();
    await page.getByRole('option', { name: 'Serif' }).click();
    await page.keyboard.press('Escape');
    expect((await editState(page)).watermark?.fontFamily).toContain('Georgia');

    await page.getByRole('button', { name: 'Position' }).click();
    await page.getByRole('radio', { name: 'Top left' }).click();
    expect((await editState(page)).watermark?.position).toBe('top-left');
    const middleBefore = await brightness(page, MIDDLE);
    await page.getByRole('radio', { name: 'Tile across the photo' }).click();
    await page.keyboard.press('Escape');
    expect(await brightness(page, MIDDLE)).toBeGreaterThan(middleBefore + 3);

    await page.getByRole('radio', { name: 'None', exact: true }).click();
    expect((await editState(page)).watermark).toBeNull();
  });

  test('size goes to 100%; drag or arrow keys move it anywhere; Tile button fits its text', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Watermark' }).click();
    await page.getByRole('radio', { name: 'Text', exact: true }).click();

    const size = page.getByRole('slider', { name: 'Size' });
    await size.press('End');
    expect((await editState(page)).watermark?.size).toBe(1);
    await size.press('Home');
    expect((await editState(page)).watermark?.size).toBeCloseTo(0.01);
    await size.press('Shift+ArrowRight'); // 1% → 51%

    // Drag the box on the photo: the position becomes custom and follows the pointer.
    const box = page.getByRole('button', { name: /Watermark — drag/ });
    const b = (await box.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x - 200, b.y - 150, { steps: 6 });
    await page.mouse.up();
    let wm = (await editState(page)).watermark!;
    expect(wm.position).toBe('custom');
    expect(wm.x).toBeLessThan(0.7);
    expect(wm.y).toBeLessThan(0.8);
    const x = wm.x;
    await box.press('ArrowRight');
    wm = (await editState(page)).watermark!;
    expect(wm.x).toBeGreaterThan(x);

    // Corner handle: drag outward → bigger (Size follows).
    const before = wm.size;
    const se = (await page.locator('.iu-watermark-box__handle[data-corner="se"]').boundingBox())!;
    await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
    await page.mouse.down();
    await page.mouse.move(se.x + 90, se.y + 40, { steps: 5 });
    await page.mouse.up();
    wm = (await editState(page)).watermark!;
    expect(wm.size).toBeGreaterThan(before);

    // Rotate knob: a quarter turn clockwise, soft-snapped to 90°.
    const knob = (await page.locator('.iu-watermark-box__rotate').boundingBox())!;
    const frame = (await box.boundingBox())!;
    const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(centre.x + 120, centre.y - 60, { steps: 4 });
    await page.mouse.move(centre.x + 200, centre.y + 1, { steps: 4 });
    await page.mouse.up();
    expect((await editState(page)).watermark!.rotation).toBe(90);

    // The grid shows no spot while it's custom; the Tile button is only as wide as its text.
    await page.getByRole('button', { name: 'Position' }).click();
    await expect(page.locator('.iu-watermark__spot[aria-checked="true"]')).toHaveCount(0);
    const tile = (await page.getByRole('radio', { name: 'Tile across the photo' }).boundingBox())!;
    const grid = (await page.locator('.iu-watermark__grid').boundingBox())!;
    expect(tile.width).toBeLessThan(grid.width + 80);
  });

  test('logo watermark from an uploaded image', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Watermark' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('radio', { name: 'Logo' }).click();
    await (await chooser).setFiles(await pngFile(page, '#ff0000'));
    await expect.poll(async () => (await editState(page)).watermark?.kind).toBe('image');
    const wm = (await editState(page)).watermark!;
    expect((await editState(page)).assets[wm.assetId!]).toBeTruthy();
  });

  test("the app's locked watermark has no controls and survives any edit state", async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('radio', { name: 'locked' }).click();
    await page.waitForFunction(
      () =>
        (window as unknown as { __iu: TestHook }).__iu.editor.current?.store.getState().status ===
        'ready',
    );
    expect((await editState(page)).watermark?.text).toBe('© image-ultra playground');
    await page.getByRole('tab', { name: 'Watermark' }).click();
    await expect(page.getByText('This watermark is added by the app')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'None', exact: true })).toHaveCount(0);

    // Even if the state loses it, the export puts it back (bottom-left).
    await page.evaluate(() => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      editor.setState({ ...editor.getState(), watermark: null });
    });
    expect((await editState(page)).watermark).toBeNull();
    const region: [number, number, number, number] = [40, 1400, 900, 160];
    expect(await brightness(page, region)).toBeGreaterThan(
      (await brightness(page, region, true)) + 3,
    );
  });
});

test.describe('Sticker tool', () => {
  test('the full emoji list and the 3D library load by category and search', async ({ page }) => {
    // Serve the 3D library locally (a small orange square) instead of the CDN.
    const png = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(64, 64);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(0, 0, 64, 64);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await page.route('**/fluent-emoji-3d@*/assets/**', (route) =>
      route.fulfill({
        body: Buffer.from(png),
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
      }),
    );
    await openEditor(page);
    await page.getByRole('tab', { name: 'Sticker' }).click();
    await page.getByRole('radio', { name: 'Animals & nature' }).click();
    const tiles = page.locator('.iu-stickerstrip__tile');
    await expect.poll(() => tiles.count()).toBeGreaterThan(100);
    await page.getByRole('button', { name: 'fox', exact: true }).click();
    await expect.poll(async () => (await editState(page)).annotations.length).toBe(1);
    const state = await editState(page);
    const asset = state.assets[(state.annotations[0] as { assetId: string }).assetId]!;
    expect(asset.src.startsWith('data:image/')).toBe(true); // embedded, works offline

    // Emoji: ~1,900 in categories; search matches the start of words.
    await page.getByRole('radio', { name: 'Emoji' }).click();
    await page.getByRole('radio', { name: 'Flags' }).click();
    await expect.poll(() => tiles.count()).toBeGreaterThan(200);
    await page.getByRole('searchbox', { name: 'Search' }).fill('cat');
    await expect(page.getByRole('button', { name: 'cat', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /delicate/ })).toHaveCount(0);
  });

  test('every built-in sticker renders; the app’s come first', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Sticker' }).click();
    const tiles = page.locator('.iu-stickerstrip__tile');
    await expect(tiles.first()).toHaveAttribute('aria-label', 'Playground logo');
    // Layout guard: tiles keep their 48px size (styles present).
    expect((await tiles.nth(1).boundingBox())!.width).toBe(44);
    await expect(page.locator('.iu-presets__divider')).toHaveCount(0); // one list, no divider
    const broken = await page
      .locator('.iu-stickerstrip__tile img')
      .evaluateAll((imgs) =>
        imgs.filter((img) => !(img as HTMLImageElement).naturalWidth).map((img) => img.outerHTML),
      );
    expect(broken).toEqual([]);
  });

  test('placing a sticker adds a selected image shape; Delete removes it; no drawing', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Sticker' }).click();
    await page.getByRole('button', { name: 'Star' }).click();
    await expect.poll(async () => (await editState(page)).annotations.length).toBe(1);
    const [star] = (await editState(page)).annotations;
    expect(star).toMatchObject({ type: 'image' });
    await expect(page.locator('.iu-annotate__selection')).toHaveCount(1);

    // Select-only: letters don't switch to drawing tools and a drag on empty photo draws nothing.
    await page.keyboard.press('r');
    await dragOnStage(page, [0.1, 0.1], [0.2, 0.2]);
    expect((await editState(page)).annotations).toHaveLength(1);

    // Emoji (searched), the app's sticker and an upload all become image shapes with an asset.
    await page.getByRole('radio', { name: 'Emoji' }).click();
    await page.getByRole('searchbox', { name: 'Search' }).fill('fire');
    await page.getByRole('button', { name: 'fire', exact: true }).click();
    await page.getByRole('radio', { name: 'Stickers' }).click();
    await page.getByRole('button', { name: 'Playground logo' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload your own' }).click();
    await (await chooser).setFiles(await pngFile(page, '#00ff00'));
    await expect.poll(async () => (await editState(page)).annotations.length).toBe(4);
    const state = await editState(page);
    for (const shape of state.annotations) {
      expect(shape.type).toBe('image');
      expect(state.assets[(shape as { assetId: string }).assetId]).toBeTruthy();
    }
    expect(Object.values(state.assets).some((a) => a.src === '/icon.svg')).toBe(true);

    // The last one is selected: Delete removes it, undo brings it back.
    const middle = await stagePoint(page, 0.5, 0.5);
    await page.mouse.move(middle.x, middle.y);
    await page.keyboard.press('Delete');
    expect((await editState(page)).annotations).toHaveLength(3);
    await page.keyboard.press('ControlOrMeta+z');
    expect((await editState(page)).annotations).toHaveLength(4);
  });
});
