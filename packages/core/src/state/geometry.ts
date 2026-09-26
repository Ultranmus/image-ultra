import type { Point, Size } from '../types';
import type { EditState, GeometryState, Rect } from './editState';

/* ── Affine (2×3) — canvas transforms, viewport ─────────────────────────── */

/**
 * 2D affine transform in the same order as `CanvasRenderingContext2D.setTransform(a, b, c, d, e, f)`:
 * x' = a·x + c·y + e,  y' = b·x + d·y + f
 */
export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** `multiply(m, n)` applies `n` first, then `m`. */
export function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Compose in reading order: `compose(a, b, c)` applies `c`, then `b`, then `a`. */
export function compose(...transforms: Affine[]): Affine {
  return transforms.reduce(multiply, IDENTITY);
}

export function invert(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) throw new Error('Transform is not invertible.');
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function applyToPoint(m: Affine, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function translate(x: number, y: number): Affine {
  return [1, 0, 0, 1, x, y];
}

export function scale(x: number, y: number = x): Affine {
  return [x, 0, 0, y, 0, 0];
}

/** Clockwise on screen (y axis points down). */
export function rotate(degrees: number): Affine {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

/* ── Projective (3×3) — needed for perspective ─────────────────────────── */

/**
 * Row-major 3×3 projective transform:
 * x' = (m0·x + m1·y + m2) / (m6·x + m7·y + m8),  y' = (m3·x + m4·y + m5) / (…same…)
 */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export function mat3FromAffine(m: Affine): Mat3 {
  return [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1];
}

/** `mat3Multiply(m, n)` applies `n` first, then `m`. */
export function mat3Multiply(m: Mat3, n: Mat3): Mat3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = m[i * 3]! * n[j]! + m[i * 3 + 1]! * n[3 + j]! + m[i * 3 + 2]! * n[6 + j]!;
    }
  }
  return r as unknown as Mat3;
}

/** Compose in reading order; accepts affine or projective transforms. */
export function mat3Compose(...transforms: (Mat3 | Affine)[]): Mat3 {
  return transforms
    .map((t) => (t.length === 6 ? mat3FromAffine(t) : t))
    .reduce(mat3Multiply, mat3FromAffine(IDENTITY));
}

