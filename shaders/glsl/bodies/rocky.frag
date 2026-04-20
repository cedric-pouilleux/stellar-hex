precision highp float;

uniform float uTime;
uniform float uSeed;
uniform vec3  uNoiseSeed;   // per-planet domain offset (from body variation)
uniform float uNoiseFreq;   // global terrain frequency multiplier
uniform float uRoughness;
uniform float uCraterDensity;
uniform float uCraterCount;
uniform float uCraterDepth;
uniform float uHeightScale;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uCrackAmount;
uniform float uCrackScale;
uniform float uCrackWidth;
uniform float uCrackDepth;
uniform vec3  uCrackColor;
uniform float uCrackBlend;
uniform float uLavaAmount;
uniform vec3  uLavaColor;
uniform float uLavaEmissive;

// Vagues
uniform float uWaveAmount;
uniform vec3  uWaveColor;
uniform float uWaveScale;

// Lighting
uniform vec3  uLightColor;
uniform vec3  uLightDir;
uniform float uLightIntensity;
uniform vec3  uAmbientColor;
/** 1.0 in top-down overview mode — flattens diffuse to uniform 1.0, eliminates shadow artifacts. */
uniform float uFlatLighting;

varying vec3  vPosition;
varying vec3  vNormal;
varying vec3  vWorldNormal;
varying vec3  vViewDir;
varying vec2  vUv;
varying vec3  vVertexColor;

#include ../lib/noise.glsl
#include ../lib/lighting.glsl
#include ../lib/cracks.glsl
#include ../lib/lava.glsl
#ifdef USE_OCEAN_MASK
#include ../lib/oceanMask.glsl
#endif

// Crater shape function (inverted quartic profile)
float craterShape(float d, float r) {
  float x = d / r;
  if (x > 1.0) return 0.0;
  return (1.0 - x * x) * (1.0 - x * x);
}

float craterField(vec3 p, float density, float depth) {
  float result = 0.0;
  // uCraterCount controls the Voronoi base frequency:
  // low = few large craters, high = many small ones
  float baseFreq = uCraterCount;
  vec3  seedOff  = vec3(uSeed * 0.01);

  // Manually unrolled — compile-time constants allow full loop elimination.
  // Scale 0: large craters (full 27-cell voronoi)
  {
    vec2  v     = voronoi(p * baseFreq + seedOff);
    float shape = craterShape(v.x, 0.35);
    float rim   = smoothstep(0.3, 0.42, v.x) * smoothstep(0.5, 0.42, v.x);
    result += (shape * -depth + rim * depth * 0.35) * density;
  }
  // Scale 1: medium craters (full 27-cell voronoi)
  {
    float scale = baseFreq * 2.5;
    float d     = density * 0.75;
    vec2  v     = voronoi(p * scale + seedOff);
    float shape = craterShape(v.x, 0.35);
    float rim   = smoothstep(0.3, 0.39, v.x) * smoothstep(0.5, 0.39, v.x);
    result += (shape * -depth + rim * depth * 0.35) * d * 0.5;
  }
  // Scale 2: small craters (fast 8-cell voronoi — sub-pixel at this frequency)
  {
    float scale = baseFreq * 6.25;
    float d     = density * 0.5;
    vec2  v     = voronoiFast(p * scale + seedOff);
    float shape = craterShape(v.x, 0.35);
    float rim   = smoothstep(0.3, 0.36, v.x) * smoothstep(0.5, 0.36, v.x);
    result += (shape * -depth + rim * depth * 0.35) * d * 0.333;
  }
  return result;
}

