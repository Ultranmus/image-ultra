import {
  compose,
  getOutputToSource,
  mat3Compose,
  mat3FromAffine,
  mat3ToGL,
  scale,
  type Affine,
} from '../state/geometry';
import { LUT_SIZE } from '../state/curves';
import type { LoadedImage, Size } from '../types';
import { compileColor, detailSigmas, grainCell, type ColorProgram } from './color';
import { cssColorToRgb, type AnyCanvas, type Renderer, type RenderParams } from './renderer';
import { BLUR_SHADER, FINISH_SHADER, MAIN_SHADER, VERTEX_SHADER } from './shaders';

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface GpuResources {
  main: Program;
  blur: Program;
  finish: Program;
  image: WebGLTexture | null;
  /** Which bitmap `image` currently holds. */
  imageSource: ImageBitmap | null;
  lut: WebGLTexture;
  targets: Map<string, Target>;
}

type DetailKind = 'sharpen' | 'clarity' | 'blur';

/** GPU renderer. Create with `WebGLRenderer.create()`, which returns `null` without WebGL2. */
export class WebGLRenderer implements Renderer {
  readonly kind = 'webgl2' as const;
  readonly maxOutputSize: number;
  private gpu: GpuResources | null;
  /** Image → bitmap to upload (a downscaled copy when the image exceeds the texture limit). */
  private uploads = new WeakMap<ImageBitmap, ImageBitmap>();
  private ownedBitmaps: ImageBitmap[] = [];
  private readonly maxTextureSize: number;

