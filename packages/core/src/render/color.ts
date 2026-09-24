import { FINETUNE_KEYS, type EditState, type FinetuneState } from '../state/editState';
import { buildToneLUT, sampleLUT } from '../state/curves';

/*
 * Colour pipeline. Everything here MUST stay identical to `shaders.ts` — the WebGL and Canvas2D
 * renderers are compared pixel-by-pixel in the e2e tests. Per-pixel order:
 *   1. filter: matrix → filter curves, blended by intensity
 *   2. exposure + white balance (temperature, tint) in linear light
 *   3. brightness, contrast, gamma, highlights/shadows
 *   4. saturation, vibrance, hue
 *   5. levels + tone curves (one LUT)
 * Then detail (clarity, sharpen, blur — need neighbouring pixels) and finally, per output position,
 * vignette, grain and the round-crop mask (`finishPixel`).
 */

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

type RGB = [number, number, number];

/** Everything the per-pixel stage needs, precomputed once per render. */
export interface ColorProgram {
  finetune: FinetuneState;
  filter: {
    /** Row-major 3×4, or identity when the filter only has curves. */
    matrix: Float32Array;
    intensity: number;
    lut: Uint8Array | null;
  } | null;
  /** Levels + curves. */
  toneLUT: Uint8Array | null;
  /** Row-major 3×3 hue rotation, or `null` when hue = 0. */
  hueMatrix: Float32Array | null;
  /** Any per-pixel finetune value is non-zero (steps 2–4). */
  hasAdjust: boolean;
  /** Any per-pixel colour work at all (filter, finetune, levels/curves). */
  hasColor: boolean;
  /** Clarity / sharpen / blur present (needs the multi-pass path). */
  hasDetail: boolean;
  /** Vignette / grain present. */
  hasFinish: boolean;
}

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
const PER_PIXEL_KEYS = FINETUNE_KEYS.filter(
  (k) => !['clarity', 'sharpen', 'blur', 'grain', 'vignette'].includes(k),
);

export function compileColor(
  state: Pick<EditState, 'finetune' | 'levels' | 'curves' | 'filter'>,
): ColorProgram {
  const f = state.finetune;
  const filter =
    state.filter && state.filter.intensity > 0
      ? {
          matrix: state.filter.matrix ? new Float32Array(state.filter.matrix) : IDENTITY_MATRIX,
          intensity: state.filter.intensity,
          lut: buildToneLUT(null, state.filter.curves ?? null),
        }
      : null;
  const toneLUT = buildToneLUT(state.levels, state.curves);
  const hueMatrix = f.hue !== 0 ? hueRotation(f.hue * Math.PI) : null;
  const hasAdjust = PER_PIXEL_KEYS.some((k) => f[k] !== 0);
  return {
    finetune: f,
    filter,
    toneLUT,
    hueMatrix,
    hasAdjust,
    hasColor: filter !== null || toneLUT !== null || hasAdjust,
    hasDetail: f.clarity !== 0 || f.sharpen !== 0 || f.blur !== 0,
    hasFinish: f.vignette !== 0 || f.grain !== 0,
  };
}

/** Standard luminance-preserving hue rotation (as in SVG `feColorMatrix type="hueRotate"`). */
export function hueRotation(radians: number): Float32Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return new Float32Array([
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ]);
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function clamp01(c: number): number {
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function luma(r: number, g: number, b: number): number {
  return r * LUMA_R + g * LUMA_G + b * LUMA_B;
}

/** Per-pixel colour for one sRGB colour (channels 0…1). */
export function colorPixel(rgb: readonly [number, number, number], p: ColorProgram): RGB {
  let [r, g, b] = rgb;
  const f = p.finetune;

  // 1. Filter look, blended by intensity.
  if (p.filter) {
    const m = p.filter.matrix;
    let fr = clamp01(m[0]! * r + m[1]! * g + m[2]! * b + m[3]!);
    let fg = clamp01(m[4]! * r + m[5]! * g + m[6]! * b + m[7]!);
    let fb = clamp01(m[8]! * r + m[9]! * g + m[10]! * b + m[11]!);
    if (p.filter.lut) {
      fr = sampleLUT(p.filter.lut, 0, fr);
      fg = sampleLUT(p.filter.lut, 1, fg);
      fb = sampleLUT(p.filter.lut, 2, fb);
    }
    const t = p.filter.intensity;
    r += (fr - r) * t;
    g += (fg - g) * t;
    b += (fb - b) * t;
  }

  if (!p.hasAdjust) {
    if (!p.toneLUT) return [r, g, b];
    return [sampleLUT(p.toneLUT, 0, r), sampleLUT(p.toneLUT, 1, g), sampleLUT(p.toneLUT, 2, b)];
  }

  // 2. Linear light: exposure (±2 stops) and white balance.
  const exposure = Math.pow(2, f.exposure * 2);
  r = clamp01(linearToSrgb(srgbToLinear(r) * exposure * (1 + 0.25 * f.temperature)));
  g = clamp01(linearToSrgb(srgbToLinear(g) * exposure * (1 - 0.25 * f.tint)));
  b = clamp01(linearToSrgb(srgbToLinear(b) * exposure * (1 - 0.25 * f.temperature)));

  // 3. Tone: brightness, contrast, gamma, highlights / shadows.
  r += f.brightness * 0.35;
  g += f.brightness * 0.35;
  b += f.brightness * 0.35;
  const contrast = 1 + f.contrast;
  r = (r - 0.5) * contrast + 0.5;
  g = (g - 0.5) * contrast + 0.5;
  b = (b - 0.5) * contrast + 0.5;
  const gammaExp = Math.pow(2, -f.gamma);
  r = Math.pow(clamp01(r), gammaExp);
  g = Math.pow(clamp01(g), gammaExp);
  b = Math.pow(clamp01(b), gammaExp);
  if (f.highlights !== 0 || f.shadows !== 0) {
    const l = luma(r, g, b);
    const d =
      f.shadows * 0.35 * (1 - smoothstep(0, 0.5, l)) + f.highlights * 0.35 * smoothstep(0.5, 1, l);
    r = clamp01(r + d);
    g = clamp01(g + d);
    b = clamp01(b + d);
  }

  // 4. Colour: saturation, vibrance, hue.
  let l = luma(r, g, b);
  const saturation = 1 + f.saturation;
  r = l + (r - l) * saturation;
  g = l + (g - l) * saturation;
  b = l + (b - l) * saturation;
  if (f.vibrance !== 0) {
    r = clamp01(r);
    g = clamp01(g);
    b = clamp01(b);
    l = luma(r, g, b);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const k = 1 + f.vibrance * (1 - chroma);
    r = l + (r - l) * k;
    g = l + (g - l) * k;
    b = l + (b - l) * k;
  }
  if (p.hueMatrix) {
    const m = p.hueMatrix;
    const hr = m[0]! * r + m[1]! * g + m[2]! * b;
    const hg = m[3]! * r + m[4]! * g + m[5]! * b;
    const hb = m[6]! * r + m[7]! * g + m[8]! * b;
    r = hr;
    g = hg;
    b = hb;
  }
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);

  // 5. Levels + curves.
  if (p.toneLUT) {
    r = sampleLUT(p.toneLUT, 0, r);
    g = sampleLUT(p.toneLUT, 1, g);
    b = sampleLUT(p.toneLUT, 2, b);
  }
  return [r, g, b];
}

