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

// Film grain using pixel coordinates + multiply-add-fract hash.
// Avoids sin()-based hashes which produce periodic banding at high intensities.
float grain(float t) {
  // Start from integer pixel coords — well-separated inputs = no coherent structure
  vec2 p = floor(gl_FragCoord.xy);
  // Shift per frame using two incommensurable primes so x/y drift independently
  p.x += fract(t * 127.1) * 3000.0;
  p.y += fract(t * 311.7) * 3000.0;
  // Hash: no trig, no periodicity
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
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
  float grainValue = grain(time);
  // Map grain from 0-1 to -0.5 to 0.5 for balanced noise
  grainValue = (grainValue - 0.5) * grainAmount;

  // Apply grain to all color channels
  color.rgb += vec3(grainValue);

  gl_FragColor = color;
}
