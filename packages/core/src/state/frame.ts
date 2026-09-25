import { isRecord, num, paint } from './parseAnnotations';

/** Frame styles, drawn over the photo's edges (the output size never changes). */
export type FrameStyle =
  | 'border'
  | 'rounded'
  | 'bevel'
  | 'line'
  | 'double'
  | 'inset'
  | 'plus'
  | 'lumber'
  | 'corners'
  | 'polaroid';

/** Display order in the Frame tool. */
export const FRAME_STYLES = [
  'border',
  'rounded',
  'bevel',
  'line',
  'double',
  'inset',
  'plus',
  'lumber',
  'corners',
  'polaroid',
] as const satisfies readonly FrameStyle[];

export interface FrameState {
  style: FrameStyle;
  /** Thickness as a fraction of the output's short side (0.005…0.2). */
  size: number;
  color: string;
}

/**
 * What shows through transparent parts of the result (PNGs, round crops, rounded frames).
 * `image` refers to an entry in `EditState.assets`; `blur` is a blurred copy of the result.
 */
export type BackgroundState =
  { kind: 'color'; color: string } | { kind: 'image'; assetId: string } | { kind: 'blur' };

export const DEFAULT_FRAME_SIZE = 0.04;
export const DEFAULT_FRAME_COLOR = '#ffffff';
export const FRAME_SIZE_RANGE = [0.005, 0.2] as const;

export function parseFrame(input: unknown): FrameState | null {
  if (!isRecord(input)) return null;
  const style = FRAME_STYLES.find((s) => s === input['style']);
  if (!style) return null;
  return {
    style,
    size: num(input['size'], DEFAULT_FRAME_SIZE, FRAME_SIZE_RANGE[0], FRAME_SIZE_RANGE[1]),
    color: paint(input['color']) ?? DEFAULT_FRAME_COLOR,
  };
}

export function parseBackground(input: unknown): BackgroundState | null {
  if (!isRecord(input)) return null;
  switch (input['kind']) {
    case 'color': {
      const color = paint(input['color']);
      return color ? { kind: 'color', color } : null;
    }
    case 'image':
      return typeof input['assetId'] === 'string'
        ? { kind: 'image', assetId: input['assetId'].slice(0, 120) }
        : null;
    case 'blur':
      return { kind: 'blur' };
    default:
      return null;
  }
}
