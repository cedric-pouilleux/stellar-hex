/**
 * Smooth sphere display mesh for non-interactive (overview) rendering.
 *
 * Vertices are colored using `sim.noise3D` — same seed + scale as tile
 * elevations. Resource colors are approximated by snapping each vertex
 * to its nearest tile, via the shared {@link buildSphericalNearestLookup}
 * spatial index.
 */

import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TerrainLevel } from '../../types/terrain.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { BodyVariation } from './bodyVariation'
import {
  resolveCoreRadiusRatio,
  terrainBandLayout,
  resolveTerrainLevelCount,
  resolveAtmosphereThickness,
  hasSurfaceLiquid,
} from '../../physics/body'
import { BodyMaterial } from '../../shaders'
import { buildPermTable, permTableToTexture } from '../../shaders/simplexPerm'
import { configToLibParams } from './configToLibParams'
import { strategyFor, type BodyTypeStrategy } from './bodyTypeStrategy'
import { resolveSeaAnchor } from '../../terrain/paletteRocky'
import { getTileLevel } from '../hex/hexMeshShared'
import { buildSphericalNearestLookup } from '../hex/sphericalTileLookup'
import { resolveSphereDetail, type RenderQuality } from '../quality/renderQuality'

/** Folds emissive into the base channel, clamped to [0, 1]. */
function foldEmissive(base: number, emissive: number | undefined, intensity: number): number {
  return Math.min(1, base + (emissive ?? 0) * intensity)
}

/**
 * Handle returned by {@link buildSmoothSphereMesh} — exposes the display
 * mesh, its material, and a `setSeaLevel` callback that repaints submerged
 * vertices and slides the shader ocean-mask waterline in lockstep with the
 * hex-view's liquid sphere.
 */
export interface SmoothSphereHandle {
  mesh:            THREE.Mesh
  planetMaterial:  InstanceType<typeof BodyMaterial>
  /**
   * Moves the smooth-sphere waterline to `worldRadius`. No-op on bodies
   * without a surface liquid. Rewrites vertex colours in-place (O(V)) so
   * submerged vertices flip to the sea anchor and emerged ones pick their
   * land band again, then pushes the equivalent simplex-space threshold
   * into the shader so cracks / lava / craters stay masked off-shore.
   */
  setSeaLevel:     (worldRadius: number) => void
  /**
   * Re-runs the vertex-colour paint at the current sea level. Picks up
   * any mutations that landed on `sim.tileStates` since the last paint
   * (dig, terraform…) so the smooth sphere reflects the same terrain
   * the hex mesh shows. Cheap — O(V) over the sphere vertex count.
   */
  repaint:         () => void
  /**
   * Stamps per-tile RGB into the smooth-sphere vertex buffer — one-shot
   * post-build paint that an off-lib consumer uses to project resource
   * tints onto the distant view. Subsequent sea-level / elevation
   * mutations go through {@link repaint} and overwrite this pass, matching
   * the "frozen at generation" smooth-sphere contract.
   */
  paintFromTiles:  (colors: Map<number, { r: number; g: number; b: number }>) => void
}

/**
 * Builds the smooth (non-hex) display sphere for a rocky/metallic body.
 * Uses procedural elevation + palette lookup to shade each vertex and a
 * `BodyMaterial` for detail noise, cracks and lava.
 *
 * @param sim       - Pre-computed body simulation.
 * @param levels    - Terrain palette driving vertex colouring.
 * @param variation - Optional body-scoped visual variation.
 * @returns         - Handle bundling the mesh, the attached
 *                    {@link BodyMaterial}, and a live `setSeaLevel` callback.
 */
