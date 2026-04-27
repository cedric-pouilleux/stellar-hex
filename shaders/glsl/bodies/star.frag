precision highp float;

uniform float uTime;
uniform float uSeed;
uniform float uTemperature;
uniform float uAnimSpeed;
uniform float uConvectionScale;
uniform float uGranulationContrast;
uniform float uCloudAmount;
uniform float uCloudBlend;
uniform float uCoronaSize;
uniform float uPulsation;

uniform vec3  uLightColor;
uniform vec3  uLightDir;
uniform float uLightIntensity;
uniform vec3  uAmbientColor;

varying vec3  vPosition;
varying vec3  vNormal;
varying vec3  vWorldNormal;
varying vec3  vViewDir;
varying vec3  vVertexColor;

#include ../lib/noise.glsl
#include ../lib/lighting.glsl

// ── Couleur stellaire par type spectral ──────────────────────────
vec3 blackbodyColor(float kelvin) {
  float t = clamp(kelvin, 1000.0, 50000.0);
  if (t < 3700.0) { float f = (t-1000.0)/2700.0; return mix(vec3(0.75,0.03,0.0),  vec3(1.0,0.22,0.01), f); }
  if (t < 5200.0) { float f = (t-3700.0)/1500.0; return mix(vec3(1.0,0.22,0.01),  vec3(1.0,0.52,0.08), f); }
  if (t < 6000.0) { float f = (t-5200.0)/800.0;  return mix(vec3(1.0,0.52,0.08),  vec3(1.0,0.80,0.30), f); }
  if (t < 7500.0) { float f = (t-6000.0)/1500.0; return mix(vec3(1.0,0.80,0.30),  vec3(1.0,0.97,0.88), f); }
  if (t < 10000.0){ float f = (t-7500.0)/2500.0; return mix(vec3(1.0,0.97,0.88),  vec3(0.88,0.93,1.0), f); }
  if (t < 30000.0){ float f = (t-10000.0)/20000.0;return mix(vec3(0.88,0.93,1.0), vec3(0.60,0.74,1.0), f); }
  float f = clamp((t-30000.0)/20000.0, 0.0, 1.0);
  return mix(vec3(0.60,0.74,1.0), vec3(0.42,0.58,1.0), f);
}

