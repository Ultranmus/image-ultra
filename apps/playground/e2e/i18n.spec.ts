import { expect, test, type Page } from '@playwright/test';
import { dragOnStage, stagePoint, type TestHook } from './support/editor';

/**
 * Text the app gives the editor (not ours to translate): the playground's own sticker, and emoji
 * names (English data file — BACKLOG "Emoji names and search are English").
 */
const APP_CONTENT = ['Playground logo'];

/** Visible text and accessible names inside the editor that didn't come from the labels. */
function untranslated(page: Page, state: string): Promise<string[]> {
  return page.evaluate(
    ({ state, appContent }) => {
      const out = new Set<string>();
      const root = document.querySelector('.iu-root')!;
      const check = (text: string | null, where: string) => {
        if (!text) return;
        const outside = text.replace(/⟦[^⟧]*⟧/g, '');
        if (/[A-Za-z]{2,}/.test(outside) && !appContent.includes(text.trim()))
          out.add(`${state} · ${where}: ${text.trim().slice(0, 60)}`);
      };
      const skip = (el: Element) =>
        el.closest('.iu-sr-only.iu-announcer, .iu-textedit, .iu-stickerstrip__emoji') !== null ||
        (el.closest('.iu-stickerstrip') !== null && !el.closest('[data-builtin]'));

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        if (skip(el) || el.closest('[aria-hidden="true"]')) continue;
        if (el.getClientRects().length === 0 && !el.closest('.iu-sr-only')) continue;
        check(n.textContent, el.tagName.toLowerCase());
      }
      for (const el of root.querySelectorAll('*')) {
        if (skip(el)) continue;
        for (const attr of [
          'aria-label',
          'aria-valuetext',
          'placeholder',
          'title',
          'data-tooltip',
          'alt',
        ])
          check(el.getAttribute(attr), attr);
      }
      return [...out];
    },
    { state, appContent: APP_CONTENT },
  );
}

async function tool(page: Page, name: RegExp) {
  await page.locator('.iu-rail').getByRole('tab', { name }).click();
}

test('every piece of UI text comes from the labels (pseudo-locale)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?locale=pseudo');
  await page.waitForFunction(() => {
    const hook = (window as unknown as { __iu?: TestHook }).__iu;
    return hook?.editor.current?.store.getState().status === 'ready';
  });
  await expect(page.locator('.iu-rail').getByRole('tab', { name: '⟦Adjust⟧' })).toBeVisible();

  const found: string[] = [];
  const check = async (state: string) => {
    await page.waitForTimeout(200);
    found.push(...(await untranslated(page, state)));
  };
  const radio = (name: string) =>
    page.locator('.iu-root').getByRole('radio', { name: `⟦${name}⟧`, exact: true });

  await check('Adjust');
  // Steps whose names show in History later.
  await page
    .locator('.iu-root')
    .getByRole('button', { name: /Rotate left/ })
    .click();
  await page.locator('.iu-root').getByRole('radio', { name: '1:1', exact: true }).click();
  await tool(page, /Finetune/);
  await page.locator('.iu-root').getByRole('slider').first().focus();
  await page.keyboard.press('ArrowRight');
  await check('Finetune');
  await page.locator('.iu-root').getByRole('button', { name: /Auto/ }).first().click();
  await radio('Curves').click();
  await check('Curves');
  await radio('Levels').click();
  await check('Levels');
  await tool(page, /Filter/);
  await page.locator('.iu-presets [role="radio"]').nth(2).click();
  await check('Filter');
  await tool(page, /Frame/);
  await check('Frame');
  await tool(page, /Fill/);
  await check('Fill');
  await tool(page, /Resize/);
  await radio('Instagram 4:5').click();
  await check('Resize · Size');
  await radio('Canvas').click();
  await check('Resize · Canvas');
  await tool(page, /Watermark/);
  await radio('Text').click();
  await check('Watermark');
  await page.locator('.iu-root').getByRole('button', { name: /Font/ }).click();
  await check('Font menu');
  await page.keyboard.press('Escape');
  await radio('None').click();
  await tool(page, /Sticker/);
  await check('Sticker');
  await tool(page, /Redact/);
  await page.evaluate(() => scrollTo(0, 0));
  await dragOnStage(page, [0.3, 0.45], [0.45, 0.55]);
  await check('Redact');
  await tool(page, /Annotate/);
  await page
    .locator('.iu-root')
    .getByRole('radio', { name: /Rectangle/ })
    .click();
  await page.evaluate(() => scrollTo(0, 0));
  await dragOnStage(page, [0.55, 0.45], [0.7, 0.55]);
  await check('Annotate');
  const p = await stagePoint(page, 0.62, 0.5);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await check('Shape menu');
  await page.keyboard.press('Escape');
  await page
    .locator('.iu-topbar')
    .getByRole('button', { name: /Layers/ })
    .click();
  await check('Layers');
  await page
    .locator('.iu-topbar')
    .getByRole('button', { name: /History/ })
    .click();
  await check('History');
  await page.keyboard.press('Escape');
  await page
    .locator('.iu-topbar')
    .getByRole('button', { name: /Keyboard shortcuts/ })
    .click();
  await check('Shortcuts');
  await page.keyboard.press('Escape');

  expect(found).toEqual([]);
});

test('the playground Language switch changes the labels', async ({ page }) => {
  await page.goto('/');
  const rail = page.locator('.iu-rail');
  await expect(rail.getByRole('tab', { name: 'Adjust' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Language' })
    .getByRole('radio', { name: 'pseudo' })
    .click();
  await expect(rail.getByRole('tab', { name: '⟦Adjust⟧' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Language' })
    .getByRole('radio', { name: 'english' })
    .click();
  await expect(rail.getByRole('tab', { name: 'Adjust' })).toBeVisible();
});
