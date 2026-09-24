import type { Point, Size } from '../types';
import type { GeometryState, QuarterTurn, Rect, ResizeState } from './editState';
import {
  getCropRect,
  getImageBounds,
  getOrientedSize,
  getOrientedToSource,
  getSourceToOriented,
  mat3Apply,
} from './geometry';

/*
 * Pure crop/orientation helpers used by the Adjust tool. All rects are in oriented space
 * (see `GeometryState.crop`). Nothing here mutates its input.
 */

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const FIT_EPSILON = 0.01;
const SEARCH_STEPS = 24;

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function rectAround(center: Point, width: number, height: number): Rect {
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

/** `true` when every corner of `rect` lies on the image (so the crop has no empty areas). */
export function cropFits(image: Size, geometry: GeometryState, rect: Rect): boolean {
  const toSource = getOrientedToSource(image, geometry);
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.every((corner) => {
    const p = mat3Apply(toSource, corner);
    return (
      p.x >= -FIT_EPSILON &&
      p.y >= -FIT_EPSILON &&
      p.x <= image.width + FIT_EPSILON &&
      p.y <= image.height + FIT_EPSILON
    );
  });
}

/** Largest `t` in 0…1 for which `rectAt(t)` fits (assumes `rectAt(0)` fits). */
function searchFit(image: Size, geometry: GeometryState, rectAt: (t: number) => Rect): number {
  if (cropFits(image, geometry, rectAt(1))) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (cropFits(image, geometry, rectAt(mid))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Centre of the transformed image in oriented space. */
export function getImageCenter(image: Size, geometry: GeometryState): Point {
  return mat3Apply(getSourceToOriented(image, geometry), {
    x: image.width / 2,
    y: image.height / 2,
  });
}

/**
 * Largest rect with the given aspect, centred as close to `center` as possible, no larger than
 * `maxSize`, that lies entirely on the image.
 */
export function largestFit(
  image: Size,
  geometry: GeometryState,
  center: Point,
  aspect: number,
  maxSize?: Size,
): Rect {
  const bounds = getImageBounds(image, geometry);
  const limit = maxSize ?? bounds;
  const maxWidth = Math.min(limit.width, limit.height * aspect);
  const imageCenter = getImageCenter(image, geometry);

  let best: Rect | null = null;
  // Pull the centre towards the image centre if needed (e.g. an off-centre crop after straightening).
  for (let step = 0; step <= 10; step++) {
    const t = step / 10;
    const c = {
      x: center.x + (imageCenter.x - center.x) * t,
      y: center.y + (imageCenter.y - center.y) * t,
    };
    const at = (k: number) =>
      rectAround(c, Math.max(1e-3, maxWidth * k), Math.max(1e-3, (maxWidth * k) / aspect));
    if (!cropFits(image, geometry, at(0))) continue;
    const rect = at(searchFit(image, geometry, at));
    if (!best || rect.width > best.width * 1.001) best = rect;
    if (best.width >= maxWidth * 0.999) break;
  }
  return best ?? rectAround(imageCenter, 1, 1 / aspect);
}

/** Keeps a crop valid after straighten/perspective changes: same centre and aspect, shrunk to fit. */
export function fitCrop(image: Size, geometry: GeometryState, base: Rect): Rect {
  if (cropFits(image, geometry, base)) return base;
  return largestFit(image, geometry, rectCenter(base), base.width / base.height, base);
}

/** Moves the crop by `dx`/`dy`, stopping (and sliding along) at the image edges. */
export function moveCrop(
  image: Size,
  geometry: GeometryState,
  start: Rect,
  dx: number,
  dy: number,
): Rect {
  if (!cropFits(image, geometry, start)) return start;
  const along = (from: Rect, mx: number, my: number): Rect => {
    const to = { ...from, x: from.x + mx, y: from.y + my };
    return lerpRect(
      from,
      to,
      searchFit(image, geometry, (t) => lerpRect(from, to, t)),
    );
  };
  let rect = along(start, dx, dy);
  rect = along(rect, start.x + dx - rect.x, 0);
  rect = along(rect, 0, start.y + dy - rect.y);
  return rect;
}

/**
 * Resizes the crop by dragging `handle` by `dx`/`dy`. Keeps `aspect` when given, never goes below
 * `minSize` and never past the image edges.
 */
export function resizeCrop(
  image: Size,
  geometry: GeometryState,
  start: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  aspect: number | null,
  minSize: number,
): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = Math.min(left + dx, right - minSize);
  if (handle.includes('e')) right = Math.max(right + dx, left + minSize);
  if (handle.includes('n')) top = Math.min(top + dy, bottom - minSize);
  if (handle.includes('s')) bottom = Math.max(bottom + dy, top + minSize);

  let target: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  if (aspect) target = constrainAspect(start, target, handle, aspect, minSize);
  if (!cropFits(image, geometry, start)) return target;
  return lerpRect(
    start,
    target,
    searchFit(image, geometry, (t) => lerpRect(start, target, t)),
  );
}

function constrainAspect(
  start: Rect,
  target: Rect,
  handle: CropHandle,
  aspect: number,
  minSize: number,
): Rect {
  const minWidth = Math.max(minSize, minSize * aspect);
  if (handle === 'e' || handle === 'w') {
    const width = Math.max(minWidth, target.width);
    const height = width / aspect;
    const cy = start.y + start.height / 2;
    return {
      x: handle === 'w' ? start.x + start.width - width : start.x,
      y: cy - height / 2,
      width,
      height,
    };
  }
  if (handle === 'n' || handle === 's') {
    const height = Math.max(minWidth / aspect, target.height);
    const width = height * aspect;
    const cx = start.x + start.width / 2;
    return {
      x: cx - width / 2,
      y: handle === 'n' ? start.y + start.height - height : start.y,
      width,
      height,
    };
  }
  // Corners: follow whichever side moved more, anchored at the opposite corner.
  let width = target.width;
  if (width / aspect < target.height) width = target.height * aspect;
  width = Math.max(minWidth, width);
  const height = width / aspect;
  const anchorX = handle.includes('w') ? start.x + start.width : start.x;
  const anchorY = handle.includes('n') ? start.y + start.height : start.y;
  return {
    x: handle.includes('w') ? anchorX - width : anchorX,
    y: handle.includes('n') ? anchorY - height : anchorY,
    width,
    height,
  };
}

/** The crop for a newly chosen aspect ratio: as large as possible around the current centre. */
export function cropForAspect(image: Size, geometry: GeometryState, aspect: number | null): Rect {
  const current = getCropRect(image, geometry);
  if (aspect === null) return current;
  return largestFit(image, geometry, rectCenter(current), aspect);
}

/** Rotates the result 90° (`1` = clockwise, `-1` = counter-clockwise), exactly as seen on screen. */
export function rotateGeometry(
  image: Size,
  geometry: GeometryState,
  direction: 1 | -1,
): GeometryState {
  const { width: W, height: H } = getOrientedSize(image, geometry);
  const oneFlip = geometry.flipX !== geometry.flipY;
  const step = (oneFlip ? -direction : direction) * 90;
  const rotation = ((((geometry.rotation + step) % 360) + 360) % 360) as QuarterTurn;
  const { x: px, y: py } = geometry.perspective;
  const crop = geometry.crop;
  return {
    ...geometry,
    rotation,
    perspective: direction === 1 ? { x: py, y: -px } : { x: -py, y: px },
    crop: crop
      ? direction === 1
        ? { x: H - (crop.y + crop.height), y: crop.x, width: crop.height, height: crop.width }
        : { x: crop.y, y: W - (crop.x + crop.width), width: crop.height, height: crop.width }
      : null,
    cropAspect: geometry.cropAspect ? 1 / geometry.cropAspect : null,
  };
}

/** Mirrors the result horizontally (`x`) or vertically (`y`), exactly as seen on screen. */
export function flipGeometry(image: Size, geometry: GeometryState, axis: 'x' | 'y'): GeometryState {
  const { width: W, height: H } = getOrientedSize(image, geometry);
  const crop = geometry.crop;
  const { x: px, y: py } = geometry.perspective;
  return {
    ...geometry,
    flipX: axis === 'x' ? !geometry.flipX : geometry.flipX,
    flipY: axis === 'y' ? !geometry.flipY : geometry.flipY,
    straighten: -geometry.straighten || 0,
    perspective: axis === 'x' ? { x: -px || 0, y: py } : { x: px, y: -py || 0 },
    crop: crop
      ? axis === 'x'
        ? { ...crop, x: W - (crop.x + crop.width) }
        : { ...crop, y: H - (crop.y + crop.height) }
      : null,
  };
}

/** Swaps resize width/height after a 90° turn. */
export function rotateResize(resize: ResizeState | null): ResizeState | null {
  return resize ? { width: resize.height, height: resize.width } : null;
}

/** Keeps a resize target proportional to the crop (keeps the width). */
export function syncResizeToCrop(resize: ResizeState | null, crop: Rect): ResizeState | null {
  if (!resize) return null;
  return {
    width: resize.width,
    height: Math.max(1, Math.round((resize.width * crop.height) / crop.width)),
  };
}
