import * as THREE from 'three'
import type { PlanetBody } from '@lib'
import { applyResourceBlend, type ResourceRules, type TileResources } from './tileResourceBlend'

/** Plain RGB triple — aligned with the `Body.tiles.applyTileOverlay` contract. */
export interface RGB {
  r: number
  g: number
  b: number
}

/**
 * Distribution input: per-tile resource concentrations built by the game's
 * distribution strategy and passed to the paint pipeline.
 */
export type TileResourceDistribution = ReadonlyMap<number, TileResources>

/**
 * Layered distribution — separates resources by render layer so gases
 * (atmosphere) and solids (surface) can never bleed into each other's
 * overlays. The {@link paintBody} entry consumes this shape and dispatches
 * each bucket to its target layer with a single `applyTileOverlay` call.
 */
export interface LayeredDistribution {
  /** Sol-layer tiles — metals + minerals + biome-driven solids (ice). */
  sol:  TileResourceDistribution
  /** Atmo-layer tiles — gases. Empty on rocky/metallic bodies for now. */
  atmo: TileResourceDistribution
}

/** Scratch THREE.Color reused across tiles to avoid per-call allocation. */
const _baseColor = new THREE.Color()

/** Target interactive layer — `'sol'` for solids, `'atmo'` for gaseous tiles. */
export type PaintLayer = 'sol' | 'atmo'

/**
 * Internal helper — converts a per-tile resource distribution into the RGB
 * overlay map consumed by `applyTileOverlay`. Pure: no side effects on the
 * body, no allocation per tile beyond the output map.
 *
 * The `layer` selector decides which base palette feeds the blend:
 *   - `'sol'`  → palette / sea-anchor colour from `tileBaseVisual` (the
 *                tile's actual surface tint). Resources tint that base.
 *   - `'atmo'` → **neutral white base**, ignoring the sol palette entirely.
 *                Mixing the sol base into the atmo layer would project
 *                the ocean's sea-anchor blue onto every atmo tile sitting
 *                above a submerged hex — visible as fake "blue lakes" on
 *                the playable atmo grid that look like the core showing
 *                through. Atmo gases get their own colours, untainted by
 *                what's underneath.
 */
function buildOverlay(
  body:         PlanetBody,
  distribution: TileResourceDistribution,
  rules:        ResourceRules | null,
  layer:        PaintLayer,
): Map<number, RGB> {
  const overlay = new Map<number, RGB>()
  for (const [tileId, resources] of distribution) {
    let r: number, g: number, b: number
    let rough: number, metal: number
    let emissive: THREE.Color | undefined, emissiveI: number
    let submerged: boolean
    if (layer === 'sol') {
      const base = body.tiles.tileBaseVisual(tileId)
      if (!base) continue
      r = base.r; g = base.g; b = base.b
      rough = base.roughness; metal = base.metalness
      emissive = base.emissive; emissiveI = base.emissiveIntensity
      submerged = base.submerged
    } else {
      // Atmo — neutral base, so resource colours read true regardless of
      // whatever sits under the tile on the sol band.
      r = 1; g = 1; b = 1
      rough = 0.5; metal = 0
      emissive = undefined; emissiveI = 0
      submerged = false
    }
    _baseColor.setRGB(r, g, b)
    const vis = applyResourceBlend(
      _baseColor, rough, metal, emissive, emissiveI, submerged, resources, rules,
    )
    overlay.set(tileId, { r: vis.r, g: vis.g, b: vis.b })
  }
  return overlay
}

/**
 * Paints a body's surface from a {@link LayeredDistribution}.
 *
 * Each layer is dispatched to its dedicated `applyTileOverlay` call:
 *   - `sol` overlay → hex caps of the solid surface (rocks, metals, ice)
 *   - `atmo` overlay → atmosphere prism caps (gases on gaseous bodies)
 *
 * The smooth-sphere display mesh receives the merged overlay (sol wins on
 * conflicts) so the distant LOD reflects the same distribution. The lib's
 * body shader reads vertex colours, so painted regions show up at distance
 * for both sol-driven (rocky/metallic) and atmo-driven (gaseous) bodies.
 *
 * The blend runs entirely in playground code — the lib carries no
 * resource-aware tinting. Only the palette / sea-anchor base comes from
 * the lib (via `tileBaseVisual`).
 *
 * @param body         - Body returned by `useBody(...)`.
 * @param distribution - Per-tile resources, layered by sol / atmo.
 * @param rules        - Metallic / surface-liquid catalogue callbacks.
 *                       Omit for plain colour blending with neutral PBR rules.
 * @returns Total tiles actually painted across both layers.
 */
export function paintBody(
  body:         PlanetBody,
  distribution: LayeredDistribution,
  rules?:       ResourceRules | null,
): number {
  const r       = rules ?? null
  const solOver = buildOverlay(body, distribution.sol, r, 'sol')
  const atmOver = buildOverlay(body, distribution.atmo, r, 'atmo')

  if (solOver.size > 0) body.tiles.applyTileOverlay('sol',  solOver)
  if (atmOver.size > 0) body.tiles.applyTileOverlay('atmo', atmOver)

  // Smooth-sphere routing — gas paints atmo (the smooth sphere IS the
  // atmosphere on gas), rocky / metallic paint sol (the smooth sphere
  // is the surface backdrop in Shader view).
  const sphereOverlay = body.config.type === 'gaseous' ? atmOver : solOver
  if (sphereOverlay.size > 0) body.tiles.paintSmoothSphere(sphereOverlay)

  // Atmo corona — rocky / metallic only; gas already shows atmo on its
  // smooth sphere.
  const hasCorona = body.config.type === 'rocky' || body.config.type === 'metallic'
  if (hasCorona && atmOver.size > 0) {
    body.tiles.paintAtmoShell(atmOver)
  }

  return solOver.size + atmOver.size
}
