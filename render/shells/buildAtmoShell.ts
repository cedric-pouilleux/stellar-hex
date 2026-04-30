/**
 * Procedural atmosphere shell — translucent BackSide corona halo
 * mounted just outside the planet's silhouette on rocky / metallic
 * bodies.
 *
 * Orchestrator only — the heavy bits live in dedicated modules:
 *   - {@link ATMO_SHELL_FRAGMENT_SHADER} (in `atmoShellShaders`) carries the
 *     procedural look (FBm + bands + storms + clouds + rim-only mode).
 *   - {@link createAtmoShellPainter} (in `atmoShellPaint`) stamps per-tile
 *     RGB onto the vertex colour buffer via a K-NN blend.
 *   - {@link createAtmoShellHaloMode} (in `atmoShellHaloMode`) collapses the
 *     volumetric shell to a thin rim liseré for the playable-sol view.
 *
 * Gas giants don't use this shell — their smooth sphere already carries
 * the atmospheric look.
 */

import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BodyConfig } from '../../types/body.types'
import type { Tile } from '../../geometry/hexasphere.types'
import { resolveSphereDetail, type RenderQuality } from '../quality/renderQuality'
import { ATMO_SHELL_VERTEX_SHADER, ATMO_SHELL_FRAGMENT_SHADER } from './atmoShellShaders'
import { createAtmoShellPainter, type AtmoShellRGB } from './atmoShellPaint'
import { createAtmoShellHaloMode } from './atmoShellHaloMode'

export type { AtmoShellRGB }

/**
 * Neutral default tint when the caller doesn't push one. Pale sky-blue —
 * reads as "atmospheric" without committing to a thermal class. Callers
 * that want a climate-driven hue derive it caller-side and pass it via
 * {@link AtmoShellConfig.tint}.
 */
const DEFAULT_ATMO_TINT = '#aaccff'

/**
 * Tunable scalar parameters consumed by the atmo shell's procedural
 * fragment shader. Every field is optional; omitted fields keep their
 * current value when passed through {@link AtmoShellHandle.setParams}.
 */
export interface AtmoShellParams {
  /** Overall opacity in `[0, 1]`. */
  opacity?:     number
  /**
   * Strength of multi-scale turbulence — domain-warping FBm distortion
   * applied to the latitude bands. `0` keeps the bands purely
   * latitudinal; `1` shreds them into roiling cells. Defaults to `0.6`.
   */
  turbulence?:  number
  /**
   * Mix factor between latitude bands and free-form turbulence in `[0, 1]`.
   * `1` = pure horizontal bands (gas-giant classic); `0` = pure swirling
   * cells (volcanic / nebula look). Defaults to `0.55`.
   */
  bandiness?:   number
  /**
   * Latitudinal band frequency — `5` = ~5 belts north-to-south. Higher
   * values pack tighter bands. Defaults to `5`.
   */
  bandFreq?:    number
  /**
   * Animation speed multiplier for the drift / turbulence advection.
   * `0` freezes the shell; `2` doubles the rate. Defaults to `1`.
   */
  driftSpeed?:  number
  /**
   * Storm-spot intensity in `[0, 1]` — sprinkles a few rotating
   * Jupiter-style storm cells. `0` disables them. Defaults to `0.25`.
   */
  storms?:      number
  /**
   * High-altitude cloud cover in `[0, 1]`. The cloud layer rides on the
   * atmo shell (formerly painted on the rocky surface itself), so the
   * playable sol stays clean while the cloud cover modulates the
   * atmosphere. `0` disables clouds. Defaults to `0`.
   */
  cloudAmount?: number
  /** Cloud tint, hex string. Defaults to `'#e8eaf0'` (cool overcast white). */
  cloudColor?:  string
  /** Cloud-noise scale (≥ 0.1). Higher = more, smaller clouds. Defaults to `1.2`. */
  cloudScale?:  number
  /**
   * Per-tile colour mix in `[0, 1]` — strength of the painted-tile
   * colour over the body-level tint. `0` keeps the procedural tint
   * pure; `1` lets painted resources fully replace it. Defaults to
   * `0.85`.
   */
  tileColorMix?: number
  /**
   * Body-relative halo tint (hex string, `'#rrggbb'`). Drives the
   * shell's `uTint` uniform — Mars rust, Venus yellow, Pluto glacial
   * blue. Live-patchable via {@link AtmoShellHandle.setParams}.
   */
  tint?:        string
}

