precision highp float;

uniform float uTime;
uniform float uSeed;
uniform vec3  uNoiseSeed;   // per-planet domain offset (from body variation)
uniform float uNoiseFreq;   // global noise frequency multiplier
// Bandes
uniform float uBandCount;
uniform float uBandSharpness;
uniform float uBandWarp;
uniform float uTurbulence;
uniform float uCloudDetail;

// Courants-jets
uniform float uJetStream;

// Couleurs
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;
uniform vec3  uColorD;

uniform float uAnimSpeed;

// Nuages haute altitude
uniform float uCloudAmount;
uniform vec3  uCloudColor;
uniform float uCloudBlend;

// Lighting
uniform vec3  uLightColor;
uniform vec3  uLightDir;
uniform float uLightIntensity;
uniform vec3  uAmbientColor;
/** 1.0 → flat diffuse for top-down / backdrop modes; 0.0 → directional shading. */
uniform float uFlatLighting;
/** Backdrop attenuation in [0, 1] — final-colour multiplier + bandLuma flatten. Sol view drops below 1. */
uniform float uViewDim;
/** Inner luminous corona — additive fresnel glow at the silhouette. `uCoronaColor` is the tint. */
uniform float uCoronaStrength;
uniform vec3  uCoronaColor;

varying vec3  vPosition;
varying vec3  vNormal;
varying vec3  vWorldNormal;
varying vec3  vViewDir;
varying vec3  vVertexColor;

#include ../lib/noise.glsl
#include ../lib/lighting.glsl

vec3 bandPalette(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(uColorA, uColorD, t / 0.33);
  if (t < 0.66) return mix(uColorD, uColorB, (t - 0.33) / 0.33);
  return mix(uColorB, uColorA, (t - 0.66) / 0.34);
}

