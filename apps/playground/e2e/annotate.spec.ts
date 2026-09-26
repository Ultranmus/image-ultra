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

  test('new text starts as "Text" and never vanishes; erased text comes back', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const p = await stagePoint(page, 0.3, 0.7);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    expect(await shapes(page)).toMatchObject([{ type: 'text', text: 'Text' }]);
    expect(await historySteps(page)).toBe(1);

    // Still the Text tool: clicking the box edits it. Erase everything and leave.
    await page.mouse.click(p.x + 30, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    expect(await shapes(page)).toMatchObject([{ type: 'text', text: 'Text' }]);
  });

  test('a press outside the photo layer finishes text editing, even without a blur', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const p = await stagePoint(page, 0.3, 0.7);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.type('Hi');
    await expect(page.locator('.iu-textedit')).toBeVisible();
    // Like Safari: a press on a toolbar button that doesn't take focus from the text box.
    await page.getByRole('radio', { name: /Rectangle/ }).dispatchEvent('pointerdown', {
      bubbles: true,
    });
    await expect(page.locator('.iu-textedit')).toHaveCount(0);
    expect(await shapes(page)).toMatchObject([{ type: 'text', text: 'Hi' }]);
    expect(await historySteps(page)).toBe(1);
  });

  test('Text tool: a click outside the photo makes no text box', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const photo = (await page.locator('.iu-stage').boundingBox())!;
    // The sample photo is landscape, so the stage has dark bands above and below it.
    await page.mouse.click(photo.x + photo.width / 2, photo.y + 4);
    await expect(page.locator('.iu-textedit')).toHaveCount(0);
    expect(await shapes(page)).toHaveLength(0);
  });

  test('text keeps its handles while editing: resize without leaving editing', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const p = await stagePoint(page, 0.3, 0.6);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.type('Hello');
    const handles = page.locator('.iu-annotate-layer__svg--above .iu-annotate__handle');
    await expect(handles.first()).toBeVisible();
    const before = (await shapes(page))[0] as { width: number };

    const e = (await page
      .locator('.iu-annotate-layer__svg--above [data-handle="e"]')
      .boundingBox())!;
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
    await page.mouse.down();
    await page.mouse.move(e.x + 80, e.y + e.height / 2, { steps: 4 });
    await page.mouse.up();

    await expect(page.locator('.iu-textedit')).toBeFocused(); // still editing
    await page.keyboard.type(' world');
    await page.keyboard.press('Escape');
    const [text] = (await shapes(page)) as { text: string; width: number }[];
    expect(text!.text).toBe('Hello world');
    expect(text!.width).toBeGreaterThan(before.width);
    expect(await historySteps(page)).toBe(1); // typing + resize = one step
  });

  test('Text tool: clicking an existing box edits it with the caret where you click', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const p = await stagePoint(page, 0.3, 0.7);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.type('Hello fjord');
    // Clicking the photo elsewhere commits; clicking the start of the text edits it again.
    const away = await stagePoint(page, 0.7, 0.3);
    await page.mouse.click(away.x, away.y);
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.mouse.click(p.x + 1, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.type('X');
    await page.keyboard.press('Escape');
    const texts = (await shapes(page)).map((s) => (s as { text: string }).text);
    expect(texts).toEqual(['XHello fjord', 'Text']);
  });

  test('Select tool: clicking the selected text box edits it; double-clicks never zoom', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /^Text/ }).click();
    const p = await stagePoint(page, 0.3, 0.7);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.type('Hello');
    await page.keyboard.press('Escape'); // commits; the box stays selected
    await page.getByRole('radio', { name: /Select/ }).click();
    const zoom = () =>
      page.evaluate(
        () =>
          (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState().viewport
            .scale,
      );
    const before = await zoom();

    // Inside the text (the box's left edge holds a resize handle while selected).
    await page.mouse.click(p.x + 12, p.y);
    await page.waitForTimeout(100);
    await page.keyboard.type('X');
    await page.keyboard.press('Escape');
    const [edited] = (await shapes(page)) as { text: string }[];
    expect(edited!.text).toHaveLength(6);
    expect(edited!.text).not.toBe('HelloX'); // caret at the click, not at the end

    await page.mouse.dblclick(p.x + 20, p.y);
    await page.waitForTimeout(400);
    await expect(page.locator('.iu-textedit')).toBeVisible();
    expect(await zoom()).toBe(before);

    // Empty photo still zooms on double-click.
    await page.keyboard.press('Escape');
    const empty = await stagePoint(page, 0.7, 0.3);
    await page.mouse.dblclick(empty.x, empty.y);
    await expect.poll(zoom).toBe(1);
  });

  test('a click on a shape with a drawing tool selects it and switches to Select', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    await page.getByRole('tab', { name: 'Annotate' }).focus();
    await page.keyboard.press('Escape'); // deselect

    for (const tool of [/Polygon/, /Ellipse/, /Pen/, /^Text/]) {
      await page.getByRole('radio', { name: tool }).click();
      const inside = await stagePoint(page, 0.45, 0.45);
      await page.mouse.click(inside.x, inside.y);
      await expect(page.getByRole('radio', { name: /Select/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(page.locator('.iu-annotate__selection')).toHaveCount(1);
      expect(await shapes(page)).toHaveLength(1);
      await page.keyboard.press('Escape');
    }

    // A drag that starts on a shape still draws a new one.
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.4, 0.4], [0.7, 0.7]);
    expect(await shapes(page)).toHaveLength(2);
  });

  test('context menu: unlock a locked shape from the photo, show it in Layers, ⋯ menu', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.getByRole('button', { name: 'Layers' }).click(); // close the panel

    const inside = await stagePoint(page, 0.45, 0.45);
    await page.mouse.click(inside.x, inside.y, { button: 'right' });
    const menu = page.getByRole('menu', { name: 'Layer actions' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Bring to front' })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
    await menu.getByRole('menuitem', { name: 'Unlock' }).click();
    expect((await shapes(page))[0]!.locked).toBeUndefined();

    // Keyboard: Shift+F10 opens the selected shape's menu.
    await page.keyboard.press('Shift+F10');
    await menu.getByRole('menuitem', { name: 'Show in Layers' }).click();
    await expect(page.locator('.iu-layers__row[data-selected] .iu-layers__name')).toBeFocused();

    await page.getByRole('button', { name: 'Layer actions' }).click();
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    expect(await shapes(page)).toHaveLength(2);
    await page.getByRole('button', { name: 'Layer actions' }).first().click();
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    expect(await shapes(page)).toHaveLength(1);
  });

  test('clicking outside the editor or on empty toolbar space deselects; controls keep it', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    const selection = page.locator('.iu-annotate__selection');
    await expect(selection).toHaveCount(1);

    // A control that edits the shape keeps it selected.
    await page.locator('.iu-colorbutton').first().click();
    await page.keyboard.press('Escape'); // close the popover
    await expect(selection).toHaveCount(1);

    // Empty ControlBar space deselects.
    await page.locator('.iu-controlbar').click({ position: { x: 4, y: 4 } });
    await expect(selection).toHaveCount(0);

    // Outside the editor deselects.
    await page.getByRole('radio', { name: /Select/ }).click();
    const inside = await stagePoint(page, 0.45, 0.45);
    await page.mouse.click(inside.x, inside.y);
    await expect(selection).toHaveCount(1);
    await page.locator('.pg-logo').click();
    await expect(selection).toHaveCount(0);
  });

  test('switching tools drops an unfinished polygon', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Polygon/ }).click();
    for (const [fx, fy] of [
      [0.3, 0.3],
      [0.6, 0.3],
    ] as const) {
      const q = await stagePoint(page, fx, fy);
      await page.mouse.click(q.x, q.y);
    }
    const draft = page.locator('.iu-annotate__draft');
    await expect(draft).toHaveCount(1);
    await page.getByRole('radio', { name: /Select/ }).click();
    await expect(draft).toHaveCount(0);
    await page.getByRole('radio', { name: /Polygon/ }).click();
    await expect(draft).toHaveCount(0); // it doesn't come back either
    expect(await shapes(page)).toHaveLength(0);
  });

  test('a selected polygon drags from the empty middle of its box', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Polygon/ }).click();
    for (const [fx, fy] of [
      [0.3, 0.3],
      [0.6, 0.3],
      [0.45, 0.6],
    ] as const) {
      const q = await stagePoint(page, fx, fy);
      await page.mouse.click(q.x, q.y);
    }
    await page.keyboard.press('Enter'); // closed, no fill: only the outline is paint
    const before = (await shapes(page))[0] as { points: { x: number }[] };
    await page.getByRole('radio', { name: /Select/ }).click();

    // Inside the triangle's box but on no stroke.
    const middle = await stagePoint(page, 0.45, 0.4);
    await page.mouse.move(middle.x, middle.y);
    await expect(page.locator('.iu-annotate-layer')).toHaveAttribute('data-cursor', 'move');
    await page.mouse.down();
    await page.mouse.move(middle.x + 60, middle.y, { steps: 4 });
    await page.mouse.up();
    const after = (await shapes(page))[0] as { points: { x: number }[] };
    expect(after.points[0]!.x).toBeGreaterThan(before.points[0]!.x);
    expect(await shapes(page)).toHaveLength(1);
  });

  test('cursor: move over the selected shape, pointer over others, crosshair on empty photo', async ({
    page,
  }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.5, 0.5]); // selected
    const layer = page.locator('.iu-annotate-layer');
    const cursor = () => layer.evaluate((el) => getComputedStyle(el).cursor);
    const inside = await stagePoint(page, 0.4, 0.4);
    const empty = await stagePoint(page, 0.8, 0.8);

    await page.mouse.move(inside.x, inside.y);
    expect(await cursor()).toBe('move');
    await page.mouse.down();
    await page.mouse.move(inside.x + 20, inside.y + 10, { steps: 3 });
    expect(await cursor()).toBe('grabbing');
    await page.mouse.up();

    await page.keyboard.press('Escape'); // deselect
    await page.mouse.move(inside.x + 25, inside.y + 15);
    expect(await cursor()).toBe('pointer'); // a click would select it
    await page.mouse.move(empty.x, empty.y);
    expect(await cursor()).toBe('crosshair'); // the Rectangle tool draws here
  });

  test('tooltips render above panels instead of being clipped by them', async ({ page }) => {
    await openAnnotate(page);
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.6, 0.6]);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.locator('.iu-layers__row').getByRole('button', { name: 'Hide' }).hover();
    const tooltip = page.locator('.iu-portal > .iu-tooltip');
    await expect(tooltip).toHaveText('Hide');
    await expect(tooltip).toBeVisible();
    const list = (await page.locator('.iu-layers__list').boundingBox())!;
    const tip = (await tooltip.boundingBox())!;
    expect(tip.y + tip.height).toBeGreaterThan(list.y + list.height); // extends past the list
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
    await page.getByRole('button', { name: 'Show', exact: true }).click();
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