  private constructor(
    private readonly canvas: AnyCanvas,
    private readonly gl: WebGL2RenderingContext,
    private readonly ownsCanvas: boolean,
  ) {
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxOutputSize = Math.min(
      viewport[0] ?? 4096,
      viewport[1] ?? 4096,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    );
    this.gpu = this.createResources();
    canvas.addEventListener('webglcontextlost', this.onContextLost as EventListener);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  static create(
    canvas: AnyCanvas,
    options: {
      preserveDrawingBuffer?: boolean;
      ownsCanvas?: boolean;
      premultipliedAlpha?: boolean;
    } = {},
  ): WebGLRenderer | null {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: options.premultipliedAlpha ?? false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    try {
      return new WebGLRenderer(canvas, gl, options.ownsCanvas ?? false);
    } catch {
      return null;
    }
  }

  /** Whether the canvas composites premultiplied colour (on-screen previews). */
  private get premultiplied(): boolean {
    return this.gl.getContextAttributes()?.premultipliedAlpha === true;
  }

  isReady(image: LoadedImage): boolean {
    return this.uploads.has(image.bitmap);
  }

  async prepare(image: LoadedImage): Promise<void> {
    if (this.uploads.has(image.bitmap)) return;
    const { width, height } = image;
    const limit = this.maxTextureSize;
    if (width <= limit && height <= limit) {
      this.uploads.set(image.bitmap, image.bitmap);
      return;
    }
    // Too big for one texture: use a downscaled copy (tiling arrives in Phase 7).
    const ratio = limit / Math.max(width, height);
    const scaled = await createImageBitmap(image.bitmap, {
      resizeWidth: Math.floor(width * ratio),
      resizeHeight: Math.floor(height * ratio),
      resizeQuality: 'high',
    });
    this.ownedBitmaps.push(scaled);
    this.uploads.set(image.bitmap, scaled);
  }

  render(params: RenderParams): void {
    const { gl } = this;
    const gpu = this.gpu;
    const upload = this.uploads.get(params.image.bitmap);
    if (!gpu || !upload || gl.isContextLost()) return;

    const { canvasSize, outputSize, image, state } = params;
    if (this.canvas.width !== canvasSize.width) this.canvas.width = canvasSize.width;
    if (this.canvas.height !== canvasSize.height) this.canvas.height = canvasSize.height;

    const color = compileColor(state);
    this.bindImage(gpu, upload, params.smooth);
    this.uploadLUT(gpu, color);

    // gl_FragCoord has y pointing up; our canvas space has y pointing down.
    const fragToCanvas: Affine = [1, 0, 0, -1, 0, canvasSize.height];
    const fragToOutput = compose(params.canvasToOutput, fragToCanvas);
    const c2o = params.canvasToOutput;
    const outputPerCanvasPx = Math.sqrt(Math.abs(c2o[0] * c2o[3] - c2o[1] * c2o[2]));

    const setShared = (p: Program) => {
      this.setMat3(p, 'u_fragToOutput', mat3ToGL(mat3FromAffine(fragToOutput)));
      gl.uniform2f(this.loc(p, 'u_outputSize'), outputSize.width, outputSize.height);
      gl.uniform1f(this.loc(p, 'u_vignette'), state.finetune.vignette);
      gl.uniform1f(this.loc(p, 'u_grain'), state.finetune.grain);
      gl.uniform1f(this.loc(p, 'u_grainCell'), grainCell(outputSize));
      gl.uniform1i(this.loc(p, 'u_ellipse'), state.geometry.cropShape === 'ellipse' ? 1 : 0);
      gl.uniform1f(
        this.loc(p, 'u_ellipseAA'),
        (2 * outputPerCanvasPx) / Math.max(1, Math.min(outputSize.width, outputSize.height)),
      );
      const checker = params.checker;
      gl.uniform1i(this.loc(p, 'u_checker'), checker ? 1 : 0);
      gl.uniform1i(this.loc(p, 'u_premultiply'), this.premultiplied ? 1 : 0);
      if (checker) {
        gl.uniform3fv(this.loc(p, 'u_checkerA'), cssColorToRgb(checker.a));
        gl.uniform3fv(this.loc(p, 'u_checkerB'), cssColorToRgb(checker.b));
        gl.uniform1f(this.loc(p, 'u_checkerSize'), checker.size);
      }
    };

    // Main pass: geometry + colour (+ finish when there are no detail effects).
    const multi = color.hasDetail;
    const main = gpu.main;
    gl.useProgram(main.program);
    setShared(main);
    gl.uniform1i(this.loc(main, 'u_mode'), multi ? 1 : 0);
    gl.uniform1i(this.loc(main, 'u_image'), 0);
    gl.uniform1i(this.loc(main, 'u_lut'), 1);
    const outputToUV = mat3Compose(
      scale(1 / image.width, 1 / image.height),
      getOutputToSource(image, state, params.outputScale),
    );
    this.setMat3(main, 'u_outputToUV', mat3ToGL(outputToUV));
    this.setColorUniforms(main, color);

    if (!multi) {
      this.drawTo(null, canvasSize);
      return;
    }

    const base = this.target(gpu, 'base', canvasSize.width, canvasSize.height);
    this.drawTo(base, canvasSize);

    // Blurred copies for each detail effect, radius converted from output to canvas pixels.
    const sigmas = detailSigmas(state.finetune, outputSize);
    const blurred: Partial<Record<DetailKind, Target>> = {};
    for (const kind of ['sharpen', 'clarity', 'blur'] as const) {
      const sigma = sigmas[kind] / outputPerCanvasPx;
      if (sigma > 0) blurred[kind] = this.blur(gpu, kind, base, Math.max(0.5, sigma));
    }

    const finish = gpu.finish;
    gl.useProgram(finish.program);
    setShared(finish);
    gl.uniform2f(this.loc(finish, 'u_canvasSize'), canvasSize.width, canvasSize.height);
    gl.uniform1f(this.loc(finish, 'u_sharpen'), state.finetune.sharpen);
    gl.uniform1f(this.loc(finish, 'u_clarity'), state.finetune.clarity);
    const units: [string, string, DetailKind | 'base', number][] = [
      ['u_base', '', 'base', 2],
      ['u_sharpenTex', 'u_hasSharpen', 'sharpen', 3],
      ['u_clarityTex', 'u_hasClarity', 'clarity', 4],
      ['u_blurTex', 'u_hasBlur', 'blur', 5],
    ];
    for (const [sampler, flag, kind, unit] of units) {
      const t = kind === 'base' ? base : blurred[kind];
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t?.texture ?? base.texture);
      gl.uniform1i(this.loc(finish, sampler), unit);
      if (flag) gl.uniform1i(this.loc(finish, flag), t ? 1 : 0);
    }
    this.drawTo(null, canvasSize);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    const { gl, gpu } = this;
    if (gpu && !gl.isContextLost()) {
      gl.deleteTexture(gpu.image);
      gl.deleteTexture(gpu.lut);
      for (const t of gpu.targets.values()) {
        gl.deleteFramebuffer(t.framebuffer);
        gl.deleteTexture(t.texture);
      }
      for (const p of [gpu.main, gpu.blur, gpu.finish]) gl.deleteProgram(p.program);
    }
    this.gpu = null;
    for (const bitmap of this.ownedBitmaps) bitmap.close();
    this.ownedBitmaps = [];
    if (this.ownsCanvas) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /* ── Passes ────────────────────────────────────────────────────────── */

  private drawTo(target: Target | null, canvas: Size): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0, 0, target?.width ?? canvas.width, target?.height ?? canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Two-pass Gaussian of `source` (premultiplied), downsampled for large radii. */
  private blur(gpu: GpuResources, kind: DetailKind, source: Target, sigma: number): Target {
    const { gl } = this;
    const down = Math.min(4, Math.max(1, Math.floor(sigma / 3)));
    const w = Math.max(1, Math.ceil(source.width / down));
    const h = Math.max(1, Math.ceil(source.height / down));
    const tmp = this.target(gpu, `${kind}-tmp`, w, h);
    const out = this.target(gpu, kind, w, h);
    const step = Math.max(1, (sigma * 3) / 24);
    const taps = Math.min(32, Math.ceil((sigma * 3) / step));
    const p = gpu.blur;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE6);
    gl.uniform1i(this.loc(p, 'u_source'), 6);
    gl.uniform1i(this.loc(p, 'u_taps'), taps);

    // Horizontal: full-size source → downsampled tmp (distances in source texels).
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform2f(this.loc(p, 'u_sourceSize'), source.width, source.height);
    gl.uniform2f(this.loc(p, 'u_targetSize'), w, h);
    gl.uniform2f(this.loc(p, 'u_dir'), 1, 0);
    gl.uniform1f(this.loc(p, 'u_sigma'), sigma);
    gl.uniform1f(this.loc(p, 'u_step'), step);
    this.drawTo(tmp, { width: w, height: h });

    // Vertical: tmp → out (same size; distances now in downsampled texels).
    gl.bindTexture(gl.TEXTURE_2D, tmp.texture);
    gl.uniform2f(this.loc(p, 'u_sourceSize'), w, h);
    gl.uniform2f(this.loc(p, 'u_dir'), 0, 1);
    gl.uniform1f(this.loc(p, 'u_sigma'), sigma / down);
    gl.uniform1f(this.loc(p, 'u_step'), step / down);
    this.drawTo(out, { width: w, height: h });
    return out;
  }

