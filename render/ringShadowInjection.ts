import * as THREE from 'three'
import type { RingVariation } from './ringVariation'

/**
 * Patches a planet's ShaderMaterial with ring-cast-on-planet shadowing.
 *
 * The shader ray-casts from each fragment toward the sun and, if the ray
 * crosses the ring plane inside [innerR, outerR], samples the same profile
 * used by {@link BodyRings} to attenuate the surface lighting.
 *
 * This follows the same "prepend uniforms + inject before main's closing brace"
 * pattern as {@link injectPlanetShadows} so both injections compose cleanly.
 *
 * @param mat  - Planet ShaderMaterial (must be patched BEFORE first render).
 * @param ring - The ring variation driving the shadow pattern.
 * @param opts - Optional overrides. `sunPosRef` lets preview scenes point the
 *               shader at a light source other than the world origin.
 */
export function injectRingShadow(
  mat:  THREE.ShaderMaterial,
  ring: RingVariation,
  opts?: {
    /** Shared `{ value }` reference for the sun world position. Defaults to origin. */
    sunPosRef?: { value: THREE.Vector3 }
    /** Planet visual radius — used to resolve ring inner/outer world radii. */
    planetRadius: number
  },
): void {
  if (mat.uniforms.uRingInnerR) return  // idempotent

  const planetRadius = opts?.planetRadius ?? 1.0
  const innerR = planetRadius * ring.innerRatio
  const outerR = planetRadius * ring.outerRatio

  // ── Ring plane normal in the PLANET LOCAL frame ─────────────────────────
  // Ring lies in the planet's equatorial plane (XZ), so its normal in the
  // planet-local frame is simply +Y.
  const ringNormalLocal = new THREE.Vector3(0, 1, 0)

  const [p0, p1, p2, p3, p4, p5, p6, p7] = ring.profile

  // ── GLSL blocks ────────────────────────────────────────────────────────
  const UNIFORMS = /* glsl */`
uniform vec3  uRingNormalLocal;
uniform float uRingInnerR;
uniform float uRingOuterR;
uniform vec4  uRingProfileA;
uniform vec4  uRingProfileB;
uniform float uRingBandFreq;
uniform float uRingBandContrast;
uniform float uRingDustiness;
uniform float uRingOpacity;
uniform float uRingNoiseSeed;
uniform vec3  uRingSunWorldPos;

float _ringSampleProfile(float t) {
  float x = clamp(t, 0.0, 1.0) * 7.0;
  float i = floor(x);
  float f = x - i;
  float sA, sB;
  if      (i < 1.0) { sA = uRingProfileA.x; sB = uRingProfileA.y; }
  else if (i < 2.0) { sA = uRingProfileA.y; sB = uRingProfileA.z; }
  else if (i < 3.0) { sA = uRingProfileA.z; sB = uRingProfileA.w; }
  else if (i < 4.0) { sA = uRingProfileA.w; sB = uRingProfileB.x; }
  else if (i < 5.0) { sA = uRingProfileB.x; sB = uRingProfileB.y; }
  else if (i < 6.0) { sA = uRingProfileB.y; sB = uRingProfileB.z; }
  else              { sA = uRingProfileB.z; sB = uRingProfileB.w; }
  return mix(sA, sB, f);
}
float _ringHash1(float x) {
  return fract(sin(x * 12.9898 + uRingNoiseSeed * 0.1731) * 43758.5453);
}
float _ringVnoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(_ringHash1(i), _ringHash1(i + 1.0), f);
}
float _ringFbm1(float x) {
  float v = 0.0;
  float a = 0.5;
  float w = 1.0;
  for (int k = 0; k < 4; k++) {
    v += a * _ringVnoise1(x * w);
    w *= 2.17;
    a *= 0.5;
  }
  return v;
}
`

  // Injected before the final `}` of main(). Reuses modelMatrix/vPosition
  // already present in every BodyMaterial fragment shader.
  const CODE = /* glsl */`
{
  // Fragment and planet in WORLD space
  vec3 _rfWPos   = (modelMatrix * vec4(vPosition, 1.0)).xyz;
  vec3 _rfPC     = modelMatrix[3].xyz;                                 // planet world centre
  vec3 _rfN      = normalize(mat3(modelMatrix) * uRingNormalLocal);    // ring normal world
  vec3 _rfSunDir = normalize(uRingSunWorldPos - _rfWPos);

  float _rfDenom = dot(_rfSunDir, _rfN);
  if (abs(_rfDenom) > 1e-4) {
    float _rfT = dot(_rfPC - _rfWPos, _rfN) / _rfDenom;
    float _rfSunDist = length(uRingSunWorldPos - _rfWPos);
    if (_rfT > 0.0 && _rfT < _rfSunDist) {
      vec3  _rfHit = _rfWPos + _rfT * _rfSunDir;
      float _rfR   = length(_rfHit - _rfPC);
      if (_rfR > uRingInnerR && _rfR < uRingOuterR) {
        float _rfTt    = (_rfR - uRingInnerR) / max(uRingOuterR - uRingInnerR, 1e-4);
        float _rfMacro = _ringSampleProfile(_rfTt);
        float _rfMicro = _ringFbm1(_rfTt * uRingBandFreq);
        _rfMicro       = mix(0.5, _rfMicro, uRingBandContrast);
        float _rfDens  = _rfMacro * (0.55 + 0.45 * _rfMicro);
        _rfDens        = mix(_rfDens, _rfMacro * 0.7, uRingDustiness);
        float _rfEdge  = smoothstep(0.0, 0.04, _rfTt) * (1.0 - smoothstep(0.96, 1.0, _rfTt));
        float _rfShade = _rfDens * _rfEdge * uRingOpacity * 0.85;
        gl_FragColor.rgb *= 1.0 - _rfShade;
      }
    }
  }
}
`

  // ── Patch the shader ────────────────────────────────────────────────────
  // Uniform block goes after the leading precision statement to respect WebGL1 rules.
  const withUniforms = mat.fragmentShader.replace(
    /(precision\s+\w+\s+float\s*;)/,
    `$1\n${UNIFORMS}`,
  )
  if (withUniforms === mat.fragmentShader) {
    console.warn('[ringShadowInjection] precision statement not found — uniforms not injected')
  }
  mat.fragmentShader = withUniforms

  const withCode = mat.fragmentShader.replace(/\}(\s*)$/, CODE + '\n}$1')
  if (withCode === mat.fragmentShader) {
    console.warn('[ringShadowInjection] main() closing brace not found — code not injected')
  }
  mat.fragmentShader = withCode

  // ── Uniforms ────────────────────────────────────────────────────────────
  mat.uniforms.uRingNormalLocal  = { value: ringNormalLocal }
  mat.uniforms.uRingInnerR       = { value: innerR }
  mat.uniforms.uRingOuterR       = { value: outerR }
  mat.uniforms.uRingProfileA     = { value: new THREE.Vector4(p0, p1, p2, p3) }
  mat.uniforms.uRingProfileB     = { value: new THREE.Vector4(p4, p5, p6, p7) }
  mat.uniforms.uRingBandFreq     = { value: ring.bandFreq }
  mat.uniforms.uRingBandContrast = { value: ring.bandContrast }
  mat.uniforms.uRingDustiness    = { value: ring.dustiness }
  mat.uniforms.uRingOpacity      = { value: ring.opacity }
  mat.uniforms.uRingNoiseSeed    = { value: ring.noiseSeed }
  mat.uniforms.uRingSunWorldPos  = opts?.sunPosRef ?? { value: new THREE.Vector3(0, 0, 0) }

  mat.needsUpdate = true
}
