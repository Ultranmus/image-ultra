import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import type { TestHook } from './support/editor';

interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A 16×16 red icon: an ICO header wrapping an uncompressed 32-bit bitmap. */
function icoFile(): TestFile {
  const size = 16;
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set([0, 0, 255, 255], i * 4); // BGRA
  const mask = Buffer.alloc(4 * size);
  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0);
  info.writeInt32LE(size, 4);
  info.writeInt32LE(size * 2, 8);
  info.writeUInt16LE(1, 12);
  info.writeUInt16LE(32, 14);
  const bitmap = Buffer.concat([info, pixels, mask]);
  const header = Buffer.from([0, 0, 1, 0, 1, 0]);
  const entry = Buffer.alloc(16);
  entry[0] = size;
  entry[1] = size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(bitmap.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return {
    name: 'favicon.ico',
    mimeType: 'image/x-icon',
    buffer: Buffer.concat([header, entry, bitmap]),
  };
}

/** A solid blue `size`² PNG. */
function png(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) row.set([0, 0, 255, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The owner's favicon (2026-09-28): one 512 px PNG inside an ICO, whose header can only say 256
 * (0). Chrome's own ICO decoder rejects it; Safari opens it.
 */
function bigPngIco(): TestFile {
  const image = png(512);
  const entry = Buffer.alloc(16);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(22, 12);
  return {
    name: 'GLASSBOX G BLACK.ico',
    mimeType: 'image/vnd.microsoft.icon',
    buffer: Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), entry, image]),
  };
}

const svg = (body: string): TestFile => ({
  name: 'drawing.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${body}</svg>`),
});

async function openFile(page: Page, file: TestFile) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Image' }).selectOption('empty');
  await page.locator('.iu-stage input[type=file]').setInputFiles(file);
  return errors;
}

const imageSize = (page: Page) =>
  page.evaluate(() => {
    const image = (window as unknown as { __iu: TestHook }).__iu.editor.current?.store.getState()
      .image;
    return image ? `${image.width}x${image.height}` : null;
  });

test.describe('Opening files', () => {
  test('an .ico opens like any other image', async ({ page }) => {
    const errors = await openFile(page, icoFile());
    await expect.poll(() => imageSize(page)).toBe('16x16');
    expect(errors).toEqual([]);
  });

  test('an .ico holding a PNG bigger than 256 px opens at its real size', async ({ page }) => {
    const errors = await openFile(page, bigPngIco());
    await expect.poll(() => imageSize(page)).toBe('512x512');
    expect(errors).toEqual([]);
  });

  test('SVGs open, including ones with only a viewBox', async ({ page }) => {
    await openFile(page, svg('width="200" height="100"><rect width="200" height="100"/>'));
    await expect.poll(() => imageSize(page)).toBe('200x100');

    await openFile(page, svg('viewBox="0 0 20 10"><rect width="20" height="10"/>'));
    await expect.poll(() => imageSize(page)).toBe('1024x512');
  });

  const failures: [string, TestFile, string][] = [
    [
      'a damaged JPEG',
      {
        name: 'broken.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
      },
      'This image file is damaged and can’t be opened.',
    ],
    [
      'a format the browser can’t decode',
      {
        name: 'photo.heic',
        mimeType: 'image/heic',
        buffer: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic0000junk')]),
      },
      'This file type (HEIC) isn’t supported.',
    ],
    [
      'a file that isn’t an image',
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
      'This file isn’t an image.',
    ],
  ];

  for (const [what, file, message] of failures) {
    test(`${what} shows the editor's own message, with no uncaught error`, async ({ page }) => {
      const errors = await openFile(page, file);
      await expect(page.locator('.iu-empty__title')).toHaveText(message);
      await expect(page.getByText('Browse files')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('a missing URL says the download failed', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Image' }).selectOption('broken URL');
    await expect(page.locator('.iu-empty__title')).toHaveText('Couldn’t download the image.');
  });
});
