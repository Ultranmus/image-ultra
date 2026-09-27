import { describe, expect, it } from 'vitest';
import { largestIcoPng } from './ico';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A fake PNG entry: signature + IHDR with the given size (enough for the reader). */
function png(width: number, height: number): number[] {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return [...PNG, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(width), ...be(height), 8, 6, 0, 0, 0];
}

/** An ICO with entries: `header` = the size written in the directory (0 = 256). */
function ico(entries: { header: number; data: number[]; bpp?: number }[]): Uint8Array {
  const out: number[] = [0, 0, 1, 0, entries.length, 0];
  let offset = 6 + entries.length * 16;
  const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const e of entries) {
    out.push(
      e.header,
      e.header,
      0,
      0,
      1,
      0,
      e.bpp ?? 32,
      0,
      ...le32(e.data.length),
      ...le32(offset),
    );
    offset += e.data.length;
  }
  for (const e of entries) out.push(...e.data);
  return new Uint8Array(out);
}

describe('largestIcoPng', () => {
  it("finds a 512 px PNG whose header can only say 256 (the owner's favicon)", () => {
    const data = png(512, 512);
    const result = largestIcoPng(ico([{ header: 0, data }]));
    expect(result && Array.from(result)).toEqual(data);
  });

  it("picks the largest entry by the PNG's real size", () => {
    const small = png(32, 32);
    const big = png(300, 300);
    const result = largestIcoPng(
      ico([
        { header: 32, data: small },
        { header: 0, data: big },
      ]),
    );
    expect(result && Array.from(result)).toEqual(big);
  });

  it('leaves BMP entries to the browser', () => {
    const bmp = new Array(40).fill(1);
    expect(
      largestIcoPng(
        ico([
          { header: 0, data: bmp },
          { header: 16, data: png(16, 16) },
        ]),
      ),
    ).toBe(null);
  });

  it('ignores files that are not ICOs or point outside the file', () => {
    expect(largestIcoPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(null);
    const broken = ico([{ header: 0, data: png(64, 64) }]);
    expect(largestIcoPng(broken.subarray(0, 30))).toBe(null);
  });
});
