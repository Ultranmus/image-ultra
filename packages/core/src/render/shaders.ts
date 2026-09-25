/*
 * GLSL for the WebGL2 renderer. Everything MUST mirror `color.ts` (the Canvas2D fallback and the
 * unit-tested reference). Passes:
 *   single pass  (no detail effects): MAIN with u_mode = 0 → geometry + colour + finish + checker
 *   multi pass   (clarity/sharpen/blur): MAIN u_mode = 1 → premultiplied colour into a texture,
 *                BLUR (×2 per radius), then FINISH → detail + finish + checker
 */

/** Full-screen triangle; no vertex buffers needed. */
export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const COMMON = /* glsl */ `
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

uniform mat3 u_fragToOutput;   // gl_FragCoord → output px
uniform vec2 u_outputSize;

// Finish
uniform float u_vignette;
uniform float u_grain;
uniform float u_grainCell;
uniform bool u_ellipse;
uniform float u_ellipseAA;
uniform bool u_checker;
uniform vec3 u_checkerA;
uniform vec3 u_checkerB;
uniform float u_checkerSize;
// The canvas expects premultiplied colour (on-screen previews): transparent pixels must be black.
uniform bool u_premultiply;

out vec4 outColor;

uint hashU(ivec2 p) {
  uint h = (uint(p.x) * 0x27d4eb2du) ^ (uint(p.y) * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12u)) * 0x297a2d39u;
  h ^= h >> 15u;
  return h;
}

float hash2(vec2 p) {
  return float(hashU(ivec2(floor(p)))) / 4294967296.0;
}

// Vignette, grain and round mask. Returns the colour and writes the alpha multiplier to 'mask'.
vec3 finishPixel(vec3 c, vec2 o, out float mask) {
  vec2 uv = o / u_outputSize;
  if (u_vignette != 0.0) {
    float d = length(uv - 0.5) * 1.41421356;
    c *= 1.0 - u_vignette * smoothstep(0.3, 1.0, d);
  }
  if (u_grain != 0.0) {
    float n = (hash2(o / u_grainCell) - 0.5) * u_grain * 0.25;
    c += n;
  }
  mask = 1.0;
  if (u_ellipse) {
    float d = length((uv - 0.5) * 2.0);
    mask = 1.0 - smoothstep(1.0 - u_ellipseAA, 1.0 + u_ellipseAA, d);
  }
  return clamp(c, 0.0, 1.0);
}

void writeFinal(vec3 c, float alpha) {
  if (u_checker) {
    vec2 cell = floor(gl_FragCoord.xy / u_checkerSize);
    vec3 bg = mod(cell.x + cell.y, 2.0) < 1.0 ? u_checkerA : u_checkerB;
    outColor = vec4(mix(bg, c, alpha), 1.0);
  } else {
    outColor = u_premultiply ? vec4(c * alpha, alpha) : vec4(c, alpha);
  }
}
`;

/** Geometry + per-pixel colour. `u_mode`: 0 = complete, 1 = premultiplied colour only. */
export const MAIN_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${COMMON}
uniform int u_mode;
uniform sampler2D u_image;
uniform sampler2D u_lut;         // 256×2: row 0 = levels + curves, row 1 = filter curves
uniform mat3 u_outputToUV;       // output px → source UV (projective: divide by z)

uniform bool u_filter;
uniform mat3 u_filterMatrix;
uniform vec3 u_filterOffset;
uniform bool u_filterLUT;
uniform float u_filterIntensity;
uniform bool u_toneLUT;

uniform bool u_adjust;
uniform float u_exposure;
uniform float u_temperature;
uniform float u_tint;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_gamma;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_saturation;
uniform float u_vibrance;
uniform bool u_hue;
uniform mat3 u_hueMatrix;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec3 lut3(vec3 c, float row) {
  float r = texture(u_lut, vec2((clamp(c.r, 0.0, 1.0) * 255.0 + 0.5) / 256.0, row)).r;
  float g = texture(u_lut, vec2((clamp(c.g, 0.0, 1.0) * 255.0 + 0.5) / 256.0, row)).g;
  float b = texture(u_lut, vec2((clamp(c.b, 0.0, 1.0) * 255.0 + 0.5) / 256.0, row)).b;
  return vec3(r, g, b);
}

