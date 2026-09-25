/** Image formats recognised from a file's first bytes. */
export type ImageFormat =
  'jpeg' | 'png' | 'gif' | 'webp' | 'avif' | 'heic' | 'bmp' | 'ico' | 'tiff' | 'svg' | 'psd';

/** Reads a file's header to tell what kind of image it really is (ignores the extension). */
export async function detectImageFormat(blob: Blob): Promise<ImageFormat | null> {
  const bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
  return detectFormatFromBytes(bytes);
}

export function detectFormatFromBytes(bytes: Uint8Array): ImageFormat | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

  if (starts(0xff, 0xd8, 0xff)) return 'jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  if (ascii(0, 2) === 'BM') return 'bmp';
  if (starts(0, 0, 1, 0) || starts(0, 0, 2, 0)) return 'ico';
  if (starts(0x49, 0x49, 0x2a, 0) || starts(0x4d, 0x4d, 0, 0x2a)) return 'tiff';
  if (ascii(0, 4) === '8BPS') return 'psd';

  const text = new TextDecoder().decode(bytes).trimStart().toLowerCase();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'svg';
  return null;
}
