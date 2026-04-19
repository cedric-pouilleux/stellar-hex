uniform float uTime;
uniform float uSeed;
uniform float uHeightScale;

varying vec3  vPosition;
varying vec3  vNormal;
varying vec3  vWorldNormal;
varying vec3  vViewDir;
varying vec2  vUv;
varying vec3  vVertexColor;

#include ./lib/noise.glsl

void main() {
  vUv       = uv;
  vPosition = position;
  vNormal   = normal;
  #ifdef USE_COLOR
    vVertexColor = color;
  #else
    vVertexColor = vec3(1.0);
  #endif

  vec3 seed3 = vec3(uSeed * 0.01);
  float freq = 3.0;

  // Height at this point — 4 octaves suffice for vertex displacement
  // (high octaves produce sub-vertex detail, wasted in the vertex stage)
  float h0 = fbm4(position * freq + seed3, 2.0, 0.5);

  // Finite-difference gradient to perturb the normal
  float eps = 0.003;
  float hpx = fbm4((position + vec3(eps, 0.0, 0.0)) * freq + seed3, 2.0, 0.5);
  float hpy = fbm4((position + vec3(0.0, eps, 0.0)) * freq + seed3, 2.0, 0.5);
  float hpz = fbm4((position + vec3(0.0, 0.0, eps)) * freq + seed3, 2.0, 0.5);
  vec3 grad = vec3(hpx - h0, hpy - h0, hpz - h0) / eps;

  // Perturbed normal: remove the radial component of the gradient,
  // keeping only the tangential component that creates shading.
  // Factor matches the displacement scale (0.35) so normals stay coherent with geometry.
  vec3 perturbedNormal = normalize(normal - (grad - dot(grad, normal) * normal) * uHeightScale * 0.35);

  // Geometric displacement
  vec3 displaced = position + normal * h0 * uHeightScale * 0.35;

  vec4 worldPos   = modelMatrix * vec4(displaced, 1.0);
  vec4 mvPosition = viewMatrix * worldPos;

  vWorldNormal = normalize(mat3(modelMatrix) * perturbedNormal);
  vViewDir     = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * mvPosition;
}
