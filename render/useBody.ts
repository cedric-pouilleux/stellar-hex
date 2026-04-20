import * as THREE from 'three'
import { generateHexasphere } from '../geometry/hexasphere'
import { buildPlanetMesh, buildSmoothSphereMesh, buildStarSmoothMesh, buildInteractiveMesh, getTileLevel } from './useHexasphereMesh'
import type { ShadowUniforms, OccluderUniforms } from './useHexasphereMesh'
import { initBodySimulation } from '../sim/BodySimulation'
import { generateTerrainPalette, generateMetallicPalette, buildGasPalette } from '../terrain/terrainPalette'
import { subdividePalette } from '../terrain/paletteSubdivide'
import { DEFAULT_TERRAIN_LEVEL_COUNT, TERRAIN_LEVEL_STEP_PER_RADIUS } from '../config/defaults'
import type { BodyConfig, TerrainLevel } from '../types/body.types'
import { buildStarPalette } from '../terrain/starPalette'
import { generateBodyVariation } from './bodyVariation'
import { buildGaseousSystem, tileSizeToSubdivisions } from './buildGaseousSystem'
import { injectPlanetShadows } from './shadowInjection'
import { injectRingShadow } from './ringShadowInjection'
import { buildBodyHoverOverlay } from './buildBodyHoverOverlay'
export { buildGasCoreConfig, tileSizeToSubdivisions } from './buildGaseousSystem'

// ── Static palette overrides ──────────────────────────────────────
// Used when an explicit palette is set in BodyConfig (e.g. Moon).

export const PALETTE_MOON: TerrainLevel[] = [
  { threshold:  0.20, height: 0.000, color: new THREE.Color(0x4a4a4a), metalness: 0.0, roughness: 1.00 },
  { threshold:  0.65, height: 0.020, color: new THREE.Color(0x7a7a7a), metalness: 0.0, roughness: 0.95 },
  { threshold:  Infinity, height: 0.045, color: new THREE.Color(0xa8a8a8), metalness: 0.1, roughness: 0.90 },
]

// Fallback palette used when no composition data is available (Jovian default)
export const PALETTE_GAS_GIANT: TerrainLevel[] = [
  { threshold: -0.30, height: 0.00, color: new THREE.Color(0xc08040), metalness: 0.0, roughness: 0.60 },
  { threshold:  0.10, height: 0.00, color: new THREE.Color(0xe8b870), metalness: 0.0, roughness: 0.50 },
  { threshold:  0.50, height: 0.00, color: new THREE.Color(0xf0d0a0), metalness: 0.0, roughness: 0.45 },
  { threshold:  Infinity, height: 0.00, color: new THREE.Color(0xd4956a), metalness: 0.0, roughness: 0.55 },
]

// ── Auto palette selection ────────────────────────────────────────

/**
 * Select or build the terrain palette for a given planet config.
 *
 * Rocky palettes are produced directly at the target {@link BodyConfig.terrainLevelCount}
 * resolution with heights derived from the body radius, so they never need
 * subdivision or a scale knob. Star / gaseous / metallic palettes keep their
 * historical generators and are densified + height-rescaled to match the
 * shared `radius * TERRAIN_LEVEL_STEP_PER_RADIUS` step.
 */
export function choosePalette(config: BodyConfig, seaLevel: number): TerrainLevel[] {
  if (config.palette) return config.palette

  const count = config.terrainLevelCount ?? DEFAULT_TERRAIN_LEVEL_COUNT

  if (config.type === 'rocky') {
    return generateTerrainPalette(
      config.temperatureMin,
      config.temperatureMax,
      config.atmosphereThickness ?? 0,
      seaLevel,
      count,
      config.radius,
    )
  }

  const base: TerrainLevel[] =
    config.type === 'star'      ? buildStarPalette(config.spectralType ?? 'G') :
    config.type === 'gaseous'   ? buildGasPalette(
                                    config.gasComposition,
                                    (config.temperatureMin + config.temperatureMax) / 2 + 273,
                                  ) :
                                  generateMetallicPalette(config.temperatureMin, config.temperatureMax)

  const densified = count > base.length ? subdividePalette(base, count) : base
  // Re-scale heights so non-rocky palettes also scale with body radius and stay
  // visually consistent with the new rocky model — deepest level sits at level
  // index 0 (height 0 or negative when the generator put it there), topmost
  // level climbs by `step` per rank.
  const step = config.radius * TERRAIN_LEVEL_STEP_PER_RADIUS
  // Preserve the *sign* of the original height (craters stay below, peaks above)
  // while normalising the spread: deepest → 0, topmost → (N-1)*step.
  const firstH = densified[0].height
  const lastH  = densified[densified.length - 1].height
  const span   = Math.max(1e-6, lastH - firstH)
  return densified.map(l => ({
    ...l,
    height: firstH + (l.height - firstH) / span * ((densified.length - 1) * step),
  }))
}

