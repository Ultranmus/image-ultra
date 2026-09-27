import { expect, test, type Page } from '@playwright/test';

/**
 * One smoke test for every example app (Phase 8b): the editor opens the sample, an edit is saved as
 * a download, and the saved edits come back after a reload. Each example's playwright.config.ts
 * points here with its own server and port.
 */

async function editorReady(page: Page) {
  await expect(page.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout: 30_000 });
}

async function saveAndCheck(page: Page, expected: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Done' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toContainText(expected);
}

test('opens the sample, saves an edit, reopens the saved edits after a reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await editorReady(page);

  // The sample is 2400×1600; a quarter turn saves it as 1600×2400.
  await page.getByRole('button', { name: 'Rotate left' }).click();
  await saveAndCheck(page, '1600×2400');

  // A fresh page: the editor starts unedited, and the saved JSON brings the turn back.
  await page.reload();
  await editorReady(page);
  await page.getByRole('button', { name: 'Reopen last edits' }).click();
  await editorReady(page);
  await saveAndCheck(page, '1600×2400');

  expect(errors).toEqual([]);
});
