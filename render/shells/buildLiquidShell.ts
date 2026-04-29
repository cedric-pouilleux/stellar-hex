/**
 * Hex liquid cap — flat hex tiles laid at the waterline over every
 * submerged tile when the body's surface liquid is in the `liquid` state.
 *
 * Each tile contributes only its **top fan** (no walls): water is a
 * surface, not a column, so there is nothing meaningful to draw between
 * the waterline and the underlying mineral floor. Skipping the walls
 * also avoids the visual clutter that ice-style stacked prisms produce
 * when rendered translucent — neighbour walls would otherwise show
 * through as a thicket of vertical slabs. The mineral floor stays
 * visible through the translucent surface, giving the underwater
 * relief read for free.
 *
 * No mining API on purpose — water cannot be destroyed, so the handle
 * exposes only `setTopElevation` (sea-level slider), `setOpacity`,
 * `setVisible`, `tick` (advances the wave animation) and `dispose`.
 *
 * Substance-agnostic: the caller resolves the liquid identity (h2o,
 * ch4, …) and pushes a single tint via {@link LiquidShellConfig.color}.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { TerrainLevel } from '../types/terrain.types'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import liquidWavesGlsl from '../../shaders/glsl/lib/liquidWaves.glsl?raw'
import {
  buildHexShellGeometry, writeTilePrism,
} from './hexShellGeometry'

// ── Public types ──────────────────────────────────────────────────

/** Inputs for {@link buildLiquidShell}. */
export interface LiquidShellConfig {
  /** Tiles eligible for the cap — typically every tile below the waterline. */
  tiles:                readonly Tile[]
  /** Per-tile underlying mineral elevation in band space (wall start). */
  baseElevation:        ReadonlyMap<number, number>
  /** Uniform top elevation in band space — the waterline. */
  topElevation:         number
  /** Palette feeding the band → world-height conversion (must match the sol mesh). */
  palette:              TerrainLevel[]
  /** World-space surface radius of the body (= `BodyConfig.radius`). */
  bodyRadius:           number
  /** World-space radius of the inner core sphere. */
  coreRadius:           number
  /** Resolved liquid tint (caller-owned chemistry). */
  color:                THREE.ColorRepresentation
  /** Initial alpha in `[0, 1]` — defaults to 0.78 (translucent water). */
  opacity?:             number
  /**
   * Per-body graphics-uniform bag — wires the wave / specular / opacity
   * uniforms into the shader and lets `setOpacity` push slider changes
   * without rebuilding the material.
   */
  graphicsUniforms:     GraphicsUniforms
}

/** Handle returned by {@link buildLiquidShell}. */
export interface LiquidShellHandle {
  /** Root group — attach under the body's group. */
  group:        THREE.Group
  /** The merged liquid mesh — single draw call, single material. */
  mesh:         THREE.Mesh
  /** `faceToTileId[i]` returns the tile id of the i-th triangle. */
  faceToTileId: readonly number[]
  /**
   * Re-elevates every prism to a new uniform top band (band space) so
   * the cap surface tracks a moving sea level. Submerged tiles whose
   * base is already at or above the new top end up collapsed.
   */
  setTopElevation: (newTopBand: number) => void
  /**
   * Re-bases the wall start of one or more tiles in band space. Used
   * when the underlying sol cap moves (digging, scripted lift) so the
   * liquid hex follows: a tile dug below the current waterline gains
   * a liquid cap, a tile lifted above it loses it (collapses).
   * Re-uses the last `setTopElevation` request as the clamp ceiling
   * so the cap top stays on the current sea level after the mutation.
   * Unknown tile ids are silently skipped.
   */
  setBaseElevation: (updates: ReadonlyMap<number, number>) => void
  /** Toggles mesh visibility. */
  setVisible:      (on: boolean) => void
  /** Updates the alpha in `[0, 1]`. Syncs the per-body shader uniform. */
  setOpacity:      (alpha: number) => void
  /** Advances the wave animation clock. */
  tick:            (elapsed: number) => void
  /** Releases GPU resources. */
  dispose:         () => void
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Injects the wave shader into a `MeshStandardMaterial`. The shell is
 * built top-fan-only (no walls), so every fragment is on the water
 * surface — wave bump, fresnel, sun glint, caustics and foam all run
 * unconditionally.
 *
 * The time uniform is owned by the caller (via `tickRef`) so every
 * wave function runs in sync with the rest of the body's animation
 * clock; per-body opacity / wave uniforms are read from the supplied
 * graphics-uniform bag.
 */
function injectLiquidShader(
  material:         THREE.MeshStandardMaterial,
  tickRef:          { value: number },
  graphicsUniforms: GraphicsUniforms,
): void {
  material.customProgramCacheKey = () => 'liquid_shell_waves'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vWorldNormal;\n' +
      'varying vec3 vWorldPos;\n' +
      'varying vec3 vObjectPos;\n' +
      shader.vertexShader

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'vWorldNormal = normalize(mat3(modelMatrix) * normal);',
      'vWorldPos    = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      'vObjectPos   = transformed;',
    ].join('\n'))

    shader.fragmentShader =
      'varying vec3  vWorldNormal;\n' +
      'varying vec3  vWorldPos;\n' +
      'varying vec3  vObjectPos;\n' +
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

    // Live roughness override.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      'float roughnessFactor = clamp(uLiquidRoughness, 0.04, 1.0);',
    )

    // Hard discard when the shell is hidden — exposes the sea floor.
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'void main() {\n  if (uLiquidVisible < 0.5) discard;\n',
    )

    // Wave bump-mapping. The shell is top-only so every fragment is on
    // the water surface — the only gate is the master `uWaterEnabled`.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n' +
      'if (uWaterEnabled > 0.5) {\n' +
      '  normal = _waveNormal(vObjectPos * uWaveScale, normal, uTime * uWaveSpeed, uWaveStrength);\n' +
      '  _cachedWaveNormal = normal;\n' +
      '  _cachedWaveH      = _waveHeight(vObjectPos * uWaveScale, uTime * uWaveSpeed);\n' +
      '}\n',
    )

    // Animated colour drift + foam tint.
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

    // Fresnel + sun glint + caustics. Sun direction approximated by
    // `normalize(-vWorldPos)` (body sits at origin).
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

    // Runtime-tunable alpha — overrides `material.opacity` so external
    // sliders can change it without rebuilding the material.
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

