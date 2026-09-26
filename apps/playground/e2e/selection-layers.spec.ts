import { expect, test, type Page } from '@playwright/test';
import type { LineShape, RectShape, TextShape } from '@image-ultra/react';
import {
  dragOnStage,
  editState,
  historySteps,
  openEditor,
  stagePoint,
  type TestHook,
} from './support/editor';

const shapes = async (page: Page): Promise<RectShape[]> =>
  (await editState(page)).annotations as RectShape[];

/** Draws rectangles at stage fractions [x0, y0, x1, y1], then switches to Select. */
async function drawRects(page: Page, boxes: [number, number, number, number][]) {
  await page.getByRole('tab', { name: 'Annotate' }).click();
  for (const [x0, y0, x1, y1] of boxes) {
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [x0, y0], [x1, y1]);
  }
  await page.getByRole('radio', { name: /Select/ }).click();
}

async function clickStage(page: Page, fx: number, fy: number, modifiers: 'Shift'[] = []) {
  const p = await stagePoint(page, fx, fy);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(p.x, p.y);
  for (const key of modifiers) await page.keyboard.up(key);
}

async function dragHandle(page: Page, handle: string, dx: number, dy: number) {
  const box = (await page.locator(`[data-handle="${handle}"]`).first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

const TWO: [number, number, number, number][] = [
  [0.3, 0.3, 0.4, 0.4],
  [0.5, 0.5, 0.6, 0.6],
];

test.describe('Multi-select', () => {
  test('Shift-click builds a group; it moves as one step; Delete removes all of it', async ({
    page,
  }) => {
    await openEditor(page);
    await drawRects(page, TWO);
    await clickStage(page, 0.35, 0.35);
    await clickStage(page, 0.55, 0.55, ['Shift']);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(2);
    await expect(page.getByText('2 selected')).toBeVisible();

    const before = await shapes(page);
    const steps = await historySteps(page);
    await dragOnStage(page, [0.35, 0.35], [0.4, 0.4]);
    const after = await shapes(page);
    expect(after[0]!.x - before[0]!.x).toBeCloseTo(after[1]!.x - before[1]!.x, 3);
    expect(after[0]!.x).toBeGreaterThan(before[0]!.x);
    expect(await historySteps(page)).toBe(steps + 1);

    // Shift-click again takes one out.
    await clickStage(page, 0.6, 0.6, ['Shift']);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(0);
    await clickStage(page, 0.6, 0.6, ['Shift']);
    await page.keyboard.press('Delete');
    expect(await shapes(page)).toHaveLength(0);
  });

  test('a drag on empty space draws a selection box; a click without dragging deselects', async ({
    page,
  }) => {
    await openEditor(page);
    await drawRects(page, TWO);
    await dragOnStage(page, [0.25, 0.25], [0.65, 0.65]);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(2);
    await clickStage(page, 0.15, 0.8);
    await expect(page.locator('.iu-annotate__selection')).toHaveCount(0);
  });

  test('⌘A selects all; corner handle resizes and the round handle rotates the group', async ({
    page,
  }) => {
    await openEditor(page);
    await drawRects(page, TWO);
    await page.keyboard.press('ControlOrMeta+a');
    await expect(page.locator('.iu-annotate__member')).toHaveCount(2);

    const before = await shapes(page);
    await dragHandle(page, 'se', 60, 60);
    const scaled = await shapes(page);
    const k0 = scaled[0]!.width / before[0]!.width;
    const k1 = scaled[1]!.width / before[1]!.width;
    expect(k0).toBeGreaterThan(1.1);
    expect(k0).toBeCloseTo(k1, 3);
    expect(scaled[0]!.strokeWidth / before[0]!.strokeWidth).toBeCloseTo(k0, 3);

    await dragHandle(page, 'rotate', 150, 120);
    const turned = await shapes(page);
    expect(turned[0]!.rotation).not.toBe(0);
    expect(turned[0]!.rotation).toBeCloseTo(turned[1]!.rotation, 3);
  });

  test('align and distribute; group styling; copy / paste the group', async ({ page }) => {
    await openEditor(page);
    await drawRects(page, [
      [0.2, 0.2, 0.25, 0.3],
      [0.3, 0.4, 0.4, 0.45],
      [0.6, 0.6, 0.7, 0.7],
    ]);
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByRole('button', { name: 'Align', exact: true }).click();
    await page.getByRole('button', { name: 'Align left' }).click();
    const aligned = await shapes(page);
    expect(new Set(aligned.map((s) => Math.round(s.x))).size).toBe(1);
    await page.getByRole('button', { name: 'Distribute vertically' }).click();
    const spread = [...(await shapes(page))].sort((a, b) => a.y - b.y);
    const gap1 = spread[1]!.y - (spread[0]!.y + spread[0]!.height);
    const gap2 = spread[2]!.y - (spread[1]!.y + spread[1]!.height);
    expect(gap1).toBeCloseTo(gap2, 3);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+a');

    await page.getByRole('button', { name: 'Line width' }).click();
    await page.getByRole('radio', { name: 'XL' }).click();
    const widths = new Set((await shapes(page)).map((s) => s.strokeWidth));
    expect(widths.size).toBe(1);
    await page.keyboard.press('Escape');

    await page.locator('.iu-annotate-layer').focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    await page.mouse.move(2, 2);
    await page.keyboard.press('ControlOrMeta+v');
    expect(await shapes(page)).toHaveLength(6);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(3);
  });

  test('Space + drag pans the photo instead of drawing a selection box', async ({ page }) => {
    await openEditor(page);
    await drawRects(page, TWO);
    await page.locator('.iu-annotate-layer').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('+');
    const viewport = () =>
      page.evaluate(
        () =>
          (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState().viewport,
      );
    await page.waitForTimeout(500); // zoom animation
    const before = await viewport();
    await page.keyboard.down('Space');
    await dragOnStage(page, [0.5, 0.5], [0.3, 0.3]);
    await page.keyboard.up('Space');
    const after = await viewport();
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(0);
  });
});

test.describe('Layers panel', () => {
  test('drag to reorder, double-click to rename, Show all, Shift-click rows', async ({ page }) => {
    await openEditor(page);
    await drawRects(page, [...TWO, [0.7, 0.2, 0.8, 0.3]]);
    const ids = (await shapes(page)).map((s) => s.id);
    await page.getByRole('button', { name: 'Layers' }).click();
    const rows = page.locator('.iu-layers__row');

    // The top row (last drawn) dragged below the bottom row → it becomes the bottom layer.
    const top = (await rows.nth(0).locator('.iu-layers__name').boundingBox())!;
    const bottom = (await rows.nth(2).locator('.iu-layers__name').boundingBox())!;
    await page.mouse.move(top.x + 40, top.y + top.height / 2);
    await page.mouse.down();
    await page.mouse.move(top.x + 40, bottom.y + bottom.height - 2, { steps: 8 });
    await page.mouse.up();
    expect((await shapes(page)).map((s) => s.id)).toEqual([ids[2], ids[0], ids[1]]);

    await rows.nth(0).locator('.iu-layers__name').dblclick();
    await page.getByRole('textbox', { name: 'Rename' }).fill('Badge');
    await page.keyboard.press('Enter');
    expect((await shapes(page)).find((s) => s.id === ids[1])!.name).toBe('Badge');

    await page.getByRole('button', { name: 'Hide' }).first().click();
    await page.getByRole('button', { name: 'Show all' }).click();
    expect((await shapes(page)).every((s) => !s.hidden)).toBe(true);

    await rows.nth(0).locator('.iu-layers__name').click();
    await rows
      .nth(1)
      .locator('.iu-layers__name')
      .click({ modifiers: ['Shift'] });
    await expect(page.locator('.iu-layers__row[data-selected]')).toHaveCount(2);
    await expect(page.locator('.iu-annotate__member')).toHaveCount(2);
  });
});

test.describe('Small fixes', () => {
  test('an arrow end gets a hollow handle so the head stays visible', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('radio', { name: /Arrow/ }).click();
    await dragOnStage(page, [0.3, 0.5], [0.6, 0.5]);
    const line = (await editState(page)).annotations[0] as LineShape;
    expect(line.endCap).toBe('arrow');
    await expect(page.locator('[data-handle="p1"][data-hollow]')).toHaveCount(1);
    await expect(page.locator('[data-handle="p0"][data-hollow]')).toHaveCount(0);
  });

  test('the text editor wraps to the same number of lines as the drawn text', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('radio', { name: /Text/ }).click();
    await clickStage(page, 0.3, 0.3);
    await page.keyboard.type(
      'A well-known sentence that wraps across several lines supercalifragilistic',
    );
    await page.keyboard.press('Escape');
    const shape = (await editState(page)).annotations[0] as TextShape;
    // Narrow the box so it wraps a lot, then open the editor again.
    await page.evaluate((id) => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      editor.update('narrow', (s) => {
        const t = s.annotations.find((x) => x.id === id) as { width: number; fontSize: number };
        t.width = t.fontSize * 6;
      });
    }, shape.id);
    const box = (await page.locator('.iu-annotate__selection').boundingBox())!;
    await page.mouse.dblclick(box.x + 5, box.y + 5);
    const heights = await page.locator('.iu-textedit').evaluate((el) => {
      const area = el as HTMLTextAreaElement;
      const drawn = area.clientHeight; // = the canvas layout's height
      area.style.height = '0px';
      const typed = area.scrollHeight; // what CSS wraps to
      const line = parseFloat(getComputedStyle(area).fontSize) * 1.25;
      return { drawn, typed, line };
    });
    expect(Math.abs(heights.typed - heights.drawn)).toBeLessThan(heights.line / 2);
  });
});
