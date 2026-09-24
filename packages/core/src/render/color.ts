import { isNeutralFinetune, type FinetuneState } from '../state/editState';

/*
 * Finetune colour math. MUST stay identical to `adjust()` in `shaders.ts` — the WebGL and Canvas2D
 * renderers are compared pixel-by-pixel in the e2e tests. Order:
 *   1. exposure + white balance (temperature, tint) in linear light
 *   2. brightness, contrast, gamma, saturation in sRGB
 *   3. vignette, based on the position in the output image
 */

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

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

/**
 * Adjusts one sRGB colour (channels 0…1). `u`/`v` is the pixel's position in the output (0…1).
 * Returns a new `[r, g, b]` tuple.
 */
export function adjustColor(
  rgb: readonly [number, number, number],
  u: number,
  v: number,
  f: FinetuneState,
): [number, number, number] {
  let [r, g, b] = rgb;

  // 1. Linear light: exposure (±2 stops) and white balance.
  const exposure = Math.pow(2, f.exposure * 2);
  r = clamp01(linearToSrgb(srgbToLinear(r) * exposure * (1 + 0.25 * f.temperature)));
  g = clamp01(linearToSrgb(srgbToLinear(g) * exposure * (1 - 0.25 * f.tint)));
  b = clamp01(linearToSrgb(srgbToLinear(b) * exposure * (1 - 0.25 * f.temperature)));

  // 2. sRGB: brightness, contrast, gamma, saturation.
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

  const luma = r * LUMA_R + g * LUMA_G + b * LUMA_B;
  const saturation = 1 + f.saturation;
  r = luma + (r - luma) * saturation;
  g = luma + (g - luma) * saturation;
  b = luma + (b - luma) * saturation;

  // 3. Vignette: 0 at the centre, 1 in the corners.
  if (f.vignette !== 0) {
    const d = Math.hypot(u - 0.5, v - 0.5) * Math.SQRT2;
    const k = 1 - f.vignette * smoothstep(0.3, 1, d);
    r *= k;
    g *= k;
    b *= k;
  }

  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * Applies finetune in place to RGBA pixels (unpremultiplied, as returned by `getImageData`).
 * `toOutputUV(x, y)` maps a pixel centre to its output position; return `null` to skip the pixel.
 */
export function applyFinetune(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  finetune: FinetuneState,
  toOutputUV: (x: number, y: number) => readonly [number, number] | null,
): void {
  if (isNeutralFinetune(finetune)) return;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;
      const uv = toOutputUV(x + 0.5, y + 0.5);
      if (!uv) continue;
      const [r, g, b] = adjustColor(
        [data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255],
        uv[0],
        uv[1],
        finetune,
      );
      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = b * 255;
    }
  }
}