  /* ── Resources ─────────────────────────────────────────────────────── */

  private setColorUniforms(p: Program, color: ColorProgram): void {
    const { gl } = this;
    const f = color.finetune;
    gl.uniform1i(this.loc(p, 'u_filter'), color.filter ? 1 : 0);
    if (color.filter) {
      const m = color.filter.matrix;
      // Row-major 3×4 → column-major mat3 + offset.
      this.setMat3(
        p,
        'u_filterMatrix',
        new Float32Array([m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!]),
      );
      gl.uniform3f(this.loc(p, 'u_filterOffset'), m[3]!, m[7]!, m[11]!);
      gl.uniform1f(this.loc(p, 'u_filterIntensity'), color.filter.intensity);
      gl.uniform1i(this.loc(p, 'u_filterLUT'), color.filter.lut ? 1 : 0);
    }
    gl.uniform1i(this.loc(p, 'u_toneLUT'), color.toneLUT ? 1 : 0);
    gl.uniform1i(this.loc(p, 'u_adjust'), color.hasAdjust ? 1 : 0);
    gl.uniform1f(this.loc(p, 'u_exposure'), f.exposure);
    gl.uniform1f(this.loc(p, 'u_temperature'), f.temperature);
    gl.uniform1f(this.loc(p, 'u_tint'), f.tint);
    gl.uniform1f(this.loc(p, 'u_brightness'), f.brightness);
    gl.uniform1f(this.loc(p, 'u_contrast'), f.contrast);
    gl.uniform1f(this.loc(p, 'u_gamma'), f.gamma);
    gl.uniform1f(this.loc(p, 'u_highlights'), f.highlights);
    gl.uniform1f(this.loc(p, 'u_shadows'), f.shadows);
    gl.uniform1f(this.loc(p, 'u_saturation'), f.saturation);
    gl.uniform1f(this.loc(p, 'u_vibrance'), f.vibrance);
    gl.uniform1i(this.loc(p, 'u_hue'), color.hueMatrix ? 1 : 0);
    if (color.hueMatrix) {
      const h = color.hueMatrix;
      this.setMat3(
        p,
        'u_hueMatrix',
        new Float32Array([h[0]!, h[3]!, h[6]!, h[1]!, h[4]!, h[7]!, h[2]!, h[5]!, h[8]!]),
      );
    }
  }