/** Handle returned by {@link buildAtmoShell}. */
export interface AtmoShellHandle {
  mesh:    THREE.Mesh
  /** Advances the procedural drift animation. */
  tick:    (elapsed: number) => void
  /** Live-update the shell opacity in `[0, 1]` (no rebuild). */
  setOpacity: (value: number) => void
  /** Toggles visibility without rebuilding. */
  setVisible: (value: boolean) => void
  /** Live-tune the procedural shader params. Unspecified fields keep their value. */
  setParams: (params: AtmoShellParams) => void
  /** Updates `uLightDir` so the day/night terminator tracks the scene's sun. */
  setLight: (direction: THREE.Vector3) => void
  /** `true` flattens diffuse to uniform brightness (Sol-view dome look). */
  setFlatLighting: (enabled: boolean) => void
  /**
   * Toggles "halo mode" — collapses the volumetric shell to a thin
   * fresnel-driven liseré at the atmosphere's outer silhouette, in the
   * pure body tint. See `createAtmoShellHaloMode` for the full contract
   * (baseline restoration semantics).
   */
  setHaloMode: (enabled: boolean) => void
  /**
   * Stamps per-tile RGB into the shell's vertex colour buffer using a
   * K-nearest blend. See `createAtmoShellPainter`.
   *
   * No-op when the shell was built without `tiles` (decorative shell —
   * no gameplay link).
   */
  paintFromTiles: (colors: Map<number, AtmoShellRGB>) => void
  /** Disposes geometry + material. Idempotent. */
  dispose: () => void
}

/** Configuration accepted by {@link buildAtmoShell}. */
export interface AtmoShellConfig {
  config:  BodyConfig
  /** World radius the shell sits at — typically `config.radius`. */
  radius:  number
  /** Initial alpha in `[0, 1]`. */
  opacity: number
  /**
   * Optional override for the body-relative tint (hex string). When
   * omitted, falls back to a neutral pale-blue default. Callers that
   * want a climate-driven hue derive it caller-side and pass it here.
   */
  tint?:   string
  /**
   * Body's hexasphere tiles — when provided, enables the `paintFromTiles`
   * bridge that projects per-tile gas colours from the playable atmo
   * grid onto the shell. Omit for a purely procedural shell with no
   * gameplay link.
   */
  tiles?:  readonly Tile[]
  /**
   * Initial procedural params. Defaults are tuned for a generic temperate
   * atmosphere; gas-giant callers typically push `bandiness` and
   * `bandFreq` higher, while rocky callers push `turbulence` higher and
   * `bandiness` lower so the halo reads as soft cells rather than hard
   * belts.
   */
  params?: AtmoShellParams
  /** Optional render-quality bag — bumps the icosphere detail in `'high'`. */
  quality?: RenderQuality
}

/** Clamps `value` to `[0, 1]`. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Builds the procedural atmosphere shell.
 */
