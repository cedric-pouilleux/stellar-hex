// ── Liquid mask ───────────────────────────────────────────────────────────────
// Replicates the CPU simplex3D elevation function used by BodySimulation so
// rocky.frag can exclude submerged tiles from per-fragment effects (cracks,
// lava) without needing per-vertex attributes. Substance-agnostic: the mask
// drives water, methane, nitrogen or any other caller-defined liquid.
//
// The permutation table is seeded identically on CPU (see shaders/simplexPerm.ts)
// and uploaded as a 512×1 UNSIGNED_BYTE texture — direct index lookup, no mod.
//
// Coordinates passed to `liquidLandMask()` are object-space positions; they are
// normalised to the unit sphere and scaled by uLiquidNoiseScale to match the
// exact sampling done by `elevationAt()` (`x / len`, see BodySimulation).
//
// `uLiquidRadius` is kept as a uniform for API stability with consumers that
// still upload it, but it is no longer read here: the layered prism shell
// feeds this function with positions whose magnitude spans
// `[coreRadius, surfaceRadius]`, so dividing by a single radius would mis-
// classify wall vertices. We normalise instead — only direction matters for
// the noise field, which makes the classification radially invariant (same
// tile → same land/liquid value from wall base to top cap).

uniform sampler2D uLiquidPerm;
uniform float     uLiquidNoiseScale;
uniform float     uLiquidRadius;
uniform float     uSeaLevel;

// ── Macro continent layer ───────────────────────────────────────────
// Matches `internal/continents.ts` byte-for-byte. `uContinentAmount = 0`
// short-circuits the layer entirely so dry / continent-less worlds pay
// nothing. Seed is uploaded as a vec3 from `continentSeedFromName(name)`.
uniform float uContinentAmount;
uniform float uContinentScale;
uniform vec3  uContinentSeed;

const float SIMPLEX_F3 = 0.333333333;
const float SIMPLEX_G3 = 0.166666667;

float liquidPerm(float i) {
  return floor(texture2D(uLiquidPerm, vec2((i + 0.5) / 512.0, 0.5)).r * 255.0 + 0.5);
}

vec3 liquidGrad3(float idx) {
  float i = mod(idx, 12.0);
       if (i < 0.5)  return vec3( 1.0,  1.0,  0.0);
  else if (i < 1.5)  return vec3(-1.0,  1.0,  0.0);
  else if (i < 2.5)  return vec3( 1.0, -1.0,  0.0);
  else if (i < 3.5)  return vec3(-1.0, -1.0,  0.0);
  else if (i < 4.5)  return vec3( 1.0,  0.0,  1.0);
  else if (i < 5.5)  return vec3(-1.0,  0.0,  1.0);
  else if (i < 6.5)  return vec3( 1.0,  0.0, -1.0);
  else if (i < 7.5)  return vec3(-1.0,  0.0, -1.0);
  else if (i < 8.5)  return vec3( 0.0,  1.0,  1.0);
  else if (i < 9.5)  return vec3( 0.0, -1.0,  1.0);
  else if (i < 10.5) return vec3( 0.0,  1.0, -1.0);
  else               return vec3( 0.0, -1.0, -1.0);
}

