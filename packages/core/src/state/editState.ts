import { parseAnnotations } from './parseAnnotations';
import type { Shape } from './annotations';
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

/**
 * Colour and detail adjustments. 0 always means "unchanged". Most values are −1…1;
 * `sharpen`, `blur` and `grain` are 0…1 (see `FINETUNE_RANGES`).
 */
export interface FinetuneState {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Boosts muted colours more than already-saturated ones. */
  vibrance: number;
  /** ±2 photographic stops at the extremes. */
  exposure: number;
  /** Brightens (positive) or recovers (negative) the brightest tones. */
  highlights: number;
  /** Lifts (positive) or deepens (negative) the darkest tones. */
  shadows: number;
  /** Negative = cooler (blue), positive = warmer (amber). */
  temperature: number;
  /** Negative = green, positive = magenta. */
  tint: number;
  /** Rotates all hues, ±180° at the extremes. */
  hue: number;
  /** Positive brightens mid-tones, negative darkens them. */
  gamma: number;
  /** Local contrast (mid-tone detail). Negative softens. */
  clarity: number;
  sharpen: number;
  blur: number;
  /** Film grain amount. */
  grain: number;
  /** Positive darkens the edges, negative lightens them. */
  vignette: number;
}

/** Display order of the adjustments. */
export const FINETUNE_KEYS = [
  'brightness',
  'contrast',
  'saturation',
  'vibrance',
  'exposure',
  'highlights',
  'shadows',
  'temperature',
  'tint',
  'hue',
  'gamma',
  'clarity',
  'sharpen',
  'blur',
  'grain',
  'vignette',
] as const satisfies readonly (keyof FinetuneState)[];

/** Allowed range of each adjustment. */
export const FINETUNE_RANGES: Record<keyof FinetuneState, readonly [min: number, max: number]> = {
  brightness: [-1, 1],
  contrast: [-1, 1],
  saturation: [-1, 1],
  vibrance: [-1, 1],
  exposure: [-1, 1],
  highlights: [-1, 1],
  shadows: [-1, 1],
  temperature: [-1, 1],
  tint: [-1, 1],
  hue: [-1, 1],
  gamma: [-1, 1],
  clarity: [-1, 1],
  sharpen: [0, 1],
  blur: [0, 1],
  grain: [0, 1],
  vignette: [-1, 1],
};

/** Input levels: `black`/`white` points (0…1) and a mid-tone shift (−1…1, positive = brighter). */
export interface LevelsState {
  black: number;
  white: number;
  mid: number;
}

/** A tone-curve control point `[input, output]`, both 0…1. */
export type CurvePoint = [x: number, y: number];

/** Tone curves. Each list is sorted by x and always includes x = 0 and x = 1. */
export interface CurvesState {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export type CurveChannel = keyof CurvesState;

/**
 * A filter look. The full definition is stored (not just an id) so a saved EditState renders the
 * same anywhere, even without the preset list that created it.
 */
export interface FilterState {
  /** Preset id, e.g. `chrome` — used to highlight the chip. */
  id: string;
  /** Display name at the time it was applied. */
  name: string;
  /** 0…1 blend between the original and the filtered colours. */
  intensity: number;
  /**
   * Row-major 3×4 colour matrix on 0…1 RGB: `r' = m0·r + m1·g + m2·b + m3`, etc.
   * Omit for "curves only".
   */
  matrix?: number[];
  /** Tone curves applied after the matrix. */
  curves?: Partial<CurvesState>;
}

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
  levels: LevelsState;
  curves: CurvesState;
  /** Applied before finetune, so adjustments tweak the filtered look. */
  filter: FilterState | null;
  /** Vector shapes on top of the photo, bottom → top (see `annotations.ts`). */
  annotations: Shape[];
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
  return Object.fromEntries(FINETUNE_KEYS.map((key) => [key, 0])) as unknown as FinetuneState;
}

export function createLevelsState(): LevelsState {
  return { black: 0, white: 1, mid: 0 };
}

export function createIdentityCurve(): CurvePoint[] {
  return [
    [0, 0],
    [1, 1],
  ];
}