vec3 colorPixel(vec3 c) {
  // 1. Filter look, blended by intensity.
  if (u_filter) {
    vec3 f = clamp(u_filterMatrix * c + u_filterOffset, 0.0, 1.0);
    if (u_filterLUT) f = lut3(f, 0.75);
    c += (f - c) * u_filterIntensity;
  }
  if (!u_adjust) return u_toneLUT ? lut3(c, 0.25) : c;

  // 2. Linear light: exposure (±2 stops) and white balance.
  float exposure = exp2(u_exposure * 2.0);
  vec3 wb = vec3(1.0 + 0.25 * u_temperature, 1.0 - 0.25 * u_tint, 1.0 - 0.25 * u_temperature);
  c = clamp(linearToSrgb(srgbToLinear(c) * exposure * wb), 0.0, 1.0);

  // 3. Tone.
  c += u_brightness * 0.35;
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;
  c = pow(clamp(c, 0.0, 1.0), vec3(exp2(-u_gamma)));
  if (u_highlights != 0.0 || u_shadows != 0.0) {
    float l = dot(c, LUMA);
    float d = u_shadows * 0.35 * (1.0 - smoothstep(0.0, 0.5, l)) + u_highlights * 0.35 * smoothstep(0.5, 1.0, l);
    c = clamp(c + d, 0.0, 1.0);
  }

  // 4. Colour.
  float l = dot(c, LUMA);
  c = l + (c - l) * (1.0 + u_saturation);
  if (u_vibrance != 0.0) {
    c = clamp(c, 0.0, 1.0);
    l = dot(c, LUMA);
    float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = l + (c - l) * (1.0 + u_vibrance * (1.0 - chroma));
  }
  if (u_hue) c = u_hueMatrix * c;
  c = clamp(c, 0.0, 1.0);

  // 5. Levels + curves.
  if (u_toneLUT) c = lut3(c, 0.25);
  return c;
}

void main() {
  vec2 o = (u_fragToOutput * vec3(gl_FragCoord.xy, 1.0)).xy;
  if (any(lessThan(o, vec2(0.0))) || any(greaterThan(o, u_outputSize))) {
    outColor = vec4(0.0);
    return;
  }
  vec3 p = u_outputToUV * vec3(o, 1.0);
  vec2 uv = p.xy / p.z;
  // Outside the image: fully transparent, no checkerboard (the stage shows through).
  if (p.z <= 0.0 || any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = vec4(0.0);
    return;
  }
  vec4 texel = texture(u_image, uv);
  vec3 c = texel.a > 0.0 ? colorPixel(texel.rgb) : texel.rgb;

  if (u_mode == 1) {
    outColor = vec4(c * texel.a, texel.a); // premultiplied, for the blur passes
    return;
  }
  float mask;
  c = finishPixel(c, o, mask);
  writeFinal(c, texel.a * mask);
}
`;

/**
 * Separable Gaussian on a premultiplied texture. Taps are spaced `u_step` source texels apart
 * along `u_dir`; linear filtering blends between them.
 */
export const BLUR_SHADER = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_sourceSize;  // texels
uniform vec2 u_targetSize;  // texels (smaller than the source when downsampling)
uniform vec2 u_dir;         // (1, 0) or (0, 1)
uniform float u_sigma;      // in source texels
uniform float u_step;       // tap spacing in source texels
uniform int u_taps;         // taps on each side
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_targetSize;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -32; i <= 32; i++) {
    if (i < -u_taps || i > u_taps) continue;
    float x = float(i) * u_step;
    float w = exp(-0.5 * x * x / (u_sigma * u_sigma));
    sum += texture(u_source, uv + u_dir * x / u_sourceSize) * w;
    total += w;
  }
  outColor = sum / total;
}
`;

/** Detail (sharpen / clarity / blur) + finish + checker, from the premultiplied colour texture. */
export const FINISH_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${COMMON}
uniform sampler2D u_base;
uniform sampler2D u_sharpenTex;
uniform sampler2D u_clarityTex;
uniform sampler2D u_blurTex;
uniform bool u_hasSharpen;
uniform bool u_hasClarity;
uniform bool u_hasBlur;
uniform vec2 u_canvasSize;
uniform float u_sharpen;
uniform float u_clarity;

vec3 unpremultiply(vec4 c) {
  return c.a > 0.0 ? clamp(c.rgb / c.a, 0.0, 1.0) : vec3(0.0);
}

void main() {
  vec2 o = (u_fragToOutput * vec3(gl_FragCoord.xy, 1.0)).xy;
  if (any(lessThan(o, vec2(0.0))) || any(greaterThan(o, u_outputSize))) {
    outColor = vec4(0.0);
    return;
  }
  vec2 uv = gl_FragCoord.xy / u_canvasSize;
  vec4 base = texelFetch(u_base, ivec2(gl_FragCoord.xy), 0);
  vec3 c = unpremultiply(base);
  float alpha = base.a;

  if (u_hasBlur) {
    vec4 b = texture(u_blurTex, uv);
    c = unpremultiply(b);
    alpha = b.a;
  } else {
    if (u_hasSharpen) {
      vec3 s = unpremultiply(texture(u_sharpenTex, uv));
      c += (c - s) * (u_sharpen * 1.5);
    }
    if (u_hasClarity) {
      vec3 s = unpremultiply(texture(u_clarityTex, uv));
      float l = dot(clamp(c, 0.0, 1.0), LUMA);
      c += (c - s) * (u_clarity * 1.2 * 4.0 * l * (1.0 - l));
    }
    c = clamp(c, 0.0, 1.0);
  }
  if (alpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  float mask;
  c = finishPixel(c, o, mask);
  writeFinal(c, alpha * mask);
}
`;
