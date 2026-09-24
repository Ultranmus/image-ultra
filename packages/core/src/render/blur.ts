/**
 * CPU Gaussian approximation (three box blurs) on premultiplied RGBA8, used by the Canvas2D
 * fallback for clarity / sharpen / blur. Large radii run on a downsampled copy, like the GPU path.
 */
export interface BlurredImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Source pixels per blurred pixel. */
  scale: number;
}

/** Premultiplies an unpremultiplied RGBA8 buffer (as returned by `getImageData`). */
export function premultiply(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]!;
    out[i] = (src[i]! * a) / 255;
    out[i + 1] = (src[i + 1]! * a) / 255;
    out[i + 2] = (src[i + 2]! * a) / 255;
    out[i + 3] = a;
  }
  return out;
}

export function gaussianBlur(
  premultiplied: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number,
): BlurredImage {
  const scale = Math.min(4, Math.max(1, Math.floor(sigma / 3)));
  const small = downsample(premultiplied, width, height, scale);
  const { width: w, height: h } = small;
  let data = small.data;
  const s = sigma / scale;
  for (const box of boxSizes(s, 3)) {
    const radius = (box - 1) / 2;
    data = boxPass(data, w, h, radius, true);
    data = boxPass(data, w, h, radius, false);
  }
  return { data, width: w, height: h, scale };
}

/** Bilinear sample of a blurred image at source pixel centre `x`,`y`, unpremultiplied (0…1). */
export function sampleBlurred(b: BlurredImage, x: number, y: number): [number, number, number] {
  const fx = Math.min(b.width - 1, Math.max(0, x / b.scale - 0.5));
  const fy = Math.min(b.height - 1, Math.max(0, y / b.scale - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(b.width - 1, x0 + 1);
  const y1 = Math.min(b.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const a = b.data[(y0 * b.width + x0) * 4 + c]!;
    const bb = b.data[(y0 * b.width + x1) * 4 + c]!;
    const cc = b.data[(y1 * b.width + x0) * 4 + c]!;
    const d = b.data[(y1 * b.width + x1) * 4 + c]!;
    out[c] = (a + (bb - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
  }
  const alpha = out[3]!;
  if (alpha <= 0) return [0, 0, 0];
  return [Math.min(1, out[0]! / alpha), Math.min(1, out[1]! / alpha), Math.min(1, out[2]! / alpha)];
}

/** Box widths whose repeated application approximates a Gaussian of `sigma`. */
function boxSizes(sigma: number, n: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => Math.max(1, i < m ? wl : wu));
}

function boxPass(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  horizontal: boolean,
): Uint8ClampedArray {
  if (radius < 1) return src;
  const out = new Uint8ClampedArray(src.length);
  const lines = horizontal ? h : w;
  const length = horizontal ? w : h;
  const stride = horizontal ? 4 : w * 4;
  const size = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * w * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += src[start + Math.min(length - 1, Math.max(0, k)) * stride + c]!;
      }
      for (let i = 0; i < length; i++) {
        out[start + i * stride + c] = sum / size;
        const add = Math.min(length - 1, i + radius + 1);
        const remove = Math.max(0, i - radius);
        sum += src[start + add * stride + c]! - src[start + remove * stride + c]!;
      }
    }
  }
  return out;
}

function downsample(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  if (scale === 1) return { data: src, width, height };
  const w = Math.ceil(width / scale);
  const h = Math.ceil(height / scale);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sums = [0, 0, 0, 0];
      let count = 0;
      for (let dy = 0; dy < scale; dy++) {
        const sy = y * scale + dy;
        if (sy >= height) break;
        for (let dx = 0; dx < scale; dx++) {
          const sx = x * scale + dx;
          if (sx >= width) break;
          const i = (sy * width + sx) * 4;
          for (let c = 0; c < 4; c++) sums[c]! += src[i + c]!;
          count++;
        }
      }
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = sums[c]! / count;
    }
  }
  return { data: out, width: w, height: h };
}
