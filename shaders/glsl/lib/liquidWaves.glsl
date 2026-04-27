// Procedural wave helpers shared by the liquid-surface shader injection.
//
// Extracted from the legacy ocean material so the opaque-liquid refactor can
// reintroduce ripples + caustics without copy/pasting the GLSL inline.

// Sin-free polynomial hash — faster and avoids precision issues on mobile GPUs.
vec3 _wHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float _wNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = dot(_wHash3(i + vec3(0,0,0)) * 2.0 - 1.0, f - vec3(0,0,0));
  float b = dot(_wHash3(i + vec3(1,0,0)) * 2.0 - 1.0, f - vec3(1,0,0));
  float c = dot(_wHash3(i + vec3(0,1,0)) * 2.0 - 1.0, f - vec3(0,1,0));
  float d = dot(_wHash3(i + vec3(1,1,0)) * 2.0 - 1.0, f - vec3(1,1,0));
  float e = dot(_wHash3(i + vec3(0,0,1)) * 2.0 - 1.0, f - vec3(0,0,1));
  float f2= dot(_wHash3(i + vec3(1,0,1)) * 2.0 - 1.0, f - vec3(1,0,1));
  float g = dot(_wHash3(i + vec3(0,1,1)) * 2.0 - 1.0, f - vec3(0,1,1));
  float h = dot(_wHash3(i + vec3(1,1,1)) * 2.0 - 1.0, f - vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y),
             mix(mix(e,f2,u.x),mix(g,h,u.x), u.y), u.z) * 0.5 + 0.5;
}

// Two octaves of drifting noise at different scales and directions simulate
// overlapping ocean swell patterns. Returns a scalar wave height in [0,1].
float _waveHeight(vec3 p, float t) {
  float w1 = _wNoise(p * 1.0 + vec3(t * 0.035, t * 0.012, -t * 0.008));
  float w2 = _wNoise(p * 2.8 - vec3(t * 0.018, -t * 0.042, t * 0.025));
  return w1 * 0.60 + w2 * 0.40;
}

// Wave-perturbed normal via finite differences. Samples the wave height field
// around the current point, computes the gradient, and blends the tangent-space
// perturbation into the geometric normal. This is bump-mapping on the fly.
vec3 _waveNormal(vec3 worldPos, vec3 N, float t, float strength) {
  float eps = 0.02;
  vec3 p = worldPos * 5.0;
  float h0 = _waveHeight(p, t);
  float hx = _waveHeight(p + vec3(eps, 0.0, 0.0), t);
  float hy = _waveHeight(p + vec3(0.0, eps, 0.0), t);
  float hz = _waveHeight(p + vec3(0.0, 0.0, eps), t);
  vec3 grad = (vec3(hx, hy, hz) - h0) / eps;
  grad -= N * dot(grad, N);
  return normalize(N - grad * strength);
}

// Soft caustic (light focusing through wave crests) for specular. Single noise
// + double-frequency sin fold produces a dappled-light pattern at ~half the
// cost of a second noise evaluation.
float _waterCaustic(vec3 p, float t) {
  float n1 = _wNoise(p + vec3(t * 0.028, t * 0.018, -t * 0.012));
  float c  = sin(n1 * 12.566) * 0.5 + 0.5;
  return c * c;
}
