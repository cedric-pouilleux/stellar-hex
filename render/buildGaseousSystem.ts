import * as THREE from 'three'
import { createObservable } from '../core/observable'
import { generateHexasphere } from '../geometry/hexasphere'
import type { HexasphereData } from '../geometry/hexasphere.types'
import type { BodyConfig, TerrainLevel } from '../types/body.types'
import { initBodySimulation } from '../sim/BodySimulation'
import type { BodySimulation } from '../sim/BodySimulation'
import {
  buildPlanetMesh,
  buildSmoothSphereMesh,
  buildInteractiveMesh,
  buildGasInteriorMesh,
  buildGasSmoothMesh,
  PALETTE_ROCKY_CORE,
} from './useHexasphereMesh'
import type { ShadowUniforms, OccluderUniforms } from './useHexasphereMesh'
import { configToLibParams } from './configToLibParams'
import { injectPlanetShadows } from './shadowInjection'
import { injectRingShadow } from './ringShadowInjection'
import type { BodyVariation } from './bodyVariation'
import { clamp01 } from '../core/math'
// ── Tile size → subdivisions ──────────────────────────────────────
// Shared with useBody — exported so callers can compute tile count independently.

export function tileSizeToSubdivisions(radius: number, tileSize: number): number {
  const N = (4 * Math.PI * radius * radius) / (tileSize * tileSize)
  return Math.max(2, Math.round(Math.sqrt(Math.max(0, (N - 2) / 10))))
}

// ── Gas core config ───────────────────────────────────────────────

/**
 * Builds the rocky inner-core BodyConfig for a gaseous planet.
 * Exported so consumers (e.g. playground stats) can build the same sim.
 *
 * The optional `coreAllowedResources` whitelist narrows the distributor's
 * resource pool on the core — the caller (game side) provides resource-id
 * vocabulary; body stays free of any specific ID. When omitted, the core
 * falls back to pure physics-based compatibility.
 */
export function buildGasCoreConfig(
  gasConfig:             BodyConfig,
  coreRadius:            number,
  coreAllowedResources?: string[],
): BodyConfig {
  const gasAvgC = (gasConfig.temperatureMin + gasConfig.temperatureMax) / 2
  const coreAvg = Math.max(-50, Math.min(100, gasAvgC * 0.25))
  return {
    name:                gasConfig.name + '_core',
    type:                'rocky',
    radius:              coreRadius,
    temperatureMin:      Math.round(coreAvg - 60),
    temperatureMax:      Math.round(coreAvg + 60),
    rotationSpeed:       gasConfig.rotationSpeed,
    axialTilt:           gasConfig.axialTilt,
    atmosphereThickness: 0,
    waterCoverage:       0,
    noiseScale:          (gasConfig.noiseScale ?? 1.4) * 1.5,
    resourceDensity:     gasConfig.resourceDensity,
    allowedResources:    coreAllowedResources,
  }
}

// ── Gas palette tinting ───────────────────────────────────────────

/**
 * Applies warm/cool shift + luminance from variation to a gas palette copy.
 * Each gas planet gets unique vertex colors even when the base preset is shared.
 */
export function tintGasPalette(levels: TerrainLevel[], variation: BodyVariation): TerrainLevel[] {
  const mix       = variation.gasColorMix  ?? 0.5
  const lum       = variation.gasLuminance ?? 1.0
  const warmShift = (mix - 0.5) * 0.30
  return levels.map(level => ({
    ...level,
    color: new THREE.Color(
      clamp01(level.color.r * lum * (1 + warmShift * 0.8)),
      clamp01(level.color.g * lum * (1 + warmShift * 0.1)),
      clamp01(level.color.b * lum * (1 - warmShift * 0.7)),
    ),
  }))
}

// ── Gaseous system builder ────────────────────────────────────────
// Dual-layer system:
//   smooth mode  → animated gas sphere + rocky core sphere
//   hex gas      → hex tiles at config.radius (atmospheric resources)
//   hex core     → hex tiles at coreRadius    (rocky/metallic resources)

