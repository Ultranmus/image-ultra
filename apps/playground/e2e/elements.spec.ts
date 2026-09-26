import { expect, test, type Page } from '@playwright/test';
import type { RectShape } from '@image-ultra/react';
import {
  dragOnStage,
  editState,
  exportPixel,
  openEditor,
  stagePoint,
  type TestHook,
} from './support/editor';

/* 7.2b: shapes, redaction areas and the watermark are one ordered list of elements. */

const update = (page: Page, code: string) =>
  page.evaluate((c) => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    editor.update('test', new Function('s', c) as (s: unknown) => void);
  }, code);

/** Exported PNG pixel at image (oriented) coordinates — no crop here, so they're the same. */
function pixelAt(page: Page, x: number, y: number) {
  return page.evaluate(
    async ({ px, py }) => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      const result = await editor.exportImage({ mimeType: 'image/png' });
      const bitmap = await createImageBitmap(result.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return Array.from(ctx.getImageData(px, py, 1, 1).data);
    },
    { px: Math.round(x), py: Math.round(y) },
  );
}

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('radio', { name: /Rectangle/ }).click();
  await dragOnStage(page, from, to);
}

async function drawRedactBox(page: Page, from: [number, number], to: [number, number]) {
  await page.getByRole('tab', { name: 'Redact' }).click();
  await page.getByRole('radio', { name: 'Box' }).click();
  await dragOnStage(page, from, to);
}

test('a shape and a redaction area group together, move together, and reorder', async ({
  page,
}) => {
  await openEditor(page);
  await drawRect(page, [0.3, 0.3], [0.5, 0.5]);
  // A green rectangle, then a solid red redaction box over its middle.
  await update(page, "s.annotations[0].fill = '#00ff00';");
  await drawRedactBox(page, [0.35, 0.35], [0.45, 0.45]);
  await update(page, "s.annotations[1].style = 'solid'; s.annotations[1].color = '#ff0000';");
  const list = (await editState(page)).annotations;
  expect(list.map((s) => s.type)).toEqual(['rect', 'redact']);

  // The redaction area is above the rectangle: it hides it.
  const box = list[1] as unknown as RectShape;
  expect((await pixelAt(page, box.x + box.width / 2, box.y + box.height / 2)).slice(0, 3)).toEqual([
    255, 0, 0,
  ]);

  // Select mode in Redact: ⌘A picks both; they move as one.
  await page.getByRole('radio', { name: 'Select' }).click();
  await page.locator('.iu-annotate-layer').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('.iu-annotate__member')).toHaveCount(2);
  const before = (await editState(page)).annotations as RectShape[];
  await dragOnStage(page, [0.4, 0.4], [0.45, 0.45]);
  const after = (await editState(page)).annotations as RectShape[];
  expect(after[0]!.x - before[0]!.x).toBeCloseTo(after[1]!.x - before[1]!.x, 3);
  expect(after[0]!.x).toBeGreaterThan(before[0]!.x);

  // Send the redaction area to the back: now the rectangle covers it (green again).
  await page.keyboard.press('Escape');
  const p = await stagePoint(page, 0.45, 0.45);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Send to back' }).click();
  expect((await editState(page)).annotations.map((s) => s.type)).toEqual(['redact', 'rect']);
  const moved = (await editState(page)).annotations[0] as unknown as RectShape;
  const out = await pixelAt(page, moved.x + moved.width / 2, moved.y + moved.height / 2);
  expect(out.slice(0, 3)).toEqual([0, 255, 0]);
});

test('the watermark is an element: selectable, movable, reorderable, but only one', async ({
  page,
}) => {
  await openEditor(page);
  await drawRect(page, [0.2, 0.2], [0.3, 0.3]);
  await update(
    page,
    "s.watermark = { kind: 'text', text: 'WATERMARK', fontFamily: 'sans-serif', fontWeight: 700, color: '#ffffff', assetId: null, position: 'center', x: 0.5, y: 0.5, rotation: 0, size: 0.3, opacity: 1, margin: 0.03 };",
  );
  await page.getByRole('radio', { name: /Select/ }).click();
  await page.locator('.iu-annotate-layer').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('.iu-annotate__member')).toHaveCount(2); // rectangle + watermark

  // Layers lists it; "Send to back" puts its marker at the bottom of the order.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Layers' }).click();
  const row = page.locator('.iu-layers__row', { hasText: 'Watermark' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Send backward' }).click();
  expect((await editState(page)).annotations.map((s) => s.type)).toEqual(['watermark', 'rect']);
  // Back to the top: the marker goes away (top = default).
  await row.getByRole('button', { name: 'Bring forward' }).click();
  expect((await editState(page)).annotations.map((s) => s.type)).toEqual(['rect']);

  // Dragging it on the photo gives it a custom position.
  await page.getByRole('button', { name: 'Layers' }).click();
  await dragOnStage(page, [0.5, 0.5], [0.6, 0.7]);
  const wm = (await editState(page)).watermark!;
  expect(wm.position).toBe('custom');
  expect(wm.x).toBeGreaterThan(0.55);
  expect(wm.y).toBeGreaterThan(0.6);

  // Copy / duplicate never make a second watermark.
  await page.keyboard.press('ControlOrMeta+d');
  expect((await editState(page)).annotations.filter((s) => s.type !== 'rect')).toHaveLength(0);
});

test('an app-locked watermark stays on top and is never selected', async ({ page }) => {
  await openEditor(page);
  await page
    .getByRole('radiogroup', { name: 'App watermark' })
    .getByRole('radio', { name: 'locked' })
    .click();
  await page.waitForFunction(() => {
    const hook = (window as unknown as { __iu?: TestHook }).__iu;
    return hook?.editor.current?.store.getState().status === 'ready';
  });
  await drawRect(page, [0.2, 0.2], [0.3, 0.3]);
  await drawRect(page, [0.5, 0.5], [0.6, 0.6]);
  await page.getByRole('radio', { name: /Select/ }).click();
  await page.locator('.iu-annotate-layer').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('.iu-annotate__member')).toHaveCount(2); // the two rectangles only
});

test('edits saved before 7.2b open with their redaction areas as the bottom elements', async ({
  page,
}) => {
  await openEditor(page);
  await page.evaluate(() => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    editor.setState({
      version: 1,
      redactions: [
        {
          id: 'old',
          kind: 'box',
          style: 'solid',
          strength: 0.5,
          color: '#0000ff',
          rotation: 0,
          x: 100,
          y: 100,
          width: 400,
          height: 300,
        },
      ],
      annotations: [{ id: 'r', type: 'rect', x: 1000, y: 1000, width: 200, height: 200 }],
    });
  });
  const list = (await editState(page)).annotations;
  expect(list.map((s) => [s.id, s.type])).toEqual([
    ['old', 'redact'],
    ['r', 'rect'],
  ]);
  // Still hides the photo in the export.
  const [r, g, b] = await exportPixel(page, 300 / 2400, 250 / 1600);
  expect([r, g, b]).toEqual([0, 0, 255]);
});