export function mat3Invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Transform is not invertible.');
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function mat3Apply(m: Mat3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

/** `true` when the transform has no perspective part (so a canvas `setTransform` can do it). */
export function isAffine(m: Mat3, epsilon = 1e-9): boolean {
  return Math.abs(m[6]) < epsilon && Math.abs(m[7]) < epsilon;
}

/** Drops the perspective row (normalized). Only valid when `isAffine(m)`. */
export function mat3ToAffine(m: Mat3): Affine {
  const k = m[8];
  return [m[0] / k, m[3] / k, m[1] / k, m[4] / k, m[2] / k, m[5] / k];
}

/** Column-major Float32Array for WebGL `uniformMatrix3fv`. */
export function mat3ToGL(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/* ── Edit geometry ─────────────────────────────────────────────────────── */

/** Largest tilt angle for `perspective = ±1`, in degrees. */
export const MAX_TILT_DEGREES = 30;

/** Image size after the quarter-turn rotation — the "oriented frame". */
export function getOrientedSize(image: Size, geometry: Pick<GeometryState, 'rotation'>): Size {
  const sideways = geometry.rotation === 90 || geometry.rotation === 270;
  return sideways ? { width: image.height, height: image.width } : { ...image };
}

/**
 * Perspective as a homography around the origin: the image plane is tilted in 3D and projected
 * back with focal length `focal`.
 */
export function perspectiveMatrix(perspective: { x: number; y: number }, focal: number): Mat3 {
  if (perspective.x === 0 && perspective.y === 0) return mat3FromAffine(IDENTITY);
  // Rotation vector in the image plane: y tilts around the horizontal axis, x around the vertical.
  // An in-plane axis (rather than Ry·Rx) keeps 90° turns and flips exact: see cropMath.rotateGeometry.
  const wx = (perspective.y * MAX_TILT_DEGREES * Math.PI) / 180;
  const wy = (perspective.x * MAX_TILT_DEGREES * Math.PI) / 180;
  const angle = Math.hypot(wx, wy);
  const kx = wx / angle;
  const ky = wy / angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Rodrigues' formula; only the first two columns matter because the image plane has z = 0.
  const r00 = c + (1 - c) * kx * kx;
  const r01 = (1 - c) * kx * ky;
  const r10 = r01;
  const r11 = c + (1 - c) * ky * ky;
  const r20 = -s * ky;
  const r21 = s * kx;
  return [focal * r00, focal * r01, 0, focal * r10, focal * r11, 0, r20, r21, focal];
}

/** Source pixels → oriented pixels (rotated, flipped, straightened, perspective-corrected). */
export function getSourceToOriented(image: Size, geometry: GeometryState): Mat3 {
  const oriented = getOrientedSize(image, geometry);
  const focal = Math.max(oriented.width, oriented.height);
  return mat3Compose(
    translate(oriented.width / 2, oriented.height / 2),
    perspectiveMatrix(geometry.perspective, focal),
    rotate(geometry.straighten),
    scale(geometry.flipX ? -1 : 1, geometry.flipY ? -1 : 1),
    rotate(geometry.rotation),
    translate(-image.width / 2, -image.height / 2),
  );
}

export function getOrientedToSource(image: Size, geometry: GeometryState): Mat3 {
  return mat3Invert(getSourceToOriented(image, geometry));
}

/** The image's four corners in oriented space (TL, TR, BR, BL of the source). */
export function getImageQuad(image: Size, geometry: GeometryState): [Point, Point, Point, Point] {
  const m = getSourceToOriented(image, geometry);
  return [
    mat3Apply(m, { x: 0, y: 0 }),
    mat3Apply(m, { x: image.width, y: 0 }),
    mat3Apply(m, { x: image.width, y: image.height }),
    mat3Apply(m, { x: 0, y: image.height }),
  ];
}

/** Axis-aligned bounding box of the transformed image in oriented space. */
export function getImageBounds(image: Size, geometry: GeometryState): Rect {
  const quad = getImageQuad(image, geometry);
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The crop rectangle, or the whole oriented frame when there is no crop. */
export function getCropRect(image: Size, geometry: GeometryState): Rect {
  if (geometry.crop) return geometry.crop;
  const { width, height } = getOrientedSize(image, geometry);
  return { x: 0, y: 0, width, height };
}

/** Crop size in whole pixels. */
export function getCropSize(image: Size, geometry: GeometryState): Size {
  const crop = getCropRect(image, geometry);
  return {
    width: Math.max(1, Math.round(crop.width)),
    height: Math.max(1, Math.round(crop.height)),
  };
}

type FramingState = Pick<EditState, 'geometry' | 'resize'> & Partial<Pick<EditState, 'canvas'>>;

/**
 * The whole result area in oriented space: the crop plus any space added around it
 * (`EditState.canvas`). Equal to the crop when nothing is added.
 */
export function getCanvasRect(
  image: Size,
  state: Pick<EditState, 'geometry'> & Partial<Pick<EditState, 'canvas'>>,
): Rect {
  const crop = getCropRect(image, state.geometry);
  const canvas = state.canvas;
  if (!canvas) return crop;
  const pad = canvas.padding * Math.min(crop.width, crop.height);
  let rect = {
    x: crop.x - pad,
    y: crop.y - pad,
    width: crop.width + pad * 2,
    height: crop.height + pad * 2,
  };
  if (canvas.aspect) {
    if (rect.width / rect.height < canvas.aspect) {
      const width = rect.height * canvas.aspect;
      rect = { ...rect, x: rect.x - (width - rect.width) * canvas.anchor.x, width };
    } else {
      const height = rect.width / canvas.aspect;
      rect = { ...rect, y: rect.y - (height - rect.height) * canvas.anchor.y, height };
    }
  }
  return rect;
}

/** Canvas (crop + added space) size in whole pixels. */
export function getCanvasSize(
  image: Size,
  state: Pick<EditState, 'geometry'> & Partial<Pick<EditState, 'canvas'>>,
): Size {
  const rect = getCanvasRect(image, state);
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/** Pixel size of the edited result: the resize target, else the canvas (crop + space) size. */
export function getOutputSize(image: Size, state: FramingState): Size {
  return state.resize ? { ...state.resize } : getCanvasSize(image, state);
}

/**
 * Where the photo (the crop) sits in the output, in output px. Vignette and the round crop are
 * measured on it, so added canvas space never moves them.
 */
export function getPhotoRect(image: Size, state: FramingState, exportScale = 1): Rect {
  const crop = getCropRect(image, state.geometry);
  const canvas = getCanvasRect(image, state);
  const output = getOutputSize(image, state);
  const sx = (output.width * exportScale) / canvas.width;
  const sy = (output.height * exportScale) / canvas.height;
  return {
    x: (crop.x - canvas.x) * sx,
    y: (crop.y - canvas.y) * sy,
    width: crop.width * sx,
    height: crop.height * sy,
  };
}

/**
 * Output pixels → source pixels. `exportScale` shrinks the output further (0.5 = half size).
 */
export function getOutputToSource(image: Size, state: FramingState, exportScale = 1): Mat3 {
  const area = getCanvasRect(image, state);
  const output = getOutputSize(image, state);
  return mat3Compose(
    getOrientedToSource(image, state.geometry),
    translate(area.x, area.y),
    scale(area.width / (output.width * exportScale), area.height / (output.height * exportScale)),
  );
}
