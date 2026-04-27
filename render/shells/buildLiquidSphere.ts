/**
 * Opaque liquid-surface sphere — the focused-view liquid shell.
 *
 * Renders as a smooth translucent sphere anchored at "sea level" in world
 * space. Sol hex prisms whose cap sits *above* this radius (land) show
 * through unaffected; caps *below* (submerged tiles) hide behind the
 * liquid sheet, giving the visual of liquid filling the basin.
 *
 * Built on `MeshStandardMaterial` + `onBeforeCompile` so Three.js handles
 * lighting / shadowing and we only inject wave bump-mapping, fresnel /
 * sun-glint highlights, caustics, depth darkening, and runtime-tunable
 * opacity/visibility. Wave / specular / opacity uniforms are read from the
 * caller-supplied {@link GraphicsUniforms} bag (one per body), so a panel
 * slider mutates only this body's liquid shell and not its siblings.
 */

import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BodyConfig } from '../../types/body.types'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import liquidWavesGlsl from '../../shaders/glsl/lib/liquidWaves.glsl?raw'
import { resolveSphereDetail, type RenderQuality } from '../quality/renderQuality'

// Neutral fallbacks used when the caller declares a liquid body but omits the
// colour. Keeps the lib free of any chemistry vocabulary — the caller supplies
// real water / methane / ammonia hues via `color`.
const NEUTRAL_LIQUID_COLOR = new THREE.Color('#2a3a4a')
const NEUTRAL_FROZEN_COLOR = new THREE.Color('#90b0c0')

/** Options for {@link buildLiquidSphere}. */
export interface LiquidSphereConfig {
  /** World-space radius of the liquid surface. Must be positive. */
  radius:    number
  /**
   * Liquid-surface colour. Required for a visible result — the lib no longer
   * carries any substance→colour mapping. When omitted, a neutral slate blue
   * (or pale ice grey when frozen) is used so builds stay deterministic.
   */
  color?:    THREE.ColorRepresentation
  /** Physical state — `'frozen'` swaps to full opacity + desaturated material. */
  liquidState?: 'liquid' | 'frozen' | 'none'
  /** Initial alpha — default `0.78` for liquids, `1.0` for frozen sheets. */
  opacity?:    number
  /** Sphere tessellation. Default 48 — a good smoothness / cost trade-off. */
  segments?:   number
  /** Initial visibility. Default `true`. */
  visible?:    boolean
  /**
   * Per-body graphics-uniform bag — wires the wave / specular / opacity
   * uniforms into the shader and lets `setOpacity` push slider changes
   * without rebuilding the material.
   */
  graphicsUniforms: GraphicsUniforms
  /**
   * Optional render-quality bag. `'high'` bumps the icosphere detail by
   * one (smoother silhouette, smoother fresnel rim). Defaults to standard.
   */
  quality?: RenderQuality
}

/** Handle returned by {@link buildLiquidSphere}. */
export interface LiquidSphereHandle {
  /** Ready-to-add `THREE.Mesh`. */
  mesh: THREE.Mesh
  /** Updates the world-space radius of the liquid surface. Non-positive values hide the mesh. */
  setSeaLevel: (worldRadius: number) => void
  /** Toggles mesh visibility. */
  setVisible:  (on: boolean) => void
  /** Updates the material alpha in `[0, 1]`. Syncs the shader uniform so live rendering follows. */
  setOpacity:  (alpha: number) => void
  /** Advances the internal time uniform that drives wave animation. No-op on frozen sheets. */
  tick:        (elapsed: number) => void
  /** Disposes geometry + material. Idempotent. */
  dispose:     () => void
}

/**
 * Derives a reasonable initial opacity. Frozen sheets are opaque so the
 * underlying ocean-floor sol doesn't bleed through; liquid surfaces stay
 * translucent to hint at the basin relief below.
 */
function defaultOpacity(state: 'liquid' | 'frozen' | 'none'): number {
  return state === 'frozen' ? 1.0 : 0.78
}

