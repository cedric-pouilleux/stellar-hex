precision highp float;

uniform float uTime;
uniform vec3  uNoiseSeed;   // per-planet domain offset (from body variation)
uniform float uNoiseFreq;   // global surface frequency multiplier
uniform float uMetalness;
uniform float uRoughness;
uniform vec3  uColorA;
uniform vec3  uColorB;

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
varying vec2  vUv;
varying vec3  vVertexColor;

#include ../lib/noise.glsl
#include ../lib/lighting.glsl
#include ../lib/cracks.glsl
#include ../lib/lava.glsl

void main() {
  vec3 p = vPosition * uNoiseFreq + uNoiseSeed * 0.01;

  // ── Surface texture — FBM brightness variation ────────────────
  float surfaceVar = fbm(p * 2.5) * 0.4 + gnoise(p * 8.0) * 0.25 + gnoise(p * 14.0) * 0.15;
  surfaceVar = clamp(surfaceVar, 0.0, 1.0);

  // Physics color tint (composition + temperature-driven warm/cool shift)
  vec3 proceduralTint = mix(uColorA, uColorB, smoothstep(0.30, 0.80, surfaceVar));

  // Vertex color (tile geological composition) is the primary color source.
  // Procedural tint adds a subtle physics-driven warm/cool overlay (20%).
  // Brightness is modulated by the surface FBM for micro-texture.
  vec3 baseColor = mix(vVertexColor, proceduralTint, 0.20) * (0.75 + surfaceVar * 0.50);

  // Micro-roughness detail
  float microNoise = gnoise(p * 20.0) * (1.0 - uMetalness) * 0.08;
  baseColor = clamp(baseColor + microNoise, 0.0, 1.0);

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