float liquidSimplex3D(vec3 pp) {
  float s   = (pp.x + pp.y + pp.z) * SIMPLEX_F3;
  vec3  P   = floor(pp + s);
  float t   = (P.x + P.y + P.z) * SIMPLEX_G3;
  vec3  X0  = P - t;
  vec3  d0  = pp - X0;

  vec3 o1, o2;
  if (d0.x >= d0.y) {
    if (d0.y >= d0.z)      { o1 = vec3(1.0, 0.0, 0.0); o2 = vec3(1.0, 1.0, 0.0); }
    else if (d0.x >= d0.z) { o1 = vec3(1.0, 0.0, 0.0); o2 = vec3(1.0, 0.0, 1.0); }
    else                   { o1 = vec3(0.0, 0.0, 1.0); o2 = vec3(1.0, 0.0, 1.0); }
  } else {
    if (d0.y < d0.z)       { o1 = vec3(0.0, 0.0, 1.0); o2 = vec3(0.0, 1.0, 1.0); }
    else if (d0.x < d0.z)  { o1 = vec3(0.0, 1.0, 0.0); o2 = vec3(0.0, 1.0, 1.0); }
    else                   { o1 = vec3(0.0, 1.0, 0.0); o2 = vec3(1.0, 1.0, 0.0); }
  }

  vec3 d1 = d0 - o1 + SIMPLEX_G3;
  vec3 d2 = d0 - o2 + 2.0 * SIMPLEX_G3;
  vec3 d3 = d0 - 1.0 + 3.0 * SIMPLEX_G3;

  // i & 255 ≡ mod(i, 256) for integer-valued P components
  float ii = mod(P.x, 256.0);
  float jj = mod(P.y, 256.0);
  float kk = mod(P.z, 256.0);

  float gi0 = liquidPerm(ii        + liquidPerm(jj        + liquidPerm(kk        )));
  float gi1 = liquidPerm(ii + o1.x + liquidPerm(jj + o1.y + liquidPerm(kk + o1.z)));
  float gi2 = liquidPerm(ii + o2.x + liquidPerm(jj + o2.y + liquidPerm(kk + o2.z)));
  float gi3 = liquidPerm(ii + 1.0  + liquidPerm(jj + 1.0  + liquidPerm(kk + 1.0 )));

  float n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;

  float t0 = 0.6 - dot(d0, d0);
  if (t0 > 0.0) { t0 *= t0; n0 = t0 * t0 * dot(liquidGrad3(gi0), d0); }
  float t1 = 0.6 - dot(d1, d1);
  if (t1 > 0.0) { t1 *= t1; n1 = t1 * t1 * dot(liquidGrad3(gi1), d1); }
  float t2 = 0.6 - dot(d2, d2);
  if (t2 > 0.0) { t2 *= t2; n2 = t2 * t2 * dot(liquidGrad3(gi2), d2); }
  float t3 = 0.6 - dot(d3, d3);
  if (t3 > 0.0) { t3 *= t3; n3 = t3 * t3 * dot(liquidGrad3(gi3), d3); }

  return 32.0 * (n0 + n1 + n2 + n3);
}

// ── Continent mask (sin-free polynomial hash, byte-identical to TS) ─────────
// The hash matches `internal/continents.ts:hash3` exactly — any precision
// drift here will desync the GPU classification from the CPU one on the
// liquid boundary.
vec3 continentHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  // p += dot(p, p.yxz + 33.33)
  float d = dot(p, p.yxz + vec3(33.33));
  p += vec3(d);
  // (p.xxy + p.yxx) * p.zyx
  return fract((p.xxy + p.yxx) * p.zyx);
}

float continentMask3D(vec3 unit, float scale, vec3 seedOffset) {
  vec3 p = unit * scale + seedOffset;
  vec3 i = floor(p);
  vec3 f = p - i;

  float f1 = 1e10, f2 = 1e10;
  float nearestTag = 0.0;

  for (int dz = -1; dz <= 1; dz++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec3 cell    = i + vec3(float(dx), float(dy), float(dz));
        vec3 jitter  = continentHash3(cell);
        vec3 dv      = vec3(float(dx), float(dy), float(dz)) + jitter - f;
        float d2     = dot(dv, dv);
        if (d2 < f1) {
          f2 = f1;
          f1 = d2;
          // Re-hash with a swizzled origin to decorrelate the binary tag from
          // the jitter — same swizzle as the TS side (cellZ, cellX, cellY).
          nearestTag = continentHash3(cell.zxy).x;
        } else if (d2 < f2) {
          f2 = d2;
        }
      }
    }
  }

  float sign     = nearestTag > 0.5 ? 1.0 : -1.0;
  float edge     = sqrt(f2) - sqrt(f1);
  float softness = smoothstep(0.0, 0.18, edge);
  return sign * softness;
}

/** 1.0 on land, 0.0 on submerged tiles — matches the exact tile-level classification. */
float liquidLandMask(vec3 objectPos) {
  vec3  unit = normalize(objectPos);
  float elev = liquidSimplex3D(unit * uLiquidNoiseScale);
  // Optional macro continent layer — added in unit-sphere space, same as the
  // CPU sampler in `BodySimulation.noiseAt`. Gated by amount > 0 so dry /
  // continent-less worlds pay nothing.
  if (uContinentAmount > 0.001) {
    elev += continentMask3D(unit, uContinentScale, uContinentSeed) * uContinentAmount;
  }
  return step(uSeaLevel, elev);
}