export function buildAtmoShell(input: AtmoShellConfig): AtmoShellHandle {
  const { radius, opacity, tiles, params: initParams } = input
  const tint = new THREE.Color(input.tint ?? DEFAULT_ATMO_TINT)

  // Defaults — generic temperate-atmosphere look. Callers tune via
  // `setParams` (or pass `params` at build) to push toward gas-giant
  // belts, rocky halo cells, etc.
  const turbulence   = clamp01(initParams?.turbulence ?? 0.6)
  const bandiness    = clamp01(initParams?.bandiness  ?? 0.55)
  const bandFreq     = Math.max(0.5, initParams?.bandFreq ?? 5.0)
  const driftSpeed   = Math.max(0,   initParams?.driftSpeed ?? 1.0)
  const storms       = clamp01(initParams?.storms ?? 0.25)
  const cloudAmount  = clamp01(initParams?.cloudAmount ?? 0)
  const cloudColor   = new THREE.Color(initParams?.cloudColor ?? '#e8eaf0')
  const cloudScale   = Math.max(0.1, initParams?.cloudScale ?? 1.2)
  const tileColorMix = clamp01(initParams?.tileColorMix ?? 0.85)

  // Icosahedron at detail 5 (~2562 shared vertices after mergeVertices)
  // — detail 4 left the day/night terminator visibly polygonal in
  // Shader view. `computeVertexNormals` is required to replace the
  // flat-shaded face normals with per-vertex averages so the fresnel
  // rim doesn't read as triangle edges at the silhouette.
  const detail   = resolveSphereDetail(5, input.quality)
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(radius, detail))
  geometry.computeVertexNormals()
  const pos      = geometry.getAttribute('position') as THREE.BufferAttribute

  // Per-vertex colour buffer — initially (0, 0, 0). The shader falls back
  // to the uniform tint until `paintFromTiles` projects a per-tile colour
  // mapping onto the shell.
  const colorAttr = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3)
  geometry.setAttribute('color', colorAttr)

  const painter = createAtmoShellPainter({ pos, colorAttr, tiles })

  const uniforms: Record<string, THREE.IUniform> = {
    uTint:         { value: new THREE.Vector3(tint.r, tint.g, tint.b) },
    uLightDir:     { value: new THREE.Vector3(1, 0.5, 1).normalize() },
    uOpacity:      { value: clamp01(opacity) },
    uTime:         { value: 0 },
    uTurbulence:   { value: turbulence },
    uBandiness:    { value: bandiness },
    uBandFreq:     { value: bandFreq },
    uDriftSpeed:   { value: driftSpeed },
    uStorms:       { value: storms },
    uCloudAmount:  { value: cloudAmount },
    uCloudColor:   { value: new THREE.Vector3(cloudColor.r, cloudColor.g, cloudColor.b) },
    uCloudScale:   { value: cloudScale },
    uTileColorMix: { value: tileColorMix },
    uFlatLighting: { value: 0 },
    uRimOnly:      { value: 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   ATMO_SHELL_VERTEX_SHADER,
    fragmentShader: ATMO_SHELL_FRAGMENT_SHADER,
    transparent:    true,
    depthWrite:     false,
    // BackSide — far-face fragments sit at depth `D + R`, so anything
    // opaque the body draws inside (hex prisms, smooth sphere, liquid)
    // wins the depth test. The shell is then visible only in the corona
    // ring just outside the planet's silhouette.
    side:           THREE.BackSide,
    blending:       THREE.NormalBlending,
  })
  material.visible = uniforms.uOpacity.value > 0

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder   = 1

  const haloMode = createAtmoShellHaloMode({
    uniforms,
    material,
    baseline: {
      opacity:      uniforms.uOpacity.value as number,
      cloudAmount,
      storms,
      tileColorMix,
    },
  })

  return {
    mesh,
    tick(elapsed) { uniforms.uTime.value = elapsed },
    setOpacity(value) {
      const v = clamp01(value)
      uniforms.uOpacity.value = v
      material.visible        = v > 0
    },
    setVisible(value) { mesh.visible = value },
    setParams(p) {
      if (p.opacity    !== undefined) {
        const v = clamp01(p.opacity)
        uniforms.uOpacity.value = v
        material.visible        = v > 0
      }
      if (p.turbulence !== undefined) uniforms.uTurbulence.value = clamp01(p.turbulence)
      if (p.bandiness  !== undefined) uniforms.uBandiness.value  = clamp01(p.bandiness)
      if (p.bandFreq   !== undefined) uniforms.uBandFreq.value   = Math.max(0.5, p.bandFreq)
      if (p.driftSpeed !== undefined) uniforms.uDriftSpeed.value = Math.max(0, p.driftSpeed)
      if (p.storms     !== undefined) uniforms.uStorms.value     = clamp01(p.storms)
      if (p.cloudAmount !== undefined) uniforms.uCloudAmount.value = clamp01(p.cloudAmount)
      if (p.cloudScale  !== undefined) uniforms.uCloudScale.value  = Math.max(0.1, p.cloudScale)
      if (p.cloudColor  !== undefined) {
        const cc = new THREE.Color(p.cloudColor)
        ;(uniforms.uCloudColor.value as THREE.Vector3).set(cc.r, cc.g, cc.b)
      }
      if (p.tileColorMix !== undefined) uniforms.uTileColorMix.value = clamp01(p.tileColorMix)
      if (p.tint         !== undefined) {
        const c = new THREE.Color(p.tint)
        ;(uniforms.uTint.value as THREE.Vector3).set(c.r, c.g, c.b)
      }
    },
    setLight(direction) {
      ;(uniforms.uLightDir.value as THREE.Vector3).copy(direction).normalize()
    },
    setFlatLighting(enabled) {
      uniforms.uFlatLighting.value = enabled ? 1 : 0
    },
    setHaloMode: haloMode.setEnabled,
    paintFromTiles: painter.paintFromTiles,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