void main() {
  vec3  p   = vPosition * uNoiseFreq + uNoiseSeed * 0.01;
  float t   = uTime * uAnimSpeed * 0.08;
  float lat = vPosition.y;

  // ── Jet streams: differential phase by latitude ─────────
  float jetPhase  = sin(lat * uBandCount * 1.57) * uJetStream;
  float tJet      = t + jetPhase;

  // ── Band warp ─────────────────────────────────────
  float warpX     = fbm4(vec3(p.x * 1.2, p.y * 0.4, p.z * 1.2) + vec3(tJet * 0.5, 0.0, 0.0), 2.0, 0.5);
  float warpZ     = fbm4(vec3(p.z * 1.2, p.x * 0.4, p.y * 1.2) + vec3(0.0, tJet * 0.5, 0.0), 2.0, 0.5);
  float latWarped = lat + (warpX - 0.5) * uBandWarp * 0.5
                       + (warpZ - 0.5) * uBandWarp * 0.25;

  // ── Band turbulence -- fbm4 instead of warpedFBM ────────
  float turbA      = fbm4(p * 1.8 + vec3(tJet, 0.0, 0.0), 2.0, 0.5);
  float turbB      = fbm4(p * 2.5 + vec3(0.0, tJet * 0.6, 0.0), 2.0, 0.5);
  float turbOffset = (turbA - 0.5) * uTurbulence * 0.5 + (turbB - 0.5) * uTurbulence * 0.25;

  // ── Band coordinate and signal ────────────────────────────
  // uSeed shifts the band phase: 0–1000 covers a full revolution
  float bandCoord = latWarped * uBandCount * 1.5708 + uSeed * 0.00628 + turbOffset * 3.14159;
  float rawBand   = sin(bandCoord) * 0.5 + 0.5;
  float sub1      = sin(bandCoord * 2.0 + 0.3) * 0.5 + 0.5;
  float sub2      = sin(bandCoord * 3.7 + 1.1) * 0.5 + 0.5;
  float band      = rawBand * 0.6 + sub1 * 0.25 + sub2 * 0.15;
  band = mix(band, smoothstep(0.35, 0.65, band), uBandSharpness * 0.8);
  band = clamp(band, 0.0, 1.0);

  // Jet streams
  float jetMask  = pow(abs(cos(bandCoord)), mix(8.0, 2.0, uJetStream)) * uJetStream;

  // High-frequency detail
  float detail   = mix(gnoise(p * 7.0  + vec3(tJet * 3.0, 0.0, 0.0)),
                       gnoise(p * 14.0 + vec3(tJet * 5.0, 0.0, 0.0)), 0.4) * uCloudDetail * 0.14;

  vec3 procColor = bandPalette(band);
  float bandLuma = mix(0.78, 1.18, band);
  // Flatten the contrast envelope when the disc is dimmed — bands soften
  // alongside the final-colour reduction so the haze reads as distant.
  bandLuma       = mix(1.0, bandLuma, uViewDim);
  procColor     *= bandLuma;
  procColor      = mix(procColor, procColor * 1.22, jetMask * 0.35);

  // Per-tile vertex overlay — gated by `vertexEnergy` so the procedural
  // pattern reads cleanly until the playground paints tiles via
  // `paintSmoothSphere` (which leaves vertices at 0 on the default pass).
  float vertexEnergy = max(max(vVertexColor.r, vVertexColor.g), vVertexColor.b);
  float overlayMask  = smoothstep(0.005, 0.05, vertexEnergy);
  vec3  bandColor    = mix(procColor, vVertexColor * bandLuma, overlayMask * 0.55);

  // ── High-altitude clouds ────────────────────────────────────
  // Gate skips ~4 fbm samples/fragment when clouds are off.
  if (uCloudAmount > 0.01) {
    float tCloud = uTime * uAnimSpeed * 0.06;
    vec3 cq = vec3(
      fbm3(p * 1.4 + vec3(tCloud * 1.1,  3.7,  8.5), 2.0, 0.5),
      fbm3(p * 1.4 + vec3( 4.8, tCloud * 0.9,  2.3), 2.0, 0.5),
      fbm3(p * 1.4 + vec3( 7.6,  1.4, tCloud * 1.3), 2.0, 0.5)
    ) * 2.0 - 1.0;
    float cloud     = fbm4(p * 1.8 + cq * 2.2 + vec3(tCloud * 0.5, 0.0, 0.0), 2.0, 0.5);
    float cloudMask = pow(smoothstep(0.44, 0.62, cloud), 1.2);
    bandColor = applyBlend(bandColor, uCloudColor, cloudMask * uCloudAmount, uCloudBlend);
  }

  // ── Lighting ────────────────────────────────────────────────
  // `gl_FrontFacing` is the unambiguous flip signal — a `dot(N, V)`
  // test would mis-fire near silhouette fragments where interpolation
  // produces marginally negative dot values on FrontSide.
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(vViewDir);
  if (!gl_FrontFacing) N = -N;

  float diff = mix(diffuse(N, uLightDir), 1.0, uFlatLighting);
  float spec = specular(N, uLightDir, vViewDir, 12.0) * 0.1 * (1.0 - uFlatLighting);
  float NdotV= max(0.0, dot(N, V));
  // `diff` gate keeps the warm tint off the dark-side silhouette.
  float rim  = pow(1.0 - NdotV, 4.0) * 0.4 * (1.0 - uFlatLighting) * diff;

  vec3 lit = bandColor * (uLightColor * diff * uLightIntensity);
  lit      += uLightColor * spec * uLightIntensity;
  lit       = mix(lit, mix(uColorB, uColorC, 0.4) * uLightColor * 0.4, rim);

  float twilight = smoothstep(0.0, 0.18, diff);
  lit           *= twilight;

  // Inner corona — added before the backdrop attenuation so it fades
  // with the rest of the disc in Sol view. `diff` gates the night-side
  // limb; in Sol view `uFlatLighting=1` lifts `diff` to 1.0 so the
  // corona wraps the whole silhouette.
  if (uCoronaStrength > 0.001) {
    float coronaMask = pow(1.0 - NdotV, 2.5);
    lit += uCoronaColor * 1.6 * coronaMask * diff * uCoronaStrength;
  }

  // Backdrop attenuation — Sol view uses this to push the gas disc
  // into the background; Shader view leaves it at 1.0.
  lit *= uViewDim;

  gl_FragColor = vec4(lit, 1.0);
}
