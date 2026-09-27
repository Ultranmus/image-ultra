import { isRecord, num, paint } from './parseAnnotations';

/**
 * Nine spots on the photo, `custom` = wherever the user dragged it (`x`, `y`), or `tile` = a
 * repeating, tilted pattern across all of it.
 */
export type WatermarkPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
  | 'custom'
  | 'tile';

/** Where a watermark can go: 9 anchors, `custom` and `tile`. */
export const WATERMARK_POSITIONS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
  'custom',
  'tile',
] as const satisfies readonly WatermarkPosition[];

/** A text or logo watermark: position, size, opacity, colour. */
export interface WatermarkState {
  kind: 'text' | 'image';
  /** For `text`. */
  text: string;
  fontFamily: string;
  fontWeight: 400 | 700;
  color: string;
  /** For `image`: an entry in `EditState.assets`. */
  assetId: string | null;
  position: WatermarkPosition;
  /** Centre of the mark for `custom`, as fractions of the output's width / height. */
  x: number;
  y: number;
  /** Degrees clockwise around the mark's centre (not for `tile`, which has its own tilt). */
  rotation: number;
  /**
   * 0.01…1: share of the largest size that fits — 1 = the mark fills the photo's width (or height)
   * inside the margin. For `tile`, 1 = marks half that big.
   */
  size: number;
  opacity: number;
  /** Distance from the edges as a fraction of the output's short side (0…0.25). */
  margin: number;
}

/** The watermark a new one starts from. */
export const DEFAULT_WATERMARK: WatermarkState = {
  kind: 'text',
  text: '© Watermark',
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontWeight: 700,
  color: '#ffffff',
  assetId: null,
  position: 'bottom-right',
  x: 0.5,
  y: 0.5,
  rotation: 0,
  size: 0.25,
  opacity: 0.7,
  margin: 0.03,
};

/** Validates untrusted JSON (or a partial app-provided watermark) into a full watermark. */
export function parseWatermark(input: unknown): WatermarkState | null {
  if (!isRecord(input)) return null;
  const kind = input['kind'] === 'image' ? 'image' : 'text';
  const assetId = typeof input['assetId'] === 'string' ? input['assetId'].slice(0, 120) : null;
  if (kind === 'image' && !assetId) return null;
  return {
    kind,
    text: typeof input['text'] === 'string' ? input['text'].slice(0, 200) : DEFAULT_WATERMARK.text,
    fontFamily:
      typeof input['fontFamily'] === 'string' && /^[\w\s,'"-]{1,200}$/.test(input['fontFamily'])
        ? input['fontFamily']
        : DEFAULT_WATERMARK.fontFamily,
    fontWeight: input['fontWeight'] === 400 ? 400 : 700,
    color: paint(input['color']) ?? DEFAULT_WATERMARK.color,
    assetId,
    position:
      WATERMARK_POSITIONS.find((p) => p === input['position']) ?? DEFAULT_WATERMARK.position,
    x: num(input['x'], DEFAULT_WATERMARK.x, 0, 1),
    y: num(input['y'], DEFAULT_WATERMARK.y, 0, 1),
    rotation: num(input['rotation'], 0, -360, 360),
    size: num(input['size'], DEFAULT_WATERMARK.size, 0.01, 1),
    opacity: num(input['opacity'], DEFAULT_WATERMARK.opacity, 0, 1),
    margin: num(input['margin'], DEFAULT_WATERMARK.margin, 0, 0.25),
  };
}