export function buildSmoothSphereMesh(
  sim:       BodySimulation,
  levels:    TerrainLevel[],
  variation?: BodyVariation,
  options?:  { meshRadius?: number; quality?: RenderQuality; strategy?: BodyTypeStrategy },
): SmoothSphereHandle {
  const { config } = sim
  // Resolve the body-type strategy once — it's a constant for this body
  // and several branches below read from it. Caller may pass a pre-resolved
  // instance to avoid the redundant lookup when the orchestrator already
  // resolved it.
  const strategy = options?.strategy ?? strategyFor(config)
  const noiseScale  = config.noiseScale ?? 1.4
  // Segs scales with tile count so the smooth sphere never exceeds the hex mesh
  // in polygon count: small planets use fewer segments, large ones up to the noise limit.
  const segs        = Math.max(24, Math.min(
    Math.round(noiseScale * 52),
    Math.round(Math.sqrt(sim.tiles.length) * 3.5),
  ))
  // Icosphere instead of UV-sphere: avoids the polar singularity that made
  // per-vertex colour interpolation fan out into radial streaks at the poles.
  // `detail` derived from `segs` keeps poly count comparable across body sizes.
  // `mergeVertices` collapses the duplicated per-face vertices into a single
  // shared one — restores the indexed topology the per-vertex paint expects
  // and lets adjacent triangles agree on the same colour at every join.
  //
  // Ceiling bumped from 5 to 6 — gives ~10k vertices instead of ~2.5k on
  // the densest builds, halving the apparent size of nearest-tile colour
  // blocks in the `'shader'` view without changing any other behaviour.
  // Cost: ≈ 4× tris on the smooth sphere, which is rendered once per
  // body and stays well under the hex prism budget.
  const baseDetail  = Math.max(2, Math.min(6, Math.ceil(Math.log2(segs / 4))))
  const detail      = resolveSphereDetail(baseDetail, options?.quality)
  // Default radius is `solOuterRadius` so the smooth sphere tucks under
  // the rocky atmo halo in `'shader'` view. The caller can override when
  // the smooth sphere itself IS the visible silhouette (gaseous bodies,
  // where the smooth sphere with `BodyMaterial` gas drives the
  // procedural look — no atmo shell mounted on top).
  const atmoFraction = resolveAtmosphereThickness(config)
  const defaultRadius = config.radius * (1 - atmoFraction)
  const meshRadius    = options?.meshRadius ?? defaultRadius
  const geo         = mergeVertices(new THREE.IcosahedronGeometry(meshRadius, detail))
  const pos         = geo.getAttribute('position') as THREE.BufferAttribute
  // Allocate the colour attribute up-front and use its underlying buffer
  // for the paint loop. Creating a separate Float32Array and passing it to
  // `Float32BufferAttribute` would clone the data, leaving `setSeaLevel`
  // writing to a dead buffer.
  const colAttr     = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3)
  const col         = colAttr.array as Float32Array
  geo.setAttribute('color', colAttr)
  const nearestSolTileId = buildSphericalNearestLookup(sim.tiles)
  // Resource-paint mapping. On bodies whose smooth sphere plays the role
  // of atmosphere (gas giants), `paintFromTiles` consumes atmo tile ids
  // — so the lookup must run against the dedicated atmo hexasphere. On
  // every other body, the smooth sphere maps to sol tiles for the
  // resource-paint path (the sol-side palette dominates the silhouette).
  const paintTiles    = strategy.displayMeshIsAtmosphere && sim.atmoTiles.length > 0
    ? sim.atmoTiles
    : sim.tiles
  const nearestPaintTileId = buildSphericalNearestLookup(paintTiles)

  // `hasSurfaceLiquid(config)` is the single source of truth — encodes the
  // "only planetary bodies can hold a liquid surface" invariant across sim
  // and render layers. `sim.seaLevelElevation >= 0` is belt-and-braces
  // since the sim already applied the same filter.
  // Liquid fields live on `PlanetConfig` only — capture the narrowed shape
  // once so the seaAnchor branch below can read them without re-narrowing.
  const planetConfig      = config.type === 'planetary' ? config : null
  const showLiquidSurface = planetConfig !== null
    && hasSurfaceLiquid(planetConfig)
    && sim.seaLevelElevation >= 0
    && planetConfig.liquidState === 'liquid'
  // Sea anchor — submerged vertices need an explicit underwater tint
  // here because the smooth sphere owns the Shader view, where the
  // liquid sphere mesh is hidden. The hex-prism path skips this and
  // lets the (visible) liquid sphere do the tinting on its own.
  const seaAnchor = showLiquidSurface && planetConfig
    ? resolveSeaAnchor(planetConfig.liquidColor, planetConfig.liquidState ?? 'none')
    : null

  // Pre-compute per-vertex band + nearest tile state: these are geometry-
  // bound and don't change when the sea level slider moves. Caching them
  // keeps `paintColors` cheap enough to run on every slider frame.
  //
  // `initialTileElevation` captures each tile's elevation at build time so
  // the repaint path can derive a per-tile delta (current - initial) and
  // shift the vertex band accordingly. Bands themselves stay noise-derived,
  // which preserves the sphere's organic look; mutations (dig) show as a
  // localised dip around the affected tile instead of retiling the sphere.
  const bands:        number[]    = new Array(pos.count)
  // Per-vertex sol tile id, used by the paint loop to chase tile-elevation
  // mutations (dig delta) without re-running the lookup. Resource-paint
  // routing keeps its own tile-id buffer because gas-giant smooth spheres
  // remap onto the atmo hexasphere.
  const solTileId:    Int32Array  = new Int32Array(pos.count)
  const paintTileId:  Int32Array  = new Int32Array(pos.count)
  const initialTileElevation = new Map<number, number>()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    bands[i]       = sim.elevationAt(x, y, z)
    solTileId[i]   = nearestSolTileId(x, y, z)
    paintTileId[i] = nearestPaintTileId(x, y, z)
  }
  for (const [id, st] of sim.tileStates) initialTileElevation.set(id, st.elevation)


  // Bodies whose display mesh IS the atmosphere (gas) leave the colour
  // buffer at `(0, 0, 0)` — the atmospheric shader reads band stops
  // procedurally and only consumes vertex colours via its overlay-mask
  // path (driven by `paintFromTiles` at resource paint time).
  const skipDefaultPaint = strategy.displayMeshIsAtmosphere

  /** Last sea-level band passed through `paintColors` — reused by `repaint`. */
  let lastSeaLevelBand = sim.seaLevelElevation

  function paintColors(seaLevelBand: number): void {
    lastSeaLevelBand = seaLevelBand
    if (skipDefaultPaint) return
    for (let i = 0; i < pos.count; i++) {
      const tileId = solTileId[i]
      const state  = sim.tileStates.get(tileId)
      // Shift the vertex's noise band by the tile's dig delta so mined
      // tiles drag the surrounding smooth-sphere pixels down to their
      // freshly exposed band. Vertices with no nearest tile fall back to
      // the raw noise band (poles, etc.).
      let band = bands[i]
      if (state) {
        const init = initialTileElevation.get(tileId) ?? state.elevation
        band = Math.max(0, band + (state.elevation - init))
      }
      const level        = getTileLevel(band, levels)
      const submerged    = showLiquidSurface && band < seaLevelBand
      const baseColor    = submerged && seaAnchor ? seaAnchor.color : level.color
      const baseEmissive = submerged ? undefined : level.emissive
      const baseEI       = submerged ? 0 : (level.emissiveIntensity ?? 0)
      // Palette-only bake — resource tinting lives off-lib and is applied
      // after build via `body.tiles.paintSmoothSphere` (phase 4d).
      col[i * 3]     = foldEmissive(baseColor.r, baseEmissive?.r, baseEI)
      col[i * 3 + 1] = foldEmissive(baseColor.g, baseEmissive?.g, baseEI)
      col[i * 3 + 2] = foldEmissive(baseColor.b, baseEmissive?.b, baseEI)
    }
  }

  paintColors(sim.seaLevelElevation)

  const params    = configToLibParams(config, variation)

  // Liquid mask — replicates the CPU simplex3D elevation in GLSL so crack/lava
  // effects match the tile-level liquid boundary exactly. The liquid shader
  // re-samples simplex noise on the unit sphere, so it needs the waterline
  // expressed in noise space (`seaLevelNoise`), not band space.
  const liquid = sim.hasLiquidSurface
    ? {
        permTexture: permTableToTexture(buildPermTable(config.name)),
        seaLevel:    sim.seaLevelNoise,
        noiseScale:  config.noiseScale ?? 1.4,
        radius:      config.radius,
      }
    : undefined

  const planetMat = new BodyMaterial(strategy.shaderType, params, {
    vertexColors: true,
    liquid,
    palette: levels,
  })

  // Derive the sol-shell mapping once: world-radius → band uses the same
  // layout the layered hex mesh applies (`terrainBandLayout`), so the smooth
  // sphere's waterline slides in lockstep with the liquid sphere.
  const coreRatio  = resolveCoreRadiusRatio(config)
  const coreRadius = config.radius * coreRatio
  const atmoThick  = atmoFraction
  const bandCount  = resolveTerrainLevelCount(config.radius, coreRatio, atmoThick)
  const bandLayout = terrainBandLayout(config.radius, coreRatio, bandCount, atmoThick)
  const bandUnit   = bandLayout.unit

  function setSeaLevel(worldRadius: number): void {
    if (!showLiquidSurface) return
    // Match `bandToRadius` inversion used by the hex mesh: band = (worldRadius - coreRadius) / unit.
    const nextBand = (worldRadius - coreRadius) / bandUnit
    paintColors(nextBand)
    colAttr.needsUpdate = true
    // Shader side: convert band → simplex space so the fragment ocean mask
    // tracks the same waterline. `bandToNoiseThreshold` returns `-1` on dry
    // bodies, which we skipped above anyway.
    planetMat.setSeaLevel(sim.bandToNoiseThreshold(nextBand))
  }

  function repaint(): void {
    paintColors(lastSeaLevelBand)
    colAttr.needsUpdate = true
  }

  function paintFromTiles(colors: Map<number, { r: number; g: number; b: number }>): void {
    if (colors.size === 0) return
    // Strict nearest-only — the body fragment shaders (gas / rocky / metallic)
    // gate the overlay on `max(r, g, b) > 0` so unpainted vertices fall back
    // to the procedural pattern. A K-nearest blend would smear partial
    // weights onto unpainted neighbourhoods and produce star-shaped overlay
    // halos at every painted-region boundary.
    for (let i = 0; i < pos.count; i++) {
      const rgb = colors.get(paintTileId[i])
      if (!rgb) continue
      col[i * 3]     = rgb.r
      col[i * 3 + 1] = rgb.g
      col[i * 3 + 2] = rgb.b
    }
    colAttr.needsUpdate = true
  }

  return {
    mesh:           new THREE.Mesh(geo, planetMat.material),
    planetMaterial: planetMat,
    setSeaLevel,
    repaint,
    paintFromTiles,
  }
}
