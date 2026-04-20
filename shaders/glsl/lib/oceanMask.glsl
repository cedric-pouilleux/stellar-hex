// ── Ocean mask ────────────────────────────────────────────────────────────────
// Replicates the CPU simplex3D elevation function used by BodySimulation so
// rocky.frag can exclude ocean tiles from per-fragment effects (cracks, lava)
// without needing per-vertex attributes.
//
// The permutation table is seeded identically on CPU (see core/oceanMask.ts)
// and uploaded as a 512×1 UNSIGNED_BYTE texture — direct index lookup, no mod.
//
// Coordinates passed to `oceanLandMask()` are object-space positions; they are
// normalised to the unit sphere and scaled by uOceanNoiseScale to match the
// exact sampling done by `elevationAt()`.

uniform sampler2D uOceanPerm;
uniform float     uOceanNoiseScale;
uniform float     uOceanRadius;
uniform float     uSeaLevel;

const float SIMPLEX_F3 = 0.333333333;
const float SIMPLEX_G3 = 0.166666667;

float oceanPerm(float i) {
  return floor(texture2D(uOceanPerm, vec2((i + 0.5) / 512.0, 0.5)).r * 255.0 + 0.5);
}

vec3 oceanGrad3(float idx) {
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

float oceanSimplex3D(vec3 pp) {
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

  float gi0 = oceanPerm(ii        + oceanPerm(jj        + oceanPerm(kk        )));
  float gi1 = oceanPerm(ii + o1.x + oceanPerm(jj + o1.y + oceanPerm(kk + o1.z)));
  float gi2 = oceanPerm(ii + o2.x + oceanPerm(jj + o2.y + oceanPerm(kk + o2.z)));
  float gi3 = oceanPerm(ii + 1.0  + oceanPerm(jj + 1.0  + oceanPerm(kk + 1.0 )));

  float n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;

  float t0 = 0.6 - dot(d0, d0);
  if (t0 > 0.0) { t0 *= t0; n0 = t0 * t0 * dot(oceanGrad3(gi0), d0); }
  float t1 = 0.6 - dot(d1, d1);
  if (t1 > 0.0) { t1 *= t1; n1 = t1 * t1 * dot(oceanGrad3(gi1), d1); }
  float t2 = 0.6 - dot(d2, d2);
  if (t2 > 0.0) { t2 *= t2; n2 = t2 * t2 * dot(oceanGrad3(gi2), d2); }
  float t3 = 0.6 - dot(d3, d3);
  if (t3 > 0.0) { t3 *= t3; n3 = t3 * t3 * dot(oceanGrad3(gi3), d3); }

  return 32.0 * (n0 + n1 + n2 + n3);
}

/** 1.0 on land, 0.0 on ocean — matches the exact tile-level classification. */
float oceanLandMask(vec3 objectPos) {
  vec3  unit = objectPos / uOceanRadius;
  float elev = oceanSimplex3D(unit * uOceanNoiseScale);
  return step(uSeaLevel, elev);
}
