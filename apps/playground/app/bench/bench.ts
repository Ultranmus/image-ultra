/**
 * Performance benchmark (Phase 7.7a) — playground only, not part of the package.
 * Measures load → first paint, frame times while "dragging" a control, export time and memory
 * on generated 12 / 24 / 48MP photos. Driven by `/bench` (button) and `pnpm bench` (Playwright).
 */
import type { EditRecipe, ExportMimeType, ImageEditorHandle } from '@image-ultra/react';

export const PHOTO_SIZES = {
  '12MP': { width: 4240, height: 2832 },
  '24MP': { width: 6000, height: 4000 },
  '48MP': { width: 8000, height: 6000 },
} as const;
export type PhotoSize = keyof typeof PHOTO_SIZES;

export interface DragResult {
  scenario: string;
  frames: number;
  /** Time between frames, ms. */
  median: number;
  p95: number;
  fps: number;
}

export interface ExportTiming {
  mimeType: ExportMimeType;
  ms: number;
  megabytes: number;
}

export interface BenchResult {
  size: PhotoSize;
  width: number;
  height: number;
  /** `webgl2` / `canvas2d` — the preview renderer the browser gave us. */
  renderer: string;
  /** GPU name (WEBGL_debug_renderer_info), or "none". */
  gpu: string;
  /** Photo made and encoded by the benchmark itself (not measured). */
  fileMegabytes: number;
  /** `load()` resolved: decoded + EXIF read. */
  decodeMs: number;
  /** Two frames after ready: first frame drawn incl. the texture upload. */
  firstPaintMs: number;
  drags: DragResult[];
  exports: ExportTiming[];
  /** Chrome only (`performance.memory`); after load, after drags + exports. */
  heapMegabytes: { afterLoad: number | null; afterAll: number | null };
  /** The decoded photo: width × height × 4 bytes (the preview keeps a smaller copy on the GPU). */
  photoMegabytes: number;
}

const MB = 1024 * 1024;
const DRAG_FRAMES = 90;

