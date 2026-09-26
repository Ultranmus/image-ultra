/*
 * EXIF for `keepMetadata` (DECISIONS #79). Canvas encoding drops all metadata, so by default an
 * export carries none. When an app asks to keep it, the source JPEG's EXIF is rebuilt — not
 * copied — so that nothing stale or private slips through:
 * - Orientation becomes 1 (the pixels are already turned) and the size fields match the export;
 * - the thumbnail (IFD1) is dropped: it shows the UNEDITED photo, redacted parts included;
 * - maker notes and the interoperability IFD are dropped (private formats with absolute offsets);
 * - GPS is dropped unless `location` is set.
 * No DOM here: plain bytes in, bytes out.
 */

/** Byte sizes of the TIFF field types (1…12); unknown types are dropped. */
const TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};

const TAG = {
  imageWidth: 0x0100,
  imageLength: 0x0101,
  stripOffsets: 0x0111,
  orientation: 0x0112,
  stripByteCounts: 0x0117,
  subIfds: 0x014a,
  jpegInterchange: 0x0201,
  jpegInterchangeLength: 0x0202,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  makerNote: 0x927c,
  pixelXDimension: 0xa002,
  pixelYDimension: 0xa003,
  interopIfd: 0xa005,
} as const;

/** Tags never copied from IFD0 (pointers and image-data tags are rebuilt or meaningless). */
const DROP_IFD0 = new Set<number>([
  TAG.imageWidth,
  TAG.imageLength,
  TAG.stripOffsets,
  TAG.stripByteCounts,
  TAG.subIfds,
  TAG.jpegInterchange,
  TAG.jpegInterchangeLength,
  TAG.orientation,
  TAG.exifIfd,
  TAG.gpsIfd,
]);
const DROP_EXIF = new Set<number>([
  TAG.makerNote,
  TAG.interopIfd,
  TAG.pixelXDimension,
  TAG.pixelYDimension,
]);

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** The value's bytes, in the file's byte order. */
  value: Uint8Array;
}

export interface CleanExifOptions {
  /** Size of the exported image. */
  width: number;
  height: number;
  /** Keep GPS location. Default `false`. */
  location?: boolean;
}

/**
 * The EXIF block (TIFF bytes, without the `Exif\0\0` header) of a JPEG, or `null` when it has
 * none. Only reads the header segments, never the image data.
 */
export function readJpegExif(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return null;
    const marker = bytes[pos + 1]!;
    // Fill bytes, and markers without a length.
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }
    // Start of scan / end of image: no more header segments.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
    const start = pos + 4;
    const end = pos + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker === 0xe1 && length >= 8 && ascii(bytes, start, 6) === 'Exif\0\0') {
      return bytes.slice(start + 6, end);
    }
    pos = end;
  }
  return null;
}

/**
 * Rebuilds an EXIF block for an edited export (see the top of this file). Returns `null` when
 * the input isn't valid TIFF or nothing worth keeping is left.
 */
export function cleanExif(tiff: Uint8Array, options: CleanExifOptions): Uint8Array | null {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (tiff.length < 8) return null;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  if (view.getUint16(2, le) !== 42) return null;

  const ifd0 = readIfd(view, view.getUint32(4, le), le);
  if (!ifd0) return null;
  const pointer = (tag: number) => {
    const entry = ifd0.find((e) => e.tag === tag);
    if (!entry || entry.type !== 4 || entry.count !== 1) return null;
    return new DataView(entry.value.buffer, entry.value.byteOffset, 4).getUint32(0, le);
  };
  const exifAt = pointer(TAG.exifIfd);
  const gpsAt = options.location ? pointer(TAG.gpsIfd) : null;
  const exif = (exifAt !== null && readIfd(view, exifAt, le)) || [];
  const gps = (gpsAt !== null && readIfd(view, gpsAt, le)) || [];

  const keptIfd0 = ifd0.filter((e) => !DROP_IFD0.has(e.tag));
  const keptExif = exif.filter((e) => !DROP_EXIF.has(e.tag));
  if (keptIfd0.length === 0 && keptExif.length === 0 && gps.length === 0) return null;

  keptIfd0.push(shortEntry(TAG.orientation, 1, le));
  keptExif.push(
    longEntry(TAG.pixelXDimension, options.width, le),
    longEntry(TAG.pixelYDimension, options.height, le),
  );
  // Pointers are placeholders here; `writeTiff` fills in the real offsets.
  keptIfd0.push(longEntry(TAG.exifIfd, 0, le));
  if (gps.length > 0) keptIfd0.push(longEntry(TAG.gpsIfd, 0, le));

  return writeTiff(le, keptIfd0, keptExif, gps);
}

/** Puts an EXIF block (TIFF bytes) into a JPEG right after its JFIF header (or SOI). */
export function insertJpegExif(
  jpeg: Uint8Array<ArrayBuffer>,
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const length = 2 + 6 + tiff.length;
  if (length > 0xffff || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  let at = 2;
  // JFIF readers expect APP0 first: keep it there.
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4]! << 8) | jpeg[5]!);
  const segment = new Uint8Array(2 + length);
  segment.set([0xff, 0xe1, length >> 8, length & 0xff], 0);
  segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  segment.set(tiff, 10);
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(segment, at);
  out.set(jpeg.subarray(at), at + segment.length);
  return out;
}

