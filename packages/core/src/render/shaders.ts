/** Full-screen triangle; no vertex buffers needed. */
export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * One pass: geometry (via matrices) → finetune → optional checkerboard.
 * `adjust()` MUST mirror `adjustColor()` in `color.ts`.
 */
export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform mat3 u_fragToOutput;   // gl_FragCoord → output px
uniform mat3 u_outputToUV;     // output px → source texture UV (projective: divide by z)
uniform vec2 u_outputSize;
uniform bool u_ellipse;        // round crop

uniform bool u_adjust;
uniform float u_exposure;
uniform float u_temperature;
uniform float u_tint;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_gamma;
uniform float u_saturation;
uniform float u_vignette;

uniform bool u_checker;
uniform vec3 u_checkerA;
uniform vec3 u_checkerB;
uniform float u_checkerSize;

out vec4 outColor;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec3 adjust(vec3 c, vec2 uv) {
  // 1. Linear light: exposure (±2 stops) and white balance.
  float exposure = exp2(u_exposure * 2.0);
  vec3 wb = vec3(1.0 + 0.25 * u_temperature, 1.0 - 0.25 * u_tint, 1.0 - 0.25 * u_temperature);
  c = clamp(linearToSrgb(srgbToLinear(c) * exposure * wb), 0.0, 1.0);

  // 2. sRGB: brightness, contrast, gamma, saturation.
  c += u_brightness * 0.35;
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;
  c = pow(clamp(c, 0.0, 1.0), vec3(exp2(-u_gamma)));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = luma + (c - luma) * (1.0 + u_saturation);

  // 3. Vignette: 0 at the centre, 1 in the corners.
  if (u_vignette != 0.0) {
    float d = length(uv - 0.5) * 1.41421356;
    c *= 1.0 - u_vignette * smoothstep(0.3, 1.0, d);
  }
  return clamp(c, 0.0, 1.0);
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

  float alpha = texel.a;
  if (u_ellipse) {
    float d = length((o / u_outputSize - 0.5) * 2.0);
    float aa = max(fwidth(d), 1e-4);
    alpha *= 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  }

  vec3 c = texel.rgb;
  if (u_adjust && texel.a > 0.0) c = adjust(c, o / u_outputSize);

  if (u_checker) {
    vec2 cell = floor(gl_FragCoord.xy / u_checkerSize);
    vec3 bg = mod(cell.x + cell.y, 2.0) < 1.0 ? u_checkerA : u_checkerB;
    outColor = vec4(mix(bg, c, alpha), 1.0);
  } else {
    outColor = vec4(c, alpha);
  }
}
`;
