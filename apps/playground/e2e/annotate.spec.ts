import { expect, test, type Page } from '@playwright/test';
import type { RectShape, Shape } from '@image-ultra/react';
import {
  dragOnStage,
  editState,
  exportPixel,
  historySteps,
  openEditor,
  stagePoint,
  type TestHook,
} from './support/editor';

async function openAnnotate(page: Page) {
  await openEditor(page);
  await page.getByRole('tab', { name: 'Annotate' }).click();
}

const shapes = async (page: Page): Promise<Shape[]> => (await editState(page)).annotations;

test.describe('Annotate tool', () => {
  test('drag draws a rectangle as one undo step; it is exported on top of the photo', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    const list = await shapes(page);
    expect(list).toHaveLength(1);
    expect(list[0]!.type).toBe('rect');
    expect(await historySteps(page)).toBe(1);

    // Give it a solid fill and check the exported pixel in its middle.
    await page.evaluate(() => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      editor.update('fill', (s) => {
        (s.annotations[0] as RectShape).fill = '#00ff00';
      });
    });
    const [r, g, b] = await exportPixel(page, 0.5, 0.5);
    expect([r, g, b]).toEqual([0, 255, 0]);
  });

  test('a click without dragging drops a default-size shape', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Ellipse/ }).click();
    const p = await stagePoint(page, 0.5, 0.5);
    await page.mouse.click(p.x, p.y);
    const [shape] = (await shapes(page)) as RectShape[];
    expect(shape!.type).toBe('ellipse');
    expect(shape!.width).toBeGreaterThan(100);
  });

  test('select, move (one step), resize from a handle, delete and undo', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.5, 0.5]);
    await page.getByRole('radio', { name: /Select/ }).click();
    const before = (await shapes(page))[0] as RectShape;

    await dragOnStage(page, [0.4, 0.4], [0.45, 0.45]);
    const moved = (await shapes(page))[0] as RectShape;
    expect(moved.x).toBeGreaterThan(before.x);
    expect(moved.width).toBeCloseTo(before.width, 3);
    expect(await historySteps(page)).toBe(2);

    const handle = page.locator('.iu-annotate__handle[data-handle="se"]');
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + 5, h.y + 5);
    await page.mouse.down();
    await page.mouse.move(h.x + 65, h.y + 45, { steps: 4 });
    await page.mouse.up();
    const resized = (await shapes(page))[0] as RectShape;
    expect(resized.width).toBeGreaterThan(moved.width);
    expect(resized.x).toBeCloseTo(moved.x, 3); // top-left stays put

    await page.getByRole('tab', { name: 'Annotate' }).focus();
    await page.keyboard.press('Delete');
    expect(await shapes(page)).toHaveLength(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await shapes(page)).toHaveLength(1);
  });

  test('text: click to type, Escape commits, double-click edits again', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const p = await stagePoint(page, 0.3, 0.7);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.type('Hello fjord');
    await page.keyboard.press('Escape');
    let [text] = await shapes(page);
    expect(text).toMatchObject({ type: 'text', text: 'Hello fjord' });
    expect(await historySteps(page)).toBe(1);

    await page.getByRole('radio', { name: /Select/ }).click();
    const t = await stagePoint(page, 0.32, 0.7);
    await page.mouse.dblclick(t.x, t.y);
    await page.waitForTimeout(100);
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await page.keyboard.press('Escape');
    [text] = await shapes(page);
    expect(text).toMatchObject({ text: 'Hello fjord!' });
  });

  test('empty text is discarded', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const p = await stagePoint(page, 0.3, 0.7);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    expect(await shapes(page)).toHaveLength(0);
    expect(await historySteps(page)).toBe(0);
  });

  test('pen draws a smoothed, simplified path; polygon closes with Enter', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Pen/ }).click();
    const a = await stagePoint(page, 0.2, 0.5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(a.x + i * 8, a.y); // a straight stroke
    await page.mouse.up();
    const [pen] = await shapes(page);
    expect(pen).toMatchObject({ type: 'path', smooth: true, closed: false });
    expect((pen as { points: unknown[] }).points.length).toBeLessThan(5); // simplified

    await page.getByRole('radio', { name: /Polygon/ }).click();
    for (const [fx, fy] of [
      [0.6, 0.3],
      [0.8, 0.35],
      [0.7, 0.6],
    ] as const) {
      const q = await stagePoint(page, fx, fy);
      await page.mouse.click(q.x, q.y);
    }
    await page.keyboard.press('Enter');
    const poly = (await shapes(page))[1];
    expect(poly).toMatchObject({ type: 'path', closed: true, smooth: false });
  });

  test('keyboard: R picks Rectangle, ⌘D duplicates, Escape deselects', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('tab', { name: 'Annotate' }).focus();
    await page.keyboard.press('r');
    await expect(page.getByRole('radio', { name: /Rectangle/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await dragOnStage(page, [0.3, 0.3], [0.5, 0.5]);
    await page.getByRole('tab', { name: 'Annotate' }).focus();
    await page.keyboard.press('ControlOrMeta+d');
    expect(await shapes(page)).toHaveLength(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.iu-annotate__selection')).toHaveCount(0);
  });

  test('layers: hiding removes a shape from the export; locked shapes cannot be grabbed', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    await page.evaluate(() => {
      const editor = (window as unknown as { __iu: TestHook }).__iu.editor.current!;
      editor.update('fill', (s) => {
        (s.annotations[0] as RectShape).fill = '#00ff00';
      });
    });
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Hide' }).click();
    const [r, g, b] = await exportPixel(page, 0.5, 0.5);
    expect([r, g, b]).not.toEqual([0, 255, 0]);
    await page.getByRole('button', { name: 'Show' }).click();
    await page.getByRole('button', { name: 'Lock', exact: true }).click();

    await page.getByRole('radio', { name: /Select/ }).click();
    const before = (await shapes(page))[0] as RectShape;
    await dragOnStage(page, [0.45, 0.45], [0.55, 0.55]);
    expect(((await shapes(page))[0] as RectShape).x).toBe(before.x);
  });

  test('rotating the photo carries annotations along', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.2, 0.2], [0.35, 0.35]);
    const before = (await shapes(page))[0] as RectShape;
    await page.getByRole('tab', { name: 'Adjust' }).click();
    await page.getByRole('button', { name: 'Rotate left' }).click();
    const after = (await shapes(page))[0] as RectShape;
    expect(after.rotation).toBe(-90);
    // Top-left region of a landscape photo ends up bottom-left after a left turn.
    expect(after.y + after.height / 2).toBeGreaterThan(before.y + before.height / 2);
  });
});
