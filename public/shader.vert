// Vertex shader - passes through position and texture coordinates
attribute vec3 aPosition;
attribute vec2 aTexCoord;

varying vec2 vTexCoord;

void main() {
  // Copy the texcoord for the fragment shader and flip Y
  vTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);

  // Copy the position data into a vec4, using 1.0 as the w component
  vec4 positionVec4 = vec4(aPosition, 1.0);
  positionVec4.xy = positionVec4.xy * 2.0 - 1.0;

  gl_Position = positionVec4;
}
