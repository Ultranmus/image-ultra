import { describe, expect, it } from 'vitest';
import { cleanExif, insertJpegExif, readExifTags, readJpegExif } from './exif';

/* A hand-built EXIF block like a phone camera's: IFD0 → Exif IFD, GPS IFD, and a thumbnail IFD1. */

type Field = [tag: number, type: number, count: number, value: number[]];

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0)).concat(0);

function buildTiff(le: boolean): Uint8Array {
  const out = new Uint8Array(1024);
  const view = new DataView(out.buffer);
  out.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  view.setUint16(2, 42, le);
  view.setUint32(4, 8, le);
  let data = 600; // out-of-line values go here

  const write = (at: number, fields: Field[], next: number) => {
    view.setUint16(at, fields.length, le);
    fields.forEach(([tag, type, count, value], i) => {
      const e = at + 2 + i * 12;
      view.setUint16(e, tag, le);
      view.setUint16(e + 2, type, le);
      view.setUint32(e + 4, count, le);
      const size = type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 1;
      const bytes = size * count;
      const target = bytes <= 4 ? e + 8 : data;
      if (bytes > 4) {
        view.setUint32(e + 8, data, le);
        data += bytes + (bytes % 2);
      }
      value.forEach((v, j) => {
        if (size === 1) view.setUint8(target + j, v);
        else if (size === 2) view.setUint16(target + j * 2, v, le);
        else view.setUint32(target + j * 4, v, le);
      });
    });
    view.setUint32(at + 2 + fields.length * 12, next, le);
  };

  write(
    8,
    [
      [0x010f, 2, 6, ascii('Canon')], // Make
      [0x0112, 3, 1, [6]], // Orientation: rotated
      [0x8769, 4, 1, [200]], // Exif IFD
      [0x8825, 4, 1, [300]], // GPS IFD
    ],
    400, // IFD1 = thumbnail
  );
  write(
    200,
    [
      [0x9003, 2, 20, ascii('2026:09:26 10:00:00')], // DateTimeOriginal
      [0x927c, 7, 10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]], // MakerNote
      [0xa002, 4, 1, [4000]],
      [0xa003, 4, 1, [3000]],
    ],
    0,
  );
  write(300, [[0x0001, 2, 2, ascii('N')]], 0); // GPSLatitudeRef
  write(
    400,
    [
      [0x0201, 4, 1, [900]],
      [0x0202, 4, 1, [100]],
    ],
    0,
  );
  return out;
}

const u32 = (bytes: Uint8Array | undefined, le: boolean) =>
  bytes ? new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, le) : null;
const u16 = (bytes: Uint8Array | undefined, le: boolean) =>
  bytes ? new DataView(bytes.buffer, bytes.byteOffset).getUint16(0, le) : null;
const text = (bytes: Uint8Array | undefined) =>
  bytes ? String.fromCharCode(...bytes).replace(/\0+$/, '') : null;

describe.each([true, false])('cleanExif (little-endian: %s)', (le) => {
  const clean = cleanExif(buildTiff(le), { width: 800, height: 600 })!;
  const tags = readExifTags(clean)!;

  it('keeps camera fields and the byte order', () => {
    expect(tags.littleEndian).toBe(le);
    expect(text(tags.ifd0.get(0x010f))).toBe('Canon');
    expect(text(tags.exif.get(0x9003))).toBe('2026:09:26 10:00:00');
  });

  it('resets orientation and writes the exported size', () => {
    expect(u16(tags.ifd0.get(0x0112), le)).toBe(1);
    expect(u32(tags.exif.get(0xa002), le)).toBe(800);
    expect(u32(tags.exif.get(0xa003), le)).toBe(600);
  });

  it('drops the thumbnail, maker notes and GPS', () => {
    expect(tags.thumbnail).toBe(false);
    expect(tags.exif.has(0x927c)).toBe(false);
    expect(tags.ifd0.has(0x8825)).toBe(false);
    expect(tags.gps.size).toBe(0);
  });

  it('keeps GPS only when asked', () => {
    const withGps = readExifTags(
      cleanExif(buildTiff(le), { width: 800, height: 600, location: true })!,
    )!;
    expect(text(withGps.gps.get(0x0001))).toBe('N');
  });
});

describe('JPEG segments', () => {
  const jfif = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9,
  ]);

  it('reads nothing from a JPEG without EXIF, and rejects non-JPEG bytes', () => {
    expect(readJpegExif(jfif)).toBeNull();
    expect(readJpegExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it('inserts EXIF after the JFIF header, and reads it back', () => {
    const tiff = cleanExif(buildTiff(true), { width: 10, height: 10 })!;
    const jpeg = insertJpegExif(jfif, tiff);
    expect([...jpeg.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect([...jpeg.subarray(8, 10)]).toEqual([0xff, 0xe1]);
    expect(readJpegExif(jpeg)).toEqual(tiff);
    expect(jpeg.length).toBe(jfif.length + 10 + tiff.length);
  });

  it('ignores garbage instead of throwing', () => {
    expect(cleanExif(new Uint8Array([1, 2, 3]), { width: 1, height: 1 })).toBeNull();
    expect(cleanExif(new Uint8Array(64), { width: 1, height: 1 })).toBeNull();
  });
});
