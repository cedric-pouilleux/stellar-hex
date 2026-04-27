import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import noiseGlsl from '../../shaders/glsl/lib/noise.glsl?raw'
import { DEFAULT_CORE_RADIUS_RATIO } from '../../physics/body'
import { resolveSphereDetail, type RenderQuality } from '../quality/renderQuality'

/**
 * Runtime handle returned by {@link buildCoreMesh}. Wraps the molten inner-core
 * sphere mesh, the radiating point-light at its centre, the per-frame
 * animation hook driving both, and a disposal entry point.
 */
export interface CoreMesh {
  mesh:    THREE.Mesh
  /** Pulsing point-light parented to the mesh — escapes the body wherever a sol tile has been mined out. */
  light:   THREE.PointLight
  radius:  number
  /** Advances the fire shader animation and the light's breathing intensity. */
  tick:    (elapsed: number) => void
  dispose: () => void
}

/**
 * Configuration accepted by {@link buildCoreMesh}. `coreRadiusRatio` defaults
 * to {@link DEFAULT_CORE_RADIUS_RATIO} when omitted.
 */
export interface CoreMeshConfig {
  radius:           number
  coreRadiusRatio?: number
  /** Optional render-quality bag — bumps the icosphere detail in `'high'`. */
  quality?:         RenderQuality
}

// ── Light tuning ─────────────────────────────────────────────────
// `intensity` mixes a base value with two desynced sine waves so the
// radiated light feels alive without ever repeating exactly. `distance`
// scales with the core radius so small bodies don't flood their own scene.
const CORE_LIGHT_COLOR          = new THREE.Color(1.0, 0.55, 0.18)
const CORE_LIGHT_BASE_INTENSITY = 6
const CORE_LIGHT_PULSE_AMP      = 2.5
const CORE_LIGHT_PULSE_FREQ     = 1.6
const CORE_LIGHT_DECAY          = 1.5
const CORE_LIGHT_DISTANCE_MULT  = 12

// ── Shader sources ────────────────────────────────────────────────
// Kept inline (rather than under shaders/glsl/) because the core fire
// material is internal to this builder — no consumer outside the body
// shell needs to bind, hot-swap or share these sources.

const VERT = `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = `
precision highp float;
uniform float uTime;
varying vec3  vPos;

${noiseGlsl}

vec3 firePalette(float t) {
  // 0 = deep red, 1 = white-hot. Anchors picked to keep the highlights
  // saturated even when the renderer's tone mapper is aggressive.
  vec3 c0 = vec3(0.18, 0.02, 0.00);
  vec3 c1 = vec3(0.95, 0.20, 0.04);
  vec3 c2 = vec3(1.00, 0.55, 0.08);
  vec3 c3 = vec3(1.00, 0.92, 0.55);
  vec3 c4 = vec3(1.00, 1.00, 0.95);
  vec3 col = mix(c0, c1, smoothstep(0.00, 0.30, t));
  col      = mix(col, c2, smoothstep(0.30, 0.55, t));
  col      = mix(col, c3, smoothstep(0.55, 0.82, t));
  col      = mix(col, c4, smoothstep(0.82, 1.00, t));
  return col;
}

void main() {
  // Sample on the unit-sphere direction so the pattern is independent
  // from the actual core radius.
  vec3 dir = normalize(vPos);
  vec3 p   = dir * 2.5;

  // Slow domain drift + a faster sparkle layer keeps the fire moving
  // at two visible scales: large flowing pockets, fine flickers on top.
  float tSlow = uTime * 0.22;
  float tFast = uTime * 0.55;
  float n     = warpedFBM(p + vec3(tSlow, 0.0, -tSlow), 0.6);
  float spark = fbm3(p * 5.0 + vec3(0.0, tFast, 0.0), 2.0, 0.5);

  float heat = smoothstep(0.20, 0.95, n);
  heat       = clamp(heat + (spark - 0.5) * 0.18, 0.0, 1.0);

  vec3 col = firePalette(heat);
  // Push above 1 so the core reads as a light source even without bloom.
  col *= 1.4;

  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * Builds the molten inner-core sphere shared by every non-stellar body.
 *
 * The core sits at `radius * coreRadiusRatio` and is rendered with a
 * procedural fire shader (warped FBM + sparkle layer over a deep-red →
 * white-hot palette). A {@link THREE.PointLight} is parented to the mesh
 * so the light follows the body's transform and only escapes the planet
 * through tiles that have been mined down to band 0.
 *
 * The mesh is non-interactive (`raycast = () => {}`) — tile picking
 * happens on the surrounding sol layer.
 *
 * @param cfg - Core mesh configuration (radius, optional ratio).
 * @returns   The mesh, its accompanying light, world radius, per-frame
 *            tick and a disposal hook.
 */
export function buildCoreMesh(cfg: CoreMeshConfig): CoreMesh {
  const ratio  = cfg.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO
  const radius = cfg.radius * ratio

  const mat = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms:       { uTime: { value: 0 } },
    side:           THREE.FrontSide,
    // Keep raw HDR-ish colours intact — the tone mapper would crush the
    // brightest pixels and the core would look chalky instead of incandescent.
    toneMapped:     false,
  })

  // Pure-gas bodies (`coreRadiusRatio = 0`) have no solid core — skip the
  // sphere geometry and the point-light so the atmo shell renders over an
  // empty centre. The tick / dispose hooks still fire as no-ops so callers
  // keep a single code path.
  const hasCore = radius > 0
  // Icosphere — uniform topology, no polar pinch on the molten fire shader
  // when it samples 3D noise on the unit-sphere direction. Detail 4 ≈ 1280 tris,
  // half the legacy 48×24 budget but invisible since the core is tiny.
  // `mergeVertices` reindexes shared vertices, matching the prior topology contract.
  const detail = resolveSphereDetail(4, cfg.quality)
  const geo  = hasCore
    ? mergeVertices(new THREE.IcosahedronGeometry(radius, detail))
    : new THREE.BufferGeometry()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.raycast       = () => {}
  mesh.visible       = hasCore

  const light = new THREE.PointLight(
    CORE_LIGHT_COLOR.clone(),
    hasCore ? CORE_LIGHT_BASE_INTENSITY : 0,
    hasCore ? radius * CORE_LIGHT_DISTANCE_MULT : 0,
    CORE_LIGHT_DECAY,
  )
  light.visible = hasCore
  mesh.add(light)

  function tick(elapsed: number): void {
    if (!hasCore) return
    mat.uniforms.uTime.value = elapsed
    // Two desynced sines blend into a non-repeating breathing curve.
    const pulse = Math.sin(elapsed * CORE_LIGHT_PULSE_FREQ)       * 0.6
                + Math.sin(elapsed * CORE_LIGHT_PULSE_FREQ * 1.7) * 0.4
    light.intensity = CORE_LIGHT_BASE_INTENSITY + pulse * CORE_LIGHT_PULSE_AMP
  }

  return {
    mesh,
    light,
    radius,
    tick,
    dispose: () => {
      mesh.remove(light)
      geo.dispose()
      mat.dispose()
    },
  }
}
