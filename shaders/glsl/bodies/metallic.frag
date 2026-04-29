precision highp float;

uniform float uTime;
uniform vec3  uNoiseSeed;   // per-planet domain offset (from body variation)
uniform float uNoiseFreq;   // global surface frequency multiplier
uniform float uMetalness;
uniform float uRoughness;
uniform float uTurbulence;
/** Terrain archetype index — 0 smooth, 1 ridged, 2 billow, 3 hybrid. Same uniform as `body.vert`. */
uniform float uTerrainArchetype;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uColorMix;

// Craters
uniform float uSeed;
uniform float uCraterDensity;
uniform float uCraterCount;
uniform vec3  uCraterColor;
uniform float uCraterColorMix;

// Fissures
uniform float uCrackAmount;
uniform float uCrackScale;
uniform float uCrackWidth;
uniform float uCrackDepth;
uniform vec3  uCrackColor;
uniform float uCrackBlend;

// Lave
uniform float uLavaAmount;
uniform vec3  uLavaColor;
uniform float uLavaEmissive;
uniform float uLavaScale;
uniform float uLavaWidth;

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
varying vec3  vVertexColor;

#include ../lib/noise.glsl
#include ../lib/lighting.glsl
#include ../lib/cracks.glsl
#include ../lib/lava.glsl

// 2-stop procedural palette — `colorA` (base) for low-noise zones,
// `colorB` (accent) for high-noise zones. Smooth interpolation.
vec3 proceduralPalette(float t) {
  return mix(uColorA, uColorB, clamp(t, 0.0, 1.0));
}

// Crater shape function (inverted quartic profile) — same impact field
// as the rocky shader so metallic bodies can carry impact craters with
// independent colour control via `uCraterColor` + `uCraterColorMix`.
float craterShape(float d, float r) {
  float x = d / r;
  if (x > 1.0) return 0.0;
  return (1.0 - x * x) * (1.0 - x * x);
}

