/**
 * image-ultra's own sticker set: simple, bold shapes on a 64×64 grid with a white outline so they
 * read on any photo. Drawn for this project (no third-party artwork). Rasterised when placed.
 */
export interface BuiltinSticker {
  id: string;
  /** English name; the Sticker tool shows it as the tooltip / accessible name. */
  label: string;
  /** Inner SVG markup for `viewBox="0 0 64 64"`. */
  svg: string;
}

const OUTLINE = 'stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';

export const BUILTIN_STICKERS: readonly BuiltinSticker[] = [
  {
    id: 'star',
    label: 'Star',
    svg: `<path ${OUTLINE} fill="#ffc83d" d="M32 5l8.2 17.2 18.8 2.3-13.9 12.9 3.6 18.6L32 46.8 15.3 56l3.6-18.6L5 24.5l18.8-2.3z"/>`,
  },
  {
    id: 'heart',
    label: 'Heart',
    svg: `<path ${OUTLINE} fill="#ff3b5c" d="M32 56S6 40 6 22.5C6 14 12.5 8 20 8c5 0 9.3 2.8 12 7 2.7-4.2 7-7 12-7 7.5 0 14 6 14 14.5C58 40 32 56 32 56z"/>`,
  },
  {
    id: 'check',
    label: 'Check',
    svg: `<circle ${OUTLINE} fill="#22c55e" cx="32" cy="32" r="26"/><path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M20 33l8 8 16-17"/>`,
  },
  {
    id: 'cross',
    label: 'Cross',
    svg: `<circle ${OUTLINE} fill="#ef4444" cx="32" cy="32" r="26"/><path fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" d="M22 22l20 20M42 22L22 42"/>`,
  },
  {
    id: 'arrow',
    label: 'Arrow',
    svg: `<path ${OUTLINE} fill="#3b82f6" d="M6 25h28V12l24 20-24 20V39H6z"/>`,
  },
  {
    id: 'speech',
    label: 'Speech bubble',
    svg: `<path fill="#fff" stroke="#1f2937" stroke-width="3" stroke-linejoin="round" d="M10 10h44a4 4 0 014 4v26a4 4 0 01-4 4H28L16 55v-11h-6a4 4 0 01-4-4V14a4 4 0 014-4z"/>`,
  },
  {
    id: 'thought',
    label: 'Thought bubble',
    svg: `<g fill="#fff" stroke="#1f2937" stroke-width="3"><ellipse cx="34" cy="26" rx="24" ry="18"/><circle cx="16" cy="48" r="5"/><circle cx="8" cy="57" r="3"/></g>`,
  },
  {
    id: 'new',
    label: 'New badge',
    svg: `<path ${OUTLINE} fill="#8b5cf6" d="M32 4l6 7 9-2 2 9 8 4-4 8 4 8-8 4-2 9-9-2-6 7-6-7-9 2-2-9-8-4 4-8-4-8 8-4 2-9 9 2z"/><text x="32" y="37" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="14" fill="#fff">NEW</text>`,
  },
  {
    id: 'sale',
    label: 'Sale badge',
    svg: `<rect ${OUTLINE} fill="#ef4444" x="4" y="18" width="56" height="28" rx="6" transform="rotate(-12 32 32)"/><text x="32" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="16" fill="#fff" transform="rotate(-12 32 32)">SALE</text>`,
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    svg: `<path ${OUTLINE} fill="#facc15" d="M32 4c2 14 6 18 20 20-14 2-18 6-20 20-2-14-6-18-20-20 14-2 18-6 20-20z"/><path ${OUTLINE} fill="#facc15" d="M50 40c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z"/>`,
  },
  {
    id: 'crown',
    label: 'Crown',
    svg: `<path ${OUTLINE} fill="#f59e0b" d="M8 48L5 18l15 12L32 10l12 20 15-12-3 30z"/><rect ${OUTLINE} fill="#f59e0b" x="8" y="48" width="48" height="8" rx="2"/>`,
  },
  {
    id: 'sun',
    label: 'Sun',
    svg: `<g stroke="#f59e0b" stroke-width="5" stroke-linecap="round"><path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M52 12l-6 6M18 46l-6 6"/></g><circle ${OUTLINE} fill="#fbbf24" cx="32" cy="32" r="14"/>`,
  },
  {
    id: 'bolt',
    label: 'Lightning',
    svg: `<path ${OUTLINE} fill="#facc15" d="M36 4L10 36h18l-4 24 26-32H32z"/>`,
  },
  {
    id: 'smile',
    label: 'Smiley',
    svg: `<circle ${OUTLINE} fill="#fcd34d" cx="32" cy="32" r="27"/><circle fill="#1f2937" cx="23" cy="26" r="3.5"/><circle fill="#1f2937" cx="41" cy="26" r="3.5"/><path fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round" d="M20 38c6 8 18 8 24 0"/>`,
  },
  {
    id: 'pin',
    label: 'Location pin',
    svg: `<path ${OUTLINE} fill="#ef4444" d="M32 60S12 38 12 24a20 20 0 0140 0c0 14-20 36-20 36z"/><circle fill="#fff" cx="32" cy="24" r="7"/>`,
  },
  {
    id: 'music',
    label: 'Music note',
    svg: `<path ${OUTLINE} fill="#ec4899" d="M26 12l28-6v36a8 8 0 11-5-7.4V16l-18 4v28a8 8 0 11-5-7.4z"/>`,
  },
];

/** The sticker as a standalone SVG document (for thumbnails and rasterising). */
export function stickerSvg(sticker: BuiltinSticker): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${sticker.svg}</svg>`;
}

export function stickerDataUrl(sticker: BuiltinSticker): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stickerSvg(sticker))}`;
}
