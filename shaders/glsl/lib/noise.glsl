// ── Hash (polynomial, sin-free) ─────────────────────────────────
// Dave Hoskins' polynomial hash — no sin() dependency, consistent
// across GPU vendors (avoids precision-dependent artifacts on
// mobile / Intel iGPU). Range: [0, 1].
vec3 hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash1(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// ── Gradient Noise 3D ────────────────────────────────────────
float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash3(i + vec3(0,0,0)) * 2.0 - 1.0, f - vec3(0,0,0));
  float b = dot(hash3(i + vec3(1,0,0)) * 2.0 - 1.0, f - vec3(1,0,0));
  float c = dot(hash3(i + vec3(0,1,0)) * 2.0 - 1.0, f - vec3(0,1,0));
  float d = dot(hash3(i + vec3(1,1,0)) * 2.0 - 1.0, f - vec3(1,1,0));
  float e = dot(hash3(i + vec3(0,0,1)) * 2.0 - 1.0, f - vec3(0,0,1));
  float f2= dot(hash3(i + vec3(1,0,1)) * 2.0 - 1.0, f - vec3(1,0,1));
  float g = dot(hash3(i + vec3(0,1,1)) * 2.0 - 1.0, f - vec3(0,1,1));
  float h = dot(hash3(i + vec3(1,1,1)) * 2.0 - 1.0, f - vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y),
             mix(mix(e,f2,u.x),mix(g,h,u.x), u.y), u.z) * 0.5 + 0.5;
}

// ── Value Noise 3D ───────────────────────────────────────────
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash1(dot(i + vec3(0,0,0), vec3(1,57,113)));
  float b = hash1(dot(i + vec3(1,0,0), vec3(1,57,113)));
  float c = hash1(dot(i + vec3(0,1,0), vec3(1,57,113)));
  float d = hash1(dot(i + vec3(1,1,0), vec3(1,57,113)));
  float e = hash1(dot(i + vec3(0,0,1), vec3(1,57,113)));
  float f2= hash1(dot(i + vec3(1,0,1), vec3(1,57,113)));
  float g = hash1(dot(i + vec3(0,1,1), vec3(1,57,113)));
  float h = hash1(dot(i + vec3(1,1,1), vec3(1,57,113)));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y),
             mix(mix(e,f2,u.x),mix(g,h,u.x), u.y), u.z);
}

// ── Specialized FBM — compile-time loop bounds for guaranteed unrolling ──
// Each variant has a fixed iteration count so the GLSL compiler can fully
// unroll without relying on dynamic break (which some drivers refuse to unroll).

float fbm2(vec3 p, float lac, float gain) {
  float v = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp;
  return v / maxV;
}

float fbm3(vec3 p, float lac, float gain) {
  float v = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp;
  return v / maxV;
}

float fbm4(vec3 p, float lac, float gain) {
  float v = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp;
  return v / maxV;
}

float fbm5(vec3 p, float lac, float gain) {
  float v = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp;
  return v / maxV;
}

float fbm6(vec3 p, float lac, float gain) {
  float v = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += gnoise(p * freq) * amp; maxV += amp;
  return v / maxV;
}

// Convenience alias — 6-octave FBM with standard lacunarity/gain
float fbm(vec3 p) { return fbm6(p, 2.0, 0.5); }

// ── Terrain archetypes ──────────────────────────────────────
// Same octave budget as `fbm4` but different per-octave shaping —
// chosen at planet level via a `uTerrainArchetype` uniform so the
// branch is uniform across the wavefront (no GPU divergence).
//
// Ridged FBM — `1 - |2n - 1|` produces sharp ridges at noise
// extrema, reads as fault lines / mountain chains. Final value is
// remapped to [0, 1] so it composes cleanly with the smooth FBM
// scale used by the rest of the pipeline.
float fbmRidged4(vec3 p, float lac, float gain) {
  float v = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
  v += (1.0 - abs(gnoise(p * freq) * 2.0 - 1.0)) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += (1.0 - abs(gnoise(p * freq) * 2.0 - 1.0)) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += (1.0 - abs(gnoise(p * freq) * 2.0 - 1.0)) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += (1.0 - abs(gnoise(p * freq) * 2.0 - 1.0)) * amp; maxV += amp;
  return v / maxV;
}

// Billow FBM — `|2n - 1|` produces rounded mounds at noise extrema,
// reads as dunes / soft hills. Same normalisation as `fbmRidged4`.
float fbmBillow4(vec3 p, float lac, float gain) {
  float v = 0.0, amp = 0.5, freq = 1.0, maxV = 0.0;
  v += abs(gnoise(p * freq) * 2.0 - 1.0) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += abs(gnoise(p * freq) * 2.0 - 1.0) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += abs(gnoise(p * freq) * 2.0 - 1.0) * amp; maxV += amp; amp *= gain; freq *= lac;
  v += abs(gnoise(p * freq) * 2.0 - 1.0) * amp; maxV += amp;
  return v / maxV;
}

// Archetype dispatcher — uniform branch on `uTerrainArchetype` index.
// 0 = smooth, 1 = ridged, 2 = billow, 3 = hybrid (billow plains +
// ridged peaks, blended on the ridged altitude). Hybrid pays the cost
// of both variants by design — caller opts in via the uniform.
//
// Single-return shape (no early returns). HLSL/D3D (ANGLE on Windows) flags
// chained `if (...) return ...;` as "potentially uninitialised" because
// the cross-compiler doesn't recognise the cases as exhaustive. Accumulate
// into `result` and return once to silence the X4000 warning.
float fbmArchetype4(vec3 p, float lac, float gain, float archetype) {
  float result;
  if (archetype < 0.5) {
    result = fbm4(p, lac, gain);
  } else if (archetype < 1.5) {
    result = fbmRidged4(p, lac, gain);
  } else if (archetype < 2.5) {
    result = fbmBillow4(p, lac, gain);
  } else {
    float r = fbmRidged4(p, lac, gain);
    float b = fbmBillow4(p, lac, gain);
    result = mix(b, r, smoothstep(0.45, 0.75, r));
  }
  return result;
}