/**
 * Injects the animated wave / fresnel / caustic block into a standard
 * material. Only called for non-frozen liquids — a still ice sheet has no
 * rippling to do and the plain PBR model is closer to reality.
 *
 * The time uniform is owned by the caller (via `tickRef`) so every wave
 * function runs in sync with the rest of the body's animation clock.
 */
function injectLiquidShader(
  material:         THREE.MeshStandardMaterial,
  tickRef:          { value: number },
  graphicsUniforms: GraphicsUniforms,
): void {
  material.customProgramCacheKey = () => 'liquid_sphere_waves'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\nvarying vec3 vObjectPos;\n' +
      shader.vertexShader

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'vWorldNormal = normalize(mat3(modelMatrix) * normal);',
      'vWorldPos    = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      'vObjectPos   = transformed;',
    ].join('\n'))

    shader.fragmentShader =
      'varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\nvarying vec3 vObjectPos;\n' +
      'uniform float uTime;\n' +
      'uniform float uWaterEnabled;\n' +
      'uniform float uWaveStrength;\n' +
      'uniform float uWaveSpeed;\n' +
      'uniform float uWaveScale;\n' +
      'uniform float uSpecularIntensity;\n' +
      'uniform float uSpecularSharpness;\n' +
      'uniform float uFresnelPower;\n' +
      'uniform float uLiquidRoughness;\n' +
      'uniform float uDepthDarken;\n' +
      'uniform float uLiquidOpacity;\n' +
      'uniform float uLiquidVisible;\n' +
      'uniform float uFoamThreshold;\n' +
      'uniform vec3  uFoamColor;\n' +
      liquidWavesGlsl +
      'vec3  _cachedWaveNormal = vec3(0.0);\n' +
      'float _cachedWaveH      = 0.0;\n' +
      shader.fragmentShader

    // Override the PBR roughness term — replaces the static `material.roughness`
    // sampled by Three's `<roughnessmap_fragment>` chunk with the live uniform
    // so the panel can dial gloss without rebuilding the material.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      'float roughnessFactor = clamp(uLiquidRoughness, 0.04, 1.0);',
    )

    // Early discard when the liquid shell is hidden — exposes the sea floor.
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'void main() {\n  if (uLiquidVisible < 0.5) discard;\n',
    )

    // Wave bump-mapping — unconditional on the whole sphere. The scale
    // factor (`uWaveScale`) replaces the previously hard-coded 5.0 so the
    // panel can switch from broad ocean swells (scale ≈ 1.5) to tight
    // chop (scale ≈ 12) without rebuilding the material.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n' +
      'if (uWaterEnabled > 0.5) {\n' +
      '  normal = _waveNormal(vObjectPos * uWaveScale, normal, uTime * uWaveSpeed, uWaveStrength);\n' +
      '  _cachedWaveNormal = normal;\n' +
      '  _cachedWaveH      = _waveHeight(vObjectPos * uWaveScale, uTime * uWaveSpeed);\n' +
      '}\n',
    )

    // Animated colour drift + subtle hue shift. No per-tile depth term on a
    // flat liquid shell, so uDepthDarken modulates the base wave-driven
    // luminance instead of a basin-depth factor. Foam tint kicks in on
    // crests above `uFoamThreshold` (clamped to 1 → no foam) so panels can
    // dial whitecap intensity without touching the wave geometry.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' +
      'if (uWaterEnabled > 0.5) {\n' +
      '  float _wH = _cachedWaveH;\n' +
      '  diffuseColor.rgb *= 1.0 + (_wH - 0.5) * 0.12;\n' +
      '  float _t = uTime * uWaveSpeed;\n' +
      '  float _hueNoise = _wNoise(vObjectPos * 3.0 + vec3(_t * 0.015, -_t * 0.010, _t * 0.008));\n' +
      '  vec3 _tealShift = vec3(-0.02, 0.03, 0.04);\n' +
      '  vec3 _deepShift = vec3(-0.01, -0.02, 0.01);\n' +
      '  diffuseColor.rgb += mix(_deepShift, _tealShift, _hueNoise) * 0.35;\n' +
      '  diffuseColor.rgb *= mix(1.0, 0.85, uDepthDarken);\n' +
      '  float _foam = smoothstep(uFoamThreshold, min(1.0, uFoamThreshold + 0.15), _wH);\n' +
      '  diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, _foam);\n' +
      '}\n',
    )

    // Fresnel + sun glint + caustic highlights. The sun direction is
    // approximated by `normalize(-vWorldPos)`, matching the legacy liquid
    // material — correct when the body sits at the scene origin, which is
    // the rendering convention across the codebase.
    // Fresnel + sun-glint + caustics. The hard-coded `5.0` (fresnel power)
    // and `80.0` (specular sharpness) are now panel uniforms so users can
    // jump from "diffuse glow" to "tight metallic glint" without recompile.
    const extra = `
{
  if (uWaterEnabled > 0.5) {
    vec3  _toSun   = normalize(-vWorldPos);
    float _ndl     = dot(vWorldNormal, _toSun);
    float _lit     = smoothstep(-0.10, 0.28, _ndl);
    vec3  _viewDir = normalize(cameraPosition - vWorldPos);
    vec3  _wN      = _cachedWaveNormal;
    float _fresnel = pow(1.0 - max(0.0, dot(_wN, _viewDir)), max(1.0, uFresnelPower));
    float _sunSpec = pow(max(0.0, dot(reflect(-_toSun, _wN), _viewDir)), max(1.0, uSpecularSharpness));
    float _caustic = _waterCaustic(vObjectPos * 6.0, uTime * uWaveSpeed);
    vec3  _waterHL = vec3(0.75, 0.88, 1.0)
      * (_fresnel * 0.08 + _sunSpec * 0.25 * _lit + _caustic * 0.03 * _lit)
      * uSpecularIntensity;
    reflectedLight.directSpecular += _waterHL;
  }
}
`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>' + extra,
    )

    // Runtime-tunable liquid alpha — overrides the material's static opacity
    // so external sliders can change it without rebuilding the material.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'diffuseColor.a = uLiquidOpacity;\n#include <opaque_fragment>',
    )

    shader.uniforms.uTime              = tickRef
    shader.uniforms.uWaterEnabled      = graphicsUniforms.uWaterEnabled
    shader.uniforms.uWaveStrength      = graphicsUniforms.uWaveStrength
    shader.uniforms.uWaveSpeed         = graphicsUniforms.uWaveSpeed
    shader.uniforms.uWaveScale         = graphicsUniforms.uWaveScale
    shader.uniforms.uSpecularIntensity = graphicsUniforms.uSpecularIntensity
    shader.uniforms.uSpecularSharpness = graphicsUniforms.uSpecularSharpness
    shader.uniforms.uFresnelPower      = graphicsUniforms.uFresnelPower
    shader.uniforms.uLiquidRoughness   = graphicsUniforms.uLiquidRoughness
    shader.uniforms.uDepthDarken       = graphicsUniforms.uDepthDarken
    shader.uniforms.uLiquidOpacity     = graphicsUniforms.uLiquidOpacity
    shader.uniforms.uLiquidVisible     = graphicsUniforms.uLiquidVisible
    shader.uniforms.uFoamThreshold     = graphicsUniforms.uFoamThreshold
    shader.uniforms.uFoamColor         = graphicsUniforms.uFoamColor
  }
}