export interface GaseousSystemInput {
  config:          BodyConfig
  data:            HexasphereData
  gasSim:          BodySimulation
  palette:         TerrainLevel[]        // base gas palette (untinted)
  variation:       BodyVariation
  tileSize:        number
  group:           THREE.Group
  shadowUniforms:  ShadowUniforms
  occluderUniforms: OccluderUniforms
  getSunPos?:      () => THREE.Vector3
  /**
   * Resource IDs allowed on the rocky core. Forwarded to
   * {@link buildGasCoreConfig}; body stays free of any specific ID.
   * When omitted, the core relies on physics-based compatibility only.
   */
  coreAllowedResources?: string[]
}

export function buildGaseousSystem(input: GaseousSystemInput) {
  const {
    config, data, gasSim, palette, variation, tileSize,
    group, shadowUniforms, occluderUniforms, getSunPos,
    coreAllowedResources,
  } = input

  const coreRadius    = config.radius * (config.coreRadiusRatio ?? 0.55)
  const tintedPalette = tintGasPalette(palette, variation)

  // ── Atmospheric layer — reuses top-level data/sim ────────────────
  const gasInteractive = buildInteractiveMesh(gasSim, tintedPalette)
  const { mesh: gasRaycast, faceToTileId: gasFaceMap } = buildPlanetMesh(gasSim, tintedPalette)

  // ── Core (rocky) layer ───────────────────────────────────────────
  const coreSubdivisions = tileSizeToSubdivisions(coreRadius, tileSize)
  const coreConfig       = buildGasCoreConfig(config, coreRadius, coreAllowedResources)
  const coreData         = generateHexasphere(coreRadius, coreSubdivisions)
  const coreSim          = initBodySimulation(coreData.tiles, coreConfig)
  const coreInteractive  = buildInteractiveMesh(coreSim, PALETTE_ROCKY_CORE)
  const { mesh: coreRaycast, faceToTileId: coreFaceMap } = buildPlanetMesh(coreSim, PALETTE_ROCKY_CORE)

  // ── Gas interior background (shown behind core hex) ─────────────
  // BackSide animated bands sphere — naturally behind core tiles in z-buffer.
  const { mesh: gasGlobeMesh, tick: gasBgTick, dispose: disposeGasBg } = buildGasInteriorMesh(config.radius, tintedPalette)

  // ── Smooth display meshes ────────────────────────────────────────
  const libGasParams   = configToLibParams(config, variation)
  const { mesh: coreSmoothMesh, planetMaterial: coreMatWrapper } = buildSmoothSphereMesh(coreSim, PALETTE_ROCKY_CORE, variation)
  const { mesh: gasSmoothMesh, tick: gasTick, planetMaterial: gasMat } = buildGasSmoothMesh(gasSim, libGasParams, tintedPalette)

  injectPlanetShadows(gasMat.material        as THREE.ShaderMaterial, occluderUniforms, shadowUniforms)
  injectPlanetShadows(coreMatWrapper.material as THREE.ShaderMaterial, occluderUniforms, shadowUniforms)
  if (variation.rings) {
    injectRingShadow(
      gasMat.material as THREE.ShaderMaterial,
      variation.rings,
      { planetRadius: config.radius },
    )
    // Core shares the same ring geometry — patched so inner-view remains consistent.
    injectRingShadow(
      coreMatWrapper.material as THREE.ShaderMaterial,
      variation.rings,
      { planetRadius: config.radius },
    )
  }

  // Both smooth meshes added directly to the main group (no sub-Group) to
  // avoid TresJS calculateMemoryUsage crash on attribute iteration.
  group.add(coreSmoothMesh)
  group.add(gasSmoothMesh)

  // ── Layer switch state ───────────────────────────────────────────
  const activeLayer = createObservable<'gas' | 'core'>('gas')
  let isInteractive = false

  const _hits: THREE.Intersection[] = []
  const _n    = new THREE.Vector3()
  const _wPos = new THREE.Vector3()
  const _dir  = new THREE.Vector3()

  function showActiveLayer() {
    if (activeLayer.value === 'gas') {
      group.remove(coreInteractive.group)
      group.remove(gasGlobeMesh)
      coreInteractive.setFill(false)
      gasInteractive.setFill(true)
      group.add(gasInteractive.group)
    } else {
      group.remove(gasInteractive.group)
      gasInteractive.setFill(false)
      coreInteractive.setFill(true)
      group.add(gasGlobeMesh)
      group.add(coreInteractive.group)
    }
  }

  function activateInteractive() {
    group.remove(coreSmoothMesh)
    group.remove(gasSmoothMesh)
    showActiveLayer()
    isInteractive = true
  }

  function deactivateInteractive() {
    gasInteractive.setHover(null)
    gasInteractive.setFill(false)
    coreInteractive.setHover(null)
    coreInteractive.setFill(false)
    group.remove(gasInteractive.group)
    group.remove(coreInteractive.group)
    group.remove(gasGlobeMesh)
    group.add(coreSmoothMesh)
    group.add(gasSmoothMesh)
    activeLayer.value = 'gas'
    isInteractive     = false
  }

  function setGaseousLayer(layer: 'gas' | 'core') {
    if (!isInteractive) return
    gasInteractive.setHover(null)
    coreInteractive.setHover(null)
    activeLayer.value = layer
    showActiveLayer()
  }

  function queryHover(raycaster: THREE.Raycaster): number | null {
    if (!isInteractive) return null
    const proxy   = activeLayer.value === 'gas' ? gasRaycast  : coreRaycast
    const faceMap = activeLayer.value === 'gas' ? gasFaceMap  : coreFaceMap
    group.updateWorldMatrix(true, false)
    proxy.matrixWorld.copy(group.matrixWorld)
    _hits.length = 0
    proxy.raycast(raycaster, _hits)
    if (_hits.length === 0) return null
    _hits.sort((a, b) => a.distance - b.distance)
    const hit = _hits.find(h => h.face &&
      _n.copy(h.face.normal).transformDirection(proxy.matrixWorld).dot(raycaster.ray.direction) < 0)
    if (!hit || hit.faceIndex == null) return null
    return faceMap[hit.faceIndex] ?? null
  }

  function setHover(tileId: number | null) {
    if (activeLayer.value === 'gas') gasInteractive.setHover(tileId)
    else                             coreInteractive.setHover(tileId)
  }

  /**
   * Pins a tile on the active layer so PinnedTileProjector tracks its world
   * center every frame — mirrors the rocky/metallic behaviour. Passing null
   * clears the pin on both layers in case the active layer changed meanwhile.
   */
  function setPinnedTile(tileId: number | null) {
    if (tileId === null) {
      gasInteractive.setPinnedTile(null)
      coreInteractive.setPinnedTile(null)
      return
    }
    if (activeLayer.value === 'gas') {
      coreInteractive.setPinnedTile(null)
      gasInteractive.setPinnedTile(tileId)
    } else {
      gasInteractive.setPinnedTile(null)
      coreInteractive.setPinnedTile(tileId)
    }
  }

  function getActiveSim() {
    return activeLayer.value === 'gas' ? gasSim : coreSim
  }

  function getActiveTileCount() {
    return activeLayer.value === 'gas' ? data.tiles.length : coreData.tiles.length
  }

  let _gasElapsed = 0

  function dispose() {
    coreSmoothMesh.geometry.dispose();
    (coreSmoothMesh.material as THREE.Material).dispose()
    gasSmoothMesh.geometry.dispose();
    (gasSmoothMesh.material as THREE.Material).dispose()
    gasRaycast.geometry.dispose()
    ;(gasRaycast.material as THREE.Material).dispose()
    coreRaycast.geometry.dispose()
    ;(coreRaycast.material as THREE.Material).dispose()
    disposeGasBg()
    gasInteractive.dispose()
    coreInteractive.dispose()
  }

  return {
    sim:           gasSim,
    tileCount:     data.tiles.length,
    activateInteractive,
    deactivateInteractive,
    queryHover,
    setHover,
    setPinnedTile,
    tick: (dt: number) => {
      _gasElapsed += dt
      gasTick(dt)
      gasBgTick(dt)
      gasInteractive.tick(_gasElapsed)
      coreInteractive.tick(_gasElapsed)
      if (getSunPos) {
        group.getWorldPosition(_wPos)
        _dir.copy(getSunPos()).sub(_wPos).normalize()
        gasMat.setLight({ direction: _dir })
      }
    },
    dispose,
    setGaseousLayer,
    getActiveSim,
    getActiveTileCount,
    gaseousActiveLayer: activeLayer,
    getLayerSims: () => [
      { layer: 'gas'  as const, sim: gasSim  },
      { layer: 'core' as const, sim: coreSim },
    ],
    planetMaterial: gasMat,
  }
}
