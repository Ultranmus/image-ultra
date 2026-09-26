import type { EditState, FinetuneState, LevelsState } from '../state/editState';
import { createCurvesState, createFinetuneState, createLevelsState } from '../state/editState';
import { renderToCanvas } from '../export/exportImage';
import type { LoadedImage } from '../types';

export interface Histogram {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  luma: Uint32Array;
  /** Number of counted (mostly opaque) pixels. */
  total: number;
}

/** 256-bin histograms of RGBA8 pixels; mostly-transparent pixels are ignored. */
export function computeHistogram(data: Uint8ClampedArray): Histogram {
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const luma = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    red[r]!++;
    green[g]!++;
    blue[b]!++;
    luma[Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722)]!++;
    total++;
  }
  return { red, green, blue, luma, total };
}

/** Value (0…1) below which `p` (0…1) of the counted pixels fall. */
export function percentile(bins: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let sum = 0;
  for (let i = 0; i < bins.length; i++) {
    sum += bins[i]!;
    if (sum >= target) return i / 255;
  }
  return 1;
}

/** Suggested settings from Auto-enhance. Only the listed finetune keys are touched. */
export interface AutoEnhanceResult {
  finetune: Pick<
    FinetuneState,
    'temperature' | 'tint' | 'vibrance' | 'contrast' | 'shadows' | 'highlights'
  >;
  levels: LevelsState;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/**
 * "Auto-enhance" without any ML: auto levels (black/white points + mid-tone), gray-world white
 * balance, and gentle vibrance/contrast/shadow/highlight fixes. Deterministic and cheap.
 */
export function computeAutoEnhance(data: Uint8ClampedArray): AutoEnhanceResult {
  const hist = computeHistogram(data);
  const finetune: AutoEnhanceResult['finetune'] = {
    temperature: 0,
    tint: 0,
    vibrance: 0,
    contrast: 0,
    shadows: 0,
    highlights: 0,
  };
  const levels = createLevelsState();
  if (hist.total === 0) return { finetune, levels };

  // Levels: clip 0.5% at both ends, but never crush more than 12%.
  const lo = percentile(hist.luma, hist.total, 0.005);
  const hi = percentile(hist.luma, hist.total, 0.995);
  if (lo > 0.02) levels.black = Number(clamp(lo, 0, 0.12).toFixed(3));
  if (hi < 0.98) levels.white = Number(clamp(hi, 0.88, 1).toFixed(3));
  const median = percentile(hist.luma, hist.total, 0.5);
  const m = clamp((median - levels.black) / (levels.white - levels.black), 0.02, 0.98);
  // Mid-tones: only fix a clearly dark or bright median (move it into 0.38…0.6).
  const target = clamp(m, 0.38, 0.6);
  levels.mid = Number(clamp(-Math.log2(Math.log(target) / Math.log(m)), -0.4, 0.4).toFixed(3)) || 0;

  // Gray-world white balance on mid-tones (linear light), corrected ~60%.
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  let chroma = 0;
  let dark = 0;
  let bright = 0;
  let lumaSum = 0;
  let lumaSq = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const pr = data[i]! / 255;
    const pg = data[i + 1]! / 255;
    const pb = data[i + 2]! / 255;
    const l = pr * 0.2126 + pg * 0.7152 + pb * 0.0722;
    lumaSum += l;
    lumaSq += l * l;
    chroma += Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
    if (l < 0.12) dark++;
    if (l > 0.95) bright++;
    if (l < 0.15 || l > 0.9) continue;
    r += toLinear(pr);
    g += toLinear(pg);
    b += toLinear(pb);
    count++;
  }
  if (count > 0) {
    finetune.temperature = Number(clamp(((4 * (b - r)) / (b + r)) * 0.6, -0.5, 0.5).toFixed(3));
    finetune.tint = Number(clamp(4 * (1 - (r + b) / (2 * g)) * 0.6, -0.4, 0.4).toFixed(3));
  }

  const n = hist.total;
  const meanChroma = chroma / n;
  finetune.vibrance = meanChroma < 0.12 ? 0.25 : meanChroma < 0.2 ? 0.15 : 0.05;
  const mean = lumaSum / n;
  const std = Math.sqrt(Math.max(0, lumaSq / n - mean * mean));
  if (std < 0.18) finetune.contrast = 0.1;
  if (dark / n > 0.2) finetune.shadows = 0.2;
  if (bright / n > 0.1) finetune.highlights = -0.2;
  return { finetune, levels };
}

/**
 * The photo alone, for analysis: geometry (crop, rotation…) applied; no elements, frame, fill,
 * watermark or added canvas; a rectangular crop. `colour: true` keeps the colour edits (finetune,
 * levels, curves, filter) — the "after" histogram; otherwise they're reset — "before".
 */
export function analysisState(state: EditState, { colour = false } = {}): EditState {
  return {
    ...state,
    ...(colour
      ? {}
      : {
          finetune: createFinetuneState(),
          levels: createLevelsState(),
          curves: createCurvesState(),
          filter: null,
        }),
    annotations: [],
    frame: null,
    background: null,
    watermark: null,
    canvas: null,
    resize: null,
    geometry: { ...state.geometry, cropShape: 'rect' },
  };
}

/**
 * Renders a small copy of the image with only its geometry (crop, rotation…) applied — no colour
 * edits — for analysis (Auto-enhance). Browser only.
 */
export async function renderAnalysisPixels(
  image: LoadedImage,
  state: EditState,
  maxSide = 256,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const rendered = await renderToCanvas(image, analysisState(state), {
    maxWidth: maxSide,
    maxHeight: maxSide,
  });
  const ctx = rendered.canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const pixels = ctx.getImageData(0, 0, rendered.width, rendered.height);
  return { data: pixels.data, width: rendered.width, height: rendered.height };
}

/** Auto-enhance for the current image and geometry. */
export async function autoEnhance(
  image: LoadedImage,
  state: EditState,
): Promise<AutoEnhanceResult> {
  const { data } = await renderAnalysisPixels(image, state);
  return computeAutoEnhance(data);
}