float craterField(vec3 p, float density, float depth) {
  float result = 0.0;
  float baseFreq = uCraterCount;
  vec3  seedOff  = vec3(uSeed * 0.01);

  // Scale 0: large craters
  {
    vec2  v     = voronoi(p * baseFreq + seedOff);
    float shape = craterShape(v.x, 0.35);
    float rim   = smoothstep(0.3, 0.42, v.x) * smoothstep(0.5, 0.42, v.x);
    result += (shape * -depth + rim * depth * 0.35) * density;
  }
  // Scale 1: medium craters
  {
    float scale = baseFreq * 2.5;
    float d     = density * 0.75;
    vec2  v     = voronoi(p * scale + seedOff);
    float shape = craterShape(v.x, 0.35);
    float rim   = smoothstep(0.3, 0.39, v.x) * smoothstep(0.5, 0.39, v.x);
    result += (shape * -depth + rim * depth * 0.35) * d * 0.5;
  }
  // Scale 2: small craters (fast 8-cell voronoi)
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

  // Optional domain-warp turbulence — perturbs the sampling position with
  // a static fbm so surface noise reads as "boiling" rather than the
  // regular fbm grid. `uTurbulence == 0` short-circuits the cost.
  if (uTurbulence > 0.001) {
    float warpA = fbm(p * 1.8);
    float warpB = fbm(p * 2.5 + vec3(3.7, 1.4, 8.5));
    float warpC = fbm(p * 2.0 + vec3(7.6, 2.3, 4.8));
    p += (vec3(warpA, warpB, warpC) - 0.5) * uTurbulence * 0.6;
  }

  // ── Surface texture — FBM brightness variation ────────────────
  // Macro pattern follows the planet's terrain archetype (ridged for
  // veined alloys, billow for soft oxidation, etc.). High-frequency
  // gnoise layers stay smooth — they read as micro-grain regardless.
  float surfaceVar = fbmArchetype4(p * 2.5, 2.0, 0.5, uTerrainArchetype) * 0.4
                   + gnoise(p * 8.0)  * 0.25
                   + gnoise(p * 14.0) * 0.15;
  surfaceVar = clamp(surfaceVar, 0.0, 1.0);

  // Physics color tint (composition + temperature-driven warm/cool shift).
  // 4-stop palette on the noise field — same shape as the gas shader.
  vec3 proceduralTint = proceduralPalette(surfaceVar);

  // Vertex color (tile geological composition) is the primary color source.
  // Procedural tint mixes in with strength `uColorMix` (slider, default 0.30).
  // Brightness is modulated by the surface FBM for micro-texture.
  vec3 baseColor = mix(vVertexColor, proceduralTint, uColorMix) * (0.75 + surfaceVar * 0.50);

  // Micro-roughness detail
  float microNoise = gnoise(p * 20.0) * (1.0 - uMetalness) * 0.08;
  baseColor = clamp(baseColor + microNoise, 0.0, 1.0);

  // ── Craters ───────────────────────────────────────────────────
  // Sampled in a coordinate space that ignores `uNoiseFreq` and
  // `uTurbulence` so the impact field stays anchored on the body's
  // geometry, not the surface grain. Tinted by the dedicated
  // `uCraterColor` slider (independent from the procedural palette)
  // with strength `uCraterMask × uCraterColorMix`.
  vec3  pCrater    = vPosition + uNoiseSeed * 0.01;
  float craters    = craterField(pCrater, uCraterDensity, 1.0);
  float craterMask = clamp(-craters * uCraterDensity, 0.0, 1.0);
  baseColor = mix(baseColor, uCraterColor, craterMask * uCraterColorMix);

  // ── Fissures ─────────────────────────────────────────────────
  float crackMask = 0.0; // exposed for lava channel seeding
  if (uCrackAmount > 0.0) {
    crackMask = computeCracks(baseColor, p, uCrackAmount, uCrackScale, uCrackWidth, uCrackDepth, uCrackColor, uCrackBlend);
  }

  // ── Simplified PBR lighting ───────────────────────────────────
  // In top-down mode (uFlatLighting=1): NdotL forced to 1.0, specular suppressed.
  float NdotL = mix(diffuse(vWorldNormal, uLightDir), 1.0, uFlatLighting);

  // Approximate GGX specular
  vec3  H       = normalize(uLightDir + vViewDir);
  float NdotH   = max(0.0, dot(normalize(vWorldNormal), H));
  float alpha   = uRoughness * uRoughness;
  float alpha2  = alpha * alpha;
  float denom   = NdotH * NdotH * (alpha2 - 1.0) + 1.0;
  float D       = alpha2 / (3.14159 * denom * denom);

  // Metallic Fresnel (base color tints the specular)
  float fres    = fresnel(vWorldNormal, vViewDir, mix(0.04, 0.9, uMetalness));
  vec3  F       = mix(vec3(fres), baseColor * fres, uMetalness);

  vec3 specColor = D * F * uLightColor * uLightIntensity * NdotL * (1.0 - uFlatLighting);

  // Diffuse (nearly zero for a pure metal)
  vec3 diffColor = baseColor * uLightColor * NdotL * uLightIntensity * (1.0 - uMetalness);
  // Indirect illumination: makes surface pattern, veins and cracks visible across the whole planet
  diffColor += baseColor * uAmbientColor * mix(3.0, 1.5, uMetalness);

  vec3 lit = diffColor + specColor;

  // Simulated environment reflection — metals are reflective, env reveals the surface pattern.
  // 4-octave FBM suffices for the soft env approximation (subtle effect, not primary visual).
  vec3 reflDir    = reflect(-normalize(vViewDir), normalize(vWorldNormal));
  float envSample = fbm4(reflDir * 2.0, 2.0, 0.5) * 0.45;
  lit += baseColor * envSample * uMetalness * uLightIntensity * 0.35;

  // ── Lave ─────────────────────────────────────────────────────
  vec3 lavaEmissiveContrib = vec3(0.0);
  if (uLavaAmount > 0.0) {
    lavaEmissiveContrib = computeLava(baseColor, p, uTime, uLavaAmount, uLavaScale, uLavaWidth, crackMask, uLavaColor, uLavaEmissive);
  }

  // Dim lava on the night side. NdotL is the raw diffuse term; uFlatLighting
  // forces full emission in top-down mode where there's no meaningful sun.
  float lavaNightScale = mix(0.25, 1.0, mix(NdotL, 1.0, uFlatLighting));
  lit += lavaEmissiveContrib * lavaNightScale;

  gl_FragColor = vec4(lit, 1.0);
}