/** A photo-like test image: gradients, shapes and fine noise (so JPEG can't cheat). */
export async function makePhoto(size: PhotoSize): Promise<Blob> {
  const { width, height } = PHOTO_SIZES[size];
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#2b5c8a');
  sky.addColorStop(0.55, '#e8b27a');
  sky.addColorStop(1, '#3d2a1e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  // Deterministic "random" so every run draws the same photo.
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `hsla(${Math.floor(random() * 360)}, 60%, ${30 + random() * 50}%, 0.5)`;
    ctx.beginPath();
    ctx.arc(random() * width, random() * height, (random() * width) / 20, 0, Math.PI * 2);
    ctx.fill();
  }
  const tile = new OffscreenCanvas(256, 256);
  const tctx = tile.getContext('2d')!;
  const noise = tctx.createImageData(256, 256);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = Math.floor(random() * 255);
    noise.data[i] = v;
    noise.data[i + 1] = v;
    noise.data[i + 2] = v;
    noise.data[i + 3] = 40;
  }
  tctx.putImageData(noise, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  // Free its pixels now: iPhones count canvas memory until garbage collection (~384 MB per page).
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

function heap(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  return memory ? round(memory.usedJSHeapSize / MB) : null;
}

function gpuName(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'none';
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return String(name);
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

interface Scenario {
  name: string;
  tool: string;
  /** Run before the frames, e.g. switch the Finetune mode. */
  setup?: (editor: ImageEditorHandle) => Promise<void> | void;
  /** Value for frame `i` (0 … DRAG_FRAMES−1); `null` = drive the viewport instead. */
  recipe: ((t: number, editor: ImageEditorHandle) => EditRecipe) | null;
  viewport?: (t: number, editor: ImageEditorHandle) => void;
}

/** 0 → 1 → 0 over the drag, like moving a slider back and forth. */
const wave = (i: number) => Math.sin((i / DRAG_FRAMES) * Math.PI);

async function clickMode(label: string) {
  const radio = [...document.querySelectorAll<HTMLElement>('.iu-root [role="radio"]')].find(
    (el) => el.textContent?.trim() === label,
  );
  radio?.click();
  await nextFrame();
  await nextFrame();
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Exposure',
    tool: 'finetune',
    recipe: (t) => (s) => {
      s.finetune.exposure = t * 0.8;
    },
  },
  {
    name: 'Sharpen',
    tool: 'finetune',
    recipe: (t) => (s) => {
      s.finetune.sharpen = t;
    },
  },
  {
    name: 'Curves (histogram on)',
    tool: 'finetune',
    setup: () => clickMode('Curves'),
    recipe: (t) => (s) => {
      s.curves.rgb = [
        [0, 0],
        [0.5, 0.5 + t * 0.2],
        [1, 1],
      ];
    },
  },
  {
    name: 'Straighten',
    tool: 'adjust',
    recipe: (t) => (s) => {
      s.geometry.straighten = t * 20;
    },
  },
  {
    name: 'Crop move',
    tool: 'adjust',
    recipe: (t, editor) => (s) => {
      const image = editor.store.getState().image!;
      const w = image.width * 0.6;
      const h = image.height * 0.6;
      s.geometry.crop = {
        x: t * (image.width - w),
        y: t * (image.height - h),
        width: w,
        height: h,
      };
    },
  },
  {
    name: 'Zoom 25% ↔ 200%',
    tool: 'finetune',
    recipe: null,
    viewport: (t, editor) => editor.store.getState().zoomTo(0.25 + t * 1.75),
  },
];

async function drag(editor: ImageEditorHandle, scenario: Scenario): Promise<DragResult> {
  const store = editor.store;
  store.getState().setActiveTool(scenario.tool);
  await nextFrame();
  await scenario.setup?.(editor);
  const times: number[] = [];
  if (scenario.recipe) store.getState().beginChange(scenario.name);
  for (let i = 0; i < DRAG_FRAMES; i++) {
    const t = wave(i);
    if (scenario.recipe) store.getState().update(scenario.name, scenario.recipe(t, editor));
    else scenario.viewport?.(t, editor);
    times.push(await nextFrame());
  }
  if (scenario.recipe) store.getState().cancelChange();
  else store.getState().fit();
  await nextFrame();
  const deltas = times
    .slice(1)
    .map((time, i) => time - times[i]!)
    .sort((a, b) => a - b);
  const median = percentile(deltas, 0.5);
  return {
    scenario: scenario.name,
    frames: deltas.length,
    median: round(median),
    p95: round(percentile(deltas, 0.95)),
    fps: round(1000 / median, 0),
  };
}

/** Loads one generated photo into the editor and measures everything. */
export async function runBench(
  editor: ImageEditorHandle,
  size: PhotoSize,
  onStep: (text: string) => void = () => {},
): Promise<BenchResult> {
  const store = editor.store;
  onStep(`${size}: making the test photo…`);
  const blob = await makePhoto(size);
  await nextFrame();

  onStep(`${size}: loading…`);
  const start = performance.now();
  await store.getState().load(blob);
  const decodeMs = performance.now() - start;
  if (store.getState().status !== 'ready') throw new Error(`${size}: load failed`);
  await nextFrame();
  await nextFrame();
  const firstPaintMs = performance.now() - start;
  const image = store.getState().image!;
  const afterLoad = heap();

  const drags: DragResult[] = [];
  for (const scenario of SCENARIOS) {
    onStep(`${size}: ${scenario.name}…`);
    drags.push(await drag(editor, scenario));
  }
  store.getState().setActiveTool('adjust');

  const exports: ExportTiming[] = [];
  for (const mimeType of ['image/jpeg', 'image/webp', 'image/png'] as const) {
    onStep(`${size}: export ${mimeType}…`);
    const t0 = performance.now();
    const result = await editor.exportImage({ mimeType });
    exports.push({
      mimeType,
      ms: Math.round(performance.now() - t0),
      megabytes: round(result.blob.size / MB),
    });
  }

  return {
    size,
    width: image.width,
    height: image.height,
    renderer: previewRenderer(),
    gpu: gpuName(),
    fileMegabytes: round(blob.size / MB),
    decodeMs: Math.round(decodeMs),
    firstPaintMs: Math.round(firstPaintMs),
    drags,
    exports,
    heapMegabytes: { afterLoad, afterAll: heap() },
    photoMegabytes: round((image.width * image.height * 4) / MB),
  };
}

/** Same test as `createRenderer('auto')`: WebGL2 when the browser has it. */
function previewRenderer(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return gl ? 'webgl2' : 'canvas2d';
}

/** Results as a Markdown table (for `docs/internal/PERF.md`). */
export function toMarkdown(results: BenchResult[]): string {
  if (results.length === 0) return '';
  const first = results[0]!;
  const lines = [
    `Renderer: **${first.renderer}** · GPU: ${first.gpu} · ${navigator.userAgent.match(/Chrome\/[\d.]+|Firefox\/[\d.]+|Version\/[\d.]+ Safari/)?.[0] ?? 'browser'}`,
    '',
    `| | ${results.map((r) => `${r.size} (${r.width}×${r.height})`).join(' | ')} |`,
    `|---|${results.map(() => '---').join('|')}|`,
    `| Load (decode) | ${results.map((r) => `${r.decodeMs} ms`).join(' | ')} |`,
    `| First paint | ${results.map((r) => `${r.firstPaintMs} ms`).join(' | ')} |`,
  ];
  for (const [i, d] of first.drags.entries()) {
    lines.push(
      `| Drag: ${d.scenario} | ${results
        .map((r) => {
          const x = r.drags[i]!;
          return `${x.fps} fps (${x.median} / p95 ${x.p95} ms)`;
        })
        .join(' | ')} |`,
    );
  }
  for (const [i, e] of first.exports.entries()) {
    lines.push(
      `| Export ${e.mimeType.replace('image/', '').toUpperCase()} | ${results
        .map((r) => `${r.exports[i]!.ms} ms (${r.exports[i]!.megabytes} MB)`)
        .join(' | ')} |`,
    );
  }
  lines.push(
    `| JS heap after load / all | ${results
      .map((r) => `${r.heapMegabytes.afterLoad ?? '–'} / ${r.heapMegabytes.afterAll ?? '–'} MB`)
      .join(' | ')} |`,
    `| Decoded photo (w × h × 4) | ${results.map((r) => `${r.photoMegabytes} MB`).join(' | ')} |`,
  );
  return lines.join('\n');
}
