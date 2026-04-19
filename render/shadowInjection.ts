import * as THREE from 'three'
import type { ShadowUniforms, OccluderUniforms } from './useHexasphereMesh'
import { SHADOW_SUN_RADIUS } from '../config/render'

// ── Uniform declarations + helpers prepended to every patched fragment shader ─

const UNIFORM_DEFS = /* glsl */`
uniform mat4  modelMatrix;
uniform vec3  uOccluderPos;
uniform float uOccluderRadius;
uniform vec3  uShadowCasterPos;
uniform float uShadowCasterRadius;

// 5th-order smootherstep (C2-continuous) — sharper transition than smoothstep
float _smootherstep(float e0, float e1, float x) {
  float t = clamp((x - e0) / max(e1 - e0, 1e-5), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
`

// ── Shadow GLSL injected just before the closing } of main() ─────────────────
// Both shadow types share the world-position of the current fragment (_wPos).
// Physical penumbra: the shadow edge width grows with distance from the caster
// based on the sun's angular diameter, producing realistic umbra + penumbra.

const SHADOW_CODE = /* glsl */`
{
  const float _SUN_R = ${SHADOW_SUN_RADIUS.toFixed(1)};  // sun radius (world units)
  vec3 _wPos = (modelMatrix * vec4(vPosition, 1.0)).xyz;

  // ── Eclipse shadow — another body blocks the sun from this planet ──────────
  if (uOccluderRadius > 0.0) {
    // Direction from sun (origin) toward this fragment
    vec3  _occDir  = normalize(_wPos);
    // Projection of occluder centre onto that ray
    float _tCA     = dot(uOccluderPos, _occDir);

    if (_tCA > 0.0) {
      // How far is this fragment behind the occluder along that axis?
      float _behind  = max(0.0, length(_wPos) - _tCA);
      float _occDist = length(uOccluderPos);

      // Penumbra radius grows linearly with distance (sun angular radius effect)
      float _growth    = _behind * _SUN_R / max(_occDist, 0.01);
      float _umbraR    = uOccluderRadius - _growth;  // < 0 → antumbra region
      float _penumbraR = uOccluderRadius + _growth;

      // Perpendicular distance from occluder axis to this fragment
      vec3  _perp    = uOccluderPos - _tCA * _occDir;
      float _perpLen = length(_perp);

      // Shadow intensity — smootherstep for sub-pixel-soft edges
      float _sf = 1.0 - _smootherstep(_umbraR, _penumbraR, _perpLen);

      // Full umbra: 95 % darkness. Antumbra: scale down by how far past the tip.
      float _maxDark = (_umbraR > 0.0)
        ? 0.95
        : 0.95 * clamp(1.0 + _umbraR / max(_growth, 0.001), 0.0, 1.0);

      gl_FragColor.rgb *= 1.0 - _sf * _maxDark;
    }
  }

  // ── Satellite disc shadow — child body casts penumbra on this surface ───────
  if (uShadowCasterRadius > 0.0) {
    // Direction from this fragment toward the sun
    vec3  _sunDir  = normalize(-_wPos);
    // Vector from this fragment to the satellite
    vec3  _toSat   = uShadowCasterPos - _wPos;
    float _tCA     = dot(_toSat, _sunDir);

    if (_tCA > 0.0) {
      float _satDist = length(uShadowCasterPos);

      // Penumbra grows with distance behind the satellite
      float _growth    = _tCA * _SUN_R / max(_satDist, 0.01);
      float _umbraR    = uShadowCasterRadius - _growth;
      float _penumbraR = uShadowCasterRadius + _growth;

      vec3  _perp    = _toSat - _tCA * _sunDir;
      float _perpLen = length(_perp);

      float _sf = 1.0 - _smootherstep(_umbraR, _penumbraR, _perpLen);
      gl_FragColor.rgb *= 1.0 - _sf * 0.95;
    }
  }
}
`

/**
 * Patch a BodyMaterial's underlying ShaderMaterial with shadow/eclipse code.
 *
 * The function MUST be called before the material is used for the first time
 * (i.e. before the first render). It:
 *   1. Prepends uniform declarations + smootherstep helper to the fragment shader.
 *   2. Injects the shadow GLSL block right before the closing } of main().
 *   3. Wires the uniform { value } objects to the same references used by
 *      ShadowUpdater and OccluderUpdater — no extra per-frame work needed.
 */
export function injectPlanetShadows(
  mat:      THREE.ShaderMaterial,
  occluder: OccluderUniforms,
  shadow:   ShadowUniforms,
): void {
  // Idempotent guard — skip if already patched
  if (mat.uniforms.uOccluderRadius) return

  // Insert declarations AFTER the precision statement
  // (precision must be the very first token in a WebGL fragment shader)
  const withUniforms = mat.fragmentShader.replace(
    /(precision\s+\w+\s+float\s*;)/,
    `$1\n${UNIFORM_DEFS}`,
  )
  if (withUniforms === mat.fragmentShader) {
    console.warn('[shadowInjection] precision statement not found — uniform declarations not injected')
  }
  mat.fragmentShader = withUniforms

  // Insert shadow code before the very last } of main()
  const withShadow = mat.fragmentShader.replace(/\}(\s*)$/, SHADOW_CODE + '\n}$1')
  if (withShadow === mat.fragmentShader) {
    console.warn('[shadowInjection] closing brace not found — shadow code not injected')
  }
  mat.fragmentShader = withShadow

  // Share the same { value: ... } objects → auto-synced by ShadowUpdater/OccluderUpdater
  mat.uniforms.uOccluderPos        = occluder.pos
  mat.uniforms.uOccluderRadius     = occluder.radius
  mat.uniforms.uShadowCasterPos    = shadow.pos
  mat.uniforms.uShadowCasterRadius = shadow.radius

  mat.needsUpdate = true
}