void main() {
  vec3  p   = vPosition * 2.8 + uSeed * 0.01;
  float spd = uAnimSpeed;

  // ── Auto colours derived from surface temperature ─────────────
  // dark   : visible bright red (not black) — cool zones / spots
  // mid    : saturated luminous orange
  // bright : intense yellow-orange, slightly overexposed
  vec3 colorDark   = blackbodyColor(uTemperature * 0.55) * 0.35;
  vec3 colorMid    = blackbodyColor(uTemperature * 0.82) * 1.10;
  vec3 colorBright = blackbodyColor(uTemperature * 1.08) * 1.55;

  // ── Double domain warp (scalar FBM → vec3 via phase) ─────────
  // Single fbmV per warp level, expanded to a vec3 through sin/cos phase
  // shifts. Preserves directional variance of the warp while cutting noise
  // taps by ~3x. Visual difference on plasma texture is imperceptible.
  float n1 = fbmV3(p + uTime * vec3(0.030, 0.050, 0.020) * spd);
  vec3  q  = vec3(n1,
                  sin(n1 * 6.2831 + 1.3) * 0.5 + 0.5,
                  cos(n1 * 6.2831 + 2.8) * 0.5 + 0.5);

  float n2 = fbmV3(p + 1.8*q + uTime * vec3(0.060, 0.040, 0.050) * spd);
  vec3  r  = vec3(n2,
                  sin(n2 * 6.2831 + 3.1) * 0.5 + 0.5,
                  cos(n2 * 6.2831 + 5.7) * 0.5 + 0.5);

  float t = fbmV5(p + 2.2*r + uTime * vec3(0.04, 0.06, 0.02) * spd);

  // Granulation : haute fréquence additionnelle (échelle contrôlée)
  float boil = fbmV3(p * (5.0 * uConvectionScale) + uTime * vec3(0.18, 0.22, 0.14) * spd) * 0.18;
  t = clamp(t + boil, 0.0, 1.0);

  // ── Couleur de base ───────────────────────────────────────────
  float gc  = uGranulationContrast * 0.12; // resserrement des transitions
  vec3  col = mix(
    mix(colorDark, colorMid,  smoothstep(0.25 + gc, 0.55 - gc, t)),
    colorBright,              smoothstep(0.58 + gc, 0.85 - gc, t)
  );

  // ── Couche nuageuse contrastée (seeds indépendants, vitesse propre) ──
  if (uCloudAmount > 0.0) {
    // Rotate domain to break vnoise grid alignment (root cause of "blocky" spots).
    // Two irrational rotations on XZ then YZ decorrelate noise from world axes.
    const mat3 rotA = mat3( 0.803, 0.000,  0.596,
                            0.000, 1.000,  0.000,
                           -0.596, 0.000,  0.803);
    const mat3 rotB = mat3( 1.000, 0.000,  0.000,
                            0.000, 0.707, -0.707,
                            0.000, 0.707,  0.707);
    vec3 pc = rotB * rotA * p;

    // Sin/cos phase trick: 1 fbmV per warp level → vec3 via phase shifts.
    // Saves 4 fbmV calls (12 vnoise taps), imperceptible visual difference.
    float cq1 = fbmV3(pc * 1.4 + vec3(11.2, 3.7, 8.5) + uTime * vec3(0.10, 0.16, 0.07) * spd);
    vec3  cq  = vec3(cq1,
                     sin(cq1 * 6.2831 + 1.3) * 0.5 + 0.5,
                     cos(cq1 * 6.2831 + 2.8) * 0.5 + 0.5);

    float cr1 = fbmV3(pc * 1.3 + cq * 3.2 + vec3(3.3, 7.8, 1.6) + uTime * vec3(0.18, 0.12, 0.22) * spd);
    vec3  cr  = vec3(cr1,
                     sin(cr1 * 6.2831 + 3.1) * 0.5 + 0.5,
                     cos(cr1 * 6.2831 + 5.7) * 0.5 + 0.5);

    float cloud = fbmV5(pc * 1.5 + cr * 3.6 + uTime * vec3(0.07, 0.11, 0.05) * spd);

    // High-frequency filament layer — breaks up blocky edges with fibrous detail
    // reminiscent of sunspot penumbra structure. Modulated by the coarse cloud
    // so it only affects regions near the spot.
    float filament = fbmV3(pc * 7.0 + cr * 1.2 + uTime * vec3(0.22, 0.17, 0.28) * spd);
    float edgeBand = smoothstep(0.32, 0.55, cloud) * (1.0 - smoothstep(0.55, 0.80, cloud));
    cloud = cloud + (filament - 0.35) * 0.22 * edgeBand;

    // Two-level mask: soft penumbra (wide halo) + hard umbra (dark core).
    // Gives spots a realistic falloff instead of a single hard step.
    float penumbra = smoothstep(0.38, 0.58, cloud);
    float umbra    = pow(smoothstep(0.55, 0.74, cloud), 1.6);

    vec3 colorPenumbra = blackbodyColor(uTemperature * 0.62) * 0.55;
    vec3 colorUmbra    = blackbodyColor(uTemperature * 0.42) * 0.20;

    col = applyBlend(col, colorPenumbra, penumbra * uCloudAmount,         uCloudBlend);
    col = applyBlend(col, colorUmbra,    umbra    * uCloudAmount * 0.95,  uCloudBlend);
  }

  // Vertex color tint
  col *= vVertexColor;

  // ── Assombrissement au limbe ──────────────────────────────────
  float NdotV    = max(0.0, dot(normalize(vWorldNormal), normalize(vViewDir)));
  float limbDark = mix(0.15, 1.0, pow(NdotV, 0.5));
  col *= limbDark;

  // ── Corona ────────────────────────────────────────────────────
  vec3  starColor = blackbodyColor(uTemperature);
  float rim       = pow(1.0 - NdotV, mix(8.0, 3.0, uCoronaSize * 2.0));
  vec3  corona    = starColor * rim * uCoronaSize * 3.5;

  // ── Pulsation ─────────────────────────────────────────────────
  // Multi-fréquences + harmoniques pour une pulsation organique
  float flicker = 1.0 + uPulsation * (
    0.18 * sin(uTime * 1.30) +
    0.10 * sin(uTime * 3.70 + 0.8) +
    0.06 * sin(uTime * 7.13 + 1.5) +
    0.04 * sin(uTime * 13.1 + 2.3)
  );

  gl_FragColor = vec4((col + corona) * flicker, 1.0);
}