  private uploadLUT(gpu: GpuResources, color: ColorProgram): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gpu.lut);
    if (!color.toneLUT && !color.filter?.lut) return;
    const data = new Uint8Array(LUT_SIZE * 2 * 4);
    if (color.toneLUT) data.set(color.toneLUT, 0);
    if (color.filter?.lut) data.set(color.filter.lut, LUT_SIZE * 4);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LUT_SIZE, 2, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  private bindImage(gpu: GpuResources, source: ImageBitmap, smooth: boolean): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0);
    if (gpu.imageSource !== source || !gpu.image) {
      gl.deleteTexture(gpu.image);
      gpu.image = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, gpu.image);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gpu.imageSource = source;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, gpu.image);
    }
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      smooth ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, smooth ? gl.LINEAR : gl.NEAREST);
  }

  /** A render target of exactly `width`×`height`, (re)allocated on demand. */
  private target(gpu: GpuResources, name: string, width: number, height: number): Target {
    const { gl } = this;
    const existing = gpu.targets.get(name);
    if (existing && existing.width === width && existing.height === height) return existing;
    if (existing) {
      gl.deleteFramebuffer(existing.framebuffer);
      gl.deleteTexture(existing.texture);
    }
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const target = { texture, framebuffer, width, height };
    gpu.targets.set(name, target);
    return target;
  }

  private createResources(): GpuResources {
    const { gl } = this;
    const lut = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_SIZE, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return {
      main: this.createProgram(MAIN_SHADER),
      blur: this.createProgram(BLUR_SHADER),
      finish: this.createProgram(FINISH_SHADER),
      image: null,
      imageSource: null,
      lut,
      targets: new Map(),
    };
  }

  private createProgram(fragment: string): Program {
    const { gl } = this;
    const program = gl.createProgram();
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`image-ultra: WebGL program failed to link. ${log ?? ''}`);
    }
    return { program, uniforms: new Map() };
  }

  private loc(p: Program, name: string): WebGLUniformLocation | null {
    if (!p.uniforms.has(name)) p.uniforms.set(name, this.gl.getUniformLocation(p.program, name));
    return p.uniforms.get(name) ?? null;
  }

  private setMat3(p: Program, name: string, value: Float32Array): void {
    this.gl.uniformMatrix3fv(this.loc(p, name), false, value);
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault(); // allows the browser to restore the context
    this.gpu = null;
  };

  private onContextRestored = (): void => {
    this.gpu = this.createResources();
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('image-ultra: could not create shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`image-ultra: shader failed to compile. ${log ?? ''}`);
  }
  return shader;
}