// ── Tile height resolution ───────────────────────────────────────

/** Default tile height used when palette resolution fails. */
const DEFAULT_TILE_HEIGHT = 0.06

/**
 * Resolves the visual height of a tile from the terrain palette.
 * Falls back to {@link DEFAULT_TILE_HEIGHT} when palette lookup fails.
 *
 * @param config    - Planet body config (needed to choose the palette).
 * @param seaLevel  - Sea level elevation from the simulation.
 * @param elevation - Tile elevation to look up.
 * @returns Resolved tile height for building placement.
 */
export function resolveTileHeight(config: BodyConfig, seaLevel: number, elevation: number): number {
  try {
    const palette = choosePalette(config, seaLevel)
    const level   = getTileLevel(elevation, palette)
    if (typeof level?.height === 'number' && isFinite(level.height)) return level.height
  } catch { /* use fallback */ }
  return DEFAULT_TILE_HEIGHT
}

// ── Interactive controller factory ────────────────────────────────

type InteractiveResult = ReturnType<typeof buildInteractiveMesh>

function makeInteractiveController(
  group:         THREE.Group,
  displayMesh:   THREE.Mesh,
  raycasterMesh: THREE.Mesh,
  interactive:   InteractiveResult,
  faceToTileId:  number[],
) {
  let isInteractive = false
  group.add(displayMesh)

  const _hits: THREE.Intersection[] = []
  const _n    = new THREE.Vector3()

  function activateInteractive() {
    group.remove(displayMesh)
    group.add(interactive.group)
    interactive.setFill(true)
    isInteractive = true
  }

  function deactivateInteractive() {
    interactive.setHover(null)
    interactive.setFill(false)
    group.remove(interactive.group)
    group.add(displayMesh)
    isInteractive = false
  }

  function queryHover(raycaster: THREE.Raycaster): number | null {
    if (!isInteractive) return null
    group.updateWorldMatrix(true, false)
    raycasterMesh.matrixWorld.copy(group.matrixWorld)
    _hits.length = 0
    raycasterMesh.raycast(raycaster, _hits)
    if (_hits.length === 0) return null
    _hits.sort((a, b) => a.distance - b.distance)
    const hit = _hits.find(h => h.face &&
      _n.copy(h.face.normal).transformDirection(raycasterMesh.matrixWorld).dot(raycaster.ray.direction) < 0)
    if (!hit || hit.faceIndex == null) return null
    return faceToTileId[hit.faceIndex] ?? null
  }

  return { activateInteractive, deactivateInteractive, queryHover }
}

// ── Public API ────────────────────────────────────────────────────

const _wPos = new THREE.Vector3()
const _dir  = new THREE.Vector3()

