/**
 * EditState — the single, serializable description of every edit.
 * The source image is never modified; rendering = source image + EditState.
 * Save it with `JSON.stringify`, restore it with `parseEditState`.
 */

export const EDIT_STATE_VERSION = 1;

/** Clockwise quarter turns, in degrees. */
export type QuarterTurn = 0 | 90 | 180 | 270;

/** Axis-aligned rectangle in pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryState {
  /** Clockwise rotation in 90° steps, applied first. */
  rotation: QuarterTurn;
  /** Mirror horizontally / vertically, as seen after `rotation`. */
  flipX: boolean;
  flipY: boolean;
  /** Fine rotation in degrees (−45…45, clockwise), around the image centre. */
  straighten: number;
  /**
   * Perspective correction: `x` tilts around the vertical axis (left/right edges),
   * `y` around the horizontal axis (top/bottom edges). −1…1, 0 = none.
   */
  perspective: { x: number; y: number };
  /**
   * Crop in "oriented" space: the image after rotation, flip, straighten and perspective, with the
   * origin at the top-left of the rotated-but-not-straightened frame. `null` keeps the whole image.
   */
  crop: Rect | null;
  /** Locked crop aspect ratio (width ÷ height), or `null` for free-form. */
  cropAspect: number | null;
  /** `ellipse` makes the result round (transparent corners, or `background` for JPEG). */
  cropShape: CropShape;
}

export type CropShape = 'rect' | 'ellipse';

/** Final pixel size. Aspect may differ from the crop, which stretches the result. */
export interface ResizeState {
  width: number;
  height: number;
}

/** Colour adjustments. Every value is −1…1 and 0 means "unchanged". */
export interface FinetuneState {
  brightness: number;
  contrast: number;
  saturation: number;
  /** ±2 photographic stops at the extremes. */
  exposure: number;
  /** Negative = cooler (blue), positive = warmer (amber). */
  temperature: number;
  /** Negative = green, positive = magenta. */
  tint: number;
  /** Positive brightens mid-tones, negative darkens them. */
  gamma: number;
  /** Positive darkens the edges, negative lightens them. */
  vignette: number;
}

export const FINETUNE_KEYS = [
  'brightness',
  'contrast',
  'saturation',
  'exposure',
  'temperature',
  'tint',
  'gamma',
  'vignette',
] as const satisfies readonly (keyof FinetuneState)[];

/**
 * A raster produced during editing (e.g. by an AI plugin): a background mask, an erased patch,
 * an upscaled base image. Referenced from other parts of the state by its id in `assets`.
 */
export interface RasterAsset {
  kind: 'raster';
  /** `data:` URL, `blob:` URL or remote URL. */
  src: string;
  width: number;
  height: number;
  mimeType: string;
  /** Who made it, e.g. `plugin-ai/remove-background@1`. */
  createdBy?: string;
  /** Hash of the inputs, so a result can be reused or re-generated. */
  inputHash?: string;
}

export type EditAsset = RasterAsset;

export interface EditState {
  version: typeof EDIT_STATE_VERSION;
  geometry: GeometryState;
  finetune: FinetuneState;
  /** Output size in pixels, or `null` to keep the crop's size. */
  resize: ResizeState | null;
  assets: Record<string, EditAsset>;
}

export function createGeometryState(): GeometryState {
  return {
    rotation: 0,
    flipX: false,
    flipY: false,
    straighten: 0,
    perspective: { x: 0, y: 0 },
    crop: null,
    cropAspect: null,
    cropShape: 'rect',
  };
}

export function createFinetuneState(): FinetuneState {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    temperature: 0,
    tint: 0,
    gamma: 0,
    vignette: 0,
  };
}

/** A fresh state with no edits. */
export function createEditState(): EditState {
  return {
    version: EDIT_STATE_VERSION,
    geometry: createGeometryState(),
    finetune: createFinetuneState(),
    resize: null,
    assets: {},
  };
}

/** Largest output side we accept (also the practical GPU limit on most devices). */
export const MAX_OUTPUT_SIDE = 16384;

