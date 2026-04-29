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

// Tempêtes — 3 vortex ovales déterministes du seed (taches type Jupiter).
// `uStormStrength = 0` désactive la couche (court-circuit total).
//   - uStormColor      : couleur dédiée du vortex (indépendante du palette gaz)
//   - uStormSize       : multiplicateur sur le rayon des 3 vortex
//   - uStormEyeStrength: intensité de l'œil sombre central (0 = pas d'œil)
uniform float uStormStrength;
uniform vec3  uStormColor;
uniform float uStormSize;
uniform float uStormEyeStrength;

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

  // ── Storm vortices ────────────────────────────────────────
  // 3 vortex max, position/taille/intensité dérivées du seed via hash3.
  // Structure à 3 zones par vortex pour un rendu plus 3D :
  //   - corona  : bordure douce, prend la couleur uColorC légèrement
  //   - core    : corps saturé, sur-éclairci en uColorC
  //   - eye     : œil sombre central (œil de cyclone)
  // Le mask est combiné en max() pour que des vortex chevauchants ne
  // s'additionnent pas en sur-luminance. Court-circuit complet quand
  // `uStormStrength == 0`.
  float stormCorona = 0.0;
  float stormCore   = 0.0;
  float stormEye    = 0.0;
  float stormSwirl  = 0.0;
  float stormSpiral = 0.0;
  if (uStormStrength > 0.001) {
    vec3 unitPos = normalize(vPosition);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec3  h        = hash3(vec3(uSeed * 0.013 + fk * 7.7, fk * 1.3, fk * 2.1));
      float clat     = (h.x - 0.5) * 1.2;             // [-0.6, +0.6] — évite les pôles
      float clon     = h.y * 6.2831853;
      // Rayon élargi pour des taches lisibles à distance, modulé par
      // `uStormSize` (slider — 0.3 = petits ovales, 2.5 = grosses bandes).
      float radius   = mix(0.10, 0.28, h.z) * uStormSize;
      float intensity = hash1(uSeed * 0.013 + fk * 11.3);
      // Sens de rotation par vortex (binaire pour rester stable)
      float spin     = intensity > 0.5 ? 1.0 : -1.0;
      // Vecteur cardinal du centre du vortex sur la sphère unité
      float cy = sin(clat), cr = cos(clat);
      vec3  centerDir = vec3(cos(clon) * cr, cy, sin(clon) * cr);
      // Bordure du vortex perturbée par un fbm faible-fréquence — évite
      // l'aspect "disque parfait" et donne une lecture organique.
      float jitter   = (gnoise(unitPos * 4.0 + vec3(fk * 3.7)) - 0.5) * 0.06;
      float angDist  = 1.0 - dot(unitPos, centerDir) + jitter;
      // 3 zones concentriques. `corona` couvre toute la tache, `core` ~60%
      // central, `eye` ~25% au centre.
      float corona   = smoothstep(radius,        0.0, angDist) * intensity;
      float core     = smoothstep(radius * 0.55, 0.0, angDist) * intensity;
      float eye      = smoothstep(radius * 0.22, 0.0, angDist) * intensity;
      stormCorona = max(stormCorona, corona);
      stormCore   = max(stormCore,   core);
      stormEye    = max(stormEye,    eye);
      // Phase angulaire autour du centre — module la lat (bend des bandes)
      // ET produit un motif spirale animé visible dans le corps du vortex.
      vec3 tangent = unitPos - centerDir * dot(unitPos, centerDir);
      float ang    = atan(tangent.y, tangent.x + 1e-5);
      stormSwirl  += corona * sin(ang * 2.0 + tJet * 1.8) * spin * 0.18;
      // Phase spirale (logarithmique) animée dans le sens du vortex —
      // rend visible la rotation interne du tourbillon.
      float spiralPhase = ang * 3.0 - angDist * 12.0 * spin + tJet * 2.5 * spin;
      stormSpiral = max(stormSpiral, core * (sin(spiralPhase) * 0.5 + 0.5));
    }
    float s = uStormStrength;
    stormCorona *= s;
    stormCore   *= s;
    stormEye    *= s;
    stormSwirl  *= s;
    // Bend les bandes localement — `latWarped` est encore consommé ci-dessous.
    latWarped += stormSwirl;
  }

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

  // ── Storm vortex colour overlay ─────────────────────────────
  // Couleur tempête dédiée (`uStormColor`) — indépendante du palette gaz
  // pour rester lisible quel que soit le preset (les palettes brunes
  // rendaient les vortex sombres). 3 couches : couronne large, cœur
  // saturé modulé par la spirale animée, œil sombre central pilotable.
  if (stormCorona > 0.0) {
    // Bordure large : tint subtil
    bandColor = mix(bandColor, uStormColor * 1.10, stormCorona * 0.55);
    // Corps saturé, modulé par la spirale (donne le mouvement rotatif)
    vec3 coreCol = mix(uStormColor * 1.20, uStormColor * 1.60, stormSpiral);
    bandColor    = mix(bandColor, coreCol, stormCore * 0.90);
    // Œil de cyclone : assombrit vers une version foncée de la couleur
    // tempête. Désactivable via `uStormEyeStrength = 0`.
    bandColor    = mix(bandColor, uStormColor * 0.30, stormEye * uStormEyeStrength);
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
