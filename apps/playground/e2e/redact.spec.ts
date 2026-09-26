import { expect, test, type Page } from '@playwright/test';
import type { RedactBox, RedactBrush, RedactShape } from '@image-ultra/react';
import {
  dragOnStage,
  editState,
  historySteps,
  openEditor,
  stagePoint,
  type TestHook,
} from './support/editor';

// Sample image is 2400 × 1600.

async function openRedact(page: Page) {
  await openEditor(page);
  await page.getByRole('tab', { name: 'Redact' }).click();
}

/** Redaction areas — elements of type `redact` since 7.2b (DECISIONS #88). */
const areas = async (page: Page) =>
  (await editState(page)).annotations.filter((s): s is RedactShape => s.type === 'redact') as (
    RedactBox | RedactBrush
  )[] &
    RedactShape[];

/** Exported PNG pixels (RGBA) at image coordinates. */
function exportPixels(page: Page, points: [number, number][]) {
  return page.evaluate(async (pts) => {
    const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
    const result = await editor.exportImage({ mimeType: 'image/png' });
    const bitmap = await createImageBitmap(result.blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return pts.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
  }, points);
}

test.describe('Redact tool', () => {
  test('Box draws a pixelated area (default) as one step; export keeps only the blocks', async ({
    page,
  }) => {
    await openRedact(page);
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    const [area] = (await areas(page)) as RedactBox[];
    expect(area).toMatchObject({ kind: 'box', style: 'pixelate' });
    expect(await historySteps(page)).toBe(1);

    // Blocks are 52.8px (strength 50% of the 1600px short side), starting at the area's corner:
    // two points inside the first block get one colour; without the area they differ.
    const x0 = Math.floor(area!.x);
    const y0 = Math.floor(area!.y);
    const points: [number, number][] = [
      [x0 + 3, y0 + 3],
      [x0 + 48, y0 + 48],
    ];
    const [a, b] = await exportPixels(page, points);
    expect(a).toEqual(b);
    await page.keyboard.press('ControlOrMeta+z');
    const [a0, b0] = await exportPixels(page, points);
    expect(a0).not.toEqual(b0);
  });

  test('Solid fills with the chosen colour in the export', async ({ page }) => {
    await openRedact(page);
    await page.getByRole('radio', { name: 'Solid' }).click();
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    const [area] = (await areas(page)) as RedactBox[];
    const [[r, g, b, alpha]] = (await exportPixels(page, [
      [Math.round(area!.x + area!.width / 2), Math.round(area!.y + area!.height / 2)],
    ])) as [number[]];
    expect([r, g, b, alpha]).toEqual([0, 0, 0, 255]);
  });

  test('select, restyle (one step), move, delete, undo; a plain click draws nothing', async ({
    page,
  }) => {
    await openRedact(page);
    const empty = await stagePoint(page, 0.8, 0.8);
    await page.mouse.click(empty.x, empty.y);
    expect(await areas(page)).toHaveLength(0);

    await dragOnStage(page, [0.3, 0.3], [0.5, 0.5]);
    await page.mouse.click(empty.x, empty.y); // deselect
    await expect(page.locator('.iu-annotate__selection')).toHaveCount(0);
    const inside = await stagePoint(page, 0.4, 0.4);
    await page.mouse.click(inside.x, inside.y);
    await expect(page.locator('.iu-annotate__selection')).toHaveCount(1);

    await page.getByRole('radio', { name: 'Blur' }).click();
    expect((await areas(page))[0]!.style).toBe('blur');
    expect(await historySteps(page)).toBe(2);

    const before = (await areas(page))[0] as RedactBox;
    await dragOnStage(page, [0.4, 0.4], [0.45, 0.45]);
    expect(((await areas(page))[0] as RedactBox).x).toBeGreaterThan(before.x);

    await page.keyboard.press('Delete');
    expect(await areas(page)).toHaveLength(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await areas(page)).toHaveLength(1);
  });

  test('Brush paints an area; Clear all removes everything in one step', async ({ page }) => {
    await openRedact(page);
    await page.getByRole('radio', { name: 'Brush' }).click();
    const a = await stagePoint(page, 0.2, 0.5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(a.x + i * 10, a.y);
    await page.mouse.up();
    const [brush] = await areas(page);
    expect(brush).toMatchObject({ kind: 'brush', style: 'pixelate' });
    expect((brush as { size: number }).size).toBeCloseTo(1600 * 0.05, 0); // 5% of the short side

    await page.getByRole('button', { name: 'Clear all' }).click();
    expect(await areas(page)).toHaveLength(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await areas(page)).toHaveLength(1);
  });

  test('brush areas get resize handles and move from anywhere inside their outline', async ({
    page,
  }) => {
    await openRedact(page);
    await page.getByRole('radio', { name: 'Brush' }).click();
    // A diagonal stroke: its outline has empty corners away from the paint.
    const a = await stagePoint(page, 0.3, 0.3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(a.x + i * 10, a.y + i * 6);
    await page.mouse.up();
    const bounds = async () => {
      const [area] = await areas(page);
      // Outer outline (the stroke plus its radius), as the selection draws it.
      const brush = area as RedactBrush;
      const xs = brush.points.map((p) => p.x);
      return {
        minX: Math.min(...xs) - brush.size / 2,
        maxX: Math.max(...xs) + brush.size / 2,
        size: brush.size,
      };
    };
    const start = await bounds();

    // 8 resize handles + the rotate handle.
    await expect(page.locator('.iu-annotate__handle:not([data-handle="rotate"])')).toHaveCount(8);
    await expect(page.locator('[data-handle="rotate"]')).toHaveCount(1);
    const se = (await page.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(se.x + 5, se.y + 5);
    await page.mouse.down();
    await page.mouse.move(se.x + 105, se.y + 65, { steps: 4 });
    await page.mouse.up();
    const resized = await bounds();
    expect(resized.maxX - resized.minX).toBeGreaterThan(start.maxX - start.minX);
    expect(resized.minX).toBeCloseTo(start.minX, 0); // the opposite side stays

    // Top-right corner of the outline is empty photo — pressing there still moves the area.
    const outline = (await page.locator('.iu-annotate__selection').boundingBox())!;
    const from = { x: outline.x + outline.width - 12, y: outline.y + 12 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y, { steps: 4 });
    await page.mouse.up();
    expect(await areas(page)).toHaveLength(1); // moved, didn't paint a new stroke
    expect((await bounds()).minX).toBeGreaterThan(resized.minX);
  });

  test('the brush size changes a selected brush area (Solid too), as one step', async ({
    page,
  }) => {
    await openRedact(page);
    await page.getByRole('radio', { name: 'Brush' }).click();
    await page.getByRole('radio', { name: 'Solid' }).click();
    const a = await stagePoint(page, 0.3, 0.5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + i * 15, a.y);
    await page.mouse.up();
    const before = ((await areas(page))[0] as RedactBrush).size;
    const steps = await historySteps(page);

    // Switch to Box: the size control stays because a brush area is selected.
    await page.getByRole('radio', { name: 'Box' }).click();
    await page.getByRole('button', { name: 'Brush size' }).click();
    const slider = page.getByRole('slider', { name: 'Brush size' });
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    const after = ((await areas(page))[0] as RedactBrush).size;
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(1600 * 0.03, 0); // 5% → 3% of the short side
    expect(await historySteps(page)).toBeLessThanOrEqual(steps + 2);
  });

  test('areas rotate with the round handle (one step); rotated areas still move and resize', async ({
    page,
  }) => {
    await openRedact(page);
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.5]);
    const steps = await historySteps(page);
    const knob = (await page.locator('[data-handle="rotate"]').boundingBox())!;
    const outline = (await page.locator('.iu-annotate__selection').boundingBox())!;
    const center = { x: outline.x + outline.width / 2, y: outline.y + outline.height / 2 };
    // Drag the knob from above the centre to its right: a quarter turn clockwise.
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(center.x + 150, center.y - 60, { steps: 4 });
    await page.mouse.move(center.x + 200, center.y, { steps: 4 });
    await page.mouse.up();
    let [area] = (await areas(page)) as RedactBox[];
    expect(area!.rotation).toBe(90); // soft-snaps to 90°
    expect(await historySteps(page)).toBe(steps + 1);

    // Move from inside the turned outline.
    const x = area!.x;
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 30, center.y + 10, { steps: 4 });
    await page.mouse.up();
    [area] = (await areas(page)) as RedactBox[];
    expect(area!.x).toBeGreaterThan(x);

    // The "e" handle of a box turned 90° points down: dragging it down makes the box longer.
    const e = (await page.locator('[data-handle="e"]').boundingBox())!;
    const width = area!.width;
    await page.mouse.move(e.x + 5, e.y + 5);
    await page.mouse.down();
    await page.mouse.move(e.x + 5, e.y + 45, { steps: 4 });
    await page.mouse.up();
    [area] = (await areas(page)) as RedactBox[];
    expect(area!.width).toBeGreaterThan(width);
  });

  test('cursor: move inside the selected area, pointer over others, crosshair elsewhere', async ({
    page,
  }) => {
    await openRedact(page);
    await dragOnStage(page, [0.3, 0.3], [0.5, 0.5]); // selected
    await dragOnStage(page, [0.6, 0.6], [0.7, 0.7]); // now this one is selected
    const layer = page.locator('.iu-annotate-layer');
    const cursor = () => layer.evaluate((el) => getComputedStyle(el).cursor);
    const first = await stagePoint(page, 0.4, 0.4);
    const second = await stagePoint(page, 0.65, 0.65);
    const empty = await stagePoint(page, 0.85, 0.2);
    await page.mouse.move(second.x, second.y);
    expect(await cursor()).toBe('move');
    await page.mouse.move(first.x, first.y);
    expect(await cursor()).toBe('pointer');
    await page.mouse.move(empty.x, empty.y);
    expect(await cursor()).toBe('crosshair');

    // Brush: a brush-shaped cursor on empty photo, the usual cursors over areas, no size circle.
    await page.getByRole('radio', { name: 'Brush' }).click();
    await page.mouse.move(empty.x + 5, empty.y);
    expect(await cursor()).toContain('url(');
    await page.mouse.move(first.x, first.y);
    expect(await cursor()).toBe('pointer');
    await expect(page.locator('.iu-redact__brush')).toHaveCount(0);
  });

  test('rotating the photo carries areas along; compare hides them on the "before" side', async ({
    page,
  }) => {
    await openRedact(page);
    await dragOnStage(page, [0.2, 0.2], [0.35, 0.35]);
    const before = (await areas(page))[0] as RedactBox;
    await page.getByRole('tab', { name: 'Adjust' }).click();
    await page.getByRole('button', { name: 'Rotate left' }).click();
    const after = (await areas(page))[0] as RedactBox;
    // Turned with the photo like any element: same box, a quarter turn more.
    expect(after.width).toBeCloseTo(before.width, 3);
    expect(after.rotation).toBe(-90);
    expect(after.y + after.height / 2).toBeGreaterThan(before.y + before.height / 2);

    await page.getByRole('button', { name: /^Compare/ }).click();
    await expect(page.locator('.iu-stage__redactions')).toHaveAttribute('data-compare', '');
  });
});
