// Fragment shader - Gaussian blur with film grain
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 vTexCoord;

uniform sampler2D tex0;
uniform vec2 texelSize; // Size of one pixel (1/width, 1/height)
uniform float blurAmount; // Blur strength multiplier
uniform float grainAmount; // Grain intensity (0.0 - 1.0)
uniform float time; // Time for animating grain

// High quality noise function
float random(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Film grain function
float grain(vec2 uv, float t) {
  // Animate grain by adding time to UV coordinates
  // This creates evolving grain patterns over time
  return random(uv + vec2(t * 0.1, t * 0.13));
}

void main() {
  // Gaussian blur weights (inline, compatible with GLSL ES 1.00)
  vec4 color = texture2D(tex0, vTexCoord) * 0.227027;

  // Horizontal and vertical blur in one pass
  // Sample 1
  float offset = 1.0 * blurAmount;
  color += texture2D(tex0, vTexCoord + vec2(texelSize.x * offset, 0.0)) * 0.1945946;
  color += texture2D(tex0, vTexCoord - vec2(texelSize.x * offset, 0.0)) * 0.1945946;
  color += texture2D(tex0, vTexCoord + vec2(0.0, texelSize.y * offset)) * 0.1945946;
  color += texture2D(tex0, vTexCoord - vec2(0.0, texelSize.y * offset)) * 0.1945946;

  // Sample 2
  offset = 2.0 * blurAmount;
  color += texture2D(tex0, vTexCoord + vec2(texelSize.x * offset, 0.0)) * 0.1216216;
  color += texture2D(tex0, vTexCoord - vec2(texelSize.x * offset, 0.0)) * 0.1216216;
  color += texture2D(tex0, vTexCoord + vec2(0.0, texelSize.y * offset)) * 0.1216216;
  color += texture2D(tex0, vTexCoord - vec2(0.0, texelSize.y * offset)) * 0.1216216;

  // Sample 3
  offset = 3.0 * blurAmount;
  color += texture2D(tex0, vTexCoord + vec2(texelSize.x * offset, 0.0)) * 0.054054;
  color += texture2D(tex0, vTexCoord - vec2(texelSize.x * offset, 0.0)) * 0.054054;
  color += texture2D(tex0, vTexCoord + vec2(0.0, texelSize.y * offset)) * 0.054054;
  color += texture2D(tex0, vTexCoord - vec2(0.0, texelSize.y * offset)) * 0.054054;

  // Sample 4
  offset = 4.0 * blurAmount;
  color += texture2D(tex0, vTexCoord + vec2(texelSize.x * offset, 0.0)) * 0.016216;
  color += texture2D(tex0, vTexCoord - vec2(texelSize.x * offset, 0.0)) * 0.016216;
  color += texture2D(tex0, vTexCoord + vec2(0.0, texelSize.y * offset)) * 0.016216;
  color += texture2D(tex0, vTexCoord - vec2(0.0, texelSize.y * offset)) * 0.016216;

  // Normalize — weights were 1D coefficients applied in both axes, sum ~1.773
  color /= 1.773;

  // Add film grain
  float grainValue = grain(vTexCoord * 2.0, time);
  // Map grain from 0-1 to -0.5 to 0.5 for balanced noise
  grainValue = (grainValue - 0.5) * grainAmount;

  // Apply grain to all color channels
  color.rgb += vec3(grainValue);

  gl_FragColor = color;
}