export function isNeutralFinetune(finetune: FinetuneState): boolean {
  return FINETUNE_KEYS.every((key) => finetune[key] === 0);
}

export class EditStateError extends Error {
  override readonly name = 'EditStateError';
}

/**
 * Turns untrusted input (e.g. JSON from your database) into a valid `EditState`.
 * Missing fields get defaults and numbers are clamped to their ranges.
 * Throws `EditStateError` if the input isn't an edit state at all or comes from a newer version.
 */
export function parseEditState(input: unknown): EditState {
  const value = typeof input === 'string' ? safeJson(input) : input;
  if (!isRecord(value)) throw new EditStateError('Edit state must be an object.');
  const version = value['version'] ?? EDIT_STATE_VERSION;
  if (version !== EDIT_STATE_VERSION) {
    throw new EditStateError(
      `Unsupported edit state version ${String(version)} (this build reads version ${EDIT_STATE_VERSION}).`,
    );
  }

  const state = createEditState();
  const geometry = isRecord(value['geometry']) ? value['geometry'] : {};
  const rotation = normalizeRotation(geometry['rotation']);
  const perspective = isRecord(geometry['perspective']) ? geometry['perspective'] : {};
  const aspect = finite(geometry['cropAspect']);
  state.geometry = {
    rotation,
    flipX: geometry['flipX'] === true,
    flipY: geometry['flipY'] === true,
    straighten: clampNumber(geometry['straighten'], -45, 45),
    perspective: {
      x: clampNumber(perspective['x'], -1, 1),
      y: clampNumber(perspective['y'], -1, 1),
    },
    crop: parseRect(geometry['crop']),
    cropAspect: aspect !== null && aspect > 0 ? aspect : null,
    cropShape: geometry['cropShape'] === 'ellipse' ? 'ellipse' : 'rect',
  };

  const finetune = isRecord(value['finetune']) ? value['finetune'] : {};
  for (const key of FINETUNE_KEYS) state.finetune[key] = clampNumber(finetune[key], -1, 1);

  if (isRecord(value['resize'])) {
    const width = finite(value['resize']['width']);
    const height = finite(value['resize']['height']);
    if (width && height && width >= 1 && height >= 1) {
      state.resize = {
        width: Math.min(MAX_OUTPUT_SIDE, Math.round(width)),
        height: Math.min(MAX_OUTPUT_SIDE, Math.round(height)),
      };
    }
  }

  const assets = isRecord(value['assets']) ? value['assets'] : {};
  for (const [id, asset] of Object.entries(assets)) {
    const parsed = parseAsset(asset);
    if (parsed) state.assets[id] = parsed;
  }
  return state;
}

function parseRect(input: unknown): Rect | null {
  if (!isRecord(input)) return null;
  const x = finite(input['x']);
  const y = finite(input['y']);
  const width = finite(input['width']);
  const height = finite(input['height']);
  if (x === null || y === null || width === null || height === null) return null;
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

function parseAsset(input: unknown): EditAsset | null {
  if (!isRecord(input) || input['kind'] !== 'raster') return null;
  const { src, mimeType, createdBy, inputHash } = input;
  const width = finite(input['width']);
  const height = finite(input['height']);
  if (typeof src !== 'string' || typeof mimeType !== 'string' || !width || !height) return null;
  const asset: RasterAsset = { kind: 'raster', src, width, height, mimeType };
  if (typeof createdBy === 'string') asset.createdBy = createdBy;
  if (typeof inputHash === 'string') asset.inputHash = inputHash;
  return asset;
}

function normalizeRotation(input: unknown): QuarterTurn {
  const n = finite(input) ?? 0;
  const turns = (((Math.round(n / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  return ([0, 90, 180, 270] as const)[turns];
}

function clampNumber(input: unknown, min: number, max: number): number {
  const n = finite(input);
  return n === null ? 0 : Math.min(max, Math.max(min, n));
}

function finite(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EditStateError('Edit state string is not valid JSON.');
  }
}
