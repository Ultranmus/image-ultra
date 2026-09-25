import { describe, expect, it } from 'vitest';
import { detectFormatFromBytes } from './detectFormat';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );

describe('detectFormatFromBytes', () => {
  it.each([
    ['jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['png', bytes(0x89, 'PNG', 0x0d, 0x0a)],
    ['gif', bytes('GIF89a')],
    ['webp', bytes('RIFF', 0, 0, 0, 0, 'WEBP')],
    ['avif', bytes(0, 0, 0, 0x20, 'ftypavif')],
    ['heic', bytes(0, 0, 0, 0x18, 'ftypheic')],
    ['bmp', bytes('BM', 0, 0)],
    ['ico', bytes(0, 0, 1, 0, 1, 0)],
    ['tiff', bytes(0x49, 0x49, 0x2a, 0)],
    ['psd', bytes('8BPS')],
    ['svg', bytes('  <svg xmlns="http://www.w3.org/2000/svg">')],
    ['svg', bytes('<?xml version="1.0"?>\n<svg>')],
  ])('recognises %s', (format, header) => {
    expect(detectFormatFromBytes(header)).toBe(format);
  });

  it('returns null for non-images', () => {
    expect(detectFormatFromBytes(bytes('%PDF-1.7'))).toBeNull();
    expect(detectFormatFromBytes(bytes('hello world'))).toBeNull();
    expect(detectFormatFromBytes(new Uint8Array())).toBeNull();
  });
});
