import { isNeutralFinetune } from '../state/editState';
import {
  compose,
  getOutputToSource,
  mat3Compose,
  mat3FromAffine,
  mat3ToGL,
  scale,
  type Affine,
} from '../state/geometry';
import type { LoadedImage } from '../types';
import { cssColorToRgb, type AnyCanvas, type Renderer, type RenderParams } from './renderer';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

const UNIFORMS = [
  'u_image',
  'u_fragToOutput',
  'u_outputToUV',
  'u_outputSize',
  'u_ellipse',
  'u_adjust',
  'u_exposure',
  'u_temperature',
  'u_tint',
  'u_brightness',
  'u_contrast',
  'u_gamma',
  'u_saturation',
  'u_vignette',
  'u_checker',
  'u_checkerA',
  'u_checkerB',
  'u_checkerSize',
] as const;

type UniformName = (typeof UNIFORMS)[number];

interface GpuResources {
  program: WebGLProgram;
  uniforms: Record<UniformName, WebGLUniformLocation | null>;
  texture: WebGLTexture | null;
  /** Which bitmap the texture currently holds. */
  textureSource: ImageBitmap | null;
}

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
    options: { preserveDrawingBuffer?: boolean; ownsCanvas?: boolean } = {},
  ): WebGLRenderer | null {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
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

    const { canvasSize, outputSize, image, state, checker } = params;
    if (this.canvas.width !== canvasSize.width) this.canvas.width = canvasSize.width;
    if (this.canvas.height !== canvasSize.height) this.canvas.height = canvasSize.height;

    this.bindTexture(gpu, upload, params.smooth);

    gl.viewport(0, 0, canvasSize.width, canvasSize.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(gpu.program);
    const u = gpu.uniforms;

    // gl_FragCoord has y pointing up; our canvas space has y pointing down.
    const fragToCanvas: Affine = [1, 0, 0, -1, 0, canvasSize.height];
    const fragToOutput = compose(params.canvasToOutput, fragToCanvas);
    const outputToUV = mat3Compose(
      scale(1 / image.width, 1 / image.height),
      getOutputToSource(image, state, params.outputScale),
    );
    gl.uniform1i(u.u_image, 0);
    gl.uniformMatrix3fv(u.u_fragToOutput, false, mat3ToGL(mat3FromAffine(fragToOutput)));
    gl.uniformMatrix3fv(u.u_outputToUV, false, mat3ToGL(outputToUV));
    gl.uniform2f(u.u_outputSize, outputSize.width, outputSize.height);
    gl.uniform1i(u.u_ellipse, state.geometry.cropShape === 'ellipse' ? 1 : 0);

    const f = state.finetune;
    gl.uniform1i(u.u_adjust, isNeutralFinetune(f) ? 0 : 1);
    gl.uniform1f(u.u_exposure, f.exposure);
    gl.uniform1f(u.u_temperature, f.temperature);
    gl.uniform1f(u.u_tint, f.tint);
    gl.uniform1f(u.u_brightness, f.brightness);
    gl.uniform1f(u.u_contrast, f.contrast);
    gl.uniform1f(u.u_gamma, f.gamma);
    gl.uniform1f(u.u_saturation, f.saturation);
    gl.uniform1f(u.u_vignette, f.vignette);

    gl.uniform1i(u.u_checker, checker ? 1 : 0);
    if (checker) {
      gl.uniform3fv(u.u_checkerA, cssColorToRgb(checker.a));
      gl.uniform3fv(u.u_checkerB, cssColorToRgb(checker.b));
      gl.uniform1f(u.u_checkerSize, checker.size);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (this.gpu) {
      this.gl.deleteTexture(this.gpu.texture);
      this.gl.deleteProgram(this.gpu.program);
    }
    this.gpu = null;
    for (const bitmap of this.ownedBitmaps) bitmap.close();
    this.ownedBitmaps = [];
    if (this.ownsCanvas) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private bindTexture(gpu: GpuResources, source: ImageBitmap, smooth: boolean): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0);
    if (gpu.textureSource !== source || !gpu.texture) {
      gl.deleteTexture(gpu.texture);
      gpu.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gpu.textureSource = source;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    }
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      smooth ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, smooth ? gl.LINEAR : gl.NEAREST);
  }

  private createResources(): GpuResources {
    const { gl } = this;
    const program = gl.createProgram();
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
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
    const uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;
    return { program, uniforms, texture: null, textureSource: null };
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
