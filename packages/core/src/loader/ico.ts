/**
 * ICO files hold one or more images, each a PNG or a BMP. Browsers decode them differently: Chrome
 * rejects a PNG entry bigger than the 256 px an ICO header can describe (a 512 px favicon made by
 * a design tool failed there, Safari opened it). So when the largest entry is a PNG, we decode that
 * PNG ourselves — same result in every browser. BMP entries are left to the browser.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface IcoEntry {
  width: number;
  height: number;
  bitsPerPixel: number;
  png: boolean;
  offset: number;
  size: number;
}

/** The largest image's PNG bytes, or `null` when it's a BMP (or the file isn't a valid ICO). */
export function largestIcoPng(bytes: Uint8Array): Uint8Array | null {
  const entries = readIcoEntries(bytes);
  if (entries.length === 0) return null;
  const best = entries.reduce((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) return areaB > areaA ? b : a;
    return b.bitsPerPixel > a.bitsPerPixel ? b : a;
  });
  return best.png ? bytes.subarray(best.offset, best.offset + best.size) : null;
}

function readIcoEntries(bytes: Uint8Array): IcoEntry[] {
  if (bytes.length < 6) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = view.getUint16(2, true);
  if (view.getUint16(0, true) !== 0 || (type !== 1 && type !== 2)) return [];
  const count = view.getUint16(4, true);
  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    if (at + 16 > bytes.length) break;
    const size = view.getUint32(at + 8, true);
    const offset = view.getUint32(at + 12, true);
    if (size === 0 || offset + size > bytes.length) continue;
    const png = PNG_SIGNATURE.every((b, k) => bytes[offset + k] === b);
    // A PNG's real size is in its IHDR chunk; the header's byte only goes up to 256 (0 = 256).
    const pngSize = png && size >= 24;
    entries.push({
      width: pngSize ? view.getUint32(offset + 16) : bytes[at]! || 256,
      height: pngSize ? view.getUint32(offset + 20) : bytes[at + 1]! || 256,
      bitsPerPixel: view.getUint16(at + 6, true),
      png,
      offset,
      size,
    });
  }
  return entries;
}
