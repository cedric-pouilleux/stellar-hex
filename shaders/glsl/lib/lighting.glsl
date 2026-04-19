float diffuse(vec3 normal, vec3 lightDir) {
  return max(0.0, dot(normalize(normal), normalize(lightDir)));
}

float specular(vec3 normal, vec3 lightDir, vec3 viewDir, float shininess) {
  vec3 h = normalize(lightDir + viewDir);
  return pow(max(0.0, dot(normalize(normal), h)), shininess);
}

float fresnel(vec3 normal, vec3 viewDir, float f0) {
  float cosTheta = 1.0 - max(0.0, dot(normalize(normal), normalize(viewDir)));
  return f0 + (1.0 - f0) * pow(cosTheta, 5.0);
}

float rimAtmo(vec3 normal, vec3 viewDir, float density) {
  float rim = 1.0 - max(0.0, dot(normalize(normal), normalize(viewDir)));
  return pow(rim, mix(8.0, 2.0, density)) * density;
}

// ── Blend modes ───────────────────────────────────────────────
vec3 blendScreen(vec3 b, vec3 a)    { return 1.0 - (1.0 - b) * (1.0 - a); }
vec3 blendOverlay(vec3 b, vec3 a)   { return mix(2.0*b*a, 1.0-2.0*(1.0-b)*(1.0-a), step(0.5, b)); }
vec3 blendAdd(vec3 b, vec3 a)       { return min(b + a, vec3(1.0)); }
vec3 blendSoftLight(vec3 b, vec3 a) {
  return mix(2.0*b*a + b*b*(1.0-2.0*a), sqrt(b)*(2.0*a-1.0)+2.0*b*(1.0-a), step(0.5, a));
}
// mode: 0=Mix 1=Screen 2=Overlay 3=Add 4=SoftLight
vec3 applyBlend(vec3 base, vec3 layer, float amount, float mode) {
  vec3 res = mix(base, layer, amount);
  res = mix(res, mix(base, blendScreen(base, layer),    amount), step(0.5, mode)*step(mode, 1.5));
  res = mix(res, mix(base, blendOverlay(base, layer),   amount), step(1.5, mode)*step(mode, 2.5));
  res = mix(res, mix(base, blendAdd(base, layer),       amount), step(2.5, mode)*step(mode, 3.5));
  res = mix(res, mix(base, blendSoftLight(base, layer), amount), step(3.5, mode));
  return res;
}
