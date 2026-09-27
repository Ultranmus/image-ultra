import { expect, test, type Page } from '@playwright/test';
import type { TextShape } from '@image-ultra/react';
import { dragOnStage, editState, openEditor, type TestHook } from './support/editor';

/** What has keyboard focus: `null` when it dropped out of the editor. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !el.closest('.iu-root')) return null;
    return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.className;
  });

/** Presses Tab until `name` has focus (at most 40 times). */
async function tabTo(page: Page, name: string | RegExp) {
  for (let i = 0; i < 40; i++) {
    const now = await focused(page);
    if (now !== null && (typeof name === 'string' ? now === name : name.test(now))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${String(name)}`);
}

test.describe('Keyboard & focus', () => {
  test('a button that disables itself hands focus on; Done keeps it while saving', async ({
    page,
  }) => {
    await openEditor(page);
    const ed = page.locator('.iu-root');
    await ed.getByRole('tab', { name: 'Finetune' }).click();
    await ed.getByRole('slider', { name: 'Brightness' }).focus();
    await page.keyboard.press('ArrowRight');

    await ed.getByRole('button', { name: 'Undo' }).focus();
    await page.keyboard.press('Enter'); // back to the first step: Undo disables
    await expect.poll(() => focused(page)).toBe('Redo');
    await page.keyboard.press('Enter'); // last step again: Redo disables
    await expect.poll(() => focused(page)).not.toBeNull();

    await ed.locator('.iu-topbar').getByRole('button', { name: 'Reset', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => focused(page)).not.toBeNull();

    await ed.getByRole('slider', { name: 'Brightness' }).focus();
    await page.keyboard.press('ArrowRight');
    await ed.getByRole('button', { name: 'Save look' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Mine');
    await page.keyboard.press('Enter');
    await expect.poll(() => focused(page)).toBe('Save look');

    await ed.getByRole('button', { name: 'Done' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => focused(page)).toBe('Done');
  });

  test('Layers: focus moves into the panel; Esc closes it and returns to the button', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await dragOnStage(page, [0.3, 0.3], [0.45, 0.45]);
    const layers = page.locator('.iu-root').getByRole('button', { name: 'Layers' });
    await layers.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.iu-layers__row[data-selected] .iu-layers__name')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.iu-layers')).toHaveCount(0);
    await expect(layers).toBeFocused();
  });

  test('the sticker tiles are one Tab stop; arrow keys move between them', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Sticker' }).click();
    const tiles = page.locator('.iu-stickerstrip__tile');
    await tiles.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tiles.nth(1)).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.iu-stickerstrip'))).toBe(
      null,
    );
    await page.keyboard.press('Shift+Tab');
    await expect(tiles.nth(1)).toBeFocused();
  });

  test('Tab / Shift+Tab on the photo step through the elements, then move on', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    for (const box of [
      [0.2, 0.3, 0.3, 0.4],
      [0.5, 0.3, 0.6, 0.4],
    ] as const) {
      await page.getByRole('radio', { name: /Rectangle/ }).click();
      await dragOnStage(page, [box[0], box[1]], [box[2], box[3]]);
    }
    const [a, b] = (await editState(page)).annotations.map((s) => s.id);
    const selected = () =>
      page.evaluate(
        () =>
          (
            (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState()
              .toolState['annotate'] as { selectedId: string | null }
          ).selectedId,
      );
    const layer = page.locator('.iu-annotate-layer');
    await page.keyboard.press('Escape');
    await layer.focus();

    await page.keyboard.press('Tab');
    expect(await selected()).toBe(a);
    await page.keyboard.press('Tab');
    expect(await selected()).toBe(b);
    await page.keyboard.press('Tab'); // past the last one: deselect and leave the photo
    expect(await selected()).toBe(null);
    await expect(layer).not.toBeFocused();
    await page.keyboard.press('Shift+Tab'); // back onto the photo, nothing selected
    await expect(layer).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await selected()).toBe(b);
    await page.keyboard.press('Delete');
    expect((await editState(page)).annotations.map((s) => s.id)).toEqual([a]);
    await expect(layer).toBeFocused();
  });

  test('no focus ring is clipped by a scrolling row', async ({ page }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await openEditor(page);
      for (const tool of [
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
      ]) {
        await page.locator('.iu-root').getByRole('tab', { name: tool }).click();
        await page.waitForTimeout(300); // the ControlBar slides in
        const clipped = await page.evaluate(() => {
          const RING = 4;
          const out: string[] = [];
          const selector =
            '.iu-controlbar button, .iu-controlbar input, .iu-controlbar [tabindex], .iu-topbar button, .iu-rail button';
          for (const el of document.querySelectorAll<HTMLElement>(selector)) {
            if ((el as HTMLButtonElement).disabled || el.getClientRects().length === 0) continue;
            if (el.closest('.iu-sr-only')) continue;
            const r = el.getBoundingClientRect();
            for (
              let p = el.parentElement;
              p && !p.classList.contains('iu-root');
              p = p.parentElement
            ) {
              const style = getComputedStyle(p);
              // A mask cuts off everything outside the box, like overflow does.
              const mask =
                style.getPropertyValue('mask-image') ||
                style.getPropertyValue('-webkit-mask-image');
              const masked = mask !== '' && mask !== 'none';
              const clipsX = masked || style.overflowX !== 'visible';
              const clipsY = masked || style.overflowY !== 'visible';
              if (!clipsX && !clipsY) continue;
              const c = p.getBoundingClientRect();
              if (r.right < c.left || r.left > c.right) break; // scrolled out of view sideways
              const sides: string[] = [];
              if (clipsY && r.top - RING < c.top - 0.5) sides.push('top');
              if (clipsY && r.bottom + RING > c.bottom + 0.5) sides.push('bottom');
              // Sideways only at an edge with nothing more past it (a faded edge is by design).
              const atStart = !p.hasAttribute('data-more-start') && p.scrollLeft <= 0;
              const atEnd =
                !p.hasAttribute('data-more-end') &&
                p.scrollLeft + p.clientWidth >= p.scrollWidth - 1;
              if (clipsX && atStart && r.left - RING < c.left - 0.5) sides.push('left');
              if (clipsX && atEnd && r.right + RING > c.right + 0.5) sides.push('right');
              // Partly scrolled out of a sideways row: that row's fade covers it; stop here.
              const scrolls = p.scrollWidth > p.clientWidth + 1;
              if (clipsX && scrolls && (r.left < c.left || r.right > c.right)) {
                if (sides.includes('top') || sides.includes('bottom'))
                  out.push(`${el.getAttribute('aria-label') ?? el.textContent} · ${p.className}`);
                break;
              }
              if (sides.length)
                out.push(
                  `${el.getAttribute('aria-label') ?? el.textContent} · ${sides.join('+')} · ${p.className}`,
                );
            }
          }
          return out;
        });
        expect(clipped, `${tool} at ${width}px`).toEqual([]);
      }
    }
  });

  test('keyboard only: crop, brighten, add text, save', async ({ page }) => {
    await openEditor(page);
    const ed = page.locator('.iu-root');
    await ed.getByRole('button', { name: 'Undo' }).focus();

    // Crop to a square: the rail, then the aspect chips.
    await tabTo(page, 'Adjust');
    await tabTo(page, 'Free'); // the chips are one Tab stop (a radio group): arrows pick
    for (let i = 0; i < 6 && (await focused(page)) !== '1:1'; i++)
      await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const crop = (await editState(page)).geometry.crop!;
    expect(Math.abs(crop.width - crop.height)).toBeLessThan(2);

    // Finetune › Brightness +3 (arrow keys on the rail switch tools).
    await ed.getByRole('tab', { name: 'Adjust' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(ed.getByRole('tab', { name: 'Finetune' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tabTo(page, 'Brightness');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect((await editState(page)).finetune.brightness).toBeGreaterThan(0);

    // Annotate › Text: Enter on the photo adds a box in the middle; type, Esc to finish.
    await ed.getByRole('tab', { name: 'Finetune' }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(ed.getByRole('tab', { name: 'Annotate' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tabTo(page, 'Photo and its elements');
    await expect(page.locator('.iu-annotate-layer')).toBeFocused();
    await page.keyboard.press('t');
    await page.keyboard.press('Enter');
    await expect(page.locator('.iu-textedit')).toBeFocused();
    await page.keyboard.type('Hello');
    await page.keyboard.press('Escape');
    const text = (await editState(page)).annotations.find((s) => s.type === 'text') as TextShape;
    expect(text.text).toBe('Hello');
    await expect.poll(() => focused(page)).not.toBeNull();

    // Save.
    await ed.getByRole('button', { name: 'Done' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('log')).toContainText('Saved');
  });
});
