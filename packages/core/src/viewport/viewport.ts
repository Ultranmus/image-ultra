import type { Point, Size } from '../types';

/**
 * Where the image sits on the stage.
 * `x`/`y` are the screen position (CSS px, relative to the stage) of the image's top-left corner,
 * `scale` is CSS px per image px.
 */
export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface ViewportOptions {
  /** Empty space kept around the image when fitting, in CSS px. */
  padding?: number;
  /** Highest zoom, as image px → CSS px ratio. Default 16 (1600%). */
  maxScale?: number;
}

const DEFAULT_PADDING = 24;
const DEFAULT_MAX_SCALE = 16;

/** Largest scale at which the whole image fits inside the stage. */
export function getFitScale(image: Size, stage: Size, options: ViewportOptions = {}): number {
  const padding = options.padding ?? DEFAULT_PADDING;
  const availableW = Math.max(1, stage.width - padding * 2);
  const availableH = Math.max(1, stage.height - padding * 2);
  return Math.min(availableW / image.width, availableH / image.height);
}

export function getScaleLimits(
  image: Size,
  stage: Size,
  options: ViewportOptions = {},
): { min: number; max: number } {
  const fit = getFitScale(image, stage, options);
  return { min: fit, max: Math.max(fit, options.maxScale ?? DEFAULT_MAX_SCALE) };
}

/** Image centred and scaled to fit. */
export function fitViewport(image: Size, stage: Size, options: ViewportOptions = {}): Viewport {
  const scale = getFitScale(image, stage, options);
  return centerAt(image, stage, scale);
}

/** Image centred at a given scale. */
export function centerAt(image: Size, stage: Size, scale: number): Viewport {
  return {
    scale,
    x: (stage.width - image.width * scale) / 2,
    y: (stage.height - image.height * scale) / 2,
  };
}

/**
 * Keeps the image in a sensible place: centred on an axis where it is smaller than the stage,
 * otherwise no empty gap between an image edge and the stage edge.
 */
export function clampViewport(
  viewport: Viewport,
  image: Size,
  stage: Size,
  options: ViewportOptions = {},
): Viewport {
  const { min, max } = getScaleLimits(image, stage, options);
  const scale = clamp(viewport.scale, min, max);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = w <= stage.width ? (stage.width - w) / 2 : clamp(viewport.x, stage.width - w, 0);
  const y = h <= stage.height ? (stage.height - h) / 2 : clamp(viewport.y, stage.height - h, 0);
  return { scale, x, y };
}

/** Zoom to `scale` keeping the image point under `anchor` (stage coords) fixed on screen. */
export function zoomAt(viewport: Viewport, scale: number, anchor: Point): Viewport {
  const ratio = scale / viewport.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { scale: viewport.scale, x: viewport.x + dx, y: viewport.y + dy };
}

/** Stage (screen) point → image pixel coordinates. */
export function stageToImage(viewport: Viewport, point: Point): Point {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}

/** Linear blend between two viewports, `t` in 0..1. */
export function lerpViewport(from: Viewport, to: Viewport, t: number): Viewport {
  return {
    scale: from.scale + (to.scale - from.scale) * t,
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

export function viewportsEqual(a: Viewport, b: Viewport, epsilon = 0.01): boolean {
  return (
    Math.abs(a.scale - b.scale) < epsilon / 100 &&
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Transform used while cropping: stage px = oriented px × `scale` + (`x`, `y`).
 * The crop rectangle is fitted and centred on the stage; the rest of the image extends around it.
 */
export interface CropView {
  scale: number;
  x: number;
  y: number;
}

export function getCropView(
  crop: { x: number; y: number; width: number; height: number },
  stage: Size,
  padding = 40,
): CropView {
  const scale = getFitScale(crop, stage, { padding });
  return {
    scale,
    x: stage.width / 2 - (crop.x + crop.width / 2) * scale,
    y: stage.height / 2 - (crop.y + crop.height / 2) * scale,
  };
}

export function lerpCropView(from: CropView, to: CropView, t: number): CropView {
  return {
    scale: from.scale + (to.scale - from.scale) * t,
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}
