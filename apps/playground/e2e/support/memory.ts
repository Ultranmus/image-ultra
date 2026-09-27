import type { Page } from '@playwright/test';

/**
 * Counts live decoded images (`ImageBitmap`) and WebGL textures in the page (Phase 7.7c). The
 * JS heap can't see either, so the page's own functions are wrapped before any script runs.
 * An image counts as freed when `close()` is called or the garbage collector takes it
 * (needs `--js-flags=--expose-gc`); a texture when deleted or its context is lost / collected.
 */
export interface MemoryReport {
  bitmaps: number;
  /** Megapixels held by live bitmaps. */
  bitmapMP: number;
  textures: number;
  /** Megabytes of live texture level-0 data (width × height × 4). */
  textureMB: number;
}

export async function trackMemory(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const liveBitmaps = new Map<number, number>(); // id → pixels
    const bitmapIds = new WeakMap<ImageBitmap, number>();
    let nextId = 0;
    const bitmapGone = new FinalizationRegistry<number>((id) => liveBitmaps.delete(id));
    const track = (bitmap: ImageBitmap) => {
      const id = nextId++;
      bitmapIds.set(bitmap, id);
      liveBitmaps.set(id, bitmap.width * bitmap.height);
      bitmapGone.register(bitmap, id);
      return bitmap;
    };
    const create = window.createImageBitmap.bind(window) as (
      ...args: unknown[]
    ) => Promise<ImageBitmap>;
    (window as unknown as { createImageBitmap: unknown }).createImageBitmap = (
      ...args: unknown[]
    ) => create(...args).then(track);
    const close = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function (this: ImageBitmap) {
      const id = bitmapIds.get(this);
      if (id !== undefined) liveBitmaps.delete(id);
      close.call(this);
    };

    // Textures: size per texture, grouped by context (a lost / collected context frees them all).
    type Gl = WebGL2RenderingContext;
    interface Ctx {
      textures: Map<WebGLTexture, number>;
      bound: Map<number, WebGLTexture | null>;
      unit: number;
    }
    const contexts = new Map<number, Ctx>();
    const ctxIds = new WeakMap<Gl, number>();
    const ctxGone = new FinalizationRegistry<number>((id) => contexts.delete(id));
    const ctxOf = (gl: Gl): Ctx => {
      let id = ctxIds.get(gl);
      if (id === undefined) {
        id = nextId++;
        ctxIds.set(gl, id);
        contexts.set(id, { textures: new Map(), bound: new Map(), unit: 0 });
        // Keyed by the canvas: the context lives as long as its canvas.
        ctxGone.register(gl.canvas, id);
      }
      return contexts.get(id) ?? { textures: new Map(), bound: new Map(), unit: 0 };
    };
    const proto = WebGL2RenderingContext.prototype;
    const wrap = <K extends keyof Gl>(
      name: K,
      after: (gl: Gl, args: never[], result: unknown) => void,
    ) => {
      const original = proto[name] as unknown as (...args: unknown[]) => unknown;
      (proto as unknown as Record<string, unknown>)[name] = function (this: Gl, ...args: never[]) {
        const result = original.apply(this, args);
        after(this, args, result);
        return result;
      };
    };
    wrap('createTexture', (gl, _args, texture) => {
      if (texture) ctxOf(gl).textures.set(texture as WebGLTexture, 0);
    });
    wrap('deleteTexture', (gl, args) => {
      if (args[0]) ctxOf(gl).textures.delete(args[0] as WebGLTexture);
    });
    wrap('activeTexture', (gl, args) => {
      ctxOf(gl).unit = (args[0] as number) - gl.TEXTURE0;
    });
    wrap('bindTexture', (gl, args) => {
      const c = ctxOf(gl);
      c.bound.set(c.unit, (args[1] as WebGLTexture | null) ?? null);
    });
    const onUpload = (gl: Gl, args: unknown[]) => {
      if (args[1] !== 0) return; // level 0 only
      const c = ctxOf(gl);
      const texture = c.bound.get(c.unit);
      if (!texture) return;
      // (target, level, internalformat, format, type, source) or (…, width, height, border, …).
      const source = args[5] as { width?: number; height?: number } | null;
      const size =
        args.length === 6
          ? (source?.width ?? 0) * (source?.height ?? 0)
          : (args[3] as number) * (args[4] as number);
      c.textures.set(texture, size * 4);
    };
    wrap('texImage2D', (gl, args) => onUpload(gl, args));
    wrap('texStorage2D', (gl, args) => {
      const c = ctxOf(gl);
      const texture = c.bound.get(c.unit);
      if (texture) c.textures.set(texture, (args[3] as number) * (args[4] as number) * 4);
    });
    const getExtension = proto.getExtension;
    proto.getExtension = function (this: Gl, name: string) {
      const ext = getExtension.call(this, name) as { loseContext?: () => void } | null;
      if (ext && name === 'WEBGL_lose_context' && ext.loseContext) {
        const lose = ext.loseContext.bind(ext);
        const id = ctxIds.get(this);
        ext.loseContext = () => {
          if (id !== undefined) contexts.delete(id);
          lose();
        };
      }
      return ext;
    } as typeof proto.getExtension;

    (window as unknown as { __memory: () => unknown }).__memory = () => {
      let pixels = 0;
      for (const p of liveBitmaps.values()) pixels += p;
      let textures = 0;
      let bytes = 0;
      for (const c of contexts.values()) {
        textures += c.textures.size;
        for (const b of c.textures.values()) bytes += b;
      }
      return {
        bitmaps: liveBitmaps.size,
        bitmapMP: Math.round(pixels / 1e5) / 10,
        textures,
        textureMB: Math.round(bytes / 1e5) / 10,
      };
    };
  });
}

/** Collects garbage (twice, with frames between) and reads the counters. */
export async function readMemory(page: Page): Promise<MemoryReport> {
  return page.evaluate(async () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    for (let i = 0; i < 2; i++) {
      gc?.();
      await new Promise(requestAnimationFrame);
      await new Promise((r) => setTimeout(r, 50));
    }
    return (window as unknown as { __memory: () => MemoryReport }).__memory();
  });
}
