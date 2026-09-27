import { expect, test, type Page } from '@playwright/test';
import { dragOnStage, openEditor } from './support/editor';

/** What the polite live region is saying (no-break spaces mark a repeat). */
const said = (page: Page) =>
  page
    .locator('.iu-announcer')
    .innerText()
    .then((t) => t.replace(/\u00a0/g, '').trim());

test.describe('Screen readers', () => {
  test('announces tools, undo / redo, zoom, crop size, selection and saving', async ({ page }) => {
    await openEditor(page);
    const ed = page.locator('.iu-root');

    await ed.getByRole('tab', { name: 'Finetune' }).click();
    await expect.poll(() => said(page)).toBe('Finetune');

    await ed.getByRole('slider', { name: 'Brightness' }).focus();
    await page.keyboard.press('ArrowRight');
    await ed.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => said(page)).toBe('Undone: Brightness');
    await ed.getByRole('button', { name: 'Redo' }).click();
    await expect.poll(() => said(page)).toBe('Redone: Brightness');

    await ed.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(() => said(page)).toMatch(/^Zoom \d+%$/);

    await ed.getByRole('tab', { name: 'Adjust' }).click();
    await ed.getByRole('radio', { name: '1:1' }).click();
    await expect.poll(() => said(page)).toMatch(/^Crop (\d+) × \1$/);

    await ed.getByRole('tab', { name: 'Annotate' }).click();
    await ed.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.4], [0.45, 0.55]);
    await expect.poll(() => said(page)).toBe('Rectangle selected');
    await ed.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.55, 0.4], [0.7, 0.55]);
    await page.locator('.iu-annotate-layer').focus();
    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(() => said(page)).toBe('2 selected');
    await page.keyboard.press('Escape');
    await expect.poll(() => said(page)).toBe('Nothing selected');

    await ed.getByRole('button', { name: 'Done' }).click();
    await expect.poll(() => said(page)).toBe('Saved');
  });

  test('switching tools says only the tool names (a re-fit is not a zoom)', async ({ page }) => {
    await openEditor(page);
    await page.evaluate(() => {
      const w = window as unknown as { said: string[] };
      w.said = [];
      const el = document.querySelector('.iu-announcer')!;
      new MutationObserver(() => w.said.push((el.textContent ?? '').trim())).observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    const tools = ['Finetune', 'Adjust', 'Annotate', 'Resize', 'Filter'];
    for (const tool of tools) {
      await page.locator('.iu-root').getByRole('tab', { name: tool }).click();
      await page.waitForTimeout(700); // longer than the zoom / crop settle time
    }
    expect(await page.evaluate(() => (window as unknown as { said: string[] }).said)).toEqual(
      tools,
    );
  });

  test('the photo, its elements and the curve points have useful names', async ({ page }) => {
    await openEditor(page);
    const ed = page.locator('.iu-root');
    await expect(ed.getByRole('group', { name: /^Photo, \d+ × \d+$/ })).toBeVisible();

    await ed.getByRole('tab', { name: 'Annotate' }).click();
    const layer = ed.getByRole('group', { name: 'Photo and its elements' });
    await expect(layer).toHaveAccessibleDescription(/Tab and Shift\+Tab select/);

    await ed.getByRole('tab', { name: 'Finetune' }).click();
    await ed.getByRole('radio', { name: 'Curves' }).click();
    await expect(ed.getByRole('slider', { name: 'Curve point 1' })).toHaveAttribute(
      'aria-valuetext',
      'input 0, output 0',
    );
  });

  test('TopBar, tool rail and Finetune read in a sensible order', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('.iu-topbar')).toMatchAriaSnapshot(`
      - button "Cancel"
      - button "Reset" [disabled]
      - button "Undo" [disabled]
      - button "Redo" [disabled]
      - button "Compare · hold to see the original"
      - button "History" [disabled]
      - button "Layers"
      - group "Zoom level":
        - button "Zoom out"
        - button /Zoom level \\d+%\\. Fit to screen/
        - button "Zoom in"
      - button "Keyboard shortcuts"
      - button "Done"
    `);
    await expect(page.locator('.iu-rail')).toMatchAriaSnapshot(`
      - navigation "Editing tools":
        - tablist "Editing tools":
          - tab "Adjust" [selected]
          - tab "Finetune"
          - tab "Filter"
          - tab "Annotate"
          - tab "Redact"
          - tab "Sticker"
          - tab "Frame"
          - tab "Fill"
          - tab "Resize"
          - tab "Watermark"
    `);
    await page.locator('.iu-root').getByRole('tab', { name: 'Finetune' }).click();
    await expect(page.locator('.iu-controlbar')).toMatchAriaSnapshot(`
      - tabpanel "Finetune":
        - radiogroup "Finetune":
          - radio "Adjust" [checked]
          - radio "Curves"
          - radio "Levels"
        - button "Auto"
        - button "Save look" [disabled]
        - button "Reset" [disabled]
        - slider "Brightness"
        - radiogroup "Adjustments"
    `);
  });
});
