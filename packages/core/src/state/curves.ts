import type { CurvePoint, CurvesState, LevelsState } from './editState';
import { isIdentityCurve, isNeutralCurves, isNeutralLevels } from './editState';

/**
 * Tone-curve evaluation with monotone cubic interpolation (Fritsch–Carlson): smooth like a spline,
 * but never overshoots between points, so a curve can't invert tones by accident.
 */
export function createCurveFunction(points: readonly CurvePoint[]): (x: number) => number {
  const n = points.length;
  if (n === 0) return (x) => x;
  if (n === 1) return () => points[0]![1];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const deltas: number[] = [];
  for (let k = 0; k < n - 1; k++) deltas.push((ys[k + 1]! - ys[k]!) / (xs[k + 1]! - xs[k]!));

  const m: number[] = new Array<number>(n).fill(0);
  m[0] = deltas[0]!;
  m[n - 1] = deltas[n - 2]!;
  for (let k = 1; k < n - 1; k++) {
    const a = deltas[k - 1]!;
    const b = deltas[k]!;
    m[k] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let k = 0; k < n - 1; k++) {
    const d = deltas[k]!;
    if (d === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k]! / d;
    const b = m[k + 1]! / d;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * d;
      m[k + 1] = t * b * d;
    }
  }

  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]!) k++;
    const h = xs[k + 1]! - xs[k]!;
    const t = (x - xs[k]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const y =
      (2 * t3 - 3 * t2 + 1) * ys[k]! +
      (t3 - 2 * t2 + t) * h * m[k]! +
      (-2 * t3 + 3 * t2) * ys[k + 1]! +
      (t3 - t2) * h * m[k + 1]!;
    return Math.min(1, Math.max(0, y));
  };
}

/** Levels as a function: black/white input points, then a mid-tone power. */
export function createLevelsFunction(levels: LevelsState): (x: number) => number {
  const range = Math.max(1e-3, levels.white - levels.black);
  const power = Math.pow(2, -levels.mid);
  return (x) => Math.pow(Math.min(1, Math.max(0, (x - levels.black) / range)), power);
}

/** Size of every lookup table. Shared with the shader. */
export const LUT_SIZE = 256;

/**
 * A 256-entry RGBA8 lookup table (alpha unused) combining levels, then per-channel curves, then the
 * RGB curve. `null` when it would be the identity.
 */
export function buildToneLUT(
  levels: LevelsState | null,
  curves: Partial<CurvesState> | null,
): Uint8Array | null {
  const levelsActive = levels !== null && !isNeutralLevels(levels);
  const curvesActive =
    curves !== null &&
    (curves.rgb || curves.red || curves.green || curves.blue) !== undefined &&
    !isNeutralCurves({
      rgb: curves.rgb ?? IDENTITY,
      red: curves.red ?? IDENTITY,
      green: curves.green ?? IDENTITY,
      blue: curves.blue ?? IDENTITY,
    });
  if (!levelsActive && !curvesActive) return null;

  const lv = levelsActive ? createLevelsFunction(levels) : (x: number) => x;
  const fn = (points: readonly CurvePoint[] | undefined) =>
    points && !isIdentityCurve(points) ? createCurveFunction(points) : (x: number) => x;
  const master = fn(curves?.rgb);
  const channels = [fn(curves?.red), fn(curves?.green), fn(curves?.blue)];

  const lut = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const v = lv(i / (LUT_SIZE - 1));
    for (let c = 0; c < 3; c++) lut[i * 4 + c] = Math.round(master(channels[c]!(v)) * 255);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

const IDENTITY: CurvePoint[] = [
  [0, 0],
  [1, 1],
];

/**
 * Samples channel `c` (0 = r, 1 = g, 2 = b) of a LUT at `v` (0…1) with linear interpolation —
 * the same maths as GPU linear filtering of the LUT texture.
 */
export function sampleLUT(lut: Uint8Array, c: number, v: number): number {
  const pos = Math.min(1, Math.max(0, v)) * (LUT_SIZE - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = lut[i * 4 + c]!;
  const b = lut[Math.min(LUT_SIZE - 1, i + 1) * 4 + c]!;
  return (a + (b - a) * f) / 255;
}