// ── Warped FBM ───────────────────────────────────────────────
// Uses 4-octave FBM for the warp domain (high octaves contribute
// sub-pixel detail to the offset, wasted work). Final evaluation
// also uses 4 octaves. Saves 8 gnoise calls vs the old 6-octave path.
float warpedFBM(vec3 p, float w) {
  vec3 q = vec3(fbm4(p, 2.0, 0.5),
                fbm4(p + vec3(5.2, 1.3, 0.8), 2.0, 0.5),
                fbm4(p + vec3(1.7, 9.2, 3.1), 2.0, 0.5)) * 2.0 - 1.0;
  return fbm4(p + w * q, 2.0, 0.5);
}

// Warp domain stays smooth (smooth fbm gives a coherent flow field);
// only the final sample picks up the archetype. Lets ridged/billow
// terrains keep their characteristic shape while still benefiting
// from the warp-driven pseudo-tectonic distortion.
float warpedFBMArchetype(vec3 p, float w, float archetype) {
  vec3 q = vec3(fbm4(p, 2.0, 0.5),
                fbm4(p + vec3(5.2, 1.3, 0.8), 2.0, 0.5),
                fbm4(p + vec3(1.7, 9.2, 3.1), 2.0, 0.5)) * 2.0 - 1.0;
  return fbmArchetype4(p + w * q, 2.0, 0.5, archetype);
}

// ── Voronoi ──────────────────────────────────────────────────
vec2 voronoi(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  float minD = 1e10, minId = 0.0;
  for (int z=-1;z<=1;z++) for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
    vec3 n = vec3(float(x),float(y),float(z));
    vec3 pt = hash3(i+n);
    vec3 dv = n + pt - f;
    float d = length(dv);
    if (d < minD) { minD = d; minId = hash1(dot(i+n, vec3(1,57,113))); }
  }
  return vec2(minD, minId);
}

// Reduced-neighborhood voronoi for high-frequency detail scales.
// Checks the 8 nearest cells (biased toward fragment position) instead
// of the full 27. ~3.4x faster, visually identical at sub-pixel scales.
vec2 voronoiFast(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 bias = step(0.5, f);
  float minD = 1e10, minId = 0.0;
  for (int z=0;z<=1;z++) for (int y=0;y<=1;y++) for (int x=0;x<=1;x++) {
    vec3 n = vec3(float(x),float(y),float(z)) - (1.0 - bias);
    vec3 pt = hash3(i+n);
    vec3 dv = n + pt - f;
    float d = length(dv);
    if (d < minD) { minD = d; minId = hash1(dot(i+n, vec3(1,57,113))); }
  }
  return vec2(minD, minId);
}

float voronoiEdge(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  float f1 = 1e10, f2 = 1e10;
  for (int z=-1;z<=1;z++) for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
    vec3 n = vec3(float(x),float(y),float(z));
    vec3 dv = n + hash3(i+n) - f;
    float d = dot(dv,dv);
    if (d < f1) { f2=f1; f1=d; } else if (d < f2) { f2=d; }
  }
  return sqrt(f2) - sqrt(f1);
}

// Reduced-neighborhood voronoi edge for high-frequency detail scales.
// 8 cells instead of 27 — ~3.4x faster, artifacts invisible at fine scales.
float voronoiEdgeFast(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 bias = step(0.5, f);
  float f1 = 1e10, f2 = 1e10;
  for (int z=0;z<=1;z++) for (int y=0;y<=1;y++) for (int x=0;x<=1;x++) {
    vec3 n = vec3(float(x),float(y),float(z)) - (1.0 - bias);
    vec3 dv = n + hash3(i+n) - f;
    float d = dot(dv,dv);
    if (d < f1) { f2=f1; f1=d; } else if (d < f2) { f2=d; }
  }
  return sqrt(f2) - sqrt(f1);
}

// ── Specialized Value-noise FBM (un-normalized) ─────────────────────────────
// Fixed iteration counts for guaranteed unrolling. Uses vnoise with
// lacunarity 2.1 and gain 0.5 — matches the convection patterns
// expected by the star shader (preserves range [0, 1 - 0.5^n]).

float fbmV3(vec3 p) {
  float v = 0.0, a = 0.5;
  v += a * vnoise(p); p = p * 2.1 + vec3(1.7, 9.2, 3.4); a *= 0.5;
  v += a * vnoise(p); p = p * 2.1 + vec3(1.7, 9.2, 3.4); a *= 0.5;
  v += a * vnoise(p);
  return v;
}

float fbmV5(vec3 p) {
  float v = 0.0, a = 0.5;
  v += a * vnoise(p); p = p * 2.1 + vec3(1.7, 9.2, 3.4); a *= 0.5;
  v += a * vnoise(p); p = p * 2.1 + vec3(1.7, 9.2, 3.4); a *= 0.5;
  v += a * vnoise(p); p = p * 2.1 + vec3(1.7, 9.2, 3.4); a *= 0.5;
  v += a * vnoise(p); p = p * 2.1 + vec3(1.7, 9.2, 3.4); a *= 0.5;
  v += a * vnoise(p);
  return v;
}