/* ── Detail (neighbourhood) ─────────────────────────────────────────────── */

/** Blur radii (Gaussian sigma) in output pixels, relative to the output size. */
export function detailSigmas(f: FinetuneState, output: { width: number; height: number }) {
  const minSide = Math.min(output.width, output.height);
  return {
    sharpen: f.sharpen !== 0 ? Math.max(0.8, minSide * 0.0012) : 0,
    clarity: f.clarity !== 0 ? minSide * 0.02 : 0,
    blur: f.blur !== 0 ? f.blur * minSide * 0.03 : 0,
  };
}

/**
 * Combines a pixel with its blurred versions: blur replaces, sharpen/clarity add back detail.
 * Inputs and outputs are unpremultiplied sRGB 0…1.
 */
export function detailPixel(
  c: readonly [number, number, number],
  blurred: { sharpen?: RGB; clarity?: RGB; blur?: RGB },
  f: FinetuneState,
): RGB {
  if (blurred.blur) return [...blurred.blur];
  let [r, g, b] = c;
  if (blurred.sharpen) {
    const s = blurred.sharpen;
    const k = f.sharpen * 1.5;
    r += (r - s[0]) * k;
    g += (g - s[1]) * k;
    b += (b - s[2]) * k;
  }
  if (blurred.clarity) {
    const s = blurred.clarity;
    const l = luma(clamp01(r), clamp01(g), clamp01(b));
    const k = f.clarity * 1.2 * 4 * l * (1 - l); // strongest in the mid-tones
    r += (r - s[0]) * k;
    g += (g - s[1]) * k;
    b += (b - s[2]) * k;
  }
  return [clamp01(r), clamp01(g), clamp01(b)];
}

/* ── Finish (per output position) ───────────────────────────────────────── */

/** Integer hash (PCG-style), identical in the shader: same grain on GPU and CPU. */
export function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

export interface FinishParams {
  finetune: FinetuneState;
  output: { width: number; height: number };
  ellipse: boolean;
  /** Width of one canvas pixel in ellipse-distance units (anti-aliasing). */
  ellipseAA: number;
}

/** Grain cell size in output pixels, relative to the output so it looks the same at any size. */
export function grainCell(output: { width: number; height: number }): number {
  return Math.max(1, Math.min(output.width, output.height) / 1500);
}

/**
 * Vignette, grain and the round-crop mask for a pixel at output position `ox`/`oy`.
 * Returns the colour and an alpha multiplier.
 */
export function finishPixel(
  c: readonly [number, number, number],
  ox: number,
  oy: number,
  p: FinishParams,
): [number, number, number, number] {
  let [r, g, b] = c;
  const f = p.finetune;
  const u = ox / p.output.width;
  const v = oy / p.output.height;
  if (f.vignette !== 0) {
    const d = Math.hypot(u - 0.5, v - 0.5) * Math.SQRT2;
    const k = 1 - f.vignette * smoothstep(0.3, 1, d);
    r *= k;
    g *= k;
    b *= k;
  }
  if (f.grain !== 0) {
    const cell = grainCell(p.output);
    const n = (hash2(Math.floor(ox / cell), Math.floor(oy / cell)) - 0.5) * f.grain * 0.25;
    r += n;
    g += n;
    b += n;
  }
  let mask = 1;
  if (p.ellipse) {
    const d = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
    mask = 1 - smoothstep(1 - p.ellipseAA, 1 + p.ellipseAA, d);
  }
  return [clamp01(r), clamp01(g), clamp01(b), mask];
}
