import { expect, test, type Page } from '@playwright/test';
import { editState, openEditor } from './support/editor';

const TOOLS = [
  'Adjust',
  'Finetune',
  'Filter',
  'Annotate',
  'Redact',
  'Sticker',
  'Frame',
  'Fill',
  'Resize',
  'Watermark',
];

/** ControlBar / TopBar problems: rows that scroll sideways, or anything outside the editor. */
function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.iu-root')!.getBoundingClientRect();
    const problems: string[] = [];
    document.querySelectorAll<HTMLElement>('.iu-controlbar *, .iu-topbar *').forEach((el) => {
      // Thumbnail, sticker and colour strips (and the ruler) scroll sideways by design.
      if (
        el.closest('.iu-presets, .iu-stickerstrip, .iu-colorstrip, .iu-ruler, .iu-annotate__tools')
      )
        return;
      const style = getComputedStyle(el);
      const scrolls = style.overflowX === 'auto' || style.overflowX === 'scroll';
      if (scrolls && el.scrollWidth > el.clientWidth + 1) problems.push(`scrolls: ${el.className}`);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && el.offsetParent && (r.left < root.left - 1 || r.right > root.right + 1))
        problems.push(`outside: ${el.tagName}.${el.className}`);
    });
    // Everything in the ControlBar is reachable (it may scroll up and down, never clip).
    const bar = document.querySelector<HTMLElement>('.iu-controlbar')!;
    if (bar.scrollHeight > bar.clientHeight + 1 && getComputedStyle(bar).overflowY !== 'auto')
      problems.push('controlbar clips');
    return [...new Set(problems)];
  });
}

for (const [width, height] of [
  [320, 568],
  [390, 844],
] as const) {
  test.describe(`phone ${width}px`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test('no tool row scrolls sideways or sticks out of the editor', async ({ page }) => {
      await openEditor(page);
      for (const tool of TOOLS) {
        await page.getByRole('tab', { name: tool }).click();
        await expect(page.getByRole('tab', { name: tool })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        expect(await layoutProblems(page), tool).toEqual([]);
      }
    });

    test('the tool rail keeps a gap after the last tool', async ({ page }) => {
      await openEditor(page);
      const gap = await page.evaluate(() => {
        const rail = document.querySelector<HTMLElement>('.iu-rail')!;
        rail.scrollLeft = rail.scrollWidth;
        const tabs = rail.querySelectorAll('[role="tab"]');
        return (
          rail.getBoundingClientRect().right - tabs[tabs.length - 1]!.getBoundingClientRect().right
        );
      });
      expect(gap).toBeGreaterThanOrEqual(8);
    });

    test('Resize: the Size | Canvas switch is centred and Reset sits at the start', async ({
      page,
    }) => {
      await openEditor(page);
      await page.getByRole('tab', { name: 'Resize' }).click();
      await page.getByRole('radio', { name: 'Canvas' }).click();
      const row = (await page.locator('.iu-resize__head').boundingBox())!;
      const toggle = (await page.getByRole('radiogroup', { name: 'Resize' }).boundingBox())!;
      const reset = (await page.getByRole('button', { name: 'Remove added space' }).boundingBox())!;
      expect(Math.abs(toggle.x + toggle.width / 2 - (row.x + row.width / 2))).toBeLessThan(2);
      expect(Math.abs(toggle.y - reset.y)).toBeLessThan(8);
      expect(reset.x - row.x).toBeLessThan(2);
    });

    test('Annotate: tools and the selection row are one line each; Layers is in the TopBar', async ({
      page,
    }) => {
      await openEditor(page);
      await page.getByRole('tab', { name: 'Annotate' }).click();
      const tools = (await page.getByRole('radiogroup', { name: 'Drawing tools' }).boundingBox())!;
      expect(tools.height).toBeLessThan(56);
      const row = (await page.locator('.iu-annotate__inspector').boundingBox())!;
      expect(row.height).toBeLessThan(56);
      const layers = page.getByRole('button', { name: 'Layers' });
      await expect(layers).toHaveCount(1);
      expect((await layers.boundingBox())!.y).toBeLessThan(tools.y);
    });

    test('the playground gives the editor the screen; settings open on demand', async ({
      page,
    }) => {
      await openEditor(page);
      const editor = (await page.locator('.iu-root').boundingBox())!;
      expect(editor.height).toBeGreaterThan(height * 0.85);
      await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeHidden();
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  });
}

test.describe('touch gestures', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a second finger pinches, even while a drawing tool is active', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    // Playwright may scroll the (taller than the screen) playground page before a click, which
    // moves the photo away from the touch points: click from inside the page instead.
    await page.getByRole('radio', { name: /Rectangle/ }).evaluate((el: HTMLElement) => el.click());
    expect(await page.evaluate(() => scrollY)).toBe(0);
    // Wait for the layout to settle, and make sure the fingers land on the photo layer.
    const layer = page.locator('.iu-annotate-layer');
    let box = (await layer.boundingBox())!;
    await expect
      .poll(async () => {
        const previous = box;
        box = (await layer.boundingBox())!;
        return JSON.stringify(box) === JSON.stringify(previous);
      })
      .toBe(true);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const scale = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __iu: {
                editor: { current: { store: { getState(): { viewport: { scale: number } } } } };
              };
            }
          ).__iu.editor.current.store.getState().viewport.scale,
      );
    const before = await scale();

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, points: { x: number; y: number; id: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    // First finger starts drawing, the second joins and both spread apart.
    await touch('touchStart', [{ x: cx - 20, y: cy, id: 1 }]);
    await touch('touchMove', [{ x: cx - 30, y: cy + 10, id: 1 }]);
    await touch('touchStart', [
      { x: cx - 30, y: cy + 10, id: 1 },
      { x: cx + 20, y: cy, id: 2 },
    ]);
    for (let i = 1; i <= 5; i++) {
      await touch('touchMove', [
        { x: cx - 30 - i * 15, y: cy + 10, id: 1 },
        { x: cx + 20 + i * 15, y: cy, id: 2 },
      ]);
    }
    await touch('touchEnd', []);

    expect(await scale()).toBeGreaterThan(before * 1.5);
    expect((await editState(page)).annotations).toHaveLength(0);
  });
});