/**
 * Builds a liquid-surface sphere for a body.
 *
 * The sphere geometry is a unit sphere; the world radius is applied via
 * `mesh.scale`. This lets {@link LiquidSphereHandle.setSeaLevel} adjust the
 * radius without rebuilding the geometry.
 *
 * Liquid state carries the animated wave shader; frozen state keeps a plain
 * opaque `MeshStandardMaterial` since still ice has no ripples to draw.
 *
 * @param body - Body configuration — drives colour and state.
 * @param opts - Sphere sizing and visual overrides.
 */
export function buildLiquidSphere(
  body: Pick<BodyConfig, 'liquidState' | 'liquidColor'>,
  opts: LiquidSphereConfig,
): LiquidSphereHandle {
  const state    = body.liquidState ?? 'none'
  const segments = Math.max(6, Math.floor(opts.segments ?? 48))
  // Icosphere instead of UV-sphere: avoids the polar singularity that fanned
  // wave noise into radial streaks. Detail derived from `segments` keeps the
  // legacy poly budget (default 48 → detail 5 ≈ 5120 tris ≈ 48×48 quads).
  // `mergeVertices` reindexes shared vertices to match the prior topology.
  const baseDetail = Math.max(2, Math.min(5, Math.ceil(Math.log2(segments / 4))))
  const detail     = resolveSphereDetail(baseDetail, opts.quality)
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, detail))

  // Colour resolution order: explicit opts.color → body.liquidColor → neutral
  // fallback. Frozen state defaults to ice grey; liquid state to slate blue.
  const frozen = state === 'frozen'
  const color = opts.color !== undefined
    ? new THREE.Color(opts.color)
    : body.liquidColor !== undefined
      ? new THREE.Color(body.liquidColor)
      : (frozen ? NEUTRAL_FROZEN_COLOR.clone() : NEUTRAL_LIQUID_COLOR.clone())

  const initialOpacity = opts.opacity ?? defaultOpacity(state)
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: state !== 'frozen',
    opacity:     initialOpacity,
    depthWrite:  state === 'frozen',
    roughness:   state === 'frozen' ? 0.65 : 0.35,
    metalness:   0.0,
    side:        THREE.FrontSide,
  })

  // Per-instance time uniform — advanced by `tick()`. Wave animations run in
  // sync with the owning body's clock; each liquid sphere has its own ref so
  // frozen sheets and disposed instances don't bleed into one another.
  const timeUniform = { value: 0 }

  // Frozen: plain PBR material, no wave injection. The static ice appearance
  // is what the user expects when the surface is solid.
  if (state !== 'frozen') {
    injectLiquidShader(material, timeUniform, opts.graphicsUniforms)
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder   = -1 // draw before the prism shell so transparent atmo sorts correctly
  mesh.scale.setScalar(Math.max(1e-4, opts.radius))
  // Track caller-driven visibility separately from the geometric "zero
  // radius" gate. The mesh is visible only when both flags allow it —
  // otherwise a sea-level slider movement would silently un-hide a sphere
  // the caller had explicitly set invisible (e.g. in the atmosphere view,
  // where re-showing the mesh leaks blue patches over the playable atmo).
  let userVisible = (opts.visible ?? true)
  mesh.visible = userVisible && opts.radius > 0

  return {
    mesh,
    setSeaLevel(worldRadius) {
      if (!(worldRadius > 0)) {
        mesh.visible = false
        return
      }
      mesh.scale.setScalar(worldRadius)
      // Resolve from user intent — never override a pending setVisible(false).
      mesh.visible = userVisible
    },
    setVisible(on) {
      userVisible  = on
      mesh.visible = on
    },
    setOpacity(alpha) {
      const clamped = Math.max(0, Math.min(1, alpha))
      material.opacity = clamped
      material.transparent = clamped < 1 || state !== 'frozen'
      material.depthWrite  = clamped >= 1
      // Sync the shader uniform so live rendering follows. Scoped to this
      // body's uniform bag — sibling bodies keep their own opacity intact.
      if (state !== 'frozen') {
        opts.graphicsUniforms.uLiquidOpacity.value = clamped
      }
    },
    tick(elapsed) {
      // Advancing the time uniform is the only per-frame cost; frozen sheets
      // skip it entirely since their material has no wave injection reading
      // this ref. Keeping the no-op branch cheap avoids a per-frame call site
      // check from every consumer.
      if (state !== 'frozen') timeUniform.value = elapsed
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