export function createCurvesState(): CurvesState {
  return {
    rgb: createIdentityCurve(),
    red: createIdentityCurve(),
    green: createIdentityCurve(),
    blue: createIdentityCurve(),
  };
}

/** A fresh state with no edits. */
export function createEditState(): EditState {
  return {
    version: EDIT_STATE_VERSION,
    geometry: createGeometryState(),
    finetune: createFinetuneState(),
    levels: createLevelsState(),
    curves: createCurvesState(),
    filter: null,
    annotations: [],
    resize: null,
    assets: {},
  };
}

/** Largest output side we accept (also the practical GPU limit on most devices). */
export const MAX_OUTPUT_SIDE = 16384;

export function isNeutralFinetune(finetune: FinetuneState): boolean {
  return FINETUNE_KEYS.every((key) => finetune[key] === 0);
}

export function isNeutralLevels(levels: LevelsState): boolean {
  return levels.black === 0 && levels.white === 1 && levels.mid === 0;
}

export function isIdentityCurve(points: readonly CurvePoint[]): boolean {
  return points.every(([x, y]) => Math.abs(x - y) < 1e-6);
}

export function isNeutralCurves(curves: CurvesState): boolean {
  return (
    isIdentityCurve(curves.rgb) &&
    isIdentityCurve(curves.red) &&
    isIdentityCurve(curves.green) &&
    isIdentityCurve(curves.blue)
  );
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
  for (const key of FINETUNE_KEYS) {
    const [min, max] = FINETUNE_RANGES[key];
    state.finetune[key] = clampNumber(finetune[key], min, max);
  }

  if (isRecord(value['levels'])) {
    const l = value['levels'];
    const black = clampNumber(l['black'], 0, 0.99);
    const white = finite(l['white']) === null ? 1 : clampNumber(l['white'], black + 0.01, 1);
    state.levels = { black, white, mid: clampNumber(l['mid'], -1, 1) };
  }

  if (isRecord(value['curves'])) {
    for (const channel of CURVE_CHANNELS) {
      const points = parseCurve(value['curves'][channel]);
      if (points) state.curves[channel] = points;
    }
  }

  state.filter = parseFilter(value['filter']);
  state.annotations = parseAnnotations(value['annotations']);

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

const CURVE_CHANNELS: readonly CurveChannel[] = ['rgb', 'red', 'green', 'blue'];

/** Sorted, clamped curve with guaranteed end points; `null` if unusable. */
export function parseCurve(input: unknown): CurvePoint[] | null {
  if (!Array.isArray(input)) return null;
  const points: CurvePoint[] = [];
  for (const item of input) {
    if (!Array.isArray(item)) continue;
    const x = finite(item[0]);
    const y = finite(item[1]);
    if (x === null || y === null) continue;
    points.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  }
  points.sort((a, b) => a[0] - b[0]);
  // Drop points closer than 1% in x (curves must be functions).
  const unique = points.filter((p, i) => i === 0 || p[0] - points[i - 1]![0] > 0.01);
  if (unique.length === 0) return null;
  if (unique[0]![0] > 0) unique.unshift([0, unique[0]![0] === 0 ? unique[0]![1] : 0]);
  if (unique[unique.length - 1]![0] < 1) unique.push([1, 1]);
  return unique.slice(0, 16);
}

function parseFilter(input: unknown): FilterState | null {
  if (!isRecord(input) || typeof input['id'] !== 'string') return null;
  const filter: FilterState = {
    id: input['id'],
    name: typeof input['name'] === 'string' ? input['name'] : input['id'],
    intensity: finite(input['intensity']) === null ? 1 : clampNumber(input['intensity'], 0, 1),
  };
  const matrix = input['matrix'];
  if (Array.isArray(matrix) && matrix.length === 12 && matrix.every((n) => finite(n) !== null)) {
    filter.matrix = matrix.map((n) => Math.min(4, Math.max(-4, n as number)));
  }
  if (isRecord(input['curves'])) {
    const curves: Partial<CurvesState> = {};
    for (const channel of CURVE_CHANNELS) {
      const points = parseCurve(input['curves'][channel]);
      if (points) curves[channel] = points;
    }
    filter.curves = curves;
  }
  return filter;
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