/* ── TIFF reading / writing ────────────────────────────────────────────── */

/**
 * Tag ids and raw values per IFD (for tests and debugging). `thumbnail` = whether IFD0 links to a
 * next IFD (the thumbnail).
 */
export function readExifTags(tiff: Uint8Array): {
  ifd0: Map<number, Uint8Array>;
  exif: Map<number, Uint8Array>;
  gps: Map<number, Uint8Array>;
  thumbnail: boolean;
  littleEndian: boolean;
} | null {
  if (tiff.length < 8) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = ascii(tiff, 0, 2) === 'II';
  const at0 = view.getUint32(4, le);
  const ifd0 = readIfd(view, at0, le);
  if (!ifd0) return null;
  const map = (list: Entry[] | null) => new Map((list ?? []).map((e) => [e.tag, e.value]));
  const pointer = (tag: number) => {
    const v = ifd0.find((e) => e.tag === tag)?.value;
    return v ? new DataView(v.buffer, v.byteOffset, 4).getUint32(0, le) : null;
  };
  const exifAt = pointer(TAG.exifIfd);
  const gpsAt = pointer(TAG.gpsIfd);
  return {
    ifd0: map(ifd0),
    exif: map(exifAt === null ? null : readIfd(view, exifAt, le)),
    gps: map(gpsAt === null ? null : readIfd(view, gpsAt, le)),
    thumbnail: view.getUint32(at0 + 2 + view.getUint16(at0, le) * 12, le) !== 0,
    littleEndian: le,
  };
}

function readIfd(view: DataView, offset: number, le: boolean): Entry[] | null {
  if (offset < 8 || offset + 2 > view.byteLength) return null;
  const count = view.getUint16(offset, le);
  if (offset + 2 + count * 12 > view.byteLength) return null;
  const entries: Entry[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    const tag = view.getUint16(at, le);
    const type = view.getUint16(at + 2, le);
    const n = view.getUint32(at + 4, le);
    const size = TYPE_SIZES[type];
    if (!size || seen.has(tag)) continue;
    const bytes = size * n;
    const start = bytes <= 4 ? at + 8 : view.getUint32(at + 8, le);
    if (bytes > 0xffff || start + bytes > view.byteLength) continue;
    seen.add(tag);
    entries.push({
      tag,
      type,
      count: n,
      value: new Uint8Array(
        view.buffer.slice(view.byteOffset + start, view.byteOffset + start + bytes),
      ),
    });
  }
  return entries;
}

function shortEntry(tag: number, value: number, le: boolean): Entry {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, le);
  return { tag, type: 3, count: 1, value: bytes };
}

function longEntry(tag: number, value: number, le: boolean): Entry {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, le);
  return { tag, type: 4, count: 1, value: bytes };
}

/** Lays out IFD0 → Exif IFD → GPS IFD, each followed by its out-of-line values. */
function writeTiff(le: boolean, ifd0: Entry[], exif: Entry[], gps: Entry[]): Uint8Array {
  const ifds = [ifd0, exif, gps].map((list) => [...list].sort((a, b) => a.tag - b.tag));
  const sizeOf = (list: Entry[]) =>
    2 + list.length * 12 + 4 + list.reduce((sum, e) => sum + extra(e), 0);
  const offsets: number[] = [];
  let pos = 8;
  for (const list of ifds) {
    offsets.push(pos);
    pos += list.length > 0 ? sizeOf(list) : 0;
  }
  const out = new Uint8Array(pos);
  const view = new DataView(out.buffer);
  out.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  view.setUint16(2, 42, le);
  view.setUint32(4, 8, le);

  const setPointer = (list: Entry[], tag: number, value: number) => {
    const entry = list.find((e) => e.tag === tag);
    if (entry) new DataView(entry.value.buffer).setUint32(0, value, le);
  };
  setPointer(ifds[0]!, TAG.exifIfd, offsets[1]!);
  setPointer(ifds[0]!, TAG.gpsIfd, offsets[2]!);

  ifds.forEach((list, i) => {
    if (list.length === 0) return;
    const start = offsets[i]!;
    let data = start + 2 + list.length * 12 + 4;
    view.setUint16(start, list.length, le);
    list.forEach((e, j) => {
      const at = start + 2 + j * 12;
      view.setUint16(at, e.tag, le);
      view.setUint16(at + 2, e.type, le);
      view.setUint32(at + 4, e.count, le);
      if (e.value.length <= 4) {
        out.set(e.value, at + 8);
      } else {
        view.setUint32(at + 8, data, le);
        out.set(e.value, data);
        data += extra(e);
      }
    });
    view.setUint32(start + 2 + list.length * 12, 0, le); // no next IFD (thumbnail dropped)
  });
  return out;
}

/** Out-of-line bytes an entry needs, padded to an even offset. */
function extra(e: Entry): number {
  return e.value.length <= 4 ? 0 : e.value.length + (e.value.length % 2);
}

function ascii(bytes: Uint8Array, from: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(from, from + length));
}