void main() {
  vec3 p = vPosition * uNoiseFreq + uNoiseSeed * 0.01;

  // Base terrain using warped FBM
  float terrain = warpedFBM(p * 2.5, 0.4 * uRoughness);

  // Craters
  float craters = craterField(p, uCraterDensity, uCraterDepth);

  // Final height
  float height = clamp(terrain + craters * uCraterDensity, 0.0, 1.0);

  // Base color interpolated by height
  vec3 baseColor = mix(uColorA, uColorB, smoothstep(0.2, 0.8, height));


  // Crater floor (darker)
  float craterMask = clamp(-craters * uCraterDensity, 0.0, 1.0);
  baseColor = mix(baseColor, uColorA * 0.5, craterMask * uCraterDepth);

  // ── Crack / lava placement mask ──────────────────────────────
  // On planets with surface water, `oceanLandMask` (when USE_OCEAN_MASK is
  // defined) replicates the CPU simplex3D elevation field exactly, so cracks
  // and lava are suppressed precisely where the CPU classified tiles as
  // ocean — matching the blue tile colours at their own boundary.
  // Otherwise the mask is 1.0 and the effects apply uniformly.
  #ifdef USE_OCEAN_MASK
    float landMask = oceanLandMask(vPosition);
  #else
    float landMask = 1.0;
  #endif

  // ── Lava ─────────────────────────────────────────────────────
  // Applied BEFORE cracks so fissures stay visible when both effects are
  // active — cracks overpaint lava channels with their dark edges. The
  // `crackMask` seed is disabled (passed as 0.0) so lava and cracks form
  // independent networks instead of colliding on the same voronoi cells.
  vec3 lavaEmissiveContrib = vec3(0.0);
  if (uLavaAmount > 0.0 && landMask > 0.5) {
    // Channel width grows with lava amount (wider channels = more surface coverage)
    float netWidth = mix(0.015, 0.22, uLavaAmount);
    lavaEmissiveContrib = computeLava(baseColor, p, uTime, uLavaAmount, uCrackScale, netWidth, 0.0, uLavaColor, uLavaEmissive);
  }

  // ── Cracks ───────────────────────────────────────────────────
  if (uCrackAmount > 0.0 && landMask > 0.5) {
    computeCracks(baseColor, p, uCrackAmount, uCrackScale, uCrackWidth, uCrackDepth, uCrackColor, uCrackBlend);
  }

  // ── Nuages ──────────────────────────────────────────────────
  if (uWaveAmount > 0.0) {
    float tCloud = uTime * 0.8 * 0.015;
    vec3  cp     = p * uWaveScale;

    vec3 cq = vec3(
      fbm3(cp * 1.2 + vec3(tCloud,        0.0, 0.0), 2.0, 0.5),
      fbm3(cp * 1.2 + vec3(0.0, tCloud * 0.8, 0.0), 2.0, 0.5),
      fbm3(cp        + vec3(tCloud * 0.6,  0.0, 1.2), 2.0, 0.5)
    ) * 2.0 - 1.0;

    float cloud     = fbm4(cp * 1.5 + cq * 1.8 + vec3(tCloud * 0.7, 0.0, 0.0), 2.0, 0.5);
    float cloudMask = pow(smoothstep(0.42, 0.62, cloud), 1.4);

    baseColor = applyBlend(baseColor, uWaveColor, cloudMask * uWaveAmount, 0.0);
  }

  // Vertex color tint
  baseColor *= vVertexColor;

  // Lighting — in top-down mode (uFlatLighting=1) the diffuse term is forced to 1.0
  // so every visible fragment receives equal illumination regardless of planet rotation.
  float diff  = mix(diffuse(vWorldNormal, uLightDir), 1.0, uFlatLighting);
  float rough = uRoughness;
  float spec  = specular(vWorldNormal, uLightDir, vViewDir, mix(4.0, 64.0, 1.0 - rough));
  spec *= (1.0 - rough) * 0.3 * (1.0 - uFlatLighting);

  vec3 lit    = baseColor * (uLightColor * diff * uLightIntensity);
  lit        += uLightColor * spec * 0.5 * uLightIntensity;

  // Surface micro-details
  float micro = gnoise(p * 20.0) * 0.05;
  lit += micro * uLightColor * diff;

  // Lava emission — dimmed on the night side so volcanic planets don't
  // look uniformly lit. `diff` already folds in uFlatLighting (= 1.0 in
  // top-down mode), so top-down always sees full emission.
  lit += lavaEmissiveContrib * mix(0.25, 1.0, diff);

  gl_FragColor = vec4(lit, 1.0);
}
