import { expect, test, type Page } from '@playwright/test';
import { openEditor, type TestHook } from './support/editor';

/** Animations still running in the page (CSS animations, transitions, Web Animations). */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName ?? a.constructor.name),
  );

test.describe('Reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing animates: tools, popovers, zoom, the loading placeholder', async ({ page }) => {
    await openEditor(page);
    const ed = page.locator('.iu-root');

    // Animated zooms are instant.
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __iu: TestHook }).__iu.editor.current!.store.getState()
            .animationMs,
      ),
    ).toBe(0);

    await ed.getByRole('tab', { name: 'Finetune' }).click();
    expect(await running(page)).toEqual([]);
    await ed.getByRole('slider', { name: 'Brightness' }).focus();
    await page.keyboard.press('ArrowRight');
    await ed.getByRole('button', { name: 'History' }).click();
    expect(await running(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await ed.getByRole('button', { name: 'Zoom in' }).click();
    expect(await running(page)).toEqual([]);
    await ed.getByRole('tab', { name: 'Adjust' }).click();
    expect(await running(page)).toEqual([]);

    // The loading placeholder is still (it only shows while a photo loads).
    const shimmer = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'iu-skeleton';
      document.querySelector('.iu-root')!.append(el);
      const name = getComputedStyle(el).animationName;
      el.remove();
      return name;
    });
    expect(shimmer).toBe('none');
  });
});

test.describe('Windows high contrast', () => {
  test('focus and selected states use outlines (box-shadows are dropped)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openEditor(page);
    const ed = page.locator('.iu-root');
    await ed.getByRole('tab', { name: 'Finetune' }).click();
    const outline = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).outlineStyle);

    // Selected: the chosen chip and switch item.
    expect(await outline('.iu-chip[aria-checked="true"]')).toBe('solid');
    expect(await outline('.iu-segmented__item[aria-checked="true"]')).toBe('solid');

    // Keyboard focus on a few kinds of control.
    for (const name of ['Auto', 'Brightness']) {
      await ed
        .getByRole(name === 'Auto' ? 'button' : 'slider', { name })
        .first()
        .focus();
      await page.keyboard.press('Shift');
      expect(
        await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle),
        name,
      ).toBe('solid');
    }
  });
});

test.describe('Touch targets', () => {
  const height = (page: Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);

  test('switches and chips are 28px with a mouse', async ({ page }) => {
    await openEditor(page);
    await page.locator('.iu-root').getByRole('tab', { name: 'Finetune' }).click();
    expect(await height(page, '.iu-segmented__item')).toBe(28);
    expect(await height(page, '.iu-chip')).toBe(28);
  });

  test.describe('on a touch screen', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('switches and chips are 36px', async ({ page }) => {
      await openEditor(page);
      await page.locator('.iu-root').getByRole('tab', { name: 'Finetune' }).click();
      expect(await height(page, '.iu-segmented__item')).toBe(36);
      expect(await height(page, '.iu-chip')).toBe(36);
    });
  });
});