export function useBody(
  config: BodyConfig,
  tileSize: number,
  options?: {
    getSunPos?:            () => THREE.Vector3
    /**
     * Resource IDs allowed on the rocky core of a gaseous planet. Forwarded
     * to {@link buildGasCoreConfig}. Ignored for non-gaseous bodies.
     */
    coreAllowedResources?: string[]
  },
) {
  // Stars were enlarged to 3× their historical visual radius so the sun is
  // always the dominant body. We normalise the subdivision calculation
  // against the original reference radii so tile counts stay identical —
  // only the sphere scale changes visually.
  const STAR_TILE_REF: Record<string, number> = { M: 2.0, K: 2.5, G: 3.0, F: 3.5 }
  const tileRefRadius = config.type === 'star'
    ? (STAR_TILE_REF[config.spectralType ?? 'G'] ?? 3.0)
    : config.radius
  const subdivisions = tileSizeToSubdivisions(tileRefRadius, tileSize)
  const data         = generateHexasphere(config.radius, subdivisions)
  const variation    = generateBodyVariation(config)
  const sim          = initBodySimulation(data.tiles, config)
  const palette      = choosePalette(config, sim.seaLevelElevation)
  const group        = new THREE.Group()

  // ── Star ─────────────────────────────────────────────────────────
  // Same smooth → hex swap pattern as rocky planets:
  // overview = indexed sphere with animated star shader (low poly count),
  // focused  = merged hex tiles for tile interaction.
  if (config.type === 'star') {
    const { mesh: displayMesh, tick, planetMaterial: starMat } = buildStarSmoothMesh(sim, palette, variation)
    const { mesh: raycastProxy, faceToTileId }                  = buildPlanetMesh(sim, palette)
    const interactive                                            = buildInteractiveMesh(sim, palette)
    const ctrl                                                   = makeInteractiveController(group, displayMesh, raycastProxy, interactive, faceToTileId)
    const bodyHover                                              = buildBodyHoverOverlay(group, config.radius)

    let starElapsed = 0
    function tickStar(dt: number) {
      starElapsed += dt
      tick(dt)
      interactive.tick(starElapsed)
    }

    function dispose() {
      bodyHover.dispose()
      displayMesh.geometry.dispose()
      ;(displayMesh.material as THREE.Material).dispose()
      starMat.dispose()
      raycastProxy.geometry.dispose()
      ;(raycastProxy.material as THREE.Material).dispose()
      interactive.dispose()
    }

    return {
      group, sim, tileCount: data.tiles.length, variation,
      ...ctrl,
      setHover:           interactive.setHover,
      setPinnedTile:      interactive.setPinnedTile,
      surfaceOffset:      interactive.surfaceOffset,
      tileGeometry:       interactive.tileGeometry,
      writeTileColor:     interactive.writeTileColor,
      computeTileBaseRGB: interactive.computeTileBaseRGB,
      onHoverChange:      interactive.onHoverChange,
      setBodyHover:       bodyHover.setVisible,
      getLayerSims:       () => [{ layer: 'surface' as const, sim }],
      tick: tickStar,
      dispose,
      planetMaterial:     starMat,
    }
  }

  const shadowUniforms: ShadowUniforms = {
    pos:    { value: new THREE.Vector3() },
    radius: { value: 0.0 },
  }
  const occluderUniforms: OccluderUniforms = {
    pos:    { value: new THREE.Vector3() },
    radius: { value: 0.0 },
  }

  // ── Gaseous ───────────────────────────────────────────────────────
  if (config.type === 'gaseous') {
    const gaseous        = buildGaseousSystem({
      config, data, gasSim: sim, palette, variation, tileSize,
      group, shadowUniforms, occluderUniforms,
      getSunPos:            options?.getSunPos,
      coreAllowedResources: options?.coreAllowedResources,
    })
    const bodyHover      = buildBodyHoverOverlay(group, config.radius)
    const gaseousDispose = gaseous.dispose
    gaseous.dispose      = () => { bodyHover.dispose(); gaseousDispose() }
    return { group, shadowUniforms, occluderUniforms, setBodyHover: bodyHover.setVisible, variation, ...gaseous }
  }

  // ── Rocky / Metallic ──────────────────────────────────────────────
  const { mesh: displayMesh, planetMaterial }    = buildSmoothSphereMesh(sim, palette, variation)
  const { mesh: raycastProxy, faceToTileId }     = buildPlanetMesh(sim, palette)
  const interactive                              = buildInteractiveMesh(sim, palette)
  const ctrl                                     = makeInteractiveController(group, displayMesh, raycastProxy, interactive, faceToTileId)
  const bodyHover                                = buildBodyHoverOverlay(group, config.radius)

  injectPlanetShadows(planetMaterial.material as THREE.ShaderMaterial, occluderUniforms, shadowUniforms)
  if (variation.rings) {
    injectRingShadow(
      planetMaterial.material as THREE.ShaderMaterial,
      variation.rings,
      { planetRadius: config.radius },
    )
  }

  let elapsed = 0
  function dispose() {
    bodyHover.dispose()
    displayMesh.geometry.dispose()
    ;(displayMesh.material as THREE.Material).dispose()
    raycastProxy.geometry.dispose()
    ;(raycastProxy.material as THREE.Material).dispose()
    interactive.dispose()
    planetMaterial.dispose()
  }

  return {
    group,
    sim,
    tileCount: data.tiles.length,
    shadowUniforms,
    occluderUniforms,
    variation,
    ...ctrl,
    setHover:           interactive.setHover,
    setPinnedTile:      interactive.setPinnedTile,
    surfaceOffset:      interactive.surfaceOffset,
    tileGeometry:       interactive.tileGeometry,
    writeTileColor:     interactive.writeTileColor,
    computeTileBaseRGB: interactive.computeTileBaseRGB,
    onHoverChange:      interactive.onHoverChange,
    setBodyHover:       bodyHover.setVisible,
    getLayerSims:       () => [{ layer: 'surface' as const, sim }],
    tick: (dt: number) => {
      elapsed += dt
      planetMaterial.tick(elapsed)
      interactive.tick(elapsed)
      if (options?.getSunPos) {
        group.getWorldPosition(_wPos)
        _dir.copy(options.getSunPos()).sub(_wPos).normalize()
        planetMaterial.setLight({ direction: _dir })
      }
    },
    dispose,
    planetMaterial,
  }
}