// ── Builder ───────────────────────────────────────────────────────

/**
 * Builds the merged hex liquid cap and returns a non-mineable handle.
 *
 * Tiles missing from `baseElevation`, or whose base sits at or above
 * `topElevation`, are silently skipped. Empty input produces a hidden
 * placeholder mesh so callers can unconditionally hold the handle.
 */
export function buildLiquidShell(config: LiquidShellConfig): LiquidShellHandle {
  const {
    tiles, baseElevation, topElevation, palette, bodyRadius, coreRadius,
    color, graphicsUniforms,
  } = config
  const initialOpacity = config.opacity ?? 0.78

  const group = new THREE.Group()
  group.name  = 'liquid-shell'

  const shell = buildHexShellGeometry({
    tiles, baseElevation, topElevation, palette, bodyRadius, coreRadius,
    topOnly: true,
  })

  const tickRef = { value: 0 }

  if (!shell) {
    const empty = new THREE.BufferGeometry()
    const mat   = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: initialOpacity })
    const mesh  = new THREE.Mesh(empty, mat)
    mesh.visible = false
    group.add(mesh)
    return {
      group, mesh,
      faceToTileId:     [],
      setTopElevation:  () => { /* no-op */ },
      setBaseElevation: () => { /* no-op */ },
      setVisible:       () => { /* no-op */ },
      setOpacity:       () => { /* no-op */ },
      tick:             () => { /* no-op */ },
      dispose() {
        empty.dispose()
        mat.dispose()
      },
    }
  }

  const { merged, slots, slotByTileId, faceToTileId, positionAttr, normalAttr, heightOffset, currentTopBand } = shell
  const positions = positionAttr.array as Float32Array
  const normals   = normalAttr.array   as Float32Array

  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity:     initialOpacity,
    depthWrite:  initialOpacity >= 1,
    roughness:   0.35,
    metalness:   0.0,
    side:        THREE.FrontSide,
  })
  injectLiquidShader(material, tickRef, graphicsUniforms)
  // Seed the per-body opacity uniform so the shader-driven alpha matches
  // `material.opacity` from the very first frame.
  graphicsUniforms.uLiquidOpacity.value = initialOpacity

  const mesh = new THREE.Mesh(merged, material)
  mesh.name           = 'liquid-shell-mesh'
  mesh.frustumCulled  = false
  group.add(mesh)

  // Tracks the most recent caller-requested top — separate from
  // `currentTopBand`, which carries the *clamped* value already written
  // into the buffer. `setBaseElevation` reuses this raw request so a
  // tile dropping below the waterline picks the live sea level as its
  // new top, rather than the now-stale clamp left by the previous build.
  let lastTopRequest = topElevation

  return {
    group, mesh, faceToTileId,
    setTopElevation(newTopBand) {
      lastTopRequest = newTopBand
      let touched = false
      for (const slot of slots) {
        const cur = currentTopBand.get(slot.tile.id)
        if (cur === undefined) continue
        const clamped = Math.max(slot.baseBand, newTopBand)
        if (clamped === cur) continue
        writeTilePrism(positions, normals, slot, clamped, palette, heightOffset, true)
        currentTopBand.set(slot.tile.id, clamped)
        touched = true
      }
      if (touched) {
        positionAttr.needsUpdate = true
        normalAttr.needsUpdate   = true
      }
    },
    setBaseElevation(updates) {
      if (updates.size === 0) return
      let touched = false
      for (const [tileId, newBaseBand] of updates) {
        const slot = slotByTileId.get(tileId)
        if (!slot) continue
        if (slot.baseBand === newBaseBand) continue
        slot.baseBand = newBaseBand
        const clamped = Math.max(newBaseBand, lastTopRequest)
        // Always re-extrude: even when `clamped` matches the previous
        // currentTopBand, the wall start moved, so the prism shape
        // changed (a top-only shell collapses to a different point).
        writeTilePrism(positions, normals, slot, clamped, palette, heightOffset, true)
        currentTopBand.set(tileId, clamped)
        touched = true
      }
      if (touched) {
        positionAttr.needsUpdate = true
        normalAttr.needsUpdate   = true
      }
    },
    setVisible(on) {
      mesh.visible = on
    },
    setOpacity(alpha) {
      const clamped = Math.max(0, Math.min(1, alpha))
      material.opacity     = clamped
      material.transparent = clamped < 1
      material.depthWrite  = clamped >= 1
      material.needsUpdate = true
      graphicsUniforms.uLiquidOpacity.value = clamped
    },
    tick(elapsed) {
      tickRef.value = elapsed
    },
    dispose() {
      merged.dispose()
      material.dispose()
    },
  }
}
